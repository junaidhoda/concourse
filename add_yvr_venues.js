'use strict';
/**
 * Fills in complete data for Vancouver International Airport (YVR) —
 * restaurants/cafés/bars/vending in Firestore. Researched 2026-08-18 from the
 * airport's own site, using Claude in Chrome browser automation per explicit
 * user instruction. No third-party/aggregator source was used for any venue
 * field.
 *
 * SOURCE: https://www.yvr.ca/en/passengers/shop-dine-and-services/dine —
 * "Dine", the Vancouver Airport Authority's own directory. Its venue list is
 * client-rendered, so it was NOT scraped from the cards; it is served by YVR's
 * own OData facilities endpoint, /en/_api/Facilities, which the page itself
 * calls. That endpoint was read directly, same-origin, returning all 306
 * airport facilities, of which the 59 filed under YVR's own dining category
 * (PoiCategory "STR_FOOD_DRINK") are this file's scope. Those 59 records
 * resolve to 41 distinct FacilityIds — exactly the 41 entries YVR's own
 * rendered Dine list shows, with its "Multiple Locations" label on the ones
 * that have more than one, which is the cross-check that the API set and the
 * published set are the same set.
 *
 * NOT EXTRACTED: the facilities feed also carries named staff contacts with
 * their direct phone numbers and email addresses (PoiEmergencyContact,
 * PoiEmergencyNo, PoiEmergencyEmail and similar). Those are personal data of
 * airport workers, are not part of the published directory, and were
 * deliberately excluded from the extract and from this file. Only the venue's
 * own public business number is kept.
 *
 * EXTRACTION + VERIFICATION: the 59 records were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter) with every non-ASCII character
 * replaced by a reversible `<U+hex>` escape and every field whitespace-
 * normalised in the browser before checksumming, split into 5 chunks under
 * 7,800 chars on line boundaries, written into a `<pre id="dataDump">` and
 * retrieved via get_page_text. Every chunk verified EXACTLY on first pass
 * against values computed in the browser before retrieval — len/lines/checksum:
 * 7789/12/33477685, 7581/13/32457863, 7395/16/31727472, 7376/13/31803416,
 * 3460/5/14769690 — as did the rejoined 59-line dataset at len 33605,
 * checksum 144070058, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 4 buckets: Domestic Terminal, International Terminal,
 * US Terminal and South Terminal. These are the four values YVR's own facility
 * data puts in its PoiTerminal field and the four values its own directory
 * offers in its own Terminal filter (Canada / US / International / South), and
 * all four pass the "own check-in AND own security, independently" test on
 * YVR's own published evidence:
 *   • Security — its Security Information page states outright, "YVR has
 *     security checkpoints in the Domestic, International, USA and South
 *     Terminals", and names them: ABC North and ABC South (Canada departures),
 *     D checkpoint (International departures), E Checkpoint (USA Departures).
 *   • Check-in — its own facilities feed carries a separate check-in facility
 *     for each: "International Check In" (International Departures, Level 3),
 *     "US Check In" (US Departures, Level 3), "South Terminal Check In" (South
 *     Terminal Departures, Level 1), and the airline check-in counters (Air
 *     Canada, WestJet, Air North, Flair) filed under Domestic Departures,
 *     Level 3.
 * So each of the four has its own check-in frontage and its own screening,
 * even though Domestic, International and US share one building. Applying the
 * test WITHIN a bucket produces no further split — the Domestic terminal's two
 * checkpoints (ABC North and ABC South) are two lanes into the same Canada
 * departures area behind the same check-in hall, not a second terminal, and no
 * pier has a check-in of its own. South Terminal is a physically separate
 * building on the airport's south side.
 *
 * AIRSIDE / LANDSIDE: from YVR's own security field, which is what its own
 * Before/After security filter runs on — "After security" → `airside`,
 * "Before security" → `landside`. 40 airside, 19 landside.
 *
 * LEVEL: from YVR's own building-level field — Level 1 (South Terminal),
 * Level 2 (arrivals), Level 3 (departures) and Level 4 (the Fairmont Vancouver
 * Airport hotel above US Departures). Every outlet carries one.
 *
 * LOCATION_NOTES: YVR's own location string minus the two components already
 * held in dedicated fields (the level and the before/after-security flag) — so
 * "Gate B12, Domestic Departures", "International Arrivals", "Gate G1". Where
 * YVR's gate field and its location string disagree the location string is
 * what is stored, verbatim: it publishes Whistler Taphouse & Grill with gate
 * C47 but a location line reading "Gate C45", and that is left as published.
 * Likewise three illycaffè vending machines are filed under the Domestic
 * terminal with E-gate location lines ("Gate E76/E95, Domestic Departures");
 * that is YVR's own filing and it is not second-guessed.
 *
 * MULTI-OUTLET HANDLING: merged on YVR's OWN venue identity, its FacilityId,
 * within a bucket — that is the key behind its own "Multiple Locations"
 * listing, and it is what correctly folds the airport's two renderings of the
 * same brand ("illy Caffe Vending" and "illycaffè Vending" are both FacilityId
 * 557) as well as its two Dirty Apron storefronts ("Dirty Apron" at Gate C46
 * and "The Dirty Apron Nourish" at Gate B14 are both FacilityId 513, and YVR
 * lists them as one entry with Multiple Locations). Same brand in DIFFERENT
 * terminals stays separate, per this dataset's standing rule — so A&W, Subway,
 * Starbucks, Tim Hortons, Joe and The Juice, Vino Volo and illy vending each
 * appear once per terminal they are in. Where a merged group renders its name
 * two ways, the most frequent rendering wins and ties go to the shorter one.
 * 59 records → 51 docs.
 *
 * CUISINE: the verbatim join of YVR's own tag vocabularies for the venue,
 * unfiltered — its own "Dining Options" facet value ("Grab and Go",
 * "Coffee, Tea, and Juice", "Dine In") followed by the keyword chips its own
 * card prints ("Vegan", "Vegetarian", "Gluten Free", "Breakfast", "Asian",
 * "Flourless"). So e.g. "Grab and Go, Vegan, Vegetarian, Breakfast". For a
 * merged doc the union is used, in first-seen order.
 *
 * AMENITY: from YVR's own Dining Options facet — Grab and Go → `fast_food`,
 * Coffee, Tea, and Juice → `cafe`, Dine In → `restaurant` — with two
 * name-based corrections taken from the venue's own name. A name containing
 * "Vending" → `vending_machine` (YVR's six illy coffee machines, which its own
 * description confirms: "This specialty coffee machine grinds whole beans,
 * brews, and serves…"). And `bar` requires BOTH a drinks-room name AND YVR
 * filing the venue as Dine In, which promotes exactly three: Jetside Lounge
 * ("a wide selection of Okanagan and international wines, craft beer, select
 * spirits and cocktails") and the two Vino Volo units ("a selection of wines
 * from British Columbia and around the globe, craft cocktails and small
 * plates"). The Dine-In condition is what keeps Sweet Maple Lounge a `cafe` —
 * YVR files it under Coffee, Tea, and Juice and describes it as "Convenience
 * store plus quick dining with 20 seats". Venues whose names carry a drinks
 * word but whose own descriptions are food-led are likewise NOT promoted:
 * Icons Sports Bar & Grill ("Food-focused sports bar… burgers, salads,
 * seafood"), Lift Bar and Grill ("Elegant urban dining… focus on seafood"),
 * Romers Fresh Kitchen and Bar, Whistler Taphouse & Grill and Hangar 49 all
 * stay `restaurant`. Note the reverse case too: YVR files Paper Planes Cafe,
 * Bubble Waffle Cafe and Galiano Cafe under Grab and Go despite the word Café
 * in their names, and its own classification is kept. Resulting mix:
 * 22 fast_food, 18 cafe, 10 restaurant, 6 vending_machine, 3 bar.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE: set from YVR's own explicit keyword chips
 * — "Vegetarian", "Vegan" and "Gluten Free" — which are the tags it prints on
 * each card. HALAL and KOSHER are blank on every doc: YVR publishes no such
 * tag. Its other chips ("Breakfast", "Asian", "Flourless") have no field in
 * this schema and are carried in `cuisine` rather than being dropped.
 *
 * OPENING HOURS: rendered from YVR's own structured opening-hours records. 55
 * of the 59 publish a single daily window → "Daily 05:30-20:00"; the other
 * four publish a per-weekday schedule, rendered with consecutive identical days
 * collapsed — "Mon 07:30-16:30; Tue-Sat 06:30-17:00; Sun 07:30-14:00" (Galiano
 * Cafe), and similar for the two Vino Volo units and Salmon n' Bannock On The
 * Fly. Times are left in YVR's own 24-hour form, including its own "24:00" for
 * midnight. All 59 outlets carry hours.
 *
 * OPEN 24/7: taken from YVR's own IsOpen24Hours flag rather than inferred from
 * the times — 16 outlets, all of which also publish 00:00-24:00.
 *
 * DESCRIPTION: YVR stores these as HTML; the markup is stripped and entities
 * decoded, and the text is otherwise verbatim and whitespace-normalised. All
 * 59 records carry one. (YVR also publishes a shorter map "tagline" per venue;
 * the fuller description is what is stored.)
 *
 * PHONE: the venue's own public business number, verbatim from YVR's own
 * field, including its own formatting variety ("604-831-1971",
 * "1-604-231-3731 EXT 217", "(604) 568-8971", "604.238.7588"). All 59 records
 * carry one.
 *
 * WEBSITE / LOGO: the bare domain of the outbound link YVR publishes for the
 * venue, protocol/www/path stripped, with the logo.dev logo derived from it.
 * Only 9 of the 59 records carry a usable one; the rest are left blank rather
 * than guessed. Two links were deliberately not used as a website: YVR's Pret
 * A Manger link points at a menu PDF, and its Salmon n' Bannock link is an
 * empty internal link.
 *
 * VERIFIED TOTALS: 59 source dining records → 51 restaurant docs / 59 outlets.
 * Domestic Terminal: 26 records → 20 docs / 26 outlets. International Terminal:
 * 19 → 18 / 19. US Terminal: 12 → 11 / 12. South Terminal: 2 → 2 / 2.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['yvr', 'vancouver', 'vancouver-international'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const DOMESTIC_TERMINAL = 'domestic_terminal';
const INTERNATIONAL_TERMINAL = 'international_terminal';
const US_TERMINAL = 'us_terminal';
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

// ─── Domestic Terminal ───

const domesticTerminalVenues = {
  a_w: restaurant({
    name: "A&W", cuisine: "Grab and Go, Vegan, Vegetarian, Breakfast", amenity: "fast_food",
    description: "Canada's second-largest quick service hamburger chain, known for their bestselling root beer. Also serving up satisfying breakfast sandwiches, wraps, chicken and more.",
    phone: "1-604-303-3343",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Domestic Departures", "landside", "Daily 00:00-24:00", true),
    ],
  }),
  dirty_apron: restaurant({
    name: "Dirty Apron", cuisine: "Grab and Go, Vegan, Vegetarian, Breakfast", amenity: "fast_food",
    description: "Downtown Vancouver delicatessen known for its cooking classes and catering services, serving up gourmet sandwiches, salads, snacks and treats at in its stylish YVR location.",
    website: "dirtyapron.com", logoUrl: logo("dirtyapron.com"),
    phone: "604-831-1971",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate B14, Domestic Departures", "airside", "Daily 05:00-23:00"),
      o("Level 3", "Gate C46, Domestic Departures", "airside", "Daily 05:30-23:00"),
    ],
  }),
  hangar_49: restaurant({
    name: "Hangar 49", cuisine: "Dine In", amenity: "restaurant",
    description: "At Hangar 49, comfort meets creativity. Elevated comfort food brings familiar favorites to new heights with chef-inspired twists, fresh local ingredients, and a menu that celebrates British Columbia’s rich bounty. Whether you're craving a hearty classic or something lighter and more adventurous, Hangar 49 Tap + Tavern has curated a variety of dishes to satisfy every palate and every journey. Click here to book your table in advance.",
    phone: "604-248-7239",
    outlets: [
      o("Level 3", "Gate B12, Domestic Departures", "airside", "Daily 06:00-23:00"),
    ],
  }),
  hula_poke: restaurant({
    name: "Hula Poké", cuisine: "Grab and Go, Vegan, Gluten Free, Vegetarian", amenity: "fast_food",
    description: "Hula Poké uses responsibly sourced fish, fresh produce and in-house sauces, to create the most flavourful and unique poké bowls in the market. The menu offers mouth-watering “Wai Tai” beverages made in-house with coconut water, and spicy cassava chips on the side, to complement each bowl. The menu is globally inspired, with regional flavours.",
    website: "hulapoke.ca", logoUrl: logo("hulapoke.ca"),
    phone: "604-214-6626",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Gate B14, Domestic Departures", "airside", "Daily 05:00-24:00"),
    ],
  }),
  illycaffe_vending: restaurant({
    name: "illycaffè Vending", cuisine: "Grab and Go", amenity: "vending_machine",
    description: "This specialty coffee machine grinds whole beans, brews, and serves a comprehensive list of beverage selections, including espresso, cappuccino, caffe latte, macchiato, and many other espresso-based drinks.",
    phone: "778 389 8653",
    outlets: [
      o("Level 3", "Gate B27, Domestic Departures", "airside", "Daily 00:00-24:00", true),
      o("Level 3", "Gate E76, Domestic Departures", "airside", "Daily 00:00-24:00", true),
      o("Level 3", "Gate E95, Domestic Departures", "airside", "Daily 00:00-24:00", true),
    ],
  }),
  japadog: restaurant({
    name: "Japadog", cuisine: "Grab and Go, Vegetarian, Breakfast", amenity: "fast_food",
    description: "Classic western hot dogs with a Japanese twist: Additions like seaweed, teriyaki sauce, grated radish, pickled ginger, even fried noodles! An iconic Vancouver street food since 2005.",
    website: "japadog.com", logoUrl: logo("japadog.com"),
    phone: "604-500-8014",
    vegetarian: true,
    outlets: [
      o("Level 3", "Domestic Departures", "landside", "Daily 07:30-23:00"),
    ],
  }),
  joe_and_the_juice: restaurant({
    name: "Joe and The Juice", cuisine: "Coffee, Tea, and Juice, Vegan, Vegetarian, Breakfast", amenity: "cafe",
    description: "Nutritious fresh-pressed juices, coffee and snacks from the modern Scandinavian chain.",
    phone: "604-303-9957",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate C45, Domestic Departures", "airside", "Daily 06:30-22:30"),
    ],
  }),
  lees_donuts: restaurant({
    name: "Lee's Donuts", cuisine: "Grab and Go, Vegetarian", amenity: "fast_food",
    description: "Originally opened at Vancouver’s Granville Island Public Market in 1979, Lee’s Donuts is a must stop for handmade, quality, classic donuts. Don't miss the Honey Dip! This location also serves freshly made coffee drinks and a selection of candy.",
    phone: "604-273-3375",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate B14, Domestic Departures", "airside", "Daily 05:00-23:00"),
    ],
  }),
  lucky_lily_asian_brasserie: restaurant({
    name: "Lucky Lily Asian Brasserie", cuisine: "Dine In, Vegetarian, Breakfast", amenity: "restaurant",
    description: "Discover diverse Asian food from celebrated Canadian chef and Top Chef Canada All-Stars champion Nicole Gomes. Inspired by Nicole’s travels through Thailand, Vietnam, Hong Kong, and beyond, the menu includes comforting noodles, dim sum, fragrant curries, rice bowls, and bold brasserie fare. Enjoy relaxed sit-down dining in the beautiful restaurant space or visit the grab and go market for a selection of ready-made dishes perfect for a meal at your gate or on board your flight.",
    phone: "604-831-1971",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate C46, Domestic Departures", "airside", "Daily 05:30-23:00"),
    ],
  }),
  pacific_coast_news_cafe: restaurant({
    name: "Pacific Coast News Café", cuisine: "Coffee, Tea, and Juice", amenity: "cafe",
    description: "Instant soup, snacks, candy and a limited selection of grab-and-go options alongside last-minute essentials like gum, headphones and over-the-counter medications.",
    phone: "604-276-2060",
    outlets: [
      o("Level 3", "Gate B20, Domestic Departures", "airside", "Daily 06:30-22:00"),
    ],
  }),
  pacific_farms_market: restaurant({
    name: "Pacific Farms Market", cuisine: "Coffee, Tea, and Juice, Vegan, Vegetarian, Gluten Free", amenity: "cafe",
    description: "Meals, snacks and gifts from a selection of beloved local brands. Made to order sandwiches and pizzas plus 49th Parallel Coffee, Rosemary Rocksalt Bagels, sushi and local craft beer.",
    phone: "604 285 5557",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Gate C29, Domestic Departures", "airside", "Daily 05:00-22:00"),
    ],
  }),
  paper_planes_cafe: restaurant({
    name: "Paper Planes Cafe", cuisine: "Grab and Go, Vegetarian, Breakfast", amenity: "fast_food",
    description: "A cafe where adults with diverse abilities gain real-world, paid training and employment experience. Find local favourites such as Lee’s Donuts, the Juice Truck and Bridge Brewing at this quiet café that brews inclusivity, empowerment and creative ways to champion an accessible travel environment for people of all abilities.",
    phone: "604-284-0319",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gate N/A, Domestic Arrivals", "landside", "Daily 08:00-20:00"),
    ],
  }),
  paragon_tea_room: restaurant({
    name: "Paragon Tea Room", cuisine: "Coffee, Tea, and Juice", amenity: "cafe",
    description: "Enjoy an assortment of tea beverages and gourmet confectionaries from local brands including Paragon Tea Room, Salty Sugar Patisserie, and Mister Artisan Ice Cream among other gift sets and treats.",
    phone: "1 778-222-8968",
    outlets: [
      o("Level 3", "Domestic Departures", "landside", "Daily 07:00-19:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Coffee, Tea, and Juice, Vegetarian, Breakfast", amenity: "cafe",
    description: "Quality coffee, beverages, pastries, sandwiches and snacks from the world's leading retailer, roaster and brand of specialty coffee.",
    phone: "1-604-231-3731 EXT 217",
    vegetarian: true,
    outlets: [
      o("Level 3", "Domestic Departures", "landside", "Daily 04:30-21:00"),
      o("Level 3", "Gate B12, Domestic Departures", "airside", "Daily 04:30-22:30"),
      o("Level 3", "Gate C47, Domestic Departures", "airside", "Daily 04:30-23:00"),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Grab and Go, Vegan, Vegetarian, Breakfast", amenity: "fast_food",
    description: "Custom made-to-order sandwiches from the bestselling international chain. The perfect healthy meal to bring on your flight.",
    phone: "1-604-232-4441",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Domestic Departures", "landside", "Daily 00:00-24:00", true),
    ],
  }),
  tim_hortons: restaurant({
    name: "Tim Hortons", cuisine: "Coffee, Tea, and Juice, Vegan, Vegetarian, Breakfast", amenity: "cafe",
    description: "Coffee, donuts, sandwiches, bagels, muffins and more from the iconic Canadian chain named for a National Hockey League legend.",
    phone: "1-604-231-3731 EXT 207",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Domestic Departures", "landside", "Daily 00:00-24:00", true),
      o("Level 3", "Gate C34, Domestic Departures", "airside", "Daily 04:45-22:00"),
    ],
  }),
  triple_os: restaurant({
    name: "Triple O's", cuisine: "Grab and Go, Breakfast, Gluten Free, Vegetarian", amenity: "fast_food",
    description: "Triple O’s is a premium quick service burger restaurant offering a casual and authentic West Coast dining experience for people who crave great tasting burgers, fresh-cut fries, hand-scooped milkshakes and delicious Secret Triple “O”™ Sauce. Triple O’s Restaurant is a division of White Spot Hospitality, Canada’s longest running restaurant chain founded by Nat Bailey in 1928.",
    phone: "604-285-3334",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Gate B14, Domestic Departures", "airside", "Daily 05:00-23:00"),
    ],
  }),
  vino_volo: restaurant({
    name: "Vino Volo", cuisine: "Dine In, Vegetarian", amenity: "bar",
    description: "Vino Volo offers a selection of wines from British Columbia and around the globe, craft cocktails and small plates from pizzettes, charcuterie, all day breakfast and more.",
    phone: "1-604-276-1836",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate B17, Domestic Departures", "airside", "Mon 07:30-23:00; Tue-Thu 07:30-22:30; Fri-Sat 07:30-23:00; Sun 07:30-22:30"),
    ],
  }),
  whistler_taphouse_grill: restaurant({
    name: "Whistler Taphouse & Grill", cuisine: "Dine In, Vegan, Vegetarian, Breakfast", amenity: "restaurant",
    description: "Comforting snacks and mains, hearty breakfasts, superfood salads and local craft beers from one of BC’s original microbreweries, founded in 1989. Mac & cheese, burgers, salmon, wings & more.",
    phone: "1-604-831-1971",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate C45, Domestic Departures", "airside", "Daily 05:00-23:30"),
    ],
  }),
  white_spot: restaurant({
    name: "White Spot", cuisine: "Dine In, Breakfast", amenity: "restaurant",
    description: "B.C.’s beloved family restaurant’s location at YVR blends the comforts of their classic menu with exclusive dishes only available at this location. Guests can experience fan favourites such as Nat’s Hearty Breakfast and the Legendary Burger alongside new offerings like Neapolitan-style pizzas and Wagyu burgers. With a carefully curated menu, hospitable service, and comforting environment, White Spot is more than just a dining stop – it’s an experience of what makes B.C. special. Skip the wait! View the menu and order online before you arrive.",
    website: "whitespot.ca", logoUrl: logo("whitespot.ca"),
    phone: "1-604-284-1911",
    outlets: [
      o("Level 3", "Domestic Departures", "landside", "Daily 06:00-23:00"),
    ],
  }),
};

// ─── International Terminal ───

const internationalTerminalVenues = {
  a_w: restaurant({
    name: "A&W", cuisine: "Grab and Go, Vegan, Vegetarian, Breakfast", amenity: "fast_food",
    description: "Canada's second-largest quick service hamburger chain, known for their bestselling root beer. Also serving up satisfying breakfast sandwiches, wraps, chicken and more.",
    phone: "1-604-278-9344",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Daily 00:00-24:00", true),
    ],
  }),
  bubble_waffle_cafe: restaurant({
    name: "Bubble Waffle Cafe", cuisine: "Grab and Go, Vegetarian, Asian", amenity: "fast_food",
    description: "Bubble Waffle Cafe serves fresh, authentic Hong Kong style street food. Choose from an array of savoury rice and noodle dishes, fish soups, bubble waffles and more.",
    website: "bubblewafflecafe.ca", logoUrl: logo("bubblewafflecafe.ca"),
    phone: "(604) 207-7077",
    vegetarian: true,
    outlets: [
      o("Level 3", "International Departures", "landside", "Daily 07:00-24:00"),
    ],
  }),
  churchs_texas_chicken: restaurant({
    name: "Church's Texas Chicken", cuisine: "Grab and Go", amenity: "fast_food",
    description: "Fried chicken and all the trimmings: Coleslaw, mac & cheese, honey-butter biscuits and more from the Texas-based chain.",
    phone: "604-831-1971",
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Daily 05:30-23:00"),
    ],
  }),
  freshii: restaurant({
    name: "Freshii", cuisine: "Grab and Go, Vegetarian, Vegan, Gluten Free", amenity: "fast_food",
    description: "Fast food, but healthy. Salads, bowls, wraps, juices and more.",
    phone: "604-247-9402",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "International Departures", "landside", "Daily 06:30-23:00"),
    ],
  }),
  hanami_express: restaurant({
    name: "Hanami Express", cuisine: "Grab and Go, Vegetarian, Asian", amenity: "fast_food",
    description: "A selection of Asian favourites for those craving takeout fare. Sushi, soups, noodles, dumplings and other classics.",
    phone: "1-604-821-9981",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Daily 09:00-24:00"),
    ],
  }),
  illycaffe_and_relay: restaurant({
    name: "illycaffe and Relay", cuisine: "Coffee, Tea, and Juice, Breakfast, Vegetarian", amenity: "cafe",
    description: "Stock up on gifts and souvenirs or stop in for a fine Italian coffee beverage and fresh sandwiches, salads and pastries, all in one place.",
    phone: "450-987-2660",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate 69, International Departures", "airside", "Daily 00:00-24:00", true),
    ],
  }),
  illycaffe_vending: restaurant({
    name: "illycaffè Vending", cuisine: "Grab and Go", amenity: "vending_machine",
    description: "This specialty coffee machine grinds whole beans, brews, and serves a comprehensive list of beverage selections, including espresso, cappuccino, caffe latte, macchiato, and many other espresso-based drinks.",
    phone: "778 389 8653",
    outlets: [
      o("Level 3", "Gate D52, International Departures", "airside", "Daily 00:00-24:00", true),
      o("Level 3", "Gate D67, International Departures", "airside", "Daily 00:00-24:00", true),
    ],
  }),
  lift_bar_and_grill: restaurant({
    name: "Lift Bar and Grill", cuisine: "Dine In, Vegan, Vegetarian, Gluten Free", amenity: "restaurant",
    description: "Elegant urban dining featuring West Coast flavours with a focus on seafood paired with hand-selected local and international wines. A great spot for a sit-down brunch or cocktails.",
    phone: "604-831-1971",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Daily 06:00-23:30"),
    ],
  }),
  pajos_fish_chips: restaurant({
    name: "Pajo's Fish & Chips", cuisine: "Grab and Go, Vegetarian", amenity: "fast_food",
    description: "Fish and chips, burgers, tacos and more from a much-loved local brand founded in 1985 and still family-owned today. All fish is wild and Ocean Wise certified.",
    phone: "604.238.7588",
    vegetarian: true,
    outlets: [
      o("Level 3", "International Departures", "landside", "Daily 08:00-21:00"),
    ],
  }),
  pret_a_manger: restaurant({
    name: "Pret A Manger", cuisine: "Grab and Go", amenity: "fast_food",
    description: "The beloved British sandwich shop's first location in a Canadian airport. Enjoy convenient, freshly made food that's built to grab and go: everything from croissants and frittatas to sandwiches, salads, and soups, plus sweet treats and organic coffee.",
    phone: "236-521-3657",
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Daily 00:00-24:00", true),
    ],
  }),
  purebread: restaurant({
    name: "Purebread", cuisine: "Coffee, Tea, and Juice, Vegan, Vegetarian, Flourless", amenity: "cafe",
    description: "Originating in Whistler and then expanding to multiple locations across the Lower Mainland, Purebread has been a reliable source for freshly brewed coffee and assortment of baked goods, including breads, cookies, scones and more. Whether you are looking for something flour-less, vegan, or have a sweet tooth, there is something for everyone to enjoy.",
    website: "purebread.ca", logoUrl: logo("purebread.ca"),
    phone: "604-285-5901",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "International Departures", "landside", "Daily 05:00-21:00"),
    ],
  }),
  salmon_n_bannock_on_the_fly: restaurant({
    name: "Salmon n' Bannock On The Fly", cuisine: "Grab and Go, Vegan, Vegetarian, Breakfast", amenity: "fast_food",
    description: "Fresh, authentic Indigenous cuisine from the owners of the award-winning Vancouver bistro. Salads, sandwiches, vegetarian chili, candied salmon, and more. Don't miss the rice pudding!",
    phone: "(604) 568-8971",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Mon 06:00-23:00; Tue-Wed 06:00-23:30; Thu-Sat 05:00-23:30; Sun 05:00-23:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Coffee, Tea, and Juice, Vegetarian, Breakfast", amenity: "cafe",
    description: "Quality coffee, beverages, pastries, sandwiches and snacks from the world's leading retailer, roaster and brand of specialty coffee.",
    phone: "1-604-231-3731 EXT 245",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Daily 00:00-24:00", true),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Grab and Go, Vegan, Vegetarian, Breakfast", amenity: "fast_food",
    description: "Custom made-to-order sandwiches from the bestselling international chain. The perfect healthy meal to bring on your flight.",
    phone: "1-604-207-1232",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate D71, International Departures", "airside", "Daily 00:00-24:00", true),
    ],
  }),
  sweet_maple_lounge: restaurant({
    name: "Sweet Maple Lounge", cuisine: "Coffee, Tea, and Juice, Vegetarian, Vegan, Breakfast", amenity: "cafe",
    description: "Convenience store plus quick dining with 20 seats. Enjoy a pint of craft beer and a delicious hot dog from North Vancouver–based Two Rivers Meats, then stock up on reading materials and bottled drinks for your flight.",
    phone: "604-256-3779",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate CD51, International Departures", "airside", "Daily 06:00-15:00"),
    ],
  }),
  tim_hortons: restaurant({
    name: "Tim Hortons", cuisine: "Coffee, Tea, and Juice, Vegan, Vegetarian, Breakfast", amenity: "cafe",
    description: "Coffee, donuts, sandwiches, bagels, muffins and more from the iconic Canadian chain named for a National Hockey League legend.",
    phone: "1-604-303-1109",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 2", "International Arrivals", "landside", "Daily 00:00-24:00", true),
    ],
  }),
  urban_crave: restaurant({
    name: "Urban Crave", cuisine: "Dine In, Vegetarian, Gluten Free, Breakfast", amenity: "restaurant",
    description: "Pre-security casual sit-down spot serving internationally-inspired breakfasts, bowls, burgers and flatbreads. Fully licensed with beer on tap and a variety of wine and cocktails.",
    phone: "604-831-1971",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "International Departures", "landside", "Daily 06:00-23:00"),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "Grab and Go, Vegetarian, Breakfast", amenity: "fast_food",
    description: "This fast-food chain is home to fresh (never frozen) hamburgers, sea salted fries, crisp salads, chili and baked potatoes.",
    phone: "1-604-278-2862",
    vegetarian: true,
    outlets: [
      o("Level 3", "International Departures", "landside", "Daily 00:00-24:00", true),
    ],
  }),
};

// ─── US Terminal ───

const usTerminalVenues = {
  banh_shop: restaurant({
    name: "Banh Shop", cuisine: "Grab and Go, Vegetarian, Asian, Breakfast", amenity: "fast_food",
    description: "Fresh and vibrant Vietnamese street food: banh mi sandwiches, bowls, soups and salad rolls.",
    phone: "604-831-1971",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate E84, US Departures", "airside", "Daily 05:30-20:00"),
    ],
  }),
  globe_yvr: restaurant({
    name: "Globe@YVR", cuisine: "Dine In, Vegan, Vegetarian, Gluten Free", amenity: "restaurant",
    description: "Enjoy spectacular views and refined dining at the Fairmont Vancouver Airport, located above US Departures. Globe's seasonal menu celebrates the Pacific Northwest, featuring sustainable, locally-sourced ingredients, hand-crafted cocktails, and a curated selection of local beers. Open daily, dining options include breakfast, lunch, dinner and Fairmont’s signature afternoon tea service. Breakfast 6:00am – 11:00am Lunch 11:00am – 2:00pm Afternoon Tea Weekdays 2:00pm – 3:30pm Weekends 1:00pm – 3:30pm Dinner 5:30pm – 10:00pm",
    website: "fairmont.com", logoUrl: logo("fairmont.com"),
    phone: "1-604-248-3281",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 4", "US Departures", "landside", "Daily 06:00-22:00"),
    ],
  }),
  icons_sports_bar_grill: restaurant({
    name: "Icons Sports Bar & Grill", cuisine: "Dine In, Vegetarian, Breakfast", amenity: "restaurant",
    description: "Food-focused sports bar celebrating BC's sports legends. Enjoy burgers, salads, seafood and more paired with crisp, refreshing craft beer while you watch the game.",
    phone: "1-604-231-3731 ext 215",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate E81, US Departures", "airside", "Daily 05:30-23:00"),
    ],
  }),
  jetside_lounge: restaurant({
    name: "Jetside Lounge", cuisine: "Dine In, Vegan, Vegetarian, Gluten Free", amenity: "bar",
    description: "Operated by Fairmont Vancouver Airport, this contemporary lounge offers a wide selection of Okanagan and international wines, craft beer, select spirits and cocktails. Conveniently located beside Globe@YVR with floor-to-ceiling views of the runways and mountains. Live music information",
    website: "fairmont-vancouver-airport.com", logoUrl: logo("fairmont-vancouver-airport.com"),
    phone: "1-604-248-3281",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 4", "US Departures", "landside", "Daily 11:00-24:00"),
    ],
  }),
  joe_and_the_juice: restaurant({
    name: "Joe and The Juice", cuisine: "Coffee, Tea, and Juice, Vegan, Vegetarian, Breakfast", amenity: "cafe",
    description: "Nutritious fresh-pressed juices, coffee and snacks from the modern Scandinavian chain.",
    phone: "1 778-222-8968",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate E88, US Departures", "airside", "Daily 04:00-22:30"),
    ],
  }),
  romers_fresh_kitchen_and_bar: restaurant({
    name: "Romers Fresh Kitchen and Bar", cuisine: "Dine In", amenity: "restaurant",
    description: "Fresh and local eatery inspired by Vancouver’s West Coast lifestyle. Visit Romer’s Fresh Kitchen & Bar for award winning, hand-pressed burgers, nourishing breakfasts and refreshing craft beer before taking off on your next adventure.",
    phone: "1-604-831-1971",
    outlets: [
      o("Level 3", "Gate E75, US Departures", "airside", "Daily 05:30-23:00"),
    ],
  }),
  root98: restaurant({
    name: "Root98", cuisine: "Grab and Go, Vegetarian, Breakfast, Gluten Free", amenity: "fast_food",
    description: "Delicious freshly-made meals to enjoy at the sit-down bar — think smoked salmon kale and quinoa salad, tuna poke, squid ink pasta and more. Or, grab a sandwich, parfait or pastry to go. Also serving bubble tea from BlackBall Taiwanese Dessert!",
    phone: "604-276-6688",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Gate E87, US Departures", "airside", "Daily 04:45-21:00"),
    ],
  }),
  sal_y_limon: restaurant({
    name: "Sal Y Limon", cuisine: "Dine In, Vegetarian, Vegan, Gluten Free", amenity: "restaurant",
    description: "Authentic tacos, burritos, quesadillas and hearty breakfast entrees plus alcoholic beverages. This popular Mexican eatery was founded by four Vancouverites who moved here from Manzanillo, Mexico.",
    phone: "604-831-1971",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Gate E88, US Departures", "airside", "Daily 05:30-22:00"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Coffee, Tea, and Juice, Vegetarian, Breakfast", amenity: "cafe",
    description: "Quality coffee, beverages, pastries, sandwiches and snacks from the world's leading retailer, roaster and brand of specialty coffee.",
    phone: "1-604-231-3731 EXT 246",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate E88, US Departures", "airside", "Daily 04:30-23:00"),
    ],
  }),
  tim_hortons: restaurant({
    name: "Tim Hortons", cuisine: "Coffee, Tea, and Juice, Vegan, Vegetarian, Breakfast", amenity: "cafe",
    description: "Coffee, donuts, sandwiches, bagels, muffins and more from the iconic Canadian chain named for a National Hockey League legend.",
    phone: "604-303-3367",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 3", "Gate E75, US Departures", "airside", "Daily 05:00-21:00"),
      o("Level 3", "Gate E84, US Departures", "airside", "Daily 05:00-20:00"),
    ],
  }),
  vino_volo: restaurant({
    name: "Vino Volo", cuisine: "Dine In, Vegetarian", amenity: "bar",
    description: "Vino Volo offers a selection of wines from British Columbia and around the globe, craft cocktails and small plates from pizzettes, charcuterie, all day breakfast and more.",
    phone: "1-604-279-1890",
    vegetarian: true,
    outlets: [
      o("Level 3", "Gate E83, US Departures", "airside", "Mon 06:30-22:30; Tue-Thu 06:30-22:00; Fri-Sat 06:30-23:00; Sun 06:30-22:00"),
    ],
  }),
};

// ─── South Terminal ───

const southTerminalVenues = {
  galiano_cafe: restaurant({
    name: "Galiano Cafe", cuisine: "Grab and Go, Vegetarian, Breakfast", amenity: "fast_food",
    description: "The place to eat at YVR's South Terminal. Organic soups, salads, deli sandwiches, wraps and sweet treats in the pre-security area, with gluten free options available.",
    phone: "1-604-231-9822",
    vegetarian: true,
    outlets: [
      o("Level 1", "Gate G1", "landside", "Mon 07:30-16:30; Tue-Sat 06:30-17:00; Sun 07:30-14:00"),
    ],
  }),
  illy_caffe_vending: restaurant({
    name: "illy Caffe Vending", cuisine: "Grab and Go", amenity: "vending_machine",
    description: "This specialty coffee machine grinds whole beans, brews, and serves a comprehensive list of beverage selections, including espresso, cappuccino, caffe latte, macchiato, and many other espresso-based drinks.",
    phone: "778 389 8653",
    outlets: [
      o("Level 1", "South Terminal Departures", "landside", "Daily 00:00-24:00", true),
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

  const r1 = await processTerminal(AIRPORT, DOMESTIC_TERMINAL, 'Domestic Terminal', domesticTerminalVenues);
  const r2 = await processTerminal(AIRPORT, INTERNATIONAL_TERMINAL, 'International Terminal', internationalTerminalVenues);
  const r3 = await processTerminal(AIRPORT, US_TERMINAL, 'US Terminal', usTerminalVenues);
  const r4 = await processTerminal(AIRPORT, SOUTH_TERMINAL, 'South Terminal', southTerminalVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([DOMESTIC_TERMINAL, INTERNATIONAL_TERMINAL, US_TERMINAL, SOUTH_TERMINAL]));

  const totalCreated = r1.created + r2.created + r3.created + r4.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r4.deleted;
  const totalVenues = Object.keys(domesticTerminalVenues).length
    + Object.keys(internationalTerminalVenues).length
    + Object.keys(usTerminalVenues).length
    + Object.keys(southTerminalVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
