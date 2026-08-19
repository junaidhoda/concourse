'use strict';
/**
 * Fills in complete data for all Jorge Chávez International Airport (Lima,
 * Peru — IATA: LIM) restaurants/bars/cafés in Firestore, based on research
 * conducted on 2026-08-15.
 *
 * Primary source: lima-airport.com's own passenger establishments directory
 * (lima-airport.com/en/pasajeros/establecimientos/restaurantes), which lists
 * 35 individually-paged food & beverage listings (28 distinct brands, several
 * with more than one physical outlet) each tagged with one of 9 named zones:
 * Marketplace Nacional, Marketplace Internacional, Perú Plaza, Zona
 * Internacional, Zona Pública, Zona Llegadas, Zona Check-In, Dique Swing and
 * Exteriores Primer Piso. Cross-checked against press coverage for terminal-
 * structure and level context: peru-retail.com's breakdown of the terminal's
 * 5 levels, the U.S. Embassy Lima's June-2025 opening notice, and multiple
 * 2026 gastronomy round-ups (gestion.pe "un año del nuevo terminal", peru-
 * retail.com's May-2026 "restaurantes activos" piece, elcomercio.pe, cosas.pe,
 * infobae.com).
 *
 * TERMINAL STRUCTURE: Jorge Chávez opened an entirely new single passenger
 * terminal on June 1, 2025 (after a "Marcha Blanca" trial period from May
 * 15-31, 2025), replacing the old terminal for all commercial passenger
 * operations — the old terminal is being repurposed (medical center,
 * offices, private aviation) and is NOT used for passenger flights, so it is
 * excluded entirely from this script, the same treatment given to a closed/
 * decommissioned terminal at other airports in this dataset (e.g. Lagos
 * MMIA Terminal 1, Rome FCO's old Terminal 2).
 *
 * The new terminal is a single ~270,000 m² building (5 levels including a
 * basement) that handles BOTH domestic and international flights through
 * ONE shared, unified check-in hall (120 counters, Level 3) and ONE shared
 * security-screening area (27 screening lanes, also Level 3) — domestic and
 * international only diverge into separate gate groups (Gates A domestic,
 * Gates B/D international via bus transfer, Gates C mixed) AFTER that shared
 * checkpoint. Per this dataset's standing "own check-in AND own security"
 * test for whether domestic/international sides get separate terminal
 * buckets, Jorge Chávez fails that test (unlike e.g. O.R. Tambo's Terminal
 * A/B or Melbourne's T1-T4, which each have their OWN check-in and security)
 * — so this script models the entire airport as ONE terminal bucket, the
 * same treatment given to Wellington International's single unified
 * terminal.
 *
 * ZONE / LEVEL ATTRIBUTION CAVEAT: the official directory tags every venue
 * with a named zone (e.g. "Marketplace Nacional") but does NOT itself state
 * whether that zone sits before or after the security checkpoint, or which
 * of the terminal's 5 levels it's on. The landside/airside and level detail
 * in each outlet's location_notes below is inferred by cross-referencing
 * peru-retail.com's level-by-level breakdown (Level 1 = arrivals, landside;
 * Level 2 = post-security concourse, airside — including "Perú Plaza"
 * explicitly named there; Level 3 = check-in and security, landside) against
 * each zone's name and description in press coverage. This inference is
 * flagged here in case a specific zone's before/after-security status needs
 * correction later:
 *   - Zona Check-In, Zona Pública, Zona Llegadas, Exteriores Primer Piso ->
 *     landside (each zone name itself states or clearly implies this)
 *   - Marketplace Nacional, Marketplace Internacional, Perú Plaza, Zona
 *     Internacional, Dique Swing -> airside (post the shared Level 3
 *     security checkpoint; Zona Internacional and Dique Swing sit further
 *     along, near the international/swing gate piers)
 *
 * MULTI-OUTLET BRANDS (combined into one doc with multiple `outlets[]`
 * entries, each outlet backed by its own detail page on the official
 * directory):
 *   - Dunkin Donuts: Marketplace Nacional + Zona Pública
 *   - Las Reyes: Marketplace Internacional ("Las Reyes") + Dique Swing
 *     ("Las Reyes Swing" — same operator/website, confirmed by the source)
 *   - McDonald's: Marketplace Nacional + Exteriores Primer Piso
 *   - Starbucks: Marketplace Internacional + Marketplace Nacional + Perú
 *     Plaza + Exteriores Primer Piso (4 outlets)
 * "Tanta" and "Tanta To Go" are kept as two SEPARATE docs rather than
 * combined — the directory lists them as two distinctly named/branded
 * listings (a sit-down restaurant vs. an express grab-and-go kiosk format),
 * consistent with this dataset's convention of trusting the source's own
 * distinct naming over assuming they're the same outlet.
 *
 * NOT INCLUDED, on purpose:
 *   - Sakai (Nikkei restaurant, chef Mitsuharu "Micha" Tsumura) and Kira
 *     (chef Jaime Pesaque) — both reported by 2026 press as newly opened or
 *     about to open (mid-August and June 15, 2026 respectively), but as of
 *     this research date NEITHER appears yet in the airport's own official
 *     establishment directory (which only lists Tsumura's other airport
 *     concept, Tori, and Pesaque's other airport concept, Callao — both of
 *     which ARE included below). Per this dataset's no-fabrication
 *     principle, a venue reported only in secondary press and not yet
 *     confirmed on the airport's own live directory is left out rather than
 *     added on the strength of the press report alone.
 *   - All private/paid VIP lounges (The Club, The Club 2, the Protocolar
 *     lounge, airline lounges) — out of scope as members-only/paid spaces,
 *     not publicly-accessible walk-up F&B, consistent with every other
 *     script in this dataset.
 *   - Non-F&B retail and services that appear alongside F&B brands in press
 *     round-ups but NOT on the directory's own F&B-filtered page: Oxxo,
 *     duty-free shops, currency exchange (World/Global Exchange), jewelry/
 *     accessories retail (Ilaria, Kuna, Sol Alpaca, Swarovski, Hstern, Hugo
 *     Boss), pharmacy, PeruSIM, Lounge Sleep & Fly, banking/insurance
 *     (Interbank, Assist Card, Safe Bag), Miniso, Coolbox, Renzo Costa,
 *     Rumbo Perú, Travel Market, Retablo.
 *
 * DATA-QUALITY NOTES:
 *   - No phone number is published for any venue except Dunkin Donuts
 *     (982342407, shared across both its outlets) — every other venue's
 *     `phone` is left blank rather than guessed.
 *   - `website`/`logo_url` are filled in only where the directory itself
 *     gives a website, or the brand is an independently-confirmed chain with
 *     a real domain (all of the international/national chains below).
 *     Copper, Sakamoto, Natoo, Wok to Gate, and Listo either have no
 *     publicly listed brand website or only a corporate-parent domain that
 *     wouldn't map to a useful logo, so their `website`/`logo_url` are left
 *     blank rather than guessed. Note the directory itself links Callao's
 *     website to callao.nl — chef Jaime Pesaque's original Callao Cevicheria
 *     location in The Hague, Netherlands, kept here exactly as published
 *     since it's the airport's own listed link for the brand.
 *   - Opening hours are taken verbatim from each venue's own detail page;
 *     most venues publish "00:00 to 23:59" (i.e. 24 hours, open_24_7: true).
 *     A handful publish real bounded hours (Las Reyes' Marketplace
 *     Internacional outlet 06:30-22:30, Puku Puku 06:00-21:00, TGI Fridays'
 *     two outlets 00:00-22:00 and 04:00-23:59) and are recorded as such.
 *   - Dietary flags are left blank/false throughout except Natoo, whose own
 *     directory description explicitly states its salads/juices/smoothies
 *     are "tailored for vegan and vegetarian preferences."
 *
 * Lima/Jorge Chávez appears in NEITHER reference script (migrate_firestore.
 * js's AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'lima' first, then 'lim', using whichever has existing terminal
 * data). It never creates a new `airports/{id}` metadata doc itself.
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
 * airport whose id isn't THIS script's terminal id (TERMINAL_1) gets its
 * restaurants subcollection and then the terminal doc itself deleted, so a
 * stale/orphaned terminal bucket (e.g. from an earlier wrongly-modelled
 * domestic/international split) doesn't keep inflating the terminal count
 * the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_lim_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['lima', 'lim'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';

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

// ─── Terminal 1 venues (the whole airport — single shared terminal) ─────────

const terminal1Venues = {
  bodegon: restaurant({
    name: 'El Bodegón',
    cuisine: 'Peruvian, Creole, Bar',
    amenity: 'restaurant',
    website: 'https://www.elbodegon.com.pe/',
    logoUrl: logo('elbodegon.com.pe'),
    description: 'A traditional Lima tavern (bodegón) serving varied Peruvian cuisine and cocktails, part of Gastón Acurio\'s Acurio Restaurantes group.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  burger_boy: restaurant({
    name: 'Burger Boy',
    cuisine: 'Burgers',
    amenity: 'fast_food',
    website: 'https://www.burgerboy.pe/',
    logoUrl: logo('burgerboy.pe'),
    description: 'Fresh-ingredient hamburgers, signature crispy fries and unique beverages, by chef Javier Miyasato.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true })],
  }),
  callao: restaurant({
    name: 'Callao',
    cuisine: 'Peruvian, Ceviche, Fine Dining',
    amenity: 'restaurant',
    website: 'https://www.callao.nl/',
    logoUrl: logo('callao.nl'),
    description: 'Modern Peruvian gastronomy blending contemporary technique with local ingredients and spices, by chef Jaime Pesaque.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true })],
  }),
  chinawok: restaurant({
    name: 'Chinawok',
    cuisine: 'Chinese, Peruvian-Chinese (Chifa), Fast Food',
    amenity: 'fast_food',
    website: 'https://www.chinawok.com.pe/',
    logoUrl: logo('chinawok.com.pe'),
    description: 'Fast-food chifa (Peruvian-Chinese) chain serving chaufa rice, wantan soup and other Asian dishes.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  copper: restaurant({
    name: 'Copper',
    cuisine: 'Bar, Cocktails, Pisco',
    amenity: 'bar',
    description: 'A signature mixology bar inspired by the copper stills used in distilling pisco, serving international gastronomic creations with Peruvian touches; led by chef Coque Ossio.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true })],
  }),
  delicass: restaurant({
    name: 'Delicass',
    cuisine: 'Café, Bakery, Peruvian',
    amenity: 'cafe',
    website: 'https://delicass.com.pe/',
    logoUrl: logo('delicass.com.pe'),
    description: 'A restaurant-cafeteria serving breakfasts, desserts and a variety of Peruvian dishes.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Perú Plaza (post-security concourse)', open247: true })],
  }),
  dunkin_donuts: restaurant({
    name: 'Dunkin\' Donuts',
    cuisine: 'Donuts, Coffee, Café',
    amenity: 'cafe',
    website: 'https://www.dunkin.pe/',
    logoUrl: logo('dunkin.pe'),
    phone: '982342407',
    description: 'Donuts and munchkins in a variety of flavors, plus sandwiches and hot and cold drinks.',
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true }),
      outlet({ airside: 'landside', locationNotes: 'Zona Pública (public landside area)', open247: true }),
    ],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com.pe',
    logoUrl: logo('kfc.com.pe'),
    description: 'International fast-food chain known for fried chicken, nuggets, hot wings and chicken packs.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  ko: restaurant({
    name: 'KO Asian Kitchen',
    cuisine: 'Asian',
    amenity: 'restaurant',
    website: 'https://koasiankitchen.com/lima/',
    logoUrl: logo('koasiankitchen.com'),
    description: 'Fresh, authentic ingredients celebrating the traditions and flavors of Asia.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true })],
  }),
  la_bonbonniere: restaurant({
    name: 'La Bonbonnière',
    cuisine: 'French, Bakery, Café',
    amenity: 'cafe',
    website: 'https://www.labonbonniere.pe/',
    logoUrl: logo('labonbonniere.pe'),
    description: 'French Provençal-style café and patisserie, part of a Lima dining group with roots dating to 1953; led by chef Coque Ossio.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true })],
  }),
  la_lucha: restaurant({
    name: 'La Lucha Sanguchería',
    cuisine: 'Peruvian, Sandwiches',
    amenity: 'fast_food',
    website: 'https://lalucha.com.pe/',
    logoUrl: logo('lalucha.com.pe'),
    description: 'Peruvian sandwich (sanguche) shop, serving classic sanguches with huayro-potato fries alongside hot and cold drinks.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true })],
  }),
  las_reyes: restaurant({
    name: 'Las Reyes by Isolina',
    cuisine: 'Peruvian, Creole',
    amenity: 'restaurant',
    website: 'https://lasreyes.pe/',
    logoUrl: logo('lasreyes.pe'),
    description: 'Classic Lima criollo dishes — ceviche, ají de gallina, lomo saltado — by chef José del Castillo, in generous traditional portions. One of two outlets in the terminal (the other, "Las Reyes Swing", is at the Dique Swing pier).',
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', openingHours: '06:30–22:30' }),
      outlet({ airside: 'airside', locationNotes: 'Dique Swing (branded "Las Reyes Swing", at the swing-gate pier)', open247: true }),
    ],
  }),
  listo: restaurant({
    name: 'Listo',
    cuisine: 'Café, Sandwiches, Express',
    amenity: 'cafe',
    description: 'Express cafeteria with sandwiches, empanadas and drinks, plus a varied breakfast/lunch/dinner menu; run by Primax.',
    outlets: [outlet({ airside: 'landside', level: 'Level 1', locationNotes: 'Zona Llegadas (arrivals hall)', open247: true })],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com.pe',
    logoUrl: logo('mcdonalds.com.pe'),
    description: 'Hamburgers, fries, breakfast, hot and cold drinks and ice cream from the global fast-food chain.',
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true }),
      outlet({ airside: 'landside', level: 'Level 1', locationNotes: 'Exteriores Primer Piso (ground-floor exterior/curbside)', open247: true }),
    ],
  }),
  natoo: restaurant({
    name: 'Natoo',
    cuisine: 'Healthy, Salads, Juices, Smoothies',
    amenity: 'restaurant',
    website: 'https://www.lagardere-tr.com/en/brands/natoo',
    vegetarian: true,
    vegan: true,
    description: 'Fresh, customizable salads with juices and smoothies, tailored for vegan and vegetarian preferences; a Lagardère Travel Retail concept.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Zona Internacional (near international gates, post-security/immigration)', open247: true })],
  }),
  pan_sal_aire: restaurant({
    name: 'Pan Sal Aire',
    cuisine: 'Bakery, Mediterranean, Pizza',
    amenity: 'bakery',
    website: 'https://pansalaire.pe/',
    logoUrl: logo('pansalaire.pe'),
    description: 'Mediterranean-inspired gourmet comfort food — freshly baked and frozen breads, breakfast/brunch, homemade pasta, pizzas, sandwiches and desserts; by chef Jerónimo de Aliaga.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  papachos: restaurant({
    name: "Papacho's",
    cuisine: 'Burgers, Peruvian',
    amenity: 'restaurant',
    website: 'https://papachos.com/',
    logoUrl: logo('papachos.com'),
    description: 'Gourmet artisanal-style burgers with Peruvian flavor, by Gastón Acurio\'s Acurio Restaurantes group.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  pardos_chicken: restaurant({
    name: 'Pardos Chicken',
    cuisine: 'Peruvian, Grilled Chicken',
    amenity: 'restaurant',
    website: 'https://www.pardoschicken.pe/',
    logoUrl: logo('pardoschicken.pe'),
    description: 'Peruvian rotisserie/grilled-chicken chain, also serving grilled dishes, salads, desserts and house specialties.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  perusuyo: restaurant({
    name: 'Perusuyo',
    cuisine: 'Peruvian, Food Hall, Café, Bar',
    amenity: 'food_court',
    website: 'https://perusuyo.pe',
    logoUrl: logo('perusuyo.pe'),
    description: 'A landside Peruvian gastronomy space run by Inversiones FISA, spanning traditional creole dishes and tavern-style sandwiches to Peruvian-Japanese fusion, Peruvian desserts, urban coffee and a bar (internal concepts reported in press coverage include Festejo, El Capitán, Zoila Dulce, Ka-pón and Café Jaguar).',
    outlets: [outlet({ airside: 'landside', level: 'Level 3', locationNotes: 'Zona Check-In (check-in hall, pre-security)', open247: true })],
  }),
  pizza_hut: restaurant({
    name: 'Pizza Hut',
    cuisine: 'Pizza, Italian-American, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.pizzahut.com.pe',
    logoUrl: logo('pizzahut.com.pe'),
    description: 'Thin- and thick-crust pizzas, plus garlic bread and cheese sticks.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  puku_puku: restaurant({
    name: 'Puku Puku',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    website: 'https://pukupuku.pe',
    logoUrl: logo('pukupuku.pe'),
    description: '100% Peruvian micro-lot coffee, harvested by communities from Amazonas to Puno.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', openingHours: '06:00–21:00' })],
  }),
  sakamoto: restaurant({
    name: 'Sakamoto',
    cuisine: 'Nikkei, Peruvian-Japanese',
    amenity: 'restaurant',
    description: 'Peruvian Nikkei concept with a fast, diverse menu.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    website: 'https://www.starbucks.pe',
    logoUrl: logo('starbucks.pe'),
    description: 'International coffeehouse chain, with sandwiches, desserts and hot and cold drinks alongside its coffee menu.',
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true }),
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true }),
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Perú Plaza (post-security concourse)', open247: true }),
      outlet({ airside: 'landside', level: 'Level 1', locationNotes: 'Exteriores Primer Piso (ground-floor exterior/curbside)', open247: true }),
    ],
  }),
  tanta: restaurant({
    name: 'Tanta',
    cuisine: 'Peruvian',
    amenity: 'restaurant',
    website: 'https://tantaperu.com',
    logoUrl: logo('tantaperu.com'),
    description: "A sit-down restaurant transforming Peru's culinary bounty into dishes highlighting authentic Peruvian flavors, by Gastón Acurio's Acurio Restaurantes group.",
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  tanta_to_go: restaurant({
    name: 'Tanta To Go',
    cuisine: 'Peruvian, Express, Café',
    amenity: 'fast_food',
    website: 'https://tantaperu.com',
    logoUrl: logo('tantaperu.com'),
    description: "An express, grab-and-go format of Gastón Acurio's Tanta, distinct from the sit-down Tanta restaurant elsewhere in the same concourse.",
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', open247: true })],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays",
    cuisine: 'American, Bar & Grill',
    amenity: 'restaurant',
    website: 'https://www.fridaysperu.com',
    logoUrl: logo('fridaysperu.com'),
    description: 'American-style dining — burgers, tacos, barbecue, alcoholic beverages and juices.',
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Nacional (domestic departures concourse, post-security)', openingHours: '00:00–22:00' }),
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', openingHours: '04:00–23:59' }),
    ],
  }),
  tori: restaurant({
    name: 'Tori Pollería',
    cuisine: 'Peruvian, Grilled Chicken',
    amenity: 'restaurant',
    website: 'https://www.tori.pe/',
    logoUrl: logo('tori.pe'),
    description: 'Flavorful Peruvian grilled chicken served with fries, chaufa rice and fresh salads, with signature "MT" sauces; by chef Mitsuharu "Micha" Tsumura.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Marketplace Internacional (international departures concourse, post-security)', open247: true })],
  }),
  wok_to_gate: restaurant({
    name: 'Wok to Gate',
    cuisine: 'Chinese, Peruvian-Chinese (Chifa)',
    amenity: 'fast_food',
    description: 'Peruvian-Chinese fusion — chaufa rice, tallarines saltados, wantan soup and min pao.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Zona Internacional (near international gates, post-security/immigration)', open247: true })],
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

  const result = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal Jorge Chávez', terminal1Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1]));

  const totalVenues = Object.keys(terminal1Venues).length;

  console.log(`\nDone. Wiped ${result.deleted} old venue doc(s), created ${result.created} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${result.created}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
