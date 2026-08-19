'use strict';
/**
 * Fills in complete data for all Manchester Airport (MAN) restaurants/bars/
 * cafés in Firestore, cross-referenced against the official Manchester
 * Airport restaurants directory (manchesterairport.co.uk/at-the-airport/
 * restaurants/) and each venue's own detail page on 2026-08-05.
 *
 * The directory page is a Next.js app whose listing (24 food & drink venues)
 * and per-venue metadata — terminal(s), before/after-security location(s),
 * category tags, and dietary tags (Vegetarian/Vegan/Gluten Free/Halal) — are
 * all embedded in the page's __NEXT_DATA__ JSON payload, which was read
 * directly rather than scraped from rendered text. Each venue's own detail
 * page was then visited for its description, phone number and opening
 * hours; three brands (Costa Coffee, KFC, Pret a Manger) have their hours
 * split across a T2/T3 tab widget that had to be clicked through to read
 * each terminal's own outlet(s).
 *
 * Manchester Airport currently only has live food & drink units in
 * Terminal 2 and Terminal 3 — the directory's own filters only offer T2/T3
 * (no T1 filter exists), matching Terminal 1's retail/catering closure.
 * Docs are grouped by (name, terminal), matching the Dublin/Frankfurt/
 * Lisbon/Gatwick/Heathrow/Madrid convention: multiple physical counters of
 * the same brand WITHIN one terminal are combined into a single doc with
 * multiple `outlets[]` (e.g. Costa's Departures + Arrivals counters in T2,
 * Starbucks' 3 T2 counters). A brand present in MULTIPLE terminals gets a
 * separate doc per terminal (Costa Coffee: 2 docs; KFC: 2 docs; Pret a
 * Manger: 2 docs).
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - `airside` is inferred per outlet from its own location label: "Check-
 *     In" and "Arrivals" outlets are landside (before security); "Departure
 *     Lounge"/"Departures" outlets are airside (after security) — except
 *     Starbucks, whose own venue-level metadata tags ALL of its outlets
 *     (including the one literally named "Departures") as "Before
 *     Security", so all three of its outlets are marked landside here to
 *     match that authoritative tag rather than the outlet's own label.
 *   - Dietary tags (vegetarian/vegan/gluten-free/halal) come directly from
 *     each venue's own `tags` array in the site's structured data — not
 *     inferred from descriptions — so they're unusually reliable this time.
 *     No venue lists kosher options, so that field is left blank throughout.
 *   - `website`/`logo_url` are only filled in for brands independently
 *     verifiable as real national/international chains (Costa Coffee,
 *     Greggs, KFC, Pret A Manger, Starbucks, Giraffe, Upper Crust, San
 *     Carlo, Barburrito, Joe & The Juice, Wrapchic, Pasta Evangelists,
 *     Grindsmith) — Manchester Airport-exclusive concepts (Amber Alehouse,
 *     Apiary, Archie's, Brew'd, The Bridgewater Exchange, Fever-Tree, Great
 *     Northern Market, Pot Kettle Black, Sporting Chance, The Evergreen Bar
 *     & Brasserie, The Nook) are left blank rather than guessing a domain.
 *
 * Manchester appears in BOTH reference scripts but with conflicting slugs —
 * same pattern as Gatwick/Heathrow: upload_to_firestore.py uses 'man', while
 * migrate_firestore.js and cleanup_firestore.js (the current-schema-aware,
 * more authoritative tools) both list 'manchester'. This script auto-
 * detects the airport slug at runtime (checking 'manchester' first, then
 * 'man', using whichever has existing terminal data) and matches existing
 * restaurant docs by normalized name within each terminal — updating in
 * place if found, creating new otherwise. It never creates a new
 * `airports/{id}` metadata doc itself.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_man_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['manchester', 'man'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

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

function normalizeName(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ─── Terminal 2 venues ────────────────────────────────────────────────────

const t2Venues = {
  amber_alehouse: restaurant({
    name: 'Amber Alehouse',
    cuisine: 'Gastropub, British',
    amenity: 'bar',
    vegetarian: true,
    vegan: true,
    phone: '01614 896149',
    description: "Amber Alehouse is a tribute to being different and non-conformant - rebelling against imposed fashions, brands, and behaviours, much like Manchester from the 1970s through to the 1990s. Guests can enjoy a selection of quality microbrewed beers through an exclusive partnership with Seven Bro7hers, alongside a wide range of comfort dishes and signature recipes - from vegan favourites like Argy Bhaji to the stage-worthy Beef & Bourbon Burger, rounded out with generous breakfast stacks.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:30 - 20:00' })],
  }),
  apiary: restaurant({
    name: 'Apiary',
    cuisine: 'Bar, Modern British',
    amenity: 'bar',
    vegetarian: true,
    description: 'A luxury artisan bar and eatery offering delicious breakfasts, lunch and dinner menus centred around exotic and exquisite seasonal flavours using locally sourced, in-season ingredients. A high-energy bar infused with visual impact, creativity and glamour, designed to entertain and impress, with stunning airfield views.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '04:00 - 20:00' })],
  }),
  archies: restaurant({
    name: "Archie's",
    cuisine: 'American, Burgers',
    amenity: 'fast_food',
    vegetarian: true,
    halal: true,
    description: "Famous for a dazzling array of creative and delicious burgers, shakes, waffles and more, in a stunning bright pink, iconic and instagrammable restaurant.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:00 - 22:00' })],
  }),
  barburrito: restaurant({
    name: 'Barburrito',
    cuisine: 'Mexican, Fast Food',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    logoUrl: logo('barburrito.co.uk'),
    website: 'https://www.barburrito.co.uk',
    description: 'Fast, delicious Mexican street food, handcrafted and expertly put together, with food perfected over a decade and passed down through la familia — made with the freshest possible ingredients every day.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:30 - 20:00' })],
  }),
  bridgewater: restaurant({
    name: 'The Bridgewater Exchange',
    cuisine: 'British, Pub',
    amenity: 'pub',
    vegetarian: true,
    vegan: true,
    description: 'A classic Mancunian pub in a modern airport, serving proper Northern grub from steak and ale pie to a Manchester Tart, local favourites, top traditional meals and beers brewed right here, with Mancunian attitude and warm hospitality.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge, near the Lounges', openingHours: '24 hours', open247: true })],
  }),
  costa_t2: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('costa.co.uk'),
    website: 'https://www.costa.co.uk',
    phone: '01614 907020',
    description: "Tempting speciality drinks for all coffee lovers, from espressos to lattes, and even babychinos for the little ones, plus a wide range of savoury snacks such as sandwiches, paninis and wraps, or sweet treats such as chocolate twists, Linzer biscuits and muffins that can be eaten in or taken away.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '02:00 - 20:00' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '05:00 - 20:00' }),
    ],
  }),
  fever_tree: restaurant({
    name: 'Fever-Tree',
    cuisine: 'Bar, Modern British',
    amenity: 'bar',
    vegetarian: true,
    vegan: true,
    description: 'The premium pitstop before your final destination — a sophisticated space to enjoy a meal or snack from a carefully curated all-day menu, highlighting bold flavours with local, seasonal ingredients paired with mixers, soft drinks, beer, wine, sparkling drinks and spirits.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:00 - 22:00' })],
  }),
  giraffe: restaurant({
    name: 'Giraffe',
    cuisine: 'International, Family',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    logoUrl: logo('giraffe.net'),
    website: 'https://www.giraffe.net',
    description: "An ever-changing menu and artisan coffee, from pre-flight breakfasts like huevos rancheros to the flavourful Smoky Joe burger, with fresh fruit juices, smoothies, beers, seasonal chef specials, tasty salads and a special kids' menu.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: 'Mon 03:30-20:00; Tues 03:30-22:30; Wed-Thurs 03:00-21:00; Fri 03:00-20:00; Sat 03:30-22:00; Sun 03:00-21:00' })],
  }),
  great_northern_market: restaurant({
    name: 'Great Northern Market',
    cuisine: 'Street Food, International',
    amenity: 'food_court',
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    halal: true,
    description: "A collection of standout street food kitchens inspired by the electric energy of Manchester's legendary food scene — six diverse kitchens serving barista-made coffee and breakfast classics through to butter chicken, smash burgers and Neapolitan pizza, plus a curated drinks selection at the bar. No reservations, no fuss.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge, after security', openingHours: '03:00 - 21:00' })],
  }),
  greggs: restaurant({
    name: 'Greggs',
    cuisine: 'Bakery, Fast Food',
    amenity: 'bakery',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('greggs.co.uk'),
    website: 'https://www.greggs.co.uk',
    description: "A contemporary food-on-the-go experience — from the legendary sausage or vegan sausage roll to the famous steak bake, chicken goujons and iced buns, the most popular dining brand in the UK.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '24 hours', open247: true })],
  }),
  grindsmith: restaurant({
    name: 'Grindsmith',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    vegetarian: true,
    logoUrl: logo('grindsmith.com'),
    website: 'https://www.grindsmith.com',
    description: 'Coffee roasted locally in Manchester and finished with milk sourced from the North West of England — championing the best local produce for superior quality in every cup and on every plate, conveniently located just after security.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '02:00 - 20:00' })],
  }),
  joe_the_juice: restaurant({
    name: 'Joe & The Juice',
    cuisine: 'Juice Bar, Café',
    amenity: 'cafe',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('joejuice.com'),
    website: 'https://www.joejuice.com',
    description: 'Fresh juices, smoothies and gourmet sandwiches to beat jet lag — try the Go Away Doc with carrot, apple and ginger, or the Hydration Station with coconut water, apple, ginger, spinach and lemon, plus speciality coffee, matcha and teas.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:00 - 22:00' })],
  }),
  kfc_t2: restaurant({
    name: 'KFC',
    cuisine: 'Fast Food, Chicken',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('kfc.co.uk'),
    website: 'https://www.kfc.co.uk',
    phone: '01614 892342',
    description: "From crispy tenders to juicy wings, freshly made chicken crafted with 11 secret herbs and spices, created more than 70 years ago — a go-to spot for delicious comfort food, refreshing beverages and irresistible desserts. Pre-order on Grab and collect in 15 minutes.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '10:00 - 20:00' })],
  }),
  pasta_evangelists: restaurant({
    name: 'Pasta Evangelists',
    cuisine: 'Italian, Pasta',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('pastaevangelists.com'),
    website: 'https://www.pastaevangelists.com',
    description: 'Fresh, artisan pasta made the Italian way, plus Italian-inspired breakfasts before or during your flight and signature sauces to elevate pasta at home. Benvenuti!',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:30 - 20:00' })],
  }),
  pot_kettle_black: restaurant({
    name: 'Pot Kettle Black',
    cuisine: 'Coffee, Bakery',
    amenity: 'cafe',
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    phone: '01614 896131',
    description: 'An independent coffee shop and bakehouse inspired by Antipodean coffee culture, with a passion for great coffee and vibrant, feel-good food — freshly baked pastries, hearty sourdough and award-winning coffee.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:30 - 20:00' })],
  }),
  pret_t2: restaurant({
    name: 'Pret a Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    description: 'Freshly made food and organic arabica coffee, no exceptions — since 1986, baguettes, salads, toasties, bakery treats and more made every day in shop kitchens in (or very near to) each shop.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '03:00 - 22:00' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '05:00 - 19:00' }),
    ],
  }),
  san_carlo: restaurant({
    name: 'San Carlo',
    cuisine: 'Italian',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    description: 'Italian dining at its finest, with views to match — a traditional Italian menu made with exceptional ingredients, reinterpreting the Venetian custom of cicchetti alongside elegant Italian classics: pizza, pasta, a refined pesce and carne menu including a 10oz ribeye steak, light bites, salads, sides and an expertly created kids’ menu.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: 'Mon 03:00-21:00; Tues 03:00-20:00; Wed 03:30-22:00; Thurs 03:00-20:00; Fri 03:30-22:30; Sat 03:00-21:00; Sun 03:00-22:30' })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.com',
    phone: '01614 377957',
    description: "One of the world's most iconic coffee brands, offering a wide range of freshly roasted coffees, Italian-style espressos and ice-blended drinks, plus paninis, sandwiches, cakes and pastries.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Check-In', openingHours: '03:00 - 18:00' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '24 hours', open247: true }),
      outlet({ airside: 'landside', locationNotes: 'Departures', openingHours: '02:30 - 00:00' }),
    ],
  }),
  evergreen_bar_and_brasserie: restaurant({
    name: 'The Evergreen Bar & Brasserie',
    cuisine: 'British, Brasserie',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    description: 'A smart, traditional retreat sourcing artisan ingredients from local suppliers, including meat from Birtwistles Butchers, homemade jams from F Duerr & Sons Ltd, and premium spirits and fine regional cheeses. Hearty breakfast brioches, Eggs Benedict, truffle and parmesan mac and cheese, gourmet burgers, healthy salads, and a Little Flyers kids’ menu.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: 'Mon 03:30-22:30; Tues 03:30-21:00; Wed 03:30-20:00; Thurs 03:30-22:00; Fri 03:30-21:00; Sat-Sun 03:30-20:00' })],
  }),
  upper_crust: restaurant({
    name: 'Upper Crust',
    cuisine: 'Sandwiches, Bakery',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    description: 'Freshly baked baguettes, super sourdough and multi-grain sourdough delivered straight from the oven, with fillings including Serrano ham, fresh mozzarella, basil pesto, Kalamata olives, pastrami, Emmental cheese, 100% chicken breast and vine-ripened tomatoes.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: '03:30 - 20:00' })],
  }),
  wrapchic: restaurant({
    name: 'Wrapchic',
    cuisine: 'Indian, Fast Food',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('wrapchic.com'),
    website: 'https://www.wrapchic.com',
    description: "The home of the Indian Burrito — bold, aromatic flavours of Mumbai street food wrapped in a classic burrito-style format, bringing the best of two great food cultures into every bite.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '11:00 - 18:00' })],
  }),
};

// ─── Terminal 3 venues ────────────────────────────────────────────────────

const t3Venues = {
  brew_d: restaurant({
    name: "Brew'd",
    cuisine: 'Coffee, Beer, Café',
    amenity: 'cafe',
    vegetarian: true,
    vegan: true,
    phone: '01614 892342',
    description: "A dynamic and inviting concept fusing two beloved brews: coffee and beer. An all-day destination to savour expertly brewed beverages and delicious bites — freshly brewed coffee, artisanal teas, crisp draught beers, bakery items, hearty sandwiches and delicious bites.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: 'Mon 04:00-21:00; Tues 04:00-17:00; Wed-Sun 04:00-21:00' })],
  }),
  costa_t3: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('costa.co.uk'),
    website: 'https://www.costa.co.uk',
    phone: '01614 907020',
    description: "Tempting speciality drinks for all coffee lovers, from espressos to lattes, and even babychinos for the little ones, plus a wide range of savoury snacks such as sandwiches, paninis and wraps, or sweet treats such as chocolate twists, Linzer biscuits and muffins that can be eaten in or taken away.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: 'Mon 03:00-22:00; Tues 03:00-22:30; Wed 03:00-22:15; Thurs 03:00-22:30; Fri-Sat 03:00-22:45; Sun 03:00-22:00' })],
  }),
  kfc_t3: restaurant({
    name: 'KFC',
    cuisine: 'Fast Food, Chicken',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('kfc.co.uk'),
    website: 'https://www.kfc.co.uk',
    phone: '01614 892342',
    description: "From crispy tenders to juicy wings, freshly made chicken crafted with 11 secret herbs and spices, created more than 70 years ago — a go-to spot for delicious comfort food, refreshing beverages and irresistible desserts. Pre-order on Grab and collect in 15 minutes.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: 'Mon 04:00-21:45; Tues 04:00-22:00; Wed-Sat 04:00-22:00; Sun 04:00-21:45' })],
  }),
  pret_t3: restaurant({
    name: 'Pret a Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    description: 'Freshly made food and organic arabica coffee, no exceptions — since 1986, baguettes, salads, toasties, bakery treats and more made every day in shop kitchens in (or very near to) each shop.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: 'Mon-Wed 03:30-21:00; Thurs-Fri 03:30-22:00; Sat 03:30-22:00; Sun 03:30-21:00' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '06:00 - 19:00' }),
    ],
  }),
  sporting_chance: restaurant({
    name: 'Sporting Chance',
    cuisine: 'Sports Bar, British',
    amenity: 'bar',
    vegetarian: true,
    vegan: true,
    description: "The first sports bar in Manchester Airport! Two bars, over 50 TVs to watch your favourite sports, a menu including the Heavyweight Challenge Burger and Sin Bin Sundaes, and sports memorabilia — build your own breakfast plate, enjoy a Half-time Pie with mash and gravy, or bite down on a classic burger.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: 'Mon 03:00-22:00; Tues-Wed 03:00-22:15; Thurs 03:00-22:30; Fri-Sat 03:00-22:45; Sun 03:00-22:00' })],
  }),
  the_nook: restaurant({
    name: 'The Nook',
    cuisine: 'Bar, Wine Bar',
    amenity: 'bar',
    vegetarian: true,
    vegan: true,
    phone: '01614 892342',
    description: 'A contemporary and elegant atmosphere to enjoy an excellent drink and a delicious small bite, with views of the runway — a wide selection of wines, spirits, bubbles and craft beers, all paired with delicious small bites.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departure Lounge', openingHours: 'Mon 04:00-21:00; Tues 04:00-17:00; Wed-Sun 04:00-21:00' })],
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

  const t2Result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', t2Venues);
  const t3Result = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues);

  const totalUpdated = t2Result.updated + t3Result.updated;
  const totalCreated = t2Result.created + t3Result.created;
  const totalVenues = Object.keys(t2Venues).length + Object.keys(t3Venues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
