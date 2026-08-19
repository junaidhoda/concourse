'use strict';
/**
 * Fills in complete data for Chicago O'Hare International Airport (ORD) —
 * restaurants/cafés/bars/vending in Firestore. Researched 2026-08-17 from the
 * airport's own official site, flychicago.com, using Claude in Chrome browser
 * automation per explicit user instruction. No third-party/aggregator source
 * was used for any venue field.
 *
 * SOURCE: https://www.flychicago.com/ohare/eatshopmore/eat/Pages/default.aspx
 * (the "Dine" directory). The rendered listing exposes only name, terminal,
 * nearby gate and hours — a strict subset of what the page actually renders
 * from. The page's own structured data source, found by reading the document's
 * resource timings, is the LocusLabs POI dataset that O'Hare publishes for its
 * official interactive map (maps.ord.flychicago.com), served from the airport's
 * own map account A1UY6J33FTHAJ8:
 *   a.locuslabs.com/accounts/A1UY6J33FTHAJ8/ord/<version>/v5/pois-3.0-ord.json
 *   a.locuslabs.com/accounts/A1UY6J33FTHAJ8/ord/<version>/v5/venueData-ord.json
 * The POI file is a 2,114-record object covering every mapped point at O'Hare;
 * 216 of them carry an `eat*` category. Each record supplies poiId, name,
 * category, description, operationHours, isAfterSecurity, position.floorId,
 * nearbyLandmark, keywords[], and (rarely) phone and links. venueData supplies
 * the airport's own structure and floor names. This is the airport's own
 * published venue data, requested by the airport's own dining page — not a
 * third-party directory.
 *
 * EXTRACTION + VERIFICATION: the in-terminal dining records were serialised
 * in-page to a printable-ASCII format (`@@` field delimiter, `##` list
 * delimiter) with every non-ASCII character replaced by a reversible `<U+hex>`
 * escape, split into 12 chunks under 6,800 chars on line boundaries, written
 * into a `<pre id="dataDump">` and retrieved via get_page_text. The first
 * verification pass FAILED on 10 of 12 chunks by 1–3 characters each. Diffing
 * the on-disk per-line lengths against the browser's own per-line lengths
 * localised every discrepancy to a run of two consecutive spaces inside a
 * source description or keyword (e.g. "…organic nuts and dried fruit,  and
 * Vegan options."), which get_page_text collapses to one. Re-checksumming both
 * sides under the identical space-run normalisation
 * (`s.replace(/[ \t]+/g,' ')`) then matched EXACTLY on all 12 chunks —
 * 6573/14/28046847, 6625/14/28485781, 6623/15/28152328, 6531/15/27801441,
 * 6661/14/28476293, 6653/15/28485785, 6652/15/28460117, 6412/13/27263232,
 * 6668/19/28252635, 6729/34/27634687, 6740/36/27282783, 805/4/3206991 — and
 * the rejoined 208-line dataset verified at len 73683, checksum 312351377
 * (checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7). Collapsing space runs is
 * lossless here because the Python reconciliation normalises whitespace in
 * every field anyway. The `<U+hex>` escapes, the source's HTML entities and
 * its embedded U+200B zero-width spaces were decoded/stripped in Python.
 *
 * TERMINAL STRUCTURE — 4 buckets (1, 2, 3, 5). O'Hare's own map data models
 * the airport as 8 structures: Terminal 1, Terminal 2, Terminal 3, Terminal 5,
 * a Multimodal Facility, the Hilton, Parking (bus center) and Parking Garage
 * Lot A. Only the four terminals have check-in halls and security screening,
 * and each of the four has BOTH its own check-in and its own security
 * checkpoints, so each is its own bucket — which is also exactly how the
 * airport's own Dine page presents its terminal filter (Terminal 1 / 2 / 3 /
 * 5, with no Terminal 4; O'Hare's "Terminal 4" is the bus/shuttle center and
 * has no gates or dining). Applying the test WITHIN a terminal produces no
 * further split: T1's Concourses B and C share one check-in hall and are
 * joined post-security by O'Hare's own pedestrian tunnel; T2's E and F, and
 * T3's G, H, K and L, likewise each sit behind their own terminal's shared
 * check-in with a single continuous post-security area; T5's Concourse M is
 * one hall. The map data confirms this — every concourse of a terminal shares
 * that terminal's `ord-terminalN-departures` floor, with no per-concourse
 * structure of its own.
 *
 * SCOPE — 8 dining POIs EXCLUDED as not being in any terminal: 3 in the
 * on-airport Hilton (Gaslight Club, Caffe Mercato, Andiamo — floor
 * `ord-hilton-upper`, "Lobby Level") and 5 in the Multimodal Facility (2×
 * Farmer's Fridge, Pepsi - Vending, Canteen - Vending, Windy City Mart -
 * Vending — floor `ord-multimodal-1`). These sit outside every terminal
 * building and O'Hare's own Dine filter assigns them to no terminal, so rather
 * than invent a bucket for them they are left out of scope. That leaves 208
 * of the 216 dining POIs.
 *
 * AIRSIDE / LANDSIDE: taken directly from each POI's own `isAfterSecurity`
 * boolean — true → `airside`, false → `landside`. Present on all 216 records;
 * no inference was needed.
 *
 * LEVEL: the airport's own floor NAME from venueData, not a bare number,
 * because that is what O'Hare publishes: "Departures / Check-In",
 * "Arrivals / Baggage Claim" and "Pedestrian Tunnels" are the three floors any
 * dining POI sits on. (venueData also defines "Mezzanine", "Airport Transit
 * System (ATS)", "Pedestrian Bridge" and Lot A's numbered levels; no dining
 * POI is on any of those.)
 *
 * LOCATION_NOTES: each POI's own `nearbyLandmark` verbatim — "Gate C26",
 * "T3 Rotunda / near Gate G1", "Door 3G", "Baggage Claim", "EF Hallway",
 * "ID Badging", "Near K15" — falling back to the floor name for the handful of
 * records where O'Hare publishes no landmark, rather than guessing one.
 *
 * SOURCE DATA ANOMALY (presented as published, not corrected): seven vending
 * POIs sit on floor `ord-terminal1-departures` while their own nearbyLandmark
 * reads "Gate E1" — an E gate, which is Terminal 2 (poiIds 4001935, 4001936,
 * 4001983, 4001984, 4001985, 4001986, 4001990). Terminal assignment in this
 * file always follows the POI's geospatial `position.floorId`, so these are
 * filed under Terminal 1 with their published landmark kept verbatim, rather
 * than being silently reassigned. One keyword string also carries a stray
 * unbalanced quote (Publican Tavern, "craft beer \"") — kept as published.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal bucket are
 * merged into one doc with one `outlets[]` entry per physical unit;
 * same-brand venues in DIFFERENT terminals stay separate docs, per this
 * dataset's standing rule. Brand matching is case- and apostrophe-insensitive
 * (which merges e.g. "Nuts On Clark Popcorn - Vending" with "Nuts on Clark
 * Popcorn - Vending"). Distinctly NAMED venues sharing a parent brand are kept
 * separate per this dataset's page-truth-over-label precedent: "Nuts on Clark"
 * vs "Nuts On Clark Popcorn - Vending" vs "Nuts on Clark Chocolate/Nut -
 * Vending" vs "Nuts on Clark Popcorn/Chocolate - Vending"; "Goose Island Pub"
 * vs "Goose Island Beer Company"; "Dunkin'" vs "Dunkin' Express" vs "Baskin
 * Robbins & Dunkin'"; "Protein Bar and Kitchen" vs "Protein Bar & Kitchen
 * Kiosk"; "Windy City Mart Beverages - Vending" vs "Windy City Mart Snacks -
 * Vending"; "The Bronze Pizza" vs "The Bronze Tap". 208 source records → 149
 * docs.
 *
 * CUISINE: the verbatim join of each POI's own user-searchable `keywords[]`,
 * in the order O'Hare lists them, unfiltered — the site's taxonomy is trusted
 * rather than curated. Only structural keywords are dropped: the ones that
 * merely repeat the venue's own name, the internal `category:*` and `gate:*`
 * machine keywords, and the bare category strings ("eat", "eat.bar",
 * "eat.coffee", "eat.vending") which duplicate the `category` field. Where
 * outlets were merged, the union of their keyword sets is used, first-seen
 * order preserved. For the venues O'Hare publishes with no keywords at all,
 * `cuisine` falls back to the readable form of the POI's own category
 * ("Dining", "Bar", "Coffee", "Vending") rather than being invented.
 *
 * AMENITY: driven by O'Hare's own POI category first — `eat.vending` →
 * `vending_machine` (74 units), `eat.bar` → `bar` (13), `eat.coffee` → `cafe`.
 * Per this dataset's standing rule, every one of the 13 `eat.bar` venues was
 * verified against its own name AND description before accepting `bar`: Jazz
 * Bar, Beaudevin Wine Bar, Goose Island Pub, Galileo Bar & Grill, Chicago Cubs
 * Bar & Grill, Bubbles Wine Bar, Rush Street Bar, Skyscrapers Bar, Goose
 * Island Beer Company (T1 and T3), Connect Bar, Facades Bar and Sports Edition
 * Bar — all are bar concepts by name and by their own descriptions, so all 13
 * stand. The converse rule was applied just as strictly: NO venue was promoted
 * to `bar` from its name alone where O'Hare's own category says plain `eat` —
 * O'Hare has an `eat.bar` category and chose not to use it for e.g. "Wicker
 * Park Sushi Bar", "O'Briens Restaurant & Bar", "Publican Tavern", "Bar Siena"
 * or "The Bronze Tap", all of which their own descriptions present as
 * restaurants. For the generic `eat` category the order is: an explicit
 * "restaurant" / "sit down restaurant" keyword → `restaurant`; a café/bakery
 * name → `cafe`; a confectionery/snack-counter name → `fast_food`; an explicit
 * quick-service signal in the venue's own description or keywords
 * ("quick-service", "quick serve", "quickserve", "fast food", "fast, casual")
 * → `fast_food`; a literal "grab & go" keyword or a Market/Grocer/Mart name →
 * `fast_food`; otherwise `restaurant`. Where O'Hare's data carries no
 * service-style signal at all, the default is `restaurant` rather than a
 * guess. Resulting mix across the 208 records: 74 vending_machine, 53
 * fast_food, 35 restaurant, 33 cafe, 13 bar.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: set to 'yes' ONLY where
 * O'Hare's own keyword list says so, matched as whole keywords — "Vegetarian"
 * or "Vegetarian Options" → vegetarian; "Vegan" → vegan; "Gluten Free",
 * "Gluten-free" or "Gluten Friendly" → gluten_free. Farmers Market's bare
 * "Gluten" keyword was deliberately NOT read as gluten-free, since it does not
 * say so. O'Hare publishes no halal or kosher tag for any dining venue, so
 * `halal` and `kosher` are blank on every doc in this file rather than
 * guessed. Where outlets were merged, a flag is set if ANY merged unit carries
 * the keyword.
 *
 * DESCRIPTION: verbatim from each POI's own `description` field (present on
 * 215 of the 216 dining POIs), whitespace-normalised only. Where outlets were
 * merged, the first non-empty description in source order is used.
 *
 * OPENING HOURS / 24-7: `opening_hours` is the POI's own `operationHours`
 * string verbatim, in O'Hare's own OSM-style notation ("Mo-Su 06:00-20:00",
 * "Mo-Fr 11:00-19:00; Sa 10:00-19:00; Su 10:00-21:00"). `open_24_7` is set
 * only where that string literally contains "00:00-24:00". One record
 * (Dunkin', T5 Gate M16) publishes "Mo-Su 12:00-12:00", which is ambiguous
 * rather than clearly round-the-clock, so it is NOT marked 24/7.
 *
 * PHONE: O'Hare's dining data publishes exactly one phone number across all
 * 216 records (Chicago Essentials - Vending, +1 (855) 969 - 8678). It is
 * carried verbatim; every other doc's `phone` is blank rather than invented.
 *
 * WEBSITE / LOGO: O'Hare's dining data publishes NO website field for any
 * venue — the only two `links` entries in the whole set are PDF menus hosted
 * on flychicago.com itself. Following this dataset's KUL precedent, `website`
 * (and the logo.dev logo derived from it) is therefore set only for globally
 * or nationally recognisable chains whose primary domain is confidently known
 * — Starbucks, McDonald's, Burger King, Chick-fil-A, Subway, Dunkin', Auntie
 * Anne's, Chili's, Jamba Juice, Smoothie King, Wolfgang Puck Express, Macaroni
 * Grill, Garrett Popcorn, Farmer's Fridge, Rocky Mountain Chocolate Factory,
 * Wow Bao, Manchu Wok, Half Moon Empanadas, Protein Bar, Metropolis Coffee,
 * Goose Island, Nuts on Clark, Home Run Inn, Billy Goat Tavern, Tortas
 * Frontera, Big Bowl, The Dearborn, Bar Siena, Hub 51, Summer House Santa
 * Monica, The Hampton Social, R.J. Grunts, Butcher & The Burger, Brioche
 * Dorée, Burrito Beach, The Goddess and Grocer, Pepsi, AG1, Liquid I.V.,
 * Carlo's Bake Shop and Canteen — and left blank for every other independent
 * or unattributed concept rather than guessed.
 *
 * VERIFIED TOTALS: 216 source dining POIs − 8 non-terminal = 208 in scope →
 * 149 restaurant docs / 208 outlets. Terminal 1: 58 records → 43 docs / 58
 * outlets. Terminal 2: 33 → 25 / 33. Terminal 3: 82 → 49 / 82. Terminal 5:
 * 35 → 32 / 35.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['ord', 'chicago-ohare', 'ohare'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';
const TERMINAL_5 = 'terminal_5';

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

// ─── Terminal 1 (Concourses B and C) ───

const terminal1Venues = {
  americas_dog: restaurant({
    name: "America's Dog", cuisine: "juice, bottled water, soda, milk, chocolate milk, parfait, hummus, fruit cup, \"Hot Dogs, Burgers, Wraps, Salads, Breakfast, Chicken Sandwich, Pepsi Products, Deli Sandwich, French Fries, Coffee, Bean Salad, Hummus Snacks, Bagels, Oatmeal, Quick Serve, Snacks, Healthy, Chicago, Hot Dogs, Sandwiches \", hot dog, burger, grab & go, sandwiches", amenity: "fast_food",
    description: "America's Dog is a home grown Chicago business serving breakfast, lunch and dinner. The concept grew from a road trip that two brothers took back in 1993. As they drove across the country stopping at local restaurants they noticed that every city had it's own way of making a hot dog with \"Everything\". They started taking notes and two years later the first \"America's Dog\" opened.",
    outlets: [
      o("Departures / Check-In", "Gate C17", "airside", "Mo-Su 05:30-21:00"),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "juice, gatorade, energy drink, parfait, fruit cup, greek yogurt, Snacks, Pretzels, Sweets, and Quick Bites, grab & go, bottled water, salads, sandwiches", amenity: "fast_food",
    description: "A fresh, sweet taste coupled with a light, bread-like texture offers a little reward during your hectic day. It's not just a pretzel. It's Auntie Anne's.",
    outlets: [
      o("Departures / Check-In", "Gate C18", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  beaudevin_wine_bar: restaurant({
    name: "Beaudevin Wine Bar", cuisine: "breakfast sandwiches, eggs, charcuterie plate, artisanal cheeses, Red Wine, White Wine, Bar, Liquor, Beer, Spirits, Alcohol, small plates, healthy, salads, breakfast, croissant", amenity: "bar",
    description: "Beaudevin, is an internationally acclaimed wine bar, also found in Brussels, Paris and Miami. Beaudevin celebrates the beauty of wine with a wide selection of marques and vintages from around the world. Savor a variety of small plate items to enhance the experience, and a selection of fine spirits, beer and specialty coffees.",
    outlets: [
      o("Departures / Check-In", "Gate C17", "airside", "Mo-Su 05:00-21:30"),
    ],
  }),
  berghoff_cafe: restaurant({
    name: "Berghoff Cafe", cuisine: "Dining", amenity: "cafe",
    description: "There is something to please everyone at Berghoff Cafe...including made to order breakfast sandwiches and omelets just like Mom makes!",
    outlets: [
      o("Departures / Check-In", "Gate C26", "airside", "Mo-Su 06:00-20:00"),
    ],
  }),
  billy_goat_tavern_and_grill: restaurant({
    name: "Billy Goat Tavern and Grill", cuisine: "coffee, tea, hot chocolate, breakfast sandwiches, bottled water, juice, soda, hamburger, cheeseburger, Burgers, Steak Sandwiches, Potato Chips, Coke Products, Cheezeborger, burger, hot dog, sandwiches, beer, wine, local", amenity: "restaurant",
    description: "\"Cheezborger! Cheezborger! Cheezborger! No Pepsi; Coke. No fries; cheeps.\"\" This infamous line from the Saturday Night Live skit is said to be inspired from the Billy Goat Tavern. Aside from just cheeseburgers, the menu also includes a rib-eye steak sandwich.",
    website: "billygoattavern.com", logoUrl: logo("billygoattavern.com"),
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  brioche_doree: restaurant({
    name: "Brioche Dorée", cuisine: "gatorade, juice, milk, chocolate milk, coconut water, energy drink, salads, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Bottled Water, Coke Products, Tea, Brioche Doree, grab & go, coffee, bakery, snacks, Coffee, Juice", amenity: "cafe",
    description: "European-style sandwiches, rich espresso, and freshly baked pastries.",
    website: "briochedoree.com", logoUrl: logo("briochedoree.com"),
    outlets: [
      o("Departures / Check-In", "Gate C21", "airside", "Mo-Su 04:00-20:30"),
      o("Departures / Check-In", "Departures/Check-in", "landside", "Mo-Su 05:30-13:30"),
    ],
  }),
  cafe_zoot: restaurant({
    name: "Cafe Zoot!", cuisine: "ham, turkey, pulled pork, roast beef, tuna salad, soda, Baked Sandwiches, Quesadillas, Ice Cream, Smoothies, Intelligentsia Fresh Roasted Coffees, Pastries, Bottled Water, Soda Pop, Beverages, coffee, bakery, sandwiches, soup, deli", amenity: "cafe",
    description: "Travelers in a hurry who would like a delicious oven baked sandwich, check out Café Zoot! Select from quesadillas, ice cream, smoothies, Intelligentsia fresh roasted coffees, and pastries.",
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 05:00-20:30"),
    ],
  }),
  cafe_descartes: restaurant({
    name: "Café Descartes", cuisine: "Breakfast, Coffee, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Frappuccinos, Bagels, Smoothies, Tea", amenity: "cafe",
    description: "Wonderful Chicago favorite coffee and pastry café in Arrivals/baggage claim offering fresh pastries, snacks, specialty coffees, various drinks and snacks.",
    outlets: [
      o("Arrivals / Baggage Claim", "T1 Baggage Claim", "landside", "Mo-Su 06:00-20:00"),
    ],
  }),
  canteen_vending: restaurant({
    name: "Canteen - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks and snacks.",
    website: "canteen.com", logoUrl: logo("canteen.com"),
    outlets: [
      o("Arrivals / Baggage Claim", "Door 1F", "landside", ""),
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  chi_life_market: restaurant({
    name: "CHI Life Market", cuisine: "Breakfast, Coffee, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Frappuccinos, Bagels, Smoothies, Tea", amenity: "fast_food",
    description: "CHI Life Market is a traveler's best friend for convenient, grab & go options - including fresh fruit, yogurt parfaits and premium bottled water.",
    outlets: [
      o("Departures / Check-In", "Gate C27", "airside", "Mo-Su 05:00-21:30"),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "beer, wine, liquor, eggs, french toast, pancakes, Hamburger, Chicken, French Fries, Sandwiches, Salads, Appetizers, Desserts, Breakfast, Margaritas, Bar, Alcohol, Burgers, restaurant, american, grab & go, tex-mex", amenity: "restaurant",
    description: "Chili's is known for \"Southwestern-inspired American favorites\" like burgers, fajitas, and margaritas. There are over 1,600 Chili's restaurants in 30 countries.",
    outlets: [
      o("Departures / Check-In", "Gate B14", "airside", "Mo-Su 05:00-21:30"),
    ],
  }),
  ciao_gourmet_market: restaurant({
    name: "Ciao Gourmet Market", cuisine: "healthy snacks, chocolate, candy, fruit, \"Sandwiches, Snacks, Water, Bottled Beverages, Salads, Yogurt, Fruit \", grab & go, sandwiches, beverages, chips", amenity: "fast_food",
    description: "The Ciao Gourmet Market pleases every type of guest, from the savvy connoisseur to a family of four in need of snacks and sandwiches. Here, guests choose from a wide selection of freshly prepared, pre-packaged gourmet pasta salads, specialty sandwiches, fresh fruit trays, vegetable crudities, yogurt fruit parfaits, organic nuts and dried fruit, and Vegan options.",
    outlets: [
      o("Departures / Check-In", "Gate C15", "airside", "Mo-Su 05:30-21:30"),
      o("Arrivals / Baggage Claim", "T1 Baggage Claim", "landside", "Mo-Su 06:00-20:30"),
    ],
  }),
  dunkin_express: restaurant({
    name: "Dunkin' Express", cuisine: "Candy, Chocolate, Apples, Candy Coated Apples, Confectionary, Ice Cream, Fudge, Boxed Chocolates, Caramel, Specialty, Chocolates And Snacks, Accessories And Gifts", amenity: "cafe",
    description: "Everybody loves Dunkin'. Whether you prefer a latte, cappuccino, macchiato, or just plain coffee, Dunkin' Express has got you covered. Oh yeah, there are donuts too. Lots of donuts!",
    outlets: [
      o("Departures / Check-In", "Gate B14", "airside", "Mo-Su 04:00-21:00"),
    ],
  }),
  elis_cheesecake_home_run_inn_pizza_vienna_beef: restaurant({
    name: "Eli's Cheesecake - Home Run Inn Pizza - Vienna Beef", cuisine: "candy, chocolate, nuts, trail mix, grab & go, fruit cup, juice, soda, milk, Vienna Beef, dessert, sandwiches, salads, snacks, local", amenity: "fast_food",
    description: "Eli's cheesecake has become a Chicago tradition and one of the best-selling cheesecakes in America. You can buy one slice, or take home an entire cheesecake. Now also offering two additional iconic brands - Home Run Inn Pizza and Vienna Beef hot dogs.",
    outlets: [
      o("Departures / Check-In", "Gate B9", "airside", "Mo-Su 04:30-21:30"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "Vending", amenity: "vending_machine",
    description: "Farmer's Fridge full of fresh and healthy selection of salads, wraps, and breakfast choices.",
    outlets: [
      o("Departures / Check-In", "Gate B20", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Door 2A", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Door 2A", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  fresh_market_on_the_go: restaurant({
    name: "Fresh Market on the Go", cuisine: "energy drink, coconut water, bottled water, fruit cup, vegetarian, parfait, greek yogurt, On The Go, Packaged Snacks, Quick Meals, Candy, Chips, Salads, Sandwiches, Pastries, Fresh, Fast, grab & go, beverages, healthy snacks, hummus", amenity: "fast_food",
    description: "There is a wide selection of fresh pre-packaged food including: pesto, penne, or tuna salad pastas, cobb, chicken ceasar, chef and chicken cranberry salads.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate C23", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  galileo_bar_grill: restaurant({
    name: "Galileo Bar & Grill", cuisine: "liquor, beer, wine, hot dog, chicken, Vienna Beef, bar, grab & go, sandwiches, salads, chicago dog, tv", amenity: "bar",
    description: "Stop for a drink at Galileo Bar serving a full array of beer, wine, premium spirits and soft drinks. Chicago Style Hot Dogs, snacks and grab-and-go sandwiches for the traveler on the move.",
    outlets: [
      o("Departures / Check-In", "Gate B19", "airside", "Mo-Su 06:00-20:30"),
    ],
  }),
  garrett_popcorn_shops: restaurant({
    name: "Garrett Popcorn Shops", cuisine: "Beverages, Popcorn Tins, Popcorn Bags, Chicago Mix, CheeseCorn, CaramelCrisp, Chicago Tins, popcorn, local, soda, juice, bottled water", amenity: "fast_food",
    description: "Enjoy handmade gourmet popcorn, made fresh daily with high-quality ingredients. A Chicago tradition since 1949, Garrett Popcorn is known for its signature recipes and iconic flavors.",
    website: "garrettpopcorn.com", logoUrl: logo("garrettpopcorn.com"),
    outlets: [
      o("Departures / Check-In", "Gate B8", "airside", "Mo-Su 06:00-20:00"),
    ],
  }),
  goose_island_beer_company: restaurant({
    name: "Goose Island Beer Company", cuisine: "tv, liquor, beer, wine, bottled water, soda, juice, bar, breakfast, paninis, flatbreads, grab & go, local", amenity: "bar",
    description: "Chicago's very own Goose Island Beer Company brews its own beer right here in the City. Come sample their home-brewed favorites. Paninis, salads and sandwiches available.",
    website: "gooseisland.com", logoUrl: logo("gooseisland.com"),
    outlets: [
      o("Departures / Check-In", "Gate B1", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  goose_island_pub: restaurant({
    name: "Goose Island Pub", cuisine: "tv, liquor, beer, wine, bottled water, soda, juice, Hamburger, Chicken, French Fries, Sandwiches, Salads, Appetizers, Desserts, Breakfast, Alcohol, Burgers, Vienna Beef, bar, paninis, flatbreads, grab & go, local", amenity: "bar",
    description: "Chicago's very own Goose Island Brewing Company brews its own beer and root beer right here in the City. Come sample their home-brewed favorites here at O'Hare where a full service bar awaits. Paninis, salads and sandwiches available.",
    website: "gooseisland.com", logoUrl: logo("gooseisland.com"),
    outlets: [
      o("Departures / Check-In", "Gate C10", "airside", "Mo-Su 05:30-21:30"),
    ],
  }),
  great_american_bagel_company: restaurant({
    name: "Great American Bagel Company", cuisine: "breakfast, breakfast sandwiches, soda, greek yogurt, energy drink, hummus, bagel, eggs, Bagel Sandwiches, Cream Cheese, Coffee, Espresso, Latte, deli, grab & go, soup, salads", amenity: "cafe",
    description: "Looking for a great place to grab a healthy breakfast for lunch? Try the Great American Bagel for delicious fare.",
    outlets: [
      o("Departures / Check-In", "Gate B14", "airside", "Mo-Su 06:00-20:30"),
    ],
  }),
  home_run_inn_pizza: restaurant({
    name: "Home Run Inn Pizza", cuisine: "Vienna Beef", amenity: "restaurant",
    description: "Known for their famous thin crust, Home Run Inn has been synonymous with the phrase, \"the best pizza in Chicago,\" since 1947. Try a sausage, pepperoni, or cheese 8-inch pie today.",
    website: "homeruninnpizza.com", logoUrl: logo("homeruninnpizza.com"),
    outlets: [
      o("Departures / Check-In", "Gate C11", "airside", "Mo-Su 05:30-21:00"),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "bottled water, soda, oatmeal, pretzels, granola bar, protein bar, smoothies, fruit, grab & go, sandwiches, protein shake, juice", amenity: "fast_food",
    description: "Jamba Juice is the category-defining leader in healthy blended beverages, juices, and good-for-you snacks.",
    website: "jamba.com", logoUrl: logo("jamba.com"),
    outlets: [
      o("Departures / Check-In", "Gate B7", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  jazz_bar: restaurant({
    name: "Jazz Bar", cuisine: "seating, beer, wine, bar, alcohol, tv, energy drink", amenity: "bar",
    description: "Enjoy a comfortable atmosphere and a selection of beer, wine, and spirits at the Jazz Bar.",
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 07:00-22:30"),
    ],
  }),
  la_tapenade_mediterranean_cafe: restaurant({
    name: "La Tapenade Mediterranean Café", cuisine: "beer, tv, liquor, wine, salads, fruit cup, chicken, Sandwiches, Side Salads, Panini, Snacks, Fresh Fruit, Yogurt Parfait, Bottled Beverages, Mediterranean, restaurant, bar, breakfast, pizza", amenity: "restaurant",
    description: "La Tapenade Mediterranean Café exudes the warmth and abundance of the coastal culture with its irresistible display of pastries, breads, gourmet sandwiches and pizzas. Fresh herbs, fine cheeses, specialty grilled meats and fire-roasted vegetables are used throughout the entire menu. Hand-made Mediterranean flatbreads are all baked fresh each day.",
    outlets: [
      o("Departures / Check-In", "Gate B4", "airside", "Mo-Su 04:30-21:00"),
    ],
  }),
  manchu_wok: restaurant({
    name: "Manchu Wok", cuisine: "chicken, beef, soda, Chinese Cusine, Orange Chicken, Rice, Noodles, Beverages, Sweet & Sour Chicken, fast food, asian, fried rice, egg rolls, grab & go", amenity: "fast_food",
    description: "Fast and fresh Chinese cuisine ranging in style from Cantonese to Szechwan. On the menu are recognizable dishes like General Tso's and Kung Pao Chicken, Spicy Beef, and Sweet & Sour Pork.",
    website: "manchuwok.com", logoUrl: logo("manchuwok.com"),
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 09:00-21:00"),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "burger, bacon, dessert, ice cream, parfait, fast food, fries, salads, chicken, breakfast", amenity: "fast_food",
    description: "Global quick-service restaurant serving iconic burgers, word famous fries, and breakfast favorites, known for consistent quality, fast service, cleanliness, and convenient, affordable dining for travelers on the go.",
    outlets: [
      o("Departures / Check-In", "Gate C10", "airside", "Mo-Su 04:00-22:00"),
      o("Departures / Check-In", "Gate B11", "airside", "Mo-Su 04:00-22:00"),
    ],
  }),
  nuts_on_clark: restaurant({
    name: "Nuts on Clark", cuisine: "grab & go, soda, juice, gatorade, bottled water, cashews, almonds, pecans, Gifts to Travel, Popcorn, Caramelcorn, Gourmet, Cheesecorn, Real Cheese, Water in Designer Bottles, Chocolate, Nuts, Gourmet Gifts and Bags, Honey Butter Nuts, Beverages, Gourmet Giant Cookies, candy, local, gifts, souvenirs", amenity: "fast_food",
    description: "Nuts on Clark provides the highest quality chocolate, confections, nut and popcorn products that clientele anticipates and have enjoyed since \"Nuts on Clark\" opened on Clark Street in Chicago, Illinois over 30 years ago.",
    website: "nutsonclark.com", logoUrl: logo("nutsonclark.com"),
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  nuts_on_clark_chocolate_nut_vending: restaurant({
    name: "Nuts on Clark Chocolate/Nut - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Treat yourself to Nuts on Clark's delicious selection of gourmet nuts, chocolates, and sweet snacks, perfect for enjoying on the go or taking home as a gift.",
    outlets: [
      o("Departures / Check-In", "Door 1C", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  nuts_on_clark_popcorn_vending: restaurant({
    name: "Nuts On Clark Popcorn - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Enjoy Chicago's famous Nuts on Clark popcorn, freshly made and available in classic favorites like Caramel, Cheese, and Chicago Mix.",
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  pepsi_vending: restaurant({
    name: "Pepsi - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks.",
    website: "pepsi.com", logoUrl: logo("pepsi.com"),
    outlets: [
      o("Arrivals / Baggage Claim", "Door 1F", "landside", ""),
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  pronto_sandwiches: restaurant({
    name: "Pronto Sandwiches", cuisine: "Candy, Chocolate, Apples, Candy Coated Apples, Confectionary, Ice Cream, Fudge, Boxed Chocolates, Caramel, Specialty", amenity: "restaurant",
    description: "Crafted with local and imported Italian ingredients, our sandwiches offer a taste of Italy's rich culinary tradition. Experience a culinary journey with our Schiacciata bread, a masterpiece anchored by the time honored tradition of Italian bakeries.",
    outlets: [
      o("Departures / Check-In", "Gate B14", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  reggios_chicago_style_pizza: restaurant({
    name: "Reggio's Chicago Style Pizza", cuisine: "hot dog, pizza, pepperoni, soda, juice, breakfast, \"Pizza, Chicago style, Beverages, Bottled Water \", Vienna Beef, grab & go, chicago dog, deep dish, snacks, local, bottled water, Sub Sandwiches, Chips, Salads, Bottled Water, Cookies, Soda Pop", amenity: "fast_food",
    description: "Reggio's Chicago Style Pizza dishes out classic Chicago dogs and deep dish pizza.",
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 08:00-20:30"),
      o("Departures / Check-In", "Gate C22", "airside", "Mo-Su 10:00-19:00"),
    ],
  }),
  salad_works: restaurant({
    name: "Salad Works", cuisine: "chips, turkey, chicken, healthy salads, sandwiches, salads, bottled water, soda, juice", amenity: "restaurant",
    description: "Looking for a light, healthy meal? Salad Works has everything you want for a delicious experience.",
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 07:00-20:00"),
    ],
  }),
  smoothie_king: restaurant({
    name: "Smoothie King", cuisine: "trail mix, cookies, candy, chocolate, Snack bags, Healthy, Sweets, Snacks to Go, Snack Packs, Gummie Bears, Salty Snacks, Smoothie, Enhancers, Supplements, Snacks, Cold, Fruit, Nutritious, Drink, Wellness, Cold Brew Coffee., smoothies, nuts, grab & go, chips", amenity: "fast_food",
    description: "Smoothie King delivers high quality snacks. They seek the best available ingredients in the marketplace in order to provide deliciously different snack offerings to on the go airport travelers.",
    website: "smoothieking.com", logoUrl: logo("smoothieking.com"),
    outlets: [
      o("Departures / Check-In", "Gate B6", "airside", "Mo-Su 06:00-09:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, Breakfast, Coffee, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Frappuccinos, Bagels, Smoothies, bakery, grab & go, snacks", amenity: "cafe",
    description: "Starbucks offers handcrafted coffee beverages, premium teas and delectable treats.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departures / Check-In", "Gate B9", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate B5", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate C17", "airside", "Mo-Su 04:30-21:30"),
    ],
  }),
  starbucks_vending: restaurant({
    name: "Starbucks - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Coffee offering drinks, snacks, and to-go items.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departures / Check-In", "Gate C19", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  the_bronze_pizza: restaurant({
    name: "The Bronze Pizza", cuisine: "restaurant, wine, liquor, chips, grab & go, bar, breakfast, sandwiches, pizza, tv, beer", amenity: "restaurant",
    description: "The Bronze Pizza serves pizza, salads and wraps along with a selection of cocktails, beer, wine and spirits. Also serves daily breakfast.",
    outlets: [
      o("Departures / Check-In", "Gate B7", "airside", "Mo-Su 04:15-21:30"),
    ],
  }),
  tortas_frontera_by_rick_bayless: restaurant({
    name: "Tortas Frontera by Rick Bayless", cuisine: "tv, beer, wine, liquor, mexican, tea, soda, juice, Guacamole, Tortas, Sandwiches, Salads, Salsa, Margaritas, Chips, Drinks, Cazuela, Mollete, Tortilla, Flatbread, Queso, Choriqueso, Chile, Drinks. Quickserve, Bar, HealthySelections, Chicago Favorite, Vegetarian, Airfiled View, Gluten Friendly, molletes, soup, breakfast", amenity: "fast_food",
    description: "Explore the amazing flavors of Mexico at Tortas Frontera by Rick Bayless. The cusine features hand-crafted tortas, fresh-made guacamole and hand-shaken margaritas. Now, the type of quick-service gourmet you expect to find in a downtown hotspot is available \"to go\", at O'Hare.",
    vegetarian: true, glutenFree: true,
    website: "rickbayless.com", logoUrl: logo("rickbayless.com"),
    outlets: [
      o("Departures / Check-In", "Gate B10", "airside", "Mo-Su 04:30-21:00"),
    ],
  }),
  tuscany_cafe: restaurant({
    name: "Tuscany Café", cuisine: "fruit, chips, salads, hummus, greek yogurt, fruit cup, parfait, Breakfast, Frittata, Omelets, LavAzza Coffee, Coffee, Espresso, Latte, Cocktails, Spirits, Mixed Drinks Red Wine, White Wine, Beer, Bloody Mary, Coke Products, Pasta, Pizza, Soups, Italian, Sandwiches, restaurant, grab & go", amenity: "restaurant",
    description: "The ambiance of a sidewalk café similar to those in the provinces of Tuscany is the setting for this original Phil Stefani restaurant, which can be found right here in Chicago. Emphasis is placed on speed of service and convenience for the traveler while providing an authentic Italian menu. Choose mouthwatering appetizers, soups and salads, gourmet pizzas, pastas, savory entrees and delicious desserts. The wide selection of wines are the perfect pair for any of the incredible dishes.",
    outlets: [
      o("Departures / Check-In", "Gate B18", "airside", "Mo-Su 05:30-22:00"),
    ],
  }),
  wicker_park_market: restaurant({
    name: "Wicker Park Market", cuisine: "shrimp, yellowtail, crab, eel, tuna, beef, vegetarian, chicken, salmon, restaurant, bar, sushi, small plates, seafood, nigiri", amenity: "restaurant",
    description: "Watch the professional sushi chef make each sushi roll to order, or enjoy traditional miso soup, raw bar, nigiri and rolls. Full bar service is available. Now offering coffee.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate C1", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  windy_city_mart_beverages_vending: restaurant({
    name: "Windy City Mart Beverages - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks.",
    outlets: [
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Door 2A", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  windy_city_mart_snacks_vending: restaurant({
    name: "Windy City Mart Snacks - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks and snacks.",
    outlets: [
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Door 2A", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
};

// ─── Terminal 2 (Concourses E and F) ───

const terminal2Venues = {
  ag1_vending: restaurant({
    name: "AG1 - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Daily health beverage packed with nutrients to help alleviate bloating, support healthy energy levels, and empower whole body health.",
    website: "drinkag1.com", logoUrl: logo("drinkag1.com"),
    outlets: [
      o("Departures / Check-In", "Gate F1", "airside", ""),
    ],
  }),
  always_fresh_always_on: restaurant({
    name: "Always Fresh Always On", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Departures / Check-In", "Departures / Check-In", "airside", ""),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "gatorade, energy drink, parfait, fruit cup, greek yogurt, Snacks, Pretzels, Sweets, and Quick Bites, grab & go, bottled water, salads, sandwiches, juice", amenity: "fast_food",
    description: "A fresh, sweet taste coupled with a light, bread-like texture offers a little reward during your hectic day. It's not just a pretzel. It's Auntie Anne's.",
    outlets: [
      o("Departures / Check-In", "Gate E4", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  brioche_doree: restaurant({
    name: "Brioche Dorée", cuisine: "gatorade, juice, milk, chocolate milk, coconut water, energy drink, salads, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Bottled Water, Coke Products, Tea, Brioche Doree, grab & go, coffee, bakery, snacks", amenity: "cafe",
    description: "European-style sandwiches, rich espresso, and freshly baked pastries.",
    website: "briochedoree.com", logoUrl: logo("briochedoree.com"),
    outlets: [
      o("Departures / Check-In", "Gate F19", "airside", "Mo-Su 05:00-20:30"),
    ],
  }),
  canteen_vending: restaurant({
    name: "Canteen - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks and snacks.",
    website: "canteen.com", logoUrl: logo("canteen.com"),
    outlets: [
      o("Departures / Check-In", "EF Hallway", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "EF Hallway", "airside", "Mo-Su 00:00-24:00", true),
      o("Arrivals / Baggage Claim", "Door 2C", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  carlos_bake_shop_express_vending: restaurant({
    name: "Carlo's Bake Shop Express - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Delicious cakes and baked goods from the 'Cake Boss', Buddy Valastro's famous Carlo's Bake Shop.",
    outlets: [
      o("Departures / Check-In", "Gate E8", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  carry_out_carry_on: restaurant({
    name: "Carry Out/Carry On", cuisine: "chips, fruit, juice, soda, fruit cup, parfait, Bottled Water, Beverages, Soda Pop, grab & go, sandwiches, snacks, salads, vegetarian", amenity: "fast_food",
    description: "Select from pre-packaged salad, sandwiches, vegetable tray, soda, juice and water.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate E2", "airside", "Mo-Su 05:30-20:30"),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "beer, wine, liquor, eggs, french toast, pancakes, Hamburger, Chicken, French Fries, Sandwiches, Salads, Appetizers, Desserts, Breakfast, Margaritas, Bar, Alcohol, Burgers, restaurant, american, grab & go, tex-mex", amenity: "restaurant",
    description: "Chili's is known for \"Southwestern-inspired American favorites\" like burgers, fajitas, and margaritas. There are over 1,600 Chili's restaurants in 30 countries.",
    outlets: [
      o("Departures / Check-In", "Gate F9", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  connect_bar: restaurant({
    name: "Connect Bar", cuisine: "wine, seating, tv, Vienna Beef, bar, grab & go, cocktails, beer, bottled water, healthy snacks", amenity: "bar",
    description: "Enjoy a drink with amazing airfield views. Order food to be delivered from: Wicker Park Seafood & Sushi, Chili's, and Stanley's Blackhawks Kitchen & Tap from a convenient order/for delivery kiosk.",
    outlets: [
      o("Departures / Check-In", "Gate F3", "airside", "Mo-Su 08:00-19:30"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "sausage, bacon, juice, iced coffee, tea, espresso, Eat, Breakfast, Chocolates and Snacks, Healthy Selections, Quickserve, Vegetarian, coffee, breakfast sandwiches, bakery, donuts, bagel", amenity: "cafe",
    description: "Dunkin' Donuts sells 52 varieties of donuts and more than a dozen coffee beverages as well as an array of bagels, breakfast sandwiches and other baked goods.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate F9", "airside", "Mo-Su 04:00-21:00"),
    ],
  }),
  eat_well_travel_further_vending: restaurant({
    name: "Eat Well, Travel Further - Vending", cuisine: "Sandwiches, Salads, Side Salads, Panini, Snacks, Fresh Fruit, Yogurt Parfait, Bottled Beverages, Mediterranean", amenity: "vending_machine",
    description: "Grab-and-go snacks and beverages",
    outlets: [
      o("Departures / Check-In", "Gate F20", "airside", "Mo-Su 06:00-20:00"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "snacks, healthy snacks, chips, candy, chocolate, oatmeal, milk, chocolate milk, Vegetarian Options, Salad, salads, beverages, grab & go, Vegetarian", amenity: "vending_machine",
    description: "Fresh and healthy selection of salads, wraps, and breakfast choices.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate F9", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate F3", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate F1", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  home_run_inn_pizza: restaurant({
    name: "Home Run Inn Pizza", cuisine: "hot dog, soda, juice, bottled water, snacks, chicago dog, grab & go, beverages, pizza", amenity: "fast_food",
    description: "Known for their famous thin crust, Home Run Inn has been synonymous with the phrase, \"the best pizza in Chicago,\" since 1947. Try a sausage, pepperoni, or cheese 8-inch pie today.",
    website: "homeruninnpizza.com", logoUrl: logo("homeruninnpizza.com"),
    outlets: [
      o("Departures / Check-In", "Gate E5", "airside", "Mo-Su 05:30-21:00"),
    ],
  }),
  la_tapenade_mediterranean_cafe: restaurant({
    name: "La Tapenade Mediterranean Café", cuisine: "Dining", amenity: "cafe",
    description: "Grab-and-go food and beverage items.",
    outlets: [
      o("Departures / Check-In", "Gate E9", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "burger, bacon, dessert, ice cream, parfait, fast food, fries, salads, chicken, breakfast", amenity: "fast_food",
    description: "Global quick-service restaurant serving iconic burgers, word famous fries, and breakfast favorites, known for consistent quality, fast service, cleanliness, and convenient, affordable dining for travelers on the go.",
    outlets: [
      o("Departures / Check-In", "Gate F7", "airside", "Mo-Su 04:00-22:00"),
    ],
  }),
  nuts_on_clark: restaurant({
    name: "Nuts on Clark", cuisine: "grab & go, soda, juice, gatorade, bottled water, cashews, almonds, pecans, Gifts to Travel, Popcorn, Caramelcorn, Gourmet, Cheesecorn, Real Cheese, Water in Designer Bottles, Chocolate, Nuts, Gourmet Gifts and Bags, Honey Butter Nuts, Beverages, Gourmet Giant Cookies, candy, local, gifts, souvenirs", amenity: "fast_food",
    description: "Nuts on Clark provides the highest quality chocolate, confections, nut and popcorn products that clientele anticipates and have enjoyed since \"Nuts on Clark\" opened on Clark Street in Chicago, Illinois over 30 years ago.",
    website: "nutsonclark.com", logoUrl: logo("nutsonclark.com"),
    outlets: [
      o("Departures / Check-In", "Gate E4", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  nuts_on_clark_popcorn_vending: restaurant({
    name: "Nuts On Clark Popcorn - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Enjoy Chicago's famous Nuts on Clark popcorn, freshly made and available in classic favorites like Caramel, Cheese, and Chicago Mix.",
    outlets: [
      o("Departures / Check-In", "Gate E6", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  pepsi_vending: restaurant({
    name: "Pepsi - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks.",
    website: "pepsi.com", logoUrl: logo("pepsi.com"),
    outlets: [
      o("Departures / Check-In", "Departures / Check-In", "airside", ""),
      o("Departures / Check-In", "Gate F9", "airside", "Mo-Su 00:00-24:00", true),
      o("Arrivals / Baggage Claim", "Door 2C", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  skybridge_bar_grill: restaurant({
    name: "Skybridge Bar & Grill", cuisine: "chicken, salads, tv, beer, wine, liquor, juice, kabobs, Vienna Beef, bar, grab & go, american, chicago dog, burger, gyros", amenity: "fast_food",
    description: "Skybridge Bar & Grill serves contemporary Greek cuisine including baklava, steak and chicken kabobs, gyros on pita and spinach pie. A full assortment of sandwiches, salads and hot soups are also available, as well as a fully stocked bar.",
    outlets: [
      o("Departures / Check-In", "Gate F15", "airside", "Mo-Su 06:00-20:30"),
    ],
  }),
  sports_edition_bar: restaurant({
    name: "Sports Edition Bar", cuisine: "Bar", amenity: "bar",
    description: "The Sports Edition Bar lets travelers keep up with all the sports action while enjoying great food and drinks. A dozen 50-inch panel HDTVs show all the games simultaneously.",
    outlets: [
      o("Arrivals / Baggage Claim", "Arrivals / Baggage Claim", "landside", "Mo-Su 14:00-24:00"),
    ],
  }),
  stanleys_blackhawks_kitchen_tap: restaurant({
    name: "Stanley's Blackhawks Kitchen & Tap", cuisine: "tv, beer, wine, liquor, fruit, chips, popcorn, Bar, Alcohol, Red Wine, White Wine, Cocktails, Mixed Drinks, Sandwiches, Salads, Hamburgers, French Fries, Burgers, Vienna Beef, restaurant, grab & go, american, local, breakfast", amenity: "restaurant",
    description: "Pays homage to the local professional hockey team and winner of six Stanley Cup Championships, featuring menu items from Chicago's Blackhawks Stanley's Kitchen and Tap.",
    outlets: [
      o("Departures / Check-In", "Gate E5", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, Breakfast, Coffee, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Frappuccinos, Bagels, Smoothies, bakery, grab & go, snacks", amenity: "cafe",
    description: "Starbucks offers handcrafted coffee beverages, premium teas and delectable treats.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departures / Check-In", "Gate E2", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate E11", "airside", "Mo-Su 04:30-20:30"),
    ],
  }),
  starbucks_vending: restaurant({
    name: "Starbucks - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Coffee offering drinks, snacks, and to-go items.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departures / Check-In", "Gate F1", "airside", "Mo-Su 00:00-24:00", true),
      o("Arrivals / Baggage Claim", "Door 2C", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  summer_house_santa_monica: restaurant({
    name: "Summer House Santa Monica", cuisine: "beer, water, juice, fruit cup, fries, french fries, guacamole, chips, Bar, Burgers, Tacos, Salads, Sandwiches, Breakfast, Fresh-Baked Pastries, Cookies, Alcohol, restaurant, small plates, wine", amenity: "restaurant",
    description: "Enjoy delicious, simply prepared dishes including tacos, salads, sandwiches and breakfasts made with high-quality seasonal ingredients. Fresh cookies, pastries and English muffins are made fresh on site. Restaurant seating, grab and go items, and bar.",
    website: "summerhousesm.com", logoUrl: logo("summerhousesm.com"),
    outlets: [
      o("Departures / Check-In", "Gate E2", "airside", "Mo-Su 05:30-21:00"),
    ],
  }),
  wicker_park_sushi_bar: restaurant({
    name: "Wicker Park Sushi Bar", cuisine: "shrimp, yellowtail, crab, eel, tuna, beef, vegetarian, chicken, salmon, restaurant, bar, sushi, small plates, seafood, nigiri", amenity: "restaurant",
    description: "Watch the professional sushi chef make each sushi roll to order, or enjoy traditional miso soup, raw bar, nigiri and rolls. Full bar service is available.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate E1", "airside", "Mo-Su 10:00-20:00"),
    ],
  }),
};

// ─── Terminal 3 (Concourses G, H, K and L) ───

const terminal3Venues = {
  ag1_vending: restaurant({
    name: "AG1 - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Daily health beverage packed with nutrients to help alleviate bloating, support healthy energy levels, and empower whole body health.",
    website: "drinkag1.com", logoUrl: logo("drinkag1.com"),
    outlets: [
      o("Departures / Check-In", "Gate H1", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  b_smooth_smoothies_salads: restaurant({
    name: "B-Smooth, Smoothies & Salads", cuisine: "healthy salads, edamame, beets, chicken, vegetarian, Smoothies, Frozen Yogurt, Healthy, Ice Cream, Salads, Juices, Chocolates And Snacks, Breakfast, Quick Serve, Healthy Selections, Chicago Favorite, fruit, kale, organic", amenity: "fast_food",
    description: "B-Smooth is a quick serve smoothie and salad stand, featuring healthy non-dairy fresh fruit smoothies, and made to order fresh salads. B-Smooth is locally owned and operated.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate K4", "airside", "Mo-Su 06:00-20:00"),
    ],
  }),
  bjs_gourmet_market: restaurant({
    name: "BJ's Gourmet Market", cuisine: "gatorade, juice, powerade, greek yogurt, bottled water, coconut water, energy drink, Hot Dogs, Italian Beef, Soup, Sandwiches, Salads, Chicken, Breakfast, Yogurt Parfait, Bottled Beverages, Fresh Fruit, Vienna Beef, grab & go, bread bowls, hummus", amenity: "fast_food",
    description: "BJ's Market & Bakery has a reputation in Chicago for serving delicious, high quality food with great customer service at a reasonable price. BJ's Market & Bakery serves breakfast, lunch and dinner with main dishes that include smoked chicken, roasted turkey wings, beef short ribs.",
    outlets: [
      o("Departures / Check-In", "Gate K18", "airside", "Mo-Su 10:00-18:00"),
    ],
  }),
  brioche_doree: restaurant({
    name: "Brioche Dorée", cuisine: "gatorade, juice, milk, chocolate milk, coconut water, energy drink, salads, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Bottled Water, Coke Products, Tea, Brioche Doree, grab & go, coffee, bakery, snacks", amenity: "cafe",
    description: "European-style sandwiches, rich espresso, and freshly baked pastries.",
    website: "briochedoree.com", logoUrl: logo("briochedoree.com"),
    outlets: [
      o("Departures / Check-In", "T3 Rotunda / near Gate G1", "airside", "Mo-Su 05:00-20:30"),
      o("Departures / Check-In", "Near K15", "airside", "Mo-Su 05:00-20:30"),
    ],
  }),
  bubbles_wine_bar: restaurant({
    name: "Bubbles Wine Bar", cuisine: "salads, snacks, shrimp cocktail, ham, Liquor, Alcohol, Spirits, Beer, Red Wine, White Wine, Cheese Plate, Vegetable Plate, bar, small plates, artisanal cheeses, charcuterie plate, smoked salmon, sandwiches", amenity: "bar",
    description: "Settle in at the bar or at the tables by the piano and order your favorite libation. Sample small plates of cheese or vegetables.",
    outlets: [
      o("Departures / Check-In", "Gate H4", "airside", "Mo-Su 05:00-21:30"),
    ],
  }),
  burger_federation: restaurant({
    name: "Burger Federation", cuisine: "breakfast sandwiches, breakfast, wings, wine, burgers, sandwich, vegeterian options, salads, full bar, beer, cocktails, Vienna Beef, burger, small bites, impossible burgers", amenity: "restaurant",
    description: "Casual spot for award-winning burgers, hot dogs and fries and a full bar.",
    outlets: [
      o("Departures / Check-In", "Gate L20", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  burrito_beach: restaurant({
    name: "Burrito Beach", cuisine: "chicken, bbq chicken, beef, vegetables, steak, chili, Mexican, Burritos, Tacos, Healthy, Salads, Grass Fed Beef, Breakfast, Lunch, Dinner, Guacamole, Tortilla Chips, mexican, chips & salsa", amenity: "fast_food",
    description: "Burrito Beach is a fast, casual, Mexican restaurant, featuring made to order burritos, tacos, salads, quesadillas, and twice made daily guacamole. Burrito Beach is locally owned and operated.",
    website: "burritobeach.com", logoUrl: logo("burritobeach.com"),
    outlets: [
      o("Departures / Check-In", "Gate K4", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  cafe_descartes: restaurant({
    name: "Café Descartes", cuisine: "latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, coffee, bakery, grab & go, snacks, breakfast, smoothies", amenity: "cafe",
    description: "Wonderful Chicago favorite coffee and pastry café in Arrivals/baggage claim offering fresh pastries, snacks, specialty coffees, various drinks and snacks.",
    outlets: [
      o("Arrivals / Baggage Claim", "T3 Baggage Claim", "landside", "Mo-Su 06:00-21:00"),
    ],
  }),
  canteen_vending: restaurant({
    name: "Canteen - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks and snacks.",
    website: "canteen.com", logoUrl: logo("canteen.com"),
    outlets: [
      o("Arrivals / Baggage Claim", "Door 3G", "landside", "Mo-Su 00:00-24:00", true),
      o("Arrivals / Baggage Claim", "Door 3G", "landside", "Mo-Su 00:00-24:00", true),
      o("Pedestrian Tunnels", "ID Badging", "landside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate H1", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  carlos_bake_shop_express_vending: restaurant({
    name: "Carlo's Bake Shop Express - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Delicious cakes and baked goods from the 'Cake Boss', Buddy Valastro's famous Carlo's Bake Shop.",
    outlets: [
      o("Departures / Check-In", "Gate H8", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  chicago_cubs_bar_grill: restaurant({
    name: "Chicago Cubs Bar & Grill", cuisine: "beer, wine, liquor, tv, shrimp cocktail, chicken wings, bbq wings, Bar, Alcohol, Red Wine, White Wine, Cocktails, Mixed Drinks, sandwiches, salads, Hamburgers, Vienna Beef, restaurant, bar, american, burger, chicago cubs apparel, local", amenity: "bar",
    description: "Chicago Cubs Bar & Grill features a menu reminiscent of favorites at Wrigley Field, including Vienna Beef Hot Dogs and the Stan Burger, as well as appetizers, salads, soups, sandwiches and a kids menu. Two full bars offer more than 20 types of beer and a selection of cocktails and wines.",
    outlets: [
      o("Departures / Check-In", "Gate G1", "airside", "Mo-Su 06:00-20:30"),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "beer, wine, liquor, eggs, french toast, pancakes, Hamburger, Chicken, French Fries, Sandwiches, Salads, Appetizers, Desserts, Breakfast, Margaritas, Bar, Alcohol, Burgers, restaurant, american, grab & go, tex-mex", amenity: "restaurant",
    description: "Chili's is known for \"Southwestern-inspired American favorites\" like burgers, fajitas, and margaritas. There are over 1,600 Chili's restaurants in 30 countries.",
    outlets: [
      o("Departures / Check-In", "Gate G10", "airside", "Mo-Su 05:30-20:00"),
      o("Departures / Check-In", "Gate H2", "airside", "Mo-Su 06:00-21:30"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "sausage, bacon, juice, iced coffee, tea, espresso, breakfast, coffee, breakfast sandwiches, bakery, donuts, bagel", amenity: "cafe",
    description: "Dunkin' sells 52 varieties of donuts and more than a dozen coffee beverages as well as an array of bagels, breakfast sandwiches and other baked goods.",
    outlets: [
      o("Departures / Check-In", "Gate H5", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  facades_bar: restaurant({
    name: "Facades Bar", cuisine: "beer, spirits, Bar, Alcohol, Wine, Mixed Drinks, tv, snacks, liquor, energy drink", amenity: "bar",
    description: "Sit and relax at Facades Bar, serving premium beer, wine and spirits.",
    outlets: [
      o("Departures / Check-In", "Gate K15", "airside", "Mo-Su 07:00-21:30"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "snacks, healthy snacks, chips, candy, chocolate, oatmeal, milk, chocolate milk, Vegetarian Options, Salad, salads, beverages, grab & go", amenity: "vending_machine",
    description: "Fresh and healthy selection of salads, wraps, and breakfast choices.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate K6", "airside", "Mo-Su 00:00-24:00", true),
      o("Arrivals / Baggage Claim", "Baggage Claim / Door 3G", "landside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Departures / Check-In", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Door 3G", "landside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate K15", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate H1", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  farmers_market: restaurant({
    name: "Farmers Market", cuisine: "snacks, healthy snacks, chips, candy, chocolate, oatmeal, milk, chocolate milk, Gluten, chocolates, beverages, salads, sandwiches, grab & go", amenity: "fast_food",
    description: "Farmers Market encompasses a wide range of tastes that are conveniently packaged for eating on the go. The products include fine chocolates, unique beverages, salads and sandwiches.",
    outlets: [
      o("Departures / Check-In", "T3 Rotunda/near Gate G1", "airside", "Mo-Su 05:30-20:30"),
    ],
  }),
  fulton_street_cafe: restaurant({
    name: "Fulton Street Cafe", cuisine: "latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, Breakfast, Coffee, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Frappuccinos, Bagels, Smoothies, bakery, grab & go, snacks", amenity: "cafe",
    description: "Featuring Intelligentsia Coffee, Fulton Street Cafe offers a delectable variety of pastries and rich coffee offerings that will appeal to every palette. Try a smooth Nitro Cold Coffee or a rich Toffee Crunch Cookie today.",
    outlets: [
      o("Departures / Check-In", "Gate H14", "airside", "Mo-Su 05:00-20:00"),
    ],
  }),
  garrett_popcorn_shops: restaurant({
    name: "Garrett Popcorn Shops", cuisine: "Beverages, Popcorn Tins, Popcorn Bags, Chicago Mix, CheeseCorn, CaramelCrisp, Chicago Tins, popcorn, local, soda, juice, bottled water", amenity: "fast_food",
    description: "Enjoy handmade gourmet popcorn, made fresh daily with high-quality ingredients. A Chicago tradition since 1949, Garrett Popcorn is known for its signature recipes and iconic flavors.",
    website: "garrettpopcorn.com", logoUrl: logo("garrettpopcorn.com"),
    outlets: [
      o("Departures / Check-In", "Gate H2", "airside", "Mo-Su 07:00-20:00"),
    ],
  }),
  gold_coast_dogs: restaurant({
    name: "Gold Coast Dogs", cuisine: "deep dish, hot dog, chicago dog, fruit, greek yogurt, milk, chocolate milk, Vienna Beef, pizza, sandwiches, grab & go, snacks, coffee", amenity: "fast_food",
    description: "Don't leave the city without sampling a true Chicago hot dog from Gold Coast Dogs!",
    outlets: [
      o("Departures / Check-In", "Gate L4", "airside", "Mo-Su 04:30-21:00"),
    ],
  }),
  goose_island_beer_company: restaurant({
    name: "Goose Island Beer Company", cuisine: "tv, liquor, beer, wine, bottled water, soda, juice, Hamburger, Chicken, French Fries, Sandwiches, Salads, Appetizers, Desserts, Breakfast, Alcohol, Burgers, bar, paninis, flatbreads, grab & go, local", amenity: "bar",
    description: "Chicago's very own Goose Island Brewing Company brews its own beer and root beer right here in the City. Come sample their home-brewed favorites where a full service bar awaits you. Paninis, salads and sandwiches available.",
    website: "gooseisland.com", logoUrl: logo("gooseisland.com"),
    outlets: [
      o("Departures / Check-In", "Gate L10", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  great_american_bagel_company: restaurant({
    name: "Great American Bagel Company", cuisine: "breakfast, breakfast sandwiches, soda, greek yogurt, energy drink, hummus, bagel, eggs, Bagel Sandwiches, Cream Cheese, Coffee, Espresso, Latte, deli, grab & go, soup, salads, coffee", amenity: "cafe",
    description: "Looking for a great place to grab a healthy breakfast for lunch? Try the Great American Bagel for delicious fare.",
    outlets: [
      o("Departures / Check-In", "T3 Rotunda / near Gate G1", "airside", "Mo-Su 06:00-20:30"),
      o("Departures / Check-In", "Gate K1", "airside", "Mo-Su 06:00-20:30"),
      o("Departures / Check-In", "Gate H10", "airside", "Mo-Su 06:00-20:30"),
    ],
  }),
  green_market: restaurant({
    name: "Green Market", cuisine: "soda, juice, nuts, trail mix, chocolate, fruit, Locally sourced pre-packaged, cold brew coffee, chips and snacks., Pre-packaged, sandwiches, salads, vegetables, Pepsi, Coke, energy drinks, juices, water, snacks, chips, caramel popcorn, gum, candies, Quick Serve, Chocolates And Snacks, Breakfast, grab & go, candy, bottled water", amenity: "fast_food",
    description: "Perfectly packaged for traveling, select from tasty turkey, chicken, tuna sandwiches, salads, and sliced fruit cups and veggie trays. Select granola and energy bars, yogurt, chips, candies, snacks and more.",
    outlets: [
      o("Departures / Check-In", "Gate L3", "airside", "Mo-Su 06:00-22:00"),
      o("Departures / Check-In", "Gate H5", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  half_moon_empanadas: restaurant({
    name: "Half Moon Empanadas", cuisine: "Dining", amenity: "fast_food",
    description: "Half Moon Empanadas is a woman-owned company that offers Argentinian empanadas made from scratch, by hand and made from the highest quality ingredients. Half Moon's unique grab-and-go empanadas bring ethnic comfort food and flavors to passengers in a convenient, healthy, and affordable manner.",
    website: "halfmoonempanadas.com", logoUrl: logo("halfmoonempanadas.com"),
    outlets: [
      o("Departures / Check-In", "T3 Rotunda / near Gate G1", "airside", "Mo-Su 11:00-19:00"),
    ],
  }),
  ice_dishes_drinks: restaurant({
    name: "ICE Dishes & Drinks", cuisine: "liquor, beer, wine, eggs, bacon, sausage, vegetable sampler, artisan cheese plate, charcuterie plate, Breakfasts, Salads, Tartines, Appetizers, Cheese Plate, Spirits, Iced Vodkas, restaurant, bar, small plates, grab & go, breakfast, tv", amenity: "restaurant",
    description: "The contemporary bar features a bottle display of 26 vodkas, (organic, wheat, grain, rye and grape). Various textures of \"ice\" accentuate drink flavors, incorporating shaved, cubed, blocked, and more. Choose sparkling wines, spirits, beer, tapas, tartines, salads, vegetable sampler, Charcuterie, artisan cheese plate, Beefsteak tomato salad, and fresh berries.",
    outlets: [
      o("Departures / Check-In", "Gate L1", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  la_tapenade_mediterranean_cafe: restaurant({
    name: "La Tapenade Mediterranean Café", cuisine: "beer, tv, liquor, wine, salads, fruit cup, chicken, Sandwiches, Side Salads, Panini, Snacks, Fresh Fruit, Yogurt Parfait, Bottled Beverages, Mediterranean, restaurant, bar, breakfast, pizza", amenity: "restaurant",
    description: "La Tapenade exudes the warmth and abundance of the coastal culture with its irresistible display of pastries, breads, gourmet sandwiches and pizzas. Fresh herbs, fine cheeses, specialty grilled meats and fire-roasted vegetables are used throughout the entire menu. Hand-made Mediterranean flatbreads are all baked fresh each day.",
    outlets: [
      o("Departures / Check-In", "Gate H14", "airside", "Mo-Su 05:30-20:30"),
    ],
  }),
  macaroni_grill: restaurant({
    name: "Macaroni Grill", cuisine: "juice, soda, bottled water, coconut water, milk, chocolate milk, restaurant, bar, italian, antipasti, pizza, grab & go", amenity: "restaurant",
    description: "Let the aroma of Tuscan bread guide you to Macaroni Grill where you can enjoy family style dining of your Italian favorites.",
    website: "macaronigrill.com", logoUrl: logo("macaronigrill.com"),
    outlets: [
      o("Departures / Check-In", "Gate K2", "airside", "Mo-Su 05:30-21:00"),
    ],
  }),
  manchu_wok: restaurant({
    name: "Manchu Wok", cuisine: "chicken, beef, soda, Chinese Cusine, Orange Chicken, Rice, Noodles, Beverages, Sweet & Sour Chicken, fast food, asian, fried rice, egg rolls, grab & go", amenity: "fast_food",
    description: "Fast and fresh Chinese cuisine ranging in style from Cantonese to Szechwan. On the menu are recognizable dishes like General Tso's and Kung Pao Chicken, Spicy Beef, and Sweet & Sour Pork.",
    website: "manchuwok.com", logoUrl: logo("manchuwok.com"),
    outlets: [
      o("Departures / Check-In", "Gate H5", "airside", "Mo-Su 09:00-20:00"),
      o("Departures / Check-In", "T3 Rotunda/near Gate G1", "airside", "Mo-Su 09:00-20:00"),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "burger, bacon, dessert, ice cream, parfait, fast food, fries, salads, chicken, breakfast", amenity: "fast_food",
    description: "Global quick-service restaurant serving iconic burgers, word famous fries, and breakfast favorites, known for consistent quality, fast service, cleanliness, and convenient, affordable dining for travelers on the go.",
    outlets: [
      o("Departures / Check-In", "Gate H9", "airside", "Mo-Su 04:00-22:00"),
      o("Departures / Check-In", "Gate H5", "airside", "Mo-Su 04:00-22:00"),
      o("Departures / Check-In", "Gate K9", "airside", "Mo-Su 04:00-22:00"),
      o("Departures / Check-In", "Gate L4", "airside", "Mo-Su 04:00-22:00"),
    ],
  }),
  mycha_vending: restaurant({
    name: "Mycha - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Mycha is a self-service fridge with a variety of bubble tea, fruit tea, and coffee selections.",
    outlets: [
      o("Departures / Check-In", "Gate G3", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  nuts_on_clark: restaurant({
    name: "Nuts on Clark", cuisine: "grab & go, soda, juice, gatorade, bottled water, cashews, almonds, pecans, Gifts to Travel, Popcorn, Caramelcorn, Gourmet, Cheesecorn, Real Cheese, Water in Designer Bottles, Chocolate, Nuts, Gourmet Gifts and Bags, Honey Butter Nuts, Beverages, Gourmet Giant Cookies, candy, local, gifts, souvenirs", amenity: "fast_food",
    description: "Nuts on Clark provides the highest quality chocolate, confections, nut and popcorn products that clientele anticipates and have enjoyed since \"Nuts on Clark\" opened on Clark Street in Chicago, Illinois over 30 years ago.",
    website: "nutsonclark.com", logoUrl: logo("nutsonclark.com"),
    outlets: [
      o("Departures / Check-In", "Gate H8", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  nuts_on_clark_chocolate_nut_vending: restaurant({
    name: "Nuts on Clark Chocolate/Nut - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Treat yourself to Nuts on Clark's delicious selection of gourmet nuts, chocolates, and sweet snacks, perfect for enjoying on the go or taking home as a gift.",
    outlets: [
      o("Departures / Check-In", "Gate K15", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate H4", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  nuts_on_clark_popcorn_vending: restaurant({
    name: "Nuts On Clark Popcorn - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Enjoy Chicago's famous Nuts on Clark popcorn, freshly made and available in classic favorites like Caramel, Cheese, and Chicago Mix.",
    outlets: [
      o("Departures / Check-In", "Gate L20", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate K12", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate K1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate G7", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  nuts_on_clark_popcorn_chocolate_vending: restaurant({
    name: "Nuts on Clark Popcorn/Chocolate - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Treat yourself to Nuts on Clark's delicious selection of gourmet nuts, chocolates, and sweet snacks, perfect for enjoying on the go or taking home as a gift.",
    outlets: [
      o("Departures / Check-In", "Gate G7", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  obriens_restaurant_bar: restaurant({
    name: "O'Briens Restaurant & Bar", cuisine: "chips, gatorade, soda, breakfast sandwiches, omelet, ham, bagel, bacon, bar, grab & go, breakfast, american, sandwiches, chicago dog", amenity: "fast_food",
    description: "O'Briens Restaurant & Bar has a 30 year history in the Windy City, serving breakfast, lunch and dinner, plus a bar with beer, wine and other liquor.",
    outlets: [
      o("Departures / Check-In", "Gate H5", "airside", "Mo-Su 06:00-20:00"),
    ],
  }),
  pepsi_vending: restaurant({
    name: "Pepsi - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks.",
    website: "pepsi.com", logoUrl: logo("pepsi.com"),
    outlets: [
      o("Arrivals / Baggage Claim", "Door 3G", "landside", "Mo-Su 00:00-24:00", true),
      o("Pedestrian Tunnels", "ID Badging", "landside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate K1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate G7", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  publican_tavern: restaurant({
    name: "Publican Tavern", cuisine: "restaurant, bar, beer, wine, tv, liquor, pork, pork rinds, pulled pork, sit down restaurant, healthy selections, accessibility, craft beer \", farm sourced, burger, chicken wings, salads, sandwiches, fish", amenity: "restaurant",
    description: "Publican Tavern comfortably accommodates travelers seeking a quick snack before takeoff or guests with time to enjoy a leisurely breakfast, lunch or dinner. With a focus on seasonality and quality sourcing, the approachable menu offers an array of grab-and-go options, sandwiches and salads, as well as a thoughtful selection of craft beer & wine.",
    outlets: [
      o("Departures / Check-In", "Gate K1", "airside", "Mo-Su 05:30-20:30"),
    ],
  }),
  reggios_chicago_style_pizza: restaurant({
    name: "Reggio's Chicago Style Pizza", cuisine: "hot dog, pizza, pepperoni, soda, juice, breakfast, \"Pizza, Chicago style, Beverages, Bottled Water \", Vienna Beef, grab & go, chicago dog, deep dish, snacks, local, bottled water, pasta, meatballs, sandwiches, deli", amenity: "fast_food",
    description: "Reggio's Chicago Style Pizza dishes out classic Chicago dogs and deep dish pizza.",
    outlets: [
      o("Departures / Check-In", "Gate K4", "airside", "Mo-Su 08:00-20:30"),
      o("Departures / Check-In", "Gate G8", "airside", "Mo-Su 07:00-20:30"),
    ],
  }),
  rocky_mountain_chocolate_factory: restaurant({
    name: "Rocky Mountain Chocolate Factory", cuisine: "dessert, vitamin water, juice, soda, coconut water, protein shake, bottled water, Candy, Chocolate, Apples, Candy Coated Apples, Confectionary, Ice Cream, Fudge, Boxed Chocolates, Caramel, Specialty, truffles, toffee, candy apples, gifts", amenity: "fast_food",
    description: "Rocky Mountain Chocolate Factory offers a variety of yummy chocolates and confections to satisfy cravings of even the most ardent chocoholic!",
    website: "rockychoc.com", logoUrl: logo("rockychoc.com"),
    outlets: [
      o("Departures / Check-In", "Gate H5", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  rush_street_bar: restaurant({
    name: "Rush Street Bar", cuisine: "chicago dog, ham, chicken, turkey, chips, fruit, salads, energy drink, Vienna Beef, bar, grab & go, sandwiches, snacks, pretzels", amenity: "bar",
    description: "Rush Street Bar features bar food, grab and go items such as salads, pretzels and other snacks, as well as a full bar with TVs.",
    outlets: [
      o("Departures / Check-In", "Gate H14", "airside", "Mo-Su 07:00-21:30"),
    ],
  }),
  skyscrapers_bar: restaurant({
    name: "Skyscrapers Bar", cuisine: "chicken, salads, tv, beer, wine, liquor, juice, kabobs, Vienna Beef, bar, grab & go, american, chicago dog, burger, gyros", amenity: "bar",
    description: "Cocktail lounge and bar. Grab a drink at Skyscrapers Bar and choose from a selection of deli sandwiches and snacks.",
    outlets: [
      o("Departures / Check-In", "Gate K9", "airside", "Mo-Su 07:00-21:30"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, Breakfast, Coffee, Espresso, Pastries, Sandwiches, Side Salads, Beverages, Frappuccinos, Bagels, Smoothies, bakery, grab & go, snacks", amenity: "cafe",
    description: "Starbucks offers handcrafted coffee beverages, premium teas and delectable treats.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Departures / Check-In", "Gate H1", "airside", "Mo-Su 04:00-20:30"),
      o("Departures / Check-In", "Gate H6", "airside", "Mo-Su 04:30-21:00"),
      o("Departures / Check-In", "Gate K4", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate L1", "airside", "Mo-Su 04:00-21:00"),
      o("Departures / Check-In", "Gate L20", "airside", "Mo-Su 04:30-20:30"),
    ],
  }),
  starbucks_vending: restaurant({
    name: "Starbucks - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Coffee offering drinks, snacks, and to-go items.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Arrivals / Baggage Claim", "Door 3G", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "chips, steak, chicken, pork, roast beef, Sub Sandwiches, Beverages, Salads, Bottled Water, Cookies, Soda Pop, sandwiches, deli, create your own, vegetarian", amenity: "restaurant",
    description: "Subway is known for footlong fresh-baked signature subs. Select veggies, meats, cheese and sauce for a customized sub of your choosing.",
    vegetarian: true,
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("Departures / Check-In", "T3 Rotunda / near Gate G1", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  the_bronze_tap: restaurant({
    name: "The Bronze Tap", cuisine: "tv, fish and chips, liquor, chicken, lamb chops, bar, american, burger, beer, wine", amenity: "restaurant",
    description: "Looking for some good suds, a nice cocktail, or some excellent \"bar food,\" look no further than The Bronze Tap in Terminal 3. For breakfast (served until 9:30 am), try the Smoked Denver Omelet or the classic Steak & Eggs - served with an Angus beef ribeye. All breakfast offerings are served with cage-free eggs. For lunch or dinner, try Chef Erick's Jerk Chicken Sandwich, or the Loaded Fries (with cheddar cheese, chopped bacon, sour cream and green onions). In a rush? Place your food order to-go.",
    outlets: [
      o("Departures / Check-In", "Gate K4", "airside", "Mo-Su 05:00-21:30"),
    ],
  }),
  tortas_frontera_by_rick_bayless: restaurant({
    name: "Tortas Frontera by Rick Bayless", cuisine: "tv, beer, wine, liquor, mexican, tea, soda, juice, Guacamole, Tortas, Sandwiches, Salads, Salsa, Margaritas, Chips, Drinks, Cazuela, Mollete, Tortilla, Flatbread, Queso, Choriqueso, Chile, Drinks. Quickserve, Bar, HealthySelections, Chicago Favorite, Vegetarian, Airfiled View, Gluten Friendly, molletes, soup, breakfast", amenity: "fast_food",
    description: "Explore the amazing flavors of Mexico at Tortas Frontera by Rick Bayless. The cuisine features hand-crafted tortas, fresh-made guacamole and hand-shaken margaritas. Now the type of quick-service gourmet you expect to find in a downtown hotspot is available \"to go\", at O'Hare.",
    vegetarian: true, glutenFree: true,
    website: "rickbayless.com", logoUrl: logo("rickbayless.com"),
    outlets: [
      o("Departures / Check-In", "Gate K4", "airside", "Mo-Su 05:00-21:30"),
    ],
  }),
  veteran_roasters_brown_sugar_bakery: restaurant({
    name: "Veteran Roasters/Brown Sugar Bakery", cuisine: "Dining", amenity: "cafe",
    description: "Veteran Roasters Coffee and Brown Sugar Bakery has teamed up to offer a wonderful assortment of Chicago's favorite home-roasted coffee, and the southside's southern-influenced delectable sweet treats.",
    outlets: [
      o("Departures / Check-In", "Gate K15", "airside", "Mo-Su 05:00-20:30"),
    ],
  }),
  windy_city_mart_beverages_vending: restaurant({
    name: "Windy City Mart Beverages - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks.",
    outlets: [
      o("Pedestrian Tunnels", "ID Badging", "landside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate H12", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate H1", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  windy_city_mart_snacks_vending: restaurant({
    name: "Windy City Mart Snacks - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks and snacks.",
    outlets: [
      o("Departures / Check-In", "Gate K15", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate K1", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate H12", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  wolfgang_puck_express: restaurant({
    name: "Wolfgang Puck Express", cuisine: "restaurant, wine, liquor, chips, grab & go, bar, breakfast, sandwiches, pizza, tv, beer", amenity: "restaurant",
    description: "Critically acclaimed chef Wolfgang Puck brings an eclectic interior design and savory dishes are a treat for the eyes and palette. Full Bar.",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("Departures / Check-In", "Gate K12", "airside", "Mo-Su 05:30-21:00"),
    ],
  }),
};

// ─── Terminal 5 (Concourse M) ───

const terminal5Venues = {
  ag1_vending: restaurant({
    name: "AG1 - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Daily Health Drink with nutrients to help alleviate bloating, support healthy energy levels, and empower whole body health.",
    website: "drinkag1.com", logoUrl: logo("drinkag1.com"),
    outlets: [
      o("Departures / Check-In", "Gate M14", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  bar_siena: restaurant({
    name: "Bar Siena", cuisine: "Chicagoland Favorites, Local taste of Chicago, Freshly Prepared Food, Variety, Speed of Service, QR Code, Bar, Bar Sienna, Cocktails, Italian Fare, Casual and Energetic Bar, Rustic, Appetizers, Pizza, Pasta.", amenity: "restaurant",
    description: "Regarded for its flagship location in Chicago's West Loop \"Restaurant Row\", Bar Siena offers travelers the perfect setting to enjoy brunch, lunch, and dinner. Menu features include Italian street food and a pizza bar, along with small plates constructed to share.",
    website: "barsiena.com", logoUrl: logo("barsiena.com"),
    outlets: [
      o("Departures / Check-In", "Gate M30", "airside", "Mo 11:00-19:00; Th-Su 11:00-19:00"),
    ],
  }),
  baskin_robbins_dunkin: restaurant({
    name: "Baskin Robbins & Dunkin'", cuisine: "Dining", amenity: "cafe",
    description: "Fuel your journey with freshly brewed coffee, espresso drinks, donuts, breakfast sandwiches, and other Dunkin' favorites, or treat yourself to Baskin-Robbins ice cream, shakes, and sweet treats before your flight.",
    outlets: [
      o("Arrivals / Baggage Claim", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  big_bowl: restaurant({
    name: "Big Bowl", cuisine: "asian, chinese, beer, wine, tv, Sit down Restaurant, Bar, Chicago Favorite, Quick Serve, postickers, noodles, chicken, beef, fried rice, egg rolls", amenity: "restaurant",
    description: "Enjoy authentic Chinese and Thai cuisine made with fresh, high-quality ingredients. Choose from flavorful bowls, rice and noodle dishes, housemade sauces, and classic sides like potstickers and egg rolls - all served with Big Bowl's signature bold flavor.",
    website: "bigbowl.com", logoUrl: logo("bigbowl.com"),
    outlets: [
      o("Departures / Check-In", "Gate M11", "airside", ""),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "soda, Burger, King, Fries, Sandwich, Chicken, Ice Cream, Café, BK, Whopper, Coffee, Grill, Fast, Quickserve", amenity: "fast_food",
    description: "Home of the iconic WHOPPER®, Burger King is a global quick-service restaurant known for flame-broiled burgers, classic favorites, and high-quality, great-tasting food at an affordable price.",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("Departures / Check-In", "Gate M11", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  butcher_the_burger: restaurant({
    name: "Butcher & The Burger", cuisine: "Burgers, sandwiches, salads, full breakfest menu, prime beef, turkey, vegan, lentil", amenity: "restaurant",
    description: "Not just another burger joint, Butcher & The Burger is your neighborhood burger counter (from Lincoln Park) - where you can customize your prime beef, turkey or vegan lentil burger with the toppings you prefer. Butcher also offers sandwiches, salads and a full breakfast menu.",
    vegan: true,
    website: "butcherandtheburger.com", logoUrl: logo("butcherandtheburger.com"),
    outlets: [
      o("Departures / Check-In", "Gate M28", "airside", "Mo-Su 04:30-20:00"),
    ],
  }),
  canteen_vending: restaurant({
    name: "Canteen - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with drinks and snacks.",
    website: "canteen.com", logoUrl: logo("canteen.com"),
    outlets: [
      o("Departures / Check-In", "Gate M35", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  carlos_bake_shop_express_vending: restaurant({
    name: "Carlo's Bake Shop Express - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Delicious cakes and bakery from Buddy Valastro's famous Carlo's Bake Shop.",
    outlets: [
      o("Departures / Check-In", "Gate M14", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  chi_life_market: restaurant({
    name: "CHI Life Market", cuisine: "Dining", amenity: "fast_food",
    description: "CHI Life Market is a traveler's best friend for convenient, grab & go options - including fresh fruit, yogurt parfaits and premium bottled water.",
    outlets: [
      o("Departures / Check-In", "Gate M4", "airside", "Mo-Su 10:00-20:00"),
    ],
  }),
  chicago_essentials_vending: restaurant({
    name: "Chicago Essentials - Vending", cuisine: "Cough Suppressant, Tylenol Cold & Flu, Advil Sinus Congestion & Pain, Halls Cough, Dayquil, Nyquil, Robitussin, Advil, Advil Jr., Ibuprofen, Tylenol, Aleve Pain Reliever, Afrin, Clear Eyes Drops, Benadryl Allergy, Imodium, Gas-X Antigas, Tums Antacid, Pepto Bismol, Sominex Sleep-Aid, Dramamine Motion Sickness Relief, Dramamine Kids, Claritin Allergy, Band-Aid, Deodorant, Lip Balm, Cocoa Butter, Alka Seltzer, Mouthwash, Toothpaste, Hand Sanitizer, Disinfecting Wipes, Maxi Pads, Tampons, Airborne, Tampax, KN95 Mask, Earbuds, chargers, cables, pharmacy, 24/7, automated vending", amenity: "vending_machine",
    description: "ShopAll Travel Essentials offers mobile accessories and (over the counter) medical and hygiene essentials in 24/7 vending units. Available: cold liquids and tables, to adhesive bandages, to disposable masks and other personal care and travel needs along with electronic mobile accessories.",
    phone: "+1 (855) 969 - 8678",
    outlets: [
      o("Departures / Check-In", "Departures / Check-In", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  chicago_neighborhood_market_goods: restaurant({
    name: "Chicago Neighborhood Market & Goods", cuisine: "Dining", amenity: "fast_food",
    description: "Proudly featuring socially responsible suppliers from local Chicago neighborhoods, this elevated grab-and-go kiosk offers high-quality pre-packaged sandwiches, salads, snacks, beverages, and more for travelers on the go.",
    outlets: [
      o("Departures / Check-In", "Gate M9", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "Grab & go, chicken, sandwich, fries, chicken tenders, chicken nuggets, fast food, treats", amenity: "fast_food",
    description: "Whether you're hungry for a Chick-fil-A® Chicken Sandwich or salads prepared fresh daily, we're here to serve you delicious food made with quality ingredients every day (except Sunday).",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("Departures / Check-In", "Gate M10", "airside", "Mo-Sa 05:00-22:00"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "Coffee", amenity: "cafe",
    description: "Dunkin' sells 52 varieties of donuts and more than a dozen coffee beverages as well as an array of bagels, breakfast sandwiches and other baked goods.",
    outlets: [
      o("Departures / Check-In", "Gate M16", "airside", "Mo-Su 12:00-12:00"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "snacks, healthy snacks, chips, candy, chocolate, oatmeal, milk, chocolate milk, Vegetarian Options, Salad, salads, beverages, grab & go", amenity: "vending_machine",
    description: "Fresh and healthy selection of salads, wraps, and breakfast choices.",
    vegetarian: true,
    outlets: [
      o("Departures / Check-In", "Gate M8", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate M21", "airside", "Mo-Su 00:00-24:00", true),
      o("Departures / Check-In", "Gate M24", "airside", "Mo-Su 00:00-24:00", true),
      o("Arrivals / Baggage Claim", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  garrett_popcorn_shops: restaurant({
    name: "Garrett Popcorn Shops", cuisine: "Beverages, Popcorn Tins, Popcorn Bags, Chicago Mix, CheeseCorn, CaramelCrisp, Chicago Tins", amenity: "fast_food",
    description: "Enjoy handmade gourmet popcorn, made fresh daily with high-quality ingredients. A Chicago tradition since 1949, Garrett Popcorn is known for its signature recipes and iconic flavors.",
    website: "garrettpopcorn.com", logoUrl: logo("garrettpopcorn.com"),
    outlets: [
      o("Departures / Check-In", "Gate M18", "airside", "Mo-Su 08:00-21:00"),
    ],
  }),
  hub_51: restaurant({
    name: "Hub 51", cuisine: "wine, sushi, fish, seafood, crab, tuna, Chili, Chicago Favorite, Sit Down Restaurant, Bar, Quick Serve, small plates, burger, tacos, beer, tv", amenity: "restaurant",
    description: "Feast on eclectic fare in a hip, modern atmosphere. Relax and enjoy the views from the expansive bar, and wash it all down with local beers, a diverse wine list and fresh cocktails.",
    website: "hub51chicago.com", logoUrl: logo("hub51chicago.com"),
    outlets: [
      o("Departures / Check-In", "Gate M16", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  liquid_iv_vending: restaurant({
    name: "Liquid IV - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Stay hydrated and energized on the go with Liquid I.V., a science-backed hydration drink mix that helps you feel your best while traveling.",
    website: "liquid-iv.com", logoUrl: logo("liquid-iv.com"),
    outlets: [
      o("Departures / Check-In", "Gate M14", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "burger, bacon, dessert, ice cream, parfait, fast food, fries, salads, chicken, breakfast", amenity: "fast_food",
    description: "Global quick-service restaurant serving iconic burgers, word famous fries, and breakfast favorites, known for consistent quality, fast service, cleanliness, and convenient, affordable dining for travelers on the go.",
    outlets: [
      o("Arrivals / Baggage Claim", "Baggage Claim", "landside", "Mo-Su 05:00-21:00"),
    ],
  }),
  metropolis_coffee_company: restaurant({
    name: "Metropolis Coffee Company", cuisine: "Coffee, Grab & go, fresh, sandwiches, gluten free, vegan, vegetarian, retail, beer, wine", amenity: "cafe",
    description: "Metropolis is an award winning coffee brand from Chicago. Fair-trade, sustainable coffee with a wide array of local pastries, grab & go options, along with beer/wine. Serving up great coffee for everyone!",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "metropoliscoffee.com", logoUrl: logo("metropoliscoffee.com"),
    outlets: [
      o("Departures / Check-In", "Gate M30", "airside", "Mo-Su 04:00-22:00"),
    ],
  }),
  nuts_on_clark: restaurant({
    name: "Nuts on Clark", cuisine: "grab & go, soda, juice, gatorade, bottled water, cashews, almonds, pecans, Gifts to Travel, Popcorn, Caramelcorn, Gourmet, Cheesecorn, Real Cheese, Water in Designer Bottles, Chocolate, Nuts, Gourmet Gifts and Bags, Honey Butter Nuts, Beverages, Gourmet Giant Cookies, candy, local, gifts, souvenirs", amenity: "fast_food",
    description: "Nuts on Clark provides the highest quality chocolate, confections, nut and popcorn products that clientele anticipates and have enjoyed since \"Nuts on Clark\" opened on Clark Street in Chicago, Illinois over 30 years ago.",
    website: "nutsonclark.com", logoUrl: logo("nutsonclark.com"),
    outlets: [
      o("Arrivals / Baggage Claim", "Baggage Claim", "landside", "Mo-Su 09:00-19:00"),
    ],
  }),
  pepsi_vending: restaurant({
    name: "Pepsi - Vending", cuisine: "Vending", amenity: "vending_machine",
    description: "Vending machine with cold drinks.",
    website: "pepsi.com", logoUrl: logo("pepsi.com"),
    outlets: [
      o("Departures / Check-In", "Gate M35", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  protein_bar_kitchen_kiosk: restaurant({
    name: "Protein Bar & Kitchen Kiosk", cuisine: "Dining", amenity: "restaurant",
    description: "Grab a quick, better-for-you option on the go with Protein Bar's selection of protein-packed wraps, smoothies, coffee, and energizing snacks made for busy travelers.",
    website: "theproteinbar.com", logoUrl: logo("theproteinbar.com"),
    outlets: [
      o("Departures / Check-In", "Gate M25", "airside", "Mo-Fr 11:00-19:00; Sa 10:00-19:00; Su 10:00-21:00"),
    ],
  }),
  protein_bar_and_kitchen: restaurant({
    name: "Protein Bar and Kitchen", cuisine: "Healthy, salads, wraps, breakfast, oatmeal, snacks, water, juice, chips, yogurt, parfaits, Vegan, vegetarian, gluten-free, protein, smoothies, shakes, blended drinks, grab & go", amenity: "fast_food",
    description: "Healthy on the fly. Chicago's original healthy restaurant, offering a curated selection of grab-and-go breakfast, salad and wrap options along with retail snacks and beverages.",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "theproteinbar.com", logoUrl: logo("theproteinbar.com"),
    outlets: [
      o("Departures / Check-In", "Gate M15", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  publican_quality_bread: restaurant({
    name: "Publican Quality Bread", cuisine: "Dining", amenity: "cafe",
    description: "Looking for a tasty pastry, a good cappuccino, or an excellent chai latte - look no further than PQB. Offering a wide selection of great bakery bites and grab & go favorites, Publican Quality Bread is a quick fix for quality options.",
    outlets: [
      o("Departures / Check-In", "Gate M5", "airside", "Mo-Su 04:30-20:00"),
    ],
  }),
  r_j_grunts_burgers_fries: restaurant({
    name: "R.J. Grunts Burgers & Fries", cuisine: "cheeseburger, hamburger, bacon, Cheddar, Mushroom, Buffalo Chicken, Chili, Chicken, French Fries, Sandwiches, Salads, Appetizers, Burgers, burger, veggie burger, fries, chicken fingers", amenity: "restaurant",
    description: "A Chicago favorite known for its best-in-town burgers, RJ Grunts serves classic American comfort food with the perfect side of crispy French fries.",
    website: "rjgruntschicago.com", logoUrl: logo("rjgruntschicago.com"),
    outlets: [
      o("Departures / Check-In", "Gate M16", "airside", "Mo-Su 10:00-21:00"),
    ],
  }),
  the_dearborn: restaurant({
    name: "The Dearborn", cuisine: "Breakfast, Lunch, Dinner, Bar, Cocktails Fine dining, Pizza, Sandwiches, Salads, Soups Grab & Go, American, Tavern, Local, Gluten-free, Vegetarian, Vegan, Seafood, Steak, Fresh, Coffee", amenity: "restaurant",
    description: "An urban American tavern featuring elevated, Midwest-inspired cuisine, The Dearborn offers full sit-down service along with a convenient grab-and-go marketplace serving freshly brewed coffee and quick bites.",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "thedearborntavern.com", logoUrl: logo("thedearborntavern.com"),
    outlets: [
      o("Departures / Check-In", "Gate M17", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  the_goddess_and_grocer: restaurant({
    name: "The Goddess and Grocer", cuisine: "fruit, snacks, candy, chocolate, chips, grab & go, bottled water, soda, juice, ChicagoFavorite, QuickServe, PickUp, DinePreSecurity, HealthySelections, pizza, deli, sandwiches, mediterranean, beer, coffee", amenity: "fast_food",
    description: "Explore The Goddess and Grocer, a local gourmet deli concept featuring freshly made sandwiches, hot or cold wraps, flatbread pizza, soups and salads, and a plethora of distinct snack items. Enjoy freshly brewed coffee, espresso, lattes, cappuccino or tea.",
    website: "goddessandgrocer.com", logoUrl: logo("goddessandgrocer.com"),
    outlets: [
      o("Departures / Check-In", "Departures", "landside", "Mo-Su 05:00-22:00"),
    ],
  }),
  the_hampton_social: restaurant({
    name: "The Hampton Social", cuisine: "Rose All Day, Lively Bar, Coastal-inspired Food, Specialty Cocktails, Salads, Seafood, Pizza, Chicken, Hand Helds, Sandwiches, Burgers.", amenity: "restaurant",
    description: "Chicago's favorite coastally inspired bar & small plates concept brings a fun stop for O'Hare travelers. The Hampton Social isa nautically themed oasis, where the signature \"Rosé All Day\" Instagram-moment will draw guests in, and the soft and bright finishes provide a respite.",
    website: "thehamptonsocial.com", logoUrl: logo("thehamptonsocial.com"),
    outlets: [
      o("Departures / Check-In", "Gate M7", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  tocco: restaurant({
    name: "Tocco", cuisine: "restaurant, bar, beer, wine, eggs, frittata, soup, \"Pizza, Pasta, Insalata, Zuppe, Salad, Spirits, Military & Travelers Checks \", pizza, italian, breakfast, tv", amenity: "restaurant",
    description: "Grab a seat in Tocco's ultra-chic space and enjoy authentic Italian dishes, handcrafted cocktails, and a refined dining experience. Buon appetito!",
    outlets: [
      o("Departures / Check-In", "Gate M11", "airside", ""),
    ],
  }),
  tortas_frontera_by_rick_bayless: restaurant({
    name: "Tortas Frontera by Rick Bayless", cuisine: "tv, beer, wine, liquor, mexican, tea, soda, juice, Guacamole, Tortas, Sandwiches, Salads, Salsa, Margaritas, Chips, Drinks, Cazuela, Mollete, Tortilla, Flatbread, Queso, Choriqueso, Chile, Drinks. Quickserve, Bar, HealthySelections, Chicago Favorite, Vegetarian, Airfiled View, Gluten Friendly, molletes, soup, breakfast", amenity: "fast_food",
    description: "Explore the amazing flavors of Mexico at Tortas Frontera by Rick Bayless. The cusine features hand-crafted tortas, fresh-made guacamole and hand-shaken margaritas. Now, the type of quick-service gourmet you expect to find in a downtown hotspot is available \"to go\", at O'Hare.",
    vegetarian: true, glutenFree: true,
    website: "rickbayless.com", logoUrl: logo("rickbayless.com"),
    outlets: [
      o("Departures / Check-In", "Gate M18", "airside", ""),
    ],
  }),
  urban_olive: restaurant({
    name: "Urban Olive", cuisine: "chicken, fries, french fries, Pita, Hummus, Tzatziki, Mediterranean, Steak, Vegetable, Greek Fries, Zucchini, Eggplant, Peppers, Cucumber Salad, Tomato Soup, Pita Bread, Mint Lemonade, Chicago Fovorite, Quick Serve, falafel, salads", amenity: "fast_food",
    description: "Delight in fresh, flavorful Mediterranean cuisine with a modern twist, featuring Greek salads, fries, falafel, hummus, and your choice of steak, chicken, or vegetable pitas and platters.",
    outlets: [
      o("Departures / Check-In", "Gate M16", "airside", "Mo-Su 10:00-21:00"),
    ],
  }),
  wow_bao: restaurant({
    name: "Wow Bao", cuisine: "Bao, Spicy Kung Pao, Potstickers, Dumplings, Thai, Thai Curry, Mongolian Beef, Lo Mein, Noodles, Bbq Pork, Coconut Custard, Coconut, Bbq, Pork, Edamame, Whole Wheat, Wheat, Teriyaki, Teriyaki Chicken, Bowl", amenity: "restaurant",
    description: "Enjoy bold, Asian-inspired favorites including steamed bao, flavorful chicken bowls, and satisfying rice and noodle dishes made for a quick and delicious meal on the go.",
    website: "wowbao.com", logoUrl: logo("wowbao.com"),
    outlets: [
      o("Departures / Check-In", "Gate M16", "airside", "Mo-Su 10:00-21:00"),
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
  const r5 = await processTerminal(AIRPORT, TERMINAL_5, 'Terminal 5', terminal5Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3, TERMINAL_5]));

  const totalCreated = r1.created + r2.created + r3.created + r5.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r5.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length
    + Object.keys(terminal3Venues).length + Object.keys(terminal5Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
