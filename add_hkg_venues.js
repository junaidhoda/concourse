'use strict';
/**
 * Fills in complete data for Hong Kong International Airport (HKG),
 * restaurants/bars/cafés/dessert shops in Firestore. Researched 2026-08-16
 * from the official site, www.hongkongairport.com (Airport Authority Hong
 * Kong), Shop & Dine > Dining directory, using Claude in Chrome browser
 * automation (not WebFetch — the listing is a JS-rendered SPA).
 *
 * TERMINAL STRUCTURE: HKG currently has two genuinely distinct terminal
 * buckets under this dataset's "own check-in AND own security" test.
 * Terminal 1 is the original main building — all boarding gates (East
 * Hall, Central Area, West Hall, plus the Satellite Concourse reached via
 * Sky Bridge near Gate 24, and the Midfield Concourse reached via the
 * Automated People Mover) live here, and none of those extensions has its
 * own check-in or security; passengers reach them only after already
 * clearing T1's own security, so all of it — including Sky Bridge and
 * Midfield Concourse venues — is modelled as one terminal_1 bucket, with
 * the sub-area recorded in each outlet's location_notes/level. Terminal 2
 * reopened in phases in 2026 (departure hall fully open 2026-05-27) as a
 * genuinely separate building with its own 108 check-in counters and its
 * own security/immigration screening (20 biometric e-gates, 35 e-Channels,
 * 60 immigration counters) — meeting the "own check-in AND own security"
 * bar even though it has no boarding gates of its own yet: passengers who
 * clear T2's security still ride the APM to T1 to board, with T2's
 * boarding-gate concourse (T2C) not expected until sometime around 2027.
 * Because of that, every T2 venue below is landside (non-restricted area,
 * before T2's own security) — there is currently no T2 airside dining.
 * SkyPier (the cross-boundary ferry transfer facility) is a distinct
 * option in the site's own location filter, but zero Dining-category
 * listings are tagged to it — it publishes no F&B in this directory as of
 * this research pass, so no skypier bucket is created.
 *
 * SOURCES & METHODOLOGY: hongkongairport.com/en/shop-dine/dining/ exposes
 * a "Location" filter (All Locations / Terminal 1 / Terminal 2 / SkyPier /
 * Restricted Area / Non-restricted Area) and a "Category" filter (Asian /
 * Bakery / Chinese & HK-style coffee shop / Dessert / Fast Food & Food
 * Courts / Vegetarian / Western / Halal). Inspecting the DOM showed the
 * filters are client-side only — all 70 listing cards are always present,
 * each carrying a `data-filter-loc` attribute (e.g. "T1 ra", "T2 nr", "SB
 * ra", "T1 ra nr T2") that is the site's own structural terminal +
 * security classification: T1/T2 = terminal, SB = Sky Bridge (still part
 * of T1's own airside — see above), ra = Restricted Area (airside), nr =
 * Non-restricted Area (landside). This authoritative field — not the
 * free-text location string, and not inference — is what determined every
 * outlet's `airside` value below; it was cross-checked against the
 * explicit "Restricted Area"/"Non-restricted Area" label shown on each
 * outlet's own detail-page card for all 5 multi-location brands and found
 * to agree in every case. Each card also carries a `data-filter-cat`
 * attribute (comma-separated short codes, e.g. "asian,fastf,veget") which
 * is the site's own dietary/category tagging — `halal`/`veget` below are
 * taken directly from this field, not inferred from cuisine names.
 *
 * Of the 70 distinct listing cards, 65 are single-location (one outlet).
 * 5 are brands the site itself marks "More than 1 location": A-1 Bakery
 * Express, McDonald's® & McCafé®, One Minute Gourmet, PRET A MANGER, and
 * STARBUCKS. Each of these 5 was visited on its own detail page and its
 * "Show all" toggle expanded to reveal every individual outlet (precise
 * location text, Restricted/Non-restricted Area label, hours, and — where
 * published — phone/website/email per outlet).
 *
 * MULTI-OUTLET CONVENTION: of the 5 multi-location brands, 4 have every
 * outlet within a single terminal and are modelled as one doc with
 * multiple `outlets[]` entries (A-1 Bakery Express: 2 outlets in T1;
 * STARBUCKS: 6 outlets in T1; PRET A MANGER: 3 outlets in T1; One Minute
 * Gourmet: 2 outlets in T1). McDonald's® & McCafé® is the sole brand with
 * outlets split across BOTH terminals (2 in T1, 1 in T2), so per this
 * dataset's standing convention it becomes two separate docs — one per
 * terminal — rather than one doc spanning both.
 *
 * "nodi" (Near Gate 214, Midfield Concourse) and "nodi | Moleskine" (Near
 * Gate 60) are kept as two separate docs rather than merged into one
 * multi-outlet "nodi" doc: the official site itself lists them as two
 * distinctly-named cards (not as one "More than 1 location" entry the way
 * the 5 brands above are), so the site's own data model treats
 * "nodi | Moleskine" as a distinct co-branded concept, not just a second
 * nodi outlet — trusted per this dataset's page-truth-over-inference
 * precedent.
 *
 * NO FABRICATION: name, location text, opening hours, halal/vegetarian
 * flags, and (where published) phone/website/email are all taken directly
 * from the site. The site itself publishes no free-text description and
 * no phone/website for most single-location listings (only the 5
 * multi-location detail pages surface phone/website/email per outlet), so
 * `description`/`phone`/`website` are left blank except where the site
 * provided them or for a small set of globally-recognized chains whose
 * official domain is independently unambiguous (McDonald's, Starbucks,
 * A-1 Bakery Express, Pret A Manger — all four confirmed directly from
 * their own detail pages — plus Burger King, %Arabica, Blue Bottle
 * Coffee, Popeyes, Jollibee, Luckin Coffee, GODIVA, Duddell's, PUTIEN,
 * Chagee); left blank for Hong Kong-only/regional concepts rather than
 * guessed. `cuisine` is a short, non-fabricated description based on each
 * brand's well-known concept plus the site's own category tags, not
 * scraped text (the site provides no cuisine description field). `level`
 * is taken from the "(Lx)" suffix in each location string where present.
 *
 * This resolves to 71 terminal-scoped venue docs (57 in Terminal 1, 14 in
 * Terminal 2) holding 81 total outlets (67 in Terminal 1, 14 in Terminal
 * 2 — T2 has no multi-outlet brands of its own yet, only McDonald's own
 * single T2 outlet).
 *
 * HKG does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'hkg' first, then 'hongkong', using whichever has existing
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
 *   node add_hkg_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['hkg', 'hongkong'];
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

// ─── Terminal 1 venues ────────────────────────────────────────────────────

const terminal1Venues = {
  two_cafe: restaurant({
    name: '2 Cafe', cuisine: 'Chinese / HK-style Coffee Shop', amenity: 'cafe', vegetarian: false,
    outlets: [o('8', 'Near Check-in Aisle F, Departures Level (L8)', 'landside', '05:00 - 23:00')],
  }),
  a1_bakery_express: restaurant({
    name: 'A-1 Bakery Express', cuisine: 'Japanese Bakery', amenity: 'cafe',
    website: 'a-1bakery.com.hk', logoUrl: logo('a-1bakery.com.hk'),
    outlets: [
      o('7', 'End of Check-in Aisle E, Departure Level (L7)', 'landside', '07:00 - 23:00'),
      o('6', 'Near Gate 201-230, Departures Level (L6), Midfield Concourse', 'airside', '07:00 - 23:00', false),
    ],
  }),
  ajisen_ramen_t1: restaurant({
    name: 'Ajisen Ramen', cuisine: 'Japanese Ramen', amenity: 'restaurant', vegetarian: true,
    outlets: [o('6', 'Near Gate 201-230, Departures Level (L6), Midfield Concourse', 'airside', '06:00 - 23:00 (last order: 22:30 hrs)')],
  }),
  arabica: restaurant({
    name: '%Arabica', cuisine: 'Specialty Coffee', amenity: 'cafe',
    website: 'arabica.coffee', logoUrl: logo('arabica.coffee'),
    outlets: [o('6', 'Near Gate 10, Departures Level (L6)', 'airside', '00:00 - 24:00', true)],
  }),
  bari_uma: restaurant({
    name: 'Bari-Uma (霸嗎拉麵)', cuisine: 'Japanese Ramen', amenity: 'restaurant',
    outlets: [o('7', 'Food Court after Departures (South), Departures Level (L7)', 'airside', '00:00 - 24:00', true)],
  }),
  blue_bottle_coffee: restaurant({
    name: 'Blue Bottle Coffee', cuisine: 'Specialty Coffee', amenity: 'cafe',
    website: 'bluebottlecoffee.com', logoUrl: logo('bluebottlecoffee.com'),
    outlets: [o('7', 'After Departures (South), Departures Level (L7)', 'airside', '07:00 - 23:00')],
  }),
  burger_king: restaurant({
    name: 'Burger King', cuisine: 'Fast Food / Burgers', amenity: 'restaurant',
    website: 'burgerking.com.hk', logoUrl: logo('burgerking.com.hk'),
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '06:30 - 23:00 (Last order: 22:30)')],
  }),
  can_teen: restaurant({
    name: 'can.teen', cuisine: 'Chinese / HK-style Coffee Shop', amenity: 'restaurant',
    outlets: [o('7', 'End of Check-in Aisle F, Departures Level (L7)', 'landside', '05:30 - 23:00')],
  }),
  chagee: restaurant({
    name: 'Chagee', cuisine: 'Tea / Bubble Tea', amenity: 'cafe',
    website: 'chagee.com', logoUrl: logo('chagee.com'),
    outlets: [o('6', 'Near Gate 30, Departures Level (L6)', 'airside', '07:00 - 23:00')],
  }),
  chi_cha_san_chen: restaurant({
    name: 'Chi Cha San Chen', cuisine: 'Taiwanese Bubble Tea', amenity: 'cafe',
    outlets: [o('6', 'Near Gate 11, Departures Level (L6)', 'airside', '07:00 - 23:00')],
  }),
  crystal_jade: restaurant({
    name: 'Crystal Jade La Mian Xiao Long Bao', cuisine: 'Chinese / Shanghainese', amenity: 'restaurant', vegetarian: true,
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', '07:00 - 23:30')],
  }),
  duddells: restaurant({
    name: "Duddell's", cuisine: 'Cantonese', amenity: 'restaurant', vegetarian: true,
    website: 'duddells.co', logoUrl: logo('duddells.co'),
    outlets: [o('7', 'Food Court after Departures (South), Departures Level (L7)', 'airside', '00:00 - 24:00', true)],
  }),
  emmer_pizza: restaurant({
    name: 'Emmer Pizza, Bar & Cafe', cuisine: 'Italian / Pizza', amenity: 'restaurant', vegetarian: true,
    outlets: [o('7', 'After Departures (North), Departures Level (L7)', 'airside', '07:00 - 01:30')],
  }),
  fineprint: restaurant({
    name: 'FINEPRINT', cuisine: 'Western / Coffee', amenity: 'cafe',
    outlets: [o('5', 'Level 5, Arrivals M&G Hall, T1', 'landside', '06:00 – 23:00')],
  }),
  gelato_combo: restaurant({
    name: 'GELATO COMBO', cuisine: 'Dessert / Gelato', amenity: 'cafe',
    outlets: [o('6', 'Near Gate 28, Departures Level (L6)', 'airside', '07:00 - 23:00')],
  }),
  godiva_cafe: restaurant({
    name: 'GODIVA Café', cuisine: 'Dessert / Chocolate', amenity: 'cafe', vegetarian: true,
    website: 'godiva.com', logoUrl: logo('godiva.com'),
    outlets: [o('7', 'End of Check-in Aisle K, Departures Level (L7)', 'landside', '07:00 – 24:00', true)],
  }),
  gordon_ramsay_plane_food: restaurant({
    name: 'Gordon Ramsay Plane Food To Go', cuisine: 'Western / Grab-and-go', amenity: 'restaurant', vegetarian: true,
    outlets: [o('7', 'Food Court after Departures (South), Departures Level (L7)', 'airside', '00:00 - 24:00', true)],
  }),
  gourmet_focus_group: restaurant({
    name: 'Gourmet Focus Group', cuisine: 'Asian', amenity: 'restaurant',
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '07:00 - 23:00 (Last order: 22:30)')],
  }),
  hana_musubi: restaurant({
    name: 'hana-musubi', cuisine: 'Japanese Onigiri', amenity: 'restaurant',
    outlets: [o('5', 'Level 5, Arrivals M&G Hall, T1', 'landside', '07:00 - 23:00')],
  }),
  ho_hung_kee: restaurant({
    name: 'Ho Hung Kee', cuisine: 'Cantonese Noodles', amenity: 'restaurant',
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', '07:00 - 23:30')],
  }),
  hungs_delicacies: restaurant({
    name: "Hung's Delicacies", cuisine: 'Chinese', amenity: 'restaurant',
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', '00:00 - 24:00', true)],
  }),
  hung_fook_tong: restaurant({
    name: 'HUNG FOOK TONG', cuisine: 'Dessert / Herbal Tea', amenity: 'cafe', vegetarian: true,
    outlets: [o('7', 'End of Check-in Aisle F, Departures Level (L7)', 'landside', '00:00 - 24:00', true)],
  }),
  intervals_sky_bar: restaurant({
    name: 'INTERVALS Sky Bar & Restaurant', cuisine: 'Western / Bar', amenity: 'bar',
    outlets: [o('9', 'Departures Level (L9), Sky Bridge', 'airside', '07:00 - 02:00')],
  }),
  jardin_de_jade: restaurant({
    name: 'Jardin de Jade', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [o('7', 'After Departures (North), Departures Level (L7)', 'airside', '07:00 - 23:30 (23:00 last order)')],
  }),
  king_bakery: restaurant({
    name: 'KING BAKERY', cuisine: 'Bakery', amenity: 'cafe', vegetarian: true,
    outlets: [o('6', 'Near Gate 28, Departures Level (L6)', 'airside', '06:00 - 00:00')],
  }),
  konjiki_hototogisu: restaurant({
    name: 'Konjiki Hototogisu', cuisine: 'Japanese Ramen', amenity: 'restaurant',
    outlets: [o('5', 'Level 5, Arrival M&G Hall, T1', 'landside', '07:00 - 23:00')],
  }),
  lady_m: restaurant({
    name: 'Lady M New York', cuisine: 'Dessert / Mille Crepe Cake', amenity: 'cafe', vegetarian: true,
    website: 'ladym.com', logoUrl: logo('ladym.com'),
    outlets: [o('7', 'After Departures (South), Departures Level (L7)', 'airside', '07:00 - 23:00')],
  }),
  lime_garden_sky: restaurant({
    name: 'Lime Garden (Sky)+', cuisine: 'Asian', amenity: 'restaurant',
    outlets: [o('8', 'Near Check-in Aisle F, Departures Level (L8)', 'landside', '06:30 - 00:30')],
  }),
  lin_heung_lau: restaurant({
    name: 'Lin Heung Lau', cuisine: 'Cantonese Dim Sum', amenity: 'restaurant',
    outlets: [o('8', 'Near Check-in Aisle F, Departures Level (L8)', 'landside', '00:00 - 24:00', true)],
  }),
  master_hung: restaurant({
    name: 'Master Hung', cuisine: 'Chinese Fast Food', amenity: 'restaurant',
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '07:00 - 21:00 (Last order: 20:30)')],
  }),
  mcdonalds_t1: restaurant({
    name: "McDonald's® & McCafé®", cuisine: 'Fast Food', amenity: 'restaurant', vegetarian: true,
    website: 'mcdonalds.com.hk', logoUrl: logo('mcdonalds.com.hk'),
    outlets: [
      o('8', 'Near Check-in Aisle F, Departures Level (L8)', 'landside', '00:00 - 24:00', true),
      o('6', 'Near Gate 11, Departures Level (L6)', 'airside', '00:00 - 24:00', true),
    ],
  }),
  men_wah_bing_teng: restaurant({
    name: 'Men Wah Bing Teng', cuisine: 'Chinese / HK-style Coffee Shop', amenity: 'restaurant',
    outlets: [o('6', 'Near Gate 11, Departures Level (L6)', 'airside', '00:00 - 24:00', true)],
  }),
  moon_thai_express: restaurant({
    name: 'Moon Thai Express', cuisine: 'Thai', amenity: 'restaurant',
    outlets: [o('7', 'Food Court after Departures (North), Departures Level (L7)', 'airside', '00:00 - 24:00', true)],
  }),
  nippon_ramen: restaurant({
    name: 'Nippon Ramen', cuisine: 'Japanese Ramen', amenity: 'restaurant',
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '07:00 - 23:00 (Last order: 22:30)')],
  }),
  nodi: restaurant({
    name: 'nodi', cuisine: 'Western Café', amenity: 'cafe',
    outlets: [o('6', 'Near Gate 214, Departures Level (L6), Midfield Concourse', 'airside', '07:00 – 23:00')],
  }),
  nodi_moleskine: restaurant({
    name: 'nodi | Moleskine', cuisine: 'Western Café', amenity: 'cafe',
    description: 'A distinctly-named co-branded nodi × Moleskine concept card, published by the site separately from the plain "nodi" listing (different name, different gate) rather than as a second outlet of the same listing.',
    outlets: [o('6', 'Near Gate 60, Departure Level (L6)', 'airside', '07:00 – 23:00')],
  }),
  nuttea: restaurant({
    name: 'NUTTEA', cuisine: 'Tea / Bubble Tea', amenity: 'cafe',
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', '07:00 - 23:00')],
  }),
  oldtown_white_coffee: restaurant({
    name: 'OldTown White Coffee', cuisine: 'Malaysian / Halal Coffee Shop', amenity: 'restaurant', halal: true, vegetarian: true,
    website: 'oldtownwhitecoffee.com', logoUrl: logo('oldtownwhitecoffee.com'),
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '07:00 - 23:00 (Last order: 22:30)')],
  }),
  one_minute_gourmet: restaurant({
    name: 'One Minute Gourmet', cuisine: 'Grab-and-go', amenity: 'restaurant', vegetarian: true,
    description: 'A brand created specifically for Hong Kong International Airport for time-constrained travellers, per the site’s own description.',
    outlets: [
      o('6', 'Food Court near Gate 40, Departures Level (L6)', 'airside', '06:00 - 23:00 (Last order: 22:30)'),
      o('6', 'Food Court near Gate 60, Departures Level (L6)', 'airside', '06:00 - 23:00 (Last order: 22:30)'),
    ],
    phone: '+852 2167 8771',
  }),
  popeyes: restaurant({
    name: 'Popeyes Louisiana Kitchen', cuisine: 'Fast Food / Fried Chicken', amenity: 'restaurant', vegetarian: true,
    website: 'popeyes.com', logoUrl: logo('popeyes.com'),
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '07:00 - 21:00 (Last order: 20:30)')],
  }),
  pret_a_manger: restaurant({
    name: 'PRET A MANGER', cuisine: 'Sandwiches / Salads / Coffee', amenity: 'cafe', vegetarian: true, glutenFree: true,
    website: 'pret.hk', logoUrl: logo('pret.hk'),
    outlets: [
      o('6', 'Near Gate 6, Departures Level (L6)', 'airside', '06:00 - 23:30', false),
      o('6', 'Near Gate 25, Departures Level (L6)', 'airside', '06:00 - 23:30', false),
      o('5', 'Arrivals Hall A, Arrivals Level (L5)', 'landside', '06:30 - 23:00', false),
    ],
    phone: '+852 2523 1772',
  }),
  putien: restaurant({
    name: 'PUTIEN', cuisine: 'Fujian Chinese', amenity: 'restaurant',
    website: 'putien.com', logoUrl: logo('putien.com'),
    outlets: [o('7', 'Food Court after Departures (North), Departures Level (L7)', 'airside', '00:00 - 24:00', true)],
  }),
  ritazza: restaurant({
    name: 'Ritazza', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [o('6', 'Near Gate 40, Departures Level (L6)', 'airside', '06:00 - 21:00 (Last order: 20:30)')],
  }),
  ryu: restaurant({
    name: 'RYU竜', cuisine: 'Japanese', amenity: 'restaurant',
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', 'Mon-Thu: 07:00-24:00, Fri-Sun: 07:00-01:00')],
  }),
  saffron: restaurant({
    name: 'SAFFRON', cuisine: 'Dessert / Halal', amenity: 'cafe', halal: true, vegetarian: true,
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', '06:00 - 00:00')],
  }),
  sinsaeat_korean_kitchen: restaurant({
    name: 'SinsaEat Korean Kitchen', cuisine: 'Korean', amenity: 'restaurant',
    outlets: [o('7', 'Food Court after Departures (South), Departures Level (L7)', 'airside', '00:00 - 24:00', true)],
  }),
  sleep_well_eat_more: restaurant({
    name: 'Sleep Well Eat More', cuisine: 'Dessert', amenity: 'cafe',
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', '07:00 - 23:00')],
  }),
  starbucks: restaurant({
    name: 'STARBUCKS', cuisine: 'Coffee', amenity: 'cafe', vegetarian: true, glutenFree: true,
    website: 'starbucks.com.hk', logoUrl: logo('starbucks.com.hk'),
    outlets: [
      o('5', 'Near Gate 13-21, Departures Level (L5), T1 Satellite Concourse', 'airside', '06:30 - 23:00'),
      o('7', 'End of Check-in Aisle E, Departure Level (L7)', 'landside', '05:30 - 23:00'),
      o('6', 'Level 6, Departures West Hall, T1', 'airside', '07:00 - 23:00'),
      o('6', 'Near Gate 44, Departures Level (L6)', 'airside', '06:00 - 23:00'),
      o('6', 'Near Gate 206, Departures Level (L6), Midfield Concourse', 'airside', '06:00 - 24:00', true),
      o('6', 'Near Gate 6, Departures Level (L6)', 'airside', '06:00 - 23:00'),
    ],
  }),
  super_super_congee: restaurant({
    name: 'Super Super Congee and Noodles', cuisine: 'Cantonese Congee & Noodles', amenity: 'restaurant', vegetarian: true,
    outlets: [o('5', 'Near Transfer Desk E2, Arrivals Level (L5)', 'airside', '06:00 - 23:00',
      false)],
    description: 'Located "Near Transfer Desk E2, Arrivals Level (L5)" — a transfer-passenger area, which is airside per the site’s own Restricted Area filter tag despite being on the Arrivals level.',
  }),
  sushi_sake_bar_taka: restaurant({
    name: 'Sushi & Sake Bar Taka', cuisine: 'Japanese Sushi', amenity: 'restaurant',
    outlets: [o('7', 'Food Court after Departures (South), Departures Level (L7)', 'airside', '06:00 - 20:30')],
  }),
  take_eat_easy: restaurant({
    name: 'Take Eat Easy', cuisine: 'Chinese Grab-and-go', amenity: 'restaurant',
    outlets: [o('6', 'Near Gate 201-230, Departures Level (L6), Midfield Concourse', 'airside', '05:30 - 23:00')],
  }),
  tap_brew: restaurant({
    name: 'Tap + Brew', cuisine: 'Western / Craft Beer Bar', amenity: 'bar',
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '12:00 - 23:00 (Last order: 22:30)')],
  }),
  tasty_congee: restaurant({
    name: 'Tasty Congee & Noodle Wantun Shop', cuisine: 'Cantonese Congee & Noodles', amenity: 'restaurant',
    outlets: [o('7', 'Food Court after Departures (North), Departures Level (L7)', 'airside', '00:00 - 24:00', true)],
  }),
  the_alchemist_cafe: restaurant({
    name: 'THE ALCHEMIST CAFE', cuisine: 'Western Café', amenity: 'cafe',
    outlets: [o('5', 'Arrivals Hall, Arrivals Level (L5)', 'landside', '06:00 - 24:00 (Last order 23:00)')],
  }),
  the_forest_bakery: restaurant({
    name: 'The Forest Bakery', cuisine: 'Bakery', amenity: 'cafe',
    outlets: [o('7', 'After Departures (North), Departures Level (L7)', 'airside', '07:00 - 23:00')],
  }),
  urban_coffee_roaster: restaurant({
    name: 'Urban Coffee Roaster', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [o('6', 'Near Gate 40, Departures Level (L6)', 'airside', '06:00 - 23:00')],
  }),
  yung_kee: restaurant({
    name: 'Yung Kee', cuisine: 'Cantonese Roast Goose', amenity: 'restaurant', vegetarian: true,
    website: 'yungkee.com.hk', logoUrl: logo('yungkee.com.hk'),
    outlets: [o('6', 'Food Court near Gate 40-80, Departures Level (L6)', 'airside', '12:00 - 22:00 (Last order: 21:15)')],
  }),
};

// ─── Terminal 2 venues ────────────────────────────────────────────────────
// T2 is landside-only as of this research pass (see header note) — every
// outlet below is `landside`.

const terminal2Venues = {
  cupping_room_coffee_roasters: restaurant({
    name: 'Cupping Room Coffee Roasters', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '06:00 – 23:00')],
  }),
  ho_fan_ho_sung: restaurant({
    name: 'Ho Fan Ho Sung', cuisine: 'Chinese', amenity: 'restaurant',
    outlets: [o('3', 'Coach Hall, Arrivals Level (L3)', 'landside', '07:00 - 23:00')],
  }),
  jollibee_t2: restaurant({
    name: 'Jollibee', cuisine: 'Filipino Fast Food', amenity: 'restaurant',
    website: 'jollibee.com.hk', logoUrl: logo('jollibee.com.hk'),
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '00:00 - 24:00', true)],
  }),
  joy_full_house: restaurant({
    name: 'Joy Full House', cuisine: 'Dessert / Western', amenity: 'cafe',
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '00:00 - 24:00', true)],
  }),
  luckin_coffee: restaurant({
    name: 'Luckin Coffee', cuisine: 'Coffee', amenity: 'cafe',
    website: 'luckincoffee.com', logoUrl: logo('luckincoffee.com'),
    outlets: [o('3', 'Coach Hall, Arrivals Level (L3)', 'landside', '07:00 - 23:00')],
  }),
  mcdonalds_t2: restaurant({
    name: "McDonald's® & McCafé®", cuisine: 'Fast Food', amenity: 'restaurant', vegetarian: true,
    website: 'mcdonalds.com.hk', logoUrl: logo('mcdonalds.com.hk'),
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '00:00 - 24:00', true)],
  }),
  milk_cafe: restaurant({
    name: 'Milk Cafe', cuisine: 'Chinese / HK-style Coffee Shop', amenity: 'cafe', vegetarian: true,
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '00:00 - 24:00', true)],
  }),
  nap_tea: restaurant({
    name: 'Nap Tea', cuisine: 'Dessert / Tea', amenity: 'cafe',
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '06:00 – 23:00')],
  }),
  orchid_padaria: restaurant({
    name: 'Orchid Padaria Café Express', cuisine: 'Chinese Bakery / Fast Food', amenity: 'cafe',
    outlets: [o('3', 'Coach Hall, Arrivals Level (L3)', 'landside', '07:00-23:00')],
  }),
  sang_roastery: restaurant({
    name: 'Sang Roastery', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '06:00 - 23:00')],
  }),
  tamjai_samgor_mixian: restaurant({
    name: 'Tamjai SamGor Mixian', cuisine: 'Chinese / Rice Noodles', amenity: 'restaurant', vegetarian: true,
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '06:00 – 23:00')],
  }),
  tong_kee_bao_dim: restaurant({
    name: 'Tong Kee Bao Dim', cuisine: 'Bakery / Chinese / Fast Food', amenity: 'cafe',
    outlets: [o('3', 'Coach Hall, Arrivals Level (L3)', 'landside', '07:00 - 23:00')],
  }),
  ufufu_cafe: restaurant({
    name: 'Ufufu Cafe', cuisine: 'Dessert / Western', amenity: 'cafe',
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '00:00 - 24:00', true)],
  }),
  yukimura: restaurant({
    name: 'Yukimura', cuisine: 'Japanese', amenity: 'restaurant',
    outlets: [o('7', 'Food Hub before Departures, Departures Level (L7)', 'landside', '00:00 - 24:00', true)],
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
