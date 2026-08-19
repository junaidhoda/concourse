'use strict';
/**
 * Fills in complete data for Dubai International Airport (DXB), UAE,
 * restaurants/bars/cafés in Firestore, based on research conducted on
 * 2026-08-15.
 *
 * TERMINAL STRUCTURE: DXB has three terminal buildings, each with its own
 * check-in and security — confirmed via Wikipedia and multiple independent
 * 2026 airport guides. Terminal 1 (Concourse D) hosts 60+ non-Emirates
 * international carriers. Terminal 3 (Concourses A, B, C) is the Emirates
 * hub (Emirates exclusively, plus some flydubai and United). Terminal 1 and
 * Terminal 3 are airside-connected for TRANSFERRING passengers only (a
 * shared transit zone that lets connecting passengers move between them
 * without re-clearing immigration) — but each maintains its own separate
 * check-in and its own security screening for originating passengers, so
 * per this dataset's "own check-in AND own security" test they remain two
 * separate terminal buckets, not one. Terminal 2 is not airside-connected
 * to either — it sits on the opposite side of the airfield and is reached
 * only by landside transport (shuttle bus/taxi/metro), making it an even
 * more clear-cut separate bucket. This script therefore models DXB as
 * THREE terminal buckets: terminal_1, terminal_2, terminal_3.
 *
 * SOURCES & METHODOLOGY (revised 2026-08-15): primary and ONLY source is the
 * official Dubai Airports site (dubaiairports.ae). The main listing page
 * (/experiences/restaurants) is a JavaScript "Show more" list whose full
 * card grid is server-rendered into the page HTML but only progressively
 * revealed client-side — a plain fetch/WebFetch of the page therefore only
 * sees the first ~12 items per terminal filter. This revision was built
 * using real browser interaction (Claude in Chrome) to click the T1/T2/T3
 * terminal filter and repeatedly click "Show more" until it disappeared
 * (confirmed via network-request monitoring that this reveals pre-rendered
 * cards with zero new XHR/fetch calls, i.e. nothing is being missed by
 * stopping once "Show more" is gone), then extracting the complete,
 * de-duplicated card grid via JavaScript DOM queries. This yielded a
 * verified-complete count of 20 Terminal 1 cards, 9 Terminal 2 cards, and
 * 40 Terminal 3 cards. EVERY venue below was then independently confirmed
 * by fetching its own individual detail page at
 * dubaiairports.ae/experiences/restaurants/details/<slug> (a few F&B kiosks
 * are filed under /experiences/shops/details/<slug> instead), reading its
 * own Location section rather than trusting the grid's terminal badge alone
 * (this caught one real discrepancy — see Qinwan Café note below). Unlike
 * the prior revision of this script, NO secondary/third-party sources
 * (guide sites, blogs, press) were used at any stage — every venue, name,
 * description and location below traces directly to an official
 * dubaiairports.ae page. Two venues from the prior revision (Cho Gao, The
 * Hangar) do not appear in this exhaustively-verified official listing and
 * their detail-page URLs now 404 under every slug variant tried — per this
 * dataset's no-fabrication principle they have been REMOVED. A third (Veranda
 * Café) was previously included on secondary-source corroboration only and
 * is now directly confirmed via the official listing, so that caveat no
 * longer applies. This script is now believed complete for the three
 * terminals' official restaurant listings, though Dubai Airports may also
 * run kiosks/shops with food service that are categorized outside
 * "/experiences/restaurants" entirely (see Candylicious/Cinnabon note).
 *
 * MULTI-TERMINAL BRANDS: chains appearing in more than one terminal (Costa,
 * Starbucks, KFC, McDonald's, Subway, Jones the Grocer, Pret A Manger,
 * Flour + Stone, Get Your FIX, The Daily DXB, Taste of India, O'Briens) get
 * a SEPARATE doc in EACH terminal bucket they appear in, per this dataset's
 * standing convention — only outlets genuinely within the SAME terminal are
 * combined into one doc with multiple `outlets[]` entries (e.g. Costa's two
 * Terminal 1 counters, McDonald's three Terminal 3 counters, Grabb'it's
 * three Terminal 3 counters).
 *
 * DATA-QUALITY NOTES:
 *   - No phone number and no external website were published on ANY
 *     official dubaiairports.ae detail page fetched for this script, so
 *     `phone` is blank throughout. `website`/`logo_url` are filled in only
 *     for brands independently confirmed as real, identifiable global/
 *     regional chains with a confident public domain (Costa, McDonald's,
 *     Starbucks, KFC, Subway, Burger King, Krispy Kreme, Pret A Manger,
 *     Five Guys, Shake Shack, Hard Rock Cafe, Jones the Grocer, The Kitchen
 *     by Wolfgang Puck, Cinnabon, Candylicious, Grind, Marrybrown, The
 *     Noodle House, Café Bateel, O'Briens, Comptoir Libanais, Giraffe) —
 *     airport-specific or ambiguously-named concepts are left blank rather
 *     than guessing a domain.
 *   - Opening hours are blank throughout except Five Guys, whose own
 *     official detail page explicitly states 24/7 (`open_24_7: true`).
 *   - Three Terminal 1 venues (Taste of India, KFC, O'Briens) are reported
 *     by one secondary source each (from the prior revision's research) as
 *     "temporarily closed," but all three remain listed as active on the
 *     official Dubai Airports site as of this research date — included here
 *     on the strength of the current official listing.
 *   - Qinwan Café's card is tagged "T3" in the main listing grid, but its
 *     own detail page's Location section AND its description both
 *     explicitly and consistently say "Terminal 1" / "near gate D11" — this
 *     script trusts the more specific individual detail page over the grid
 *     badge and models it as a Terminal 1 venue. Flagged here as a known
 *     inconsistency on the official site itself, in case it's a site bug
 *     that gets corrected (i.e. it might actually be T3 after all).
 *   - "The Noodle House" is excluded from Terminal 3 despite being commonly
 *     associated with the Emirates concourses — its official detail page
 *     explicitly tags it Terminal 1 (D Gates, Arrivals) only, so it's
 *     modelled as a T1-only venue per the official source.
 *   - Candylicious and Cinnabon are both real, currently-trading Terminal 3
 *     venues (Concourse B near Gate B28, and C Gates - Departures,
 *     respectively) confirmed via their own official detail pages — but
 *     they're filed under /experiences/shops/details/<slug>, not
 *     /experiences/restaurants/, so they do NOT appear in the T3-filtered
 *     restaurants listing used to build the rest of this file. Kept in this
 *     script since they're genuine F&B venues with confirmed official pages.
 *   - Terminal 2's official detail pages tag every venue simply "Main
 *     Terminal," without the Arrivals/Before-Security/After-Security
 *     breakdown given for Terminal 1 and Terminal 3 venues (T2 has no
 *     concourse/gate structure). Every Terminal 2 outlet's `airside` field
 *     below is therefore a best-effort default (landside) rather than a
 *     confirmed per-venue fact — a Dubai Airports Terminal 2 fact sheet
 *     confirms the terminal has both a landside food court (~210 sqm) and
 *     an airside food court (~400 sqm), but doesn't say which named venues
 *     sit in which, so this is flagged rather than guessed venue-by-venue.
 *
 * Dubai/DXB appears in NEITHER reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'dubai' first, then 'dxb', using whichever has existing
 * terminal data). It never creates a new `airports/{id}` metadata doc
 * itself.
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
 * airport whose id isn't one of THIS script's three terminal ids
 * (terminal_1, terminal_2, terminal_3) gets its restaurants subcollection
 * and then the terminal doc itself deleted, so a stale/orphaned terminal
 * bucket doesn't keep inflating the terminal count the app shows for this
 * airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_dxb_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['dubai', 'dxb'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';

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

// ─── Terminal 1 venues (Concourse D) ─────────────────────────────────────────

const terminal1Venues = {
  sawa: restaurant({
    name: 'Sawa',
    cuisine: 'Lebanese, Street Food',
    amenity: 'fast_food',
    description: 'Modern Lebanese street food — shawarma, wraps, hummus and flatbreads, dine-in or takeaway.',
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals (Ground Floor)' })],
  }),
  marrybrown: restaurant({
    name: 'Marrybrown',
    cuisine: 'Malaysian, Halal, Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.marrybrown.com',
    logoUrl: logo('marrybrown.com'),
    description: 'Halal Malaysian fast food — crispy fried chicken, burgers, speciality wraps, rice and seafood.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Food Court (security zone not published by the source)' })],
  }),
  taste_of_india: restaurant({
    name: 'Taste of India',
    cuisine: 'Indian',
    amenity: 'restaurant',
    description: 'North-to-South Indian cuisine — curries, biryani, dosa, tandoori and vegetarian options.',
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals' })],
  }),
  costa: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.costacoffee.com',
    logoUrl: logo('costacoffee.com'),
    description: 'Espresso drinks, sandwiches and pastries; uses responsibly sourced beans and plant-based cups.',
    outlets: [
      outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals' }),
      outlet({ airside: 'airside', level: 'D Gates', locationNotes: 'Departures' }),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com',
    logoUrl: logo('mcdonalds.com'),
    description: 'Burgers, chicken sandwiches and fries.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Food Court' }),
      outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals' }),
    ],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'Coffee, tea and pastries.',
    outlets: [
      outlet({ airside: 'airside', level: 'D Gates', locationNotes: 'Departures, Before Security' }),
      outlet({ airside: 'airside', level: 'D Gates', locationNotes: 'Departures, Before Security' }),
    ],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    description: 'Fried chicken buckets, wraps, sandwiches and rice bowls.',
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals' })],
  }),
  the_daily_dxb: restaurant({
    name: 'The Daily DXB',
    cuisine: 'International, Street Food, Bar',
    amenity: 'food_court',
    description: 'A collection of five street-food stalls under one roof (Hawaiian, Italian, Hong Kong, Southern USA, poke) with an attached bar serving wine, cocktails and mocktails.',
    outlets: [outlet({ airside: 'airside', level: 'D Gates', locationNotes: 'Departures, Before Security, near Gate D13 (~600 sqm)' })],
  }),
  the_draft_house: restaurant({
    name: 'The Draft House',
    cuisine: 'American, Sports Bar, Craft Beer',
    amenity: 'bar',
    description: 'A vintage-themed sports bar with 18 screens, draft beer, BBQ, burgers and wings; by Emirates Leisure Retail.',
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals (Upper Level)' })],
  }),
  the_noodle_house: restaurant({
    name: 'The Noodle House',
    cuisine: 'Southeast Asian',
    amenity: 'restaurant',
    website: 'https://www.thenoodlehouse.com',
    logoUrl: logo('thenoodlehouse.com'),
    description: 'A contemporary, informal Southeast Asian concept — noodles, ramen, curries, dim sum and stir-fries.',
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals (Upper Level)' })],
  }),
  krispy_kreme: restaurant({
    name: 'Krispy Kreme',
    cuisine: 'Donuts, Coffee',
    amenity: 'cafe',
    website: 'https://www.krispykreme.com',
    logoUrl: logo('krispykreme.com'),
    description: 'Doughnuts and freshly brewed coffee.',
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals' })],
  }),
  pret_a_manger: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches, Grab & Go',
    amenity: 'cafe',
    website: 'https://www.pret.com',
    logoUrl: logo('pret.com'),
    description: 'Sustainably sourced sandwiches, wraps, salads, soups and organic coffee, prepared fresh in-shop daily.',
    outlets: [outlet({ airside: 'airside', level: 'D Gates', locationNotes: 'Departures, Before Security (Lower Level)' })],
  }),
  the_kitchen_by_wolfgang_puck: restaurant({
    name: 'The Kitchen by Wolfgang Puck',
    cuisine: 'Global Comfort Food, Fast Casual',
    amenity: 'restaurant',
    website: 'https://www.wolfgangpuck.com',
    logoUrl: logo('wolfgangpuck.com'),
    description: "Celebrity chef Wolfgang Puck's fast-casual take on global comfort food — burgers, pastas, salads, breakfast and Arabic options.",
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals (Upper Level)' })],
  }),
  jbandco: restaurant({
    name: 'JB&CO',
    cuisine: 'International, Grab & Go',
    amenity: 'fast_food',
    description: 'All-day multi-cuisine grab & go — breakfast, lunch, dinner, snacks, pastries and beverages.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Food Court' })],
  }),
  get_your_fix: restaurant({
    name: 'Get Your FIX',
    cuisine: 'Coffee, Specialty Coffee',
    amenity: 'cafe',
    description: "DXB's own specialty-coffee brand — chemex, siphon and nitro brew, with a sustainability focus (ethically sourced beans, compostable packaging).",
    outlets: [outlet({ airside: 'airside', level: 'D Gates', locationNotes: 'Departures, Before Security' })],
  }),
  jones_the_grocer: restaurant({
    name: 'Jones the Grocer',
    cuisine: 'Deli, Café, Grab & Go',
    amenity: 'cafe',
    website: 'https://www.jonesthegrocer.com',
    logoUrl: logo('jonesthegrocer.com'),
    description: 'Single-origin coffee, sandwiches, salads, soups and hearty mains, prepared fresh daily for takeaway.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Food Court' })],
  }),
  cafe_bateel: restaurant({
    name: 'Café Bateel',
    cuisine: 'Mediterranean, Café',
    amenity: 'restaurant',
    website: 'https://www.bateel.com',
    logoUrl: logo('bateel.com'),
    description: 'All-day Mediterranean dining plus specialty coffee, pastries and desserts, from Bateel; opened June 2026.',
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals (Upper Level)' })],
  }),
  obriens: restaurant({
    name: "O'Briens",
    cuisine: 'Irish, Café, Sandwiches',
    amenity: 'cafe',
    website: 'https://www.obriens.ie',
    logoUrl: logo('obriens.ie'),
    description: "Enjoy fresh sandwiches and coffee at O'Briens, a relaxed and friendly Irish café.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals' })],
  }),
  roti_bhai: restaurant({
    name: 'Roti Bhai',
    cuisine: 'Indian, Street Food',
    amenity: 'fast_food',
    description: 'Indian street food inspired by North and South Indian cuisines, including pani puri and dhal.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Food Court' })],
  }),
  filli: restaurant({
    name: 'FiLLi',
    cuisine: 'Emirati, Chai, Street Food, Café',
    amenity: 'cafe',
    description: "Bringing its signature Zafran Chai and much-loved street food-inspired flavours, FiLLi combines bold flavours with comforting favourites in a warm, modern café setting. Grab-and-go boxes, flaky paratha rolls, wraps, mocktails and freshly brewed coffee.",
    outlets: [outlet({ airside: 'landside', level: 'D Gates', locationNotes: 'Arrivals' })],
  }),
  qinwan_cafe: restaurant({
    name: 'Qinwan Café',
    cuisine: 'Middle Eastern, Café, Dates, Coffee',
    amenity: 'cafe',
    description: "Qinwan Café brings the tradition of Arabian hospitality into a contemporary café setting. Signature date-and-coffee pairings, salads, sandwiches and beverages inspired by regional flavours, plus beautifully presented date collections. NOTE: this venue's card on the official site's main listing carries a 'T3' filter tag, but its own detail page's Location section and description both explicitly say Terminal 1, near gate D11 — modelled here as Terminal 1 per the more specific, authoritative individual detail page.",
    outlets: [outlet({ airside: 'airside', level: 'D Gates', locationNotes: 'Departures, near Gate D11' })],
  }),
};

// ─── Terminal 2 venues ────────────────────────────────────────────────────────

const terminal2Venues = {
  costa: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.costacoffee.com',
    logoUrl: logo('costacoffee.com'),
    description: 'Espresso drinks, sandwiches and pastries; uses responsibly sourced beans and plant-based cups.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' }),
      outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' }),
    ],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'Coffee, tea and pastries.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' }),
      outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' }),
    ],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    description: 'Fried chicken buckets, wraps, sandwiches and rice bowls.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' })],
  }),
  mamak: restaurant({
    name: 'Mamak',
    cuisine: 'Pan-Asian, Street Food',
    amenity: 'fast_food',
    description: 'Pan-Asian street food inspired by five cities — Bangkok, Bali, Ho Chi Minh City, Sichuan and Delhi.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' })],
  }),
  flour_and_stone: restaurant({
    name: 'Flour + Stone',
    cuisine: 'Bakery, Café, Grab & Go',
    amenity: 'cafe',
    description: 'Freshly baked breads and pastries inspired by France, Italy, Morocco, Lebanon, India and Mexico, seated or quick-counter service.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' })],
  }),
  subway: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.subway.com',
    logoUrl: logo('subway.com'),
    description: 'Build-your-own sandwiches — choice of bread, fillings and sauce.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' })],
  }),
  jones_the_grocer: restaurant({
    name: 'Jones the Grocer',
    cuisine: 'Deli, Café, Grab & Go',
    amenity: 'cafe',
    website: 'https://www.jonesthegrocer.com',
    logoUrl: logo('jonesthegrocer.com'),
    description: 'Single-origin coffee, sandwiches, salads, soups and hearty mains, made fresh daily and packed ready for takeaway.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Main Terminal' })],
  }),
  roti_bhai: restaurant({
    name: 'Roti Bhai',
    cuisine: 'Indian, Street Food',
    amenity: 'fast_food',
    description: 'Indian street food inspired by North and South Indian cuisines, including pani puri and dhal.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' })],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com',
    logoUrl: logo('mcdonalds.com'),
    description: 'Burgers, chicken sandwiches and fries.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Main Terminal (exact airside/landside split not published per venue for Terminal 2)' })],
  }),
};

// ─── Terminal 3 venues (Concourses A, B, C — the Emirates hub) ──────────────

const terminal3Venues = {
  asian_street_kitchen: restaurant({
    name: 'Asian Street Kitchen',
    cuisine: 'Pan-Asian, Street Food',
    amenity: 'food_court',
    description: 'Far East street food — fried chicken, noodles, ramen, dumplings and more.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' })],
  }),
  bottega: restaurant({
    name: 'Bottega',
    cuisine: 'Italian, Wine Bar',
    amenity: 'restaurant',
    description: 'Contemporary Italian — risotto balls, sourdough, and prosecco pairings.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures, near Gate A10' })],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.burgerking.com',
    logoUrl: logo('burgerking.com'),
    description: 'Flame-grilled Whoppers, chicken sandwiches and wraps.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures' })],
  }),
  comptoir_libanais: restaurant({
    name: 'Comptoir Libanais',
    cuisine: 'Lebanese',
    amenity: 'restaurant',
    website: 'https://www.comptoirlibanais.com',
    logoUrl: logo('comptoirlibanais.com'),
    description: 'Colourful, casual Lebanese classics, dine-in or grab-and-go.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' })],
  }),
  desi_lunch_box: restaurant({
    name: 'Desi Lunch Box',
    cuisine: 'Indian, Fast Food',
    amenity: 'fast_food',
    description: 'Freshly prepared Indian dishes and beverages.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures (concourse not specified)' })],
  }),
  five_guys: restaurant({
    name: 'Five Guys',
    cuisine: 'Burgers, Fast Casual',
    amenity: 'fast_food',
    website: 'https://www.fiveguys.com',
    logoUrl: logo('fiveguys.com'),
    description: "100% halal beef burgers, hot dogs and shakes — the only licensed Five Guys in the region and the UAE's largest branch.",
    outlets: [outlet({ airside: 'airside', level: 'Concourse B', locationNotes: 'Departures', open247: true })],
  }),
  flour_and_stone: restaurant({
    name: 'Flour + Stone',
    cuisine: 'Bakery, Café, Grab & Go',
    amenity: 'cafe',
    description: 'Freshly baked breads and pastries inspired by France, Italy, Morocco, Lebanon, India and Mexico, seated or quick-counter service.',
    outlets: [
      outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' }),
    ],
  }),
  giraffe: restaurant({
    name: 'Giraffe',
    cuisine: 'International, Family Dining',
    amenity: 'restaurant',
    website: 'https://www.giraffe.net',
    logoUrl: logo('giraffe.net'),
    description: 'A family-friendly restaurant, UK-founded, serving international comfort food.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' })],
  }),
  jacks_bar_and_grill: restaurant({
    name: "Jack's Bar & Grill",
    cuisine: 'American, Bar & Grill',
    amenity: 'bar',
    description: 'A Tennessee-whiskey-themed bar, restaurant and retail hybrid with sports on screen.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures, near Gate A15' })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    description: 'Fried chicken buckets, wraps, sandwiches and rice bowls.',
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  pret_a_manger: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches, Grab & Go',
    amenity: 'cafe',
    website: 'https://www.pret.com',
    logoUrl: logo('pret.com'),
    description: 'Sustainably sourced sandwiches, wraps, salads, soups and organic coffee, prepared fresh in-shop daily.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' })],
  }),
  s34: restaurant({
    name: 'S34',
    cuisine: 'Contemporary Emirati',
    amenity: 'restaurant',
    description: 'Contemporary Emirati dining inspired by old-Dubai coffeehouses and the Al Fahidi neighbourhood.',
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  shake_shack: restaurant({
    name: 'Shake Shack',
    cuisine: 'Burgers, Fast Casual',
    amenity: 'fast_food',
    website: 'https://www.shakeshack.com',
    logoUrl: logo('shakeshack.com'),
    description: "Burgers, crinkle-cut fries and shakes — the brand's first-ever airport location worldwide.",
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' })],
  }),
  treehouse_juicery: restaurant({
    name: 'Treehouse Juicery',
    cuisine: 'Healthy, Juices, Smoothies, Grab & Go',
    amenity: 'fast_food',
    description: 'Cold-pressed juices, smoothies and organic salads.',
    outlets: [
      outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' }),
    ],
  }),
  the_daily_dxb: restaurant({
    name: 'The Daily DXB',
    cuisine: 'International, Street Food',
    amenity: 'food_court',
    description: 'A collection of five street-food stalls under one roof (Hawaiian, Italian, Hong Kong, Southern USA, poke).',
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
  }),
  subway: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.subway.com',
    logoUrl: logo('subway.com'),
    description: 'Build-your-own sandwiches — choice of bread, fillings and sauce.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures (concourse not specified)' })],
  }),
  veranda_cafe: restaurant({
    name: 'Veranda Café',
    cuisine: 'Café, European, Asian Fusion',
    amenity: 'cafe',
    description: 'Nourishing breakfast bowls, delectable sandwiches, and exquisite salads, adjacent to Fortnum & Mason before departure. Now directly confirmed via the official site’s Terminal 3 restaurant listing (this venue was previously included here on secondary-source corroboration only; that caveat no longer applies).',
    outlets: [outlet({ airside: 'airside', level: 'Concourse B', locationNotes: '', open247: true })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'Coffee, tea and pastries.',
    outlets: [
      outlet({ airside: 'landside', level: 'B Gates', locationNotes: 'Arrivals' }),
      outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' }),
    ],
  }),
  costa: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.costacoffee.com',
    logoUrl: logo('costacoffee.com'),
    description: 'Espresso drinks, sandwiches and pastries; uses responsibly sourced beans and plant-based cups.',
    outlets: [
      outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals' }),
    ],
  }),
  roots: restaurant({
    name: 'ROOTS',
    cuisine: 'Café, Healthy, Grab & Go',
    amenity: 'cafe',
    description: 'Fresh juices, sandwiches and organic coffee.',
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
  }),
  grind: restaurant({
    name: 'Grind',
    cuisine: 'Café, Specialty Coffee',
    amenity: 'cafe',
    website: 'https://www.grind.co.uk',
    logoUrl: logo('grind.co.uk'),
    description: 'A London coffee brand — flat whites, matcha and grab-and-go pastries.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before Security, near Emirates check-in' })],
  }),
  get_your_fix: restaurant({
    name: 'Get Your FIX',
    cuisine: 'Coffee, Specialty Coffee',
    amenity: 'cafe',
    description: "DXB's own specialty-coffee brand — chemex, siphon and nitro brew, with a sustainability focus.",
    outlets: [outlet({ airside: 'landside', level: 'A Gates', locationNotes: 'Departures, Before Security' })],
  }),
  candylicious: restaurant({
    name: 'Candylicious',
    cuisine: 'Confectionery',
    amenity: 'cafe',
    website: 'https://www.candylicious.ae',
    logoUrl: logo('candylicious.ae'),
    description: 'A candy store, also carrying Garrett Popcorn.',
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures, near Gate B28' })],
  }),
  jones_the_grocer: restaurant({
    name: 'Jones the Grocer',
    cuisine: 'Deli, Café, Grab & Go',
    amenity: 'cafe',
    website: 'https://www.jonesthegrocer.com',
    logoUrl: logo('jonesthegrocer.com'),
    description: 'Single-origin coffee, sandwiches, salads, soups and hearty mains, prepared fresh daily for takeaway.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' })],
  }),
  cinnabon: restaurant({
    name: 'Cinnabon',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    website: 'https://www.cinnabon.com',
    logoUrl: logo('cinnabon.com'),
    description: 'Cinnamon rolls and baked treats.',
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com',
    logoUrl: logo('mcdonalds.com'),
    description: 'Burgers, chicken sandwiches and fries.',
    outlets: [
      outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' }),
    ],
  }),
  oregans: restaurant({
    name: "O'Regan's",
    cuisine: 'Irish, Bar & Grill',
    amenity: 'bar',
    description: "Named in honour of Dr. Brendan O'Regan, pioneer of airport duty-free and hospitality, O'Regan's Irish Bar & Restaurant offers guests a stylish environment with inspiring airport views and a variety of global food and beverage before their flight.",
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures, near Gate C17' })],
  }),
  obriens: restaurant({
    name: "O'Briens",
    cuisine: 'Irish, Café, Sandwiches',
    amenity: 'cafe',
    website: 'https://www.obriens.ie',
    logoUrl: logo('obriens.ie'),
    description: "Enjoy fresh sandwiches and coffee at O'Briens, a relaxed and friendly Irish café.",
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
  }),
  all_antico: restaurant({
    name: "All'Antico",
    cuisine: 'Italian, Tuscan, Sandwiches, Grab & Go',
    amenity: 'fast_food',
    description: "All'Antico Vinaio is world-renowned for its iconic schiacciata, a Tuscan flatbread sandwich. As the most reviewed spot globally in 2014, it's celebrated for its freshly baked bread and delectable fillings — a taste of authentic Florence.",
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  grabbit: restaurant({
    name: "Grabb'it",
    cuisine: 'Café, Snacks, Grab & Go',
    amenity: 'cafe',
    description: "Looking for a quick and tasty bite? Pick up fresh snacks on the go at Grabb'it.",
    outlets: [
      outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals' }),
      outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' }),
    ],
  }),
  story_kitchen_and_bar: restaurant({
    name: 'Story Kitchen & Bar',
    cuisine: 'Mediterranean, Middle Eastern, Asian Fusion, Bar',
    amenity: 'restaurant',
    description: 'Story Kitchen & Bar brings people together through great food, thoughtfully crafted drinks, and shared stories. Mediterranean, Middle Eastern and Asian-influenced menu spanning breakfast, light bites, salads, burgers, grill favourites, pasta and desserts, plus organic coffee, signature cocktails and 0.0 beverages.',
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
  }),
  food_village: restaurant({
    name: 'Food Village',
    cuisine: 'International, Food Court',
    amenity: 'food_court',
    description: "Food Village DXB is a haven for foodies, with seven different outlets in one location: fast-food favourites McDonald's and KFC, Middle Eastern kebabs at Qfta, global flatbreads at Flour + Stone, ice cream and sweet treats at Pop Top, American Chinese dishes at Panda Chinese, and Taste of India.",
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  leclair_de_genie: restaurant({
    name: 'L’Éclair de Génie',
    cuisine: 'French, Pastry, Bakery, Café',
    amenity: 'bakery',
    description: "A luxury pastry shop from world-renowned pastry Chef Christophe Adam, offering all variations of the eclair — classic chocolate to fruity seasonal flavours — plus macaroons, pastries, desserts and beverages.",
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
  }),
  saddle: restaurant({
    name: 'Saddle',
    cuisine: 'Café, Coffee, Grab & Go',
    amenity: 'cafe',
    description: "One of Dubai's much-loved homegrown coffee concepts, with a warm, minimalist aesthetic. Signature specialty coffee, Pistachio Milkshake, Açaí Smoothie, and freshly prepared pastries, crepes and café classics. Founded in Dubai, inspired by Emirati hospitality.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals' })],
  }),
  here_o_donuts: restaurant({
    name: 'Here-O Donuts',
    cuisine: 'Donuts, Coffee, Bakery, Café',
    amenity: 'cafe',
    vegetarian: true,
    description: 'A Dubai-born donut shop with a cult following for its handcrafted sourdough brioche donuts made fresh every day — signature flavours include Crème brûlée-O, Cinnamon-O, Tiramisu-O, Dubai Donut, Raspberry Kunafa and New York Rolls, in classic and vegan varieties, paired with freshly brewed coffee.',
    outlets: [outlet({ airside: 'airside', level: 'A Gates', locationNotes: 'Departures' })],
  }),
  the_sports_shack: restaurant({
    name: 'The Sports Shack',
    cuisine: 'American, Sports Bar, Casual Dining',
    amenity: 'bar',
    description: 'The ultimate sports bar for a casual dining experience with heaps of entertainment — large screens showing all the popular games, plus a video games console and pool table.',
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  paper_cafe: restaurant({
    name: 'Paper Café',
    cuisine: 'Café, Breakfast, Sandwiches, Grab & Go',
    amenity: 'cafe',
    description: 'A contemporary café with nourishing breakfast bowls, sandwiches, freshly baked pastries, fresh juices and freshly prepared crepes, next to the LEGO store.',
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
  }),
  tranzeet: restaurant({
    name: 'Tranzeet',
    cuisine: 'American, Arabian Fusion, Breakfast',
    amenity: 'restaurant',
    description: 'A one-of-a-kind restaurant fusing retro Americana with Arabian flavours — stylish retro décor, fluffy cinnamon apple pancakes, shakshuka eggs, and bagels loaded with all the favourites.',
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  budweiser_bar: restaurant({
    name: 'Budweiser Bar',
    cuisine: 'American, Sports Bar',
    amenity: 'bar',
    description: 'A sports bar with 6 large screens and a full food and beer menu.',
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
  }),
  taste_of_india: restaurant({
    name: 'Taste of India',
    cuisine: 'Indian',
    amenity: 'restaurant',
    description: 'North-to-South Indian cuisine — curries, biryani, dosa, tandoori and vegetarian options.',
    outlets: [outlet({ airside: 'airside', level: 'C Gates', locationNotes: 'Departures' })],
  }),
  hard_rock_cafe: restaurant({
    name: 'Hard Rock Cafe',
    cuisine: 'American, Bar & Grill',
    amenity: 'restaurant',
    website: 'https://www.hardrockcafe.com',
    logoUrl: logo('hardrockcafe.com'),
    description: 'Grab-and-go and full-service American dining with music memorabilia.',
    outlets: [outlet({ airside: 'airside', level: 'B Gates', locationNotes: 'Departures' })],
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1 (Concourse D)', terminal1Venues);
  const r2 = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', terminal2Venues);
  const r3 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3 (Concourses A, B, C)', terminal3Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3]));

  const totalCreated = r1.created + r2.created + r3.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length + Object.keys(terminal3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
