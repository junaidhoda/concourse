'use strict';
/**
 * Fills in complete data for Denver International Airport (DEN) —
 * restaurants/cafés/bars/vending in Firestore. Researched 2026-08-17 from the
 * airport's own official site, flydenver.com, using Claude in Chrome browser
 * automation per explicit user instruction. No third-party/aggregator source
 * was used for any venue field.
 *
 * SOURCE: DEN's own official interactive map, https://maps.flydenver.com/,
 * linked from flydenver.com's "Dine Shop Relax" section. Its structured
 * backing data — found by reading the map page's own resource timings — is the
 * LocusLabs dataset published under DEN's own map account A1RUZZWCB76TNU:
 *   a.locuslabs.com/accounts/A1RUZZWCB76TNU/den/<version>/v5/pois-3.0-den.json
 *   a.locuslabs.com/accounts/A1RUZZWCB76TNU/den/<version>/v5/venueData-den.json
 * plus the live overlay marketplace.locuslabs.com/venueId/den/dynamic-poi.
 * The POI file holds 1,827 records, 140 of which carry an `eat*` category.
 * DEN's data is unusually complete: 127 of the 140 have a description, 118 an
 * operationHours string and 116 a phone number. venueData supplies DEN's own
 * structure and floor names. flydenver.com's own Dine landing page is only a
 * marketing page and carries no venue listing of its own, so the map data IS
 * the airport's published directory.
 *
 * EXTRACTION + VERIFICATION: the 140 dining records were serialised in-page to
 * a printable-ASCII format (`@@` field delimiter, `##` list delimiter) with
 * every non-ASCII character replaced by a reversible `<U+hex>` escape and every
 * field whitespace-normalised in the browser before checksumming, split into 11
 * chunks under 6,800 chars on line boundaries, written into a
 * `<pre id="dataDump">` and retrieved via get_page_text. Every chunk verified
 * EXACTLY on first pass against values computed in the browser before
 * retrieval — len/lines/checksum: 6284/9/27345947, 6033/9/25964637,
 * 6476/11/27573731, 6672/12/28281660, 6400/10/27330121, 6353/19/27080395,
 * 6064/17/25417935, 6758/16/28660408, 6610/18/27919584, 6747/15/28800761,
 * 1862/4/7940773 — and the rejoined 140-line dataset at len 66269, checksum
 * 282839348, using checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 1 bucket, and this is the interesting decision for DEN.
 * DEN's own map data models the airport as four occupied structures: the
 * "Jeppesen Terminal" and the "A Gates", "B Gates" and "C Gates" concourses.
 * Applying this dataset's test — does it have its OWN check-in area AND its OWN
 * security checkpoint, independently? — only the Jeppesen Terminal passes.
 * Every check-in/ticketing counter at DEN is in Jeppesen (its own map names
 * that floor "Check-In / Ticketing"), and every security checkpoint is in
 * Jeppesen too (Level 6 West, Level 6 East and the A-Bridge checkpoint —
 * DEN's map places all of them on `den-terminal-checkin`, none on any
 * concourse floor). Concourses A, B and C have NO check-in and NO security of
 * their own: they are reached from Jeppesen post-security, by the underground
 * train or, for Concourse A only, the pedestrian bridge, and they form one
 * continuous secure area with each other. Under this dataset's rule that is a
 * single passenger-processing unit, exactly like the satellite buildings that
 * were folded into KLIA's Terminal 1, so the concourses are folded into one
 * `main_terminal` bucket rather than being split out. This follows the
 * existing AMS precedent in this repo, where Schiphol — likewise one terminal
 * with multiple departure halls and concourses — is modelled as a single
 * `main_terminal`. The concourse is NOT lost: every outlet records it in
 * `location_notes` ("A Gates, Gate A38", "C Gates, Center Core", "Jeppesen
 * Terminal, Level 6 West"), so concourse-level detail is preserved per venue.
 * Note that this run's purgeOrphanedTerminals() will therefore delete any
 * per-concourse terminal buckets a previous revision may have created for DEN.
 *
 * SCOPE — 1 POI EXCLUDED. "Food Court" (poiId 4004486, A Gates Center Core)
 * is a generic map label for the A-Gates centre-core cluster: it has no hours,
 * no phone, no keywords and no description, and the venues in that cluster
 * (Fat Sully's NY Pizza, Chick-fil-A, Shake Shack, Qdoba) are each already
 * listed individually at the same landmark. It is a map annotation rather
 * than a venue, so it is out of scope. That leaves 139 of the 140 records.
 *
 * AIRSIDE / LANDSIDE: taken directly from each POI's own `isAfterSecurity`
 * boolean — true → `airside`, false → `landside`. Present on all 140 records;
 * no inference was needed. Note this correctly marks the Jeppesen Terminal
 * venues (the Westin hotel's Grill & Vine, Tivoli Tap House and Ingredients,
 * the Level 6 coffee bars, the Transit Center Dunkin' and the baggage-claim
 * kiosks) as landside, and everything on the concourses as airside.
 *
 * LEVEL: DEN's own floor name from venueData — "Gates", "Mezzanine",
 * "Gates A54-A87", "Gates B80-B95", "Check-In / Ticketing", "Baggage Claim /
 * Ground Transportation", "Arrivals / HTC CEEA" and "Transit Center".
 *
 * LOCATION_NOTES: DEN's own structure name plus the POI's own `nearbyLandmark`
 * verbatim — "A Gates, Gate A38", "B Gates, Center Core, Mezzanine",
 * "Jeppesen Terminal, The Westin, west side", "C Gates, Center Core West" —
 * falling back to the structure name alone where DEN publishes no landmark.
 * Where DEN's live feed flags a unit temporarily closed, that is appended in
 * DEN's own terms rather than the venue being dropped.
 *
 * MULTI-OUTLET HANDLING: because DEN is one bucket, ALL same-brand units
 * across Jeppesen and the three concourses merge into one doc with one
 * `outlets[]` entry each — so e.g. Starbucks Coffee, illy Coffee Machine,
 * Garrett Popcorn, Peet's Coffee, Dazbog Coffee, Chick-fil-A, McDonald's,
 * Shake Shack, Qdoba, Jamba Juice, Aviano Coffee, Kabod Coffee, Novo Coffee,
 * Caribou Coffee, Modern Market, SMASHBURGER, Freshëns and Vending Machines
 * each become a single doc carrying every one of their locations. Brand
 * matching is case- and apostrophe-insensitive, plus four documented rendering
 * aliases for renderings of one brand that differ only cosmetically:
 * "Starbucks" ≡ "Starbucks Coffee"; "Illy Coffee" ≡ "illy Coffee Machine";
 * "Garret Popcorn" (DEN's own typo) ≡ "Garrett's Popcorn" ≡ "Garrett
 * Popcorn"; "Vending Machine" ≡ "Vending Machines". Distinctly NAMED venues
 * sharing a parent brand are kept separate per this dataset's
 * page-truth-over-label precedent: "Elway's" vs "Elway's Taproom & Grill";
 * "Sunset Loop Market" vs "Sunset Loop Bar & Grill"; "Colorado Collective
 * Marketplace" vs "Colorado Collective Grab & Go"; "Einstein Bagel Bros /
 * Mile High Spirits" (a co-branded unit) vs "Einstein Bros Bagels".
 * 139 records → 89 docs.
 *
 * NAME PUBLISHED WITH A STATUS SUFFIX: DEN currently publishes one venue as
 * "Panda Express - Temporarily Closed for Remodeling". That is the name in
 * DEN's own data and it is carried verbatim rather than being cleaned up,
 * since editing it would mean asserting something the source does not say.
 *
 * CUISINE: the verbatim join of each POI's own user-searchable `keywords[]`,
 * in DEN's own order, unfiltered — including DEN's own price bands ("Less than
 * $10", "$10 to $20", "More than $20"), service tags ("Full Bar", "Table
 * Service", "Quick Serve", "Grab & Go", "Wine & Beer", "Family Friendly") and
 * dietary tags, since all of those are part of the taxonomy DEN publishes
 * against its venues. Only structural keywords are dropped: the ones that
 * merely repeat the venue's own name, the internal `category:*` and `gate:*`
 * machine keywords, and the bare category strings. Where outlets were merged,
 * the union of their keyword sets is used, first-seen order preserved. For the
 * few venues DEN publishes with no keywords at all, `cuisine` falls back to
 * the readable form of the POI's own category ("Dining", "Bar", "Coffee",
 * "Vending") rather than being invented.
 *
 * AMENITY: driven by DEN's own POI category first — `eat.vending` →
 * `vending_machine` (29 units, which at DEN includes the illy automated coffee
 * machines and the Garrett Popcorn smart-vending units, both of which DEN
 * itself files as vending), `eat.coffee` → `cafe`, `eat.bar` → `bar`. Per this
 * dataset's standing rule, every `eat.bar` venue was checked against its own
 * name AND description, and TWO were overridden because DEN's tag is
 * contradicted by the venue's own words: "Taco Bell Cantina" ("enjoy your
 * favorite Taco Bell classics, plus beer and boozy freezes") is filed
 * `fast_food`, and "La Casita" (tamales, burritos, "serves breakfast (until 10
 * a.m.), lunch and dinner") is filed `restaurant`. The remaining eat.bar
 * venues stand: Tapas Sky Bar, Coors Silver Bullet Bar, Great Divide Brewing,
 * New Belgium Brewing, Blue Sky Bar, Crú Wine Bar, Aletitude and Williams &
 * Graham. Conversely THREE venues DEN tags as plain `eat` were promoted to
 * `bar` because their own descriptions lead with brewing or drinks rather than
 * food: Breckenridge Brewery ("the original ski town brewery ... as well as a
 * full bar"), Tivoli Tap House ("one of the only working breweries in the
 * United States to brew beer in an airport") and Sunset Loop Bar & Grill ("a
 * unique selection of local and international beverages, crafted cocktails").
 * Two venues are `food_court` on the strength of their own descriptions
 * enumerating multiple resident concepts: Denver Central Market ("an
 * assortment of dining experiences in one place ... River Bear Meats,
 * Lunchboxx, Sushi Rama ... Vero Italian") and Denver Street Eats ("food
 * stalls and trucks serve locally inspired street fare"). Otherwise the order
 * is: a "Table Service" or "restaurant" keyword → `restaurant`; a coffee /
 * café / bakery / bagel / doughnut name → `cafe`; an ice-cream / chocolate /
 * popcorn / candy name or dessert keyword → `fast_food`; a "Quick Serve" /
 * "Grab & Go" / "kiosk" keyword → `fast_food`; otherwise `restaurant`.
 * Resulting mix across the 139 records: 37 restaurant, 33 fast_food, 29
 * vending_machine, 27 cafe, 11 bar, 2 food_court.
 *
 * VEGETARIAN / GLUTEN-FREE / VEGAN / HALAL / KOSHER: set to 'yes' ONLY where
 * DEN's own keyword list says so — "Vegetarian" and "Gluten-free" are the only
 * dietary tags DEN publishes on dining POIs. DEN publishes no vegan, halal or
 * kosher keyword on any dining venue, so those fields are blank on every doc
 * in this file rather than guessed — note in particular that Modern Market's
 * and Freshëns' descriptions do mention vegan options in prose, but prose is
 * not a tag and was not read as one. Where outlets were merged, a flag is set
 * if ANY merged unit carries the keyword.
 *
 * DESCRIPTION: verbatim from each POI's own `description` field (present on
 * 127 of the 140 dining POIs), whitespace-normalised only. Where outlets were
 * merged, the first non-empty description in source order is used.
 *
 * OPENING HOURS / 24-7: `opening_hours` is the POI's own `operationHours`
 * string verbatim, in DEN's own OSM-style notation ("Mo-Su 06:00-22:00",
 * "Mo 05:00-14:00; Th-Fr 05:00-14:00; Su 05:00-14:00; Tu-We 05:00-12:00; Sa
 * 05:00-12:00", "Mo-Tu 04:30-23:00; We-Su 00:00-24:00"). `open_24_7` is set
 * only where that string literally contains "00:00-24:00".
 *
 * PHONE: taken ONLY from the POI's own structured `phone` field, which DEN
 * populates on 116 of 140 records — never regex-scraped from description
 * prose. Where outlets were merged and more than one publishes a number, the
 * first in source order is used at doc level. DEN's own formatting
 * inconsistencies are preserved as published (e.g. "+1 720-297-5671" and
 * "+1 (866)-508-3558" alongside the usual "+1 (303) 342-6959").
 *
 * WEBSITE / LOGO: DEN's POI records carry no website field. One domain IS
 * published by the source itself — Novo Coffee's own DEN description ends
 * "For more information, visit novocoffee.com." — and is used as such.
 * Otherwise, following this dataset's KUL precedent, `website` (and the
 * logo.dev logo derived from it) is set only for globally or nationally
 * recognisable chains and well-known Denver concepts whose primary domain is
 * confidently known, and left blank for every other independent concept
 * rather than guessed.
 *
 * VERIFIED TOTALS: 140 source dining POIs − 1 map label = 139 → 89 restaurant
 * docs / 139 outlets in the single `main_terminal` bucket. Source records by
 * DEN structure: B Gates 45, A Gates 43 (44 before the excluded map label),
 * C Gates 36, Jeppesen Terminal 15.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['den', 'denver', 'denver-international'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_MAIN = 'main_terminal';

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

// ─── Jeppesen Terminal + Concourses A, B and C (one security-and-check-in unit) ───

const mainTerminalVenues = {
  aletitude: restaurant({
    name: "Aletitude", cuisine: "Grab & Go, coffee, snacks, Wine & Beer", amenity: "bar",
    description: "Aletitude focuses on great food, local brews and craft coffee. Aletitude offers a grab-and-go concession area and bar, which is a convenient option for passengers. The bar serves a selection of on-tap and bottled beer and wine and also offers grab-and-go salads and sandwiches made in house. A large selection of snacks can be purchased in addition to bottled drinks.",
    phone: "+1 (303) 668-8324",
    outlets: [
      o("Gates A54-A87", "A Gates, Near Gate A81", "airside", "Mo-Su 05:00-23:00"),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "pretzel, pepperoni, juice, bottled water, soda, food, Grab & Go, Quick Serve, $10 to $20", amenity: "fast_food",
    description: "Located inside Say Si Bon! Auntie Anne's offers snack foods which include freshly prepared pretzels.",
    phone: "+1 (720) 325-2997",
    outlets: [
      o("Gates", "C Gates, Gate C27", "airside", "Mo-Su 08:00-20:00"),
    ],
  }),
  aviano_coffee: restaurant({
    name: "Aviano Coffee", cuisine: "coffee, dine, snacks", amenity: "cafe",
    description: "Aviano Coffee provides a carefully curated selection of frothy cappuccinos, rich lattes, and specialty beverages such as nitro cold brew, tea mocktails, signature matcha infusions, and recipes featuring Askinosie Chocolate.",
    website: "avianocoffee.com", logoUrl: logo("avianocoffee.com"), phone: "+1 (303) 342-6623",
    outlets: [
      o("Gates", "C Gates, Gate C54", "airside", "Mo-Su 05:00-21:00"),
      o("Gates", "B Gates, Gate B12", "airside", "Mo-Su 05:30-21:30"),
    ],
  }),
  aviators_sports_bar_bar_b_que: restaurant({
    name: "Aviator's Sports Bar & Bar-B-Que", cuisine: "restaurant, bar, spinach & artichoke dip, tacos, pork, chicken, fried chicken, chicken wings, buffalo wings, fried pickles, onion rings, fries, french fries, chili cheese fries, deviled eggs, eggs, bbq, ribs, sausage, mac & cheese, kielbasa, brisket, salmon, salads, kale, chili, bacon, sandwiches, coleslaw, hot dog, turkey, burger, cheeseburger, hamburger, soda, juice, coffee, tea, espresso, latte, cappuccino, dessert, cheesecake, ice cream, corn bread, tv, liquor, wine, food, Full Bar, $10 to $20", amenity: "restaurant",
    description: "Featuring a variety of BBQ meats, grilled and/or smoked meats, chicken, brisket, pork, ribs and beef, and chicken wings all complimented with a full-service bar.",
    phone: "+1 (720) 868-5920",
    outlets: [
      o("Mezzanine", "B Gates, Mezzanine", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  bar_dough: restaurant({
    name: "Bar Dough", cuisine: "pizza, italian, dine", amenity: "restaurant",
    description: "Bar Dough features gourmet pizza, traditional Italian cuisine, and a thoughtfully curated wine list.",
    website: "bardoughdenver.com", logoUrl: logo("bardoughdenver.com"), phone: "+1 (303) 342-6623",
    outlets: [
      o("Gates", "C Gates, Gate C54", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  ben_jerrys: restaurant({
    name: "Ben & Jerry's", cuisine: "dessert, ice cream, smoothies, fruit, milkshake, food, Family Friendly, Grab & Go, Quick Serve, Less than $10", amenity: "fast_food",
    description: "Offering a full compliment of items from the world-renowned ice cream maker's eclectic flavors and creations. Ice cream and sundaes, cups and cones, yogurt, sorbet, smoothies, shakes, banana splits and more.",
    phone: "+1 (720) 868-5921",
    outlets: [
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 09:00-21:00"),
    ],
  }),
  big_bowl: restaurant({
    name: "Big Bowl", cuisine: "asian, sushi, fish, seafood, chinese, chicken, orange chicken, sesame chicken, kung pao chicken, tofu, shrimp, beef & broccoli, mongolian beef, beef, fried rice, lo mein, noodles, potstickers, egg rolls, edamame, tuna, crab, avocado, soda, food, Grab & Go, Quick Serve, $10 to $20", amenity: "fast_food",
    description: "Big Bowl believes the best food is made from scratch; as a result, this Asian concept starts with the highest-quality, naturally-raised chicken, beef, sustainable seafood and locally grown produce. Big, bold layers of flavor are infused in each dish. Big Bowl offers traditional dishes such as pad Thai and create-your-own-stir-fry items.",
    website: "bigbowl.com", logoUrl: logo("bigbowl.com"), phone: "+1 (720) 421-1875",
    outlets: [
      o("Gates", "C Gates, Gate C28", "airside", "Mo-Su 08:00-19:30"),
    ],
  }),
  blue_sky_bar: restaurant({
    name: "Blue Sky Bar", cuisine: "beer, wine, food, bar", amenity: "bar",
    description: "Wet your whistle at the Blue Sky Bar, which has great views, massive TVs, and (of course!) your favorite beverages.",
    phone: "+1 (303) 342-7396",
    outlets: [
      o("Gates", "A Gates, Gate A34", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  breckenridge_brewery: restaurant({
    name: "Breckenridge Brewery", cuisine: "bar, beer, wine, food, American, Wine & Beer, $10 to $20", amenity: "bar",
    description: "Breckenridge Brewery is the original ski town brewery 30 years and counting. Breckenridge Brewery features a great selection of local craft beers on tap as well as a full bar.",
    website: "breckbrew.com", logoUrl: logo("breckbrew.com"), phone: "+1 (720) 912-1497",
    outlets: [
      o("Gates A54-A87", "A Gates, Gate A71", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  brothers_bbq: restaurant({
    name: "Brother's BBQ", cuisine: "bbq, ribs, chicken, pulled pork, sandwiches, salads, grilled cheese, corn bread, coleslaw, soda, breakfast, breakfast sandwiches, food, American, Quick Serve, $10 to $20", amenity: "fast_food",
    description: "Calling all carnivores! Brother's BBQ offers all the best-of-breed: ribs, hot links, chicken, pulled-pork...and even BBQ tofu!",
    phone: "+1 (303) 570-5434",
    outlets: [
      o("Gates A54-A87", "A Gates, Gate A71", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  caribou_coffee: restaurant({
    name: "Caribou Coffee", cuisine: "coffee, tea, bakery, muffin, cookie, bottled water, soda, juice, iced coffee, latte, cappuccino, fruit, yogurt, smoothies, hot chocolate, mocha, fruit cup, milk, coffee beans, oatmeal, food, Grab & Go, Quick Serve, Less than $10, restaurant, breakfast", amenity: "cafe",
    description: "Offering a wide variety of traditional and specialty coffee drinks to please nearly any traveler's taste, while at the same time running all of its locations with environmental sustainability as a top priority. In addition, Caribou Coffee DEN offers a diverse selection of snacks and drinks including pastries and baked goods, fair trade organic coffee, fresh fruit, yogurt cups, Nantucket Nectar juices, Snapple and bottled Coca-Cola products.",
    website: "cariboucoffee.com", logoUrl: logo("cariboucoffee.com"), phone: "+1 (720) 868-5924",
    outlets: [
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 05:00-21:00"),
      o("Check-In / Ticketing", "Jeppesen Terminal, Level 6 East", "landside", "Mo-Su 04:30-20:30"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "chicken, chicken tenders, biscuit, breakfast, breakfast sandwiches, eggs, fries, french fries, salads, food, Quick Serve, Less than $10, restaurant, dine", amenity: "fast_food",
    description: "Enjoy breakfast, lunch, and dinner, or a children's menu, that include chicken sandwiches, wraps and salads, side dishes, and soft drinks and other non-alcoholic beverages. AND...a note to our Chick-fil-A customers: please remember that we're closed Sundays and Dec. 25th (Christmas).",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"), phone: "+1 (303) 342-6646",
    outlets: [
      o("Gates", "B Gates, Center Core", "airside", "Mo-Su 05:00-22:00"),
      o("Gates", "C Gates, Center Core", "airside", "Mo-Sa 05:30-22:00"),
      o("Gates", "A Gates, Center Core", "airside", "Mo-Sa 05:30-22:00"),
    ],
  }),
  cholon_modern_asian: restaurant({
    name: "ChoLon Modern Asian", cuisine: "dine, restaurant, asian", amenity: "restaurant",
    description: "Led by acclaimed chef, Lon Symensma, and respected worldwide for their innovative approach to Southeast Asian cuisine, ChoLon has garnered praise for their elevated dishes. Effortlessly blending traditional flavors with contemporary techniques and a touch of European flare.",
    website: "cholon.com", logoUrl: logo("cholon.com"), phone: "+1 (303) 342-6726",
    outlets: [
      o("Gates", "C Gates, Gate C63", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  city_pho: restaurant({
    name: "City Pho", cuisine: "asian", amenity: "restaurant",
    description: "City Pho features modern twists on Vietnamese classics like pho, banh mi and vermicelli noodle bowls, all crafted in-house using the highest quality ingredients.",
    phone: "+1 (720) 868-5927",
    outlets: [
      o("Mezzanine", "B Gates, Center Core, Mezzanine", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  city_wok: restaurant({
    name: "City Wok", cuisine: "asian, beer, tea, bottled water, soda, juice, soup, won ton soup, hot and sour soup, chicken, tofu, eggs, shrimp, edamame, spring rolls, potstickers, dumplings, pork, crab rangoon, wine, sake, liquor, salads, noodles, lo mein, chow fun, chinese, fried rice, beef, orange chicken, chicken teriyaki, sweet and sour chicken, kung pao chicken, cashew chicken, mongolian beef, broccoli beef, szechuan beef, food, Grab & Go, Table Service, Wine & Beer, Less than $10, Vegetarian", amenity: "restaurant",
    description: "Featuring a wide selection of freshly prepared Asian dishes including vegetable, meat and vegetarian options, rice and noodle bowls, salads and soups, appetizers and beverages. City Wok also offers wine and beer.",
    vegetarian: true,
    website: "citywokdenver.com", logoUrl: logo("citywokdenver.com"), phone: "+1 (720) 868-5927",
    outlets: [
      o("Mezzanine", "B Gates, Center Core, Mezzanine", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  colorado_collective_grab_go: restaurant({
    name: "Colorado Collective Grab & Go", cuisine: "Dining", amenity: "restaurant",
    description: "Colorado Collective Marketplace offers travelers a fast, convenient grab-and-go experience featuring fresh, ready-to-enjoy items such as salads, wraps, sandwiches, fruit, yogurt, and refreshing beverages. The kiosk also provides a curated selection of snacks, travel toiletries, and convenience items, with a strong emphasis on Colorado-made products alongside trusted national brands. The result is a shopping experience that is quick, meaningful, and infused with local flavor.",
    phone: "+1 720-297-5671",
    outlets: [
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal", "landside", "Mo-Fr 07:00-21:00; Su 07:00-21:00; Sa 07:00-19:00"),
    ],
  }),
  colorado_collective_marketplace: restaurant({
    name: "Colorado Collective Marketplace", cuisine: "Grab & Go, snacks", amenity: "fast_food",
    description: "Colorado Collective Marketplace is a premier grab-and-go kiosk offering a quick and convenient way to bring healthy and affordable meals, snacks, desserts, and drinks, designed for the DEN's busy passengers.",
    phone: "+1 (303) 342-6398",
    outlets: [
      o("Gates", "B Gates, Gate B11", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  coors_silver_bullet_bar: restaurant({
    name: "Coors Silver Bullet Bar", cuisine: "bar, tv, beer, wine, liquor, breakfast, burger, cheeseburger, hamburger, fries, french fries, soda, juice, tea, coffee, dessert, food, Full Bar, Wine & Beer, $10 to $20", amenity: "bar",
    description: "The Coors Silver Bullet Bar is a full service sports bar and restaurant offering menu items for breakfast, lunch and dinner. It features a quick-serve gourmet burger counter offering burgers, fries and beverages. Alcoholic beverages include: beer, wine and spirits. Non-alcoholic beverages include: soda, juices, coffee, tea, milk and mineral water. Kid's menu items and desserts will be offered.",
    phone: "+1 (303) 882-2155",
    outlets: [
      o("Gates", "C Gates, Gate C29", "airside", "Mo-Su 07:00-21:00"),
    ],
  }),
  cru_wine_bar: restaurant({
    name: "Crú Wine Bar", cuisine: "wine, restaurant", amenity: "bar",
    description: "Crú Wine Bar is a sophisticated yet welcoming destination for wine enthusiasts and food lovers alike. Offering an extensive selection of fine wines, Crú Wine Bar creates a memorable experience for guests to savor each glass in an inviting setting. Passengers will have the opportunity to enjoy a classic favorite or discover their new favorite wine before traveling to their destination. At Crú Wine Bar, every visit is a celebration of flavor, elegance, and the art of wine.",
    phone: "+1 (720) 448-1383",
    outlets: [
      o("Gates", "B Gates, Near Gate B53", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  d_bar: restaurant({
    name: "D Bar", cuisine: "dessert", amenity: "fast_food",
    description: "A chic, modern dining spot in Denver, D Bar specializes in indulgent desserts and comfort food. With a menu that blends sweet and savory dishes, D Bar is particularly celebrated for its decadent desserts, like milkshakes and cupcakes, as well as its creative takes on comfort food favorites. The stylish yet relaxed environment makes it a popular choice for both casual diners and those celebrating special occasions.",
    phone: "+1 (303) 642-6725",
    outlets: [
      o("Gates", "A Gates, Gate A38", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  dazbog_coffee: restaurant({
    name: "Dazbog Coffee", cuisine: "coffee, sandwiches, pastries, snacks, dine, tea", amenity: "cafe",
    description: "Dazbog Coffee specialty gourmet coffee offers a full line of coffee, tea, chillers, and smoothies along with a variety of pastries and sandwiches.",
    website: "dazbog.com", logoUrl: logo("dazbog.com"), phone: "+1 (303) 342-2903",
    outlets: [
      o("Gates", "A Gates, Near Gate A48", "airside", "Mo-Su 05:00-21:00"),
      o("Gates", "B Gates, Gate B45", "airside", "Mo-Su 05:00-21:00"),
      o("Gates", "C Gates, Center Core", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  denver_central_market: restaurant({
    name: "Denver Central Market", cuisine: "food, sandwiches, salads, breakfast, American, Grab & Go, $10 to $20", amenity: "food_court",
    description: "Denver Central Market features an assortment of dining experiences in one place. There's \"River Bear Meats\" for the carnivores, \"Lunchboxx\" with classics (and breakfast!), \"Sushi Rama\" with all your sushi favorites, and \"Vero Italian\" with pizza, pasta, and more. Check out the menu!",
    phone: "+1 (303) 342-6769",
    outlets: [
      o("Gates", "A Gates, Gate A48", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  denver_street_eats: restaurant({
    name: "Denver Street Eats", cuisine: "tacos, burrito, green chili", amenity: "food_court",
    description: "Denver Street Eats brings the vibrant energy of RiNo's contemporary industrial vibe into a dynamic quick-service setting. Exposed brick and concrete create an urban street-alley atmosphere where food stalls and trucks serve locally inspired street fare. Guests can enjoy a seamless experience with self-checkout stations and a variety of ready-to-serve and grab-and-go options. From hearty breakfast street tacos, burritos, and bowls loaded with steak, chorizo, and green chili to crave-worthy snacks like queso and fresh guacamole, every bite bursts with bold flavors and locally sourced ingredients.",
    phone: "+1 (720) 318-5122",
    outlets: [
      o("Gates", "B Gates, Gate B22", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  dunkin_donuts: restaurant({
    name: "Dunkin' Donuts", cuisine: "dine, donuts, drinks, coffee", amenity: "cafe",
    description: "Offering Dunkin' Donut-branded donuts (over 50 varieties from classic, to cake, to cream-filled) and other baked goods including Muchkins © donut holes, muffins, English muffins, bagels, croissants, coffee roll, biscuit, Danishes, brownies, and drip coffee, dripped iced coffee, iced teas, hot tea, hot chocolate, milk, juice, soda and bottled water. Drive-thru open 6 a.m. - 8 p.m.",
    phone: "+1 (303) 363-4833",
    outlets: [
      o("Transit Center", "Jeppesen Terminal, Cell Phone Waiting Lot", "landside", "Mo-Su 07:00-20:00"),
    ],
  }),
  ehijole_tacos: restaurant({
    name: "EHijole Tacos", cuisine: "dine, tacos, mexican, Grab & Go", amenity: "fast_food",
    description: "EHijole Express offers a menu from warm breakfast burritos and taco bowls to salads, and grab-and-go snacks like chia pudding and fruit cups. Everything is prepared with real ingredients and bold flavors travelers recognize and trust. What sets EHijole Express apart is its balance of familiar Mexican classics alongside lighter options that travel well, making it easy to fuel up without slowing down. Stop by EHijole Express and enjoy food that fits your schedule, your appetite, and your journey.",
    phone: "+1 (720) 339-5907",
    outlets: [
      o("Gates", "B Gates, Gate B24", "landside", "Mo-Fr 07:00-21:00; Sa 07:00-19:00; Su 07:00-21:00"),
    ],
  }),
  einstein_bagel_bros_mile_high_spirits: restaurant({
    name: "Einstein Bagel Bros / Mile High Spirits", cuisine: "bagel, coffee, whiskey, spirits", amenity: "cafe",
    description: "Einstein Bagel Bros. offers a variety of hot, fresh bagels, shmears and spreads, breakfast sandwiches, and coffee, as well as deli sandwiches. Mile High Spirits is a local Denver distillery serving a variety of cocktails, spirits, beer, and wine.",
    phone: "+1 (720) 288-8368",
    outlets: [
      o("Gates", "B Gates, Gate B54", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  einstein_bros_bagels: restaurant({
    name: "Einstein Bros Bagels", cuisine: "coffee, iced coffee, deli, sandwiches, bagel, pepperoni, avocado, lox, breakfast, eggs, bacon, sausage, smoothies, parfait, milk, food, Grab & Go, Less than $10", amenity: "cafe",
    description: "This specialty coffee, versatile, concept will offer a variety of quick-serve breakfast, sandwich, snack, beverage options and much more.",
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"), phone: "+1 (720) 785-0549",
    outlets: [
      o("Gates", "A Gates, Gate A40", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  el_chingon: restaurant({
    name: "El Chingon", cuisine: "dine", amenity: "restaurant",
    description: "El Chingon is a Mexican restaurant that presents a contemporary, gourmet interpretation of traditional family recipes.",
    phone: "+1 (303) 342-6901",
    outlets: [
      o("Gates", "B Gates, Gate B12", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  elways: restaurant({
    name: "Elway's", cuisine: "restaurant, bar, beer, wine, liquor, tv, chicken, salads, ahi tuna, tuna, steak, burger, cheeseburger, hamburger, bacon, green chili, prime rib, rbs, lamb, wagyu beef, salmon, fish, trout, seafood, filet mignon, ribeye, mac & cheese, fries, french fries, calamari, tacos, tuna tartare, shrimp cocktail, shrimp, onion rings, granola, yogurt, muesli, eggs, biscuit, sausage, eggs benedict, short rib, avocado, breakfast sandwiches, biscuits & gravy, omelet, breakfast burrito, food, Full Bar, Table Service, More than $20", amenity: "restaurant",
    description: "With its distinctly Colorado-themed appetizers and entrees, Elway's lineup features hand-cut prime steaks, fresh fish, cold water crustaceans, and much more. Enjoy breakfast lunch and dinner; appetizers, soups, salads and desserts complimented by a full bar.",
    phone: "+1 (720) 868-5929",
    outlets: [
      o("Gates", "B Gates, Center Core", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  elways_taproom_grill: restaurant({
    name: "Elway's Taproom & Grill", cuisine: "dine, restaurant, beer, American", amenity: "restaurant",
    description: "Elway's Taproom and Grill offers a selection of steaks, burgers, sandwiches, salads, and appetizers. The restaurant aims to provide a welcoming environment for patrons to enjoy good food, drinks, and camaraderie, often attracting both locals and visitors alike.",
    phone: "+1 (303) 228-0747",
    outlets: [
      o("Gates", "A Gates, Near Gate A18", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  fat_sullys_ny_pizza: restaurant({
    name: "Fat Sully's NY Pizza", cuisine: "pizza, Quick Serve", amenity: "fast_food",
    description: "Fat Sully's makes great pizza...and more!",
    phone: "+1 (720) 719-1097",
    outlets: [
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 07:00-24:00"),
    ],
  }),
  freshens_fresh_food_studio: restaurant({
    name: "Freshëns Fresh Food Studio", cuisine: "food, Quick Serve, Vegetarian, healthy, crepes, smoothies, salads, coffee, Grab & Go, Less than $10", amenity: "fast_food",
    description: "Freshëns Fresh Food Studio features their famous hand-crafted crepes. Guests can choose from 11 chef-created options such as Pesto Chicken, Honey Mustard Chicken, or Tomato, Cheese & Basil, served in a golden or multi-grain crepe. Freshens also features two breakfast crepes, including the Denver (created especially for Denver travelers), which includes fluffy scrambled eggs, cheddar-jack, roasted onions & peppers, bacon and salsa served in a warm Crepe; and the Egg White Florentine, which consists of egg whites, fresh spinach, bacon, tomatoes and feta cheese. And for crepe lovers with a sweet tooth, the Cheesecake Supreme with delicious cheesecake, strawberries, Nutella, and whipped cream; or the Nutella Supreme made with creamy Nutella, sliced bananas, strawberries and whipped cream, will hit the spot. For travelers seeking healthy and portable options, the menu offers 15 fresh-blended smoothies, including nine recipes that are vegan. Favorites are the Goin' Green or Apple Kiwi Kale options blended with fresh kale. Other wellness blend smoothies are the Peanut Butter Protein or Vegan Power Up with added plant protein. All recipes are gluten free and 100 percent clean containing no colors from artificial sources, no artificial preservatives, no artificial sweeteners and no artificial flavors. Travelers can enjoy Dazbog coffee. Guests also can choose from one of the six hand-tossed salads or create their own. This option allows for added fruits, veggies and protein all served in a signature crispy crepe shell. For all customer service inquiries, please e-mail Alaina Menan at amenan@cintl.com.",
    vegetarian: true,
    website: "freshens.com", logoUrl: logo("freshens.com"), phone: "+1 (303) 342-6344",
    outlets: [
      o("Gates", "B Gates, Gate B23", "airside", "Mo-Su 06:00-22:00"),
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  garbanzo_fresh_mediterranean: restaurant({
    name: "Garbanzo Fresh Mediterranean", cuisine: "mediterranean, fresh, healthy, coffee, Vegetarian", amenity: "restaurant",
    description: "Garbanzo Fresh Mediterranean is a fast-casual restaurant chain serves Middle Eastern staples like falafel, hummus and pita. The airport location will serve six signature entrées inspired by traditional Mediterranean themes, but not bound by it. It will also be the concept's first location to offer breakfast versions of their famous signature flavors. Morning commuters will find items like ready-to-go Greek yogurt parfaits with granola, and fruit along with build-your-own breakfast egg bowls, and pitas that can be filled with a variety of vegetables, sauces and proteins. Additionally, Garbanzo will proudly pour Intelligentsia single-origin premium coffee. This airport location also will provide grab-and-go items such as a hummus snack pack and premade entrées like Greek salads.",
    vegetarian: true,
    website: "eatgarbanzo.com", logoUrl: logo("eatgarbanzo.com"),
    outlets: [
      o("Gates", "B Gates, Center Core", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  garrett_popcorn: restaurant({
    name: "Garrett Popcorn", cuisine: "kiosk, popcorn, snacks, vending machine", amenity: "vending_machine",
    description: "Garrett Popcorn, made fresh daily in small batches with high-quality ingredients, best known for its Garrett Mix® is now available 24/7 via smart vending technology at DEN. Garrett Popcorn Shops, a Chicago tradition, has expanded to nine countries and has now landed at DEN to surprise and delight the traveling public. Enjoy featured favorites like: Garrett Mix®, CaramelCrisp®, CheeseCorn®, Spicy CheeseCorn®, Chicago Pizza and Simply Salted. Need Help? Scan the QR code on the machine to report an issue or call our toll-free number.",
    website: "garrettpopcorn.com", logoUrl: logo("garrettpopcorn.com"), phone: "+1 (800) 778-1356",
    outlets: [
      o("Gates", "B Gates, Near Gate B15", "landside", "Mo-Su 00:00-24:00", true),
      o("Gates", "A Gates, Gate A19", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "A Gates, Gate A27", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "C Gates, Gate C55", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "C Gates, Gate C63", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  great_divide_brewing: restaurant({
    name: "Great Divide Brewing", cuisine: "wine, beer, french toast, breakfast burrito, eggs, breakfast sandwiches, chicken & waffles, omelet, granola, fruit, bacon, sausage, soup, salads, burger, hamburger, cheeseburger, grilled cheese, chicken, fish & chips, salmon, food, American, breakfast, Full Bar, Grab & Go, Table Service, Wine & Beer, $10 to $20", amenity: "bar",
    description: "Great Divide Brewing features a large selection of appetizers, entrees, sandwiches, salads, and...of course...custom-crafted beers and other beverages.",
    website: "greatdivide.com", logoUrl: logo("greatdivide.com"), phone: "+1 (303) 645-3758",
    outlets: [
      o("Gates", "C Gates, Gate C32", "airside", "Mo-Su 05:30-21:30"),
    ],
  }),
  grill_vine: restaurant({
    name: "Grill & Vine", cuisine: "food, Family Friendly, Full Bar, More than $20", amenity: "restaurant",
    description: "Grill & Vine is a modernized interpretation of the classic bar & grill designed in signature bistro-style, for farm-to-table cuisine showcasing Denver's natural bounty. Casual-upscale yet comfortable enough to make you feel welcome, guests will enjoy traditional favorites with a modern Colorado twist. Complimenting Westin's core brand values, the menu will support wellness with simple, light, fresh foods while also focusing on locally sourced items. Also featured will be handcrafted cocktails and a considerable wine program including organic wines.",
    phone: "+1 (303) 317-1800",
    outlets: [
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal, The Westin", "landside", "Mo-Su 06:00-22:00"),
    ],
  }),
  half_moon_empanadas: restaurant({
    name: "Half Moon Empanadas", cuisine: "dine, empanadas, Quick Serve", amenity: "fast_food",
    description: "Half Moon Empanadas offers a variety of quick-serve artisanal empanadas, along with snack and beverage options.",
    website: "halfmoonempanadas.com", logoUrl: logo("halfmoonempanadas.com"), phone: "+1 (786) 888-2292",
    outlets: [
      o("Gates", "B Gates, Gate B37", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  illy_coffee_machine: restaurant({
    name: "illy Coffee Machine", cuisine: "vending machine, coffee", amenity: "vending_machine",
    description: "This illy Coffee machine utilizes 100% Arabica whole beans to grind, brew and serve a full list of hot coffee drinks, from espresso and macchiato to cappuccino, café latte and Americano, in addition to illy brewed drip coffee.",
    website: "illy.com", logoUrl: logo("illy.com"), phone: "+1 (855) 969-8678",
    outlets: [
      o("Gates", "A Gates, Gate A33", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates A54-A87", "A Gates, Gate A56", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "B Gates, Gate B49", "landside", "Mo-Su 00:00-24:00", true),
      o("Gates", "B Gates, Gate B12", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "C Gates, Gate C46", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "C Gates, Gate C40", "airside", "Mo-Su 00:00-24:00", true),
      o("Gates", "C Gates, Gate C61", "airside", ""),
      o("Gates", "A Gates, Gate A25", "airside", ""),
      o("Gates", "A Gates, Gate A40", "airside", ""),
      o("Gates", "C Gates, Gate C53", "airside", ""),
      o("Gates", "B Gates, Gate B60", "airside", ""),
      o("Gates B80-B95", "B Gates, Gate B80", "airside", ""),
    ],
  }),
  ingredients: restaurant({
    name: "Ingredients", cuisine: "coffee, food, Grab & Go, Quick Serve, Less than $10", amenity: "cafe",
    description: "\"Ingredients\" is the grab-and-go restaurant at DEN's Westin Denver International Airport hotel. It features coffees and light fare designed for the on-the-go travelers.",
    phone: "+1 (303) 317-1800",
    outlets: [
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal, Westin Denver International Airport hotel", "landside", "Mo-Su 05:00-21:00"),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "smoothies, snacks, drinks", amenity: "restaurant",
    description: "Whether you're on the go or waiting for your next flight, stop by Jamba Juice to fuel up with smoothies, juices, and healthy snacks.",
    website: "jamba.com", logoUrl: logo("jamba.com"), phone: "+1 (720) 868-5931",
    outlets: [
      o("Gates", "C Gates, Near Gate C31", "airside", "Mo-Su 05:00-21:00"),
      o("Mezzanine", "B Gates, Center Core, Mezzanine", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  kabod_coffee: restaurant({
    name: "Kabod Coffee", cuisine: "coffee, iced coffee, bottled water, soda, juice, coffee beans, smoothies, tea, espresso, latte, cappuccino, americano, mocha, bakery, bagel, muffin, cookie, brownie, breakfast, breakfast sandwiches, eggs, bacon, sausage, snacks, cold brew, food, Grab & Go, Quick Serve, Less than $10, dine", amenity: "cafe",
    description: "Kabod Coffee...naturally...offers fresh, piping-hot coffee, as well as an assortment of other tasty items.",
    phone: "+1 (303) 342-6344",
    outlets: [
      o("Gates B80-B95", "B Gates, Gate B89", "airside", "Mo-Su 08:00-17:00"),
      o("Check-In / Ticketing", "Jeppesen Terminal, Level 6 West", "landside", "Mo-Su 06:00-24:00"),
      o("Gates", "B Gates, Gate B24", "airside", "Mo-Su 07:00-14:00"),
    ],
  }),
  kfc_express_pizza_hut_express: restaurant({
    name: "KFC Express/Pizza Hut Express", cuisine: "bottled water, soda, juice, pizza, pepperoni, salads, coffee, chicken, fried chicken, chicken wings, buffalo wings, cinnamon sticks, biscuit, coleslaw, pizza hut, kfc, food, Quick Serve, Less than $10", amenity: "fast_food",
    description: "Offering a complete menu selection from fried chicken dinners, sandwiches, chicken fingers and sides to breakfast sandwiches, as well as personal pan pizzas, combo meals, salads and buffalo chicken wings. All made with natural chicken and all natural USDA Choice Beef. Pepsi products and assorted beverages are available.",
    website: "kfc.com", logoUrl: logo("kfc.com"), phone: "+1 (303) 342-6744",
    outlets: [
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  la_casita: restaurant({
    name: "La Casita", cuisine: "mexican, restaurant, bar", amenity: "restaurant",
    description: "Tamales, burritos, green chili, breakfast burritos, taco salads, quesadillas, tacos, tostadas, huevos rancheros, and fresh fruit, are just a sampling of the many items available at La Casita. It specializes in freshly-made Mexican entrees including tamales (two types of tamales are offered: red chile and pork, and the vegetarian-and-gluten-free green chile and cheese), burritos, quesadillas and more. La Casita serves breakfast (until 10 a.m.), lunch and dinner.",
    phone: "+1 (720) 868-5932",
    outlets: [
      o("Gates", "C Gates, Center Core", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  lavazza: restaurant({
    name: "Lavazza", cuisine: "coffee beans, coffee, fruit, bottled water, soda, juice, bakery, fruit cup, yogurt, sandwiches, bagel, scones, pastries, cannoli, espresso, macchiato, latte, cappuccino, americano, hot chocolate, tea, chai, milk, chips, food, Grab & Go, Quick Serve, $10 to $20", amenity: "fast_food",
    description: "We at LavAzza believe that quality is not controlled but rather built. It is a daily process that involves a dedicated team during all the production phases. Avant-garde techniques applied in an innovative way: these have always been the fundamentals of our method, ever since Luigi Lavazza invested in what was at the time the world's most modern roasting plant, and invented a brand-new form of packaging in order to produce more coffee of better quality, store it for longer and deliver it further. Lavazza quality improves everyday, thanks to the dedication of our R&D team. They carefully set control procedures to check every stage of the production process.",
    website: "lavazza.com", logoUrl: logo("lavazza.com"), phone: "+1 (303) 342-7396",
    outlets: [
      o("Gates", "A Gates, Gate A34", "airside", "Mo 05:00-14:00; Th-Fr 05:00-14:00; Su 05:00-14:00; Tu-We 05:00-12:00; Sa 05:00-12:00"),
    ],
  }),
  little_man_ice_cream: restaurant({
    name: "Little Man Ice Cream", cuisine: "ice cream, snacks", amenity: "fast_food",
    description: "Little Man Ice Cream builds on the time-honored tradition of the neighborhood ice cream store. From the great flavors of homemade ice creams & hand-crafted novelties, to the aroma of fresh waffle cones cooked on site - it is Little Man's goal to set itself apart by engaging all of the customer's senses.",
    website: "littlemanicecream.com", logoUrl: logo("littlemanicecream.com"), phone: "+1 (303) 668-8324",
    outlets: [
      o("Gates", "C Gates, Gate C27", "airside", "Mo-Su 07:00-18:00"),
    ],
  }),
  marczyk_fine_foods: restaurant({
    name: "Marczyk Fine Foods", cuisine: "dine, restaurant, deli, Wine & Beer", amenity: "restaurant",
    description: "Marczyk Fine Foods, a Denver staple since 2002, is excited to bring its renowned selection of gourmet deli items and artisan goods to Denver International Airport. Known for their dedication to high-quality, locally-sourced products, Marczyk is a beloved name in the Denver food scene. Offering patrons everything from hand-crafted sandwiches to boutique wines and fresh deli items.",
    website: "marczykfinefoods.com", logoUrl: logo("marczykfinefoods.com"), phone: "+1 (303) 342-6726",
    outlets: [
      o("Gates", "C Gates, Gate C62", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  maria_empanada: restaurant({
    name: "Maria Empanada", cuisine: "dine, empanadas", amenity: "restaurant",
    description: "Maria Empanada offers savory and sweet authentic Argentinian empanadas.",
    website: "mariaempanada.com", logoUrl: logo("mariaempanada.com"), phone: "+1 (303) 342-6645",
    outlets: [
      o("Gates", "A Gates, Gate A24", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "fast food, burger, cheeseburger, hamburger, fries, french fries, chicken, chicken nuggets, fried chicken, salads, coffee, yogurt, parfait, fish, iced coffee, juice, bottled water, soda, smoothies, breakfast, bacon, breakfast sandwiches, pancakes, sausage, eggs, food, Quick Serve, Less than $10, Grab & Go", amenity: "fast_food",
    description: "Serving a full range of items from the classic 100% beef Big Mac and other specialty hamburgers to fried chicken sandwiches, fish sandwiches, snacks and sides, fruits, and Happy Meals. Compliment your meal with Coca Cola brand beverages or a full offering of McCafé selections, from freshly made coffee to cool smoothies and Frappés.",
    phone: "+1 (303) 342-9052",
    outlets: [
      o("Gates", "C Gates, Center Core", "airside", "Mo-Su 05:00-22:00"),
      o("Gates", "B Gates, Center Core", "airside", ""),
      o("Gates", "A Gates, Center Core", "airside", ""),
    ],
  }),
  mercantile_dining_provision: restaurant({
    name: "Mercantile Dining & Provision", cuisine: "coffee, market, Wine & Beer, cocktails", amenity: "restaurant",
    description: "This high-performance space includes a New American Eatery, Artisanal Market & Barista Bar! Mercantile represents the next evolution in Chef Alex Seidel's vision of approachability and transparency in dining. Beyond what is offered in the dining room or the marketplace, Mercantile is looking to bridge the information gap between farmer and consumer. In connecting the dots, we hope to instill in our guests the same appreciation we have for those involved at each step in the process of going from farm to table. From farmer to shepherd to chef to server, each had a hand in both preserving and dictating the story that each dish tells.",
    website: "mercantiledenver.com", logoUrl: logo("mercantiledenver.com"), phone: "+1 (303) 342-6331",
    outlets: [
      o("Gates", "A Gates, Gate A39", "airside", "Mo-Su 05:30-23:30"),
    ],
  }),
  mister_oso_by_senor_bear: restaurant({
    name: "Mister Oso by Senor Bear", cuisine: "tacos, dine, cocktails, mexican", amenity: "restaurant",
    description: "Mr. Oso by Senor Bear, the \"little brother\" of Señor Bear, continues the Latin American theme with a focus on quick-serve smoked-meat tacos, ceviches, and light cocktails, complemented by a robust to-go program.",
    phone: "+1 (303) 342-6623",
    outlets: [
      o("Gates", "C Gates, Gate C54", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  mizu_sushi_izakaya: restaurant({
    name: "Mizu Sushi Izakaya", cuisine: "dine", amenity: "restaurant",
    description: "Mizu Sushi Izakaya is an elegant Japanese tapas-style bar and restaurant.",
    phone: "+1 (303) 342-6901",
    outlets: [
      o("Gates", "B Gates, Gate B12", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  modern_market: restaurant({
    name: "Modern Market", cuisine: "granola bar, protein bar, coffee, bottled water, salads, steak, chicken, sandwiches, healthy, soup, green chili, chili, tomato soup, soda, juice, tea, fruit, chips, yogurt, milk, chocolate milk, beer, wine, breakfast sandwiches, eggs, bacon, sausage, tofu, oatmeal, fruit cup, food, $10 to $20, Gluten-free, Vegetarian, Grab & Go, Wine & Beer", amenity: "restaurant",
    description: "Serving breakfast, lunch and dinner, Modern Market offers a farm-fresh, made-from-scratch, seasonal menu centered around whole ingredients, sourced from regional and local suppliers. Menu items cater to diverse dietary needs and preferences including gluten free, vegetarian and vegan options. May close after last flights depart.",
    vegetarian: true, glutenFree: true,
    website: "modernmarket.com", logoUrl: logo("modernmarket.com"), phone: "+1 (303) 342-6870",
    outlets: [
      o("Gates", "B Gates, Center Core", "airside", "Mo-Su 05:30-21:30"),
      o("Gates", "C Gates, Gate C28", "airside", "Mo-Su 06:00-20:00"),
    ],
  }),
  new_belgium_brewing: restaurant({
    name: "New Belgium Brewing", cuisine: "beer, breakfast burrito, eggs, yogurt, coffee, tea, soda, juice, omelet, bacon, sausage, avocado, guacamole, pretzel, nachos, hummus, fries, french fries, tacos, salads, burger, hamburger, cheeseburger, sandwiches, pulled pork, grilled cheese, wine, food, American, breakfast, Family Friendly, Full Bar, Table Service, Less than $10", amenity: "bar",
    description: "New Belgium Brewing offers a wide assortment of local and imported beers, along with tasty food!",
    website: "newbelgium.com", logoUrl: logo("newbelgium.com"), phone: "+1 (303) 342-6735",
    outlets: [
      o("Gates", "B Gates, Gate B32", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  novo_coffee: restaurant({
    name: "Novo Coffee", cuisine: "restaurant, dine, coffee, snacks, sandwiches, breakfast", amenity: "cafe",
    description: "Novo Coffee offer a variety of quick breakfast, sandwich, snack, coffee/beverage options and much more!",
    website: "novocoffee.com", logoUrl: logo("novocoffee.com"), phone: "+1 (720) 474-4196",
    outlets: [
      o("Gates", "A Gates, Gate A39", "airside", "Mo-Su 04:00-20:00"),
      o("Gates", "B Gates, Center Core", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  olive_finch_grab_go: restaurant({
    name: "Olive & Finch Grab & Go", cuisine: "kiosk, Grab & Go, snacks, drinks", amenity: "fast_food",
    description: "Discover the best of Denver's beloved Olive and Finch at our 24-hour airport kiosk, where fresh, chef-crafted offerings meet traveler convenience. Serving up a curated selection of our signature pastries, sandwiches, salads, and cold-pressed juices, we're here to make every journey a little more delicious. Whether you're grabbing a quick bite before your flight or refueling during a layover, you'll enjoy vibrant flavors, quality ingredients, and thoughtful preparation-all hallmarks of Olive and Finch's commitment to excellence. Perfectly suited for on-the-go travelers, our offerings are inspired by the same chef-driven passion that made Olive and Finch a Denver favorite. Stop by any time, day or night, for wholesome meals, artisanal snacks, or a sweet treat to keep you satisfied on your travels.",
    website: "oliveandfincheatery.com", logoUrl: logo("oliveandfincheatery.com"), phone: "+1 (720) 261-4209",
    outlets: [
      o("Gates", "A Gates, Near Gate A48", "airside", "Mo-Su 00:00-24:00", true),
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal", "landside", ""),
    ],
  }),
  panda_express_temporarily_closed_for_remodeling: restaurant({
    name: "Panda Express - Temporarily Closed for Remodeling", cuisine: "chinese, asian, soda, egg rolls, chicken, spring rolls, rangoons, juice, bottled water, coffee, fried rice, chow mein, ribs, teriyaki chicken, beef, broccoli beef, orange chicken, tofu, kung pao chicken, shrimp, steak, food, Quick Serve, Less than $10, Vegetarian", amenity: "fast_food",
    description: "Featuring Asian inspired entrees, sides and snack foods. Create your own meal buffet style from a wide variety of chicken, beef and seafood entrees, diverse rice, noodle and vegetable side dishes and appetizers. Also offering desserts and a full range of Pepsi products.",
    vegetarian: true,
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"), phone: "+1 (303) 342-3405",
    outlets: [
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 05:00-24:00"),
    ],
  }),
  peets_coffee: restaurant({
    name: "Peet's Coffee", cuisine: "coffee, snacks, dine, restaurant", amenity: "cafe",
    description: "Attention all coffee lovers! Peet's Coffee is serving up fresh coffee, espresso, and delicious baked goods to fuel your journey. Whether you're catching a flight or working a long shift, Peet's Coffee is here to keep you energized and satisfied. Come and experience the craft of great coffee today!",
    phone: "+1 (720) 439-6284",
    outlets: [
      o("Gates", "C Gates, Near Gate C31", "airside", "Mo-Su 05:00-21:00"),
      o("Gates", "A Gates, Near Gate A18", "airside", "Mo-Su 05:00-21:00"),
      o("Mezzanine", "B Gates, Center Core, Mezzanine", "airside", "Mo-Su 09:00-17:00"),
    ],
  }),
  qdoba_mexican_eats: restaurant({
    name: "Qdoba Mexican Eats", cuisine: "breakfast, breakfast burrito, burrito, nachos, tacos, queso, guacamole, cookie, brownie, bottled water, soda, juice, food, mexican, Quick Serve, $10 to $20", amenity: "fast_food",
    description: "Qdoba offers flavor-packed Mexican eats featuring burritos, bowls, tacos and salads.",
    website: "qdoba.com", logoUrl: logo("qdoba.com"), phone: "+1 (720) 868-5935",
    outlets: [
      o("Mezzanine", "B Gates, Center Core", "airside", "Mo-Su 05:30-21:30"),
      o("Gates", "A Gates, Center Core", "airside", ""),
    ],
  }),
  quiznos: restaurant({
    name: "Quiznos", cuisine: "soda, fruit, cookie, chips, steak, beef, cheesesteak, chicken, pork, pulled pork, turkey, bacon, guacamole, deli, tuna, pepperoni, salami, ham, roast beef, soup, salads, hot dog, chili cheese dog, chili, bottled water, juice, food, Quick Serve, Less than $10", amenity: "fast_food",
    description: "Born in Denver, Quiznos is the OG of Toasty Subs. Mmmm…toasty! We also feature freshly made salads, delicious soups, breakfast sandwiches and F'Real milkshakes!",
    website: "quiznos.com", logoUrl: logo("quiznos.com"), phone: "+1 (303) 342-7396",
    outlets: [
      o("Gates", "A Gates, Gate A32", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  rocky_mountain_chocolate_factory: restaurant({
    name: "Rocky Mountain Chocolate Factory", cuisine: "dessert, candy, chocolate, candy apples, caramel apples, bottled water, soda, juice, ice cream, fudge, truffles, frozen yogurt, hot chocolate, Grab & Go, Less than $10", amenity: "fast_food",
    description: "Rocky Mountain Chocolate Factory makes an extensive line of premium chocolate candies and confectionary treats featuring a fresh daily variety of caramel, candied apples and fudge ready for giftwrap as well.",
    website: "rockychoc.com", logoUrl: logo("rockychoc.com"), phone: "+1 (303) 342-6344",
    outlets: [
      o("Gates", "B Gates, Gate B52", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  root_down: restaurant({
    name: "Root Down", cuisine: "restaurant, bar, beer, wine, tv, salads, grab & go, sandwiches, fruit, soup, green chili, chili, chicken, salmon, smoked salmon, steak, tofu, healthy, breakfast, parfait, oatmeal, pancakes, omelet, eggs, breakfast burrito, chorizo, sweet potato fries, fries, french fries, edamame, hummus, breakfast sandwiches, eggs benedict, crab cakes, bison, meatballs, fried chicken, chicken wings, grilled cheese, burger, cheeseburger, hamburger, turkey burger, veggie burger, lamb, cuban sandwich, ham, pork, dessert, cheesecake, pie, coffee, espresso, cappuccino, hot chocolate, tea, chai, bacon, egg whites, avocado, croissant, food, Full Bar, Table Service, $10 to $20, Gluten-free, Vegetarian", amenity: "restaurant",
    description: "The award-winning, nationally acclaimed Root Down restaurant offers a globally influenced seasonal cuisine with a locally-sourced, field-to-fork mentality. Serving breakfast, lunch and dinner entree items, including select raw foods, sandwiches, appetizers, soups, salads and desserts, as well as a wide selection of cocktails, wine, beer, sake and spirits. The restaurant offers quality, freshness and flavor, artistically presented.",
    vegetarian: true, glutenFree: true,
    website: "rootdowndenver.com", logoUrl: logo("rootdowndenver.com"), phone: "+1 (303) 342-6959",
    outlets: [
      o("Gates", "C Gates, Center Core", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  runway_rye: restaurant({
    name: "Runway & Rye", cuisine: "dine, small plates, dessert, drinks", amenity: "fast_food",
    description: "Runway & Rye is an elevated airport dining experience inspired by DEN's Runway 16R/34L, the longest commercial runway in the United States. The concept features handcrafted beverages, signature Old Fashioneds, cocktails, beer, wine, shareable small plates, salads, and desserts, offering travelers and airport employees a new place to relax and enjoy bold, seasonal flavors on the B Concourse Mezzanine.",
    phone: "+1 303-342-9000",
    outlets: [
      o("Mezzanine", "B Gates", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  salt_grinder: restaurant({
    name: "Salt & Grinder", cuisine: "dine, deli, sandwiches, salads, breakfast sandwiches", amenity: "restaurant",
    description: "Salt & Grinder is a New Jersey-style deli featuring a variety of cured meats, cheeses, fresh bread, salads, and breakfast sandwiches.",
    website: "saltandgrinder.com", logoUrl: logo("saltandgrinder.com"), phone: "+1 (303) 381-8350",
    outlets: [
      o("Mezzanine", "B Gates, Near Gate B51", "airside", "Mo-Su 05:30-21:30"),
    ],
  }),
  santo: restaurant({
    name: "Santo", cuisine: "dine, mexican", amenity: "restaurant",
    description: "Santo offers a twist on modern, Northern New Mexican fare. It brings to life the vibrant eating and drinking culture of the region. The menu combines classic cuisine - regional spices, chiles and techniques - with a seasonal and local Colorado approach to sourcing meats and produce.",
    outlets: [
      o("Gates", "C Gates, Near Gate C49", "airside", "Mo-Su 05:30-22:00"),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "dine, restaurant, Wine & Beer, burger, hot dog, Quick Serve", amenity: "restaurant",
    description: "Shake Shack sprouted from a hot dog cart in Madison Square Park in Manhattan to support the Madison Square Park Conservancy's first art installation in 2001. This modern day \"roadside\" burger stand serves up the most delicious burgers, hot dogs, frozen custard, shakes, beer, wine and more.",
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"), phone: "+1 (720) 868-5936",
    outlets: [
      o("Mezzanine", "B Gates, Mezzanine, Center Core", "airside", "Mo-Su 07:00-23:00"),
      o("Gates", "A Gates, Center Core", "airside", "Mo-Su 05:30-23:00"),
    ],
  }),
  smashburger_burgers_bar: restaurant({
    name: "SMASHBURGER Burgers & Bar", cuisine: "burger, cheeseburger, hamburger, fries, french fries, milkshake, bottled water, soda, juice, beer, chicken, fried chicken, veggie burger, avocado, salads, bacon, breakfast, breakfast sandwiches, eggs, food, Family Friendly, Full Bar, Table Service, $10 to $20", amenity: "restaurant",
    description: "SMASHBURGER brings its signature menu to DEN with table and take out service, serving craft gourmet burgers, chicken sandwiches, and veggie burgers; signature side dishes; fresh salads, and non-alcoholic beverages. The restaurant also will feature a full bar with ten craft beers on tap from top Colorado breweries, including Tivoli, Dry Dock, Great Divide, Left Hand, Oskar Blues, and Upslope.",
    website: "smashburger.com", logoUrl: logo("smashburger.com"), phone: "+1 (303) 342-6932",
    outlets: [
      o("Gates", "C Gates, Gate C48", "airside", "Mo-Su 04:00-22:30"),
      o("Gates", "B Gates, Gate B44", "airside", "Mo-Su 05:00-22:00"),
    ],
  }),
  snarfs_sandwiches: restaurant({
    name: "Snarf's Sandwiches", cuisine: "sandwiches, soup, salads, food, Gluten-free, American, Grab & Go, Quick Serve, Less than $10", amenity: "fast_food",
    description: "Ready to Snarf? Check out our variety of menu items including classic sandwiches, specialty sandwiches, phenomenal soups, salads, gluten-free options and desserts.",
    glutenFree: true,
    phone: "+1 (720) 912-1491",
    outlets: [
      o("Gates A54-A87", "A Gates, Gate A73", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  snooze_an_a_m_eatery: restaurant({
    name: "Snooze An A.M. Eatery", cuisine: "dine, restaurant, breakfast, bar", amenity: "restaurant",
    description: "Snooze does breakfast right, but different. From Benedicts to Bloodys to whatever you're feeling at the moment, we're always looking to turn our food upside down and on its side. As our guests have discovered since 2006, our dishes are anything but regular - and that's just the way they like it.",
    website: "snoozeeatery.com", logoUrl: logo("snoozeeatery.com"), phone: "+1 (720) 868-5937",
    outlets: [
      o("Mezzanine", "B Gates, Center Core, Mezzanine Level", "airside", "Mo-Su 05:30-21:30"),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "coffee, iced coffee, bottled water, soda, juice, coffee beans, smoothies, tea, espresso, latte, cappuccino, americano, mocha, bakery, bagel, muffin, cookie, brownie, breakfast, breakfast sandwiches, eggs, bacon, sausage, snacks, cold brew, food, Grab & Go, Quick Serve, Less than $10, dine, restaurant", amenity: "cafe",
    description: "Featuring Starbucks-branded specialty coffee and tea drinks with breakfast pastries and baked goods. Lunch offerings including sandwiches, fresh fruit and salads. Starbucks Mobile Order and Pay is now available at all 3 Starbucks locations at Denver International Airport. Using your Starbucks App you can choose the Starbucks locations that best fits your destination within DEN and skip the line, to order your favorite beverage and food item.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "+1 (303) 645-3759",
    outlets: [
      o("Gates", "B Gates, Gate B80", "airside", "Mo-Su 05:30-17:30"),
      o("Gates", "C Gates, Center Core", "airside", "Mo-Tu 04:30-23:00; We-Su 00:00-24:00", true),
      o("Gates", "B Gates, Gate B32", "airside", "Mo-Su 04:30-21:30"),
      o("Gates", "B Gates, Gate B63", "airside", "Mo-Su 05:00-21:00"),
      o("Gates", "B Gates, Center Core", "airside", "Mo-Tu 04:30-23:00; We-Su 00:00-24:00", true),
    ],
  }),
  steves_snappin_dogs: restaurant({
    name: "Steve's Snappin' Dogs", cuisine: "beer, wine, bar, tv, cookie, brownie, energy drink, juice, bottled water, chips, bratwurst, hot dog, bacon, chili, green chili, corn dog, breakfast, breakfast sandwiches, breakfast all day, eggs, ham, sausage, breakfast burrito, blt, burger, cheeseburger, hamburger, grilled cheese, cheesesteak, clams, turkey, salads, fries, french fries, chili cheese fries, onion rings, nachos, food, Full Bar, Less than $10", amenity: "restaurant",
    description: "Steve's Snappin' Dogs features award-winning, gourmet hot dogs direct from New Jersey. They also offer a full bar with a great selection of local craft beers on tap.",
    phone: "+1 (303) 342-6770",
    outlets: [
      o("Gates", "B Gates, Gate B22", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  sunset_loop_bar_grill: restaurant({
    name: "Sunset Loop Bar & Grill", cuisine: "dine, restaurant, food, bar", amenity: "bar",
    description: "Sunset Loop Bar & Grill offers travelers a relaxing retreat with a unique selection of local and international beverages, crafted cocktails, and a vibrant menu to satisfy every craving. Whether you're looking for a quick snack, a leisurely meal, or a signature cocktail, Sunset Loop has you covered in style. Enjoy your time at DEN in a cozy, modern space perfect for unwinding or catching up with fellow travelers.",
    phone: "+1 (866) 508-3558",
    outlets: [
      o("Gates", "B Gates, Near Gate B63", "airside", "Mo-Su 06:00-21:00"),
    ],
  }),
  sunset_loop_market: restaurant({
    name: "Sunset Loop Market", cuisine: "Grab & Go, dine, snacks", amenity: "fast_food",
    description: "Sunset Loop Market partners with local and environmentally focused small businesses and to provide a curated assortment of snacks and ready to serve provisions to the hungry traveler.",
    phone: "+1 (866)-508-3558",
    outlets: [
      o("Gates", "B Gates, Near Gate B62", "airside", "Mo-Su 00:00-24:00", true),
    ],
  }),
  superfruit_republic: restaurant({
    name: "Superfruit Republic", cuisine: "Dining", amenity: "restaurant",
    description: "This specialty coffee and snack shop offers a variety of quick breakfasts, sandwiches, snacks, coffee/beverage options and much more! The grab-and-go self-service area is always open.",
    phone: "+1 (720) 787-2167",
    outlets: [
      o("Gates", "C Gates, Center Core West", "airside", "Mo-Su 04:30-21:00"),
    ],
  }),
  taco_bell_cantina: restaurant({
    name: "Taco Bell Cantina", cuisine: "mexican, beer, freezes", amenity: "fast_food",
    description: "At Taco Bell Cantina, enjoy your favorite Taco Bell classics, plus beer and boozy freezes coming in late summer.",
    website: "tacobell.com", logoUrl: logo("tacobell.com"), phone: "+1 (303) 342-6717",
    outlets: [
      o("Gates", "A Gates, Gate A47", "airside", "Mo-Su 10:00-22:00"),
    ],
  }),
  tacos_tequila_whiskey: restaurant({
    name: "Tacos Tequila Whiskey", cuisine: "dine, restaurant, mexican, tacos, nachos", amenity: "restaurant",
    description: "Originating in Denver, Colorado, Tacos Tequila Whiskey is known for its creative and flavorful tacos made with fresh, locally-sourced ingredients, featuring a variety of taco options, as well as other Mexican-inspired dishes like nachos, quesadillas, and street corn. Enjoy an extensive selection of drinks along with vibrant foods.",
    phone: "+1 (303) 228-0747",
    outlets: [
      o("Gates", "A Gates, Near Gate A18", "airside", "Mo-Su 07:00-22:00"),
    ],
  }),
  tapas_sky_bar: restaurant({
    name: "Tapas Sky Bar", cuisine: "bar, wine, beer, tv, cheese, snacks, dessert, cheesecake, chocolate, cake, cheese plate, charcuterie board, small plates, mac & cheese, chorizo, hummus, chips, bagel, lox, salads, breakfast, breakfast sandwiches, oatmeal, yogurt, food, Wine & Beer, $10 to $20", amenity: "bar",
    description: "Tapas Sky Bar has 16 wine choices, specialty cocktails and 12 Colorado craft beers. A light-fare menu including cheese board, caprese salad, bar snacks and unique offerings are available.",
    phone: "+1 (303) 668-8324",
    outlets: [
      o("Gates", "C Gates, Gate C26", "airside", "Mo-Su 09:00-17:00"),
    ],
  }),
  teatulia_tea_coffee: restaurant({
    name: "Teatulia Tea & Coffee", cuisine: "dine, tea, coffee, snacks", amenity: "cafe",
    description: "Teatulia is proud and excited to offer global travelers truly exceptional tea, coffee and artisan products.",
    website: "teatulia.com", logoUrl: logo("teatulia.com"), phone: "+1 (303) 342-6726",
    outlets: [
      o("Gates", "C Gates, Gate C62", "airside", "Mo-Su 05:30-21:30"),
    ],
  }),
  the_bagel_deli: restaurant({
    name: "The Bagel Deli", cuisine: "bagel", amenity: "cafe",
    description: "A Denver staple since 1967, The Bagel Deli serves New York-style bagels with an extensive selection of spreads, deli meats, and classic toppings. It's a family-owned, no-frills eatery where locals and visitors alike indulge in bagel sandwiches, lox, and smoked fish. Known for its generous portions and hearty meals, The Bagel Deli is perfect for breakfast, brunch, or a quick lunch, offering a nostalgic taste of traditional Jewish deli fare.",
    phone: "+1 (303) 642-6725",
    outlets: [
      o("Gates", "A Gates, Gate A38", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  the_bindery: restaurant({
    name: "The Bindery", cuisine: "dine, restaurant, American", amenity: "restaurant",
    description: "Chef Linda Fox used her world travels to create this upscale restaurant serving New American cuisine with a touch of European influence, bakery, and crafted cocktails, all in one.",
    website: "thebinderydenver.com", logoUrl: logo("thebinderydenver.com"), phone: "+1 (303) 342-6645",
    outlets: [
      o("Gates", "A Gates, Gate A24", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "coffee, tea, espresso, macchiato, latte, cappuccino, smoothies, americano, iced coffee, bottled water, soda, juice, scones, danish, pastries, food, Quick Serve, $10 to $20", amenity: "cafe",
    description: "Born and brewed in Southern California since 1963, The Coffee Bean & Tea Leaf is the oldest and largest privately-held specialty coffee and tea retailer in the U.S. Known for sourcing and providing the finest ingredients and flavors, The Coffee Bean & Tea Leaf has relationships with the best coffee farms and tea estates in the world.",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("Gates", "C Gates, Gate C28", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  the_magic_pan: restaurant({
    name: "The Magic Pan", cuisine: "crepes, bottled water, sweet crepes, savory crepes, ham, chicken, turkey, chocolate, fruit, ice cream, soda, coffee, food, Grab & Go, Quick Serve, Less than $10", amenity: "fast_food",
    description: "The Magic Pan offers delicious and versatile crepes - both sweet and savory - wrapped, rolled or folded around a broad range of delectable fillings from chocolate to chicken, broccoli to bananas, prepared to order. Magic Pan also offers \"Cool Magic\" soft serve ice cream, along with cones and sundaes to pair with a favorite crepe.",
    website: "magicpancrepes.com", logoUrl: logo("magicpancrepes.com"),
    outlets: [
      o("Gates", "C Gates, Gate C28", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  tivoli_tap_house: restaurant({
    name: "Tivoli Tap House", cuisine: "food, Full Bar, Table Service, Wine & Beer", amenity: "bar",
    description: "Denver International Airport has brought one of Colorado's original breweries to our travelers. Tivoli Brewing Company started in 1859 and is one of the only working breweries in the United States to brew beer in an airport. Tivoli offers 6 award winning beers brewed on site and 16 different Colorado selections as well as an extensive wine list and craft cocktails. Our menu includes everything from craft burgers, flatbreads, appetizers, healthy salads, and main courses.",
    website: "tivolibrewingco.com", logoUrl: logo("tivolibrewingco.com"), phone: "+1 (303) 342-6930",
    outlets: [
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal, The Westin, west side", "landside", "Mo-Su 07:00-23:00"),
    ],
  }),
  tocabe: restaurant({
    name: "Tocabe", cuisine: "Native American", amenity: "restaurant",
    description: "Specializing in Native American cuisine, Tocabe brings Indigenous flavors to the Denver dining scene. From bison and wild rice to frybread and corn, the menu celebrates Native ingredients with modern twists. The casual, vibrant atmosphere makes it a unique place to experience contemporary takes on traditional dishes, while honoring Native American culture through an unwavering commitment to community and sustainability.",
    website: "tocabe.com", logoUrl: logo("tocabe.com"), phone: "+1 (303) 642-6725",
    outlets: [
      o("Gates", "A Gates, Gate A38", "airside", "Mo-Su 06:00-22:00"),
    ],
  }),
  uncle: restaurant({
    name: "Uncle", cuisine: "dine, ramen", amenity: "restaurant",
    description: "Uncle is a trendy, award winning ramen restaurant in Denver known for its flavorful bowls and cozy, modern vibe. It's definitely a local favorite!",
    website: "uncleramen.com", logoUrl: logo("uncleramen.com"), phone: "+1 (303) 342-6645",
    outlets: [
      o("Gates", "A Gates, Gate A26", "airside", "Mo-Su 05:00-21:00"),
    ],
  }),
  vending_machines: restaurant({
    name: "Vending Machines", cuisine: "Vending", amenity: "vending_machine",
    outlets: [
      o("Gates", "C Gates, Gate C32", "airside", ""),
      o("Gates", "C Gates, Gate C46", "airside", ""),
      o("Gates A54-A87", "A Gates, Departures", "airside", ""),
      o("Arrivals / HTC CEEA", "Jeppesen Terminal, Garage West", "landside", ""),
      o("Arrivals / HTC CEEA", "Jeppesen Terminal, Garage East", "landside", ""),
      o("Arrivals / HTC CEEA", "Jeppesen Terminal, Garage West", "landside", ""),
      o("Arrivals / HTC CEEA", "Jeppesen Terminal, Garage East", "landside", ""),
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal, Baggage", "landside", ""),
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal, Baggage", "landside", ""),
      o("Baggage Claim / Ground Transportation", "Jeppesen Terminal, Baggage", "landside", ""),
      o("Gates A54-A87", "A Gates", "airside", ""),
    ],
  }),
  villa_pizza: restaurant({
    name: "Villa Pizza", cuisine: "italian, pizza, bottled water, soda, juice, fruit, fruit cup, yogurt, milk, cookie, salads, coffee, pasta, meatballs, spaghetti, mac & cheese, chicken, chicken wings, fried chicken, chicken parmesan, pepperoni, stromboli, stuffed breads, food, Quick Serve, Less than $10", amenity: "fast_food",
    description: "Villa Fresh Italian Kitchen is built on the strict loyalty to authentic old-world recipes that Michele Scotto brought with him from Naples, Italy. From the first pizzeria that opened in 1964 next to the Ed Sullivan Theater on Broadway, to our most recent restaurant, that commitment to quality food and genuine hospitality is still the hallmark of Villa.",
    phone: "+1 (303) 342-0256",
    outlets: [
      o("Gates", "C Gates, Center Core", "airside", "Mo-Su 04:00-21:00"),
    ],
  }),
  voodoo_doughnut: restaurant({
    name: "Voodoo Doughnut", cuisine: "dine, restaurant, doughnut, food", amenity: "restaurant",
    description: "Voodoo Doughnut offers a variety of their specialty baked goods, hot and cold beverages, and other Voodoo merchandise.",
    website: "voodoodoughnut.com", logoUrl: logo("voodoodoughnut.com"), phone: "+1 (303) 342-6611",
    outlets: [
      o("Mezzanine", "B Gates, Mezzanine", "landside", "Mo-Su 05:30-21:30"),
    ],
  }),
  williams_graham: restaurant({
    name: "Williams & Graham", cuisine: "cocktails, bar", amenity: "bar",
    description: "Hidden behind a discreet bookstore facade, Williams & Graham is a renowned speakeasy-style cocktail bar in Denver. Known for its expertly crafted cocktails, intimate setting, and extensive collection of spirits, it offers a sophisticated yet cozy atmosphere. Patrons can enjoy both timeless classics and inventive drinks in an ambiance that evokes the charm of Prohibition-era bars.",
    website: "williamsandgraham.com", logoUrl: logo("williamsandgraham.com"), phone: "+1 (303) 642-6725",
    outlets: [
      o("Gates", "A Gates, Gate A38", "airside", "Mo-Su 07:00-23:00"),
    ],
  }),
  woody_creek_bakery_cafe: restaurant({
    name: "Woody Creek Bakery & Café", cuisine: "sandwiches, coffee, pastries", amenity: "cafe",
    description: "Woody Creek Bakery & Café brings travelers a warm, inviting experience with fresh-baked pastries, gourmet sandwiches, and locally roasted coffee, all in a cozy, welcoming atmosphere that reflects Colorado charm.",
    outlets: [
      o("Gates", "C Gates, Near Gate C46", "airside", "Mo-Su 05:00-21:00"),
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_MAIN, 'Jeppesen Terminal & Concourses A, B, C', mainTerminalVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_MAIN]));

  const totalCreated = r1.created;
  const totalDeleted = r1.deleted;
  const totalVenues = Object.keys(mainTerminalVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
