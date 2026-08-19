'use strict';
/**
 * Fills in complete data for George Bush Intercontinental Airport (IAH) —
 * restaurants/cafés/bars/vending in Firestore. Researched 2026-08-17 from the
 * airport's own official site, fly2houston.com, using Claude in Chrome browser
 * automation per explicit user instruction. No third-party/aggregator source
 * was used for any venue field.
 *
 * SOURCE: https://www.fly2houston.com/iah/shop-dine-relax/ (Houston Airports'
 * own Shop/Dine/Relax directory). The directory is a Next.js app whose venue
 * cards are not in the server-rendered flight data; each card links to
 * iahmaps.fly2houston.com/?poiId=<id> and loads its images from
 * img.locuslabs.com/resize/A1S5SQXXRCG0RC/…, which identifies the airport's
 * own LocusLabs map account. The structured backing data is therefore:
 *   a.locuslabs.com/accounts/A1S5SQXXRCG0RC/v5.json  (venue index)
 *   …/iah/<version>/v5/pois-3.0-iah.json             (2,678 POIs)
 *   …/iah/<version>/v5/venueData-iah.json            (structures and floors)
 * plus the live overlay marketplace.locuslabs.com/venueId/iah/dynamic-poi.
 * 132 POIs carry an `eat*` category. Each supplies poiId, name, category,
 * description, phone, operationHours, isAfterSecurity, position.floorId,
 * nearbyLandmark and keywords[]. This is the airport's own published venue
 * data, behind the airport's own dining directory and interactive map.
 *
 * EXTRACTION + VERIFICATION: the in-terminal dining records were serialised
 * in-page to a printable-ASCII format (`@@` field delimiter, `##` list
 * delimiter) with every non-ASCII character replaced by a reversible `<U+hex>`
 * escape and every field whitespace-normalised in the browser before
 * checksumming, split into 10 chunks under 6,800 chars on line boundaries,
 * written into a `<pre id="dataDump">` and retrieved via get_page_text. Every
 * chunk verified EXACTLY on first pass against values computed in the browser
 * before retrieval — len/lines/checksum: 6239/12/26473306, 6043/9/25970719,
 * 6373/9/27204540, 6529/8/27883374, 6310/8/27396791, 6476/9/27697885,
 * 6513/12/27952669, 6706/17/28137322, 6647/26/26455187, 4621/19/19115704 —
 * and the rejoined 129-line dataset at len 62466, checksum 265507254, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 5 buckets (A, B, C, D, E). IAH's own map data models
 * the airport as Terminals A, B, C, D and E plus a Rental Car Center, a
 * Marriott hotel, two Ecopark lots and the A-B parking garage. Each of the
 * five terminals has its own ticketing/check-in level and its own security
 * checkpoints, so each passes this dataset's "own check-in AND own security"
 * test and gets its own bucket. The five are all linked airside by IAH's
 * Skyway people mover (and landside by the Subway), but post-security
 * connectivity does not merge buckets under this dataset's test. Applying the
 * test WITHIN a terminal produces no further split: IAH's map gives each
 * terminal a single Level 2 gates floor with no separately-processed pier.
 * CAVEAT NOTED, NOT ACTED ON: Houston Airports has been consolidating
 * international check-in from Terminal D into Terminal E during 2026 as part
 * of the IAH Terminal Redevelopment Program. As of this snapshot IAH's own
 * map still models Terminal D as its own structure with its own check-in
 * floor — the extract itself contains landside Terminal D vending units whose
 * published landmark is literally "Check-In" — so Terminal D remains its own
 * bucket here. If that consolidation completes, D may need folding into E on
 * a later run.
 *
 * SCOPE — 3 dining POIs EXCLUDED as not being in any terminal: a Vending
 * Machine and a Subway in the Rental Car Center (`iah-rentalcar-1` /
 * `iah-rentalcar-2`) and "Flights Lounge & Grill" in the on-airport Marriott
 * (`iah-marriott-1`). None sits in a terminal building, so rather than invent
 * a bucket they are left out of scope. That leaves 129 of the 132 records.
 *
 * AIRSIDE / LANDSIDE: taken directly from each POI's own `isAfterSecurity`
 * boolean — true → `airside`, false → `landside`. Present on all 132 records;
 * no inference was needed.
 *
 * LEVEL: IAH's own floor name from venueData — "Level LL", "Level 1" and
 * "Level 2" are the floors any dining POI sits on.
 *
 * LOCATION_NOTES: each POI's own `nearbyLandmark` verbatim — "Gate C33",
 * "Baggage Claim", "Subway Station", "Check-In", "Security Checkpoint",
 * "International Arrivals", "Concourse", "Near Gate E1" — falling back to the
 * floor name for the records where IAH publishes no landmark, rather than
 * guessing one.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal bucket are
 * merged into one doc with one `outlets[]` entry per physical unit;
 * same-brand venues in DIFFERENT terminals stay separate docs, per this
 * dataset's standing rule. Brand matching is case- and apostrophe-insensitive,
 * plus three documented rendering aliases for renderings of one brand that
 * differ only cosmetically in IAH's own data: "Chick Fil A" ≡ "Chick-Fil-A" ≡
 * "Chick-fil-A"; "Einstein Bagels" ≡ "Einstein Bros. Bagels"; "Freshens" ≡
 * "Freshëns". Distinctly NAMED venues sharing a parent brand are kept separate
 * per this dataset's page-truth-over-label precedent: "Starbucks" vs
 * "Starbucks Pick Up" (a genuinely different, mobile-order-only format, as
 * IAH's own description for it explains); "Q Bar" vs "Q-Bar Texas BBQ" vs
 * "Q"; "The Line Sports Grill" vs "The Line Sports Grill & Bar"; "El Premio
 * Tex-Mex Bar & Grill" vs "El Premio Tex Mex Bar and Grill"; "Einstein Bagels
 * & Coffee"; and IAH's four separately-named vending formats ("Vending
 * Machine - Snacks", "- Beverages", "- Coffee", "- Hot Water"). 129 source
 * records → 110 docs.
 *
 * CUISINE: the verbatim join of each POI's own user-searchable `keywords[]`,
 * in IAH's own order, unfiltered — including IAH's own price bands ("less
 * than $10", "$10-$20", "more than $20"), audience tags ("Kid-friendly Menu",
 * "Local", "24/7"), service tags ("Fast Food", "Restaurants & Bars", "Coffee
 * Bars", "Snacks & Sweet Treats", "Grab & Go", "sit-down") and the hashtag
 * tags IAH uses on some records ("#food", "#airportfood", "#saltysnack",
 * "#quickbite" on Wetzel's Pretzels). Only three site-collection identifiers
 * are dropped, since they are not cuisine/genre at all: "dine", "food" and
 * the "World Cup Concessions" campaign tag. Where outlets were merged, the
 * union of their keyword sets is used, first-seen order preserved. For the
 * venues IAH publishes with no keywords, `cuisine` falls back to the readable
 * form of the POI's own category ("Dining", "Bar", "Coffee", "Vending").
 *
 * AMENITY: driven by IAH's own POI category first — `eat.vending` →
 * `vending_machine` (31 units), `eat.bar` → `bar`, `eat.coffee` → `cafe`. Per
 * this dataset's standing rule, all ten `eat.bar` venues were checked against
 * their own name and description and all stand: Sugarland Beer Garden, Bayou
 * City Bar, Q-Bar Texas BBQ, Alchemy Cocktail Lounge, Houston Wheelhouse,
 * Beerhive (×2), Urban Crave, El Premio Tex Mex Bar and Grill and The Line
 * Sports Grill & Bar. TWO venues IAH tags as plain `eat` were promoted to
 * `bar` on the venue's own words: Mockingbird Distillery & Smokehouse (a
 * distillery by name, and its own description is entirely about how its vodka
 * is made) and Liquid Provisions (whose own description reads "This
 * alternative bar offers an authentic, quirky and independent atmosphere").
 * Deliberately NOT promoted despite "Bar" in the name, because their own
 * descriptions are food-led: H-Burger Bar, Cadillac Mexican Kitchen & Tequila
 * Bar, Olio Panini Bar and Hubcap Grill & Beer Yard. Otherwise the order is:
 * a "restaurant" / "Restaurants & Bars" / "sit-down" keyword → `restaurant`;
 * a coffee/café/bagel/bakery name → `cafe`; a pretzel/popcorn/confection/
 * juice/yogurt/ice-cream name or snack keyword → `fast_food`; a "Fast Food"
 * keyword or a description that says fast-casual or quick-service →
 * `fast_food`; a "Grab & Go" keyword or a Market name → `fast_food`;
 * otherwise `restaurant`. Resulting mix across the 129 records: 36 fast_food,
 * 34 restaurant, 31 vending_machine, 16 cafe, 12 bar.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: set to 'yes' ONLY where
 * IAH's own keyword list says so — "Vegetarian Options" → vegetarian, "Vegan
 * Options" → vegan, "Gluten-free Options" and "Gluten friendly Options" (IAH
 * uses both spellings) → gluten_free. IAH publishes no halal or kosher tag on
 * any dining venue, so those fields are blank on every doc in this file
 * rather than guessed. Where outlets were merged, a flag is set if ANY merged
 * unit carries the keyword.
 *
 * DESCRIPTION: verbatim from each POI's own `description` field (present on
 * 105 of the 132 dining POIs), whitespace-normalised only — including IAH's
 * own trailing "*Breakfast served daily…" notes and, in one case, its own
 * status note ("Temporarily Closed." on the Terminal B Panda Express), which
 * is what the airport publishes and is left as-is rather than edited.
 *
 * OPENING HOURS / 24-7: `opening_hours` is the POI's own `operationHours`
 * string verbatim, in IAH's own OSM-style notation ("Mo-Su 06:00-22:00",
 * "Mo-Fr 08:00-20:30; Su 08:00-20:30; Sa 08:00-19:30"). `open_24_7` is set
 * where that string contains "00:00-24:00" OR where IAH's own keyword list
 * carries its "24/7" tag.
 *
 * PHONE: taken ONLY from the POI's own structured `phone` field (present on 97
 * of the 132 dining records), never regex-scraped from description prose.
 * IAH's own formatting inconsistencies are preserved as published — e.g.
 * "+ 1 (281) 233-7624", "+1(281) - 233-3481", "+281-233-7652",
 * "+12812337652" and "+ +1 (281) 359-9959" all appear in IAH's data exactly
 * as written here. Where outlets were merged and more than one publishes a
 * number, the first in source order is used at doc level.
 *
 * WEBSITE / LOGO: IAH's POI records carry no website field. Following this
 * dataset's KUL precedent, `website` (and the logo.dev logo derived from it)
 * is set only for globally or nationally recognisable chains and well-known
 * Houston concepts whose primary domain is confidently known, and left blank
 * for every other independent concept rather than guessed.
 *
 * VERIFIED TOTALS: 132 source dining POIs − 3 out of scope = 129 → 110
 * restaurant docs / 129 outlets. Terminal A: 32 records → 25 docs / 32
 * outlets. Terminal B: 11 → 11 / 11. Terminal C: 33 → 27 / 33. Terminal D:
 * 18 → 18 / 18. Terminal E: 35 → 29 / 35.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['iah', 'houston-intercontinental', 'houston'];
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
  blaze_pizza: restaurant({
    name: "Blaze Pizza", cuisine: "pizza, breakfast, parfait, yogurt, fruit cup, soda, beer, wine, dessert, salads, italian, sausage, chicken, ham, chorizo, bacon, fast food, 24/7, Kid-friendly Menu, Vegetarian Options, Vegan Options, less than $10, Gluten friendly Options", amenity: "fast_food",
    description: "Fast, fired, artisanal pizza.",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "blazepizza.com", logoUrl: logo("blazepizza.com"), phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Fr 08:00-20:30; Su 08:00-20:30; Sa 08:00-19:30", true),
    ],
  }),
  cadillac_mexican_kitchen_tequila_bar: restaurant({
    name: "Cadillac Mexican Kitchen & Tequila Bar", cuisine: "restaurant, bar, beer, wine, tv, tapas, small plates, bar bites, chips & salsa, queso, chicken, chicken wings, fried chicken, quesadilla, beef, nachos, breakfast, tacos, eggs, bacon, hash browns, huevos rancheros, breakfast sandwiches, yogurt, granola, parfait, salads, fajitas, shrimp, fish tacos, steak, pork, carnitas, burger, cheeseburger, hamburger, enchiladas, pastries, mexican, Restaurants & Bars, Kid-friendly Menu, Local, $10-$20, Gluten-free Options, Vegetarian Options", amenity: "restaurant",
    description: "For over 25 years Cadillac Bar has been a hotspot for fun, festivity and. Of course authentic Mexican food.In a world of trendy restaurants Cadillac Bar has not only survived, but continues to be a local legend. A lively mixture of tradition and Mexican flair. If you are a Priority Pass holder, show your Priority Pass up front and you will have $28 to spend at Cadillac Mexican Kitchen & Tequila Bar. Priority Pass holders are responsible for any additional charges as well as gratuity on the full amount. *Breakfast is served daily, Mon-Sun: 6:00 AM-10:00 AM",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate A17", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "fried chicken, fries, chicken, french fries, parfait, yogurt, bottled water, soda, milk, fruit cup, cookies, coffee, juice, sandwiches, Fast Food, breakfast, Kid-friendly Menu, less than $10", amenity: "fast_food",
    description: "Chick-fil-A offers everything chicken including sandwiches, nuggets, wraps and breakfast items. They also have waffle fries and dessert. Chick-fil-A features a variety of tasty and healthy treats, serving them quickly.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"), phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate A17", "airside", ""),
    ],
  }),
  el_tiempo: restaurant({
    name: "El Tiempo", cuisine: "Restaurants & Bars, Kid-friendly Menu, Vegetarian Options, Local", amenity: "restaurant",
    vegetarian: true,
    website: "eltiempocantina.com", logoUrl: logo("eltiempocantina.com"), phone: "+1 (417) 353-8217",
    outlets: [
      o("Level 2", "Level 2", "airside", "Mo-Fr 06:00-20:30; Su 06:00-20:30; Sa 06:00-19:30"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "24/7", amenity: "vending_machine",
    phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate A8", "airside", "Mo-Su 00:00-24:00", true),
      o("Level 2", "Gate A27", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  first_glass_bistro: restaurant({
    name: "First Glass Bistro", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("Level 2", "Level 2", "landside", "Mo-Su 06:00-21:00"),
    ],
  }),
  freshens: restaurant({
    name: "Freshëns", cuisine: "Gluten friendly Options, Vegetarian Options, $10-$20", amenity: "restaurant",
    description: "Freshëns is a healthy \"fresh casual\" concept, which offers prepared to order food inspired by fresh ingredients, as well as our signature fresh blended smoothies. With an ongoing commitment to fresh. healthy. real., Freshens offers \"100% clean\" smoothies. This location has much to offer, vegetarian rice bowls, yogurt parfaits, acai bowls, savory and sweet crepes and so much more!",
    vegetarian: true, glutenFree: true,
    website: "freshens.com", logoUrl: logo("freshens.com"), phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Fr 05:30-20:30; Su 05:30-20:30; Sa 05:30-19:30"),
    ],
  }),
  grab_and_go: restaurant({
    name: "Grab and Go", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 2", "Level 2", "landside", ""),
    ],
  }),
  hubcap_grill_beer_yard: restaurant({
    name: "Hubcap Grill & Beer Yard", cuisine: "bar, restaurant, beer, wine, tv, burger, cheeseburger, hamburger, bacon, cheesesteak, steak & cheese, patty melt, chicken, fries, french fries, chili cheese fries, breakfast, eggs, ham, sausage, tacos, breakfast sandwiches, milkshakes, dessert, soda, juice, milk, coffee, tea, Restaurants & Bars, Hub, Local, less than $10, Kid-friendly Menu", amenity: "restaurant",
    description: "Hubcap Grill has been voted \"Houston's Best Burger\". We feature fresh ground beef patties with garden-fresh toppings and locally baked buns. Texas Monthly Magazine voted the Philly-Cheesesteak Burger the 5th best burger in the state. Handspun \"boozy\" milkshakes and a variety of local and national beers are sold in the full bar. *Breakfast is served daily, Mon-Sun: 4:00 AM-10:00 AM",
    website: "hubcapgrill.com", logoUrl: logo("hubcapgrill.com"), phone: "+1 (281) 230-3449",
    outlets: [
      o("Level 2", "Gate A25", "airside", "Mo-Su 05:00-20:00"),
    ],
  }),
  illy_coffee_kiosk: restaurant({
    name: "Illy Coffee Kiosk", cuisine: "24/7", amenity: "vending_machine",
    website: "illy.com", logoUrl: logo("illy.com"),
    outlets: [
      o("Level 2", "Level 2", "landside", "", true),
    ],
  }),
  jack_in_the_box: restaurant({
    name: "Jack in the Box", cuisine: "fast food, burger, cheeseburger, hamburger, fries, french fries, soda, chicken, breakfast, breakfast sandwiches, eggs, bacon, sausage, fried chicken, chicken nuggets, Kid-friendly Menu, less than $10", amenity: "fast_food",
    description: "Burgers. Breakfast. Tacos and more. All of Jack's favorite things in one place. *Breakfast served all day.",
    website: "jackinthebox.com", logoUrl: logo("jackinthebox.com"), phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Su 04:30-20:30"),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "Gluten-free Options, Kid-friendly Menu, Vegetarian Options, Vegan Options", amenity: "fast_food",
    description: "Boost your day with made to order delicious bowls with fresh fruit toppings, on the go freshly blended fruit and vegetable smoothies, protein rich foods and on the go snacks.",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "jamba.com", logoUrl: logo("jamba.com"), phone: "+1(281) 233-7624",
    outlets: [
      o("Level 2", "Gate A25", "airside", "Mo-Su 05:00-20:00"),
    ],
  }),
  liquid_provisions: restaurant({
    name: "Liquid Provisions", cuisine: "restaurants & bars, breakfast, small plates, bar bites, flatbreads, pepperoni, chicken, chicken wings, salads, sandwiches, grilled cheese, ham, bacon, croissant, beer, wine, bar, Kid-friendly Menu, Vegetarian Options, $10-$20", amenity: "bar",
    description: "Liquid Provisions is an \"effortlessly cool\" locale, featuring cocktails, local craft beer and wine. This alternative bar offers an authentic, quirky and independent atmosphere that provides a self-imposed refuge from the mainstream, focusing on handcrafted and distinct flavors. A small menu highlights shareable plates like the charcuterie & cheese board, or forward-thinking twists on the classics like the smoked gouda mac & cheese or roasted Brussels sprouts with bacon-butter, honeyed golden raisins and shaved Reggiano. Guests can chat with the bartender sitting on a brightly-hued Tolix metal stool, or grab a seat at one of the standard two-tops.",
    vegetarian: true,
    phone: "+1 (281) 233-7652",
    outlets: [
      o("Level 2", "Gate A17", "airside", "Mo-Sa 08:30-22:00; Su 12:00-22:00"),
    ],
  }),
  mockingbird_distillery_smokehouse: restaurant({
    name: "Mockingbird Distillery & Smokehouse", cuisine: "bar, restaurant, wine, beer, bar bites, small plates, nachos, chicken, brisket, beef, steak, quesadilla, sandwiches, sausage, pork, pulled pork, smokehouse, brownies, chips, corn bread, breakfast, eggs, oatmeal, fruit cup, fruit, greek yogurt, yogurt, granola, breakfast sandwiches, Restaurants & Bars, Kid-friendly Menu, $10-$20, Vegetarian Options, 24/7", amenity: "bar",
    description: "Tito's Handmade Vodka is produced in Austin Texas' oldest legal distillery Mockingbird Distillery. We make it in batches, use old fashioned pot stills, and taste-test every batch. Our process, similar to those used to make fine single malt scotches and high-end French cognacs, requires more skill and effort than others, but it's well worth it.",
    vegetarian: true,
    phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate A15", "airside", "Mo-Su 07:00-21:30", true),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "asian, chinese, shrimp, egg rolls, fried rice, chow mein, veggie, steak, beef, tofu, chicken, orange chicken, chicken teriyaki, spring rolls, cream cheese rangoons, bottled water, juice, soda, fast food, Kid-friendly Menu, Vegetarian Options, less than $10", amenity: "fast_food",
    description: "Panda Express is an American casual fast food restaurant inspired by the flavors of Mandarin and Sichuan cuisine. You can create your own plate or bowl with vegetables, noodles, or rice, accompanied by shrimp, chicken, or beef, depending on your preference.",
    vegetarian: true,
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"), phone: "+ 1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate A17", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  simone_biles_taste_of_gold: restaurant({
    name: "Simone Biles Taste of Gold", cuisine: "Restaurants & Bars, Kid-friendly Menu, Local", amenity: "restaurant",
    description: "Taste of Gold celebrates Simone Biles's remarkable global achievements and features vibrant, bold flavors of world-class and elevated cuisine. The chef-crafted menu features signature food and beverage items curated by restaurant industry innovator Mark Brezinski and created to wow every traveler.",
    phone: "+1 (214) 728-1444",
    outlets: [
      o("Level 2", "Gate A8", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "coffee, latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, frappuccino, smoothies, iced tea, espresso, chai, muffin, scones, cookies, oatmeal, croissant, bagel, danish, bakery, bottled water, energy drink, Breakfast, Snacks & Sweet Treats, Snack, coffee bars, less than $10, Vegetarian Options", amenity: "cafe",
    description: "Starbucks offers a variety of single-origin premium coffees as well as iced espresso beverages and Frappuccino blended beverages. In addition, lunch items are offered including fresh baked pastries, sandwiches, salads, fresh fruit, and more. The familiar comforts of the Starbucks experience are now available in the airport.",
    vegetarian: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Fr 04:30-20:30; Su 04:30-20:30; Sa 04:30-19:30"),
    ],
  }),
  subway: restaurant({
    name: "SUBWAY", cuisine: "deli, sandwiches, salads, turkey, chicken, beef, meatballs, tuna, cookies, soda, chips, breakfast sandwiches, coffee, Fast Food, breakfast, Kid-friendly Menu, Vegetarian Options, less than $10, Gluten friendly Options", amenity: "fast_food",
    description: "SUBWAY offers a variety of sandwiches and food at affordable prices. Finding healthy options for eating is simple at SUBWAY because it offers nutritious options on its Fresh Fit menu, and your sandwich is made to order. A full range of beverages are available to complement your meal.",
    vegetarian: true, glutenFree: true,
    website: "subway.com", logoUrl: logo("subway.com"), phone: "+1 (281) 233-7664",
    outlets: [
      o("Level 2", "Check-In", "landside", "Mo-Su 05:00-20:00"),
    ],
  }),
  the_breakfast_klub: restaurant({
    name: "The Breakfast Klub", cuisine: "restaurant, pork, eggs, catfish, chicken, fried chicken, chicken wings, chicken & waffles, eggs benedict, biscuit, grits, pancakes, french toast, bacon, sausage, ham, breakfast sandwiches, croissant, blt, grilled cheese, omelet, sandwiches, burger, cheeseburger, hamburger, fries, french fries, salads, beer, wine, bar, Restaurants & Bars, breakfast, Breakfast Klub, Breakfasts, The Breakfat Klub, Breakfast club, the breakfast, Kid-friendly Menu, Local, $10-$20, Vegetarian Options, Gluten friendly Options", amenity: "restaurant",
    description: "The Breakfast Klub is a kasual family style restaurant inspired by a passion to provide every kustomer with good food served in a soulful atmosphere…every time you visit. It's very important that everyone on our team shares the same level of kommitment, dedikation and enthusiasm to keep the kustomers' needs first. This is from the moment they get in line until we bid them farewell. *Breakfast served all day.",
    vegetarian: true, glutenFree: true,
    website: "thebreakfastklub.com", logoUrl: logo("thebreakfastklub.com"), phone: "+1 (281) 233-7652",
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Fr 04:30-20:30; Su 04:30-20:30; Sa 04:30-19:30"),
    ],
  }),
  the_great_american_bagel: restaurant({
    name: "The Great American Bagel", cuisine: "bacon, sausage, ham, croissant, fast food, breakfast sandwiches, eggs, catfish, grits, waffles, chicken wings, chicken & waffles, chicken, biscuit, sandwiches, turkey, tuna, salads, blt, coffee, espresso, cappuccino, macchiato, latte, tea, breakfast, Local, $10-$20, Kid-friendly Menu", amenity: "cafe",
    description: "The Great American Bagel is an award-winning bagel bakery and deli concept specializing in big, fresh bagels mixed from scratch and steam-baked on premises daily. Since 1987, we have been using only the finest ingredients, offering a delicious array of fresh menu items served in a clean and friendly neighborhood setting.",
    website: "greatamericanbagel.com", logoUrl: logo("greatamericanbagel.com"), phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate A17", "airside", "Mo-Su 04:00-21:00"),
    ],
  }),
  vending_machine_beverages: restaurant({
    name: "Vending Machine - Beverages", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated beverages on the go. When you're thirsty but in a hurry, these vending machines get the job done quickly. Offering a full range of beverages including Coke, Diet Coke, Mr. Pibb, Sprite, Powerade, Monster Energy drinks, Fuze Iced Tea and water.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Su 00:00-24:00", true),
      o("Level 2", "Gate A17", "airside", "Mo-Su 00:00-24:00", true),
      o("Level 1", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
      o("Level LL", "Subway Station", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  vending_machine_coffee: restaurant({
    name: "Vending Machine - Coffee", cuisine: "Vending", amenity: "vending_machine",
    description: "Quick automated beverages on the go. When you're thirsty but in a hurry, these vending machines get the job done quickly. Offering a full range of beverages including coffee, decaf coffee, hot chocolate and hot tea.",
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  vending_machine_snacks: restaurant({
    name: "Vending Machine - Snacks", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated snacks on the go. When you're hungry but in a hurry, these vending machines get the job done quickly. Offering a full range of snacks including chips, candy, granola bars, trail mix and cookies.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level LL", "Subway Station", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 1", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 2", "Gate A7", "airside", "Mo-Su 00:00-24:00", true),
      o("Level 2", "Gate A17", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "american, fast food, burger, cheeseburger, hamburger, fries, french fries, salads, chicken, milkshakes, soda, juice, bottled water, chicken nuggets, breakfast, breakfast sandwiches, eggs, bacon, sausage, coffee, oatmeal, biscuit, Kid-friendly Menu, less than $10", amenity: "fast_food",
    description: "Wendy's offers American-style fast food but specializes in burgers, most recently adding a pretzel bun burger to its menu. In addition, Wendy's offers fries, a value menu, kids' meals and Frostys. With a plethora of healthier items on the menu such as salads and wraps, Wendy's features a variety of tasty and healthy treats and serves them quickly. A full range of beverages are available to complement your meal. *Breakfast is served daily, Mon-Sun: 4:00 AM-10:00 AM",
    outlets: [
      o("Level 2", "Gate A17", "airside", "Mo-Su 04:00-22:00"),
    ],
  }),
  which_wich: restaurant({
    name: "Which Wich", cuisine: "sandwiches, milkshakes, cookies, breakfast, breakfast sandwiches, eggs, avocado, ham, bacon, sausage, coffee, juice, deli, turkey, roast beef, pepperoni, cheesesteak, steak & cheese, chicken, tuna, soda, milk, ice cream, dessert, chips, Kid-friendly Menu, Vegetarian Options, Vegan Options, $10-$20, Gluten friendly Options", amenity: "fast_food",
    description: "Which Wich offers a variety of customizable \"wiches,\" from the signature Wicked® sandwich, loaded with five meats (turkey, ham, roast beef, pepperoni, and bacon) and choice of three cheeses, to unique items such as Thank You Turkey®, with stuffing and cranberry sauce. The Which Wich menu also includes plenty of vegetarian options, such as tomato & avocado and black bean patty, as well as healthy wiches and bowls for less than 400 calories each. In addition to customized wiches, customers can enjoy hand-dipped shakes, ice-cream sandwiches, and just-out-of-the-oven cookies. *Breakfast is served daily, Mon-Sun: 5:00 AM-10:00 AM",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "whichwich.com", logoUrl: logo("whichwich.com"), phone: "+1 (281) 233-7678",
    outlets: [
      o("Level 2", "Gate A7", "airside", "Mo-Fr 05:30-20:30; Su 05:30-20:30; Sa 05:30-19:30"),
    ],
  }),
};

// ─── Terminal B ───

const terminalBVenues = {
  bullritos: restaurant({
    name: "Bullritos", cuisine: "burrito, mexican, cookies, beer, margaritas, juice, soda, bottled water, chips & salsa, queso, guacamole, chile con queso, tex-mex, fajitas, tamales, quesadilla, tacos, pork, pulled pork, chicken, beef, steak, veggie, fast food, nachos, breakfast, Kid-friendly Menu, Vegetarian Options, Gluten-free Options, Local, less than $10", amenity: "fast_food",
    description: "Bullritos offers made-to-order burritos, burrito bowls, tacos and home-made guacamole, in addition to some classic Tex-Mex plates like quesadillas. Offering a full range of beverages including margaritas, Bullritos uses high quality ingredients and serves your food quickly.",
    vegetarian: true, glutenFree: true,
    website: "bullritos.com", logoUrl: logo("bullritos.com"), phone: "+1 (281) 359-9959",
    outlets: [
      o("Level 2", "Gate B1", "airside", "Mo-Su 06:00-20:00"),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "asian, chinese, shrimp, egg rolls, fried rice, chow mein, veggie, steak, beef, tofu, chicken, orange chicken, chicken teriyaki, spring rolls, cream cheese rangoons, bottled water, juice, soda, fast food, Kid-friendly Menu, Vegetarian Options, less than $10", amenity: "fast_food",
    description: "Temporarily Closed.",
    vegetarian: true,
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"), phone: "+1 (281) 230-3188",
    outlets: [
      o("Level 2", "Gate B1", "airside", "Mo-Su 08:00-20:00"),
    ],
  }),
  q_bar: restaurant({
    name: "Q Bar", cuisine: "bottled water, juice, salads, fruit cup, parfait, yogurt, tortas, sandwiches, pork, chicken, tuna, tostadas, fish, ceviche, veggie, avocado, jicama, small plates, queso, chips & salsa, mexican, guacamole, chicken chile relleno, quesadilla, bar, tacos, breakfast tacos, bacon, eggs, chorizo, Restaurants & Bars, cocktails, tex-mex, breakfast, Vegetarian Options, $10-$20", amenity: "restaurant",
    description: "Q Bar's menu includes true Texas barbeque staples such as brisket, ribs, and sausage all smoked on-premise by the restaurant's dedicated pitmaster.",
    vegetarian: true,
    phone: "+1(281) - 233-3481",
    outlets: [
      o("Level 2", "Gate B11", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Coffee", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1(281) - 233-3481",
    outlets: [
      o("Level 2", "Gate B20", "airside", "Mo-Su 04:30-21:00"),
    ],
  }),
  sugarland_beer_garden: restaurant({
    name: "Sugarland Beer Garden", cuisine: "bar, beer, wine, cocktails, soda, bottled water, charcuterie plate, turkey, artisanal cheeses, capicola, salami, prosciutto, sandwiches, deli, salads, breakfast, bagel, breakfast sandwiches, eggs, Restaurants & Bars, barcuterie, Vegetarian Options, Gluten-free Options, $10-$20", amenity: "bar",
    description: "A traditional beer garden that offers travelers an assortment of bottled and tap beers along with traditional Bavarian bites, including fresh salads, handmade pretzels, and an assortment of sausages and brats.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate B21", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  tagliare: restaurant({
    name: "Tagliare", cuisine: "pizza, Fast Food", amenity: "fast_food",
    description: "Pizza is served piping hot at Tagliare. Tagliare--meaning to cut or slice in Italian--is a lively eatery that offers classic pizza by the slice or by the pie. Using fresh, locally sourced ingredients, house-made tomato sauce, and our own dough recipe, Tagliare bakes pizzas throughout the day in piping-hot pizza ovens.",
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"),
    outlets: [
      o("Level 2", "Gate B1", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  the_line_sports_grill: restaurant({
    name: "The Line Sports Grill", cuisine: "restaurant, bar, seafood, oysters, crab cake, shrimp, rice balls, soup, salads, lettuce wraps, gumbo, sausage, chicken, redfish, snapper, salmon, fish, cookies, ice cream, raw bar, po'boy, sandwiches, ham, burger, hamburger, cheeseburger, breakfast, omelet, eggs, egg whites, croissant, breakfast sandwiches, yogurt, tv, beer, wine, sit-down, restaurants & bars, Gluten-free Options, more than $20, Local", amenity: "restaurant",
    description: "The Line Sports Grill is more than your average sports bar! It's a fun, elevated sports bar and grill that focuses on menu items that are recognizable, but a best-in-class version of nachos, wings, burgers, and fries, and other quintessential bar fare all made with quality, fresh ingredients. Service is warm and friendly. Casual, cool, and comfortable seating - perfect atmosphere to eat, drink, and socialize.",
    glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate B1", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  the_line_sports_grill_bar: restaurant({
    name: "The Line Sports Grill & Bar", cuisine: "Bar", amenity: "bar",
    description: "The Line Sports offers both classic sports bar grub and innovative eats. The menu has a variety of dishes that are simple, approachable, comforting, and decadent.",
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Concourse", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  vending_machine_beverages: restaurant({
    name: "Vending Machine - Beverages", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated beverages on the go. When you're thirsty but in a hurry, these vending machines get the job done quickly. Offering a full range of beverages including Coke, Diet Coke, Mr. Pibb, Sprite, Powerade, Monster Energy drinks, Fuze Iced Tea and water.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level LL", "Subway Station", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  vending_machine_snacks: restaurant({
    name: "Vending Machine - Snacks", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated snacks on the go. When you're hungry but in a hurry, these vending machines get the job done quickly. Offering a full range of snacks including chips, candy, granola bars, trail mix and cookies.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level LL", "Subway Station", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  whataburger: restaurant({
    name: "Whataburger", cuisine: "chicken, burger, fast food, hamburger, cheeseburger, fries, american, soda, milkshakes, shakes, bacon, avocado, onion rings, french fries, salads, apple pie, pie, lemon pie, cinnamon roll, cookies, juice, coffee, chicken wings, tacos, breakfast, breakfast sandwiches, sausage, eggs, Kid-friendly Menu, Local, less than $10", amenity: "fast_food",
    description: "Whataburger offers a variety of burgers and sandwiches as well as some unique breakfast items including taquitos and the honey butter chicken biscuit. Winner, Best Burger in America in 2015, Whataburger is a longtime source of Texas pride. Whataburger serves tasty food and gets it to you quickly. A full range of beverages is available to complement your meal.",
    website: "whataburger.com", logoUrl: logo("whataburger.com"), phone: "+1 (281) 233-3347",
    outlets: [
      o("Level 2", "Gate B1", "airside", "Mo-Su 04:30-21:00"),
    ],
  }),
};

// ─── Terminal C ───

const terminalCVenues = {
  agave_taqueria: restaurant({
    name: "Agave Taqueria", cuisine: "breakfast, breakfast sandwiches, breakfast burrito, huevos rancheros, soup, salads, tacos, Local, Vegetarian Options, Gluten-free Options, Kid-friendly Menu, $10-$20", amenity: "fast_food",
    description: "Inspired, fast-casual Tex-Mex bites built for the on-the-go guest. *Breakfast served daily, 6:00 AM-10:00 AM",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C33", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  alchemy_cocktail_lounge: restaurant({
    name: "Alchemy Cocktail Lounge", cuisine: "Bar", amenity: "bar",
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Level 2", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  bam_bam: restaurant({
    name: "Bam Bam", cuisine: "restaurant, bar, tv, beer, wine, oysters, nachos, clams, fries, french fries, eggs, chicken, chicken wings, fried chicken, snapper, vietnamese, crawfish, shrimp, crab, lobster, noodles, fried rice, pork, banh mi, avocado, sushi, salmon, fish, seafood, small plates, po'boy, Restaurants & Bars, Kid-friendly Menu, Vegetarian Options, Gluten-free Options, Local, more than $20, Grab & Go", amenity: "restaurant",
    description: "Gumbo and crawfish boils, boudin sausage and steaming pots of étouffée, the rhythmic blend of fiddle and accordion of Cajun music: all these have become part of Texas cuisine and culture through the Cajuns who came to the state from Louisiana. In Houston, the influence of a large Vietnamese population has taken delicious Cajun seafood staples and added a Vietnamese flair. Bam Bam's menu and recipes created by Chef Nguyen of Cajun Kitchen fame include grilled and raw oysters, including Cajun Kitchen's famous oyster nachos, Vietnamese-Cajun boils and Po-boys all perfectly paired with a selection of rotating local and regional beers. *Breakfast served daily, 6:00 AM-11:00 AM",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C5", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  el_premio_tex_mex_bar_grill: restaurant({
    name: "El Premio Tex-Mex Bar & Grill", cuisine: "queso, chili, fajitas, chicken, beer, $10-$20, Local, Kid-friendly Menu", amenity: "restaurant",
    description: "El Premio offers true Houston Tex-Mex, and features staples like Classic Queso with green chili and housemade chips and fresh chicken or skirt steak fajitas served with fresh tortillas from Houston Tex-Mex institution El Tiempo.",
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C34", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  ember: restaurant({
    name: "Ember", cuisine: "cheeseburger, hamburger, beef, fries, french fries, fried chicken, salads, snapper, restaurant, bar, pork belly, chicken, chicken wings, oysters, shrimp cocktail, cheese plate, ribs, hummus, small plates, bar bites, brussel sprouts, soup, steak, pork, fish, tuna, ahi tuna, sandwiches, chicken shawarma, blt, catfish, po'boy, hot dog, pastrami, reuben sandwich, onion rings, mac & cheese, dessert, chicken tenders, seafood, Restaurants & Bars, burger, Kid-friendly Menu, Vegetarian Options, Gluten-free Options, Local, more than $20", amenity: "restaurant",
    description: "At Ember, a Texas-inspired tavern, find a menu representative of the rich flavors of Houston from one of the area's most celebrated butchers and chefs, Chef Chris Shepherd, recipient of the James Beard 'Best Chef: Southwest' award and recognized as Food & Wine's 'Best Chef in America' and owner of Houston-favorite Underbelly. Building on a love of all things Houston, Ember emphasizes seasonal produce, seafood from the Gulf, and locally-sourced meats including hand-cut steaks and Texas-sized burgers.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C12", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  forno_magico_neapolitan_pizza: restaurant({
    name: "Forno Magico Neapolitan Pizza", cuisine: "pizza, salads, small plates, $10-$20, Kid-friendly Menu", amenity: "restaurant",
    description: "Forno Magico offers guests a section of Neapolitan style pizzas, salads and small plates. Pizzas include classics like Margherita, Pesto and Prosciutto & Arugula; salads feature a classic Caesar and Antipasti Chopped; small plates include Cauliflower Cacio e Pepe and Burrata & Roasted Peppers served with pizza bread.",
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C34", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  freshens: restaurant({
    name: "Freshëns", cuisine: "smoothies, frozen yogurt, Vegetarian Options, Kid-friendly Menu, $10-$20", amenity: "fast_food",
    description: "Freshëns is a fresh casual restaurant committed to offering better food choices by sourcing ingredients responsibly to create prepared-to-order crepes, rice bowls, salads, 100% natural smoothies and wild acai bowls. You can customize your order with a variety of authentic, fresh, and healthy ingredients to create vegetarian, gluten-free, and vegan options.",
    vegetarian: true,
    website: "freshens.com", logoUrl: logo("freshens.com"), phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate C43", "airside", "Mo-Su 05:30-22:00"),
    ],
  }),
  garrett_popcorn: restaurant({
    name: "Garrett Popcorn", cuisine: "popcorn, Fast Food, dessert", amenity: "fast_food",
    description: "Handcrafted Chicago-style gourmet popcorn.",
    website: "garrettpopcorn.com", logoUrl: logo("garrettpopcorn.com"), phone: "+1 (281) 359-9959",
    outlets: [
      o("Level 2", "Gate C34", "landside", "Mo-Su 07:00-21:00"),
    ],
  }),
  h_burger_bar: restaurant({
    name: "H-Burger Bar", cuisine: "bar, Local, Vegetarian Options, Gluten-free Options, Kid-friendly Menu, $10-$20", amenity: "restaurant",
    description: "Chef Antonio Ware's New Orlean's culinary roots create a unique dining experience that feels close to home. Ware traces his love for fresh southern flavors and cooking to his childhood and watching his mother cook with the same local ingredients. It's those same basic ingredients, now melded with Houston flavors, which continue to inform his cuisine at H-Burger.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C35", "airside", "Mo-Su 04:30-22:00"),
    ],
  }),
  landrys_seafood: restaurant({
    name: "Landry's Seafood", cuisine: "restaurant, bar, wine, beer, tv, redfish, fish, salmon, tilapia, snapper, mahi mahi, breakfast, breakfast sandwiches, eggs, bacon, sausage, tacos, fruit, parfait, omelet, oatmeal, fish & chips, crawfish, flounder, steak, beef, chicken, pasta, oysters, seafood, crab cake, shrimp cocktail, Restaurants & Bars, gumbo, salads, Kid-friendly Menu, Vegetarian Options, Local, more than $20", amenity: "restaurant",
    description: "For decades, Landry's has been a tale of legendary Gulf Coast cuisine and true hospitality. In 1947 when our doors first opened from a family home in Lafayette, Louisiana to the present day we have maintained an unmatched commitment to sensational, steaks, seafood, and pasta specialties.",
    vegetarian: true,
    phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate C42", "airside", "Mo-Su 06:00-21:30"),
    ],
  }),
  little_purse_dumpling_den: restaurant({
    name: "Little Purse Dumpling Den", cuisine: "Poppy's Bagels, Little Purse, bagel, dumplings, Vegetarian Options, Gluten-free Options, Kid-friendly Menu, $10-$20", amenity: "restaurant",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C33", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  olio_panini_bar: restaurant({
    name: "Olio Panini Bar", cuisine: "Restaurants & Bars, bar bites, small plates, brussel sprouts, fries, french fries, salami, bruschetta, charcuterie plate, cheese plate, meatballs, soup, salads, tomato soup, paninis, sandwiches, short rib, chicken, veal, tuna, italian, duck, turkey, ham, hummus, breakfast, breakfast sandwiches, eggs, bacon, sausage, smoked salmon, lox, yogurt, parfait, granola, oatmeal, fruit cup, Kid-friendly Menu, Vegetarian Options, Gluten-free Options, $10-$20, Local", amenity: "restaurant",
    description: "Olio features a selection of fresh salads and panini comprised of the best seasonal, locally-sourced produce, with a menu from Chef Monica Pope - known for revolutionizing Houston's culinary scene since debuting her first restaurant in 1992. Chef Monica Pope has enjoyed national recognition in the form of a James Beard award nomination and a spot on season two of Bravo's 'Top Chef Masters.' She is the only female Texas chef to be named 'Best New Chef' by Food & Wine magazine thanks to her inventive, 'eat where your food lives' cooking style.",
    vegetarian: true, glutenFree: true,
    website: "olioatiah.com", logoUrl: logo("olioatiah.com"), phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C14", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  pala: restaurant({
    name: "Pala", cuisine: "restaurant, bar, shrimp, charcuterie plate, cheese plate, brussel sprouts, salads, pizza, pepperoni, pork, sausage, grilled cheese, breakfast, yogurt, parfait, avocado toast, pancetta, fruit, oatmeal, eggs, bacon, smoked salmon, dessert, calzone, Restaurants & Bars, Kid-friendly Menu, Vegetarian Options, Gluten-free Options, Local, $10-$20", amenity: "restaurant",
    description: "Pala brings local, seasonal and Neapolitan style pizza to terminal C-North courtesy of widely-celebrated Chef Ryan Pera. The master behind area favorite Coltivare Pizza & Garden, Chef Pera has developed a menu featuring locally-sourced flavors and ingredients, reflecting his strong dedication to sustainable practices.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C5", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "restaurant, Fast Food", amenity: "restaurant",
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("Level 2", "Gate C42", "landside", "Mo-Su 06:00-21:00"),
    ],
  }),
  pick_up_stix: restaurant({
    name: "Pick Up Stix", cuisine: "lettuce wraps, chicken, egg rolls, spring rolls, edamame, wontons, asian, dumplings, salads, noodles, chinese, fried rice, chow mein, pad thai, thai, kung pao chicken, beef, beef & broccoli, salmon, tofu, shrimp, fast food, Kid-friendly Menu, Vegetarian Options, Gluten-free Options, $10-$20", amenity: "fast_food",
    description: "Pick Up Stix is a Laguna Hills, California based \"fast-casual\" restaurant chain that serves fresh Asian cuisine.",
    vegetarian: true, glutenFree: true,
    website: "pickupstix.com", logoUrl: logo("pickupstix.com"), phone: "+1 (281) 359-9959",
    outlets: [
      o("Level 2", "Gate C12", "airside", "Mo-Su 08:00-21:00"),
    ],
  }),
  pinks_pizza: restaurant({
    name: "Pink's Pizza", cuisine: "pizza, soda, bottled water, beer, salads, fast food, pinks, Kid-friendly Menu, Vegetarian Options, Local, $10-$20", amenity: "fast_food",
    description: "Pink's Pizza is a local Houston favorite, featuring all manner of pizzas by the slice, craft beers and a full bar. The Mediterranean pizza is a favorite and of course there is always cheese pizza for the kiddos.",
    vegetarian: true,
    phone: "+1 (832) 290-2313",
    outlets: [
      o("Level 2", "Gate C42", "airside", "Mo-Su 07:00-20:00"),
    ],
  }),
  potbelly_sandwich_shop: restaurant({
    name: "Potbelly Sandwich Shop", cuisine: "deli, sandwiches, Fast Food, turkey, ham, chicken, tuna, roast beef, meatballs, bacon, avocado, salads, soup, chili, chips, breakfast, breakfast sandwiches, eggs, sausage, oatmeal, bagel, fruit, coffee, bottled water, soda, juice, milk, milkshakes, smoothies, dessert, cookies, ice cream, Kid-friendly Menu, Vegetarian Options, less than $10", amenity: "fast_food",
    description: "Potbelly Sandwich Shop is a restaurant chain that sells submarine sandwiches and other food items. Enjoy good vibes and great sandwiches at Potbelly Sandwich Shop today!",
    vegetarian: true,
    website: "potbelly.com", logoUrl: logo("potbelly.com"), phone: "+1 (281) 359-9959",
    outlets: [
      o("Level 2", "Gate C12", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  q_bar_texas_bbq: restaurant({
    name: "Q-Bar Texas BBQ", cuisine: "Bar", amenity: "bar",
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C1", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  southern_belle: restaurant({
    name: "Southern Belle", cuisine: "fried chicken, breakfast, breakfast sandwiches, breakfast burrito, waffles, fruit, guacamole, chicken wings, buffalo wings, biscuit, salads, sandwiches, french fries, fries, onion rings, hush puppies, $10-$20", amenity: "restaurant",
    description: "Choose from a variety of fried chicken dishes to enjoy. Southern Belle also serves a mouthwatering breakfast.",
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C44", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "coffee, latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, frappuccino, smoothies, iced tea, espresso, chai, muffin, scones, cookies, oatmeal, croissant, bagel, danish, bakery, bottled water, energy drink, Breakfast, Snacks & Sweet Treats, Snack, coffee bars, less than $10, Vegetarian Options", amenity: "cafe",
    description: "Starbucks offers a variety of single-origin premium coffees as well as iced espresso beverages and Frappuccino blended beverages. In addition, lunch items are offered including fresh baked pastries, sandwiches, salads, fresh fruit, and more. The familiar comforts of the Starbucks experience are now available in the airport.",
    vegetarian: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate C33", "airside", "Mo-Su 04:30-20:30"),
      o("Level 2", "Gate C10", "airside", "Mo-Su 05:00-21:00"),
      o("Level 2", "Gate C42", "landside", "Mo-Su 05:00-21:00"),
    ],
  }),
  steak_n_shake: restaurant({
    name: "Steak 'n Shake", cuisine: "$10-$20, Fast Food, Local", amenity: "fast_food",
    description: "Steak 'n Shake is a classic American brand chain known for steakburgers & milkshakes.",
    phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate C42", "airside", "Mo-Su 05:30-22:00"),
    ],
  }),
  vending_machine_beverages: restaurant({
    name: "Vending Machine - Beverages", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated beverages on the go. When you're thirsty but in a hurry, these vending machines get the job done quickly. Offering a full range of beverages including Coke, Diet Coke, Mr. Pibb, Sprite, Powerade, Monster Energy drinks, Fuze Iced Tea and water.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 1", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
      o("Level LL", "Subway Station", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 1", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  vending_machine_snacks: restaurant({
    name: "Vending Machine - Snacks", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated snacks on the go. When you're hungry but in a hurry, these vending machines get the job done quickly. Offering a full range of snacks including chips, candy, granola bars, trail mix and cookies.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level LL", "Subway Station", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 1", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
      o("Level 1", "Baggage Claim", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  vida_taqueria: restaurant({
    name: "Vida Taqueria", cuisine: "restaurant, bar, queso, guacamole, taquitos, shrimp, salads, steak, chicken, soup, chorizo, breakfast, tacos, egg whites, eggs, pork, pulled pork, huevos rancheros, torta, sandwiches, chilaquiles, breakfast sandwiches, breakfast burrito, yogurt, parfait, bacon, nachos, quesadilla, duck, tuna, ahi tuna, lengua, burrito, tex-mex, enchiladas, ceviche, Restaurants & Bars, Local, Kid-friendly Menu, Vegetarian Options, Gluten-free Options, $10-$20", amenity: "restaurant",
    description: "Authentic Tex-Mex cuisine is brought to the airport in conjunction with famed Houston chef Roland Laurenzo. The Laurenzo family is a dynasty in Houston: Mama Ninfa (Roland's mother) is credited with introducing fajitas to the United States via Houston in the 1970's. Roland carries on his mother's tradition of spicy, savory cuisine and Vida Taqueria boasts a broad selection of favorites including the family's signature selection of tacos, fresh seafood, enchiladas and guacamoles. Locally sourced products build a genuine flavor profile that will resonate with travelers.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate C6", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "american, fast food, burger, cheeseburger, hamburger, fries, french fries, salads, chicken, milkshakes, soda, juice, bottled water, chicken nuggets, breakfast, breakfast sandwiches, eggs, bacon, sausage, coffee, oatmeal, biscuit, Kid-friendly Menu, less than $10", amenity: "fast_food",
    description: "Wendy's offers American-style fast food but specializes in burgers, most recently adding a pretzel bun burger to its menu. In addition, Wendy's offers fries, a value menu, kids' meals and Frostys. With a plethora of healthier items on the menu such as salads and wraps, Wendy's features a variety of tasty and healthy treats and serves them quickly. A full range of beverages are available to complement your meal.",
    phone: "+1 (281) 359-9959",
    outlets: [
      o("Level 2", "Gate C12", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  wetzels_pretzels: restaurant({
    name: "Wetzel's Pretzels", cuisine: "#food, #airportfood, #saltysnack, #quickbite", amenity: "fast_food",
    description: "Premium pretzels, crafted from fresh dough and baked in-store. Wetzel's Pretzels is located in Terminal C-South, in between Little Purse Dumpling Den and CIBO Express Gourmet Market.",
    phone: "+ +1 (281) 359-9959",
    outlets: [
      o("Level 2", "Gate C33", "airside", "Mo-Su 07:00-20:00"),
    ],
  }),
  which_wich: restaurant({
    name: "Which Wich", cuisine: "sandwiches, milkshakes, cookies, breakfast, breakfast sandwiches, eggs, avocado, ham, bacon, sausage, coffee, juice, deli, turkey, roast beef, pepperoni, cheesesteak, steak & cheese, tuna, soda, milk, Kid-friendly Menu, Gluten-free Options, Vegetarian Options, Vegan Options, $10-$20, Fast Food", amenity: "fast_food",
    description: "Which Wich is a casual fast-food restaurant featuring customizable sandwiches, from the signature Wicked® sandwich to vegetarian options such as the Black Bean Avocado sandwich. The menu includes a wide variety of choices, as Which Which continues to develop new options so customers can come back and try something new on every visit.",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "whichwich.com", logoUrl: logo("whichwich.com"), phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate C42", "airside", "Mo-Su 05:30-22:00"),
    ],
  }),
};

// ─── Terminal D ───

const terminalDVenues = {
  bayou_city_bar: restaurant({
    name: "Bayou City Bar", cuisine: "bar, restaurant, beer, wine, tv, bar bites, small plates, ahi tuna, tuna, cheese plate, salads, chicken, bacon, salami, steak, beef, sandwiches, turkey, ham, chips, prime rib, burger, cheeseburger, hamburger, soup, french onion soup, fish, Restaurants & Bars, Local, $10-$20", amenity: "bar",
    description: "Bayou City Bar is the ideal spot to enjoy a relaxed atmosphere without straying too far from your boarding gate. It offers delicious dining options that perfectly compliment a fantastic selection of cocktails. With live streaming of sports games, it's also a great place to soak in the excitement and energy of every play while you wait. Specializing in exceptional service, Bayou City Bar provides the perfect setting to unwind and recharge before continuing your journey.",
    phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate D18", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  byte_fresh_grab_and_go_meals: restaurant({
    name: "Byte: Fresh Grab and Go Meals", cuisine: "24/7", amenity: "vending_machine",
    description: "Passengers traveling through Terminal D can now grab fresh food to-go with self-checkout to give them confidence in a truly contactless experience. Want delicious, freshly prepared sandwiches, wraps and salads in a hurry? Just swipe a credit card to open the cooler door, pick from an assortment of nutrient-packed portable choices and premium beverages, close the door, and head to the gate to board a flight",
    website: "bytefoods.com", logoUrl: logo("bytefoods.com"), phone: "+1 (281) 767-6168",
    outlets: [
      o("Level 2", "Level 2", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  einstein_bagels_coffee: restaurant({
    name: "Einstein Bagels & Coffee", cuisine: "breakfast, bagel, Kid-friendly Menu, espresso, coffee", amenity: "cafe",
    description: "Einstein Bros. Bagels offers freshly baked gourmet bagels, sandwiches, and other fare with a wide variety of toppings and spreads to give you an energy boost. Enjoy the most important meal of the day anytime in Terminal D West, Gate D1.",
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"), phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate D1", "airside", "Mo-Su 05:00-21:30"),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "24/7", amenity: "vending_machine",
    phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate D16", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  hugos_cocina: restaurant({
    name: "Hugo's Cocina", cuisine: "restaurant, bar, beer, wine, tv, breakfast, tacos, sausage, huevos rancheros, steak, beef, bacon, churros, fish tacos, shrimp, carnitas, pork, torta, sandwiches, avocado, chicken, hamburger, cheeseburger, burger, chips & salsa, guacamole, tortilla soup, soup, dessert, flan, mexican, Restaurants & Bars, quesadilla, Local, more than $20, Kid-friendly Menu, 24/7", amenity: "restaurant",
    description: "\"Authentic Mexican cooking is a world class cuisine that has remained virtually unchanged by the outside world\" says Executive Chef Hugo Ortega of his native cuisine. The menu features traditional dishes from many regions of Mexico all made from scratch. Grab and go options are available 24/7.",
    phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Gate D12", "airside", "Mo-Su 12:00-20:00", true),
    ],
  }),
  illy_coffee_kiosk: restaurant({
    name: "Illy Coffee Kiosk", cuisine: "24/7, coffee", amenity: "vending_machine",
    website: "illy.com", logoUrl: logo("illy.com"),
    outlets: [
      o("Level 2", "Gate D9", "airside", "", true),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "smoothies, fruit, healthy, Vegan Options, Vegetarian Options, Kid-friendly Menu", amenity: "fast_food",
    description: "Jamba boost your day with made to order delicious bowls with fresh fruit toppings, on the go freshly blended fruit and vegetable smoothies, protein rich foods and on the go snacks.",
    vegetarian: true, vegan: true,
    website: "jamba.com", logoUrl: logo("jamba.com"), phone: "+281-233-7624",
    outlets: [
      o("Level 2", "Gate D1", "airside", "Mo-Su 06:00-21:30"),
    ],
  }),
  peets_coffee: restaurant({
    name: "Peet's Coffee", cuisine: "coffee, espresso, latte, americano, cappuccino, mocha, iced coffee, tea, bottled water, soda, juice, fruit, muffin, croissant, Breakfast, Snacks, coffee bars, snacks & sweet treats, peets, less than $10, Grab & Go, Vegetarian Options, Gluten-free Options", amenity: "cafe",
    description: "Peet's Coffee offers a variety of premium tea and coffee as well as espressos, lattes, and Javivas. In addition, Peet's offers fresh baked pastries, sandwiches, salads, and more. Peet's Coffee & Tea serves superior coffees and teas by sourcing the best quality coffee beans and tea leaves in the world.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 230-3446",
    outlets: [
      o("Level 2", "Gate D12", "airside", "Mo-Su 06:00-21:30"),
    ],
  }),
  popeyes_chicken: restaurant({
    name: "Popeye's Chicken", cuisine: "fast food, Grab & Go, $10-$20", amenity: "fast_food",
    description: "Popeye's is a quick service restaurant offering New Orleans style fried chicken that combines Creole and Cajun flavors to deliver the taste of Louisiana with mild and spicy chicken, chicken tenders, chicken sandwiches, fried shrimp, and other delicacies that can be enjoyed with a variety of sides and flavorful Dip sauces.",
    phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate D1", "airside", "Mo-Su 07:00-21:30"),
    ],
  }),
  semi_sweet_confections: restaurant({
    name: "Semi-Sweet Confections", cuisine: "candy, Candy & Specialty Food, dessert", amenity: "fast_food",
    description: "Stop by for chocolate and ice cream!",
    phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate D1", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  the_annie_restaurant: restaurant({
    name: "The Annie Restaurant", cuisine: "restaurant, Restaurants & Bars, breakfast, Local", amenity: "restaurant",
    description: "The Annie Cafe & Bar offers a fresh take on Texas-influenced American cuisine by award-winning Executive Chef Robert Del Grande.",
    website: "theanniecafe.com", logoUrl: logo("theanniecafe.com"), phone: "+281-233-7652",
    outlets: [
      o("Level 2", "Gate D1", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  the_kitchen: restaurant({
    name: "The Kitchen", cuisine: "Local, breakfast", amenity: "restaurant",
    description: "Chef-inspired cuisine by Chef Austin Simmons.",
    phone: "+12812337652",
    outlets: [
      o("Level 2", "Gate D1", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  urban_crave: restaurant({
    name: "Urban Crave", cuisine: "Bar", amenity: "bar",
    website: "urbancrave.com", logoUrl: logo("urbancrave.com"), phone: "+1(713) 542-0265",
    outlets: [
      o("Level 2", "Gate D2", "airside", "Mo-Su 06:00-21:30"),
    ],
  }),
  velvet_taco: restaurant({
    name: "Velvet Taco", cuisine: "Gluten-free Options, Vegetarian Options, $10-$20", amenity: "fast_food",
    description: "Velvet Taco is a one-of-a-kind taco concept serving premium food in a unique & funky fast-casual setting. Founded on the idea that tacos don't have to be associated with Tex-Mex cuisine and can be made with the same care and quality ingredients as fine dining, Velvet Taco is where \"anything goes meets the art of the possible.\"",
    vegetarian: true, glutenFree: true,
    website: "velvettaco.com", logoUrl: logo("velvettaco.com"),
    outlets: [
      o("Level 2", "Gate D1", "airside", "Mo-Fr 05:00-22:00; Su 05:00-22:00; Sa 05:00-21:30"),
    ],
  }),
  vending_machine_beverages: restaurant({
    name: "Vending Machine - Beverages", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated beverages on the go. When you're thirsty but in a hurry, these vending machines get the job done quickly. Offering a full range of beverages including Coke, Diet Coke, Mr. Pibb, Sprite, Powerade, Monster Energy drinks, Fuze Iced Tea and water.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 1", "Check-In", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  vending_machine_coffee: restaurant({
    name: "Vending Machine - Coffee", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 2", "Gate D9", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  vending_machine_hot_water: restaurant({
    name: "Vending Machine - Hot Water", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 2", "Gate D16", "airside", ""),
    ],
  }),
  vending_machine_snacks: restaurant({
    name: "Vending Machine - Snacks", cuisine: "Snacks & Sweet Treats, Kid-friendly Menu, Gluten-free Options, less than $10, Vegetarian Options", amenity: "vending_machine",
    description: "Quick automated snacks on the go. When you're hungry but in a hurry, these vending machines get the job done quickly. Offering a full range of snacks including chips, candy, granola bars, trail mix and cookies.",
    vegetarian: true, glutenFree: true,
    outlets: [
      o("Level 1", "Check-In", "landside", "Mo-Su 00:00-24:00", true),
    ],
  }),
};

// ─── Terminal E ───

const terminalEVenues = {
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "pretzel, breakfast sandwiches, Snacks & Sweet Treats, Snack, less than $10, Vegetarian Options, Kid-friendly Menu", amenity: "fast_food",
    description: "Auntie Anne's features made-from-scratch pretzels. From original to flavored favorites like cinnamon sugar, roasted garlic and parmesan, pepperoni, raisin and jalapeño, Auntie Anne's also offers snack-sized pretzel bites and pretzel dogs to sate your appetite. A full range of beverages is available to complement your meal.",
    vegetarian: true,
    phone: "+1 (832) 717-9555",
    outlets: [
      o("Level 2", "Gate E12", "airside", "Mo-Su 04:00-20:00"),
    ],
  }),
  beerhive: restaurant({
    name: "Beerhive", cuisine: "beer, Kid-friendly Menu, Gluten-free Options, Vegetarian Options, Local, $10-$20", amenity: "bar",
    description: "A beer-centric craft bar with a focus on bringing travelers a true taste of local Houston brews.",
    vegetarian: true, glutenFree: true,
    phone: "+1(281)-233-3481",
    outlets: [
      o("Level 2", "Gate E1", "landside", "Mo-Su 06:00-21:00"),
      o("Level 2", "Gate E24", "landside", "Mo-Su 06:00-21:00"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "fried chicken, fries, chicken, french fries, parfait, yogurt, bottled water, soda, milk, fruit cup, cookies, coffee, juice, sandwiches, Fast Food, breakfast, Kid-friendly Menu, less than $10", amenity: "fast_food",
    description: "Chick-fil-A located at Terminal E strives to serve freshly prepared food every day except Sunday. Believing in food that feels good, Chick-fil-A hand-breads the chicken for its classic sandwiches and selects fresh ingredients for its salads and fruit cups. Providing high-quality fast food has always been a priority, as is reducing food waste, without ever sacrificing delicious flavor",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"), phone: "+1 (281) 767-6180",
    outlets: [
      o("Level 2", "Security Checkpoint", "airside", "Mo-Sa 05:00-21:30"),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "Restaurants & Bars, $10-$20, Kid-friendly Menu", amenity: "restaurant",
    phone: "+1 (417) 353-8217",
    outlets: [
      o("Level 2", "Security Checkpoint", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  cibo_express_gourmet_market: restaurant({
    name: "CIBO Express Gourmet Market", cuisine: "24/7", amenity: "fast_food",
    website: "ciboexpress.com", logoUrl: logo("ciboexpress.com"), phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Level 2", "airside", "", true),
    ],
  }),
  cinnabon: restaurant({
    name: "Cinnabon", cuisine: "cinnamon roll, Snacks & Sweet Treats, Dessert, Snack, Coffee, less than $10, Kid-friendly Menu, Vegetarian Options", amenity: "cafe",
    description: "Brace yourself for the undeniable allure of Cinnabon's tasty cinnamon rolls. Cinnabon offers the world's greatest cinnamon rolls and other heavenly treats including the Caramel Pecanbon, Cinnabon Stix, Minibon and Cinnabon Bites. If you're looking for something a bit cooler, MochaLatta Chill and Chillatta frozen blended beverages should do the trick.",
    vegetarian: true,
    website: "cinnabon.com", logoUrl: logo("cinnabon.com"), phone: "+1 (281) 209-1600",
    outlets: [
      o("Level 2", "Gate E12", "airside", "Mo-Su 04:00-19:00"),
    ],
  }),
  custom_burgers: restaurant({
    name: "Custom Burgers", cuisine: "breakfast, burger, cheeseburger, hamburger, breakfast burrito, breakfast sandwiches, hot dog, $10-$20, Local, Vegetarian Options, Kid-friendly Menu", amenity: "restaurant",
    description: "Custom burger allows you to Build-Your-Own-Burger, all the way, even pick your own toppings and sauces. Choose from variety of burgers to customize. Custom Burger also serves a mouthwatering breakfast. *Breakfast served daily, 5:00am-11:00am",
    vegetarian: true,
    phone: "+1(281) 233-3481",
    outlets: [
      o("Level 2", "Gate E2", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "breakfast, breakfast sandwiches, donuts, bagel, eggs, bacon, sausage, muffin, bottled water, soda, juice, coffee, espresso, cappuccino, americano, latte, iced coffee, tea, Coffee Bars, Snacks & Sweet Treats, less than $10, Vegetarian Options, Kid-friendly Menu", amenity: "restaurant",
    description: "Dunkin' offers Dunkin' branded donuts (over 50 varieties from classic to cake to cream-filled) and other baked goods including Munchkins donut holes, muffins, English muffins, bagels, croissants, coffee rolls, biscuits, Danishes, brownies, and drip coffee, dripped iced coffee, iced teas, hot tea, hot chocolate, milk, juice, soda and bottled water.",
    vegetarian: true,
    phone: "+1 (281) 233-3293",
    outlets: [
      o("Level 2", "Gate E11", "airside", "Mo-Su 04:30-20:00"),
    ],
  }),
  einstein_bros_bagels: restaurant({
    name: "Einstein Bros. Bagels", cuisine: "breakfast, breakfast sandwiches, fruit, salads, juice, bottled water, soda, parfait, yogurt, chips, sandwiches, deli, bagel, turkey, avocado, bacon, veggie, chicken salad, tuna, ham, chicken, pizza bagel, sausage, turkey sausage, hummus, egg whites, smoothies, tea, coffee, latte, mocha, macchiato, chai latte, cappuccino, iced coffee, hot chocolate, espresso, fast food, Kid-friendly Menu, Vegetarian Options, less than $10, Fast Food", amenity: "cafe",
    description: "Fresh-baked bagels are how we roll. Our bakers get up every morning before the sun to fire up the ovens and begin the bagel baking ritual. Batches of Classic, Signature and Gourmet flavors are baked fresh throughout the day and ready for you to enjoy with your favorite double-whipped cream cheese shmear.",
    vegetarian: true,
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"), phone: "+1 (713) 542-0265",
    outlets: [
      o("Level 2", "Security Checkpoint", "airside", ""),
      o("Level 2", "Near Gate E1", "airside", "Mo-Su 04:30-20:00"),
    ],
  }),
  el_premio_tex_mex_bar_and_grill: restaurant({
    name: "El Premio Tex Mex Bar and Grill", cuisine: "Bar", amenity: "bar",
    phone: "+1(281) 233-3481",
    outlets: [
      o("Level 2", "Gate E5", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  gavi: restaurant({
    name: "Gavi", cuisine: "pizza, pasta, $10-$20, Gluten-free Options, Vegetarian Options, Local, Kid-friendly Menu", amenity: "restaurant",
    description: "Gavi offers a uniquely Houston take on Italian cuisine through a combination of local foods and traditional family recipes. House-made pizza, pasta, and antipasti are served beneath sweeping canopies and sculptural trees, evoking a patio dining experience.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate E14", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  houston_wheelhouse: restaurant({
    name: "Houston Wheelhouse", cuisine: "Bar", amenity: "bar",
    phone: "+1(281) 233-3481",
    outlets: [
      o("Level 2", "Level 2", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  livefire_burger: restaurant({
    name: "LiveFire Burger", cuisine: "Dining", amenity: "restaurant",
    phone: "+1(281) 233-3481",
    outlets: [
      o("Level 2", "Gate E10", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "asian, chinese, shrimp, egg rolls, fried rice, chow mein, veggie, steak, beef, tofu, chicken, orange chicken, chicken teriyaki, spring rolls, cream cheese rangoons, bottled water, juice, soda, fast food, Kid-friendly Menu, Vegetarian Options, less than $10, Fast Food", amenity: "fast_food",
    description: "Panda Express offers a variety of American Chinese food including such classics as orange chicken and broccoli beef. Panda Express strives to have quick service and offer fresh food.",
    vegetarian: true,
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"), phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate E1", "airside", "Mo-Su 06:00-21:00"),
      o("Level 2", "Gate E24", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  pappadeaux_seafood_kitchen: restaurant({
    name: "Pappadeaux Seafood Kitchen", cuisine: "restaurant, bar, seafood, alligator, calamari, salmon, halibut, fish, beer, wine, tv, raw bar, oysters, shrimp, shrimp cocktail, tuna, sushi, crab, lobster, mac & cheese, bruschetta, mozzarella sticks, chicken wings, buffalo wings, spinach dip, crab cake, gumbo, lobster bisque, crawfish bisque, salads, catfish, scallops, sea bass, tilapia, dessert, pie, ice cream, cheesecake, brownies, garlic bread, french fries, fries, brussel sprouts, steak, surf & turf, filet mignon, po'boy, burger, cheeseburger, hamburger, chicken, Restaurants & Bars, sit-down, Gluten-free Options, Local, Kid-friendly Menu, Vegetarian Options, more than $20", amenity: "restaurant",
    description: "Pappadeaux Seafood Kitchen offers a wide variety of fresh seafood daily, large salads, flavorful pastas, delicious appetizers and homemade desserts. All of our bread is baked fresh daily. All of our salad dressings are made from scratch. Our bar is inspired by the bold flavors of the New Orleans French Quarter, with many handcrafted signature drinks. Pappadeaux Seafood Kitchen is a full service restaurant.",
    vegetarian: true, glutenFree: true,
    website: "pappadeaux.com", logoUrl: logo("pappadeaux.com"), phone: "+1 (281) 821-7684",
    outlets: [
      o("Level 2", "Gate E3", "airside", "Mo-Su 11:00-20:00"),
    ],
  }),
  pappasitos_cantina: restaurant({
    name: "Pappasito's Cantina", cuisine: "parfait, yogurt, fruit cup, fruit, beer, soda, juice, bottled water, margaritas, breakfast, breakfast tacos, mexican, tex-mex, sausage, bacon, pork, breakfast burrito, coffee, milkshakes, tortilla soup, soup, burrito, tacos, chips & salsa, queso, guacamole, tamales, quesadilla, nachos, fish tacos, fish, enchiladas, salads, cookies, muffin, steak, beef, chicken, Local, $10-$20, Vegetarian Options, Kid-friendly Menu, Gluten-free Options", amenity: "restaurant",
    description: "Offering quesadillas, nachos, enchiladas, fajitas, breakfast, and specialty items, Pappasito's Cantina offers a variety of Tex-Mex dishes with plenty of options for beverages including beer and margaritas. \"Solid fajitas and really good margaritas\" are the calling cards of this Houston-born Tex-Mex chain cantina \"staple\" set in expansive digs.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 821-2266",
    outlets: [
      o("Level 2", "Gate E1", "airside", "Mo-Su 07:00-20:00"),
    ],
  }),
  q: restaurant({
    name: "Q", cuisine: "Local, Vegetarian Options, Kid-friendly Menu", amenity: "restaurant",
    description: "Developed by Chef Greg Gatlin, Q's menu includes Texas barbeque staples such as brisket, ribs, and Texas sausage. A glass-enclosed smoke room and on-site pitmaster carving the Q serve as unique elements highlighting the culture of classic Texas BBQ.",
    vegetarian: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate E2", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  schlotzskys_deli: restaurant({
    name: "Schlotzsky's Deli", cuisine: "deli, sandwiches, ham, turkey, blt, veggie, salads, coffee, tea, quiche, paninis, tuna, roast beef, tuna melt, corned beef, reuben sandwich, fruit, chips, bottled water, fruit cup, soda, juice, parfait, yogurt, Fast Food, healthy, Vegetarian Options, $10-$20", amenity: "fast_food",
    description: "Schlotzsky's specializes in serving comfort food for those who want to indulge while still being mindful of what they eat, as all menu items are prepared with fresh ingredients. As a sign of commitment to providing high-quality products, it offers freshly baked bread, delicious pizzas with a wide variety of toppings and sandwiches, all prepared to order.",
    vegetarian: true,
    phone: "+1 (281) 233-7624",
    outlets: [
      o("Level 2", "Gate E23", "airside", "Mo-Su 05:30-21:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "coffee, latte, macchiato, cappuccino, iced coffee, tea, coffee mug, travel mug, coffee beans, frappuccino, smoothies, iced tea, espresso, chai, muffin, scones, cookies, oatmeal, croissant, bagel, danish, bakery, bottled water, energy drink, Breakfast, Snacks & Sweet Treats, Snack, coffee bars, less than $10, Vegetarian Options, Gluten-free Options, breakfast", amenity: "cafe",
    description: "Starbucks offers a variety of single-origin premium coffees as well as iced espresso beverages and Frappuccino blended beverages. In addition, lunch items are offered including fresh baked pastries, sandwiches, salads, fresh fruit, and more. The familiar comforts of the Starbucks experience are now available in the airport.",
    vegetarian: true, glutenFree: true,
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1 (281) 233-3318",
    outlets: [
      o("Level 2", "Gate E24", "airside", "Mo-Su 05:00-21:00"),
      o("Level 1", "International Arrivals", "landside", "Mo-Su 06:00-21:00"),
    ],
  }),
  starbucks_pick_up: restaurant({
    name: "Starbucks Pick Up", cuisine: "Coffee", amenity: "cafe",
    description: "Starbucks Pick Up exclusively takes mobile orders through Starbucks' app. Customers can either enable location services or manually select IAH Terminal E to start the process. When the order status updates to \"ready,\" guests can swing by to grab their items without waiting in line.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1(281) 233-3481",
    outlets: [
      o("Level 2", "Gate E18", "landside", "Mo-Su 05:00-20:00"),
      o("Level 2", "Gate E5", "landside", "Mo-Su 05:00-20:00"),
      o("Level 2", "Gate E1", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  tagliare: restaurant({
    name: "Tagliare", cuisine: "pepperoni, soda, breakfast, bagel, stromboli, breakfast sandwiches, bacon, ham, sausage, pizza, italian, Fast Food, Kid-friendly Menu, Vegetarian Options, less than $10", amenity: "fast_food",
    description: "Pizza is served piping hot at Tagliare. Tagliare--meaning to cut or slice in Italian--is a lively eatery that offers classic pizza by the slice or by the pie. Using fresh, locally sourced ingredients, house-made tomato sauce, and our own dough recipe, Tagliare bakes pizzas throughout the day in piping-hot pizza ovens. Guests may choose between a traditional thin slice and a quadrato, which is Sicilian or thicker style, square pizza. Fresh ingredients and Italian tradition make this pizza a favorite option for guests looking for a quick and satisfying meal.",
    vegetarian: true,
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"), phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate E1", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  tanglewood_grille: restaurant({
    name: "Tanglewood Grille", cuisine: "restaurant, bar, restaurants & bars, beer, wine, tv, breakfast, breakfast sandwiches, eggs, bacon, chicken, fried chicken, biscuit, salmon, smoked salmon, omelet, ham, grits, frittata, scotch egg, breakfast burrito, granola, parfait, yogurt, bar bites, small plates, flatbreads, baba ganoush, hummus, pretzel, chicken wings, onion rings, crawfish, gumbo, sausage, salads, steak, beef, shrimp, pork, ribs, trout, fish, seafood, fish & chips, burger, cheeseburger, hamburger, fries, french fries, sandwiches, falafel, dessert, cake, cheesecake, pie, Kid-friendly Menu, Local, Gluten-free Options, Vegetarian Options", amenity: "restaurant",
    description: "Showcasing local ingredients and the carving excellence of its chefs, Tanglewood Grille draws inspiration from the city of Houston itself. Diners can enjoy awe-inspiring dishes, including hand cut steaks, build-your-own burgers, fresh seafood and farm-to-table greens. Tanglewood Grille also offers classic cocktails and a variety of craft beers.",
    vegetarian: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate E23", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  the_market_by_villa: restaurant({
    name: "The Market by Villa", cuisine: "mac & cheese, chicken, fruit, veggie, salads, soup, orange chicken, chips, healthy, sandwiches, turkey, avocado, deli, tuna, thai chicken, milk, Fast Food, less than $10, Vegetarian Options, Gluten-free Options", amenity: "fast_food",
    description: "The Market by Villa satisfies travelers seeking healthy alternatives by offering a variety of freshly prepared salads, wraps, sandwiches and fresh fruit.",
    vegetarian: true, glutenFree: true,
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"), phone: "+1 (281) 233-7460",
    outlets: [
      o("Level 2", "Gate E1", "airside", "Mo-Su 04:30-22:00"),
    ],
  }),
  vending_machine: restaurant({
    name: "Vending Machine", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 1", "Level 1", "landside", ""),
    ],
  }),
  vending_machine_beverages: restaurant({
    name: "Vending Machine - Beverages", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 1", "International Arrivals", "landside", ""),
    ],
  }),
  vending_machine_snacks: restaurant({
    name: "Vending Machine - Snacks", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Level 1", "International Arrivals", "landside", ""),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "american, fast food, burger, cheeseburger, hamburger, fries, french fries, salads, chicken, milkshakes, soda, juice, bottled water, chicken nuggets, breakfast, breakfast sandwiches, eggs, bacon, sausage, coffee, oatmeal, biscuit, Kid-friendly Menu, less than $10", amenity: "fast_food",
    description: "American-style fast food. Wendy's offers burgers, fries, a value menu, kids' meals and Frosty's. With a plethora of healthier items on the menu such as salads and wraps,",
    phone: "+1 (281) 359-9959",
    outlets: [
      o("Level 2", "Gate E24", "airside", "Mo-Su 04:30-21:00"),
    ],
  }),
  yogen_fruz: restaurant({
    name: "Yogen Früz", cuisine: "dessert, smoothies, fruit, frozen yogurt, healthy, yogurt, Snacks & Sweet Treats, less than $10, Vegetarian Options, Kid-friendly Menu", amenity: "fast_food",
    description: "Yogen Früz offers fresh and delicious frozen yogurt, froyo smoothie, and other frozen healthy alternatives. Yogen Früz is committed to bringing you healthy and alternative frozen desserts with an uncompromising commitment to quality and taste. Flavors include unique choices such as lychee, cookies n cream, and cherry.",
    vegetarian: true,
    website: "yogenfruz.com", logoUrl: logo("yogenfruz.com"), phone: "+1 (281) 209-0944",
    outlets: [
      o("Level 2", "Gate E1", "airside", "Mo-Su 04:30-20:00"),
    ],
  }),
  yume: restaurant({
    name: "Yume", cuisine: "asian, sushi, ramen, beer, Kid-friendly Menu, Gluten-free Options, Vegetarian Options, Local, Vegan Options, $10-$20", amenity: "restaurant",
    description: "Under a canopy of lanterns rising toward the sky, \"Yume\" evokes the vibrant energy of Asian night markets and the dreamlike glow of lantern release ceremonies. Featuring a sushi exhibition kitchen and ramen bar, this Asian Biergarten focuses on local- and Japanese-sourced ingredients paired with rotating selections of international beers and imported sake. Walnut slats begin as a wall treatment and then fold outward to form canopies over the kitchen and bar with accents of blue and red. At Yume's Asian bakery, bold and bright graphics and a wall of maneki-neko \"lucky cats\" playfully contrast with the wood detailing that unifies the venue.",
    vegetarian: true, vegan: true, glutenFree: true,
    phone: "+1 (281) 233-3481",
    outlets: [
      o("Level 2", "Gate E11", "landside", "Mo-Su 06:00-21:00"),
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
  const r4 = await processTerminal(AIRPORT, TERMINAL_D, 'Terminal D', terminalDVenues);
  const r5 = await processTerminal(AIRPORT, TERMINAL_E, 'Terminal E', terminalEVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_A, TERMINAL_B, TERMINAL_C, TERMINAL_D, TERMINAL_E]));

  const totalCreated = r1.created + r2.created + r3.created + r4.created + r5.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r4.deleted + r5.deleted;
  const totalVenues = Object.keys(terminalAVenues).length
    + Object.keys(terminalBVenues).length
    + Object.keys(terminalCVenues).length
    + Object.keys(terminalDVenues).length
    + Object.keys(terminalEVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
