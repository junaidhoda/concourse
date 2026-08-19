'use strict';
/**
 * Fills in complete data for all Sydney Kingsford Smith Airport (SYD)
 * restaurants/bars/cafés in Firestore, cross-referenced against Sydney
 * Airport's own website (sydneyairport.com.au) on 2026-08-15.
 *
 * Unlike Melbourne and Zurich, Sydney Airport's own "Shop & Dine" directory
 * (sydneyairport.com.au/eat) IS a static, crawlable page: it lists every
 * venue name grouped under an explicit "Location" filter of "T1
 * International / T2 Domestic / T3 Domestic" and a "Before Security / After
 * Security" filter. That directory page was the primary source for which
 * venues exist and which terminal each belongs to; each venue's own detail
 * page at sydneyairport.com.au/eat/<slug>/ was then fetched individually for
 * cuisine, description, hours, phone, dietary flags and precise
 * before/after-security location detail.
 *
 * TERMINAL STRUCTURE: Sydney Airport has three genuinely separate physical
 * terminal buildings — Terminal 1 (International: Qantas/Oneworld, SkyTeam,
 * Virgin Australia and Star Alliance international flights), Terminal 2
 * (Domestic: Jetstar, Link Airways, Virgin Australia domestic) and Terminal 3
 * (Domestic: Qantas/QantasLink, plus temporary Rex/FlyPelican operations).
 * Terminal 1 sits on the opposite side of the airport from Terminals 2/3,
 * separated by runway 16R/34L — connecting passengers need a landside bus
 * transfer of 30 minutes or more between them. Terminal 2 and Terminal 3 are
 * each separate buildings too, with their own check-in and security, though
 * they sit adjacent to each other; they are "not physically connected inside
 * the terminal buildings" (per independent transfer-guide research) and are
 * joined only by a 7-10 minute OUTDOOR pedestrian footpath, with no shuttle
 * needed. This is a different situation from Melbourne's Terminal 3/4, which
 * share one indoor building "under one roof" — Sydney's T2 and T3 don't share
 * a roof at all, so keeping them as two separate terminal buckets here is an
 * even more clear-cut case than Melbourne's, not a judgment call.
 *
 * MULTI-OUTLET CONVENTION: this round of research DID turn up genuine
 * same-terminal, multi-location brands — the exact case this dataset's
 * outlet[] structure exists for. Terminal 1 International has three separate
 * McDonald's counters (Arrivals Exit A before security, near Gate 50 after
 * security, near Gate 24 after security), two separate Sushia counters
 * (before security, and after security in "The Marketplace" near Gate 30),
 * and two separate Tobys Estate counters (before security in the Food Court,
 * and after security towards Gates 50-63) — each combined into ONE doc with
 * multiple outlets[] entries below, with each outlet's own phone number
 * folded into its location_notes since they differ per counter. Every other
 * brand that recurs on the master venue list (1915 Lanzhou Beef Noodles,
 * Taste of Thai, Sahara Grill, Oporto, Mad Mex, KFC, Tobys Estate's Terminal
 * 2 outlet, Veloce Espresso, Top Juice) has exactly one counter per terminal
 * but appears in more than one of the three DIFFERENT terminal buildings, so
 * — per this dataset's standing convention — each of those gets a separate
 * doc per terminal rather than being combined.
 *
 * Allpress Espresso was initially listed under both T1 and T2 by the
 * directory's summary table, but its own dedicated page explicitly states
 * its one and only location as "T2 Domestic Terminal, Level 2, after
 * security near Gate 40" with a T2-specific phone number, and a filtered
 * T1-International/After-Security directory view did not include it. It is
 * treated here as a T2-only venue and left out of Terminal 1, rather than
 * duplicated on the strength of an apparent directory-table error.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - Opening hours and phone numbers are included wherever the venue's own
 *     page published them; where a venue's page gave only the terminal's
 *     general trading window (roughly 3:00am-11:00pm for T1, 4:00am-11:00pm
 *     for T2/T3) rather than a venue-specific figure, that field is left
 *     blank here rather than presented as if it were venue-specific.
 *   - No venue in this dataset publishes a full 24/7 claim, so `open_24_7`
 *     is false throughout.
 *   - Dietary flags are set only where a venue's own page explicitly
 *     publishes them: 1915 Lanzhou Beef Noodles (halal-certified, both its
 *     T1 and T2 outlets) and Kitchen by Mike (gluten-free, vegetarian and
 *     organic options). General marketing language about "healthy" or
 *     "plant-based" positioning (Liv Eat, Sol Bowl, Pulp + Grind) is not
 *     treated as a formal dietary flag and is left blank.
 *   - `website`/`logo_url` are filled in only for brands independently
 *     verifiable as real national/international chains with a confident
 *     public domain (Betty's Burgers, Campos Coffee, EARL, Hungry Jack's,
 *     KFC, Mad Mex, McDonald's, Oporto, PappaRich, Subway, SumoSalad,
 *     Sushia, Tobys Estate, Top Juice, Allpress Espresso, Brasserie Bread,
 *     Krispy Kreme, Liv Eat, Mrs Fields, Roll'd, Soul Origin, Sushi Sushi,
 *     Sol Bowl, Yo! Sushi, Icebergs, Stone & Wood) — beer-brand-themed bar
 *     concessions (Heineken House, Peroni Bar, Fat Yak, Great Northern) and
 *     chef/celebrity-branded concepts run by a third-party concessionaire
 *     (The Bistro by Wolfgang Puck, Luke's Bistro & Bar) are left blank
 *     rather than pointing to a brand domain that isn't really the venue's
 *     own site.
 *
 * Sydney Airport appears in NEITHER reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'sydney' first, then 'syd', using whichever has existing
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
 * airport whose id isn't one of THIS script's three terminal ids (TERMINAL_1,
 * TERMINAL_2, TERMINAL_3) gets its restaurants subcollection and then the
 * terminal doc itself deleted, so a stale/orphaned terminal bucket left
 * behind by any earlier or wrongly-modelled revision of this script doesn't
 * keep inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_syd_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['sydney', 'syd'];
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

// ─── Terminal 1 venues (International) ───────────────────────────────────────

const t1Venues = {
  lanzhou_beef_noodles_t1: restaurant({
    name: '1915 Lanzhou Beef Noodles',
    cuisine: 'Chinese, Noodles',
    amenity: 'restaurant',
    halal: true,
    description: 'Traditional Lanzhou-style hand-pulled beef noodle soup, made with authentic, halal-certified recipes. One of two Sydney Airport outlets (also in Terminal 2).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Food Court, Level 2, before security', openingHours: '3:00am - 11:00pm' })],
  }),
  atrium: restaurant({
    name: 'Atrium',
    cuisine: 'Café',
    amenity: 'cafe',
    phone: '0466 798 902',
    description: 'A calm café/lounge rest area serving coffee and pastries.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, after security', openingHours: '4:00am - 10:00pm' })],
  }),
  barista: restaurant({
    name: 'BARista',
    cuisine: 'Café, Bar',
    amenity: 'bar',
    phone: '0421 399 140',
    description: 'Coffee, cocktails and globally-inspired dishes like eggs benedict croissants, chicken burgers and poke bowls.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, near Gate 31, Level 2, after security', openingHours: '6:00am - 10:00pm' })],
  }),
  bettys_burgers: restaurant({
    name: "Betty's Burgers",
    cuisine: 'Burgers',
    amenity: 'fast_food',
    website: 'https://www.bettysburgers.com.au',
    logoUrl: logo('bettysburgers.com.au'),
    description: 'Made-to-order burgers, sides and custard ice cream desserts from the Noosa-founded Australian burger chain.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Food Court, Level 2, before security', openingHours: '5:00am - 8:00pm' })],
  }),
  caffettino: restaurant({
    name: 'Caffettino',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'A quick coffee and light-bites stop near check-in.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Departures Level, near Check-in Gate H, before security', openingHours: '3:00am - 8:30pm' })],
  }),
  campos_coffee: restaurant({
    name: 'Campos Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.camposcoffee.com',
    logoUrl: logo('camposcoffee.com'),
    description: 'Ethically sourced specialty coffee plus pastries, sandwiches and salads.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 24, after security' })],
  }),
  earl_t1: restaurant({
    name: 'EARL',
    cuisine: 'Sandwiches, Café',
    amenity: 'cafe',
    website: 'https://www.earlcanteen.com.au',
    logoUrl: logo('earlcanteen.com.au'),
    phone: '03 8631 7700',
    description: 'Sydney-exclusive sandwich combinations and seasonal cold brew and matcha drinks from the EARL Canteen chain.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Level 2, before security', openingHours: '4:00am - 10:00pm' })],
  }),
  east_x_west: restaurant({
    name: 'East x West',
    cuisine: 'Japanese, Izakaya',
    amenity: 'restaurant',
    phone: '03 8631 7700',
    description: 'Izakaya-style ramen, pork-belly bao and gyoza, poke bowls, Sapporo on tap, cocktails, sake and whisky.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, near Check-in Counter H, Level 2, before security', openingHours: '6:00am - 10:00pm' })],
  }),
  grand_cru: restaurant({
    name: 'Grand Cru',
    cuisine: 'Bistro, Modern Australian, Bar',
    amenity: 'bar',
    phone: '+61 2 9114 6558',
    description: 'Bistro fare alongside beers, wines and spirits, serving breakfast through dinner.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Level 2, Food Court, before security' })],
  }),
  gusto_pasta_bar_t1: restaurant({
    name: 'Gusto Pasta Bar',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'Fresh pasta made and cooked to order on-site, plus daily pastries, paninis and Italian coffee.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Level 2, Food Court, before security', openingHours: '6:00am - 10:00pm' })],
  }),
  heineken_house: restaurant({
    name: 'Heineken House',
    cuisine: 'Bar',
    amenity: 'bar',
    description: "Heineken's flagship Australian airport venue, pouring Heineken Extra Cold with a food menu from The Bistro by Wolfgang Puck.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 10, after security', openingHours: '3:00am - 11:00pm' })],
  }),
  hikari_ramen: restaurant({
    name: 'Hikari Ramen & Donburi',
    cuisine: 'Japanese, Ramen',
    amenity: 'restaurant',
    description: 'Handcrafted ramen and donburi made from fresh, local ingredients and traditional recipes.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, next to Gate 10, after security', openingHours: '6:00am - 9:00pm' })],
  }),
  hungry_jacks_t1: restaurant({
    name: "Hungry Jack's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://www.hungryjacks.com.au',
    logoUrl: logo('hungryjacks.com.au'),
    phone: '+61 2 9114 6558',
    description: 'Burgers, breakfast, sides, salads, coffee and desserts from the Australian fast-food chain.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Level 2, Food Court, before security', openingHours: '3:00am - 11:00pm' })],
  }),
  kfc_t1: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com.au',
    logoUrl: logo('kfc.com.au'),
    phone: '02 9114 6558',
    description: "KFC's classic fried-chicken menu; the chain has had an airport presence here for over 55 years. One of two Sydney Airport outlets (also in Terminal 2).",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, near Gate 24, Level 2, after security', openingHours: '7:00am - 9:00pm' })],
  }),
  kitchen_by_mike: restaurant({
    name: 'Kitchen by Mike',
    cuisine: 'Modern Australian',
    amenity: 'restaurant',
    vegetarian: true,
    glutenFree: true,
    phone: '02 9700 7500',
    description: "Chef Mike McEnearney's egalitarian-dining concept — chia pudding, roast chicken and Kurobuta pork belly, with gluten-free, vegetarian and organic options, plus carry-on packs.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 30, after security', openingHours: '3:00am - 11:00pm' })],
  }),
  lilong: restaurant({
    name: 'Lilong by Taste of Shanghai',
    cuisine: 'Chinese, Shanghai Street Food',
    amenity: 'restaurant',
    description: 'Shanghai street-style dishes including signature noodles and dumplings.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 56, after security', openingHours: '3:00am - 11:00pm' })],
  }),
  mad_mex_t1: restaurant({
    name: 'Mad Mex',
    cuisine: 'Mexican',
    amenity: 'fast_food',
    website: 'https://www.madmex.com.au',
    logoUrl: logo('madmex.com.au'),
    phone: '02 8000 9636',
    description: 'Made-to-order burritos, quesadillas, nachos and tacos.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Level 2, Food Court, before security', openingHours: '7:00am - 8:00pm' })],
  }),
  mcdonalds_t1: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://mcdonalds.com.au',
    logoUrl: logo('mcdonalds.com.au'),
    description: "Standard McDonald's menu plus McCafé; this doc combines Terminal 1's three separate International terminal outlets.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Level 1, Arrivals Exit A, before security · phone +61 2 9669 3885' }),
      outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 50, after security · phone +61 2 9700 8461', openingHours: '3:00am - 11:00pm' }),
      outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 24, after security · phone 8362 6500' }),
    ],
  }),
  ooosh_oregano_bakery: restaurant({
    name: 'Ooosh Oregano Bakery',
    cuisine: 'Lebanese, Bakery',
    amenity: 'bakery',
    description: 'Lebanese-style baked pizzas (manakish) with filled centres.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Arrivals Exit A, Level 1, before security' })],
  }),
  oporto_t1: restaurant({
    name: 'Oporto',
    cuisine: 'Portuguese, Chicken',
    amenity: 'fast_food',
    website: 'https://www.oporto.com.au',
    logoUrl: logo('oporto.com.au'),
    description: 'Flame-grilled (never fried) Portuguese-style chicken with signature chilli sauce. One of two Sydney Airport outlets (also in Terminal 2).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Level 2, Food Court, before security', openingHours: '5:00am - 8:00pm' })],
  }),
  papparich: restaurant({
    name: 'PappaRich',
    cuisine: 'Malaysian',
    amenity: 'restaurant',
    website: 'https://www.papparich.net.au',
    logoUrl: logo('papparich.net.au'),
    phone: '02 9167 5725',
    description: 'Nasi lemak, roti canai and traditional Malaysian dishes, alongside sister dessert brands Hokkaido Baked Cheese Tart and Kurimu.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, after security', openingHours: '7:00am - 10:00pm' })],
  }),
  peroni_bar: restaurant({
    name: 'Peroni Bar',
    cuisine: 'Italian, Bar',
    amenity: 'bar',
    description: 'Peroni Nastro Azzurro on tap alongside traditional Italian aperitivo-style food.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 56, after security' })],
  }),
  sahara_grill_t1: restaurant({
    name: 'Sahara Grill',
    cuisine: 'Middle Eastern',
    amenity: 'fast_food',
    description: 'Doner and shish kebabs. One of two Sydney Airport outlets (also in Terminal 2).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 10, after security', openingHours: '3:00am - 11:00pm' })],
  }),
  subway_t1: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches',
    amenity: 'fast_food',
    website: 'https://www.subway.com.au',
    logoUrl: logo('subway.com.au'),
    phone: '+61 2 9700 8104',
    description: 'Subs, salads and wraps made fresh to order.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Food Court, Level 2, before security', openingHours: '3:00am - 11:00pm' })],
  }),
  sumosalad: restaurant({
    name: 'SumoSalad Green on Green',
    cuisine: 'Healthy, Salads',
    amenity: 'fast_food',
    website: 'https://www.sumosalad.com.au',
    logoUrl: logo('sumosalad.com.au'),
    phone: '02 8373 9518',
    description: 'Seasonal-produce salads, sandwiches, wraps, soups, juices and espresso.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, near Gate 24, after security' })],
  }),
  sushia_t1: restaurant({
    name: 'Sushia',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    website: 'https://www.sushia.com.au',
    logoUrl: logo('sushia.com.au'),
    description: "\"Australia's leading sushi concept eatery,\" combining Terminal 1's two International terminal outlets — one after security with 17-metre floor-to-ceiling aircraft-view windows, one before security.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, "The Marketplace," near Gate 30, Level 2, after security · phone 02 9693 1933' }),
      outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, before security · phone 9858 1749', openingHours: '9:00am - 8:00pm' }),
    ],
  }),
  sydney_coffee_trader: restaurant({
    name: 'Sydney Coffee Trader',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '03 8631 7700',
    description: 'Coffee made with Seven Miles Coffee Roasters beans, plus bagels, sandwiches, salads, chia puddings, tap beer, cocktails and wine.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, near Gate B, Level 1, before security', openingHours: '6:00am - 10:00pm' })],
  }),
  taste_of_thai_t1: restaurant({
    name: 'Taste of Thai',
    cuisine: 'Thai',
    amenity: 'restaurant',
    phone: '+61 2 9700 8975',
    description: 'A modern take on traditional Thai dishes such as pad Thai and stir-fry. One of three Sydney Airport outlets (also in Terminal 2 and Terminal 3).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Departures Food Court, Level 2, before security' })],
  }),
  wolfgang_puck_bistro: restaurant({
    name: 'The Bistro by Wolfgang Puck',
    cuisine: 'Modern American, International',
    amenity: 'restaurant',
    description: "Steak frites, gourmet pizzas, Australian Wagyu burgers, truffle chips and breakfast items, plus Wolfgang Puck's signature chopped salad, with skyline views.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, near Gate 10, Level 2, after security', openingHours: '3:00am - 11:00pm' })],
  }),
  the_tilmont: restaurant({
    name: 'The Tilmont',
    cuisine: 'Café, Burgers, Bar',
    amenity: 'bar',
    description: "Sydney Airport's newest dining destination at the time of opening — café classics and gourmet burgers alongside cocktails and a curated wine list.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, near Check-in Gate H, before security', openingHours: '6:30am - 8:00pm' })],
  }),
  tobys_estate_t1: restaurant({
    name: 'Tobys Estate',
    cuisine: 'Coffee, Tea, Chocolate',
    amenity: 'cafe',
    website: 'https://www.tobysestate.com.au',
    logoUrl: logo('tobysestate.com.au'),
    description: "Premium, sustainably-sourced coffee, tea and chocolate merchant; this doc combines Terminal 1's two International terminal outlets.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Food Court, Level 2, before security · phone +61 2 9317 2945', openingHours: '3:00am - 11:00pm' }),
      outlet({ airside: 'airside', locationNotes: 'Terminal 1 International, Level 2, towards Gates 50-63, after security', openingHours: '3:00am - 11:00pm' }),
    ],
  }),
  top_juice_t1: restaurant({
    name: 'Top Juice',
    cuisine: 'Juice, Healthy',
    amenity: 'fast_food',
    website: 'https://www.topjuice.com.au',
    logoUrl: logo('topjuice.com.au'),
    phone: '(02) 8095 9884',
    description: '100% natural juices, smoothies, fruit salads and healthy meals. One of two Sydney Airport outlets (also in Terminal 3).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Departures Food Court, before security', openingHours: '6:00am - 8:00pm' })],
  }),
  veloce_espresso_t1: restaurant({
    name: 'Veloce Espresso',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Colombian reserve-blend coffee plus gourmet wraps, salads and treats. One of two Sydney Airport outlets (also in Terminal 2).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 International, Arrivals, Exit A, Level 1, before security' })],
  }),
};

// ─── Terminal 2 venues (Domestic — Jetstar, Link Airways, Virgin Australia) ──

const t2Venues = {
  lanzhou_beef_noodles_t2: restaurant({
    name: '1915 Lanzhou Beef Noodles',
    cuisine: 'Chinese, Noodles',
    amenity: 'restaurant',
    halal: true,
    description: 'Beef noodle bowls made with authentic, halal-certified Lanzhou-style recipes. One of two Sydney Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security', openingHours: '8:00am - 9:00pm' })],
  }),
  allpress_espresso: restaurant({
    name: 'Allpress Espresso',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.allpressespresso.com',
    logoUrl: logo('allpressespresso.com'),
    phone: '9662 8288',
    description: 'Global specialty coffee roaster serving espresso-based drinks.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, near Gate 40, after security', openingHours: 'Mon 6:00am - 9:00pm; Tue-Sun 5:00am - 9:00pm' })],
  }),
  bistro_2020: restaurant({
    name: 'Bistro 2020',
    cuisine: 'Pub, Bistro',
    amenity: 'bar',
    phone: '+61 2 9114 6551',
    description: 'A pub-style bistro with tarmac views serving chicken parmigiana, wagyu burgers, nachos, risottos, all-day breakfast, pizzas and cocktails.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, Food Court, after security' })],
  }),
  brasserie_bread_t2: restaurant({
    name: 'Brasserie Bread',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    website: 'https://www.brasseriebread.com.au',
    logoUrl: logo('brasseriebread.com.au'),
    phone: '+61 2 9114 6551',
    description: 'Hand-crafted pastries, cakes, sourdough pancakes and award-winning artisan breads.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  fat_yak: restaurant({
    name: 'Fat Yak',
    cuisine: 'Bar, Craft Beer',
    amenity: 'bar',
    phone: '(02) 9114 6551',
    description: 'A craft-beer bar built around the Fat Yak brewing brand.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, after security' })],
  }),
  great_northern: restaurant({
    name: 'Great Northern',
    cuisine: 'Bar, Pub Food',
    amenity: 'bar',
    description: 'Craft beers and pub-style food, including burgers, potato scallops and campfire skewers.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, near Gate 40, Level 2, end of the Virgin pier, after security', openingHours: '5:00am - 9:00pm' })],
  }),
  inbound_cafe: restaurant({
    name: 'Inbound Café',
    cuisine: 'Café, Quick Bites',
    amenity: 'cafe',
    description: 'A casual café for coffee, sweet and savoury snacks, sandwiches and wraps.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2 Domestic, Level 1, near Baggage Claim, before security' })],
  }),
  kfc_t2: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com.au',
    logoUrl: logo('kfc.com.au'),
    phone: '02 9114 6551',
    description: "KFC's classic fried-chicken menu, noted as Australia's first KFC in an airport. One of two Sydney Airport outlets (also in Terminal 1).",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, Food Court, after security', openingHours: '7:00am - 9:00pm' })],
  }),
  krispy_kreme_t2: restaurant({
    name: 'Krispy Kreme',
    cuisine: 'Doughnuts, Café',
    amenity: 'bakery',
    website: 'https://www.krispykreme.com.au',
    logoUrl: logo('krispykreme.com.au'),
    phone: '+61 2 8338 0849',
    description: 'Original Glazed® doughnuts plus barista coffee, bagels and shakes.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, Food Court, after security' })],
  }),
  liv_eat_t2: restaurant({
    name: 'Liv Eat',
    cuisine: 'Healthy, Quick Bites',
    amenity: 'fast_food',
    website: 'https://www.liveat.com.au',
    logoUrl: logo('liveat.com.au'),
    phone: '02 8373 9542',
    description: 'Health-focused bowls, wraps, pides and salads made from daily-sourced ingredients.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security', openingHours: '5:00am - 10:00pm' })],
  }),
  loop_bagels: restaurant({
    name: 'Loop Bagels',
    cuisine: 'Bagels',
    amenity: 'bakery',
    description: 'Fresh sweet and savoury bagels.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, after security', openingHours: '4:00am - 8:30pm' })],
  }),
  mad_mex_t2: restaurant({
    name: 'Mad Mex',
    cuisine: 'Mexican',
    amenity: 'fast_food',
    website: 'https://www.madmex.com.au',
    logoUrl: logo('madmex.com.au'),
    phone: '02 8000 9636',
    description: 'Made-to-order burritos, quesadillas, nachos and tacos.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  mcdonalds_t2: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://mcdonalds.com.au',
    logoUrl: logo('mcdonalds.com.au'),
    phone: '+61 2 9352 7503',
    description: "Burgers, salads and McCafé coffee. One of two Sydney Airport terminals with a McDonald's (Terminal 1 has three of its own outlets).",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  mrs_fields: restaurant({
    name: 'Mrs Fields Bakery Cafe',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    website: 'https://www.mrsfields.com.au',
    logoUrl: logo('mrsfields.com.au'),
    phone: '+61 2 9313 5333',
    description: 'Freshly baked cookies and premium Arabica coffee.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  oporto_t2: restaurant({
    name: 'Oporto',
    cuisine: 'Portuguese, Chicken',
    amenity: 'fast_food',
    website: 'https://www.oporto.com.au',
    logoUrl: logo('oporto.com.au'),
    phone: '02 8000 9665',
    description: 'Flame-grilled Portuguese-style chicken plus made-to-order salads, burgers and wraps. One of two Sydney Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security', openingHours: '6:00am - 10:00pm' })],
  }),
  petes_pies: restaurant({
    name: "Pete's Pies",
    cuisine: 'Bakery, Pies',
    amenity: 'bakery',
    description: 'Gourmet pies with slow-cooked meats, plus pastries, cakes, slices and sandwiches.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  pulp_and_grind: restaurant({
    name: 'Pulp + Grind',
    cuisine: 'Healthy, Juice Bar',
    amenity: 'fast_food',
    phone: '+61 433 255 503',
    description: '"Feel-good food" made with all-natural ingredients — nutritious breakfast bowls, smoothies and fruit beverages.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security', openingHours: '4:30am - 9:30pm' })],
  }),
  rolld: restaurant({
    name: "Roll'd",
    cuisine: 'Vietnamese',
    amenity: 'fast_food',
    website: 'https://www.rolld.com.au',
    logoUrl: logo('rolld.com.au'),
    phone: '+61 2 9008 1398',
    description: 'Fresh, fast Vietnamese street food — pho, rice paper rolls and banh mi.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  sahara_grill_t2: restaurant({
    name: 'Sahara Grill',
    cuisine: 'Middle Eastern',
    amenity: 'fast_food',
    phone: '+61 2 9352 7371',
    description: 'Doner and shish kebabs. One of two Sydney Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  sol_bowl: restaurant({
    name: 'Sol Bowl',
    cuisine: 'Açaí Bowls, Healthy',
    amenity: 'fast_food',
    website: 'https://www.solbowl.au',
    logoUrl: logo('solbowl.au'),
    description: 'Nutrient-dense bowls "inspired by the colourful world of gemstones."',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, near Gate 39, after security', openingHours: '6:00am - 9:00pm' })],
  }),
  soul_origin: restaurant({
    name: 'Soul Origin',
    cuisine: 'Salads, Sandwiches, Café',
    amenity: 'fast_food',
    website: 'https://www.soulorigin.com.au',
    logoUrl: logo('soulorigin.com.au'),
    description: 'Salads, rolls, paninis, sandwiches and wraps made daily in-store, plus coffee.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Food Court, Level 2, after security' })],
  }),
  sushi_sushi: restaurant({
    name: 'Sushi Sushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'fast_food',
    website: 'https://www.sushisushi.com.au',
    logoUrl: logo('sushisushi.com.au'),
    phone: '02 9129 9317',
    description: 'Fresh sushi handmade daily, from the 170+ location Australian chain.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, near Gate 35, after security', openingHours: '6:00am - 9:00pm' })],
  }),
  taste_of_thai_t2: restaurant({
    name: 'Taste of Thai',
    cuisine: 'Thai',
    amenity: 'restaurant',
    description: 'A modern take on traditional Thai dishes such as pad Thai and stir-fry. One of three Sydney Airport outlets (also in Terminal 1 and Terminal 3).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, after security' })],
  }),
  tobys_estate_t2: restaurant({
    name: 'Tobys Estate',
    cuisine: 'Coffee, Tea, Chocolate',
    amenity: 'cafe',
    website: 'https://www.tobysestate.com.au',
    logoUrl: logo('tobysestate.com.au'),
    phone: '+61 2 9114 6551',
    description: "Premium, sustainably-sourced coffee, tea and chocolate merchant. One of two Sydney Airport terminals with a Tobys Estate (Terminal 1 has two of its own outlets).",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, Food Court, after security' })],
  }),
  veloce_espresso_t2: restaurant({
    name: 'Veloce Espresso',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Colombian reserve-blend coffee plus gourmet wraps, salads and treats. One of two Sydney Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, near Gate 49, after security', openingHours: '7:00am - 9:00pm' })],
  }),
  yo_sushi: restaurant({
    name: 'Yo! Sushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'fast_food',
    website: 'https://www.yosushi.com',
    logoUrl: logo('yosushi.com'),
    description: 'Casual Japanese street food and sushi.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2 Domestic, Level 2, Food Court, after security' })],
  }),
};

// ─── Terminal 3 venues (Domestic — Qantas/QantasLink, temporary Rex/FlyPelican) ──

const t3Venues = {
  icebergs: restaurant({
    name: 'Icebergs',
    cuisine: 'Modern Australian, Café, Bar',
    amenity: 'restaurant',
    website: 'https://www.icebergs.com.au',
    logoUrl: logo('icebergs.com.au'),
    description: "Brings the spirit of Bondi's Icebergs Dining Room to Terminal 3 with a café and full bar.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: 'Mon-Fri 5:00am - 9:00pm; Sat-Sun 6:00am - 8:00pm' })],
  }),
  loulou: restaurant({
    name: 'Loulou',
    cuisine: 'French, Bakery, Bistro',
    amenity: 'restaurant',
    description: 'A French bakery-meets-bistro concept — breads, viennoiserie, classic French dishes and wine.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: '7:00am - 8:00pm' })],
  }),
  lotus_dumpling_bar: restaurant({
    name: 'Lotus Dumpling Bar',
    cuisine: 'Asian, Dumplings',
    amenity: 'restaurant',
    phone: '0410 081 674',
    description: 'Handmade dumplings from premium, locally-sourced ingredients, plus drinks.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: '6:00am - 8:30pm' })],
  }),
  lukes_bistro_bar: restaurant({
    name: "Luke's Bistro & Bar",
    cuisine: 'Modern Australian, Seafood',
    amenity: 'restaurant',
    phone: '02 9317 2945',
    description: "Chef Luke Mangan's casual dining concept, including lobster rolls, grab & go, and a Seafood and Champagne Bar.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, Level 2, near Gate 3, after security', openingHours: '5:00am - 8:00pm' })],
  }),
  maggios: restaurant({
    name: "Maggio's",
    cuisine: 'Café, Bakery, Italian',
    amenity: 'bakery',
    phone: '0416 127 546',
    description: 'A 25-year-established bakery-café with an Italian-leaning menu of pastries, cakes, pies, sandwiches, cannoli, lasagne and pizzas.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: '6:00am - 8:30pm' })],
  }),
  slims_quality_burger: restaurant({
    name: "Slim's Quality Burger",
    cuisine: 'Burgers, American Diner',
    amenity: 'fast_food',
    phone: '0416 134 962',
    description: 'A retro-style burger joint — burgers, tenders, fries, shakes and sundaes.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: '6:00am - 8:30pm' })],
  }),
  stitch_coffee: restaurant({
    name: 'Stitch Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'A Sydney roastery offering coffee blends, single origins, ready-to-brew products and food.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: '5:00am - 8:00pm' })],
  }),
  stone_and_wood: restaurant({
    name: 'Stone & Wood',
    cuisine: 'Bar, Craft Beer',
    amenity: 'bar',
    website: 'https://www.stoneandwood.com.au',
    logoUrl: logo('stoneandwood.com.au'),
    phone: '(02) 9317 2945',
    description: "A bar from the Stone & Wood craft brewery, pouring tap beers alongside burgers and beer cocktails.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, Level 2, near Gate 8, after security', openingHours: '8:00am - 7:00pm' })],
  }),
  taste_of_thai_t3: restaurant({
    name: 'Taste of Thai',
    cuisine: 'Thai',
    amenity: 'restaurant',
    phone: '+61 2 9700 8975',
    description: 'A modern take on traditional Thai dishes such as pad Thai and stir-fry. One of three Sydney Airport outlets (also in Terminal 1 and Terminal 2).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security' })],
  }),
  the_sushi_platter: restaurant({
    name: 'The Sushi Platter',
    cuisine: 'Japanese, Sushi',
    amenity: 'fast_food',
    description: '"Pick Your Own Sushi" and grab-and-go sushi.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, near the Gate 6 lift, after security', openingHours: 'Mon-Fri 6:30am - 9:00pm; Sat-Sun 7:00am - 8:00pm' })],
  }),
  top_juice_t3: restaurant({
    name: 'Top Juice',
    cuisine: 'Juice, Healthy',
    amenity: 'fast_food',
    website: 'https://www.topjuice.com.au',
    logoUrl: logo('topjuice.com.au'),
    phone: '(02) 8095 9884',
    description: '100% natural juices, smoothies, fruit salads and healthy meals. One of two Sydney Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: '6:00am - 8:00pm' })],
  }),
  tres_tacos: restaurant({
    name: 'Tres Tacos',
    cuisine: 'Mexican, Taqueria',
    amenity: 'fast_food',
    description: 'A casual taqueria and bar with in-house prepared Mexican food.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3 Domestic, after security', openingHours: '7:00am - 8:00pm' })],
  }),
  viaggio_espresso_bar: restaurant({
    name: 'Viaggio Espresso + Bar',
    cuisine: 'Café, Bar, Italian',
    amenity: 'cafe',
    description: '"The Journey" — an Italian-themed café serving Vittoria coffee, alcohol and light tapas-style bites.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3 Domestic, Level 1, near Baggage Claim, before security' })],
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

  const t1Result = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', t1Venues);
  const t2Result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', t2Venues);
  const t3Result = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3]));

  const totalCreated = t1Result.created + t2Result.created + t3Result.created;
  const totalDeleted = t1Result.deleted + t2Result.deleted + t3Result.deleted;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t2Venues).length + Object.keys(t3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
