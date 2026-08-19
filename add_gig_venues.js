'use strict';
/**
 * Fills in complete data for all Rio de Janeiro–Galeão International Airport
 * (Antônio Carlos Jobim International Airport, Rio de Janeiro, Brazil —
 * IATA: GIG) restaurants/bars/cafés in Firestore, based on research
 * conducted on 2026-08-15.
 *
 * Primary source: the official airport site's own establishment directory,
 * riogaleao.com/passageiros/explore-riogaleao/alimentacao/, which lists 42
 * distinct food & beverage brands, each with its own detail page giving a
 * description, floor ("Piso"), zone tag, hours and (for a few) an external
 * website — the most authoritative, itemised source found for this airport.
 * Cross-checked against Wikipedia (English and Portuguese), riogig.com's
 * (a third-party but detailed guide site) consolidated dining table, and
 * airway.com.br's coverage of the 2016 Terminal 2 consolidation.
 *
 * TERMINAL STRUCTURE: Galeão has two terminal buildings, but Terminal 1's
 * check-in and baggage-claim areas have been out of commercial passenger use
 * since November 2016 — Wikipedia and multiple 2026 sources confirm "all
 * flights [...] must be made from Terminal 2," with Terminal 1 now housing
 * only administrative offices, a Federal Police passport post, and an
 * airport hotel (whose own in-house restaurant serves hotel guests, not the
 * general flying public, so it is out of scope here — the same treatment
 * given to a closed terminal's facilities elsewhere in this dataset, e.g.
 * Lagos MMIA Terminal 1). No reopening date for Terminal 1 has been
 * announced. Terminal 1 is therefore excluded entirely from this script.
 *
 * Within Terminal 2, domestic and international flights are NOT split into
 * separate check-in/security buckets: every source (the airport's own site,
 * Wikipedia, and independent guides) describes ONE shared check-in hall (174
 * counters) and ONE shared security-screening area (24 lanes) on the
 * terminal's departure floor, with domestic and international passengers
 * only diverging into separate post-security boarding piers — the domestic
 * pier and the international "Píer Sul" (South Pier, added in 2016) — after
 * that single shared checkpoint. Per this dataset's standing "own check-in
 * AND own security" test for whether domestic/international sides get
 * separate terminal buckets, Galeão fails that test (unlike e.g. O.R.
 * Tambo's Terminal A/B or Melbourne's T1-T4, which each have their OWN
 * check-in and security) — so this script models the whole airport as ONE
 * terminal bucket, 'terminal_2', matching the terminal's real, current name
 * rather than an arbitrary placeholder — the same single-bucket treatment
 * given to Wellington International and the new Jorge Chávez terminal in
 * Lima.
 *
 * ZONE ATTRIBUTION: each venue's own detail page tags it with a floor
 * ("Piso 0", "Piso 1 Mezanino" or "Piso 2") and a zone — "Área Pública"
 * (public/landside, before the security X-ray, labelled "antes do Raio-X"
 * on many pages), "Embarque Doméstico" (domestic boarding pier, airside),
 * or "Embarque Internacional" (international boarding pier / South Pier,
 * airside) — plus "Desembarque" for the Piso 0 arrivals-level public area.
 * Those exact tags are preserved in each outlet's location_notes below.
 *
 * MULTI-OUTLET BRANDS (combined into one doc with multiple `outlets[]`
 * entries, each confirmed by its own detail page listing more than one
 * floor/zone): A Saideira (2), Bob's (2), Casa do Pão de Queijo (2),
 * Deltaexpresso (3), Empanadas y Tal (2), KFC (2), Kafe (3), Mariposa (2),
 * Nutty Bavarian (4), Pipocassa (3), Starbucks Coffee (2), Subway (2).
 * "Mc Donald's" and "Mc Donald's Sorvete" (an ice-cream-only counter) are
 * kept as two SEPARATE docs — the directory lists them as two distinctly
 * named/branded listings with different menus and different locations, the
 * same convention used for "Tanta" vs. "Tanta To Go" in the Lima script.
 *
 * DATA-QUALITY NOTES:
 *   - No phone number is published on any of the 42 detail pages, so
 *     `phone` is left blank throughout.
 *   - `website`/`logo_url` are filled in where the directory itself gives an
 *     external site (Casa Bauducco, Freddo, Geneal e Sorvetes Itália,
 *     Havanna, Kopenhagen, Mania de Churrasco, Mariposa) or the brand is an
 *     independently-confirmed major chain with a confident public domain
 *     (Bob's, Burger King, Giraffas, KFC, McDonald's/McDonald's Sorvete,
 *     Nescafé, Nutty Bavarian, Pizza Hut, Ritazza, Spoleto, Starbucks,
 *     Subway, TGI Fridays). Smaller or airport-specific concepts with no
 *     independently confirmed domain (A Saideira, Aero Sport Bar, Casa do
 *     Pão de Queijo, CoffeeSpot, Deltaexpresso, Divino Fogão, Empanadas y
 *     Tal, Factory, Galeão Coffee Shop, Grand Cru, Jamie's Deli, Juice da
 *     Orla, Kafe, Kozinha Sushi Bar & Árabe, Latitude Café, O Pasquim Bar e
 *     Prosa, Palaphita, Pipocassa, Travel Market, Upper Crust, Ventana
 *     Fresh) are left blank rather than guessing one.
 *   - Opening hours are taken from each venue's own detail page; most
 *     bounded-hours venues publish "05:00 às 22:00" (domestic-side/public
 *     venues) or "04:00 às 23:00" (international-side venues), recorded
 *     verbatim per outlet; venues stating "Aberto 24h" have `open_24_7`
 *     true instead.
 *   - Dietary flags are left blank/false throughout except Latitude Café,
 *     whose own directory description explicitly states it offers "opções
 *     veganas" (vegan options).
 *   - Kafe's detail page returned four location blocks, two of which
 *     appeared to duplicate the same Piso 2 / Embarque Doméstico outlet
 *     under slightly different floor labels ("Piso 2 Mezanino" vs. "Piso 2
 *     Embarque") — collapsed here to the three clearly distinct outlets
 *     (Piso 0 arrivals, Piso 2 Embarque Doméstico, Piso 2 Área Pública)
 *     rather than kept as four, to avoid double-counting one physical
 *     counter as two.
 *   - A few venues' pages tagged their zone ambiguously as "Área Pública/
 *     Embarque" without clearly picking one (Kopenhagen, Latitude Café,
 *     Travel Market) — these are recorded here under "Área Pública (before
 *     security)" as the primary tag shown, flagged in case the live pages
 *     actually mean a boarding-side location instead.
 *
 * Rio de Janeiro/Galeão appears in NEITHER reference script (migrate_
 * firestore.js's AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore
 * slug is unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'rio_de_janeiro', then 'rio', then 'gig', using whichever has
 * existing terminal data). It never creates a new `airports/{id}` metadata
 * doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For the
 * terminal grouping below, it first deletes EVERY existing restaurant doc in
 * that terminal's `restaurants` subcollection — unconditionally, regardless
 * of whether its name matches anything in this file — and only then creates
 * every venue defined here as a brand-new doc. There is no update-in-place
 * step and no name-matching against what's already there; nothing from a
 * previous run survives. Run this only when the venue list below is meant to
 * be the complete, authoritative set for the terminal bucket.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't THIS script's terminal id (terminal_2) gets its
 * restaurants subcollection and then the terminal doc itself deleted, so a
 * stale/orphaned terminal bucket (e.g. from an earlier wrongly-modelled
 * domestic/international split, or a leftover 'terminal_1' bucket) doesn't
 * keep inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_gig_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['rio_de_janeiro', 'rio', 'gig'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_2 = 'terminal_2';

// ─── helpers (matches admin_restaurant_editor_screen.dart's save shape) ──────

function outlet({ airside = 'landside', level = '', locationNotes = '', openingHours = '', open247 = false }) {
  return {
    gate_area: '',
    airside,
    level,
    location_notes: locationNotes,
    open_24_7: open247,
    opening_hours: openingHours,
    takeaway: '',
    wheelchair_accessible: '',
    delivery: '',
    reservable: '',
    kids_menu: '',
  };
}

function restaurant({
  name, cuisine, description = '', website = '', phone = '', logoUrl = '', amenity = 'restaurant',
  halal = false, vegetarian = false, vegan = false, kosher = false, glutenFree = false, outlets = [],
}) {
  return {
    name, amenity, cuisine, description, website, phone,
    logo_url: logoUrl,
    halal: halal ? 'yes' : '',
    vegetarian_options: vegetarian ? 'yes' : '',
    vegan_options: vegan ? 'yes' : '',
    kosher: kosher ? 'yes' : '',
    gluten_free: glutenFree ? 'yes' : '',
    outlets,
  };
}

const LOGO_TOKEN = 'pk_ESVPZKxARPS4xn3hrJIFiA';
const logo = (domain) => `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}&size=200&format=png`;

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ─── Terminal 2 venues (the whole airport — single shared terminal) ─────────

const terminal2Venues = {
  a_saideira: restaurant({
    name: 'A Saideira',
    cuisine: 'Brazilian, Bar, Petiscos',
    amenity: 'bar',
    description: 'Bold flavors and a relaxed atmosphere, with petiscos (Brazilian bar snacks), full dishes and drinks.',
    outlets: [
      outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Internacional', openingHours: '04:00–23:00' }),
      outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Doméstico', open247: true }),
    ],
  }),
  aero_sport_bar: restaurant({
    name: 'Aero Sport Bar',
    cuisine: 'Sports Bar, Brazilian',
    amenity: 'bar',
    description: 'A sports-themed bar with varied dishes and drink options.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  bobs: restaurant({
    name: "Bob's",
    cuisine: 'Brazilian, Fast Food, Sandwiches',
    amenity: 'fast_food',
    website: 'https://www.bobs.com.br',
    logoUrl: logo('bobs.com.br'),
    description: 'A classic of Brazilian fast food — sandwiches, milkshakes and sides.',
    outlets: [
      outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', open247: true }),
      outlet({ airside: 'landside', level: 'Piso 2', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '06:00–22:00' }),
    ],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.burgerking.com.br',
    logoUrl: logo('burgerking.com.br'),
    description: 'World-recognized flame-grilled burgers.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  casa_bauducco: restaurant({
    name: 'Casa Bauducco',
    cuisine: 'Italian, Bakery, Café, Panettone',
    amenity: 'cafe',
    website: 'https://www.casabauducco.com.br',
    logoUrl: logo('casabauducco.com.br'),
    description: 'The taste of Italian tradition — panettones, coffees and artisanal products.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 2', locationNotes: 'Área Pública (before the security X-ray)', open247: true })],
  }),
  casa_do_pao_de_queijo: restaurant({
    name: 'Casa do Pão de Queijo',
    cuisine: 'Brazilian, Bakery, Cheese Bread',
    amenity: 'bakery',
    description: 'Authentic Brazilian cheese bread (pão de queijo), prepared with tradition.',
    outlets: [
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', open247: true }),
      outlet({ airside: 'landside', level: 'Piso 0', locationNotes: 'Desembarque, Área Pública', open247: true }),
    ],
  }),
  coffeespot: restaurant({
    name: 'CoffeeSpot',
    cuisine: 'Coffee, Café, Craft Beer, Pastries',
    amenity: 'cafe',
    description: 'Specialty coffees, coffee-based drinks, artisanal beers, savory items and pastries.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', open247: true })],
  }),
  deltaexpresso: restaurant({
    name: 'Deltaexpresso',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    description: 'Specialty coffees and quick options, combining flavor and convenience.',
    outlets: [
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' }),
      outlet({ airside: 'landside', level: 'Piso 0', locationNotes: 'Desembarque, Área Pública', open247: true }),
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', open247: true }),
    ],
  }),
  divino_fogao: restaurant({
    name: 'Divino Fogão',
    cuisine: 'Brazilian, Home-Style',
    amenity: 'restaurant',
    description: 'Brazilian home-style cooking, with traditional dishes prepared with care and authentic flavor.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' })],
  }),
  empanadas_y_tal: restaurant({
    name: 'Empanadas y Tal',
    cuisine: 'South American, Empanadas',
    amenity: 'fast_food',
    description: 'Artisanal empanadas inspired by South American cuisine, with varied fillings.',
    outlets: [
      outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Internacional', openingHours: '04:00–23:00' }),
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' }),
    ],
  }),
  factory: restaurant({
    name: 'Factory',
    cuisine: 'Grill, Pasta, Salads',
    amenity: 'restaurant',
    description: 'A varied menu of grilled items, pastas, salads and daily specials, in a modern setting.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', open247: true })],
  }),
  freddo: restaurant({
    name: 'Freddo',
    cuisine: 'Argentine, Gelato, Ice Cream',
    amenity: 'cafe',
    website: 'https://br.freddo.com/',
    logoUrl: logo('freddo.com'),
    description: 'Artisanal Argentine gelato, made with high-quality ingredients and traditional recipes.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  galeao_coffee_shop: restaurant({
    name: 'Galeão Coffee Shop',
    cuisine: 'Coffee, Café, Light Meals',
    amenity: 'cafe',
    description: 'Specialty coffees, quick snacks and light meals.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', open247: true })],
  }),
  geneal_e_sorvetes_italia: restaurant({
    name: 'Geneal e Sorvetes Itália',
    cuisine: 'Snacks, Ice Cream, Gelato',
    amenity: 'fast_food',
    website: 'https://www.geneal.com.br/',
    logoUrl: logo('geneal.com.br'),
    description: 'Geneal RJ and Sorvetes Itália share one space — tasty snacks alongside artisanal gelato.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  giraffas: restaurant({
    name: 'Giraffas',
    cuisine: 'Brazilian, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.giraffas.com.br',
    logoUrl: logo('giraffas.com.br'),
    description: 'Brazilian fast-food restaurant chain, serving Brazilian dishes with flavor and variety.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' })],
  }),
  grand_cru: restaurant({
    name: 'Grand Cru',
    cuisine: 'Wine Bar, Café',
    amenity: 'bar',
    description: 'Tasty dishes paired with a special selection of wines.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  havanna: restaurant({
    name: 'Havanna',
    cuisine: 'Argentine, Alfajores, Sweets, Coffee',
    amenity: 'cafe',
    website: 'https://www.havanna.com.br',
    logoUrl: logo('havanna.com.br'),
    description: 'A reference in alfajores and Argentine sweets, plus coffees and classic desserts.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  jamies_deli: restaurant({
    name: "Jamie's Deli",
    cuisine: 'Deli, Sandwiches',
    amenity: 'fast_food',
    description: 'Quality ingredients in sandwiches and quick dishes, for a tasty, practical meal.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', open247: true })],
  }),
  juice_da_orla: restaurant({
    name: 'Juice da Orla',
    cuisine: 'Healthy, Juices, Açaí, Tapioca, Sandwiches',
    amenity: 'fast_food',
    description: 'Healthy, practical food — tapiocas, natural juices, açaí bowls, sandwiches and light meals.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Praça de Alimentação do Internacional, Embarque Internacional', openingHours: '04:00–23:00' })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com.br',
    logoUrl: logo('kfc.com.br'),
    description: "Crunchy chicken and KFC's exclusive seasoning.",
    outlets: [
      outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' }),
      outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Internacional', openingHours: '04:00–23:00' }),
    ],
  }),
  kafe: restaurant({
    name: 'Kafe',
    cuisine: 'Coffee, Café, Snacks',
    amenity: 'cafe',
    description: 'Specialty coffees and practical snack options for travelers passing through the airport.',
    outlets: [
      outlet({ airside: 'landside', level: 'Piso 0', locationNotes: 'Desembarque, Área Pública', open247: true }),
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' }),
      outlet({ airside: 'landside', level: 'Piso 2', locationNotes: 'Área Pública (before the security X-ray)', open247: true }),
    ],
  }),
  kopenhagen: restaurant({
    name: 'Kopenhagen',
    cuisine: 'Chocolate, Confectionery',
    amenity: 'cafe',
    website: 'https://www.kopenhagen.com.br/',
    logoUrl: logo('kopenhagen.com.br'),
    description: 'A reference in fine chocolates, with a variety of artisanal and classic products.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 2', locationNotes: 'Área Pública (before security — the venue\'s own page tags this ambiguously as "Área Pública/Embarque")', openingHours: '05:00–22:00' })],
  }),
  kozinha_sushi_bar_arabe: restaurant({
    name: 'Kozinha Sushi Bar & Árabe',
    cuisine: 'Japanese, Middle Eastern, Sushi',
    amenity: 'restaurant',
    description: 'Japanese and Middle Eastern cuisine — sushi, sashimi, temaki and Middle Eastern dishes made to order.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' })],
  }),
  latitude_cafe: restaurant({
    name: 'Latitude Café',
    cuisine: 'Café, Vegan-Friendly',
    amenity: 'cafe',
    vegetarian: true,
    vegan: true,
    description: 'Specialty drinks, snacks, desserts and vegan options.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 2', locationNotes: 'Área Pública (before security — the venue\'s own page tags this ambiguously as "Área Pública/Embarque")', openingHours: '05:00–22:00' })],
  }),
  mania_de_churrasco: restaurant({
    name: 'Mania de Churrasco Premium',
    cuisine: 'Brazilian, Churrasco, Grill',
    amenity: 'restaurant',
    website: 'https://maniadechurrasco.com.br/',
    logoUrl: logo('maniadechurrasco.com.br'),
    description: 'Grilled meats, traditional sides and classic Brazilian churrasco dishes.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' })],
  }),
  mariposa: restaurant({
    name: 'Mariposa',
    cuisine: 'Healthy, Salads, Brazilian',
    amenity: 'restaurant',
    website: 'https://mariposa.com.br/',
    logoUrl: logo('mariposa.com.br'),
    description: 'Healthy options — fresh salads, savory picadinhos and varied light meals.',
    outlets: [
      outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' }),
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', open247: true }),
    ],
  }),
  mcdonalds: restaurant({
    name: "Mc Donald's",
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com/br',
    logoUrl: logo('mcdonalds.com.br'),
    description: 'Fast-food classics — burgers, fries and desserts.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  mcdonalds_sorvete: restaurant({
    name: "Mc Donald's Sorvete",
    cuisine: 'Ice Cream, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com/br',
    logoUrl: logo('mcdonalds.com.br'),
    description: "A dedicated McDonald's ice-cream counter — milkshakes, sundaes and traditional cones; a separate listing from the main Mc Donald's restaurant.",
    outlets: [outlet({ airside: 'landside', level: 'Piso 0', locationNotes: 'Área Pública (Desembarque)', openingHours: '05:00–22:00' })],
  }),
  nescafe: restaurant({
    name: 'Nescafé',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    website: 'https://www.nescafe.com',
    logoUrl: logo('nescafe.com'),
    description: 'A variety of coffees, from espressos to iced drinks.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', open247: true })],
  }),
  nutty_bavarian: restaurant({
    name: 'Nutty Bavarian',
    cuisine: 'Snacks, Candied Nuts',
    amenity: 'fast_food',
    website: 'https://nuttybavarian.com',
    logoUrl: logo('nuttybavarian.com'),
    description: 'Caramelized nuts and crunchy snacks.',
    outlets: [
      outlet({ airside: 'landside', level: 'Piso 2', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' }),
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' }),
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', openingHours: '04:00–23:00' }),
      outlet({ airside: 'landside', level: 'Piso 0', locationNotes: 'Área Pública (Desembarque)', openingHours: '05:00–22:00' }),
    ],
  }),
  o_pasquim_bar_e_prosa: restaurant({
    name: 'O Pasquim Bar e Prosa',
    cuisine: 'Brazilian, Bar, Petiscos',
    amenity: 'bar',
    description: 'Varied petiscos and classic drinks in a relaxed setting, with a kids\' area for families.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
  palaphita: restaurant({
    name: 'Palaphita',
    cuisine: 'Brazilian, Pasta, Bar & Grill',
    amenity: 'restaurant',
    description: 'Artisanal pastas alongside creative petiscos, special starters and dishes designed to highlight each flavor.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Internacional', openingHours: '04:00–23:00' })],
  }),
  pipocassa: restaurant({
    name: 'Pipocassa',
    cuisine: 'Snacks, Popcorn',
    amenity: 'fast_food',
    description: 'Sweet and salty popcorn in a variety of flavors.',
    outlets: [
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' }),
      outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' }),
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', openingHours: '04:00–23:00' }),
    ],
  }),
  pizza_hut: restaurant({
    name: 'Pizza Hut',
    cuisine: 'Pizza, Italian-American',
    amenity: 'restaurant',
    website: 'https://www.pizzahut.com.br',
    logoUrl: logo('pizzahut.com.br'),
    description: 'Crispy crusts, varied toppings and classic flavors.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' })],
  }),
  ritazza: restaurant({
    name: 'Ritazza',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    website: 'https://www.ritazza.com',
    logoUrl: logo('ritazza.com'),
    description: 'Specialty coffees, hot and cold drinks, plus practical snacks.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Internacional', open247: true })],
  }),
  spoleto: restaurant({
    name: 'Spoleto',
    cuisine: 'Italian, Pasta',
    amenity: 'restaurant',
    website: 'https://www.spoleto.com.br',
    logoUrl: logo('spoleto.com.br'),
    description: 'Gnocchi, risottos, salads and different pastas with varied sauces.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' })],
  }),
  starbucks: restaurant({
    name: 'Starbucks Coffee',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    website: 'https://www.starbucks.com.br',
    logoUrl: logo('starbucks.com.br'),
    description: 'Hot or iced coffees, plus quick snack options and customized drinks.',
    outlets: [
      outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', open247: true }),
      outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' }),
    ],
  }),
  subway: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.subway.com',
    logoUrl: logo('subway.com'),
    description: 'Build-your-own sandwiches, with a variety of fillings, breads and sides.',
    outlets: [
      outlet({ airside: 'landside', level: 'Piso 1 Mezanino', locationNotes: 'Área Pública (before the security X-ray)', openingHours: '05:00–22:00' }),
      outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Internacional', openingHours: '04:00–23:00' }),
    ],
  }),
  tgi_fridays: restaurant({
    name: 'TGI Fridays Brasil',
    cuisine: 'American, Bar & Grill',
    amenity: 'restaurant',
    website: 'https://www.tgifridays.com.br',
    logoUrl: logo('tgifridays.com.br'),
    description: 'Burgers, classic dishes and drinks in a relaxed setting.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 0', locationNotes: 'Área Pública (Desembarque)', openingHours: '05:00–22:00' })],
  }),
  travel_market: restaurant({
    name: 'Travel Market',
    cuisine: 'Café, Convenience, Snacks',
    amenity: 'cafe',
    description: 'Combines coffee, convenience items and souvenirs in one place.',
    outlets: [outlet({ airside: 'landside', level: 'Piso 2', locationNotes: 'Área Pública (before security — the venue\'s own page tags this ambiguously as "Área Pública/Embarque")', open247: true })],
  }),
  upper_crust: restaurant({
    name: 'Upper Crust',
    cuisine: 'Bakery, Café, Quick Meals',
    amenity: 'bakery',
    description: 'A practical stop for coffees, snacks and quick meals during the journey.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 2', locationNotes: 'Embarque Doméstico', open247: true })],
  }),
  ventana_fresh: restaurant({
    name: 'Ventana Fresh',
    cuisine: 'Café, Quick Bites',
    amenity: 'cafe',
    description: 'A quick stop for coffee and snacks, for practicality and flavor.',
    outlets: [outlet({ airside: 'airside', level: 'Piso 1 Mezanino', locationNotes: 'Embarque Doméstico', openingHours: '05:00–22:00' })],
  }),
};

// ─── upload: detect airport slug, unconditionally wipe the terminal's ───────
// ─── restaurants subcollection, then recreate every venue from this file ────

async function findAirportId() {
  for (const id of CANDIDATE_AIRPORT_IDS) {
    const terminalsSnap = await db.collection('airports').doc(id).collection('terminals').get();
    if (!terminalsSnap.empty) {
      console.log(`Using existing airport doc '${id}' (${terminalsSnap.size} terminal(s) found).`);
      return id;
    }
  }
  console.log(`No existing terminals found under any of [${CANDIDATE_AIRPORT_IDS.join(', ')}] — defaulting to '${CANDIDATE_AIRPORT_IDS[0]}'. If this airport uses a different slug, set AIRPORT_ID_OVERRIDE above and re-run.`);
  return CANDIDATE_AIRPORT_IDS[0];
}

async function processTerminal(AIRPORT, terminalId, terminalName, venues) {
  const restCol = db.collection('airports').doc(AIRPORT).collection('terminals').doc(terminalId).collection('restaurants');
  const existingSnap = await restCol.get();

  console.log(`\n${terminalName} (${terminalId}): found ${existingSnap.size} existing restaurant doc(s) — wiping all of them before adding this file's venues.`);

  const batch = db.batch();
  let deleted = 0;
  let created = 0;

  // Wipe: delete every existing doc in this terminal's restaurants
  // subcollection unconditionally, regardless of whether its name matches
  // anything in this run. Nothing survives from the previous run.
  existingSnap.forEach((doc) => {
    batch.delete(doc.ref);
    console.log(`  DELETE  ${terminalId}/${doc.id}`);
    deleted++;
  });

  // Replace: recreate every venue in this file as a brand-new doc.
  for (const [key, data] of Object.entries(venues)) {
    const newId = key || slugify(`${data.name}_${terminalId}`);
    batch.set(restCol.doc(newId), data, { merge: false });
    console.log(`  CREATE  ${data.name}  ->  ${terminalId}/${newId}`);
    created++;
  }

  if (created > 0) {
    await db.collection('airports').doc(AIRPORT).collection('terminals').doc(terminalId)
      .set({ name: terminalName }, { merge: true });
  }

  await batch.commit();
  return { created, deleted };
}

// Wiping a terminal's `restaurants` subcollection never removed the
// terminal-level doc itself, so any terminal bucket a previous revision of
// a script like this one used but later dropped would be left behind as an
// empty-but-still-present `terminals/{id}` doc — inflating the terminal
// count the app shows for that airport. This purges any terminal doc under
// the airport that isn't one of THIS run's terminal ids, deleting its
// restaurants subcollection first and then the terminal doc itself.
async function purgeOrphanedTerminals(AIRPORT, currentTerminalIds) {
  const terminalsSnap = await db.collection('airports').doc(AIRPORT).collection('terminals').get();
  let purgedTerminals = 0;
  let purgedRestaurants = 0;

  for (const termDoc of terminalsSnap.docs) {
    if (currentTerminalIds.has(termDoc.id)) continue;

    const restSnap = await termDoc.ref.collection('restaurants').get();
    const batch = db.batch();
    restSnap.forEach((r) => {
      batch.delete(r.ref);
      purgedRestaurants++;
    });
    batch.delete(termDoc.ref);
    await batch.commit();

    console.log(`\nPurged orphaned terminal '${termDoc.id}' — deleted it and ${restSnap.size} restaurant doc(s) it still held.`);
    purgedTerminals++;
  }

  if (purgedTerminals === 0) {
    console.log('\nNo orphaned terminal docs found.');
  }

  return { purgedTerminals, purgedRestaurants };
}

async function main() {
  const AIRPORT = AIRPORT_ID_OVERRIDE || await findAirportId();
  console.log(`Using airport doc '${AIRPORT}'.`);

  const result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', terminal2Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_2]));

  const totalVenues = Object.keys(terminal2Venues).length;

  console.log(`\nDone. Wiped ${result.deleted} old venue doc(s), created ${result.created} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${result.created}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
