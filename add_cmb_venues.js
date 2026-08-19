'use strict';
/**
 * Fills in complete data for Bandaranaike International Airport (CMB),
 * Colombo/Katunayake, Sri Lanka, restaurants/bars/cafés in Firestore, based
 * on research conducted on 2026-08-15.
 *
 * TERMINAL STRUCTURE: CMB currently operates TWO active terminals that each
 * meet this dataset's "own check-in AND own security" bar:
 *   - Terminal 1 (International, opened 1967) — the sole terminal handling
 *     international flights, built around one arm-shaped concourse ("the
 *     Pier", gates 6-14) with its own check-in hall and security/immigration
 *     checkpoint.
 *   - Terminal 3 (Domestic, opened November 2012) — handles all domestic
 *     flights, with its own separate check-in and security screening.
 * A planned Terminal 2 (New International) has been under construction
 * since 2017 but is NOT open to passengers — work was halted in 2022 amid
 * Sri Lanka's economic crisis, and as of this research date its completion
 * is targeted for 2028. It is excluded entirely from this file (no venues,
 * no empty bucket) since it doesn't yet exist as a passenger-facing space.
 *
 * Only ONE terminal bucket (terminal_1, "Terminal 1 - International") is
 * populated below. The official site's shop/dine directory (see METHODOLOGY)
 * returns zero results tagged to Terminal 3 or to any domestic-side
 * location — every one of the venues found is tagged "Pier" or "Departure
 * Checking"/"Departure Transit", all Terminal 1 zones. This is consistent
 * with Terminal 3 being a small, recently-built domestic terminal with no
 * publicly listed retail/dining program. No terminal_3 bucket is created
 * (an empty bucket isn't created merely because the terminal exists) — if a
 * domestic-side F&B program is added to the official site in the future,
 * this file should be revised.
 *
 * SOURCES & METHODOLOGY: built entirely from the official Airport & Aviation
 * Services (Sri Lanka) site, airport.lk, using the same browser-verified,
 * official-site-only standard established for prior scripts in this repo.
 * IMPORTANT SITE DATA-QUALITY BUG: the site's own "Shop Dine & Relax > Dine
 * > Restaurants" page (airport.lk/shop_dine_&_relax/dine/restaurants) is
 * mis-wired — its category filter and results show Services-type listings
 * (Banking & Currency Exchange, Beauty & Wellness, Pharmacy & Healthcare,
 * Philatelic Counter, Sleeping Pods & Rest Areas), NOT food & beverage
 * venues, despite the page being titled "Restaurants". Similarly, the
 * "Shop Dine & Relax > Shop > Shopping" page's "Specialty Food Items"
 * category returns non-food retailers (electronics, general duty-free)
 * rather than food items — another mis-tagged category on this site. The
 * ONE category on this site confirmed to return genuine, coherent F&B
 * brands is "Shop > Shopping" filtered to category "Food & Beverage
 * Outlets" (using the page's own Terminal/Location/Category filters and
 * clicking "Search Now") — this returned exactly 5 venues, all clearly real
 * food & beverage chains/outlets (Burger King, Pizza Hut, Segafredo Caffe,
 * etc.), which is the dataset used for this file. No secondary/third-party
 * sources were used at any stage.
 *
 * DATA-QUALITY NOTES:
 *   - Unlike DXB/DOH/AUH, the official airport.lk shop directory publishes
 *     NO per-venue description paragraph for any listing — only a shop
 *     number, name, category tag, one-line location zone ("Pier" /
 *     "Departure Checking" / "Departure Transit"), opening hours, phone,
 *     email, and (sometimes) a website link. Every `description` below is
 *     therefore limited to generic, well-established facts about the
 *     brand/format itself (e.g. "global fast-food burger chain") rather
 *     than anything airport-specific sourced from the site, which simply
 *     isn't published here. This is flagged explicitly rather than
 *     presented as if it came from an official per-venue description.
 *   - The site's own "Dine" landing page (airport.lk/shop_dine_&_relax/dine)
 *     separately describes, in prose only, that "Restaurants run by Sri
 *     Lankan Catering are located in the Departure Lobby & Transit Lounge",
 *     plus "A Coffee café and a Bar" and "Snack bars" in the transit area —
 *     but names no specific brands for any of this. It's plausible this
 *     prose is describing some of the same 5 venues below (e.g. Segafredo
 *     Caffe as "the Coffee café", Relax Inn as "the Bar"), but the official
 *     site never confirms that mapping explicitly, so no such identification
 *     is asserted here — the 5 venues below are taken solely from the
 *     Food & Beverage Outlets category listing, on its own terms.
 *   - "Relax Inn" and "S.V.H. Snacks" are listed with no website and no
 *     further category/menu detail beyond "Food & Beverage Outlets" — their
 *     cuisine/description fields are left minimal rather than guessed.
 *   - `website` is filled in with the actual link the airport's own page
 *     publishes for that shop (a local franchise-operator domain in some
 *     cases, e.g. Pizza Hut's is pizzahut.lk, Burger King's is softlogic.lk
 *     — Softlogic is the Sri Lankan franchise operator for Burger King).
 *     `logo_url` instead uses each brand's global consumer domain (e.g.
 *     burgerking.com, pizzahut.com) purely to fetch a recognizable logo
 *     image, matching this dataset's standing logo.dev convention.
 *   - `phone` is filled in directly from the official listing (unusual for
 *     this dataset — most other airports' sites don't publish per-venue
 *     phone numbers, but airport.lk does for every shop).
 *   - Opening hours are published as "24 hours" for all 5 venues.
 *
 * CMB does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'cmb' first, then 'colombo', then 'bandaranaike', using
 * whichever has existing terminal data). It never creates a new
 * `airports/{id}` metadata doc itself.
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
 * airport whose id isn't THIS script's terminal id (terminal_1) gets its
 * restaurants subcollection and then the terminal doc itself deleted, so a
 * stale/orphaned terminal bucket doesn't keep inflating the terminal count
 * the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_cmb_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['cmb', 'colombo', 'bandaranaike'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';

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

// ─── Terminal 1 (International) venues ───────────────────────────────────

const terminal1Venues = {
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'http://softlogic.lk',
    logoUrl: logo('burgerking.com'),
    phone: '+94 11 226 5259',
    description: 'Global fast-food chain known for flame-grilled burgers, operated at CMB by Sri Lankan franchise partner Softlogic. Shop No. 42-D.',
    outlets: [outlet({ level: 'Pier', locationNotes: 'Shop No. 42-D, Pier', open247: true })],
  }),
  pizza_hut_delifrance: restaurant({
    name: 'Pizza Hut & Delifrance',
    cuisine: 'Pizza, Bakery, Café',
    amenity: 'fast_food',
    website: 'http://pizzahut.lk',
    logoUrl: logo('pizzahut.com'),
    phone: '+94 11 225 5011',
    description: 'A combined Pizza Hut (global pizza chain) and Delifrance (French bakery-café brand) outlet. Shop No. 20-D.',
    outlets: [outlet({ level: 'Pier', locationNotes: 'Shop No. 20-D, Pier', open247: true })],
  }),
  relax_inn: restaurant({
    name: 'Relax Inn',
    cuisine: 'Food & Beverage',
    amenity: 'restaurant',
    phone: '+94 11 225 1570',
    description: "Listed under the official site's Food & Beverage Outlets category. NOTE: airport.lk publishes no description or website for this venue, only its shop number and location; cuisine/format beyond \"Food & Beverage Outlet\" is not specified. Shop No. 21-D.",
    outlets: [outlet({ level: 'Pier', locationNotes: 'Shop No. 21-D, Pier', open247: true })],
  }),
  svh_snacks: restaurant({
    name: 'S.V.H. Snacks',
    cuisine: 'Snacks, Fast Food',
    amenity: 'fast_food',
    phone: '+94 71 590 2060',
    description: "A snack bar listed under the official site's Food & Beverage Outlets category. NOTE: airport.lk publishes no description or website for this venue beyond its shop number and location. Shop No. 1.",
    outlets: [outlet({ airside: 'landside', level: 'Departure Checking', locationNotes: 'Shop No. 1, Departure Checking', open247: true })],
  }),
  segafredo_caffe: restaurant({
    name: 'Segafredo Caffe',
    cuisine: 'Italian, Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.segafredocaffe.com',
    logoUrl: logo('segafredocaffe.com'),
    phone: '+94 11 226 0480',
    description: 'Italian coffee brand serving espresso-based drinks. Shop No. 61-D.',
    outlets: [outlet({ level: 'Pier', locationNotes: 'Shop No. 61-D, Pier', open247: true })],
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1 - International', terminal1Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1]));

  const totalCreated = r1.created;
  const totalDeleted = r1.deleted;
  const totalVenues = Object.keys(terminal1Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
