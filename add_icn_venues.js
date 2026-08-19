'use strict';
/**
 * Fills in complete data for Incheon International Airport (ICN),
 * restaurants/bars/cafés/dessert shops in Firestore. Researched 2026-08-16
 * from the official site, www.airport.kr (Incheon International Airport
 * Corporation), At the Airport > Food & Beverage
 * (https://www.airport.kr/ap_en/1534/subview.do), using Claude in Chrome
 * browser automation (not WebFetch — the listing is a JS-driven page whose
 * three tabs swap content via AJAX).
 *
 * SITE NAVIGATION CAVEAT: the English-language URL paths under
 * /ap/en/... do not resolve directly (they redirect to the Korean
 * homepage or 404) — the site's language state is session/cookie-based,
 * not purely URL-path-based. The reliable path is: load
 * https://www.airport.kr/sites/ap_en/index.do (the English session root,
 * reached via the KOR/ENG language switcher on the Korean homepage), then
 * navigate via the visible "At the Airport" > "Food & Beverage" menu link,
 * which resolves to the stable URL used above.
 *
 * TERMINAL STRUCTURE: ICN has two genuinely distinct terminal buckets
 * under this dataset's "own check-in AND own security" test. Terminal 1
 * is the original main building, with its own check-in and its own
 * security/immigration screening. The Concourse (Tapdong-gwan / "Transfer
 * Concourse") is a satellite pier reached from Terminal 1 exclusively via
 * the underground IAT shuttle train, boarded only after already clearing
 * Terminal 1's own security — it has no check-in counters and no security
 * of its own, so every Concourse venue is folded into the terminal_1
 * bucket here (all Concourse venues are airside, since the only way to
 * reach the Concourse is past T1 security). Terminal 2, opened in 2018,
 * is a fully separate building with its own check-in halls and its own
 * security/immigration screening and its own boarding gates (200-series
 * gate numbers), so it is modelled as a genuinely separate terminal_2
 * bucket. The official site's own tab structure (Terminal 1 / Terminal 2
 * / Concourse) matches this exactly.
 *
 * SOURCES & METHODOLOGY: the Food & Beverage page has three tabs
 * (Terminal 1, Terminal 2, Concourse) that swap the full listing via AJAX
 * with no pagination — every item for the active tab is present in the
 * DOM at once. Each listing card exposes: name, category (Korean Food /
 * Asian / Western / Fast Food / Food Court / Snack, Cafe & Dessert),
 * badges (Best / 24H), operating hours, phone (where published), and a
 * free-text location string. There is no authoritative structural
 * airside/landside filter field on this site (unlike HKG's
 * data-filter-loc or CAN's equivalent) — every outlet's `airside` value
 * below was determined by a location-TEXT inference rule instead (see
 * next paragraph). `cuisine` below is taken directly from the site's own
 * category field (not independently researched), and `amenity` is set to
 * 'cafe' for everything in the site's "Snack, Cafe & Dessert" category
 * and 'restaurant' otherwise — both non-fabricated, derived straight from
 * the site's own categorization.
 *
 * AIRSIDE/LANDSIDE INFERENCE RULE: in the absence of a structural field,
 * this dataset uses the rule AIRSIDE if and only if the location text
 * explicitly contains "Gate <number>" (any phrasing — "Near Gate X",
 * "next to Gate X", "Gate X on 3F", etc.); everything else (Check-In
 * Counter, Arrival Hall, Exit N, Traffic/Transportation Center, Public
 * Area, B1/Basement, floor-only descriptions like "4th Floor, West Side"
 * with no gate mention) defaults to LANDSIDE. This was externally
 * validated against firstkfood.com's explicit before/after-security
 * breakdown for several T1 4th-floor food-court venues (Sonsuheon, Food
 * Empire West, Hansik Sodam-gil, Ja Yeon among them — all confirmed
 * landside despite being on the 4th floor, the same floor as several
 * genuinely airside gate-adjacent venues) and against creatrip.com's
 * confirmation that a "Near Exit 12" café is landside. Two explicit
 * exceptions to the plain rule, both trusted per this dataset's
 * page-truth-over-label precedent:
 *   (1) "Jamba Juice T2-LAND" (Terminal 2) has location text "...Terminal
 *       2, Incheon Airport Near Gate 10" — containing "Gate 10" and so
 *       matching the plain rule — but its own brand-name suffix
 *       explicitly self-declares "-LAND". The deliberate, specific
 *       self-classification in the name is trusted over the passing gate
 *       mention in the free-text location string, so this one outlet is
 *       modelled as landside.
 *   (2) Two Terminal 2 outlets — "STARBUCKS" (Near Gate 7 on 1F) and
 *       "COFFEE@WORKS" (Near Gate 10 on 1F) — sit on 1F, which is
 *       normally the arrivals/landside floor at this airport, yet both
 *       explicitly use "Gate" wording. The literal "Gate" keyword is
 *       trusted over what would otherwise seem more physically plausible,
 *       so both are modelled as airside.
 *
 * DATA-QUALITY ANOMALIES found on the official site and how each was
 * handled (no-fabrication: nothing below was invented to paper over
 * these):
 *   - One Terminal 2 Food Court listing has no English name at all — only
 *     the Korean string "우리가김치" — so that literal string is used
 *     verbatim as its `name` below rather than guessing a romanization or
 *     translation.
 *   - "HANOKJIB KIMCHIJJIM" (Terminal 1) has the sparsest location string
 *     on the whole site — just "Terminal 1", no floor or gate — so its
 *     location_notes says as much rather than inventing a floor/gate.
 *   - One Concourse-tab listing for "COFFEE@WORKS" (phone 032-743-0808)
 *     carries location text reading "Near Gate 110 on 3F, Terminal 2" —
 *     but it was returned by the Concourse tab/filter, and Gate 110 falls
 *     squarely within the Concourse's own 100-series gate range (105-129
 *     seen elsewhere on this same tab), while Terminal 2's own gates are
 *     all 200-series. This is treated as a site data-entry slip (likely a
 *     copy-pasted template) and the venue is modelled as a Concourse
 *     (terminal_1, airside) outlet, per page-truth-over-label precedent —
 *     the specific, physically-checkable gate number is trusted over the
 *     generic "Terminal 2" text it was paired with.
 *   - Several literal brand-name variants are treated as the same
 *     chain and merged into one multi-outlet doc within a terminal:
 *     "HOLLYS" / "HOLLYS COFFEE" / "HOLLYS (Incheon Airport T1 Store)"
 *     all become one "HOLLYS" doc in Terminal 1; "PARIS BAGUETTE" /
 *     "Paris Baguette" merge in Terminal 1; "STARBUCKS" / "Starbucks"
 *     merge in Terminal 2; "TWOSOME PLACE" / "A TWOSOME PLACE" merge in
 *     Terminal 2 (as "A Twosome Place", the chain's real name). Two
 *     look-alike names are deliberately kept SEPARATE rather than merged,
 *     since nothing on the site indicates they're the same vendor:
 *     "PASCUCCI" vs "Caffe Pascucci" (Terminal 2), and "Namsan King Pork
 *     Cutlet" vs "Namsan King Size Pork Cutlet" (different terminals in
 *     this case, so it's moot for merging, but the names were kept
 *     distinct rather than assumed identical).
 *   - "Jamba Juice" appears under three distinct display names across the
 *     two terminals — "Jamba Juice T1-AIR" (Terminal 1, 2 outlets, one
 *     reached only via the Concourse), plain "Jamba Juice" (Terminal 1,
 *     1 landside outlet), "Jamba Juice T2-AIR" (Terminal 2, 1 outlet),
 *     and "Jamba Juice T2-LAND" (Terminal 2, 1 outlet, see exception (1)
 *     above) — all kept as separate docs since the site itself
 *     distinguishes them by name, not just by outlet location.
 *
 * MULTI-OUTLET CONVENTION: same-brand venues within the SAME terminal
 * bucket (Terminal 1 including Concourse, or Terminal 2) are combined
 * into one doc with multiple `outlets[]` entries; the same brand
 * appearing in the OTHER terminal is a separate doc (e.g. "LOTTERIA",
 * "PASCUCCI", "ANGELINUS", "Krispy Kreme Doughnuts", "Gongcha"/"Gong
 * Cha", "Starbucks", "COFFEE@WORKS", "Paul Bassett", "Bizeun"/"BIZEUN"
 * etc. each exist as independent single- or multi-outlet docs in BOTH
 * terminal_1 and terminal_2 — never merged across the terminal boundary).
 *
 * NO FABRICATION: name, category (as cuisine), location text, opening
 * hours, and phone (where published) are all taken directly from the
 * site. The site publishes no free-text description field for any
 * listing, so `description` is left blank throughout.  `logo_url` is
 * populated only for a small set of globally- or nationally-recognized
 * chains whose official domain is independently unambiguous (KFC, Burger
 * King, Shake Shack, LOTTERIA, Taco Bell, Krispy Kreme Doughnuts, Dunkin',
 * Paris Baguette, Baskin Robbins, Starbucks, HOLLYS, Gong Cha/Gongcha,
 * %Arabica, A Twosome Place, ANGELINUS, Jamba Juice, The Coffee Bean & Tea
 * Leaf, PASCUCCI/Caffe Pascucci); left blank for Korea-only/local concepts
 * rather than guessed.
 *
 * This resolves to 175 terminal-scoped venue docs (85 in Terminal 1,
 * including the Concourse; 90 in Terminal 2) holding 206 total outlets
 * (101 in Terminal 1, 105 in Terminal 2).
 *
 * ICN does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'icn' first, then 'incheon', using whichever has existing
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
 * below is meant to be the complete, authoritative set for both terminal
 * buckets.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under
 * this airport whose id isn't one of THIS script's terminal ids
 * (terminal_1, terminal_2) gets its restaurants subcollection and then the
 * terminal doc itself deleted, so a stale/orphaned terminal bucket doesn't
 * keep inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_icn_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['icn', 'incheon'];
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

// Shorthand: o(level, locationNotes, airside, openingHours, open247)
const o = (level, notes, airside, hours, open247 = false) =>
  outlet({ airside, level, locationNotes: notes, openingHours: hours, open247 });

// ─── Terminal 1 venues (includes the Concourse, reached only via T1 security) ─

const terminal1Venues = {
  hwangsaengga_kalguksu: restaurant({
    name: 'Hwangsaengga Kalguksu', cuisine: 'Korean Food',
    outlets: [o('3F', 'Near Gate 31, 3F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  ja_yeon: restaurant({
    name: 'Ja Yeon', cuisine: 'Korean Food',
    outlets: [o('4F', 'Center, 4th Floor, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  xingkai: restaurant({
    name: 'XINGKAI', cuisine: 'Asian',
    outlets: [o('B1', 'Center of the Traffic Center, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  kfc_t1: restaurant({
    name: 'KFC', cuisine: 'Fast Food', website: 'kfc.com', logoUrl: logo('kfc.com'),
    outlets: [o('3F', 'Near Gate 10, 11, 3F, Terminal 1', 'airside', '00:00 - 24:00', true)],
  }),
  shake_shack_t1: restaurant({
    name: 'Shake Shack', cuisine: 'Fast Food', website: 'shakeshack.com', logoUrl: logo('shakeshack.com'),
    outlets: [o('3F', 'Near Check-In Counter H, 3F, Terminal 1', 'landside', '00:00 - 24:00', true)],
  }),
  lotteria_t1: restaurant({
    name: 'LOTTERIA', cuisine: 'Fast Food', website: 'lotteria.com', logoUrl: logo('lotteria.com'),
    outlets: [
      o('1F', 'Center of Public Area, 1F, Terminal 1', 'landside', '00:00 - 24:00', true),
      o('4F', 'Near Gate 30, 4F, Terminal 1', 'airside', '00:00 - 24:00', true),
      o('3F', 'Near Gate 121, 3F, Concourse', 'airside', '00:00 - 24:00', true),
    ],
  }),
  burger_king_t1: restaurant({
    name: 'Burger King', cuisine: 'Fast Food', website: 'burgerking.com', logoUrl: logo('burgerking.com'),
    outlets: [o('B1', 'Center of Transportation Center, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  cheongun_miga: restaurant({
    name: 'Cheongun Miga', cuisine: 'Korean Food',
    outlets: [o('4F', '4th Floor, East Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  sonsuheon: restaurant({
    name: 'Sonsuheon', cuisine: 'Korean Food',
    outlets: [o('4F', '4th Floor, West Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  pleeating: restaurant({
    name: 'PLEEATING', cuisine: 'Korean Food',
    outlets: [o('1F', 'Center of Public Area, 1F, Terminal 1', 'landside', '00:00 - 24:00', true)],
  }),
  hansik_sodamgil_t1: restaurant({
    name: 'Hansik Sodam-gil', cuisine: 'Korean Food',
    outlets: [o('B1', 'West of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  food_garden: restaurant({
    name: 'FOOD GARDEN', cuisine: 'Korean Food',
    outlets: [o('1F', 'Near Exit 12, 1F, Terminal 1', 'landside', '00:00 - 24:00', true)],
  }),
  the_taco_booth: restaurant({
    name: 'THE TACO BOOTH', cuisine: 'Western',
    outlets: [o('3F', 'Near Gate 12, 3F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  lagrillia: restaurant({
    name: 'LAGRILLIA', cuisine: 'Western',
    outlets: [o('3F', 'Near Gate 23, 3F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  culinary_square_t1: restaurant({
    name: 'Culinary Square', cuisine: 'Food Court',
    outlets: [o('B1', 'East of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  mealbon: restaurant({
    name: 'MEALBON', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  nadri_jjolmyeon: restaurant({
    name: 'Nadri Jjolmyeon', cuisine: 'Food Court',
    outlets: [o('B1', 'Center Point, Basement 1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  manseokjang: restaurant({
    name: 'Manseokjang', cuisine: 'Food Court',
    outlets: [o('B1', 'Center Point, Basement 1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  jeondongjib_t1: restaurant({
    name: 'Jeondongjib', cuisine: 'Food Court',
    outlets: [o('B1', 'Center Point, Basement 1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  namsan_king_pork_cutlet: restaurant({
    name: 'Namsan King Pork Cutlet', cuisine: 'Food Court',
    outlets: [o('4F', '4th Floor, West Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  char_t1: restaurant({
    name: 'CHAR', cuisine: 'Food Court',
    outlets: [o('4F', '4th Floor, General Zone, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  hanokjib_kimchijjim_t1: restaurant({
    name: 'HANOKJIB KIMCHIJJIM', cuisine: 'Food Court',
    outlets: [o('', 'Terminal 1 (exact floor/gate not specified on official site)', 'landside', '06:00 - 22:00')],
  }),
  food_empire_west: restaurant({
    name: 'FOOD EMPIRE WEST', cuisine: 'Food Court',
    outlets: [o('4F', '4th Floor, West Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  tsukizen: restaurant({
    name: 'TSUKIZEN', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 30, 4F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  ontangjip: restaurant({
    name: 'ONTANGJIP', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 30, 4F, Terminal 1', 'airside', '00:00 - 24:00', true)],
  }),
  torung_bangkok: restaurant({
    name: 'TORUNG BANGKOK', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 30, 4F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  nadri_hoegwan: restaurant({
    name: 'NADRI HOEGWAN', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 30, 4F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  gyeingseong_bunsik: restaurant({
    name: 'GYEINGSEONG BUNSIK', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 30, 4F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  burger_station_t1: restaurant({
    name: 'Burger Station', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 12, 4th Floor, Duty-Free Area, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  oriental_bay_t1: restaurant({
    name: 'Oriental Bay', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 12, 4th Floor, Duty-Free Area, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  tawban: restaurant({
    name: 'TawBan', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 12, 4th Floor, Duty-Free Area, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  broth_kitchen_t1: restaurant({
    name: 'Broth Kitchen', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 12, 4th Floor, Duty-Free Area, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  krispy_pork_cutlet_t1: restaurant({
    name: 'Krispy Pork Cutlet', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 12, 4th Floor, Duty-Free Area, Terminal 1', 'airside', '00:00 - 00:00')],
  }),
  modern_shanghai_t1: restaurant({
    name: 'Modern Shanghai', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 12, 4th Floor, Duty-Free Area, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  a_nature_inspired_korean_food_t1: restaurant({
    name: 'A Nature-Inspired Korean Food', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 12, 4th Floor, Duty-Free Area, Terminal 1', 'airside', '00:00 - 00:00', true)],
  }),
  tacobell_t1: restaurant({
    name: 'TACOBELL', cuisine: 'Food Court', website: 'tacobell.com', logoUrl: logo('tacobell.com'),
    outlets: [o('B1', 'East of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  sonsoo_ok_t1: restaurant({
    name: 'Sonsoo Ok', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  ourhomes_kimchi_cuisine: restaurant({
    name: "OURHOME's Kimchi Cuisine", cuisine: 'Food Court',
    outlets: [o('B1', 'East of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  little_xingkai_t1: restaurant({
    name: 'Little Xingkai', cuisine: 'Food Court',
    outlets: [o('B1', 'East of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  namsan_king_size_pork_cutlet_t1: restaurant({
    name: 'Namsan King Size Pork Cutlet', cuisine: 'Food Court',
    outlets: [o('B1', 'East of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  food_empire_east: restaurant({
    name: 'FOOD EMPIRE EAST', cuisine: 'Food Court',
    outlets: [o('4F', '4th Floor, East Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  konthai_t1: restaurant({
    name: 'KONThai', cuisine: 'Food Court',
    outlets: [o('4F', '4th Floor, East Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  nimat_t1: restaurant({
    name: 'NIMAT', cuisine: 'Food Court',
    outlets: [o('4F', '4th Floor, East Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  cheongjindong_sundubu: restaurant({
    name: 'Cheongjindong Sundubu', cuisine: 'Food Court',
    outlets: [o('4F', '4th Floor, East Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  pho_t1: restaurant({
    name: 'PHO', cuisine: 'Asian',
    outlets: [o('B1', 'Center of the Traffic Center, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  mukyoku_t1: restaurant({
    name: 'MUKYOKU', cuisine: 'Asian',
    outlets: [o('1F', 'Near Arrival Hall C, 1F, Terminal 1', 'landside', '00:00 - 24:00', true)],
  }),
  seoul_street: restaurant({
    name: 'Seoul-Street', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('4F', '4th Floor, East Side, Terminal 1', 'landside', '05:30 - 22:00')],
  }),
  ssoja_toast: restaurant({
    name: 'SSOJA TOAST', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('4F', '4th Floor, East Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  hollys_t1: restaurant({
    name: 'HOLLYS', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'hollys.co.kr', logoUrl: logo('hollys.co.kr'),
    outlets: [
      o('4F', '4th Floor, East Side, Terminal 1', 'landside', '06:00 - 22:00'),
      o('B1', 'West of Public Area, B1, Terminal 1', 'landside', '06:00 - 22:00'),
      o('1F', 'Near Arrival Hall B-C, 1F, Terminal 1', 'landside', '00:00 - 24:00', true),
      o('3F', 'Near Gate 122, 3F, Concourse', 'airside', '00:00 - 24:00', true),
    ],
  }),
  dunkin_t1: restaurant({
    name: "Dunkin'", cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'dunkindonuts.com', logoUrl: logo('dunkindonuts.com'),
    outlets: [
      o('3F', 'Near Exit 15, 3F, Terminal 1', 'landside', '06:00 - 22:00'),
      o('3F', 'Next to Gate 113, Concourse', 'airside', '06:00 - 22:00'),
    ],
  }),
  jamba_juice_t1_air: restaurant({
    name: 'Jamba Juice T1-AIR', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'jambajuice.com', logoUrl: logo('jambajuice.com'),
    outlets: [
      o('3F', 'Near Gate 6, Terminal 1', 'airside', '06:00 - 22:00'),
      o('', 'East Wing, Terminal 1 (reached via Concourse)', 'airside', '00:00 - 24:00', true),
    ],
  }),
  coffeesmith: restaurant({
    name: 'coffeesmith', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('4F', '4th Floor, West Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  modakk_snack: restaurant({
    name: 'MODAKK SNACK', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('4F', '4th Floor, West Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  eggdrop_t1: restaurant({
    name: 'EGGDROP', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('4F', '4th Floor, West Side, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  tous_les_jours_t1: restaurant({
    name: 'Tous Les Jours', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [
      o('3F', 'Near Gate 30, 3F, Terminal 1', 'airside', '00:00 - 24:00', true),
      o('1F', 'Near Arrival Hall B, 1F, Terminal 1', 'landside', '06:00 - 22:00'),
      o('3F', 'Near Gate 123, 3F, Concourse', 'airside', '06:00 - 22:00'),
    ],
  }),
  mimi_dandan: restaurant({
    name: 'Mimi Dandan', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('1F', 'Near Arrival Hall B, 1F, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  nomalo_coffee: restaurant({
    name: 'NOMALO COFFEE', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('1F', 'Near Arrival Hall E, 1F, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  american_trailer: restaurant({
    name: 'AMERICAN TRAILER', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 37, 3F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  krispy_kreme_doughnuts_t1: restaurant({
    name: 'Krispy Kreme Doughnuts', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'krispykreme.com', logoUrl: logo('krispykreme.com'),
    outlets: [
      o('3F', 'Near Gate 40, 3F, Terminal 1', 'airside', '06:00 - 22:00'),
      o('1F', 'Near Exit 10, 1F, Terminal 1', 'landside', '06:00 - 22:00'),
    ],
  }),
  paris_baguette_t1: restaurant({
    name: 'Paris Baguette', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'parisbaguette.com', logoUrl: logo('parisbaguette.com'),
    outlets: [
      o('3F', 'Near Gate 12, 3F, Terminal 1', 'airside', '00:00 - 24:00', true),
      o('3F', 'Near Check-In Counter G, 3F, Terminal 1', 'landside', '00:00 - 24:00', true),
    ],
  }),
  twosome_place_t1: restaurant({
    name: 'TWOSOME PLACE', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'twosome.co.kr', logoUrl: logo('twosome.co.kr'),
    outlets: [o('4F', 'Center, 4th Floor, Terminal 1', 'landside', '00:00 - 24:00', true)],
  }),
  pascucci_t1: restaurant({
    name: 'PASCUCCI', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'caffepascucci.it', logoUrl: logo('caffepascucci.it'),
    outlets: [
      o('3F', 'Near Gate 17, 3F, Terminal 1', 'airside', '06:00 - 22:00'),
      o('3F', 'Near Check-In Counter H, 3F, Terminal 1', 'landside', '06:00 - 22:00'),
    ],
  }),
  byulmi_bunsik_t1: restaurant({
    name: 'BYULMI BUNSIK', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('B1', 'Center of the Traffic Center, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  meallions: restaurant({
    name: 'Meallions', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('B1', 'Center of the Traffic Center, B1, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  baskin_robbins_t1: restaurant({
    name: 'Baskin Robbins', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'baskinrobbins.com', logoUrl: logo('baskinrobbins.com'),
    outlets: [o('3F', 'Near Gate 24, 3F, Terminal 1', 'airside', '06:00 - 22:00')],
  }),
  starbucks_t1: restaurant({
    name: 'Starbucks', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [
      o('B1', 'Center, B1, Terminal 1', 'landside', '06:00 - 22:00'),
      o('3F', 'Near Gate 28, 3F, Terminal 1', 'airside', '00:00 - 24:00 (Break Time 23:50 - 00:30)', true),
    ],
  }),
  gong_cha_t1: restaurant({
    name: 'GONG CHA', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'gong-cha.com', logoUrl: logo('gong-cha.com'),
    outlets: [o('3F', 'Near Check-In Counter B, 3F, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  coffee_at_works_t1: restaurant({
    name: 'COFFEE@WORKS', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [
      o('3F', 'Near Exit 12, 3F, Terminal 1', 'landside', '06:00 - 22:00'),
      o('3F', 'Near Gate 110, 3F, Concourse', 'airside', '06:00 - 22:00'),
    ],
  }),
  haneulmaru_cafe_t1: restaurant({
    name: 'Haneulmaru Cafe', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('B1', 'Middle of Transportation Center, B1, Terminal 1', 'landside', '08:00 - 20:00')],
  }),
  paul_bassett_t1: restaurant({
    name: 'Paul Bassett', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('1F', 'Near Arrival Hall D, 1F, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  angelinus_t1: restaurant({
    name: 'ANGELINUS', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'angel-in-us.com', logoUrl: logo('angel-in-us.com'),
    outlets: [
      o('1F', 'Near Arrival Hall E, 1F, Terminal 1', 'landside', '00:00 - 24:00', true),
      o('3F', 'Near Gate 48, 3F, Terminal 1', 'airside', '06:00 - 22:00'),
      o('3F', 'Near Gate 129, 3F, Concourse', 'airside', '06:00 - 22:00'),
    ],
  }),
  linas_t1: restaurant({
    name: "LINA'S", cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Check-In Counter M, 3F, Terminal 1', 'landside', '00:00 - 24:00', true)],
  }),
  jamba_juice_t1: restaurant({
    name: 'Jamba Juice', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'jambajuice.com', logoUrl: logo('jambajuice.com'),
    outlets: [o('3F', 'Near Exit 10, 3F, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  livfarm: restaurant({
    name: 'livfarm', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 41, 3F, Terminal 1 (Duty-Free Area)', 'airside', '06:00 - 23:30')],
  }),
  bizeun_t1: restaurant({
    name: 'Bizeun', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Exit 5, 3F, Terminal 1', 'landside', '06:00 - 22:00')],
  }),
  taste_of_nature_t1: restaurant({
    name: 'Taste of Nature', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 114, 3F, Concourse', 'airside', '00:00 - 24:00', true)],
  }),
  classic_noodles: restaurant({
    name: 'Classic Noodles', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 114, 3F, Concourse', 'airside', '06:00 - 22:00')],
  }),
  crispy_pork_cutlet_concourse: restaurant({
    name: 'Crispy Pork Cutlet', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 114, 3F, Concourse', 'airside', '06:00 - 22:00')],
  }),
  bunsik_gotgan_t1: restaurant({
    name: 'Bunsik Gotgan', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 114, 3F, Concourse', 'airside', '06:00 - 22:00')],
  }),
  bhc_chicken: restaurant({
    name: 'BHC CHICKEN', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 122, 3F, Concourse', 'airside', '06:00 - 22:00')],
  }),
  soi_yeonnam: restaurant({
    name: 'SOI YEONNAM', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 122, 3F, Concourse', 'airside', '06:00 - 22:00')],
  }),
  gongpyeongdong_giant_cutlet_t1: restaurant({
    name: 'GONGPYEONG-DONG GIANT CUTLET', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 122, 3F, Concourse', 'airside', '06:00 - 22:00')],
  }),
  sodam_bansang_t1: restaurant({
    name: 'SODAM BANSANG', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 122, 3F, Concourse', 'airside', '00:00 - 24:00', true)],
  }),
  byeolmiga: restaurant({
    name: 'BYEOLMIGA', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 122, 3F, Concourse', 'airside', '00:00 - 24:00', true)],
  }),
  the_coffee_bean_and_tea_leaf_t1: restaurant({
    name: 'The Coffee Bean & Tea Leaf', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'coffeebean.com', logoUrl: logo('coffeebean.com'),
    outlets: [o('3F', 'Near Gate 105, 3F, Concourse', 'airside', '06:00 - 22:00')],
  }),
};

// ─── Terminal 2 venues ────────────────────────────────────────────────────

const terminal2Venues = {
  ja_yeon_t2: restaurant({
    name: 'Ja Yeon', cuisine: 'Korean Food',
    outlets: [o('4F', 'Center, 4th Floor, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  hwangsaengga_kalguksu_t2: restaurant({
    name: 'Hwangsaengga Kalguksu', cuisine: 'Korean Food',
    outlets: [
      o('B1', 'Center Point, B1, Terminal 2', 'landside', '06:00 - 22:00'),
      o('4F', 'Near Gate 227, 4F, Terminal 2', 'airside', '06:00 - 22:00'),
    ],
  }),
  taste_of_nature_t2: restaurant({
    name: 'Taste of Nature', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 252, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  saboten: restaurant({
    name: 'SABOTEN', cuisine: 'Asian',
    outlets: [o('B1', 'Center of Public Area, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  shake_shack_t2: restaurant({
    name: 'Shake shack', cuisine: 'Fast Food', website: 'shakeshack.com', logoUrl: logo('shakeshack.com'),
    outlets: [o('3F', 'Near Check-In Counter G, 3F, Terminal 2', 'landside', '00:00 - 24:00', true)],
  }),
  mosburger: restaurant({
    name: 'MOSBURGER', cuisine: 'Fast Food',
    outlets: [o('3F', 'Near Gate 257, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  lotteria_t2: restaurant({
    name: 'LOTTERIA', cuisine: 'Fast Food', website: 'lotteria.com', logoUrl: logo('lotteria.com'),
    outlets: [
      o('1F', 'Near Arrival Hall A, 1F, Terminal 2', 'landside', '00:00 - 24:00', true),
      o('3F', 'Near Check-In Counter F, 3F, Terminal 2', 'landside', '00:00 - 24:00', true),
      o('4F', 'Near Gate 227, 4F, Terminal 2', 'airside', '00:00 - 24:00', true),
    ],
  }),
  burgerking_t2: restaurant({
    name: 'BURGERKING', cuisine: 'Fast Food', website: 'burgerking.com', logoUrl: logo('burgerking.com'),
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  dosun: restaurant({
    name: 'DOSUN', cuisine: 'Korean Food',
    outlets: [o('1F', 'Near Arrival Hall A, 1F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  jamunbak: restaurant({
    name: 'JAMUNBAK', cuisine: 'Korean Food',
    outlets: [o('4F', 'Center, 4th Floor, Terminal 2', 'landside', '05:30 - 22:00')],
  }),
  k_mealkit_smart_restaurant: restaurant({
    name: 'K-mealkit Smart Restaurant', cuisine: 'Korean Food',
    outlets: [o('1F', 'Near Arrival Hall B, 1F, Terminal 2', 'landside', '08:00 - 20:00')],
  }),
  gopizza: restaurant({
    name: 'GOPIZZA', cuisine: 'Western',
    outlets: [o('3F', 'Near Gate 235, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  timeless_korean_dining: restaurant({
    name: 'Timeless Korean Dining (Hansik Sodam-gil)', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  culinary_square_t2: restaurant({
    name: 'Culinary Square', cuisine: 'Food Court',
    outlets: [o('4F', 'Center, 4th Floor, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  jeju_seho_haejangguk: restaurant({
    name: 'Jeju Seho Haejangguk', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  hanokjip_kimchijjim_t2: restaurant({
    name: 'Hanokjip Kimchijjim', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  sokcho_kodari_naengmyeon: restaurant({
    name: 'Sokcho Kodari Naengmyeon', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  sinpo_sundae: restaurant({
    name: 'Sinpo Sundae', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  yeongju_bubu_maeul: restaurant({
    name: 'Yeongju Bubu Maeul', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  gajokhoegwan: restaurant({
    name: 'Gajokhoegwan', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  jeju_dombeok: restaurant({
    name: 'Jeju Dombeok', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  jeondongjib_t2: restaurant({
    name: 'Jeondongjib', cuisine: 'Food Court',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  tacobell_t2: restaurant({
    name: 'TACOBELL', cuisine: 'Food Court', website: 'tacobell.com', logoUrl: logo('tacobell.com'),
    outlets: [o('4F', 'East of Public Area, 4F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  sonsoo_ok_t2: restaurant({
    name: 'Sonsoo Ok', cuisine: 'Food Court',
    outlets: [o('4F', 'East of Public Area, 4F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  nimat_t2: restaurant({
    name: 'NIMAT', cuisine: 'Food Court',
    outlets: [o('4F', 'East of Public Area, 4F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  pho_t2: restaurant({
    name: 'PHO', cuisine: 'Food Court',
    outlets: [o('4F', 'East of Public Area, 4F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  woorika_kimchi: restaurant({
    name: '우리가김치', cuisine: 'Food Court',
    outlets: [o('4F', 'East of Public Area, 4F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  namsan_king_size_pork_cutlet_t2: restaurant({
    name: 'Namsan King Size Pork Cutlet', cuisine: 'Food Court',
    outlets: [o('4F', 'East of Public Area, 4F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  little_xingkai_t2: restaurant({
    name: 'LITTLE XINGKAI', cuisine: 'Food Court',
    outlets: [o('4F', 'East of Public Area, 4F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  burger_station_t2: restaurant({
    name: 'Burger Station', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 252, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  bunsik_gotgan_t2: restaurant({
    name: 'Bunsik Gotgan', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 252, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  crispy_pork_cutlet_t2: restaurant({
    name: 'Crispy Pork Cutlet', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 252, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  classic_noodles_t2: restaurant({
    name: 'Classic Noodles', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 252, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  yuksu_gojip: restaurant({
    name: 'Yuksu Gojip', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 252, 4F, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  hyangmigak: restaurant({
    name: 'HYANGMIGAK', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 249, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  hyoja_gomtang: restaurant({
    name: 'HYOJA GOMTANG', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 249, 4F, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  konthai_t2: restaurant({
    name: 'KONTHAI', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 249, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  sodam_bansang_t2: restaurant({
    name: 'SODAM BANSANG', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 249, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  taxiing_5: restaurant({
    name: 'TAXIING 5', cuisine: 'Food Court',
    outlets: [o('3F', 'Near Gate 249, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  hohokatsu: restaurant({
    name: 'HOHOKATSU', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 249, 4F, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  korea_food_and_pancakes: restaurant({
    name: 'Korea Food&Pancakes', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 274, Duty-Free Area, 4th Floor, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  modern_shanghai_t2: restaurant({
    name: 'Modern Shanghai', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 274, Duty-Free Area, 4th Floor, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  krispy_pork_cutlet_t2: restaurant({
    name: 'Krispy Pork Cutlet', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 274, Duty-Free Area, 4th Floor, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  hot_dog_and_chicken: restaurant({
    name: 'Hot Dog&Chicken', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 274, Duty-Free Area, 4th Floor, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  oriental_bay_t2: restaurant({
    name: 'Oriental Bay', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 274, Duty-Free Area, 4th Floor, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  broth_kitchen_t2: restaurant({
    name: 'Broth Kitchen', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 274, Duty-Free Area, 4th Floor, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  a_nature_inspired_korean_food_t2: restaurant({
    name: 'A Nature-Inspired Korean Food', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 274, Duty-Free Area, 4th Floor, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  addal: restaurant({
    name: 'ADDAL', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 227, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  choi_dining: restaurant({
    name: 'Choi Dining', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 227, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  soul_bowl: restaurant({
    name: 'SOUL BOWL', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 227, 4F, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  tianlu: restaurant({
    name: 'Tianlu', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 227, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  gongpyeongdong_giant_cutlet_t2: restaurant({
    name: 'GONGPYEONG-DONG GIANT CUTLET', cuisine: 'Food Court',
    outlets: [o('4F', 'Near Gate 227, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  misojeong: restaurant({
    name: 'Misojeong', cuisine: 'Asian',
    outlets: [o('4F', 'Center, 4th Floor, Terminal 2', 'landside', '04:30 - 22:00')],
  }),
  streat: restaurant({
    name: 'strEAT', cuisine: 'Asian',
    outlets: [o('1F', 'Public Area, 1F, Terminal 2', 'landside', '00:00 - 24:00', true)],
  }),
  mukyoku_t2: restaurant({
    name: 'MUKYOKU', cuisine: 'Asian',
    outlets: [o('3F', 'Near Gate 234, 3F, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  sagua_tteokbokki: restaurant({
    name: 'Sagua Tteokbokki', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Check-In Counter L, M, 3F, Terminal 2', 'landside', '06:00 - 20:00')],
  }),
  gongcha_t2: restaurant({
    name: 'Gongcha', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'gong-cha.com', logoUrl: logo('gong-cha.com'),
    outlets: [
      o('3F', 'Near Gate 219, 3F, Terminal 2', 'airside', '06:00 - 22:00'),
      o('3F', 'Near Exit 1, 3F, Terminal 2', 'landside', '06:00 - 22:00'),
      o('3F', 'Near Gate 245, 3F, Terminal 2', 'airside', '06:00 - 22:00'),
    ],
  }),
  katsu_mama: restaurant({
    name: 'KATSU MAMA', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 233, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  krispy_kreme_doughnuts_t2: restaurant({
    name: 'Krispy Kreme Doughnuts', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'krispykreme.com', logoUrl: logo('krispykreme.com'),
    outlets: [
      o('1F', 'Near Arrival Hall A, 1F, Terminal 2', 'landside', '06:00 - 22:00'),
      o('3F', 'Near Exit 2, 3F, Terminal 2', 'landside', '06:00 - 22:00'),
      o('3F', 'Near Gate 232, 3F, Terminal 2', 'airside', '06:00 - 22:00'),
    ],
  }),
  yooil_dak_gang_jeong: restaurant({
    name: 'YOOIL DAK GANG JEONG (Korean Street Food & Chicken)', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 264, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  colectivo: restaurant({
    name: 'COLECTIVO', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 219, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  angelinus_t2: restaurant({
    name: 'ANGELINUS', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'angel-in-us.com', logoUrl: logo('angel-in-us.com'),
    outlets: [
      o('3F', 'Near Gate 222, 3F, Terminal 2', 'airside', '00:00 - 24:00', true),
      o('3F', 'Near Exit 3, 3F, Terminal 2', 'landside', '06:00 - 22:00'),
    ],
  }),
  heineken_t2: restaurant({
    name: 'Heineken', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 219, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  gelccine: restaurant({
    name: 'GELCCINE', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 222, 3F, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  arabica_t2: restaurant({
    name: '% ARABICA', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'arabica.coffee', logoUrl: logo('arabica.coffee'),
    outlets: [o('3F', 'Near Gate 209, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  baskinrobbins_t2: restaurant({
    name: 'BaskinRobbins', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'baskinrobbins.com', logoUrl: logo('baskinrobbins.com'),
    outlets: [o('3F', 'Near Gate 280, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  paris_croissant: restaurant({
    name: 'Paris Croissant', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [
      o('3F', 'Near Gate 277, 3F, Terminal 2', 'airside', '05:00 - 23:00'),
      o('1F', 'Center of Public Area, 1F, Terminal 2', 'landside', '00:00 - 24:00', true),
    ],
  }),
  pascucci_t2: restaurant({
    name: 'PASCUCCI', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'caffepascucci.it', logoUrl: logo('caffepascucci.it'),
    outlets: [
      o('3F', 'Near Gate 288, 3F, Terminal 2', 'airside', '06:00 - 22:00'),
      o('3F', 'Near Check-In Counter G, 3F, Terminal 2', 'landside', '00:00 - 24:00', true),
    ],
  }),
  dunkin_t2: restaurant({
    name: "Dunkin'", cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'dunkindonuts.com', logoUrl: logo('dunkindonuts.com'),
    outlets: [
      o('3F', 'Near Exit 281, 3F, Terminal 2', 'landside', '06:00 - 22:00'),
      o('3F', 'Near Exit 253, 3F, Terminal 2', 'landside', '00:00 - 24:00', true),
    ],
  }),
  paul_bassett_t2: restaurant({
    name: 'Paul Bassett', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('1F', 'Near Arrival Hall A, 1F, Terminal 2', 'landside', '00:00 - 24:00', true)],
  }),
  jamba_juice_t2_air: restaurant({
    name: 'Jamba Juice T2-AIR', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'jambajuice.com', logoUrl: logo('jambajuice.com'),
    outlets: [o('', 'Near Gate 252, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  paris_baguette_t2: restaurant({
    name: 'PARIS BAGUETTE', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'parisbaguette.com', logoUrl: logo('parisbaguette.com'),
    outlets: [o('3F', 'Near Check-In Counter F, 3F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  starbucks_t2: restaurant({
    name: 'Starbucks', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [
      o('1F', 'Near Gate 7, 1F, Terminal 2', 'airside', '06:00 - 22:00'),
      o('B1', 'Center of Transportation Center, B1, Terminal 2', 'landside', '00:00 - 24:00 (Break Time 23:50 - 00:30)', true),
      o('3F', 'Near Gate 248, 3F, Terminal 2', 'airside', '00:00 - 24:00 (Break Time 23:50 - 00:30)', true),
    ],
  }),
  jamba_juice_t2_land: restaurant({
    name: 'Jamba Juice T2-LAND', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'jambajuice.com', logoUrl: logo('jambajuice.com'),
    outlets: [o('3F', 'General Area, 3F, Terminal 2, near Gate 10', 'landside', '06:00 - 22:00')],
  }),
  robotgimbap: restaurant({
    name: 'ROBOTGIMBAP', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 257, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  coffee_at_works_t2: restaurant({
    name: 'COFFEE@WORKS', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [
      o('1F', 'Near Gate 10, 1F, Terminal 2', 'airside', '06:00 - 22:00'),
      o('3F', 'Near Gate 264, 3F, Terminal 2', 'airside', '06:00 - 22:00'),
    ],
  }),
  samjinamook: restaurant({
    name: 'SAMJINAMOOK', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 266, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  byulmi_bunsik_t2: restaurant({
    name: 'BYULMI BUNSIK', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('B1', 'Center of Public Area, B1, Terminal 2', 'landside', '00:00 - 24:00 (Break Time 23:30 - 00:00)', true)],
  }),
  graz_coffee_lab: restaurant({
    name: 'GRAZ COFFEE LAB', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Check-In Counter A, 3F, Terminal 2', 'landside', '06:00 - 20:00')],
  }),
  bizeun_t2: restaurant({
    name: 'BIZEUN', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Check-In Counter L, 3F, Terminal 2', 'landside', '00:00 - 24:00', true)],
  }),
  coffee_bean_t2: restaurant({
    name: 'Coffee Bean', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'coffeebean.com', logoUrl: logo('coffeebean.com'),
    outlets: [o('3F', 'Near Gate 12, 3F, Terminal 2', 'airside', '05:00 - 22:00')],
  }),
  chocolat_palette: restaurant({
    name: 'Chocolat palette', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 246, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  caffe_pascucci: restaurant({
    name: 'Caffe Pascucci', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'caffepascucci.it', logoUrl: logo('caffepascucci.it'),
    outlets: [o('4F', 'Near Gate 268, 4F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  linas_t2: restaurant({
    name: "LINA'S", cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 266, 3F, Terminal 2', 'airside', '00:00 - 24:00', true)],
  }),
  goraesa: restaurant({
    name: 'GORAESA', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('3F', 'Near Gate 243, 3F, Terminal 2', 'airside', '06:00 - 22:00')],
  }),
  twosome_place_t2: restaurant({
    name: 'A Twosome Place', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    website: 'twosome.co.kr', logoUrl: logo('twosome.co.kr'),
    outlets: [
      o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00'),
      o('4F', 'Near Gate 231, 4F, Terminal 2', 'airside', '06:00 - 22:00'),
    ],
  }),
  haneulmaru_cafe_t2: restaurant({
    name: 'Haneulmaru Cafe', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('', 'Terminal 2, Floor 5, Observatory', 'landside', '07:30 - 19:30')],
  }),
  mauritius_brown: restaurant({
    name: 'MAURITIUS BROWN', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('B1', 'Central, Transportation Center, B1, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  samchungdang: restaurant({
    name: 'SAMCHUNGDANG', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('1F', 'Near Arrival Hall A, 1F, Terminal 2', 'landside', '06:00 - 22:00')],
  }),
  ourdang_and_in_the_box: restaurant({
    name: 'OURDANG and In The Box', cuisine: 'Snack, Cafe & Dessert', amenity: 'cafe',
    outlets: [o('B1', 'Center of Transportation Center, 1BF, Terminal 2', 'landside', '06:00 - 22:00')],
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

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2]));

  const totalCreated = r1.created + r2.created;
  const totalDeleted = r1.deleted + r2.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
