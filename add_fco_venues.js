'use strict';
/**
 * Fills in complete data for all Rome Fiumicino Airport (FCO) restaurants/
 * bars/cafés in Firestore, cross-referenced against the official Aeroporti
 * di Roma "Shop & Eat" directory (adr.it/fiumicino-shop-eat-negozi-search,
 * English locale at adr.it/web/aeroporti-di-roma-en/...) and each outlet's
 * own detail page on 2026-08-05.
 *
 * The directory is a Liferay portlet ("Fiumicino Shopping/Eat Drink") that
 * lists shops by category (categoria=<id>&macrocategoria=eat_drink query
 * params) — the "food" landing page's category tiles (Bar & Café, Italian
 * Cuisine, International Cuisine, Fast & Street Food, Pizza, Ice Cream,
 * Wine & Bubbles Bar, Healthy & Special Diets, Bakery & Pastry, Steakhouse
 * & Grill, Street Food) each map to one categoria id, and the SAME listing
 * with no categoria filter (only macrocategoria=eat_drink) returns every
 * food & beverage outlet at once — 51 distinct brands / 63 individual
 * outlet counters once the page-size control is set to show all results.
 * Each outlet row expands into an accordion revealing a "Details" link
 * keyed by a numeric shopId; that detail page is the only place carrying
 * description, phone, email, published hours, duty-free status and a
 * "SERVICE PROVIDED" tag list (the closest thing this site has to dietary
 * flags — "gluten free", "vegetarian dishes", "h24", etc.). All 63 outlet
 * detail pages were fetched and parsed to build this script.
 *
 * TERMINAL STRUCTURE: Fiumicino has exactly two physically separate landside
 * terminal buildings — Terminal 1 and Terminal 3 (Terminal 2 was closed and
 * repurposed years ago, and doesn't appear anywhere in the live food &
 * beverage directory). 'Boarding A' and 'Boarding E' are NOT separate
 * terminals — they are the airside gate piers reached after clearing
 * security FROM those same two buildings: Boarding A is Terminal 1's airside
 * continuation (Schengen/domestic gates A1-83), Boarding E is Terminal 3's
 * airside continuation (non-Schengen/long-haul gates E1-61). An earlier
 * revision of this script wrongly modelled Boarding A and Boarding E as two
 * additional standalone terminal buckets, which inflated the terminal count
 * the app showed for this airport the same way an earlier revision of the
 * Zurich script did. Boarding A's outlets are folded into the `terminal_1`
 * bucket below and Boarding E's into `terminal_3`, with the zone each outlet
 * actually sits in (landside "area before check-in"/arrivals vs. airside
 * Boarding A/E, plus the specific gate range where published) recorded in
 * that outlet's own `location_notes` rather than used to fragment the
 * terminal into buckets that don't correspond to anything physically
 * separate. A brand present in both the landside and airside zone of the
 * SAME terminal (12oz in Terminal 1's check-in area and Boarding A; Panella
 * in Terminal 3's arrivals and Boarding E) is now combined into a single doc
 * with one `outlets[]` entry per zone, per this dataset's standing
 * convention for multiple outlets of the same brand within one terminal
 * bucket. A brand present in the two DIFFERENT terminal buildings (Caffè
 * Napoli in both T1 and T3) still gets a separate doc per building, since
 * those are genuinely different physical terminals; sub-brands with their
 * own distinct name (Caffè Vergnano 1882 vs. Caffè Vergnano - Women in
 * Coffee vs. plain Caffè Vergnano; Illy vs. Kikki-Illy) are likewise kept as
 * separate docs, matching how the site itself lists them. Multiple counters
 * of the same brand within one zone (Venchi's 3 Boarding-A counters,
 * Panella's 2 Boarding-A counters, Caffè Vergnano 1882's 2 Terminal-1
 * counters) remain combined into a single doc with multiple `outlets[]`, as
 * before.
 *
 * Five brands — Ajisen Ramen, Chef Market, Ferrari Spazio Bollicine, Natoo
 * and Pick — publish NO terminal/pier badge anywhere on the site (neither
 * the category-list row nor the outlet's own detail page carries a
 * TERMINAL/Boarding/LOCATION field; a couple show only a bare "Departures"
 * or "Arrivals" flag). Rather than guess which of the two terminal buildings
 * they belong to, these five stay in their own bucket, `other_areas`, with
 * whatever partial departures/arrivals info the site does publish kept in
 * the outlet's `location_notes`.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - `airside` is derived from each outlet's own "SECURITY CHECKS" field:
 *     "Area before check-in" -> landside, "Area after check-in" ->
 *     airside. Outlets with no security-check field published (arrivals-
 *     side counters, and the five `other_areas` brands) are treated as
 *     landside, matching their "Arrivals"/no-flag status.
 *   - Dietary tags come only from each outlet's own "SERVICE PROVIDED" tag
 *     list on its detail page: `gluten free` -> gluten-free flag,
 *     `vegetarian dishes` -> vegetarian flag. The site never publishes a
 *     vegan, halal or kosher tag for any Fiumicino outlet (checked via the
 *     "Healthy & Special Diets (Gluten-Free, Kosher, Halal)" category
 *     filter, which returns only EXKI) — those three fields are left
 *     blank throughout rather than guessed. Flags are venue-level, not
 *     per-outlet, matching the convention used elsewhere in this dataset;
 *     where only one of several same-brand outlets carries a tag, the
 *     venue-level flag is still set true.
 *   - `phone`/`email` are left blank where the site itself doesn't publish
 *     one for that outlet (roughly a third of outlets have neither) —
 *     several brands share a single operator contact (autogrill.net,
 *     areas.com, chefexpress.it, cremonini.com house numbers/addresses)
 *     rather than a per-shop line; that's what's actually published, not
 *     a gap in this script.
 *   - `opening_hours` reproduces the site's own "Time" field verbatim
 *     (e.g. "5:00 - 23:00"); a handful of outlets publish no hours at all
 *     (shown as "-" on the site) and are left blank here rather than
 *     guessed. EXKI's field literally reads "H24 -", treated as 24/7.
 *   - `website`/`logo_url` are only filled in for brands independently
 *     verifiable as real national/international chains with a confident
 *     public domain (KFC, Costa Coffee/Costa Caffè, illy/Kikki-Illy,
 *     Eataly, Venchi, Caffè Vergnano, All'Antico Vinaio, EXKI, Doppio
 *     Malto, Rossopomodoro, Guido Berlucchi, Ferrari Trento, Temakinho,
 *     Ajisen Ramen, Amorino, Cioccolati Italiani, Bonci) — Fiumicino
 *     concession-only concepts with no independently confirmed domain
 *     (Sophia Loren, Cielo, Amore, Semplicemente Roma, Panella, Motta,
 *     Spizzico, Rinaldini, and the rest) are left blank rather than
 *     guessing one.
 *   - Costa Caffè and Costa Coffee are kept as two separate docs, matching
 *     the site's own two separate listings (different Boarding-E counters,
 *     different published hours) rather than assumed to be a duplicate.
 *
 * Rome Fiumicino appears in NEITHER reference script
 * (migrate_firestore.js's AIRPORT_SLUGS nor cleanup_firestore.js) —
 * confirmed via grep for "rome"/"fco"/"fiumicino" returning zero matches
 * in both files — so its Firestore slug is unconfirmed. This script
 * auto-detects the airport slug at runtime (checking 'rome' first, then
 * 'fco', using whichever has existing terminal data). It never creates a
 * new `airports/{id}` metadata doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: unlike the older add_*_venues.js scripts in
 * this repo (which only ever update matching docs or create new ones),
 * this script does a hard wipe, not a diff. For every terminal grouping
 * below, it first deletes EVERY existing restaurant doc in that terminal's
 * `restaurants` subcollection — unconditionally, regardless of whether its
 * name matches anything in this file — and only then creates every venue
 * defined here as a brand-new doc. There is no update-in-place step and no
 * name-matching against what's already there; nothing from a previous run
 * survives. Run this only when the venue lists below are meant to be the
 * complete, authoritative set for each terminal bucket.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't one of THIS script's three terminal ids (TERMINAL_1,
 * TERMINAL_3, OTHER_AREAS) gets its restaurants subcollection and then the
 * terminal doc itself deleted — including the old `boarding_a`/`boarding_e`
 * buckets an earlier revision of this script created, so running this
 * cleans up that mistake instead of leaving it behind as more dead terminal
 * docs the app would otherwise keep showing.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_fco_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['rome', 'fco'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_3 = 'terminal_3';
const OTHER_AREAS = 'other_areas';

// ─── helpers (matches admin_restaurant_editor_screen.dart's save shape) ──────

function outlet({ airside = 'airside', level = '', locationNotes = '', openingHours = '', open247 = false }) {
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

// ─── Terminal 1 venues (the single Terminal 1 building — landside check-in ──
// ─── area AND its airside Boarding A pier, reached after security) ──────────

const t1Venues = {
  // — landside, area before check-in / arrivals —
  centottanta_grammi: restaurant({
    name: '180 Grammi',
    cuisine: 'Pizza',
    amenity: 'fast_food',
    description: 'An authentic, contemporary pizzeria using selected ingredients and light, easy-to-digest dough — a blend of tradition and innovation bringing genuine Italian flavor to the table in an informal, welcoming setting.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1, arrivals, passenger waiting area', openingHours: '5:00 - 23:00' })],
  }),
  caffe_napoli_t1: restaurant({
    name: 'Caffè Napoli',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Caffè Napoli Exytus, with its contemporary design, combines the uniqueness of Neapolitan espresso with a selection of traditional gastronomic products — coffee shop, bar, snack and tobacco services in one stylish stop.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1, arrivals, passenger waiting area', openingHours: '6:30 - 21:30' })],
  }),
  caffe_vergnano_1882: restaurant({
    name: 'Caffè Vergnano 1882',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.caffevergnano.com',
    logoUrl: logo('caffevergnano.com'),
    glutenFree: true,
    description: 'Caffè Vergnano offers the finest Italian espresso recipes alongside a menu of sandwiches, tramezzini, pizza and cold dishes, prepared with high-quality Italian ingredients in the café, bar and snack area, with gluten-free options.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Terminal 1, area before check-in', openingHours: '0:00 - 24:00', open247: true }),
      outlet({ airside: 'landside', locationNotes: 'Terminal 1, arrivals, passenger waiting area', openingHours: '5:00 - 23:00' }),
    ],
  }),
  cioccolati_italiani: restaurant({
    name: 'Cioccolati Italiani',
    cuisine: 'Chocolate, Gelato, Pastry',
    amenity: 'cafe',
    website: 'https://www.cioccolatitaliani.it',
    logoUrl: logo('cioccolatitaliani.it'),
    glutenFree: true,
    phone: '+39 3666029961',
    description: 'A chocolate-and-gelato café using top-quality raw materials for Italian chocolate, pastry, gelato, snacks and sweet moments, with gluten-free options available.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1, area before check-in', openingHours: '2:00 - 22:00' })],
  }),
  genuino: restaurant({
    name: 'Genuino',
    cuisine: 'Bar, Snacks',
    amenity: 'fast_food',
    description: 'The perfect place for those who want to enjoy breakfast or a quick meal without compromising on taste — a fresh, authentic bar, snack and coffee-shop offer always ready to satisfy hunger in just a few minutes.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1, arrivals, passenger waiting area', openingHours: '05:00 - 23:00' })],
  }),
  juicebar: restaurant({
    name: 'Juicebar',
    cuisine: 'Healthy, Café',
    amenity: 'cafe',
    glutenFree: true,
    phone: '3387121237',
    description: 'A "better for you" healthy-dining concept combining tradition and innovation, offering natural, artisanal and gluten-free coffee and snacks — healthy, fresh and delicious nourishment for every palate.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1, arrivals', openingHours: '5:00 - 23:00' })],
  }),
  kikki_illy: restaurant({
    name: 'Kikki - Illy',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '06 65952671',
    description: 'A contemporary-design coffee shop that pairs warmth and hospitality with quality illy coffee, sweet and savory snacks, and a tobacco selection — for anyone who loves bar, snack, coffee-shop and tobacconist all in one.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1, arrivals, passenger waiting area', openingHours: '6:00 - 22:00' })],
  }),
  rossopomodoro: restaurant({
    name: 'Rossopomodoro',
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    website: 'https://www.rossopomodoro.it',
    logoUrl: logo('rossopomodoro.it'),
    phone: '',
    description: 'An Italian restaurant evoking the atmosphere of a classic Neapolitan trattoria, welcoming guests like family — pizzas, first and second courses and desserts for a tasty break before departure.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1, area before check-in', openingHours: '9:00 - 22:00' })],
  }),

  // — airside, Boarding A pier (reached after security from Terminal 1) —
  alemagna: restaurant({
    name: 'Alemagna',
    cuisine: 'Café, Pastry',
    amenity: 'cafe',
    glutenFree: true,
    description: 'Alemagna Caffè Pasticceria unites tradition and excellence with a creative touch — artisanal sweets, refined snacks and authentic Italian espresso, plus delicious gluten-free options for a truly inclusive experience.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '0:00 - 24:00', open247: true })],
  }),
  allantico_vinaio: restaurant({
    name: "All'Antico Vinaio",
    cuisine: 'Street Food, Sandwiches',
    amenity: 'fast_food',
    website: 'https://www.allanticovinaio.com',
    logoUrl: logo('allanticovinaio.com'),
    description: "An iconic Italian street-food brand famous for its stuffed schiacciata, filled with high-quality Tuscan ingredients — born in Florence, it has carried the authentic taste of tradition around the world.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, A21-27', openingHours: '5:00 - 23:00' })],
  }),
  caffe_kimbo_boarding_a: restaurant({
    name: 'Caffè Kimbo',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    glutenFree: true,
    vegetarian: true,
    phone: '+39 0665012290',
    description: 'Caffè Kimbo Espresso da Napoli blends Neapolitan tradition and flavor with a modern, international style, offering a coffee-shop and snack-bar experience with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '3:00 - 22:00' })],
  }),
  berlucchi: restaurant({
    name: 'Berlucchi Sparkling Bar',
    cuisine: 'Wine Bar, Italian',
    amenity: 'bar',
    glutenFree: true,
    website: 'https://www.guidoberlucchi.it',
    logoUrl: logo('guidoberlucchi.it'),
    phone: '',
    description: 'An elegant wine & sparkling bar with an Italian and international restaurant, perfect for aperitifs, lunch, dinner or a moment of relaxation — starring an exclusive selection of Franciacorta Berlucchi and a menu by Michelin-starred chef Gennaro Esposito, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '7:00 - 23:00' })],
  }),
  cielo: restaurant({
    name: 'Cielo',
    cuisine: 'Italian, Bar',
    amenity: 'restaurant',
    vegetarian: true,
    description: 'Cielo FCO offers an elegant, welcoming atmosphere with contemporary-design interiors. Local cuisine, drawing on both land and sea ingredients, is paired with quality wines and an American-bar-style cocktail menu.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, A31-52', openingHours: '10:00 - 23:00' })],
  }),
  culto_caffe: restaurant({
    name: 'Culto Caffè',
    cuisine: 'Café, Chocolate',
    amenity: 'cafe',
    description: 'A coffee-and-chocolate café (Culto Caffè Cioccolato) in Boarding A offering bar, snack and coffee-shop service.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, A31-52', openingHours: '' })],
  }),
  deli_and_cia: restaurant({
    name: 'Deli&Cia',
    cuisine: 'Healthy, Café',
    amenity: 'cafe',
    glutenFree: true,
    phone: '06 65956591',
    description: 'An informal healthy bar in pastel tones, offering coffee, traditional and healthy snacks, hot and cold drinks, and a fresh, packaged take-away selection, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, A61-83', openingHours: '5:00 - 23:00' })],
  }),
  doppio_malto: restaurant({
    name: 'Doppio Malto',
    cuisine: 'Brewery, Steakhouse, International',
    amenity: 'restaurant',
    glutenFree: true,
    website: 'https://www.doppiomalto.it',
    logoUrl: logo('doppiomalto.it'),
    description: 'A brewery, steakhouse and international restaurant where in-house craft beer, grilled meats and vegetarian dishes come together for a joyful dining experience, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '8:00 - 23:00' })],
  }),
  eataly_la_terrazza: restaurant({
    name: 'Eataly | La Terrazza',
    cuisine: 'Italian, Wine Bar, Pizza, Street Food',
    amenity: 'food_court',
    vegetarian: true,
    website: 'https://www.eataly.it',
    logoUrl: logo('eataly.it'),
    phone: '+39 0665012279',
    description: "Eataly is about eating Italian, living Italian: an authentic, informal food court experience in Fiumicino's Boarding A with a wide selection of Italian wines paired with street food, pizza and traditional dishes made with quality ingredients.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '5:30 - 23:00' })],
  }),
  eataly_wine_bar: restaurant({
    name: 'Eataly Wine Bar',
    cuisine: 'Wine Bar, Italian, Pizza',
    amenity: 'bar',
    vegetarian: true,
    glutenFree: true,
    website: 'https://www.eataly.it',
    logoUrl: logo('eataly.it'),
    phone: '+39 0665012279',
    description: 'A wide selection of Italian wines paired with street food, pizza, snacks and traditional dishes made with quality ingredients — an authentic, relaxed experience in Boarding A, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '5:30 - 23:00' })],
  }),
  exki: restaurant({
    name: 'EXKI',
    cuisine: 'Healthy, Salads',
    amenity: 'fast_food',
    glutenFree: true,
    website: 'https://www.exki.com',
    logoUrl: logo('exki.com'),
    description: 'An international chain focused on plant-based dishes made with fresh, seasonal ingredients (40% organic or responsibly sourced), committed to reducing plastic use — a fast, healthy and tasty dining option including gluten-free choices.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: 'H24', open247: true })],
  }),
  farinella_boarding_a: restaurant({
    name: 'Farinella',
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    description: 'A typical Neapolitan restaurant with a warm, welcoming family atmosphere, specializing in pizza and traditional Italian dishes for an authentic, genuine experience.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '8:00 - 23:00' })],
  }),
  illy_boarding_a: restaurant({
    name: 'Illy',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.illy.com',
    logoUrl: logo('illy.com'),
    description: 'illy Caffè brings authentic Italian espresso to the world in a contemporary setting — bar, snack and café spaces also offering typical Italian dishes and the full range of illy-branded products.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '3:00 - 23:00' })],
  }),
  lievito: restaurant({
    name: 'Lievito',
    cuisine: 'Pizza',
    amenity: 'fast_food',
    description: 'A Roman pizza-by-the-slice concept championing artisanal, genuine, seasonal ingredients — named "second-best Pizza in Viaggio" in 2024, making its first airport appearance in the Fiumicino food court.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '5:00 - 23:00' })],
  }),
  rinaldini: restaurant({
    name: 'Rinaldini',
    cuisine: 'Pastry, Gelato, Café',
    amenity: 'bakery',
    phone: '6.659.556.096',
    description: "A modern boutique of bar, snack, coffee-shop, gelateria and pastry born from the passion of Maestro Rinaldini, where the excellence of Italian artisan pastry and food meets creativity and innovation.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, A31-52', openingHours: '5:00 - 23:00' })],
  }),
  sophia_loren: restaurant({
    name: 'Sophia Loren',
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    description: 'A restaurant bringing travelers the authentic flavors of Italian cuisine, with specialties like Neapolitan fritti, Bufala Campana mozzarella and an elegant oyster selection — an experience combining tradition, pizza and quality.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '9:00 - 22:00' })],
  }),
  temakinho: restaurant({
    name: 'Temakinho',
    cuisine: 'Japanese, Brazilian, Fusion',
    amenity: 'restaurant',
    website: 'https://www.temakinho.com',
    logoUrl: logo('temakinho.com'),
    phone: '',
    description: 'A renowned Nippo-Brazilian restaurant bringing exotic, refined flavors to Rome Fiumicino in a modern, welcoming setting — specializing in Asian, fusion and international cuisine.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '8:00 - 23:00' })],
  }),
  venchi_boarding_a: restaurant({
    name: 'Venchi',
    cuisine: 'Chocolate, Gelato',
    amenity: 'cafe',
    glutenFree: true,
    website: 'https://www.venchi.com',
    logoUrl: logo('venchi.com'),
    description: "At Venchi, chocolate is a passion to savor — from pralines to gelato crêpes, chocolate bars to gourmet treats — all made without preservatives and with delicious gluten-free options.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Boarding A, A61-83', openingHours: '08:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'Boarding A, A31-52', openingHours: '08:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '5:00 - 22:00' }),
    ],
  }),
  viva: restaurant({
    name: 'Viva',
    cuisine: 'Healthy, Fast Food',
    amenity: 'fast_food',
    glutenFree: true,
    phone: '+39 0665012290',
    description: 'Puro Gusto and Viva offer two complementary experiences: a modern Italian coffee shop with artisanal iconic dishes, and a natural fast-food concept for fresh, quick meals like poke and customizable salad bowls, both with gluten-free options including sweet snacks.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, A61-83', openingHours: '5:00 - 21:00' })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'American, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    phone: '+39 0665012290',
    description: "Founded in the U.S. by Colonel Sanders, KFC is the world's most famous fried-chicken fast-food chain — now finally in Italy, with a new location at Fiumicino Airport.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding A, common area', openingHours: '7:00 - 22:00' })],
  }),
  panella_boarding_a: restaurant({
    name: 'Panella',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    glutenFree: true,
    description: 'A bakery brand born from a traditional Roman bread shop, now grown into a broader Coffee & Bakery Artigianale project — a bar offering coffee-shop service, snacks and fresh, quality baked goods.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Boarding A, A21-27', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Boarding A, A31-52', openingHours: '0:00 - 24:00', open247: true }),
    ],
  }),

  // — brand present in both zones, combined into one doc with 2 outlets —
  twelve_oz: restaurant({
    name: '12oz',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'An Italian brand specializing in coffee-based long drinks inspired by the American street-coffee tradition, offering hot and cold beverages, bar snacks and full coffee-shop service — quality, taste and practicality to enjoy on the go.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Terminal 1, area before check-in', openingHours: '4:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'Boarding A, A61-83', openingHours: '5:00 - 21:00' }),
    ],
  }),
};

// ─── Terminal 3 venues (the single Terminal 3 building — landside ───────────
// ─── check-in area AND its airside Boarding E pier, after security) ─────────

const t3Venues = {
  // — landside, area before check-in / arrivals —
  amorino: restaurant({
    name: 'Amorino',
    cuisine: 'Gelato, Café',
    amenity: 'cafe',
    website: 'https://www.amorino.com',
    logoUrl: logo('amorino.com'),
    description: 'A bar, coffee shop and snack spot celebrated for its artisanal gelato made with organic, natural ingredients and no artificial flavors — iconic for its flower-shaped presentation, a refined pause that celebrates Italian tradition and craftsmanship.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, area before check-in', openingHours: '0:00 - 24:00', open247: true })],
  }),
  bistrot: restaurant({
    name: 'Bistrot',
    cuisine: 'Café, Snacks',
    amenity: 'restaurant',
    description: 'The Bistrot at Fiumicino is a bar, café and snack spot offering a complete, genuine dining experience with a wide selection of classic and seasonal dishes; the self-service formula ensures speed and convenience, with dedicated areas for salads, pasta and freshly grilled burgers.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, area before check-in', openingHours: '6:00 - 22:00' })],
  }),
  bonci: restaurant({
    name: 'Bonci',
    cuisine: 'Pizza, Bar',
    amenity: 'fast_food',
    website: 'https://www.bonci.it',
    logoUrl: logo('bonci.it'),
    glutenFree: true,
    phone: '+39 3665685200',
    description: "Gabriele Bonci's pizzeria combines bar, snacks, coffee and pizza in one casual spot — pizzas made with high hydration and long leavening, quality products and authentic flavor for any time of day.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, area before check-in', openingHours: '6:00 - 23:00' })],
  }),
  caffe_napoli_t3: restaurant({
    name: 'Caffè Napoli',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '+39 0665012291',
    description: 'Caffè Napoli Exytus, with its contemporary design, combines the uniqueness of Neapolitan espresso with a selection of traditional gastronomic products — coffee shop, bar, snack and tobacco services in one stylish stop.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, area before check-in', openingHours: '0:00 - 24:00', open247: true })],
  }),
  caffe_vergnano_women_in_coffee: restaurant({
    name: 'Caffè Vergnano - Women in Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.caffevergnano.com',
    logoUrl: logo('caffevergnano.com'),
    description: 'Caffè Vergnano – Women in Coffee celebrates coffee excellence through a selection of premium blends and a concrete commitment to supporting women in coffee-producing communities — an authentic taste experience combining quality, tradition and social responsibility.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, area before check-in', openingHours: '3:00 - 23:00' })],
  }),
  mignon: restaurant({
    name: 'Mignon',
    cuisine: 'Bakery, Pastry, Café',
    amenity: 'bakery',
    description: 'Born from the experience of an ancient Neapolitan pastry family, renowned and certified for quality and responsibility — recipes stay true to tradition while masters and technicians adapt them daily to contemporary tastes, across bar, snack, coffee-shop and pastry-shop service.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, arrivals, passenger waiting area', openingHours: '' })],
  }),
  semplicemente_roma: restaurant({
    name: 'Semplicemente Roma',
    cuisine: 'Italian, Pizza, Café',
    amenity: 'food_court',
    glutenFree: true,
    phone: '+39 3346274294',
    description: 'Semplicemente Roma welcomes visitors with a bar, snacks and coffee shop, plus a pizzeria and buffet serving typical, healthy recipes with gluten-free options — a tasty, inclusive experience.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, arrivals, baggage claim', openingHours: '0:00 - 24:00', open247: true })],
  }),
  tentazioni_cafe: restaurant({
    name: 'Tentazioni Café',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '348 0918172',
    description: 'Tentazioni Caffè is a corner of flavor at Fiumicino: artisanal breakfasts, light lunches and signature sweets for a refined pause before the flight.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, area before check-in', openingHours: '5:00 - 21:00' })],
  }),

  // — airside, Boarding E pier (reached after security from Terminal 3) —
  amore: restaurant({
    name: 'Amore',
    cuisine: 'Italian',
    amenity: 'restaurant',
    phone: '+39 06 65010410',
    description: "AMORE Do Eat Better embodies the excellence of Italian cuisine, celebrating a deep connection to the land through food and design — a gastronomic offer built from excellent raw ingredients that expresses the country's varied regional traditions.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, common area', openingHours: '5:00 - 23:00' })],
  }),
  beercode: restaurant({
    name: 'Beercode',
    cuisine: 'Steakhouse, International, Bar',
    amenity: 'restaurant',
    vegetarian: true,
    glutenFree: true,
    phone: '+39 800606666',
    description: 'An international bar-restaurant, brewery and steakhouse where beer is the star, offering snacks, grilled dishes, burgers, sandwiches, salads and coffee-shop service, with options for every diet.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, common area', openingHours: '5:00 - 22:00' })],
  }),
  caffe_kimbo_boarding_e: restaurant({
    name: 'Caffè Kimbo',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    glutenFree: true,
    vegetarian: true,
    phone: '+39 06659556099',
    description: 'Caffè Kimbo Espresso da Napoli blends Neapolitan tradition and flavor with a modern, international style, offering a coffee-shop and snack-bar experience with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, common area', openingHours: '0:00 - 24:00', open247: true })],
  }),
  caffe_vergnano_boarding_e: restaurant({
    name: 'Caffè Vergnano',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.caffevergnano.com',
    logoUrl: logo('caffevergnano.com'),
    description: 'Caffè Vergnano offers the finest Italian espresso recipes alongside a menu of sandwiches, tramezzini, pizza and cold dishes, prepared with high-quality Italian ingredients in the café, bar and snack area.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, E11-24', openingHours: '04:00 - 24:00' })],
  }),
  costa_caffe: restaurant({
    name: 'Costa Caffè',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    glutenFree: true,
    website: 'https://www.costacoffee.com',
    logoUrl: logo('costacoffee.com'),
    description: 'Founded in 1971, Costa Coffee is the largest coffee chain in the UK, offering a wide range of hot and cold drinks — espresso, cappuccino, tea, frappés and plant-based options — in a cozy setting, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, E31-44', openingHours: '06:00 - 23:00' })],
  }),
  costa_coffee: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.costacoffee.com',
    logoUrl: logo('costacoffee.com'),
    description: 'Founded in 1971, Costa Coffee is the largest coffee chain in the UK, offering a wide range of hot and cold drinks — espresso, cappuccino, tea, frappés and plant-based options — in a cozy setting perfect for any break.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, common area', openingHours: '05:00 - 23:00' })],
  }),
  farinella_boarding_e: restaurant({
    name: 'Farinella',
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    glutenFree: true,
    phone: '+39 800606666',
    description: 'A typical Neapolitan restaurant with a warm, welcoming family atmosphere, specializing in pizza and traditional Italian dishes for an authentic, genuine experience, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, common area', openingHours: '03:00 - 22:00' })],
  }),
  illy_boarding_e: restaurant({
    name: 'Illy',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    glutenFree: true,
    website: 'https://www.illy.com',
    logoUrl: logo('illy.com'),
    description: 'illy Caffè brings authentic Italian espresso to the world in a contemporary setting — bar, snack and café spaces also offering typical Italian dishes and the full range of illy-branded products, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, E11-24', openingHours: '7:00 - 23:00' })],
  }),
  motta: restaurant({
    name: 'Motta',
    cuisine: 'Bar, Café',
    amenity: 'cafe',
    glutenFree: true,
    description: 'Il Bar Italiano is a bar, snack, coffee-shop and tobacconist concept with a refreshed design that fuses classic and contemporary elements in an elegant setting — tradition and innovation meeting in selected recipes and ingredients, with gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, E31-44', openingHours: '6:30 - 23:00' })],
  }),
  passaggio_roma: restaurant({
    name: 'Passaggio Roma',
    cuisine: 'Bar, Café, Snacks',
    amenity: 'cafe',
    glutenFree: true,
    phone: '+39 0665958415',
    description: 'The ideal spot for a tasty break during the journey, with a broad offer of snacks, bar and coffee-shop service to suit every moment of the day, including gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, E31-44', openingHours: '6:30 - 14:30' })],
  }),
  spizzico: restaurant({
    name: 'Spizzico',
    cuisine: 'Pizza',
    amenity: 'fast_food',
    description: 'Pizza by the slice made with DOP and IGP ingredients and regionally inspired recipes, paired with an exclusive beer selection in a trendy-design setting — simply "Very Good".',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, E31-44', openingHours: '6:30 - 23:00' })],
  }),
  venchi_boarding_e: restaurant({
    name: 'Venchi',
    cuisine: 'Chocolate, Gelato',
    amenity: 'cafe',
    glutenFree: true,
    website: 'https://www.venchi.com',
    logoUrl: logo('venchi.com'),
    phone: '+39 0665017391',
    description: "At Venchi, chocolate is a passion to savor — from pralines to gelato crêpes, chocolate bars to gourmet treats — all made without preservatives and with delicious gluten-free options.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Boarding E, common area', openingHours: '6:30 - 22:00' })],
  }),

  // — brand present in both zones, combined into one doc with 2 outlets —
  panella: restaurant({
    name: 'Panella',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    glutenFree: true,
    phone: '+39 3665696634',
    description: 'A bakery brand born from a traditional Roman bread shop, now grown into a broader Coffee & Bakery Artigianale project — a bar offering coffee-shop service, snacks and fresh, quality baked goods.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Terminal 3, arrivals', openingHours: '5:30 - 20:30' }),
      outlet({ airside: 'airside', locationNotes: 'Boarding E, E51-61', openingHours: '4:00 - 19:00' }),
    ],
  }),
};

// ─── Other areas: brands with no published terminal/pier badge ──────────────

const otherAreaVenues = {
  ajisen_ramen: restaurant({
    name: 'Ajisen Ramen',
    cuisine: 'Asian, Ramen, Sushi',
    amenity: 'restaurant',
    vegetarian: true,
    glutenFree: true,
    website: 'https://www.ajisen.com',
    logoUrl: logo('ajisen.com'),
    phone: '+39 800606666',
    description: 'An Asian restaurant serving the most popular oriental recipes, including rice-based Thai dishes, sushi and sashimi, alongside its house specialty, ramen.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Food court — site publishes no terminal/pier badge for this outlet', openingHours: '09:00 - 22:00' })],
  }),
  chef_market: restaurant({
    name: 'Chef Market',
    cuisine: 'Italian, Café',
    amenity: 'food_court',
    description: 'An innovative concept featuring regional Italian cuisine corners alongside a bar offering breakfast, quick snacks and coffee-shop service.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Food court — site publishes no terminal/pier badge for this outlet', openingHours: '06:00 - 22:00' })],
  }),
  ferrari_spazio_bollicine: restaurant({
    name: 'Ferrari Spazio Bollicine',
    cuisine: 'Wine Bar, Italian',
    amenity: 'bar',
    phone: '',
    description: "A premium hospitality concept for international travelers combining Trentino mountain sparkling wines with excellent Italian cuisine — contemporary elegance, iconic design and references to the Ferrari brand turn travel into a tale of Italian style.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Food court — site publishes no terminal/pier badge for this outlet', openingHours: '07:00 - 23:00' })],
  }),
  natoo: restaurant({
    name: 'Natoo',
    cuisine: 'Healthy, Café',
    amenity: 'cafe',
    vegetarian: true,
    glutenFree: true,
    phone: '+39 800606666',
    description: 'Natoo is energy, color and wellbeing: every recipe is designed for a fresh, tasty experience with genuine, quality ingredients — healthy food, bar snacks and coffee-shop service for a balanced break or a tasty take-away, with gluten-free options.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Departures, area before check-in — site publishes no terminal/pier badge for this outlet', openingHours: '03:00 - 21:30' })],
  }),
  pick: restaurant({
    name: 'Pick',
    cuisine: 'Fast Casual, Grab & Go',
    amenity: 'fast_food',
    description: 'A cosmopolitan fast-casual dining format offering fresh, high-quality grab-and-go products.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals — site publishes no terminal/pier badge for this outlet', openingHours: '6:00 - 15:00' })],
  }),
};

// ─── upload: detect airport slug, unconditionally wipe each terminal's ──────
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

  const t1Result = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', t1Venues);
  const t3Result = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues);
  const otherResult = await processTerminal(AIRPORT, OTHER_AREAS, 'Other areas (no published terminal/pier)', otherAreaVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_3, OTHER_AREAS]));

  const totalCreated = t1Result.created + t3Result.created + otherResult.created;
  const totalDeleted = t1Result.deleted + t3Result.deleted + otherResult.deleted;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t3Venues).length + Object.keys(otherAreaVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
