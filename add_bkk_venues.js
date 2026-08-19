'use strict';
/**
 * Fills in complete data for Bangkok Suvarnabhumi Airport (BKK) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-17 from the
 * official site, suvarnabhumi.airportthai.co.th (Airports of Thailand /
 * AOT), using Claude in Chrome browser automation per this project's
 * standing convention (no WebFetch for venue data).
 *
 * METHODOLOGY: AOT's dining directory is backed by a GraphQL API
 * (gtt-prod.sawasdeebyaot.com/graphql, query WebFetchContent,
 * content_category_id=7 for Dining) that returns all 57 dining venues in
 * one request — far simpler than paginated DOM scraping. Each venue's
 * detail page (suvarnabhumi.airportthai.co.th/service/shop-and-dine/
 * detail/<content_id>) is server-side rendered (unlike Changi's SPA
 * shell), so a plain `fetch()` + DOMParser + innerText, sliced between the
 * literal markers "HomeShop and Dine" and "FLIGHT STATUS", cleanly
 * isolates each venue's name + description + per-outlet location/hours
 * text. All 57 detail pages were fetched in one background batch, 0
 * errors. The raw captured JSON had several unescaped embedded quotes in
 * marketing copy (e.g. venue 685's "We choose every word for you" slogan)
 * that broke JSON parsing on the first attempt — repaired via a boundary
 * parser keyed on the reliable numeric `"<content_id>":"` prefix pattern.
 *
 * TERMINAL STRUCTURE: Suvarnabhumi has ONE main terminal building ("Main
 * Terminal", with Concourses/Gates A-G) plus a newer satellite building
 * "SAT-1" (opened 2023), connected via a ~1km underground APM tunnel.
 * AOT's own official page on SAT-1 ("THE MIDFIELD SATELLITE 1 SUVARNABHUMI
 * AIRPORT") describes it purely as a physically-connected building — no
 * separate check-in or security procedures — confirmed further by trip.com
 * ("All domestic and international flight check-ins... occur on Level 4 of
 * the Main Passenger Terminal") and corroborated by the scraped venue data
 * itself: every SAT-1 location is tagged Zone: Departure with no Area:
 * Public flag (i.e. airside-only, reached exclusively via APM after Main
 * Terminal security), never a landside/Arrival entry of its own. SAT-1
 * therefore FAILS this project's "own check-in AND own security" terminal-
 * bucket test. AOT's own dining GraphQL API also has no terminal/building
 * filter parameter at all (unlike Changi's site, which treats "Jewel" as a
 * first-class peer Location filter alongside T1-T4) — SAT-1 appears only
 * as free text within individual venues' location strings. Consistent with
 * how NRT's satellite buildings were handled, SAT-1 folds into a SINGLE
 * terminal bucket alongside Main Terminal: doc id `main_terminal`. This
 * makes BKK a single-terminal-bucket airport, unlike SIN's 5-bucket
 * structure. SAT-1 locations are still flagged in `location_notes` (e.g.
 * "SAT-1, Floor 3, Gate S121") so the building distinction isn't lost.
 *
 * MULTI-OUTLET / SAME-BRAND HANDLING: standard project rule, applied here
 * within the single bucket — same-brand venues combined into one doc with
 * multiple outlets[]. AOT's own CMS lists several brands under TWO
 * separate content ids for what is the same brand (sometimes even the
 * exact same physical location, e.g. "Coffee World Restaurant" and
 * "Coffee World Cafe" are byte-identical duplicate CMS records): Bento
 * Sushi, Imm Rice & Noodle, The Coffee Club, The Pizza Company, Gloria
 * Jean's Coffees, AROI (Restaurant), Camden Food Co., and Coffee World were
 * each merged from 2 content ids into 1 doc. A "KOH HOP BAR / Camden Food
 * Co" combo-branded venue was kept separate rather than folded into the
 * Camden Food Co. brand doc, since it's listed under its own distinct
 * co-branded name.
 *
 * OUTLET DEDUPE: many venues' raw location data lists the SAME physical
 * spot twice — once tagged Zone: Departure with real hours ("24 hours"),
 * once tagged Zone: Arrival with hours "Closed" — clearly a duplicate
 * placeholder from AOT's CMS rather than two locations, since Zone doesn't
 * affect which physical unit is being described. These exact-location
 * duplicates were collapsed to one outlet (keeping the real-hours version)
 * during reconciliation. Zone itself is not stored in the final data —
 * only Area: Public (-> landside) vs its absence (-> airside) is, which was
 * consistent between each duplicate pair. Standalone "Closed" entries with
 * no matching real-hours duplicate (e.g. Carwen Coffee's single location,
 * and all 6 of DEAN & DELUCA's locations) were preserved as real sourced
 * data rather than dropped or reinterpreted, per this project's
 * no-fabrication rule.
 *
 * HOURS: AOT's site only ever renders one of two values per outlet —
 * "24 hours" or "Closed" — under a single generic "Monday" label (no
 * per-day-of-week granularity like SIN/Changi exposed). Both are stored
 * verbatim as scraped.
 *
 * AMENITY / CUISINE: AOT's GraphQL API does not expose a per-venue
 * category field (introspection is blocked, and the list query's
 * `content_sub_category_id` grouping wasn't surfaced in results), and
 * detail pages carry no category badge either — confirmed by inspection.
 * Unlike SIN/KIX/KUL/NRT/MNL, where these were mapped 1:1 from the site's
 * own category tags, BKK's amenity and cuisine tags were derived here from
 * each venue's own official name + marketing description text via keyword
 * rules (e.g. "pizza"/"burger" -> fast_food; "coffee"/"cafe" -> cafe;
 * "sushi"/"japanese" -> Japanese cuisine tag), then manually spot-checked
 * against the full description text for every match. Two false-positive
 * "Thai" cuisine matches were caught and excluded this way: The Pizza
 * Company's "entice Thai customers" and Dragon Express's "whether it is
 * Thai or foreign tourists" both describe clientele, not cuisine. HALAL:
 * no venue's description mentions "halal" anywhere in the 57 detail pages,
 * so all halal fields are blank. VEGAN: Garrett Popcorn's description
 * explicitly lists "Buttery (a vegan option)" — the only explicit
 * vegan/vegetarian/kosher/gluten-free signal found across all 57 venues;
 * all other such fields are left blank per the no-fabrication rule.
 *
 * WEBSITE: bare hostname only (no protocol/www/path), per this project's
 * standing convention. Left blank where AOT's detail page provides no
 * external site link (most venues).
 *
 * VERIFIED TOTALS: 57 raw content-id listings (98 raw location entries)
 * reconciled to 49 restaurant docs / 86 outlets in the single
 * `main_terminal` bucket (8 brand-merges reduced 57->49 docs; outlet
 * dedupe reduced 98->86 unique physical locations).
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['bkk', 'bangkok-suvarnabhumi', 'suvarnabhumi'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const MAIN_TERMINAL = 'main_terminal';

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

// ─── Main Terminal (incl. SAT-1) venues ──────────────────────────────────

const mainTerminalVenues = {
  bento_sushi: restaurant({
    name: "Bento Sushi",
    cuisine: "Japanese",
    description: "Bento Sushi is a restaurant that offers a fresh and delicious sushi and Japanese dining experience in a warm and friendly atmosphere. We use high-quality ingredients in every dish to ensure that our customers can truly savor the authentic flavors of Japanese cuisine.",
    amenity: "restaurant",
    outlets: [
      o("3", "Concourse C", "airside", "24 hours", true),
      o("4", "Terminal Concourse, Floor 4 (West), Area Concourse E", "airside", "24 hours", true),
    ],
  }),
  imm_rice_noodle: restaurant({
    name: "Imm Rice & Noodle",
    cuisine: "Thai",
    description: "IMM RICE & NOODLE is a restaurant that serves authentic Thai food, specializing in both rice and noodles, using original recipes passed down through generations. Not only will you get to taste the familiar flavors of Thai cuisine, as if you were dining at home, but you will also feel fulfilled in every way: full stomach, full flavor, and full heart. At IMM RICE & NOODLE, we are dedicated to selecting fresh, high-quality ingredients to create dishes that are rich in flavor and deliciousness, ensuring that you will want to return for more.",
    amenity: "restaurant",
    outlets: [
      o("3", "SAT-1 West", "airside", "24 hours", true),
      o("4", "Floor 4 (West)", "airside", "24 hours", true),
    ],
  }),
  the_coffee_club: restaurant({
    name: "The Coffee Club",
    cuisine: "Thai / Chinese / Coffee & Tea",
    description: "The Coffee Club is another café located at Suvarnabhumi Airport, ideal for domestic passengers seeking a chill spot to wait for their flights. This Australian coffee shop serves a variety of delicious coffee options, along with a selection of Thai and Western dishes for a satisfying meal.Recommended beverages from The Coffee Club include Piccolo Latte, Flat White, and Affogato, as well as tea options like Black Boutique Tea and Meiko Bloom Tea. Additionally, must-try food items include The Big Breakfast, Signature Eggs Benedict, and a congee set where you can choose your preferred rice.",
    website: "thecoffeeclub.co.th",
    logoUrl: logo("thecoffeeclub.co.th"),
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3, Entrance 6", "landside", "24 hours", true),
      o("4", "Floor 4 (East), Gate B", "airside", "24 hours", true),
      o("4", "Floor 4 (West), Gate F", "airside", "24 hours", true),
      o("3", "Sat-1 East", "airside", "24 hours", true),
    ],
  }),
  the_pizza_company: restaurant({
    name: "The Pizza Company",
    cuisine: "Pizza",
    description: "THE PIZZA COMPANY is a renowned pizza restaurant in Thailand, dedicated to offering high-quality pizzas made from fresh and health-conscious ingredients. Our diverse and creative pizza menu ranges from classic favorites to innovative new options that cater to the needs of all customers. Our pizzas are crafted using only fresh, health-promoting ingredients, ensuring they are crispy and perfectly balanced in flavor. A key ingredient is our premium cheese made from 100% fresh milk. THE PIZZA COMPANY impresses customers with oven-baked pizzas generously topped with over 30 options. The variety of menu items, carefully crafted flavors, and quality cheese tantalize the taste buds and entice Thai customers to come and try. We cater to a diverse range of customer needs, all of which elevate the dining experience to a new level.",
    website: "1112.com",
    logoUrl: logo("1112.com"),
    amenity: "fast_food",
    outlets: [
      o("4", "Floor 4 (West), Gate F", "airside", "24 hours", true),
      o("4", "CONCOURSE / Floor 4", "airside", "24 hours", true),
    ],
  }),
  gloria_jean_s_coffees: restaurant({
    name: "Gloria Jean's Coffees",
    cuisine: "Coffee & Tea",
    description: "Gloria Jean's Coffees is a premium cafe that is the most successful in Australia, with more than 760 branches in 55 countries around the world. We are meticulous in selecting 100% high-quality Arabica coffee beans from every source around the world, to create a happy experience for the new generation of consumers who have a lifestyle that suits them. We also fill every journey with happiness.",
    website: "gloriajeans.com",
    logoUrl: logo("gloriajeans.com"),
    amenity: "cafe",
    outlets: [
      o("2", "CONCOURSE, CONCOURSE B", "landside", "24 hours", true),
      o("4", "Floor 4 (West), Gate E", "airside", "24 hours", true),
      o("4", "Floor 4 (West), Gate C", "airside", "24 hours", true),
    ],
  }),
  aroi_restaurant: restaurant({
    name: "AROI Restaurant",
    cuisine: "Thai",
    description: "AROI Restaurant is a place that offers an exceptional dining experience, featuring authentic Thai cuisine prepared with fresh, high-quality ingredients. We are committed to creating delicious and unique dishes in a warm and friendly atmosphere.",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3, Entrance 5", "landside", "24 hours", true),
      o("4", "Floor 4, Gate F", "airside", "24 hours", true),
      o("3", "SAT-1 East", "airside", "24 hours", true),
      o("4", "Floor 4 (West)", "airside", "24 hours", true),
    ],
  }),
  camden_food_co: restaurant({
    name: "Camden Food Co.",
    cuisine: "Coffee & Tea",
    description: "Camden Food Co. operates under the concept of \"convenient, prompt service and fresh ingredients\". Enjoy quality sandwiches and fresh coffee packaged that come in an eco-friendly packaging.",
    amenity: "cafe",
    outlets: [
      o("4", "Floor 4, Gate DE", "airside", "24 hours", true),
      o("3", "SAT-1 West", "airside", "24 hours", true),
    ],
  }),
  coffee_world: restaurant({
    name: "Coffee World",
    cuisine: "Coffee & Tea",
    description: "Coffee World is a coffee shop that selects premium grade coffee beans from various varieties from all over the world, to deliver inspiration to everyone with their unique flavors. Start every day with a good cup of coffee in your hand.",
    amenity: "cafe",
    outlets: [
      o("B1", "Floor B1, Entrance 3", "landside", "24 hours", true),
    ],
  }),
  garrett_popcorn: restaurant({
    name: "GARRETT POPCORN",
    cuisine: "International",
    description: "Garrett Popcorn Shops® – A Chicago Tradition Since 1949For over seventy years, Garrett Popcorn Shops has been dedicated to serving gourmet popcorn made from high-quality ingredients, utilizing secret family recipes that have been passed down through generations. Our custom-grown, non-GMO butterfly and mushroom kernels are initially hot-air popped in our kitchens and then enhanced with flavor in traditional copper kettles. Recognizing that quality takes time, Garrett Popcorn is handcrafted in small batches throughout the day.Our signature recipes include the original Chicago-style popcorn, known as Chicago Mix®, which combines the sweetness of CaramelCrisp™ with the savory richness of CheeseCorn. Additional offerings include Buttery (a vegan option), Plain, CheeseCorn, CaramelCrisp, Almond CaramelCrisp, and Macadamia CaramelCrisp.Garrett Popcorn, unlike any other, captivates devoted fans around the globe.",
    website: "garrettpopcornshops.co.th",
    logoUrl: logo("garrettpopcornshops.co.th"),
    amenity: "bakery",
    vegan: true,
    outlets: [
      o("4", "Floor 4 (West),Concourse E", "airside", "24 hours", true),
    ],
  }),
  foodcourt_magic_food_point: restaurant({
    name: "Foodcourt Magic Food Point",
    cuisine: "Thai",
    description: "Magic Food Point – Thai Street Food Court – A 24-Hour Culinary ExperienceMagic Food Point is a food court that brings together up to 20 popular Thai street food restaurants, offering a diverse range of menu options to meet every need. We present quality food at affordable prices, allowing everyone to enjoy the unique flavors of Thailand. Open 24 hours a day, we provide you with the opportunity to experience exceptional dining at any time.",
    amenity: "food_court",
    outlets: [
      o("1", "Floor 1", "landside", "24 hours", true),
    ],
  }),
  aim_deli: restaurant({
    name: "Aim Deli",
    cuisine: "Thai",
    description: "Aim Deli is a Thai restaurant that perfectly blends Eastern and Western cultures to offer delicious and easy-to-eat fusion dishes. The ingredients are carefully selected for quality by professional chefs, providing an exceptional dining experience.",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4, Gate DW", "airside", "24 hours", true),
    ],
  }),
  asian_korner: restaurant({
    name: "Asian Korner",
    cuisine: "Thai / Desserts",
    description: "Asian Korner is a Thai-Asian restaurant that incorporates European cuisine, offering a diverse culinary experience. We select high-quality ingredients and prepare dishes with care by professional chefs, presenting popular options among international guests such as grilled chicken, shrimp cakes, Pad Thai, Tom Yum Goong, boat noodles, spicy minced pork salad, and stir-fried noodles with beef, along with signature desserts like mango sticky rice and mango pudding.",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4(East) / Gate DE", "airside", "24 hours", true),
    ],
  }),
  baan_tao_grad_go: restaurant({
    name: "Baan Tao Grad & Go",
    cuisine: "Thai",
    description: "Baan Tao Grad & Go offers a variety of snacks and traditional Thai sweets, such as rolled pancakes, pickled plums, and tamarind mix. We select high-quality ingredients to provide customers with an authentic taste of Thai treats, along with fast and convenient service.",
    amenity: "bakery",
    outlets: [
      o("4", "Floor 4, Gate B", "airside", "24 hours", true),
    ],
  }),
  burger_king: restaurant({
    name: "BURGER KING",
    cuisine: "Fast Food",
    description: "Burger King is a burger restaurant that emphasizes deliciousness and the quality of ingredients, along with fast and friendly service to ensure maximum satisfaction for consumers. Quality and freshness are at the heart of our ingredient preparation, and we pay attention to every step of the process.The distinctive feature of Burger King® is that every menu item is served with premium Australian-imported beef, grilled to perfection over an open flame with meticulous care, ensuring an authentic burger taste. We deliver on our promise at Burger King®: superior quality ingredients, unique cooking recipes, and a dining experience suitable for families or gatherings with friends.",
    website: "burgerking.co.th",
    logoUrl: logo("burgerking.co.th"),
    amenity: "fast_food",
    outlets: [
      o("2", "Floor 2, Gate A", "airside", "24 hours", true),
      o("3", "Floor 3, Entrance 4", "landside", "24 hours", true),
      o("4", "Floor 4, Gate B", "airside", "24 hours", true),
      o("4", "Floor 4, Gate F", "airside", "24 hours", true),
      o("4", "Floor 4, Gate D", "airside", "24 hours", true),
      o("3", "SAT-1, Floor 3, Gate S112B, S112A", "airside", "24 hours", true),
      o("3", "SAT-1, Floor 3, Gate S116B, S116A", "airside", "24 hours", true),
    ],
  }),
  cha_tra_mue: restaurant({
    name: "Cha Tra Mue",
    cuisine: "Thai",
    description: "Cha Tra Mue was founded in 1945. This original blend of Thai tea is a steady favourite with local and internation tea lovers. Apart from Thai tea, they also serve green tea, rose tea, and oolong tea.",
    amenity: "cafe",
    outlets: [
      o("2", "Floor 2, Entrance 2", "landside", "24 hours", true),
    ],
  }),
  china_town: restaurant({
    name: "China Town",
    cuisine: "Chinese",
    description: "China Town Restaurant is a restaurant that specializes in serving a diverse range of Chinese cuisine, featuring popular dishes such as dim sum, congee, noodles, and dumplings, all made fresh from high-quality ingredients.",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3 , Entrance 4", "landside", "24 hours", true),
    ],
  }),
  charm_noodles: restaurant({
    name: "Charm Noodles",
    cuisine: "Thai",
    description: "Boat noodles contain both beef and pork. They are noodles that have long been associated with the Thai way of life. In the past, they were sold in rowboats along the canals. Therefore, it is the source of The charm of boat noodles Hence the origin of the name Charm Noodles",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3, Entrance 4", "landside", "24 hours", true),
    ],
  }),
  dairy_queen_potato_corner_milch: restaurant({
    name: "Dairy Queen / Potato Corner / Milch",
    cuisine: "International",
    description: "At Potato Corner, we have the best tasting fries in the world. Every cup of Potato Corner is filled with quality from the selection of the best potatoes, as well as high-quality chicken for our popular menu, Superpop Chicken. What's more, we season them with our unique and diverse flavors that will impress you to the max. And of course, nothing is better than having every piece in every cup of yours freshly cooked cup by cup. That's one of our main missions, to make sure that every customer leaves our store with a smile and #HappySure100%.",
    website: "potatocorner.com",
    logoUrl: logo("potatocorner.com"),
    amenity: "fast_food",
    outlets: [
      o("4", "Floor 4 (West), Gate F", "airside", "24 hours", true),
    ],
  }),
  dragon_express: restaurant({
    name: "Dragon Express",
    cuisine: "Chinese",
    description: "Dragon Express makes customers who like noodles and porridge well-known. At Airport, whether it is Thai or foreign tourists, and the unique design that matches the atmosphere in the store. There are various menus for customers to pay attention to, such as rice menu or noodle menu, whether it is red pork, crispy pork, or roast duck.",
    amenity: "fast_food",
    outlets: [
      o("4", "Floor 4 (West), Gate E", "airside", "24 hours", true),
    ],
  }),
  ess_corner: restaurant({
    name: "Ess Corner",
    cuisine: "International",
    description: "ESS Corner is a new meeting point at Suvarnabhumi Airport, with a location that connects the airport rail link and the airport. S Corner will select the famous menu items to serve to the customers, to create a memorable impression.",
    amenity: "restaurant",
    outlets: [
      o("B1", "Floor B1, Entrance 3", "landside", "24 hours", true),
    ],
  }),
  ginger_farm_kitchen: restaurant({
    name: "Ginger farm Kitchen",
    cuisine: "International",
    description: "Ginger Farm store is a destination that offers high-quality food and beverages, focusing on fresh and natural ingredients. Our products include dishes made with ginger and various herbs that are beneficial to health, as well as refreshing and delicious beverages. We aim to provide customers with a healthy and satisfying dining experience. Our team is pleased to offer service and recommendations about our menu items to help you discover your favorite flavors.",
    website: "gingerfarmkitchen.com",
    logoUrl: logo("gingerfarmkitchen.com"),
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "landside", "24 hours", true),
      o("3", "Sat-1 East F6", "airside", "24 hours", true),
    ],
  }),
  kfc: restaurant({
    name: "KFC",
    cuisine: "Fast Food",
    description: "KFC is a fried chicken brand that has captured the hearts of people across Thailand. With its unique secret recipe that delivers exceptional flavor and outstanding service, KFC has been recognized with the award \"No.1 Brand Thailand 2020-2021\" in the category of Most Popular Brand in Fast Food for six consecutive years.KFC is committed to serving delicious meals to its customers through over 900 branches nationwide, allowing customers to experience high-quality fried chicken with a distinctive taste conveniently.",
    website: "kfc.co.th",
    logoUrl: logo("kfc.co.th"),
    amenity: "fast_food",
    outlets: [
      o("3", "Floor 3, Entrance 3", "landside", "24 hours", true),
      o("2", "Floor 2", "airside", "24 hours", true),
    ],
  }),
  kin_japanese_restaurant: restaurant({
    name: "KIN Japanese Restaurant",
    cuisine: "Thai / Japanese",
    description: "This is a restaurant that blends Thai, Japanese, and international cuisines, using premium ingredients and unique recipes. They pay attention to the freshness, cleanliness, and quality of their food, with the slogan \"We choose every word for you\".",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3, Entrance 6", "landside", "24 hours", true),
    ],
  }),
  koh_hop_bar_camden_food_co: restaurant({
    name: "KOH HOP BAR / Camden Food Co",
    cuisine: "International",
    description: "",
    amenity: "bar",
    outlets: [
      o("4", "Floor 4 (West), Gate E", "airside", "24 hours", true),
    ],
  }),
  kozuke: restaurant({
    name: "KOZUKE",
    cuisine: "Thai / Japanese",
    description: "Kozuke is a Japanese-Thai fusion restaurant designed to provide a unique dining experience. We carefully select high-quality ingredients from trusted sources to ensure freshness and cleanliness in every dish. With meticulous attention to preparation and presentation, we aim to create exceptional and memorable flavors in every bite you savor.",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4 (East), Gate DE", "airside", "24 hours", true),
    ],
  }),
  krispy_kreme: restaurant({
    name: "Krispy Kreme",
    cuisine: "Coffee & Tea / Bakery",
    description: "Krispy Kreme is a world-famous doughnut brand from the United States, with its headquarters in Winston-Salem, North Carolina. It was founded in 1937 and sells high-quality doughnuts and delicious coffee. Its signature product is the Original Glazed, a doughnut coated with sugar that has a unique aroma and flavor. It is soft, fluffy, and sweet, and loved by people all over the world.",
    amenity: "bakery",
    outlets: [
      o("2", "Floor 2, Entrance 3", "landside", "24 hours", true),
      o("4", "Floor 4 (East)", "landside", "24 hours", true),
      o("4", "Concourse E", "airside", "24 hours", true),
    ],
  }),
  after_you: restaurant({
    name: "After You",
    cuisine: "Desserts",
    description: "After You is a popular destination for dessert lovers, renowned for its high-quality pastries and sweets. Located in a convenient area, it is ideal for relaxation and social gatherings.The restaurant features a diverse menu with standout items such as Shibuya Toast, a crispy-on-the-outside, soft-on-the-inside buttered toast served with ice cream and fresh fruits; Chocolate Lava Cake, a chocolate cake with molten chocolate flowing out when cut; and Matcha Parfait, a dessert made from matcha served in a parfait style.The warm atmosphere and attentive service allow customers to enjoy a unique dessert experience.",
    amenity: "bakery",
    outlets: [
      o("2", "Floor 2, Entrance 3", "landside", "24 hours", true),
    ],
  }),
  luk_kai_thong: restaurant({
    name: "Luk Kai Thong",
    cuisine: "Thai",
    description: "Luk Gai Thong is a Thai royal cuisine restaurant that has been awarded by the \"Michelin Guide\". They use only high-quality ingredients and prepare every dish with meticulous care. The owner of the restaurant, \"Chef Sang\", presents the charm of Thai food to the world with pride in his Thai identity. One of the highlight dishes that you should not miss is Kaoyok, a legendary dish that is more than 100 years old. It is a rare dish that features pork belly stewed for more than 5 hours until it melts in your mouth, along with vegetables that are fermented for more than 2 days, giving it a balanced sweet and salty flavor. This dish has also been certified by the Michelin Guide for 5 consecutive years.",
    website: "lukkaithong.com",
    logoUrl: logo("lukkaithong.com"),
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4 (West), Gate F", "airside", "24 hours", true),
    ],
  }),
  mango_star: restaurant({
    name: "Mango Star",
    cuisine: "Thai / Desserts / Juice & Smoothies",
    description: "A true Thai mango shop, that uses the premium Thai fruit \"Nam Dok Mai\" mango, which is popular around the world, to create quality dishes that are delicious and appealing to both Thais and foreigners. Some of the menu items are sticky rice with mango, thick blended mango juice, and mango ice cream. The shop emphasizes quality and freshness, and every dish is made with plenty of mango flesh. It serves the taste of mango lovers all year round, true to its concept of \"Mango with stars, delicious with heart\".",
    amenity: "bakery",
    outlets: [
      o("B1", "Floor B1, Entrance 3", "landside", "24 hours", true),
    ],
  }),
  mcdonald_s: restaurant({
    name: "McDonald's",
    cuisine: "Fast Food",
    description: "McDonald's aims to create an excellent dining experience and deliver the global standard of McDonald's for its customers beyond taste and value for money by incorporating modern technology, such as Self-Ordering Kiosks (SOK), that support cashless payments for more convenient and quicker service. Additionally, services like table service and guest experience leaders (GEL) are in place to ensure customers are well taken care of.",
    website: "mcdonalds.co.th",
    logoUrl: logo("mcdonalds.co.th"),
    amenity: "fast_food",
    outlets: [
      o("4", "Floor 4 (West), Gate F", "airside", "24 hours", true),
      o("3", "Floor 3", "landside", "24 hours", true),
      o("3", "SAT-1, Floor 3 (Gate S113B, S113A)", "airside", "24 hours", true),
    ],
  }),
  punthai_coffee: restaurant({
    name: "PUNTHAI COFFEE",
    cuisine: "Thai / Coffee & Tea",
    description: "\"Thai Coffee\" is a Thai coffee chain owned by PTG Energy (Public) Company. We are supporting local food businesses that lead to positive economic, social and environmental impacts. We care about the source, selection and quality of all our ingredients and coffee beans, such as the beans from Doi Saket district, Chiang Mai province, in the north of Thailand. We serve delicious and high-quality coffee to you for all coffee lovers.",
    amenity: "cafe",
    outlets: [
      o("2", "Floor 2, Entrance 3", "landside", "24 hours", true),
    ],
  }),
  royce_chocolate: restaurant({
    name: "ROYCE CHOCOLATE",
    cuisine: "Desserts",
    description: "Royce Chocolate is a famous chocolate brand from Japan, and the number one souvenir choice for many people. It is well-known for its \"Nama Chocolate\" (fresh chocolate, which has mainly chocolate and cream as ingredients. The texture of the chocolate is softer and smoother than regular chocolate). It has a rich and velvety taste and feel that makes you happy from the first bite and irresistible to have another one.",
    website: "royceth.com",
    logoUrl: logo("royceth.com"),
    amenity: "bakery",
    outlets: [
      o("2", "Floor 2, Gate D", "airside", "24 hours", true),
    ],
  }),
  s_p: restaurant({
    name: "S&P",
    cuisine: "Bakery / Desserts",
    description: "S&P was established in 1973 as a shop selling food, ice cream, and snacks that was popular and well-received by many customers. It then had the idea of expanding its business by opening a bakery shop and achieved success as the first producer of custom-made cakes and cartoon cakes in Thailand.",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3, Entrance 5", "landside", "24 hours", true),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee",
    cuisine: "Coffee & Tea",
    description: "Starbucks Coffee is a globally recognized coffee shop offering a wide range of high-quality coffee beverages, teas, and baked goods. Our locations provide a warm and friendly atmosphere, perfect for relaxing or working.",
    amenity: "cafe",
    outlets: [
      o("4", "Floor 4(East)", "landside", "24 hours", true),
      o("3", "Floor 3", "landside", "24 hours", true),
    ],
  }),
  carwen_coffee: restaurant({
    name: "Carwen Coffee",
    cuisine: "Coffee & Tea / Bakery",
    description: "Carwen Coffee is a coffee shop that stands out for its premium grade coffee beans. Carefully selected and processed beans are given special attention from grinding to brewing with standard machines. Brighten your day with their signature drinks; Iced White Coffee and Iced Americano Yuzu, with freshly baked Butter Croissant.",
    amenity: "cafe",
    outlets: [
      o("2", "Floor 2, Gate D", "airside", "Closed", false),
    ],
  }),
  top_ten_thai_cuisine: restaurant({
    name: "Top Ten Thai Cuisine",
    cuisine: "Thai",
    description: "A genuine Thai restaurant that selects premium ingredients and cooks them with care to give the customers a taste of the diverse and unique flavors of Thai cuisine.",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3, Entrance 6", "landside", "24 hours", true),
    ],
  }),
  upper_crust: restaurant({
    name: "Upper Crust",
    cuisine: "Coffee & Tea / Bakery",
    description: "Upper Crust is a bakery that serves fresh baguettes and other products. It focuses on using high-quality ingredients that are carefully selected. It meets the needs of every time of the day, whether it is breakfast, lunch, or dinner. It also has excellent sandwiches, freshly baked pastries, and premium coffee.",
    amenity: "bakery",
    outlets: [
      o("4", "Floor 4 (East), Gate C", "airside", "24 hours", true),
    ],
  }),
  brew_bites: restaurant({
    name: "Brew&Bites",
    cuisine: "Coffee & Tea / Desserts",
    description: "Brew&Bites store is a destination that offers a diverse range of food and beverages, focusing on creating high-quality and delicious menu items. Our offerings include freshly brewed coffee, snacks, and desserts made from premium ingredients, ensuring customers enjoy a satisfying and unique dining experience. Our team is pleased to provide service and recommendations regarding our menu items to help you savor the best flavors.",
    amenity: "cafe",
    outlets: [
      o("3", "Concourse D", "landside", "24 hours", true),
      o("3", "Sat-1 WEST, F10", "airside", "24 hours", true),
    ],
  }),
  pie_face: restaurant({
    name: "Pie Face",
    cuisine: "Bakery",
    description: "Pie Face is an Australian bakery that makes pies from premium natural ingredients without any preservatives. This gives you a pie that is crispy, delicious, fresh and hot from the oven all day long. As their slogan says, \"Handcrafted Oven Fresh\". Their signature menu is Chunky Steak Beef Pie, but they also have more than 10 other flavors for you to try.",
    amenity: "bakery",
    outlets: [
      o("2", "MAIN TERMINAL", "airside", "24 hours", true),
      o("4", "Concourse E", "airside", "24 hours", true),
    ],
  }),
  point: restaurant({
    name: "Point",
    cuisine: "Thai / Coffee & Tea / Bakery",
    description: "Point is a convenience store for travelers seeking quick and friendly service. We offer a wide variety of freshly prepared meals, including sandwiches, bento boxes, wraps, and bakery. Additionally, the store features a selection of snacks and Thai snack, along with high-quality coffee.",
    amenity: "cafe",
    outlets: [
      o("3", "Concourse C", "airside", "24 hours", true),
      o("3", "Concourse D", "airside", "24 hours", true),
      o("3", "Concourse E", "airside", "24 hours", true),
      o("3", "Concourse F", "airside", "24 hours", true),
      o("3", "Concourse G", "airside", "24 hours", true),
    ],
  }),
  runway_khao_kaeng: restaurant({
    name: "Runway Khao Kaeng",
    cuisine: "Thai",
    description: "This is a Thai restaurant offering a variety of dishes, including Isan cuisine, southern Thai food, and many other menu items. Beverages are also available, and the menu rotates weekly. At Runway Khao Kaeng, we provide only take-away service, and customers can only pay in cash.",
    amenity: "restaurant",
    outlets: [
      o("2", "MAIN TERMINAL", "airside", "24 hours", true),
    ],
  }),
  rose: restaurant({
    name: "ROŚE",
    cuisine: "Coffee & Tea / Bakery / Desserts",
    description: "ROŚE a cafe that combines food and drinks as well as croissants, cookies, rice, desserts that are freshly made daily. We also have a variety of drinks & specialty coffee to choose from.",
    amenity: "cafe",
    outlets: [
      o("4", "Concourse G", "airside", "24 hours", true),
    ],
  }),
  thai_booster: restaurant({
    name: "Thai Booster",
    cuisine: "Thai / Juice & Smoothies",
    description: "Thai Booster food and beverage shop Opened in Concourse C, the store offers fresh, clean juices and healthy smoothies. Many good quality products To support the needs of both Thai and foreign consumers.",
    amenity: "cafe",
    outlets: [
      o("3", "Concourse B", "airside", "24 hours", true),
      o("4", "Concourse C", "airside", "24 hours", true),
      o("4", "Concourse F", "airside", "24 hours", true),
    ],
  }),
  umami_japanese_izakaya: restaurant({
    name: "Umami Japanese Izakaya",
    cuisine: "Japanese",
    description: "Amidst the bustling airport ambiance, Kinduem drew inspiration to open a lively Japanese restaurant, \"Umami Japanese Izakaya,\" known internationally for its cuisine, offering a fun and relaxed dining experience that matches the vibrant atmosphere of Suvarnabhumi Airport.",
    amenity: "bar",
    outlets: [
      o("4", "Concourse F", "airside", "24 hours", true),
    ],
  }),
  siam_orchid_sky_bar_bistro: restaurant({
    name: "Siam Orchid Sky Bar & Bistro",
    cuisine: "Thai / Japanese",
    description: "Siam Orchid Sky Bar & Bistro is a restaurant with a luxury modern Thai concept, offering a diverse range of cuisines including Thai, Italian, and Japanese dishes, as well as famous Thai street food items. All dishes are served in an elegant atmosphere infused with Thai essence. We are dedicated to creating a unique dining experience with warm and friendly service, allowing customers to savor a variety of flavors in an impressive setting.",
    amenity: "bar",
    outlets: [
      o("3", "SAT-1 East", "airside", "24 hours", true),
    ],
  }),
  siam_orchid_cafe: restaurant({
    name: "Siam Orchid Cafe",
    cuisine: "Thai / Coffee & Tea / Bakery / Desserts",
    description: "Siam Orchid Cafe is a café with a Thai-inspired concept, serving coffee made from Thai beans, tea, bakery items, and traditional Thai desserts in a cozy atmosphere. We are dedicated to creating a unique experience for coffee and dessert lovers, allowing customers to savor the flavors and culture of Thailand in every bite.",
    amenity: "cafe",
    outlets: [
      o("3", "SAT-1 West", "airside", "24 hours", true),
    ],
  }),
  dean_deluca: restaurant({
    name: "DEAN & DELUCA",
    cuisine: "Coffee & Tea / Bakery",
    description: "Dean and Deluca is a chic American-style cafe that makes you feel like you are in New York. They serve drinks and fresh baked pastries, with some of their recommended menu items being Chicken Pesto Wrap, Spicy Tuna & Egg Sandwich, Apple Cinnamon Turnover, Almond Croissant, Iced Americano, and Iced Cafe Latte. They also have souvenirs for sale, such as cloth bags, thermos cups, and many more.",
    website: "deandeluca.co.th",
    logoUrl: logo("deandeluca.co.th"),
    amenity: "cafe",
    outlets: [
      o("2", "Floor 2 (Gate D)", "landside", "Closed", false),
      o("4", "Floor 4 (Near Door 10)", "landside", "Closed", false),
      o("4", "Floor 4 (Gate A)", "landside", "Closed", false),
      o("4", "Floor 4 (Gate F)", "landside", "Closed", false),
      o("3", "SAT-1, Floor 3 (Gate S121)", "landside", "Closed", false),
    ],
  }),
  roru: restaurant({
    name: "RORU",
    cuisine: "Japanese",
    description: "RORU is a restaurant that offers Japanese cuisine and sushi in a fast-food format, focusing on convenience and quick service. We use fresh, high-quality ingredients in our cooking to ensure that customers have a delicious and satisfying dining experience.",
    amenity: "restaurant",
    outlets: [
      o("3", "SAT-1 East", "airside", "24 hours", true),
    ],
  }),
  luggaw: restaurant({
    name: "Luggaw",
    cuisine: "Juice & Smoothies",
    description: "A new kind of fruit shop caters to health-conscious customers, with the concept of \"fresh, clean, and safe.\" It offers a variety of fruits sourced directly from local farmers across the country, selling them as drinks such as blended fruit juices and cold-pressed fruit juices.This shop is committed to delivering high-quality fruits that are beneficial for health, focusing on freshness and safety in consumption.",
    amenity: "cafe",
    outlets: [
      o("2", "Floor 2, Entrance 1", "landside", "24 hours", true),
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

  const r1 = await processTerminal(AIRPORT, MAIN_TERMINAL, 'Main Terminal', mainTerminalVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([MAIN_TERMINAL]));

  const totalCreated = r1.created;
  const totalDeleted = r1.deleted;
  const totalVenues = Object.keys(mainTerminalVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
