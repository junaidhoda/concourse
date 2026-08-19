'use strict';
/**
 * Fills in complete data for all Murtala Muhammed International Airport
 * (Lagos, Nigeria — IATA: LOS) restaurants/bars/cafés in Firestore, based on
 * research conducted on 2026-08-15.
 *
 * IMPORTANT DATA-AVAILABILITY CAVEAT, read before treating gaps as mistakes:
 * unlike the European/Australasian airports covered by this repo's other
 * add_*_venues.js scripts, Murtala Muhammed does not have a single official,
 * comprehensive airport-wide F&B directory website. Research combined the
 * MMA2 terminal operator's own site (mma2.ng and mma2.com.ng — Bi-Courtney
 * Aviation Services Limited, which runs MMA2 independently of FAAN),
 * Wikipedia, FAAN's own MMIA renovation FAQ, and several independent airport
 * guide sites (destinali.com, sleepinginairports.net, tortoisepath.com,
 * flightpadi.com, kupi.com) that cross-corroborated the same handful of
 * named venues. No comparable published source could be found for GAT/MM1
 * (see TERMINAL STRUCTURE below) despite an extensive search — that terminal
 * is therefore left out of this script entirely rather than represented with
 * fabricated or guessed venues; it is a currently-operating terminal and a
 * real gap in this dataset, not a "closed terminal, skip" case like MMIA
 * Terminal 1 below.
 *
 * TERMINAL STRUCTURE: Murtala Muhammed has FOUR physically separate terminal
 * buildings in total, confirmed via Wikipedia, FAAN's own site and multiple
 * independent guides: GAT/MM1 (General Aviation Terminal, the older
 * domestic-flight terminal — Air Peace's main base, also used by Overland
 * Airways), MMA2 (the newer, privately-run domestic terminal — Bi-Courtney
 * Aviation Services Limited, ~75% of Lagos domestic traffic, used by Arik
 * Air's PHC/Escravos routes, Aero Contractors, Dana Air, ASMAN, MAX, Med-
 * View, Ibom Air, Imo Air and some Air Peace routes), and two international
 * buildings, MMIA Terminal 1 (the original 1979 terminal) and MMIA Terminal
 * 2 (opened 2022). As of this research date, FAAN has CLOSED MMIA Terminal 1
 * for a 22-month rehabilitation that began March 2026 (confirmed via FAAN's
 * own MMIA rehabilitation FAQ and multiple 2026 news reports) — international
 * arrivals now route through Terminal 2, and departures use a temporary
 * 8,000 sqm hall built adjacent to Terminal 2 with its own check-in,
 * security and three gates. Terminal 1 is therefore excluded from this
 * script as a currently non-operational building, the same way Rome
 * Fiumicino's long-closed Terminal 2 was excluded from add_fco_venues.js —
 * this is a temporary-but-real closure, not a zone/pier miscategorization.
 * This script covers the two terminals with a verifiable, currently-active
 * F&B presence: MMA2 (domestic) and MMIA Terminal 2 (international, now
 * handling all international traffic including the temporary departure
 * hall next to it — no source described F&B specifically inside that new
 * temporary hall, so venues below reflect the main Terminal 2 building's
 * published directory, which may shift as the temporary-hall arrangement
 * matures).
 *
 * MULTI-OUTLET / CROSS-TERMINAL CONVENTION: Chicken Republic and KFC each
 * have a confirmed, independently-sourced presence in BOTH MMA2 (via mma2.
 * ng's own directory) and Terminal 2 (via destinali.com and sleepinginairports.
 * net's independent airport guide, which lists them among the international
 * terminal's dining options with published hours) — since MMA2 and Terminal
 * 2 are different physical buildings, these are kept as separate docs per
 * terminal, per this dataset's standing convention, rather than merged.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - Opening hours are included only where a source explicitly published
 *     them for that specific venue (Barcelos, Bukka Hut, Chicken Republic
 *     T2, KFC T2, Krispy Kreme, Newrest ASL, So Fresh, all via
 *     sleepinginairports.net's dated guide; Kilimanjaro via its own
 *     TortoisePath listing) — left blank everywhere else rather than
 *     guessed. No venue publishes a 24/7 claim, so `open_24_7` is false
 *     throughout.
 *   - Before/after-security detail is recorded only where a source stated it
 *     explicitly: Kilimanjaro Restaurant is confirmed to be in the
 *     "Departure Lounge" (airside). No other venue's before/after-security
 *     status was published anywhere found, so those are left at this
 *     dataset's landside default rather than asserted with false confidence
 *     — `location_notes` says so explicitly for each of those venues.
 *   - Phone numbers are published for only one venue (Kilimanjaro). Left
 *     blank elsewhere.
 *   - `website`/`logo_url` are filled in only for brands independently
 *     verifiable as real national/international chains with a confident
 *     public domain (KFC, Burger King, Krispy Kreme, Chicken Republic,
 *     Barcelos, Domino's Pizza, Eric Kayser, Newrest) — independent or
 *     lower-confidence concepts (Old English Bakery & Superstores, Kilimanjaro
 *     Restaurant, Umutu Coffee Company, Bukka Hut, So Fresh) are left blank
 *     rather than guessing a domain.
 *
 * Lagos/Murtala Muhammed appears in NEITHER reference script (migrate_
 * firestore.js's AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore
 * slug is unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'lagos' first, then 'los', using whichever has existing terminal
 * data). It never creates a new `airports/{id}` metadata doc itself.
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
 * bucket covered here (MMA2 and Terminal 2 — this script does not touch any
 * existing GAT/MM1 or Terminal 1 data, since it defines no venues for them;
 * see purge behavior below for what that means for a stale GAT/MM1 bucket).
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't one of THIS script's two terminal ids (MMA2,
 * TERMINAL_2) gets its restaurants subcollection and then the terminal doc
 * itself deleted. NOTE: because this script intentionally does not cover
 * GAT/MM1 or (the currently-closed) Terminal 1, running it WILL purge any
 * existing `gat`/`mm1`/`terminal_1`-style terminal doc from Firestore if one
 * exists from a previous run — that is the same "no fabricated venues, no
 * orphaned dead buckets" principle applied consistently, but double-check
 * this is what you want before running if GAT data was added by some other
 * means in the meantime.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_los_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['lagos', 'los'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const MMA2 = 'mma2';
const TERMINAL_2 = 'terminal_2';

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

// ─── MMA2 venues (domestic terminal, operated by Bi-Courtney Aviation) ──────

const mma2Venues = {
  chicken_republic_mma2: restaurant({
    name: 'Chicken Republic',
    cuisine: 'Nigerian, Fast Food, Chicken',
    amenity: 'fast_food',
    website: 'https://www.chicken-republic.com',
    logoUrl: logo('chicken-republic.com'),
    description: "Nigeria's leading fried-chicken fast-food chain. One of two Lagos-airport outlets (also at Terminal 2 International).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'MMA2 (Domestic Terminal), before/after-security zone not published' })],
  }),
  kfc_mma2: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    description: "KFC's classic fried-chicken menu. One of two Lagos-airport outlets (also at Terminal 2 International).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'MMA2 (Domestic Terminal), before/after-security zone not published' })],
  }),
  burger_king_mma2: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://www.bk.com',
    logoUrl: logo('bk.com'),
    description: 'Flame-grilled beef and crispy chicken burgers, including limited-time items like the double-patty "Long Kings" BBQ burger; online ordering via the BK app.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'MMA2 (Domestic Terminal), before/after-security zone not published' })],
  }),
  old_english_bakery: restaurant({
    name: 'Old English Bakery & Superstores',
    cuisine: 'Bakery, Supermarket',
    amenity: 'bakery',
    description: 'A bakery and supermarket combination stocking baked goods and grocery essentials for travellers.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'MMA2 (Domestic Terminal), before/after-security zone not published' })],
  }),
  eric_kayser: restaurant({
    name: 'Eric Kayser',
    cuisine: 'French Bakery, Café',
    amenity: 'bakery',
    website: 'https://www.maison-kayser.com',
    logoUrl: logo('maison-kayser.com'),
    description: 'The French artisan bakery and café chain, known for its sourdough breads, viennoiserie and coffee.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'MMA2 (Domestic Terminal), before/after-security zone not published' })],
  }),
};

// ─── Terminal 2 venues (international/regional — sole currently-operating ───
// ─── international terminal while MMIA Terminal 1 undergoes a 22-month ─────
// ─── rehabilitation begun March 2026) ────────────────────────────────────────

const terminal2Venues = {
  kilimanjaro: restaurant({
    name: 'Kilimanjaro Restaurant',
    cuisine: 'Casual Dining, Nigerian, International',
    amenity: 'restaurant',
    phone: '+234 811 379 7696',
    description: 'A casual-dining restaurant for quick, familiar meals before a flight.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 (International), Departure Lounge', openingHours: '7:00am - 10:00pm' })],
  }),
  kfc_t2: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    description: "KFC's classic fried-chicken menu. One of two Lagos-airport outlets (also at MMA2 Domestic).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published', openingHours: '7:00am - 9:00pm' })],
  }),
  dominos_pizza: restaurant({
    name: "Domino's Pizza",
    cuisine: 'Pizza, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.dominos.ng',
    logoUrl: logo('dominos.ng'),
    description: "Domino's Pizza's international fast-food pizza menu.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published' })],
  }),
  umutu_coffee_company: restaurant({
    name: 'Umutu Coffee Company',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'A coffee shop offering aromatic coffee and desserts.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published' })],
  }),
  barcelos: restaurant({
    name: 'Barcelos',
    cuisine: 'Flame-Grilled Chicken, Portuguese-Style',
    amenity: 'restaurant',
    website: 'https://www.barcelos.com',
    logoUrl: logo('barcelos.com'),
    description: 'Flame-grilled Portuguese-style chicken chain.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published', openingHours: '6:00am - 10:00pm' })],
  }),
  bukka_hut: restaurant({
    name: 'Bukka Hut',
    cuisine: 'Nigerian, Local Cuisine',
    amenity: 'restaurant',
    description: 'A Nigerian "bukka"-style eatery serving local dishes.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published', openingHours: '7:00am - 9:00pm' })],
  }),
  chicken_republic_t2: restaurant({
    name: 'Chicken Republic',
    cuisine: 'Nigerian, Fast Food, Chicken',
    amenity: 'fast_food',
    website: 'https://www.chicken-republic.com',
    logoUrl: logo('chicken-republic.com'),
    description: "Nigeria's leading fried-chicken fast-food chain. One of two Lagos-airport outlets (also at MMA2 Domestic).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published', openingHours: '7:00am - 9:00pm' })],
  }),
  krispy_kreme: restaurant({
    name: 'Krispy Kreme',
    cuisine: 'Doughnuts, Café',
    amenity: 'bakery',
    website: 'https://www.krispykreme.com',
    logoUrl: logo('krispykreme.com'),
    description: 'Original Glazed® doughnuts and coffee.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published', openingHours: '6:00am - 10:00pm' })],
  }),
  newrest_asl: restaurant({
    name: 'Newrest ASL',
    cuisine: 'Quick Service, Various',
    amenity: 'food_court',
    website: 'https://www.newrest.eu',
    logoUrl: logo('newrest.eu'),
    description: 'A quick-service concession from Newrest, the global airport catering and retail operator.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published', openingHours: '8:00am - 9:00pm' })],
  }),
  so_fresh: restaurant({
    name: 'So Fresh',
    cuisine: 'Healthy, Juice Bar',
    amenity: 'fast_food',
    description: 'A healthy-eating and juice-bar concept for travellers.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 (International), before/after-security zone not published', openingHours: '8:00am - 9:00pm' })],
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

  const mma2Result = await processTerminal(AIRPORT, MMA2, 'MMA2 (Domestic Terminal)', mma2Venues);
  const t2Result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2 (International)', terminal2Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([MMA2, TERMINAL_2]));

  const totalCreated = mma2Result.created + t2Result.created;
  const totalDeleted = mma2Result.deleted + t2Result.deleted;
  const totalVenues = Object.keys(mma2Venues).length + Object.keys(terminal2Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
