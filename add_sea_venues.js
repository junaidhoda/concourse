'use strict';
/**
 * Fills in complete data for Seattle-Tacoma International Airport (SEA) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-18 from the
 * airport's own sites, using Claude in Chrome browser automation per explicit
 * user instruction. No third-party/aggregator source was used for any venue
 * field.
 *
 * SOURCE: https://exploresea.org/dining/ — "Explore SEA", the Port of Seattle's
 * own dining/retail/services directory for SEA, which is what
 * portseattle.org's "Dining, Retail, and Services" page sends travellers to
 * ("Check out ExploreSEA.org … to find more restaurants"). portseattle.org
 * itself carries only prose about the concessions programme, no venue list.
 * The directory and its per-venue pages are server-rendered, so both were read
 * same-origin: the 64 dining tiles off /dining/, then each tile's own
 * /concept/<slug>/ page fetched in a same-origin loop and parsed with
 * DOMParser against its labelled structure (.concept-name, the
 * .hours-table rows, .concept-nearby, .concept-description) rather than by
 * regexing free text. All 64 detail pages returned; the 64 slugs are distinct,
 * and every record came back with a name, an hours table and a description.
 *
 * EXTRACTION + VERIFICATION: the 64 records were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter, ` / ` list delimiter) with
 * every non-ASCII character replaced by a reversible `<U+hex>` escape and
 * every field whitespace-normalised in the browser before checksumming, split
 * into 5 chunks under 7,800 chars on line boundaries, written into a
 * `<pre id="dataDump">` and retrieved via get_page_text. Every chunk verified
 * EXACTLY on first pass against values computed in the browser before
 * retrieval — len/lines/checksum: 7706/14/33801684, 7724/14/34027130,
 * 7666/16/33339739, 7288/12/32521802, 3710/8/16399228 — as did the rejoined
 * 64-line dataset at len 34098, checksum 150163973, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 1 bucket, "Main Terminal". SEA is a single terminal
 * building: all ticketing/check-in is in that one building, and its own
 * Security Screening & Checkpoints page states outright that all six
 * checkpoints are in it and that "Travelers can access all gates from any
 * checkpoint" — Checkpoints 1, 2 and 3 are "Closest to A & S Gates and access
 * to all gates", 4 is "Closest to Central Terminal, B & C Gates and access to
 * all gates", 5 and 6 are "Closest to C, D, & N Gates and access to all
 * gates". So no concourse or satellite has its own check-in AND its own
 * security; every one of them fails the independence test, and the whole
 * airside is one connected sterile area. This is the same shape as DEN.
 * SEA's own directory does offer a "Terminal Locations" filter — Central
 * Terminal, A/B/C/D/N/S Gates, Pre-Security Ticketing, Pre-Security Baggage
 * Claim — but those are areas inside the one building, not terminals with
 * their own front doors, so they are carried on each outlet as location detail
 * instead of becoming buckets. ("Central Terminal" is SEA's name for the
 * post-security dining hall between Concourses B and C, not a terminal.)
 *
 * SCOPE: all 64 records SEA files under Dining are included, including the 14
 * openings in the new C Concourse Expansion that SEA lists with published
 * hours and a "Grand Opening – 6/11/26" note in place of a description; that
 * note is kept verbatim as the description rather than being dropped or
 * replaced.
 *
 * AIRSIDE / LANDSIDE: from SEA's own Terminal-Locations facet, whose two
 * landside values say so in their own labels — "Pre-Security Ticketing" and
 * "Pre-Security Baggage Claim" → `landside`, every other value → `airside`.
 * 61 airside, 3 landside (Neighborhood Cafe and Sourced Market at Ticketing,
 * Starbucks at Baggage Claim 6). This agrees with the Port's own statement
 * that SEA has "+50 dining options throughout the post-security areas".
 *
 * LEVEL: BLANK on every outlet. SEA's directory publishes no floor or level.
 *
 * LOCATION_NOTES: SEA's own Terminal-Locations label(s) for the venue plus its
 * own "nearby" line, deduplicated where one contains the other — so "A Gates,
 * Near Gate A4", "Central Terminal" (where the label and the nearby line are
 * the same string), "Pre-Security Baggage Claim, Near Baggage Claim 6". Where
 * SEA files a venue under two of its own location values, both are kept:
 * QDOBA Mexican Eats is tagged B Gates AND Central Terminal. For the venues
 * whose name carries the location in brackets, that bracket is moved here too
 * (see below), which is what keeps the five Starbucks outlets distinguishable.
 *
 * NAME vs LOCATION: SEA disambiguates repeated brands with a bracket —
 * "Starbucks (A Gates)", "Skillet (N Gates)", "Caffé D'arte (N Gates)". The
 * doc `name` is the brand; the bracket is treated as location detail and moved
 * into location_notes.
 *
 * MULTI-OUTLET HANDLING: SEA is one bucket, so every same-brand venue merges
 * into one doc with one `outlets[]` entry per unit. That gives Starbucks 5
 * outlets (A, B, C and D Gates plus Baggage Claim), Skillet 2 (C and N Gates)
 * and Caffé D'arte 2 (A and N Gates). Brand matching is case-, accent- and
 * apostrophe-insensitive, which is what folds SEA's own inconsistent rendering
 * of "Caffe D'arte" (A Gates tile) and "Caffé D'arte" (N Gates tile); the
 * accented spelling is used for the doc because that is the one SEA's own
 * descriptions use for both. Distinctly NAMED venues stay separate per this
 * dataset's page-truth-over-label precedent: "Starbucks" vs "Starbucks
 * Evenings"; "Neighborhood Cafe" vs "Neighborhood Bubble Tea & Coffee";
 * "Salty's at the SEA" vs "BrewTop Social" (which SEA describes as the level
 * above Salty's). 64 records → 58 docs.
 *
 * CUISINE: the verbatim join of SEA's own "Features" tags for the venue, in
 * SEA's own filter order and unfiltered — "Beer, Cocktails & Wine",
 * "Coffee Shops", "Quick-Service", "Restaurants (sit-down)". These are read
 * from the class tokens SEA puts on its own directory tile, which are exactly
 * what its own Features filter matches on.
 *
 * AMENITY: derived from those same Features tags, with two name-based
 * corrections that are themselves taken from the venue's own name. Order: a
 * name that says Food Hall / Food Court → `food_court` (Capitol Hill Food
 * Hall, which SEA describes as "a bustling urban foodie market featuring some
 * of Seattle's best plates" from Chowder Shack, Grand Central Bakery, Salt &
 * Straw and Caffe Ladro); then Restaurants (sit-down) → `restaurant`; then
 * Coffee Shops → `cafe`; then Quick-Service → `fast_food`. NOTE ON `bar`:
 * SEA's "Beer, Cocktails & Wine" tag is a SERVICE flag, not a venue type — it
 * sits on Pallino, Pei Wei, QDOBA and Lucky Louie Fish Shack — so it is never
 * on its own grounds for `bar`. A venue is promoted to `bar` only where SEA's
 * own NAME says the venue is a drinks room and its own DESCRIPTION agrees,
 * which is true of exactly four: Open Space Tap Room ("a beer 'garden' with
 * sweeping floor to ceiling airport views"), Vyne Washington Tasting Room ("an
 * interactive wine voyage"), Village Pub ("a modern twist on a traditional
 * English pub") and Seattle Beer Union ("a taste of the best spirits, wines,
 * and brews from Washington breweries"). Venues whose names merely carry a
 * drinks word are NOT promoted, because their own descriptions contradict it:
 * Africa Lounge ("the restaurant features savory Spicy Beef Sambusas"),
 * Mountain Room ("Delicious breakfast options include chicken fried steak"),
 * Rel'Lish Burger Lounge, Bad Egg Breakfast Bar, EMBARQUE Whiskey Grill,
 * Ballard Brew Hall and BrewTop Social (both of which SEA describes as a
 * full-service bar AND restaurant with a full food menu). Resulting mix:
 * 28 restaurant, 17 cafe, 14 fast_food, 4 bar, 1 food_court.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: blank on every doc. SEA
 * publishes no dietary tag or filter. Several descriptions mention vegetarian,
 * vegan or gluten-free dishes in prose (Floret by Café Flora, Dish D'Lish),
 * but prose is not a tag, so no venue is flagged rather than guessed.
 *
 * OPENING HOURS: verbatim from each venue's own hours table, one row per
 * published day-group, joined with "; " — "Monday, Tuesday, Wednesday &
 * Saturday 6 a.m. - 8 p.m.; Thursday, Friday & Sunday 6 a.m. - 9 p.m.", and
 * where SEA publishes separate service hours it keeps its own labels
 * ("Grab & Go: …; Dine-in: …" at Floret; "Dine-In …; Take-Out …" at Poke to
 * the Max). All 64 outlets carry hours. SEA's own oddity at Smith Cove
 * ("6 a.m. - 12 p.m.") is left as published.
 *
 * OPEN 24/7: set on the 3 outlets whose whole hours string is SEA's own
 * standing "Open 24 hours" — Dilettante Mocha Café, QDOBA Mexican Eats and
 * Starbucks Evenings, all in the Central Terminal. The match is anchored to
 * the whole string.
 *
 * DESCRIPTION: verbatim from each venue's own page, whitespace-normalised,
 * paragraph breaks collapsed to spaces. Where SEA publishes only its opening
 * note that note is the description.
 *
 * PHONE: blank on every doc. SEA's directory publishes no phone number.
 *
 * WEBSITE / LOGO: SEA publishes NO website for any venue — its concept pages
 * carry an uploaded logo image and no outbound link. Following this dataset's
 * KUL/MIA precedent, `website` (and the logo.dev logo derived from it) is set
 * only for brands whose primary domain is not in doubt — Starbucks (and
 * Starbucks Evenings), McDonald's, Wendy's, P.F. Chang's, QDOBA Mexican Eats,
 * Chili's, Buffalo Wild Wings, Peet's Coffee, Costa Coffee, Manchu WOK, Port
 * of Subs, Pei Wei Asian Kitchen, Caffe Vita, Dilettante Mocha Café, Salty's
 * at the SEA, Skillet, Beecher's Handmade Cheese, Lil Woody's, Olympia Coffee
 * and Great State Burger — and left BLANK for every other concept (Africa
 * Lounge, Ballard Brew Hall, BrewTop Social, Capitol Hill Food Hall, Caffé
 * D'arte, Camden Food Co., Dish D'Lish, EMBARQUE Whiskey Grill, Evergreens,
 * Floret by Café Flora, Greedy Cow Burger, Hachi-ko, Koi Shi Sushi Bento, Le
 * Grand Comptoir, LouLou Market and Bar, Lucky Louie Fish Shack, Mi Casa
 * Cantina, Moe's Indian Kitchen, Mountain Room, Nanny's Northwest BBQ Joint,
 * the two Neighborhood concepts, Ninth & Pike, Open Space Tap Room, Pallino,
 * Poke to the Max, Rel'Lish Burger Lounge, Seattle Beer Union, Seattle Dawg
 * House, Sky Gamerz, Smith Cove, Sourced Market, Village Pub, Vyne Washington
 * Tasting Room, Wanderlust and Bad Egg Breakfast Bar) rather than guessed.
 *
 * VERIFIED TOTALS: 64 source dining records → 58 restaurant docs / 64 outlets,
 * all in the single Main Terminal bucket.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['sea', 'seattle', 'seattle-tacoma'];
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

// ─── Main Terminal ───

const mainTerminalVenues = {
  africa_lounge: restaurant({
    name: "Africa Lounge", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Celebrating African and American cuisine, the restaurant features savory Spicy Beef Sambusas, African inspired cocktails, and wines from South African Regions. A full bar offers local draft beer including Mac & Jack’s African Amber and other local favorite selections. Appetizers include super nachos, chicken wings, and hummus and pita. Dessert choices include cheesecake and ice cream. <NL> Africa Lounge is exotically decorated with an African motif, furnished with leopard prints, hand-painted murals, and a custom-crafted elephant head. The restaurant also has surround-sound music and four televisions for viewing sports and the latest news.",
    outlets: [
      o("", "A Gates, Near Gate A4", "airside", "Monday, Tuesday, Wednesday & Saturday 6 a.m. - 8 p.m.; Thursday, Friday & Sunday 6 a.m. - 9 p.m."),
    ],
  }),
  bad_egg_breakfast_bar: restaurant({
    name: "Bad Egg Breakfast Bar", cuisine: "Beer, Cocktails & Wine, Quick-Service, Restaurants (sit-down)", amenity: "restaurant",
    description: "This hip spot’s energy is like none other – local, rebellious, and downright cool. Vintage elements complement the breakfast bar’s warm and modern ambiance, giving travelers the feel of a new-school urban diner – complete with new takes on breakfast classics and an extensive Bloody Mary menu.",
    outlets: [
      o("", "N Gates, Near Gate N5", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  ballard_brew_hall: restaurant({
    name: "Ballard Brew Hall", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Ballard Brew Hall is a full-service bar and restaurant where travelers are invited to relax over a roster of eight tap handles featuring the finest beers in the region as well as the world. Serving all day parts, travelers can enjoy seasonal plates—from farmhouse eggs and skillet platters in the morning, to Dungeness crab cakes, pulled pork sandwiches, pan roasted chicken, warming soups, healthy salads and flatbreads served throughout the day. Ballard’s menu is fresh-forward with on-trend, elevated plates made from the region’s best, locally-sourced ingredients.",
    outlets: [
      o("", "D Gates, Near Gate D7", "airside", "Sunday - Saturday 6 a.m. - 11 p.m."),
    ],
  }),
  bambuza_vietnam_kitchen_bar: restaurant({
    name: "Bambuza Vietnam Kitchen & Bar", cuisine: "Beer, Cocktails & Wine, Quick-Service, Restaurants (sit-down)", amenity: "restaurant",
    description: "Bambuza Vietnam Kitchen & Bar proudly offers cherished family recipes, with freshly prepared Vietnamese food supporting local farmers and producers. The inviting decor provides a casual sit-down dining experience featuring a full bar with specialty coffees, beer on tap, as well as the cuisine favorite Vietnamese coffee. For your convenience, Bambuza also offers plane-ready take-out options.",
    outlets: [
      o("", "N Gates, Near Gate N19", "airside", "Sunday - Saturday 5 a.m. - 11 p.m."),
    ],
  }),
  beechers_handmade_cheese: restaurant({
    name: "Beecher's Handmade Cheese", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "Located in Seattle’s Pike Place Market and New York City’s Flatiron District, visitors to Beecher’s glass-walled cheesemaking kitchens witness firsthand the crafting of their signature Flagship cheese, as well as many of the other award-winning cheeses Beecher’s has to offer. Visitors to Beecher’s at SEA International Airport can enjoy delicious cheeses and other artisan foods, including Beecher’s “World’s Best” Mac & Cheese, Pacific Northwest artisan cheeses, grilled breakfast and lunch sandwiches, fresh salads, and Caffee Vita espresso drinks.",
    website: "beechershandmadecheese.com", logoUrl: logo("beechershandmadecheese.com"),
    outlets: [
      o("", "N Gates, Near Gate N11", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
    ],
  }),
  brewtop_social: restaurant({
    name: "BrewTop Social", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Located above Salty’s at the SEA in the Central Terminal, BrewTop Social is an “open-air” dining experience, with expansive views of the airfield. Enjoy a rotating selection of craft beers, cocktails, and a breakfast/lunch/dinner menu – all while being immersed in natural lighting and the spectacular window views!",
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 5 a.m. - 12 a.m."),
    ],
  }),
  buffalo_wild_wings: restaurant({
    name: "Buffalo Wild Wings", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Grand Opening – 6/11/26",
    website: "buffalowildwings.com", logoUrl: logo("buffalowildwings.com"),
    outlets: [
      o("", "C Gates, Near Gate C2", "airside", "Sunday - Saturday 5 a.m. - 11 p.m."),
    ],
  }),
  caffe_vita: restaurant({
    name: "Caffe Vita", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "Caffe Vita roasts coffee by hand, highlighting the intentionality and craft of the farmer. Building a community of producers, loyal customers, and purposeful connections motivates the brand as much as creating the perfect blend. Together, the goal is to positively impact the future of coffee, and the individuals that keep the industry thriving. At the SEA Airport roasterie the coffee is always fresh and hand-roasted on-site.",
    website: "caffevita.com", logoUrl: logo("caffevita.com"),
    outlets: [
      o("", "N Gates, Near Gate N11", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
    ],
  }),
  caffe_darte: restaurant({
    name: "Caffé D'arte", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "As the premier Northwest artisan coffee roaster, Caffé D’arte was founded in Seattle in the 1980’s by Italian espresso master Mauro Cipolla. Along with offering award-winning coffee drinks, Caffé D’arte features quality pastries from Macrina Bakery and Alki Bakery, and an Italian-inspired menu featuring made-to-order pizza, grilled sandwiches, hot breakfast items, and fresh grab-to-go sandwiches and salads, all prepared on-site every day with the highest quality.",
    outlets: [
      o("", "N Gates, Near Gate N13", "airside", "Sunday - Saturday 4:30 a.m. - 10 p.m."),
      o("", "A Gates, Near Gate A10", "airside", "Sunday - Saturday 4:30 a.m. - 9 p.m."),
    ],
  }),
  camden_food_co: restaurant({
    name: "Camden Food Co.", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "Camden Food Co. brings a balanced approach to traveler’s dining choices, providing an airside marketplace filled with healthy options alongside indulgent yet affordably priced treats. From fresh, gourmet salads, artisan sandwiches and a wide range of hot and cold drink options, to nutrient-dense snacks and freshly baked treats to grab-and-go, there’s something for every taste and dietary preference.",
    outlets: [
      o("", "D Gates, Near Gate D5", "airside", "Sunday - Saturday 4:30 a.m. - 9 p.m."),
    ],
  }),
  capitol_hill_food_hall: restaurant({
    name: "Capitol Hill Food Hall", cuisine: "Beer, Cocktails & Wine, Coffee Shops, Quick-Service", amenity: "food_court",
    description: "Travelers are invited to a bustling urban foodie market featuring some of Seattle’s best plates, drinks and gourmet food products while listening to live music performances. Highlights include award-winning chowder from Chowder Shack; Grand Central Bakery’s gourmet sandwiches; Salt & Straw artisan ice cream; and, Caffe Ladro coffee. Burgers, artisan pizzas, Washington State wines as well as local craft beers on tap is also available. In the general store area, travelers can find regional craft sodas and cold-pressed juices as well as sweet and savory snacks.",
    outlets: [
      o("", "A Gates, Near Gate A4", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Grand Opening – 6/11/26",
    website: "chilis.com", logoUrl: logo("chilis.com"),
    outlets: [
      o("", "C Gates, Near Gate C2", "airside", "Sunday - Saturday 5 a.m. - 11 p.m."),
    ],
  }),
  costa_coffee: restaurant({
    name: "Costa Coffee", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "The Costa Coffee experience at SEA will be customizable for travelers to get what they need to fuel up for their journey. The location offers full-service barista crafted food and drinks, a self-service brewed coffee and quick-to-go sandwich and snack station, self-service order kiosks, and a Smart Café machine for 24/7 hot and iced espresso drinks.",
    website: "costacoffee.com", logoUrl: logo("costacoffee.com"),
    outlets: [
      o("", "N Gates, Near Gate N10", "airside", "Sunday - Saturday 4:30 a.m. - 9:30 p.m."),
    ],
  }),
  dilettante_mocha_cafe: restaurant({
    name: "Dilettante Mocha Café", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "Dilettante was founded in 1976 in downtown Seattle by 3rd generation chocolatier, Dana Davenport. Dana expertly paired his melted chocolates with select blends of coffee to create the unparalleled beverages available at the Café today. In addition to the drinks on the signature mocha menu, Dilettante offers a wide variety of hand crafted chocolates and desserts, both for personal consumption and gifts in beautiful packaging. Truly one of Seattle’s best chocolatiers, Dilettante offers a unique chance to indulge or show someone you truly care.",
    website: "dilettante.com", logoUrl: logo("dilettante.com"),
    outlets: [
      o("", "Central Terminal", "airside", "Open 24 hours", true),
    ],
  }),
  dish_dlish: restaurant({
    name: "Dish D'Lish", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Local Chef Kathy Casey’s Dish D’Lish offers Healthy Food T’ Go Go® options made fresh daily featuring Northwest inspired salads, sandwiches, and snacks. As well as many gluten-free friendly and vegetarian options such as Chia Oat Berry Cups or Mediterranean Quinoa Salad. Travelers in need of a unique local gift can also purchase Kathy’s latest cookbooks and specialty products.",
    outlets: [
      o("", "C Gates, Near Gate C11", "airside", "Sunday - Saturday 3:30 a.m. - 11:30 p.m."),
    ],
  }),
  embarque_whiskey_grill: restaurant({
    name: "EMBARQUE Whiskey Grill", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Embarque Whiskey Grill celebrates as the Best Bar Experience for the 2025 Airport Experience Awards! Located in the N Concourse, enjoy a comfortable and relaxed atmosphere with a delicious menu and delightful drinks. Of course, don’t forget to taste our “Whiskey of the Week” before boarding your flight!",
    outlets: [
      o("", "N Gates, Near Gate N3", "airside", "Sunday - Saturday 6 a.m. - 11 p.m."),
    ],
  }),
  evergreens: restaurant({
    name: "Evergreens", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Evergreens is a made-to-order, fast-casual restaurant concept serving healthy and delicious salads, wraps, and warm grain bowls. Throughout the Pacific Northwest, Evergreens is known for their fresh, natural cuisine made with premium, seasonal ingredients that make every meal a delight. Evergreens has locations within the Greater Seattle and Portland areas, including at SEA airport. <NL> Looking for a healthy meal that is fulfilling and won’t slow down your active lifestyle? Evergreens has you covered!",
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 6:30 a.m. - 10 p.m."),
    ],
  }),
  floret_by_cafe_flora: restaurant({
    name: "Floret by Café Flora", cuisine: "Beer, Cocktails & Wine, Coffee Shops, Quick-Service, Restaurants (sit-down)", amenity: "restaurant",
    description: "Floret by Café Flora is a full service restaurant and bar featuring sit-down and grab-and-go options. The menu features flavorful and creative vegetarian, vegan and gluten free dishes that utilize fresh and organic produce from local farms. Floret is committed to showcasing beloved local vendors through their partnerships with Stumptown Coffee Roasters, Rachel’s Ginger Beer, Mystic Kombucha and Fran’s Chocolates, among many others.",
    outlets: [
      o("", "A Gates, Near Gate A1", "airside", "Grab & Go: Sunday - Saturday 4:30 a.m. - 8 p.m.; Dine-in: Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  great_state_burger: restaurant({
    name: "Great State Burger", cuisine: "Restaurants (sit-down)", amenity: "restaurant",
    description: "Grand Opening – 6/11/26",
    website: "greatstateburger.com", logoUrl: logo("greatstateburger.com"),
    outlets: [
      o("", "C Gates, Near Gate C2", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
    ],
  }),
  greedy_cow_burger: restaurant({
    name: "Greedy Cow Burger", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Greedy Cow Burger’s juicy lip-smacking, gourmet burgers are made to order, piled high with all the fixin’s and plated with triple cooked fries, skin on, and dusted with salt and rosemary. Greedy Cow Burger uses fresh humanely raised, all-natural beef. The quick-service restaurant also provides a selection of salads, sandwiches and sides, made using only high-quality ingredients.",
    outlets: [
      o("", "S Gates, Near Gate S3", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  hachi_ko: restaurant({
    name: "Hachi-ko", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Faithful dog Hachi-ko is remembered in Japan for his remarkable loyalty. He would wait diligently for his owner’s return from work, which continued even years after his passing. Hachi-ko builds upon these beliefs as your “faithful gathering spot” at SEA International Airport. <NL> Hachi-ko offers authentic Northwest-inspired Asian cuisine featuring freshly grilled teriyaki items, fresh high-quality sushi and poké, chicken adobo, yakisoba, fried rice, hot Portuguese sausage, eggs and rice breakfast, along with on-site prepared grab-to-go sandwiches and salad items – all prepared with the same devotion and care.",
    outlets: [
      o("", "C Gates, Near Gate C10F", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
    ],
  }),
  koi_shi_sushi_bento: restaurant({
    name: "Koi Shi Sushi Bento", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Koi Shi Sushi Bento is conveniently located in the Central Terminal where travelers can enjoy freshly prepared sushi with only the finest ingredients. Travelers also can also delight in their own poke bowl creations as well.",
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 9 a.m. - 11 p.m."),
    ],
  }),
  le_grand_comptoir: restaurant({
    name: "Le Grand Comptoir", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Wine lovers rejoice—Le Grand Comptoir is a multi award-winning, beautifully designed, full-service travel oasis. Travelers can sit and wind down over a glass of premium wine hand-picked from the region’s as well as the world’s best vineyards, paired with bistro-inspired plates designed to match the delight and gratification of the drink choice. Travelers can choose from a range of small plates, a vast selection of local cheeses and charcuterie, large tartines and seasonal salads.",
    outlets: [
      o("", "C Gates, Near Gate C10F", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  lil_woodys: restaurant({
    name: "Lil Woody's", cuisine: "Beer, Cocktails & Wine, Quick-Service, Restaurants (sit-down)", amenity: "restaurant",
    description: "Lil Woody’s Burgers & Shakes has never been just another burger joint. Every day, the team serves up fast and fresh meals and snacks with quality and creativity. But, here’s the thing – they take as much pride in the people and environment as their food. That’s for real.",
    website: "lilwoodys.com", logoUrl: logo("lilwoodys.com"),
    outlets: [
      o("", "N Gates, Near Gate N8", "airside", "Sunday - Saturday 6 a.m. - 10:30 p.m."),
    ],
  }),
  loulou_market_and_bar: restaurant({
    name: "LouLou Market and Bar", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "LouLou Market and Bar is a French-meets-Pacific Northwest restaurant and market inspired by the late James Beard award-winning Chef Thierry Rautureau – affectionately nicknamed The Chef in the Hat. The menu features delectable choices such as Nicoise Classique, turkey Florentine and prime rib French dip sandwiches, a variety of quiches, and delciously sweet specialty crepes.",
    outlets: [
      o("", "B Gates, Near Gate B3", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  lucky_louie_fish_shack: restaurant({
    name: "Lucky Louie Fish Shack", cuisine: "Beer, Cocktails & Wine, Quick-Service", amenity: "fast_food",
    description: "Lucky Louie Fish Shack® is proud to serve NW inspired seafood classics. We feature Fish & Chips made with wild and sustainable Alaska Pollock or Salmon, creamy Clam Chowder, Honey Teriyaki Salmon and classic NW Shrimp Louie Salad. We also offer great non-seafood options and seasonal specials. For the early traveler Lucky Louie offers tasty breakfast sandwiches and local coffee. Craving something sweet? Treat yourself to one of our signature Soft Serve Swirls or Frozen Lemonades. It’s all served up fresh and fast!",
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
    ],
  }),
  manchu_wok: restaurant({
    name: "Manchu WOK", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Curb your cravings for fast and fresh Chinese cuisine at Manchu WOK. Offering a variety of Cantonese, Szechwan, Hunan, and Mandarin-style cooking; enjoy a wide selection of authentic dishes served buffet style. Utilizing only the highest quality ingredients, all of the produce is hand-cut, with dishes prepared fresh on-site daily. Customize your plate and choose from a variety of 1, 2 or 3 items served with a choice of rice or noodles. <NL> For more than 30 years, Manchu WOK has proudly served 300 million meals a year at 160 stores worldwide.",
    website: "manchuwok.com", logoUrl: logo("manchuwok.com"),
    outlets: [
      o("", "A Gates, Near Gate A4", "airside", "Sunday - Saturday 6 a.m. - 8 p.m."),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Burgers, Fries & More. Always a well-known favorite. McDonald’s offers a full breakfast menu until 10:30 a.m. daily, with the full regular menu starting from 10 a.m. daily. A full line of McCafe beverages available all day, including mochas, lattes, decadent frappes and real fruit smoothies.",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    outlets: [
      o("", "B Gates, Near Gate B1", "airside", "Sunday - Saturday 4 a.m. - 11 p.m."),
    ],
  }),
  mi_casa_cantina: restaurant({
    name: "Mi Casa Cantina", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Mi Casa brings the fiesta airside in a fun-filled, modern Cantina environment. A full-service bar and restaurant where everything is made to order. Menu includes fresh daily baked tortas and burritos, as well as house-made guacamole, pico de gallo, salsas, chips, salads, fresh fruit, and sweet treats. Cocktails are hand-crafted and the drink menu features specialty agua frescas, as well as a diverse list of boutique tequilas and mezcals.",
    outlets: [
      o("", "B Gates, Near Gate B8", "airside", "Sunday - Saturday 6 a.m. - 9 p.m."),
    ],
  }),
  moes_indian_kitchen: restaurant({
    name: "Moe's Indian Kitchen", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Moe’s Indian Kitchen specializes in authentic Indian cuisine with the convenience of takeout! Savor the flavors of traditional entrees and specials including Naan Breakfast, Laksa Noodles, Chicken Tikka Masala and various curry options.",
    outlets: [
      o("", "S Gates, Near Gate S9", "airside", "Sunday - Saturday 7 a.m. - 8:30 p.m."),
    ],
  }),
  mountain_room: restaurant({
    name: "Mountain Room", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Mountain Room is a cozy, rustic lounge with a fireplace and hand painted mural featuring Mount Rainier. The restaurant has surround-sound music and three televisions for viewing sports and the latest news. <NL> The Mountain Room features a full bar offering a variety of local draft beer and local spirits. Delicious breakfast options include chicken fried steak, omelets, and more. The lunch menu includes clam chowder, house salads, burgers, and sandwiches.",
    outlets: [
      o("", "A Gates, Near Gate A14", "airside", "Sunday - Saturday 6 a.m. - 7 p.m."),
    ],
  }),
  nannys_northwest_bbq_joint: restaurant({
    name: "Nanny's Northwest BBQ Joint", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Grand Opening – 6/11/26",
    outlets: [
      o("", "C Gates, Near Gate C2", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
    ],
  }),
  neighborhood_bubble_tea_coffee: restaurant({
    name: "Neighborhood Bubble Tea & Coffee", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "Welcome to SEA Airport’s first bubble/boba tea shop! Neighborhood Bubble Tea & Coffee offers a wide selection of milk teas and a signature coffee selection. <NL> Enjoy signature milk teas with Filipino roots including a Leche Flan Milk Tea and Turon Turon Black Milk Tea with jackfruit, banana syrup, and brown sugar. The shop also offers a traditional Thai Milk Tea and Lychee Passionfruit Tea. <NL> We partner with local roaster Fulcrum Coffee for our selection of coffee, espresso, and cold brew. Signature espresso drinks include a black sesame latte topped with black sesame cream, a house-brewed Vietnamese iced coffee, and a pandan latte. And of course, there’s an ube latte too!",
    outlets: [
      o("", "D Gates, Near Gate D21", "airside", "Sunday - Saturday 4 a.m. - 7 p.m."),
    ],
  }),
  neighborhood_cafe: restaurant({
    name: "Neighborhood Cafe", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "This beloved SEA café serves signature Filipino-inspired sips and snacks. Try an ube latte, coconut matcha, or a seasonal special. Pair your drink with a hand-baked croissant sandwich, butter mochi, cinnamon roll, Rice Krispie treat, or cookie. And of course, there is a selection of savory grab-and-go snacks for your convenience as well!",
    outlets: [
      o("", "Pre-Security Ticketing, Near Checkpoint 4", "landside", "Sunday - Saturday 4 a.m. - 9 p.m."),
    ],
  }),
  ninth_pike: restaurant({
    name: "Ninth & Pike", cuisine: "Beer, Cocktails & Wine, Quick-Service, Restaurants (sit-down)", amenity: "restaurant",
    description: "Ninth & Pike. Elevated Food. Lifted Spirits. <NL> Ninth & Pike’s menu satisfies breakfast, lunch, and dinner demand for healthy, Northwest inspired paninis, soups, and salads. To top off the menu, a selection of wines, bubbles, rose, and beer are also available.",
    outlets: [
      o("", "C Gates, Near Gate C10", "airside", "Sunday - Saturday 5:30 a.m. - 11 p.m."),
    ],
  }),
  olympia_coffee: restaurant({
    name: "Olympia Coffee", cuisine: "Coffee Shops", amenity: "cafe",
    description: "Grand Opening – 6/11/26",
    website: "olympiacoffee.com", logoUrl: logo("olympiacoffee.com"),
    outlets: [
      o("", "C Gates, Near Gate C2", "airside", "Sunday - Saturday 4 a.m. - 10 p.m."),
    ],
  }),
  open_space_tap_room: restaurant({
    name: "Open Space Tap Room", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "bar",
    description: "Open Space Tap Room is a beer “garden” with sweeping floor to ceiling airport views. Travelers can enjoy a variety of Northwest craft beers with a delicious selection of burgers, flatbread pizza, sandwiches, healthy granola & fruit bowls, and so much more!",
    outlets: [
      o("", "N Gates, Near Gate N10", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  p_f_changs: restaurant({
    name: "P.F. Chang's", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Experience P.F. Chang’s – an internationally recognized Asian culinary brand at SEA Airport. Enjoy global favorites with sweeping views of the North Concourse, including planes landing and taking off. Truly, one of the best views of any restaurant at the airport! <NL> Although P.F. Chang’s has roots in Chinese cuisine, today’s menu spans across all of Asia, honoring cultures and recipes from Japan, Korea, Thailand, and beyond. Each menu item offers a unique exploration of flavor, whether it’s a handcrafted cocktail, wok-fired lunch bowl, or celebratory multi-course dinner. Open daily.",
    website: "pfchangs.com", logoUrl: logo("pfchangs.com"),
    outlets: [
      o("", "N Gates, Near Gate N11", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  pallino: restaurant({
    name: "Pallino", cuisine: "Beer, Cocktails & Wine, Quick-Service", amenity: "fast_food",
    description: "Pallino, established in 1999, has been serving SEA travelers at their Central Terminal location since 2005. Pallino’s mission is to provide outstanding food and hospitality serving some of the best pizza, pasta, salad, sandwiches, and other Italian specialties in town.",
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 5 a.m. - 11 p.m."),
    ],
  }),
  peets_coffee: restaurant({
    name: "Peet's Coffee", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "Peet’s Coffee is a U.S. specialty coffee company founded by Alfred Peet in 1966 in Berkeley, California. Known for their small batches, fresh beans and a superior quality roast that is rich and complex. Today, Peet’s upholds its commitment to delivering a premium product by continuing to source the world’s best beans, hand-roast in small batches, and craft every beverage by hand. <NL> Peet’s Coffee, the Original Craft Coffee.",
    website: "peets.com", logoUrl: logo("peets.com"),
    outlets: [
      o("", "S Gates, Near Gate S9", "airside", "Sunday - Saturday 5 a.m. - 9 p.m."),
    ],
  }),
  pei_wei_asian_kitchen: restaurant({
    name: "Pei Wei Asian Kitchen", cuisine: "Beer, Cocktails & Wine, Quick-Service", amenity: "fast_food",
    description: "Pei Wei places an emphasis on preparing handcrafted dishes with fresh, house-chopped veggies and whole cuts of white-meat chicken and grass-fed flank steak. The food is house-made by expert chefs right when you order to ensure your dietary needs and flavor preferences are met at the highest level. <NL> Pei Wei adheres to quality standards that are unmatched by the competition. The result? Food that’s fresh, fast, and flavorful. That’s Pei Wei.",
    website: "peiwei.com", logoUrl: logo("peiwei.com"),
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 7 a.m. - 11 p.m."),
    ],
  }),
  poke_to_the_max: restaurant({
    name: "Poke to the Max", cuisine: "Beer, Cocktails & Wine, Quick-Service, Restaurants (sit-down)", amenity: "restaurant",
    description: "Award winning chef, author, and proclaimed, “God Father of Poke” Chef Sam Choy offers a true taste of Hawai’i! All the menu dishes represent the various fusions that makes Hawai’i’s food so ONO! Don’t be fooled by the name, because they serve more than just fresh poke. Stop in for Spam Musubi, Loco Moco, their famous Garlic Chicken, and much more. Escape with Poke to the Max and enjoy local style plate lunch, with a little Aloha in every bite.",
    outlets: [
      o("", "D Gates, Near Gate D6", "airside", "Dine-In Saturday - Wednesday 6 a.m. - 8 p.m.; Dine-In Thursday - Friday 6 a.m. - 10 p.m.; Take-Out Saturday - Wednesday 4 a.m. - 8 p.m.; Take-Out Thursday - Friday 4 a.m. - 10 p.m."),
    ],
  }),
  port_of_subs: restaurant({
    name: "Port of Subs", cuisine: "Quick-Service", amenity: "fast_food",
    description: "Grand Opening – 6/11/26",
    website: "portofsubs.com", logoUrl: logo("portofsubs.com"),
    outlets: [
      o("", "C Gates, Near Gate C2", "airside", "Sunday - Saturday 6 a.m. - 8 p.m."),
    ],
  }),
  qdoba_mexican_eats: restaurant({
    name: "QDOBA Mexican Eats", cuisine: "Beer, Cocktails & Wine, Quick-Service", amenity: "fast_food",
    description: "QDOBA is a fast-casual Mexican restaurant with more than 730 locations in the U.S. and Canada. <NL> Committed to delivering flavor to people’s lives, QDOBA uses ingredients prepared in-house, by hand, and fresh throughout the day, to create delicious menu options. Guests can experience QDOBA’s delicious flavors by enjoying one of its signature menu options that are chef-crafted for convenience and ease, or by customizing their burritos, tacos, burrito bowls, salads, quesadillas, and nachos to fit their personal tastes. For two years running, QDOBA has been voted the “Best Fast Casual Restaurant” as part of the USA Today 10Best Readers’ Choice Awards.",
    website: "qdoba.com", logoUrl: logo("qdoba.com"),
    outlets: [
      o("", "B Gates, Central Terminal", "airside", "Open 24 hours", true),
    ],
  }),
  rellish_burger_lounge: restaurant({
    name: "Rel'Lish Burger Lounge", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Rel’Lish™ Burger Lounge offers unique handcrafted burgers, flavorful salads, tasty appetizers, and breakfast offerings, all with a local Northwest flair by local Chef Kathy Casey. Rel’Lish was highlighted as one of the top 10 USA airport bars and features a wide selection of signature cocktails, including Cocktails On-Tap made with premium spirits and fresh juices, as well as local beer & wines, all in a mid-century modern inspired venue. Healthy options from Casey’s Dish D’Lish® are available in the grab and go case.",
    outlets: [
      o("", "B Gates, Near Gate B4", "airside", "Sunday - Saturday 4:45 a.m. - 11 p.m."),
    ],
  }),
  saltys_at_the_sea: restaurant({
    name: "Salty's at the SEA", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Iconic and acclaimed in the region, Salty’s at the SEA offers a full-service seafood restaurant featuring a true Pacific Northwest menu with fresh, local ingredients in the Central Terminal. Complementing Salty’s at the SEA upstairs is BrewTop Social, an open air concept that features an expansive rotating selection of local breweries.",
    website: "saltys.com", logoUrl: logo("saltys.com"),
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  seattle_beer_union: restaurant({
    name: "Seattle Beer Union", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "bar",
    description: "Seattle Beer Union, inspired by the Pacific Northwest’s beer scene, travelers can now experience a taste of the best spirits, wines, and brews from Washington breweries, distilleries, and wineries. To complement the beverage offerings, travelers can also feast on a menu that includes delicious breakfast burritos, flatbreads, burgers, salads, and sandwiches.",
    outlets: [
      o("", "A Gates, Near Gate A10", "airside", "Sunday - Saturday 5 a.m. - 11 p.m."),
    ],
  }),
  seattle_dawg_house: restaurant({
    name: "Seattle Dawg House", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Seattle Dawg House serves up fresh food in a modern sports-bar atmosphere. Enjoy some sports, drinks, delicious food, and of course, the iconic Seattle Dog – located conveniently in the D Concourse.",
    outlets: [
      o("", "D Gates, Near Gate D3", "airside", "Sunday - Saturday 6:30 a.m. - 8 p.m."),
    ],
  }),
  skillet: restaurant({
    name: "Skillet", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Introducing Skillet’s second location at SEA in the C Concourse! <NL> Skillet redefines modern American food: approachable, upscale, prepared with classic technique, and using local and seasonal ingredients. The original street food business, which operated from a vintage Airstream trailer-turned commercial kitchen, now includes multiple restaurants, a line of food products and three food trucks. The core principles that inspired this growth remain the same: flavorful food prepared with care, the best ingredients, and an innovative experience that consistently surprises and satisfies. In short, Skillet is a modern diner, born on the streets of Seattle, famous for its all-day brunch menu delivering elevated street food to Seattle world travelers.",
    website: "skilletfood.com", logoUrl: logo("skilletfood.com"),
    outlets: [
      o("", "N Gates, Near Gate N18", "airside", "Sunday - Saturday 5 a.m. - 10 p.m."),
      o("", "C Gates, Near Gate C10", "airside", "Sunday - Saturday 4 a.m. - 11 p.m."),
    ],
  }),
  sky_gamerz: restaurant({
    name: "Sky Gamerz", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Sky Gamerz is a premier gaming lounge located in the N Concourse, offering travelers a dynamic space to relax, play, and connect. Featuring retro consoles with nostalgic classics and immersive entertainment. Offering a dynamic, upscale encounter that combines a fabulous food menu and full-service bar. Sky Gamerz transforms airports and layovers into memorable experiences.",
    outlets: [
      o("", "N Gates, Near Gate N20", "airside", "Sunday - Saturday 6 a.m. - 10 p.m."),
    ],
  }),
  smith_cove: restaurant({
    name: "Smith Cove", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Seattle Cove is named endearingly after the northern part of Seattle’s Elliott Bay. It is also home to Pier 91 on Seattle’s waterfront. <NL> The airport’s own Seattle Cove is located in the S Concourse, offering Pacific Northwest-inspired food including fish and chips, grilled salmon, seasonal salads and small plates, with a full-service bar offering cocktails, beer and other beverages for travelers.",
    outlets: [
      o("", "S Gates, Near Gate S2", "airside", "Sunday - Saturday 6 a.m. - 12 p.m."),
    ],
  }),
  sourced_market: restaurant({
    name: "Sourced Market", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Sourced Market showcases the best in gourmet fare from the Pacific Northwest region. Sourced Market will delight with exceptional, handcrafted deli dishes and regionally sourced products.",
    outlets: [
      o("", "Pre-Security Ticketing, Ticketing Near Checkpoint 3 & 4", "landside", "Sunday - Saturday 4 a.m. - 10 p.m."),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Coffee Shops, Quick-Service", amenity: "cafe",
    description: "From the beginning, Starbucks set out to be a different kind of company. One that not only celebrated coffee and its rich tradition, but also brought a feeling of connection. Starbucks’ mission is to inspire and nurture the human spirit – one person, one cup and one neighborhood at a time. Expect more than coffee, enjoy a selection of premium teas, fine pastries and other delectable treats to please the taste buds.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "C Gates, Near Gate C10F", "airside", "Sunday - Saturday 3:00 a.m. - 11 p.m."),
      o("", "B Gates, Near Gate B7", "airside", "Sunday - Saturday 3:30 a.m. - 10 p.m."),
      o("", "Pre-Security Baggage Claim, Near Baggage Claim 6", "landside", "Sunday - Saturday 4 a.m. - 8 p.m."),
      o("", "D Gates, Near Gate D2", "airside", "Sunday - Saturday 3:30 a.m. - 11 p.m."),
      o("", "A Gates, Near Gate A3", "airside", "Sunday - Saturday 3:00 a.m. - 11 p.m."),
    ],
  }),
  starbucks_evenings: restaurant({
    name: "Starbucks Evenings", cuisine: "Beer, Cocktails & Wine, Coffee Shops, Quick-Service", amenity: "cafe",
    description: "Starbucks Evenings, in addition to coffee, a selection of premium teas, fine pastries and other delectable treats, this location at SEA showcases the Nitro Cold Brew, and a local selection of 27 beer and wine options along with multiple small plate food offerings. <NL> This beautifully expanded space is a full custom design that includes reclaimed NW Douglas Fir crafted by a local wood shop that mimics clouds, a light fixture inspired by the Siren constellation, and a hand painted mural that depicts your landing approach into Seattle.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Central Terminal", "airside", "Open 24 hours", true),
    ],
  }),
  village_pub: restaurant({
    name: "Village Pub", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "bar",
    description: "Located in the beautiful N Concourse, Village Pub is a modern twist on a traditional English pub. Enjoy beer, cocktails, wine and a menu of tasty bites. In a hurry? Village Pub also offers a selection of grab ‘n go items!",
    outlets: [
      o("", "N Gates, Near Gate N9", "airside", "Sunday - Saturday 6 a.m. - 8 p.m."),
    ],
  }),
  vyne_washington_tasting_room: restaurant({
    name: "Vyne Washington Tasting Room", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "bar",
    description: "Vyne Washington Tasting Room brings the traveler on a cutting-edge and interactive wine voyage — an indulgent, culinary escape into the wonderful world of Washington state wines.",
    outlets: [
      o("", "Central Terminal", "airside", "Sunday - Saturday 8 a.m. - 10 p.m."),
    ],
  }),
  wanderlust: restaurant({
    name: "Wanderlust", cuisine: "Beer, Cocktails & Wine, Restaurants (sit-down)", amenity: "restaurant",
    description: "Grand Opening – 6/11/26",
    outlets: [
      o("", "C Gates, Near Gate C2", "airside", "Sunday - Saturday 6:30 a.m. - 10 p.m."),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "Quick-Service", amenity: "fast_food",
    description: "At Wendy’s, they are all about serving up fresh food, even if it means going the extra mile. When you walk through the doors, Wendy’s makes everyone feel at home because their family extends through the community. Today, Wendy’s can be found in many countries, but no matter where you find them, quality will always be their recipe.",
    website: "wendys.com", logoUrl: logo("wendys.com"),
    outlets: [
      o("", "N Gates, Near Gate N11", "airside", "Sunday - Saturday 4:30 a.m. - 11 p.m."),
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
