'use strict';
/**
 * Fills in complete data for John F. Kennedy International Airport (JFK) —
 * restaurants/cafés/bars/vending in Firestore. Researched 2026-08-17 from the
 * airport's own official site, jfkairport.com, and the airport's own
 * interactive map at maps.jfkairport.com, using Claude in Chrome browser
 * automation per explicit user instruction. No third-party/aggregator source
 * was used for any venue field.
 *
 * SOURCE: the Port Authority's own "Where To Eat" directory at
 * https://www.jfkairport.com/dine-shop-relax/food is a Next.js/AEM page whose
 * venue cards come from a first-party GraphQL endpoint (POST /api/graphql,
 * `getDinePOIs`) with a compressed request body — it returns only id, name,
 * category, structureName, floorName and nearbyLandmark, and rejects a
 * hand-written query with 403. Its own card images are served from
 * img.locuslabs.com/resize/A119NSPH8JLU80/…, which identifies the airport's
 * own LocusLabs map account, the same store behind maps.jfkairport.com. The
 * full-fidelity backing data is therefore:
 *   a.locuslabs.com/accounts/A119NSPH8JLU80/v5.json  (venue index)
 *   …/jfk/2026-08-13T17:14:36/v5/pois-3.0-jfk.json   (1,881 POIs)
 *   …/jfk/2026-08-13T17:14:36/v5/venueData-jfk.json  (structures and levels)
 * plus the live overlay marketplace.locuslabs.com/venueId/jfk/dynamic-poi.
 * 154 POIs carry an `eat*` category. Each supplies poiId, name, category,
 * description, operationHours, phone, links[], isAfterSecurity,
 * position.floorId, nearbyLandmark and keywords[]. This is the airport's own
 * published venue data, behind the airport's own dining directory and map.
 *
 * DYNAMIC OVERLAY CHECKED, NOT NEEDED: the venue index sets hasDynamicPOIs,
 * so the live overlay was fetched. It contains 14 records and every one is a
 * `security.checkpoint` with queue timings — no dining record is added,
 * removed or overridden by it, so the static POI file stands as published.
 *
 * EXTRACTION + VERIFICATION: the in-terminal dining records were serialised
 * in-page to a printable-ASCII format (`@@` field delimiter, `|` list
 * delimiter) with every non-ASCII character replaced by a reversible `<U+hex>`
 * escape and every field whitespace-normalised in the browser before
 * checksumming, split into 8 chunks under 6,600 chars on line boundaries,
 * written into a `<pre id="dataDump">` and retrieved via get_page_text. Every
 * chunk verified EXACTLY on first pass against values computed in the browser
 * before retrieval — len/lines/checksum: 6363/19/28758924, 6524/16/29643037,
 * 6239/20/27866368, 6369/18/28635368, 6428/21/28658408, 6590/22/29447367,
 * 6378/17/29071654, 885/3/4026005 — and the rejoined 136-line dataset at
 * len 45783, checksum 206550525. A second small table carrying JFK's own
 * service-style tags (quickServiceEat / fullServiceEat) was extracted and
 * verified the same way: 136 lines, len 2498, checksum 9764913. Both use
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 5 buckets (Terminals 1, 4, 5, 7, 8), and JFK's own data
 * settles it on both halves of this dataset's test. JFK's own terminals index
 * (jfkairport.com/explore-jfk/terminals) lists exactly five operating
 * terminals — 1, 4, 5, 7 and 8 — with no others offered; Terminal 2 is closed,
 * Terminal 3 was demolished and Terminal 6 is under construction, so none of
 * them appears. OWN CHECK-IN: the airport's own map models a check-in level in
 * each one — "Departures/Check-In" (T1 Level 3, T5 Level 3, T8 Level 3),
 * "Check-In/Departure Hall" (T4 Level 4) and "Ticketing/Check-In" (T7 Level
 * 2). OWN SECURITY: the airport's own live checkpoint feed places 14
 * checkpoints and every one of them is inside one of the five — T1: 3, T4: 3,
 * T5: 3, T7: 2, T8: 3, and none anywhere else. Each terminal therefore passes
 * the "own check-in AND own security" test independently and gets its own
 * bucket. The AirTrain links between them is landside, so it merges nothing.
 * Applying the test WITHIN a terminal produces no further split: no terminal
 * holds a second independent check-in/security pair.
 *
 * SCOPE — 18 of the 154 `eat*` POIs EXCLUDED as not being in any terminal:
 * 13 in the TWA Hotel (Joe Coffee, Paris Café & Lisbon Lounge by
 * Jean-Georges, Connie Cocktail Lounge, The Sunken Lounge, Pool Bar,
 * Feltman's of Coney Island, VINNY'S Panini, Crêpes Your Way, Mister Softee,
 * Fly-By Bagels, Food Hall, TWA Corner Store and a Coca Cola vending
 * machine), 3 at Jamaica Station on the AirTrain (Air Bar, NY Deli / Gateway
 * Bake Shop, Tim Hortons) and 2 vending machines at Federal Circle Station in
 * the rental-car complex. None sits in a terminal building — JFK's own map
 * models each as its own separate structure, and its own directory offers
 * them as separate locations alongside the five terminals — so rather than
 * invent a bucket they are left out of scope. That leaves 136 records.
 * NOTE ON THE WEB DIRECTORY'S COUNT: jfkairport.com's "Where To Eat" page
 * reports 198 results because it also folds in POIs the airport's own map
 * classifies as `shop` (CIBO Express and similar grab-and-go markets). This
 * file follows the airport's own POI category, which is the same call made
 * for the other airports in this dataset.
 *
 * AIRSIDE / LANDSIDE: taken directly from each POI's own `isAfterSecurity`
 * boolean — true → `airside`, false → `landside`. Present on all 154 records;
 * no inference was needed.
 *
 * LEVEL: JFK's own level name followed by its own level detail string, both
 * verbatim from venueData — "Level 3 (Departures/Check-In)", "Level 4 (Food
 * Court/AirTrain)", "Level 3 (Retail Hall/Gates/AirTrain)", "Level 1
 * (Arrivals/Connecting Tunnel)", "Level 2 (Ticketing/Check-In)".
 *
 * LOCATION_NOTES: each POI's own `nearbyLandmark` verbatim — "Gate B25",
 * "Food Court", "Food Hall", "Marketplace", "The Great Hall", "Retail Hall",
 * "Baggage Claim", "Check-In", "Arrival Lounge", "Near escalators", "stairs
 * up to lounges". Left BLANK for the records where JFK publishes none, rather
 * than guessing — with one documented exception, the Terminal 4 record JFK
 * names "Starbucks - Gate B20", where the gate is read off the venue's own
 * published name.
 *
 * ONE VENUE PUBLISHED AS TWO POIs: JFK's map files Cobblestones Biergarten &
 * Bar twice in Terminal 8 — poiId 4005801 as `eat` and poiId 4006006 as
 * `eat.bar` — with the same name, same level and same landmark ("Food Hall").
 * That is one physical venue split across two category records, not two
 * units, so the pair was collapsed to a single outlet with the union of their
 * keywords. The rule applied is deliberately narrow — same bucket, same name,
 * same level, same landmark, and DIFFERENT category — so that genuinely
 * repeated units are untouched: Terminal 8's several landside Farmer's Fridge
 * machines, each with its own poiId and its own map position, all survive as
 * separate outlets. 136 records → 135 after this collapse.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal are merged
 * into one doc with one `outlets[]` entry per physical unit; same-brand venues
 * in DIFFERENT terminals stay separate docs, per this dataset's standing rule.
 * Brand matching is case- and apostrophe-insensitive, plus one documented
 * rendering alias: "Starbucks - Gate B20" ≡ "Starbucks" (both Terminal 4).
 * Distinctly NAMED venues are kept separate per this dataset's
 * page-truth-over-label precedent, even where they share a parent brand:
 * "Dunkin'" vs "Dunkin' Express"; "Eataly Restaurant" vs "Eataly Wine Bar"
 * (T5) vs "Eataly" (T8); "Nom Wah Restaurant" vs "Nom Wah Bar"; "Dos Toros"
 * (T4) vs "Dos Toros Taqueria" vs "Dos Toros Tequila Bar" (T8); "Pizza Vino"
 * vs "Pizza Vino Bar"; "Melt Shop" in T4 and T5; "Bento Sushi" in T4 and T7.
 * 135 records → 114 docs.
 *
 * CUISINE: the verbatim join of each POI's own user-searchable `keywords[]`,
 * in JFK's own order, unfiltered — including JFK's own "$2 Water" value-
 * programme tag (which is one of the airport's own dining filter chips), its
 * dietary tags, its meal tags and, on a few records, marketing fragments the
 * airport has left in its own keyword list ("serving burgers", "and more.",
 * "gate8", "nyfavorites", "shack"). Only the taxonomy identifiers are dropped,
 * since they are not cuisine or genre at all: the venue's own name, the bare
 * category strings ("eat", "eat.bar", "eat.coffee", "eat.vending"), the
 * "category:*" strings, and the two service-style tags, which are used for
 * `amenity` instead. Where outlets were merged, the union of their keyword
 * sets is used, first-seen order preserved.
 *
 * AMENITY: driven by JFK's own POI category first — `eat.vending` →
 * `vending_machine` (16 units), `eat.coffee` → `cafe`. A name containing "Food
 * Hall"/"Food Court" → `food_court` (Terminal 4's Five Borough Food Hall and
 * Terminal 8's Boroughs Food Hall). Per this dataset's standing rule the
 * `eat.bar` category is NOT taken on its own: each of the 23 eat.bar records
 * was checked against its own name and description, which overturns the tag
 * three ways — a name naming a food format → `restaurant` (Beacon Bar &
 * Kitchen, Pizza Vino Bar, Midtown Bistro); a description that calls the
 * venue a coffee bar → `cafe` (both Eataly units, whose own blurb reads "a
 * true Italian coffee bar experience with expertly crafted espresso"); and a
 * description that calls it a restaurant → `restaurant` (Soho Bites: "Sit-down
 * restaurant offering a variety of foods and a big bar"). The venue's own name
 * wins over a passing mention of "restaurant" in prose, which is what keeps
 * Eataly Wine Bar a `bar` even though its blurb describes the whole Eataly
 * marketplace. Beyond that: a bar/lounge/pub/taphouse/biergarten/brewery/
 * distillery/tavern/speakeasy/tequila/wine name → `bar`; a coffee/café/
 * bagel/bakery/roasters/tea name → `cafe`; JFK's own `quickServiceEat` tag or
 * a "fast food" keyword → `fast_food`; its own `fullServiceEat` tag or a
 * "sit-down" keyword → `restaurant`; a "grab & go" keyword → `fast_food`;
 * otherwise `restaurant`. Resulting mix across the 135 records: 42 fast_food,
 * 34 cafe, 25 restaurant, 16 bar, 16 vending_machine, 2 food_court.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: set to 'yes' ONLY where
 * JFK's own keyword list says so — "vegetarian", "vegan", "gluten-free",
 * "halal" and "kosher" each set their own flag and nothing else does. Where
 * outlets were merged, a flag is set if ANY merged unit carries the keyword.
 *
 * DESCRIPTION: verbatim from each POI's own `description` field,
 * whitespace-normalised only. UPSTREAM ERROR PRESERVED, NOT SILENTLY FIXED:
 * JFK publishes the Terminal 1 record "Madhuban Modern Indian" with the
 * description "Chicken & Beer offers a variety of dishes that include fried
 * chicken." — plainly another venue's copy. It is left exactly as the airport
 * publishes it, in keeping with this dataset's handling of DFW's Maggiano's
 * record, rather than being edited or dropped.
 *
 * OPENING HOURS / 24-7: `opening_hours` is the POI's own `operationHours`
 * string verbatim, in JFK's own OSM-style notation ("Mo-Su 05:00-23:00",
 * "Sa-Su 09:00-22:30", "Mo-Su 04:30-22:30") including its own non-standard
 * "Mo-Su 03:00-lastFlight". `open_24_7` is set where that string contains
 * "00:00-24:00" OR where JFK's own keyword list carries its "24/7" tag.
 *
 * PHONE: taken ONLY from the POI's own structured `phone` field, never
 * regex-scraped from description prose. JFK's own formatting inconsistencies
 * are preserved as published — "+1 (718) 765-6605", "+17187512003" and
 * "+1 (510) 596-0100" all appear in JFK's data exactly as written here.
 *
 * WEBSITE / LOGO: taken from each POI's own `links[]` entry of type "primary",
 * reduced to a bare domain. These are the airport's own published links and
 * are used as published even where the link is the concessionaire's corporate
 * site rather than the venue's own — Bagel Boss, Guy Fieri's Flavortown, Naya
 * and Mito in Terminal 8 all link to meracorporation.com in JFK's own data,
 * and that is left as the airport publishes it rather than swapped for a
 * guessed brand domain. Venues JFK publishes with no link get a blank
 * `website` and no logo, rather than an invented one.
 *
 * VERIFIED TOTALS: 154 source dining POIs − 18 out of scope = 136 → 135 after
 * collapsing the one duplicate POI pair → 114 restaurant docs / 135 outlets.
 * Terminal 1: 26 records → 24 docs / 26 outlets. Terminal 4: 36 → 31 / 36.
 * Terminal 5: 25 → 21 / 25. Terminal 7: 11 → 9 / 11. Terminal 8: 37 → 29 / 37.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['jfk', 'john-f-kennedy', 'new-york-jfk'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_4 = 'terminal_4';
const TERMINAL_5 = 'terminal_5';
const TERMINAL_7 = 'terminal_7';
const TERMINAL_8 = 'terminal_8';

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
  arrivals_eatery: restaurant({
    name: "Arrivals Eatery", cuisine: "bottled water, vegan, gluten-free, breakfast, lunch, dinner, grab & go, coffee, chips, $2 Water, cafe, vegetarian", amenity: "fast_food",
    description: "Arrivals Eatery features various eateries such as Dunkin', Camden Food Company, and other cafes for travelers after clearing customs, offering quick bites and drinks before exiting the airport.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 1 (Arrivals)", "Arrivals", "landside", "Mo-Su 10:00-22:00"),
    ],
  }),
  downtown_market: restaurant({
    name: "Downtown Market", cuisine: "bottled water, breakfast, lunch, dinner, vegetarian, vegan, gluten-free, grab & go, chips, coffee, $2 Water, cafe", amenity: "fast_food",
    description: "Great selection of quick bites.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 2", "airside", "Mo-Su 08:00-24:00"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "espresso, macchiato, cappuccino, latte, iced coffee, tea, bottled water, juice, breakfast, waters, drinks, coffees, donuts, sandwiches, coffee, breakfast sandwiches, muffin, $2 Water, vegetarian", amenity: "cafe",
    description: "Dunkin' is an American favorite, serving signature breakfast items and a variety of coffee drinks.",
    phone: "+1 (718) 751-1600",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true,
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Mo-Su 05:00-23:00"),
    ],
  }),
  dunkin_express: restaurant({
    name: "Dunkin' Express", cuisine: "bottled water, soda, juice, waters, drinks, coffees, donuts, breakfast, sandwiches, coffee, muffin, bakery, grab & go, iced coffee, $2 Water, vegetarian", amenity: "cafe",
    description: "Dunkin' Express offers coffee and bakery items.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true,
    outlets: [
      o("Level 1 (Arrivals)", "Arrivals", "landside", "Mo-Su 07:00-23:00"),
      o("Level 3 (Departures/Check-In)", "Gate 6", "airside", "Mo-Su 08:00-24:00"),
    ],
  }),
  eat_go_istanbul: restaurant({
    name: "Eat & Go Istanbul", cuisine: "chips, snacks, cookies, bottled water, wine, soda, juice, coffee, tea, lunch, dinner, kosher, gluten-free, grab & go, turkish coffee, halal, sandwiches, bakery, dessert, delicatessen, vegetarian, $2 Water", amenity: "fast_food",
    description: "Eat & Go Istanbul is a deli dishing out halal food.",
    phone: "+1 (718) 751-2826",
    halal: true, vegetarian: true, kosher: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 5", "airside", "Mo-Su 08:00-24:30"),
    ],
  }),
  euro_cafe: restaurant({
    name: "Euro Cafe", cuisine: "pretzels, candy, chocolate, bottled water, milk, chocolate milk, lunch, sandwiches, bakery, coffee, snacks, travel essentials, grab & go, $2 Water", amenity: "cafe",
    description: "Euro Cafe features bakery items and speciality coffee drinks.",
    phone: "+1 (718) 751-2854",
    website: "eurocafeusa.com", logoUrl: logo("eurocafeusa.com"),
    outlets: [
      o("Level 1 (Arrivals)", "Arrivals", "landside", "Mo-Su 08:00-24:00"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "delicatessen, vending machine, vegetarian, salads, pastas, sandwiches, grab & go", amenity: "vending_machine",
    description: "Farmer's Fridge vending machines offer fresh chef-crafted salads, breakfast, sandwiches, and bowls, delivered daily.",
    vegetarian: true,
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "", "landside", ""),
      o("Level 3 (Departures/Check-In)", "", "landside", ""),
    ],
  }),
  flying_tacos: restaurant({
    name: "Flying Tacos", cuisine: "burritos, chicken, beef, queso, vegan, gluten-free, breakfast, lunch, dinner, tacos, vegetarian", amenity: "fast_food",
    description: "Wide selection of tacos and taco bowls.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Mo-Su 10:00-20:00"),
    ],
  }),
  madhuban_modern_indian: restaurant({
    name: "Madhuban Modern Indian", cuisine: "", amenity: "restaurant",
    description: "Chicken & Beer offers a variety of dishes that include fried chicken.",
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", ""),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "cheeseburger, hamburger, chicken, dessert, coffee, soda, breakfast, lunch, dinner, american, fast food, burger, fries, salads, $2 Water", amenity: "fast_food",
    description: "McDonald's is known around the globe for their fast food.",
    phone: "+1 (718) 751-2833",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Mo-Su 07:00-22:00"),
    ],
  }),
  midtown_bistro: restaurant({
    name: "Midtown Bistro", cuisine: "salads, sandwiches", amenity: "restaurant",
    description: "Sit-down restaurant offering convenient food from salads to sandwiches.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 4", "airside", "Mo-Su 09:00-24:00"),
    ],
  }),
  ny_fresh_subs: restaurant({
    name: "NY Fresh Subs", cuisine: "bottled water, soda, juice, turkey, breakfast, lunch, dinner, vegetarian, vegan, gluten-free, deli, salads, chips, smoothies, sandwiches, $2 Water", amenity: "fast_food",
    description: "Fresh custom made sandwiches for a quick stop and bite",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Mo-Su 10:00-19:00"),
    ],
  }),
  pizza_pub: restaurant({
    name: "Pizza Pub", cuisine: "vegetarian, gluten-free, grab & go, pizza, breakfast, lunch, dinner, $2 Water", amenity: "fast_food",
    description: "Pizza pub offers a wide selection of pizza and sandwich flavors.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 6", "airside", "Mo-Su 08:00-24:00"),
    ],
  }),
  pza: restaurant({
    name: "PZA", cuisine: "beer, tv, bottled water, calamari, buffalo wings, vegan, breakfast, lunch, dinner, bar, restaurant, italian, pizza, pasta, meatballs, vegetarian, $2 Water", amenity: "restaurant",
    description: "Grab a seat at the bar or enjoy table service at PZA.",
    phone: "+1 (718) 765-6605",
    website: "hmshost.com", logoUrl: logo("hmshost.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Mo-Su 11:30-19:30"),
    ],
  }),
  shin_ramyun: restaurant({
    name: "Shin Ramyun", cuisine: "energy drink, bottled water, soda, juice, beer, chips, snacks, lunch, dinner, vegan, korean, ramen, ice cream, grab & go, vegetarian, noodles", amenity: "fast_food",
    description: "Shin Ramyun is a K-style noodle bar featuring Asian cuisine as well as an assortment of snacks and desserts.",
    phone: "+17187512003",
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Mo-Su 08:00-23:30"),
    ],
  }),
  soho_bites: restaurant({
    name: "Soho Bites", cuisine: "", amenity: "restaurant",
    description: "Sit-down restaurant offering a variety of foods and a big bar for those wishing to relax before the trip",
    outlets: [
      o("Level 3 (Departures/Check-In)", "", "landside", ""),
    ],
  }),
  soy_sake: restaurant({
    name: "Soy & Sake", cuisine: "sake, beer, ramen, donburi, soup, salad, kimchee, wine, pork belly, asian, bar, snacks, asian fusion, noodles, pork buns, dumplings, $2 Water", amenity: "bar",
    description: "Sit back, relax, and wind down with a quick snack and drink as you prepare to board your flight.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 6", "airside", "Mo-Su 10:00-23:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "coffee, latte, macchiato, cappuccino, iced coffee, tea, travel mug, coffee beans, vegetarian, vegan, gluten-free, waters, drinks, coffees, pastry, pastries, sandwiches, bakery, grab & go, snacks, breakfast, smoothies, $2 Water", amenity: "cafe",
    description: "Starbucks is an iconic Seattle-based coffeehouse chain known for its signature roasts and light bites.",
    phone: "+1 (718) 765-6605",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 3", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  taste_of_ny: restaurant({
    name: "Taste of NY", cuisine: "sit-down, local, bar", amenity: "bar",
    description: "Taste of NY offers a full sit-down service for those wishing to relax before the journey.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 4", "airside", "Mo-Su 10:00-11:00"),
    ],
  }),
  the_local_jfk: restaurant({
    name: "The Local @ JFK", cuisine: "beer, wine, vegan, sandwiches, burgers, salads, coffee, soup, buffalo wings, American, bar, $2 Water, vegetarian", amenity: "restaurant",
    description: "Traditional American cuisine for passengers who are in a rush or prefer to dine in.",
    phone: "+1 (718) 765-6609",
    website: "hmshost.com", logoUrl: logo("hmshost.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 5", "airside", "Mo-Su 08:00-22:00"),
    ],
  }),
  uptown_bar: restaurant({
    name: "Uptown Bar", cuisine: "bar", amenity: "bar",
    description: "Bar offering a variety of drinks.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 7", "airside", ""),
    ],
  }),
  uptown_market: restaurant({
    name: "Uptown Market", cuisine: "breakfast, lunch, dinner, vegan, gluten-free, grab & go, coffee, chips, $2 Water, cafe, vegetarian", amenity: "fast_food",
    description: "Choose from a large selection of snacks, bites, drinks, and sandwiches before you board your flight.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 7", "airside", "Mo-Su 10:00-24:00"),
    ],
  }),
  wok_roll: restaurant({
    name: "Wok & Roll", cuisine: "miso soup, fried chicken, chicken, fried rice, dumplings, noodles, asian, sushi, bubble tea, egg roll", amenity: "fast_food",
    description: "Wok & Roll offers an assortment of Japanese and Chinese cuisine.",
    phone: "+1 (718) 751-1999",
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Sa-Su 09:00-22:30"),
    ],
  }),
  wurst_sausages: restaurant({
    name: "Wurst Sausages", cuisine: "soda, juice, pork, beef, veal, bottled water, breakfast, lunch, dinner, vegan, gluten-free, bratwurst, sausage, pretzels, chips, German, $2 Water, vegetarian", amenity: "fast_food",
    description: "Quick stop for sausages and sandwiches.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 4 (Food Court/AirTrain)", "Food Court", "landside", "Mo-Su 10:00-20:00"),
    ],
  }),
};

// ─── Terminal 4 ───

const terminal4Venues = {
  beacon_bar_kitchen: restaurant({
    name: "Beacon Bar & Kitchen", cuisine: "American, salads, sandwiches, soup, breakfast, bar, dinner, lunch, vegetarian, $2 Water", amenity: "restaurant",
    description: "Restaurant & Bar concept serving American cuisine",
    vegetarian: true,
    outlets: [
      o("Level 1 (Gates/Arrivals Hall)", "Gate A11", "airside", "Mo-Su 05:00-23:00"),
    ],
  }),
  bento_sushi: restaurant({
    name: "Bento Sushi", cuisine: "asian, sushi, grab & go, chips, fish, seafood, beef, chicken, salmon, tofu, avocado, nigiri, donburi, bento box, $2 Water, vegetarian", amenity: "fast_food",
    description: "Bento features grab & go sushi and donburi rice bowls.",
    website: "bentosushi.com", logoUrl: logo("bentosushi.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B25", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  bessou: restaurant({
    name: "Bessou", cuisine: "asian, sushi, grab & go, chips, fish, beef, chicken, salmon, $2 Water, vegetarian, drinks, seaweed, japanese, fried chicken, soup, popcorn, noodles", amenity: "fast_food",
    description: "Modern Japanese comfort food featuring crispy chicken sandwiches, ramen, udon noodles, rice bowls, and flavorful sides in a fast-casual setting",
    website: "bessou.nyc", logoUrl: logo("bessou.nyc"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Retail Hall", "landside", "Mo-Su 09:00-21:00"),
    ],
  }),
  boulton_watt: restaurant({
    name: "Boulton & Watt", cuisine: "american, burgers, salads, sandwiches, $2 Water, breakfast, vegetarian", amenity: "restaurant",
    description: "Sophisticated restaurant atmosphere serving American classics such as mac-n-cheese, burgers, and salads.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gates A3 & A5", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  brooklyn_deli: restaurant({
    name: "Brooklyn Deli", cuisine: "$2 Water, American, delicatessen, sandwiches, vegetarian", amenity: "fast_food",
    description: "Hot sandwiches & comfort food with a laid-back ambiance",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B34", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  brooklyn_tea_market: restaurant({
    name: "Brooklyn Tea & Market", cuisine: "tea, coffee", amenity: "cafe",
    description: "Brooklyn Tea is a locally owned café offering a curated selection of premium loose-leaf teas, refreshing beverages, and light bites inspired by Brooklyn's vibrant culture. The concept provides travelers with a relaxing stop to enjoy handcrafted drinks and a moment of calm before their journey.",
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B28", "airside", "Mo-Su 04:00-22:00"),
    ],
  }),
  buffalo_wild_wings: restaurant({
    name: "Buffalo Wild Wings", cuisine: "bar, soda, tv, chicken, wine, alcohol, flatbreads, french fries, pretzels, salads, burger, sandwiches, cheesesteak, juice, bottled water, vegetarian, chicken wings, nachos, fries, mac & cheese, $2 Water, beer", amenity: "restaurant",
    description: "Buffalo Wild Wings features hand spun wings with a range of sauces and seasonings.",
    website: "buffalowildwings.com", logoUrl: logo("buffalowildwings.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B26", "airside", "Mo-Su 07:00-01:00"),
    ],
  }),
  chopt: restaurant({
    name: "CHOPT", cuisine: "drinks, chicken, eggs, fruits, salads, healthy salads, $2 Water", amenity: "fast_food",
    description: "Chopt brings together thoughtfully sourced ingredients and proteins, original recipes, and genuine care to serve healthy food that fits your day. From signature salads and grilled wraps to warm bowls and craft-made dressings, every meal is made to order, easy to customize, and satisfying from takeoff to touchdown.",
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Retail Hall", "airside", ""),
    ],
  }),
  dos_toros: restaurant({
    name: "Dos Toros", cuisine: "mexican, $2 Water, guacamole, pork, burrito bowls, burritos, drinks, tacos, chips & salsa", amenity: "fast_food",
    description: "Fueled by an obsession with flavor and craftsmanship, Dos Toros reimagines the taqueria with premium ingredients, relentless standards, and zero shortcuts. From Mission-style burritos and bowls to tacos and quesadillas, every item is built to deliver bold, crave-worthy flavor.",
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Retail Hall", "airside", "Mo-Su 04:30-23:00"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "coffee, espresso, macchiato, cappuccino, latte, iced coffee, tea, bottled water, juice, soda, breakfast sandwiches, donuts, bagel, muffin, croissant, eggs, bacon, sausage, waters, drinks, coffees, breakfast, sandwiches, $2 Water, vegetarian, bakery, grab & go", amenity: "cafe",
    description: "Dunkin' is an American favorite, featuring bakery, deli, and breakfast items.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B34", "airside", ""),
      o("Level 1 (Gates/Arrivals Hall)", "Arrival Lounge", "landside", "Mo-Su 05:00-22:00"),
    ],
  }),
  eastward: restaurant({
    name: "Eastward", cuisine: "$2 Water, burger, sandwiches, seafood, bar, breakfast, eggs, salads, vegetarian", amenity: "restaurant",
    description: "Eastward is known for their seafood menu featuring shrimp tacos, clam chowder, and fish.",
    vegetarian: true,
    outlets: [
      o("Level 2 (Gates)", "Gate B46", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "delicatessen, vending machine, vegetarian, salads, pastas, sandwiches, grab & go", amenity: "vending_machine",
    description: "Farmer's Fridge vending machines offer fresh chef-crafted salads, breakfast, sandwiches, and bowls, delivered daily.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 1 (Gates/Arrivals Hall)", "", "airside", ""),
      o("Level 1 (Gates/Arrivals Hall)", "", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  field_trip: restaurant({
    name: "Field Trip", cuisine: "asian, grab & go, fish, beef, chicken, salmon, $2 Water, vegetarian, drinks, International, vegan, asian fusion", amenity: "fast_food",
    description: "Chef-inspired comfort food serving signature rice bowls, braised meats, fresh sides, and handcrafted beverages with globally inspired flavors.",
    website: "fieldtripnyc.com", logoUrl: logo("fieldtripnyc.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Retail Hall", "airside", "Mo-Su 09:00-21:00"),
    ],
  }),
  five_borough_food_hall: restaurant({
    name: "Five Borough Food Hall", cuisine: "beef, chicken, bar, sandwiches, mexican, tacos, deli, pizza, mediterranean, vegan, grab & go, $2 Water", amenity: "food_court",
    description: "The Five Borough Food Hall is a food court concept with high-quality to-go items. 6 locations are available: - For Five Coffee - Deli - Dromos - 5BFH Pizza - Mango Taco - Apothecary bar Order at the counter, Pay, Enjoy",
    vegan: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "West Retail Hall", "airside", ""),
    ],
  }),
  flatiron_coffee_roasters: restaurant({
    name: "Flatiron Coffee Roasters", cuisine: "coffee beans, bottled water, soda, juice, fruit cup, energy drink, espresso, latte, hot chocolate, vegetarian, bakery, deli, coffee, sandwiches, $2 Water", amenity: "cafe",
    description: "Flatiron Coffee Roasters features specialty coffee, bakery items, and freshly made sandwiches.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Retail Hall", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  gotham_speakeasy: restaurant({
    name: "Gotham Speakeasy", cuisine: "$2 Water, Vegetarian, beer, wine, cocktails, small plates", amenity: "bar",
    description: "Restaurant & Bar concept serving American cuisine",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B36", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  hunt_fish_club: restaurant({
    name: "Hunt & Fish club", cuisine: "restaurant, bar, beer, wine, alcohol, soup, bacon, fish, salads, italian, chicken, steak, dessert, cheesesteak, hamburger, fries, shrimp, seafood, burger, cocktails", amenity: "restaurant",
    description: "Upscale New York-style steakhouse offering premium steaks, fresh seafood, and handcrafted cocktails in an elegant setting",
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B34", "landside", "Mo-Su 06:00-22:00"),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "bottled water, oatmeal, juice, vegetarian, smoothies, $2 Water", amenity: "fast_food",
    description: "Whether you're craving a classic smoothie, an energy-boosting shot, or a light snack, Jamba Juice has something for every traveler. Stop by and treat yourself to a tasty, healthy pick-me-up before your flight!",
    website: "jambajuice.com", logoUrl: logo("jambajuice.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B27", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "fast food, fries, burger, cheeseburger, hamburger, chicken, dessert, coffee, soda, juice, bottled water, milk, breakfast, breakfast sandwiches, pancakes, eggs, bacon, sausage, salads, ice cream, french fries, chicken nuggets, hashbrowns, american, $2 Water", amenity: "fast_food",
    description: "McDonald's is known around the globe for their fast food.",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Retail Hall", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  melt_shop: restaurant({
    name: "Melt Shop", cuisine: "$2 Water, american, burgers, sandwiches, chicken, breakfast, vegetarian", amenity: "fast_food",
    description: "Find great melty sandwiches here.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  mi_casa: restaurant({
    name: "Mi Casa", cuisine: "$2 Water, mexican, tacos, bar, cocktails, vegetarian, burritos", amenity: "fast_food",
    description: "Offering Mexican inspired food in a casual bar atmosphere.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B22", "airside", "Mo-Su 06:00-01:00"),
    ],
  }),
  peets_coffee_tea: restaurant({
    name: "Peet's Coffee & Tea", cuisine: "coffee, tea, iced coffee, americano, espresso, cappuccino, latte, macchiato, cookies, coffee beans, granola bar, protein bar, grab & go, juice, bottled water, soda, parfait, fruit cup, bakery, muffin, croissant, cinnamon roll, fruit, bagel, snacks, $2 Water, vegetarian", amenity: "cafe",
    description: "Peet's Coffee & Tea is known for their fresh beans, dark roast, and bakery items.",
    website: "peets.com", logoUrl: logo("peets.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B24", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  pizza_vino: restaurant({
    name: "Pizza Vino", cuisine: "bottled water, soda, juice, grab & go, sandwiches, salads, chips, cookies, iced coffee, bacon, small plates, chicken, fried chicken, buffalo wings, pasta, soup, flatbreads, meatballs, sausage, breakfast, italian, pizza, beer, wine, $2 Water", amenity: "fast_food",
    description: "Pizza Vino offers Italian small plates, individual pizzas, flatbreads, and more.",
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B29", "airside", "Mo-Su 06:00-01:00"),
    ],
  }),
  pizza_vino_bar: restaurant({
    name: "Pizza Vino Bar", cuisine: "bottled water, soda, juice, grab & go, sandwiches, salads, chips, cookies, breakfast, italian, meatballs, pizza, flatbreads, $2 Water, vegetarian", amenity: "restaurant",
    description: "Enjoy a slice of pie and a beer at the Pizza Vino Bar.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B29", "airside", "Mo-Su 10:00-01:00"),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "burger, cheeseburger, hamburger, fries, milkshake, soda, breakfast, cold brew, iced coffee, sausage, bacon, breakfast sandwiches, juice, frozen custard, chocolate, hot dog, chicago dog, chicken, fried chicken, french fries, tea, vegetarian, beer, wine, coffee, $2 Water", amenity: "fast_food",
    description: "Shake Shack grills up 100% all-natural Angus beef and crinkle cut fries.",
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B22", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "gluten-free, waters, drinks, coffees, pastry, pastries, sandwiches, vegetarian, $2 Water, coffee, breakfast, espresso, tea, vegan, kosher, grab & go", amenity: "cafe",
    description: "Starbucks offers a wide selection of handcrafted coffee and espresso beverages, teas, refreshers, and other specialty drinks. Food offerings include breakfast sandwiches, bakery items, snacks, and grab-and-go options for travelers on the move.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    vegetarian: true, vegan: true, kosher: true, glutenFree: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B26", "airside", "Mo-Su 05:00-24:00"),
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate A2", "airside", "Mo-Su 00:00-24:00", true),
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B20", "landside", ""),
    ],
  }),
  the_brooklyn_counter: restaurant({
    name: "The Brooklyn Counter", cuisine: "gluten-free, vegetarian, $2 Water, bagel, panini, sandwiches, pasta, salads, coffee, snacks, dessert, eggs, pizza", amenity: "fast_food",
    description: "Fast casual service, including bagels, paninis, and grab and go items.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate A2", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  the_palm_bar_grille: restaurant({
    name: "The Palm Bar & Grille", cuisine: "restaurant, bar, beer, wine, alcohol, soup, bacon, fish, salads, italian, chicken, steak, dessert, cheesesteak, cheeseburger, hamburger, fries, vegetarian, lobster, seafood, shrimp, crab, scallops, burger, sandwiches, $2 Water", amenity: "restaurant",
    description: "The Palm Bar & Grille grills up high-quality steaks and offers a variety of seafood dishes.",
    phone: "+1 (718) 751-4798",
    website: "thepalm.com", logoUrl: logo("thepalm.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Retail Hall", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  van_wyck_bar_grill: restaurant({
    name: "Van Wyck Bar & Grill", cuisine: "restaurant, food, Van Wyck, vegetarian, beer, American, burgers, salads, breakfast, pub fare, bar, $2 Water", amenity: "restaurant",
    description: "Sit down lounge & grill style restaurant, serving breakfast, lunch, dinner, and drinks.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "Gate B38", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  vending_machine: restaurant({
    name: "Vending Machine", cuisine: "vending", amenity: "vending_machine",
    outlets: [
      o("Level 1 (Gates/Arrivals Hall)", "Arrival Lounge", "landside", ""),
    ],
  }),
  villa_russo: restaurant({
    name: "Villa Russo", cuisine: "breakfast, lunch, dinner, vegetarian, sandwiches, italian, pizza, local, salads", amenity: "fast_food",
    description: "Villa Russo offers a taste of authentic Italian cuisine, featuring handcrafted pizzas, freshly prepared sandwiches, and classic Italian specialties made with high-quality ingredients and time-honored family recipes. Rooted in generations of culinary tradition, the concept delivers comforting, flavorful meals that combine the warmth of a neighborhood Italian kitchen with the convenience of a modern airport dining",
    vegetarian: true,
    outlets: [
      o("Level 3 (Retail Hall/Gates/AirTrain)", "B24", "airside", ""),
    ],
  }),
};

// ─── Terminal 5 ───

const terminal5Venues = {
  aunt_butchies_bakery_cafe_cegm: restaurant({
    name: "Aunt Butchie's Bakery Café - CEGM", cuisine: "waters, chips, snacks, nuts, drinks, chocolates, fruits, grab & go, vegetarian, gluten-free, vegan, kosher, $2 Water", amenity: "cafe",
    description: "This Brooklyn style Bakery and Cafe brings New York's Favorite Chocolate Mousse Cake to T5, along with its line of gourmet coffee and bakery items.",
    vegetarian: true, vegan: true, kosher: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 512", "airside", "Mo-Su 03:00-lastFlight"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "espresso, macchiato, cappuccino, latte, iced coffee, tea, bottled water, juice, waters, drinks, coffees, donuts, breakfast, sandwiches, coffee, breakfast sandwiches, muffin, vegetarian, 24/7, $2 Water", amenity: "cafe",
    description: "Great hot and iced coffee choices, donuts, bagels and more from the largest coffee and baked goods chain in the world.",
    phone: "+1 (718) 553-2988",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Check-In", "landside", ""),
      o("Level 1 (Arrivals)", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 3 (Departures/Check-In)", "Marketplace", "airside", "Mo-Su 04:30-22:00"),
    ],
  }),
  eataly_restaurant: restaurant({
    name: "Eataly Restaurant", cuisine: "sit-down, italian, pizza, pasta", amenity: "restaurant",
    description: "Eataly is a well-known Italian marketplace featuring a restaurant, bar, and grab-and-go options, providing an authentic culinary experience.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 509", "airside", "Mo-Su 04:30-23:00"),
    ],
  }),
  eataly_wine_bar: restaurant({
    name: "Eataly Wine Bar", cuisine: "bar, wine, cocktails", amenity: "bar",
    description: "Eataly is a well-known Italian marketplace featuring a restaurant, bar, and grab-and-go options, providing an authentic culinary experience.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 519", "airside", "Mo-Su 04:30-23:00"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "vending, vending machine, delicatessen, vegetarian, salads, pastas, sandwiches, vegan, healthy snacks", amenity: "vending_machine",
    description: "Farmer's Fridge vending machines offer fresh chef-crafted salads, breakfast, sandwiches, and bowls, delivered daily.",
    website: "farmersfridge.com", logoUrl: logo("farmersfridge.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 1 (Arrivals)", "Arrivals", "landside", ""),
      o("Level 3 (Departures/Check-In)", "Gate 507", "airside", ""),
    ],
  }),
  gameway: restaurant({
    name: "GameWay", cuisine: "retail, shop, video games, $2 Water", amenity: "bar",
    description: "Gameway Lounges transform everyday waiting into a premium gaming experience. Built for travelers, explorers, and anyone on the move, Gameway offers immersive, high quality gaming environments in convenient, high traffic locations, turning downtime into something you actually look forward to.",
    website: "gameway.gg", logoUrl: logo("gameway.gg"),
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 507", "airside", "Mo-Su 05:00-23:00"),
    ],
  }),
  horizon_bakery_cegm: restaurant({
    name: "Horizon Bakery - CEGM", cuisine: "croissant, espresso, latte, kosher, grab & go, waters, chips, snacks, nuts, drinks, chocolates, fruits, grab and go, bar, coffee, cappuccino, americano, iced coffee, tea, vegan, vegetarian, gluten-free, $2 Water", amenity: "cafe",
    description: "This French-inspired bakery with delicious pastries to jumpstart your morning and a full bar to help you unwind in the evening.",
    vegetarian: true, vegan: true, kosher: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 1", "airside", ""),
    ],
  }),
  jacobs_pickles: restaurant({
    name: "Jacob's Pickles", cuisine: "food, american, comfort food, vegetarian, gluten-free", amenity: "restaurant",
    description: "\"Jacob's Pickles is not just a restaurant; it is a community.\" Launched in 2011, Jacob's Pickles has quickly become a New York staple for those in search of a good meal. Warm and inviting, friends travel daily to its doors on the Upper West Side for a taste of home, something more than just another trending hotspot.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 508", "airside", "Mo-Su 04:00-23:00"),
    ],
  }),
  jamba_juice_cibo_express: restaurant({
    name: "Jamba Juice/CIBO Express", cuisine: "fruit, bottled water, juice, soda, chips, nuts, waters, coffees, pastry, pastries, bagels, cafe, beverages, bakery, snacks, drinks, chocolates, fruits, grab and go, grab & go, smoothies, frozen yogurt, sandwiches, salads, vegetarian, $2 Water", amenity: "fast_food",
    description: "Sun-kissed, fruit-filled smoothies and other healthy snack options.",
    phone: "+1 (510) 596-0100",
    vegetarian: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Marketplace", "airside", "Mo-Su 05:00-20:30"),
    ],
  }),
  jfk_life_market_t5: restaurant({
    name: "JFK Life Market T5", cuisine: "grab & go, snacks, $2 Water", amenity: "fast_food",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 510", "airside", ""),
    ],
  }),
  leons_bagels: restaurant({
    name: "Leon's Bagels", cuisine: "bagels, $2 Water, breakfast", amenity: "cafe",
    description: "Leon's Bagels is a proudly independent, NYC-born bagel shop founded by Chris Taha in 2021. Built on a \"nothing fancy\" ethos, Leon's focuses on what truly matters - quality ingredients, soft and glutinous bagels, and bold, satisfying flavor combinations.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 505", "airside", ""),
    ],
  }),
  melt_shop: restaurant({
    name: "Melt Shop", cuisine: "American, burgers, sandwiches, milkshakes, chicken, breakfast", amenity: "fast_food",
    description: "Melt Shop is a casual dining restaurant specializing in gourmet grilled cheese sandwiches and comfort food. With a focus on high-quality ingredients, the menu features classic favorites and unique creations made to order. From melty sandwiches to crispy tater tots and decadent milkshakes, Melt Shop elevates the grilled cheese experience in a warm, inviting atmosphere. It's a go-to spot for cheese lovers and comfort food enthusiasts alike.",
    website: "meltshop.com", logoUrl: logo("meltshop.com"),
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 525", "airside", ""),
    ],
  }),
  nom_wah_bar: restaurant({
    name: "Nom Wah Bar", cuisine: "bar, asian", amenity: "bar",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gates 525", "airside", "Mo-Su 06:00-23:00"),
    ],
  }),
  nom_wah_restaurant: restaurant({
    name: "Nom Wah Restaurant", cuisine: "breakfast, asian, dumplings", amenity: "restaurant",
    description: "Known for its handmade dumplings and classic dim sum dishes, the brand brings more than a century of culinary tradition to travelers passing through Terminal 5.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gates 525", "airside", "Mo-Su 05:00-23:00"),
    ],
  }),
  park_ave_emporium: restaurant({
    name: "Park Ave Emporium", cuisine: "shop, grab & go, $2 Water", amenity: "fast_food",
    description: "A Manhattan inspired travel convenience store. It offers passengers local artisan products, souvenirs, gifts, snacks, and travel essentials, featuring self-checkout technology for convenience.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 529", "airside", ""),
    ],
  }),
  re_vive_bar: restaurant({
    name: "Re:Vive Bar", cuisine: "bar, beer, wine, cocktails", amenity: "bar",
    description: "Located down each concourse, stop in at these \"sidewalk\" bars conveniently located on the way to your gate.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 506", "airside", "Mo-Su 05:00-20:30"),
      o("Level 3 (Departures/Check-In)", "Gate 15", "airside", ""),
    ],
  }),
  revolucion: restaurant({
    name: "Revolucion", cuisine: "bar, restaurant, mexican, breakfast, margaritas, chips & salsa, vegetarian, vegan, gluten-free, tv", amenity: "restaurant",
    description: "Revolucion is a celebration of Mexico's authentic flavors, showcasing regional dishes that reflect the spirit of Mexican cooking.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 512", "airside", ""),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "burger, american, fries, hot dog, $2 Water", amenity: "fast_food",
    description: "Shake Shack is a popular burger chain renowned for its shakes and fries, as well as offering breakfast options.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Marketplace", "airside", "Mo-Su 11:00-22:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "waters, drinks, coffees, pastry, pastries, sandwiches, coffee, grab & go, snacks, breakfast, vegetarian, vegan, gluten-free, kosher, $2 Water, tea", amenity: "cafe",
    description: "Start your morning, or your trip, off right by enjoying your favorite Starbucks drink here at T5.",
    phone: "+1 (718) 917-0436",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    vegetarian: true, vegan: true, kosher: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 522", "airside", "Mo-Su 05:00-20:30"),
    ],
  }),
  the_halal_guys: restaurant({
    name: "The Halal Guys", cuisine: "food, local, halal, $2 Water", amenity: "fast_food",
    description: "The Halal Guys serves \"American halal\" platters and sandwiches, prepared using ingredients such as chicken, gyro meat, falafel, and rice.",
    halal: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gates 525", "landside", "Mo-Su 05:00-23:00"),
    ],
  }),
  vending_machine: restaurant({
    name: "Vending Machine", cuisine: "", amenity: "vending_machine",
    outlets: [
      o("Level 1 (Arrivals)", "Baggage Claim", "airside", ""),
    ],
  }),
};

// ─── Terminal 7 ───

const terminal7Venues = {
  apartment_7b_deli_market: restaurant({
    name: "Apartment 7B Deli & Market", cuisine: "grab & go, coffee, salads, chicken, $2 Water, vegetarian, breakfast", amenity: "fast_food",
    description: "Inspired by the feel of a classic New York apartment, Apt 7B is built for quick bites and busy days in the city. Offering fresh sandwiches, grab-and-go favorites, and everyday comfort food, it brings fast-paced NYC flavor with convenience to match",
    vegetarian: true,
    outlets: [
      o("Level 3 (Departures)", "Food Court", "airside", "Mo-Su 04:00-18:00"),
    ],
  }),
  bento_sushi: restaurant({
    name: "Bento Sushi", cuisine: "sushi, vegetarian, vegan, gluten-free, $2 Water, lunch, dinner", amenity: "fast_food",
    description: "Japanese-style grab-and-go sushi and fresh rolls, prepared daily and perfect for travelers who want a quick, clean, delicious meal before takeoff. Bento brings the craft of fresh and high-quality sushi from the counter to your tray.",
    website: "bentosushi.com", logoUrl: logo("bentosushi.com"),
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures)", "Food Court", "airside", "Mo-Su 08:00-24:00"),
    ],
  }),
  brindle_room: restaurant({
    name: "Brindle Room", cuisine: "restaurant, chips, bar, burger, salad, chicken, sit-down, vegetarian, fries", amenity: "restaurant",
    description: "Born in the East Village's Alphabet City in New York, Brindle Room is known for its burgers and honest approach to quality food. Their award-winning \"Sebastian Burger\" was featured on Diners Drive ins and Dives. What started as a neighborhood staple remains rooted in the same mission: simple ingredients, done right.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Departures)", "Food Court", "airside", "Mo-Su 08:00-20:00"),
    ],
  }),
  brooklyn_rebel: restaurant({
    name: "Brooklyn Rebel", cuisine: "pizza, sandwiches, salads, wood-fired, vegan, vegetarian, gluten-free, $2 Water", amenity: "fast_food",
    description: "Brooklyn Rebel serves up authentic New York-style pizza meant to be folded, not fussed over. With big slices, crispy crusts, and bold flavor, every bite brings the unmistakable attitude of NYC.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures)", "Food Court", "airside", "Mo-Su 08:00-24:00"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "espresso, macchiato, cappuccino, latte, iced coffee, tea, bottled water, juice, waters, drinks, coffees, donuts, breakfast, sandwiches, breakfast sandwiches, muffin, $2 Water, coffee, vegetarian, gluten-free", amenity: "cafe",
    description: "Fuel your journey with freshly brewed coffee, iconic donuts, and grab-and-go favorites made for life on the move. Whether you're starting your day or taking a break between flights, Dunkin' keeps you running.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 1 (Arrivals)", "Arrivals", "landside", "Mo-Su 05:00-19:00"),
      o("Level 3 (Departures)", "Gate 9", "airside", "Mo-Su 04:30-23:00"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "breakfast, lunch, dinner, automated retail, delicatessen, vending machine, vegetarian, salads, pastas, sandwiches, vegan, gluten-free, grab & go, drinks", amenity: "vending_machine",
    description: "Farmer's Fridge vending machines offer fresh chef-crafted salads, breakfast, sandwiches, and bowls, delivered daily.",
    website: "farmersfridge.com", logoUrl: logo("farmersfridge.com"),
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures)", "Gate 2", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 2 (Ticketing/Check-In)", "Near escalators", "landside", ""),
    ],
  }),
  irving_farm_coffee_roasters: restaurant({
    name: "Irving Farm Coffee Roasters", cuisine: "bagels, muffins, danish, pastries, almond, coffee, snacks, bakery, cafe, latte, cappuccino, breakfast, vegetarian, $2 Water", amenity: "cafe",
    description: "Founded in 1996 in New York City, Irving Farm helped lead the specialty-coffee movement by sourcing and roasting high-quality beans. Today, their coffee is still thoughtfully roasted in New York and served with care and intention. At Terminal 7, enjoy fresh-brewed coffee and pastries - the kind New Yorkers proudly travel with.",
    vegetarian: true,
    outlets: [
      o("Level 3 (Departures)", "Food Court", "airside", "Mo-Su 04:00-18:00"),
    ],
  }),
  le_grand_comptoir: restaurant({
    name: "Le Grand Comptoir", cuisine: "bar, tv, alcohol, food, sit-down, view, drinks, cheese plate, sandwiches, beer, breakfast, salads, vegetarian, vegan, gluten-free, small plates, wine", amenity: "restaurant",
    description: "An upscale wine-bar experience in the heart of the terminal. Offering curated wines and small plates for a refined, relaxed moment before departure. Perfect for unwinding, celebrating, or simply savoring a moment between travels.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures)", "Gate 6", "airside", "Mo-Su 12:00-01:00"),
    ],
  }),
  true_burger: restaurant({
    name: "True Burger", cuisine: "burger, chicken, tenders, soda, fries, breakfast, vegetarian, gluten-free, $2 Water", amenity: "fast_food",
    description: "True Burger Company is built on sustainable sourcing and locally inspired ingredients, bringing quality and conscience together in every bite. Their identity reflects a sense of honesty and pioneering spirit, delivering burgers that are bold, simple, and made the right way.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures)", "Food Court", "airside", "Mo-Su 08:00-21:00"),
    ],
  }),
};

// ─── Terminal 8 ───

const terminal8Venues = {
  alidoro: restaurant({
    name: "Alidoro", cuisine: "vegetarian, breakfast, American, delicatessen, sandwiches, grab & go, $2 Water, italian", amenity: "fast_food",
    description: "An Italian specialty sandwich shop originally founded in 1986 in the heart of New York City's SoHo, now with locations across NYC. We offer over 40 different sandwiches that we make fresh daily from only the finest Italian ingredients.",
    website: "alidoronyc.com", logoUrl: logo("alidoronyc.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gates 39 and 41", "airside", ""),
    ],
  }),
  bagel_boss: restaurant({
    name: "Bagel Boss", cuisine: "$2 Water, coffee, tea, bagels", amenity: "cafe",
    description: "Enjoy classic New York-style bagels, flagels, Black & White cookies, deli items, coffee, and more, providing a taste of authentic NYC.",
    website: "meracorporation.com", logoUrl: logo("meracorporation.com"),
    outlets: [
      o("Level 3 (Departures/Check-In)", "Food Hall", "airside", "Mo-Su 04:00-19:00"),
    ],
  }),
  bklyn_blend: restaurant({
    name: "BKLYN Blend", cuisine: "Coffee, Espresso, Cappuccino, Latte, Mocha, Coldbrew, Brooklyn, Blend, Café, Smoothies, Healthy, Organic, Breakfast, Avocado, Toast, Vibes, Local, NYC, Fresh, Chill, Barista, Beans, Brew, Hip, Artisan, sandwiches, breakfast sandwiches, $2 Water", amenity: "cafe",
    description: "This Brooklyn-based Black-owned juice bar provides healthy smoothies, shakes, nutritious foods, and fresh juices.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 12", "airside", "Mo-Su 04:30-22:30"),
    ],
  }),
  black_star_bakery_cafe: restaurant({
    name: "Black Star Bakery & Cafe", cuisine: "coffee, $2 Water, bakery", amenity: "cafe",
    description: "A popular New York coffee & pastry spot recently opened in the new Boroughs Foodhall at Terminal 8, offering quality coffee, bagels, baked goods, and light meals",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Food hall", "airside", "Mo-Su 04:00-19:00"),
    ],
  }),
  black_tap_bar: restaurant({
    name: "Black Tap Bar", cuisine: "bar, cocktails, beer", amenity: "bar",
    description: "Serving cocktails and brews.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 34", "airside", ""),
    ],
  }),
  cobblestones_biergarten_bar: restaurant({
    name: "Cobblestones Biergarten & Bar", cuisine: "liquor, beer, comfort food, wine, food court, $2 Water", amenity: "bar",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Food Hall", "airside", ""),
    ],
  }),
  dos_toros_taqueria: restaurant({
    name: "Dos Toros Taqueria", cuisine: "restaurant, bottled water, drinks, spirits, tea, soda, burrito bowls, eggs, pastries, bakery, dessert, pretzels, burritos, vegetarian, vegan, nachos, salads, mexican, $2 Water", amenity: "restaurant",
    description: "Dos Toros is a taqueria chain that offers fresh, flavorful and melty burritos, tacos, quesadillas, bowls, salads and nachos.",
    website: "dostoros.com", logoUrl: logo("dostoros.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 35", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  dos_toros_tequila_bar: restaurant({
    name: "Dos Toros Tequila Bar", cuisine: "cocktails, bar, drinks", amenity: "bar",
    description: "Tequila bar featuring specialty cocktails and a sophisticated tequila collection in a welcoming setting, providing an authentic Bay Area taste.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 31", "airside", ""),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "vegetarian, Coffee, Donuts, Breakfast, Espresso, Iced, Hot, Latte, Cappuccino, Bagels, Sandwiches, Bakery, Tea, Coldbrew, Mocha, Muffins, Croissant, Combo, Pastries, Snacks, Brew, Java, Quick, Sweet, Treats, waters, drinks, coffees, $2 Water, food, café, bottled water, breakfast sandwiches", amenity: "cafe",
    description: "Dunkin' keeps you running with freshly brewed coffee, handcrafted espresso drinks, and a wide variety of donuts, breakfast sandwiches, and baked goods served fast and fresh all day.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "The Great Hall", "airside", "Mo-Su 04:00-24:00"),
      o("Level 3 (Departures/Check-In)", "Gates 39 and 41", "airside", ""),
      o("Level 1 (Arrivals/Connecting Tunnel)", "Baggage Claim", "landside", ""),
    ],
  }),
  eataly: restaurant({
    name: "Eataly", cuisine: "italian, panini, sandwich, breakfast, bakery, croissant, lunch, grab, takeaway, $2 Water, grab & go, wine, coffee", amenity: "cafe",
    description: "Eataly offers a true Italian coffee bar experience with expertly crafted espresso, pastries, and light bites served in a warm, fast-paced, and welcoming atmosphere.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 43", "airside", ""),
      o("Level 3 (Departures/Check-In)", "Gate 45", "airside", ""),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "salads, sandwiches, vegan, vegetarian, vending machine", amenity: "vending_machine",
    description: "Farmer's Fridge vending machines offer fresh chef-crafted salads, breakfast, sandwiches, and bowls, delivered daily.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "", "landside", ""),
      o("Level 3 (Departures/Check-In)", "", "landside", ""),
      o("Level 3 (Departures/Check-In)", "", "landside", ""),
      o("Level 1 (Arrivals/Connecting Tunnel)", "", "landside", ""),
    ],
  }),
  food_hall: restaurant({
    name: "Food Hall", cuisine: "$2 Water, restaurants, food court", amenity: "food_court",
    description: "The Boroughs Food Hall delivers a curated experience spanning local specialties, street food, upscale dining, health conscious options, and comfort food-offering unparalleled convenience and choice.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Retail hall", "airside", ""),
    ],
  }),
  gameway: restaurant({
    name: "Gameway", cuisine: "services, entertainment, gaming, gate8, tech, xbox, playstation, alcohol, bar, snacks, video games, arcades", amenity: "bar",
    description: "Level up your layover with 31 premium gaming stations featuring PS5, Xbox, PC, and retro consoles. Each gaming station is equipped with the newest technology, high speed internet, luggage storage, as well as food and drinks.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 8", "airside", ""),
    ],
  }),
  guy_fieris_flavortown: restaurant({
    name: "Guy Fieri's Flavortown", cuisine: "pizza", amenity: "fast_food",
    description: "Celebrity chef Guy Fieri brings his real-deal flavors and indulgent creations to this eatery, from his signature bourbon brown sugar BBQ wings to his award-winning Mac N' Cheeseburger.",
    website: "meracorporation.com", logoUrl: logo("meracorporation.com"),
    outlets: [
      o("Level 3 (Departures/Check-In)", "Food Hall", "airside", "Mo-Su 10:30-22:00"),
    ],
  }),
  jimmy_johns: restaurant({
    name: "Jimmy John's", cuisine: "food, sandwiches, $2 Water", amenity: "fast_food",
    description: "Fresh, fast, and freaky good-Jimmy John's serves up made-to-order sandwiches with fresh-baked bread and quality ingredients at lightning speed.",
    outlets: [
      o("Level 1 (Arrivals/Connecting Tunnel)", "Baggage Claim", "landside", ""),
    ],
  }),
  licorice: restaurant({
    name: "Licorice", cuisine: "vending machine, candy", amenity: "vending_machine",
    description: "Vending machine offering high-end taffy, licorice, and caramels.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "", "landside", ""),
    ],
  }),
  mito: restaurant({
    name: "Mito", cuisine: "dining, premium, sushi, Japanese", amenity: "restaurant",
    description: "This New York Asian hot spot offers freshly made and high quality modern Japanese dishes including sushi, dim sum, and more.",
    website: "meracorporation.com", logoUrl: logo("meracorporation.com"),
    outlets: [
      o("Level 3 (Departures/Check-In)", "Food Hall", "airside", "Mo-Su 11:00-22:00"),
    ],
  }),
  naya: restaurant({
    name: "Naya", cuisine: "$2 Water, mediterranean", amenity: "fast_food",
    description: "NAYA brings the vibrant flavors of the Middle East to life with build-your-own bowls, wraps, and plates made from fresh, authentic ingredients.",
    website: "meracorporation.com", logoUrl: logo("meracorporation.com"),
    outlets: [
      o("Level 3 (Departures/Check-In)", "Food Hall", "airside", "Mo-Su 11:00-22:00"),
    ],
  }),
  neirs_tavern: restaurant({
    name: "Neir's Tavern", cuisine: "", amenity: "bar",
    description: "Neir's Tavern features drinks and traditional pub food.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 32", "airside", ""),
    ],
  }),
  nolita_wine_bar: restaurant({
    name: "Nolita Wine Bar", cuisine: "sandwiches, charcuterie plate, wine, cocktails", amenity: "bar",
    description: "Wine bar featuring sandwiches, charcuterie plates, wines by the glass and cocktails.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "", "airside", ""),
    ],
  }),
  peach_palace_by_momofuku: restaurant({
    name: "Peach Palace by Momofuku", cuisine: "drinks, chinese, eggs, coffee, dessert, asian fusion, cocktails, brunch, noodles, breakfast sandwiches", amenity: "restaurant",
    description: "This debut concept by global celebrity chef David Change serves up Asian-American cuisine and drinks amid a lively, fun, and high-energy vibe.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "stairs up to lounges", "airside", ""),
    ],
  }),
  petit_gourmet: restaurant({
    name: "Petit Gourmet", cuisine: "", amenity: "restaurant",
    outlets: [
      o("Level 3 (Departures/Check-In)", "", "airside", ""),
    ],
  }),
  pret_a_manger: restaurant({
    name: "Pret a Manger", cuisine: "", amenity: "restaurant",
    description: "Pret A Manger offers freshly prepared sandwiches, salads, and organic coffee made daily in-shop, delivering wholesome, on-the-go meals with a commitment to natural ingredients and sustainability.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 4", "airside", ""),
      o("Level 3 (Departures/Check-In)", "Gate 44", "airside", ""),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "burger, cheeseburger, hamburger, fries, milkshake, soda, breakfast, cold brew, iced coffee, sausage, bacon, breakfast sandwiches, juice, frozen custard, chocolate, hot dog, chicago dog, chicken, fried chicken, french fries, tea, serving burgers, shakes, crinkle-cut fries, and more., burgers, gate8, lunch, nyfavorites, shack, shake, takeaway, milkshakes, $2 Water", amenity: "fast_food",
    description: "A NYC original turned global sensation, serving burgers, shakes, crinkle-cut fries, and more.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 12", "airside", "Mo-Su 04:30-22:30"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "tea, vegan, bakery, breakfast, coffee, grab, lunch, matcha, sandwich, grab & go, sandwiches, pastries, lunches, dinners, vegetarian, gluten-free, kosher, waters, drinks, coffees, breakfasts, pastry, espresso, $2 Water", amenity: "cafe",
    description: "Grab your favorite coffee or tea, plus a full menu of breakfast, lunch, and snack options to keep you fueled on the go.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    vegetarian: true, vegan: true, kosher: true, glutenFree: true,
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 46", "airside", ""),
      o("Level 3 (Departures/Check-In)", "Gate 10", "airside", "Mo-Su 16:30-22:30"),
    ],
  }),
  tender_crush: restaurant({
    name: "Tender Crush", cuisine: "chicken, sandwiches, milkshake", amenity: "fast_food",
    description: "Tender Crush features chicken dishes and sandwiches.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 40", "airside", ""),
    ],
  }),
  the_blinded_tiger: restaurant({
    name: "The Blinded Tiger", cuisine: "", amenity: "bar",
    description: "T8's very own speakeasy bar is a nod to New York's best hidden bars of the Roaring Twenties, and a first for JFK.",
    outlets: [
      o("Level 3 (Departures/Check-In)", "", "airside", "Mo-Su 05:00-23:30"),
    ],
  }),
  the_golden_krust: restaurant({
    name: "The Golden Krust", cuisine: "$2 Water, Jamaican", amenity: "fast_food",
    description: "A Jamaican fastfood restaurant offering patties and more.",
    website: "goldenkrust.com", logoUrl: logo("goldenkrust.com"),
    outlets: [
      o("Level 1 (Arrivals/Connecting Tunnel)", "Arrivals / Baggage Claim", "landside", "Mo-Su 05:30-23:30"),
    ],
  }),
  zaros_family_bakery: restaurant({
    name: "Zaro's Family Bakery", cuisine: "bottled water, drinks, spirits, tea, soda, burrito bowls, eggs, pastries, bakery, dessert, pretzels, coffee, desserts, donuts, café, salads, sandwiches, $2 Water", amenity: "cafe",
    description: "Zaro's is a fourth-generation bakery, handmade in the Bronx from our family to yours since 1927. Travelers will have an exquisite selection of quality baked goods such as bagels and pastries, deli sandwiches, and Zaro's very own house blend coffee.",
    website: "zaro.com", logoUrl: logo("zaro.com"),
    outlets: [
      o("Level 3 (Departures/Check-In)", "Gate 35", "airside", ""),
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
  const r2 = await processTerminal(AIRPORT, TERMINAL_4, 'Terminal 4', terminal4Venues);
  const r3 = await processTerminal(AIRPORT, TERMINAL_5, 'Terminal 5', terminal5Venues);
  const r4 = await processTerminal(AIRPORT, TERMINAL_7, 'Terminal 7', terminal7Venues);
  const r5 = await processTerminal(AIRPORT, TERMINAL_8, 'Terminal 8', terminal8Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_4, TERMINAL_5, TERMINAL_7, TERMINAL_8]));

  const totalCreated = r1.created + r2.created + r3.created + r4.created + r5.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r4.deleted + r5.deleted;
  const totalVenues = Object.keys(terminal1Venues).length
    + Object.keys(terminal4Venues).length
    + Object.keys(terminal5Venues).length
    + Object.keys(terminal7Venues).length
    + Object.keys(terminal8Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
