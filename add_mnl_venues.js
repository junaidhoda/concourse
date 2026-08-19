'use strict';
/**
 * Fills in complete data for Ninoy Aquino International Airport (NAIA/MNL,
 * Manila) — restaurants/cafés/bars in Firestore. Researched 2026-08-16 from
 * the official site, newnaia.com.ph/discover/dining, operated by New NAIA
 * Infrastructure Corporation (NNIC), the consortium that took over NAIA
 * operations in 2024 (confirmed official via contemporaneous news coverage
 * of NNIC's public-info-site launch). Extracted via Claude in Chrome
 * browser automation per this project's standing convention (no WebFetch
 * for venue data).
 *
 * METHODOLOGY: the dining page renders a single HTML `<table>` with no
 * pagination — all 111 rows present in the DOM at once, confirmed via
 * `document.querySelectorAll('table tr').length`. Extracted directly via
 * DOM query (`table.querySelectorAll('tr')` -> cells), not fetch/JSON, and
 * cross-checked against the visible "Choose a terminal: All / T1 / T2 / T3"
 * filter UI. Columns: Dining (name), Category, Terminal, Location, Opening
 * Hours. Unlike this project's NRT/KIX scripts, this site has NO per-shop
 * detail pages (confirmed: table rows have no links/onclick handlers) — so,
 * same data-gap situation as this project's KUL script, only name/category/
 * terminal/location/hours are available; no phone, no per-shop description,
 * and no halal/vegetarian flags are published anywhere on this site, so
 * those fields are left blank for every venue in this file rather than
 * guessed.
 *
 * TERMINAL STRUCTURE: NAIA has Terminal 1, 2, and 3, each a genuinely
 * separate terminal passing this dataset's "own check-in AND own security"
 * test — confirmed via betternaia.com/articles/moving-between-naia-terminals:
 * "NAIA's terminals aren't connected by walkways, trains, or airside
 * corridors... Each terminal acts like a separate airport building,"
 * and international-to-international transfers require exiting through
 * arrivals/immigration/customs and restarting the full check-in + security
 * process at the next terminal. Terminal 4 (the old domestic terminal) is
 * OUT OF SCOPE: multiple April 2025 news reports (e.g. Filipino Times,
 * GMA News) confirm it was demolished/"gone for good" for safety reasons
 * with operations relocating elsewhere, and it has no filter option on the
 * official dining page — excluded rather than fabricated. Within T2,
 * "Northwest Wing" and "Southwest Wing" are sub-areas of the SAME building
 * sharing one check-in/security, not separate terminals (same precedent as
 * KIX/KUL's zone handling) — both fold into one `terminal_2` bucket.
 *
 * AIRSIDE/LANDSIDE — INFERRED, not an explicit per-row site field here
 * (unlike NRT/KIX's authoritative before/after-security column). Inferred
 * from the site's own Location text and validated against a secondary
 * source, betternaia.com/dining/terminal-2, which explicitly labels each
 * named area as landside/airside: any location containing "Pre-Departure"
 * (including "Domestic Busgate, Pre-Departure") -> airside (betternaia:
 * "an airside boarding zone past security"); any location whose own text
 * says "Landside" verbatim (T3's "Level 3, Landside" / "Level 4, Landside")
 * -> landside; all Arrival (Lobby/Level/Public/Curbside), Departure Lobby,
 * Departure Public Lobby, Check-In Area, Parking, and Basement locations
 * -> landside (betternaia
 * explicitly labels Arrivals Lobby, the Departures Check-in Area, and the
 * Departures Lobby all "Landside and open to the public", while only the
 * Pre-Departure/domestic-gates zone is airside).
 *
 * MULTI-OUTLET MERGE GROUPS (same brand, same terminal, multiple distinct
 * Location values on the site — combined into one doc with multiple
 * `outlets[]`), found by grouping all 111 raw rows by (name, terminal):
 * Bo's Coffee/T3 (Tambayan Arrival Level + Domestic Food Village
 * Pre-Departure Area + International Pre-Departure, 3 outlets); Chatime/T3
 * (International Pre-Departure + Domestic Busgate Pre-Departure); Cozy
 * Kitchen/T2 (Northwest Wing + Southwest Wing, both Pre-Departure);
 * Seattles Best Coffee/T3 (Level 2 Mezzanine Foodhall + International
 * Pre-Departure); Tsim Sha Tsui/T3 (Arrival Lobby + Domestic
 * Pre-Departure). Same-brand venues in DIFFERENT terminals were kept as
 * separate docs per this project's standing rule: Casa Daza (T1 vs T2),
 * Dunkin Donut (T2 vs T3), Krispy Kreme (T2 vs T3), Henlin (T2 vs T3),
 * Goto King (T2 vs T3), Jollibee (T1 vs T2), Chowking (T1 vs T3), and the
 * "Ka Tunying" family (worded differently per terminal on the site itself —
 * "Ka Tunying" T1, "Ka Tunying's Café" T2, "Ka Tunying's" T3 — kept
 * separate regardless of the exact per-terminal wording, per the
 * different-terminal rule). Combo-brand single listings were kept as one
 * doc with the site's own combined name, unsplit (same precedent as NRT's
 * "TEPPAN YAKI MITSUMOTO TEI / MITSUMOTO COFFEE TEN"): "Illy Café
 * Express/Subway" (T1), "Piazza Café & Bar TNP" (T1), "Racks / Tenya" (T3).
 *
 * NAMES: preserved verbatim as published on the official table, including
 * inconsistent capitalization/punctuation across entries (e.g. "Mcdonalds",
 * "Wendys", "Chilis", "Angels Pizza" all lack apostrophes/proper-case on
 * the site itself) — not silently "corrected", per this project's
 * page-truth-over-guesswork standard.
 *
 * AMENITY: derived from the site's own Category column (Restaurant ->
 * restaurant, Snack Counter -> fast_food, Coffee Shop -> cafe, Bakeshop ->
 * bakery, Bar -> bar, Canteen -> restaurant), with a small set of
 * brand-based overrides applied ONLY for confidently-identified chains
 * whose real-world concept doesn't match the site's generic category label
 * (e.g. Starbucks is tagged "Food & Beverage Restaurant" on the site but is
 * a cafe; Krispy Kreme/Dunkin Donut/Cinnabon/JCO/Paris Baguette/Breadtalk
 * are tagged "Snack Counter"/"Restaurant" but are donut/bakery chains; Bo's
 * Coffee, Highlands Coffee, Seattles Best Coffee, But First Coffee are
 * tagged "Snack Counter"/"Coffee Shop" and are cafes). Every other venue's
 * amenity is taken directly from the site's own category, unmodified.
 *
 * CUISINE: set to a short, confidently-identified descriptor for
 * well-known chains (verified, not guessed); every other venue's cuisine
 * is left as the site's own raw Category text verbatim (e.g. "Snack
 * Counter", "Restaurant") rather than an invented cuisine style — this
 * project's NO FABRICATION rule applied to a data source that, unlike
 * NRT/KIX, provides no cuisine detail beyond a generic category tag.
 *
 * WEBSITE: set only for chains whose official domain was independently
 * verified via web search this session (33 brands — major Philippine
 * chains like Jollibee, Chowking, Pancake House, Conti's, Via Mare, Tapa
 * King, Army Navy, Angel's Pizza, Potato Corner, Banapple, Fruitas, Mary
 * Grace Café, Watami, Serenitea, Highlands Coffee, Seattles Best Coffee,
 * Marugame Udon, JCO Reserve, Breadtalk, Paris Baguette, Llao-Llao, Bo's
 * Coffee's peers, plus global chains Starbucks/McDonald's/Burger King/KFC/
 * Popeyes/Wendy's/Dunkin/Krispy Kreme/Denny's/Shake Shack/Cinnabon/Chili's)
 * — left blank for every local kiosk/small concept this session found no
 * independently verified domain for (e.g. Kenny Rogers Roasters PH was
 * searched but only franchise-association/delivery-portal pages turned up,
 * not a confirmed brand domain, so it was left blank rather than guessed).
 *
 * VERIFIED TOTALS: 105 restaurant docs / 111 outlets across 3 terminals —
 * terminal_1: 14 docs / 14 outlets; terminal_2: 19 docs / 20 outlets;
 * terminal_3: 72 docs / 77 outlets. Matches the 111 raw official-site rows
 * exactly (zero data loss/duplication in the merge logic).
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['mnl', 'manila', 'naia'];
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

// Shorthand: o(level, locationNotes, airside, openingHours, open247)
const o = (level, notes, airside, hours, open247 = false) =>
  outlet({ airside, level, locationNotes: notes, openingHours: hours, open247 });

// ─── Terminal 1 venues ────────

const terminal1Venues = {
  kenny_rogers_roasters: restaurant({
    name: "Kenny Rogers Roasters", cuisine: "Roast Chicken", amenity: "restaurant",
    outlets: [
    o("Level 1", "Level 1, Arrival Curbside C", "landside", "7:00 AM to 1:00 AM"),
    ],
  }),
  chowking_t1: restaurant({
    name: "Chowking", cuisine: "Chinese-Filipino Fast Food", amenity: "restaurant",
    website: "chowking.ph", logoUrl: logo("chowking.ph"),
    outlets: [
    o("Level 1", "Level 1, Arrival Curbside C", "landside", "24 Hours"),
    ],
  }),
  jollibee_t1: restaurant({
    name: "Jollibee", cuisine: "Filipino Fast Food", amenity: "restaurant",
    website: "jollibee.com.ph", logoUrl: logo("jollibee.com.ph"),
    outlets: [
    o("Level 3", "Level 3, East Side Departure Lobby", "landside", "24 Hours"),
    ],
  }),
  ka_tunying: restaurant({
    name: "Ka Tunying", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("Level 3", "Level 3, Pre-Departure Area", "airside", "24 Hours"),
    ],
  }),
  nono_s_comfort_kitchen_bakery: restaurant({
    name: "Nono's Comfort Kitchen & Bakery", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("Level 2", "Level 2, West Side Pre-Departure Area", "airside", "7:00 AM to 10:00 PM"),
    ],
  }),
  little_flour: restaurant({
    name: "Little Flour", cuisine: "Coffee Shop", amenity: "cafe",
    outlets: [
    o("Level 2", "Level 2, West Concourse - Departure Area", "landside", "3:00 AM to 12:00 AM"),
    ],
  }),
  air_cargo_food_kiosk: restaurant({
    name: "Air Cargo Food Kiosk", cuisine: "Canteen", amenity: "restaurant",
    outlets: [
    o("", "Parking B", "landside", "24 Hours"),
    ],
  }),
  anika: restaurant({
    name: "Anika", cuisine: "Canteen", amenity: "restaurant",
    outlets: [
    o("", "Basement Area", "landside", "24 Hours"),
    ],
  }),
  master_siomai: restaurant({
    name: "Master Siomai", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("Level 3", "Level 3, East Side Departure Lobby", "landside", "24 Hours"),
    ],
  }),
  illy_cafe_express_subway: restaurant({
    name: "Illy Café Express/Subway", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("Level 3", "Level 3, Pre-Departure Area", "airside", "24 Hours"),
    ],
  }),
  casa_daza_t1: restaurant({
    name: "Casa Daza", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("Level 3", "Level 3, Pre-Departure Area", "airside", "6:00 AM to 6:00 PM"),
    ],
  }),
  le_amoretto: restaurant({
    name: "Le Amoretto", cuisine: "Food & Beverage Restaurant", amenity: "restaurant",
    outlets: [
    o("Level 2", "Level 2, East Side Pre-Departure Area", "airside", "24 Hours"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Cafe", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
    o("Level 3", "Level 3, Pre-Departure Area", "airside", "24 Hours"),
    ],
  }),
  piazza_cafe_bar_tnp: restaurant({
    name: "Piazza Café & Bar TNP", cuisine: "Café & Bar / Snack Counter", amenity: "fast_food",
    outlets: [
    o("Level 3", "Level 3, Pre-Departure Area", "airside", "24 Hours"),
    ],
  }),};

// ─── Terminal 2 venues (Northwest Wing + Southwest Wing) ────────

const terminal2Venues = {
  ka_tunying_s_cafe: restaurant({
    name: "Ka Tunying's Café", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  henlin_t2: restaurant({
    name: "Henlin", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Northwest Wing, Pre-Departure Near Gate 5", "airside", "4:00 AM to 10:00 PM"),
    ],
  }),
  muhlach_bakery: restaurant({
    name: "Muhlach Bakery", cuisine: "Snack Counter", amenity: "bakery",
    outlets: [
    o("", "Northwest Wing, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  burger_beast: restaurant({
    name: "Burger Beast", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "12:00 AM to 10:00 PM"),
    ],
  }),
  casa_daza_t2: restaurant({
    name: "Casa Daza", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  cafe_france: restaurant({
    name: "Café France", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "2:00 AM to 11:00 PM"),
    ],
  }),
  goto_king_t2: restaurant({
    name: "Goto King", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Northwest Wing, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  cozy_kitchen: restaurant({
    name: "Cozy Kitchen", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Northwest Wing, Pre-Departure", "airside", "24 Hours"),
    o("", "Southwest Wing, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  ella_robot_coffee: restaurant({
    name: "Ella Robot Coffee", cuisine: "Snack Counter", amenity: "cafe",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  jollibee_t2: restaurant({
    name: "Jollibee", cuisine: "Filipino Fast Food", amenity: "restaurant",
    website: "jollibee.com.ph", logoUrl: logo("jollibee.com.ph"),
    outlets: [
    o("", "Southwest Wing, Departure Public Lobby", "landside", "24 Hours"),
    ],
  }),
  siomai_king: restaurant({
    name: "Siomai King", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "1:15 AM to 10:00 PM"),
    ],
  }),
  drip_tea: restaurant({
    name: "Drip Tea", cuisine: "Snack Counter", amenity: "cafe",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "12:00 AM to 10:00 PM"),
    ],
  }),
  mempci_coop: restaurant({
    name: "MEMPCI Coop", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Parking B", "landside", "7:00 AM to 3:00 AM"),
    ],
  }),
  dunkin_donut_t2: restaurant({
    name: "Dunkin Donut", cuisine: "Bakery (Donuts & Coffee)", amenity: "bakery",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
    o("", "Northwest Wing, Arrival Public", "landside", "24 Hours"),
    ],
  }),
  serenitea: restaurant({
    name: "Serenitea", cuisine: "Milk Tea", amenity: "cafe",
    website: "iloveserenitea.com", logoUrl: logo("iloveserenitea.com"),
    outlets: [
    o("", "Northwest Wing, Pre-Departure", "airside", "4:00 AM to 9:00 PM"),
    ],
  }),
  highlands_coffee: restaurant({
    name: "Highlands Coffee", cuisine: "Cafe (Vietnamese Coffee)", amenity: "cafe",
    website: "highlandscoffee.com.vn", logoUrl: logo("highlandscoffee.com.vn"),
    outlets: [
    o("", "Northwest Wing, Check-In Area", "landside", "24 Hours"),
    ],
  }),
  krispy_kreme_t2: restaurant({
    name: "Krispy Kreme", cuisine: "Bakery (Donuts)", amenity: "bakery",
    website: "krispykreme.com", logoUrl: logo("krispykreme.com"),
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "3:00 AM to 9:00 PM"),
    ],
  }),
  denny_s_diner: restaurant({
    name: "Denny's Diner", cuisine: "American Diner", amenity: "restaurant",
    website: "dennys.com", logoUrl: logo("dennys.com"),
    outlets: [
    o("", "Southwest Wing, Arrival Level", "landside", "24 Hours"),
    ],
  }),
  mister_donut: restaurant({
    name: "Mister Donut", cuisine: "Bakery (Donuts)", amenity: "bakery",
    outlets: [
    o("", "Southwest Wing, Pre-Departure", "airside", "12:00 AM to 7:00 PM"),
    ],
  }),};

// ─── Terminal 3 venues (genuinely separate terminal, own check-in and security) ────────

const terminal3Venues = {
  wendys: restaurant({
    name: "Wendys", cuisine: "Fast Food (Burgers)", amenity: "restaurant",
    website: "wendys.com", logoUrl: logo("wendys.com"),
    outlets: [
    o("", "Arrival Lobby", "landside", "24 Hours"),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Fast Food (Burgers)", amenity: "restaurant",
    website: "burgerking.com", logoUrl: logo("burgerking.com"),
    outlets: [
    o("", "Arrival Lobby", "landside", "24 Hours"),
    ],
  }),
  but_first_coffee: restaurant({
    name: "But First Coffee", cuisine: "Coffee Shop", amenity: "cafe",
    outlets: [
    o("", "Arrival Lobby", "landside", ""),
    ],
  }),
  tsim_sha_tsui: restaurant({
    name: "Tsim Sha Tsui", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Arrival Lobby", "landside", "24 Hours"),
    o("", "Domestic Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  purefoods_street_sarap: restaurant({
    name: "Purefoods Street Sarap", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", "2:00 AM to 10:00 PM"),
    ],
  }),
  fruitas: restaurant({
    name: "Fruitas", cuisine: "Fruit Shakes & Juices", amenity: "cafe",
    website: "fruitasholdings.com", logoUrl: logo("fruitasholdings.com"),
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  pan_de_coco_diner: restaurant({
    name: "Pan De Coco Diner", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  bo_s_coffee: restaurant({
    name: "Bo's Coffee", cuisine: "Cafe", amenity: "cafe",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    o("", "Domestic Food Village, Pre-Departure Area", "airside", ""),
    o("", "International Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  treats_bakery: restaurant({
    name: "Treats - Bakery", cuisine: "Snack Counter", amenity: "bakery",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", "24 Hours"),
    ],
  }),
  reynaldo_s_pasalubong: restaurant({
    name: "Reynaldo's Pasalubong", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  via_mare: restaurant({
    name: "Via Mare", cuisine: "Filipino Cuisine", amenity: "fast_food",
    website: "viamare.com.ph", logoUrl: logo("viamare.com.ph"),
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  abub_s_lechon_cebu: restaurant({
    name: "Abub's Lechon - Cebu", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  batanguena_lutong_ala_eh: restaurant({
    name: "Batanguena Lutong Ala Eh!", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  cosina_ilocos: restaurant({
    name: "Cosina Ilocos", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", "9:00 AM to 9:00 PM"),
    ],
  }),
  bale_pampangueno: restaurant({
    name: "Bale Pampangueno", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", "24 Hours"),
    ],
  }),
  bicolano_by_xo46: restaurant({
    name: "Bicolano By XO46", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  palm_grill: restaurant({
    name: "Palm Grill", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  ginebra_san_miguel_spirits: restaurant({
    name: "Ginebra San Miguel Spirits", cuisine: "Bar", amenity: "bar",
    outlets: [
    o("", "Tambayan, Arrival Level", "landside", ""),
    ],
  }),
  marugame_udon: restaurant({
    name: "Marugame Udon", cuisine: "Japanese (Udon)", amenity: "restaurant",
    website: "marugame.ph", logoUrl: logo("marugame.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  jco_reserve: restaurant({
    name: "JCO Reserve", cuisine: "Bakery (Donuts & Coffee)", amenity: "bakery",
    website: "jcodonuts.com", logoUrl: logo("jcodonuts.com"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  mary_grace_cafe: restaurant({
    name: "Mary Grace Café", cuisine: "Cafe & Bakery", amenity: "restaurant",
    website: "marygracecafe.com", logoUrl: logo("marygracecafe.com"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  mama_lou_s: restaurant({
    name: "Mama Lou's", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", "6:00 AM to 10:00 PM"),
    ],
  }),
  kenny_rogers: restaurant({
    name: "Kenny Rogers", cuisine: "Roast Chicken", amenity: "restaurant",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", "24 Hours"),
    ],
  }),
  paris_baguette: restaurant({
    name: "Paris Baguette", cuisine: "Bakery & Cafe", amenity: "bakery",
    website: "parisbaguette.com.ph", logoUrl: logo("parisbaguette.com.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  chilis: restaurant({
    name: "Chilis", cuisine: "American / Tex-Mex", amenity: "restaurant",
    website: "chilis.com", logoUrl: logo("chilis.com"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  nanyang: restaurant({
    name: "Nanyang", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  popeyes: restaurant({
    name: "Popeyes", cuisine: "Fast Food (Fried Chicken)", amenity: "restaurant",
    website: "popeyes.com", logoUrl: logo("popeyes.com"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  ucc_mentore: restaurant({
    name: "UCC Mentore", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", "7:00 AM to 12:00 PM"),
    ],
  }),
  kfc: restaurant({
    name: "KFC", cuisine: "Fast Food (Fried Chicken)", amenity: "restaurant",
    website: "kfc.com", logoUrl: logo("kfc.com"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  seattles_best_coffee: restaurant({
    name: "Seattles Best Coffee", cuisine: "Cafe", amenity: "cafe",
    website: "seattlesbest.com.ph", logoUrl: logo("seattlesbest.com.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    o("", "International Pre-Departure", "airside", ""),
    ],
  }),
  banapple: restaurant({
    name: "Banapple", cuisine: "Desserts (Pies & Cheesecakes)", amenity: "cafe",
    website: "banapple.ph", logoUrl: logo("banapple.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  chowking_t3: restaurant({
    name: "Chowking", cuisine: "Chinese-Filipino Fast Food", amenity: "restaurant",
    website: "chowking.ph", logoUrl: logo("chowking.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", "24 Hours"),
    ],
  }),
  l_a_chicks: restaurant({
    name: "L.A Chicks", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", "24 Hours"),
    ],
  }),
  breadtalk: restaurant({
    name: "Breadtalk", cuisine: "Bakery", amenity: "bakery",
    website: "breadtalk.com.ph", logoUrl: logo("breadtalk.com.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  watami: restaurant({
    name: "Watami", cuisine: "Japanese", amenity: "restaurant",
    website: "watami.com.ph", logoUrl: logo("watami.com.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  angels_pizza: restaurant({
    name: "Angels Pizza", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  pancake_house: restaurant({
    name: "Pancake House", cuisine: "Filipino / American Breakfast", amenity: "restaurant",
    website: "pancakehouse.com.ph", logoUrl: logo("pancakehouse.com.ph"),
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  estrels: restaurant({
    name: "Estrels", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  sans_rival: restaurant({
    name: "Sans Rival", cuisine: "Snack Counter", amenity: "bakery",
    outlets: [
    o("Level 2", "Level 2, Mezzanine Foodhall", "landside", ""),
    ],
  }),
  conti_s: restaurant({
    name: "Conti's", cuisine: "Bakery & Restaurant", amenity: "restaurant",
    website: "contis.ph", logoUrl: logo("contis.ph"),
    outlets: [
    o("Level 3", "Level 3, Landside", "landside", ""),
    ],
  }),
  mcdonalds: restaurant({
    name: "Mcdonalds", cuisine: "Fast Food", amenity: "restaurant",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    outlets: [
    o("Level 4", "Level 4, Landside", "landside", ""),
    ],
  }),
  racks_tenya: restaurant({
    name: "Racks / Tenya", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("Level 4", "Level 4, Landside", "landside", ""),
    ],
  }),
  divalicious_by_the_lechon_diva: restaurant({
    name: "Divalicious By The Lechon Diva", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", "2:00 AM to 8:00 PM"),
    ],
  }),
  pho_hoa: restaurant({
    name: "Pho Hoa", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", ""),
    ],
  }),
  ka_tunying_s: restaurant({
    name: "Ka Tunying's", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", ""),
    ],
  }),
  cinnabon: restaurant({
    name: "Cinnabon", cuisine: "Bakery (Cinnamon Rolls)", amenity: "bakery",
    website: "cinnabon.com", logoUrl: logo("cinnabon.com"),
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", ""),
    ],
  }),
  bebang: restaurant({
    name: "Bebang", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", ""),
    ],
  }),
  llao_llao: restaurant({
    name: "Llao-Llao", cuisine: "Frozen Yogurt", amenity: "cafe",
    website: "llaollaoweb.com", logoUrl: logo("llaollaoweb.com"),
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", "5:00 AM to 8:00 PM"),
    ],
  }),
  muhlach_ensaymada: restaurant({
    name: "Muhlach Ensaymada", cuisine: "Snack Counter", amenity: "bakery",
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", "24 Hours"),
    ],
  }),
  potato_corner: restaurant({
    name: "Potato Corner", cuisine: "Fast Food (Flavored Fries)", amenity: "fast_food",
    website: "potatocorner.com", logoUrl: logo("potatocorner.com"),
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", ""),
    ],
  }),
  dunkin_donut_t3: restaurant({
    name: "Dunkin Donut", cuisine: "Bakery (Donuts & Coffee)", amenity: "bakery",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", "24 Hours"),
    ],
  }),
  aristocrat: restaurant({
    name: "Aristocrat", cuisine: "Filipino Cuisine", amenity: "fast_food",
    website: "thearistocratrestaurant.com", logoUrl: logo("thearistocratrestaurant.com"),
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", "5:00 AM to 8:00 PM"),
    ],
  }),
  mamak: restaurant({
    name: "Mamak", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", ""),
    ],
  }),
  tapa_king: restaurant({
    name: "Tapa King", cuisine: "Filipino (Tapa & Breakfast)", amenity: "restaurant",
    website: "tapaking.com.ph", logoUrl: logo("tapaking.com.ph"),
    outlets: [
    o("", "Domestic Food Village, Pre-Departure Area", "airside", "1:00 AM to 12:00 PM"),
    ],
  }),
  blue_smith: restaurant({
    name: "Blue Smith", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "International Pre-Departure", "airside", "1:00 AM to 11:30 PM"),
    ],
  }),
  great_mann_hann: restaurant({
    name: "Great Mann Hann", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "International Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  chatime: restaurant({
    name: "Chatime", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "International Pre-Departure", "airside", "24 Hours"),
    o("", "Domestic Busgate, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "Fast Food (Burgers)", amenity: "restaurant",
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"),
    outlets: [
    o("", "International Pre-Departure", "airside", "12:30 AM to 11:30 PM"),
    ],
  }),
  kaishu_rice_noodles_express: restaurant({
    name: "Kaishu Rice & Noodles Express", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "International Pre-Departure", "airside", "2:00 AM to 12:00 PM"),
    ],
  }),
  sweet_ideas: restaurant({
    name: "Sweet Ideas", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "International Pre-Departure", "airside", ""),
    ],
  }),
  cafe_tee_ree_ya: restaurant({
    name: "Café Tee Ree Ya", cuisine: "Snack Counter", amenity: "cafe",
    outlets: [
    o("", "International Pre-Departure", "airside", ""),
    ],
  }),
  cafe_park_stop: restaurant({
    name: "Café Park & Stop", cuisine: "Snack Counter", amenity: "cafe",
    outlets: [
    o("", "Parking Area", "landside", "24 Hours"),
    ],
  }),
  acacia_tree_cafe: restaurant({
    name: "Acacia Tree Café", cuisine: "Snack Counter", amenity: "cafe",
    outlets: [
    o("", "Parking Area", "landside", "24 Hours"),
    ],
  }),
  henlin_t3: restaurant({
    name: "Henlin", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Pre-Departure", "airside", "1:00 AM to 10:00 PM"),
    ],
  }),
  kape_manila: restaurant({
    name: "Kape Manila", cuisine: "Snack Counter", amenity: "cafe",
    outlets: [
    o("", "Domestic Pre-Departure", "airside", "4:00 AM to 8:00 PM"),
    ],
  }),
  busgate_goodies: restaurant({
    name: "Busgate Goodies", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Busgate, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  goto_king_t3: restaurant({
    name: "Goto King", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Busgate, Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  global_topps_noodles: restaurant({
    name: "Global Topps & Noodles", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "International Pre-Departure", "airside", "24 Hours"),
    ],
  }),
  army_navy: restaurant({
    name: "Army Navy", cuisine: "Fast Food (Burgers & Burritos)", amenity: "restaurant",
    website: "armynavy.com.ph", logoUrl: logo("armynavy.com.ph"),
    outlets: [
    o("", "Domestic Busgate, Pre-Departure", "airside", "12:00 AM to 10:00 PM"),
    ],
  }),
  airport_cafe: restaurant({
    name: "Airport Café", cuisine: "Restaurant", amenity: "restaurant",
    outlets: [
    o("", "Domestic Pre-Departure", "airside", "2:00 AM to 7:00 PM"),
    ],
  }),
  caffexpress: restaurant({
    name: "Caffexpress", cuisine: "Snack Counter", amenity: "fast_food",
    outlets: [
    o("", "Domestic Busgate, Pre-Departure", "airside", "7:00 AM to 1:00 AM"),
    ],
  }),
  krispy_kreme_t3: restaurant({
    name: "Krispy Kreme", cuisine: "Bakery (Donuts)", amenity: "bakery",
    website: "krispykreme.com", logoUrl: logo("krispykreme.com"),
    outlets: [
    o("", "Domestic Pre-Departure", "airside", "24 Hours"),
    ],
  }),};

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
  console.error('Fatal error:', err);
  process.exit(1);
});
