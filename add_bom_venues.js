'use strict';
/**
 * Fills in complete data for Chhatrapati Shivaji Maharaj International
 * Airport (BOM), Mumbai, India, restaurants/bars/cafés in Firestore, based
 * on research conducted on 2026-08-15.
 *
 * TERMINAL STRUCTURE: BOM operates TWO genuinely separate terminals, each
 * meeting this dataset's "own check-in AND own security" bar:
 *   - Terminal 1 (Santacruz) — domestic-only, used by low-cost carriers
 *     (Akasa Air, Alliance Air, IndiGo (some flights), SpiceJet, Star Air).
 *   - Terminal 2 (Sahar) — the newer X-shaped terminal handling both
 *     international and domestic operations, with its own 192 check-in
 *     counters and 60 immigration counters.
 * The two are physically separated on the landside, roughly a 15-20 minute
 * drive apart, with fully independent check-in and security. This is
 * modelled as TWO terminal buckets (terminal_1, terminal_2), matching the
 * DXB-style multi-terminal precedent rather than DOH/AUH's single-terminal
 * treatment.
 *
 * SOURCES & METHODOLOGY: built entirely from the official airport site,
 * csmia-mumbai.adaniairports.com (operated by Adani Airport Holdings, which
 * runs CSMIA) — NOT mumbaiairport.in, which despite ranking highly in search
 * results is an unofficial third-party guide site and was not used. The
 * site's Shop & Dine > Dining page
 * (csmia-mumbai.adaniairports.com/en/shop-and-dine/dining) is a "Load more"-
 * paginated directory; Claude in Chrome repeatedly clicked "Load more"
 * until the card count stopped growing (stable at 84 cards across many
 * additional clicks/waits), confirming completeness. Each of the 84 cards
 * was then expanded in place (a click-to-expand accordion, not a separate
 * detail page) to reveal its category tag(s) (QSR / Quick Bites / Bar &
 * Restaurant / Coffee Shop / Snacks), which terminal(s) it operates in, and
 * — critically — a distinct location string PER OUTLET where a brand has
 * multiple counters within the same terminal (e.g. Costa Coffee alone has 7
 * separate outlets within Terminal 2). No secondary/third-party sources
 * were used to source any name, terminal, category, or location data.
 *
 * The 84 distinct brand names resolve to 95 terminal-scoped venue docs (11
 * brands operate in BOTH terminals — e.g. Starbucks, McDonald's, KFC,
 * Subway — and per this dataset's standing convention for the SAME brand
 * appearing in DIFFERENT terminals, each gets its own separate doc rather
 * than being merged), totalling 149 individual outlet locations once each
 * multi-counter brand's per-outlet locations are captured as multiple
 * `outlets[]` entries on its terminal's doc.
 *
 * DATA-QUALITY NOTES:
 *   - Like CMB and PKX, this site's dining directory publishes NO free-text
 *     description per venue — only a name, category tag(s), terminal, and a
 *     location string per outlet. `description` below is therefore left
 *     blank for most venues rather than fabricated; `website`/`logo_url`
 *     are filled in only for brands independently confirmed as global or
 *     major pan-India chains with an unambiguous domain (Burger King, KFC,
 *     McDonald's, Subway, Domino's, Pizza Hut, Starbucks, Costa Coffee,
 *     Baskin Robbins, Café Coffee Day, The Coffee Bean & Tea Leaf).
 *   - TWO venues had an internal data inconsistency on the site between
 *     their terse terminal tag and their expanded detail panel's actual
 *     tab/location: "Jumbo King" is tagged "T1" at the card level, but its
 *     expanded panel only has a "Terminal 2" tab, with location text ("P6,
 *     Arrival Forecourt" / "Level 3, Post Security Hold Area") that matches
 *     Terminal 2's location-naming convention throughout the rest of the
 *     site (never seen on a genuine Terminal 1 listing). "Chaipoint" is the
 *     inverse: tagged "T2" at the card level, but its expanded panel shows
 *     a "Terminal 1" tab, again with "P6, Arrival Forecourt" — Terminal
 *     2-style location text. Both are placed under Terminal 2 here, trusting
 *     the location-text naming convention (which is internally consistent
 *     everywhere else) over whichever single tag/tab field was wrong in
 *     each case — the same page-truth-over-label principle used to fix
 *     DXB's Qinwan Café in an earlier revision of that script.
 *   - Terminal 1's location vocabulary is gate-cluster-based ("1B, Gate No
 *     09-20, Post Security Hold Area", "1C, Gate No 21-28, Post Security
 *     Hold Area", "1C, Food Court, Post Security Hold Area", bare "Arrival
 *     Forecourt", bare "Check-in Area", bare "Landside") — captured in
 *     `level` as the gate-cluster/zone name, full text in `location_notes`.
 *   - Terminal 2's location vocabulary is floor-based ("Level 3"/"Level 4",
 *     "Post Security Hold Area", sometimes with a specific gate number
 *     appended, e.g. "- Gate 68", plus "P6, Arrival Forecourt", "P10, Level
 *     4, Landside/Check in Area") — `level` captures the floor, full text
 *     in `location_notes`.
 *   - "Post Security Hold Area" / "Gate No X-Y" locations are modelled as
 *     `airside`; "Landside", "Arrival Forecourt", "Arrival Hall", and
 *     "Check-in Area" are modelled as `landside`.
 *   - No opening hours, phone numbers, or per-venue descriptions are
 *     published on any card, so `opening_hours`/`phone` are blank
 *     throughout (no 24-hour claim is asserted since the site doesn't
 *     state one, unlike DXB/DOH/AUH/PKX where "24 hours" was explicit).
 *
 * BOM does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'bom' first, then 'mumbai', using whichever has existing
 * terminal data). It never creates a new `airports/{id}` metadata doc
 * itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For
 * each terminal grouping below, it first deletes EVERY existing restaurant
 * doc in that terminal's `restaurants` subcollection — unconditionally,
 * regardless of whether its name matches anything in this file — and only
 * then creates every venue defined here as a brand-new doc. There is no
 * update-in-place step and no name-matching against what's already there;
 * nothing from a previous run survives. Run this only when the venue list
 * below is meant to be the complete, authoritative set for both terminal
 * buckets.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under
 * this airport whose id isn't one of THIS script's terminal ids (terminal_1,
 * terminal_2) gets its restaurants subcollection and then the terminal doc
 * itself deleted, so a stale/orphaned terminal bucket doesn't keep
 * inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_bom_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['bom', 'mumbai'];
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

// Shorthand builders for BOM's two location vocabularies.
const t1 = (level, notes, airside = 'airside') => outlet({ airside, level, locationNotes: notes });
const t2 = (level, notes, airside = 'airside') => outlet({ airside, level, locationNotes: notes });

// ─── Terminal 1 (Santacruz, Domestic) venues ─────────────────────────────

const terminal1Venues = {
  amcha_katta: restaurant({
    name: 'Amcha Katta', cuisine: 'Snacks', amenity: 'fast_food',
    outlets: [t1('Check-in Area', 'Check-in Area', 'landside')],
  }),
  bira_91_taproom: restaurant({
    name: 'Bira 91 Taproom', cuisine: 'Bar & Restaurant, Craft Beer', amenity: 'restaurant',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  black_dog_bar: restaurant({
    name: 'Black Dog Bar', cuisine: 'Bar & Restaurant', amenity: 'restaurant',
    outlets: [t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area')],
  }),
  blackberry: restaurant({
    name: 'Blackberry', cuisine: 'Bar & Restaurant', amenity: 'restaurant',
    outlets: [t1('Landside', 'Landside', 'landside')],
  }),
  burger_taco_co: restaurant({
    name: 'Burger Taco Co', cuisine: 'Snacks, Burgers, Tacos', amenity: 'fast_food',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  cafeccino: restaurant({
    name: 'Cafeccino', cuisine: 'QSR, Bar & Restaurant, Café', amenity: 'cafe',
    outlets: [
      t1('Check-in Area', 'Check-in Area', 'landside'),
      t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area'),
      t1('Food Court (1C)', '1C, Food Court, Post Security Hold Area'),
    ],
  }),
  ccd: restaurant({
    name: 'Café Coffee Day', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'https://www.cafecoffeeday.com', logoUrl: logo('cafecoffeeday.com'),
    outlets: [t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area')],
  }),
  coffee_and_more: restaurant({
    name: 'Coffee & More', cuisine: 'QSR, Coffee', amenity: 'cafe',
    outlets: [t1('Arrival Hall', 'Arrival Hall', 'landside')],
  }),
  coffee_bean_tea_leaf: restaurant({
    name: 'The Coffee Bean & Tea Leaf', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'https://www.coffeebean.com', logoUrl: logo('coffeebean.com'),
    outlets: [t1('Gate 21-28 (1C)', '1C, Gate No 21-28, Post Security Hold Area')],
  }),
  curry_kitchen: restaurant({
    name: 'Curry Kitchen', cuisine: 'QSR, Indian', amenity: 'fast_food',
    outlets: [t1('Food Court (1C)', '1C, Food Court, Post Security Hold Area')],
  }),
  dominos: restaurant({
    name: "Domino's", cuisine: 'Pizza, Fast Food', amenity: 'fast_food',
    website: 'https://www.dominos.com', logoUrl: logo('dominos.com'),
    outlets: [t1('Food Court (1C)', '1C, Food Court, Post Security Hold Area')],
  }),
  donna_italia: restaurant({
    name: 'Donna Italia', cuisine: 'QSR, Italian', amenity: 'fast_food',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  haldirams: restaurant({
    name: "Haldiram's", cuisine: 'QSR, Indian, Snacks', amenity: 'fast_food',
    outlets: [
      t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area'),
      t1('Arrival Forecourt', 'Arrival Forecourt', 'landside'),
    ],
  }),
  idli_com: restaurant({
    name: 'Idli.com', cuisine: 'Snacks, South Indian', amenity: 'fast_food',
    outlets: [t1('Check-in Area', 'Check-in Area', 'landside')],
  }),
  mad_over_donuts: restaurant({
    name: 'Mad Over Donuts', cuisine: 'Quick Bites, Donuts', amenity: 'fast_food',
    outlets: [t1('Check-in Area', 'Check-in Area', 'landside')],
  }),
  madras_coffee_house: restaurant({
    name: 'Madras Coffee House', cuisine: 'Coffee Shop, South Indian', amenity: 'cafe',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  mumbai_se: restaurant({
    name: 'Mumbai Se', cuisine: 'QSR, Snacks', amenity: 'fast_food',
    outlets: [
      t1('Arrival Forecourt', 'Arrival Forecourt', 'landside'),
      t1('Check-in Area', 'Check-in Area', 'landside'),
    ],
  }),
  mumbai_snacks: restaurant({
    name: 'Mumbai Snacks', cuisine: 'Snacks', amenity: 'fast_food',
    outlets: [t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area')],
  }),
  naturals: restaurant({
    name: 'Naturals', cuisine: 'QSR, Ice Cream', amenity: 'fast_food',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  nourish: restaurant({
    name: 'Nourish', cuisine: 'QSR, Healthy', amenity: 'fast_food',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  pasta_station: restaurant({
    name: 'Pasta Station', cuisine: 'QSR, Italian, Pasta', amenity: 'fast_food',
    outlets: [t1('Food Court (1C)', '1C, Food Court, Post Security Hold Area')],
  }),
  raju_omlet: restaurant({
    name: 'Raju Omlet', cuisine: 'QSR, Egg Dishes', amenity: 'fast_food',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  salad_bar: restaurant({
    name: 'Salad Bar', cuisine: 'Quick Bites, Salads', amenity: 'fast_food',
    outlets: [t1('Gate 21-28 (1C)', '1C, Gate No 21-28, Post Security Hold Area')],
  }),
  shawarma_shack: restaurant({
    name: 'Shawarma Shack', cuisine: 'Snacks, Middle Eastern, Shawarma', amenity: 'fast_food',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  ultra_bar: restaurant({
    name: 'Ultra Bar', cuisine: 'Bar & Restaurant', amenity: 'restaurant',
    outlets: [t1('Gate 21-28 (1C)', '1C, Gate No 21-28, Post Security Hold Area')],
  }),
  // ── brands with outlets in BOTH terminals (Terminal 1 side) ──
  balaji_andhra_bhojanalaya: restaurant({
    name: 'Balaji Andhra Bhojanalaya', cuisine: 'QSR, Andhra, South Indian', amenity: 'fast_food',
    outlets: [t1('Landside', 'Landside', 'landside')],
  }),
  cafe_2_0: restaurant({
    name: 'Cafe 2.0', cuisine: 'QSR, Quick Bites, Snacks, Café', amenity: 'cafe',
    outlets: [
      t1('Gate 21-28 (1C)', '1C, Gate No 21-28, Post Security Hold Area'),
      t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area'),
    ],
  }),
  cafelicious: restaurant({
    name: 'Cafelicious', cuisine: 'QSR, Quick Bites, Café', amenity: 'cafe',
    outlets: [t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area')],
  }),
  craverie: restaurant({
    name: 'Craverie', cuisine: 'Snacks', amenity: 'fast_food',
    outlets: [
      t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area'),
      t1('Gate 21-28 (1C)', '1C, Gate No 21-28, Post Security Hold Area'),
    ],
  }),
  joshh: restaurant({
    name: 'Joshh', cuisine: 'QSR', amenity: 'fast_food',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  kfc: restaurant({
    name: 'KFC', cuisine: 'Fried Chicken, Fast Food', amenity: 'fast_food',
    website: 'https://www.kfc.com', logoUrl: logo('kfc.com'),
    outlets: [t1('Food Court (1C)', '1C, Food Court, Post Security Hold Area')],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: 'Burgers, Fast Food', amenity: 'fast_food',
    website: 'https://www.mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [t1('Gate 09-20 (1B)', '1B, Gate No 09-20, Post Security Hold Area')],
  }),
  society_tea: restaurant({
    name: 'Society Tea', cuisine: 'Quick Bites, Coffee Shop, Tea', amenity: 'cafe',
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  starbucks: restaurant({
    name: 'Starbucks', cuisine: 'Café, Coffee', amenity: 'cafe',
    website: 'https://www.starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  subway: restaurant({
    name: 'Subway', cuisine: 'Sandwiches, Fast Food', amenity: 'fast_food',
    website: 'https://www.subway.com', logoUrl: logo('subway.com'),
    outlets: [t1('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  tibbs_frankie: restaurant({
    name: 'Tibbs Frankie', cuisine: 'QSR, Indian, Wraps', amenity: 'fast_food',
    outlets: [t1('Landside', 'Landside', 'landside')],
  }),
};

// ─── Terminal 2 (Sahar, International + Domestic) venues ────────────────

const terminal2Venues = {
  aj_1881: restaurant({
    name: 'AJ 1881', cuisine: 'QSR', amenity: 'fast_food',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area')],
  }),
  all_good_deli: restaurant({
    name: 'All Good Deli', cuisine: 'QSR, Deli', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area')],
  }),
  amreli: restaurant({
    name: 'Amreli', cuisine: 'QSR', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt')],
  }),
  amul_ice_cream_lounge: restaurant({
    name: 'Amul Ice Cream Lounge', cuisine: 'QSR, Ice Cream', amenity: 'fast_food',
    website: 'https://www.amul.com', logoUrl: logo('amul.com'),
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt')],
  }),
  asia_7: restaurant({
    name: 'Asia 7', cuisine: 'QSR, Pan-Asian', amenity: 'fast_food',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt')],
  }),
  baker_street: restaurant({
    name: 'Baker Street', cuisine: 'QSR, Quick Bites, Bar & Restaurant, Snacks, Bakery', amenity: 'bakery',
    outlets: [
      t2('Level 4', 'P10, Level 4, Landside', 'landside'),
      t2('Level 4', 'P10, Level 4, Check in Area', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area'),
      t2('Level 4', 'Level 4, Post Security Hold Area'),
    ],
  }),
  balaji: restaurant({
    name: 'Balaji', cuisine: 'QSR, Quick Bites, Bar & Restaurant', amenity: 'fast_food',
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area - Gate 68'),
      t2('Level 4', 'P10, Level 4, Landside', 'landside'),
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
      t2('Level 4', 'Level 4, Post Security Hold Area - Gate 65'),
    ],
  }),
  bar_fly: restaurant({
    name: 'Bar Fly', cuisine: 'Quick Bites, Bar', amenity: 'restaurant',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area - Gate 40')],
  }),
  baskin_robbins: restaurant({
    name: 'Baskin Robbins', cuisine: 'QSR, Ice Cream', amenity: 'fast_food',
    website: 'https://www.baskinrobbins.com', logoUrl: logo('baskinrobbins.com'),
    outlets: [
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
    ],
  }),
  boarding_bite: restaurant({
    name: 'Boarding Bite', cuisine: 'Quick Bites', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area - Gate 52')],
  }),
  budweiser_bar: restaurant({
    name: 'Budweiser Bar', cuisine: 'Bar & Restaurant, Beer', amenity: 'restaurant',
    outlets: [t2('Arrival Hall', 'Arrival Hall', 'landside')],
  }),
  burger_king: restaurant({
    name: 'Burger King', cuisine: 'Burgers, Fast Food', amenity: 'fast_food',
    website: 'https://www.burgerking.com', logoUrl: logo('burgerking.com'),
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area'),
      t2('Level 4', 'Level 4, Post Security Hold Area'),
      t2('Level 4', 'P10, Level 4, Landside', 'landside'),
    ],
  }),
  cafe_ritazza: restaurant({
    name: 'Café Ritazza', cuisine: 'Bar & Restaurant, Café', amenity: 'cafe',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area')],
  }),
  chaipoint: restaurant({
    name: 'Chaipoint', cuisine: 'QSR, Tea', amenity: 'fast_food',
    description: "Site data quirk: this card's expanded panel shows a 'Terminal 1' tab, but its location text ('P6, Arrival Forecourt') matches Terminal 2's naming convention throughout the rest of the site — placed here per that convention (see header note).",
    outlets: [t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside')],
  }),
  chef_cafe: restaurant({
    name: 'Chef Café', cuisine: 'Bar & Restaurant, Café', amenity: 'cafe',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area')],
  }),
  clink_bar: restaurant({
    name: 'Clink Bar', cuisine: 'Bar & Restaurant', amenity: 'restaurant',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt')],
  }),
  costa_coffee: restaurant({
    name: 'Costa Coffee', cuisine: 'Coffee Shop', amenity: 'cafe',
    website: 'https://www.costacoffee.com', logoUrl: logo('costacoffee.com'),
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area'),
      t2('Level 3', 'Level 3, Post Security Hold Area'),
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
      t2('Level 4', 'P10, Level 4, Landside', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 86'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 52'),
    ],
  }),
  dosa_plaza: restaurant({
    name: 'Dosa Plaza', cuisine: 'QSR, South Indian', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area')],
  }),
  falafel_express: restaurant({
    name: 'Falafel Express', cuisine: 'QSR, Middle Eastern', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt')],
  }),
  flurys: restaurant({
    name: 'Flurys', cuisine: 'QSR, Quick Bites, Bakery, Café', amenity: 'bakery',
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 41'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 46'),
    ],
  }),
  foodys: restaurant({
    name: "Foody's", cuisine: 'QSR, Quick Bites, Snacks', amenity: 'fast_food',
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 41'),
      t2('Level 3', 'Level 3, Post Security Hold Area'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 44'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 45'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 46'),
      t2('Level 4', 'Level 4, Post Security Hold Area'),
      t2('Level 4', 'P10, Level 4, Landside', 'landside'),
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
    ],
  }),
  fresco: restaurant({
    name: 'Fresco', cuisine: 'QSR', amenity: 'fast_food',
    outlets: [t2('Level 4', 'P10, Level 4, Check in Area', 'landside')],
  }),
  good_flippin_burgers: restaurant({
    name: "Good Flippin' Burgers", cuisine: 'QSR, Burgers', amenity: 'fast_food',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt')],
  }),
  heineken_bar: restaurant({
    name: 'Heineken Bar', cuisine: 'Bar & Restaurant, Beer', amenity: 'restaurant',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area')],
  }),
  hoegaarden_bar: restaurant({
    name: 'Hoegaarden Bar', cuisine: 'Bar & Restaurant, Beer', amenity: 'restaurant',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt')],
  }),
  irish_house: restaurant({
    name: 'Irish House', cuisine: 'Bar & Restaurant', amenity: 'restaurant',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area')],
  }),
  jumbo_king: restaurant({
    name: 'Jumbo King', cuisine: 'QSR, Vada Pav', amenity: 'fast_food',
    description: "Site data quirk: this venue's card is tagged 'T1', but its expanded panel only has a 'Terminal 2' tab, with location text ('P6, Arrival Forecourt' / 'Level 3, Post Security Hold Area') matching Terminal 2's naming convention — placed here per that convention (see header note).",
    outlets: [
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area'),
    ],
  }),
  kailash_parbat: restaurant({
    name: 'Kailash Parbat', cuisine: 'QSR, Indian, Sindhi', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt')],
  }),
  manis_cafe: restaurant({
    name: "Mani's Café", cuisine: 'Quick Bites, Café', amenity: 'cafe',
    outlets: [t2('Level 4', 'P4, Landside', 'landside')],
  }),
  masala_twist: restaurant({
    name: 'Masala Twist', cuisine: 'QSR, Indian', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area')],
  }),
  messo: restaurant({
    name: 'Messo', cuisine: 'Bar & Restaurant', amenity: 'restaurant',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area')],
  }),
  mint_mirchi: restaurant({
    name: 'Mint & Mirchi', cuisine: 'Quick Bites, Indian', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area - Gate 42')],
  }),
  mitti_cafe: restaurant({
    name: 'Mitti Café', cuisine: 'Coffee Shop, Café', amenity: 'cafe',
    outlets: [t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside')],
  }),
  moti_mahal: restaurant({
    name: 'Moti Mahal', cuisine: 'QSR, Indian, Mughlai', amenity: 'fast_food',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt')],
  }),
  naashto: restaurant({
    name: 'Naashto', cuisine: 'QSR, Snacks', amenity: 'fast_food',
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
      t2('Arrival Hall', 'Arrival Hall', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area'),
    ],
  }),
  new_york_burrito_company: restaurant({
    name: 'New York Burrito Company', cuisine: 'QSR, Snacks, Mexican', amenity: 'fast_food',
    outlets: [
      t2('Level 4', 'P10, Level 4, Check in Area', 'landside'),
      t2('Level 4', 'Level 4, Post Security Hold Area'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 42'),
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
    ],
  }),
  ottoman_eats: restaurant({
    name: 'Ottoman Eats', cuisine: 'QSR, Turkish', amenity: 'fast_food',
    outlets: [t2('Level 4', 'P10, Level 4, Landside', 'landside')],
  }),
  pizza_hut: restaurant({
    name: 'Pizza Hut', cuisine: 'Pizza, Fast Food', amenity: 'fast_food',
    website: 'https://www.pizzahut.com', logoUrl: logo('pizzahut.com'),
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
    ],
  }),
  shiv_sagar: restaurant({
    name: 'Shiv Sagar', cuisine: 'QSR, Indian', amenity: 'fast_food',
    outlets: [t2('Arrival Forecourt', 'Arrival Forecourt', 'landside')],
  }),
  squeeze_juice: restaurant({
    name: 'Squeeze Juice', cuisine: 'Quick Bites, Juices', amenity: 'fast_food',
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
    ],
  }),
  street_foods_by_punjab_grill: restaurant({
    name: 'Street Foods by Punjab Grill', cuisine: 'QSR, Bar & Restaurant, Quick Bites, Indian', amenity: 'restaurant',
    outlets: [
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area'),
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
      t2('Level 4', 'P10, Level 4, Check in Area', 'landside'),
      t2('Arrival Hall', 'Arrival Hall', 'landside'),
    ],
  }),
  the_cram_bar: restaurant({
    name: 'The Cram Bar', cuisine: 'QSR, Bar & Restaurant', amenity: 'restaurant',
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 41'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 49'),
    ],
  }),
  third_wave_coffee: restaurant({
    name: 'Third Wave Coffee', cuisine: 'Coffee Shop', amenity: 'cafe',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area')],
  }),
  tikg_bar: restaurant({
    name: 'TIKG (The Indian Kebab Grill) Bar', cuisine: 'Bar & Restaurant, Indian, Kebabs', amenity: 'restaurant',
    outlets: [t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt')],
  }),
  vaango: restaurant({
    name: 'Vaango', cuisine: 'QSR, South Indian', amenity: 'fast_food',
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
      t2('Level 4', 'Level 4, Post Security Hold Area'),
    ],
  }),
  wow_momo: restaurant({
    name: 'Wow Momo', cuisine: 'QSR, Momos', amenity: 'fast_food',
    outlets: [t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside')],
  }),
  wrapafella: restaurant({
    name: 'Wrapafella', cuisine: 'QSR, Wraps', amenity: 'fast_food',
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
    ],
  }),
  zambar: restaurant({
    name: 'Zambar', cuisine: 'QSR, South Indian', amenity: 'fast_food',
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
      t2('Arrival Hall', 'Arrival Hall', 'landside'),
    ],
  }),
  // ── brands with outlets in BOTH terminals (Terminal 2 side) ──
  balaji_andhra_bhojanalaya: restaurant({
    name: 'Balaji Andhra Bhojanalaya', cuisine: 'QSR, Andhra, South Indian', amenity: 'fast_food',
    outlets: [t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside')],
  }),
  cafe_2_0: restaurant({
    name: 'Cafe 2.0', cuisine: 'QSR, Quick Bites, Snacks, Café', amenity: 'cafe',
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area'),
      t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area - Gate 86'),
      t2('Level 4', 'P10, Level 4, Landside', 'landside'),
    ],
  }),
  cafelicious: restaurant({
    name: 'Cafelicious', cuisine: 'QSR, Quick Bites, Café', amenity: 'cafe',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area - Gate 67')],
  }),
  craverie: restaurant({
    name: 'Craverie', cuisine: 'Snacks', amenity: 'fast_food',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area - Gate 75')],
  }),
  joshh: restaurant({
    name: 'Joshh', cuisine: 'QSR', amenity: 'fast_food',
    outlets: [t2('Level 4', 'Level 4, Post Security Hold Area')],
  }),
  kfc: restaurant({
    name: 'KFC', cuisine: 'Fried Chicken, Fast Food', amenity: 'fast_food',
    website: 'https://www.kfc.com', logoUrl: logo('kfc.com'),
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: 'Burgers, Fast Food', amenity: 'fast_food',
    website: 'https://www.mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area'),
      t2('Level 4', 'P10, Level 4, Landside', 'landside'),
      t2('Level 3', 'Level 3, Post Security Hold Area'),
    ],
  }),
  society_tea: restaurant({
    name: 'Society Tea', cuisine: 'Quick Bites, Coffee Shop, Tea', amenity: 'cafe',
    outlets: [t2('Level 4', 'P10, Level 4, Landside', 'landside')],
  }),
  starbucks: restaurant({
    name: 'Starbucks', cuisine: 'Café, Coffee', amenity: 'cafe',
    website: 'https://www.starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [
      t2('Level 3', 'Level 3, Post Security Hold Area'),
      t2('Level 4', 'Level 4, Post Security Hold Area'),
    ],
  }),
  subway: restaurant({
    name: 'Subway', cuisine: 'Sandwiches, Fast Food', amenity: 'fast_food',
    website: 'https://www.subway.com', logoUrl: logo('subway.com'),
    outlets: [
      t2('Level 4', 'Level 4, Post Security Hold Area, Foodcourt'),
      t2('Level 3', 'Level 3, Post Security Hold Area, Foodcourt'),
    ],
  }),
  tibbs_frankie: restaurant({
    name: 'Tibbs Frankie', cuisine: 'QSR, Indian, Wraps', amenity: 'fast_food',
    outlets: [t2('Arrival Forecourt', 'P6, Arrival Forecourt', 'landside')],
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', terminal1Venues);
  const r2 = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', terminal2Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2]));

  const totalCreated = r1.created + r2.created;
  const totalDeleted = r1.deleted + r2.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
