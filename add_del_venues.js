'use strict';
/**
 * Fills in complete data for Indira Gandhi International Airport (DEL),
 * New Delhi, restaurants/bars/cafés/dessert shops in Firestore. Researched
 * 2026-08-16 from the official site, www.newdelhiairport.in (Delhi
 * International Airport Limited / DIAL, GMR Group), Eat & Dine section
 * (https://www.newdelhiairport.in/eat-and-dine/).
 *
 * SITE IDENTIFICATION CAVEAT: the domain that used to be DEL's official
 * site, delhiairport.com, no longer resolves at all (DNS_PROBE_FINISHED_
 * NXDOMAIN as of this research pass) — it has been superseded by
 * www.newdelhiairport.in, confirmed as the current official DIAL site by
 * its own header ("Delhi Airport (DEL) Official Web") and by cross-
 * checking GMR Group's own corporate site. All venue data below was taken
 * from newdelhiairport.in only; delhiairport.com was not used as a source
 * for any venue data (it was dead at research time).
 *
 * TERMINAL STRUCTURE: DEL currently has three genuinely separate terminal
 * buckets under this dataset's "own check-in AND own security" test —
 * Terminal 1, Terminal 2, and Terminal 3 all have their own check-in
 * halls and their own security/immigration screening (confirmed via the
 * site's own live per-terminal wait-time tracker, which reports Terminal
 * Entry / Check-in Counter / Domestic Security / Departure Immigration /
 * International Security independently for each of the three terminals).
 * As of this research pass: Terminal 1 handles domestic low-cost-carrier
 * traffic; Terminal 2 handles Air India-group domestic traffic; Terminal
 * 3 handles all international traffic plus a large share of domestic
 * traffic from full-service carriers. (News coverage from earlier in 2026
 * describes a temporary ~4-6 month Terminal 2 renovation closure with an
 * October 2025 reopening date for an earlier such closure — by this
 * research pass Terminal 2 is live and serving traffic per the site's own
 * wait-time tracker, so it is modelled as a normal active terminal
 * bucket, the same as Terminal 1 and Terminal 3.)
 *
 * SOURCES & METHODOLOGY: unlike every prior airport in this dataset, the
 * Eat & Dine page is backed by a genuine JSON API rather than only
 * server-rendered/JS-hydrated DOM cards:
 *   GET /dial-api/shop/shops?classificationId=2&terminalId=&categoryId=
 *       &filterTerminal=&searchShop=&filterMenu=&limit=500
 * (classificationId=2 selects the Food & Beverage classification, as
 * opposed to retail/shopping listings under a different id). This was
 * discovered via the page's own network requests (not guessed) and
 * called directly to get complete, structured data instead of scraping
 * rendered cards — every field below (name, category, location, food
 * type, phone, description) came from this endpoint's JSON, not from
 * DOM text. It returned 57 total F&B shop records for the whole airport
 * in one call, with NO pagination needed.
 *
 * Each shop record carries a `Locations[]` array, and each entry's
 * `Terminal.terminal_name` is the site's own authoritative structural
 * field for where that specific outlet is — e.g. "T3 International SHA",
 * "T1 Domestic Departure,Gate No 11", "T2 Arrivals". This is what
 * determined both the terminal bucket AND the airside/landside value for
 * every outlet below (not inference, not a secondary source). The
 * AIRSIDE/LANDSIDE rule applied: "SHA" (Security Hold Area — confirmed
 * via aviation-glossary cross-check as the controlled area between the
 * screening checkpoint and the boarding gate, i.e. airside), a specific
 * "Gate No N", "Level 1, Gates", "Bus Gates" (remote-stand boarding,
 * reached only after security), or "Piers" (T3's domestic boarding
 * concourse) all mean AIRSIDE; every other terminal_name (plain
 * "Arrivals", "Departures", "Domestic Departure", "Food Court" without a
 * Gate/SHA/Piers qualifier, "ACB", "M&G") means LANDSIDE.
 *
 * Three `Locations` entries across the 57 shops named a place that is
 * not actually inside any of the three terminal buildings — "Aerocity
 * Metro SHA" and "Airport Metro Building" (the city-side check-in /
 * metro-station facility at Aerocity, a separate structure from T1/T2/T3)
 * — these individual outlet entries were dropped (the rest of that
 * brand's real terminal outlets, where it has any, are still included).
 * One entire shop record, "Round D Clock", was excluded altogether: its
 * only `Locations` entry is a full street-address string ("Round D
 * Clock, IGI Airport T3 Road, near Indira Gandhi International Airport,
 * New Delhi"), it carries no Categories at all, and its own site
 * description confirms it is "Encalm Hospitality's 24x7 passenger
 * convenience center" — a landside hospitality lounge outside the
 * terminal buildings, not a terminal-scoped F&B outlet, so it has no
 * place in this airport>terminals>restaurants data model.
 *
 * NO FABRICATION: name (`shop_name`), cuisine category (`Categories[].
 * category_name`), and description (`shop_content`, trimmed and stripped
 * of HTML) are all taken directly from the API. `phone` is taken from
 * `shop_mobile` EXCEPT where its value is the literal placeholder
 * "9999999999" (used site-wide as a default/unset value — treated as no
 * phone published, not fabricated as a real number) or empty. The API
 * exposes no opening-hours field of any kind for this airport (unlike
 * HKG/CAN/ICN's sites) — `opening_hours` is left blank throughout rather
 * than guessed. `vegetarian_options` is set to "yes" when the API's own
 * `foodtype` field is "Veg" (pure vegetarian) or "Both"/"both" (serves
 * vegetarian alongside non-vegetarian) — both explicitly indicate
 * vegetarian items are on the menu; left blank when `foodtype` is null
 * (unpublished). No `halal`/`vegan`/`kosher` field exists on the site, so
 * those are left blank throughout. `logo_url` is populated only for
 * globally-recognized chains with an unambiguous official domain (KFC,
 * Domino's, McDonald's, Pizza Hut, Starbucks, Subway, Burger King, Krispy
 * Kreme, Tim Hortons, Costa Coffee, Nescafe, Heineken, Chaayos,
 * Theobroma); left blank for India-only/local concepts rather than
 * guessed. `cuisine` is a short, non-fabricated description based on
 * each brand's well-known public concept (for recognizable chains) or
 * the API's own category tag (for local/regional concepts) — not
 * scraped free text.
 *
 * MULTI-OUTLET CONVENTION: same-brand venues within the SAME terminal
 * bucket are combined into one doc with multiple `outlets[]` entries
 * (e.g. "Starbucks" has 4 outlets within Terminal 1 alone). The same
 * brand appearing in a DIFFERENT terminal is a separate doc — e.g.
 * "KFC" exists as three independent single/multi-outlet docs, one each
 * in terminal_1, terminal_2, and terminal_3; "Costa Coffee", "Subway",
 * "McDonald's", "Cafe Espresso", "Gujrati Svado", "Chaayos", "Dosa
 * factory & Noodle", "Dominos", "Cafeccino", "Caffe Tonino", "Papparoti",
 * "Nescafe", "Carnatic Café", and "Tim Hortons" each work the same way
 * across two terminals — never merged across a terminal boundary.
 *
 * This resolves to 76 terminal-scoped venue docs (13 in Terminal 1, 18 in
 * Terminal 2, 45 in Terminal 3) holding 133 total outlets (24 in Terminal
 * 1, 26 in Terminal 2, 83 in Terminal 3).
 *
 * DEL does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'del' first, then 'delhi', using whichever has existing
 * terminal data). It never creates a new `airports/{id}` metadata doc
 * itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For
 * each terminal grouping below, it first deletes EVERY existing restaurant
 * doc in that terminal's `restaurants` subcollection — unconditionally,
 * regardless of whether its name matches anything in this run — and only
 * then creates every venue defined here as a brand-new doc. There is no
 * update-in-place step and no name-matching against what's already there;
 * nothing from a previous run survives. Run this only when the venue list
 * below is meant to be the complete, authoritative set for all three
 * terminal buckets.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under
 * this airport whose id isn't one of THIS script's terminal ids
 * (terminal_1, terminal_2, terminal_3) gets its restaurants subcollection
 * and then the terminal doc itself deleted, so a stale/orphaned terminal
 * bucket doesn't keep inflating the terminal count the app shows for this
 * airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_del_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['del', 'delhi'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';

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

// Shorthand: o(level, locationNotes, airside)  (DEL's API publishes no hours)
const o = (level, notes, airside) =>
  outlet({ airside, level, locationNotes: notes, openingHours: '', open247: false });

// ─── Terminal 1 venues ────────────────────────────────────────────────────

const terminal1Venues = {
  dominos_t1: restaurant({
    name: 'Dominos', cuisine: 'Pizza', amenity: 'restaurant',
    website: 'dominos.co.in', logoUrl: logo('dominos.co.in'),
    description: "A recognised world leader in pizza operations, Domino's is a Michigan-based international restaurant chain.",
    phone: '9220402064',
    outlets: [
      o('', 'Departure Food Court, Terminal 1', 'landside'),
      o('5', 'Domestic Departure Food Court, Level 5, Terminal 1', 'landside'),
    ],
  }),
  kfc_t1: restaurant({
    name: 'KFC', cuisine: 'Fried Chicken (Fast Food)', amenity: 'restaurant',
    website: 'kfc.co.in', logoUrl: logo('kfc.co.in'),
    description: 'A treat for chicken lovers, KFC is one of the most popular restaurant chains in the world.',
    phone: '9220402063',
    outlets: [o('', 'Departure Food Court, Terminal 1', 'landside')],
  }),
  starbucks_t1: restaurant({
    name: 'Starbucks', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'starbucks.in', logoUrl: logo('starbucks.in'),
    description: 'Starbucks is the premier roaster and retailer of speciality coffee in the world.',
    outlets: [
      o('', 'Departure Bus Gates, Terminal 1', 'airside'),
      o('', 'Departure Food Court, Terminal 1', 'landside'),
      o('1', 'Domestic Departure Gates, Level 1, Terminal 1', 'airside'),
      o('', 'Domestic Departure Food Court, Terminal 1', 'landside'),
    ],
  }),
  subway_t1: restaurant({
    name: 'Subway', cuisine: 'Sandwiches', amenity: 'restaurant',
    website: 'subway.com', logoUrl: logo('subway.com'),
    description: 'Subway is an American fast-food restaurant franchise well-known for serving sandwiches, wraps, and salads.',
    phone: '9220402064',
    outlets: [
      o('', 'Departure Food Court, Terminal 1', 'landside'),
      o('5', 'Domestic Departure Food Court, Level 5, Terminal 1', 'landside'),
    ],
  }),
  cafeccino_t1: restaurant({
    name: 'Cafeccino', cuisine: 'Coffee Shop', amenity: 'cafe',
    description: 'Cafeccino offers a sophisticated range of coffee and espresso beverages, crafted with high-quality beans.',
    phone: '8655474105',
    outlets: [
      o('', 'Arrivals, Terminal 1', 'landside'),
      o('', 'Domestic Departure, Near Gate 17, Terminal 1', 'airside'),
    ],
  }),
  krispy_kreme_kiosk_t1: restaurant({
    name: 'Krispy Kreme Kiosk', cuisine: 'Doughnuts & Coffee', amenity: 'cafe',
    website: 'krispykreme.com', logoUrl: logo('krispykreme.com'),
    description: 'An American multinational doughnut company and coffeehouse chain.',
    phone: '8655474105',
    outlets: [o('', 'Domestic Departure, Near Gate 11, Terminal 1', 'airside')],
  }),
  flying_bites: restaurant({
    name: 'Flying Bites', cuisine: 'Quick Service Restaurants & Grab N Go', amenity: 'restaurant',
    description: "Flying Bites is a traveller's go-to for quick, tasty meals like rolls and samosas.",
    phone: '8655474096',
    outlets: [o('', 'Domestic Departure, Near Gate 20, Terminal 1', 'airside')],
  }),
  caffe_tonino_t1: restaurant({
    name: 'Caffe Tonino', cuisine: 'Italian / Pizza', amenity: 'restaurant',
    description: 'Inspired by Tonino Generale, the award-winning pizza maker from Napoli, Caffe Tonino is the labour of love.',
    phone: '9266991139',
    outlets: [
      o('', 'Departure Food Court, Terminal 1', 'landside'),
      o('', 'Domestic Departure, Near Gate 5, Terminal 1', 'airside'),
      o('', 'Domestic Departure Food Court, Terminal 1', 'landside'),
    ],
  }),
  papparoti_t1: restaurant({
    name: 'Papparoti', cuisine: 'Bakery (Buns)', amenity: 'cafe',
    description: 'Papparoti specialises in serving freshly baked buns, crispy on the outside and soft and fluffy on the inside.',
    phone: '8851259013',
    outlets: [o('', 'Domestic Departure Food Court, Terminal 1', 'landside')],
  }),
  nescafe_t1: restaurant({
    name: 'Nescafe', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'nescafe.com', logoUrl: logo('nescafe.com'),
    description: 'NESCAFE is a one-stop solution, providing quick, tasty and hygienic food and beverages to consumers.',
    outlets: [o('', 'Arrivals, Terminal 1', 'landside')],
  }),
  carnatic_cafe_t1: restaurant({
    name: 'Carnatic Café', cuisine: 'South Indian', amenity: 'cafe',
    description: 'A go-to destination for South Indian cuisine lovers, Carnatic Cafe is a vibrant culinary haven.',
    outlets: [
      o('', 'Departure Food Court, Terminal 1', 'landside'),
      o('5', 'Domestic Departure Food Court, Level 5, Terminal 1', 'landside'),
    ],
  }),
  tim_hortons_t1: restaurant({
    name: 'Tim Hortons', cuisine: 'Coffee & Baked Goods', amenity: 'cafe',
    website: 'timhortons.com', logoUrl: logo('timhortons.com'),
    description: 'Tim Hortons is an iconic Canadian brand, founded in 1964, one of the most beloved coffee and bake chains.',
    outlets: [
      o('', 'Departure Security Hold Area, Terminal 1', 'airside'),
      o('', 'Domestic Departure, Near Gate 1, Terminal 1', 'airside'),
    ],
  }),
  mcdonalds_t1: restaurant({
    name: 'McDonalds', cuisine: 'Burgers (Fast Food)', amenity: 'restaurant',
    website: 'mcdonalds.co.in', logoUrl: logo('mcdonalds.co.in'),
    description: "One of the world's leading restaurant chains, McDonald's has been serving happiness for decades.",
    phone: '9560526800',
    outlets: [
      o('', 'Departure Food Court, Terminal 1', 'landside'),
      o('', 'Domestic Departure Food Court, Terminal 1', 'landside'),
    ],
  }),
};

// ─── Terminal 2 venues ────────────────────────────────────────────────────

const terminal2Venues = {
  costa_coffee_t2: restaurant({
    name: 'Costa Coffee', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'costacoffee.com', logoUrl: logo('costacoffee.com'),
    description: 'Costa Coffee is the largest and fastest-growing coffee shop chain in the UK.',
    outlets: [
      o('', 'Domestic Departure, Terminal 2', 'landside'),
      o('', 'Security Hold Area, Terminal 2', 'airside'),
    ],
  }),
  kfc_t2: restaurant({
    name: 'KFC', cuisine: 'Fried Chicken (Fast Food)', amenity: 'restaurant',
    website: 'kfc.co.in', logoUrl: logo('kfc.co.in'),
    description: 'A treat for chicken lovers, KFC is one of the most popular restaurant chains in the world.',
    phone: '9220402063',
    outlets: [o('', 'Domestic Departure, Terminal 2', 'landside')],
  }),
  pizza_hut_express_t2: restaurant({
    name: 'Pizza Hut Express', cuisine: 'Pizza', amenity: 'restaurant',
    website: 'pizzahut.co.in', logoUrl: logo('pizzahut.co.in'),
    description: "Pizza Hut is the world's largest pizza chain, with more than 16,000 outlets worldwide.",
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  subway_t2: restaurant({
    name: 'Subway', cuisine: 'Sandwiches', amenity: 'restaurant',
    website: 'subway.com', logoUrl: logo('subway.com'),
    description: 'Subway is an American fast-food restaurant franchise well-known for serving sandwiches, wraps, and salads.',
    phone: '9220402064',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  tiffin_express: restaurant({
    name: 'Tiffin Express', cuisine: 'South Indian Quick Service', amenity: 'restaurant',
    description: 'Tiffin Express is a smart quick-serve concept of South Indian short bites.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  taste_of_india: restaurant({
    name: 'Taste of India', cuisine: 'Indian Cuisine', amenity: 'restaurant',
    vegetarian: true,
    description: 'Taste of India is a restaurant that offers a delicious and authentic Indian dining experience.',
    outlets: [
      o('', 'Arrivals, Terminal 2', 'landside'),
      o('', 'Departures, Terminal 2', 'landside'),
      o('', 'Domestic Departure, Terminal 2', 'landside'),
      o('', 'Security Hold Area, Terminal 2', 'airside'),
    ],
  }),
  noodle_t2: restaurant({
    name: 'Noodle', cuisine: 'Asian Noodles', amenity: 'restaurant',
    description: 'Noodle is a popular casual dining outlet known for its delicious Asian noodles.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  cafe_espresso_t2: restaurant({
    name: 'Cafe Espresso', cuisine: 'Coffee Shop', amenity: 'cafe',
    vegetarian: true,
    description: 'Cafe Espresso is a quick-serve café offering delicious bites and beverages of choice.',
    outlets: [
      o('', 'Arrivals, Terminal 2', 'landside'),
      o('', 'Departures, Terminal 2', 'landside'),
    ],
  }),
  gujrati_svado_t2: restaurant({
    name: 'Gujrati Svado', cuisine: 'Gujarati (Vegetarian)', amenity: 'restaurant',
    vegetarian: true,
    description: 'Gujarati Svado promises an exquisite Indian cuisine experience crafted with traditional regional delicacies.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  grab_and_fly: restaurant({
    name: 'Grab & Fly', cuisine: 'Quick Service Restaurants & Grab N Go', amenity: 'restaurant',
    description: 'Grab and Fly offers customers a broad range of delicious food and beverage items conveniently priced.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  urban_food_market_t2: restaurant({
    name: 'Urban Food Market', cuisine: 'Food Court', amenity: 'restaurant',
    description: 'Urban Food Market is a trendy and quick service concept with a wide range of options.',
    outlets: [
      o('', 'Arrivals, Terminal 2', 'landside'),
      o('', 'Departures, Terminal 2', 'landside'),
    ],
  }),
  grab_and_go: restaurant({
    name: 'Grab & Go', cuisine: 'Coffee Shop', amenity: 'cafe',
    description: 'Grab and Go is a concept in tandem with Grab and Fly, where speed, efficiency, and taste come first.',
    outlets: [o('', 'Arrivals, Terminal 2', 'landside')],
  }),
  fresh_and_healthy: restaurant({
    name: 'Fresh & Healthy', cuisine: 'Healthy Food', amenity: 'restaurant',
    vegetarian: true,
    description: 'Fresh and Healthy is a popular eatery specialising in serving fresh, nutritious, and delicious meals.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  chaayos_t2: restaurant({
    name: 'Chaayos', cuisine: 'Tea Cafe', amenity: 'cafe',
    website: 'chaayos.com', logoUrl: logo('chaayos.com'),
    description: 'Chaayos is a one-of-its-kind tea cafe that blends service quality with a traditional tea (Chai) range.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  hello_goodbye_bar: restaurant({
    name: 'Hello Goodbye Bar', cuisine: 'Bar', amenity: 'bar',
    description: 'Hello Goodbye Bar provides a relaxing spot within the airport where travellers can chill with a beer or cocktail.',
    outlets: [
      o('', 'Departures, Terminal 2', 'landside'),
      o('', 'Domestic Departure, Terminal 2', 'landside'),
    ],
  }),
  dosa_factory_and_noodle_t2: restaurant({
    name: 'Dosa factory & Noodle', cuisine: 'South Indian & Chinese', amenity: 'restaurant',
    vegetarian: true,
    description: 'The Dosa Factory is a quick service outlet featuring South Indian dishes.',
    outlets: [
      o('', 'Domestic Departure, Terminal 2', 'landside'),
      o('', 'Security Hold Area, Terminal 2', 'airside'),
    ],
  }),
  hatti_kappi: restaurant({
    name: 'Hatti Kappi', cuisine: 'Coffee Shop', amenity: 'cafe',
    description: 'Hatti Kaapi had its humble beginnings in one of the traditional coffee-growing districts of Karnataka.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
  network_bar: restaurant({
    name: 'Network Bar', cuisine: 'Bar', amenity: 'bar',
    description: 'Network Bar is an excellent spot for taking a break before a long-haul flight.',
    outlets: [o('', 'Departures, Terminal 2', 'landside')],
  }),
};

// ─── Terminal 3 venues ────────────────────────────────────────────────────

const terminal3Venues = {
  cafe_at: restaurant({
    name: '@café', cuisine: 'Quick Service Restaurants & Grab N Go', amenity: 'cafe',
    description: '@cafe is dedicated to providing a unique and enjoyable dining experience with fresh, affordable food.',
    outlets: [
      o('', 'Arrivals, Terminal 3', 'landside'),
      o('', 'Departures, Terminal 3', 'landside'),
    ],
  }),
  costa_coffee_t3: restaurant({
    name: 'Costa Coffee', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'costacoffee.com', logoUrl: logo('costacoffee.com'),
    description: 'Costa Coffee is the largest and fastest-growing coffee shop chain in the UK.',
    outlets: [
      o('', 'Departures, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Arrivals, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
      o('', 'Arrivals, Terminal 3', 'landside'),
    ],
  }),
  curry_kitchen: restaurant({
    name: 'Curry Kitchen', cuisine: 'Indian Curry', amenity: 'restaurant',
    description: 'Curry Kitchen specialises in traditional Indian cuisine known for serving authentic flavours.',
    outlets: [
      o('', 'International Departures, Terminal 3', 'landside'),
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
    ],
  }),
  dilli_streat: restaurant({
    name: 'Dilli Streat', cuisine: 'Delhi Street Food', amenity: 'restaurant',
    description: 'Dilli Streat is a vibrant eatery offering several options for vegetarians and non-vegetarians alike.',
    vegetarian: true,
    outlets: [
      o('', 'Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  dominos_t3: restaurant({
    name: 'Dominos', cuisine: 'Pizza', amenity: 'restaurant',
    website: 'dominos.co.in', logoUrl: logo('dominos.co.in'),
    description: "A recognised world leader in pizza operations, Domino's is a Michigan-based international restaurant chain.",
    phone: '9220402064',
    outlets: [
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Arrivals, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  idli_com: restaurant({
    name: 'Idli.com', cuisine: 'South Indian', amenity: 'restaurant',
    vegetarian: true,
    description: 'For someone craving authentic South-Indian food, Idli.com is the one-stop destination.',
    outlets: [o('', 'International Departures, Terminal 3', 'landside')],
  }),
  kfc_t3: restaurant({
    name: 'KFC', cuisine: 'Fried Chicken (Fast Food)', amenity: 'restaurant',
    website: 'kfc.co.in', logoUrl: logo('kfc.co.in'),
    description: 'A treat for chicken lovers, KFC is one of the most popular restaurant chains in the world.',
    phone: '9220402063',
    outlets: [
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Arrivals, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
      o('', 'Arrivals, Terminal 3', 'landside'),
    ],
  }),
  masala_twist: restaurant({
    name: 'Masala Twist', cuisine: 'North Indian', amenity: 'restaurant',
    description: 'Masala Twist offers a lip-smacking selection of North Indian foods with a twist.',
    outlets: [
      o('', 'Departures, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  mcdonalds_t3: restaurant({
    name: 'McDonalds', cuisine: 'Burgers (Fast Food)', amenity: 'restaurant',
    website: 'mcdonalds.co.in', logoUrl: logo('mcdonalds.co.in'),
    description: "One of the world's leading restaurant chains, McDonald's has been serving happiness for decades.",
    phone: '9560526800',
    outlets: [
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  starbucks_t3: restaurant({
    name: 'Starbucks', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'starbucks.in', logoUrl: logo('starbucks.in'),
    description: 'Starbucks is the premier roaster and retailer of speciality coffee in the world.',
    outlets: [
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  subway_t3: restaurant({
    name: 'Subway', cuisine: 'Sandwiches', amenity: 'restaurant',
    website: 'subway.com', logoUrl: logo('subway.com'),
    description: 'Subway is an American fast-food restaurant franchise well-known for serving sandwiches, wraps, and salads.',
    phone: '9220402064',
    outlets: [
      o('', 'Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  vaango: restaurant({
    name: 'Vaango', cuisine: 'South Indian (Vegetarian)', amenity: 'restaurant',
    vegetarian: true,
    description: 'For tasting the authentic flavours of South India, Vaango is your one-stop destination for pure vegetarian food.',
    outlets: [
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
      o('', 'International Arrivals, Terminal 3', 'landside'),
      o('', 'Arrivals, Terminal 3', 'landside'),
    ],
  }),
  ile_bar: restaurant({
    name: 'Ile Bar', cuisine: 'Cafe & Bar', amenity: 'bar',
    description: 'Ile Bar is a stylish and contemporary spot that provides a perfect respite to travellers seeking a relaxing break.',
    outlets: [
      o('', 'International Arrivals, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
      o('', 'Arrivals, Terminal 3', 'landside'),
    ],
  }),
  delhi_capitals: restaurant({
    name: 'Delhi Capitals', cuisine: 'Sports Bar', amenity: 'bar',
    description: 'Delhi Capitals sports bar is the ultimate destination for sports fans in Delhi.',
    outlets: [o('', 'International Departures, Terminal 3', 'landside')],
  }),
  cafeccino_t3: restaurant({
    name: 'Cafeccino', cuisine: 'Coffee Shop', amenity: 'cafe',
    description: 'Cafeccino offers a sophisticated range of coffee and espresso beverages, crafted with high-quality beans.',
    phone: '8655474105',
    outlets: [
      o('', 'Departures, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  punjabi_kulfi: restaurant({
    name: 'Punjabi Kulfi', cuisine: 'Indian Desserts (Kulfi)', amenity: 'cafe',
    vegetarian: true,
    description: 'Punjabi Kulfi at Delhi Airport offers a range of rich-flavoured Indian kulfis made with milk and sugar.',
    outlets: [
      o('', 'Domestic Departures, Terminal 3', 'landside'),
      o('', 'International Departures, Terminal 3', 'landside'),
    ],
  }),
  krispy_kreme_kiosk_t3: restaurant({
    name: 'Krispy Kreme Kiosk', cuisine: 'Doughnuts & Coffee', amenity: 'cafe',
    website: 'krispykreme.com', logoUrl: logo('krispykreme.com'),
    description: 'An American multinational doughnut company and coffeehouse chain.',
    phone: '8655474105',
    outlets: [
      o('', 'Arrivals, Terminal 3', 'landside'),
      o('', 'Departures, Terminal 3', 'landside'),
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
    ],
  }),
  the_irish_house: restaurant({
    name: 'The Irish House', cuisine: 'Pub & Casual Dining', amenity: 'bar',
    description: 'The Irish House, serving lip-smacking food and a host of international and domestic beers.',
    outlets: [o('', 'International Departures, Terminal 3', 'landside')],
  }),
  bercos: restaurant({
    name: 'Bercos', cuisine: 'Chinese & Thai', amenity: 'restaurant',
    description: 'One of the most distinguished names in the culinary world, Bercos offers lip-smacking Chinese and Thai food.',
    outlets: [
      o('', 'International Departures, Terminal 3', 'landside'),
      o('', 'International Security Hold Area, Terminal 3', 'airside'),
    ],
  }),
  buno_and_kaffa: restaurant({
    name: 'BUNO & KAFFA', cuisine: 'Casual Dining', amenity: 'restaurant',
    description: 'A casual dining restaurant serving versatile dishes, BUNO & KAFFA is an excellent eatery.',
    outlets: [o('', 'Departures, Terminal 3', 'landside')],
  }),
  cafe_espresso_t3: restaurant({
    name: 'Cafe Espresso', cuisine: 'Coffee Shop', amenity: 'cafe',
    vegetarian: true,
    description: 'Cafe Espresso is a quick-serve café offering delicious bites and beverages of choice.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  gujrati_svado_t3: restaurant({
    name: 'Gujrati Svado', cuisine: 'Gujarati (Vegetarian)', amenity: 'restaurant',
    vegetarian: true,
    description: 'Gujarati Svado promises an exquisite Indian cuisine experience crafted with traditional regional delicacies.',
    outlets: [o('', 'Domestic Arrivals, Terminal 3', 'landside')],
  }),
  urban_food_market_t3: restaurant({
    name: 'Urban Food Market', cuisine: 'Food Court', amenity: 'restaurant',
    description: 'Urban Food Market is a trendy and quick service concept with a wide range of options.',
    outlets: [o('', 'International Security Hold Area, Terminal 3', 'airside')],
  }),
  chaayos_t3: restaurant({
    name: 'Chaayos', cuisine: 'Tea Cafe', amenity: 'cafe',
    website: 'chaayos.com', logoUrl: logo('chaayos.com'),
    description: 'Chaayos is a one-of-its-kind tea cafe that blends service quality with a traditional tea (Chai) range.',
    outlets: [o('', 'Arrivals, Terminal 3', 'landside')],
  }),
  mumbai_central: restaurant({
    name: 'Mumbai Central', cuisine: 'Mumbai Street Food', amenity: 'restaurant',
    description: 'Mumbai Central at Delhi Airport captures the vibrant spirit and flavours of the bustling metropolis of Mumbai.',
    outlets: [o('', 'International Arrivals, Terminal 3', 'landside')],
  }),
  falafel_express: restaurant({
    name: 'Falafel Express', cuisine: 'Mediterranean', amenity: 'restaurant',
    vegetarian: true,
    description: 'Falafel Express is a casual restaurant chain specialising in delicious and healthy Mediterranean cuisine.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  caffe_tonino_t3: restaurant({
    name: 'Caffe Tonino', cuisine: 'Italian / Pizza', amenity: 'restaurant',
    description: 'Inspired by Tonino Generale, the award-winning pizza maker from Napoli, Caffe Tonino is the labour of love.',
    phone: '9266991139',
    outlets: [o('', 'International Departures, Terminal 3', 'landside')],
  }),
  papparoti_t3: restaurant({
    name: 'Papparoti', cuisine: 'Bakery (Buns)', amenity: 'cafe',
    description: 'Papparoti specialises in serving freshly baked buns, crispy on the outside and soft and fluffy on the inside.',
    phone: '8851259013',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  nourish: restaurant({
    name: 'Nourish', cuisine: 'Healthy Food', amenity: 'restaurant',
    vegetarian: true,
    description: 'Nourish, an eatery located at Delhi Airport, is a culinary haven providing wholesome and nourishing food.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  ultra_bar: restaurant({
    name: 'Ultra Bar', cuisine: 'Bar', amenity: 'bar',
    description: 'Ultra Bar is a trendy and upscale nightlife destination offering a vibrant and energetic atmosphere.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  noodle_wok: restaurant({
    name: 'Noodle Wok', cuisine: 'Chinese Noodles', amenity: 'restaurant',
    description: 'Quick meal options for all Chinese cuisine lovers, with a wide assortment of appetisers and noodle dishes.',
    outlets: [
      o('', 'Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
    ],
  }),
  wrapafella: restaurant({
    name: 'Wrapafella', cuisine: 'Wraps', amenity: 'restaurant',
    description: 'Wrapafella is a popular food joint specialising in serving delicious and customisable wraps.',
    outlets: [o('', 'International Departures, Terminal 3', 'landside')],
  }),
  nescafe_t3: restaurant({
    name: 'Nescafe', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'nescafe.com', logoUrl: logo('nescafe.com'),
    description: 'NESCAFE is a one-stop solution, providing quick, tasty and hygienic food and beverages to consumers.',
    outlets: [
      o('', 'Arrivals, Terminal 3', 'landside'),
      o('', 'Departures, Terminal 3', 'landside'),
      o('', 'Domestic Arrivals, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
    ],
  }),
  dosa_factory_and_noodle_t3: restaurant({
    name: 'Dosa factory & Noodle', cuisine: 'South Indian & Chinese', amenity: 'restaurant',
    vegetarian: true,
    description: 'The Dosa Factory is a quick service outlet featuring South Indian dishes.',
    outlets: [o('', 'International Arrivals, Terminal 3', 'landside')],
  }),
  burger_king: restaurant({
    name: 'Burger King', cuisine: 'Burgers (Fast Food)', amenity: 'restaurant',
    website: 'burgerking.co.in', logoUrl: logo('burgerking.co.in'),
    description: 'Every day more than 11 million guests visit BURGER KING for its high-quality, great-tasting, affordable food.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  heineken_bar: restaurant({
    name: 'Heineken Bar', cuisine: 'Bar', amenity: 'bar',
    website: 'heineken.com', logoUrl: logo('heineken.com'),
    description: 'Heineken, the iconic Dutch beer, symbolises premium quality and exceptional craftsmanship since 1873.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  chai_point: restaurant({
    name: 'Chai Point', cuisine: 'Tea Cafe', amenity: 'cafe',
    description: "World's latest tea-led platform, Chai Point, serves a perfect cup of tea that brightens lives.",
    outlets: [o('', 'International Departures, Terminal 3', 'landside')],
  }),
  carnatic_cafe_t3: restaurant({
    name: 'Carnatic Café', cuisine: 'South Indian', amenity: 'cafe',
    description: 'A go-to destination for South Indian cuisine lovers, Carnatic Cafe is a vibrant culinary haven.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  airr_toast: restaurant({
    name: 'Airr Toast', cuisine: 'Toast & Snacks', amenity: 'cafe',
    vegetarian: true,
    description: 'Experience the unique flavours of Airrtoast, a renowned brand specialising in a delightful toast menu.',
    outlets: [
      o('', 'International Departures, Terminal 3', 'landside'),
      o('', 'Domestic Departures, Terminal 3', 'landside'),
    ],
  }),
  dhaba: restaurant({
    name: 'Dhaba', cuisine: 'North Indian (Highway Dhaba)', amenity: 'restaurant',
    vegetarian: true,
    description: 'The Dhaba at Delhi Airport brings the rustic charm and flavours of traditional highway dhabas at NH1.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  franks: restaurant({
    name: 'Franks', cuisine: 'Hot Dogs (American Street Food)', amenity: 'restaurant',
    description: 'Franks at Delhi Airport is a haven for hot dog enthusiasts and lovers of American street food.',
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  biryani_blues: restaurant({
    name: 'Biryani Blues', cuisine: 'Biryani (Indian)', amenity: 'restaurant',
    description: "Biryani Blues is best known for serving its award-winning authentic 'dum' biryanis.",
    outlets: [o('', 'Domestic Departures, Terminal 3', 'landside')],
  }),
  moti_mahal_deluxe: restaurant({
    name: 'Moti Mahal Deluxe', cuisine: 'North Indian / Mughlai', amenity: 'restaurant',
    description: 'Moti Mahal is an iconic name in modern Indian culinary history, dating back to 1920 in Peshawar.',
    outlets: [o('', 'International Arrivals, Terminal 3', 'landside')],
  }),
  tim_hortons_t3: restaurant({
    name: 'Tim Hortons', cuisine: 'Coffee & Baked Goods', amenity: 'cafe',
    website: 'timhortons.com', logoUrl: logo('timhortons.com'),
    description: 'Tim Hortons is an iconic Canadian brand, founded in 1964, one of the most beloved coffee and bake chains.',
    outlets: [o('', 'Domestic Departure Piers, Terminal 3', 'airside')],
  }),
  theobroma: restaurant({
    name: 'Theobroma', cuisine: 'Bakery & Desserts', amenity: 'cafe',
    description: 'Theobroma started its journey in 2004 in Mumbai as a family-run bakery.',
    phone: '7982973473',
    outlets: [
      o('', 'Domestic Arrivals, Arrivals Clearance Building, Terminal 3', 'landside'),
      o('', 'International Arrivals, Meet & Greet, Terminal 3', 'landside'),
    ],
  }),
};

// ─── main ─────────────────────────────────────────────────────────────────

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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', terminal1Venues);
  const r2 = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', terminal2Venues);
  const r3 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', terminal3Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3]));

  const totalCreated = r1.created + r2.created + r3.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length + Object.keys(terminal3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

