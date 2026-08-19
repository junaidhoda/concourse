'use strict';
/**
 * Fills in complete data for Los Angeles International Airport (LAX) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-18 from the airport's
 * own official site, flylax.com, using Claude in Chrome browser automation per
 * explicit user instruction. No third-party/aggregator source was used for any
 * venue field.
 *
 * SOURCE: https://www.flylax.com/lax-dining-and-shopping — Los Angeles World
 * Airports' own Dining & Shopping directory, on its "Restaurants, Food &
 * Beverages" tab. The page is a Drupal site that server-renders every venue
 * card into a single `.shop-dine-block`; each card carries the venue name, a
 * "Before TSA @Terminal N" / "After TSA @Terminal N" label, and a link to that
 * venue's own detail page at /lax-dining-and-shopping-details?id=<id>. There is
 * no dining API behind it — the only XHRs the page makes are analytics and an
 * accessibility widget. The 87 detail pages were then fetched same-origin from
 * the directory page itself and parsed from their own labelled
 * `.contact-location table.sidebar-table` rows (Address / Phones / Terminal /
 * Location / Hours), not by free-text regex over prose.
 *
 * EXTRACTION + VERIFICATION: the 87 in-terminal dining records were serialised
 * in-page to a printable-ASCII format (`@@` field delimiter) with every
 * non-ASCII character replaced by a reversible `<U+hex>` escape and every field
 * whitespace-normalised in the browser before checksumming, split into 3 chunks
 * under 6,600 chars on line boundaries, written into a `<pre id="dataDump">`
 * and retrieved via get_page_text. Every chunk verified EXACTLY on first pass
 * against values computed in the browser before retrieval — len/lines/checksum:
 * 6256/24/25815044, 6489/30/26537724, 4167/33/16067764 — as did the rejoined
 * 87-line dataset at len 16914, checksum 68736672, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 * INTEGRITY NOTE: the first attempt at the 87-page detail fetch timed out at
 * the tool layer while still running in the page, and its tail appended one
 * extra record to the second run's array. That was caught by checking the
 * result against the card list rather than trusting the count: 88 records but
 * 87 distinct ids, every wanted id present, no unexpected id, and the single
 * duplicate (id 1120, ink.sack) byte-identical to its twin. It was de-duplicated
 * by id before serialisation.
 *
 * TERMINAL STRUCTURE — 8 buckets (Terminals 1, 2, 3, 4, 6, 7, 8 and Tom Bradley
 * International Terminal). Each is a separate building with its own ticketing
 * hall and its own security checkpoints, so each passes this dataset's "own
 * check-in AND own security" test independently; the post-security connectors
 * that now link several of them do not merge buckets under that test. Applying
 * the test WITHIN a terminal produces no further split.
 *
 * TERMINAL 5 IS DELIBERATELY ABSENT, on LAX's own word. Its own terminal page
 * (flylax.com/terminals/terminal5) reads "Terminal 5 is closed for construction
 * as we work to bring you a world-class airport and experience. Anticipated
 * reopening: 2028" and tells passengers to "contact your airline for further
 * information regarding check-in locations and gate assignments". Consistent
 * with that, LAX's own dining directory neither offers Terminal 5 as a filter
 * value — its terminal dropdown lists only 1, 2, 3, 4, 6, 7, 8 and TBIT — nor
 * labels a single venue with it. A closed terminal is not a bucket here, the
 * same call made for JFK's Terminals 2, 3 and 6. When Terminal 5 reopens it
 * will need adding.
 *
 * AIRSIDE / LANDSIDE: taken directly from each card's own zone label — "After
 * TSA @Terminal N" → `airside`, "Before TSA @Terminal N" → `landside`. Present
 * on all 87 records; no inference was needed. Every card's terminal label was
 * also cross-checked against the Terminal row of its own detail page and all 87
 * agree.
 *
 * LEVEL: each detail page's own `Location` row verbatim — "Departure Level",
 * "Arrival Level", "Ticketing Level", "Departure Level - Food Court", "Food
 * Court Departure Level", "Great Hall", "Great Hall - Food Court", "North
 * Concourse", "South Concourse", "Bradley West - Main Concourse".
 *
 * LOCATION_NOTES: BLANK on every outlet. LAX publishes a terminal and a level
 * for each venue and nothing finer — no gate, no landmark — so there is no
 * specific location detail to carry, and restating the level would just repeat
 * the `level` field. A handful of descriptions mention a gate in prose ("Located
 * near gate 157"); that was left inside the description as published rather
 * than promoted to a structured field.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal are merged
 * into one doc with one `outlets[]` entry per unit; same-brand venues in
 * DIFFERENT terminals stay separate docs, per this dataset's standing rule. As
 * it happens LAX publishes no brand twice within one terminal, so all 87
 * records map 1:1 to 87 docs — Starbucks appears as four separate docs (T2, T3,
 * T4, TBIT), The Coffee Bean & Tea Leaf as four (T1, T7, T8, TBIT), Panda
 * Express as three (T1, T8, TBIT) and California Pizza Kitchen as two (T1, T6).
 * Brand matching is case- and apostrophe-insensitive, plus one documented
 * rendering alias for a brand LAX spells two ways across terminals: "The Coffee
 * Bean and Tea Leaf" (T1) ≡ "The Coffee Bean & Tea Leaf". Distinctly NAMED
 * venues are kept separate per this dataset's page-truth-over-label precedent:
 * "Starbucks" vs "Starbucks Evenings" vs "Starbucks (Arrivals)"; "Wpizza by
 * Wolfgang Puck" vs "The Kitchen by Wolfgang Puck" vs "The Wine Bar by Wolfgang
 * Puck" vs "Wolfgang Puck Express".
 *
 * CUISINE: "Restaurants, Food & Beverages" on every doc. This is not a
 * placeholder — it is verbatim the only category LAX's own directory assigns
 * these venues, and the tab used to select them. The airport publishes no
 * finer cuisine, genre or service-style tag for any dining venue, so there is
 * nothing more specific to join and inventing one per venue would be
 * fabrication.
 *
 * AMENITY: because LAX publishes no service-style tag at all, the amenity is
 * derived only from what it does publish — the venue's own name, and its own
 * description where one exists (52 of 87 records have one). The order is: a
 * coffee/café/caffe/bagel/bakery/bake-shop/donut/Peet's/Tea Leaf/Jamba/Klatch/
 * LAMILL name → `cafe`; a name carrying Bar / Lounge / Pub / Tavern / Tequila /
 * Wine / Brewery / Brew Works / Brews / Distillery / Vino Volo, and NOT also
 * carrying a food format (Grill, Kitchen, Bistro, Pizza, Pizzeria, Steakhouse,
 * Diner, Eatery, Restaurant, Deli, Taqueria, BBQ, Burger, Shack, Taco, Ramen,
 * Sushi, Chicken) → `bar`; per this dataset's standing rule a venue whose own
 * DESCRIPTION calls it a wine bar / cocktail bar / full bar, and does not also
 * call it a restaurant, is also `bar`; a quick-service brand name or a Market /
 * Express / 7-Eleven name → `fast_food`; a description that says fast food,
 * quick-service, fast-casual or grab & go → `fast_food`; otherwise
 * `restaurant`. That keeps "Rock & Brews Concert Bar and Grill", "Rolling Stone
 * Bar & Grill" and "Barney's Beanery" as restaurants while "Stella Bar",
 * "SeaLegs Wine Bar", "The Wine Bar by Wolfgang Puck", "Club 42 Tequila Bar &
 * Bites", "Santa Monica Brew Works", "Vino Volo" and "Reilly's Irish Pub" stand
 * as bars. Resulting mix across the 87 records: 39 restaurant, 22 cafe,
 * 19 fast_food, 7 bar. No `vending_machine` — LAX's dining directory publishes
 * no vending venue.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: blank on every doc. LAX
 * publishes no dietary tag of any kind, and this dataset's rule is that these
 * flags are set only where the source explicitly says so.
 *
 * DESCRIPTION: verbatim from each detail page, whitespace-normalised, with the
 * page's own trailing "Interactive Map Here" link text removed since it is
 * navigation rather than description. 35 records carry no description and are
 * left blank. One record (Crowns LAX) publishes a description of just "." and
 * is treated as empty.
 *
 * OPENING HOURS / 24-7: `opening_hours` is each detail page's own `Hours` row
 * verbatim, in LAX's own notation ("5:00am-10:00pm", "4:00am-11:00pm Closed
 * Sundays", "5:30am-10:00pm Tue-Wed 6:00am-1:30pm"). Published on all 87
 * records. `open_24_7` is set only where that string is exactly
 * "12:00am-12:00am", which is how LAX writes round-the-clock — 3 venues.
 *
 * PHONE: taken ONLY from each detail page's own `Phones` row, never
 * regex-scraped from prose. Published on all 87 records. LAX's own formatting
 * is preserved as published, including the one record written "(213) 235-0244"
 * where every other uses "213-235-0244". Note that LAX publishes a shared
 * concessionaire switchboard number on many venues rather than a direct line;
 * that is what the airport publishes and it is carried as-is.
 *
 * ADDRESS NOT CARRIED: each detail page also publishes a street address, but
 * they are terminal-level addresses ("100 World Way Los Angeles 90045"), not
 * venue-level, and this dataset's schema has no address field, so they were
 * read but not stored.
 *
 * WEBSITE / LOGO: LAX's directory carries no website field for any venue.
 * Following this dataset's KUL precedent, `website` (and the logo.dev logo
 * derived from it) is set only for globally or nationally recognisable chains
 * and well-known Los Angeles concepts whose primary domain is confidently
 * known — 70 of the 87 docs — and left blank for every other independent
 * concept ("Crowns LAX", "Natural Break", "NATIVE", "Double Smash", "Pizza
 * Please", "Navarre", "Betcha Burger", "LA Life Market", "Harvest Market",
 * "Playa Cafe" and the rest) rather than guessed.
 *
 * VERIFIED TOTALS: 87 source dining records → 87 restaurant docs / 87 outlets.
 * Terminal 1: 12 → 12 / 12. Terminal 2: 8 → 8 / 8. Terminal 3: 10 → 10 / 10.
 * Terminal 4: 4 → 4 / 4. Terminal 6: 12 → 12 / 12. Terminal 7: 12 → 12 / 12.
 * Terminal 8: 5 → 5 / 5. Tom Bradley International Terminal: 24 → 24 / 24.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['lax', 'los-angeles', 'los-angeles-international'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';
const TERMINAL_4 = 'terminal_4';
const TERMINAL_6 = 'terminal_6';
const TERMINAL_7 = 'terminal_7';
const TERMINAL_8 = 'terminal_8';
const TERMINAL_B = 'terminal_b';

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


// ─── Terminal 1 ───

const terminal1Venues = {
  '7_eleven': restaurant({
    name: "7- Eleven", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "424-702-5173",
    website: "7-eleven.com", logoUrl: logo("7-eleven.com"),
    outlets: [
      o("Arrival Level", "", "landside", "12:00am-12:00am", true),
    ],
  }),
  ace_tacos: restaurant({
    name: "Ace Tacos", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "310-780-8562",
    outlets: [
      o("Departure Level", "", "airside", "6:00am-11:00pm"),
    ],
  }),
  betcha_burger: restaurant({
    name: "Betcha Burger", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "310-780-8562",
    outlets: [
      o("Departure Level - Food Court", "", "airside", "5:00am-11:00pm"),
    ],
  }),
  california_pizza_kitchen: restaurant({
    name: "California Pizza Kitchen", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "California Pizza Kitchen offers a variety of pizzas, sandwiches, and breakfast options.",
    phone: "754-200-3356",
    website: "cpk.com", logoUrl: logo("cpk.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-Fil-A", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "American fast food restaurant chain headquartered in the city of College Park, Georgia, specializing in chicken sandwiches.",
    phone: "310-780-8562",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm Closed Sundays"),
    ],
  }),
  einstein_bros_bagels: restaurant({
    name: "Einstein Bros. Bagels", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "310-780-8562",
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "310-780-8562",
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("Departure Level", "", "airside", "7:00am-11:00pm"),
    ],
  }),
  reilly_s_irish_pub: restaurant({
    name: "Reilly s Irish Pub", cuisine: "Restaurants, Food & Beverages", amenity: "bar",
    description: "Based on the West Hollywood original, this cozy pub serves up comfort food like grilled cheese, corned beef sliders, and nachos, as well as a wide selection of sandwiches, burgers, and street tacos in fun flavors. Beer lovers can try a flight to sample se",
    phone: "754-200-3356",
    website: "reillysirishpub.com", logoUrl: logo("reillysirishpub.com"),
    outlets: [
      o("Departure Level", "", "airside", "7:00am-11:00pm"),
    ],
  }),
  rock_brews_concert_bar_and_grill: restaurant({
    name: "Rock & Brews Concert Bar and Grill", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Rock & Brews serves up a variety of bar bites.",
    phone: "323-719-6091",
    website: "rockandbrews.com", logoUrl: logo("rockandbrews.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:00pm"),
    ],
  }),
  the_coffee_bean_and_tea_leaf: restaurant({
    name: "The Coffee Bean and Tea Leaf", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "The Coffee Bean & Tea Leaf has an assortment of specialty coffee and blended coffee drinks, as well as tea and baked goods.",
    phone: "754-200-3356",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("Departure Level", "", "airside", "3:30am-11:00pm"),
    ],
  }),
  urth_caffe_bar: restaurant({
    name: "Urth Caffe & Bar", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "754-200-3356",
    website: "urthcaffe.com", logoUrl: logo("urthcaffe.com"),
    outlets: [
      o("Departure Level", "", "airside", "3:30am-11:00pm"),
    ],
  }),
  wetzels_quench: restaurant({
    name: "Wetzels / Quench", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "310-780-8562",
    website: "wetzels.com", logoUrl: logo("wetzels.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
};

// ─── Terminal 2 ───

const terminal2Venues = {
  barneys_beanery: restaurant({
    name: "Barneys Beanery", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Barney's Beanery features bar bites, burgers, Mexican, and much more.",
    phone: "424-393-4318",
    website: "barneysbeanery.com", logoUrl: logo("barneysbeanery.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:30pm"),
    ],
  }),
  built_custom_burgers: restaurant({
    name: "BUILT (Custom Burgers)", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "BUILT features fully customizable burgers.",
    phone: "323-719-6091",
    outlets: [
      o("Departure Level", "", "airside", "5:00am-10:30pm"),
    ],
  }),
  fresh_brothers_pizza_sandwiches: restaurant({
    name: "Fresh Brothers Pizza & Sandwiches", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Fresh Brothers serves up pizzas, chicken wings, and salads.",
    phone: "323-719-6091",
    website: "freshbrothers.com", logoUrl: logo("freshbrothers.com"),
    outlets: [
      o("Departure Level", "", "airside", "7:00am-11:00pm"),
    ],
  }),
  jersey_mike: restaurant({
    name: "Jersey Mike", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "323-719-6091",
    website: "jerseymikes.com", logoUrl: logo("jerseymikes.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:00pm"),
    ],
  }),
  pick_up_stix: restaurant({
    name: "Pick Up Stix", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "Pick Up Stix features a range of Asian comfort food.",
    phone: "323-719-6091",
    website: "pickupstix.com", logoUrl: logo("pickupstix.com"),
    outlets: [
      o("Departure Level", "", "airside", "9:00am-10:00pm"),
    ],
  }),
  sealegs_wine_bar: restaurant({
    name: "SeaLegs Wine Bar", cuisine: "Restaurants, Food & Beverages", amenity: "bar",
    description: "Sealegs dishes up bar bites and a range of farm fresh salads and sandwiches.",
    phone: "424-227-8295",
    outlets: [
      o("Departure Level", "", "airside", "6:00am-11:30pm"),
    ],
  }),
  slapfish_modern_seafood_shack: restaurant({
    name: "SLAPFISH Modern Seafood Shack", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Slapfish serves up a variety of seafood including: clam chowder, lobster rolls, fish & chips, and more.",
    phone: "310-910-2116",
    website: "slapfishrestaurant.com", logoUrl: logo("slapfishrestaurant.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:30am-12:00am"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items.",
    phone: "310-426-0749",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-12:00am"),
    ],
  }),
};

// ─── Terminal 3 ───

const terminal3Venues = {
  alfred: restaurant({
    name: "Alfred", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "310-780-8562",
    website: "alfred.la", logoUrl: logo("alfred.la"),
    outlets: [
      o("Food Court Departure Level", "", "airside", "4:00am-8:00pm"),
    ],
  }),
  cava: restaurant({
    name: "CAVA", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "323-719-6091",
    website: "cava.com", logoUrl: logo("cava.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:00pm"),
    ],
  }),
  chicken_beer: restaurant({
    name: "Chicken + Beer", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "424-702-5569",
    website: "chickenandbeeratl.com", logoUrl: logo("chickenandbeeratl.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:00pm"),
    ],
  }),
  double_smash: restaurant({
    name: "Double Smash", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "323-719-6090",
    outlets: [
      o("Departure Level", "", "airside", "7:00am-10:00pm"),
    ],
  }),
  fat_sals: restaurant({
    name: "Fat Sals", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "323-719-6091",
    website: "fatsalsdeli.com", logoUrl: logo("fatsalsdeli.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:30am-11:00pm"),
    ],
  }),
  homeboy: restaurant({
    name: "Homeboy", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "213-235-0244",
    website: "homeboyindustries.org", logoUrl: logo("homeboyindustries.org"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
  jamba: restaurant({
    name: "Jamba", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "424-702-5622",
    website: "jamba.com", logoUrl: logo("jamba.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:00pm"),
    ],
  }),
  native: restaurant({
    name: "NATIVE", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "424-702-5315",
    outlets: [
      o("Departure Level", "", "airside", "4:30am-10:00pm"),
    ],
  }),
  pizza_please: restaurant({
    name: "Pizza Please", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "323-719-6091",
    outlets: [
      o("Departure Level", "", "airside", "7:00am-11:00pm"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "213-235-0244",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
};

// ─── Terminal 4 ───

const terminal4Venues = {
  crowns_lax: restaurant({
    name: "Crowns LAX", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "(213) 235-0244",
    outlets: [
      o("Departure Level", "", "airside", "4:30am-12:00am"),
    ],
  }),
  natural_break: restaurant({
    name: "Natural Break", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "213-235-0244",
    outlets: [
      o("Departure Level", "", "airside", "6:00am-9:30pm"),
    ],
  }),
  sammys_woodfired_pizza: restaurant({
    name: "Sammy's Woodfired Pizza", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Sammy's Woodfired Pizza features a restaurant/bar offering east coast style pizza.",
    phone: "213-235-0244",
    website: "sammyswoodfiredpizza.com", logoUrl: logo("sammyswoodfiredpizza.com"),
    outlets: [
      o("Departure Level", "", "airside", "6:00am-12:00am"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "213-235-0244",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:30am-12:00am"),
    ],
  }),
};

// ─── Terminal 6 ───

const terminal6Venues = {
  california_pizza_kitchen: restaurant({
    name: "California Pizza Kitchen", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "310-780-8562",
    website: "cpk.com", logoUrl: logo("cpk.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:30am-11:30pm"),
    ],
  }),
  club_42_tequila_bar_bites: restaurant({
    name: "Club 42 Tequila Bar & Bites", cuisine: "Restaurants, Food & Beverages", amenity: "bar",
    phone: "310-426-4265",
    outlets: [
      o("Departure Level", "", "airside", "6:00am-11:00pm"),
    ],
  }),
  earthbar: restaurant({
    name: "Earthbar", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "Earthbar offers healthy snacks, smoothies, and grab & go food options.",
    phone: "310-340-3053",
    website: "earthbar.com", logoUrl: logo("earthbar.com"),
    outlets: [
      o("Departure Level - Food Court", "", "airside", "4:30am-10:00pm"),
    ],
  }),
  peets_coffee: restaurant({
    name: "Peets Coffee", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Peet's is well known for their fresh roasted, dark roast.",
    phone: "310-780-8562",
    website: "peets.com", logoUrl: logo("peets.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:30am-10:30pm"),
    ],
  }),
  point_the_way_cafe: restaurant({
    name: "Point the Way Cafe", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Golden Road's Point the Way Cafe features flatbreads, sandwiches, and craft beers.",
    phone: "310-426-4265",
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
  starbucks_arrivals: restaurant({
    name: "Starbucks (Arrivals)", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items.",
    phone: "424-405-1877",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Arrival Level", "", "landside", "5:00am-10:00pm"),
    ],
  }),
  starbucks_evenings: restaurant({
    name: "Starbucks Evenings", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items.",
    phone: "310-648-0946",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
  the_habit_burger_grill: restaurant({
    name: "The Habit Burger Grill", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "The Habit serves up a variety of charbroiled burgers, fresh salads, and tasty sides.",
    phone: "310-340-3053",
    website: "habitburger.com", logoUrl: logo("habitburger.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:30am-11:00pm"),
    ],
  }),
  the_kitchen_by_wolfgang_puck: restaurant({
    name: "The Kitchen by Wolfgang Puck", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "The Kitchen Counter features freshly made sandwiches, salads, and grab & go snacks.",
    phone: "424-225-0584",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
  the_wine_bar_by_wolfgang_puck: restaurant({
    name: "The Wine Bar by Wolfgang Puck", cuisine: "Restaurants, Food & Beverages", amenity: "bar",
    description: "Enjoy a cocktail and order from the neighboring Wolfgang Puck food options at The Marketplace Bar.",
    phone: "310-307-7526",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("Departure Level - Food Court", "", "airside", "6:00am-11:00pm"),
    ],
  }),
  wahoos_fish_taco: restaurant({
    name: "Wahoos Fish Taco", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Wahoo's Fish Taco serves up fresh tacos, burritos, and more.",
    phone: "310-340-3053",
    website: "wahoos.com", logoUrl: logo("wahoos.com"),
    outlets: [
      o("Departure Level", "", "airside", "6:00am-10:00pm"),
    ],
  }),
  wpizza_by_wolfgang_puck: restaurant({
    name: "Wpizza by Wolfgang Puck", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "WPizza by Wolfgang Puck, features neapolitan pizza.",
    phone: "310-307-7526",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("Departure Level", "", "airside", "6:30am-11:00pm"),
    ],
  }),
};

// ─── Terminal 7 ───

const terminal7Venues = {
  ashland_hill: restaurant({
    name: "Ashland Hill", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Ashland Hill’s food has been called “nuanced and delicious” with menus that draw from its California roots. Discover your inner foodie at this classic LA-based restaurant.",
    phone: "213-235-0244",
    website: "ashlandhillsm.com", logoUrl: logo("ashlandhillsm.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-10:00pm"),
    ],
  }),
  b_grill_by_boa_steakhouse: restaurant({
    name: "B Grill By BOA Steakhouse", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "B Grill serves up classic sandwiches and burgers as well as an assortment of fish and steak entrees.",
    phone: "213-235-0244",
    website: "boasteak.com", logoUrl: logo("boasteak.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:30am-11:30pm"),
    ],
  }),
  bld: restaurant({
    name: "BLD", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "BLD restaurant features an American classic menu, offering breakfast, lunch and dinner, as well as lighter options for the more health-minded traveler.",
    phone: "310-307-7527",
    website: "bldrestaurant.com", logoUrl: logo("bldrestaurant.com"),
    outlets: [
      o("Departure Level - Food Court", "", "airside", "5:00am-10:00pm"),
    ],
  }),
  dunkin_donuts: restaurant({
    name: "Dunkin' Donuts", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "213-235-0244",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
      o("Arrival Level", "", "landside", "5:30am-8:00pm"),
    ],
  }),
  klatch_coffee: restaurant({
    name: "Klatch Coffee", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Klatch is one of the few airport coffee shops to serve up drip coffee one cup at a time.",
    phone: "310-912-1290",
    website: "klatchroasting.com", logoUrl: logo("klatchroasting.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-10:00pm"),
    ],
  }),
  la_life_market: restaurant({
    name: "LA Life Market", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "310-307-7527",
    outlets: [
      o("Departure Level", "", "airside", "4:00am-12:00am"),
    ],
  }),
  loteria_grill: restaurant({
    name: "Loteria!! Grill", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "¡Loteria! Grill provides regional Mexican dishes with fresh and homemade salsas.",
    phone: "310-307-7527",
    website: "loteriagrill.com", logoUrl: logo("loteriagrill.com"),
    outlets: [
      o("Departure Level - Food Court", "", "airside", "6:00am-10:30pm"),
    ],
  }),
  randys_donuts_and_hilltop_coffee_kitchen: restaurant({
    name: "Randys Donuts and Hilltop Coffee + Kitchen", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "310-912-1290",
    website: "randysdonuts.com", logoUrl: logo("randysdonuts.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-8:00pm"),
    ],
  }),
  rolling_stone_bar_grill: restaurant({
    name: "Rolling Stone Bar & Grill", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Rolling Stone Bar & Grill's menu includes American favorites, small plates, and flatbread pizzas.",
    phone: "310-307-7527",
    website: "rollingstone.com", logoUrl: logo("rollingstone.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-12:00am"),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "The Coffee Bean & Tea Leaf has an assortment of specialty coffee and blended coffee drinks, as well as tea and baked goods.",
    phone: "310-307-7527",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("Departure Level - Food Court", "", "airside", "4:00am-10:00pm"),
    ],
  }),
  the_counter_custom_built_burgers: restaurant({
    name: "The Counter Custom Built Burgers", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "The Counter is a burger joint for the 21st century, also serving additional menu items including sweet potato fries, parfaits and beverages.",
    phone: "310-307-7527",
    website: "thecounter.com", logoUrl: logo("thecounter.com"),
    outlets: [
      o("Departure Level - Food Court", "", "airside", "4:00am-12:00am"),
    ],
  }),
  wolfgang_puck_express: restaurant({
    name: "Wolfgang Puck Express", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "Wolfgang Puck Express features Wolfgang's most popular dishes in a fast-casual setting with affordable prices. The menu features Wolfgang Puck's hand-crafted gourmet pizzas, sandwiches, soups, fresh salads and other Wolfgang Puck classics.",
    phone: "310-339-0996",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:00pm"),
    ],
  }),
};

// ─── Terminal 8 ───

const terminal8Venues = {
  carls_jr: restaurant({
    name: "Carl's Jr", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "Carl's Jr. is an American-based fast-food restaurant chain operating in the Western and Southwestern states that has landed in LAX Terminal 8 to bring to its guests one of the best burgers in town!",
    phone: "213-235-0244",
    website: "carlsjr.com", logoUrl: logo("carlsjr.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-11:00pm"),
    ],
  }),
  engine_co_no_28: restaurant({
    name: "Engine Co. No. 28", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Located in T8, Engine Co. No. 28 is a restaurant serving Classic American dishes with a Southern touch with a full bar.",
    phone: "213-235-0244",
    website: "engineco.com", logoUrl: logo("engineco.com"),
    outlets: [
      o("Departure Level", "", "airside", "5:00am-11:30pm"),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "Since 1983, Panda Express has pioneered the quick-service Chinese food market and quickly became the quick serve Asian cuisine of choice for consumers and developers. Nearly 30 years and 1,500 stores later, Panda Express continues to provide quality Chine",
    phone: "310-307-7527",
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("Departure Level", "", "airside", "7:00am-9:00pm"),
    ],
  }),
  stella_bar: restaurant({
    name: "Stella Bar", cuisine: "Restaurants, Food & Beverages", amenity: "bar",
    description: "American comfort food with a Mexican touch and a great bar and lounge area to relax.",
    phone: "213-235-0244",
    outlets: [
      o("Departure Level", "", "airside", "6:30am-11:00pm"),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "The Coffee Bean & Tea Leaf has an assortment of specialty coffee and blended coffee drinks, as well as tea and baked goods.",
    phone: "310-259-3754",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-9:00pm"),
    ],
  }),
};

// ─── Tom Bradley International Terminal (Terminal B) ───

const terminalBVenues = {
  '800_degrees_pizza': restaurant({
    name: "800 Degrees Pizza", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "800 Degrees Pizza – a Los Angeles based concept – offers traditional Neapolitan pizza baked in an 800 degree real wood-burning oven. Passengers can order from a few favorite combinations, or can personalize their pizza and create their own masterpiece!",
    phone: "310-259-3497",
    website: "800degreespizza.com", logoUrl: logo("800degreespizza.com"),
    outlets: [
      o("Great Hall - Food Court", "", "airside", "8:00am-11:00pm"),
    ],
  }),
  beecher_s_handmade_cheese: restaurant({
    name: "Beecher s Handmade Cheese", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "310-780-8562",
    website: "beechershandmadecheese.com", logoUrl: logo("beechershandmadecheese.com"),
    outlets: [
      o("Departure Level", "", "airside", "6:00am-11:00pm"),
    ],
  }),
  border_grill: restaurant({
    name: "Border Grill", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Border Grill is known as a great place to eat, have a beer, margarita or cocktails at the bar while watching TV.",
    phone: "310-343-0717",
    website: "bordergrill.com", logoUrl: logo("bordergrill.com"),
    outlets: [
      o("Great Hall - Food Court", "", "airside", "6:00am-12:00am"),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "626-931-0748",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-1:00am"),
    ],
  }),
  chaya_sushi: restaurant({
    name: "Chaya Sushi", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Chaya is a favorite with travelers who want to enjoy fresh sushi, rice balls and other Asian dishes.",
    phone: "310-343-0717",
    website: "thechaya.com", logoUrl: logo("thechaya.com"),
    outlets: [
      o("Great Hall", "", "airside", "8:00am-11:00pm"),
    ],
  }),
  chicken_guy: restaurant({
    name: "Chicken Guy", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "424-792-5004",
    website: "chickenguy.com", logoUrl: logo("chickenguy.com"),
    outlets: [
      o("Departure Level", "", "airside", "4:00am-1:00am"),
    ],
  }),
  harvest_market: restaurant({
    name: "Harvest Market", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "919-518-5402",
    outlets: [
      o("Departure Level", "", "airside", "5:00am-1:00am"),
    ],
  }),
  ink_sack: restaurant({
    name: "ink.sack", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Ink.sack serves up a long list of classic sandwiches as well as some eclectic options.",
    phone: "310-343-0717",
    website: "chefmichaelvoltaggio.com", logoUrl: logo("chefmichaelvoltaggio.com"),
    outlets: [
      o("Great Hall", "", "airside", "7:00am-11:00pm"),
    ],
  }),
  kentucky_fried_chicken: restaurant({
    name: "Kentucky Fried Chicken", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "KFC is known worldwide for their fried chicken.",
    phone: "310-259-2438",
    website: "kfc.com", logoUrl: logo("kfc.com"),
    outlets: [
      o("Departure Level", "", "airside", "6:00am-12:00am"),
    ],
  }),
  lamill_coffee: restaurant({
    name: "LAMILL Coffee", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Get buzzed at Lamill Coffee, a chic newcomer to the coffee scene from Los Angeles’ trendy Siverlake neighborhood. Located post-security in Tom Bradley International Terminal (Terminal B), Lamill introduces a fresh, new culinary approach to coffee that goes far beyond standard coffeehouse fare.",
    phone: "213-235-0257",
    website: "lamillcoffee.com", logoUrl: logo("lamillcoffee.com"),
    outlets: [
      o("North Concourse", "", "airside", "5:30am-10:00pm Tue-Wed 6:00am-1:30pm"),
    ],
  }),
  navarre: restaurant({
    name: "Navarre", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "310-215-3390",
    outlets: [
      o("Departure Level", "", "airside", "5:00am-1:00am"),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    description: "Since 1983, Panda Express has pioneered the quick-service Chinese food market and quickly became the quick serve Asian cuisine of choice for consumers and developers. Nearly 30 years and 1,500 stores later, Panda Express continues to provide quality Chine",
    phone: "310-662-3259",
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("Great Hall - Food Court", "", "airside", "6:00am-12:00am"),
    ],
  }),
  pf_changs: restaurant({
    name: "PF Changs", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "310-780-8562",
    website: "pfchangs.com", logoUrl: logo("pfchangs.com"),
    outlets: [
      o("Departure Level", "", "airside", "10:00am-11:00pm"),
    ],
  }),
  playa_cafe: restaurant({
    name: "Playa Cafe", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    phone: "424-312-2997",
    outlets: [
      o("Bradley West - Main Concourse", "", "airside", "4:00am-1:00am"),
    ],
  }),
  pret_a_manger: restaurant({
    name: "Pret A Manger", cuisine: "Restaurants, Food & Beverages", amenity: "fast_food",
    phone: "323-494-2553",
    website: "pretamanger.com", logoUrl: logo("pretamanger.com"),
    outlets: [
      o("Departure Level", "", "airside", "12:00am-12:00am", true),
    ],
  }),
  santa_monica_brew_works: restaurant({
    name: "Santa Monica Brew Works", cuisine: "Restaurants, Food & Beverages", amenity: "bar",
    phone: "310-780-8562",
    website: "smbrewworks.com", logoUrl: logo("smbrewworks.com"),
    outlets: [
      o("Departure Level", "", "airside", "9:00am-11:30pm"),
    ],
  }),
  santouka_ramen: restaurant({
    name: "Santouka Ramen", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    phone: "949-648-2371",
    website: "santouka.co.jp", logoUrl: logo("santouka.co.jp"),
    outlets: [
      o("Departure Level", "", "airside", "7:00am-11:00pm"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items. Located near gate 148.",
    phone: "949-668-3207",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Great Hall", "", "airside", "12:00am-12:00am", true),
    ],
  }),
  starbucks_evenings: restaurant({
    name: "Starbucks Evenings", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "Starbucks Evenings has all of the wonderful coffee drinks they're known for plus appetizers, beer and wine. Located near gate 157",
    phone: "310-528-6553",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("South Concourse", "", "airside", "4:00am-10:00pm"),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "The Coffee Bean & Tea Leaf has an assortment of specialty coffee and blended coffee drinks, as well as tea and baked goods.",
    phone: "424-702-4699",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("Arrival Level", "", "landside", "6:00am-11:00pm"),
    ],
  }),
  umami_burger: restaurant({
    name: "Umami Burger", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Eat at Umami Burger if you want a handcrafted, grass fed burger, and other tasty menu items.",
    phone: "310-647-7839",
    website: "umamiburger.com", logoUrl: logo("umamiburger.com"),
    outlets: [
      o("Great Hall - Food Court", "", "airside", "8:00am-12:00am"),
    ],
  }),
  vanilla_bake_shop: restaurant({
    name: "Vanilla Bake Shop", cuisine: "Restaurants, Food & Beverages", amenity: "cafe",
    description: "The Vanilla Bake Shop is the place to pick up macaroons, desserts, a healthy fruit cup or a sandwich.",
    phone: "323-484-2553",
    outlets: [
      o("South Concourse", "", "airside", "5:00am-11:00pm"),
    ],
  }),
  vino_volo: restaurant({
    name: "Vino Volo", cuisine: "Restaurants, Food & Beverages", amenity: "bar",
    description: "Vino Volo offers various small plates and wines. They also sell bottles to go.",
    phone: "470-218-4343",
    website: "vinovolo.com", logoUrl: logo("vinovolo.com"),
    outlets: [
      o("Great Hall", "", "airside", "11:00am-11:00pm"),
    ],
  }),
  wpizza_by_wolfgang_puck: restaurant({
    name: "WPizza by Wolfgang Puck", cuisine: "Restaurants, Food & Beverages", amenity: "restaurant",
    description: "Grab some quick Italian and a cocktail at Wpizza by Wolfgang Puck.",
    phone: "310-259-3754",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("Ticketing Level", "", "landside", "8:00am-8:00pm"),
    ],
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
  const r3 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', terminal3Venues);
  const r4 = await processTerminal(AIRPORT, TERMINAL_4, 'Terminal 4', terminal4Venues);
  const r5 = await processTerminal(AIRPORT, TERMINAL_6, 'Terminal 6', terminal6Venues);
  const r6 = await processTerminal(AIRPORT, TERMINAL_7, 'Terminal 7', terminal7Venues);
  const r7 = await processTerminal(AIRPORT, TERMINAL_8, 'Terminal 8', terminal8Venues);
  const r8 = await processTerminal(AIRPORT, TERMINAL_B, 'Tom Bradley International Terminal (Terminal B)', terminalBVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3, TERMINAL_4, TERMINAL_6, TERMINAL_7, TERMINAL_8, TERMINAL_B]));

  const totalCreated = r1.created + r2.created + r3.created + r4.created + r5.created + r6.created + r7.created + r8.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r4.deleted + r5.deleted + r6.deleted + r7.deleted + r8.deleted;
  const totalVenues = Object.keys(terminal1Venues).length
    + Object.keys(terminal2Venues).length
    + Object.keys(terminal3Venues).length
    + Object.keys(terminal4Venues).length
    + Object.keys(terminal6Venues).length
    + Object.keys(terminal7Venues).length
    + Object.keys(terminal8Venues).length
    + Object.keys(terminalBVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
