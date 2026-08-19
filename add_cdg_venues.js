'use strict';
/**
 * Fills in complete data for all Paris-Charles de Gaulle (CDG) restaurants/
 * bars/cafés in Firestore, cross-referenced against the official Paris
 * Aéroport bars & restaurants directory (parisaeroport.fr/en/passengers/
 * at-the-airport/bars-restaurants/cdg) on 2026-08-05.
 *
 * Paris Aéroport's site is a Next.js App Router app whose per-brand pages
 * embed a rich structured "poiList" payload (name, description, category,
 * per-outlet terminal/zone/level/public-or-restricted flag, phone, email,
 * and full weekly opening hours) inside a React Server Components streaming
 * chunk (`self.__next_f.push([1, "...json..."])`), rather than in the more
 * common `__NEXT_DATA__` tag. That payload was extracted directly (brace-
 * matched out of the pushed string) for all 25 F&B brands listed on the
 * directory (reached after paging through "See more brands" twice), giving
 * far more reliable data than scraping rendered text — in particular the
 * `IsPublic` flag on each outlet, which maps directly to landside/airside.
 *
 * CDG's food & drink brands are organised by BRAND, not by single location:
 * a brand's own page lists every physical outlet across the whole airport
 * (e.g. Paul: 10 outlets across 7 terminal areas; Starbucks: 10 outlets
 * across 6). Docs are grouped by (name, terminal) exactly as with every
 * other airport in this project: multiple physical counters of the same
 * brand WITHIN one terminal area are combined into a single doc with
 * multiple `outlets[]`; a brand present in MULTIPLE terminal areas gets a
 * separate doc per terminal area.
 *
 * CDG's real layout is more granular than a simple T1/T2A-G/T3 list:
 * Terminal 2B and 2D share one physical building/pier referred to on the
 * site itself as "2BD" (all of its outlets are tagged with zone names like
 * "2BD réservée N1"), and Terminal 2A/2C share a boarding-only zone the
 * site calls "Embarquement 2A – 2C". Those are kept as their own terminal
 * buckets (`Terminal 2BD`, `Terminal 2A-2C`) rather than force-fit into a
 * single official terminal, since collapsing them would misplace real
 * outlets. Two landside, non-terminal transit-hub locations from Brioche
 * Dorée's own outlet list — Roissypole (the central hub building) and the
 * Gare TGV (the airport's train station) — are likewise kept as their own
 * buckets rather than dropped, since they are real, currently-open CDG
 * food & drink locations even though they aren't inside a terminal.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - `airside` is taken directly from each outlet's own `IsPublic` flag in
 *     the site's structured data (IsPublic: true -> landside/public area,
 *     false -> airside/restricted area) — not inferred from wording.
 *   - One exact duplicate outlet was found in Brioche Dorée's own outlet
 *     list (Terminal 2D, restricted, Level 1, identical phone number and
 *     hours listed twice back-to-back) and was deduplicated to a single
 *     outlet rather than kept as two, since it reads as a data artifact on
 *     the airport's own site rather than two genuinely separate counters.
 *   - Dietary tags are only set where a brand's own description explicitly
 *     states it (e.g. Paname Tap House: "A gluten-free range is also
 *     available"); no CDG brand page exposed a structured dietary-tag
 *     field the way Manchester's site did, so most venues are left blank
 *     rather than guessed.
 *   - `website`/`logo_url` are only filled in for brands independently
 *     verifiable as real national/international chains with a known French
 *     web presence (Brioche Dorée, Cojean, Eric Kayser, Ladurée,
 *     McDonald's, Paul, Pret A Manger, Starbucks Coffee, Sushi Shop, Exki).
 *     CDG/Guy-Martin-exclusive or otherwise unverified concepts (Bar,
 *     Bellota-Bellota, Bistrot Benoit, Byzance Gourmet Food Bar, Café
 *     Eiffel, Carl's Jr, Food & Café, I love Paris by Guy Martin, La Table
 *     de Michel Roth, Maison Pradier, Miyou, Paname Tap House, Strada by
 *     It, Sūshi, The French Taste by Guy Martin) are left blank rather
 *     than guessing a domain.
 *
 * CDG appears in BOTH reference scripts with the SAME slug this time (no
 * conflict, unlike Heathrow/Manchester/Madrid): upload_to_firestore.py and
 * migrate_firestore.js/cleanup_firestore.js all use 'cdg'. This script
 * still auto-detects the airport slug at runtime for safety (checking
 * 'cdg' first, then 'paris') and matches existing restaurant docs by
 * normalized name within each terminal — updating in place if found,
 * creating new otherwise. It never creates a new `airports/{id}` metadata
 * doc itself.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_cdg_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['cdg', 'paris'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2A = 'terminal_2a';
const TERMINAL_2AC = 'terminal_2ac';
const TERMINAL_2B = 'terminal_2b';
const TERMINAL_2BD = 'terminal_2bd';
const TERMINAL_2C = 'terminal_2c';
const TERMINAL_2D = 'terminal_2d';
const TERMINAL_2E = 'terminal_2e';
const TERMINAL_2F = 'terminal_2f';
const TERMINAL_2G = 'terminal_2g';
const TERMINAL_3 = 'terminal_3';
const ROISSYPOLE = 'roissypole';
const GARE_TGV = 'gare_tgv';

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

function normalizeName(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ─── shared brand text (kept once per brand, reused across terminal docs) ───

const DESC = {
  bellota: '"Bellota-Bellota® takes over where other Iberian ham leaves off". Bellota-Bellota® is a French brand specialised in the art de vivre and which combines the best of two great cultures: French and Spanish. It acquired the world\'s favourite ham from Spain as well as the best of Spanish gastronomy with its festive and convivial spirit.',
  bar: "It's time to relax! Le Bar offers a selection of cocktails, wines, coffees and teas that will go well with a sweet or savoury snack before your plane takes off!",
  bistrotBenoit: "An emblematic brand of French gastronomy, Bistrot Benoît originates from typically Parisian bistros, enhanced by Alain Ducasse's creativity. It is inspired by the famous Benoit Paris restaurant, which opened in 1912 and was the first bistro in the capital to be awarded a Michelin star. Enjoy traditional bistro dishes, cooked to order and made from fresh produce, accompanied by a selection of wines and champagnes.",
  brioche: 'Brioche Dorée offers you its large range of quality cooked products prepared on site. Sandwiches for all tastes, varied and balanced salads, hot food (quiches, gratins, etc.), pastries and desserts whatever your fancy. A rapid and efficient service in a convivial setting, ideal for everything from a snack to a full meal.',
  byzance: "Welcome to Comptoir Byzance®! Allow us to take you on a unique gastronomical journey. Sitting comfortably at the bar, you'll discover a world of flavours with the finest gourmet products including salmon, caviar, taramasalata, foie gras and much more! Whether you're in a hurry or have time to kill, our range of exquisite products promises you some delicious food to enjoy on-site or to take away.",
  cafeEiffel: "Café Eiffel brings a little bit of Paris to the airport. World-famous two-star Michelin chef Michel Rostang has put together a menu featuring typical French bar food. Enjoy a croque-monsieur, Caesar salad, steak tartare or pasta gratin in a setting inspired by Paris' most iconic monument.",
  carlsJr: "Straight out of California, Carl's Jr has already won over 44 countries with its exclusive recipes that strike a balance between authenticity and creativity, in generous portions spiced up with flavour. With its BBQ burgers, extra-fresh products, made by hand and served at the table, Carl's Jr is pulling out all the stops. 120 seats, takeaway and click and collect available.",
  cojean: 'For 25 years, Cojean has been a pioneer of healthy food in France. The brand has transformed the dining landscape with innovative cuisine made from fresh, tasty and balanced dishes prepared with carefully selected ingredients. The menu changes with the seasons and offers a variety of recipes designed to suit all dietary preferences.',
  ericKayser: 'Kayser is a top-of-the-range bakery which uses the know-how of one of the greatest French master bakers, Eric Kayser, offering his range of sandwiches, salads, cooked meals, pastries and cakes.',
  exki: 'Exki offers fresh and natural products, with no additives, to eat in or take away: full breakfast, large range of original sandwiches and salads, "home-made" soups, vegetable tarts, and not forgetting delicious desserts. Some of the ingredients used (bread, dairy products, jam, etc.) are organic.',
  foodCafe: 'Food & Café offers hot drinks such as espresso, latte, hot chocolate, and a selection of teas, to enjoy either on the premises or to take away. The menu also includes sandwiches on French baguette, salads, and a range of American pastries.',
  iLoveParis: 'French gastronomy has a new address with the opening at Paris-Charles de Gaulle of a restaurant created by Guy Martin, the Michelin star-winning chef of the Grand Véfour. I Love Paris, created by the architect and designer India Mahdavi, is a restaurant space based on three offerings: top-of-the-range sandwiches, a champagne bar and a 70-seat restaurant.',
  laTableMichelRoth: 'Discover "La Table de Michel Roth", where fresh, seasonal and regional produce and revisited bistronomic classics await. The restaurant serves inventive and traditional cuisine by Michelin-starred chef Michel Roth, winner of such prestigious culinary competitions as the Bocuse d\'Or and the Meilleur Ouvrier de France.',
  laduree: 'The tea room - restaurant serves breakfast and lunch all day. The seasonal menu offers classic and tasty cuisine. Amongst the essentials, you can taste foie gras, macaroons, poultry vol-au-vent or the "salade Concorde".',
  maisonPradier: 'Founded in 1859, the French bakery Maison Pradier has diversified and now sells a complete range of snacks which vary from one season to the next. Sandwiches, salads, daily specials and smoothies now complement its traditional range of cakes and pastries, including the Maison Pradier chocolate eclair, voted best in Paris by Figaroscope in 2015.',
  mcdonalds: 'An ideal solution for all appetites, at any time of the day. Find the classics of the iconic fast food chain.',
  miyou: 'This Guy Martin branded, chic sandwich outlet offers sandwiches and fresh fruit juice; an offering which is synonymous with refinement, health and pleasure.',
  panameTapHouse: 'Paname Tap House is a Parisian brand offering a range of fresh, seasonal and locally prepared products. The Paname Brewing Company offers a selection of craft beers and dishes which can be consumed on the premises or taken away. A gluten-free range is also available.',
  paul: "Whether it's a French-style breakfast or a tasty snack, PAUL offers products combining tradition and authenticity. Here you will find pastries, cakes and sandwiches with the flavours of good old-fashioned fresh bread and a selection of hot and cold drinks.",
  pret: 'PRET A MANGER\'s recipes use fresh, natural ingredients, with no additives or preservatives. In addition to our wide range of sandwiches, salads and pastries prepared on the spot, we also sell soups, hot wraps, and desserts, plus organic certified coffee specialities, smoothies and frozen drinks. Eat in or take away.',
  starbucks: 'Starbucks has a formidable range of "bespoke" hot and cold drinks, from the espresso to the finest and most customisable drinks, as well as a range of sandwiches, salads and cakes. The baristas can give coffee lovers good advice, guiding them and thus getting them to share the Starbucks experience.',
  strada: 'IT TRATTORIA brings together the know-how of a traditional Italian trattoria with New York take-away culture. This Italian cuisine will delight diners of all nationalities, any time of day. Come along and enjoy our pizzas in a modern environment.',
  sushi: 'Sūshi invites you to enjoy a gourmet stopover with Japanese-inspired flavors in the heart of Paris-CDG Airport. From early morning, discover our breakfast selection before continuing your day with a fresh and generous range of sushi, california rolls, maki, poké bowls and salads. Craving something warm? Treat yourself to our comforting gyoza, katsu curry or ramen.',
  sushiShop: 'Founded in 1998, Sushi Shop is the European leader in sushi creation and delivery. With outlets in 12 countries, the brand offers a vast range of sushi options with Japanese and Californian influences, such as sushi, maki, California rolls, and chirashi as well as a variety of side dishes, desserts and drinks.',
  frenchTaste: "Michelin-starred chef Guy Martin is writing a new chapter in culinary history, right in the heart of a departures terminal! The French Taste is a French neo-brasserie with 80 seats and a very international outlook. It is ideal for travellers seeking authentic French flavours combined with healthy recipes.",
};

// ─── Terminal 1 ───────────────────────────────────────────────────────────

const t1Venues = {
  bistrot_benoit_t1: restaurant({
    name: 'Bistrot Benoit', cuisine: 'French, Bistro', amenity: 'restaurant',
    phone: '+33 (0)1 74 25 50 98', description: DESC.bistrotBenoit,
    outlets: [outlet({ airside: 'airside', level: 'Level 5', locationNotes: 'Foodcourt, Satellite U', openingHours: '06:30 - 21:00' })],
  }),
  brioche_doree_t1: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr', description: DESC.brioche,
    outlets: [
      outlet({ airside: 'landside', level: 'Level 5', phone: '+33 (0)1 48 16 01 60', openingHours: '06:30 - 21:00' }),
      outlet({ airside: 'airside', level: 'Level 4', phone: '+33 (0)1 74 37 25 34', openingHours: '08:00 - 17:00' }),
      outlet({ airside: 'airside', level: 'Level 4', phone: '+33(0)1 48 62 30 62', openingHours: '05:00 - 21:00' }),
    ],
  }),
  cojean_t1: restaurant({
    name: 'Cojean', cuisine: 'Healthy, Salads', amenity: 'fast_food',
    logoUrl: logo('cojean.fr'), website: 'https://www.cojean.fr',
    phone: '+33 (0)1 74 25 50 59', description: DESC.cojean,
    outlets: [outlet({ airside: 'airside', level: 'Level 5', locationNotes: 'Foodcourt, Satellite U', openingHours: '06:00 - 21:00' })],
  }),
  exki_t1: restaurant({
    name: 'Exki', cuisine: 'Healthy, Organic', amenity: 'fast_food',
    logoUrl: logo('exki.com'), website: 'https://www.exki.com',
    phone: '+ 33 (0)1 74 25 50 44', description: DESC.exki,
    outlets: [outlet({ airside: 'airside', level: 'Level 4', openingHours: '06:00 - 21:30' })],
  }),
  mcdonalds_t1: restaurant({
    name: "McDonald's", cuisine: 'American, Fast Food', amenity: 'fast_food',
    logoUrl: logo('mcdonalds.fr'), website: 'https://www.mcdonalds.fr', description: DESC.mcdonalds,
    outlets: [
      outlet({ airside: 'landside', level: 'Level 2', phone: '+33 (0)1 48 62 24 60', openingHours: '07:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 5', locationNotes: 'Foodcourt, Satellite U', phone: '+33 (0)1 74 25 51 70', openingHours: '06:00 - 22:00' }),
    ],
  }),
  paul_t1: restaurant({
    name: 'Paul', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('paul.fr'), website: 'https://www.paul.fr', description: DESC.paul,
    outlets: [
      outlet({ airside: 'landside', level: 'Level 2', phone: '+33 (0)1 74 25 60 70', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 5', locationNotes: 'Foodcourt, Satellite U', phone: '+33 (0)1 74 25 51 68', openingHours: '07:00 - 21:00' }),
    ],
  }),
  starbucks_t1: restaurant({
    name: 'Starbucks Coffee', cuisine: 'Coffee, Café', amenity: 'cafe',
    logoUrl: logo('starbucks.fr'), website: 'https://www.starbucks.fr', description: DESC.starbucks,
    outlets: [
      outlet({ airside: 'landside', level: 'Level 2', phone: '+33 (0)1 48 62 40 22', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 5', locationNotes: 'Foodcourt, Satellite U', phone: '+33 (0)1 74 25 50 89', openingHours: '07:00 - 18:30' }),
    ],
  }),
  sushi_shop_t1: restaurant({
    name: 'Sushi Shop', cuisine: 'Japanese', amenity: 'fast_food',
    logoUrl: logo('sushishop.com'), website: 'https://www.sushishop.com',
    phone: '+33 (0)1 48 16 33 19', description: DESC.sushiShop,
    outlets: [outlet({ airside: 'landside', level: 'Level 2', openingHours: '11:00 - 19:00' })],
  }),
};

// ─── Terminal 2A ──────────────────────────────────────────────────────────

const t2aVenues = {
  exki_t2a: restaurant({
    name: 'Exki', cuisine: 'Healthy, Organic', amenity: 'fast_food',
    logoUrl: logo('exki.com'), website: 'https://www.exki.com',
    phone: '+33 (0)1 74 29 47 82', description: DESC.exki,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '07:00 - 21:30' })],
  }),
  starbucks_t2a: restaurant({
    name: 'Starbucks Coffee', cuisine: 'Coffee, Café', amenity: 'cafe',
    logoUrl: logo('starbucks.fr'), website: 'https://www.starbucks.fr', description: DESC.starbucks,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 1', phone: '+33 (0)1 74 37 27 51', openingHours: '07:00 - 21:30' }),
      outlet({ airside: 'landside', level: 'Level 1', openingHours: '07:00 - 21:00' }),
    ],
  }),
};

// ─── Terminal 2A-2C (shared boarding zone, "Embarquement 2A – 2C") ──────────

const t2acVenues = {
  mcdonalds_t2ac: restaurant({
    name: "McDonald's", cuisine: 'American, Fast Food', amenity: 'fast_food',
    logoUrl: logo('mcdonalds.fr'), website: 'https://www.mcdonalds.fr', description: DESC.mcdonalds,
    outlets: [outlet({ airside: 'landside', level: 'Level 1', locationNotes: 'Boarding area shared by Terminals 2A/2C', phone: '+33 (0)1 74 25 84 10', openingHours: '07:00 - 21:00' })],
  }),
};

// ─── Terminal 2B ──────────────────────────────────────────────────────────

const t2bVenues = {
  paul_t2b: restaurant({
    name: 'Paul', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('paul.fr'), website: 'https://www.paul.fr',
    phone: '+33 (0)1 74 25 63 78', description: DESC.paul,
    outlets: [outlet({ airside: 'landside', level: '1', openingHours: '03:00 - 20:30' })],
  }),
  pret_t2b: restaurant({
    name: 'Pret A Manger', cuisine: 'Healthy, Sandwiches', amenity: 'fast_food',
    logoUrl: logo('pret.fr'), website: 'https://www.pret.fr',
    phone: '+33 (0)1 74 25 63 70', description: DESC.pret,
    outlets: [outlet({ airside: 'airside', level: '1', openingHours: '05:00 - 21:30' })],
  }),
};

// ─── Terminal 2BD (shared 2B/2D building, referred to on-site as "2BD") ─────

const t2bdVenues = {
  brioche_doree_t2bd: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr',
    phone: '+33 (0)1 74 25 53 22', description: DESC.brioche,
    outlets: [outlet({ airside: 'landside', level: '0', openingHours: '07:00 - 21:00' })],
  }),
  carls_jr_t2bd: restaurant({
    name: "Carl's Jr", cuisine: 'American, Burgers', amenity: 'fast_food',
    phone: '+33 (0)1 74 25 60 89', description: DESC.carlsJr,
    outlets: [outlet({ airside: 'landside', level: '1', openingHours: '07:00 - 21:30' })],
  }),
  la_table_michel_roth_t2bd: restaurant({
    name: 'La Table de Michel Roth', cuisine: 'French, Chef’s kitchen', amenity: 'restaurant',
    phone: '+33 (0)1 74 25 00 88', description: DESC.laTableMichelRoth,
    outlets: [outlet({ airside: 'airside', level: '1', openingHours: '05:00 - 21:15' })],
  }),
  paname_tap_house_t2bd: restaurant({
    name: 'Paname Tap House', cuisine: 'French, Brasserie, Craft Beer', amenity: 'pub',
    glutenFree: true,
    phone: '+33 (0)1 74 25 71 02', description: DESC.panameTapHouse,
    outlets: [outlet({ airside: 'airside', level: '1', openingHours: '07:00 - 21:15' })],
  }),
  paul_t2bd: restaurant({
    name: 'Paul', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('paul.fr'), website: 'https://www.paul.fr', description: DESC.paul,
    outlets: [outlet({ airside: 'airside', level: '1', openingHours: '04:30 - 21:15' })],
  }),
  pret_t2bd: restaurant({
    name: 'Pret A Manger', cuisine: 'Healthy, Sandwiches', amenity: 'fast_food',
    logoUrl: logo('pret.fr'), website: 'https://www.pret.fr',
    phone: '+33 (0)1 74 25 71 00', description: DESC.pret,
    outlets: [outlet({ airside: 'landside', level: '1', openingHours: '05:00 - 21:00' })],
  }),
  starbucks_t2bd: restaurant({
    name: 'Starbucks Coffee', cuisine: 'Coffee, Café', amenity: 'cafe',
    logoUrl: logo('starbucks.fr'), website: 'https://www.starbucks.fr',
    phone: '+33 (0)1 74 25 63 72', description: DESC.starbucks,
    outlets: [outlet({ airside: 'airside', level: '1', openingHours: '05:00 - 21:15' })],
  }),
  strada_by_it_t2bd: restaurant({
    name: 'Strada by It', cuisine: 'Italian', amenity: 'restaurant',
    phone: '+33 (0)1 74 25 71 03', description: DESC.strada,
    outlets: [outlet({ airside: 'airside', level: '1', openingHours: '07:00 - 21:15' })],
  }),
  sushi_t2bd: restaurant({
    name: 'Sūshi', cuisine: 'Japanese', amenity: 'restaurant',
    phone: '+33 (0)1 74 25 11 01', description: DESC.sushi,
    outlets: [outlet({ airside: 'airside', level: '1', openingHours: '08:00 - 21:15' })],
  }),
};

// ─── Terminal 2C ──────────────────────────────────────────────────────────

const t2cVenues = {
  mcdonalds_t2c: restaurant({
    name: "McDonald's", cuisine: 'American, Fast Food', amenity: 'fast_food',
    logoUrl: logo('mcdonalds.fr'), website: 'https://www.mcdonalds.fr',
    phone: '+33 (0)1  74 37 14 59', description: DESC.mcdonalds,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '07:00 - 21:30' })],
  }),
};

// ─── Terminal 2D ──────────────────────────────────────────────────────────

const t2dVenues = {
  brioche_doree_t2d: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr', description: DESC.brioche,
    outlets: [
      outlet({ airside: 'landside', level: 'Level 1', phone: '+33 (0)1 48 62 25 33', openingHours: '06:00 - 21:00' }),
      outlet({ airside: 'airside', level: 'Level 1', phone: '+33 (0)1 48 64 51 90', openingHours: '04:30 - 20:30' }),
    ],
  }),
};

// ─── Terminal 2E ──────────────────────────────────────────────────────────

const t2eVenues = {
  bellota_bellota_t2e: restaurant({
    name: 'Bellota-Bellota', cuisine: 'Spanish, Iberian', amenity: 'restaurant',
    phone: '+33 (0)1 48 62 09 90', description: DESC.bellota,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates M', openingHours: '07:00 - 16:00' })],
  }),
  bar_t2e: restaurant({
    name: 'Bar', cuisine: 'International, Bar', amenity: 'bar',
    phone: '+33 (0)1 74 25 23 66', description: DESC.bar,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates L', openingHours: '11:00 - 21:00' })],
  }),
  cafe_eiffel_t2e: restaurant({
    name: 'Café Eiffel', cuisine: 'French', amenity: 'restaurant',
    phone: '+33 (0)1 48 16 04 67', description: DESC.cafeEiffel,
    outlets: [outlet({ airside: 'landside', level: 'Level 2', openingHours: '06:00 - 20:30' })],
  }),
  brioche_doree_t2e: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr',
    phone: '+33 (0)1 48 62 02 37', description: DESC.brioche,
    outlets: [outlet({ airside: 'landside', level: 'Level 0', openingHours: '06:00 - 21:00' })],
  }),
  eric_kayser_t2e: restaurant({
    name: 'Eric Kayser', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('maison-kayser.com'), website: 'https://www.maison-kayser.com', description: DESC.ericKayser,
    outlets: [outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Gates K', openingHours: '06:00 - 23:00' })],
  }),
  exki_t2e: restaurant({
    name: 'Exki', cuisine: 'Healthy, Organic', amenity: 'fast_food',
    logoUrl: logo('exki.com'), website: 'https://www.exki.com', description: DESC.exki,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates L', phone: '+33 (0)1 74 37 14 16', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'landside', level: 'Level 2', phone: '+33(0)1 74 25 06 60', openingHours: '06:00 - 21:30' }),
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Gates K', phone: '+33 (0)1 74 25 29 17', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates M', phone: '+33 (0)1 74 37 14 70', openingHours: '07:00 - 16:00' }),
    ],
  }),
  food_cafe_t2e: restaurant({
    name: 'Food & Café', cuisine: 'Bakery, Café', amenity: 'cafe',
    phone: '+33 (0)1 74 25 03 60', description: DESC.foodCafe,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates M', openingHours: '07:00 - 16:00' })],
  }),
  i_love_paris_t2e: restaurant({
    name: 'I love Paris by Guy Martin', cuisine: 'French, Chef’s kitchen', amenity: 'restaurant',
    phone: '+33 (0)1 74 37 14 30', description: DESC.iLoveParis,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates L', openingHours: '08:00 - 21:00' })],
  }),
  mcdonalds_t2e: restaurant({
    name: "McDonald's", cuisine: 'American, Fast Food', amenity: 'fast_food',
    logoUrl: logo('mcdonalds.fr'), website: 'https://www.mcdonalds.fr',
    phone: '+33 (0)1 74 25 06 00', description: DESC.mcdonalds,
    outlets: [outlet({ airside: 'landside', level: 'Level 2', openingHours: '06:00 - 22:30' })],
  }),
  miyou_t2e: restaurant({
    name: 'Miyou', cuisine: 'Healthy, Sandwiches', amenity: 'fast_food',
    phone: '+33 (0)1 74 37 14 30', description: DESC.miyou,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates L', openingHours: '08:00 - 21:00' })],
  }),
  paul_t2e: restaurant({
    name: 'Paul', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('paul.fr'), website: 'https://www.paul.fr',
    phone: '+33 (0)1 74 37 13 79', description: DESC.paul,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates M', openingHours: '07:00 - 16:00' })],
  }),
  pret_t2e: restaurant({
    name: 'Pret A Manger', cuisine: 'Healthy, Sandwiches', amenity: 'fast_food',
    logoUrl: logo('pret.fr'), website: 'https://www.pret.fr', description: DESC.pret,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Gates K', phone: '+33 (0)1 48 32 26 47', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates L', phone: '+33 (0)1 74 25 03 42', openingHours: '06:00 - 22:00' }),
    ],
  }),
  starbucks_t2e: restaurant({
    name: 'Starbucks Coffee', cuisine: 'Coffee, Café', amenity: 'cafe',
    logoUrl: logo('starbucks.fr'), website: 'https://www.starbucks.fr', description: DESC.starbucks,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates L', phone: '+33 (0)1 48 62 24 92', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates M', phone: '+33 (0)1 48 16 05 95', openingHours: '07:00 - 16:00' }),
    ],
  }),
  sushi_t2e: restaurant({
    name: 'Sūshi', cuisine: 'Japanese', amenity: 'restaurant', description: DESC.sushi,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', locationNotes: 'Gates K', phone: '+33 (0) 1 48 62 21 38', openingHours: '07:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 1', locationNotes: 'Gates L', phone: '+33 (0)1 48 16 02 86', openingHours: '08:00 - 22:30' }),
    ],
  }),
};

// ─── Terminal 2F ──────────────────────────────────────────────────────────

const t2fVenues = {
  bellota_bellota_t2f: restaurant({
    name: 'Bellota-Bellota', cuisine: 'Spanish, Iberian', amenity: 'restaurant',
    phone: '+33 (0)1 48 62 24 31', description: DESC.bellota,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '05:30 - 21:30' })],
  }),
  byzance_t2f: restaurant({
    name: 'Byzance Gourmet Food Bar', cuisine: 'Seafood, Gourmet', amenity: 'restaurant',
    phone: '+33 (0)1 48 16 03 68', description: DESC.byzance,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '06:00 - 21:30' })],
  }),
  brioche_doree_t2f: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr',
    phone: '+33 (0)1 48 16 02 63', description: DESC.brioche,
    outlets: [outlet({ airside: 'landside', level: 'Level 0', openingHours: '07:00 - 21:00' })],
  }),
  exki_t2f: restaurant({
    name: 'Exki', cuisine: 'Healthy, Organic', amenity: 'fast_food',
    logoUrl: logo('exki.com'), website: 'https://www.exki.com', description: DESC.exki,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 1', phone: '+33 (0)1 74 25 32 20', openingHours: '06:00 - 21:30' }),
      outlet({ airside: 'airside', level: 'Level 2', phone: '+33 (0)1 70 03 91 20', openingHours: '06:00 - 21:30' }),
    ],
  }),
  laduree_t2f: restaurant({
    name: 'Ladurée', cuisine: 'French, Chef’s kitchen', amenity: 'restaurant',
    logoUrl: logo('laduree.fr'), website: 'https://www.laduree.fr',
    phone: '+33 (0)1 74 25 47 12', description: DESC.laduree,
    outlets: [outlet({ airside: 'landside', level: 'Level 2', openingHours: '06:00 - 21:00' })],
  }),
  maison_pradier_t2f: restaurant({
    name: 'Maison Pradier', cuisine: 'French, Bakery', amenity: 'bakery',
    phone: '+33 (0)1 48 16 35 22', description: DESC.maisonPradier,
    outlets: [outlet({ airside: 'airside', level: 'Level 2', openingHours: '06:00 - 21:30' })],
  }),
  mcdonalds_t2f: restaurant({
    name: "McDonald's", cuisine: 'American, Fast Food', amenity: 'fast_food',
    logoUrl: logo('mcdonalds.fr'), website: 'https://www.mcdonalds.fr',
    phone: '+33 (0)1 48 16 32 86', description: DESC.mcdonalds,
    outlets: [outlet({ airside: 'landside', level: 'Level 2', openingHours: '06:00 - 22:00' })],
  }),
  paul_t2f: restaurant({
    name: 'Paul', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('paul.fr'), website: 'https://www.paul.fr', description: DESC.paul,
    outlets: [
      outlet({ airside: 'landside', level: 'Level 2', phone: '+33 (0)1 74 25 19 20', openingHours: '05:00 - 21:00' }),
      outlet({ airside: 'airside', level: 'Level 1', phone: '+33 (0)1 48 62 05 25', openingHours: '06:00 - 21:30' }),
      outlet({ airside: 'airside', level: 'Level 2', phone: '+33(0)1 48 62 42 83', openingHours: '06:00 - 21:30' }),
    ],
  }),
  pret_t2f: restaurant({
    name: 'Pret A Manger', cuisine: 'Healthy, Sandwiches', amenity: 'fast_food',
    logoUrl: logo('pret.fr'), website: 'https://www.pret.fr',
    phone: '+33 (0)1 48 62 25 20', description: DESC.pret,
    outlets: [outlet({ airside: 'airside', level: 'Level 2', openingHours: '05:30 - 21:30' })],
  }),
  starbucks_t2f: restaurant({
    name: 'Starbucks Coffee', cuisine: 'Coffee, Café', amenity: 'cafe',
    logoUrl: logo('starbucks.fr'), website: 'https://www.starbucks.fr', description: DESC.starbucks,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 1', phone: '+33 (0)1 74 25 19 12', openingHours: '06:00 - 21:30' }),
      outlet({ airside: 'landside', level: 'Level 2', phone: '+33 (0)1 74 25 19 11', openingHours: '06:00 - 21:00' }),
    ],
  }),
  sushi_t2f: restaurant({
    name: 'Sūshi', cuisine: 'Japanese', amenity: 'restaurant',
    phone: '+33 (0)1 48 62 09 80', description: DESC.sushi,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '08:00 - 21:30' })],
  }),
  french_taste_t2f: restaurant({
    name: 'The French Taste by Guy Martin', cuisine: 'French, Brasserie', amenity: 'restaurant',
    phone: '+33(0)1 74 37 08 65', description: DESC.frenchTaste,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '06:30 - 21:30' })],
  }),
};

// ─── Terminal 2G ──────────────────────────────────────────────────────────

const t2gVenues = {
  exki_t2g: restaurant({
    name: 'Exki', cuisine: 'Healthy, Organic', amenity: 'fast_food',
    logoUrl: logo('exki.com'), website: 'https://www.exki.com',
    phone: '+33 (0)1 70 03 80 24', description: DESC.exki,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '06:00 - 21:30' })],
  }),
  paul_t2g: restaurant({
    name: 'Paul', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('paul.fr'), website: 'https://www.paul.fr',
    phone: '+33 (0)1 48 62 03 31', description: DESC.paul,
    outlets: [outlet({ airside: 'landside', level: 'Level 0', openingHours: '06:00 - 20:00' })],
  }),
  starbucks_t2g: restaurant({
    name: 'Starbucks Coffee', cuisine: 'Coffee, Café', amenity: 'cafe',
    logoUrl: logo('starbucks.fr'), website: 'https://www.starbucks.fr',
    phone: '+33 (0)1 74 25 01 00', description: DESC.starbucks,
    outlets: [outlet({ airside: 'airside', level: 'Level 1', openingHours: '06:00 - 21:30' })],
  }),
};

// ─── Terminal 3 ───────────────────────────────────────────────────────────

const t3Venues = {
  brioche_doree_t3: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr',
    phone: '+33 (0)1 48 62 16 72', description: DESC.brioche,
    outlets: [outlet({ airside: 'landside', level: 'Level 0', openingHours: '08:00 - 20:30' })],
  }),
  paul_t3: restaurant({
    name: 'Paul', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('paul.fr'), website: 'https://www.paul.fr',
    phone: '+33 (0)1 48 62 10 03', description: DESC.paul,
    outlets: [outlet({ airside: 'landside', level: 'Level 0', openingHours: '05:00 - 22:30' })],
  }),
  pret_t3: restaurant({
    name: 'Pret A Manger', cuisine: 'Healthy, Sandwiches', amenity: 'fast_food',
    logoUrl: logo('pret.fr'), website: 'https://www.pret.fr', description: DESC.pret,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 0', locationNotes: 'Schengen departures', phone: '+33 (0)1 74 37 10 76', openingHours: '05:20 - 18:20' }),
      outlet({ airside: 'airside', level: 'Level 0', locationNotes: 'International departures', phone: '+33 (0)1 74 37 11 12', openingHours: '04:30 - 23:00' }),
    ],
  }),
};

// ─── Roissypole (central landside transit-hub building) ─────────────────────

const roissypoleVenues = {
  brioche_doree_roissypole: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr',
    phone: '+33 (0)1 74 25 15 86', description: DESC.brioche,
    outlets: [outlet({ airside: 'landside', level: 'Level 0', openingHours: '06:00 - 17:00' })],
  }),
};

// ─── Gare TGV (CDG train station) ────────────────────────────────────────────

const gareTgvVenues = {
  brioche_doree_gare_tgv: restaurant({
    name: 'Brioche Dorée', cuisine: 'French, Bakery', amenity: 'bakery',
    logoUrl: logo('briochedoree.fr'), website: 'https://www.briochedoree.fr',
    phone: '+33 (0)1 74 29 45 87', description: DESC.brioche,
    outlets: [outlet({ airside: 'landside', level: 'Level 1', openingHours: '06:00 - 21:00' })],
  }),
};

// ─── upload: detect airport slug, match existing docs by normalized name ────

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
  const existingByName = new Map();
  existingSnap.forEach((doc) => {
    const data = doc.data();
    if (data && data.name) existingByName.set(normalizeName(data.name), doc.id);
  });

  console.log(`\n${terminalName} (${terminalId}): found ${existingByName.size} existing restaurant doc(s).`);

  const batch = db.batch();
  let updated = 0;
  let created = 0;

  for (const [key, data] of Object.entries(venues)) {
    const norm = normalizeName(data.name);
    const existingId = existingByName.get(norm);
    if (existingId) {
      batch.set(restCol.doc(existingId), data, { merge: false });
      console.log(`  UPDATE  ${data.name}  ->  ${terminalId}/${existingId}`);
      updated++;
    } else {
      const newId = key || slugify(`${data.name}_${terminalId}`);
      batch.set(restCol.doc(newId), data, { merge: false });
      console.log(`  CREATE  ${data.name}  ->  ${terminalId}/${newId}`);
      created++;
    }
  }

  if (created > 0) {
    await db.collection('airports').doc(AIRPORT).collection('terminals').doc(terminalId)
      .set({ name: terminalName }, { merge: true });
  }

  await batch.commit();
  return { updated, created };
}

async function main() {
  const AIRPORT = AIRPORT_ID_OVERRIDE || await findAirportId();
  console.log(`Using airport doc '${AIRPORT}'.`);

  const results = [];
  results.push(await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', t1Venues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2A, 'Terminal 2A', t2aVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2AC, 'Terminal 2A-2C', t2acVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2B, 'Terminal 2B', t2bVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2BD, 'Terminal 2BD', t2bdVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2C, 'Terminal 2C', t2cVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2D, 'Terminal 2D', t2dVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2E, 'Terminal 2E', t2eVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2F, 'Terminal 2F', t2fVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_2G, 'Terminal 2G', t2gVenues));
  results.push(await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues));
  results.push(await processTerminal(AIRPORT, ROISSYPOLE, 'Roissypole', roissypoleVenues));
  results.push(await processTerminal(AIRPORT, GARE_TGV, 'Gare TGV', gareTgvVenues));

  const allVenueMaps = [
    t1Venues, t2aVenues, t2acVenues, t2bVenues, t2bdVenues, t2cVenues, t2dVenues,
    t2eVenues, t2fVenues, t2gVenues, t3Venues, roissypoleVenues, gareTgvVenues,
  ];
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
  const totalVenues = allVenueMaps.reduce((sum, m) => sum + Object.keys(m).length, 0);

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
