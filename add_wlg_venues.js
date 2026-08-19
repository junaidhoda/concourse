'use strict';
/**
 * Fills in complete data for all Wellington International Airport (WLG)
 * restaurants/bars/cafés in Firestore, cross-referenced against Wellington
 * Airport's own website (wellingtonairport.co.nz) on 2026-08-15.
 *
 * The site's directory at wellingtonairport.co.nz/shop-eat/eat/ lists a
 * partial set of venues in its static HTML, but the full set of 17 venues
 * below was assembled by combining that page with individual venue pages at
 * wellingtonairport.co.nz/shop-eat/eat/<slug>/ discovered via `site:
 * wellingtonairport.co.nz/shop-eat/eat` search sweeps (roughly a dozen query
 * variations) — several venues (Percival, GoGo, Lil' Rosies, Bélen Plant
 * Bakery, Tank) only turned up this way, not on the directory's static
 * listing. Every venue's own page was fetched individually for cuisine,
 * description, hours, phone, location and (where linked) website.
 *
 * TERMINAL STRUCTURE: Wellington Airport is a single, physically unified
 * terminal building — confirmed via Wikipedia and the airport's own site.
 * The 1977 international terminal and the 1999 domestic terminal were built
 * as, and remain, ONE integrated structure with a common check-in area on
 * Level 1 and a common baggage-claim area on Level 0 (Ground Floor), from
 * which three piers branch airside: the South pier (Gates 3-12, regional
 * aircraft), the South-West pier (Gates 13-17, mostly Air New Zealand
 * domestic jets) and the North-West pier (Gates 21-29, Jetstar domestic and
 * all international flights). There is no domestic/international terminal
 * split here the way there is at Sydney or Melbourne — just one terminal bucket,
 * with each venue's specific level/pier/before-or-after-security detail
 * recorded in its own outlet's `location_notes`, per this dataset's standing
 * principle that terminal buckets represent only genuinely separate physical
 * buildings, never zones or piers within a single one.
 *
 * MULTI-OUTLET CONVENTION: Wellington has two brands with a genuine second
 * physical counter within this one terminal — Mojo (a Level 1 Main Terminal
 * café plus a second, separate café in the Level 1 International Departures
 * lounge) and Subway (a Ground Floor counter next to Baggage Claim plus a
 * second counter in the Level 1 International Departures lounge, both
 * sharing the same phone number per Subway's own page). Both are combined
 * below into one doc each with two `outlets[]` entries, per this dataset's
 * standing convention for same-terminal multi-location brands.
 *
 * Before/after security: most Main Terminal venues sit in the shared,
 * landside check-in/departures hall on Level 1 before the single security
 * checkpoint that funnels into the three piers — this dataset marks a venue
 * `airside` only where the source explicitly says so: Percival is
 * specifically called out on its own page as a "post-security" kiosk near
 * Gates 13-17, and the International Departures outlets of Mojo and Subway
 * are, by definition, reachable only after security and (for international)
 * customs clearance. Every other Level 1 venue is treated as landside,
 * matching how the site itself frames Percival as a notable post-security
 * exception rather than the norm.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - Phone numbers are published for very few venues on this site (mostly
 *     the hotel-operated Whiskey Lima Golf and the Subway locations); left
 *     blank elsewhere rather than guessed.
 *   - No venue in this dataset publishes a full 24/7 claim, so `open_24_7`
 *     is false throughout.
 *   - Dietary flags are set only where a venue's own page or branding
 *     explicitly publishes them: Bélen Plant Bakery is vegan by definition
 *     of its own "plant-based bakery" branding (`vegan_options` set true).
 *     No other venue publishes a formal dietary flag.
 *   - `website`/`logo_url` are filled in only for brands independently
 *     verifiable with a confident public domain (Subway, Mojo, Tank, Three
 *     Quarter Society, Bélen Plant Bakery) — independent, single-airport
 *     concession concepts with no confirmed public domain (Good Day, Best
 *     Ugly Bagels, Peloton Bar & Eatery, Ted & Rose, TJ Katsu Sushi, TJ Katsu
 *     Dumplings and Noodles, United Brew Works, Whiskey Lima Golf, Haha
 *     Chicken, Percival, GoGo, Lil' Rosies) are left blank rather than
 *     guessing one.
 *
 * Wellington Airport appears in NEITHER reference script (migrate_firestore.
 * js's AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'wellington' first, then 'wlg', using whichever has existing
 * terminal data). It never creates a new `airports/{id}` metadata doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. It
 * first deletes EVERY existing restaurant doc in the terminal's `restaurants`
 * subcollection — unconditionally, regardless of whether its name matches
 * anything in this file — and only then creates every venue defined here as
 * a brand-new doc. There is no update-in-place step and no name-matching
 * against what's already there; nothing from a previous run survives. Run
 * this only when the venue list below is meant to be the complete,
 * authoritative set.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't TERMINAL_1 gets its restaurants subcollection and
 * then the terminal doc itself deleted, so a stale/orphaned terminal bucket
 * left behind by any earlier or wrongly-modelled revision of this script
 * doesn't keep inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_wlg_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['wellington', 'wlg'];
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

// ─── Main Terminal venues (single, physically unified terminal building) ────

const terminalVenues = {
  good_day: restaurant({
    name: 'Good Day',
    cuisine: 'All-Day Dining, Café',
    amenity: 'restaurant',
    description: 'A two-level casual dining venue serving breakfast, burgers, salads, sandwiches, wraps and cabinet food, with coffee and alcoholic beverages.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: '4:00am - 8:00pm' })],
  }),
  best_ugly_bagels: restaurant({
    name: 'Best Ugly Bagels',
    cuisine: 'Bagels',
    amenity: 'bakery',
    description: 'Artisan, hand-rolled, wood-fired bagels with a range of toppings.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: '6:30am - 4:00pm' })],
  }),
  mojo: restaurant({
    name: 'Mojo',
    cuisine: 'Café, Casual Dining',
    amenity: 'cafe',
    website: 'https://www.mojocoffee.co.nz',
    logoUrl: logo('mojocoffee.co.nz'),
    description: 'Locally-roasted Wellington coffee with cabinet food for quick service and an extensive à la carte menu; this doc combines the Main Terminal café with the separate International Departures café.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: '7:30am - 7:00pm' }),
      outlet({ airside: 'airside', locationNotes: 'Level 1, International Departures (post-security, past customs)', openingHours: 'Open for all international departures' }),
    ],
  }),
  peloton_bar_eatery: restaurant({
    name: 'Peloton Bar & Eatery',
    cuisine: 'Bar, Modern Café',
    amenity: 'bar',
    description: 'A full dining menu of coffees, cakes, wine and cheese, with private seating areas at the north end of the terminal.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 2, Main Terminal, accessed via the stairwell next to Mojo (Level 1) or via the Rydges Hotel (Level 2)', openingHours: '11:00am - 7:00pm' })],
  }),
  subway: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches',
    amenity: 'fast_food',
    website: 'https://www.subway.com/en-NZ',
    logoUrl: logo('subway.com'),
    phone: '+64 4 388 2166',
    description: 'Made-to-order subs, salads and wraps, plus fresh barista coffee using locally roasted L\'affare beans; this doc combines the Ground Floor counter with the separate International Departures counter.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Level 0, Ground Floor, next to Baggage Claim', openingHours: 'Mon-Fri & Sun 5:30am - 10:00pm; Sat 5:30am - 9:00pm' }),
      outlet({ airside: 'airside', locationNotes: 'Level 1, International Departures (open for all departures)' }),
    ],
  }),
  ted_and_rose: restaurant({
    name: 'Ted & Rose',
    cuisine: 'Café, Bakery',
    amenity: 'cafe',
    description: 'Coffee, doughnuts, pies and snacks near Baggage Claim 2.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 0, Ground Floor, near Baggage Claim 2', openingHours: '6:00am - 5:00pm' })],
  }),
  three_quarter_society: restaurant({
    name: 'Three Quarter Society',
    cuisine: 'Café, Espresso Bar',
    amenity: 'cafe',
    website: 'https://www.threequarter.co.nz',
    logoUrl: logo('threequarter.co.nz'),
    description: 'A stylish espresso bar making Wellington coffee with ethically sourced beans, plus specialty drinks like coconut flat whites, award-winning hot chocolate, pastries and sandwich rolls made fresh daily.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal, before Gates 10-17', openingHours: 'Mon-Sat 5:30am - 5:00pm; Sun 6:30am - 6:00pm' })],
  }),
  tj_katsu_sushi: restaurant({
    name: 'TJ Katsu Sushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    description: 'Japanese sushi, chicken katsu and poke bowls from a popular Wellington kiosk brand with several CBD locations.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: 'Mon-Thu 6:30am - 7:00pm; Fri 6:30am - 7:30pm; Sat 6:30am - 6:30pm; Sun 6:30am - 7:30pm' })],
  }),
  tj_katsu_dumplings_noodles: restaurant({
    name: 'TJ Katsu Dumplings and Noodles',
    cuisine: 'Japanese, Asian',
    amenity: 'restaurant',
    description: 'Fresh, hot, cooked-to-order dumplings, ramen, noodles and curry.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: 'Mon-Thu 9:00am - 7:00pm; Fri 9:00am - 7:30pm; Sat 9:00am - 6:30pm; Sun 9:00am - 7:30pm' })],
  }),
  united_brew_works: restaurant({
    name: 'United Brew Works',
    cuisine: 'Café, Craft Beer',
    amenity: 'cafe',
    description: 'Freshly brewed Flight coffee, handcrafted beers and light bites.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: 'Mon-Wed & Sat 8:00am - 6:00pm; Thu-Fri & Sun 7:00am - 7:00pm' })],
  }),
  whiskey_lima_golf: restaurant({
    name: 'Whiskey Lima Golf',
    cuisine: 'International Bistro',
    amenity: 'restaurant',
    phone: '+64 4 896 9150',
    description: 'International bistro cuisine drawing on local produce from Marlborough to Wairarapa, with buffet and à la carte breakfast plus bar and dinner service; operated by the Rydges Hotel.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 2, Rydges Hotel, Main Terminal', openingHours: 'Breakfast buffet Mon-Fri 6:30-10:00, Sat-Sun 7:00-10:00; à la carte Mon-Fri 6:30-11:00, Sat-Sun 7:00-11:00; bar & dinner daily 5:00pm-9:00pm' })],
  }),
  haha_chicken: restaurant({
    name: 'Haha Chicken',
    cuisine: 'Korean, Fried Chicken',
    amenity: 'fast_food',
    description: 'Korean fried chicken and chips in three flavours: original, sweet & spicy, or soy & honey.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal, adjacent to TJ Katsu Dumplings and Noodles', openingHours: 'Mon-Thu 9:00am - 7:00pm; Fri 9:00am - 7:30pm; Sat 9:00am - 6:30pm; Sun 9:00am - 7:30pm' })],
  }),
  percival: restaurant({
    name: 'Percival',
    cuisine: 'Café, Quick Bites',
    amenity: 'cafe',
    description: 'A post-security kiosk for travellers in a hurry, with sandwiches, croissants, pies, drinks and coffee.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Level 1, Gates 13-17 (South-West pier), post-security', openingHours: '5:30am - 6:30pm, Sunday-Friday' })],
  }),
  gogo: restaurant({
    name: 'GoGo',
    cuisine: 'Healthy, Café',
    amenity: 'fast_food',
    description: 'Fresh, healthy, tasty food to go — morning toast and porridge until 11am, sandwiches, wraps, salads, fruit pots and curries, with coffee from local roaster Supreme.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: '4:00am - 6:30pm' })],
  }),
  lil_rosies: restaurant({
    name: "Lil' Rosies",
    cuisine: 'Mexican',
    amenity: 'fast_food',
    description: "Fresh Mexican food from the team behind Rosie's Red-Hot Cantina & Taco Joint.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: '6:00am - 7:00pm' })],
  }),
  belen_plant_bakery: restaurant({
    name: 'Bélen Plant Bakery',
    cuisine: 'Bakery, Plant-Based',
    amenity: 'bakery',
    website: 'https://www.belenplantbakery.com',
    logoUrl: logo('belenplantbakery.com'),
    vegan: true,
    description: "Wellington's award-winning plant-based bakery, offering a rotating selection of vegan doughnuts and sweet and savoury pastries.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 1, Main Terminal', openingHours: 'Mon-Fri 6:30am - 4:00pm; Sat-Sun 7:00am - 4:00pm' })],
  }),
  tank: restaurant({
    name: 'Tank',
    cuisine: 'Juice, Smoothies, Healthy',
    amenity: 'fast_food',
    website: 'https://www.tankjuice.co.nz',
    logoUrl: logo('tankjuice.co.nz'),
    description: 'Kiwi-owned juice bar (nearly three decades running) making fresh, healthy smoothies, juices, salads and wraps to order from locally sourced ingredients.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Level 0, Ground Floor', openingHours: '5:30am - 9:30pm' })],
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

  const t1Result = await processTerminal(AIRPORT, TERMINAL_1, 'Main Terminal', terminalVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1]));

  const totalCreated = t1Result.created;
  const totalDeleted = t1Result.deleted;
  const totalVenues = Object.keys(terminalVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
