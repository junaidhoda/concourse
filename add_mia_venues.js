'use strict';
/**
 * Fills in complete data for Miami International Airport (MIA) —
 * restaurants/cafés/vending in Firestore. Researched 2026-08-18 from the
 * airport's own concessions directory, using Claude in Chrome browser
 * automation per explicit user instruction. No third-party/aggregator source
 * was used for any venue field.
 *
 * SOURCE: https://www.shopmiamiairport.com/directory — "Shops at MIA", the
 * dining and retail directory the airport's own site links to as its Shop &
 * Dine destination (miami-airport.com carries no dining list of its own; its
 * Shop & Dine nav item points here). The directory is a React SPA; its venue
 * data is not exposed through any JSON endpoint the page calls, and its list
 * only extends on trusted scroll events — programmatic scrolling, key events
 * and fiber inspection all failed to advance it. It was therefore driven with
 * real scroll input over the airport's own "Dine" category filter, with an
 * in-page MutationObserver harvesting cards as they rendered. The filter
 * reported "Showing 69 results" and all 69 article elements were present in
 * the DOM at the end of the pass, which is what was read — not the harvester's
 * de-duplicated view, since several MIA venues publish byte-identical cards.
 *
 * EXTRACTION + VERIFICATION: the 69 records were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter) with every non-ASCII character
 * replaced by a reversible `<U+hex>` escape and every field whitespace-
 * normalised in the browser before checksumming, split into 3 chunks under
 * 6,600 chars on line boundaries, written into a `<pre id="dataDump">` and
 * retrieved via get_page_text. Every chunk verified EXACTLY on first pass
 * against values computed in the browser before retrieval — len/lines/checksum:
 * 6483/29/28404685, 6409/32/27859061, 1652/8/7152521 — as did the rejoined
 * 69-line dataset at len 14546, checksum 63494167, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7. Each record carries its
 * DOM index so that MIA's genuinely duplicated cards stay distinct rows.
 *
 * TERMINAL STRUCTURE — 3 buckets, and they are exactly the three values MIA's
 * own directory files every dining venue under: North Terminal, Central
 * Terminal and South Terminal. MIA is one continuous horseshoe building, but
 * it is operated as three terminals, each with its own ticketing/check-in
 * frontage and its own security checkpoints — North serves Concourse D,
 * Central serves E, F and G, South serves H and J — so each passes this
 * dataset's "own check-in AND own security" test. Applying the test WITHIN a
 * terminal produces no further split: the concourses inside each are fed by
 * that terminal's own checkpoints and MIA's directory does not offer them as
 * filter values. NOTE ON THE FOURTH FILTER VALUE: MIA's terminal filter also
 * lists "Terminal D" alongside the three, but NOT ONE of the 69 dining records
 * is filed under it — every card reads North, Central or South — so it is not
 * a bucket here. Concourse D is inside the North Terminal, which is how the
 * dining records themselves are labelled.
 *
 * SCOPE — 1 of the 69 records EXCLUDED: a third "Maestro Della Pizza" that MIA
 * publishes with no terminal at all. Rather than guess which of the three it
 * belongs to it is left out of scope. That leaves 68 records.
 *
 * AIRSIDE / LANDSIDE: taken from MIA's own "Pre-Security" badge, which is the
 * same flag behind its own "Show Pre-Security only?" filter — badge present →
 * `landside`, absent → `airside`. 17 of the 69 carry it. Two venues make the
 * mapping explicit in their own names: "Gilbert's Food Bar (Post-Security)"
 * and "Gilbert's Food Bar (Pre-Security)", and the badge agrees with both.
 *
 * LEVEL: BLANK on every outlet. MIA's directory publishes no floor or level.
 *
 * LOCATION_NOTES: BLANK on every outlet. The directory card publishes only the
 * terminal — no gate, concourse or landmark. (A handful of descriptions name a
 * gate in prose, e.g. Chick-Fil-A's "at the Jackson Corners location in
 * Concourse E (post security) across Gate E2"; that was left inside the
 * description as MIA publishes it rather than promoted to a structured field.)
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal are merged
 * into one doc with one `outlets[]` entry per unit; same-brand venues in
 * DIFFERENT terminals stay separate docs, per this dataset's standing rule. So
 * Café Versailles is two docs — North (3 units) and Central (2) — and Starbucks
 * is two, North (4) and South (2). Brand matching is case- and
 * apostrophe-insensitive, which is what folds MIA's own inconsistent rendering
 * ("FARM2AIR MARKET" ≡ "Farm2Air Market" in the Central Terminal; "Misha's
 * Cupcakes" ≡ "Misha’s Cupcakes" with a curly apostrophe). Distinctly NAMED
 * venues are kept separate per this dataset's page-truth-over-label precedent:
 * "Pizza Hut" vs "Pizza Hut Express"; "Subway" vs "Subway (Open 24 Hours)";
 * "Dunkin'" vs "Dunkin' (Open 24 Hours)"; "Villa Pizza" vs "Villa Italian
 * Kitchen"; "Sergio's Cuban" vs "Sergio's GO"; "La Carreta" vs "Café La
 * Carreta"; and Gilbert's two separately-named security-zone units. 68 records
 * → 53 docs.
 *
 * CUISINE: "Dine" on every doc — verbatim the airport's own category name for
 * the filter used to select these 69 venues. MIA's directory does publish
 * finer facets (its sidebar offers American, Bakery / Desserts, Breakfast,
 * Burgers, Coffee & Tea, Fast Food, Fine Dining, Grab Snacks, Pizza, Salads,
 * Sandwiches, Seafood, Soups, Vegetarian / Vegan and others), but those are
 * filter facets only — they are NOT printed on the venue card, and attributing
 * them per venue would mean re-running the full scroll-driven pass once per
 * facet. They are therefore not claimed here rather than being guessed, and
 * `cuisine` carries only the category the airport itself put these venues in.
 * This is the same call made for LAS, whose directory likewise publishes only
 * its top-level "Dining" category.
 *
 * AMENITY: derived from the venue's own name and its own description, since
 * MIA prints no service-style tag on the card. The order is: a "Vending
 * Machine" name or a description that opens "Vending machine…" →
 * `vending_machine` (both Carlo's Bake Shop Express units); a coffee / café /
 * bagel / bakery / bake-shop / cupcakes / Illy / Peet's / La Colombe / Guava &
 * Java / Au Bon Pain name → `cafe`; a name carrying Bar / Lounge / Pub /
 * Mojito / Tavern / Brewery / Cantina and NOT also a food format (Grill,
 * Kitchen, Bistro, Pizza, Diner, Restaurant, Deli, Food Bar, Soul Food, Wok,
 * Sushi, Empanadas) → `bar`; a quick-service brand name or a Market / Express /
 * GO name → `fast_food`; a description that says fast food or grab-and-go →
 * `fast_food`; otherwise `restaurant`. Note that the "Food Bar" exclusion is
 * what correctly keeps Gilbert's Food Bar a restaurant rather than a bar.
 * Resulting mix across the 68 in-scope records: 29 cafe, 23 fast_food,
 * 14 restaurant, 2 vending_machine. No `bar` — MIA's dining directory has one
 * obvious bar concept (Bacardi Mojito Bar) but it is filed under the airport's
 * Shops categories, not its Dine category, so it is not in this set.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: blank on every doc. MIA
 * publishes a "Vegetarian / Vegan" filter facet but, as with cuisine, it is not
 * printed on the venue card, so no venue is flagged rather than guessed.
 *
 * DESCRIPTION: verbatim from each card, whitespace-normalised. Four records
 * carry none and are left blank. MIA's own truncation marker is preserved
 * where it publishes one (Chef Creole's description ends "baked and […]").
 *
 * OPENING HOURS / 24-7: `opening_hours` is BLANK on every outlet, and this is
 * the notable gap at MIA. Its directory card shows a LIVE status — "Closed -
 * Opens at 7:00 am", "Open until 11:00 pm", "Open all day" — which is the
 * venue's state at the moment of the request, not a published weekly schedule.
 * Storing that as opening_hours would bake this snapshot's time of day into the
 * data, so it is not stored. The one exception is `open_24_7`, set for the 5
 * venues whose status reads MIA's own standing "Open all day" — including the
 * two the airport names outright, "Dunkin' (Open 24 Hours)" and "Subway (Open
 * 24 Hours)".
 *
 * PHONE: blank on every doc. MIA's directory card publishes no phone number.
 *
 * WEBSITE / LOGO: MIA's cards carry no website field. Following this dataset's
 * KUL precedent, `website` (and the logo.dev logo derived from it) is set only
 * for globally or nationally recognisable chains and well-known Miami concepts
 * whose primary domain is confidently known, and left blank for every other
 * independent concept ("305 Pizza", "Chefs of the Caribbean", "Farmair's
 * Café", "Maestro Della Pizza", "Guava & Java" and the rest) rather than
 * guessed.
 *
 * VERIFIED TOTALS: 69 source dining records − 1 out of scope = 68 → 53
 * restaurant docs / 68 outlets. North Terminal: 31 records → 21 docs / 31
 * outlets. Central Terminal: 22 → 18 / 22. South Terminal: 15 → 14 / 15.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['mia', 'miami', 'miami-international'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const NORTH_TERMINAL = 'north_terminal';
const CENTRAL_TERMINAL = 'central_terminal';
const SOUTH_TERMINAL = 'south_terminal';

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


// ─── North Terminal (Concourse D) ───

const northTerminalVenues = {
  '305_pizza': restaurant({
    name: "305 Pizza", cuisine: "Dine", amenity: "restaurant",
    description: "Pizza, Panini and more Hours of Operation: 7:00 AM 10:00 PM Mobile Ordering:",
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  au_bon_pain: restaurant({
    name: "Au Bon Pain", cuisine: "Dine", amenity: "cafe",
    description: "Satisfy your healthy appetite with a menu of soups, salads and handcrafted sandwiches made with fresh artisan breads.",
    website: "aubonpain.com", logoUrl: logo("aubonpain.com"),
    outlets: [
      o("", "", "landside", ""),
      o("", "", "landside", ""),
    ],
  }),
  cafe_versailles: restaurant({
    name: "Café Versailles", cuisine: "Dine", amenity: "cafe",
    description: "This Miami favorite is known for the best Cuban food in the city. Now it’s at MIA. Try the pastelitos, hot-pressed sandwiches, and a fresh shot of Cuban coffee.",
    website: "versaillesrestaurant.com", logoUrl: logo("versaillesrestaurant.com"),
    outlets: [
      o("", "", "airside", ""),
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
  carlos_bake_shop_express_vending_machine: restaurant({
    name: "Carlo's Bake Shop Express (Vending Machine)", cuisine: "Dine", amenity: "vending_machine",
    description: "Vending machine offering cake slices from Carlo’s Bake Shop, home of the famous Cake Boss.",
    website: "carlosbakery.com", logoUrl: logo("carlosbakery.com"),
    outlets: [
      o("", "", "airside", "", true),
    ],
  }),
  chefs_of_the_caribbean: restaurant({
    name: "Chefs of the Caribbean", cuisine: "Dine", amenity: "restaurant",
    description: "CHEFS OF THE CARIBBEAN is inspired by our group of caribbean celebrity chefs, who showcase the cuisine of the islands of their origin. these chefs are masters in the kitchen and have been recognized worldwide for their culinary expertise and authentic dishes.",
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "Dine", amenity: "cafe",
    description: "The world runs on Dunkin, which is pretty perfect for travelers on the go! Grab some donuts or a bagel and that famous DD coffee.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  einstein_bros_bagels: restaurant({
    name: "Einstein Bros. Bagels", cuisine: "Dine", amenity: "cafe",
    description: "We wrote the book on bagels but we also boast some of the best coffee & espresso Deli sandwiches, breakfast egg sandwiches, baked snacks and sweets.",
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  estefan_kitchen_express: restaurant({
    name: "Estefan Kitchen Express", cuisine: "Dine", amenity: "fast_food",
    description: "Traditional freshly-made Cuban sandwiches, healthy salads, snacks, sweets and our famous pork flatbreads. Don’t leave MIA without trying one of our delicious Hot Cuban (pockets)! Enjoy refreshing Bacardi Mojitos, signature cocktails, beer, or wine from the full bar.",
    website: "estefankitchen.com", logoUrl: logo("estefankitchen.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  fig_fennel: restaurant({
    name: "Fig & Fennel", cuisine: "Dine", amenity: "fast_food",
    description: "Savor the delicious flavors of the Mediterranean with a broad selection of grab-and-go sandwiches, wraps and healthly, all natural items. Be sure to try the scrumptious desserts!",
    website: "figandfennel.com", logoUrl: logo("figandfennel.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  half_moon_empanadas: restaurant({
    name: "Half Moon Empanadas", cuisine: "Dine", amenity: "restaurant",
    description: "This place makes them from scratch using the freshest ingredients, superior cuts of meat, and a unique dough rolling process that makes every bite delicious. These are empanadas done right.",
    website: "halfmoonempanadas.com", logoUrl: logo("halfmoonempanadas.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  ice_box_cafe: restaurant({
    name: "Ice Box Café", cuisine: "Dine", amenity: "cafe",
    description: "Fresh with a side order of fast service! Enjoy healthy entrees, salads and sandwiches. Dine in or grab and go and don’t forget Miami’s best baked goodies.",
    website: "iceboxcafe.com", logoUrl: logo("iceboxcafe.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  juan_valdez_cafe: restaurant({
    name: "Juan Valdez Café", cuisine: "Dine", amenity: "cafe",
    description: "100% pure Colombian coffee offering a full selection of specialty coffee drinks such as lattes, mochas, blended hot & cold frozen drinks, and fresh grab-and-go sandwiches, salads, muffins, pastries, and other baked goods.",
    website: "juanvaldezcafe.com", logoUrl: logo("juanvaldezcafe.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  la_carreta: restaurant({
    name: "La Carreta", cuisine: "Dine", amenity: "restaurant",
    description: "This is a Miami and MIA original. Classic Cuban favorites, including pastelitos, croquetas, sandwiches and homemade dishes, served up casual and quick.",
    website: "lacarreta.com", logoUrl: logo("lacarreta.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  manchu_wok: restaurant({
    name: "Manchu Wok", cuisine: "Dine", amenity: "fast_food",
    description: "This is fast food that doesn’t taste like fast food. Enjoy great Chinese cuisine that’s perfect when you’re short on time but want a real meal.",
    website: "manchuwok.com", logoUrl: logo("manchuwok.com"),
    outlets: [
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
  mishas_cupcakes: restaurant({
    name: "Misha’s Cupcakes", cuisine: "Dine", amenity: "cafe",
    description: "Visit Misha’s Cupcakes for delicious desserts including cake-in-a-jars, cakes, cupcakes, and more.",
    website: "mishascupcakes.com", logoUrl: logo("mishascupcakes.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  nathans_famous: restaurant({
    name: "Nathan's Famous", cuisine: "Dine", amenity: "fast_food",
    description: "Grab a Coney Island legend right here in Miami. Nothing beats a Nathan’s Famous hog dog with a side of crispy crinkle-cut fries.",
    website: "nathansfamous.com", logoUrl: logo("nathansfamous.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  peets_coffee: restaurant({
    name: "Peet's Coffee", cuisine: "Dine", amenity: "cafe",
    description: "The pioneers in craft coffee, Peet’s offers a variety of coffee, teas, beverages, and baked goods.",
    website: "peets.com", logoUrl: logo("peets.com"),
    outlets: [
      o("", "", "airside", ""),
      o("", "", "landside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Dine", amenity: "cafe",
    description: "Grab a venti and go. Sip a double latte or savor a Frosty Frappuccino;. America’s favorite coffee shop is ready to serve it up however you like it.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "", "landside", ""),
      o("", "", "landside", ""),
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Dine", amenity: "fast_food",
    description: "Who says fast food can’t be good for you? This health-conscious alternative features fresh subs and salads made to order.",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  sushi_maki: restaurant({
    name: "Sushi Maki", cuisine: "Dine", amenity: "restaurant",
    description: "There’s something for everyone on this express menu Spring Rolls, Salmon Miso, Sushi Tacos and Kobe Beef Sliders, to name a few. Hungry yet?",
    website: "sushimaki.com", logoUrl: logo("sushimaki.com"),
    outlets: [
      o("", "", "airside", ""),
      o("", "", "landside", ""),
    ],
  }),
  villa_pizza: restaurant({
    name: "Villa Pizza", cuisine: "Dine", amenity: "fast_food",
    description: "Homemade pizza and pasta recipes that come straight from the old country. If you love Italian, this is as authentic as it gets.",
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"),
    outlets: [
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
};

// ─── Central Terminal (Concourses E, F, G) ───

const centralTerminalVenues = {
  au_bon_pain: restaurant({
    name: "Au Bon Pain", cuisine: "Dine", amenity: "cafe",
    description: "Satisfy your healthy appetite with a menu of soups, salads and handcrafted sandwiches made with fresh artisan breads.",
    website: "aubonpain.com", logoUrl: logo("aubonpain.com"),
    outlets: [
      o("", "", "landside", ""),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Dine", amenity: "fast_food",
    description: "At BK you don’t just order a meal, you create it. Delicious flame-fresh taste starts at BK. Have It Your Way.",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("", "", "landside", ""),
    ],
  }),
  cafe_la_carreta: restaurant({
    name: "Café La Carreta", cuisine: "Dine", amenity: "cafe",
    description: "This is a Miami and MIA original. Classic Cuban favorites, including pastries, croquettes, sandwiches and homemade dishes, served up casual and quick.",
    website: "lacarreta.com", logoUrl: logo("lacarreta.com"),
    outlets: [
      o("", "", "landside", ""),
    ],
  }),
  cafe_versailles: restaurant({
    name: "Café Versailles", cuisine: "Dine", amenity: "cafe",
    description: "This Miami favorite is known for the best Cuban food in the city. Now it’s at MIA. Try the pastelitos, hot-pressed sandwiches, and a fresh shot of Cuban coffee.",
    website: "versaillesrestaurant.com", logoUrl: logo("versaillesrestaurant.com"),
    outlets: [
      o("", "", "landside", ""),
      o("", "", "landside", ""),
    ],
  }),
  chef_creole: restaurant({
    name: "Chef Creole", cuisine: "Dine", amenity: "restaurant",
    description: "At Chef Creole the menu contains an enticing array of seafood, inspired by a mixture of Bahamian/Creole flavors and has become the standard for fresh seafood in the South Florida restaurant community. In addition to the exquisite seafood dishes, Chef Creole offers an array of traditional American dishes such as homemade fried chicken, baked and […]",
    website: "chefcreole.com", logoUrl: logo("chefcreole.com"),
    outlets: [
      o("", "", "landside", ""),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-Fil-A", cuisine: "Dine", amenity: "fast_food",
    description: "Chick-Fil-A New Food & Beverage Concession, we are delighted to announce that the much-anticipated Chick-Fil- A is now open at the Jackson Corners location in Concourse E (post security) across Gate E2.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("", "", "landside", ""),
    ],
  }),
  dunkin_open_24_hours: restaurant({
    name: "Dunkin' (Open 24 Hours)", cuisine: "Dine", amenity: "cafe",
    description: "The world runs on Dunkin, which is pretty perfect for travelers on the go! Grab some donuts or a bagel and that famous DD coffee.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
      o("", "", "landside", "", true),
    ],
  }),
  farm2air_market: restaurant({
    name: "Farm2Air Market", cuisine: "Dine", amenity: "fast_food",
    description: "Choose from a delicious selection of sandwiches, salads, snacks, desserts and daily gourmet selections at this marketplace.",
    outlets: [
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
  guava_java: restaurant({
    name: "Guava & Java", cuisine: "Dine", amenity: "cafe",
    description: "Nothing goes together like a sweet guava pastry and a bold cup of coffee. Choose from a wide selection of homemade baked goods and bistro coffees.",
    outlets: [
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
  jackson_soul_food: restaurant({
    name: "Jackson Soul Food", cuisine: "Dine", amenity: "restaurant",
    description: "Opened in 1946, this local family business has become legendary for its traditional soul food.",
    website: "jacksonsoulfood.com", logoUrl: logo("jacksonsoulfood.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  la_colombe_the_great_bagel: restaurant({
    name: "La Colombe & The Great Bagel", cuisine: "Dine", amenity: "cafe",
    description: "Coffee and a variety of bagels, sandwiches, and baked items.",
    website: "lacolombe.com", logoUrl: logo("lacolombe.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  maestro_della_pizza: restaurant({
    name: "Maestro Della Pizza", cuisine: "Dine", amenity: "restaurant",
    outlets: [
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
  mishas_cupcakes: restaurant({
    name: "Misha's Cupcakes", cuisine: "Dine", amenity: "cafe",
    description: "Visit Misha’s Cupcakes for delicious desserts including cake-in-a-jars, cakes, brownies, cookies, cookie dough (to bake at home), bars and muffins.",
    website: "mishascupcakes.com", logoUrl: logo("mishascupcakes.com"),
    outlets: [
      o("", "", "airside", "", true),
    ],
  }),
  pizza_hut_express: restaurant({
    name: "Pizza Hut Express", cuisine: "Dine", amenity: "fast_food",
    description: "Pizza, pasta, wings and desserts, everyone knows Pizza Hut is making it great!",
    website: "pizzahut.com", logoUrl: logo("pizzahut.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  sergios_cuban: restaurant({
    name: "Sergio's Cuban", cuisine: "Dine", amenity: "restaurant",
    website: "sergioscuban.com", logoUrl: logo("sergioscuban.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  subway_open_24_hours: restaurant({
    name: "Subway (Open 24 Hours)", cuisine: "Dine", amenity: "fast_food",
    description: "Who says fast food can’t be good for you? This health-conscious alternative features fresh subs and salads made to order.",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("", "", "landside", "", true),
    ],
  }),
  sushi_maki: restaurant({
    name: "Sushi Maki", cuisine: "Dine", amenity: "restaurant",
    description: "There’s something for everyone on this express menu Spring Rolls, Salmon Miso, Sushi Tacos and Kobe Beef Sliders, to name a few. Hungry yet?",
    website: "sushimaki.com", logoUrl: logo("sushimaki.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  villa_italian_kitchen: restaurant({
    name: "Villa Italian Kitchen", cuisine: "Dine", amenity: "fast_food",
    description: "Homemade pizza and pasta recipes that come straight from the old country. If you love Italian, this is as authentic as it gets.",
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"),
    outlets: [
      o("", "", "landside", ""),
    ],
  }),
};

// ─── South Terminal (Concourses H, J) ───

const southTerminalVenues = {
  burger_king: restaurant({
    name: "Burger King", cuisine: "Dine", amenity: "fast_food",
    description: "At BK you don’t just order a meal, you create it. Delicious flame-fresh taste starts at BK. Have It Your Way.",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  carlos_bake_shop_express: restaurant({
    name: "Carlo's Bake Shop Express", cuisine: "Dine", amenity: "vending_machine",
    description: "Vending machine offering cake slices from Carlo’s Bake Shop, home of the famous Cake Boss.",
    website: "carlosbakery.com", logoUrl: logo("carlosbakery.com"),
    outlets: [
      o("", "", "airside", "", true),
    ],
  }),
  earl_of_sandwich: restaurant({
    name: "Earl of Sandwich", cuisine: "Dine", amenity: "fast_food",
    description: "This is sandwich royalty! Try a made-to-order hot sandwich featuring fresh roasted meats and a variety of sauces and spreads served on oven-baked artisan bread.",
    website: "earlofsandwichusa.com", logoUrl: logo("earlofsandwichusa.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  esspresamente_illy: restaurant({
    name: "Esspresamente Illy", cuisine: "Dine", amenity: "cafe",
    description: "The finest Italian coffee served with fresh-made pastries that are just as exquisite. Prepare for a truly gourmet indulgence.",
    website: "illy.com", logoUrl: logo("illy.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  famous_famiglia: restaurant({
    name: "Famous Famiglia", cuisine: "Dine", amenity: "fast_food",
    description: "You don't have to fly to New York to get that authentic thin-crust pie. Just stop by Famous Famiglia and order up.",
    website: "famousfamiglia.com", logoUrl: logo("famousfamiglia.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  farm2air_market: restaurant({
    name: "Farm2Air Market", cuisine: "Dine", amenity: "fast_food",
    description: "Choose from a delicious selection of sandwiches, salads, snacks, desserts and daily gourmet selections at this marketplace.",
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  farmairs_cafe: restaurant({
    name: "Farmair's Café", cuisine: "Dine", amenity: "cafe",
    description: "Enjoy fresh Breakfast, Sandwiches, Salads, Wraps and more.",
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  gilberts_food_bar_post_security: restaurant({
    name: "Gilbert's Food Bar (Post-Security)", cuisine: "Dine", amenity: "restaurant",
    description: "On the spot or on the fly, you’ll find a great selection of sandwiches, baked goods, decadent desserts and snacks, all homemade by Gilbert’s. And don’t forget to try its famous frothy cortadito, the most popular of its extensive coffee menu.",
    website: "gilbertsbakery.com", logoUrl: logo("gilbertsbakery.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  gilberts_food_bar_pre_security: restaurant({
    name: "Gilbert's Food Bar (Pre-Security)", cuisine: "Dine", amenity: "restaurant",
    description: "On the spot or on the fly, you’ll find a great selection of sandwiches, baked goods, decadent desserts and snacks, all homemade by Gilbert’s. And don’t forget to try its famous frothy cortadito, the most popular of its extensive coffee menu.",
    website: "gilbertsbakery.com", logoUrl: logo("gilbertsbakery.com"),
    outlets: [
      o("", "", "landside", ""),
    ],
  }),
  nathans_famous: restaurant({
    name: "Nathan's Famous", cuisine: "Dine", amenity: "fast_food",
    description: "Grab a Coney Island legend right here in Miami. Nothing beats a Nathan’s Famous hog dog with a side of crispy crinkle-cut fries.",
    website: "nathansfamous.com", logoUrl: logo("nathansfamous.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  pizza_hut: restaurant({
    name: "Pizza Hut", cuisine: "Dine", amenity: "fast_food",
    description: "Pizza, pasta, wings and desserts, everyone knows Pizza Hut is making it great!",
    website: "pizzahut.com", logoUrl: logo("pizzahut.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  sergios_go: restaurant({
    name: "Sergio’s GO", cuisine: "Dine", amenity: "fast_food",
    description: "Craving delicious and authentic Cuban dishes? Stop by Miami’s own Sergio’s GO for quick and tasty local bites.",
    website: "sergioscuban.com", logoUrl: logo("sergioscuban.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Dine", amenity: "cafe",
    description: "Grab a venti and go. Sip a double latte or savor a Frosty Frappuccino;. America’s favorite coffee shop is ready to serve it up however you like it.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "", "airside", ""),
      o("", "", "airside", ""),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Dine", amenity: "fast_food",
    description: "Who says fast food can’t be good for you? This health-conscious alternative features fresh subs and salads made to order.",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("", "", "airside", ""),
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

  const r1 = await processTerminal(AIRPORT, NORTH_TERMINAL, 'North Terminal (Concourse D)', northTerminalVenues);
  const r2 = await processTerminal(AIRPORT, CENTRAL_TERMINAL, 'Central Terminal (Concourses E, F, G)', centralTerminalVenues);
  const r3 = await processTerminal(AIRPORT, SOUTH_TERMINAL, 'South Terminal (Concourses H, J)', southTerminalVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([NORTH_TERMINAL, CENTRAL_TERMINAL, SOUTH_TERMINAL]));

  const totalCreated = r1.created + r2.created + r3.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted;
  const totalVenues = Object.keys(northTerminalVenues).length
    + Object.keys(centralTerminalVenues).length
    + Object.keys(southTerminalVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
