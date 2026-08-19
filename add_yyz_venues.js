'use strict';
/**
 * Fills in complete data for Toronto Pearson International Airport (YYZ) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-18 from the
 * airport's own site, using Claude in Chrome browser automation per explicit
 * user instruction. No third-party/aggregator source was used for any venue
 * field.
 *
 * SOURCE: https://www.torontopearson.com/en/while-you-are-here/toronto-airport-restaurants
 * — "Eat and drink", the Greater Toronto Airports Authority's own dining
 * directory. The list is client-rendered nine at a time behind a "Load more"
 * button, so it was NOT scraped off the rendered cards. It is served by the
 * airport's own points-of-interest API,
 * POST /api/pointsofinterest/GetPointsOfInterestByTopic, whose parameters the
 * page itself declares in the markup it ships
 * (data-prop-topic-code="EAT", data-prop-data-source-id="{1627256C-…}"). That
 * endpoint was called directly, same-origin, paging through all 9 pages of its
 * own pager, returning TotalItemsCount 80 and 80 records. Each record's own
 * detail page was then fetched same-origin and parsed with DOMParser against
 * its labelled structure (.heading-popout__heading, .location-info__heading and
 * the .location-info__item rows) rather than by regexing free text. All 80
 * detail pages returned, with 80 distinct URLs and no errors.
 *
 * EXTRACTION + VERIFICATION: the 80 records were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter, `|` list delimiter) with every
 * non-ASCII character replaced by a reversible `<U+hex>` escape and every field
 * whitespace-normalised in the browser before checksumming, split into 5 chunks
 * under 7,800 chars on line boundaries, written into a `<pre id="dataDump">`
 * and retrieved via get_page_text. Every chunk verified EXACTLY on first pass
 * against values computed in the browser before retrieval — len/lines/checksum:
 * 7667/20/33180566, 7520/20/32401491, 7387/20/31946409, 7764/19/33500696,
 * 255/1/1012583 — as did the rejoined 80-line dataset at len 30597,
 * checksum 132187513, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 2 buckets, Terminal 1 and Terminal 3, which is exactly
 * the split YYZ's own data uses: every point of interest carries a `Terminal`
 * field whose only two values here are T1 (46 records) and T3 (34), and the
 * airport's own filter above the list reads "Select your airline or destination
 * to see options in your terminal". T1 and T3 are separate buildings, each with
 * its own check-in hall and its own security screening — Pearson publishes
 * separate wait times for T1 and T3 — so both pass the "own check-in AND own
 * security, independently" test. Applying the test WITHIN a terminal produces
 * no further split. YYZ carries a SECOND, orthogonal attribute on every record,
 * `SecurityZoneCode`, with seven values — T1CAN "After security (Canada)" (16),
 * T1INTL "After security (International)" (13), T1USA "After security (USA)"
 * (11), T1BS "Before security" (6), T3CANINTL "After security (CAN/INTL)" (20),
 * T3USA "After security (USA)" (8), T3BS "Before security" (6). Those post-
 * security sectors are screening zones, not terminals: a passenger checks in at
 * the one hall in T1 (or T3) and is then routed to the sector matching the
 * destination, so no sector has a check-in area of its own and each fails the
 * independence test. That is also how YYZ itself models them — as an attribute
 * OF a terminal, not as a peer of one. They are carried here on each outlet as
 * airside/landside plus location detail. Concourse F in T1 and Concourse A in
 * T3 are the US-preclearance piers inside those same buildings and are covered
 * by the same reasoning.
 *
 * SCOPE: all 80 records YYZ files under its own EAT topic are included. One
 * carries a CMS slug beginning "archived-" (Smoke's Poutinerie, T3 before
 * security) but is published in the live list with current hours, so it is kept
 * as YYZ publishes it rather than second-guessed.
 *
 * AIRSIDE / LANDSIDE: from YYZ's own security-zone code — the two "Before
 * security" zones (T1BS, T3BS) → `landside`, the five "After security" zones →
 * `airside`. 68 airside, 12 landside.
 *
 * LEVEL: from the level token in YYZ's own location line, where it publishes
 * one — "Level 1", "Level 2", "Level 3", "Level G", and its own "Departures
 * level" / "Arrivals level" wording kept verbatim. 14 of the 80 outlets carry a
 * level; the other 66 are published with a gate reference and no level, and are
 * left BLANK rather than inferred.
 *
 * LOCATION_NOTES: the rest of YYZ's own location line, verbatim and in its own
 * order, minus the leading "Terminal 1"/"Terminal 3" (which is the bucket) and
 * minus the bare level token where that was promoted to `level`. So
 * "After security (Canada), Near gate D37", "Before security, Level 1 Arrivals,
 * Near Domestic Arrivals", "After security (USA), Near customer service desk,
 * Gate F87". Note the level token is only dropped when the whole segment IS the
 * level, so "Level 1 Arrivals" is kept in full alongside `level` = "Level 1".
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal are merged
 * into one doc with one `outlets[]` entry per unit; same-brand venues in
 * DIFFERENT terminals stay separate docs, per this dataset's standing rule. So
 * Starbucks is two docs — T1 with 7 outlets, T3 with 3 — Tim Hortons is two
 * (T1 5, T3 3), Subway is two (2 and 2), and Cibo Express Gourmet Market (2)
 * and Wahlburgers (2) are single T1 docs. Booster Juice, Heirloom Bakery Cafe
 * and Vinifera each appear once per terminal and therefore stay two docs.
 * Brand matching is case-, accent- and apostrophe-insensitive. Distinctly NAMED
 * venues stay separate per this dataset's page-truth-over-label precedent:
 * "Vino Volo" vs "Vino Volo Wine Bar"; "Boccone Pronto" vs "Boccone Trattoria
 * by Massimo Capra"; "Smoke's Poutinerie" vs "Smoke's Burritorie". 80 records →
 * 62 docs.
 *
 * CUISINE: the verbatim join of YYZ's own subtopic tags for the venue, in the
 * order it publishes them and unfiltered — its own vocabulary is Top chefs,
 * Bars, Breakfast, Budget-friendly, Family, Coffee and tea, Healthy and Special
 * diets, which are exactly the filter chips above its own list. Where a merged
 * doc's outlets carry different tag sets, the union is used in first-seen
 * order.
 *
 * AMENITY: YYZ publishes no service-type tag at all — its subtopics are dining
 * themes, not venue types — so amenity is derived from the venue's own NAME and
 * its own DESCRIPTION, as at MIA. Order: `bar` requires BOTH YYZ's own "Bars"
 * subtopic AND a drinks-led name (Bar, Pub, Brewery, Bottle Shop, Tap) or a
 * description that calls it one ("at this bar", "bar seating", "wine bar",
 * whiskies); then a coffee/bakery name (Starbucks, Tim Hortons, Coffee, Café,
 * Bakery, Tea) → `cafe`; then a quick-service brand or format name → 
 * `fast_food`; otherwise `restaurant`. The double condition on `bar` is what
 * matters: it promotes Apropos ("Cocktails and light meals offered at bar
 * seating"), Beerhive ("Grab a pint … at this bar"), Distillery Bar, Ice Bar,
 * Henderson's Bottle Shop, Mill Street Brewery Pub, Rock Squeeze ("Serving over
 * 20 top international whiskies"), Tap & Pour, Vinifera in T3 ("Wine bar
 * offering over 85 wines"), Vino Volo and Vino Volo Wine Bar — 11 in all — while
 * correctly declining to promote the three other Bars-tagged venues whose own
 * descriptions are food-led: Farmers Market ("Fresh, locally made snacks,
 * sandwiches, salads and treats… with both bar and table seating"), Urban
 * Market ("Take-away sandwiches and salads prepared daily") and Vinifera in T1
 * ("A Mediterranean-inspired menu of small dishes for sharing, sandwiches,
 * salads and baked goods") — note that Vinifera therefore resolves differently
 * in the two terminals because YYZ describes the two units differently, which
 * is the source's own distinction, not an imposed one. It also declines to
 * promote venues YYZ does NOT tag Bars even where the name suggests one:
 * Bar 120 ("Enjoy comfort food … flatbreads, sandwiches, salads and soup"),
 * Fionn MacCool's and Wahlburgers ("Burger restaurant and sports bar"). One
 * further guard: Distillery Bar's description mentions eating "in the
 * Distillery Food Hall", so the food-court test is applied to the NAME only —
 * no venue at YYZ is a food_court. Resulting mix: 31 fast_food, 20 cafe,
 * 18 restaurant, 11 bar.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: blank on every doc. YYZ's
 * only dietary facet is a single undifferentiated "Special diets" tag, which
 * does not say WHICH diet, so no venue is flagged rather than guessed. Its
 * descriptions often do name specific diets ("Vegetarian options", "Gluten-free,
 * halal, kosher and vegan options", "Ontario-certified halal grass-fed meat")
 * and those are preserved verbatim inside `description`, so nothing published
 * is lost — it simply is not promoted to a structured flag it was not tagged as.
 *
 * OPENING HOURS: verbatim from each venue's own hours line, in YYZ's own
 * wording — "Every day from 5:00 am to last flight", "Dependent on daily
 * flights", "Flight dependent", "Saturday to Wednesday from 8:00 am to last
 * flight and Thursdays to Friday from 7:00 am to last flight", "Every day 11:00
 * to 22:00". All 80 outlets carry hours. Where YYZ publishes more than one
 * timing line for a venue they are joined with "; ".
 *
 * OPEN 24/7: set on the 10 outlets whose whole hours string is a standing
 * 24-hour statement ("Open 24 hours", "Open 24 hours daily", "24 hours daily",
 * "Every day, 24 hours"). The match is anchored to the whole string.
 *
 * DESCRIPTION: verbatim from each venue's own detail page, whitespace-
 * normalised. Two records carry none (Mary Brown's Express, Osmow's Shawarma)
 * and are left blank.
 *
 * PHONE: YYZ publishes a phone number for exactly one venue, Mary Brown's
 * Express ("416-776-3100, ext. 4"), as an extra info line on its detail page.
 * That is the only doc with a phone; the rest are blank. (Torteria San Cosme
 * puts a number inside its hours text; that was left where YYZ put it rather
 * than lifted into the phone field.)
 *
 * WEBSITE / LOGO: the bare domain of the outbound link YYZ publishes for the
 * venue, protocol/www/path stripped, with the logo.dev logo derived from it.
 * 42 of the 80 records carry one; the rest are left blank rather than guessed.
 *
 * VERIFIED TOTALS: 80 source dining records → 62 restaurant docs / 80 outlets.
 * Terminal 1: 46 records → 33 docs / 46 outlets. Terminal 3: 34 → 29 / 34.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['yyz', 'toronto', 'toronto-pearson'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_3 = 'terminal_3';
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

// ─── Terminal 1 ───

const terminal1Venues = {
  a_w: restaurant({
    name: "A&W", cuisine: "Family, Budget-friendly", amenity: "fast_food",
    description: "Fast-food burgers, chicken and fries, plus the classic root beer. Try the Teen Burger, Mama Burger or vegetarian Beyond Meat Burger.",
    website: "aw.ca", logoUrl: logo("aw.ca"),
    outlets: [
      o("", "After security (Canada), Near gate D37", "airside", "Open 24 hours daily", true),
    ],
  }),
  apropos: restaurant({
    name: "Apropos", cuisine: "Special diets, Bars", amenity: "bar",
    description: "Cocktails and light meals offered at bar seating along both sides of the concourse. Pair craft beer or local and international wines with small plates and unique sandwiches. Vegetarian and gluten-free options.",
    outlets: [
      o("", "After security (USA), Near gate F62/F65", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  bar_120: restaurant({
    name: "Bar 120", cuisine: "Top chefs", amenity: "restaurant",
    description: "Enjoy comfort food in an open air setting offering flatbreads, sandwiches, salads and soup and at the bar sip on your favourite wine or cocktail while taking in the view.",
    outlets: [
      o("", "After security (Canada), Near gate D20", "airside", "Every day from 12:00 pm to 8:30 pm"),
    ],
  }),
  bento_sushi: restaurant({
    name: "Bento Sushi", cuisine: "Breakfast, Healthy", amenity: "fast_food",
    description: "With Japanese favourites like poke, ramen, donburi, udon, spring rolls, and bento boxes available at Bento Sushi, there’s always something delicious and convenient to eat while you’re in transit! Quality, consistency and great value is at the core of every meal Bento produces.",
    website: "bentosushi.com", logoUrl: logo("bentosushi.com"),
    outlets: [
      o("", "After security (Canada), Near gate D22", "airside", "Every day from 11:00 am to 9:00 pm"),
    ],
  }),
  boccone_pronto: restaurant({
    name: "Boccone Pronto", cuisine: "Top chefs, Special diets", amenity: "restaurant",
    description: "Take out Italian specialties from Chef Massimo Capra. Offering traditional pizza by the slice, caprese salads and paninis to go. Vegetarian options.",
    website: "massimocapra.com", logoUrl: logo("massimocapra.com"),
    outlets: [
      o("", "After security (USA), Near gate F57", "airside", "Every day from 11:00 am to 8:00 pm"),
    ],
  }),
  boccone_trattoria_by_massimo_capra: restaurant({
    name: "Boccone Trattoria by Massimo Capra", cuisine: "Top chefs, Family, Special diets", amenity: "restaurant",
    description: "The menu includes Italian classics, like pizza, pasta and paninis, plus breakfast options and a kid’s menu.",
    website: "massimocapra.com", logoUrl: logo("massimocapra.com"),
    outlets: [
      o("", "After security (Canada), Near gate D41", "airside", "Open every day from 5 am to 10 pm Takeout available during hours of operation"),
    ],
  }),
  booster_juice: restaurant({
    name: "Booster Juice", cuisine: "Healthy, Budget-friendly", amenity: "fast_food",
    description: "Smoothies, fresh-squeezed juice, healthy take-out meals and snacks.",
    website: "boosterjuice.com", logoUrl: logo("boosterjuice.com"),
    outlets: [
      o("", "After security (USA), Near gate F57", "airside", "Open daily from 5:00 am to 9:00 pm"),
    ],
  }),
  built_custom_burgers: restaurant({
    name: "BUILT Custom Burgers", cuisine: "Family, Special diets", amenity: "fast_food",
    description: "Build a burger to suit your tastes. Choose from beef, chicken, turkey or veggie burgers, then add your favourite toppings to a bun or bowl of greens. If you can't decide, BUILT also offers a menu of signature burgers, plus fries, shakes and drinks. Vegan options.",
    outlets: [
      o("", "After security (International), Near Gates E74", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  camden_food_company: restaurant({
    name: "Camden Food Company", cuisine: "Healthy, Family, Special diets", amenity: "fast_food",
    description: "Healthy kid-friendly snacks and meals, including gluten-free, organic and fair-trade options. Many products are sourced within 100 miles of the airport, supporting local farmers.",
    outlets: [
      o("", "After security (Canada), Near gate D31", "airside", "Every day from 5:30 am to 9:00 pm"),
    ],
  }),
  cibo_express_gourmet_market: restaurant({
    name: "Cibo Express Gourmet Market", cuisine: "Special diets", amenity: "fast_food",
    description: "Huge selection of packaged sandwiches, salads, snacks and drinks, ready for travel. Pick something up before your flight. Gluten-free, halal, kosher and vegan options.",
    outlets: [
      o("", "After security (USA), Near gate F61", "airside", "Every day from 5 am to last flight"),
      o("", "After security (Canada), Near Gate D20", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  comfort_zone: restaurant({
    name: "Comfort Zone", cuisine: "Family, Budget-friendly, Coffee and tea", amenity: "fast_food",
    description: "Indulge in a new range of delicious food and beverage options at the Comfort Zone. Grab a bite at Tim Hortons or dig into the famous Jamaican beef patties and enjoy hot breakfast options!",
    outlets: [
      o("Level G", "Before security, Level G Ground transportation", "landside", "Every day, 6:30 am to 7:00 pm"),
    ],
  }),
  farmers_market: restaurant({
    name: "Farmers Market", cuisine: "Bars", amenity: "fast_food",
    description: "Fresh, locally made snacks, sandwiches, salads and treats, ready for travel. Farmers Market is a licensed Toronto airport restaurant with both bar and table seating.",
    outlets: [
      o("", "After security (Canada), Near gate D4", "airside", "Every day from 6:00 am to 9:30 pm"),
    ],
  }),
  fetta: restaurant({
    name: "Fetta", cuisine: "Top chefs, Healthy", amenity: "fast_food",
    description: "Selections include grilled cheese, marinated chicken or shaved beef, served up with Tuscan bean, roasted beet or panzanella salad.",
    outlets: [
      o("", "After security (International), Near gate E73", "airside", "Every day from 4:00 am to last flight"),
    ],
  }),
  heirloom_bakery_cafe: restaurant({
    name: "Heirloom Bakery Cafe", cuisine: "Coffee and tea, Healthy, Special diets", amenity: "cafe",
    description: "Soups, salads, sandwiches and baked goods available. Vegetarian options.",
    outlets: [
      o("", "After security (International), Near gate E75", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  hendersons_bottle_shop: restaurant({
    name: "Henderson's Bottle Shop", cuisine: "Bars", amenity: "bar",
    description: "Located near arrivals, Henderson Brewing @YYZ featuring Rush is a celebration of Canadian culture, music, and craft beer. Proudly serving Henderson x Rush Canadian Golden Ale and specially curated Fly By Night Lager created solely for Toronto Pearson. Also available, a selection of other favourite Henderson Brewery beers, either to savour on-site or purchase to take home. <NL> This unique space boasts a one-of-a kind mini concert museum dedicated to the iconic Canadian rock bank Rush featuring rare memorabilia from the band’s touring and recording career. Don’t miss the exclusive gift shop with Henderson and Rush merch found only at YYZ!",
    outlets: [
      o("Level 1", "Before security, Level 1 Arrivals", "landside", "Daily from 9:00 am to 11:00 pm"),
    ],
  }),
  la_place: restaurant({
    name: "La Place", cuisine: "Healthy, Family, Special diets", amenity: "fast_food",
    description: "This European chain specializes in fresh, healthy food, like made-to-order sandwiches, flatbread pizza, salads, smoothies and seasonal fruit. Gluten-free and vegetarian options.",
    website: "laplace.com", logoUrl: logo("laplace.com"),
    outlets: [
      o("", "After security (International), Near gate E74 and E75", "airside", "Every day from noon to 9:00 pm"),
    ],
  }),
  lee_kitchen_by_susur_lee: restaurant({
    name: "LEE Kitchen by Susur Lee", cuisine: "Top chefs, Breakfast", amenity: "restaurant",
    description: "Specialties include traditional dim sum, “Top Chef” Green Curry Chicken and cheeseburger spring rolls.",
    outlets: [
      o("", "After security (International), Near gate E73/F73", "airside", "Open 5 am to 11 pm daily."),
    ],
  }),
  marathi: restaurant({
    name: "Marathi", cuisine: "Top chefs, Healthy, Special diets, Breakfast", amenity: "restaurant",
    description: "The menu includes samosas, naan paninis, curry bowls and biryani as well as Indian-inspired breakfast dishes.",
    outlets: [
      o("", "After security (International), Near gate E78", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  mill_street_brewery_pub: restaurant({
    name: "Mill Street Brewery Pub", cuisine: "Family, Bars, Breakfast, Special diets", amenity: "bar",
    description: "This Toronto-based craft brewery offers specialty beers and innovative takes on pub-style food. Try the Tankhouse Pale Ale, Organic Lager or the Mill Street Extra Special Bitter, made with hops imported from England. The menu features salads, sandwiches, burgers and pub classics, like fish and chips and steak frites. Vegetarian and vegan options.",
    website: "millstreetbrewery.com", logoUrl: logo("millstreetbrewery.com"),
    outlets: [
      o("", "After security (Canada), Near gate D20", "airside", "Every day from 5:30 am to last flight"),
    ],
  }),
  osmows_shawarma: restaurant({
    name: "Osmow's Shawarma", cuisine: "Budget-friendly, Coffee and tea, Special diets, Family", amenity: "fast_food",
    outlets: [
      o("", "After security (Canada), Near Gate D37", "airside", "Open 24 hours", true),
    ],
  }),
  rock_squeeze: restaurant({
    name: "Rock Squeeze", cuisine: "Bars", amenity: "bar",
    description: "Serving over 20 top international whiskies, including exclusive and rare labels, plus a menu of savoury or sweet light bites.",
    outlets: [
      o("", "After security (International), Near gate E74", "airside", "Every day from 5:45 am to 10:30 pm"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Breakfast, Coffee and tea, Budget-friendly", amenity: "cafe",
    description: "Discover your perfect, personal drink at Starbucks. Choose from an extensive menu of espresso-based drinks, brewed coffee and specialty teas.",
    website: "starbucks.ca", logoUrl: logo("starbucks.ca"),
    outlets: [
      o("", "After security (Canada), Near gate D20", "airside", "Open every day from 5:00 am to 9:00 pm"),
      o("", "After security (Canada), Near gate D42", "airside", "Every day from 5:00 am to 9:00 pm"),
      o("", "After security (International), Near gate E75", "airside", "Open 24 hours", true),
      o("", "After security (USA), Near gate F60", "airside", "Every day from 6:00 am to 6:30 pm"),
      o("", "After security (USA), Near gate F88", "airside", "Every day from 5:00 am to last flight"),
      o("Level 3", "Before security, Level 3 Check In", "landside", "Open every day from 6:00 am to 8:00 pm"),
      o("Level 1", "Before security, Level 1 Arrivals", "landside", "Open 24 hours daily", true),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Breakfast, Healthy, Family, Budget-friendly, Special diets, Coffee and tea", amenity: "fast_food",
    description: "Fast, fresh sandwiches and salads, made to order. Subway offers a variety of budget-friendly meals at the airport.",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("", "After security (International), Near Gate E70", "airside", "24 hours daily", true),
      o("Level 2", "Before security, Level 2 - Mezzanine", "landside", "Every day, 24 hours", true),
    ],
  }),
  thai_express: restaurant({
    name: "Thai Express", cuisine: "Family, Budget-friendly", amenity: "fast_food",
    description: "Fresh, traditional Thai food with new-world flavours. Specialties include Pad Thai, spring rolls, fried rice and red, green or yellow curries.",
    outlets: [
      o("", "After security (Canada), Near Gate D45", "airside", "Every day from 9:00 am to 9:00 pm"),
    ],
  }),
  the_burger_federation: restaurant({
    name: "The Burger Federation", cuisine: "Breakfast, Family, Special diets", amenity: "restaurant",
    description: "Angus beef burgers with unique international flavours. Try burgers inspired by the cuisine of France, Greece, Mexico or Thailand. All-day breakfast includes omelettes, French toast and a range of breakfast burgers. Younger travellers can order from the kids' menu. Vegetarian options.",
    outlets: [
      o("", "After security (USA), Near customer service desk, Gate F87", "airside", "4:30 am to last flight"),
    ],
  }),
  the_dirty_bird_chicken_waffles_express: restaurant({
    name: "The Dirty Bird Chicken & Waffles Express", cuisine: "Family, Breakfast", amenity: "fast_food",
    description: "A true Toronto classic, serving delicious fried chicken, sandwiches and their world famous waffles. A great place to eat no matter the time of day.",
    outlets: [
      o("", "After security (Canada), Near gate D20", "airside", "The Dirty Bird Chicken and Waffles Express open daily from 11:30 am to 8:00 pm (includes the Grab & Go self-serve market)."),
    ],
  }),
  the_hearth_by_lynn_crawford: restaurant({
    name: "The Hearth by Lynn Crawford", cuisine: "Top chefs, Healthy, Breakfast", amenity: "restaurant",
    description: "Fresh, seasonal menu from Toronto chef Lynn Crawford. Try the hearth-fired flatbreads, fresh salads, sandwiches and more.",
    outlets: [
      o("", "After security (USA), Near gate F60", "airside", "Dependent on daily flights"),
    ],
  }),
  tim_hortons: restaurant({
    name: "Tim Hortons", cuisine: "Budget-friendly, Coffee and tea, Family", amenity: "cafe",
    description: "Also called “Timmies”, this popular coffeeshop serves coffee and specialty drinks, plus a variety of baked goods, including bagels, sandwiches, muffins and donuts.",
    website: "timhortons.com", logoUrl: logo("timhortons.com"),
    outlets: [
      o("", "After security (Canada), Near gate D42", "airside", "Every day from 5:00 am to 11:00 pm"),
      o("", "After security (International), Near gate E81", "airside", "Every day from 5:00 am to last flight"),
      o("", "After security (International), Near gate E66", "airside", "Every day from 4:00 am to last flight"),
      o("", "After security (USA), Near gate F66", "airside", "Every day from 5:00 am to 6:00 pm"),
      o("Level 1", "Before security, Level 1 Arrivals", "landside", "Open 24 hours", true),
    ],
  }),
  torteria_san_cosme: restaurant({
    name: "Torteria San Cosme", cuisine: "Breakfast, Family", amenity: "fast_food",
    description: "Authentic Mexico City style puesto (street food stand), serving tortas – sandwiches done a la plancha in buttered soft telera bread stuffed with assorted fillings along with their pickled jalapeños.",
    outlets: [
      o("", "After security (Canada), Near gate D20", "airside", "Grab & go available every day from 5:30 am to 9 pm Contact us at (416) 776-2453"),
    ],
  }),
  twist_by_roger_mooking: restaurant({
    name: "Twist by Roger Mooking", cuisine: "Top chefs, Breakfast", amenity: "restaurant",
    description: "North American comfort food with a global twist. Everything, including breakfast options, is prepared from scratch with the freshest ingredients.",
    website: "twistbyrogermooking.com", logoUrl: logo("twistbyrogermooking.com"),
    outlets: [
      o("", "After security (Canada), Near gate D36", "airside", "Every day from 5:00 am to 9:00 pm"),
    ],
  }),
  upper_crust: restaurant({
    name: "Upper Crust", cuisine: "Healthy, Family, Budget-friendly, Special diets", amenity: "fast_food",
    description: "Pick up a freshly baked baguette sandwich to eat on the go, or relax with a coffee or tea and pastry. Upper Crust offers a variety of salads, sweet treats, fruit and other travel-friendly snacks, including many vegetarian options.",
    outlets: [
      o("", "After security (USA), Near gate F57", "airside", "Every day from 11:45 am to 5:00 pm"),
    ],
  }),
  vinifera: restaurant({
    name: "Vinifera", cuisine: "Bars, Breakfast, Top chefs", amenity: "restaurant",
    description: "A Mediterranean-inspired menu of small dishes for sharing, sandwiches, salads and baked goods.",
    outlets: [
      o("", "After security (International), Near gate E76", "airside", "Every day from 5:00 am to last flight (breakfast served until 11:00 am)"),
    ],
  }),
  wahlburgers: restaurant({
    name: "Wahlburgers", cuisine: "Top chefs, Family, Budget-friendly, Special diets", amenity: "restaurant",
    description: "Burger restaurant and sports bar offering single, double and triple burgers with Wahl signature sauce and your choice of toppings.",
    website: "wahlburgers.ca", logoUrl: logo("wahlburgers.ca"),
    outlets: [
      o("", "After security (International), Near gate E67", "airside", "Every day from 6:30 am to 6:00 pm"),
      o("", "After security (USA), Near gate F67", "airside", "Flight dependent"),
    ],
  }),
};

// ─── Terminal 3 ───

const terminal3Venues = {
  acer: restaurant({
    name: "Acer", cuisine: "Healthy, Breakfast, Budget-friendly, Special diets", amenity: "restaurant",
    description: "Modern Japanese menu offering fresh, healthy dishes like sushi, dumplings, noodles and curry.",
    outlets: [
      o("Departures level", "After security (CAN/INTL), Near gate C36", "airside", "Every day from 5:00 am to last flight (breakfast served until 11:00 am)"),
    ],
  }),
  archeo_pizzeria: restaurant({
    name: "Archeo Pizzeria", cuisine: "Healthy", amenity: "fast_food",
    description: "Warm Italian-inspired flatbreads perfect for a quick meal before your flight. Try the caprese (tomatoes, buffalo mozzarella and basil), the capricosa (rosemary ham, fontina cheese, black olives and arugula) or other Mediterranean favourites.",
    outlets: [
      o("", "After security (USA), Near gate A10", "airside", "Every day from 6:00 am to last flight"),
    ],
  }),
  beerhive: restaurant({
    name: "Beerhive", cuisine: "Bars, Breakfast", amenity: "bar",
    description: "Grab a pint of local or international craft beer at this bar in Terminal 3 that offers a selection of 13 draft beers. Pair your drink with something from the menu, which offers a contemporary take on pub snacks, sandwiches, salads and pizzas.",
    outlets: [
      o("", "After security (CAN/INTL), Near gate B41", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  booster_juice: restaurant({
    name: "Booster Juice", cuisine: "Healthy, Budget-friendly", amenity: "fast_food",
    description: "Pick up something healthy at one of four Booster Juice locations at Pearson Airport.",
    website: "boosterjuice.com", logoUrl: logo("boosterjuice.com"),
    outlets: [
      o("", "After security (CAN/INTL), Near gate B3", "airside", "Every day from 5:00 am to 10:00 pm"),
    ],
  }),
  caplanskys_deli: restaurant({
    name: "Caplansky's Deli", cuisine: "Family, Special diets, Breakfast", amenity: "restaurant",
    description: "Jewish soul food from Toronto chef Zane Caplansky. Try a classic bagel with lox or famous smoked meat sandwich. Caplansky's also offers Kidz on the Fly meals – complete meals with something healthy and a treat. Vegetarian options.",
    website: "caplanskys.com", logoUrl: logo("caplanskys.com"),
    outlets: [
      o("", "After security (CAN/INTL), Near gate B39", "airside", "Open every day from 4:00 am to 9:00 pm"),
    ],
  }),
  cluny_grille: restaurant({
    name: "Cluny Grille", cuisine: "Coffee and tea", amenity: "restaurant",
    description: "Modern, casual and fun French-inspired meals and pastries. Try the chef's variations on poutine or Toulouse sausage.",
    outlets: [
      o("", "After security (USA), Near gate A10", "airside", "Open every day from 11:00 am to last flight"),
    ],
  }),
  corso_pizza_and_pasta: restaurant({
    name: "Corso Pizza and Pasta", cuisine: "Healthy, Family, Budget-friendly, Special diets", amenity: "restaurant",
    description: "A lively trattoria offering fresh-made Neapolitan-style pizza, pasta salads and antipasti. Try a Margherita, Marinara or Dolce Lucano pizza, fresh from the wood-burning oven, or mushroom angnolotti or casarecci pasta. Vegetarian options.",
    outlets: [
      o("", "After security (CAN/INTL), Near gate B29", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  distillery_bar: restaurant({
    name: "Distillery Bar", cuisine: "Bars", amenity: "bar",
    description: "Try a pint of Toronto's own Mill Street beer at this bar, or order from the menu of pub-inspired burgers, sandwiches and light fare to eat in the Distillery Food Hall or take out.",
    outlets: [
      o("", "After security (USA), Near gate A10", "airside", "Saturday to Wednesday from 8:00 am to last flight and Thursdays to Friday from 7:00 am to last flight"),
    ],
  }),
  el_catrin_taqueria: restaurant({
    name: "El Catrin Taqueria", cuisine: "Family, Special diets", amenity: "restaurant",
    description: "Authentic traditional and modern Mexican tacos and tortas from a menu inspired by one of Mexico City’s top chefs. Try the tacos el pastor (pork), pollo loco (adobe chicken) or vegetariano. Vegetarian options available.",
    website: "elcatrin.ca", logoUrl: logo("elcatrin.ca"),
    outlets: [
      o("", "After security (USA), Near gate A10", "airside", "Every day from 11:30 am to 6:30 pm"),
    ],
  }),
  fionn_maccools: restaurant({
    name: "Fionn MacCool's", cuisine: "Family, Special diets", amenity: "restaurant",
    description: "Traditional Irish pub with daily featured pint and menu of favourites, like fish and chips, shepherd's pie, burgers and wings. Vegetarian options.",
    website: "fionnmaccools.com", logoUrl: logo("fionnmaccools.com"),
    outlets: [
      o("", "After security (CAN/INTL), Near gate B24", "airside", "Every day from 5:30 am to 9:00 pm."),
    ],
  }),
  freshii: restaurant({
    name: "Freshii", cuisine: "Healthy, Budget-friendly, Special diets", amenity: "fast_food",
    description: "Nutritious food on the go. Pick up a salad or rice bowl, or choose from the full menu of healthy breakfast foods.",
    website: "freshii.com", logoUrl: logo("freshii.com"),
    outlets: [
      o("Departures level", "Before security", "landside", "Every day from 6 am to 7 pm"),
    ],
  }),
  heirloom_bakery_cafe: restaurant({
    name: "Heirloom Bakery Cafe", cuisine: "Coffee and tea, Special diets, Healthy", amenity: "cafe",
    description: "Light entrées and bakery items, made to order from local ingredients. Vegetarian options.",
    outlets: [
      o("", "After security (CAN/INTL), Near gate C31", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  ice_bar: restaurant({
    name: "Ice Bar", cuisine: "Bars", amenity: "bar",
    description: "Casual spot to enjoy a pint of draft beer and light Middle Eastern food.",
    outlets: [
      o("", "After security (CAN/INTL), Near gate C36", "airside", "Every day 11:00 to 22:00"),
    ],
  }),
  mary_browns_express: restaurant({
    name: "Mary Brown's Express", cuisine: "Family, Budget-friendly, Coffee and tea", amenity: "fast_food",
    website: "marybrowns.com", logoUrl: logo("marybrowns.com"),
    phone: "416-776-3100, ext. 4",
    outlets: [
      o("", "After security (CAN/INTL), Near Gate B41", "airside", "9 am to 11 pm daily"),
    ],
  }),
  nobel_burger: restaurant({
    name: "Nobel Burger", cuisine: "Breakfast", amenity: "restaurant",
    description: "Breakfast and gourmet burgers in a gate-side lounge. Build your own burger or choose from specialties.",
    outlets: [
      o("", "After security (USA), Near gate A13", "airside", "Every day from 5:00 am to last flight"),
    ],
  }),
  paramount_fine_foods: restaurant({
    name: "Paramount Fine Foods", cuisine: "Healthy, Breakfast, Special diets, Family", amenity: "fast_food",
    description: "At Paramount Fine Foods, fresh and healthy menu items feature Ontario-certified halal grass-fed meat, free of sodium nitrate. Specialties include shawarma, falafel, tabbouleh and baklava. Vegetarian options also available.",
    website: "paramountfinefoods.com", logoUrl: logo("paramountfinefoods.com"),
    outlets: [
      o("", "After security (CAN/INTL), Near gate C36", "airside", "Every day from 5:00 am to 11:00 pm"),
    ],
  }),
  smashburger: restaurant({
    name: "Smashburger", cuisine: "Family, Special diets", amenity: "fast_food",
    description: "Fast, casual burger restaurant known for its smashed, seasoned and seared burgers served on butter-toasted buns. Smashburger offers your choice of beef, grilled or crispy chicken, turkey and black bean burger patties for every sandwich. Add a milkshake or Smashfries, seasoned with garlic, rosemary, and olive oil. Vegetarian options.",
    website: "smashburger.com", logoUrl: logo("smashburger.com"),
    outlets: [
      o("", "After security (CAN/INTL), Near gate B26", "airside", "Every day from 5:30 am to 9:00 pm"),
    ],
  }),
  smokes_burritorie: restaurant({
    name: "Smoke's Burritorie", cuisine: "Family, Budget-friendly, Special diets", amenity: "fast_food",
    description: "Hearty burritos stuffed with pork, carne asada chorizo or conchinita chicken, and rice, beans, sour cream, cheese, and other fresh ingredients. Vegetarian options.",
    outlets: [
      o("", "After security (CAN/INTL), Near gate B26", "airside", "Every day from 12:00 pm to 8:00 pm"),
    ],
  }),
  smokes_poutinerie: restaurant({
    name: "Smoke's Poutinerie", cuisine: "Budget-friendly", amenity: "fast_food",
    description: "Creative variations on poutine, made with fresh, hand-cut fries, squeaky cheese curds and Smoke’s signature gravy, with loads of toppings to choose from.",
    website: "smokespoutinerie.com", logoUrl: logo("smokespoutinerie.com"),
    outlets: [
      o("Arrivals level", "Before security", "landside", "Every day from 1:30 pm to 9:30 pm"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Breakfast, Coffee and tea, Budget-friendly", amenity: "cafe",
    description: "Discover your perfect, personal drink at Starbucks. Choose from an extensive menu of espresso-based drinks, brewed coffee and specialty teas.",
    website: "starbucks.ca", logoUrl: logo("starbucks.ca"),
    outlets: [
      o("", "After security (CAN/INTL), Near gate B39", "airside", "Every day from 4:00 am to 9:00 pm"),
      o("", "After security (USA), Near gate A14", "airside", "Every day from 5:00 am to last flight"),
      o("Departures level", "Before security", "landside", "Every day from 4:00 am to 8:00 pm"),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Healthy, Family, Budget-friendly, Breakfast", amenity: "fast_food",
    description: "Choose from sandwiches, salads, flatbreads and soups. Order a meal to eat at the airport or take with you on the plane.",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("", "After security (CAN/INTL), Near gate B22", "airside", "5:30 am to 10:30 pm"),
      o("Level 1", "Before security, Level 1 Arrivals, Near Domestic Arrivals", "landside", "Every day, 24 hours", true),
    ],
  }),
  tap_pour: restaurant({
    name: "Tap & Pour", cuisine: "Bars, Breakfast", amenity: "bar",
    description: "Casual restaurant serving draft beer from Toronto's award-wining Mill Street brewery and pub-style food. Breakfast is also served daily.",
    outlets: [
      o("", "After security (CAN/INTL), Near gate B3", "airside", "Open daily from 6:00 am - 10:00 pm or last flight"),
    ],
  }),
  tim_hortons: restaurant({
    name: "Tim Hortons", cuisine: "Budget-friendly, Coffee and tea, Family", amenity: "cafe",
    description: "Pick up a freshly brewed coffee, steeped tea and a variety of baked goods, including donuts and muffins, at this popular Canadian coffeeshop.",
    website: "timhortons.com", logoUrl: logo("timhortons.com"),
    outlets: [
      o("Departures level", "After security (CAN/INTL), Near gate B26", "airside", "Every day, 24 hours", true),
      o("", "After security (CAN/INTL), Near gate B3", "airside", "Every day from 6:00 am to 12:00 pm"),
      o("Arrivals level", "Before security", "landside", "Every day from 4:30 am to 8:00 pm"),
    ],
  }),
  urban_crave: restaurant({
    name: "Urban Crave", cuisine: "Family, Budget-friendly", amenity: "fast_food",
    description: "Diverse and creative street food from around the globe. Choose from Korean, Indian and South American dishes, or the Canadian favourite, poutine. In the morning, Urban Crave also offers a menu of hearty breakfast dishes.",
    outlets: [
      o("", "After security (USA), Near gate A12", "airside", "Flight dependent"),
    ],
  }),
  urban_market: restaurant({
    name: "Urban Market", cuisine: "Bars, Coffee and tea", amenity: "fast_food",
    description: "Take-away sandwiches and salads prepared daily, plus packaged snacks and drinks. Urban Market also offers Starbucks coffee or tea, draft beer and Ontario VQA wines.",
    outlets: [
      o("", "After security (USA), Near gate A9", "airside", "Open based on flight schedule"),
    ],
  }),
  vinifera: restaurant({
    name: "Vinifera", cuisine: "Bars, Breakfast, Top chefs", amenity: "bar",
    description: "Wine bar offering over 85 wines and 20 beers, including local and international selections, plus a menu of small plates.",
    outlets: [
      o("", "After security (CAN/INTL), Near gate C32", "airside", "Every day from 5:00 am to last flight (breakfast served until 11:00 am)"),
    ],
  }),
  vino_volo: restaurant({
    name: "Vino Volo", cuisine: "Bars", amenity: "bar",
    description: "Vino Volo wine bar offers a full variety of wines to be enjoyed by flight or by the glass. Enjoy small bites while sipping on local and international wines. Be sure to ask about buying your favourite bottle of wine to bring with you! Makes a perfect gift.",
    outlets: [
      o("", "After security (CAN/INTL), Near Gate B3", "airside", "Open daily: 11:00 am to 7:00 pm"),
    ],
  }),
  vino_volo_wine_bar: restaurant({
    name: "Vino Volo Wine Bar", cuisine: "Bars, Breakfast, Coffee and tea", amenity: "bar",
    description: "Vino Volo Wine Bar offers a full dine-in menu along with more than 30 wines to enjoy by the flight or glass. Verdi Market and Coffee bar features specialty coffee and a wide pastry selection along with a grab and go menu of locally sourced options made fresh daily. Be sure to ask about buying your favourite bottle of wine to bring with you!",
    outlets: [
      o("", "After security (CAN/INTL), Near Gate B22", "airside", "Vino Volo Wine Bar is open daily from 7:00 am to last flight, and the Verdi market is open daily from 5:00 am to 1:00 pm."),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "Budget-friendly", amenity: "fast_food",
    description: "Stop by for all of your Wendy’s favourites including Baconators, chili and Frostys.",
    website: "wendys.com", logoUrl: logo("wendys.com"),
    outlets: [
      o("Departures level", "Before security", "landside", "Open 24 hours", true),
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
  const r2 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', terminal3Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_3]));

  const totalCreated = r1.created + r2.created;
  const totalDeleted = r1.deleted + r2.deleted;
  const totalVenues = Object.keys(terminal1Venues).length
    + Object.keys(terminal3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
