'use strict';
/**
 * Fills in complete data for Hartsfield-Jackson Atlanta International Airport
 * (ATL) — restaurants/cafés/bars in Firestore. Researched 2026-08-17 from the
 * airport's own official site, atl.com, using Claude in Chrome browser
 * automation per explicit user instruction. No third-party/aggregator source
 * was used for any venue field.
 *
 * SOURCE: https://www.atl.com/maps-fullscreen/ — the City of Atlanta
 * Department of Aviation's own interactive terminal map, which is also ATL's
 * only published dining directory (atl.com's SHOP.DINE.EXPLORE. nav item
 * resolves to a blog page, and /restaurants/ 404s; the map is where the
 * airport actually lists its venues). The map is an Acquire Digital Wayfinder
 * app whose complete structured backing store is a single JSON document:
 *   cdn.wayfinder.acquiredigital.com/live/mapdata/api/
 *     97136e9f751b0bf4-445bd581177bcf56a505d0e6f4a5c2b0
 * (1.78 MB; project "Atlanta International Airport", version 490, published
 * 2026-08-10). It carries 11 buildings, 20 map floors, 62 categories and 695
 * destinations. 163 destinations carry ATL's own top-level "Dine" category.
 * Each supplies id, name, categories{}, tags[], description, opening_txt,
 * opening_arr{}, phone_number, website, location_description,
 * nearby_landmark, floor and floor_name. This is the airport's own published
 * venue data, read from the airport's own map.
 *
 * EXTRACTION + VERIFICATION: the 163 Dine records were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter, `|` list delimiter) with every
 * non-ASCII character replaced by a reversible `<U+hex>` escape and every field
 * whitespace-normalised in the browser before checksumming, split into 11
 * chunks under 6,600 chars on line boundaries, written into a
 * `<pre id="dataDump">` and retrieved via get_page_text. Every chunk verified
 * EXACTLY on first pass against values computed in the browser before
 * retrieval — len/lines/checksum: 6197/13/28156307, 6449/16/29027787,
 * 6198/15/27979730, 6476/15/29368569, 6413/14/29238067, 6565/15/29600827,
 * 6357/15/28934162, 6171/13/27985053, 6183/14/28080705, 5992/16/27100809,
 * 5778/17/25940426 — as did the rejoined 163-line dataset at len 68789,
 * checksum 312108391, using checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 9 buckets, and this one needs its reasoning spelled out
 * because the two tests this dataset uses point in different directions.
 *
 * ATL is one Domestic Terminal (west) and one Maynard H. Jackson Jr.
 * International Terminal (east), with seven concourses — T, A, B, C, D, E, F —
 * strung between them and joined to each other and to both terminals by the
 * airside Plane Train / Transportation Mall.
 *
 * (a) The check-in-and-security test, run against ATL's own map data, is
 *     unambiguous: EVERY airline check-in position and EVERY security
 *     checkpoint in the entire airport sits on one of two floors. The Domestic
 *     Terminal floor holds Delta / Frontier / JetBlue / Southwest / Alaska
 *     check-in and the Main, North, South, South Pre-Check, South Pre-Check
 *     Touchless and South Clear checkpoints; the Int'l Departures floor holds
 *     Delta's international check-in, sixteen other carriers' desks and the
 *     International Checkpoint. Concourses T, A, B, C, D, E and F hold ZERO
 *     check-in positions and ZERO checkpoints between them. On that test alone
 *     ATL is 2 buckets.
 * (b) But the seven concourses are then a shared airside zone: one continuous
 *     post-security space that BOTH terminals' checkpoints feed, reachable in
 *     either direction on the Plane Train. Nothing in ATL's own data assigns a
 *     concourse to a terminal — the `buildings` array is flat, with "Concourse
 *     A" a sibling of "Domestic Terminal" and "International Terminal", not a
 *     child of either. So collapsing to 2 buckets would require either
 *     inventing a concourse→terminal mapping the airport does not publish, or
 *     duplicating all 152 concourse venues into both buckets.
 * (c) So the tiebreaker this dataset prescribes for a shared zone was run: test
 *     the site's OWN filter UI. ATL's map has a building picker at top right;
 *     opening it lists, as peers: All, Rental Car Center, Domestic Terminal,
 *     Concourse T, Concourse A, Concourse B, Concourse C, Concourse D,
 *     Concourse E, Concourse F, International Terminal. Every dining venue is
 *     filed under exactly one of them and no venue is dual-listed. The buckets
 *     in this file are therefore precisely the nine in-terminal peer values ATL
 *     itself publishes and files every dining venue under — no invented
 *     mapping, no duplication. This is the same rule that produced LAS's
 *     three buckets from LAS's own three terminal filter values.
 *
 * Applying the check-in-and-security test WITHIN a bucket produces no further
 * split: no concourse contains a second independent check-in/security pair.
 *
 * SCOPE — ATL's map also models a Rental Car Center (four floors). It holds no
 * Dine destination at all, so nothing was excluded on that account; all 163
 * Dine records sit in a terminal or concourse. Separately, ATL classifies its
 * Coca-Cola / Fuel Rod / Kylie Cosmetics / Pharmabox vending units and its
 * newsstands (Z-Market, Travel@Ease, News Beat ATL, The Market, ATL Today,
 * Midtown Magazines and the rest) under its own "Shop" top-level category, not
 * "Dine" — 55 such records carry a food-ish sub-tag like "Snacks" or "Vending"
 * but are Shop venues by the airport's own classification. They are left out
 * rather than reclassified, which is why this file contains no
 * `vending_machine` docs.
 *
 * AIRSIDE / LANDSIDE: ATL's records carry no explicit flag, so this is derived
 * from the airport's own checkpoint placement established in (a) above: the
 * seven concourses sit wholly beyond the only checkpoints ATL publishes, so
 * every concourse venue is `airside`; the Domestic Terminal's own dining (the
 * North/South Atrium food court and the TGI Fridays across from North Terminal
 * Baggage Claim #3) and the International Terminal's single Int'l Arrivals
 * Starbucks sit before/outside them, so those are `landside`. No venue's
 * classification required a judgement beyond that.
 *
 * LEVEL: ATL's own floor name, but only where it adds something the bucket
 * does not already say — "Level 2" for the seven Concourse F Level 2 venues,
 * "Mezzanine" for the two Concourse D Mezzanine venues and the Domestic
 * Terminal mezzanine A Bar & Grill, "Int'l Arrivals" for the arrivals-hall
 * Starbucks. Blank on the other 152, since "Concourse A" as a level would just
 * restate the bucket.
 *
 * LOCATION_NOTES: each record's own `location_description` verbatim — "Next to
 * Gate A12", "Concourse C Center", "North East Atrium", "South of Center",
 * "Across from North Terminal Baggage Claim #3", "Northeast of Center" —
 * falling back to `nearby_landmark` where ATL publishes no description. One
 * record (the Concourse D Grindhouse Burgers) has neither and is left blank
 * rather than given a guessed location.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME bucket are merged
 * into one doc with one `outlets[]` entry per physical unit; same-brand venues
 * in DIFFERENT buckets stay separate docs, per this dataset's standing rule.
 * Starbucks Coffee accordingly appears as nine separate docs — one each in the
 * Domestic Terminal, Concourse T (3 units), A, B (2 units), C (2 units), E, F
 * and the International Terminal — rather than one cross-airport doc. Brand
 * matching is case- and apostrophe-insensitive, plus one documented rendering
 * alias for a brand ATL renders two ways in the same bucket: "Starbucks" ≡
 * "Starbucks Coffee" (both in Concourse T). Distinctly NAMED venues are kept
 * separate per this dataset's page-truth-over-label precedent, even where they
 * share an operator or a parent brand: "Atlanta Bread Company" vs "Atlanta
 * Bread & Bar"; "Boar's Head Cafe" vs "Boar's Head Kiosk"; "The Pecan Bar" vs
 * "The Pecan Bistro"; "LeeAnn Chin" vs "Leeann Chin" (different buckets, so
 * never in contact anyway). 163 source records → 153 docs.
 *
 * CUISINE: the verbatim join of each record's own `categories`, in ATL's own
 * order, unfiltered — including ATL's own service-style categories ("Counter
 * Service", "Grab and Go", "Snacks"), its meal categories ("Breakfast",
 * "Dessert") and its "Live Games" tag, which is what the airport publishes.
 * Only the "Dine" collection identifier is dropped, since it is the filter
 * used to select these records rather than a cuisine. Where outlets were
 * merged, the union of their category sets is used, first-seen order
 * preserved. For the six venues ATL publishes with no categories at all
 * (Citizens Culinary Market, ASW Distillery, Duff's Deli & Market, Modern
 * Market Eatery, Cava, Za'Acai Cafe) its per-venue menu-item `tags` are used
 * instead, and for the one with neither, ATL's own "Dine" category. ATL's
 * separate `tags` array is otherwise NOT folded into cuisine: it lists
 * individual menu items ("Branzino", "Fountain Drinks", "Tater Tots"), not
 * cuisine or genre.
 *
 * AMENITY: ATL's category set turns out not to be usable directly for service
 * style, and the two traps are documented here rather than silently worked
 * around. (1) ATL's "Coffee" category means "also sells coffee" — it is
 * attached to Popeye's, Chick-Fil-A, Baja Fresh, Boardwalk Burgers, Famous
 * Famiglia and Nathan's Famous — so `cafe` is decided on the venue's own name
 * (Coffee / Café / Starbucks / Dunkin / Bagel / Bread / Brioche / Kolache /
 * Krispy Kreme / Donut / La Madeleine / Roast / Grounds / Beanery / Tea Leaf /
 * Espresso / Cinnabon / Boulangerie), never on that category. (2) Per this
 * dataset's standing rule a "bar" is verified against the venue's own name and
 * description rather than a tag alone, and ATL's "Bar" category is attached to
 * plainly food-led venues — P.F. Chang's, Ecco, One Flew South, Buffalo Wild
 * Wings, Mustard Seed BBQ, Phillip's Seafood, Umaizushi, Coffee Beanery — so
 * `bar` is likewise name-driven: a name carrying Bar / Lounge / Pub / Taphouse
 * / Brewhouse / Brewery / Distillery / Stillhouse / Tavern / Beer / Juke Joint
 * / Biersch / Vino Volo, and NOT also carrying a food format (Grill, Kitchen,
 * Bistro, Pizzeria, Pizza, Steakhouse, Market, Seafood, Diner, Eatery,
 * Restaurant, Waffles, Deli, Burgers, BBQ, Chicken, Sushi). That keeps "The A
 * Bar & Grill", "SweetWater Bar & Grill", "Beercode | Kitchen & Bar" and
 * "Chicken + Beer" as restaurants and "40/40 Bar", "Samuel Adams Bar",
 * "Terrapin Taphouse", "Blue Moon Brewhouse", "ASW Distillery", "Old Fourth
 * Distillery", "Atlanta Stillhouse", "Sweet Georgia's Juke Joint", "The Piano
 * Bar", "Century Bar & Bites", "Gordon Biersch" and "Vino Volo" as bars. EXACTLY
 * TWO venues are promoted to `bar` on something other than their name, in both
 * cases because ATL's own description calls the venue a bar in those words:
 * Truly Atlanta ("the Truly Bar Atlanta offers a state-of-the-art ordering
 * system… order food from the surrounding restaurants and have it brought to
 * the bar") and Lorena Garcia ("If you are looking for a bar to sit back and
 * relax… Latin-infused bar program in Concourse F"). Otherwise: a "Counter
 * Service", "Grab and Go" or "Snacks" category → `fast_food`, taken at ATL's
 * face value even where the venue is table-service-ish (Phillip's Seafood,
 * Paschal's, Bantam & Biddy and The Pecan Bistro all carry it); a
 * quick-service brand name ATL publishes with no service-style category at all
 * → `fast_food` (this affects Burger King only); everything else →
 * `restaurant`. Resulting mix across the 163 records: 77 fast_food, 39 cafe,
 * 31 restaurant, 16 bar. No `vending_machine` — see SCOPE above.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: set to 'yes' ONLY where
 * ATL's own data says so. ATL publishes a single combined "Vegetarian/Vegan"
 * category, which asserts both, so it sets both flags; its per-venue tags
 * "Vegetarian", "Vegan" and "Gluten Free" set the corresponding flag on their
 * own. ATL publishes no halal or kosher tag on any dining venue, so those
 * fields are blank on every doc in this file rather than guessed. Where
 * outlets were merged, a flag is set if ANY merged unit carries it.
 *
 * DESCRIPTION: verbatim from each record's own `description`, whitespace-
 * normalised, with three of ATL's own data defects repaired rather than
 * propagated: a literal `<br>` separator (Gordon Biersch, Fresh Healthy Cafe,
 * Truly Atlanta, Cava, Southern National Market, two Starbucks) is turned into
 * a space; where the fragment before that break is just the venue's published
 * location repeated ("Near Gate C43", "Concourse B Center") it is dropped; and
 * the Concourse F Atlanta Bread Company, whose description ATL publishes twice
 * over in one field, is de-duplicated. Four records whose "description" is
 * only the venue's own name (Citizens Culinary Market, Old Fourth Distillery,
 * Century Bar & Bites, Za'Acai Cafe) get a blank description rather than a
 * self-referential one.
 *
 * OPENING HOURS / 24-7: `opening_hours` is the record's own `opening_txt`
 * verbatim, in ATL's own free-text notation ("Mon-Sun 6am-10pm", "Mon-Sat
 * 5:30am-10pm Closed Sun.", "Mon-Sun 5am-10pm/ last flight", "Sun-Thu 6am-11pm
 * / Fri-Sat 24 hrs.", "24 Hours"). 15 records carry no hours and are left
 * blank. `open_24_7` is set only where the whole published string IS a
 * 24-hour statement — the Concourse A McDonald's reads "Sun-Thu 6am-11pm /
 * Fri-Sat 24 hrs.", which is 24 hours on two days, not a 24/7 venue, and is
 * not flagged.
 *
 * PHONE: ATL publishes a `phone_number` field but it is null on all 163 dining
 * records, so `phone` is blank on every doc in this file. Nothing was
 * scraped from description prose to fill it.
 *
 * WEBSITE / LOGO: ATL publishes a `website` field but it is null on all 163
 * dining records. Following this dataset's KUL precedent, `website` (and the
 * logo.dev logo derived from it) is set only for globally or nationally
 * recognisable chains and well-known Atlanta concepts whose primary domain is
 * confidently known, and left blank for every other independent concept —
 * "Truly Atlanta", "The A Bar & Grill", "Southern National Market", "Citizens
 * Culinary Market", "Century Bar & Bites", "Za'Acai Cafe", "Lemonade",
 * "Boardwalk Burgers", "Low Country", "Piece of Cake", "Fab Yo!", "Umaizushi",
 * "Links Grill", "Sweet Georgia's Juke Joint", "Johnny's Chicken & Waffles"
 * and the rest — rather than guessed.
 *
 * VERIFIED TOTALS: 163 source Dine records → 153 restaurant docs / 163
 * outlets. Domestic Terminal: 11 records → 10 docs / 11 outlets. Concourse T:
 * 18 → 17 / 18. Concourse A: 26 → 23 / 26. Concourse B: 28 → 25 / 28.
 * Concourse C: 29 → 27 / 29. Concourse D: 22 → 22 / 22. Concourse E: 18 → 18 /
 * 18. Concourse F: 10 → 10 / 10. International Terminal: 1 → 1 / 1.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['atl', 'hartsfield-jackson', 'atlanta'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const DOMESTIC_TERMINAL = 'domestic_terminal';
const CONCOURSE_T = 'concourse_t';
const CONCOURSE_A = 'concourse_a';
const CONCOURSE_B = 'concourse_b';
const CONCOURSE_C = 'concourse_c';
const CONCOURSE_D = 'concourse_d';
const CONCOURSE_E = 'concourse_e';
const CONCOURSE_F = 'concourse_f';
const INTERNATIONAL_TERMINAL = 'international_terminal';

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
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "You can have the perfect anytime snack at Auntie Anne’s! Known for hand-baked pretzels to be enjoyed with a refreshing lemonade among other favorites. The menu includes pepperoni pretzels, pretzel nuggets, dogs and dips with a variety of beverages.",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("", "North East Atrium", "landside", "Mon-Sun 5am-8pm"),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Breakfast, American Food, Burgers", amenity: "fast_food",
    description: "Be sure to stop by and get America's favorite flamed broiled burger to go.",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("", "South East Atrium", "landside", "Mon-Sun 5am-2:30am"),
    ],
  }),
  ihop: restaurant({
    name: "IHOP", cuisine: "Salad, Breakfast, American Food, Burgers", amenity: "restaurant",
    description: "The iconic brand, famous all over the world for bringing guests everything they love about breakfast, dishes up everyone's favorite IHOP menu items. Serving breakfast all day, the extensive menu also includes classic lunch and dinner items, including beef tips, burgers, signature sandwiches and so much more all paired with a selection of beers and wines.",
    website: "ihop.com", logoUrl: logo("ihop.com"),
    outlets: [
      o("", "South West Atrium", "landside", "Mon-Sun 5am-11pm"),
    ],
  }),
  leeann_chin: restaurant({
    name: "LeeAnn Chin", cuisine: "Asian Food, Counter Service", amenity: "fast_food",
    description: "We passionately prepare Pan-Asian dishes for your delight. Choose from several authentic dishes. Try our Grilled Bourbon Chicken, Mongolian Chicken, or the Beef & Broccoli. Each is paired with your choice of rice, noodles, or tofu. This is a can’t miss.",
    website: "leeannchin.com", logoUrl: logo("leeannchin.com"),
    outlets: [
      o("", "South East Atrium", "landside", "Mon-Sun 9am-10 pm"),
    ],
  }),
  popeyes: restaurant({
    name: "Popeye's", cuisine: "Coffee, Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "Popeyes Louisiana Kitchen offers a unique \"New Orleans\" style menu that features signature fried chicken, award winning chicken sandwiches, handcrafted chicken tenders, Cajun fish, red beans, and rice, coleslaw and other flavorful sides and desserts.",
    website: "popeyes.com", logoUrl: logo("popeyes.com"),
    outlets: [
      o("", "South East Atrium", "landside", "Mon-Sun 6am-10pm"),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "cafe",
    description: "More than just great coffee, explore our ever-changing menu for your favorite seasonal beverages. For those looking to satisfy their hunger, come grab a delicious pastry, breakfast or hearty sandwich, and our Grab & Go coolers have snacks and cold beverages for those travelers on the go!",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "North East Atrium", "landside", "24 Hours", true),
    ],
  }),
  taco_bell: restaurant({
    name: "Taco Bell", cuisine: "Mexican Food, Counter Service", amenity: "fast_food",
    description: "We serve a variety of Mexican-inspired foods, including tacos, burritos, quesadillas, nachos, novelty and specialty items.",
    website: "tacobell.com", logoUrl: logo("tacobell.com"),
    outlets: [
      o("", "South East Atrium", "landside", "Mon-Sun 6am-10pm"),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "Bar, Salad, Dessert, American Food, Burgers", amenity: "restaurant",
    description: "Providing casual dining options from a World-Famous international brand. Specializing in great tasting food; Burgers, Wings, Ribs and Signature Salads, as well as Craft-inspired alcohol beverages.",
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"),
    outlets: [
      o("", "Across from North Terminal Baggage Claim #3", "landside", "Mon-Sun 7:30am-11pm"),
    ],
  }),
  the_a_bar_grill: restaurant({
    name: "The A Bar & Grill", cuisine: "Bar, Dessert, American Food, Burgers, Live Games", amenity: "restaurant",
    description: "Craft brew house serving American steakhouse classics, paired with the city’s finest handcrafted beers. Much more than a steakhouse, offering a great experience at an affordable price including lite bites, burgers and fresh seafood accompanied by an extensive wine list.",
    outlets: [
      o("", "North East Atrium", "landside", "Mon-Sun 6am-10pm"),
      o("Mezzanine", "Domestic Terminal Upper Level", "landside", "Mon-Sun 6am-10pm"),
    ],
  }),
  we_juice_it: restaurant({
    name: "We Juice It", cuisine: "Deli, Grab and Go, Salad, Vegetarian/Vegan, Counter Service, Dessert", amenity: "fast_food",
    description: "We Juice It is an innovative juice bar concept featuring fresh juices and smoothies along with other healthy snack alternatives. We Juice It also carries organic wheatgrass and power shots plus many healthy Add –Ons such as Chia Seeds, Flax Seeds, Whey Protein and more! Stop by to hydrate, renew, and energize!",
    vegetarian: true, vegan: true,
    outlets: [
      o("", "North West Atrium", "landside", "Mon-Sun 7am-10pm"),
    ],
  }),
};

// ─── Concourse T ───

const concourseTVenues = {
  atlanta_stillhouse: restaurant({
    name: "Atlanta Stillhouse", cuisine: "Bar, Salad, Barbecue, Burgers", amenity: "bar",
    description: "Classic Bourbon Bar featuring the 25 Most Popular and Generational Bourbon’s, the best BBQ and southern sides. Yo-Yeah!",
    outlets: [
      o("", "Next to Gate T 14", "airside", "Mon-Sun 5am-10pm"),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "You can have the perfect anytime snack at Auntie Anne’s! Known for hand-baked pretzels to be enjoyed with a refreshing lemonade among other favorites. The menu includes pepperoni pretzels, pretzel nuggets, dogs and dips with a variety of beverages.",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("", "Next to Gate T15", "airside", "Mon-Sun 9am-7:30pm"),
    ],
  }),
  bojangles: restaurant({
    name: "Bojangles'", cuisine: "Counter Service, Breakfast", amenity: "fast_food",
    description: "Sink your teeth into the perfectly seasoned hand battered fried chicken; hand battered chicken sandwich; Cajun and Homestyle tenders and fluffy made-from-scratch biscuits. It’s So Cluckin’ Good!",
    website: "bojangles.com", logoUrl: logo("bojangles.com"),
    outlets: [
      o("", "Near Gate T6", "airside", "Mon-Sun 5am-11pm"),
    ],
  }),
  cantina_laredo: restaurant({
    name: "Cantina Laredo", cuisine: "Mexican Food, Counter Service", amenity: "fast_food",
    description: "Catina Laredo us committed to giving you the true taste of authentic Mexican cooking, offering a menu that evokes the sophisticated tastes of Mexico City.",
    website: "cantinalaredo.com", logoUrl: logo("cantinalaredo.com"),
    outlets: [
      o("", "Near Gate T7", "airside", "Mon-Sun 9am-10pm"),
    ],
  }),
  coffee_bean_tea_leaf: restaurant({
    name: "Coffee Bean & Tea Leaf", cuisine: "Coffee, Salad, Toiletries, Snacks, Counter Service, Breakfast, Bakery", amenity: "cafe",
    description: "Don't want to wait in line all day? Come see us for Coffee, Tea, Pastries and other goodies. We get you in and out to make that flight.",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("", "Next to Gate T6", "airside", "Mon-Sun 4:30am-10pm"),
    ],
  }),
  dunkin_donuts: restaurant({
    name: "Dunkin' Donuts", cuisine: "Coffee, Counter Service, Breakfast, American Food", amenity: "cafe",
    description: "Dunkin' Donuts is America's favorite every day, all-day stop for coffee, sandwiches and baked goods.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
      o("", "Next to Gate T3", "airside", "Mon-Sun 5am-10pm"),
    ],
  }),
  goldbergs_bagels: restaurant({
    name: "Goldberg's Bagels", cuisine: "Coffee, Salad, Counter Service, Breakfast", amenity: "cafe",
    description: "Looking for Authentic New York Deli Foods Combined with Southern Hospitality? At Goldbergs Deli, everything is made to order, and freshness is never compromised.",
    website: "goldbergbagel.com", logoUrl: logo("goldbergbagel.com"),
    glutenFree: true,
    outlets: [
      o("", "Next to Gate T 12", "airside", "Mon-Sun 5am-10pm (or last flight)"),
    ],
  }),
  grindhouse_burgers: restaurant({
    name: "Grindhouse Burgers", cuisine: "Bar, Salad, Counter Service, American Food, Burgers", amenity: "fast_food",
    description: "The Award-Winning Burger & “Double the Size” Airport Bar from Right Here in the ATL. Yum Yum Burgers, Fries and Shakes – Breakfast Too! New Carryout packaging makes this perfect for your flight!",
    website: "grindhouseburgers.com", logoUrl: logo("grindhouseburgers.com"),
    outlets: [
      o("", "Next to Gate T11", "airside", "Mon-Sun 5am-10pm"),
    ],
  }),
  harvest_grounds: restaurant({
    name: "Harvest & Grounds", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast, Bakery", amenity: "cafe",
    description: "Get a delicious cup of the best regional coffee. We brew it fresh every hour. We feature an assortment of delicious pastries, sandwiches, salads and specialty tea and coffee beverages.",
    outlets: [
      o("", "Next to Gate T10", "airside", "Mon-Sun 4:30am -10pm"),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "Vegetarian/Vegan, Counter Service, American Food", amenity: "fast_food",
    description: "Smoothies with Fantastic Flavor is always in season and nothing beats feeling your best. For over 25 years, we’ve brought the right ingredients to create the “Whirl’d Famous” flavor!",
    website: "jamba.com", logoUrl: logo("jamba.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate T3", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  maddios_pizza: restaurant({
    name: "Maddio's Pizza", cuisine: "Salad, Vegetarian/Vegan, Counter Service, Pizza, American Food", amenity: "fast_food",
    description: "We create your pizza from scratch daily! “Best Pizza and Best Dollar Value in the airport!” We serve your pizza in smart carryout packaging approved by the airlines!",
    website: "maddios.com", logoUrl: logo("maddios.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate T10", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  southern_national_market: restaurant({
    name: "Southern National Market", cuisine: "Bar, Salad, Seafood, Vegetarian/Vegan, Dessert", amenity: "restaurant",
    description: "Serving wings, calzones, and crafted California-inspired, thin crust pizza",
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Near Gate T21", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "cafe",
    description: "More than just great coffee, explore our ever-changing menu for your favorite seasonal beverages. For those looking to satisfy their hunger, come grab a delicious pastry, breakfast or hearty sandwich, and our Grab & Go coolers have snacks and cold beverages for those travelers on the go!",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Near Gate T17", "airside", "Mon-Sun 4am-10pm"),
      o("", "Near Gate T8", "airside", ""),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Salad, Counter Service", amenity: "fast_food",
    description: "Seeking quick, nutritious meal options that the whole family can enjoy? Subway serves fresh, delicious, sandwiches made-to-order right in front of you.",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("", "Next to Gate T6", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "Bar, Salad, Dessert, American Food, Burgers", amenity: "restaurant",
    description: "Providing casual dining options from a World-Famous international brand. Specializing in great tasting food; Burgers, Wings, Ribs and Signature Salads, as well as Craft-inspired alcohol beverages.",
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"),
    outlets: [
      o("", "Near Gate T4", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  tropical_smoothie_cafe: restaurant({
    name: "Tropical Smoothie Cafe", cuisine: "Salad, Vegetarian/Vegan, Counter Service, Breakfast", amenity: "cafe",
    description: "We make eating better easy breezy with fresh, made-to-order smoothies, wraps, sandwiches and flatbreads that instantly boost your mood.",
    website: "tropicalsmoothiecafe.com", logoUrl: logo("tropicalsmoothiecafe.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate 18", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  vino_volo: restaurant({
    name: "Vino Volo", cuisine: "Bar, Salad, Pizza, Live Games", amenity: "bar",
    description: "Full bar specializing in wine and wine flights with a mix of big and small plates curated by Local Chef Duane Nutter.",
    website: "vinovolo.com", logoUrl: logo("vinovolo.com"),
    outlets: [
      o("", "Near Gate T17", "airside", "Mon-Sun 6:00am-10pm"),
    ],
  }),
};

// ─── Concourse A ───

const concourseAVenues = {
  asian_chao: restaurant({
    name: "Asian Chao", cuisine: "Asian Food, Counter Service, Chinese Food", amenity: "fast_food",
    description: "Familiar Chinese dishes & sushi rolls from a no-frills takeout-counter chain.",
    website: "asianchao.com", logoUrl: logo("asianchao.com"),
    outlets: [
      o("", "Next to Gate A3", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  atlanta_bread_bar: restaurant({
    name: "Atlanta Bread & Bar", cuisine: "Bar, Coffee, Deli, Grab and Go, Salad, Seafood, Vegetarian/Vegan, Counter Service, Breakfast, American Food, Bakery, Burgers", amenity: "cafe",
    description: "Atlanta Bread and Sweetwater Bar offers a local experience that satisfies appetites with quality food and a full-service bar in a casual and friendly setting. The menu features Atlanta Bread Company’s fresh and exceptional sandwiches, salads, soups and pastries. The bar oﬀers an extended menu of wings, bruschetta, 100% beef burgers, chicken sandwiches, fries and Sweetwater’s award winning craft beer along with wine and specialty cocktails. We also offer a full-service breakfast menu with French toast, omelets, oatmeal, grits with bacon, sausage or turkey sausage.",
    website: "atlantabread.com", logoUrl: logo("atlantabread.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate A12", "airside", "Mon-Sun DINE IN: 7am-10pm / TO-GO: 6am-7pm"),
    ],
  }),
  atlanta_hawks_bar: restaurant({
    name: "Atlanta Hawks Bar", cuisine: "Bar, Salad, Dessert, American Food, Burgers, Live Games", amenity: "bar",
    description: "Atlanta Hawks Bar & Grill cooks up classic southern dishes and more.",
    outlets: [
      o("", "Next to Gate A34", "airside", "Mon-Sun 8am-9pm"),
    ],
  }),
  beercode_kitchen_bar: restaurant({
    name: "Beercode | Kitchen & Bar", cuisine: "Burgers, Live Games", amenity: "restaurant",
    description: "Beers from the most awarded national & local brands with their stories collected and distributed along the entire journey: atmosphere, tradition & food. Our objective - enhance freshness, craftsmanship, and quality embodied by beer.",
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate A3", "airside", "Mon-Sun 8am-10pm"),
    ],
  }),
  boars_head_cafe: restaurant({
    name: "Boar's Head Cafe", cuisine: "Salad, Counter Service, Breakfast", amenity: "cafe",
    description: "Boar’s Head has been the delicatessen brand you can trust for over 115 years. We are committed to providing the highest quality delicatessen products. Our products are made of only the finest ingredients: whole muscle beef, pork and poultry, and spices sourced from around the globe.",
    website: "boarshead.com", logoUrl: logo("boarshead.com"),
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 5am-10pm/ last flight"),
    ],
  }),
  boars_head_kiosk: restaurant({
    name: "Boar's Head Kiosk", cuisine: "Grab and Go, Salad, Snacks", amenity: "fast_food",
    description: "Boar’s Head has been the delicatessen brand you can trust for over 115 years. We are committed to providing the highest quality delicatessen products. Our products are made of only the finest ingredients: whole muscle beef, pork and poultry, and spices sourced from around the globe.",
    website: "boarshead.com", logoUrl: logo("boarshead.com"),
    outlets: [
      o("", "Next to Gate A4", "airside", "Mon-Sun 6am-10pm"),
      o("", "Next to Gate A15", "airside", "Mon-Sun 6am-10pm"),
      o("", "Next to Gate A28", "airside", "Mon-Sun 6am-10pm"),
      o("", "Next to Gate A20", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  boardwalk_burgers: restaurant({
    name: "Boardwalk Burgers", cuisine: "Coffee, Salad, Counter Service, Breakfast, American Food, Burgers", amenity: "fast_food",
    description: "Fresh & hand rolled daily, goes great with our famous cook to order fries & shakes. Don't forget the malt vinegar.",
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  brioche_doree: restaurant({
    name: "Brioche Doree", cuisine: "Coffee, Salad, Counter Service, Dessert, Pizza, Bakery", amenity: "cafe",
    description: "Parisian urban bakery café built on the simple promise to offer traditional French products of exceptional quality and freshness. Stop by for breakfast, lunch or dinner for freshly prepared croissant or baguette sandwiches, salads, coffee and so much more.",
    website: "briochedoree.com", logoUrl: logo("briochedoree.com"),
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 5:30am - 10pm"),
    ],
  }),
  caribou_coffee: restaurant({
    name: "Caribou Coffee", cuisine: "Coffee, Counter Service, Dessert, Breakfast, Bakery", amenity: "cafe",
    description: "A great place for iced or hot coffee, specialty drinks: hot, iced or blended, smoothies and pastries. Grab & Go sandwiches and snacks for you to enjoy.",
    website: "cariboucoffee.com", logoUrl: logo("cariboucoffee.com"),
    outlets: [
      o("", "Next to Gate A2", "airside", "Mon-Sun 5:30am-8:30pm"),
    ],
  }),
  cat_coras_kitchen: restaurant({
    name: "Cat Cora's Kitchen", cuisine: "Bar, Salad, Seafood, American Food, Burgers, Live Games", amenity: "restaurant",
    description: "Cat Cora's Kitchen serves up bites on the fly, entrees, sides, and more.",
    outlets: [
      o("", "Next to Gate A 25", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-Fil-A", cuisine: "Coffee, Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "Home of the Original Chicken Sandwich, enjoy your favorite chicken sandwich crispy or grilled with a mouth-watering lemonade. Don’t forget about breakfast with our signature Chick-fil-A Chicken Biscuit or our Chick-n-Minis.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sat 5:30am-10pm Closed Sun."),
    ],
  }),
  coffee_bean_tea_leaf: restaurant({
    name: "Coffee Bean & Tea Leaf", cuisine: "Coffee, Salad, Toiletries, Snacks, Counter Service, Breakfast, Bakery", amenity: "cafe",
    description: "Don't want to wait in line all day? Come see us for Coffee, Tea, Pastries and other goodies. We get you in and out to make that flight.",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("", "Next to Gate A12", "airside", "Mon-Sun 5:30am-10pm"),
    ],
  }),
  freshens: restaurant({
    name: "Freshen's", cuisine: "Counter Service, Dessert, Breakfast", amenity: "fast_food",
    description: "Freshëns is a healthy “fresh casual” concept, which offers prepared to order food inspired by fresh ingredients, as well as our signature fresh blended smoothies. From Crepe’s, to Rice Bowls to Smoothies, you’ll find something to satisfy your fresh taste cravings.",
    website: "freshens.com", logoUrl: logo("freshens.com"),
    outlets: [
      o("", "Next to Gate A 25", "airside", "Mon-Sun 7am-11pm"),
    ],
  }),
  goldbergs_bagels: restaurant({
    name: "Goldberg's Bagels", cuisine: "Coffee, Salad, Counter Service, Breakfast", amenity: "cafe",
    description: "Looking for Authentic New York Deli Foods Combined with Southern Hospitality? At Goldbergs Deli, everything is made to order, and freshness is never compromised.",
    website: "goldbergbagel.com", logoUrl: logo("goldbergbagel.com"),
    glutenFree: true,
    outlets: [
      o("", "Next to Gate A16", "airside", "5 am to 8:30 pm"),
    ],
  }),
  gordon_biersch: restaurant({
    name: "Gordon Biersch", cuisine: "Bar, Salad, Vegetarian/Vegan, Live Games", amenity: "bar",
    description: "Near Gate A18 Features house-brewed, German-style beer & a pub menu served in a casual setting.",
    website: "gordonbiersch.com", logoUrl: logo("gordonbiersch.com"),
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 7:30am-10pm/last flight"),
    ],
  }),
  great_wraps: restaurant({
    name: "Great Wraps", cuisine: "Salad, Vegetarian/Vegan, Counter Service", amenity: "fast_food",
    description: "If you’re on the go, stop by and grab a Gyro, Chicken, Steak or Breakfast Wrap. We also have Philly’s, Bowls, and some great pancakes. We know you care about the food you eat and so do we! We want to feed your body, mind and spirit with fresh food teeming with flavor.",
    website: "greatwraps.com", logoUrl: logo("greatwraps.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  low_country: restaurant({
    name: "Low Country", cuisine: "Counter Service, Dessert, Barbecue", amenity: "fast_food",
    description: "Low Country offers fresh Southern cuisine.",
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 5:00am-8:30pm"),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "Coffee, Salad, Counter Service, Breakfast, Burgers", amenity: "fast_food",
    description: "A quick service restaurant serving breakfast, lunch and dinner. Our menu includes: fries, the Big Mac, chicken sandwiches, chicken nuggets, hamburgers, and shakes.",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    outlets: [
      o("", "Next to Gate A11", "airside", "Sun-Thu 6am-11pm / Fri-Sat 24 hrs."),
    ],
  }),
  p_f_changs: restaurant({
    name: "P.F. Chang's", cuisine: "Asian Food, Bar, Salad, Vegetarian/Vegan", amenity: "restaurant",
    description: "With roots in Chinese cuisine, today’s menu at P.F. Chang’s spans across all of Asia, honoring cultures and recipes from Japan, Korea, Thailand, and beyond. Each item offers a unique exploration of flavor, whether it’s a handcrafted cocktail, a wok-fired lunch bowl, or a celebratory multi-course dinner.",
    website: "pfchangs.com", logoUrl: logo("pfchangs.com"),
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 6:30am - 10pm/ last flight"),
    ],
  }),
  piece_of_cake: restaurant({
    name: "Piece of Cake", cuisine: "Counter Service, Dessert", amenity: "fast_food",
    description: "Piece of Cake features savory sweets and Abica Coffee.",
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 5am-10pm/last flight"),
    ],
  }),
  qdoba: restaurant({
    name: "Qdoba", cuisine: "Mexican Food, Counter Service", amenity: "fast_food",
    description: "Qdoba Mexican Grill combines fresh ingredients with an innovative combination of sauces, salsas and marinades to create non-traditional, fast-casual Mexican fare.",
    website: "qdoba.com", logoUrl: logo("qdoba.com"),
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "Vegetarian/Vegan, Counter Service, Burgers", amenity: "fast_food",
    description: "Hip, counter-serve chain for gourmet takes on fast-food classics like burgers & frozen custard.",
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"),
    vegetarian: true, vegan: true, glutenFree: true,
    outlets: [
      o("", "Next to Gate A28", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  varasanos_pizzeria: restaurant({
    name: "Varasano's Pizzeria", cuisine: "Bar, Salad, Pizza, Live Games", amenity: "restaurant",
    description: "Varasano's serves up Italian specialty pizzas and meat & cheese platters.",
    website: "varasanos.com", logoUrl: logo("varasanos.com"),
    outlets: [
      o("", "Concourse A Center", "airside", "Mon-Sun 7am - 10pm"),
    ],
  }),
};

// ─── Concourse B ───

const concourseBVenues = {
  asian_chao: restaurant({
    name: "Asian Chao", cuisine: "Asian Food, Counter Service, Chinese Food", amenity: "fast_food",
    description: "Familiar Chinese dishes & sushi rolls from a no-frills takeout-counter chain.",
    website: "asianchao.com", logoUrl: logo("asianchao.com"),
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  asw_distillery: restaurant({
    name: "ASW Distillery", cuisine: "Dine", amenity: "bar",
    description: "ASW Distillery offers a variety of locally distilled spirits, including bourbon, rye and vodka, all crafted with the finest ingredients and traditional methods. The distillery’s tasting room will provide a welcoming atmosphere where travelers can relax and enjoy a curated selection of cocktails and flights.",
    website: "aswdistillery.com", logoUrl: logo("aswdistillery.com"),
    outlets: [
      o("", "Next to Gate B33", "airside", "7am to 11 pm"),
    ],
  }),
  atlanta_bagel_co: restaurant({
    name: "Atlanta Bagel Co", cuisine: "Grab and Go, Snacks, Breakfast", amenity: "cafe",
    description: "For travelers who are on the go and need a quick and easy solution. From a delicious Bagel to an iced cold beverage or just a quick snack, we can satisfy your cravings.",
    website: "atlantabagel.com", logoUrl: logo("atlantabagel.com"),
    outlets: [
      o("", "Next to Gate B33", "airside", "Mon-Sun 8am-10pm"),
    ],
  }),
  atlanta_bread_company: restaurant({
    name: "Atlanta Bread Company", cuisine: "Deli, Grab and Go, Salad, Vegetarian/Vegan, Counter Service, American Food, Bakery", amenity: "cafe",
    description: "Enjoy exceptional sandwiches, salads, and pastries on the go from the Atlanta Bread Company, an Atlanta favorite! Our breads, cookies and pastries are baked fresh daily! We also carry a variety of refreshing beverages and snacks.",
    website: "atlantabread.com", logoUrl: logo("atlantabread.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate B7", "airside", "Mon-Wed & Sat 9am-7pm Sun, Thu, Fri 9am-9pm"),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "You can have the perfect anytime snack at Auntie Anne’s! Known for hand-baked pretzels to be enjoyed with a refreshing lemonade among other favorites. The menu includes pepperoni pretzels, pretzel nuggets, dogs and dips with a variety of beverages.",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("", "Next to Gate B23", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  blue_moon_brewhouse: restaurant({
    name: "Blue Moon Brewhouse", cuisine: "Bar, Salad, American Food, Burgers", amenity: "bar",
    description: "Take a break and relax with one of our varietals paired with some great food. A nice respite before continuing your journey. Catch the latest game during your meal. Our food isn’t complicated, it’s just good.",
    website: "bluemoonbrewingcompany.com", logoUrl: logo("bluemoonbrewingcompany.com"),
    outlets: [
      o("", "Next to Gate B11", "airside", "Mon-Sun 6am-10pm/ last flight"),
    ],
  }),
  boars_head_kiosk: restaurant({
    name: "Boar's Head Kiosk", cuisine: "Grab and Go, Salad, Snacks", amenity: "fast_food",
    description: "Boar’s Head has been the delicatessen brand you can trust for over 115 years. We are committed to providing the highest quality delicatessen products. Our products are made of only the finest ingredients: whole muscle beef, pork and poultry, and spices sourced from around the globe.",
    website: "boarshead.com", logoUrl: logo("boarshead.com"),
    outlets: [
      o("", "Next to Gate B31", "airside", "Mon-Sun 8am-10pm"),
    ],
  }),
  bobbys_burger_palace: restaurant({
    name: "Bobby's Burger Palace", cuisine: "Bar, Salad, Vegetarian/Vegan, Burgers, Live Games", amenity: "restaurant",
    description: "The MasterChef Bobby Flay has brought the \"American Burger Concept\" to ATL with its spoon-ending milkshakes! Experience the next level burger!",
    website: "bobbysburgerpalace.com", logoUrl: logo("bobbysburgerpalace.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate B26", "airside", "M-Su 6am-10pm"),
    ],
  }),
  buffalo_wild_wings: restaurant({
    name: "Buffalo Wild Wings", cuisine: "Bar, Salad, American Food, Live Games", amenity: "restaurant",
    description: "An American casual dining restaurant and sports bar which specializes in Buffalo wings, sauces and much more.",
    website: "buffalowildwings.com", logoUrl: logo("buffalowildwings.com"),
    outlets: [
      o("", "Next to Gate B10", "airside", ""),
    ],
  }),
  cava: restaurant({
    name: "Cava", cuisine: "Bowls, Chicken, Healthy, Hummus, Mediterranean, Pita, Salads", amenity: "restaurant",
    description: "CAVA is known for its customizable Mediterranean bowls, salads, and pitas, featuring fresh ingredients and bold, vibrant flavors.",
    website: "cava.com", logoUrl: logo("cava.com"),
    outlets: [
      o("", "Concourse B Center", "airside", ""),
    ],
  }),
  coffee_beanery: restaurant({
    name: "Coffee Beanery", cuisine: "Bar, Coffee, Counter Service, Breakfast", amenity: "cafe",
    description: "Enjoy a great cup of coffee or latte or maybe a nice glass of wine while you’re waiting for your flight. Later during the day, have a drink at the bar and enjoy one our fresh sandwiches or salads. It’s time for a break and you can enjoy it with us.",
    website: "coffeebeanery.com", logoUrl: logo("coffeebeanery.com"),
    outlets: [
      o("", "Next to Gate B3", "airside", "Mon-Sun 5am-10pm"),
    ],
  }),
  dunkin_donuts: restaurant({
    name: "Dunkin' Donuts", cuisine: "Coffee, Counter Service, Breakfast, American Food", amenity: "cafe",
    description: "Dunkin' Donuts is America's favorite every day, all-day stop for coffee, sandwiches and baked goods.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
      o("", "Next to Gate B26", "airside", "Mon-Sun 6am-9pm"),
    ],
  }),
  fresh_to_order: restaurant({
    name: "Fresh To Order", cuisine: "Salad, Vegetarian/Vegan, Counter Service, Burgers", amenity: "fast_food",
    description: "Fresh, fine, flavorful and always made from scratch. You can taste the difference in our food. The salad offerings will make you come for more!",
    website: "freshtoorder.com", logoUrl: logo("freshtoorder.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  freshens: restaurant({
    name: "Freshen's", cuisine: "Counter Service, Dessert, Breakfast", amenity: "fast_food",
    description: "Freshëns is a healthy “fresh casual” concept, which offers prepared to order food inspired by fresh ingredients, as well as our signature fresh blended smoothies. From Crepe’s, to Rice Bowls to Smoothies, you’ll find something to satisfy your fresh taste cravings.",
    website: "freshens.com", logoUrl: logo("freshens.com"),
    outlets: [
      o("", "Next to Gate B9", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  modern_market_eatery: restaurant({
    name: "Modern Market Eatery", cuisine: "Bowls, Healthy, Salad, Sandwich, Vegetables", amenity: "restaurant",
    description: "Modern Market Eatery focuses on made-from-scratch meals, serving fresh salads, sandwiches, and wholesome entrées prepared with simple ingredients.",
    website: "modernmarket.com", logoUrl: logo("modernmarket.com"),
    outlets: [
      o("", "Next to Gate B25", "airside", ""),
    ],
  }),
  paschals: restaurant({
    name: "Paschal's", cuisine: "Counter Service, Barbecue", amenity: "fast_food",
    description: "A southern tradition! Taste Atlanta's rich history of soul food. Paschal's features the famous 1947 fried chicken, collard greens, yams, fried catfish & peach cobbler. Yummy….!",
    website: "paschalsatlanta.com", logoUrl: logo("paschalsatlanta.com"),
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6am-11pm"),
    ],
  }),
  popeyes: restaurant({
    name: "Popeye's", cuisine: "Coffee, Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "Popeyes Louisiana Kitchen offers a unique \"New Orleans\" style menu that features signature fried chicken, award winning chicken sandwiches, handcrafted chicken tenders, Cajun fish, red beans, and rice, coleslaw and other flavorful sides and desserts.",
    website: "popeyes.com", logoUrl: logo("popeyes.com"),
    outlets: [
      o("", "Next to Gate B13", "airside", "Mon-Sun 6am-11pm"),
    ],
  }),
  proof_of_the_pudding: restaurant({
    name: "Proof of the Pudding", cuisine: "Grab and Go, Salad, Snacks", amenity: "fast_food",
    description: "On-the-go? Grab one of our crafted sandwiches, wraps or salads by the renowned Chef Vagn who is driven by quality ingredients & creativity.",
    website: "proofpudding.com", logoUrl: logo("proofpudding.com"),
    outlets: [
      o("", "Next to Gate B10", "airside", "Mon-Sun 7am-10pm"),
      o("", "Next to Gate B3", "airside", ""),
    ],
  }),
  roast: restaurant({
    name: "Roast", cuisine: "Coffee, Counter Service, Breakfast, Bakery", amenity: "cafe",
    description: "Come enjoy your favorite latte! Create new experiences to savor with our wide selection of coffee and pastries! Peet's coffee is responsibly sourced and roasted to perfection!",
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  samuel_adams_bar: restaurant({
    name: "Samuel Adams Bar", cuisine: "Bar, Salad, Burgers, Live Games", amenity: "bar",
    description: "Independent. American. Craft. Located at the heart of Concourse B, Sam Adams Brewhouse is the place to wind down after a long-haul flight!",
    website: "samueladams.com", logoUrl: logo("samueladams.com"),
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "cafe",
    description: "More than just great coffee, explore our ever-changing menu for your favorite seasonal beverages. For those looking to satisfy their hunger, come grab a delicious pastry, breakfast or hearty sandwich, and our Grab & Go coolers have snacks and cold beverages for those travelers on the go!",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Near Gate B14", "airside", "Mon-Sun 5am-11pm"),
      o("", "Next to Gate B28", "airside", "Mon-Sun 5am-11pm"),
    ],
  }),
  sweetwater_bar_grill: restaurant({
    name: "SweetWater Bar & Grill", cuisine: "Bar, Salad, Pizza, Burgers, Live Games", amenity: "restaurant",
    description: "At Sweetwater you're not here for a long time, you're here for a good time, and drink em' if you got 'em! Remember, don't float on the mainstream.",
    website: "sweetwaterbrew.com", logoUrl: logo("sweetwaterbrew.com"),
    outlets: [
      o("", "Next to Gate B31", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "Bar, Salad, Dessert, American Food, Burgers", amenity: "restaurant",
    description: "Providing casual dining options from a World-Famous international brand. Specializing in great tasting food; Burgers, Wings, Ribs and Signature Salads, as well as Craft-inspired alcohol beverages.",
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"),
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6am-10pm"),
      o("", "Next to Gate B8", "airside", "M-Su 7am-10pm"),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "Salad, Counter Service, Burgers", amenity: "fast_food",
    description: "Wendy's specializes in \"old-fashioned\" hamburgers (with a highly distinctive square shape \"because we don't cut corners\") and fries",
    website: "wendys.com", logoUrl: logo("wendys.com"),
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6:30am-10pm/ last flight"),
    ],
  }),
  willys_mexican_grill: restaurant({
    name: "Willy's Mexican Grill", cuisine: "Mexican Food, Counter Service", amenity: "fast_food",
    description: "Made-to-order burritos, tacos and quesadillas",
    website: "willys.com", logoUrl: logo("willys.com"),
    outlets: [
      o("", "Concourse B Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
};

// ─── Concourse C ───

const concourseCVenues = {
  atlanta_bread_company: restaurant({
    name: "Atlanta Bread Company", cuisine: "Deli, Grab and Go, Salad, Vegetarian/Vegan, Counter Service, American Food, Bakery", amenity: "cafe",
    description: "Enjoy exceptional sandwiches, salads, and pastries on the go from the Atlanta Bread Company, an Atlanta favorite! Our breads, cookies and pastries are baked fresh daily! We also carry a variety of refreshing beverages and snacks.",
    website: "atlantabread.com", logoUrl: logo("atlantabread.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate C33", "airside", "Mon-Sun 4:30am-10pm"),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "You can have the perfect anytime snack at Auntie Anne’s! Known for hand-baked pretzels to be enjoyed with a refreshing lemonade among other favorites. The menu includes pepperoni pretzels, pretzel nuggets, dogs and dips with a variety of beverages.",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("", "Next to Gate C17", "airside", "Mon-Sun 5am-10pm (or last flight)"),
    ],
  }),
  baja_fresh: restaurant({
    name: "Baja Fresh", cuisine: "Coffee, Mexican Food, Salad, Vegetarian/Vegan, Counter Service, Breakfast", amenity: "fast_food",
    description: "Baja Fresh is a fresh Mexican Grill which offers an alternative to fast food. The menu includes never frozen, all natural, hormone free, fire-grilled chicken, steak and slow roasted pork Mexican dishes with handmade guacamole and salsa. Other menu items include salads, burritos, black beans, nachos and more. We also offer a full traditional and Mexican breakfast menu.",
    website: "bajafresh.com", logoUrl: logo("bajafresh.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate C44", "airside", "Mon-Sun 6:30am-10pm"),
    ],
  }),
  bantam_biddy: restaurant({
    name: "Bantam & Biddy", cuisine: "Salad, Counter Service", amenity: "fast_food",
    description: "We offer the best southern cuisine in town. Try some of our generous tenders, rotisserie chicken or meat loaf along with come collards, mac & cheese, rice and gravy, cobbler and biscuits made right at the store. We have several choices of gluten free selections.",
    outlets: [
      o("", "Northeast of Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Breakfast, American Food, Burgers", amenity: "fast_food",
    description: "Be sure to stop by and get America's favorite flamed broiled burger to go.",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("", "Next to Gate C21", "airside", "Mon-Sun 9am-10pm"),
    ],
  }),
  carrabbas_italian_grill: restaurant({
    name: "Carrabba’s Italian Grill", cuisine: "Bar, Salad, Seafood, Dessert, Italian Food, Live Games", amenity: "restaurant",
    description: "Italian- American cuisine offering classic dishes like pasta, chicken and steak favorites and hearty salads, just like how grandma makes it. Pair any menu item with a glass of wine from our robust wine menu or a cold beer from the bar.",
    website: "carrabbas.com", logoUrl: logo("carrabbas.com"),
    outlets: [
      o("", "Concourse C Center", "airside", "Mon-Sun 9am-10:30pm"),
    ],
  }),
  charleys_philly_steaks: restaurant({
    name: "Charley's Philly Steaks", cuisine: "Counter Service, American Food", amenity: "fast_food",
    description: "International Quick Service Brand with World Famous Philly-style Cheesesteaks and mouthwatering wraps with our signature real fruit flavored lemonades.",
    website: "charleys.com", logoUrl: logo("charleys.com"),
    outlets: [
      o("", "Next to Gate C12", "airside", "Sun-Fri 7am-10pm, Sat 7am-8pm"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-Fil-A", cuisine: "Coffee, Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "Home of the Original Chicken Sandwich, enjoy your favorite chicken sandwich crispy or grilled with a mouth-watering lemonade. Don’t forget about breakfast with our signature Chick-fil-A Chicken Biscuit or our Chick-n-Minis.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    outlets: [
      o("", "Next to Gate C21", "airside", "Mon-Sat 5:30am - 10pm (Closed Sun)"),
    ],
  }),
  duffs_deli_market: restaurant({
    name: "Duff's Deli & Market", cuisine: "Bagel, Breakfast, Coffee, Deli, Sandwich", amenity: "restaurant",
    description: "Duff’s Deli serves classic deli favorites, including made-to-order sandwiches, breakfast items, and fresh coffee for a quick and satisfying meal.",
    outlets: [
      o("", "Near Gate C7", "airside", ""),
    ],
  }),
  el_taco: restaurant({
    name: "El Taco", cuisine: "Mexican Food, Salad, Counter Service", amenity: "fast_food",
    description: "Tex-Mex and Oaxacan specialties guarantee you will not be disappointed with the vast array of tacos, burritos, quesadillas and sizzling sides from El Taco. Scratch-made guacamole and salsa will keep you coming back for more as you fly through ATL every time.",
    vegan: true,
    outlets: [
      o("", "Next to Gate C14", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  famous_famiglia: restaurant({
    name: "Famous Famiglia", cuisine: "Coffee, Grab and Go, Salad, Vegetarian/Vegan, Counter Service, Dessert, Breakfast, Pizza, Italian Food", amenity: "fast_food",
    description: "Famous Famiglia offers an array of freshly made authentic New York style pizzas, stromboli and house made garlic knots. The breakfast menu features an assortment of breakfast sandwiches, bagels, pastries, and traditional breakfast platters including eggs, bacon, chicken or turkey sausage and potatoes.",
    website: "famousfamiglia.com", logoUrl: logo("famousfamiglia.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Next to Gate C12", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  five_guys: restaurant({
    name: "Five Guys", cuisine: "Counter Service, Burgers", amenity: "fast_food",
    description: "Here at Five Guys we are all about using 100% ground beef, hand formed patties on our own buns, baked daily, with your choice of unlimited fresh produce to make the best burgers around. Pair them with our boardwalk style fries, hand cut all day long from fresh potatoes.",
    website: "fiveguys.com", logoUrl: logo("fiveguys.com"),
    outlets: [
      o("", "Near Gate C41", "airside", "Mon-Sun 5am-10pm"),
    ],
  }),
  fresh_healthy_cafe: restaurant({
    name: "Fresh Healthy Cafe", cuisine: "Salad, Vegetarian/Vegan, Counter Service, American Food", amenity: "cafe",
    description: "Fresh features 100% pure juices, smoothies, and a selection of paninis and salads.",
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Near Gate C43", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  great_wraps: restaurant({
    name: "Great Wraps", cuisine: "Salad, Vegetarian/Vegan, Counter Service", amenity: "fast_food",
    description: "If you’re on the go, stop by and grab a Gyro, Chicken, Steak or Breakfast Wrap. We also have Philly’s, Bowls, and some great pancakes. We know you care about the food you eat and so do we! We want to feed your body, mind and spirit with fresh food teeming with flavor.",
    website: "greatwraps.com", logoUrl: logo("greatwraps.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Concourse C Center", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  jersey_mikes_subs: restaurant({
    name: "Jersey Mike's Subs", cuisine: "Counter Service, American Food", amenity: "fast_food",
    description: "Jersey Mike's Subs: Delicious and quick hot and cold sub sandwiches with premium ingredients to enjoy for lunch or dinner.",
    website: "jerseymikes.com", logoUrl: logo("jerseymikes.com"),
    outlets: [
      o("", "Near Gate C14", "airside", "Mon-Sun 8am-9pm"),
    ],
  }),
  krispy_kreme: restaurant({
    name: "Krispy Kreme", cuisine: "Coffee, Counter Service, Breakfast", amenity: "cafe",
    description: "Your day just got a little sweeter. Drop by for our fresh donuts along with a cup of coffee. Take some with you on your flight to treat your friends and family.",
    website: "krispykreme.com", logoUrl: logo("krispykreme.com"),
    outlets: [
      o("", "Concourse C Center", "airside", "Mon-Sun 5am - 9pm/Last Flight"),
    ],
  }),
  la_madeleine: restaurant({
    name: "La Madeleine", cuisine: "Grab and Go, Bakery", amenity: "cafe",
    description: "French hand-crafted bakery kiosk offering Grab & Go sandwiches and salads made daily. Pair each menu offering with soft-beverages and pastries for the perfect compliment.",
    website: "lamadeleine.com", logoUrl: logo("lamadeleine.com"),
    outlets: [
      o("", "Next to Gate C40", "airside", "24 hrs", true),
      o("", "Near Gate C10", "airside", ""),
    ],
  }),
  leeann_chin: restaurant({
    name: "Leeann Chin", cuisine: "Asian Food, Counter Service", amenity: "fast_food",
    description: "We passionately prepare Pan-Asian dishes for your delight. Choose from several authentic dishes. Try our Grilled Bourbon Chicken, Mongolian Chicken, or the Beef & Broccoli. Each is paired with your choice of rice, noodles, or tofu. This is a can’t miss.",
    website: "leeannchin.com", logoUrl: logo("leeannchin.com"),
    outlets: [
      o("", "Concourse C Center", "airside", "Mon-Sun 9am-10pm"),
    ],
  }),
  links_grill: restaurant({
    name: "Links Grill", cuisine: "Counter Service, Breakfast, Burgers", amenity: "fast_food",
    description: "Link's Grill dishes up hot dogs and bratwurst.",
    outlets: [
      o("", "Next to Gate C30", "airside", "Mon-Sun 8am-9pm"),
    ],
  }),
  longhorn_steakhouse: restaurant({
    name: "Longhorn Steakhouse", cuisine: "Bar, Salad, Seafood, American Food, Burgers, Live Games", amenity: "restaurant",
    description: "American Steakhouse serving the highest quality beef, burgers, chicken and more. A robust bar program ensures you’ll have the coldest craft beer or signature cocktail to keep your thirst quenched.",
    website: "longhornsteakhouse.com", logoUrl: logo("longhornsteakhouse.com"),
    outlets: [
      o("", "Next to Gate C13", "airside", "Mon-Sun 5:30am - 10pm"),
    ],
  }),
  salad_works: restaurant({
    name: "Salad Works", cuisine: "Salad, Counter Service", amenity: "fast_food",
    description: "We are FRESH, HEALTHY and GOOD! With over 60 ingredients and endless combinations we will make a salad as original as you. We want to take you on a flavor adventure with our globally inspired menu. Come join us.",
    website: "saladworks.com", logoUrl: logo("saladworks.com"),
    outlets: [
      o("", "Concourse C Center", "airside", "Mon-Sun 10am-10pm"),
    ],
  }),
  sbarros: restaurant({
    name: "Sbarro's", cuisine: "Salad, Counter Service, Pizza, Italian Food", amenity: "fast_food",
    description: "Authentic NY Style Pizza made with San Marzano-style sauce and 100% Whole Milk Mozzarella. All our Pizzas and Stromboli’s are Hand-stretched and come with a variety of your favorite toppings.",
    website: "sbarro.com", logoUrl: logo("sbarro.com"),
    outlets: [
      o("", "Next to Gate C42", "airside", ""),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "cafe",
    description: "More than just great coffee, explore our ever-changing menu for your favorite seasonal beverages. For those looking to satisfy their hunger, come grab a delicious pastry, breakfast or hearty sandwich, and our Grab & Go coolers have snacks and cold beverages for those travelers on the go!",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Next to Gate C16", "airside", "Mon-Sun 5am-10pm (or last flight)"),
      o("", "Next to Gate C37", "airside", "4:30am -10pm or last flight"),
    ],
  }),
  sweet_georgias_juke_joint: restaurant({
    name: "Sweet Georgia's Juke Joint", cuisine: "Bar, Salad, Barbecue, American Food", amenity: "bar",
    description: "Sweet Georgia’s Juke Joint is where the juke joints, honky tonks and cantinas of the past meet the present day. With our southern fried chicken and other southern delights, you can enjoy sipping on our moonshine-based cocktails while enjoying some great music. If you like fun food, drink, and people, you will have a blast at the JUKE JOINT.",
    outlets: [
      o("", "Next to Gate C42", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  the_pecan_bar: restaurant({
    name: "The Pecan Bar", cuisine: "Bar, Salad, Seafood, Breakfast, American Food", amenity: "bar",
    description: "For a sophisticated take on Southern fare, stop by The Pecan Bistro for breakfast, lunch, or dinner. Indulge in Belgian Waffles or Blackened Shrimp & Grits, among others for breakfast, while savoring in our signature fried chicken for lunch or dinner.",
    outlets: [
      o("", "Next to Gate C4", "airside", "Mon-Fri 9am -10pm"),
    ],
  }),
  truly_atlanta: restaurant({
    name: "Truly Atlanta", cuisine: "Bar, American Food", amenity: "bar",
    description: "The first of its kind, the Truly Bar Atlanta offers a state-of-the-art ordering system. The guest will have the opportunity to order food from the surrounding restaurants and have it brought to the bar.",
    outlets: [
      o("", "Concourse C Center", "airside", "Mon-Sat 10am-10pm Sun 11am-10pm"),
    ],
  }),
  umaizushi: restaurant({
    name: "Umaizushi", cuisine: "Bar, Salad, Live Games", amenity: "restaurant",
    description: "For some hand rolled fresh sushi and sake, make your way to Umaizushi. In addition to our signature specialty rolls, our menu also includes rice and noddle bowls with hearty proteins.",
    outlets: [
      o("", "Concourse C Center", "airside", "Mon-Sun 8am-10pm"),
    ],
  }),
};

// ─── Concourse D ───

const concourseDVenues = {
  '40_40_bar': restaurant({
    name: "40/40 Bar", cuisine: "Bar, Salad, Pizza, American Food", amenity: "bar",
    description: "The 40/40 Club is your pick if you crave the edge of NYC. Named after one of baseball’s most prestigious achievements. By the Glass and By the Bottle!",
    website: "4040club.com", logoUrl: logo("4040club.com"),
    outlets: [
      o("", "Concourse D Center", "airside", "Mon-Sun 9am-10pm/ last flight"),
    ],
  }),
  asian_chao: restaurant({
    name: "Asian Chao", cuisine: "Asian Food, Counter Service, Chinese Food", amenity: "fast_food",
    description: "Familiar Chinese dishes & sushi rolls from a no-frills takeout-counter chain.",
    website: "asianchao.com", logoUrl: logo("asianchao.com"),
    outlets: [
      o("", "Next to Gate D7", "airside", "Mon-Sun 8am-10pm"),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "You can have the perfect anytime snack at Auntie Anne’s! Known for hand-baked pretzels to be enjoyed with a refreshing lemonade among other favorites. The menu includes pepperoni pretzels, pretzel nuggets, dogs and dips with a variety of beverages.",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("", "Next to Gate D23", "airside", "Mon-Fri 7:30am-8:30pm"),
    ],
  }),
  bang_house_pizza: restaurant({
    name: "Bang House Pizza", cuisine: "Pizza, Italian Food", amenity: "restaurant",
    description: "Pizza offering NYC-style neighborhood pies in a counter serve setting.",
    website: "banghousepizza.com", logoUrl: logo("banghousepizza.com"),
    outlets: [
      o("", "Concourse D Center", "airside", "Mon-Sun 9am-11pm"),
    ],
  }),
  buffalo_wild_wings: restaurant({
    name: "Buffalo Wild Wings", cuisine: "Bar, Salad, American Food, Live Games", amenity: "restaurant",
    description: "An American casual dining restaurant and sports bar which specializes in Buffalo wings, sauces and much more.",
    website: "buffalowildwings.com", logoUrl: logo("buffalowildwings.com"),
    outlets: [
      o("Mezzanine", "Concourse D Level 2", "airside", "Mon-Sun 9am-10pm"),
    ],
  }),
  century_bar_bites: restaurant({
    name: "Century Bar & Bites", cuisine: "Bar", amenity: "bar",
    outlets: [
      o("", "Next to Gate D36", "airside", ""),
    ],
  }),
  chicken_beer: restaurant({
    name: "Chicken + Beer", cuisine: "Bar, Seafood, American Food", amenity: "restaurant",
    description: "Inspired by Chris “Ludacris” Bridges. This Chef driven restaurant serves Southern-style comfort food and locally sourced beers parallel an ambient cool vibe from the playlist to the bold wall art. Boasting reimaged classics like Luda’s Chicken & Pecan Waffles with Whiskey Maple Syrup and Blackened Catfish with Corn Edamame Succotash & Parsnip Puree.",
    website: "chickenandbeeratl.com", logoUrl: logo("chickenandbeeratl.com"),
    outlets: [
      o("", "Next to Gate D5", "airside", "Mon-Sun 5:30am-10pm"),
    ],
  }),
  einstein_brothers_bagels: restaurant({
    name: "Einstein Brothers Bagels", cuisine: "Counter Service, Breakfast, Bakery", amenity: "cafe",
    description: "You are craving a fresh baked bagel with a schmear of your favorite cream cheese! We feature Hot and Cold coffee beverages plus protein packed breakfast and lunch sandwiches.",
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"),
    outlets: [
      o("", "Concourse D Center", "airside", "24 hours", true),
    ],
  }),
  fab_yo: restaurant({
    name: "Fab Yo!", cuisine: "Counter Service", amenity: "fast_food",
    description: "Satisfy your craving for frozen yogurt with an array of toppings. This is the easy self-service experience with delicious choices to satisfy all in the group.",
    outlets: [
      o("", "Next to Gate D7", "airside", "Mon-Sun 8am-10pm"),
    ],
  }),
  freshens: restaurant({
    name: "Freshen's", cuisine: "Counter Service, Dessert, Breakfast", amenity: "fast_food",
    description: "Freshëns is a healthy “fresh casual” concept, which offers prepared to order food inspired by fresh ingredients, as well as our signature fresh blended smoothies. From Crepe’s, to Rice Bowls to Smoothies, you’ll find something to satisfy your fresh taste cravings.",
    website: "freshens.com", logoUrl: logo("freshens.com"),
    outlets: [
      o("", "Concourse D Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  grindhouse_burgers: restaurant({
    name: "Grindhouse Burgers", cuisine: "Bar, Salad, Counter Service, American Food, Burgers", amenity: "fast_food",
    description: "The Award-Winning Burger & “Double the Size” Airport Bar from Right Here in the ATL. Yum Yum Burgers, Fries and Shakes – Breakfast Too! New Carryout packaging makes this perfect for your flight!",
    website: "grindhouseburgers.com", logoUrl: logo("grindhouseburgers.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  harvest_grounds: restaurant({
    name: "Harvest & Grounds", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast, Bakery", amenity: "cafe",
    description: "Get a delicious cup of the best regional coffee. We brew it fresh every hour. We feature an assortment of delicious pastries, sandwiches, salads and specialty tea and coffee beverages.",
    outlets: [
      o("", "Next to Gate D9", "airside", "Mon-Sun 5am-10pm/ last flight"),
    ],
  }),
  koho_kolache_house: restaurant({
    name: "KoHo Kolache House", cuisine: "Grab and Go, Counter Service, Dessert, Breakfast, Bakery", amenity: "cafe",
    description: "KoHo Kolache House serves kolaches, sweet and savory Danish-style pastries from the Czech Republic",
    outlets: [
      o("", "Concourse D Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  lemonade: restaurant({
    name: "Lemonade", cuisine: "Grab and Go", amenity: "fast_food",
    description: "Seasonal Food and Drink",
    outlets: [
      o("", "Concourse D Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  mustard_seed_bbq: restaurant({
    name: "Mustard Seed BBQ", cuisine: "Bar, Salad, Barbecue", amenity: "restaurant",
    description: "The 24-hour smoker produces some of the best pulled chicken, beef brisket and seasoned wings in the airport. A full bar with a comfortable seat for relaxing and charging your tech!",
    outlets: [
      o("", "Next to Gate D25", "airside", "Mon-Sun 6am-11pm"),
    ],
  }),
  phillips_seafood: restaurant({
    name: "Phillip's Seafood", cuisine: "Bar, Coffee, Salad, Seafood, Counter Service, Dessert, Breakfast, American Food, Burgers", amenity: "fast_food",
    description: "Phillips Seafood is an award-winning Brand that showcases Phillips’ famous crab cakes, gourmet seafood soups, salads, and appetizers along with signature entrées such as the crab & butterfly shrimp platter and grilled or blackened mahi mahi and salmon, and 100% angus beef burgers. We also have a full-service bar with a host of national and local wines, beers and signature cocktails.",
    website: "phillipsfoods.com", logoUrl: logo("phillipsfoods.com"),
    outlets: [
      o("", "Concourse D Center", "airside", "Mon-Sun 6:30am-10pm"),
    ],
  }),
  popeyes: restaurant({
    name: "Popeye's", cuisine: "Coffee, Counter Service, Breakfast, American Food", amenity: "fast_food",
    description: "Popeyes Louisiana Kitchen offers a unique \"New Orleans\" style menu that features signature fried chicken, award winning chicken sandwiches, handcrafted chicken tenders, Cajun fish, red beans, and rice, coleslaw and other flavorful sides and desserts.",
    website: "popeyes.com", logoUrl: logo("popeyes.com"),
    outlets: [
      o("", "Near Gate D8", "airside", ""),
    ],
  }),
  roast: restaurant({
    name: "Roast", cuisine: "Coffee, Counter Service, Breakfast, Bakery", amenity: "cafe",
    description: "Come enjoy your favorite latte! Create new experiences to savor with our wide selection of coffee and pastries! Peet's coffee is responsibly sourced and roasted to perfection!",
    outlets: [
      o("", "Near Gate D26", "airside", "24 Hours", true),
    ],
  }),
  terrapin_taphouse: restaurant({
    name: "Terrapin Taphouse", cuisine: "Bar, Salad, Breakfast, Barbecue", amenity: "bar",
    description: "“Look Up” to see this Athens Georgia brew pub! The Tap features fabulously successful Terrapin varieties and many other brands of your favorite beer. Family friendly in a comfortable setting.",
    website: "terrapinbeer.com", logoUrl: logo("terrapinbeer.com"),
    outlets: [
      o("Mezzanine", "Concourse D Level 2", "airside", "Mon-Sun 7am -10pm"),
    ],
  }),
  the_market_by_food_wine: restaurant({
    name: "The Market by Food & Wine", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "fast_food",
    description: "This is your Market for Chef created Salads, Sandwiches and an abundance of snacks and beverages. The Wine Shop also features top selling brands of beer while you sit and relax in our dining area.",
    outlets: [
      o("", "Concourse D Center", "airside", "Mon-Sun 5am-10pm /last flight"),
    ],
  }),
  wolfgang_puck_express: restaurant({
    name: "Wolfgang Puck Express", cuisine: "Salad, Counter Service", amenity: "fast_food",
    description: "Critically acclaimed Chef Wolfgang Puck selects the best ingredients and creates the best in carry out dining in the ATL. The menu is spared the dull and depressive you find elsewhere!",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("", "Near Gate D7", "airside", ""),
    ],
  }),
  zaacai_cafe: restaurant({
    name: "Za'Acai Cafe", cuisine: "Dine", amenity: "cafe",
    outlets: [
      o("", "Next to Gate D29", "airside", ""),
    ],
  }),
};

// ─── Concourse E ───

const concourseEVenues = {
  arbys: restaurant({
    name: "Arby's", cuisine: "Counter Service, American Food", amenity: "fast_food",
    description: "Arby's is the place for people hungering for a unique, better tasting alternative to traditional fast food. Serving slow-roasted and freshly sliced roast beef sandwiches and famous Market Fresh sandwiches, wraps and salads, made with wholesome ingredients.",
    website: "arbys.com", logoUrl: logo("arbys.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  boars_head_kiosk: restaurant({
    name: "Boar's Head Kiosk", cuisine: "Grab and Go, Salad, Snacks", amenity: "fast_food",
    description: "Boar’s Head has been the delicatessen brand you can trust for over 115 years. We are committed to providing the highest quality delicatessen products. Our products are made of only the finest ingredients: whole muscle beef, pork and poultry, and spices sourced from around the globe.",
    website: "boarshead.com", logoUrl: logo("boarshead.com"),
    outlets: [
      o("", "Next to Gate E26", "airside", "Mon-Sun 8am - 10pm (or last flight)"),
    ],
  }),
  caribou_coffee: restaurant({
    name: "Caribou Coffee", cuisine: "Coffee, Counter Service, Dessert, Breakfast, Bakery", amenity: "cafe",
    description: "A great place for iced or hot coffee, specialty drinks: hot, iced or blended, smoothies and pastries. Grab & Go sandwiches and snacks for you to enjoy.",
    website: "cariboucoffee.com", logoUrl: logo("cariboucoffee.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 6am-11:30pm"),
    ],
  }),
  freshens: restaurant({
    name: "Freshen's", cuisine: "Counter Service, Dessert, Breakfast", amenity: "fast_food",
    description: "Freshëns is a healthy “fresh casual” concept, which offers prepared to order food inspired by fresh ingredients, as well as our signature fresh blended smoothies. From Crepe’s, to Rice Bowls to Smoothies, you’ll find something to satisfy your fresh taste cravings.",
    website: "freshens.com", logoUrl: logo("freshens.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  johnnys_chicken_waffles: restaurant({
    name: "Johnny's Chicken & Waffles", cuisine: "Live Games", amenity: "restaurant",
    description: "As the name suggests, the restaurant’s signature menu item is the most popular brunch food in Georgia: chicken & waffles. The hybrid dish that combines breakfast and lunch is made with crispy and juicy fried chicken paired with fluffy and golden waffles. Johnny’s Chicken & Waffles' guests will have the option to customize the famed Southern staple with mix-and-match proteins, plain or bacon-flavored waffles, sauces and add-on sides. Guests can also sip on signature drinks designed to share and served in carafes. Individual beverages are served in mason jars.",
    outlets: [
      o("", "Near Gate E40", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "Coffee, Salad, Counter Service, Breakfast, Burgers", amenity: "fast_food",
    description: "A quick service restaurant serving breakfast, lunch and dinner. Our menu includes: fries, the Big Mac, chicken sandwiches, chicken nuggets, hamburgers, and shakes.",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "24 Hours", true),
    ],
  }),
  nathans_famous: restaurant({
    name: "Nathan's Famous", cuisine: "Coffee, Counter Service, American Food", amenity: "fast_food",
    description: "Nathan's is well known for their hot dogs.",
    website: "nathansfamous.com", logoUrl: logo("nathansfamous.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 10am - 8pm"),
    ],
  }),
  natures_table: restaurant({
    name: "Nature's Table", cuisine: "Salad, Vegetarian/Vegan, Counter Service", amenity: "fast_food",
    description: "A wide variety of Hot Entrees, Hearty Soups, Freshly Prepared Salads, Gourmet Sandwiches & Wraps. Specialties include Freshly Squeezed Orange Juice, Pancakes with Fresh Cut Strawberries, Hummus with Fresh Baked Pita Chips, Tomato Basil Soup and Strawberry Cheesecake.",
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Concourse E Center", "airside", "M-Su 6am-10pm"),
    ],
  }),
  old_fourth_distillery: restaurant({
    name: "Old Fourth Distillery", cuisine: "Live Games", amenity: "bar",
    website: "o4d.com", logoUrl: logo("o4d.com"),
    outlets: [
      o("", "Next to Gate E28", "airside", ""),
    ],
  }),
  one_flew_south: restaurant({
    name: "One Flew South", cuisine: "Bar, Salad, American Food, Burgers, Live Games", amenity: "restaurant",
    description: "One Flew South is the first upscale dining experience in Hartsfield-Jackson Atlanta International Airport. Diners can enjoy global inspired southern fare featuring premium ingredients from regional farmers and purveyors. One Flew South serves proper cocktails and features an exceptional sushi menu and take-away items. The restaurant presents an enticing culinary destination for travelers braving the world’s busiest airport. The only airport restaurant given the distinction of nomination for the coveted James Beard Award.",
    website: "oneflewsouthatl.com", logoUrl: logo("oneflewsouthatl.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Fri 7am-10pm; Sat 11am-9pm; Sun 11am-10pm"),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "Counter Service, Chinese Food", amenity: "fast_food",
    description: "From traditional Chinese favorites to fresh new taste creations, the chefs at Panda Express have worked up a delicious menu with something for everyone to enjoy.",
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 8am-10pm"),
    ],
  }),
  qdoba: restaurant({
    name: "Qdoba", cuisine: "Mexican Food, Counter Service", amenity: "fast_food",
    description: "Qdoba Mexican Grill combines fresh ingredients with an innovative combination of sauces, salsas and marinades to create non-traditional, fast-casual Mexican fare.",
    website: "qdoba.com", logoUrl: logo("qdoba.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  sojourners_cafe: restaurant({
    name: "Sojourner's Cafe", cuisine: "Bar, Salad, Live Games", amenity: "cafe",
    description: "An intimate Cafe with delicious home-style Caribbean cuisine. Featuring finger foods for preflight enjoyment. Smoking is permitted in this restaurant.",
    outlets: [
      o("", "Next to Gate E 8", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "cafe",
    description: "More than just great coffee, explore our ever-changing menu for your favorite seasonal beverages. For those looking to satisfy their hunger, come grab a delicious pastry, breakfast or hearty sandwich, and our Grab & Go coolers have snacks and cold beverages for those travelers on the go!",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "5:30am - 10pm"),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Salad, Counter Service", amenity: "fast_food",
    description: "Seeking quick, nutritious meal options that the whole family can enjoy? Subway serves fresh, delicious, sandwiches made-to-order right in front of you.",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("", "West of Center", "airside", "Mon-Sun 7am-9pm"),
    ],
  }),
  tgi_fridays: restaurant({
    name: "TGI Fridays", cuisine: "Bar, Salad, Dessert, American Food, Burgers", amenity: "restaurant",
    description: "Providing casual dining options from a World-Famous international brand. Specializing in great tasting food; Burgers, Wings, Ribs and Signature Salads, as well as Craft-inspired alcohol beverages.",
    website: "tgifridays.com", logoUrl: logo("tgifridays.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 6:30am-10pm"),
    ],
  }),
  the_piano_bar: restaurant({
    name: "The Piano Bar", cuisine: "Bar, Salad, Pizza, Live Games", amenity: "bar",
    description: "The Piano Bar features bar bites and sandwich plates.",
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 7am-10pm"),
    ],
  }),
  villa_pizza: restaurant({
    name: "Villa Pizza", cuisine: "Salad, Counter Service, Pizza, Italian Food", amenity: "fast_food",
    description: "Old World Pizza, Pasta, Salad, & Stromboli's!",
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"),
    outlets: [
      o("", "Concourse E Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
};

// ─── Concourse F ───

const concourseFVenues = {
  atlanta_bread_company: restaurant({
    name: "Atlanta Bread Company", cuisine: "Deli, Grab and Go, Salad, Vegetarian/Vegan, Counter Service, American Food, Bakery", amenity: "cafe",
    description: "Enjoy exceptional sandwiches, salads, and pastries on the go from the Atlanta Bread Company, an Atlanta favorite! Our breads, cookies and pastries are baked fresh daily! We also carry a variety of refreshing beverages and snacks.",
    website: "atlantabread.com", logoUrl: logo("atlantabread.com"),
    vegetarian: true, vegan: true,
    outlets: [
      o("", "Concourse F Center", "airside", "Mon-Sun 6:00am-10pm"),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Breakfast, American Food, Burgers", amenity: "fast_food",
    description: "Be sure to stop by and get America's favorite flamed broiled burger to go.",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("Level 2", "East of Center", "airside", "Mon-Sun 9am-9:30pm"),
    ],
  }),
  citizens_culinary_market: restaurant({
    name: "Citizens Culinary Market", cuisine: "Dine", amenity: "restaurant",
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  ecco: restaurant({
    name: "Ecco", cuisine: "Bar, Salad, Seafood, Live Games", amenity: "restaurant",
    description: "Seasonally inspired Continental fare with a bustling wine and bar program right in the heart of Concourse F. Come enjoy cured meats and cheeses to be paired with your favorite wine. The tasting menu includes Pommes Frites or Garlic Shrimp, while the entrée selections offer hearty pastas, paninis and much more.",
    website: "ecco-atlanta.com", logoUrl: logo("ecco-atlanta.com"),
    outlets: [
      o("Level 2", "South of Center", "airside", "Mon-Sun 11am-10:30pm"),
    ],
  }),
  el_taco: restaurant({
    name: "El Taco", cuisine: "Mexican Food, Salad, Counter Service", amenity: "fast_food",
    description: "Tex-Mex and Oaxacan specialties guarantee you will not be disappointed with the vast array of tacos, burritos, quesadillas and sizzling sides from El Taco. Scratch-made guacamole and salsa will keep you coming back for more as you fly through ATL every time.",
    vegan: true,
    outlets: [
      o("Level 2", "East of Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
  lorena_garcia: restaurant({
    name: "Lorena Garcia", cuisine: "Bar, Salad, Live Games", amenity: "bar",
    description: "If you are looking for a bar to sit back and relax, come visit Lorena Garcia’s Latin-infused bar program in Concourse F. The beverage menu includes signature cocktails like the mouthwatering Mojito, the Cuba Libre and a vast array of local craft beers from the Atlanta area.",
    outlets: [
      o("Level 2", "Center", "airside", "Mon-Sat 9am-10pm (Sun 11am-10pm)"),
    ],
  }),
  maison_mathis: restaurant({
    name: "Maison Mathis", cuisine: "Bar, Salad, Live Games", amenity: "restaurant",
    description: "Maison Mathis serves up Belgian beers and cuisine.",
    website: "maisonmathis.com", logoUrl: logo("maisonmathis.com"),
    outlets: [
      o("", "Next to Gate F3", "airside", "Mon-Sun 10am-10pm"),
    ],
  }),
  pei_wei: restaurant({
    name: "Pei Wei", cuisine: "Asian Food, Counter Service", amenity: "fast_food",
    description: "Pan-Asian food with a flair! Handcrafted entrees include your favorite Asian chicken and steak over a bed of rice or noodles, to name a few. For added convenience, we offer hand rolled sushi in our Grab & Go take-out area. All items are prepared fresh and in-house when you order.",
    website: "peiwei.com", logoUrl: logo("peiwei.com"),
    outlets: [
      o("Level 2", "East of Center", "airside", "Mon-Sun 8am-11pm"),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "cafe",
    description: "More than just great coffee, explore our ever-changing menu for your favorite seasonal beverages. For those looking to satisfy their hunger, come grab a delicious pastry, breakfast or hearty sandwich, and our Grab & Go coolers have snacks and cold beverages for those travelers on the go!",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Level 2", "South of Center", "airside", "Mon-Sun 4:45am-10pm"),
    ],
  }),
  the_pecan_bistro: restaurant({
    name: "The Pecan Bistro", cuisine: "Counter Service, Breakfast, Barbecue", amenity: "fast_food",
    description: "For a sophisticated take on Southern fare, stop by The Pecan Bistro for breakfast, lunch or dinner. Indulge in gourmet flatbreads, sandwiches, our signature southern chicken wings and fresh salads. Pair any menu item with our famous Bloody Mary, Mimosa or craft beers.",
    outlets: [
      o("Level 2", "East of Center", "airside", "Mon-Sun 6am-10pm"),
    ],
  }),
};

// ─── International Terminal ───

const internationalTerminalVenues = {
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Coffee, Grab and Go, Counter Service, Breakfast", amenity: "cafe",
    description: "More than just great coffee, explore our ever-changing menu for your favorite seasonal beverages. For those looking to satisfy their hunger, come grab a delicious pastry, breakfast or hearty sandwich, and our Grab & Go coolers have snacks and cold beverages for those travelers on the go!",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Int'l Arrivals", "Int'l Arrivals", "landside", "Mon-Sun 5:30am-9pm"),
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
  const r2 = await processTerminal(AIRPORT, CONCOURSE_T, 'Concourse T', concourseTVenues);
  const r3 = await processTerminal(AIRPORT, CONCOURSE_A, 'Concourse A', concourseAVenues);
  const r4 = await processTerminal(AIRPORT, CONCOURSE_B, 'Concourse B', concourseBVenues);
  const r5 = await processTerminal(AIRPORT, CONCOURSE_C, 'Concourse C', concourseCVenues);
  const r6 = await processTerminal(AIRPORT, CONCOURSE_D, 'Concourse D', concourseDVenues);
  const r7 = await processTerminal(AIRPORT, CONCOURSE_E, 'Concourse E', concourseEVenues);
  const r8 = await processTerminal(AIRPORT, CONCOURSE_F, 'Concourse F', concourseFVenues);
  const r9 = await processTerminal(AIRPORT, INTERNATIONAL_TERMINAL, 'International Terminal', internationalTerminalVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([DOMESTIC_TERMINAL, CONCOURSE_T, CONCOURSE_A, CONCOURSE_B, CONCOURSE_C, CONCOURSE_D, CONCOURSE_E, CONCOURSE_F, INTERNATIONAL_TERMINAL]));

  const totalCreated = r1.created + r2.created + r3.created + r4.created + r5.created + r6.created + r7.created + r8.created + r9.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r4.deleted + r5.deleted + r6.deleted + r7.deleted + r8.deleted + r9.deleted;
  const totalVenues = Object.keys(domesticTerminalVenues).length
    + Object.keys(concourseTVenues).length
    + Object.keys(concourseAVenues).length
    + Object.keys(concourseBVenues).length
    + Object.keys(concourseCVenues).length
    + Object.keys(concourseDVenues).length
    + Object.keys(concourseEVenues).length
    + Object.keys(concourseFVenues).length
    + Object.keys(internationalTerminalVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
