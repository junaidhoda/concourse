'use strict';
/**
 * Fills in complete data for Boston Logan International Airport (BOS) —
 * restaurants/cafés/bars/food halls in Firestore. Researched 2026-08-17 from
 * the airport's own official site, massport.com, using Claude in Chrome
 * browser automation per explicit user instruction. WebFetch cannot read this
 * site at all: massport.com sits behind Imperva/Incapsula and returns only an
 * Incapsula incident URL to a non-browser fetch, so every byte of venue data
 * in this file came through a real, rendered browser session.
 *
 * SOURCE: https://www.massport.com/logan-airport/dining-shopping/restaurants
 * The listing page is a Drupal page whose venue cards are NOT in the served
 * HTML (confirmed: a same-origin fetch of the page, and of ?page=0..9,
 * returns a real 73 KB document containing zero `.card--wrapper` elements and
 * no venue names). The cards are rendered client-side from a single
 * structured JSON manifest the page itself requests:
 *   https://www.massport.com/api/v1/search/manifest/terminal-assets
 * — a 399-record array covering every terminal asset at Logan (types:
 * Dining, Shopping, Amenities, Airlines, Rental Car Company). This file uses
 * the 95 records with `type === "Dining"`. Each record carries: id, title,
 * terminal, terminals[], terminal_zone, location (Pre-/Post-Security), hours,
 * phone, website_url, tags[], map_url, order_ahead_url. Nothing here is
 * scraped from rendered HTML and nothing comes from a third-party source.
 *
 * EXTRACTION + VERIFICATION: the 95 Dining records were serialised in-page to
 * a printable-ASCII format (`@@` field delimiter, `##` list delimiter), with
 * every non-ASCII character replaced by a reversible `<U+hex>` escape, split
 * into 4 chunks under 7,000 chars on line boundaries, written into a
 * `<pre id="dataDump">` and retrieved via get_page_text. Each chunk was
 * checksum-verified on disk against values computed in the browser BEFORE
 * retrieval, using checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7, plus
 * length and line count. Chunk results (len / lines / checksum):
 * 6925/27/28854979, 6813/32/28345828, 6750/29/28244362, 1566/7/6405457; and
 * the rejoined 95-line dataset verified at len 22057, checksum 91929167 —
 * all exact matches. The `<U+hex>` escapes and the source's own HTML entities
 * (&nbsp;, &amp;) were decoded in the Python reconciliation step.
 *
 * TERMINAL STRUCTURE — 4 buckets (A, B, C, E), decided as follows.
 * Massport's own security page lists exactly seven checkpoints:
 * Checkpoint 1 and 2 (all A gates), Checkpoint 3 (Gates B1-22), Checkpoint 4
 * (Gates B23-40), Checkpoint 5 (all C gates), Checkpoints 6 and 7 (all E
 * gates). Terminals A, B, C and E each have their own check-in halls and
 * their own security screening, so each passes this dataset's "own check-in
 * AND own security" test and gets its own bucket. Applying the same test
 * WITHIN a terminal: Terminal B is the one candidate for an internal split,
 * because its two checkpoints (3 and 4) serve disjoint gate ranges from two
 * ticketing piers. It is NOT split here, for two independent reasons.
 * (1) Massport itself states, on its own Connecting Flights page, that
 * "Terminals B, C, and E are connected post-security" and that "Terminal A is
 * not connected to the other terminals post-security" — i.e. Massport treats
 * Terminal B as a single post-security entity, not as two isolated secure
 * zones. (2) Massport's own dining dataset contains NO B1/B2 attribution
 * whatsoever: the manifest's `terminal` and `terminals[]` fields carry the
 * bare letter "B" for all 29 Terminal B venues, `terminal_zone` reads only
 * "Terminal B Departures" / "Terminal B Arrivals", and the listing page's own
 * terminal facet UI offers exactly four peer filters — A, B, C, E — with no
 * B1/B2 tabs. Splitting Terminal B would therefore require inventing a pier
 * assignment for all 29 venues, which this dataset does not do. Massport's
 * official interactive map (maps.massport.com, a Pointr deployment) was also
 * checked as a possible source of per-pier location detail and is not usable:
 * its API (massport-v8-api.pointr.cloud) returns HTTP 401 to the page's own
 * anonymous requests and the map never leaves its "Loading" state.
 *
 * AIRSIDE / LANDSIDE: taken directly from the source's own `location` field,
 * which is a strict two-value enumeration across all 95 records —
 * "Post-Security" (85) → `airside`, "Pre-Security" (10) → `landside`. No
 * text-based inference was needed anywhere.
 *
 * LEVEL: taken only where Massport itself publishes one. The `terminal_zone`
 * values are "Terminal A/B/C Departures", "Terminal A/B/C Arrivals",
 * "Terminal E Level 3 Departures" and "Terminal E Level 1 Arrivals" — so only
 * Terminal E's zones name a floor, and only those venues get a `level` ("3"
 * or "1"). Terminal A/B/C venues have `level` left blank rather than guessed.
 *
 * LOCATION_NOTES: the source's `terminal_zone` verbatim, plus a gate where
 * Massport itself publishes one. Two places in this dataset carry gate-level
 * detail: (a) six Legal Sea Foods records put it in the hours string
 * ("Located by Gate B8:", "Located by Gate B26:", "Located at Gate E10:",
 * "Located at Gate E14:"), and (b) the three Mount Comfort Coffee records put
 * it in the venue name itself ("Mount Comfort Coffee - E11" / "- E9" /
 * "- E4"). Both were lifted into location_notes as ", Gate <n>". The hours
 * strings are still stored verbatim, including their "Located by Gate ...:"
 * prefix, rather than being edited.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal bucket
 * are merged into one doc with one `outlets[]` entry per physical unit;
 * same-brand venues in DIFFERENT terminals stay separate docs, per this
 * dataset's standing rule. Brand matching is case- and apostrophe-insensitive
 * (the source mixes straight and curly apostrophes for the same brand — e.g.
 * "Dunkin' by Hudson" and "Dunkin’ by Hudson" in Terminal C, both merged).
 * Merges performed: Terminal A — Dunkin' (3 units), Evolvending (3);
 * Terminal B — Dunkin' (3), Starbucks (4), Kelly's Roast Beef (2), Legal Sea
 * Foods (2), Evolvending (2); Terminal C — Dunkin' (3), Dunkin' by Hudson
 * (3), Starbucks (2), Evolvending (2); Terminal E — Legal Sea Foods (2),
 * Mount Comfort Coffee (3), Evolvending (2). 95 source records → 73 docs.
 * Distinctly NAMED venues sharing a parent brand were kept separate per this
 * dataset's page-truth-over-label precedent: "Dunkin'" vs "Dunkin' by Hudson"
 * (Terminal C — a separately operated unit), "Peet's Coffee" vs "Peet's at
 * Night" (Terminal E — a distinct evening concept with its own hours and its
 * own tag set), "GACHI" (E) vs "Gachi Sushi & Noodles" (C, different
 * terminals anyway). One documented rendering alias was applied: Massport
 * publishes the same operator's units as both "Evolvending Vending Machine"
 * and "Evolvending Vending Machines"; these are a singular/plural rendering
 * of one brand and are folded together, with the plural pinned as the
 * canonical display name so the brand does not appear under two different
 * names across terminals.
 *
 * CUISINE: the verbatim join of the source's own `tags[]` for the venue —
 * the site's taxonomy is trusted rather than curated. The only tags removed
 * are the four that are not cuisine/genre at all and that merely restate a
 * field already stored elsewhere on the doc: "Post-Security" and
 * "Pre-Security" (= the `airside` field), "24-Hour" (= `open_24_7`) and
 * "Order Ahead" (= the record's order_ahead_url). Everything else the site
 * tags — including service-style tags like "Waiter Service", "Quick Serve",
 * "Grab and Go", daypart tags like "Breakfast"/"Lunch"/"Dinner", "Local",
 * "Alcohol" and the dietary tags — is kept in the order the site lists it.
 * Where outlets were merged, the union of their tag sets is used, first-seen
 * order preserved.
 *
 * AMENITY: inferred from the source's own tags and the venue's own name, in
 * this order — (1) a "Vending" tag → `vending_machine` (Evolvending,
 * Farmer's Fridge, Mount Comfort Coffee: all are unattended units, which the
 * site tags explicitly); (2) a food-hall name → `food_court` (Boston Public
 * Market only — corroborated by its own hours string, which lists seven
 * separate concepts trading under it: Mother Juice, Market Bagels, La Cocina
 * Local, Red's Best, The Market Bar, Bon Me and Beantown Pastrami Co.);
 * (3) a bar name → `bar`; (4) a coffee name → `cafe`; (5) a "Waiter Service"
 * tag → `restaurant`; (6) Coffee/Espresso + Bakery without Dinner → `cafe`;
 * (7) "Quick Serve" or "Grab and Go" → `fast_food`; (8) otherwise
 * `restaurant`. Per this dataset's standing rule, `bar` was NOT assigned from
 * a tag: the site's "Alcohol" tag is applied to 36 venues including plain
 * cafés and family restaurants, so `bar` was assigned only where the venue's
 * OWN name says so — Boston Bruins Bar, Harpoon Tap Room, Sam Adams
 * Brewhouse, Cisco Brewers, Boston Harbor Distillery and Mija Cantina &
 * Tequila Bar. Temazcal Cantina was deliberately NOT classified as a bar
 * despite "Cantina" in its name and an Alcohol tag: the site also tags it
 * Waiter Service, Breakfast, Lunch, Dinner and Mexican, i.e. a full-service
 * restaurant.
 *
 * HALAL / VEGETARIAN / VEGAN / GLUTEN-FREE / KOSHER: set to 'yes' ONLY where
 * Massport's own tag list says so — "Halal" (1 venue: Dave's Hot Chicken,
 * Terminal B), "Vegetarian" (15), "Vegan" (3), "Gluten Free" (14). Massport
 * publishes no Kosher tag at all for any dining venue, so `kosher` is blank
 * on every doc in this file rather than guessed. Where outlets were merged,
 * a flag is set if the site tags ANY of the merged units with it.
 *
 * WEBSITE / LOGO: `website` is the bare domain of the source's own
 * `website_url` (protocol, `www.` and any path stripped), left blank for the
 * four venues Massport publishes with no URL (Green Express ×2, N.e. MKT,
 * Vineyard Grille). For five venues Massport publishes the CONCESSIONAIRE's
 * domain rather than the venue's own brand domain — paradieslagardere.com,
 * foodtravelexperts.com, tastesonthefly.com, hudsongroup.com,
 * delawarenorth.com — and for one it publishes a site-builder host
 * (travelmugcafe.square.site). Those domains are still recorded verbatim as
 * `website`, because that is what the official source publishes, but no
 * `logo_url` is attached to them, since logo.dev would return the operator's
 * or the host's mark rather than the venue's.
 *
 * PHONE: verbatim from the source, including its own inconsistencies —
 * Massport publishes several venues under a shared concessionaire switchboard
 * (617-283-9306 recurs across five unrelated venues) and one record carries a
 * stray hyphen, "(978) -317-6611" (Dunkin', Terminal A Arrivals). These are
 * presented exactly as published rather than corrected by guesswork. Where
 * outlets were merged and publish different numbers, the first in the
 * source's own order is used at doc level.
 *
 * OPENING HOURS / 24-7: `opening_hours` is the source's `hours` string
 * verbatim (HTML entities decoded, whitespace collapsed). `open_24_7` is set
 * when Massport's own "24-Hour" tag is present OR its hours string says 24
 * hours — both signals are needed because one record (Dunkin', Terminal E
 * Level 1 Arrivals) publishes "24 Hours" as its hours without carrying the
 * 24-Hour tag.
 *
 * DESCRIPTION: blank on every doc. Massport publishes no descriptive copy for
 * dining venues anywhere — the manifest has no description field, and the
 * per-venue `url` values it does carry (e.g. "/alta-strada") are internal
 * search anchors that return HTTP 404 as pages (verified). Rather than invent
 * copy, every `description` in this file is left empty.
 *
 * VERIFIED TOTALS: 95 source Dining records → 73 restaurant docs / 95 outlets.
 * Terminal A: 20 records → 16 docs / 20 outlets. Terminal B: 29 → 21 / 29.
 * Terminal C: 25 → 19 / 25. Terminal E: 21 → 17 / 21.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['bos', 'boston-logan', 'boston'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_A = 'terminal_a';
const TERMINAL_B = 'terminal_b';
const TERMINAL_C = 'terminal_c';
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

// ─── Terminal A (Massport zone 'Terminal A Departures' / 'Terminal A Arrivals') ───

const terminalAVenues = {
  alta_strada: restaurant({
    name: "Alta Strada", cuisine: "Local, Lunch, Dinner, Waiter Service, Grab and Go, Alcohol, Italian, Breakfast, Pizza", amenity: "restaurant",
    website: "altastradarestaurant.com", logoUrl: logo("altastradarestaurant.com"), phone: "617-283-9306",
    outlets: [
      o("", "Terminal A Departures", "airside", "5a - 30 mins prior to last departure"),
    ],
  }),
  b_good: restaurant({
    name: "B.GOOD", cuisine: "Local, Breakfast, Lunch, Dinner, Quick Serve, Alcohol, Vegetarian, Gluten Free", amenity: "fast_food",
    vegetarian: true, glutenFree: true,
    website: "bgood.com", logoUrl: logo("bgood.com"), phone: "617-283-9306",
    outlets: [
      o("", "Terminal A Departures", "airside", "60 mins prior to first departure - 30 minutes prior to last departure"),
    ],
  }),
  berkshire_farms_market: restaurant({
    name: "Berkshire Farms Market", cuisine: "Local, Breakfast, Lunch, Quick Serve, Alcohol, Vegan, Vegetarian, Pizza", amenity: "fast_food",
    vegetarian: true, vegan: true,
    website: "paradieslagardere.com", phone: "617-604-6400",
    outlets: [
      o("", "Terminal A Departures", "airside", "60 mins prior to first departure - 30 minutes prior to last departure"),
    ],
  }),
  boston_bruins_bar: restaurant({
    name: "Boston Bruins Bar", cuisine: "Breakfast, Dinner, Waiter Service, Alcohol, American, Local", amenity: "bar",
    website: "delawarenorth.com", phone: "617-283-9306",
    outlets: [
      o("", "Terminal A Departures", "airside", "5a - 30 mins prior to last departure"),
    ],
  }),
  buffalo_wild_wings_go: restaurant({
    name: "Buffalo Wild Wings GO", cuisine: "Breakfast, Lunch, Dinner, Quick Serve, American", amenity: "fast_food",
    website: "buffalowildwings.com", logoUrl: logo("buffalowildwings.com"), phone: "(857) 344-0877",
    outlets: [
      o("", "Terminal A Departures", "airside", "5AM - 30 Minutes Prior to Last Departure"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "Breakfast, Lunch, Dinner, Quick Serve, American", amenity: "fast_food",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"), phone: "(339) 970-1588",
    outlets: [
      o("", "Terminal A Departures", "airside", "Mon-Sat: 4a - 30 mins prior to last departure"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "Breakfast, Bakery, Coffee, Espresso, Quick Serve, Local, Lunch, Grab and Go", amenity: "cafe",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"), phone: "(978) 317-6611",
    outlets: [
      o("", "Terminal A Departures", "airside", "60 mins prior to first departure - 30 minutes prior to last departure"),
      o("", "Terminal A Departures", "airside", "60 mins prior to last departure - 30 mins prior to last departure"),
      o("", "Terminal A Arrivals", "landside", "Open 24 Hours", true),
    ],
  }),
  evolvending_vending_machines: restaurant({
    name: "Evolvending Vending Machines", cuisine: "Grab and Go, Vending", amenity: "vending_machine",
    website: "evolvending.com", logoUrl: logo("evolvending.com"),
    outlets: [
      o("", "Terminal A Departures", "airside", "24 Hour Vending", true),
      o("", "Terminal A Departures", "landside", "24 Hour Vending", true),
      o("", "Terminal A Arrivals", "landside", "24 Hour Vending", true),
    ],
  }),
  fox_flight: restaurant({
    name: "Fox & Flight", cuisine: "Local, Lunch, Dinner, Waiter Service, Alcohol, Italian, Breakfast", amenity: "restaurant",
    website: "paradieslagardere.com", phone: "(857) 598-8794",
    outlets: [
      o("", "Terminal A Departures", "airside", "6a - 30 minutes prior to last departure"),
    ],
  }),
  half_moon_empanadas: restaurant({
    name: "Half Moon Empanadas", cuisine: "Breakfast, Lunch, Dinner, Quick Serve, Vegetarian", amenity: "fast_food",
    vegetarian: true,
    website: "halfmoonempanadas.com", logoUrl: logo("halfmoonempanadas.com"), phone: "(786) 888-2292",
    outlets: [
      o("", "Terminal A Departures", "airside", "5:00am to 30 min prior to last departure"),
    ],
  }),
  harpoon_tap_room: restaurant({
    name: "Harpoon Tap Room", cuisine: "Breakfast, Lunch, Dinner, Waiter Service, Alcohol", amenity: "bar",
    website: "harpoonbrewery.com", logoUrl: logo("harpoonbrewery.com"), phone: "(617) 820-8089",
    outlets: [
      o("", "Terminal A Departures", "airside", "8a - 30 minutes prior to last departure!"),
    ],
  }),
  jimmy_johns: restaurant({
    name: "Jimmy John's", cuisine: "Lunch, Dinner, Quick Serve, Breakfast", amenity: "fast_food",
    website: "jimmyjohns.com", logoUrl: logo("jimmyjohns.com"), phone: "(857) 353-5054",
    outlets: [
      o("", "Terminal A Departures", "airside", "5a – 30 minutes prior to last departure"),
    ],
  }),
  legal_sea_foods: restaurant({
    name: "Legal Sea Foods", cuisine: "Lunch, Dinner, Waiter Service, Seafood, Alcohol, Breakfast, Local, Kids", amenity: "restaurant",
    website: "legalseafoods.com", logoUrl: logo("legalseafoods.com"), phone: "(617) 568-1888",
    outlets: [
      o("", "Terminal A Departures", "airside", "5a - 30 min prior to last departure"),
    ],
  }),
  rogers_fish_co: restaurant({
    name: "Roger’s Fish Co.", cuisine: "Local, Lunch, Dinner, Quick Serve, Alcohol, American, Seafood", amenity: "fast_food",
    website: "rogersfishco.com", logoUrl: logo("rogersfishco.com"), phone: "(866) 764-3726",
    outlets: [
      o("", "Terminal A Departures", "airside", "7am to 30min prior to last flight"),
    ],
  }),
  sbarro: restaurant({
    name: "Sbarro", cuisine: "Lunch, Dinner, Quick Serve, Italian, Breakfast, Pizza", amenity: "fast_food",
    website: "sbarro.com", logoUrl: logo("sbarro.com"), phone: "(617) 418-7534",
    outlets: [
      o("", "Terminal A Departures", "airside", "5a - 30 minutes prior to last departure"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Local, Breakfast, Lunch, Grab and Go, Coffee, Espresso, Bakery", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "(857) 389-6053",
    outlets: [
      o("", "Terminal A Departures", "airside", "60 mins prior to first departure - 30 minutes prior to last departure"),
    ],
  }),
};

// ─── Terminal B (Massport zone 'Terminal B Departures' / 'Terminal B Arrivals') ───

const terminalBVenues = {
  b_good: restaurant({
    name: "B.GOOD", cuisine: "Local, Lunch, Dinner, Quick Serve, Grab and Go, Alcohol, American, Vegetarian, Gluten Free", amenity: "fast_food",
    vegetarian: true, glutenFree: true,
    website: "bgood.com", logoUrl: logo("bgood.com"), phone: "617-283-9306",
    outlets: [
      o("", "Terminal B Departures", "airside", "4:30a - 30 min prior to last Departure"),
    ],
  }),
  berkshire_farm_to_flight: restaurant({
    name: "Berkshire Farm to Flight", cuisine: "Grab and Go, Gluten Free, American, Bakery, Quick Serve, Local, Breakfast, Pizza", amenity: "fast_food",
    glutenFree: true,
    website: "tastesonthefly.com", phone: "(617) 874-3377",
    outlets: [
      o("", "Terminal B Departures", "airside", "4:30a- 30 min prior to last departure"),
    ],
  }),
  cava: restaurant({
    name: "CAVA", cuisine: "Lunch, Dinner, Quick Serve, Gluten Free, Vegan, Vegetarian", amenity: "fast_food",
    vegetarian: true, vegan: true, glutenFree: true,
    website: "paradieslagardere.com", phone: "(617) 826-2602",
    outlets: [
      o("", "Terminal B Departures", "airside", "6a - 30 mins prior to last departure"),
    ],
  }),
  cisco_brewers: restaurant({
    name: "Cisco Brewers", cuisine: "Local, Lunch, Dinner, Waiter Service, Alcohol, American, Breakfast, Pizza", amenity: "bar",
    website: "ciscobrewers.com", logoUrl: logo("ciscobrewers.com"), phone: "(773) 620-3749",
    outlets: [
      o("", "Terminal B Departures", "airside", "8a - 30 minutes prior to last departure"),
    ],
  }),
  daves_hot_chicken: restaurant({
    name: "Dave’s Hot Chicken", cuisine: "Breakfast, Lunch, Dinner, Quick Serve, Vegetarian, Halal, American", amenity: "fast_food",
    halal: true, vegetarian: true,
    website: "daveshotchicken.com", logoUrl: logo("daveshotchicken.com"), phone: "(857) 491-4353",
    outlets: [
      o("", "Terminal B Departures", "airside", "7AM - 30 Minutes Prior to Last Departure"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "Coffee, Local, Breakfast, Quick Serve, Bakery, Lunch, Espresso, Grab and Go", amenity: "cafe",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"), phone: "(978) 317-6611",
    outlets: [
      o("", "Terminal B Departures", "airside", "4:30a - 30 minutes prior to last departure"),
      o("", "Terminal B Departures", "airside", "60 mins prior to first departure - 30 mins prior to last departure"),
      o("", "Terminal B Departures", "landside", "Open 24 hours", true),
    ],
  }),
  evolvending_vending_machines: restaurant({
    name: "Evolvending Vending Machines", cuisine: "Grab and Go, Vending", amenity: "vending_machine",
    website: "evolvending.com", logoUrl: logo("evolvending.com"),
    outlets: [
      o("", "Terminal B Departures", "landside", "24 Hour Vending", true),
      o("", "Terminal B Arrivals", "landside", "24 Hour Vending", true),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "Grab and Go, Vending", amenity: "vending_machine",
    website: "farmersfridge.com", logoUrl: logo("farmersfridge.com"), phone: "(312) 229-0099",
    outlets: [
      o("", "Terminal B Departures", "airside", "24 Hours", true),
    ],
  }),
  kellys_roast_beef: restaurant({
    name: "Kelly's Roast Beef", cuisine: "Local, Lunch, Dinner, Quick Serve, Seafood, Breakfast, Grab and Go, Alcohol", amenity: "fast_food",
    website: "kellysroastbeef.com", logoUrl: logo("kellysroastbeef.com"), phone: "(617) 416-7862",
    outlets: [
      o("", "Terminal B Departures", "airside", "6a - 30 mins prior to last departure"),
      o("", "Terminal B Departures", "airside", "5a - 30 mins prior to last departure"),
    ],
  }),
  legal_sea_foods: restaurant({
    name: "Legal Sea Foods", cuisine: "Local, Breakfast, Lunch, Dinner, Alcohol, Seafood, Waiter Service, Kids, Gluten Free", amenity: "restaurant",
    glutenFree: true,
    website: "legalseafoods.com", logoUrl: logo("legalseafoods.com"), phone: "617-568-2811",
    outlets: [
      o("", "Terminal B Departures, Gate B8", "airside", "Located by Gate B8: 5a - 30 min prior to last departure"),
      o("", "Terminal B Departures, Gate B26", "airside", "Located by Gate B26: 5a - 30 mins prior to last departure"),
    ],
  }),
  lucca: restaurant({
    name: "Lucca", cuisine: "Local, Dinner, Alcohol, Italian, Breakfast, Lunch, Waiter Service, Pizza", amenity: "restaurant",
    website: "luccaboston.com", logoUrl: logo("luccaboston.com"), phone: "(857) 256-2143",
    outlets: [
      o("", "Terminal B Departures", "airside", "5a - 30 minutes prior to last departure"),
    ],
  }),
  n_e_mkt: restaurant({
    name: "N.e. MKT", cuisine: "Local, Breakfast, Lunch, Quick Serve, Grab and Go, Gluten Free, Vegetarian, Coffee, Bakery, Snacks", amenity: "cafe",
    vegetarian: true, glutenFree: true,
    phone: "(617) 418-5187",
    outlets: [
      o("", "Terminal B Departures", "airside", "4a - 30 min prior to last departure"),
    ],
  }),
  not_your_average_joes: restaurant({
    name: "Not Your Average Joe's", cuisine: "Local, Breakfast, Lunch, Dinner, Waiter Service, Alcohol, American, Pizza", amenity: "restaurant",
    website: "notyouraveragejoes.com", logoUrl: logo("notyouraveragejoes.com"), phone: "617-418-5187",
    outlets: [
      o("", "Terminal B Departures", "airside", "5a - 30 minutes prior to last departure"),
    ],
  }),
  peets_coffee_tea: restaurant({
    name: "Peet's Coffee & Tea", cuisine: "Coffee, Breakfast, Espresso, Quick Serve, Lunch, Grab and Go", amenity: "cafe",
    website: "peets.com", logoUrl: logo("peets.com"), phone: "(617) 874-8508",
    outlets: [
      o("", "Terminal B Departures", "airside", "60 minutes prior to first departure – 30 minutes prior to last departure."),
    ],
  }),
  potbelly_sandwich_shop: restaurant({
    name: "Potbelly Sandwich Shop", cuisine: "Breakfast, Lunch, Dinner, Quick Serve", amenity: "fast_food",
    website: "potbelly.com", logoUrl: logo("potbelly.com"), phone: "(617) 874-4188",
    outlets: [
      o("", "Terminal B Departures", "airside", "60 minutes prior to first departure - 30 minutes prior to last departure"),
    ],
  }),
  sam_adams_brewhouse: restaurant({
    name: "Sam Adams Brewhouse", cuisine: "Local, Lunch, Dinner, Waiter Service, Alcohol, Espresso, American, Seafood, Breakfast, Pizza", amenity: "bar",
    website: "samueladams.com", logoUrl: logo("samueladams.com"), phone: "(773) 620-3749",
    outlets: [
      o("", "Terminal B Departures", "airside", "8a - 30 mins prior to last departure"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Local, Breakfast, Lunch, Grab and Go, Coffee, Espresso, Bakery", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "(617) 833-8253",
    outlets: [
      o("", "Terminal B Departures", "landside", "4:30a - 7p"),
      o("", "Terminal B Departures", "airside", "60 mins prior to first departure - 30 minutes prior to last departure"),
      o("", "Terminal B Departures", "airside", "60 minutes prior to first departure – 30 minutes prior to last departure."),
      o("", "Terminal B Departures", "airside", "60 mins prior to first departure - 30 mins prior to last departure"),
    ],
  }),
  stephanies: restaurant({
    name: "Stephanie's", cuisine: "Lunch, Dinner, Waiter Service, Alcohol, American, Local, Breakfast, Gluten Free", amenity: "restaurant",
    glutenFree: true,
    website: "paradieslagardere.com", phone: "(857) 767-2568",
    outlets: [
      o("", "Terminal B Departures", "airside", "60 mins prior to first departure - 30 mins prior to last departure"),
    ],
  }),
  temazcal_cantina: restaurant({
    name: "Temazcal Cantina", cuisine: "Local, Breakfast, Lunch, Dinner, Waiter Service, Alcohol, Vegetarian, Mexican", amenity: "restaurant",
    vegetarian: true,
    website: "temazcalcantina.com", logoUrl: logo("temazcalcantina.com"), phone: "(781) 808-8354",
    outlets: [
      o("", "Terminal B Departures", "airside", "10:30a - 30 mins prior to last departure"),
    ],
  }),
  tico: restaurant({
    name: "TICO", cuisine: "Local, Lunch, Dinner, Quick Serve, Grab and Go, Alcohol, Breakfast", amenity: "fast_food",
    website: "ticoboston.com", logoUrl: logo("ticoboston.com"), phone: "(617) 283-9306",
    outlets: [
      o("", "Terminal B Departures", "airside", "60 mins prior to first departure - 30 minutes prior to last departure"),
    ],
  }),
  wpizza_by_wolfgang_puck: restaurant({
    name: "WPizza by Wolfgang Puck", cuisine: "Dinner, Quick Serve, Grab and Go, Alcohol, Lunch, Breakfast, Pizza", amenity: "fast_food",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"), phone: "617-283-9306",
    outlets: [
      o("", "Terminal B Departures", "airside", "60 mins prior to first departure - 30 mins prior to last departure"),
    ],
  }),
};

// ─── Terminal C (Massport zone 'Terminal C Departures' / 'Terminal C Arrivals') ───

const terminalCVenues = {
  boston_public_market: restaurant({
    name: "Boston Public Market", cuisine: "Local, Breakfast, Lunch, Dinner, Quick Serve, Alcohol, Coffee, Seafood, Vegetarian, Asian", amenity: "food_court",
    vegetarian: true,
    website: "bostonpublicmarket.org", logoUrl: logo("bostonpublicmarket.org"), phone: "(617) 849-2659",
    outlets: [
      o("", "Terminal C Departures", "airside", "Mother Juice/Market Bagels/La Cocina Local 4a - 30 mins prior//Red’s Best/The Market Bar 8a – 30 mins prior//Bon Me: 9:30a - 30 mins prior //Beantown Pastrami Co. – 11a – 30 mins prior/"),
    ],
  }),
  camden_food_co: restaurant({
    name: "Camden food co.", cuisine: "Breakfast, Quick Serve, Grab and Go, Gluten Free, Coffee, Espresso, Bakery, Vegetarian", amenity: "cafe",
    vegetarian: true, glutenFree: true,
    website: "foodtravelexperts.com", phone: "(617) 567-1301",
    outlets: [
      o("", "Terminal C Departures", "airside", "60 min prior to first departure - 30 min prior to last departure"),
    ],
  }),
  davios_northern_italian_steakhouse: restaurant({
    name: "Davio's Northern Italian Steakhouse", cuisine: "Local, Breakfast, Lunch, Dinner, Waiter Service, Alcohol, Gluten Free, Italian, Steakhouse, Seafood, Pizza", amenity: "restaurant",
    glutenFree: true,
    website: "paradieslagardere.com", phone: "617-981-4810",
    outlets: [
      o("", "Terminal C Departures", "airside", "4:30a - 30 mins prior to last departure"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "Local, Breakfast, Lunch, Grab and Go, Coffee, Espresso, Bakery, Quick Serve, Vegetarian, American", amenity: "cafe",
    vegetarian: true,
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"), phone: "(978) 317-6611",
    outlets: [
      o("", "Terminal C Departures", "airside", "6a - 30 mins prior to last departure"),
      o("", "Terminal C Departures", "airside", "5a - 30 mins prior to last departure"),
      o("", "Terminal C Arrivals", "landside", "24 Hours", true),
    ],
  }),
  dunkin_by_hudson: restaurant({
    name: "Dunkin' by Hudson", cuisine: "Local, Breakfast, Lunch, Quick Serve, Grab and Go, Coffee, Espresso, Bakery, Snacks", amenity: "cafe",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"), phone: "(857) 256-4760",
    outlets: [
      o("", "Terminal C Departures", "airside", "4a - 30 mins prior to last departure"),
      o("", "Terminal C Departures", "airside", "4a - 30 mins prior to last departure"),
      o("", "Terminal C Departures", "airside", "4:30a - 30 mins prior to last departure"),
    ],
  }),
  evolvending_vending_machines: restaurant({
    name: "Evolvending Vending Machines", cuisine: "Grab and Go, Vending", amenity: "vending_machine",
    website: "evolvending.com", logoUrl: logo("evolvending.com"),
    outlets: [
      o("", "Terminal C Departures", "airside", "24 Hour Vending", true),
      o("", "Terminal C Departures", "landside", "24 Hour Vending", true),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "Grab and Go, Vending", amenity: "vending_machine",
    website: "farmersfridge.com", logoUrl: logo("farmersfridge.com"), phone: "(312) 229-0099",
    outlets: [
      o("", "Terminal C Departures", "airside", "24 Hours", true),
    ],
  }),
  gachi_sushi_noodles: restaurant({
    name: "Gachi Sushi & Noodles", cuisine: "Breakfast, Lunch, Dinner, Grab and Go, Alcohol, Asian, Seafood", amenity: "fast_food",
    website: "gachisushi.com", logoUrl: logo("gachisushi.com"), phone: "(857) 256-2912",
    outlets: [
      o("", "Terminal C Departures", "airside", "5:00am-30 minutes prior to last departure"),
    ],
  }),
  green_express: restaurant({
    name: "Green Express", cuisine: "Grab and Go, Coffee", amenity: "fast_food",
    phone: "(213) 364-0577",
    outlets: [
      o("", "Terminal C Departures", "airside", "4a - 30 mins prior to last departure"),
    ],
  }),
  legal_sea_foods: restaurant({
    name: "Legal Sea Foods", cuisine: "Waiter Service, Alcohol, American, Seafood, Local, Kids, Breakfast, Vegetarian, Coffee, Gluten Free", amenity: "restaurant",
    vegetarian: true, glutenFree: true,
    website: "legalseafoods.com", logoUrl: logo("legalseafoods.com"), phone: "(617) 568-2800",
    outlets: [
      o("", "Terminal C Departures", "airside", "5a - 30 minutes prior to last departure"),
    ],
  }),
  mija_cantina_tequila_bar: restaurant({
    name: "Mija Cantina & Tequila Bar", cuisine: "Local, Lunch, Dinner, Waiter Service, Alcohol, Vegetarian", amenity: "bar",
    vegetarian: true,
    website: "mijaboston.com", logoUrl: logo("mijaboston.com"), phone: "617-283-9306",
    outlets: [
      o("", "Terminal C Departures", "airside", "5a - 30 minutes prior"),
    ],
  }),
  mike_pattys: restaurant({
    name: "Mike & Patty's", cuisine: "Breakfast, Lunch, Dinner, Quick Serve, Grab and Go, Alcohol", amenity: "fast_food",
    website: "mikeandpattys.com", logoUrl: logo("mikeandpattys.com"), phone: "(617) 418-5022",
    outlets: [
      o("", "Terminal C Departures", "airside", "5a - 30 mins prior to last departure"),
    ],
  }),
  potbelly_sandwich_shop: restaurant({
    name: "Potbelly Sandwich Shop", cuisine: "Breakfast, Lunch, Quick Serve", amenity: "fast_food",
    website: "potbelly.com", logoUrl: logo("potbelly.com"), phone: "617-874-4047",
    outlets: [
      o("", "Terminal C Departures", "airside", "4:45a - 30 mins prior to last departure"),
    ],
  }),
  santarpios: restaurant({
    name: "Santarpio's", cuisine: "Local, Breakfast, Lunch, Dinner, Waiter Service, Grab and Go, Alcohol, Pizza", amenity: "restaurant",
    website: "santapiospizza.com", logoUrl: logo("santapiospizza.com"), phone: "(617) 849-2659",
    outlets: [
      o("", "Terminal C Departures", "airside", "6a - 30 minutes prior to last departure"),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "Breakfast, Lunch, Dinner, Waiter Service, Quick Serve, Alcohol, Vegetarian, American", amenity: "restaurant",
    vegetarian: true,
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"), phone: "(857) 413-7493",
    outlets: [
      o("", "Terminal C Departures", "airside", "4:30a - 30 Minutes Prior to Last Departure"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Breakfast, Grab and Go, Coffee, Espresso, Bakery, Local, Lunch", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"), phone: "(617) 849-2659",
    outlets: [
      o("", "Terminal C Departures", "airside", "4a - 9p"),
      o("", "Terminal C Departures", "airside", "4a - 10p"),
    ],
  }),
  travel_mug_cafe: restaurant({
    name: "Travel Mug Café", cuisine: "Local, Coffee", amenity: "cafe",
    website: "travelmugcafe.square.site", phone: "(786) 569-3286",
    outlets: [
      o("", "Terminal C Departures", "airside", "Mon - Fri: 6a - 2p"),
    ],
  }),
  vineyard_grille: restaurant({
    name: "Vineyard Grille", cuisine: "Local, Breakfast, Lunch, Dinner, Waiter Service, Alcohol", amenity: "restaurant",
    phone: "(617) 567-7500",
    outlets: [
      o("", "Terminal C Departures", "airside", "1p - 9p"),
    ],
  }),
  wahlburgers: restaurant({
    name: "Wahlburgers", cuisine: "Local, Kids, Breakfast, Lunch, Dinner, Waiter Service, Grab and Go, Alcohol, American, Vegetarian, Coffee", amenity: "restaurant",
    vegetarian: true,
    website: "wahlburgers.com", logoUrl: logo("wahlburgers.com"), phone: "(617) 755-6144",
    outlets: [
      o("", "Terminal C Departures", "airside", "5a - 30 mins prior"),
    ],
  }),
};

// ─── Terminal E (Massport zone 'Terminal E Level 3 Departures' / 'Terminal E Level 1 Arrivals') ───

const terminalEVenues = {
  boston_harbor_distillery: restaurant({
    name: "Boston Harbor Distillery", cuisine: "Local, Lunch, Dinner, Waiter Service, Alcohol, American, Breakfast", amenity: "bar",
    website: "bostonharbordistillery.com", logoUrl: logo("bostonharbordistillery.com"), phone: "(781) 808-8354",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "1p - 30 mins prior to last departure"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "Breakfast, Lunch, Dinner, Quick Serve, Grab and Go, American", amenity: "fast_food",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"), phone: "(339) 970-1588",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "Mon - Sat: 6:00am - 30 minutes prior to last departure"),
    ],
  }),
  dunkin: restaurant({
    name: "Dunkin'", cuisine: "Local, Breakfast, Lunch, Grab and Go, Coffee, Espresso, Bakery", amenity: "cafe",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"), phone: "(617) 541-1911",
    outlets: [
      o("1", "Terminal E Level 1 Arrivals", "landside", "24 Hours", true),
    ],
  }),
  evolvending_vending_machines: restaurant({
    name: "Evolvending Vending Machines", cuisine: "Grab and Go, Vending", amenity: "vending_machine",
    website: "evolvending.com", logoUrl: logo("evolvending.com"),
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "24 Hour Vending", true),
      o("3", "Terminal E Level 3 Departures", "airside", "24 Hour Vending", true),
    ],
  }),
  farmers_fridge: restaurant({
    name: "Farmer's Fridge", cuisine: "Grab and Go, Vending", amenity: "vending_machine",
    website: "farmersfridge.com", logoUrl: logo("farmersfridge.com"), phone: "(312) 229-0099",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "24 Hours", true),
    ],
  }),
  gachi: restaurant({
    name: "GACHI", cuisine: "Breakfast, Lunch, Dinner, Grab and Go, Alcohol, Asian, Seafood", amenity: "fast_food",
    website: "gachisushi.com", logoUrl: logo("gachisushi.com"), phone: "(443) 535-2499",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "6:00am-30 minutes prior to last departure"),
    ],
  }),
  george_howell_coffee: restaurant({
    name: "George Howell Coffee", cuisine: "Breakfast, Lunch, Coffee, Local", amenity: "cafe",
    website: "georgehowellcoffee.com", logoUrl: logo("georgehowellcoffee.com"), phone: "(781) 771-7736",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "5a - 30 mins prior to last departure"),
    ],
  }),
  green_express: restaurant({
    name: "Green Express", cuisine: "Grab and Go", amenity: "fast_food",
    phone: "(213) 364-0577",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "9a - 30 mins prior to last departure"),
    ],
  }),
  legal_sea_foods: restaurant({
    name: "Legal Sea Foods", cuisine: "Local, Lunch, Dinner, Seafood, Waiter Service, Alcohol, Breakfast, Gluten Free, Kids, American", amenity: "restaurant",
    glutenFree: true,
    website: "legalseafoods.com", logoUrl: logo("legalseafoods.com"), phone: "(617) 475-8785",
    outlets: [
      o("3", "Terminal E Level 3 Departures, Gate E10", "airside", "Located at Gate E10: 5a – 30 mins prior to last departure"),
      o("3", "Terminal E Level 3 Departures, Gate E14", "airside", "Located at Gate E14: 5a - 30 mins prior to last departure"),
    ],
  }),
  monicas_mercato: restaurant({
    name: "Monica's Mercato", cuisine: "Local, Lunch, Dinner, Waiter Service, Quick Serve, Grab and Go, Alcohol, Italian, Breakfast, Pizza", amenity: "restaurant",
    website: "monicasboston.com", logoUrl: logo("monicasboston.com"), phone: "617-283-9306",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "Monday to Friday: 6:30a - 30 mins prior to last departure //Sat & Sun: 8:30a - 30 mins prior to last departure"),
    ],
  }),
  mount_comfort_coffee: restaurant({
    name: "Mount Comfort Coffee", cuisine: "Grab and Go, Coffee, Espresso, Vending", amenity: "vending_machine",
    website: "mtcomfortcoffee.com", logoUrl: logo("mtcomfortcoffee.com"),
    outlets: [
      o("3", "Terminal E Level 3 Departures, Gate E11", "airside", "24 Hours", true),
      o("3", "Terminal E Level 3 Departures, Gate E4", "airside", "24 Hours", true),
      o("3", "Terminal E Level 3 Departures, Gate E9", "airside", "24 Hours", true),
    ],
  }),
  peets_at_night: restaurant({
    name: "Peet's at Night", cuisine: "Lunch, Dinner, Quick Serve, Alcohol, Coffee, American", amenity: "cafe",
    website: "peets.com", logoUrl: logo("peets.com"), phone: "(781) 808-8354",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "3p - 30 mins prior to last departure"),
    ],
  }),
  peets_coffee: restaurant({
    name: "Peet's Coffee", cuisine: "Breakfast, Lunch, Quick Serve, Coffee, Espresso, American", amenity: "cafe",
    website: "peets.com", logoUrl: logo("peets.com"), phone: "(781) 808-8354",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "5a - 30 mins prior to last departure"),
    ],
  }),
  sals_pizza: restaurant({
    name: "Sal's Pizza", cuisine: "Local, Lunch, Dinner, Quick Serve, Italian, Breakfast, Pizza", amenity: "fast_food",
    website: "sals.com", logoUrl: logo("sals.com"), phone: "(781) 808-8354",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "7a - 30 minutes prior to last departure"),
    ],
  }),
  stephanies: restaurant({
    name: "Stephanie's", cuisine: "Local, Lunch, Dinner, Waiter Service, Gluten Free, Breakfast", amenity: "restaurant",
    glutenFree: true,
    website: "paradieslagardere.com", phone: "617-874-3380",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "6a - 30 mins prior to last departure"),
    ],
  }),
  wahlburgers: restaurant({
    name: "Wahlburgers", cuisine: "Local, Kids, Breakfast, Lunch, Dinner, Grab and Go, Vegan, Coffee, American", amenity: "fast_food",
    vegan: true,
    website: "wahlburgers.com", logoUrl: logo("wahlburgers.com"), phone: "(703) 554-4174",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "5a - 12a"),
    ],
  }),
  wow_bao: restaurant({
    name: "Wow Bao", cuisine: "Lunch, Dinner, Quick Serve, Asian", amenity: "fast_food",
    website: "wowbao.com", logoUrl: logo("wowbao.com"), phone: "(740) 856-8057",
    outlets: [
      o("3", "Terminal E Level 3 Departures", "airside", "6a - 30 mins prior to last departure"),
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
  const rE = await processTerminal(AIRPORT, TERMINAL_E, 'Terminal E', terminalEVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_A, TERMINAL_B, TERMINAL_C, TERMINAL_E]));

  const totalCreated = rA.created + rB.created + rC.created + rE.created;
  const totalDeleted = rA.deleted + rB.deleted + rC.deleted + rE.deleted;
  const totalVenues = Object.keys(terminalAVenues).length + Object.keys(terminalBVenues).length
    + Object.keys(terminalCVenues).length + Object.keys(terminalEVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
