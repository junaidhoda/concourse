'use strict';
/**
 * Fills in complete data for LaGuardia Airport (LGA) — restaurants/cafés/bars
 * in Firestore. Researched 2026-08-17 from the airport's own interactive map at
 * maps.laguardiaairport.com, using Claude in Chrome browser automation per
 * explicit user instruction. No third-party/aggregator source was used for any
 * venue field.
 *
 * SOURCE: LGA's own map is a LocusLabs application on the Port Authority's own
 * account A119NSPH8JLU80 — the same account behind JFK's map and directory,
 * whose venue index (a.locuslabs.com/accounts/A119NSPH8JLU80/v5.json) lists
 * ewr, jfk, lga and swf. The structured backing data is:
 *   …/lga/2026-08-13T17:14:36/v5/pois-3.0-lga.json   (829 POIs)
 *   …/lga/2026-08-13T17:14:36/v5/venueData-lga.json  (structures and levels)
 * plus the live overlay marketplace.locuslabs.com/venueId/lga/dynamic-poi.
 * 72 POIs carry an `eat*` category. Each supplies poiId, name, category,
 * description, operationHours, phone, links[], isAfterSecurity,
 * position.floorId, nearbyLandmark and keywords[]. This is the airport's own
 * published venue data, behind the airport's own map.
 *
 * DYNAMIC OVERLAY CHECKED, NOT NEEDED: the venue index sets hasDynamicPOIs, so
 * the live overlay was fetched. It contains 5 records and every one is a
 * security POI with queue timings — no dining record is added, removed or
 * overridden by it, so the static POI file stands as published.
 *
 * EXTRACTION + VERIFICATION: the dining records were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter, `|` list delimiter) with every
 * non-ASCII character replaced by a reversible `<U+hex>` escape and every field
 * whitespace-normalised in the browser before checksumming, split into 5 chunks
 * under 6,600 chars on line boundaries, written into a `<pre id="dataDump">`
 * and retrieved via get_page_text. Every chunk verified EXACTLY on first pass
 * against values computed in the browser before retrieval — len/lines/checksum:
 * 6307/15/28610892, 6277/16/27837160, 6283/16/28033203, 6324/19/27837482,
 * 2774/6/12452538 — and the rejoined 72-line dataset at len 27969, checksum
 * 124496352. A second small table carrying LGA's own service-style tags
 * (quickServiceEat / fullServiceEat) was extracted and verified the same way:
 * 72 lines, len 1640, checksum 6821260. Both use
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 3 buckets (Terminals A, B and C), settled on LGA's own
 * data. Its map models exactly three structures — "Terminal A", "Terminal B"
 * and "Terminal C" — and each passes both halves of this dataset's test
 * independently. OWN CHECK-IN: Terminal A has Spirit Airlines Check-In and its
 * self-service kiosks on lga-ta-1; Terminal B has American, United, Southwest
 * and Air Canada check-in plus its own lettered Check-In A–H islands on
 * lga-tb-3 (a level LGA itself names "Check-in / To Gates"); Terminal C has
 * Delta Sky Priority Check-In and its self check-in kiosks on lga-tc-2. OWN
 * SECURITY: LGA's own checkpoint records sit one per terminal — "Security
 * Checkpoint - Terminal A" (lga-ta-1), "Checkpoint" (lga-tb-3) and "Security
 * Checkpoint" (lga-tc-3) — with TSA PreCheck lanes alongside each. B and C are
 * separate buildings with no post-security connection between them, so nothing
 * merges. Applying the test WITHIN a terminal produces no further split: no
 * terminal holds a second independent check-in/security pair, and Terminal B's
 * two concourses are fed by that single Level 3 checkpoint.
 *
 * TERMINAL A HAS NO ACTIVE DINING — this is the one thing worth flagging. It
 * is a genuine bucket by the test above, but LGA publishes ZERO active dining
 * POIs in it: its six food records — CIBO Express Gourmet Markets (×2),
 * Dunkin', Salotto and two vending machines — all carry the airport's own
 * `inactive` category rather than an `eat*` one. So `terminalAVenues` is
 * deliberately an EMPTY object. It is kept in the file rather than dropped so
 * that a run still WIPES any stale Terminal A venue left over from an earlier
 * revision, instead of leaving those docs behind. Nothing was invented to fill
 * it, and if LGA reopens concessions there this file will pick them up.
 *
 * AIRSIDE / LANDSIDE: taken directly from each POI's own `isAfterSecurity`
 * boolean — true → `airside`, false → `landside`. Present on all 72 records;
 * no inference was needed.
 *
 * LEVEL: LGA's own level name followed by its own level detail string, both
 * verbatim from venueData — "Food & Shops (Level 4)", "Baggage / Gates (Level
 * 2)", "Check-in / To Gates (Level 3)", "Mezzanine (Level 3A)", "Bus &
 * Shuttles (Level 1)", "Departures (Level 2)", "Security (Level 3)",
 * "Arrivals (Level 1)".
 *
 * LOCATION_NOTES: each POI's own `nearbyLandmark` verbatim — "Food Hall",
 * "Gate 41", "Food Hall near Gate 61", "Bridge to Gates 11-31", "Bridge to
 * Gates 40-59", "Concourse to 90s Gates", "Upper Level (Gates 80-89)",
 * "Atrium", "United Club", "Baggage Claim", "Level 1". Left BLANK for the two
 * records where LGA publishes none, rather than guessing.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal are merged
 * into one doc with one `outlets[]` entry per physical unit; same-brand venues
 * in DIFFERENT terminals stay separate docs, per this dataset's standing rule.
 * So Starbucks is two docs — one for Terminal B, one for Terminal C (6 units) —
 * and Wendy's likewise one per terminal. Terminal C's two separate Terrace Bar
 * units (Gate 70 and Gate 80) merge into one doc with two outlets. Brand
 * matching is case- and apostrophe-insensitive; LGA needs no rendering aliases,
 * as every brand it repeats within a terminal is spelled identically each time.
 * Distinctly NAMED venues are kept separate per this dataset's
 * page-truth-over-label precedent: "Dos Toros" (T-C) vs "Dos Toros Taqueria"
 * (T-B); "CIBO Express Gourmet Markets" vs "CIBO Express Foodhall". 72 records
 * → 64 docs.
 *
 * CUISINE: the verbatim join of each POI's own user-searchable `keywords[]`,
 * in LGA's own order, unfiltered — including the airport's own "$2 Water"
 * value-programme tag, its "After Security" zone tag, its dietary tags and the
 * occasional marketing fragment left in its own keyword list ("lgaatrium",
 * "starbucksmugs", "cakepop", "lightbites"). Only the taxonomy identifiers are
 * dropped, since they are not cuisine or genre at all: the venue's own name,
 * the bare category strings ("eat", "eat.bar", "eat.coffee"), the "category:*"
 * strings, and the two service-style tags, which are used for `amenity`
 * instead. Where outlets were merged, the union of their keyword sets is used,
 * first-seen order preserved.
 *
 * AMENITY: driven by LGA's own POI category first — `eat.coffee` → `cafe`, and
 * a name containing "Food Hall"/"Foodhall"/"Food Court" → `food_court` (CIBO
 * Express Foodhall). Per this dataset's standing rule the `eat.bar` category is
 * NOT taken on its own: each eat.bar record was checked against its own name
 * and description, which overturns the tag where the name names a food format
 * or the description calls the venue a restaurant — that is what keeps Mulberry
 * Street a `restaurant` ("This isn't just a chef-driven restaurant"), while
 * Bar 212, Bar Veloce, Panorama Bar, Terrace Bar, Spirit & Bell, Orpheus +
 * Apollo and Pour Authority all stand as `bar`. A drinks word in the name of a
 * plain `eat` venue is treated the same way and additionally yields to LGA's
 * own full-service tag, which is what keeps "Talde Noodle Bar" ("Asian fusion
 * restaurant by celebrity chef Dale Talde") and "Flatiron Tavern & Provisions"
 * restaurants. Otherwise: a coffee/café/bagel/bakery/roasters name → `cafe`,
 * unless LGA also publishes the venue as full-service — which is what keeps
 * "Poppy's Bagels / Chuko Ramen" a restaurant, since its own blurb says "Chuko
 * Ramen has a full-service restaurant and bar". Then LGA's own `quickServiceEat`
 * tag → `fast_food`, its own `fullServiceEat` tag → `restaurant`, a "grab & go"
 * keyword → `fast_food`, otherwise `restaurant`. Four venues carry BOTH service
 * tags because they run a full-service room and a grab-and-go counter side by
 * side (Il Viaggio, Talde Noodle Bar, Soleil Brasserie, La Chula Bar &
 * Taqueria); where both are published the full-service tag wins. NOTE: LGA
 * publishes "Junior's Restaurant and Cheesecake" as quickServiceEat despite the
 * word Restaurant in its name, and that is taken at the airport's own word.
 * Resulting mix across the 72 records: 28 fast_food, 19 restaurant, 16 cafe,
 * 8 bar, 1 food_court. No `vending_machine` — LGA publishes no `eat.vending`
 * POI in Terminal B or C, and Terminal A's two vending records are `inactive`.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: set to 'yes' ONLY where
 * LGA's own keyword list says so — "Vegetarian", "Vegan", "Gluten Free",
 * "Halal" and "Kosher" each set their own flag and nothing else does. Where
 * outlets were merged, a flag is set if ANY merged unit carries the keyword.
 *
 * DESCRIPTION: verbatim from each POI's own `description` field,
 * whitespace-normalised only. Two records (Queens Corner and the Terminal C
 * CIBO Express Foodhall's sibling entry) are published by LGA with an empty
 * description and are left blank rather than given one.
 *
 * OPENING HOURS / 24-7: `opening_hours` is the POI's own `operationHours`
 * string verbatim, in LGA's own OSM-style notation ("Mo-Su 05:00-22:00",
 * "Mo-Su 06:30-15:30", "Mo-Su 06:00-02:00"). 8 records carry no hours and are
 * left blank. `open_24_7` is set where that string contains "00:00-24:00" OR
 * where LGA's own keyword list carries its "24-hour" tag.
 *
 * PHONE: taken ONLY from the POI's own structured `phone` field, never
 * regex-scraped from description prose. LGA publishes one on just three
 * records and its own formatting is preserved as published — "+1 (866)
 * 508-3558", "+1 (646) 747-7200" and "+(800) 227-4825" appear in LGA's data
 * exactly as written here.
 *
 * WEBSITE / LOGO: taken from each POI's own `links[]` entry of type "primary",
 * reduced to a bare domain. These are the airport's own published links and
 * are used as published even where the link is the terminal operator's
 * marketplace site rather than the venue's own — Green Leaf's, Dos Toros
 * Taqueria and Tony and Benny's Pizza Parlor all link to
 * marketplace.laguardiab.com in LGA's own data, and the two Atrium venues link
 * to atriumlga.com; that is left as the airport publishes it rather than
 * swapped for a guessed brand domain. Venues LGA publishes with no link get a
 * blank `website` and no logo.
 *
 * VERIFIED TOTALS: 72 source dining POIs → 64 restaurant docs / 72 outlets.
 * Terminal A: 0 records → 0 docs / 0 outlets (see above). Terminal B: 34
 * records → 32 docs / 34 outlets. Terminal C: 38 → 32 / 38.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['lga', 'laguardia', 'new-york-laguardia'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_A = 'terminal_a';
const TERMINAL_B = 'terminal_b';
const TERMINAL_C = 'terminal_c';

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


// ─── Terminal A ───

const terminalAVenues = {

};

// ─── Terminal B ───

const terminalBVenues = {
  '5_boroughs_food_emporium': restaurant({
    name: "5 Boroughs Food Emporium", cuisine: "pastries, After Security, sushi, breakfast, sandwiches, salad, Vegetarian, Kosher, $2 Water", amenity: "fast_food",
    description: "5 Boroughs Food Emporium offers a modern, dynamic energetic marketplace curated with a great selection of snacks, treats, sandwiches, drinks and more from local purveyors.",
    vegetarian: true, kosher: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 59", "airside", "Mo-Su 05:00-18:00"),
    ],
  }),
  bar_212: restaurant({
    name: "Bar 212", cuisine: "alcohol, sushi, salad, pasta, hummus, restaurant, bar, After Security, American, breakfast, lunch, dinner, beer, wine, seafood, Vegan, Vegetarian, $2 Water", amenity: "bar",
    description: "Bar 212 features New American classics highlighting fresh, locally-sourced ingredients, paired alongside hand-crafted cocktails.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 49", "airside", "Mo-Su 10:00-21:00"),
    ],
  }),
  bar_veloce: restaurant({
    name: "Bar Veloce", cuisine: "bar, paninis, After Security, breakfast, wine, beer, small plates, Vegetarian, Vegan, $2 Water", amenity: "bar",
    description: "Opened by oenophile and restauranteur Fredrick Twomey, Bar Veloce has been a long-standing NYC favorite in the East Village since 2000. Guests will enjoy wine & beer sourced from all over the world with something for every taste which can be thoughtfully paired with a menu of tapas-style small plates and hot-pressed panini sandwiches.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 24", "airside", "Mo-Su 10:00-20:00"),
    ],
  }),
  beechers_handmade_cheese_sweetleaf_coffee_roasters: restaurant({
    name: "Beecher's Handmade Cheese / Sweetleaf Coffee Roasters", cuisine: "mac & cheese, After Security, breakfast, coffee, sandwiches, soup, salad, tea, Vegetarian, Kosher, $2 Water", amenity: "cafe",
    description: "Showcasing the best in artisanal fare, Beecher's Market Café will delight passengers with exceptional, handcrafted meals to go and carefully sourced, regional products. Featuring an all-day menu including favorites such as the Oprah-endorsed \"World's Best\" Mac & Cheese, grilled cheese sandwiches, soup, salads, wraps and more! Sweetleaf coffee is the perfect blend of art and science. Sweetleaf was founded in 2008 by Rich Nieto, a Queens native who wanted to roast coffee that reflects New York City: diverse, sophisticated and decidedly unique.",
    vegetarian: true, kosher: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 30", "airside", "Mo-Su 05:00-19:30"),
    ],
  }),
  brooklyn_diner: restaurant({
    name: "Brooklyn Diner", cuisine: "pastrami, hamburger, soda, tea, coffee, beer, wine, After Security, breakfast, burger, bar, Vegetarian, Vegan, Kosher, $2 Water", amenity: "restaurant",
    description: "Celebrating the borough of Brooklyn's diverse culinary history with classic American dishes that have a distinct ethnic personality-dishes that define America's melting pot cuisine, Brooklyn Diner features scratch-made specialties including house-cured hot pastrami, chicken pot pie and double-fisted hamburgers, as well as tacos, burritos, frankfurters and pasta. From the bar, guests can enjoy a wide range of local craft brews, premium wines and handcrafted cocktails, as well as soft drinks, tea and coffee.",
    vegetarian: true, vegan: true, kosher: true,
    outlets: [
      o("Food & Shops (Level 4)", "Bridge to Gates 40-59", "airside", "Mo-Su 10:00-19:00"),
    ],
  }),
  capital_one_landing: restaurant({
    name: "Capital One Landing", cuisine: "sit down, restaurant, breakfast, lunch, dinner, drinks, coffee, Vegan, Vegetarian, lounge", amenity: "restaurant",
    description: "The Capital One Landing at LaGuardia (LGA) is an airport culinary experience, featuring elevated tapas-styles plates and beverages curated by José Andrés Group. Enjoy delicious food and beverage options, whether that be a leisurely meal or quick bite en route to your gate. Intentional design with first-class finishes, local artwork that bring the space to life and essential travel amenities like luggage nooks, convenient outlets and high-speed Wi-Fi. The Landing is located in Terminal B skybridge on your way to Gates 11-31.",
    phone: "+(800) 227-4825",
    website: "capitalonetravel.com", logoUrl: logo("capitalonetravel.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Bridge to Gates 11-31", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  dos_toros_taqueria: restaurant({
    name: "Dos Toros Taqueria", cuisine: "chips, salsa, guacamole, bottled water, soda, After Security, breakfast, tacos, burritos, salad, nachos, mexican, Vegetarian, Vegan, $2 Water", amenity: "fast_food",
    description: "New York City's original mission-style taqueria, serving burritos, tacos, bowls and salads made from scratch, using only fresh ingredients and naturally raised meats.",
    website: "marketplace.laguardiab.com", logoUrl: logo("marketplace.laguardiab.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "", "airside", "Mo-Su 09:00-18:15"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "breakfast, breakfast sandwiches, eggs, bacon, sausage, bagel, donut, muffin, scone, waters, drinks, coffees, donuts, coffee, tea, Vegetarian, Vegan, $2 Water, After Security, sandwiches, snacks", amenity: "cafe",
    description: "LGA runs on Dunkin'! Enjoy Dunkin's original blend of premium coffee as well as freshly baked donuts, breakfast sandwiches and packaged snacks, salads, yogurts, and fruit.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Bus & Shuttles (Level 1)", "Level 1", "landside", "Mo-Su 06:30-15:30"),
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 04:00-18:00"),
    ],
  }),
  green_leafs: restaurant({
    name: "Green Leaf's", cuisine: "healthy, salad, After Security, breakfast, smoothies, juice, Vegan, Vegetarian, $2 Water", amenity: "fast_food",
    description: "Serving chef-inspired salads, wraps, grain bowls, smoothies and fresh juices, using only the highest quality ingredients.",
    website: "marketplace.laguardiab.com", logoUrl: logo("marketplace.laguardiab.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 10:00-18:15"),
    ],
  }),
  hill_country_barbecue_market: restaurant({
    name: "Hill Country Barbecue Market", cuisine: "After Security, breakfast, brisket, pulled pork, fried chicken, sandwiches, sandwich, Vegetarian, Vegan, $2 Water", amenity: "fast_food",
    description: "Based in New York City, barbecue and fried chicken straight from the Hill Country of Texas. Serving a selection of barbecue including chopped brisket and pulled pork, as well as mouthwatering fried chicken and Texas sized tenders with an array of classic sides.",
    website: "hillcountry.com", logoUrl: logo("hillcountry.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 10:00-18:15"),
    ],
  }),
  hunt_and_fish_grill: restaurant({
    name: "Hunt and Fish Grill", cuisine: "After Security, breakfast, Vegetarian, Vegan, small plates, sit down, restaurant, $2 Water", amenity: "restaurant",
    description: "A contemporary New York steakhouse offering the classic cuts of beef and innovative dishes.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 22", "airside", ""),
    ],
  }),
  il_viaggio: restaurant({
    name: "Il Viaggio", cuisine: "restaurant, breakfast, brunch, lunch, dinner, chicken, seafood, calamari, After Security, grab & go, italian, pasta, beer, wine, salad, Vegetarian, $2 Water", amenity: "restaurant",
    description: "Il Viaggio is a modern spin on the classic Italian restaurant highlighting the most iconic culinary destinations across Italy. Offering a wide variety of Italian inspired dishes, including classic tomato stewed meatballs, baked goat cheese, authentic chicken parmesan and a myriad of handcrafted pizzas. And let's not forget breakfast with a full array of favorites to start the day. To complement the full menu is a carefully crafted wine, beer and cocktail menu featuring many of the classics and even local picks from right here in New York State.",
    vegetarian: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 47", "airside", ""),
    ],
  }),
  irving_farm_coffee_roasters: restaurant({
    name: "Irving Farm Coffee Roasters", cuisine: "After Security, breakfast, coffee, espresso, latte, pastries, Vegetarian, Kosher, $2 Water", amenity: "cafe",
    description: "A bona fide New York institution, Irving Farm Coffee Roasters has been an important fixture on New York's coffee scene since it was founded as a neighborhood café near Gramercy Park in 1996.",
    vegetarian: true, kosher: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 47", "airside", "Mo-Su 05:00-18:00"),
    ],
  }),
  juniors_restaurant_and_cheesecake: restaurant({
    name: "Junior's Restaurant and Cheesecake", cuisine: "hamburger, rueben, fries, After Security, breakfast, sandwiches, burger, cheesecake, Vegetarian, Vegan, $2 Water", amenity: "fast_food",
    description: "Originally opened in the heart of Brooklyn in 1950, over 65 years and three generations later, Junior's continues to be the epitome of New York comfort food. Serving sliced deli sandwiches, hot Reubens, juicy burgers, fresh cut fries, hearty breakfasts, and of course the best cheesecake in the world!",
    website: "juniorscheesecake.com", logoUrl: logo("juniorscheesecake.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 04:30-19:00"),
    ],
  }),
  la_chula_bar_taqueria: restaurant({
    name: "La Chula Bar & Taqueria", cuisine: "chips, salsa, guacamole, breakfast, rice, beans, margaritas, mexican, After Security, bar, grab & go, tacos, nachos, beer, wine, burritos, Vegetarian, $2 Water", amenity: "restaurant",
    description: "La Chula brings authentic 5 star quality Mexican food by Chef Julian Medina and redefines what quick-serve Mexican dining looks like.",
    website: "lachulanyc.com", logoUrl: logo("lachulanyc.com"),
    vegetarian: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 42", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  melt_shop: restaurant({
    name: "Melt Shop", cuisine: "After Security, American, comfort food, sandwiches, $2 Water, burgers, breakfast", amenity: "fast_food",
    description: "Melt Shop is a fast-casual restaurant chain founded in NYC in 2011, specializing in gourmet grilled cheese sandwiches, melts, tater tots, and hand-spun milkshakes. Known for comfort food, it offers quick, elevated takes on classic cheese melts.",
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 23", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  mezze: restaurant({
    name: "Mezze", cuisine: "breakfast, lunch, dinner, drinks, snacks, pastries, sandwiches, Mediterranean, Halal, $2 Water", amenity: "fast_food",
    description: "Modern fast-casual Mediterranean on the go. Wholesome, flavorful meals made with fresh, high-quality ingredients. From gourmet sandwiches on rustic breads to hearty hot entrées and fresh-baked pastries, Mezze offers something for everyone.",
    halal: true,
    outlets: [
      o("Bus & Shuttles (Level 1)", "Level 1", "landside", "Mo-Su 05:00-19:00"),
    ],
  }),
  mi_casa_cantina: restaurant({
    name: "Mi Casa Cantina", cuisine: "breakfast, Vegetarian, Vegan, mexican, $2 Water", amenity: "restaurant",
    description: "Mi Casa offers fast, freshly made Mexican street food jam-packed full with an explosion of fresh flavors.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "", "airside", ""),
    ],
  }),
  mulberry_street: restaurant({
    name: "Mulberry Street", cuisine: "bites, alcohol, After Security, breakfast, pizza, italian, wine, beer, lunch, dinner, bar, Vegetarian, Vegan, $2 Water", amenity: "restaurant",
    description: "Mulberry Street by Marc Forgione brings the best of this hometown gastronaut's critically acclaimed plates and serves them in a wholly engaging, casual meets culinary chef-led dining experience. Passengers are invited to sit-down, relax and watch their meal prepared in real-time. This isn't just a chef-driven restaurant. Mulberry Street is a bona fide culinary experience.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 10:00-20:00"),
    ],
  }),
  ny_creperie: restaurant({
    name: "NY Creperie", cuisine: "coffee, After Security, breakfast, Vegetarian, paninis, $2 Water", amenity: "fast_food",
    description: "NY Creperie offers sweet and savory selections filled with fresh combinations for breakfast, lunch, dinner, and dessert. Sandwiches, coffee and smoothies are also available.",
    vegetarian: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Court", "airside", ""),
    ],
  }),
  orpheus_apollo: restaurant({
    name: "Orpheus + Apollo", cuisine: "lgaatrium, restaurant, bar, American, sandwiches, coffee, $2 Water", amenity: "bar",
    description: "The Orpheus and Apollo Lounge is a landside bar on the mezzanine level of The Atrium Business & Conference Center, located pre-security at Terminal B. The lounge offers 136 first-class seats, craft cocktails and snacks to be enjoyed with views of LaGuardia Airport's active tarmac and Richard Lippold's iconic Orpheus and Apollo sculpture.",
    website: "atriumlga.com", logoUrl: logo("atriumlga.com"),
    outlets: [
      o("Mezzanine (Level 3A)", "Atrium", "landside", "Mo-Su 12:00-24:00"),
    ],
  }),
  panorama_bar: restaurant({
    name: "Panorama Bar", cuisine: "bar, lightbites, rooftop, spirits, lobster, shrimp, beer, wine, cocktails, Vegetarian, $2 Water", amenity: "bar",
    description: "An inviting New York bar for worldly travelers to gather, LaGuardia's Panorama Bar & Lounge transports everyday travelers to their next envy-worthy destination. It offers stunning panoramic views of the airport's skyline. Panorama Bar & Lounge is known for its spacious layout, making it a perfect spot for socializing and enjoying the scenery. The bar serves a wide selection of cocktails, wines, beers, and spirits, accompanied by a menu of appetizers, small plates, and light bites.",
    vegetarian: true,
    outlets: [
      o("Check-in / To Gates (Level 3)", "United Club", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  pour_authority: restaurant({
    name: "Pour Authority", cuisine: "American, tea, bar, breakfast, coffee, sandwiches, $2 Water", amenity: "bar",
    description: "Pour Authority is a coffee shop by day and bar by night, located on the ground level of The Atrium Business & Conference Center, pre-security at Terminal B. Grab a cup of joe and sandwich on-the-go or relax with a glass of wine and snack before your flight. Join the loyalty program and earn points with every fly-by!",
    website: "atriumlga.com", logoUrl: logo("atriumlga.com"),
    outlets: [
      o("Check-in / To Gates (Level 3)", "Atrium", "landside", "Mo-Su 06:00-02:00"),
    ],
  }),
  queens_corner: restaurant({
    name: "Queens Corner", cuisine: "Gift, Presents, After Security, grab & go, shop, travel essentials, gifts, snacks", amenity: "fast_food",
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", ""),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "burger, cheeseburger, hamburger, fries, milkshake, soda, breakfast, cold brew, iced coffee, Vegetarian, After Security, coffee, Gluten Free, Vegetarian Options, 24-hour, $2 Water", amenity: "fast_food",
    description: "Shake Shack is a modern day burger stand. A once local favorite founded by revered New York restaurateur Danny Meyer, it has since grown into a global phenomenon.",
    phone: "+1 (646) 747-7200",
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"),
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Baggage / Gates (Level 2)", "Gate 41", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  spirit_bell: restaurant({
    name: "Spirit & Bell", cuisine: "After Security, wine, beer, bar, Vegetarian, $2 Water, cocktails", amenity: "bar",
    description: "Created specifically for Terminal B by one of New York's most influential hospitality teams, Spirit & Bell serves up a full-service wine and cocktail bar which features one of the world's best cocktail menus.",
    vegetarian: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 08:00-20:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "After Security, drinks, coffees, pastry, sandwiches, grab & go, coffee, pastries, breakfast, tea, snacks, Vegetarian, 24-hour, $2 Water, croissant, starbucksmugs, cakepop, bagels, breakfast sandwiches, hotchocolate, waters, cafe", amenity: "cafe",
    description: "Iconic Seattle-based coffeehouse chain known for its signature roasts and light bites.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    vegetarian: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 00:00-24:00", true),
      o("Baggage / Gates (Level 2)", "Baggage Claim", "landside", "", true),
    ],
  }),
  talde_noodle_bar: restaurant({
    name: "Talde Noodle Bar", cuisine: "cocktails, After Security, asian, breakfast, bar, noodles, sitdown, Vegetarian, Vegan, $2 Water", amenity: "restaurant",
    description: "Asian fusion restaurant by celebrity chef Dale Talde, offering elevated noodle dishes, small plates, and cocktails with both dine-in and takeout options. Known for its blend of traditional Asian recipes with modern techniques, featuring items like ramen, crispy chicken noodles, and bao buns.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", ""),
    ],
  }),
  tony_and_bennys_pizza_parlor: restaurant({
    name: "Tony and Benny's Pizza Parlor", cuisine: "stromboli, mac & cheese, caesar salad, meatballs, bottled water, soda, juice, After Security, breakfast, pizza, pasta, italian, Vegetarian, $2 Water", amenity: "fast_food",
    description: "A traditional pizza parlor straight from the streets of Brooklyn. Serving pizza by the slice, pasta smothered in house-made sauce and other traditional Italian recipes and flavors delivered with just the right amount of Brooklyn attitude and flair.",
    website: "marketplace.laguardiab.com", logoUrl: logo("marketplace.laguardiab.com"),
    vegetarian: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 04:30-18:15"),
    ],
  }),
  uptown_essentials: restaurant({
    name: "Uptown Essentials", cuisine: "After Security, grab & go, sandwiches, pastries, Vegan, Vegetarian, $2 Water, breakfast", amenity: "fast_food",
    description: "Sandwiches, snacks, pastries, treats and more.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 04:00-19:00"),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "fast food, hamburger, burger, cheeseburger, bacon, chicken, chicken nuggets, chicken tenders, coffee, bottled water, soda, breakfast, breakfast sandwiches, eggs, sausage, After Security, fries, $2 Water, burgers", amenity: "fast_food",
    description: "Dig into a classic Wendy's single, double or triple. Spice things up with some zesty chili. Or grab a signature garden-fresh salad. Whatever you do, don't forget the Frosty!",
    website: "wendys.com", logoUrl: logo("wendys.com"),
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 05:30-18:00"),
    ],
  }),
  zaros_family_bakery: restaurant({
    name: "Zaro's Family Bakery", cuisine: "After Security, waters, coffees, pastry, pastries, cafe, beverages, bakery, breakfast, bagels, sandwiches, coffee, Vegetarian, Vegan, 24-hour, $2 Water", amenity: "cafe",
    description: "A fourth-generation Bronx bakery since 1927, Zaro's has expanded throughout the New York Metropolitan area becoming a household name in one of the busiest commuter hubs in the world. Enjoy a fresh selection of quality baked goods such as bagels and pastries, deli sandwiches, and Zaro's very own house blend coffee.",
    website: "zaro.com", logoUrl: logo("zaro.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Food & Shops (Level 4)", "Food Hall", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
};

// ─── Terminal C ───

const terminalCVenues = {
  artichoke_pizza: restaurant({
    name: "Artichoke Pizza", cuisine: "pizza", amenity: "fast_food",
    description: "Artichoke Pizza is known for its signature artichoke slice and New York style pizza. It delivers a classic, indulgent city favorite in a quick-serve format.",
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "pretzels, grab & go", amenity: "fast_food",
    description: "Auntie Anne's serves freshly baked pretzels and snacks in a quick service format. It's a popular stop for a warm, savory bite on the go.",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  birch_coffee_h_h_bagels_rossi_pizzeria: restaurant({
    name: "Birch Coffee / H&H Bagels / Rossi Pizzeria", cuisine: "wine, beer, coffee, pizza, breakfast, bagels, Vegan, Vegetarian, Gluten Free", amenity: "cafe",
    description: "Birch Coffee / H&H Bagels / Rossi Pizzeria is a multi-concept dining area offering coffee, classic New York bagels, and pizza. It provides quick, familiar options for travelers at any time of the day.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Departures (Level 2)", "Gate 92", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  brklyns_best_bagels_kombu: restaurant({
    name: "Brklyn's Best Bagels / Kombu", cuisine: "asian, bagel, japanese", amenity: "cafe",
    description: "Brklyn's Best Bagels / Kombu combines traditional New York bagels with Japanese-inspired offerings. It provides a diverse menu blending classic and modern flavors.",
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  bubbys: restaurant({
    name: "Bubby's", cuisine: "breakfast, lunch, dinner, bar, grab & go, Vegetarian, Vegan, Gluten Free, American, diner, salad", amenity: "restaurant",
    description: "New York City's beloved cozy and boozy restaurant and pie shop, Bubby's, opened on Thanksgiving Day 1990. Chef and Owner Ron Silver began baking pies and selling them to restaurants and his neighbors out of a small kitchen in Tribeca. The concept focuses on simple and fresh, no fuss comfort food made from scratch American cooking. Bubby's has the quintessential comfort dish for everyone - crispy fried chicken, light and fluffy traditional pancakes, delectable pies, and homemade buttermilk biscuits! The menu is chef driven featuring ingredients sourced from local farms and small purveyors.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Security (Level 3)", "Gate 70", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  calista_taverna: restaurant({
    name: "Calista Taverna", cuisine: "restaurant, bar, full-service, breakfast, Vegan, Vegetarian, Gluten Free", amenity: "restaurant",
    description: "Full-service Greek Mediterranean restaurant and bar that also serves breakfast from 5:00AM to 10:30AM",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Security (Level 3)", "Gate 80", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  chopt: restaurant({
    name: "Chopt", cuisine: "lunch, dinner, salad, healthy, Vegetarian, Vegan, $2 Water", amenity: "fast_food",
    description: "Take away restaurant with a variety of salad offerings.",
    website: "choptsalad.com", logoUrl: logo("choptsalad.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Security (Level 3)", "Gate 80", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  cibo_express_foodhall: restaurant({
    name: "CIBO Express Foodhall", cuisine: "grab & go", amenity: "food_court",
    description: "CIBO Express Foodhall has a variety of takeaway restaurants, as well as grab-and-go food products.",
    outlets: [
      o("Departures (Level 2)", "Gate C61", "airside", ""),
    ],
  }),
  cibo_express_gourmet_markets: restaurant({
    name: "CIBO Express Gourmet Markets", cuisine: "shop, newspaper, souvenirs, books, t shirt, sweatshirt, hat, jacket, waters, chips, nuts, drinks, chocolates, fruits, grab and go, snacks, grab & go, travel essentials, apparel, reading material, $2 Water", amenity: "fast_food",
    description: "CIBO Express Gourmet Markets is a convenient grab-and-go market offering fresh snacks, beverages, and travel essentials for passengers on the move. It provides a quick, reliable, option for quality food and last-minute items.",
    website: "ciboexpress.com", logoUrl: logo("ciboexpress.com"),
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 04:00-22:00"),
    ],
  }),
  cotto_trattoria_market_place: restaurant({
    name: "Cotto Trattoria & Market Place", cuisine: "shop, magazines, chips, candy, fruit, dried fruit, chocolate, restaurant, grab & go, breakfast", amenity: "restaurant",
    description: "Cotto Trattoria & Market Place is open for sit-down dining, with breakfast served daily until 10:00 AM, while the Market Place opens at 4:00 AM offering grab-and-go options for travelers.",
    phone: "+1 (866) 508-3558",
    outlets: [
      o("Departures (Level 2)", "Gate 64", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  dos_toros: restaurant({
    name: "Dos Toros", cuisine: "breakfast, lunch, dinner, $2 Water, Vegetarian, Vegan, mexican, tacos, burritos, burrito bowl", amenity: "fast_food",
    description: "Dos Toros is a takeaway taqueria chain that offers fresh, flavorful and melty burritos, tacos, quesadillas, bowls, salads and nachos.",
    website: "dostoros.com", logoUrl: logo("dostoros.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Security (Level 3)", "Gate 80", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  eggy_weggy_essex_burger: restaurant({
    name: "Eggy Weggy / Essex Burger", cuisine: "hamburger, dinner, breakfast, Vegan, Vegetarian, Gluten Free", amenity: "restaurant",
    description: "Eggy Weggy serves breakfast options until 10:00AM, Essex Burger lunch and dinner options begin at 10:30AM",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Departures (Level 2)", "Gate 74", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  flatiron_tavern_provisions: restaurant({
    name: "Flatiron Tavern & Provisions", cuisine: "salmon, chicken, meatballs, fries, burger, beer, wine, sandwiches, salads, pasta, wings, soups, American", amenity: "restaurant",
    description: "Fill up yourself with some straightforward yet elevated American cuisine prepared with care at Flatiron Tavern & Provisions.",
    outlets: [
      o("Departures (Level 2)", "Gate 92", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  freshii: restaurant({
    name: "Freshii", cuisine: "breakfast, lunch, dinner, $2 Water, salad, soup, Vegetarian, Vegan", amenity: "fast_food",
    description: "Freshii focuses on healthy, fast-casual options like bowls, wraps, and smoothies. It's ideal for travelers looking for lighter, nutritious meals.",
    website: "freshii.com", logoUrl: logo("freshii.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Security (Level 3)", "Gate 70", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "smoothies, juice", amenity: "fast_food",
    description: "Jamba Juice offers smoothies, juices, and light snacks made with fruit and wholesome ingredients. It's a refreshing option for travelers seeking a quick pick-me-up.",
    website: "jamba.com", logoUrl: logo("jamba.com"),
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  jersey_mikes: restaurant({
    name: "Jersey Mike's", cuisine: "sandwiches, subs, deli, $2 Water", amenity: "fast_food",
    description: "Jersey Mike's specializes in fresh-sliced subs made to order with quality ingredients. It provides a hearty, customizable meal option.",
    website: "jerseymikes.com", logoUrl: logo("jerseymikes.com"),
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  juice_press: restaurant({
    name: "Juice Press", cuisine: "shakes, superfood, fruit, juice, smoothies, coffee, tea", amenity: "fast_food",
    description: "Refresh and refuel with a made to order smoothie from Juice Press.",
    website: "juicepress.com", logoUrl: logo("juicepress.com"),
    outlets: [
      o("Departures (Level 2)", "Gate 92", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  king_david_tacos: restaurant({
    name: "King David Tacos", cuisine: "breakfast, tacos, mexican", amenity: "fast_food",
    description: "King David Tacos offers Austin-style breakfast tacos with bold flavors and fresh ingredients. It's a unique and satisfying option for a quick bite.",
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  magnolia_bakery: restaurant({
    name: "Magnolia Bakery", cuisine: "bakery, dessert, cupcakes", amenity: "cafe",
    description: "Magnolia Bakery is known for its classic desserts, including cupcakes and banana pudding. It offers a sweet treat option for travelers looking to indulge",
    website: "magnoliabakery.com", logoUrl: logo("magnoliabakery.com"),
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  poppys_bagels_chuko_ramen: restaurant({
    name: "Poppy's Bagels / Chuko Ramen", cuisine: "asian, japanese, dinner, bar", amenity: "restaurant",
    description: "Poppy's Bagels serves breakfast favorites from 5:00am to 10:30am. Chuko Ramen has a full-service restaurant and bar serving Asian fare.",
    outlets: [
      o("Departures (Level 2)", "Gate 76", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  potbelly: restaurant({
    name: "Potbelly", cuisine: "lunch, dinner, sandwiches, $2 Water, Vegetarian", amenity: "fast_food",
    description: "Potbelly offers toasted sandwiches, soups, and salads in a casual setting. It's a great choice for a warm, quick meal before boarding.",
    vegetarian: true,
    outlets: [
      o("Security (Level 3)", "Gate 70", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  prime_steakhouse: restaurant({
    name: "Prime Steakhouse", cuisine: "steak, sandwiches, grab & go, full bar, full service, sit down, entrees", amenity: "restaurant",
    description: "Full service bar and restaurant serving steakhouse favorites, a variety of salads and sandwiches, and a kid's menu.",
    outlets: [
      o("Security (Level 3)", "Gate 80", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  protein_bar_kitchen: restaurant({
    name: "Protein Bar & Kitchen", cuisine: "breakfast, lunch, dinner, salad, burrito bowl, smoothies, Vegetarian, Vegan, $2 Water", amenity: "fast_food",
    description: "Protein Bar & Kitchen serves protein-focused meals, shakes, and snacks designed for a healthy lifestyle.",
    website: "theproteinbar.com", logoUrl: logo("theproteinbar.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("Security (Level 3)", "Gate 80", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  soleil_brasserie: restaurant({
    name: "Soleil Brasserie", cuisine: "full bar, full service, sandwiches, kids, grab & go, breakfast, Vegan, Vegetarian, Gluten Free", amenity: "restaurant",
    description: "Full-service bar and sit-down restaurant serving entrees, sandwiches, salads and desserts. Grab and go options available including breakfast from 5:00AM to 10:30AM.",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Security (Level 3)", "Upper Level (Gates 80-89)", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "grab & go, breakfast, lunch, dinner, waters, drinks, coffees, pastry, sandwiches, coffee, Vegetarian, pastries, tea, espresso, $2 Water, restaurant, cafe, chain", amenity: "cafe",
    description: "Iconic Seattle-based coffeehouse chain known for its signature roasts and light bites.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    vegetarian: true,
    outlets: [
      o("Departures (Level 2)", "Gate 71", "airside", "Mo-Su 05:00-21:00"),
      o("Security (Level 3)", "Concourse to 90s Gates", "airside", "Mo-Su 05:00-21:00"),
      o("Security (Level 3)", "Gate 70", "airside", "Mo-Su 05:00-21:00"),
      o("Arrivals (Level 1)", "Baggage Claim", "landside", "Mo-Su 05:00-21:00"),
      o("Departures (Level 2)", "Gate 81", "airside", "Mo-Su 05:00-21:00"),
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-23:00"),
    ],
  }),
  sunday_supper_trattoria: restaurant({
    name: "Sunday Supper Trattoria", cuisine: "italian, bar, grab & go, Vegan, Vegetarian, Gluten Free, breakfast", amenity: "restaurant",
    description: "Italian restaurant and full bar with grab and go options. Breakfast is also served until 10:30 am",
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("Security (Level 3)", "Gate 70", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  taim_mediterranean_kitchen: restaurant({
    name: "Taim Mediterranean Kitchen", cuisine: "Mediterranean, falafel, hummus", amenity: "fast_food",
    description: "Taim serves Mediterranean-inspired dishes including falafel, hummus, and bowls. It's a flavorful and fresh option for a quick, healthy meal.",
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  terrace_bar: restaurant({
    name: "Terrace Bar", cuisine: "bar, cocktails, beer", amenity: "bar",
    description: "Terrace Bar offers a relaxed bar setting with a selection of cocktails, beer, and wine. It provides a comfortable space for travelers to unwind before their flight.",
    outlets: [
      o("Security (Level 3)", "Gate 70", "airside", "Mo-Su 05:00-23:00"),
      o("Security (Level 3)", "Gate 80", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  the_grille: restaurant({
    name: "The Grille", cuisine: "new american, breakfast, salad, sandwich, burger", amenity: "restaurant",
    description: "The Grille offers travelers a taste of classic American cuisine with a contemporary twist. Menu highlights include the Western Blue Ring Burger, Southern Belle Chicken Sandwich, and the Seared Ahi Sandwich, alongside a delectable NY Strip and a kid-friendly menu.",
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  the_line_sports_grill: restaurant({
    name: "The Line Sports Grill", cuisine: "American, bar, pub grub, sports bar, burgers, fries", amenity: "restaurant",
    description: "The Line Sports Grill is a full-service sports bar featuring classic American fare and multiple screens for live games. It provides a lively atmosphere for dining and relaxing.",
    outlets: [
      o("Departures (Level 2)", "Gate 86", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  trinity_burgers: restaurant({
    name: "Trinity Burgers", cuisine: "hot dog, hamburger", amenity: "fast_food",
    description: "A takeout eatery offering hamburgers, hotdogs and french fries.",
    outlets: [
      o("Departures (Level 2)", "Food Hall near Gate 61", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "breakfast, lunch, dinner, burgers, fries, fast food, hamburgers, fried chicken, Vegetarian, $2 Water", amenity: "fast_food",
    description: "Wendy's serves classic fast-food favorites including burgers, chicken sandwiches, and fries. It's reliable, quick service option for travelers on the go.",
    website: "wendys.com", logoUrl: logo("wendys.com"),
    vegetarian: true,
    outlets: [
      o("Security (Level 3)", "Gate 70", "airside", "Mo-Su 05:00-22:00"),
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_A, 'Terminal A', terminalAVenues);
  const r2 = await processTerminal(AIRPORT, TERMINAL_B, 'Terminal B', terminalBVenues);
  const r3 = await processTerminal(AIRPORT, TERMINAL_C, 'Terminal C', terminalCVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_A, TERMINAL_B, TERMINAL_C]));

  const totalCreated = r1.created + r2.created + r3.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted;
  const totalVenues = Object.keys(terminalAVenues).length
    + Object.keys(terminalBVenues).length
    + Object.keys(terminalCVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
