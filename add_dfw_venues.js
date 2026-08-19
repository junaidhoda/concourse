'use strict';
/**
 * Fills in complete data for Dallas/Fort Worth International Airport (DFW) —
 * restaurants/cafés/bars/vending in Firestore. Researched 2026-08-17 from the
 * airport's own official site, dfwairport.com, using Claude in Chrome browser
 * automation per explicit user instruction. No third-party/aggregator source
 * was used for any venue field.
 *
 * SOURCE: https://www.dfwairport.com/shop-dine-services/ (DFW's own
 * Shop/Dine/Services directory). The rendered directory is client-built and
 * exposes only name, gate and a live "Now open" flag. Its structured backing
 * data — found by reading the page's own resource timings — is the LocusLabs
 * POI dataset DFW publishes for its official interactive map, served from
 * DFW's own map account A1GKNNFXZEQW1J:
 *   a.locuslabs.com/accounts/A1GKNNFXZEQW1J/dfw/<version>/v5/pois-3.0-dfw.json
 *   a.locuslabs.com/accounts/A1GKNNFXZEQW1J/dfw/<version>/v5/venueData-dfw.json
 * plus the live overlay the same page calls,
 *   marketplace.locuslabs.com/venueId/dfw/dynamic-poi
 * which returns the same POIs enriched with open/closed state and (for a
 * handful of records) operationHours and isTemporarilyClosed. The POI file is
 * a 2,054-record object; 199 carry an `eat*` category. Each supplies poiId,
 * name, category, description, phone, isAfterSecurity, position.floorId,
 * nearbyLandmark, keywords[] and links[]; venueData supplies DFW's own
 * structure and floor names. This is the airport's own published venue data,
 * requested by the airport's own dining page.
 *
 * EXTRACTION + VERIFICATION: the in-terminal dining records were serialised
 * in-page to a printable-ASCII format (`@@` field delimiter, `##` list
 * delimiter) with every non-ASCII character replaced by a reversible `<U+hex>`
 * escape AND every field whitespace-normalised in the browser BEFORE
 * checksumming (a lesson carried over from this session's ORD run, where
 * get_page_text silently collapsed double spaces inside source descriptions
 * and broke 10 of 12 chunk checksums). Split into 12 chunks under 6,800 chars
 * on line boundaries, written into a `<pre id="dataDump">` and retrieved via
 * get_page_text. Every chunk verified EXACTLY on first pass against values
 * computed in the browser before retrieval — len/lines/checksum:
 * 6278/22/26721939, 6729/33/28338829, 6393/15/28006524, 6304/18/27281812,
 * 6587/11/28525010, 6197/11/26717019, 6654/13/28690214, 6603/15/28704540,
 * 6467/14/28166846, 6494/21/28187313, 6410/14/27953266, 2415/5/10503427 —
 * and the rejoined 192-line dataset at len 73542, checksum 318029654, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 5 buckets (A, B, C, D, E). DFW's own map data models
 * the airport as 11 structures: Terminals A, B, C, D and E, a Rental Car
 * Center, four parking structures and a global overlay. Only the five
 * terminals have check-in halls and security screening, and each of the five
 * has BOTH its own ticketing hall and its own security checkpoints, so each is
 * its own bucket — which is also exactly how DFW's own Shop/Dine directory
 * presents its "Select Terminal" filter. The five terminals are all connected
 * post-security by DFW's Skylink train, but that does not merge them under
 * this dataset's test, which is about independent check-in AND independent
 * security, not about post-security connectivity. Applying the test WITHIN a
 * terminal produces no further split: each DFW terminal is a single
 * semicircular concourse whose several checkpoints all feed one continuous
 * secure area, and DFW's own map gives each terminal a single
 * `dfw-terminalX-departures` floor with no per-pier structure.
 *
 * SCOPE — 7 dining POIs EXCLUDED. Three are vending machines in the Rental Car
 * Center (`dfw-rcc-1`), which is not a terminal and which DFW's own terminal
 * filter assigns to no terminal. Four sit on `dfw-terminalc-aaclub`, Level 3
 * of Terminal C — the American Airlines Admirals Club — and are not named
 * venues at all: DFW labels them "Bar", "Dining Area", "Dining Area" and
 * "Dining Area", i.e. generic interior features of a private airline lounge
 * rather than public food-and-beverage outlets. Rather than create Firestore
 * docs called "Dining Area", they are left out of scope. That leaves 192 of
 * the 199 dining POIs.
 *
 * AIRSIDE / LANDSIDE: taken directly from each POI's own `isAfterSecurity`
 * boolean — true → `airside`, false → `landside`. Present on all 199 records;
 * no inference was needed.
 *
 * LEVEL: DFW's own floor name from venueData, which at DFW is a plain level
 * number — "Level 1", "Level 2" (Terminals A/B/C/E departures) and "Level 3"
 * (Terminal D departures, which sits a floor higher than the others).
 *
 * LOCATION_NOTES: each POI's own `nearbyLandmark` verbatim — "Gate D20",
 * "Baggage Claim B5", "A15 Baggage Claim", "D15 South Ticket Hall", "B9" —
 * falling back to the floor name for the records where DFW publishes no
 * landmark (mostly unattributed vending units), rather than guessing one.
 * Where DFW's live feed flags a unit `isTemporarilyClosed`, that is appended
 * to the note in DFW's own terms rather than the venue being dropped.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal bucket are
 * merged into one doc with one `outlets[]` entry per physical unit;
 * same-brand venues in DIFFERENT terminals stay separate docs, per this
 * dataset's standing rule. Brand matching is case- and apostrophe-insensitive.
 * One documented rendering alias was applied: DFW publishes its unbranded
 * units as both "Vending Machine" (55) and "Vending Machines" (8) — a
 * singular/plural rendering of the same thing — so these are folded together
 * with the plural pinned as the canonical display name. Distinctly NAMED
 * venues sharing a parent brand are kept separate per this dataset's
 * page-truth-over-label precedent: "Pappadeaux Seafood Kitchen" vs
 * "Pappadeaux Seafood Bar"; "Plum Market" vs "Plum Market Bar"; "TGI Fridays"
 * vs "TGI Fridays On the Fly"; "Panda Express" vs "Panda Express and Bar";
 * "Subway" vs "Subway Marketplace"; "Cousin's Bar-B-Q" vs "Cousin's Back
 * Porch"; "Hickory" vs "Hickory by Kent Rathbun"; "Farmer's Fridge Vending"
 * vs the generic "Vending Machines"; "Trinity Groves Kitchen & Bar" vs
 * "Trinity Groves Food Lockers". 192 source records → 124 docs.
 *
 * CUISINE: the verbatim join of each POI's own `keywords[]`, in DFW's own
 * order, unfiltered — the site's taxonomy is trusted rather than curated,
 * including its own misspellings ("coctails", "appertizers", "Aisian",
 * "sit dwon dining", "gries", "texas toat"), which are presented as published
 * rather than silently corrected. The only keywords dropped are DFW's internal
 * marketing-campaign and site-collection identifiers, which are not
 * cuisine/genre at all: "fwieat", "fwie eat", "#wheretowatchfifa", "ic25",
 * "mm2025", "Smooth25", "Shop&Dine A4&A6", and any keyword ending in "Journey
 * Planner" (e.g. "Quick Bites Journey Planner", "Sweet Treats Journey
 * Planner"). Where outlets were merged, the union of their keyword sets is
 * used, first-seen order preserved. For records DFW publishes with no
 * keywords, `cuisine` falls back to the readable form of the POI's own
 * category ("Dining", "Bar", "Coffee", "Vending").
 *
 * AMENITY: driven by DFW's own POI category first — `eat.vending` →
 * `vending_machine`, `eat.coffee` → `cafe`, `eat.bar` → `bar`. Per this
 * dataset's standing rule, every `eat.bar` venue was verified against its own
 * name AND description: House of Friends ("wine bar"), Nowitzki ("sports
 * bar"), AV8 Bar & Cafe ("Cocktail bar"), Bugatti Bar & Taverna ("an intimate
 * wine bar and tavern"), Texas Life Bar, Deep Ellum Bar + Kitchen ("a tribute
 * bar") all stand. ONE was overridden: "Plum Market" is tagged `eat.bar` by
 * DFW but is named a Market and describes itself as "A unique restaurant and
 * bar ... available for grab-and-go ... convenience items", so it is filed as
 * `restaurant`; its separately-named sibling "Plum Market Bar" is the bar.
 * Conversely, two venues DFW tags as plain `eat` WERE promoted to `bar`
 * because their own descriptions say so in their own words — Flying Saucer
 * Draught Emporium ("is a craft beer bar") and Drew Pearson's Sports 88 ("is
 * an upscale sports bar") — and three more because the venue's own name ends
 * in "Bar" AND it carries a "bar" keyword AND it is not tagged quick-service
 * (The Rodeo Bar, Plum Market Bar, Pappadeaux Seafood Bar, 2.0 Taco & Tequila
 * Bar). That quick-service guard is what correctly keeps "Panda Express and
 * Bar" as `fast_food` and "Cake Bar" (a dessert shop) as `cafe`. Two POIs
 * whose own descriptions enumerate several separate restaurant brands trading
 * inside them are classified `food_court`: Trinity Groves Kitchen & Bar
 * ("features great recipes from Beto & Son Mexican Cuisine, Holy Crust Pizza,
 * The Hall Grill and AvoEatery") and Trinity Groves Food Lockers ("One stop
 * shop featuring four restaurants"). Otherwise the order is: a "full service"
 * / "sit down dining" / "casual dine-in" keyword → `restaurant`; a café /
 * bakery / bagel name or a dessert-shop / ice-cream / frozen-yogurt / bakery
 * keyword → `cafe`; a "quick service" keyword → `fast_food`; a Market / Deli
 * name → `fast_food`; otherwise `restaurant`. Resulting mix across the 192
 * records: 69 vending_machine, 41 cafe, 40 fast_food, 26 restaurant, 14 bar,
 * 2 food_court.
 *
 * SECOND DOCUMENTED OVERRIDE — a real DFW data error, not corrected but not
 * blindly followed either: the "Maggiano's" record (Terminal C, Gate C17)
 * carries Chick-fil-A's entire keyword set ("grilled chicken", "waffle
 * fries", "frosted lemonade", "chicken biscuits", …). Those keywords are kept
 * VERBATIM in `cuisine`, because that is what DFW publishes, but they are not
 * allowed to drive `amenity`: the venue's own description ("classic and
 * contemporary Italian-American recipes: homemade pastas, signature salads,
 * prime steaks … a large selection of wines") is unambiguously full-service,
 * so it is filed as `restaurant` rather than the `fast_food` the borrowed
 * "quick service" keyword would have produced.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: set to 'yes' ONLY where
 * DFW's own keyword list says so, matched as whole keywords — "vegetarian" /
 * "vegetarian options" → vegetarian; "vegan" → vegan; "gluten free" /
 * "gluten-free" → gluten_free, plus the single record where DFW itself spells
 * that tag "gluetn free" (Jamba, Terminal E), read as the same tag misspelled
 * at source. DFW publishes no halal or kosher tag for any dining venue, so
 * `halal` and `kosher` are blank on every doc in this file rather than
 * guessed. Where outlets were merged, a flag is set if ANY merged unit carries
 * the keyword.
 *
 * DESCRIPTION: verbatim from each POI's own `description` field (present on
 * 125 of the 199 dining POIs), whitespace-normalised only — including the
 * trailing "Hours of operation for this location may vary. Please call …"
 * sentences DFW appends to many of them, which are left in place rather than
 * edited out. Where outlets were merged, the first non-empty description in
 * source order is used.
 *
 * OPENING HOURS: DFW publishes NO opening hours for any dining venue. The
 * static POI records have no operationHours field at all, and the live
 * dynamic-poi feed carries operationHours on only four records airport-wide —
 * Minute Suites ×2, a 7-Eleven and a TSA PreCheck lane, none of which is a
 * dining venue in scope. Every `opening_hours` in this file is therefore
 * blank rather than invented; note that many venues restate a phone number
 * inside their description for exactly this reason, and those numbers were NOT
 * regex-scraped into the `phone` field.
 *
 * 24-7: `open_24_7` is set only where DFW's own data says so — an explicit
 * "open 24 hours" keyword (Subway, Terminal B Gate B24), or a description
 * stating it in the venue's own words ("Now offering 24-Hour operations!" —
 * Whisk & Bowl, Terminal A Gate A14).
 *
 * PHONE: taken ONLY from the POI's own structured `phone` field (present on 11
 * of the 199 dining records), never from the phone numbers embedded in
 * description prose — a deliberate choice, since regex-scraping phone numbers
 * out of free text has produced wrong results in this dataset before. Where
 * outlets were merged and more than one publishes a number, the first in
 * source order is used at doc level.
 *
 * WEBSITE / LOGO: DFW's dining data publishes no website field for any venue —
 * its only `links` entries are PDF menus hosted on DFW's own Contentful CDN.
 * Following this dataset's KUL precedent, `website` (and the logo.dev logo
 * derived from it) is set only for globally or nationally recognisable chains
 * and well-known Dallas/Fort Worth concepts whose primary domain is
 * confidently known, and left blank for every other independent concept
 * rather than guessed.
 *
 * VERIFIED TOTALS: 199 source dining POIs − 7 out of scope = 192 → 124
 * restaurant docs / 192 outlets. Terminal A: 37 records → 21 docs / 37
 * outlets. Terminal B: 37 → 25 / 37. Terminal C: 34 → 24 / 34. Terminal D:
 * 45 → 30 / 45. Terminal E: 39 → 24 / 39.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['dfw', 'dallas-fort-worth', 'dallas'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_A = 'terminal_a';
const TERMINAL_B = 'terminal_b';
const TERMINAL_C = 'terminal_c';
const TERMINAL_D = 'terminal_d';
const TERMINAL_E = 'terminal_e';

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
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "quick service, soft pretzels, cinnamon sugar, cheese dip, pepperoni, hot dog, cheese, salted pretzels, savory snacks, fountain drinks, iced drinks, family, fresh baked, pretzels, snacks, grab & go, lemonade, frozen drinks, pretzel nuggets, pretzel dogs, dips, dessert, refreshments", amenity: "fast_food",
    description: "Enjoy tasty, freshly baked pretzels (twisted or bite size!) for breakfast or as a snack anytime! Choose from Cinnamon Sugar, Pepperoni, Almond, or jalapeno for the brave! All go great with a cold lemonade (straight, frozen or as a mixer) or smoothie.",
    outlets: [
      o("Level 2", "Gate A21", "airside", ""),
    ],
  }),
  bugatti_bar_taverna: restaurant({
    name: "Bugatti Bar & Taverna", cuisine: "full service, sit dwon dining, chicken, shrimp, salmon, flatbread, beer, espresso, dessert, vegetarian, soup, breakfast, pasta, wine, tv, fries, kids menu, Italian, pizza, bar, cocktails, seafood, steak, salads, dinner", amenity: "bar",
    description: "Feel at home in an intimate wine bar and tavern, featuring some of the fan favorites from this famous Dallas Italian landmark eatery.",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate A17", "airside", ""),
    ],
  }),
  california_pizza_kitchen: restaurant({
    name: "California Pizza Kitchen", cuisine: "full service, sit dwon dining, chicken, pepperoni, sausage, avocado, shrimp, soup, beer, dessert, gluten free, vegetarian, california, fresh ingredients, kiosk, pizza, pasta, salads, bar, cocktails, wine, sandwiches, grab & go, lunch, dinner", amenity: "restaurant",
    description: "Innovative cuisine with a signature twist that's globally inspired yet distinctly California. Hours of operation for this location may vary. Please call 972-426-5208 if you prefer to verify we are open.",
    vegetarian: true, glutenFree: true,
    website: "cpk.com", logoUrl: logo("cpk.com"),
    outlets: [
      o("Level 2", "Gate A28", "airside", ""),
    ],
  }),
  dallas_cowboys_club: restaurant({
    name: "Dallas Cowboys Club", cuisine: "restaurant, beer, wine, tv, burger, cheeseburger, hamburger, quesadilla, tex mex, chicken, pork, carnitas, torta, mexican, sandwiches, chicken wings, buffalo wings, bbq wings, brisket, bacon, sports, live sports, bar", amenity: "restaurant",
    description: "Enjoy Tex-Mex and other great pub fare at the all new Dallas Cowboys Club.",
    outlets: [
      o("Level 2", "Gate A21", "airside", ""),
    ],
  }),
  einstein_bros_bagels: restaurant({
    name: "Einstein Bros. Bagels", cuisine: "soda, juice, café, quick service, fresh baked, cream cheese, bacon, sausage, egg, turkey, avocado, vegetarian options, hot coffee, iced coffee, ready to eat, bagel shop, bottled water, bagels, coffee, breakfast, breakfast sandwiches, sandwiches, pastries, espresso, tea, grab & go, lunch", amenity: "cafe",
    description: "Visit your neighborhood Einstein Bros. Bagels shop for a delicious bagel and signature shmear and one of our signature coffees.",
    vegetarian: true,
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"),
    outlets: [
      o("Level 2", "Gate A9", "airside", ""),
      o("Level 2", "Gate A11", "airside", ""),
    ],
  }),
  farmers_fridge_vending: restaurant({
    name: "Farmer's Fridge Vending", cuisine: "refrigerated vending, smart vending, chicken salad, greek salad, caesar salad, chia pudding, fresh wraps, bottled drinks, healthy breakfast, self-service, contactless, fresh ingredients, wellness, healthy meals, fresh salads, grab & go, grain bowls, wraps, breakfast, healthy snacks, fresh food, vegetarian, protein bowls", amenity: "vending_machine",
    description: "Hi, we're Farmer's Fridge. We make it simple for everyone to eat fresh, healthy meals, whenever you're on the go.",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate A13", "airside", ""),
      o("Level 2", "Gate A21", "airside", ""),
      o("Level 2", "A15 Baggage Claim", "airside", ""),
    ],
  }),
  la_creme_coffee_tea: restaurant({
    name: "La Crème Coffee & Tea", cuisine: "quick service, hot coffee, iced coffee, cold brew, latte, cappuccino, muffins, crosissants, juice, soda, drinks, coffee, espresso, tea, breakfast, grab & go, pastries, sandwiches, snacks, refreshers", amenity: "cafe",
    outlets: [
      o("Level 2", "Gate A34", "airside", ""),
    ],
  }),
  la_madeleine: restaurant({
    name: "La Madeleine", cuisine: "café, French, quick service, croissants, quiche, chicken, turkey, juice, soda, ready to eat, vegetarian, breakfast, coffee, grab & go, sandwiches, salads, soups, bakery, pastries, desserts, tea", amenity: "cafe",
    description: "La Madeleine is a little piece of France you can call your own. From salads, sandwiches and soups to delicious pastries, enjoy a taste of France.",
    vegetarian: true,
    website: "lamadeleine.com", logoUrl: logo("lamadeleine.com"),
    outlets: [
      o("Level 2", "Gate A25", "airside", ""),
    ],
  }),
  lorena_garcia_tapas_y_cocina: restaurant({
    name: "Lorena Garcia Tapas y Cocina", cuisine: "Latin, full service, espresso, chicken, chorizo, eggs, bacon, potatoes, juice, mimosa, bloody mary, vegetarian, fresh ingredients, made to order, beer, wine, fries, salads, desserts, french toast, tv, live sports, breakfast, coffee, grab & go, bar, omelets, burritos, avocado toast, pastries, fresh fruit, healthy", amenity: "restaurant",
    description: "Tapas y Cocina by Lorena Garcia is a unique eatery and espresso lounge designed to offer travelers flavorful Latin shareable plates with a healthy twist, signature cocktails, an intriguing global wine/spirit list, and an extensive coffee menu.",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate A33", "airside", ""),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "quick service, big mac, quarter pounder, mccafe, mcmuffin, mcgriddles, mcnuggets, filet o fish, apple pie, ice cream, hot coffee, iced coffee, coke products, mobile ordering, fast food, cookies, american, kids menu, eggs, burgers, breakfast, coffee, chicken, fries, grab & go, value meals, happy meals, desserts, soda", amenity: "cafe",
    description: "McDonald's is known around the globe for their fast food. Hours of operation for this location may vary. Please call 972-973-7312 if you prefer to verify we are open.",
    phone: "+1 (972) 973-7312",
    outlets: [
      o("Level 2", "Gate A17", "airside", ""),
      o("Level 2", "Gate A35", "airside", ""),
    ],
  }),
  panera_bread: restaurant({
    name: "Panera Bread", cuisine: "café, quick service, baguettes, chicken, turkey, mac & cheese, espresso, juice, soda, lemonade, vegetarian, fresh baked, ready to eat, kiosk, breakfast, coffee, grab & go, sandwiches, soups, salads, bakery, pastries, healthy, tea", amenity: "cafe",
    description: "Whether it's breakfast, lunch or dinner, Panera offers food you can feel good about eating, including freshly baked breads and pastries, crisp salads, hearty soups and hand crafted sandwiches. We also have several items just made and ready to go.",
    vegetarian: true,
    website: "panerabread.com", logoUrl: logo("panerabread.com"),
    outlets: [
      o("Level 2", "Gate A33", "airside", ""),
    ],
  }),
  pappadeaux_seafood_kitchen: restaurant({
    name: "Pappadeaux Seafood Kitchen", cuisine: "sit down dining, shrimp, crab, crawfish, catfish, salmon, redfish, calamari, steak, beer, wine, coctails, dessert, local, seafood, cajun, bar, fried seafood, gumbo, oysters, po' boys, salads, lunch, dinner", amenity: "restaurant",
    description: "Pappadeaux Seafood Kitchen serves up the freshest seafood around. Enjoy the finest Louisiana-style dishes or sample from the Chefs' Selections menu with the latest seasonal creations featuring only the freshest produce and fish available. Hours of operation for this location may vary. Please call 972-615-3508 if you prefer to verify we are open.",
    website: "pappadeaux.com", logoUrl: logo("pappadeaux.com"), phone: "+1 (972) 615-3508",
    outlets: [
      o("Level 2", "Gate A24", "airside", ""),
    ],
  }),
  pappasitos_cantina: restaurant({
    name: "Pappasito's Cantina", cuisine: "full service, sit down dining, chicken, beef, pork, shrimp, guacamole, queso, salsa, beer, wine, tortillas, rice, beans, southwest, breakfast, breakfast burrito, eggs, pancakes, local, bacon, Tex Mex, faijitas, tacos, bar, margaritas, quesadillas, enchiladas, nachos, lunch, dinner", amenity: "restaurant",
    description: "Pappasito's Cantina serves up Tex-Mex dishes and the option to create your own margarita. Hours of operation for this location may vary. Please call 972-615-3219 if you prefer to verify we are open.",
    phone: "+1 (972) 615-3219",
    outlets: [
      o("Level 2", "Gate A28", "airside", ""),
    ],
  }),
  plum_market_bar: restaurant({
    name: "Plum Market Bar", cuisine: "vegetarian, tacos, breakfast, lunch, bar, salad, prepared meals, organic foods, convenience store, ready to eat, vegan, protein snacks, gluten free, juice, alcohol, beer, wine, chicken, self checkout, local, salads, coffee, grab & go, healthy options, sandwiches, fresh food, market", amenity: "bar",
    description: "A unique restaurant and bar with a diverse menu of chef-crafted meals available for grab-and-go or enjoying onsite. The space also includes a selection of convenience items with natural, organic and sustainably sourced candies, snacks and beverages.",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "plummarket.com", logoUrl: logo("plummarket.com"),
    outlets: [
      o("Level 2", "Gate A8", "airside", ""),
    ],
  }),
  popeyes_louisiana_kitchen: restaurant({
    name: "Popeyes Louisiana Kitchen", cuisine: "quick service, fried chicken, spicy, red beans & rice, mashed potatoes, coleslaw, sweet tea, lemonade, made to order, wraps, chicken, chicken sandwich, chicken tenders, nuggets, biscuits, fries", amenity: "fast_food",
    description: "Mouth-watering flavors from New Orleans, featuring fried chicken, including spicy and mild chicken pieces and tenders, flaky biscuits, tasty sides, and the famous Chicken Sandwich and wraps.",
    website: "popeyes.com", logoUrl: logo("popeyes.com"),
    outlets: [
      o("Level 2", "Gate A17", "airside", ""),
    ],
  }),
  smoothie_king: restaurant({
    name: "Smoothie King", cuisine: "quick service, fitness, protein shakes, smoothie bowls, vitamins, hydration, weight management, gluten free, vegan, low sugar, clean blends, kids, nutritional supplement, healthy, smoothies, healthy options, protein, grab & go, fruit, juice, meal replacement, wellness, energy, snacks", amenity: "fast_food",
    description: "Our smoothies are specialized to expertly blend to meet your specific needs, goals, and ambitions. For healthy-lifestyle individuals and families, Smoothie King is the premium Smoothie Destination that makes it simple and pleasurable to achieve health goals.",
    vegan: true, glutenFree: true,
    website: "smoothieking.com", logoUrl: logo("smoothieking.com"),
    outlets: [
      o("Level 2", "Gate A25", "airside", ""),
      o("Level 2", "Gate A18", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "café, quick service, cold brew, frappuccino, iced coffee, hot coffee, lemonade, juice, protein boxes, oatmilk, vegetarian, mobile ordering, seasonal drinks, merchandise, latte, coffee, espresso, breakfast, grab & go, tea, sandwiches, pastries, refreshers, snacks, bakery", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items. Hours of operation for this location may vary. Please call 972-426-5229 if you prefer to verify we are open.",
    vegetarian: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1 (972) 574-4927",
    outlets: [
      o("Level 2", "Gate A37", "airside", ""),
      o("Level 2", "Gate A20", "airside", ""),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "full service, american, sit down dining, whiskey, wine, soda, tea, coffee, dessert, kids menu, vegetarian options, takeout, ribs, fries, seafood, casual dine-in, steak, tv, live sports, kiosk, burgers, chicken, beer, cocktails, grab & go, sandwiches, salads, lunch, dinner, bar", amenity: "restaurant",
    description: "Celebrate Friday every day with your favorites, like delicious appetizers, a variety of tasty entrees, like burgers, chicken dishes, wings, salads, ribs and more! On the Go? Our Grab & Go is ready for you with quick options, hot and cold. Our beautiful bar has 10 TVs and lots of seats.",
    vegetarian: true,
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"), phone: "+1(972) 973-7316",
    outlets: [
      o("Level 2", "Gate A13", "airside", ""),
    ],
  }),
  twisted_root: restaurant({
    name: "Twisted Root", cuisine: "quick service, american, angus beef, turkey burger, veggie burger, bacon, onion rings, sweet potato fries, fountain drinks, soda, ice cream, kids meal, made to order, local, breakfast, eggs, burgers, fries, chicken, sandwiches, salads, beer, shakes, grab & go, lunch, dinner", amenity: "cafe",
    description: "Twisted Root serves burgers, salads and shakes with house-made, fresh ingredients in a funky & fun environment. Hours of operation for this location may vary. Please call 972-973-7364 if you prefer to verify we are open.",
    website: "twistedrootburgerco.com", logoUrl: logo("twistedrootburgerco.com"),
    outlets: [
      o("Level 2", "Gate A24", "airside", ""),
    ],
  }),
  vending_machines: restaurant({
    name: "Vending Machines", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate A13", "airside", ""),
      o("Level 2", "Gate A8", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate A21", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate A35", "airside", ""),
      o("Level 2", "Baggage Claim", "landside", ""),
      o("Level 2", "Gate A28", "airside", ""),
      o("Level 2", "Gate A39", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
    ],
  }),
  whisk_bowl: restaurant({
    name: "Whisk & Bowl", cuisine: "café, quick service, breakfast burritos, quiche, croissants, muffins, wraps, chicken, turkey, juice, soda, cold brew, gluten free, vegetarian, local, bottled water, coffee, breakfast, grab & go, bakery, sandwiches, salads, burritos, pastries, espresso, tea", amenity: "cafe",
    description: "Now offering 24-Hour operations! We start every day with a whisk, a bowl and a love for the sweeter things. Whisk & Bowl is an artisanal pastry and coffee shop designed to elevate the senses. Enjoy sweet and savory scratch-baked treats, breakfast all day and Green Beans Coffee. For any questions, please reach out to us at 972-973-7381.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 2", "Gate A14", "airside", "", true),
    ],
  }),
};

// ─── Terminal B ───

const terminalBVenues = {
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "quick service, soft pretzels, cinnamon sugar, cheese dip, pepperoni, hot dog, cheese, salted pretzels, savory snacks, fountain drinks, iced drinks, family, fresh baked, pretzels, snacks, grab & go, lemonade, frozen drinks, pretzel nuggets, pretzel dogs, dips, dessert, refreshments", amenity: "fast_food",
    description: "Auntie Anne's features freshly baked pretzels and their famous pretzel dog. Hours of operation for this location may vary. Please call 972-973-7824 if you prefer to verify we are open.",
    phone: "+1 (972) 574-2952",
    outlets: [
      o("Level 2", "Gate B29", "airside", ""),
    ],
  }),
  cantina_laredo: restaurant({
    name: "Cantina Laredo", cuisine: "lunch, dinner, full service, sit down dining, chicken, beef, shrimp, pork, queso, salsa, beer, wine, tortillas, rice, beans, made to order, grab & go, sandwiches, bottled drinks, bottled water, Tex Mex, fajitas, tacos, bar, margaritas, enchiladas, quesadillas, guacamole, tv, live sports", amenity: "restaurant",
    description: "Have a cocktail with your burrito and queso at Cantina Laredo, a trendy Mexican cafe. Hours of operation for this location may vary. Please call 972-525-8451 if you prefer to verify we are open.",
    website: "cantinalaredo.com", logoUrl: logo("cantinalaredo.com"),
    outlets: [
      o("Level 2", "Gate B29", "airside", ""),
    ],
  }),
  caribou_coffee: restaurant({
    name: "Caribou Coffee", cuisine: "café, quick service, hot coffee, iced coffee, cold brew, cappuccino, muffins, croissants, juice, soda, oatmilk, vegetarian, made to order, coffee, espresso, breakfast, grab & go, tea, sandwiches, bagels, pastries, refreshers, latte", amenity: "cafe",
    description: "Enjoy a special coffee experience and indulge in our selection of fresh pastries.",
    vegetarian: true,
    website: "cariboucoffee.com", logoUrl: logo("cariboucoffee.com"),
    outlets: [
      o("Level 2", "Gate B29", "airside", ""),
    ],
  }),
  cousins_back_porch: restaurant({
    name: "Cousin's Back Porch", cuisine: "quick service, big mac, quarter pounder, mccafe, mcmuffin, mcgriddles, mcnuggets, filet o fish, apple pie, ice cream, hot coffee, iced coffee, coke products, mobile ordering, cookies, fast food, american, kids menu, burgers, breakfast, coffee, chicken, fries, grab & go, value meals, happy meals, desserts, soda", amenity: "cafe",
    description: "Cousin's Back Porch is a great place to relax at our full bar. Our featured cuisine includes Shrimp and Homemade Sausage Gumbo, New Orleans Muffaletta and our Roast Beef Po Boy that is our staff's favorite. Hours of operation for this location may vary. Please call 972-973-7755 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate B47", "airside", ""),
    ],
  }),
  cousins_bar_b_q: restaurant({
    name: "Cousin's Bar-B-Q", cuisine: "quick service, Texas BBQ, smoked meats, sausage, turkey, tacos, baked potato, mac & cheese, potato salad, baked beans, coleslaw, tea, soda, family meals, beer, wine, cocktails, BBQ, brisket, ribs, pulled pork, chicken, sandwiches, grab & go, breakfast, bar, local", amenity: "fast_food",
    description: "Cousin's is legendary Fort Worth barbecue, offering all-natural ribs, brisket, chicken, handcrafted sausages and pulled pork, with outstanding sides to match. Don't forget dessert, with cobblers and an old family recipe for Banana Pudding. Hours of operation for this location may vary. Please call 972-973-7755 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate B43", "airside", ""),
      o("Level 2", "Gate B12", "airside", ""),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "café, quick service, hot coffee, iced coffee, cold brew, latte, frozen drinks, muffins, hash browns, bacon, sausage, juice, soda, mobile ordering, coffee, donuts, breakfast, grab & go, espresso, sandwiches, bagels, refreshers, tea, snacks", amenity: "cafe",
    description: "Dunkin' Donuts is an American favorite, featuring bakery, deli, and breakfast items. Hours of operation for this location may vary. Please call 972-973-7834 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate B5", "airside", ""),
    ],
  }),
  farmers_fridge_vending: restaurant({
    name: "Farmer's Fridge Vending", cuisine: "breakfast, healthy snacks, lunch, vegan, vegetarian, healthy, salads, healthy meals, sandwiches", amenity: "vending_machine",
    description: "Hi, we're Farmer's Fridge. We make it simple for everyone to eat fresh, healthy meals, whenever you're on the go.",
    vegetarian: true, vegan: true,
    outlets: [
      o("Level 2", "Gate B8", "airside", ""),
    ],
  }),
  hickory_by_kent_rathbun: restaurant({
    name: "Hickory by Kent Rathbun", cuisine: "full service, Texas BBQ, smoked meats, pulled pork, sausage, turkey, quesadillas, burnt ends chili, chili, sweet potato fries, beer, wine, cocktails, dessert, made to order, lunch, dinner, tv, live sports, mac & cheese, BBQ, brisket, bar, burgers, tacos, chicken, breakfast, grab & go, local", amenity: "restaurant",
    description: "Enjoy savory brisket, ribs and pork shoulder smoked on-site at Hickory. Signature burgers include the Texas Roadhouse Burger and the Mediterranean Lamb. And don't forget the sides: Green Apple Slaw, cheddar Mac & Cheese and Blue Corn Grits. Hours of operation for this location may vary. Please call 469-319-8076 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate B25", "airside", ""),
    ],
  }),
  house_of_friends: restaurant({
    name: "House of Friends", cuisine: "wine bar, sharables, bruschetta, soup, croissant, overnight oats, bacon, beer, sparkling wine, Texas wine, craft beer, made to order, small plates, bar, wine, coctails, charcuterie, flatbreads, breakfast, salads, desserts, lunch, dinner", amenity: "bar",
    description: "Come enjoy a variety of wines with an artisanal charcuterie selection of cheeses, meats and olives while you wait to board your plane!",
    outlets: [
      o("Level 2", "Gate B28", "airside", ""),
    ],
  }),
  mcalisters_deli: restaurant({
    name: "McAlister's Deli", cuisine: "healthy options, quick service, chicken, turkey, roast beef, ham, club sandwich, cold cuts, wraps, mac & cheese, lemonade, fountain drinks, potato salad, vegetarian, made to order, fresh indgredients, sandwiches, soups, salads, grab & go, tea, deli, spuds, breakfast, desserts, healthy", amenity: "cafe",
    description: "Dedicated to serving great food with genuine hospitality, make sure to stop by for sandwiches, soups, tea and much more!",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate B40", "airside", ""),
    ],
  }),
  nekt_r_juice_bar: restaurant({
    name: "Néktər Juice Bar", cuisine: "pitaya bowls, cold-pressed juice, dragon fruit, peanut butter bowl, berry bowl, wellness shots, vegan, vegetarian, superfoods, juice cleanses, whey protein, pea protein, add-ins, healthy, smoothies, acai bowls, fresh juice, protein bowls, protein waffles, healthy breakfast, healthy drinks, grab & go, wellness, proetein smoothies", amenity: "restaurant",
    description: "Fuel your journey with fresh juices, smoothies, açaí bowls, protein waffles, and wholesome grab-and-go options made with fresh ingredients.",
    vegetarian: true, vegan: true,
    website: "nekterjuicebar.com", logoUrl: logo("nekterjuicebar.com"),
    outlets: [
      o("Level 2", "B9", "landside", ""),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "quick service, Aisian, beef, shrimp, kung pao chicken, broccoli beef, fried rice, chow mein, super greens, egg rolls, rangoon, vegetarian, soda, tea, kid meals, Chinese, orange chicken, chicken, rice, noodles, bowls, grab & go, lunch, dinner, family meals", amenity: "fast_food",
    description: "Panda Express is America's largest Chinese kitchen. Known for its wide variety of original recipes, including Original Orange Chicken, SweetFire Chicken Breast, award-winning Honey Walnut Shrimp and Shanghai Angus Steak, Panda offers a wide variety of options for everyone. Hours of operation for this location may vary. Please call 469-862-8600 if you prefer to verify we are open.",
    vegetarian: true,
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("Level 2", "Gate B15", "airside", ""),
    ],
  }),
  plum_market: restaurant({
    name: "Plum Market", cuisine: "vegetarian, tacos, breakfast, lunch, bar, salad, prepared meals, organic foods, convenience store, ready to eat, vegan, protein snacks, gluten free, juice, alcohol, beer, wine, chicken, self checkout, local, salads, coffee, grab & go, healthy options, sandwiches, fresh food, market", amenity: "restaurant",
    description: "A unique restaurant and bar with a diverse menu of chef-crafted meals available for grab-and-go or enjoying onsite. The space also includes a selection of convenience items with natural, organic and sustainably sourced candies, snacks and beverages.",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "plummarket.com", logoUrl: logo("plummarket.com"),
    outlets: [
      o("Level 2", "Gate B4", "airside", ""),
    ],
  }),
  portillos: restaurant({
    name: "Portillo's", cuisine: "quick service, Chicago style, italian sausage, polish sausage, cheese fries, onion rings, chocolate cake, chocolate cake shake, beef sandwich, fountain drinks, soda, made to order, dinner, hot dogs, italian beef, burgers, chicken, fries, shakes, grab & go, salads, lunch, kids meal", amenity: "fast_food",
    description: "Chicago's favorites including hot dogs, Italian beef sandwiches, char-grilled burgers, chopped salads, and rich chocolate cake and shakes.",
    outlets: [
      o("Level 2", "Gate B22", "airside", ""),
    ],
  }),
  raising_canes_chicken_fingers: restaurant({
    name: "Raising Cane's Chicken Fingers", cuisine: "quick service, made to order, combo meals, kids meals, sweet tea, unsweet tea, fountain drinks, soda, fresh squeezed lemonade, crinkle cut fries, kiosk, mobile ordering, chicken fingers, chicken, fries, texas toat, coleslaw, cane's sauce, grab & go, lunch, dinner, lemonade", amenity: "fast_food",
    description: "Enjoy our fresh, hand-battered chicken fingers, crinkle-cut fries, Texas toast, coleslaw, and our famous Cane's Sauce in a fun, friendly atmosphere.",
    outlets: [
      o("Level 2", "Gate B21", "airside", ""),
    ],
  }),
  smashburger: restaurant({
    name: "Smashburger", cuisine: "quick service, angus beef, bacon, avocado, turkey burger, veggie burger, sweet potato fries, tater tots, soda, lemonade, ice cream, made to order, vegetarian, fountain drinks, burgers, chicken, gries, shakes, grab & go, sandwiches, salads, lunch, dinner, kids meal", amenity: "cafe",
    description: "Our burgers are \"Smashed Fresh, Served Delicious,\" always made to order and never frozen. Also enjoy our black bean burger, Cobb Salad, Kids Meals and frosty milkshakes. Hours of operation for this location may vary. Please call 972-973-7741 if you prefer to verify we are open.",
    vegetarian: true,
    website: "smashburger.com", logoUrl: logo("smashburger.com"),
    outlets: [
      o("Level 2", "Gate B12", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "café, quick service, cold brew, frappuccino, iced coffee, hot coffee, lemonade, juice, protein boxes, oatmilk, vegetarian, mobile ordering, seasonal drinks, merchandise, latte, coffee, espresso, breakfast, grab & go, tea, sandwiches, pastries, refreshers, snacks, bakery", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items. Hours of operation for this location may vary. Please call 972-426-5216 if you prefer to verify we are open.",
    vegetarian: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Level 2", "Gate B28", "airside", ""),
      o("Level 2", "Gate B12", "airside", ""),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "cold cuts, quick service, made to order, italian bmt, steak & cheese, tuna, ham, roast beef, bacon, fresh vegetables, fountain drinks, soda, chips, vegetarian, footlong, cookies, sandwiches, grab & go, healthy, salads, wraps, breakfast, chicken, turkey, veggie, open 24 hours", amenity: "fast_food",
    description: "Subway, pioneer of healthy eating, understands you need fresh food fast. We sell fresh, made-for-you sandwiches and salads, many of which have six grams of fat or less - a healthy alternative to traditional fast food. Hours of operation for this location may vary. Please call 972-973-7753 if you prefer to verify we are open.",
    vegetarian: true,
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("Level 2", "Gate B24", "airside", "", true),
    ],
  }),
  texas_life_bar: restaurant({
    name: "Texas Life Bar", cuisine: "texas, local, american, bourbon, whiskey, tequila, vodka, rum, gin, bar, beer, wine, cocktails, spirits, snacks, drinks", amenity: "bar",
    outlets: [
      o("Level 2", "Gate B21", "landside", ""),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "full service, american, sit down dining, whiskey, wine, soda, tea, coffee, dessert, kids menu, vegetarian options, takeout, ribs, fries, seafood, casual dine-in, steak, tv, live sports, kiosk, burgers, chicken, beer, cocktails, grab & go, sandwiches, salads, lunch, dinner, bar", amenity: "restaurant",
    description: "Explore the culinary delight of TGI Friday's menu with a variety of hearty entrees, delicious appetizers, Whiskey-Glazed burgers, wings, ribs and more! Also features a huge Grab & Go for guests seeking a quick transaction.",
    vegetarian: true,
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"),
    outlets: [
      o("Level 2", "Gate B9", "airside", ""),
    ],
  }),
  tgi_fridays_on_the_fly: restaurant({
    name: "TGI Fridays On the Fly", cuisine: "pre-made meals cold sandwiches, fresh salads, chips, soda, juice, bottled water, convience, on the go, tea, lunch, dinner, grab & go, sandwiches, salads, snacks, beverages, fresh food, quick meal, ready to eat, burger, yogurt", amenity: "restaurant",
    description: "Your favorite highlights from TGI Fridays, ready to go! Hot foods, snacks, salads and cold items, all packaged and waiting for you!",
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"),
    outlets: [
      o("Level 2", "Gate B21", "airside", ""),
    ],
  }),
  the_rodeo_bar: restaurant({
    name: "The Rodeo Bar", cuisine: "whiskey, bourbon, tequila, vodka, rum, gin, bottled water, chips, pre-made sandwiches, ready to eat, bar, beer, wine, cocktails, grab & go, sandwiches, snacks, beverages, tv, live sports", amenity: "bar",
    description: "Relax for a spell at the Rodeo Bar. Enjoy your favorite cold beverage while waiting for your flight.",
    outlets: [
      o("Level 2", "Gate B32", "airside", ""),
    ],
  }),
  vending_machines: restaurant({
    name: "Vending Machines", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 2", "Gate B32", "airside", ""),
      o("Level 2", "Gate B48", "airside", ""),
      o("Level 2", "Gate B46", "airside", ""),
      o("Level 2", "Gate B12", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate B29", "airside", ""),
      o("Level 2", "Gate B2", "airside", ""),
      o("Level 2", "Gate B27", "airside", ""),
      o("Level 2", "Gate B8", "airside", ""),
      o("Level 2", "Baggage Claim B5", "landside", ""),
      o("Level 2", "Level 2", "landside", ""),
    ],
  }),
  whataburger: restaurant({
    name: "Whataburger", cuisine: "quick service, patty melt, honey butter, biscuit, taquito, onion rings, fountain drinks, Texas favorite, apple pie, cinnamon roll, kiosk, burgers, breakfast, chicken, fries, grab & go, sandwiches, salads, coffee, shakes, kids meal", amenity: "fast_food",
    description: "A Texas legend, Whataburger serves all-beef burgers, crispy fries, chicken strips and thick shakes, also signature breakfast items like the Breakfast Platter, Breakfast on a Bun and their signature Taquitos.",
    website: "whataburger.com", logoUrl: logo("whataburger.com"),
    outlets: [
      o("Level 2", "Gate B41", "airside", ""),
    ],
  }),
  wingstop: restaurant({
    name: "Wingstop", cuisine: "kiosk, quick service, buffalo wings, lemon pepper, garlic parmesan, mango habernero, original hot, cajun, louisana rub, mild, veggie sticks, made to order, combo meals, fountain drinks, bottled water, wings, chicken, fries, boneless wings, chicken tenders, ranch, lunch, dinner, soft drinks", amenity: "fast_food",
    description: "Wingstop dishes up boneless and classic wings. Hours of operation for this location are from 4:30AM-10PM.. Please call 972-426-5225 if you prefer to verify we are open.",
    website: "wingstop.com", logoUrl: logo("wingstop.com"),
    outlets: [
      o("Level 2", "Gate B28", "airside", ""),
    ],
  }),
};

// ─── Terminal C ───

const terminalCVenues = {
  ampersand_coffee_house: restaurant({
    name: "Ampersand Coffee House", cuisine: "café, quick service, latte, cappuccino. Cortado, iced coffee, toast, fresh baked, oatmilk, made to order, local coffee, local, fort worth, coffee, espresso, breakfast, grab & go, tea, matcha, avocado toast, pastries, sandwiches, cold brew", amenity: "cafe",
    description: "Voted as Fort Worth's best coffee shop in 2019 and 2022, our award winning coffee shop delights in serving up premium brews with unmatched speed and convenience. Nestled within our impeccably designed space, guests are invited to explore a diverse array of beverages, from meticulously crafted coffees and teas to invigorating smoothies and indulgent frappes. Our menu boasts a tantalizing selection of fresh delights, including the ever-popular Avocado Toast, ensuring every visit is a delightful experience at this local gem.",
    outlets: [
      o("Level 2", "Gate C37", "airside", ""),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "quick service, soft pretzels, cinnamon sugar, cheese dip, pepperoni, hot dog, cheese, salted pretzels, savory snacks, fountain drinks, iced drinks, family, fresh baked, pretzels, snacks, grab & go, lemonade, frozen drinks, pretzel nuggets, pretzel dogs, dips, dessert, refreshments", amenity: "fast_food",
    description: "Auntie Anne's features freshly baked pretzels and their famous pretzel dog. Hours of operation for this location may vary. Please call 972-973-4796 if you prefer to verify we are open.",
    phone: "+1 (972) 973-4796",
    outlets: [
      o("Level 2", "Gate C21", "airside", ""),
    ],
  }),
  banh_shop: restaurant({
    name: "Banh Shop", cuisine: "quick service, vietnamese, asian street food, spring rolls, fried rice, pad thai, curry, steak, meatballs, shrimp, fresh herbs, pickley vegetables, made to order, tea, banh mi, Asian, rice bowls, noodles, grab & go, chicken, pork, beef, salads, teriyaki", amenity: "fast_food",
    description: "Banh Shop is a diverse collection of 'baguettes and bowls' inspired by the exciting and vibrant food offered by street vendors throughout Southeast Asia.",
    website: "banhshop.com", logoUrl: logo("banhshop.com"),
    outlets: [
      o("Level 2", "Gate C22", "airside", ""),
    ],
  }),
  baskin_robbins: restaurant({
    name: "Baskin-Robbins", cuisine: "desserts & snacks, ice cream, desserts", amenity: "cafe",
    description: "Cool off with some dessert from Baskin-Robbins. Hours of operation for this location may vary. Please call 972-973-4786 if you prefer to verify we are open.",
    website: "baskinrobbins.com", logoUrl: logo("baskinrobbins.com"),
    outlets: [
      o("Level 2", "Gate C17", "airside", ""),
    ],
  }),
  boars_head_deli: restaurant({
    name: "Boar's Head Deli", cuisine: "deli, sandwiches, chips, soda, bottled water, turkey, ham, bacon, roast beef, blt, tuna, salads, chicken, vegetarian, pastrami, women-owned, sandwich/deli, cold cuts, fresh", amenity: "fast_food",
    description: "Boar's Head Deli offers to-go menu items for travelers in a hurry.",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate C35", "airside", ""),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "quick service, grilled chicken, spicy chicken, chicken strips, chicken biscuits, biscuits, hash browns, mac & cheese, cookies, frosted lemonade, sweet tea, fountain drinks, made to order, mobile ordering, sauce, chicken, chicken sandwich, nuggets, breakfast, grab & go, waffle fries, salads, lemondade, sandwiches, kids meal", amenity: "fast_food",
    description: "Chick-fil-A is the home of the Original Chicken Sandwich along with so much more, and now has found its way to DFW Airport! Chick-fil-A offers a variety of options to guests such as delicious breakfast items, salads, wraps, and fruit. Closed On Sundays. Hours of operation for this location may vary. Please call 972-973-7752 if you prefer to verify we are open.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("Level 2", "Gate C24", "airside", ""),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "full service, sit down dining, ribs, steak, quesadillas, nachos, beer, wine, cocktails, desert, kids meal, made to order, triple dipper, bottled water, ready made meals, kiosk, burgers, bar, margaritas, chicken, fajitas, sandwiches, salads, Tex Mex, grab & go", amenity: "restaurant",
    description: "Family-friendly chain serving classic Tex-Mex & American fare in a Southwestern-style setting. Favorites include ribs, burger, fajitas and signature margaritas for dine-in and Grab!",
    outlets: [
      o("Level 2", "Gate C35", "airside", ""),
    ],
  }),
  deep_ellum_bar_kitchen: restaurant({
    name: "Deep Ellum Bar + Kitchen", cuisine: "local, deep ellum ipa, IPA, birria, fries, cocktails, local beer, made to order, bar, craft beer, BBQ, brisket, nachos, sandwiches, burgers, grab & go, tv, live sports", amenity: "bar",
    description: "Relax with friends at a tribute bar celebrating Dallas' eclectic Deep Ellum scene. Watch the game, enjoy a drink or have a bite.",
    outlets: [
      o("Level 2", "Gate C33", "airside", ""),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "café, quick service, hot coffee, iced coffee, cold brew, latte, frozen drinks, muffins, hash browns, bacon, sausage, juice, soda, mobile ordering, coffee, donuts, breakfast, grab & go, espresso, sandwiches, bagels, refreshers, tea, snacks", amenity: "cafe",
    description: "Dunkin' Donuts is an American favorite, featuring bakery, deli, and breakfast items. Hours of operation for this location may vary. Please call 972-973-4786 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate C17", "airside", ""),
    ],
  }),
  farmers_fridge_vending: restaurant({
    name: "Farmer's Fridge Vending", cuisine: "refrigerated vending, smart vending, chicken salad, greek salad, caesar salad, chia pudding, fresh wraps, bottled drinks, healthy breakfast, self-service, contactless, fresh ingredients, wellness, healthy meals, fresh salads, grab & go, grain bowls, wraps, breakfast, healthy snacks, fresh food, vegetarian, protein bowls", amenity: "vending_machine",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate C2", "airside", ""),
    ],
  }),
  freshens_yogurt_smoothies: restaurant({
    name: "Freshëns Yogurt & Smoothies", cuisine: "healthy, quick service, fresh fruit, protein smoothies, dairy free, gluten free, vegan, low fat, vitamins, hydration, wellness, energy, nutritional supllements, kids, smoothies, frozen yogurt, healthy options, grab & go, fruit, protein, juice, snacks, refreshments, meal replacement", amenity: "cafe",
    description: "Enjoy delicious smoothies at Freshens!",
    vegan: true, glutenFree: true,
    website: "freshens.com", logoUrl: logo("freshens.com"),
    outlets: [
      o("Level 2", "Gate C35", "airside", ""),
    ],
  }),
  maggianos: restaurant({
    name: "Maggiano's", cuisine: "quick service, grilled chicken, spicy chicken, chicken strips, chicken biscuits, biscuits, hash browns, mac & cheese, cookies, frosted lemonade, sweet tea, fountain drinks, made to order, mobile ordering, sauce, chicken, chicken sandwich, nuggets, breakfast, grab & go, waffle fries, salads, lemondade, sandwiches, kids meal", amenity: "restaurant",
    description: "Our menu features classic and contemporary Italian-American recipes: homemade pastas, signature salads, prime steaks, fresh fish, regular chef specials and specialty desserts, accompanied by a large selection of wines. Hours of operation for this location may vary. Please call 972-426-5230 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate C17", "airside", ""),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "quick service, big mac, quarter pounder, mccafe, mcmuffin, mcgriddles, mcnuggets, filet o fish, apple pie, ice cream, hot coffee, iced coffee, coke products, mobile ordering, cookies, fast food, american, kids menu, eggs, burgers, breakfast, coffee, chicken, fries, grab & go, value meals, happy meals, desserts, soda", amenity: "cafe",
    description: "McDonald's is known around the globe for their fast food. Hours of operation for this location may vary. Please call 972-973-4794 if you prefer to verify we are open.",
    phone: "+1 (972) 574-3288",
    outlets: [
      o("Level 2", "Gate C22", "airside", ""),
    ],
  }),
  nowitzki: restaurant({
    name: "Nowitzki", cuisine: "full service, chicken schnitzel, bratwurst, thai beef bowl, chicken tikka masala, protein bowls, pretzel bites, local beer, cocktails, wine, dessert, sports bar, bar, burgers, flatbreads, wings, breakfast, beer, grab & go, tvs, live sports", amenity: "bar",
    description: "NBA legend Dirk Nowitzki invites you to experience his favorite foods from around the world, like street tacos, bratwurst, Jamaican jerk chicken, salads, wings, burgers and flatbreads. His menu reflects who he is so his fans can get to know him through his restaurant.",
    website: "nowitzkirestaurant.com", logoUrl: logo("nowitzkirestaurant.com"),
    outlets: [
      o("Level 2", "Gate C37", "airside", ""),
    ],
  }),
  pappadeaux_seafood_bar: restaurant({
    name: "Pappadeaux Seafood Bar", cuisine: "sit down dining, shrimp, crab, crawfish, catfish, salmon, redfish, calamari, steak, beer, wine, coctails, dessert, local, seafood, cajun, bar, fried seafood, gumbo, oysters, po' boys, salads, lunch, dinner", amenity: "bar",
    description: "At Pappadeaux Seafood Bar, the fun is top shelf and the drinks are top notch! Slip away from the stresses of travel and sip on colorful cocktails, hand-selected wines and ice-cold beer. Enjoy light bites from our bar menu in between refills. Hours of operation for this location may vary. Please call 972-425-0087 if you prefer to verify we are open.",
    website: "pappadeaux.com", logoUrl: logo("pappadeaux.com"),
    outlets: [
      o("Level 2", "Gate C14", "airside", ""),
    ],
  }),
  pappadeaux_seafood_kitchen: restaurant({
    name: "Pappadeaux Seafood Kitchen", cuisine: "sit down dining, shrimp, crab, crawfish, catfish, salmon, redfish, calamari, steak, beer, wine, coctails, dessert, local, seafood, cajun, bar, fried seafood, gumbo, oysters, po' boys, salads, lunch, dinner", amenity: "restaurant",
    description: "Pappadeaux Seafood Kitchen serves up the freshest seafood around. Enjoy the finest Louisiana-style dishes or sample from the Chefs' Selections menu with the latest seasonal creations featuring only the freshest produce and fish available. Hours of operation for this location may vary. Please call 972-425-0087 if you prefer to verify we are open.",
    website: "pappadeaux.com", logoUrl: logo("pappadeaux.com"),
    outlets: [
      o("Level 2", "Gate C14", "airside", ""),
    ],
  }),
  pappasitos_cantina: restaurant({
    name: "Pappasito's Cantina", cuisine: "full service, sit down dining, chicken, beef, pork, shrimp, guacamole, queso, salsa, beer, wine, tortillas, rice, beans, southwest, breakfast, breakfast burrito, eggs, pancakes, local, bacon, Tex Mex, faijitas, tacos, bar, margaritas, quesadillas, enchiladas, nachos, lunch, dinner", amenity: "restaurant",
    description: "Pappasito's Cantina serves up Tex-Mex dishes and the option to create your own margarita. Hours of operation for this location may vary. Please call 972-453-0171 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate C19", "airside", ""),
    ],
  }),
  peach_cobbler_factory: restaurant({
    name: "Peach Cobbler Factory", cuisine: "quick service, dessert shop, coffee, bottled beverages, seasonal flavors, peach cobbler, desserts, ice cream, banana pudding, cookies, cinnamon rolls, cobbler, grab & go, sweet treats, red velvet", amenity: "cafe",
    website: "peachcobblerfactory.com", logoUrl: logo("peachcobblerfactory.com"),
    outlets: [
      o("Level 2", "Gate C33", "airside", ""),
    ],
  }),
  pinkberry: restaurant({
    name: "Pinkberry", cuisine: "desserts & snacks, fruit, frozen yogurt, smoothies", amenity: "cafe",
    description: "An airport favorite, Pinkberry is a go-to place for frozen yogurt with all the toppings. Hours of operation for this location may vary. Please call 972-973-4791 if you prefer to verify we are open.",
    website: "pinkberry.com", logoUrl: logo("pinkberry.com"),
    outlets: [
      o("Level 2", "Gate C22", "airside", ""),
    ],
  }),
  pizza_hut: restaurant({
    name: "Pizza Hut", cuisine: "quick service, personal pizza, meal lovers, supreme pizza, veggie pizza, boneless wings, marinara, ranch, cinnabon, cookies, fountain drinks, soda, made to order, family meals, wine, beer, cocktails, tv, live sports, pizza, wings, breadsticks, grab & go, pasta, salads, cheese pizza, pepperoni pizza, bar", amenity: "fast_food",
    description: "Enjoy great pizza, wings and salads as well as your favorite beverage at our adjoining full bar. Hours of operation for this location may vary. Please call 972-973-4781 if you prefer to verify we are open.",
    website: "pizzahut.com", logoUrl: logo("pizzahut.com"),
    outlets: [
      o("Level 2", "Gate C22", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "café, quick service, cold brew, frappuccino, iced coffee, hot coffee, lemonade, juice, protein boxes, oatmilk, vegetarian, mobile ordering, seasonal drinks, merchandise, latte, coffee, espresso, breakfast, grab & go, tea, sandwiches, pastries, refreshers, snacks, bakery", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items. Hours of operation for this location may vary. Please call 972-426-5219 if you prefer to verify we are open.",
    vegetarian: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1 (972) 574-4927",
    outlets: [
      o("Level 2", "Gate C8", "airside", ""),
      o("Level 2", "Gate C21", "airside", ""),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "full service, american, sit down dining, whiskey, wine, soda, tea, coffee, dessert, kids menu, vegetarian options, takeout, ribs, fries, seafood, casual dine-in, steak, tv, live sports, kiosk, burgers, chicken, beer, cocktails, grab & go, sandwiches, salads, lunch, dinner, bar", amenity: "restaurant",
    description: "TGI Fridays is well known for their long selection of apps and entrees. Hours of operation for this location may vary. Please call 972-574-2728 if you prefer to verify we are open.",
    vegetarian: true,
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"), phone: "+1 (972) 574-2728",
    outlets: [
      o("Level 2", "Gate C8", "airside", ""),
    ],
  }),
  vending_machines: restaurant({
    name: "Vending Machines", cuisine: "vending", amenity: "vending_machine",
    outlets: [
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate C8", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate C2", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate C12", "airside", ""),
      o("Level 2", "Level 2", "airside", ""),
      o("Level 2", "Level 2", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
    ],
  }),
  whisk_bowl: restaurant({
    name: "Whisk & Bowl", cuisine: "café, quick service, breakfast burritos, quiche, croissants, muffins, wraps, chicken, turkey, juice, soda, cold brew, gluten free, vegetarian, local, bottled water, coffee, breakfast, grab & go, bakery, sandwiches, salads, burritos, pastries, espresso, tea", amenity: "cafe",
    description: "We start every day with a whisk, a bowl and a love for the sweeter things. Whisk & Bowl is an artisanal pastry and coffee shop designed to elevate the senses. Enjoy sweet and savory scratch-baked treats, breakfast all day and Green Beans Coffee. Hours of operation for this location may vary. Please call 972-973-2913 if you prefer to verify we are open.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 2", "Gate C12", "airside", ""),
    ],
  }),
};

// ─── Terminal D ───

const terminalDVenues = {
  applebees: restaurant({
    name: "Applebee's", cuisine: "full service, sit down dining, ribs, seafood, pasta, boneless wings, mozzarella sticks, beer, wine, bourbon, dessert, kids meal, made to order, grill, burgers, bar, chicken, steaks, salads, sandwiches, tv, live sports, cocktails", amenity: "restaurant",
    description: "Delicious burgers, steaks, seafood, salads and sandwiches in a friendly atmosphere. It's a Whole New Neighborhood at Applebee's! Hours of operation for this location may vary. Please call 972-973-1050 if you prefer to verify we are open.",
    outlets: [
      o("Level 3", "Gate D12", "airside", ""),
    ],
  }),
  artisan_market: restaurant({
    name: "Artisan Market", cuisine: "café, quick service, ready to eat, premade sandwiches, vegetarian, chicken, turkey, bagels, espresso, juice, bottled beverages, fresh ingredients, made to order, convenience, grab & go, sandwiches, salads, coffee, breakfast, healthy, soups, snacks, pasties, beverages", amenity: "fast_food",
    description: "Artisan Market features inspired made-to-order sandwiches, salads, and soups, crafted with ingredients sourced from local purveyors and farmers. Created with the highest quality ingredients, Artisan Market features options for all dietary needs.",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate D27", "airside", ""),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "quick service, soft pretzels, cinnamon sugar, cheese dip, pepperoni, hot dog, cheese, salted pretzels, savory snacks, fountain drinks, iced drinks, family, fresh baked, pretzels, snacks, grab & go, lemonade, frozen drinks, pretzel nuggets, pretzel dogs, dips, dessert, refreshments", amenity: "fast_food",
    description: "Auntie Anne's features freshly baked pretzels and their famous pretzel dog. Hours of operation for this location may vary. Please call 972-973-4474 if you prefer to verify we are open.",
    outlets: [
      o("Level 3", "Gate D36", "airside", ""),
    ],
  }),
  banh_shop: restaurant({
    name: "Banh Shop", cuisine: "quick service, vietnamese, asian street food, spring rolls, fried rice, pad thai, curry, steak, meatballs, shrimp, fresh herbs, pickley vegetables, made to order, tea, salads, wine, beer, cocktails, banh mi, Asian, rice bowls, noodles, grab & go, chicken, pork, beef, bar, teriyaki", amenity: "fast_food",
    description: "Banh Shop is a diverse collection of 'baguettes and bowls' inspired by the exciting and vibrant food offered by street vendors throughout Southeast Asia.",
    website: "banhshop.com", logoUrl: logo("banhshop.com"),
    outlets: [
      o("Level 3", "Gate D10", "airside", ""),
    ],
  }),
  bar_louie: restaurant({
    name: "Bar Louie", cuisine: "full service, beer, wine, whiskey, nachos, pretzels, wings, chicken, salads, dessert, made to order, kids meal, bar, burgers flatbreads, coctails, appertizers, breakfast, sandwiches", amenity: "restaurant",
    description: "Eat. Drink. Be Happy. From our Chicago roots, we offer a comfortable place to hang out and enjoy drinks, scratch food, awesome music, and the best service. Hours of operation for this location may vary. Please call 469-319-8075 if you prefer to verify we are open.",
    website: "barlouie.com", logoUrl: logo("barlouie.com"),
    outlets: [
      o("Level 3", "Gate D22", "airside", ""),
    ],
  }),
  brewed: restaurant({
    name: "Brewed", cuisine: "full service, Texas, latte, matcha, nitro cold brew, avocado toast, breakfast tacos, chicken & waffles, mimosa, mocktails, craft beer, fresh ingredients, made to order, local coffee, coffee, breakfast, brunch, bar, cocktails, sandwiches, grab & go, healthy", amenity: "restaurant",
    description: "Visit \"the Locals' living room\" to enjoy a great meal served in a warm, home-like environment, just like we do in our original Fort Worth location. We serve delicious choices for breakfast, lunch and dinner. Hours of operation for this location may vary. Please call 972-973-1048 if you prefer to verify we are open.",
    outlets: [
      o("Level 3", "Gate D25", "airside", ""),
    ],
  }),
  buffalo_wild_wings: restaurant({
    name: "Buffalo Wild Wings", cuisine: "full service, live sports, tvs, craft beer, cocktails, wine, pretzel bites, chicken sandwich, salads, made to order, lunch, dinner, buffalo sauce, lemon pepper, wings, sports bar, bar, beer, burgers, chicken tenders, boneless wings, nachos", amenity: "bar",
    description: "Wings. Beer. Sports. Buffalo Wild Wings is the great American Sports Bar--being the largest sports bar brand in the USA with over 1200 bars in 10 countries.",
    website: "buffalowildwings.com", logoUrl: logo("buffalowildwings.com"),
    outlets: [
      o("Level 3", "Gate D27", "airside", ""),
    ],
  }),
  cake_bar: restaurant({
    name: "Cake Bar", cuisine: "dessert shop, cake slices, german chocolate, red velvet, vanilla, bottle beverages, bakery, cake, desserts, sweet treats, coffee", amenity: "cafe",
    description: "Enjoy a slice of cake from the famous Cake Bar in Dallas, now available at Gate D2 in Terminal D. Pick up a slice for now or later, or surprise someone with this special treat.",
    outlets: [
      o("Level 3", "Gate D2", "airside", ""),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "quick service, grilled chicken, spicy chicken, chicken strips, chicken biscuits, biscuits, hash browns, mac & cheese, cookies, frosted lemonade, sweet tea, fountain drinks, made to order, mobile ordering, sauce, chicken, chicken sandwich, nuggets, breakfast, grab & go, waffle fries, salads, lemondade, sandwiches, kids meal", amenity: "fast_food",
    description: "Chick-fil-A is the home of the Original Chicken Sandwich along with so much more, and now has found its way to DFW Airport! Chick-fil-A offers a variety of options to guests such as delicious breakfast items, salads, wraps, and fruit. Closed On Sundays.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("Level 3", "Gate D18", "airside", ""),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "full service, sit down dining, ribs, steak, quesadillas, nachos, beer, wine, cocktails, desert, kids meal, made to order, triple dipper, bottled water, ready made meals, burgers, bar, margaritas, chicken, fajitas, sandwiches, salads, Tex Mex, grab & go", amenity: "restaurant",
    description: "Family friendly chain serving classic Tex-Mex & American fare in a Southwestern style setting. Favorites include ribs, burgers, fajitas, sandwiches, chicken strips and signature margaritas for dine-in and Grab-N-Go.",
    outlets: [
      o("Level 3", "Gate D23", "airside", ""),
    ],
  }),
  coffee_bean_tea_leaf_bakery: restaurant({
    name: "Coffee Bean & Tea Leaf + Bakery", cuisine: "café, quick service, hot coffe, iced coffee, latte, cappuccino, matcha, muffins, pie, croissants, bagels, bottled beverages, fresh baked, made to order, tea latte, loose leaf tea, kiosk, coffee, tea, espresso, breakfast, grab & go, pastries, bakery, sandwiches, cold brew, snacks", amenity: "cafe",
    description: "Enjoy a cup of coffee brewed from the top 1 percent of Arabica beans sourced from around the world, or savor premium tea leaves from private, family-owned estates - all paired with delicious, locally baked artisan pastries.",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("Level 3", "Gate D34", "airside", ""),
    ],
  }),
  cru_food_wine_bar: restaurant({
    name: "CRÚ Food & Wine Bar", cuisine: "full service, sit down dining, artisan cheese, shareables, flatbreads, burgers, bruschetta, hummus, ahi tuna, beer, cocktails, dessert, made to order, wine flights, wine, wine bar, bar, charcuterie, piza, cheese boards, salads, sandwiches, fire oven", amenity: "bar",
    description: "CRU offers an unparalleled wine by the glass & flight selection that rivals great tasting rooms of the world. Paired with our selections of stone-fired pizzas, salads, savory dishes and decadent desserts, you are sure to be swept away to the wine country. Hours of operation for this location may vary. Please call 972-973-7751 if you prefer to verify we are open.",
    outlets: [
      o("Level 3", "Gate D27", "airside", ""),
    ],
  }),
  dickeys_barbecue_pit: restaurant({
    name: "Dickey's Barbecue Pit", cuisine: "quick service, smoked meats, mac & cheese, baked beans, coleslaw, potato salad, texas toast, sweet tea, fountain drinks, made to order, dessert, BBQ, brisket, pulled pork, chicken, sandwiches, grab & go, loaded baked potato, ribs, sausage", amenity: "fast_food",
    description: "Since 1941, Dickey's has been smoking the very best quality meats every day. Enjoy Texas brisket, ribs, pulled pork, chicken, sausage or turkey, along with our wholesome sides and buttery rolls. Serving breakfast, lunch and dinner, plus a full bar.",
    outlets: [
      o("Level 3", "Gate D27", "airside", ""),
    ],
  }),
  farmers_fridge_vending: restaurant({
    name: "Farmer's Fridge Vending", cuisine: "refrigerated vending, smart vending, chicken salad, greek salad, caesar salad, chia pudding, fresh wraps, bottled drinks, healthy breakfast, self-service, contactless, fresh ingredients, wellness, healthy meals, fresh salads, grab & go, grain bowls, wraps, breakfast, healthy snacks, fresh food, vegetarian, protein bowls", amenity: "vending_machine",
    description: "Hi, we're Farmer's Fridge. We make it simple for everyone to eat fresh, healthy meals, when you're on the go.",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate D40", "airside", ""),
      o("Level 3", "D15 South Ticket Hall", "airside", ""),
    ],
  }),
  flying_saucer_draught_emporium: restaurant({
    name: "Flying Saucer Draught Emporium", cuisine: "full service, draft beer, local beer, imported beer, IPA, lager, stout, hummus, nachos, chicken tenders, coctails, wine, made to order, craft beer, bar, burgers, wings, sandwiches, pretzels, appertizers, salads, tv, live sports", amenity: "bar",
    description: "Flying Saucer Draught Emporium is a craft beer bar serving Good Beer to Good People since 1995. With 15 locations in 6 states, we're home to: the world's best beer, a relaxed pub setting, and the Beerknurds - the world's best group of beer lovers. Hours of operation for this location may vary. Please call 972-973-4228 if you prefer to verify we are open.",
    website: "beerknurds.com", logoUrl: logo("beerknurds.com"), phone: "+1 (972) 973-4228",
    outlets: [
      o("Level 3", "Gate D20", "airside", ""),
    ],
  }),
  hickory: restaurant({
    name: "Hickory", cuisine: "Texas BBQ, smoked meats, smoked turkey, pork ribs, jalepeno cheddar sausage, brisket chili, chili, grilled cheese, mac & cheese, salads, coleslaw, baked potato salad, fries, dessert, made to order, tv, wine, beer, live sports, full service, cocktails, BBQ, brisket, tacos, sandwiches, burgers, pulled pork, chicken, grab & go, breakfast, bar", amenity: "restaurant",
    description: "Hickory. Smoked. BBQ. Savory Texas style BBQ featuring mouthwatering brisket, hand pulled pork, and all the accoutrements. Hand crafted cocktails, Texas whiskey and local drafts. Stop in to enjoy genuine Texas hospitality. Serving breakfast items all day.",
    outlets: [
      o("Level 3", "Gate D22", "airside", ""),
    ],
  }),
  lavazza_coffee: restaurant({
    name: "Lavazza Coffee", cuisine: "café, quick service, italian coffee, hot coffee, iced coffee, latte, cappuccino, mocha, bottled beverages, made to order, espresso bar, coffee, espresso, tea, breakfast, grab & go, pastries, sandwiches, cold brew, snacks", amenity: "cafe",
    description: "Italy's favorite coffee, started in 1895 in Turin. Lavazza is a global leader in coffee innovation and a global ambassador of the authentic Italian coffee experience. One delicious cup, and you'll know why it's Italy's favorite coffee.",
    website: "lavazza.com", logoUrl: logo("lavazza.com"),
    outlets: [
      o("Level 3", "Gate D34", "airside", ""),
    ],
  }),
  licorice_vending: restaurant({
    name: "Licorice Vending", cuisine: "refrigerated vending, smart vending, chicken salad, greek salad, caesar salad, chia pudding, fresh wraps, bottled drinks, healthy breakfast, self-service, contactless, fresh ingredients, wellness, healthy meals, fresh salads, grab & go, grain bowls, wraps, breakfast, healthy snacks, fresh food, vegetarian, protein bowls", amenity: "vending_machine",
    description: "Enjoy gourmet licorice, taffies and caramels, ready to go.",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate D21", "airside", ""),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "quick service, big mac, quarter pounder, mccafe, mcmuffin, mcgriddles, mcnuggets, filet o fish, apple pie, ice cream, hot coffee, iced coffee, coke products, mobile ordering, cookies, fast food, american, kids menu, eggs, burgers, breakfast, coffee, chicken, fries, grab & go, value meals, happy meals, desserts, soda", amenity: "cafe",
    description: "McDonald's offers our classic menu for breakfast, lunch and dinner, including Egg McMuffins, Breakfast Bagels, Big Macs, Happy Meals, Smoothies, and our World Famous Fries. Hours of operation for this location may vary. Please call 972-973-4364 if you prefer to verify we are open.",
    outlets: [
      o("Level 3", "Gate D33", "airside", ""),
    ],
  }),
  peach_cobbler_factory: restaurant({
    name: "Peach Cobbler Factory", cuisine: "quick service, dessert shop, coffee, bottled beverages, seasonal flavors, peach cobbler, desserts, ice cream, banana pudding, cookies, cinnamon rolls, cobbler, grab & go, sweet treats, red velvet", amenity: "cafe",
    description: "A Southern Tradition, multiple varieties of cobblers, cookies and treats!",
    website: "peachcobblerfactory.com", logoUrl: logo("peachcobblerfactory.com"),
    outlets: [
      o("Level 3", "Gate D12", "airside", ""),
    ],
  }),
  smoothie_king: restaurant({
    name: "Smoothie King", cuisine: "quick service, fitness, protein shakes, smoothie bowls, vitamins, hydration, weight management, gluten free, vegan, low sugar, clean blends, kids, nutritional supplement, healthy, smoothies, healthy options, protein, grab & go, fruit, juice, meal replacement, wellness, energy, snacks", amenity: "fast_food",
    description: "Our smoothies are specialized to expertly blend to meet your specific needs, goals, and ambitions. For healthy-lifestyle individuals and families, Smoothie King is the premium Smoothie Destination that makes it simple and pleasurable to achieve health goals.",
    vegan: true, glutenFree: true,
    website: "smoothieking.com", logoUrl: logo("smoothieking.com"),
    outlets: [
      o("Level 3", "Gate D12", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "café, quick service, cold brew, frappuccino, iced coffee, hot coffee, lemonade, juice, protein boxes, oatmilk, vegetarian, mobile ordering, seasonal drinks, merchandise, latte, coffee, espresso, breakfast, grab & go, tea, sandwiches, pastries, refreshers, snacks, bakery", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items.",
    vegetarian: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Level 3", "Gate D28", "airside", ""),
      o("Level 3", "Gate D12", "airside", ""),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "cold cuts, quick service, made to order, italian bmt, steak & cheese, tuna, ham, roast beef, bacon, fresh vegetables, fountain drinks, soda, chips, vegetarian, footlong, sandwiches, grab & go, healthy, salads, wraps, breakfast, chicken, turkey, veggie, cookies", amenity: "fast_food",
    description: "Subway is an internationally known deli and sandwich shop. Hours of operation for this location may vary. Please call 972-973-4490 if you prefer to verify we are open.",
    vegetarian: true,
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("Level 3", "Gate D18", "airside", ""),
    ],
  }),
  subway_marketplace: restaurant({
    name: "Subway Marketplace", cuisine: "grab & go market, premade sandwiches, conveience, cold sandwiches, bottled drinks bottled water, fountain drinks, coffee station, cookies, landside, international arrival, quick service, grab & go, sandwiches, snacks, coffee, chips, beverages, breakfast, reaty to eat, quick meal", amenity: "fast_food",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("Level 1", "Level 1", "landside", ""),
    ],
  }),
  the_italian_kitchen_by_wolfgang_puck: restaurant({
    name: "The Italian Kitchen by Wolfgang Puck", cuisine: "full service, sit down dining, margherita pizza, pepperoni pizza, chicken alfredo, shrimp linguine, meatballs, calamari, tiramisu, cocktails, beer, espresso, made to order, Italian, pizza, pasta, bar, wine, salads, sandwiches, breakfast, lunch, grab & go", amenity: "restaurant",
    description: "An authentic Italian dining experience, showcasing the creations of renowned chef and restaurateur Wolfgang Puck. Featuring Italian classics, hand-stretched pizzas, signature entrees, delectable desserts, extensive wines and Italian themed cocktails.",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("Level 3", "Gate D34", "airside", ""),
    ],
  }),
  trinity_groves_food_lockers: restaurant({
    name: "Trinity Groves Food Lockers", cuisine: "food lockers, smart lockers, digital ordering, heated lockers, fresh made, kiosk, pickup lockers, contactless dining, chicken sandwich, fries, grain bowls, fountain drinks, quick service, grab & go, food pickup, contactless pickup, pizza, burgers, sandwiches, salads, breakfast, self-service, fresh meals", amenity: "food_court",
    description: "One stop shop featuring four restaurants preparing scratch meals from Holy Crust pizza, AvoEatery, Beto & Son: Next Generation Mexican Food and The Hall Bar & Grill.",
    outlets: [
      o("Level 3", "Gate D1", "airside", ""),
    ],
  }),
  trinity_groves_kitchen_bar: restaurant({
    name: "Trinity Groves Kitchen & Bar", cuisine: "local, bar seating, bar, beer, wine, craft cocktails, self-service ordering, fresh meals, tvs, quick service, contactless pickup, American, full bar, cocktails, pizza, burgers, sandwiches, salads, breakfast, sports bar, grab & go", amenity: "food_court",
    description: "Trinity Groves Kitchen features great recipes from Beto & Son Mexican Cuisine, Holy Crust Pizza, The Hall Grill and AvoEatery, plus great cocktails. Order from your Gate at D1-D4 for delivery to your seat, or pick up your order from our food lockers!",
    outlets: [
      o("Level 3", "Gate D2", "airside", ""),
    ],
  }),
  tx_mx: restaurant({
    name: "TX/MX", cuisine: "full service, sit down dining, brisket, shrimp, guacamole, queso, salsa, beer, wine, cocktail, margarita, frozen drinks, tortillas, made to order, breakfast tacos, Tex Mex, tacos, fajitas, bar, margaritas, quesadillas, nachos, breakfast, chicken, beef", amenity: "restaurant",
    description: "The native foreign food.",
    outlets: [
      o("Level 3", "Gate D31", "airside", ""),
    ],
  }),
  vending_machines: restaurant({
    name: "Vending Machines", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 3", "Gate D6", "airside", ""),
      o("Level 3", "Gate D33", "airside", ""),
      o("Level 3", "Gate D38", "airside", ""),
      o("Level 3", "Level 3", "landside", ""),
      o("Level 3", "Level 3", "landside", ""),
      o("Level 3", "Level 3", "landside", ""),
      o("Level 1", "Level 1", "landside", ""),
      o("Level 1", "Level 1", "landside", ""),
      o("Level 3", "Gate D10", "airside", ""),
      o("Level 3", "Level 3", "airside", ""),
      o("Level 3", "Level 3", "airside", ""),
      o("Level 3", "Level 3", "landside", ""),
      o("Level 1", "Level 1", "landside", ""),
      o("Level 1", "Level 1", "landside", ""),
    ],
  }),
  whataburger: restaurant({
    name: "Whataburger", cuisine: "quick service, patty melt, honey butter, biscuit, taquito, onion rings, fountain drinks, Texas favorite, apple pie, cinnamon roll, burgers, breakfast, chicken, fries, grab & go, sandwiches, salads, coffee, shakes, kids meal", amenity: "fast_food",
    description: "Enjoy a Texas favorite at Whataburger!",
    website: "whataburger.com", logoUrl: logo("whataburger.com"),
    outlets: [
      o("Level 3", "Gate D12", "airside", ""),
    ],
  }),
};

// ─── Terminal E ───

const terminalEVenues = {
  '2_0_taco_tequila_bar': restaurant({
    name: "2.0 Taco & Tequila Bar", cuisine: "mexican, bar, breakfast, chips & salsa, soup, burritos, nachos, quesadilla, queso, desserts, tv, sports, tacos", amenity: "bar",
    description: "Enjoy our authentic Tex-Mex comfort food and hand-crafted cocktails. We offer something for everyone with our handmade and heartfelt offerings. Menu options feature breakfast, lunch, dinner, and quick Grab & Fly selections for those in a hurry.",
    outlets: [
      o("Level 2", "Gate E31", "airside", ""),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "quick service, soft pretzels, cinnamon sugar, cheese dip, pepperoni, hot dog, cheese, salted pretzels, savory snacks, fountain drinks, iced drinks, family, fresh baked, pretzels, snacks, grab & go, lemonade, frozen drinks, pretzel nuggets, pretzel dogs, dips, dessert, refreshments", amenity: "fast_food",
    description: "Auntie Anne's features freshly baked pretzels and their famous pretzel dog. Hours of operation for this location may vary. Please call 972-973-6434 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate E5", "airside", ""),
      o("Level 2", "Gate E31", "airside", ""),
    ],
  }),
  av8_bar_cafe: restaurant({
    name: "AV8 Bar & Cafe", cuisine: "full service, made to order, chicken tenders, caesar salad, pulled pork, tater tots, wine, spirits, draft beer, local beer, appertizers, tvs, live sports, bar, cocktails, beer, pizza, sushi, tacos, hot dogs, grab & go", amenity: "bar",
    description: "Cocktail bar serving sandwiches, salads and sushi.",
    outlets: [
      o("Level 2", "Gate E27", "landside", ""),
    ],
  }),
  boars_head_deli: restaurant({
    name: "Boar's Head Deli", cuisine: "deli, sandwiches, chips, soda, bottled water, turkey, ham, bacon, roast beef, blt, tuna, salads, chicken, vegetarian, pastrami, women-owned, sandwich/deli, cold cuts, fresh", amenity: "fast_food",
    description: "Boar's Head Deli offers to-go menu items for travelers in a hurry.",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate E22", "airside", ""),
    ],
  }),
  brewed: restaurant({
    name: "Brewed", cuisine: "café, quick service, craft coffee, hot coffee, iced coffee, latte, cappuccino, nitro cold brew, matcha, muffins, croissants, local coffee, made to order, bottled water, bottled beverages, coffee, espresso, grab & go, tea, cold brew, breakfast, pastries, snacks, refreshers, bakery", amenity: "cafe",
    description: "Experience the famous Fort Worth Craft Coffee and delicious pastries.",
    outlets: [
      o("Level 2", "Gate E18", "airside", ""),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "quick service, grilled chicken, spicy chicken, chicken strips, chicken biscuits, biscuits, hash browns, mac & cheese, cookies, frosted lemonade, sweet tea, fountain drinks, made to order, mobile ordering, sauce, chicken, chicken sandwich, nuggets, breakfast, grab & go, waffle fries, salads, lemondade, sandwiches, kids meal", amenity: "fast_food",
    description: "Chick-fil-A is the home of the Original Chicken Sandwich along with so much more, and now has found its way to DFW Airport! Chick-fil-A offers a variety of options to guests such as delicious breakfast items, salads, wraps, and fruit. Closed On Sundays.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("Level 2", "Gate E6", "airside", ""),
    ],
  }),
  dickeys_barbecue_pit: restaurant({
    name: "Dickey's Barbecue Pit", cuisine: "quick service, smoked meats, mac & cheese, baked beans, coleslaw, potato salad, texas toast, sweet tea, fountain drinks, made to order, dessert, BBQ, brisket, pulled pork, chicken, sandwiches, grab & go, loaded baked potato, ribs, sausage", amenity: "fast_food",
    description: "Since 1941, Dickey's has been smoking the very best quality meats every day. Enjoy Texas brisket, ribs, pulled pork, chicken, sausage or turkey, along with our wholesome sides and buttery rolls. Serving breakfast, lunch and dinner, and ice cold beer.",
    outlets: [
      o("Level 2", "Gate E27", "airside", ""),
    ],
  }),
  drew_pearsons_sports_88: restaurant({
    name: "Drew Pearson's Sports 88", cuisine: "Dallas Cowboys, flatbreads, sports bar, salads, nachos, shareables, local beer, wine, bar seating, chicken wings, American, full bar, burgers, wings, sandwiches, breakfast, cocktails, beer, tvs", amenity: "bar",
    description: "DP Sports 88 is an upscale sports bar honoring Dallas Cowboys legend Drew Pearson, one of the greatest NFL wide receivers. The menu features breakfast, lunch and dinner, and includes smoked barbecue, burgers, sandwiches, and fresh delicious salads",
    outlets: [
      o("Level 2", "Gate E5", "airside", ""),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "café, quick service, hot coffee, iced coffee, cold brew, latte, frozen drinks, muffins, hash browns, bacon, sausage, juice, soda, mobile ordering, coffee, donuts, breakfast, grab & go, espresso, sandwiches, bagels, refreshers, tea, snacks", amenity: "cafe",
    description: "Dunkin' Donuts is an American favorite, featuring bakery, deli, and breakfast items. Hours of operation for this location may vary. Please call 972-973-6432 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate E8", "airside", ""),
    ],
  }),
  einstein_bros_bagels: restaurant({
    name: "Einstein Bros. Bagels", cuisine: "bagel shop, café, quick service, fresh baked, cream cheese, bacon, sausage, egg, turkey, avocado, vegetarian options, hot coffee, iced coffee, ready to eat, bagels, coffee, breakfast, breakfast sandwiches, sandwiches, pastries, espresso, tea, grab & go, lunch", amenity: "cafe",
    description: "Located within Caribou Coffee, enjoy a warm Einstein Bros. Bagel with a signature shmear or other delicious baked pastries. Hours of operation for this location may vary. Please call 972-973-6437 if you prefer to verify we are open.",
    vegetarian: true,
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"),
    outlets: [
      o("Level 2", "Gate E13", "airside", ""),
    ],
  }),
  farmers_fridge_vending: restaurant({
    name: "Farmer's Fridge Vending", cuisine: "refrigerated vending, smart vending, chicken salad, greek salad, caesar salad, chia pudding, fresh wraps, bottled drinks, healthy breakfast, self-service, contactless, fresh ingredients, wellness, healthy meals, fresh salads, grab & go, grain bowls, wraps, breakfast, healthy snacks, fresh food, vegetarian, protein bowls", amenity: "vending_machine",
    description: "Hi, we're Farmer's Fridge. We make it simple for everyone to eat fresh, healthy meals, when you're on the go.",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate E7", "airside", ""),
    ],
  }),
  freshens_yogurt_smoothies: restaurant({
    name: "Freshëns Yogurt & Smoothies", cuisine: "healthy, quick service, fresh fruit, protein smoothies, dairy free, gluten free, vegan, low fat, vitamins, hydration, wellness, energy, nutritional supllements, kids, smoothies, frozen yogurt, healthy options, grab & go, fruit, protein, juice, snacks, refreshments, meal replacement", amenity: "cafe",
    description: "Enjoy delicious smoothies at Freshens!",
    vegan: true, glutenFree: true,
    website: "freshens.com", logoUrl: logo("freshens.com"),
    outlets: [
      o("Level 2", "Gate E22", "airside", ""),
    ],
  }),
  ihop: restaurant({
    name: "IHOP", cuisine: "full service, pancake house, french toast, waffles, crepes, combos, breakfast burritos, syrup, sausage, espresso, made to order, kids meal, all day breakfast, breakfast, pancakes, omelets, coffee, burgers, sandwiches, grab & go, eggs, bacon", amenity: "restaurant",
    description: "Enjoy breakfast all day, also featuring a full bar with your favorite libations.",
    website: "ihop.com", logoUrl: logo("ihop.com"),
    outlets: [
      o("Level 2", "Gate E8", "airside", ""),
    ],
  }),
  jamba: restaurant({
    name: "Jamba", cuisine: "healthy option, quick service, fresh juice, smoothie bowls, pitaya bowl, oatmeal, protein smoothies, wellness shots, vegan, dairy gree, gluetn free, fresh ingredients, hydration, bottled beverages, bottled water, made to order, smoothies, juice, acai bowls, healthy, grab & go, fresh fruit, protein, snacks, breakfast, refreshement", amenity: "fast_food",
    description: "When you wanna feel your best, when you are flavor obsessed there's only one way to refresh, you just gotta Jamba. For over 25 years we have been bringing the whoa to your whirl'd and the fresh to flavor with our smoothies, bowls, juices and shots.",
    vegan: true, glutenFree: true,
    website: "jamba.com", logoUrl: logo("jamba.com"),
    outlets: [
      o("Level 2", "Gate E21", "airside", ""),
    ],
  }),
  jimmy_johns: restaurant({
    name: "Jimmy John's", cuisine: "quick service, made to order, italian sandwiches, tuna, ham, cold cuts, bacon, avocado, pickles, potato salad, pasta salad, fountain drinks, bottled beverages, bottled water, sandwiches, deli, grab & go, wraps, chips, turkey, roast beef, healthy, lunch, cookies", amenity: "fast_food",
    description: "Jimmy John's, The Sandwich of Sandwiches. Freaky Fast sandwiches using high quality ingredients built onto fresh-baked bread using premium meats and fresh veggies, sliced by hand daily.",
    outlets: [
      o("Level 2", "Gate E21", "airside", ""),
    ],
  }),
  love_shack: restaurant({
    name: "Love Shack", cuisine: "quick service, gourmet burgers, angus beef, turkey burger, veggie burger, bacon, chili cheese fries, onion rings, fountain drinks, soda, made to order, kids meal, burgers, hot dogs, fries, shakes, grab & go, chicken, sandwiches, local", amenity: "fast_food",
    description: "The Love Shack at DFW Airport features the humble American hamburger in a number of enticing guises crafted by Texas celebrity chef Tim Love.",
    website: "timlove.com", logoUrl: logo("timlove.com"),
    outlets: [
      o("Level 2", "Gate E12", "airside", ""),
    ],
  }),
  panda_express_and_bar: restaurant({
    name: "Panda Express and Bar", cuisine: "quick service, Aisian, beef, shrimp, kung pao chicken, broccoli beef, fried rice, chow mein, super greens, egg rolls, rangoon, vegetarian, soda, tea, kid meals, wine, beer, cocktails, family meals, Chinese, orange chicken, chicken, rice, noodles, bowls, grab & go, lunch, dinner, bar", amenity: "fast_food",
    description: "Enjoy Panda Express, now available with an adjacent full bar near Gate E33. Famous for its Original Orange Chicken, Sweet Fire Chicken Breast, Honey Walnut Shrimp and Shanghai Angus Steak.",
    vegetarian: true,
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("Level 2", "Gate E33", "airside", ""),
    ],
  }),
  sonny_bryans_smokehouse: restaurant({
    name: "Sonny Bryan's Smokehouse", cuisine: "quick service, smoked meats, sausage, turkey, chicken, loaded baked potato, BBQ beans, potato salad, coleslaw, sweet tea, fountain drinks, made to order, Dallas, chopped brisket, bottled water, BBQ, brisket, ribs, pulled pork, sandwiches, grab & go, breakfast, lunch, dinner, Texas BBQ", amenity: "fast_food",
    description: "Legendary barbecue from Sonny Bryan's Smokehouse of Dallas.",
    outlets: [
      o("Level 2", "Gate E13", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "café, quick service, cold brew, frappuccino, iced coffee, hot coffee, lemonade, juice, protein boxes, oatmilk, vegetarian, mobile ordering, seasonal drinks, merchandise, latte, coffee, espresso, breakfast, grab & go, tea, sandwiches, pastries, refreshers, snacks, bakery", amenity: "cafe",
    description: "Starbucks is an internationally known coffee shop offering drinks, snacks, and to-go items.",
    vegetarian: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Level 2", "Gate E27", "airside", ""),
      o("Level 2", "Gate E34", "airside", ""),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "full service, american, sit down dining, whiskey, wine, soda, tea, coffee, dessert, kids menu, vegetarian options, takeout, ribs, fries, seafood, casual dine-in, steak, tv, live sports, kiosk, burgers, chicken, beer, cocktails, grab & go, sandwiches, salads, lunch, dinner, bar", amenity: "restaurant",
    description: "TGI Fridays is well known for their long selection of apps and entrees. Hours of operation for this location may vary. Please call 972-574-2777 if you prefer to verify we are open.",
    vegetarian: true,
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"),
    outlets: [
      o("Level 2", "Gate E17", "airside", ""),
    ],
  }),
  uno_due_go: restaurant({
    name: "Uno Due Go", cuisine: "quick service, chicago style, thin crust pizza, breakfast burrito, bagels, yogurt parfait, fresh fruit, tortilla soup, pepperoni pizza, cheese pizza, veggie pizza, fountain drinks, made to order, kids meal, live sports, beer, wine, cocktails, pizza, deep dish pizza, personal pizza, breakfast, grab & go, calzones, sanwiches, salads, bar", amenity: "fast_food",
    description: "Uno Due Go serves fresh, hot pizza.",
    outlets: [
      o("Level 2", "Gate E36", "airside", ""),
    ],
  }),
  vending_machines: restaurant({
    name: "Vending Machines", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 2", "Gate E26", "airside", ""),
      o("Level 2", "Gate E26", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate E30", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate E37", "airside", ""),
      o("Level 2", "Gate E31", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate E14", "airside", ""),
      o("Level 2", "Level 2", "landside", ""),
      o("Level 2", "Gate E7", "airside", ""),
      o("Level 2", "Gate E21", "airside", ""),
      o("Level 2", "Level 2", "airside", ""),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "quick service, baconator, chicken sandwich, chicken tenders, breakfast burrito, biscuit, chili, baked potato, lemonade, fountain drinks, made to order, fresh beef, beef, frosty cream cold brew, burgers, chicken, breakfast, fries, grab & go, salads, nuggets, coffee, frosty, kids meal", amenity: "fast_food",
    description: "Wendy's is an American fast food restaurant specializing in quality burgers, fries, and salads. Hours of operation for this location may vary. Please call 972-973-6404 if you prefer to verify we are open.",
    outlets: [
      o("Level 2", "Gate E33", "airside", ""),
    ],
  }),
  whataburger: restaurant({
    name: "Whataburger", cuisine: "quick service, patty melt, honey butter, biscuit, taquito, onion rings, fountain drinks, Texas favorite, apple pie, cinnamon roll, burgers, breakfast, chicken, fries, grab & go, sandwiches, salads, coffee, shakes, kids meal", amenity: "fast_food",
    description: "Hours of operation for this location may vary. Please call 972-973-6436 if you prefer to verify we are open.",
    website: "whataburger.com", logoUrl: logo("whataburger.com"),
    outlets: [
      o("Level 2", "Gate E27", "airside", ""),
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

  const rA = await processTerminal(AIRPORT, TERMINAL_A, 'Terminal A', terminalAVenues);
  const rB = await processTerminal(AIRPORT, TERMINAL_B, 'Terminal B', terminalBVenues);
  const rC = await processTerminal(AIRPORT, TERMINAL_C, 'Terminal C', terminalCVenues);
  const rD = await processTerminal(AIRPORT, TERMINAL_D, 'Terminal D', terminalDVenues);
  const rE = await processTerminal(AIRPORT, TERMINAL_E, 'Terminal E', terminalEVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_A, TERMINAL_B, TERMINAL_C, TERMINAL_D, TERMINAL_E]));

  const totalCreated = rA.created + rB.created + rC.created + rD.created + rE.created;
  const totalDeleted = rA.deleted + rB.deleted + rC.deleted + rD.deleted + rE.deleted;
  const totalVenues = Object.keys(terminalAVenues).length + Object.keys(terminalBVenues).length
    + Object.keys(terminalCVenues).length + Object.keys(terminalDVenues).length
    + Object.keys(terminalEVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
