'use strict';
/**
 * Fills in complete data for all London Gatwick Airport (LGW) restaurants/
 * bars/cafés in Firestore, cross-referenced against the official Gatwick
 * Airport restaurant directory (gatwickairport.com/restaurant-directory.html)
 * on 2026-08-04.
 *
 * Gatwick has TWO terminals — North Terminal and South Terminal — and the
 * live directory tags every one of its 27 brand tiles with terminal +
 * before/after-security zone + opening hours + a short description directly
 * in the listing grid (`.directorytile` cards), so no separate detail pages
 * needed to be visited. Each tile's brand name comes from its logo image's
 * `alt` text; each tile links out to the brand's own external site/store
 * locator rather than a Gatwick-hosted detail page.
 *
 * Docs are grouped by (name, terminal), matching the Dublin/Frankfurt/Lisbon
 * convention: a brand with a single outlet spanning both zones within one
 * terminal (Starbucks in North Terminal: before AND after security) is one
 * doc with multiple `outlets[]`. A brand present in BOTH terminals (Black
 * Sheep Coffee, Pret a Manger, Starbucks, wagamama) gets a SEPARATE doc per
 * terminal, since each terminal is its own `airports/{airport}/terminals/
 * {terminal}/restaurants` subcollection.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - Starbucks' listing reads "Both Terminals — After security and before
 *     security in North" — parsed as: South Terminal has one after-security
 *     outlet; North Terminal has two outlets (before security AND after
 *     security). Both terminals show 24/7 hours.
 *   - Pret a Manger's listing reads "Both Terminals — Arrivals and after
 *     security — 24/7" without saying which zone is in which terminal, so
 *     each terminal's doc uses `airside: 'both'` to reflect the landside
 *     (arrivals) + airside (after security) presence the site describes.
 *   - wagamama is in both terminals with different hours per terminal
 *     (North 04:00-20:30, South 04:00-21:00), so each gets its own doc/hours.
 *   - 5 of the 27 tiles (Giraffe, Juniper & Co, South Downs Bar, Sussex
 *     House, Wondertree) have no outbound link on the live site — `website`
 *     is left blank for those rather than guessed; every other venue's
 *     `website` is the exact URL the tile links to.
 *   - The site doesn't publish phone numbers or dietary tags for any of
 *     these venues, so those fields are left blank/false throughout — that
 *     reflects what's actually published, not a research gap.
 *
 * Because Firebase Console access isn't available to confirm the exact live
 * airport slug, and the two reference scripts in this repo disagree —
 * upload_to_firestore.py uses 'lgw', while migrate_firestore.js and
 * cleanup_firestore.js (the current-schema-aware, more authoritative tools)
 * both list 'gatwick' — this script auto-detects the airport slug at
 * runtime (checking 'gatwick' first, then 'lgw', using whichever has
 * existing terminal data) and matches existing restaurant docs by
 * normalized name within each terminal — updating in place if found,
 * creating new otherwise. It never creates a new `airports/{id}` metadata
 * doc itself.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_lgw_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['gatwick', 'lgw'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const NORTH_TERMINAL = 'north_terminal';
const SOUTH_TERMINAL = 'south_terminal';

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

// ─── South Terminal venues ────────────────────────────────────────────────

const southVenues = {
  the_beehive: restaurant({
    name: 'The Beehive',
    cuisine: 'British, Pub',
    amenity: 'pub',
    logoUrl: logo('jdwetherspoon.com'),
    website: 'https://www.jdwetherspoon.com/pubs/the-beehive-crawley/',
    description: 'Enjoy great views of the arrivals hall, as well as a cosy interior at this Wetherspoons pub.',
    outlets: [outlet({ airside: 'landside', openingHours: '04:00 - 23:00' })],
  }),
  big_smoke: restaurant({
    name: 'Big Smoke',
    cuisine: 'Bar, British',
    amenity: 'bar',
    logoUrl: logo('bigsmoke-taphousekitchen.co.uk'),
    website: 'https://www.bigsmoke-taphousekitchen.co.uk/big-smoke-gatwick/',
    description: 'Serving you the freshest beers, signature cocktails and delicious all-day menu to suit all tastes.',
    outlets: [outlet({ airside: 'airside', openingHours: '03:00 - Last flight' })],
  }),
  black_sheep_coffee_south: restaurant({
    name: 'Black Sheep Coffee',
    cuisine: 'Coffee',
    amenity: 'cafe',
    logoUrl: logo('leavetheherdbehind.com'),
    website: 'https://leavetheherdbehind.com/blogs/locations/gatwick-south-terminal',
    description: 'Leave the herd behind and grab a coffee to start your holiday at Black Sheep Coffee.',
    outlets: [outlet({ airside: 'landside', openingHours: '24 hours', open247: true })],
  }),
  caffe_nero: restaurant({
    name: 'Caffè Nero',
    cuisine: 'Café, Italian',
    amenity: 'cafe',
    logoUrl: logo('caffenero.com'),
    website: 'https://caffenero.com/uk/',
    description: 'Traditional, Italian-style food and coffee. They also provide ample power points.',
    outlets: [outlet({ airside: 'landside', openingHours: '24 hours', open247: true })],
  }),
  the_flying_horse: restaurant({
    name: 'The Flying Horse',
    cuisine: 'British, Pub',
    amenity: 'pub',
    logoUrl: logo('jdwetherspoon.com'),
    website: 'https://www.jdwetherspoon.com/pubs/the-flying-horse-crawley/',
    description: 'A friendly, family pub, with great value and great British food and drinks to enjoy.',
    outlets: [outlet({ airside: 'airside', openingHours: '03:00 - Last flight' })],
  }),
  gails: restaurant({
    name: "GAIL's",
    cuisine: 'Bakery, Coffee',
    amenity: 'bakery',
    logoUrl: logo('gails.com'),
    website: 'https://gails.com/pages/gatwick-airport',
    description: 'Freshly baked goods, barista-made coffee, and thoughtful gifts on-the-go.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 21:00' })],
  }),
  giraffe: restaurant({
    name: 'Giraffe',
    cuisine: 'International',
    amenity: 'restaurant',
    description: 'A friendly restaurant with flavours from around the world and music to match.',
    outlets: [outlet({ airside: 'landside', openingHours: '04:00 - 23:00' })],
  }),
  greggs: restaurant({
    name: 'Greggs',
    cuisine: 'Bakery, Fast Food',
    amenity: 'bakery',
    logoUrl: logo('greggs.co.uk'),
    website: 'https://www.greggs.co.uk/shop-finder',
    description: "Grab a taste of home any time, no matter where you're jetting off to with Greggs at London Gatwick.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '24 hours', open247: true })],
  }),
  itsu: restaurant({
    name: 'itsu',
    cuisine: 'Asian, Sushi',
    amenity: 'fast_food',
    logoUrl: logo('itsu.com'),
    website: 'https://www.itsu.com/location/surrey/gatwick-south-terminal/',
    description: 'An Asian-inspired menu packed with vitamins and protein, with most dishes costing under £8.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 21:00' })],
  }),
  joe_and_the_juice: restaurant({
    name: 'Joe & The Juice',
    cuisine: 'Café, Juice, Sandwiches',
    amenity: 'cafe',
    logoUrl: logo('joejuice.com'),
    website: 'https://www.joejuice.com/store/fa0710b5-ed6d-4b5f-bc1b-8ae3d3db578b',
    description: 'With an edgy variety of juices, smoothies, coffee and freshly made sandwiches.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 21:00' })],
  }),
  nandos: restaurant({
    name: "Nando's",
    cuisine: 'Portuguese, Chicken',
    amenity: 'restaurant',
    logoUrl: logo('nandos.co.uk'),
    website: 'https://www.nandos.co.uk/restaurants/gatwick-south-terminal-airside',
    description: 'Available for eat-in and collect, pop into Nandos for some pre-holiday Peri-Peri chicken.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 21:00' })],
  }),
  pizzaexpress: restaurant({
    name: 'PizzaExpress',
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    logoUrl: logo('pizzaexpress.com'),
    website: 'https://www.pizzaexpress.com/gatwick-airport-south-terminal',
    description: 'Enjoy PizzaExpress classics or the new breakfast menu. Takeaway available.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 21:00' })],
  }),
  pret_a_manger_south: restaurant({
    name: 'Pret a Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk/en-GB/shop-finder/l/gatwick/departures-road/10363',
    description: 'Freshly made sandwiches, salads, hot breakfast rolls, croissants, cookies and organic hot drinks.',
    outlets: [outlet({ airside: 'both', locationNotes: 'Arrivals and after security', openingHours: '24 hours', open247: true })],
  }),
  south_downs_bar: restaurant({
    name: 'South Downs Bar',
    cuisine: 'Bar, British',
    amenity: 'bar',
    description: 'Premium small batch food and drink; English wines, cocktails, pastries and sandwiches.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 21:00' })],
  }),
  starbucks_south: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.co.uk/store-locator',
    description: 'Customised coffee, handcrafted hot and cold beverages, sandwiches and snacks.',
    outlets: [outlet({ airside: 'airside', openingHours: '24 hours', open247: true })],
  }),
  wagamama_south: restaurant({
    name: 'wagamama',
    cuisine: 'Asian, Japanese',
    amenity: 'restaurant',
    logoUrl: logo('wagamama.com'),
    website: 'https://www.wagamama.com/restaurants/search',
    description: 'Head to the bench to get your eat-in or takeaway wagamama fix before you fly.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 21:00' })],
  }),
  wondertree: restaurant({
    name: 'Wondertree',
    cuisine: 'International, Café',
    amenity: 'restaurant',
    description: 'Fresh and exciting world food, Fairtrade coffee and independent wines with an airfield view.',
    outlets: [outlet({ airside: 'airside', openingHours: '03:00 - Last flight' })],
  }),
};

// ─── North Terminal venues ────────────────────────────────────────────────

const northVenues = {
  black_sheep_coffee_north: restaurant({
    name: 'Black Sheep Coffee',
    cuisine: 'Coffee',
    amenity: 'cafe',
    logoUrl: logo('leavetheherdbehind.com'),
    website: 'https://leavetheherdbehind.com/blogs/locations/gatwick-south-terminal',
    description: 'Leave the herd behind and grab a coffee to start your holiday at Black Sheep Coffee.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
  }),
  the_breakfast_club: restaurant({
    name: 'The Breakfast Club',
    cuisine: 'Café, British, Breakfast',
    amenity: 'restaurant',
    logoUrl: logo('thebreakfastclubcafes.com'),
    website: 'https://thebreakfastclubcafes.com/gatwick/',
    description: "The Breakfast Club is a 'caf' that serves up legendary dishes throughout the day.",
    outlets: [outlet({ airside: 'airside', openingHours: '03:30 - Last flight' })],
  }),
  brewdog: restaurant({
    name: 'BrewDog',
    cuisine: 'Bar, Craft Beer',
    amenity: 'bar',
    logoUrl: logo('brewdog.com'),
    website: 'https://www.brewdog.com/au/gatwick-airport',
    description: '20 taps of craft beer and an all day menu of BrewDog favourites, games zone, photobooth & more.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
  }),
  juniper_and_co: restaurant({
    name: 'Juniper & Co',
    cuisine: 'British, Local',
    amenity: 'restaurant',
    description: 'Enjoy a taste of indulgence using locally-sourced ingredients for you to treat yourself.',
    outlets: [outlet({ airside: 'airside', openingHours: '03:30 - Last flight' })],
  }),
  krispy_kreme: restaurant({
    name: 'Krispy Kreme',
    cuisine: 'Bakery, Doughnuts, Coffee',
    amenity: 'bakery',
    logoUrl: logo('krispykreme.co.uk'),
    website: 'https://www.krispykreme.co.uk/',
    description: 'Freshly-made, iconic Original Glazed doughnuts, barista coffee and awesome shakes.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
  }),
  pret_a_manger_north: restaurant({
    name: 'Pret a Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk/en-GB/shop-finder/l/gatwick/departures-road/10363',
    description: 'Freshly made sandwiches, salads, hot breakfast rolls, croissants, cookies and organic hot drinks.',
    outlets: [outlet({ airside: 'both', locationNotes: 'Arrivals and after security', openingHours: '24 hours', open247: true })],
  }),
  pure: restaurant({
    name: 'Pure',
    cuisine: 'Café, Fast Food',
    amenity: 'fast_food',
    logoUrl: logo('pure.co.uk'),
    website: 'https://www.pure.co.uk/shops/gatwick-airport/',
    description: 'Delicious and fast breakfast, lunch, coffee and dinner. Eat-in, takeaway or on-board.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
  }),
  the_red_lion: restaurant({
    name: 'The Red Lion',
    cuisine: 'British, Pub',
    amenity: 'pub',
    logoUrl: logo('jdwetherspoon.com'),
    website: 'https://www.jdwetherspoon.com/pubs/the-red-lion-crawley/',
    description: 'A friendly, relaxing, family pub, offering great value and great British food.',
    outlets: [outlet({ airside: 'airside', openingHours: '03:30 - Last flight' })],
  }),
  shake_shack: restaurant({
    name: 'Shake Shack',
    cuisine: 'American, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('shakeshack.com'),
    website: 'https://www.shakeshack.co.uk/locations/gatwick/',
    description: 'Classic American-style burgers, shakes and hot dogs made with high-quality ingredients.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
  }),
  sonoma: restaurant({
    name: 'Sonoma',
    cuisine: 'American, Californian',
    amenity: 'restaurant',
    website: 'https://sonomagatwick.com/',
    description: 'Bringing a taste of California to London Gatwick. Unwind before your journey in the best way.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
  }),
  starbucks_north: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.co.uk/store-locator',
    description: 'Customised coffee, handcrafted hot and cold beverages, sandwiches and snacks.',
    outlets: [
      outlet({ airside: 'landside', openingHours: '24 hours', open247: true }),
      outlet({ airside: 'airside', openingHours: '24 hours', open247: true }),
    ],
  }),
  sussex_house: restaurant({
    name: 'Sussex House',
    cuisine: 'British, Local',
    amenity: 'restaurant',
    description: 'Welcome to Sussex House Kitchen & Bar, a celebration of local flavours.',
    outlets: [outlet({ airside: 'landside', openingHours: '04:00 - 23:00' })],
  }),
  tortilla: restaurant({
    name: 'Tortilla',
    cuisine: 'Mexican',
    amenity: 'fast_food',
    logoUrl: logo('tortilla.co.uk'),
    website: 'https://www.tortilla.co.uk/restaurants/gatwick',
    description: 'Build your own burrito or taco from scratch using fresh quality ingredients.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
  }),
  wagamama_north: restaurant({
    name: 'wagamama',
    cuisine: 'Asian, Japanese',
    amenity: 'restaurant',
    logoUrl: logo('wagamama.com'),
    website: 'https://www.wagamama.com/restaurants/search',
    description: 'Head to the bench to get your eat-in or takeaway wagamama fix before you fly.',
    outlets: [outlet({ airside: 'airside', openingHours: '04:00 - 20:30' })],
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

  const northResult = await processTerminal(AIRPORT, NORTH_TERMINAL, 'North Terminal', northVenues);
  const southResult = await processTerminal(AIRPORT, SOUTH_TERMINAL, 'South Terminal', southVenues);

  const totalUpdated = northResult.updated + southResult.updated;
  const totalCreated = northResult.created + southResult.created;
  const totalVenues = Object.keys(northVenues).length + Object.keys(southVenues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
