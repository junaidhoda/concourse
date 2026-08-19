'use strict';
/**
 * Fills in complete data for Kuala Lumpur International Airport (KLIA/KUL) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-16 from the
 * official site, airports.malaysiaairports.com.my, Shop & Dine > Dine, for
 * both klia1 (/en/klia1/shop-dine-services/dine/<category>) and klia2
 * (/en/klia2/shop-dine-services/dine/<category>), using Claude in Chrome
 * browser automation per explicit user instruction (WebFetch cannot render
 * this site at all — see METHODOLOGY).
 *
 * METHODOLOGY: this is the first airport in this dataset with NO backing
 * JSON API and NO server-rendered HTML. Confirmed via: `fetch()` on a
 * listing URL returns HTML missing the venue names entirely; `window
 * .__NEXT_DATA__`/`__NUXT__` are both absent; `window.__next_f` (Next.js RSC
 * stream chunks) does not contain venue names; no `<script>` tag's raw text
 * contains them either — they only exist in the live, client-hydrated DOM
 * (confirmed present in `document.documentElement.outerHTML` only after a
 * real browser render). So every one of the 24 category×zone×terminal
 * combinations (6 dine categories — Bars, Cafes, Fast Food, Food Courts,
 * Grab & Go, Restaurants — × 2 zones × 2 terminals) was extracted by real
 * navigation + a DOM-scrape of the rendered grid, filtering for cards whose
 * text contains the literal "Category" label (a generic `.grid.grid-cols-1`
 * selector otherwise false-positive-matches the page footer's nav grid on
 * genuinely-empty category pages) and clicking any "Load More" button in a
 * loop until it disappears (klia1 Cafes/Passenger needed 2 clicks to go from
 * 12 to its full 14 items, for example). A handful of page loads hit a
 * transient `Application error` (digest 4227878168) that cleared on a
 * simple re-navigation to the same URL — not a real empty-result signal,
 * confirmed by cross-checking against the unfiltered category counts.
 *
 * ZONE FIELD (airside/landside): the site itself exposes an authoritative
 * `Zone: Public / Passenger` filter on every listing page — `zone=public`
 * is landside (before security), `zone=passenger` is airside (after
 * security) — so, like KIX's before/after-security field, no text-based
 * inference was needed.
 *
 * TERMINAL STRUCTURE: KLIA has exactly two buildings that pass this
 * dataset's "own check-in AND own security" test. Terminal 1 (klia1) is
 * the original main terminal — Main Terminal Building (own check-in, own
 * security) plus the Contact Pier (Domestic CPD + International CPI,
 * directly connected, no separate check-in/security of its own) plus the
 * Satellite Building (Mezzanine SAT-M + Passenger-level SAT-P, reached via
 * the Aerotrain from MTB Level 5 after check-in/security, no check-in or
 * security of its own) — confirmed via klia2.info/klia/klia-layout-plan/.
 * All of it is folded into one `terminal_1` bucket. klia2 (Terminal 2) is a
 * genuinely separate building — its own check-in halls, its own security
 * screening, connected to Terminal 1 only by a 7–9 minute shuttle bus
 * (confirmed via klia2.info) — so it is modelled as `terminal_2`. klia2
 * itself further comprises a Main Terminal Building (S2, Departure Hall
 * Level 3 / Arrival Hall Level 2 Public Concourse) plus Piers J/K (S1/S3,
 * domestic/international gate piers directly connected, no Skybridge or own
 * check-in), Pier L (S4, stacked above Pier K, reached only after
 * immigration/security) and a Satellite Building (S6, International
 * Departure Level, reached via a 300m Skybridge from the MTB, no check-in
 * of its own) — none of these pass the check-in/security test on their own,
 * so all of klia2's location-code families (S1–S7) are folded into the one
 * `terminal_2` bucket. Gateway@klia2 Mall — a separate landside retail mall
 * next to klia2's MTB — is NOT included: none of its shops appeared in the
 * official Shop & Dine listing data pulled from the six dine categories
 * above, so rather than fabricate its contents it is left out of scope.
 *
 * LOCATION-CODE PREFIXES (from the site's own lot codes, decoded from
 * context where possible, presented verbatim where not): `MTB` = Main
 * Terminal Building (T1); `SAT-M`/`SAT-P` = Satellite Building Mezzanine /
 * Passenger level (T1); `CPI`/`CPD` = Contact Pier International/Domestic
 * (T1); `VD` = an undecoded prefix seen only on T1's KFC (VD-5-L02) and
 * McDonald's (VD-5-L01) — presented verbatim rather than guessed; `S2` =
 * klia2 MTB; `S1`/`S3` = klia2 Piers J/K; `S4` = klia2 Pier L; `S5`/`S7` =
 * klia2 Piers P/Q; `S6` = klia2 Satellite Building International Departure
 * level.
 *
 * CROSS-CATEGORY / CROSS-LOT DEDUPLICATION: the site tags many venues under
 * more than one dine category, so the same physical unit often appears
 * twice in the raw per-category listings — confirmed to be the same unit
 * whenever both listings share an identical lot code (e.g. Flight Club at
 * CPI-4-A04 under both Cafes and Restaurants; Jamie Oliver Pizzeria at
 * MTB-5-L33 under both Grab & Go and Restaurants; Boost Juice/"Boost Juice
 * Bar" at SAT-M-A13 under both Cafes and Grab & Go) — these were merged
 * into one doc with one outlet. Where the SAME brand appears at DIFFERENT
 * lot codes within the same terminal, each lot became a separate `outlets[]`
 * entry on one doc: O'Briens (T1: SAT-P-A51 + MTB-5-L11), Starbucks (T1:
 * CPI-4-A03 + SAT-M-A20; T2: S2-2-IC04 + S2-3-L01), Hard Rock Cafe (T1:
 * SAT-M-A16 bar + SAT-M-A03/A21 restaurant), Gloria Jeans (T1: MTB-3-L21 +
 * CPD-3-A08 + CPI-4-A07), Burger King (T1: MTB-4-L01 + CPD-3-A04 + SAT-M-A08;
 * T2: S2-3-L04 + S1-1a-A10 + S3-2-A08), Dunkin Donuts (T1: CPD-3-A05 +
 * CPI-4-A05), Nooodles (T1: MTB-5-L27, listed as "Noooodle" on that page +
 * SAT-M-A01, listed as "Nooodles" with a real description — reconciled as
 * one brand, spelling taken as printed on each listing), Old Town White
 * Coffee (T2: S2-3-L05 + S1-1a-A01 + S3-2-A10 + S3-1a-A17), Cafe Espresso
 * (T2: S5-1a-A06 + S7-1a-A10/A11/A12), The Coffee Bean & Tea Leaf (T2:
 * S1-1a-A02, listed as "Coffee Bean & Tea Leaf" + S3-2-A09 + S3-1a-A07),
 * Tealive (T2: S2-3-L02a, listed as "TEALIVE" + S7-1a-A08), and Ahh Yum
 * (T2: S2-3-L41, listed as "AHH YUM" + S5-1a-A03 + S7-1a-A07). Same-brand
 * venues in DIFFERENT terminals were kept as separate docs per this
 * dataset's standing rule (e.g. Nooodles/T1 vs Nooodles/T2, Costa Coffee/T1
 * vs Costa Coffee/T2, ORIENTAL KOPI/T1 vs ORIENTAL KOPI/T2, Burger King and
 * McDonald's each appear once per terminal as their own doc). Distinctly
 * NAMED venues sharing a parent brand were kept separate per this dataset's
 * page-truth-over-label precedent even where they sit close together:
 * Flight Club vs Flight Club Signature (T1), Old Town White Coffee vs Old
 * Town White Coffee X BDC CIMB (T2, a distinctly co-branded outlet), Din Tai
 * Fung (T1) vs Din by Din Tai Fung (T2, a distinctly named sub-concept).
 *
 * DATA ANOMALY (presented verbatim, not corrected by guesswork): the site
 * lists two unrelated venues at the identical lot code MTB-5-L33 — Taco
 * Bell (Fast Food category) and Jamie Oliver Pizzeria (Grab & Go +
 * Restaurants categories, itself a same-lot cross-category merge) — and
 * likewise lists Kyochon at "MTB-5-L24 & L25" while ORIENTAL KOPI/T1 is
 * separately listed at "MTB-5-L24" alone. No detail page exists on this
 * site to resolve whether this is a real shared/subdivided unit or a site
 * data-entry duplication, so both venues are kept as their own docs with
 * their lot codes exactly as published, rather than merged or corrected.
 * Flight Club/T1's Cafes-category listing also labelled its building as
 * "CONTACT PIER DOMESTIC" while its Restaurants-category listing (same lot,
 * CPI-4-A04) correctly labelled it "CONTACT PIER INTERNATIONAL" — the CPI
 * lot-code prefix and the majority listing were trusted over the one
 * mislabeled row.
 *
 * CUISINE/AMENITY: mapped from the site's own category tag(s) — Restaurants
 * → restaurant, Cafes → cafe, Bars → bar, Fast Food → fast_food, Food
 * Courts → food_court, Grab & Go → fast_food by default with cafe/bakery
 * overrides for coffee/donut/bakery-style brands (e.g. Krispy Kreme, The
 * Dough → bakery). Where a venue carries two different category tags across
 * its merged listings, the more specific/operational one was chosen (e.g.
 * Hard Rock Cafe → bar; Jamie Oliver Pizzeria → fast_food; Flight Club →
 * restaurant, a bar/social-entertainment concept).
 *
 * WEBSITE: only set for globally/regionally recognizable chains whose
 * primary domain is confidently known (Starbucks, Burger King, KFC,
 * McDonald's, Subway, Dunkin Donuts, Krispy Kreme, Old Town White Coffee,
 * Coffee Bean & Tea Leaf, Costa Coffee, Jollibee, Taco Bell, %Arabica,
 * illy, Yakun Kaya Toast, Kyochon, 4Fingers, Din Tai Fung, Gloria Jeans,
 * Boost Juice, ZUS Coffee, Kopi Kenangan, The Loaf) — left blank for
 * independent/local concepts this session has no verified domain for,
 * rather than guessed.
 *
 * DATA GAPS (left blank rather than guessed): this site's category-listing
 * cards expose only name, category tag(s), and location — there are no
 * per-shop detail pages on this site at all (confirmed: clicking directly
 * on a venue's name or its logo/image never navigates anywhere, only
 * highlights on hover), so `description` is populated only for the small
 * minority of venues whose card itself included inline description text
 * (Food Garden, Dunkin Donuts/CPD-3-A05, Nooodles/SAT-M-A01); every other
 * venue's `description` is left blank. No opening hours or phone numbers
 * are published anywhere on this site, so those fields are left blank for
 * every venue in this file.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['kul', 'kuala-lumpur', 'klia'];
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

// ─── Terminal 1 venues (KLIA Main Terminal Building + Contact Pier + Satellite Building) ────────

const terminal1Venues = {
  arabica: restaurant({
    name: 'ARABICA', cuisine: 'Cafe (Specialty Coffee)', amenity: 'cafe',
    website: 'arabica.coffee', logoUrl: logo('arabica.coffee'),
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A15', 'airside', '')],
  }),
  boost_juice: restaurant({
    name: 'Boost Juice', cuisine: 'Juice Bar', amenity: 'cafe',
    website: 'boostjuice.com.au', logoUrl: logo('boostjuice.com.au'),
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A13', 'airside', '')],
  }),
  cbtl: restaurant({
    name: 'CBTL', cuisine: 'Cafe (The Coffee Bean & Tea Leaf)', amenity: 'cafe',
    website: 'coffeebean.com', logoUrl: logo('coffeebean.com'),
    outlets: [o('Passenger', 'Satellite Building Passenger, SAT-P-A50', 'airside', '')],
  }),
  flight_club: restaurant({
    name: 'Flight Club', cuisine: 'Bar & Restaurant', amenity: 'restaurant',
    outlets: [o('4', 'Contact Pier International, CPI-4-A04', 'airside', '')],
  }),
  illy_cafe: restaurant({
    name: 'Illy Cafe', cuisine: 'Cafe', amenity: 'cafe',
    website: 'illy.com', logoUrl: logo('illy.com'),
    outlets: [o('Passenger', 'Satellite Building Passenger, SAT-P-A52', 'airside', '')],
  }),
  obriens: restaurant({
    name: "O'Briens", cuisine: 'Cafe / Sandwich Bar', amenity: 'cafe',
    outlets: [
      o('Passenger', 'Satellite Building Passenger, SAT-P-A51', 'airside', ''),
      o('5', 'Main Terminal Building, MTB-5-L11', 'landside', ''),
    ],
  }),
  paul_le_cafe: restaurant({
    name: 'Paul Le Cafe', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A17', 'airside', '')],
  }),
  sense_of_malaysia_kueh_kita: restaurant({
    name: 'Sense of Malaysia - Kueh Kita', cuisine: 'Cafe (Malaysian Kueh)', amenity: 'cafe',
    outlets: [o('Passenger', 'Satellite Building Passenger, SAT-P-A11', 'airside', '')],
  }),
  singgah: restaurant({
    name: 'Singgah', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('3', 'Contact Pier Domestic, CPD-3-A01', 'airside', '')],
  }),
  starbucks_t1: restaurant({
    name: 'Starbucks', cuisine: 'Cafe', amenity: 'cafe',
    website: 'starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [
      o('4', 'Contact Pier International, CPI-4-A03', 'airside', ''),
      o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A20', 'airside', ''),
    ],
  }),
  the_loaf: restaurant({
    name: 'The Loaf', cuisine: 'Bakery / Cafe', amenity: 'bakery',
    website: 'theloaf.com.my', logoUrl: logo('theloaf.com.my'),
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A11', 'airside', '')],
  }),
  zus_coffee_t1: restaurant({
    name: 'ZUS Coffee', cuisine: 'Cafe', amenity: 'cafe',
    website: 'zuscoffee.com', logoUrl: logo('zuscoffee.com'),
    outlets: [o('3', 'Contact Pier Domestic, CPD-3-A06', 'airside', '')],
  }),
  hard_rock_cafe_t1: restaurant({
    name: 'Hard Rock Cafe', cuisine: 'American / Bar & Grill', amenity: 'bar',
    website: 'hardrockcafe.com', logoUrl: logo('hardrockcafe.com'),
    outlets: [
      o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A16', 'airside', ''),
      o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A03 & A21', 'airside', ''),
    ],
  }),
  abc_kitchen: restaurant({
    name: 'ABC Kitchen', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('1', 'Main Terminal Building, MTB-1-L01', 'landside', '')],
  }),
  costa_coffee_t1: restaurant({
    name: 'Costa Coffee', cuisine: 'Cafe', amenity: 'cafe',
    website: 'costacoffee.com', logoUrl: logo('costacoffee.com'),
    outlets: [o('5', 'Main Terminal Building, MTB-5-L01 & MTB-5-L02', 'landside', '')],
  }),
  gloria_jeans_t1: restaurant({
    name: 'Gloria Jeans', cuisine: 'Cafe', amenity: 'cafe',
    website: 'gloriajeanscoffees.com', logoUrl: logo('gloriajeanscoffees.com'),
    outlets: [
      o('3', 'Main Terminal Building, MTB-3-L21', 'landside', ''),
      o('3', 'Contact Pier Domestic, CPD-3-A08', 'airside', ''),
      o('4', 'Contact Pier International, CPI-4-A07', 'airside', ''),
    ],
  }),
  the_coffee_beans: restaurant({
    name: 'The Coffee Beans', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('3', 'Main Terminal Building, MTB-3-L12', 'landside', '')],
  }),
  fourfingers: restaurant({
    name: '4Fingers', cuisine: 'Fast Food (Fried Chicken)', amenity: 'fast_food',
    website: '4fingers.com.sg', logoUrl: logo('4fingers.com.sg'),
    outlets: [o('3', 'Main Terminal Building, MTB-3-L13', 'landside', '')],
  }),
  burger_king_t1: restaurant({
    name: 'Burger King', cuisine: 'Fast Food', amenity: 'fast_food',
    website: 'burgerking.com', logoUrl: logo('burgerking.com'),
    outlets: [
      o('4', 'Main Terminal Building, MTB-4-L01', 'landside', ''),
      o('3', 'Contact Pier Domestic, CPD-3-A04', 'airside', ''),
      o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A08', 'airside', ''),
    ],
  }),
  kfc_t1: restaurant({
    name: 'KFC', cuisine: 'Fast Food', amenity: 'fast_food',
    website: 'kfc.com', logoUrl: logo('kfc.com'),
    outlets: [o('5', "Main Terminal Building, VD-5-L02 (site's own lot-code prefix, undecoded)", 'landside', '')],
  }),
  mccafe_t1: restaurant({
    name: 'McCafe', cuisine: 'Cafe', amenity: 'cafe',
    website: 'mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [o('5', 'Main Terminal Building, MTB-5-L29', 'landside', '')],
  }),
  mcdonalds_t1: restaurant({
    name: "McDonald's", cuisine: 'Fast Food', amenity: 'fast_food',
    website: 'mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [o('5', "Main Terminal Building, VD-5-L01 (site's own lot-code prefix, undecoded)", 'landside', '')],
  }),
  taco_bell_t1: restaurant({
    name: 'Taco Bell', cuisine: 'Fast Food (Mexican)', amenity: 'fast_food',
    website: 'tacobell.com', logoUrl: logo('tacobell.com'),
    outlets: [o('5', 'Main Terminal Building, MTB-5-L33 (site also lists Jamie Oliver Pizzeria at this same lot code — see header)', 'landside', '')],
  }),
  jamie_oliver_pizzeria_t1: restaurant({
    name: 'Jamie Oliver Pizzeria', cuisine: 'Fast Food (Pizza)', amenity: 'fast_food',
    outlets: [o('5', 'Main Terminal Building, MTB-5-L33 (site also lists Taco Bell at this same lot code — see header)', 'landside', '')],
  }),
  kitchen_open_house: restaurant({
    name: 'Kitchen Open House', cuisine: 'Restaurant', amenity: 'restaurant',
    outlets: [o('5', 'Main Terminal Building, MTB-5-L32', 'landside', '')],
  }),
  kyochon_t1: restaurant({
    name: 'Kyochon', cuisine: 'Korean (Fried Chicken)', amenity: 'restaurant',
    website: 'kyochon.com', logoUrl: logo('kyochon.com'),
    outlets: [o('5', 'Main Terminal Building, MTB-5-L24 & L25 (adjacent to ORIENTAL KOPI/L24 — see header)', 'landside', '')],
  }),
  nooodles_t1: restaurant({
    name: 'Nooodles', cuisine: 'Malaysian (Noodles)', amenity: 'restaurant',
    description: 'Nooodles offers travellers the experience of flavourful and nourishing noodles that are made fresh daily. With popular choices of noodles such as wonton noodles, beef noodles and Penang curry mee, travellers can enjoy their favourite noodle at this family-oriented restaurant, any time of the day.',
    outlets: [
      o('5', 'Main Terminal Building, MTB-5-L27 (listed as "Noooodle" on this page)', 'landside', ''),
      o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A01', 'airside', ''),
    ],
  }),
  oriental_kopi_t1: restaurant({
    name: 'ORIENTAL KOPI', cuisine: 'Malaysian Kopitiam', amenity: 'restaurant',
    outlets: [o('5', 'Main Terminal Building, MTB-5-L24 (overlaps Kyochon\'s "L24 & L25" — see header)', 'landside', '')],
  }),
  yakun_kaya_toast: restaurant({
    name: 'Yakun Kaya Toast', cuisine: 'Singaporean (Kaya Toast)', amenity: 'restaurant',
    website: 'yakun.com', logoUrl: logo('yakun.com'),
    outlets: [o('5', 'Main Terminal Building, MTB-5-L18', 'landside', '')],
  }),
  chef_wan_petite: restaurant({
    name: 'Chef Wan Petite', cuisine: 'Malaysian', amenity: 'restaurant',
    outlets: [o('5', 'Main Terminal Building, MTB-5-L05', 'landside', '')],
  }),
  din_tai_fung_t1: restaurant({
    name: 'Din Tai Fung', cuisine: 'Taiwanese (Xiao Long Bao)', amenity: 'restaurant',
    website: 'dintaifung.com.tw', logoUrl: logo('dintaifung.com.tw'),
    outlets: [o('5', 'Main Terminal Building, MTB-5-L12', 'landside', '')],
  }),
  food_garden: restaurant({
    name: 'Food Garden', cuisine: 'Malaysian & Southeast Asian', amenity: 'food_court',
    description: "Whether you're a first-time visitor or a Malaysian who misses the taste of home, drop by Food Garden, a one-stop destination for Malaysian and Southeast Asian cuisine at budget-friendly price.",
    outlets: [o('2', 'Main Terminal Building, MTB-2-L03', 'landside', '')],
  }),
  avian_grab_fly: restaurant({
    name: 'Avian Grab & Fly', cuisine: 'Grab & Go', amenity: 'fast_food',
    outlets: [o('5', 'Main Terminal Building, MTB-5-L26', 'landside', '')],
  }),
  cafe_loka_loka: restaurant({
    name: 'CAFE LOKA LOKA', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('3', 'Main Terminal Building, Level 3 Arrival Landside, MTB-3-L02a', 'landside', '')],
  }),
  krispy_kreme_t1: restaurant({
    name: 'Krispy Kreme', cuisine: 'Bakery (Donuts)', amenity: 'bakery',
    website: 'krispykreme.com', logoUrl: logo('krispykreme.com'),
    outlets: [o('5', 'Main Terminal Building, MTB-5-L21', 'landside', '')],
  }),
  snek_and_co_t1: restaurant({
    name: 'Snek & Co', cuisine: 'Grab & Go Snacks', amenity: 'fast_food',
    outlets: [o('3', 'Main Terminal Building, MTB-3-L05', 'landside', '')],
  }),
  dunkin_donuts_t1: restaurant({
    name: 'Dunkin Donuts', cuisine: 'Bakery (Donuts & Coffee)', amenity: 'bakery',
    website: 'dunkindonuts.com', logoUrl: logo('dunkindonuts.com'),
    description: "Ever since Dunkin' Donuts opened at KLIA, travellers have been indulging on its large selection of delicious oven-fresh donuts to satisfy their sweet tooth. To complement their donuts, Dunkin' Donuts offers great coffee and tea, as well as thirst quenching beverages at their kiosk.",
    outlets: [
      o('3', 'Contact Pier Domestic, CPD-3-A05', 'airside', ''),
      o('4', 'Contact Pier International, CPI-4-A05', 'airside', ''),
    ],
  }),
  queen_coffee_meals: restaurant({
    name: 'QUEEN COFFEE & MEALS', cuisine: 'Cafe & Malaysian', amenity: 'restaurant',
    outlets: [o('4', 'Contact Pier International, CPI-4-A10', 'airside', '')],
  }),
  flight_club_signature: restaurant({
    name: 'Flight Club Signature', cuisine: 'Restaurant', amenity: 'restaurant',
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A23', 'airside', '')],
  }),
  grandmamas: restaurant({
    name: 'Grandmamas', cuisine: 'Restaurant', amenity: 'restaurant',
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A02', 'airside', '')],
  }),
  jibby_chow: restaurant({
    name: 'Jibby Chow', cuisine: 'Restaurant', amenity: 'restaurant',
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, SAT-M-A05', 'airside', '')],
  }),
  serai_t1: restaurant({
    name: 'Serai', cuisine: 'Malaysian', amenity: 'restaurant',
    outlets: [o('Mezzanine', 'Satellite Building Mezzanine, CIP 16 & 17, SAT-M-A04', 'airside', '')],
  }),
};

// ─── Terminal 2 / klia2 venues (klia2 Main Terminal Building + Piers J/K/L + Satellite Building) ────────

const terminal2Venues = {
  kopi_kenangan: restaurant({
    name: 'Kopi Kenangan', cuisine: 'Cafe (Indonesian Coffee)', amenity: 'cafe',
    website: 'kopikenangan.com', logoUrl: logo('kopikenangan.com'),
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L18', 'landside', '')],
  }),
  kopi_kita: restaurant({
    name: 'Kopi Kita', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L39a', 'landside', '')],
  }),
  mamak_express: restaurant({
    name: 'Mamak Express', cuisine: 'Malaysian Mamak', amenity: 'cafe',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L34', 'landside', '')],
  }),
  obriens_t2: restaurant({
    name: "O'Briens", cuisine: 'Cafe / Sandwich Bar', amenity: 'cafe',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L07', 'landside', '')],
  }),
  old_town_white_coffee_t2: restaurant({
    name: 'Old Town White Coffee', cuisine: 'Cafe (Malaysian White Coffee)', amenity: 'cafe',
    website: 'oldtownwhitecoffee.com', logoUrl: logo('oldtownwhitecoffee.com'),
    outlets: [
      o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L05', 'landside', ''),
      o('1A', 'klia2, Level 1A, Gate J, S1-1a-A01', 'airside', ''),
      o('2', 'klia2, Level 2, Gate L, S3-2-A10', 'airside', ''),
      o('1A', 'klia2, Level 1A, Gate K, S3-1a-A17', 'airside', ''),
    ],
  }),
  old_town_white_coffee_x_bdc_cimb: restaurant({
    name: 'Old Town White Coffee X BDC CIMB', cuisine: 'Cafe (Malaysian White Coffee)', amenity: 'cafe',
    outlets: [o('2', 'klia2 Main Terminal Building, Level 2, Arrival Level (Public Concourse), S2-2-IC05', 'landside', '')],
  }),
  starbucks_t2: restaurant({
    name: 'Starbucks', cuisine: 'Cafe', amenity: 'cafe',
    website: 'starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [
      o('2', 'klia2 Main Terminal Building, Level 2, Arrival Level (Public Concourse), S2-2-IC04', 'landside', ''),
      o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L01', 'landside', ''),
    ],
  }),
  the_coffee: restaurant({
    name: 'The Coffee', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L20a', 'landside', '')],
  }),
  cafe_espresso: restaurant({
    name: 'Cafe Espresso', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [
      o('1A', 'klia2, Level 1A, Gate P, S5-1a-A06', 'airside', ''),
      o('1A', 'klia2, Level 1A, Gate Q, S7-1a-A10, A11 & A12', 'airside', ''),
    ],
  }),
  coffee_bean_tea_leaf_t2: restaurant({
    name: 'The Coffee Bean & Tea Leaf', cuisine: 'Cafe', amenity: 'cafe',
    website: 'coffeebean.com', logoUrl: logo('coffeebean.com'),
    outlets: [
      o('1A', 'klia2, Level 1A, Gate J, S1-1a-A02 (listed as "Coffee Bean & Tea Leaf" here)', 'airside', ''),
      o('2', 'klia2, Level 2, Gate L, S3-2-A09', 'airside', ''),
      o('1A', 'klia2, Level 1A, Gate K, S3-1a-A07', 'airside', ''),
    ],
  }),
  costa_coffee_t2: restaurant({
    name: 'Costa Coffee', cuisine: 'Cafe', amenity: 'cafe',
    website: 'costacoffee.com', logoUrl: logo('costacoffee.com'),
    outlets: [o('2', 'klia2 Satellite Building, International Departure Level, S6-2-A16', 'airside', '')],
  }),
  nooodles_t2: restaurant({
    name: 'Nooodles', cuisine: 'Malaysian (Noodles)', amenity: 'cafe',
    outlets: [o('2', 'klia2 Satellite Building, International Departure Level, S6-2-A21', 'airside', '')],
  }),
  the_refinery: restaurant({
    name: 'The Refinery', cuisine: 'Cafe', amenity: 'cafe',
    outlets: [o('2', 'klia2 Satellite Building, International Departure Level, S6-2-A38', 'airside', '')],
  }),
  burger_king_t2: restaurant({
    name: 'Burger King', cuisine: 'Fast Food', amenity: 'fast_food',
    website: 'burgerking.com', logoUrl: logo('burgerking.com'),
    outlets: [
      o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L04', 'landside', ''),
      o('1A', 'klia2, Level 1A, Gate J, S1-1a-A10', 'airside', ''),
      o('2', 'klia2, Level 2, Gate L, S3-2-A08', 'airside', ''),
    ],
  }),
  jollibee: restaurant({
    name: 'Jollibee', cuisine: 'Fast Food (Filipino Fried Chicken)', amenity: 'fast_food',
    website: 'jollibee.com', logoUrl: logo('jollibee.com'),
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L08', 'landside', '')],
  }),
  aw_t2: restaurant({
    name: 'A&W', cuisine: 'Fast Food', amenity: 'fast_food',
    outlets: [o('3', 'klia2 Satellite Building, International Departure Level, S6-3-A04', 'airside', '')],
  }),
  mcdonalds_t2: restaurant({
    name: "McDonald's", cuisine: 'Fast Food', amenity: 'fast_food',
    website: 'mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [o('3', 'klia2 Satellite Building, International Departure Level, S6-3-A07', 'airside', '')],
  }),
  urban_food_court: restaurant({
    name: 'Urban Food Court', cuisine: 'Food Court', amenity: 'food_court',
    outlets: [o('3', 'klia2 Satellite Building, International Departure Level, S6-3-A21', 'airside', '')],
  }),
  i_love_yoo: restaurant({
    name: 'I Love Yoo!', cuisine: 'Dessert / Yogurt', amenity: 'fast_food',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L42', 'landside', '')],
  }),
  snek_and_co_t2: restaurant({
    name: 'Snek & Co', cuisine: 'Grab & Go Snacks', amenity: 'fast_food',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L02b', 'landside', '')],
  }),
  tealive: restaurant({
    name: 'Tealive', cuisine: 'Bubble Tea', amenity: 'fast_food',
    outlets: [
      o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L02a (listed as "TEALIVE" here)', 'landside', ''),
      o('1A', 'klia2, Level 1A, Gate Q, S7-1a-A08', 'airside', ''),
    ],
  }),
  the_dough: restaurant({
    name: 'The Dough', cuisine: 'Bakery', amenity: 'bakery',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L03', 'landside', '')],
  }),
  subway: restaurant({
    name: 'Subway', cuisine: 'Fast Food (Sandwiches)', amenity: 'fast_food',
    website: 'subway.com', logoUrl: logo('subway.com'),
    outlets: [o('1A', 'klia2, Level 1A, Gate J, S1-1a-A19', 'airside', '')],
  }),
  ahh_yum: restaurant({
    name: 'Ahh Yum', cuisine: 'Restaurant', amenity: 'restaurant',
    outlets: [
      o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L41 (listed as "AHH YUM" here)', 'landside', ''),
      o('1A', 'klia2, Level 1A, Gate P, S5-1a-A03', 'airside', ''),
      o('1A', 'klia2, Level 1A, Gate Q, S7-1a-A07', 'airside', ''),
    ],
  }),
  din_by_din_tai_fung: restaurant({
    name: 'Din by Din Tai Fung', cuisine: 'Taiwanese', amenity: 'restaurant',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L40', 'landside', '')],
  }),
  queen_canton_cuisine: restaurant({
    name: 'QUEEN CANTON CUISINE', cuisine: 'Chinese (Cantonese)', amenity: 'restaurant',
    outlets: [o('2', 'klia2 Main Terminal Building, Level 2, Arrival Level (Public Concourse), S2-2-IC01', 'landside', '')],
  }),
  serai_chicken_rice: restaurant({
    name: 'Serai Chicken Rice', cuisine: 'Malaysian (Chicken Rice)', amenity: 'restaurant',
    outlets: [o('3', 'klia2 Main Terminal Building, Departure Hall, S2-3-L03a', 'landside', '')],
  }),
  asia_street_cooking: restaurant({
    name: 'Asia Street Cooking', cuisine: 'Asian Street Food', amenity: 'restaurant',
    outlets: [o('1A', 'klia2, Level 1A, Gate P, S5-1a-A09', 'airside', '')],
  }),
  kreate: restaurant({
    name: 'Kreate', cuisine: 'Restaurant', amenity: 'restaurant',
    outlets: [o('1A', 'klia2, Level 1A, Gate J, S1-1a-A13', 'airside', '')],
  }),
  oriental_kopi_t2: restaurant({
    name: 'ORIENTAL KOPI', cuisine: 'Malaysian Kopitiam', amenity: 'restaurant',
    outlets: [o('3', 'klia2, Level 3, Gate P & Q, S4-3-A05', 'airside', '')],
  }),
  taste_of_india: restaurant({
    name: 'Taste Of India', cuisine: 'Indian', amenity: 'restaurant',
    outlets: [o('1A', 'klia2, Level 1A, Gate Q, S7-1a-A05', 'airside', '')],
  }),
};

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
  console.error('Fatal error:', err);
  process.exit(1);
});
