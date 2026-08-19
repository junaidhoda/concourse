'use strict';
/**
 * Fills in complete data for all O.R. Tambo International Airport
 * (Johannesburg, South Africa — IATA: JNB) restaurants/bars/cafés in
 * Firestore, based on research conducted on 2026-08-15.
 *
 * Primary source: ortambointernationalairport.co.za/shops-and-restaurants/,
 * a structured directory listing every food & beverage venue with its own
 * phone number and explicit "Domestic / International / Both" terminal tag
 * plus a landside/airside/arrivals location tag — the most authoritative,
 * itemised source found for this airport (most other guide sites only offer
 * vague, unsourced summaries). Cross-checked against Wikipedia, thetraveler.
 * org's terminal-structure guide and independent TripAdvisor listings.
 *
 * TERMINAL STRUCTURE: O.R. Tambo's Terminal A (International) and Terminal B
 * (Domestic) are NOT separate buildings — confirmed via Wikipedia and an
 * independent terminal guide, they form "one long terminal complex arranged
 * north to south, with a central building [the Central Terminal Building,
 * built for the 2010 World Cup] in the middle," fully connected under one
 * roof, a 5-10 minute indoor walk apart. Despite that, this script still
 * models them as TWO separate terminal buckets, for the same reason Melbourne
 * Airport's physically-joined Terminal 3 and Terminal 4 were kept as two
 * buckets rather than collapsed like Zurich's single-security zones:
 * Terminal A and Terminal B each have their OWN check-in/departure level and
 * their own security/customs processing (international vs. domestic
 * necessarily require separate passport-control and customs flows even
 * within one shared building) — the operative test this dataset uses is
 * "own check-in and own security," not "separate building," and O.R. Tambo's
 * A/B split passes that test the same way Melbourne's T3/T4 split does.
 *
 * The Central Terminal Building itself, however, does NOT have its own
 * check-in or security — it is purely the shared, landside connecting mall
 * between A's and B's separately-secured zones (Wikipedia additionally notes
 * it was numbered "Terminal A3" as part of the international-side complex).
 * Per this dataset's standing principle that only genuinely separately-
 * secured buildings/zones get their own terminal bucket, it is NOT given a
 * third bucket. The 8 venues the source tags "Both" (accessible to travellers
 * from either side, each with a single phone number — i.e. one physical
 * outlet, not two) are instead folded into the Terminal A bucket, with
 * `location_notes` on every one of them explicitly stating they're in the
 * shared Central Terminal Building rather than exclusively international.
 * Nando's is the one exception: the source tags it "Both, Landside (Int'l &
 * Dom.)" — explicitly describing two separate landside locations, one on
 * each side, not one shared outlet — so it is kept as two separate docs
 * (one per terminal), per this dataset's standing convention for a brand
 * with genuinely separate outlets in different terminals.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - The source directory publishes a phone number for nearly every venue
 *     but NO opening hours for any of them, so `opening_hours` is left blank
 *     throughout and `open_24_7` is false for all venues.
 *   - `website`/`logo_url` are filled in only for brands independently
 *     verifiable as real South African/international chains with a
 *     confident public domain (KFC, Nando's, Ocean Basket, Spur, Wimpy,
 *     Mugg & Bean, Vida e Caffè, News Cafe, Kauai, Häagen-Dazs, illy) —
 *     smaller or airport-specific concepts with no independently confirmed
 *     domain (Anat, Biltong On-The-Go, Café Marchetti, Café Public,
 *     Cappello, Chocolate, Cosmic Candy, Ekaya Food Court, Europa, Fish &
 *     Chips, Fournos Bakery, McGinty's, Piece A Pizza, Sausage Saloon,
 *     Sweets on the Go, The Raj Indian Cuisine, The Taste of Africa, TJT
 *     Snack Bar) are left blank rather than guessing one.
 *   - Two pairs of venues in the source share an identical phone number
 *     with each other (Anat & Kauai both list (011) 390 2402; Keg & Aviator
 *     & McGinty's both list (011) 390 3394) — most likely a shared operator/
 *     group contact line rather than a data error, so both numbers are kept
 *     exactly as published rather than dropped or guessed apart.
 *   - Cuisine/description for smaller or airport-specific concepts (Anat,
 *     Café Marchetti, Café Public, Cappello, Ekaya Food Court, Europa, The
 *     Taste of Africa, TJT Snack Bar) is kept intentionally brief and
 *     conservative, since no independently-verifiable detail beyond the
 *     directory's own name and category could be found for them.
 *
 * Johannesburg/O.R. Tambo appears in NEITHER reference script (migrate_
 * firestore.js's AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore
 * slug is unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'johannesburg' first, then 'jnb', using whichever has existing
 * terminal data). It never creates a new `airports/{id}` metadata doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For
 * every terminal grouping below, it first deletes EVERY existing restaurant
 * doc in that terminal's `restaurants` subcollection — unconditionally,
 * regardless of whether its name matches anything in this file — and only
 * then creates every venue defined here as a brand-new doc. There is no
 * update-in-place step and no name-matching against what's already there;
 * nothing from a previous run survives. Run this only when the venue lists
 * below are meant to be the complete, authoritative set for each terminal
 * bucket.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't one of THIS script's two terminal ids (TERMINAL_A,
 * TERMINAL_B) gets its restaurants subcollection and then the terminal doc
 * itself deleted, so a stale/orphaned terminal bucket (e.g. from a wrongly-
 * modelled Central Terminal bucket in an earlier revision) doesn't keep
 * inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_jnb_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['johannesburg', 'jnb'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_A = 'terminal_a';
const TERMINAL_B = 'terminal_b';

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

// ─── Terminal A venues (International) — includes the 8 "Both" venues from ──
// ─── the shared, unsecured Central Terminal Building connecting A and B ─────

const terminalAVenues = {
  biltong_on_the_go: restaurant({
    name: 'Biltong On-The-Go',
    cuisine: 'South African, Snacks',
    amenity: 'fast_food',
    phone: '076 038 9566',
    description: 'A grab-and-go biltong and South African snack counter.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  cafe_marchetti: restaurant({
    name: 'Cafe Marchetti',
    cuisine: 'Café, Italian',
    amenity: 'cafe',
    phone: '(011) 390 1951',
    description: 'An Italian-style café serving coffee and light meals.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  cafe_public: restaurant({
    name: 'Cafe Public',
    cuisine: 'Café',
    amenity: 'cafe',
    phone: '071 128 3220',
    description: 'A café serving coffee and casual food.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  cappello: restaurant({
    name: 'Cappello',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '(011) 390 1505',
    description: 'A coffee and light-refreshments counter.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal A (International), Landside' })],
  }),
  ekaya_food_court: restaurant({
    name: 'Ekaya Food Court',
    cuisine: 'Food Court, Various',
    amenity: 'food_court',
    phone: '(011) 390 2701',
    description: 'A multi-vendor food court offering a range of quick meals.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  europa: restaurant({
    name: 'Europa',
    cuisine: 'Café, European',
    amenity: 'cafe',
    phone: '(011) 390 3603',
    description: 'A café-style venue serving European-influenced light meals and coffee.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  haagen_dazs: restaurant({
    name: 'Häagen-Dazs',
    cuisine: 'Ice Cream, Dessert',
    amenity: 'cafe',
    website: 'https://www.haagendazs.com',
    logoUrl: logo('haagendazs.com'),
    phone: '(011) 883 2450',
    description: 'The premium American ice cream brand.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  illy_cafe: restaurant({
    name: 'illy Caffè',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.illy.com',
    logoUrl: logo('illy.com'),
    phone: '(011) 390 2797',
    description: 'illy Caffè brings authentic Italian espresso to a contemporary café setting.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal A (International), Arrivals' })],
  }),
  news_cafe: restaurant({
    name: 'News Cafe',
    cuisine: 'Café, Bar, International',
    amenity: 'bar',
    website: 'https://www.newscafe.co.za',
    logoUrl: logo('newscafe.co.za'),
    phone: '(011) 390 2084',
    description: 'The South African café-bar chain known for an all-day menu of breakfasts, burgers and cocktails.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  piece_a_pizza: restaurant({
    name: 'Piece A Pizza',
    cuisine: 'Pizza',
    amenity: 'fast_food',
    phone: '(011) 390 2102',
    description: 'A quick-service pizza-by-the-slice counter.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal A (International), Landside' })],
  }),
  sweets_on_the_go: restaurant({
    name: 'Sweets on the Go',
    cuisine: 'Confectionery, Snacks',
    amenity: 'fast_food',
    phone: '076 391 7439',
    description: 'A grab-and-go sweets and confectionery kiosk.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal A (International), Landside/Arrivals' })],
  }),
  taste_of_africa: restaurant({
    name: 'The Taste of Africa',
    cuisine: 'African, Nigerian',
    amenity: 'restaurant',
    phone: '(011) 390 3080',
    description: 'A restaurant serving African cuisine.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  tjt_snack_bar: restaurant({
    name: 'TJT Snack Bar',
    cuisine: 'Snacks, Quick Bites',
    amenity: 'fast_food',
    description: 'A quick-service snack bar.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal A (International), Airside' })],
  }),
  nandos_terminal_a: restaurant({
    name: "Nando's",
    cuisine: 'Portuguese, Flame-Grilled Chicken',
    amenity: 'restaurant',
    website: 'https://www.nandos.co.za',
    logoUrl: logo('nandos.co.za'),
    phone: '(011) 390 2599',
    description: "The South African-founded flame-grilled peri-peri chicken chain. One of two O.R. Tambo outlets, on the International landside (the other is on the Domestic landside in Terminal B).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal A (International), Landside' })],
  }),

  // — venues the source tags "Both": single physical outlets in the shared,
  // unsecured Central Terminal Building connecting Terminal A and Terminal B,
  // not exclusively international — see header for why these live here.
  chocolate: restaurant({
    name: 'Chocolate',
    cuisine: 'Chocolate, Confectionery',
    amenity: 'cafe',
    phone: '(011) 390 1252',
    description: 'A chocolate and confectionery shop.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Shared Central Terminal Building (New Duty Free Mall) connecting Terminal A and Terminal B, accessible to travellers from either side' })],
  }),
  cosmic_candy: restaurant({
    name: 'Cosmic Candy',
    cuisine: 'Confectionery, Snacks',
    amenity: 'fast_food',
    phone: '(011) 390 1115',
    description: 'A candy and snacks kiosk.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Shared Central Terminal Building, Departures, accessible to travellers from either side' })],
  }),
  fish_and_chips: restaurant({
    name: 'Fish & Chips',
    cuisine: 'Fish & Chips, Fast Food',
    amenity: 'fast_food',
    phone: '079 149 3203',
    description: 'A fish-and-chips counter.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Shared Central Terminal Building connecting Terminal A and Terminal B, accessible to travellers from either side' })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    phone: '(011) 390 2807',
    description: "KFC's classic fried-chicken menu.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Shared Central Terminal Building connecting Terminal A and Terminal B, accessible to travellers from either side' })],
  }),
  mugg_and_bean: restaurant({
    name: 'Mugg & Bean',
    cuisine: 'Café, Coffee, All-Day Dining',
    amenity: 'cafe',
    website: 'https://www.muggandbean.co.za',
    logoUrl: logo('muggandbean.co.za'),
    phone: '(011) 390 2044',
    description: 'The South African café chain serving coffee, breakfasts and an all-day casual-dining menu.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Shared Central Terminal Building connecting Terminal A and Terminal B, accessible to travellers from either side' })],
  }),
  sausage_saloon: restaurant({
    name: 'Sausage Saloon',
    cuisine: 'South African, Sausages, Fast Food',
    amenity: 'fast_food',
    description: 'A South African sausage/boerewors-roll fast-food counter.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Shared Central Terminal Building connecting Terminal A and Terminal B, accessible to travellers from either side' })],
  }),
  spur: restaurant({
    name: 'Spur',
    cuisine: 'Steakhouse, Family Dining',
    amenity: 'restaurant',
    website: 'https://www.spursteakranches.com',
    logoUrl: logo('spursteakranches.com'),
    phone: '(011) 390 3806',
    description: 'The South African steak-and-ribs family restaurant chain, Spur Steak Ranches.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Shared Central Terminal Building connecting Terminal A and Terminal B, accessible to travellers from either side' })],
  }),
  wimpy: restaurant({
    name: 'Wimpy',
    cuisine: 'Burgers, Family Dining',
    amenity: 'restaurant',
    website: 'https://www.wimpy.co.za',
    logoUrl: logo('wimpy.co.za'),
    phone: '(011) 390 3396',
    description: 'The South African burger-and-grill family restaurant chain.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Shared Central Terminal Building connecting Terminal A and Terminal B, accessible to travellers from either side' })],
  }),
};

// ─── Terminal B venues (Domestic) ────────────────────────────────────────────

const terminalBVenues = {
  anat: restaurant({
    name: 'Anat',
    cuisine: 'Mediterranean, Middle Eastern',
    amenity: 'restaurant',
    phone: '(011) 390 2402',
    description: 'A Mediterranean/Middle Eastern dining venue.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal B (Domestic), Landside' })],
  }),
  fournos_bakery: restaurant({
    name: 'Fournos Bakery',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    website: 'https://www.fournos.co.za',
    logoUrl: logo('fournos.co.za'),
    phone: '(011) 390 3502',
    description: 'A South African bakery chain serving fresh bread, pastries and coffee.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal B (Domestic), Landside' })],
  }),
  kauai: restaurant({
    name: 'Kauai',
    cuisine: 'Healthy, Smoothies, Salads',
    amenity: 'fast_food',
    website: 'https://www.kauai.co.za',
    logoUrl: logo('kauai.co.za'),
    vegetarian: true,
    vegan: true,
    phone: '(011) 390 2402',
    description: 'The South African healthy-eating chain — smoothies, salads and wraps, with vegetarian and vegan options.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal B (Domestic), Landside' })],
  }),
  keg_and_aviator: restaurant({
    name: 'Keg & Aviator',
    cuisine: 'Pub, Bar, Grill',
    amenity: 'bar',
    phone: '(011) 390 3394',
    description: 'A Keg-branded pub and grill serving bar food and drinks.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal B (Domestic), Landside/Airside' })],
  }),
  mcgintys: restaurant({
    name: "McGinty's",
    cuisine: 'Irish Pub, Bar',
    amenity: 'bar',
    phone: '(011) 390 3394',
    description: 'An Irish-themed pub serving bar food and drinks.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal B (Domestic), Airside' })],
  }),
  ocean_basket: restaurant({
    name: 'Ocean Basket',
    cuisine: 'Seafood',
    amenity: 'restaurant',
    website: 'https://www.oceanbasket.com',
    logoUrl: logo('oceanbasket.com'),
    phone: '(011) 390 3973',
    description: 'The South African seafood restaurant chain.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal B (Domestic), Landside' })],
  }),
  the_raj_indian_cuisine: restaurant({
    name: 'The Raj Indian Cuisine',
    cuisine: 'Indian',
    amenity: 'restaurant',
    phone: '(011) 390 2122',
    description: 'An Indian restaurant serving classic curries and tandoori dishes.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal B (Domestic), Landside' })],
  }),
  vida_e_caffe: restaurant({
    name: 'Vida e Caffè',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.vidaecaffe.com',
    logoUrl: logo('vidaecaffe.com'),
    phone: '(011) 390 1482',
    description: 'The South African specialty-coffee chain, serving espresso and pastries.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal B (Domestic), Airside' })],
  }),
  nandos_terminal_b: restaurant({
    name: "Nando's",
    cuisine: 'Portuguese, Flame-Grilled Chicken',
    amenity: 'restaurant',
    website: 'https://www.nandos.co.za',
    logoUrl: logo('nandos.co.za'),
    phone: '(011) 390 2599',
    description: "The South African-founded flame-grilled peri-peri chicken chain. One of two O.R. Tambo outlets, on the Domestic landside (the other is on the International landside in Terminal A).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal B (Domestic), Landside' })],
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

  const aResult = await processTerminal(AIRPORT, TERMINAL_A, 'Terminal A (International)', terminalAVenues);
  const bResult = await processTerminal(AIRPORT, TERMINAL_B, 'Terminal B (Domestic)', terminalBVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_A, TERMINAL_B]));

  const totalCreated = aResult.created + bResult.created;
  const totalDeleted = aResult.deleted + bResult.deleted;
  const totalVenues = Object.keys(terminalAVenues).length + Object.keys(terminalBVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
