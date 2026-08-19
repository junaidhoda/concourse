'use strict';
/**
 * Fills in complete data for all Dublin Airport (DUB) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official Dublin Airport
 * "Cafés & Restaurants" directory
 * (dublinairport.com/at-the-airport/restaurants/cafes-restaurants) on 2026-08-03.
 *
 * Unlike AMS/ATH/BHX/BRU, Dublin Airport has TWO terminals (T1 and T2), and the
 * live directory tags every venue with its terminal + before/after security
 * zone directly in the listing (e.g. "T1 AFTER SECURITY"), along with hours and
 * a short description — no need to visit individual detail pages.
 *
 * Docs are grouped by (name, terminal): a brand with multiple physical counters
 * WITHIN THE SAME terminal (e.g. Cloud Picker's two T2 gates, Starbucks' two T2
 * locations, Phoenix Lane's two T2 gates) is combined into one doc with multiple
 * `outlets[]`. A brand appearing in BOTH terminals (e.g. Burger King, Cloud
 * Picker, Butlers Chocolate Café, Starbucks, Phoenix Lane Express) gets a
 * SEPARATE doc per terminal, matching how upload_to_firestore.py's `clean()` /
 * `upload()` helpers structure every other multi-terminal airport in this repo
 * (Heathrow, CDG, etc.) — restaurants live under
 * airports/{airport}/terminals/{terminal}/restaurants, one doc per terminal.
 *
 * The site's listing doesn't provide phone numbers or dietary tags, so those
 * fields are left blank/false throughout — that reflects what's actually
 * published, not a gap in the research.
 *
 * Because Firebase Console access isn't available to confirm the exact live
 * airport slug or existing doc IDs, this script auto-detects the airport slug
 * at runtime (checking 'dublin' then 'dub', using whichever has existing
 * terminal data) and matches existing restaurant docs by normalized name
 * within each terminal — updating in place if found, creating new otherwise.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_dub_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['dublin', 'dub'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';

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

const BEFORE = 'Before security.';
const AFTER = 'After security.';

// ─── T1 venues ────────────────────────────────────────────────────────────

const t1Venues = {
  arthur_guinness_bar: restaurant({
    name: 'Arthur Guinness Bar',
    cuisine: 'Bar, Irish',
    amenity: 'bar',
    description: 'Experience beloved favourites named after Mr Guinness himself.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  bluebird_coffee_roasters: restaurant({
    name: 'Bluebird Coffee Roasters',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Grab freshly roasted coffee, pastries, gourmet sandwiches, wine, and cheeseboards.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  boxx: restaurant({
    name: 'Boxx',
    cuisine: 'Asian, Fusion',
    amenity: 'restaurant',
    description: 'Fast and fresh Asian fusion food offering a full Boxx breakfast, juices, beer, and wine.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  bruno_pizza: restaurant({
    name: 'Bruno Pizza',
    cuisine: 'Pizza, Italian',
    amenity: 'fast_food',
    description: 'Serving up fresh pizza by the slice every day. Grab and go with a range of different toppings and sauces.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 11:00 - 21:00' })],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('bk.com'),
    description: 'Enjoy signature recipes and a family-friendly dining experience in this fast food staple.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 22:00' }),
    ],
  }),
  butlers_chocolate_cafe: restaurant({
    name: 'Butlers Chocolate Café',
    cuisine: 'Café, Chocolate',
    amenity: 'cafe',
    description: 'Savour freshly prepared coffees and hot chocolate, and a range of treats and gourmet sandwiches.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  cibo: restaurant({
    name: 'Cibo',
    cuisine: 'Italian, Café',
    amenity: 'restaurant',
    description: 'Cibo brings you delicious pizzas, focaccia sandwiches, ice creams, coffees and acai bowls.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 22:00' })],
  }),
  cloud_picker: restaurant({
    name: 'Cloud Picker',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'They offer premium coffee and snacks for those who crave the height of quality and flavour.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  cuan: restaurant({
    name: 'Cuan',
    cuisine: 'Pub, Irish',
    amenity: 'pub',
    description: 'A cosy nook to pick up a pint or some food before you set off on your adventure.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - Last Flight' })],
  }),
  food_village: restaurant({
    name: 'Food Village',
    cuisine: 'International, Food Court',
    amenity: 'food_court',
    description: 'Offers a wide variety of hot dishes, drinks, salads, sandwiches, and pastries.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 19:00' })],
  }),
  insomnia: restaurant({
    name: 'Insomnia',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Enjoy fairtrade coffee alongside snacks and sandwiches specially made with local produce.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: '24 hours', open247: true })],
  }),
  jump_juice: restaurant({
    name: 'Jump Juice',
    cuisine: 'Smoothies, Juice',
    amenity: 'cafe',
    description: 'Satisfy your sweet tooth the right way with fresh juices, smoothies and frozen yoghurt.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 20:00' })],
  }),
  kimbok: restaurant({
    name: 'Kimbok',
    cuisine: 'Korean, Asian',
    amenity: 'restaurant',
    description: 'Celebrate the joy of Korean food with a full breakfast, all-day lunch, hot drinks, beer, and wine.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  lilians: restaurant({
    name: "Lilian's",
    cuisine: 'Irish, International',
    amenity: 'restaurant',
    description: 'Refuel before you fly with a menu of signature dishes and a selection of drinks, wine, and beer.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 05:00 - 20:00' })],
  }),
  marqette: restaurant({
    name: 'Marqette',
    cuisine: 'International, Food Court',
    amenity: 'food_court',
    description: 'A bustling food market offering self-service salads, sandwiches, soup, and a full bar and bakery on-site.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: '24 hours', open247: true })],
  }),
  nineteen40: restaurant({
    name: 'Nineteen40',
    cuisine: 'Café, Grab & Go',
    amenity: 'cafe',
    description: 'A grab & go style café bar with baked goods, sandwiches, salads, hot pots, and more.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun First Flight - Last Flight' })],
  }),
  nomad: restaurant({
    name: 'Nomad',
    cuisine: 'International, Healthy',
    amenity: 'restaurant',
    description: 'A thoughtful breakfast and all-day lunch menu with every ingredient consciously chosen.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 19:30' })],
  }),
  phoenix_lane_express_t1: restaurant({
    name: 'Phoenix Lane Express',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Serving comforting coffee, freshly baked pastries, and delicious sandwiches.',
    outlets: [outlet({ airside: 'airside', locationNotes: `${AFTER} Gate 114.`, openingHours: 'Mon-Sun 04:00 - 17:00' })],
  }),
  pret_a_manger: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches & Deli',
    amenity: 'cafe',
    logoUrl: logo('pret.com'),
    description: 'Pret’s freshly-made sandwiches, wraps, organic coffee, and more are ready for sit-in or take-out.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 22:00' })],
  }),
  san_marco: restaurant({
    name: 'San Marco',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'Indulge in an Italian-inspired breakfast or lunch with Italian wines, beers, spirits, and coffees.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 05:00 - 20:00' })],
  }),
  starbucks_t1: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    description: 'Convenient and quality coffee and cold drinks served with a variety of pastries and sandwiches.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 18:00' })],
  }),
  street_kitchen: restaurant({
    name: 'Street Kitchen',
    cuisine: 'Mexican',
    amenity: 'restaurant',
    description: 'Sample Mexican street food with burritos, rice bowls, and tacos over cocktails, wine, and beer.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 05:00 - 21:00' })],
  }),
  tap_and_brew: restaurant({
    name: 'Tap & Brew',
    cuisine: 'Bar, American',
    amenity: 'bar',
    description: 'A kitchen and bar offering local beers, gourmet hot dogs, loaded nachos, and tasty waffles.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - Last Flight' })],
  }),
  the_garden_terrace: restaurant({
    name: 'The Garden Terrace',
    cuisine: 'International, Grill',
    amenity: 'restaurant',
    description: 'Enjoy a full bar, café and grill with table service alongside an outdoor terrace.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  the_gate_clock: restaurant({
    name: 'The Gate Clock',
    cuisine: 'Bar, Café',
    amenity: 'bar',
    description: 'Enjoy a variety of drinks, snacks, and sandwiches in this warm and charming space.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun First Flight - Last Flight' })],
  }),
  the_clipper: restaurant({
    name: 'The Clipper',
    cuisine: 'Pub, Bar',
    amenity: 'pub',
    description: 'Ideal for meeting before the flight, enjoy a range of drinks, live sports, an all-day menu & more!',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 07:00 - 23:30' })],
  }),
  upper_crust: restaurant({
    name: 'Upper Crust',
    cuisine: 'Café, Sandwiches & Deli',
    amenity: 'cafe',
    description: 'Enjoy a wide variety of hand-filled baguette sandwiches, tea, coffee and cold drinks.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 05:00 - 23:00' })],
  }),
};

// ─── T2 venues ────────────────────────────────────────────────────────────

const t2Venues = {
  bewleys: restaurant({
    name: "Bewley's",
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: "Bewley's is Ireland's leading coffee and tea company. Connect over a cuppa while you snack.",
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: '24 hours', open247: true })],
  }),
  butlers_chocolate_cafe_t2: restaurant({
    name: 'Butlers Chocolate Café T2',
    cuisine: 'Café, Chocolate',
    amenity: 'cafe',
    description: 'Savour freshly prepared coffees and hot chocolate, and a range of treats and gourmet sandwiches.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 20:00' })],
  }),
  cloud_picker_t2: restaurant({
    name: 'Cloud Picker',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'They offer premium coffee and snacks for those who crave the height of quality and flavour.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${AFTER} Gate 402.`, openingHours: 'Mon-Sun First Flight - Last Flight' }),
      outlet({ airside: 'airside', locationNotes: `${AFTER} Gate 409.`, openingHours: 'Mon-Sun 05:00 - Last Flight' }),
    ],
  }),
  dubh: restaurant({
    name: 'Dubh',
    cuisine: 'Grab & Go, Café',
    amenity: 'fast_food',
    description: 'Get last-minute sandwiches, confectionery and coffee in the boarding gate area.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun First Flight - Last Flight' })],
  }),
  dubh_express: restaurant({
    name: 'Dubh Express',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Found at Gate 417, this Café Bar serves fresh coffee, teas, breakfast, pastries, and treats.',
    outlets: [outlet({ airside: 'airside', locationNotes: `${AFTER} Gate 417.`, openingHours: 'Mon-Sun 05:00 - 17:00' })],
  }),
  fitzgeralds: restaurant({
    name: 'Fitzgeralds',
    cuisine: 'Irish',
    amenity: 'restaurant',
    description: 'Seasonal Irish dishes for breakfast and lunch, made with fresh, locally sourced ingredients.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 19:30' })],
  }),
  fruitality: restaurant({
    name: 'Fruitality',
    cuisine: 'Smoothies, Healthy',
    amenity: 'cafe',
    description: "T2's juice & smoothie bar that includes acai bowls, salads, sandwiches, fruit pots, and more.",
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 20:30' })],
  }),
  moo_parlour: restaurant({
    name: 'Moo Parlour',
    cuisine: 'Ice Cream, Desserts',
    amenity: 'ice_cream',
    description: 'Enjoy delicious ice cream made only with 100% Irish dairy for that rich, creamy taste.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 22:00' })],
  }),
  papa_johns: restaurant({
    name: "Papa John's",
    cuisine: 'Pizza, Fast Food',
    amenity: 'fast_food',
    logoUrl: logo('papajohns.com'),
    description: 'Better Ingredients. Better Pizza. Freshly baked pizzas with a range of toppings and sides.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 22:00' })],
  }),
  phoenix_lane_express_t2: restaurant({
    name: 'Phoenix Lane Express',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Offering a range of self-service hot beverages, sandwiches and treats.',
    outlets: [outlet({ airside: 'airside', locationNotes: `${AFTER} Gate 336.`, openingHours: '24 hours', open247: true })],
  }),
  phoenix_lane: restaurant({
    name: 'Phoenix Lane',
    cuisine: 'Bar, Café',
    amenity: 'restaurant',
    description: 'Sample a range of toasties, sandwiches, salads, chilled drinks, pints and wines.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${AFTER} Gate 424.`, openingHours: 'Mon-Sun First Flight - Last Flight' }),
      outlet({ airside: 'airside', locationNotes: `${AFTER} South Gates.`, openingHours: 'Mon-Sun First Flight - Last Flight' }),
    ],
  }),
  roasted_notes: restaurant({
    name: 'Roasted Notes',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    description: 'Enjoy freshly baked croissants, pastries, signature sandwiches, toasties, and delicious coffee.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 23:00' })],
  }),
  ryans: restaurant({
    name: "Ryan's",
    cuisine: 'Pub, Irish',
    amenity: 'pub',
    description: "A new Irish pub in T2, you'll enjoy a smooth pint, a classic toastie, and homely hospitality.",
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  starbucks_t2: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    description: 'Convenient and quality coffee and cold drinks served with a variety of pastries and sandwiches.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 18:00' }),
      outlet({ airside: 'airside', locationNotes: `${AFTER} Gate 332.`, openingHours: 'Mon-Sun First Flight - Last Flight' }),
    ],
  }),
  supermacs: restaurant({
    name: "Supermac's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    description: "Enjoy prime beef burgers, succulent chicken, and more in Ireland's own fast food chain.",
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 22:00' })],
  }),
  supersubs: restaurant({
    name: 'SuperSubs',
    cuisine: 'Sandwiches & Deli, Fast Food',
    amenity: 'fast_food',
    description: 'Made-to-order subs, wraps and salads packed with quality Irish meats, cheeses and vegetables, perfect on the go.',
    outlets: [outlet({ airside: 'landside', locationNotes: BEFORE, openingHours: 'Mon-Sun 04:00 - 22:00' })],
  }),
  the_fallow_kitchen_and_bar: restaurant({
    name: 'The Fallow Kitchen & Bar',
    cuisine: 'Irish, International',
    amenity: 'restaurant',
    description: 'Offering breakfast, lunch, and dinner classics using quality Irish ingredients.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 03:30 - Last Flight' })],
  }),
  the_mezz: restaurant({
    name: 'The Mezz',
    cuisine: 'International, Food Court',
    amenity: 'food_court',
    description: "Sample brands like Camile Thai, Handsome Burger, Ancho Hancho, and Bird's Fried Chicken.",
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun 04:00 - 21:00' })],
  }),
  the_reserve: restaurant({
    name: 'The Reserve',
    cuisine: 'Fine Dining, Wine Bar',
    amenity: 'restaurant',
    description: 'Indulge in a curated selection of premium wines alongside an all-day fine dining menu.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Wed 04:00-18:00; Thu-Sun 04:30-19:00' })],
  }),
  whiskey_bread: restaurant({
    name: 'Whiskey Bread',
    cuisine: 'Bar, Irish',
    amenity: 'bar',
    description: 'Cosy up in this whiskey bar with over 60 whiskies, pub classics, and gourmet toasties.',
    outlets: [outlet({ airside: 'airside', locationNotes: AFTER, openingHours: 'Mon-Sun First Flight - Last Flight' })],
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

  const t1Result = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', t1Venues);
  const t2Result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', t2Venues);

  const totalUpdated = t1Result.updated + t2Result.updated;
  const totalCreated = t1Result.created + t2Result.created;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t2Venues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
