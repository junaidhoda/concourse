'use strict';
/**
 * Fills in complete data for Orlando International Airport (MCO) —
 * restaurants/cafés/bars/kiosks/vending in Firestore. Researched 2026-08-18
 * from the airport's own site, using Claude in Chrome browser automation per
 * explicit user instruction. No third-party/aggregator source was used for any
 * venue field.
 *
 * SOURCE: https://flymco.com/shops-restaurants-services/?scope=dining — the
 * "Shops, Restaurants & Services" directory on MCO's own site, with the
 * airport's own "Dine" tab selected. (orlandoairports.net presents a
 * certificate/privacy interstitial, which was NOT bypassed; www.orlandoairports.net
 * redirects to flymco.com, which is the live GOAA site.) The page is a Next.js
 * app whose venue list is client-rendered — the server HTML contains no venue
 * markup and the RSC flight payload carries none either — so the list was NOT
 * scraped from rendered HTML. It is backed by the airport authority's own
 * content API, https://api.goaa.aero/content/meridian_placemark (plus
 * .../meridian_map and .../meridian_category), which the page fetches once at
 * mount and then paginates in memory. That in-memory dataset was read directly
 * out of the page's own React context — 2,378 placemarks, 32 map locations and
 * 67 categories — which is the same object the cards and the per-venue detail
 * pages render from, rather than re-reading text off the cards.
 *
 * WHICH RECORDS ARE "DINING": reproduced from the site's own scope logic in
 * its bundle, which assigns each placemark to exactly ONE of Dining (category
 * 7007), Shop (9004) or Amenity (5788174995423232) — the FIRST of those three
 * that appears in the record's own categoryIds — and then filters on it. That
 * yields 82 dining records. It is deliberately not the same as "has category
 * 7007" (84 records): "Gatlin Trade" and "The Neighborhood Market & Goods"
 * carry 7007 but list Shop first, so MCO files them under Shop, and this file
 * follows MCO. Nor is it "custom1 === 'Dining'" (also 82, but a different set).
 * The 82 were verified name-by-name against all six pages of MCO's own
 * rendered Dine list (15+15+15+15+15+7 = 82) — every published name matched,
 * with no extras and nothing missing.
 *
 * EXTRACTION + VERIFICATION: the 82 records were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter) with every non-ASCII character
 * replaced by a reversible `<U+hex>` escape and every field whitespace-
 * normalised in the browser before checksumming, split into 7 chunks under
 * 7,800 chars on line boundaries, written into a `<pre id="dataDump">` and
 * retrieved via get_page_text. Chunk len/lines/checksum: 7668/18/31346057,
 * 6777/8/28512637, 7474/11/31165441, 7632/15/31519789, 7684/12/32044583,
 * 7426/14/30777069, 1440/4/5728318 — chunk 7 failed on first retrieval (a
 * 42-character tail was lost) and was corrected and re-verified; all others
 * passed first time. The rejoined 82-line dataset verifies at len 46107,
 * lines 82, checksum 191010626, using
 * checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 2 buckets: "Terminals A & B" and "Terminal C". This is
 * exactly how MCO's own placemark store groups its terminal maps: every dining
 * map belongs to groupName "Terminals - A & B" or "Terminal - C", and those
 * are the two values its directory prints on every card. It is also what the
 * "own check-in AND own security, independently" test gives. Terminal C is a
 * separate building opened in 2022 with its own ticketing hall, its own
 * checkpoint and its own gates C230–C254 — a bucket. Terminals A and B are the
 * two sides of the single North Terminal building: they share Level 3, and
 * their security checkpoints are not paired to them but to the airsides (the
 * West checkpoint feeds Airsides 1 and 3, the East checkpoint feeds Airsides 2
 * and 4), so a passenger checking in on the A side may well clear security on
 * the B side depending on the gate. A and B therefore fail the independence
 * test and fold together, which is precisely why MCO's own data models them as
 * one group. Applying the test WITHIN that group produces no further split:
 * the four airside satellites (Gates 1-29, 30-59, 70-99, 100-129) have neither
 * check-in nor their own landside checkpoints and are reachable only through
 * the North Terminal — and MCO's own directory does not offer them as
 * top-level filter values, it offers them as gate badges inside "Terminals -
 * A & B". No shared/duplicated zone exists, so no venue is dual-listed.
 *
 * ONE RECORD OUTSIDE THE TERMINAL GROUPS: MCO pins a second "Dunkin Donuts &
 * Baskin-Robbins" on its airport-area map, whose groupName is "Outside The
 * Airport". Its own terminal field reads "Terminal C" and it is tagged
 * PreSecurity, so it is filed under Terminal C rather than dropped. It is a
 * genuinely different record from the North Terminal Dunkin (different hours,
 * different map, different id), and MCO's own Dine list prints both.
 *
 * AIRSIDE / LANDSIDE: from MCO's own security-area categories, which are what
 * its own "Security Area" filter and its detail-page "Post Security" /
 * "Pre Security" line are driven by — PostSecurity → `airside`, PreSecurity →
 * `landside`. 53 airside, 29 landside. Cross-checked against the separate
 * free-text `custom4` field MCO also carries: the two agree on all 82 records
 * (the one record where custom4 is empty is the "Outside The Airport" Dunkin,
 * which the category correctly resolves to landside).
 *
 * LEVEL: from the level label MCO puts on the map the venue is pinned to,
 * where that label is a floor — L1/L2/L3/L4/L6 → "Level 1"…"Level 6". The four
 * airside-satellite maps are labelled A1–A4, which are airside identifiers and
 * not floors, so `level` is left BLANK for venues on those maps rather than
 * inventing one. 40 outlets carry a level, 42 do not.
 *
 * LOCATION_NOTES: built only from what MCO itself publishes about the venue —
 * its own terminal field ("Terminal A" / "Terminal B" / "Terminal C"), its own
 * gate-range badge rendered the way its card renders it ("Gates 100-129"), the
 * location suffix MCO puts in the venue's own name ("Gate 72", "Food Court",
 * "Terminal C Palm Court"), and, where there is no gate badge, the hall
 * descriptor from the map name ("Departing / Shops / Dining", "Hyatt /
 * McCoy's", "Bag Claim/Passenger Pickup", "Rental Cars / Transportation").
 * Redundant fragments are dropped, so "Asian Chao - Gates 100-129" on the
 * Gates 100-129 map with the 100-129 badge yields "Terminal A, Gates 100-129"
 * and not the same string three times. Where MCO's own two statements differ
 * they are BOTH kept, because both are its own: "Terminal C, Gates C230-C254,
 * Gates C230-C245" (badge vs name), "Terminal B, Gates 70-99, Gates 70-79".
 *
 * NAME vs LOCATION: MCO names most placemarks "<brand> - <where it is>". The
 * doc `name` is the brand; the suffix is treated as location detail and moved
 * into location_notes, so the app shows "CIBO Express" with three outlets
 * rather than three docs called "CIBO Express - Gate 72/80/92".
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME bucket are merged
 * into one doc with one `outlets[]` entry per unit; same-brand venues in
 * DIFFERENT buckets stay separate docs, per this dataset's standing rule.
 * Brand matching is case- and apostrophe-insensitive, which is what folds
 * MCO's own inconsistent rendering (straight vs curly apostrophes) and lets
 * "Starbucks - Gates 1-29", "- Gates 70-99", "- Gates 100-129", "- Terminal A
 * - Level 3" and "– Terminal A – Level 2 Baggage Claim" become one six-outlet
 * Starbucks doc in Terminals A & B, with a separate two-outlet Starbucks doc
 * in Terminal C. Distinctly NAMED venues stay separate per this dataset's
 * page-truth-over-label precedent: "Gastrohub" vs "Gastrohub To Go"; "On the
 * Border" vs "On the Border To Go"; "Outback Steakhouse" vs "Outback Take
 * Away"; "Romano's Macaroni Grill" vs "Romano's On the Fly"; "Cask & Larder"
 * vs "Cask & Larder Public House" vs "Cask & Larder Provisions"; "McCoy's Bar
 * & Grill at Hyatt Regency" vs "McCoy's Bar & Grill To-Go"; "Villa Italian
 * Kitchen" vs "Market by Villa". MCO's own typo is likewise preserved rather
 * than silently corrected: it publishes two "Snack and Drink Vending Machine"
 * and one "Snacks and Drink Vending Machine" on the same Level 1 map, so those
 * are two docs (2 outlets and 1), not one. 82 records → 70 docs.
 *
 * CUISINE: "Dining" on every doc — verbatim the airport's own category name
 * for the category it files these 82 venues under, and the label on the tab
 * used to select them. MCO publishes NO cuisine or genre taxonomy of its own:
 * its placemarks carry a free-text `keywords` string that drives its search
 * box ("restaurants, restaurant, meat, meats, WOK, STIR FRY, CHINESE, RICE, …,
 * SODA, POP, TOGO"), but that is a search-keyword blob, not a genre tag list,
 * it is never printed on a card or a detail page, and promoting it to
 * `cuisine` would be inventing a taxonomy the airport does not publish. Same
 * call as LAS and MIA, whose directories likewise expose only a top-level
 * dining category.
 *
 * AMENITY: from MCO's own placemark type, which is the field behind the
 * category label its detail page shows — restaurant → `restaurant`, cafe →
 * `cafe`, bar → `bar`, vending_machines → `vending_machine`, kiosk →
 * `fast_food` (its three kiosks are "Market by Villa", "Fresh Attractions" and
 * "ZaZa Cuban Café Temp Market", each described by MCO as a temporary market
 * kiosk). Every `bar` was verified against the venue's own name AND its own
 * description rather than trusted from the type alone: Revive at Gates 80 and
 * 90 ("Cocktail Bar and Lounge"), Lobby Bar at Hyatt Regency ("Small plates,
 * cocktails and local beers") and Wine Bar George ("more than 100 wines all
 * available by the glass") all hold up. Resulting mix: 53 restaurant, 19 cafe,
 * 4 bar, 3 fast_food, 3 vending_machine. Note that MCO types its food-court
 * quick-service units (McDonald's, Sbarro, Panda Express, Burger King …) as
 * `restaurant`; that is its classification and it is kept rather than
 * second-guessed.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: set ONLY where MCO
 * explicitly tags the venue, using its own dietary categories (dw:vegetarian,
 * dw:vegan, dw:gluten-free, dw:halal, dw:kosher) — the same tags its detail
 * page prints under "Dietary options". MCO also publishes dw:dairy-free,
 * dw:healthy-options, dw:high-protein and dw:kid-friendly menu; this schema
 * has no field for those, so they are not stored anywhere rather than being
 * folded into a field they do not mean.
 *
 * OPENING HOURS: MCO writes hours into the same free-text description field as
 * the prose, in half a dozen shapes ("Hours of Operation: …", "Hours of
 * operation: …", "Hours: …", "To Go Hours of Operation: …", "Hours of
 * Operation (Dining): …" / "(Market): …", and a bare label followed by the
 * hours on the next line). They are separated back out here, label-first and
 * then by continuation lines that still look like hours, and stored verbatim —
 * "5:00am - last flight.", "6:00am – 12midnight", "4:00am until last flight.
 * (Mon - Sat); Closed Sundays", "(Dining) 11:00am - 8:00pm; (Market) 3:30am -
 * 8:00pm", "Breakfast: 7AM-11AM; Lunch: 11AM-5PM; Dinner: 5PM-10PM; Sushi Bar:
 * 5PM-11PM; Late Night: 10PM-11:59PM". MCO's own inconsistencies (12midnight,
 * "5am" vs "5:00am") are left as published. 80 of 82 outlets carry hours; the
 * two Revive bars are the only records MCO publishes with none.
 *
 * OPEN 24/7: set on the 7 outlets whose whole hours string is a standing
 * 24-hour statement — Starbucks Terminal A Level 3 ("24 hours"), Dunkin Donuts
 * & Baskin-Robbins on Level 3 ("24 Hours"), McCoy's Bar & Grill To-Go ("24
 * Hours"), McDonald's Food Court ("Open 24 hours") and the three vending
 * machines ("24 hours/365 days/year."). The match is anchored to the whole
 * string so a range that merely mentions 24 cannot trigger it.
 *
 * DESCRIPTION: the prose left after the hours block is removed, verbatim and
 * whitespace-normalised, with MCO's own Markdown bold markers stripped (it
 * writes "**Hours of Operation:**" in one record). MCO's own Markdown link in
 * the raw JUCE description is left exactly as published. Two records carry
 * prose that is only a label ("Temp Kiosk", "Temporary Kiosk") and it is kept
 * as-is.
 *
 * PHONE: verbatim from MCO's own placemark phone field, including its own
 * formatting inconsistencies ("407-825-2846", "407 825-7418", "(407)
 * 825-1234"). Invisible left-to-right marks MCO leaves in two numbers are
 * stripped. 72 of 82 records carry one.
 *
 * WEBSITE / LOGO: the bare domain of MCO's own published URL for the venue,
 * protocol/www/path stripped, with the logo.dev logo derived from it. 63 of 82
 * records carry a URL; the rest are left blank rather than guessed.
 *
 * VERIFIED TOTALS: 82 source dining records → 70 restaurant docs / 82 outlets.
 * Terminals A & B: 60 records → 49 docs / 60 outlets. Terminal C: 22 records →
 * 21 docs / 22 outlets.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['mco', 'orlando', 'orlando-international'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINALS_AB = 'terminals_a_b';
const TERMINAL_C = 'terminal_c';
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

// ─── Terminals A & B (North Terminal) ───

const terminalsABVenues = {
  asian_chao: restaurant({
    name: "Asian Chao", cuisine: "Dining", amenity: "restaurant",
    description: "Asian Chao proudly deliver healthy alternatives with zesty and tangy flavors such as Orange Chicken, Beef & Broccoli, Vegetable Medley, and other popular dishes.",
    website: "foodsystemsunlimited.com", logoUrl: logo("foodsystemsunlimited.com"),
    phone: "407-825-3860",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "8:00am - last flight."),
    ],
  }),
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Dining", amenity: "restaurant",
    description: "We're raising the standard of snacking. Soft pretzel snacks, drinks and pretzel dips",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    phone: "407-735-5018",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal A, Food Court, Departing / Shops / Dining", "landside", "6:00am - 10:00pm."),
    ],
  }),
  bahama_breeze: restaurant({
    name: "Bahama Breeze", cuisine: "Dining", amenity: "restaurant",
    description: "Caribbean inspired food, handcrafted tropical drinks, and a vibrant island atmosphere.",
    website: "bahamabreeze.com", logoUrl: logo("bahamabreeze.com"),
    phone: "407-825-8292",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal B, Gates 70-99, Gates 70-79", "airside", "4:00am - last departing flight."),
    ],
  }),
  bananas_smoothies_frozen_yogurt: restaurant({
    name: "Bananas Smoothies & Frozen Yogurt", cuisine: "Dining", amenity: "restaurant",
    description: "Whether in a cone, cup, sundae or smoothie, Bananas uses nonfat frozen yogurt and fresh ingredients to make delicious combinations. Bananas’ menu features a variety of items including real fruit smoothies, fresh squeezed juices, nondairy fruit frosties, nonfat frozen yogurt sundaes, and an assortment of natural grab and go snack offerings. Founded in 1979 as Everything Yogurt, Bananas has evolved to become the ultimate place for fun food! Treat yourself right and go Bananas!",
    website: "greenleafsbananas.com", logoUrl: logo("greenleafsbananas.com"),
    phone: "407-825-3860",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "4:30am - last departing flight."),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Dining", amenity: "restaurant",
    description: "Home of the flame-broiled Whopper",
    website: "bk.com", logoUrl: logo("bk.com"),
    phone: "407-825-2846",
    vegetarian: true,
    outlets: [
      o("", "Terminal B, Gates 70-99", "airside", "4:00am - last flight."),
    ],
  }),
  camden_food_company: restaurant({
    name: "Camden Food Company", cuisine: "Dining", amenity: "cafe",
    description: "Gourmet fast food restaurant offering Greek yogurt, fresh veggies and fruit",
    website: "america.foodtravelexperts.com", logoUrl: logo("america.foodtravelexperts.com"),
    phone: "407-825-7850",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal B, Gates 30-59, Gates 50-59", "airside", "5:00am - Last Departing Flight"),
    ],
  }),
  carvel: restaurant({
    name: "Carvel", cuisine: "Dining", amenity: "restaurant",
    description: "Best known for their soft serve ice cream and ice cream cakes",
    website: "carvel.com", logoUrl: logo("carvel.com"),
    phone: "407-825-2841",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal B, Food Court, Departing / Shops / Dining", "landside", "6:00am - 10:00pm."),
      o("", "Terminal B, Gates 70-99", "airside", "4:00am - last departing flight."),
    ],
  }),
  cask_larder: restaurant({
    name: "Cask & Larder", cuisine: "Dining", amenity: "restaurant",
    description: "Cask & Larder MCO offers an extensive breakfast menu with items such as their signature Chicken & Waffles, Shrimp & Grits, and a Smoked Turkey Hash Skillet alongside a lunch and dinner menu with dishes, such as Smoked Brisket Sliders, a Southern Cuban Sandwich, and Fried Chicken served with Georgia Gouda Mac & Cheese. For travelers’ ease, a Gourmet Grab-and-Go market offers a wide variety of house-made sandwiches, salads, sides, and snack boxes, as well as TSA-approved sauces, rubs and other artisanal snacks and local confectionaries. Libations don’t take a backseat, as the bar features signature cocktails, such as the Public House Old Fashioned, C&L Lemonade, Gin & Tonic and craft beers delivered from Cask & Larder’s Winter Park in-house brewery led by Brew master Larry Foor. This location has eight beers on tap, which features signature beers such as: Lone Palm Golden Ale, Wit'er Park, and Five Points IPA, along with American craft styles, Belgians and German lagers.",
    website: "caskandlarder.com", logoUrl: logo("caskandlarder.com"),
    phone: "407-204-3296",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "Market: 5:00am – last departing flight, Restaurant & Satellite Bar: 5:00am - last departing flight."),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "Dining", amenity: "restaurant",
    description: "Fast-food restaurant specializing in chicken sandwiches.",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    phone: "407-735-5019",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Terminal B, Food Court, Departing / Shops / Dining", "landside", "5:00am - 10:00pm. (Mon-Sat) Closed Sundays"),
    ],
  }),
  chipotle: restaurant({
    name: "Chipotle", cuisine: "Dining", amenity: "restaurant",
    website: "chipotle.com", logoUrl: logo("chipotle.com"),
    phone: "407-825-3860",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "8:00am - last departing flight"),
    ],
  }),
  cibo_express: restaurant({
    name: "CIBO Express", cuisine: "Dining", amenity: "cafe",
    description: "Gourmet fast food restaurant offering Greek yogurt, fresh veggies and fruit.",
    website: "otgexp.com", logoUrl: logo("otgexp.com"),
    phone: "631-236-3863",
    vegetarian: true,
    outlets: [
      o("", "Terminal B, Gates 70-99, Gate 72", "airside", "5:00am to Last Departing Flight."),
      o("", "Terminal B, Gates 70-99, Gate 80", "airside", "5am – last departing flight."),
      o("", "Terminal B, Gates 70-99, Gate 92", "airside", "5:30am – last departing flight."),
    ],
  }),
  cinnabon: restaurant({
    name: "Cinnabon", cuisine: "Dining", amenity: "restaurant",
    description: "The ultimate indulgence awaits!",
    website: "cinnabon.com", logoUrl: logo("cinnabon.com"),
    phone: "407-735-5018",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal B, Food Court, Departing / Shops / Dining", "landside", "6:00am - 10:00pm."),
    ],
  }),
  dunkin_donuts_baskin_robbins: restaurant({
    name: "Dunkin Donuts & Baskin-Robbins", cuisine: "Dining", amenity: "restaurant",
    description: "One of the quickest stops for a cup of coffee on the go, Dunkin’ proudly offers daily fresh doughnuts in a variety of flavors, and nearly a dozen varieties of coffee treats. Get a quick caffeine fix before even arriving at the security gate, or choose from an array of bagels, breakfast sandwiches and other tempting baked goods to stave off hunger through the screening.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal A, Departing / Shops / Dining", "landside", "24 Hours", true),
    ],
  }),
  firehouse_subs: restaurant({
    name: "Firehouse Subs", cuisine: "Dining", amenity: "restaurant",
    description: "Fast-food restaurant specializing in toasted subs",
    website: "firehousesubs.com", logoUrl: logo("firehousesubs.com"),
    phone: "407-735-5018",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Terminal A, Food Court, Departing / Shops / Dining", "landside", "6:00am - 10:00pm."),
    ],
  }),
  fresh_attractions: restaurant({
    name: "Fresh Attractions", cuisine: "Dining", amenity: "fast_food",
    description: "Temporary Kiosk",
    outlets: [
      o("", "Terminal A, Gates 1-29", "airside", "7:00am-11:00pm"),
    ],
  }),
  gastrohub: restaurant({
    name: "Gastrohub", cuisine: "Dining", amenity: "restaurant",
    description: "Casual-dining experience",
    phone: "407-557-3384",
    vegetarian: true,
    outlets: [
      o("", "Terminal B, Gates 30-59", "airside", "6:00am - last departing flight. TO-GO: 4:00am - last departing flight"),
    ],
  }),
  gastrohub_to_go: restaurant({
    name: "Gastrohub To Go", cuisine: "Dining", amenity: "restaurant",
    description: "Casual-dining experience to go",
    phone: "407 506-7379",
    vegetarian: true,
    outlets: [
      o("", "Terminal B, Gates 30-59", "airside", "4:00am - last departing flight"),
    ],
  }),
  green_leafs_beyond_great_salads: restaurant({
    name: "Green Leaf’s Beyond Great Salads", cuisine: "Dining", amenity: "restaurant",
    description: "Green Leaf’s specialty is made-to-order salads. Guests customize their order by choosing from several fresh ingredients, dressings and toppings. Delicious wraps, grilled panini and specialty sandwiches offer guests a meal made from fresh ingredients that are a healthier option.",
    website: "greenleafsbananas.com", logoUrl: logo("greenleafsbananas.com"),
    phone: "407-825-3860",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "4:30am - last flight."),
    ],
  }),
  hemisphere_on_lvl_9: restaurant({
    name: "Hemisphere on LVL 9", cuisine: "Dining", amenity: "restaurant",
    description: "Access from level 3 and 4.Located on level 9. Hemisphere offers an active, upbeat environment that engages guests' senses. Executive Chef Jeffrey Powell's seasonal menus feature hand-crafted dishes that infuse fresh, local ingredients with modern world flavors. Hemisphere also features an incredible wine selection and cuvées. We are located on the ninth floor of the Hyatt Regency Orlando International Airport with convenient access to downtown Orlando, the Interstate 4 business and tourism corridor, as well as the neighboring Lake Nona community. Hemisphere will be open for dinner and special events. A great place to dine or relax before/after your flight or with complimentary valet parking, it's an unexpected but excellent option for Orlando & Lake Nona area residents! For Reservations, please call: 407-825-1344",
    website: "hemisphereorlando.com", logoUrl: logo("hemisphereorlando.com"),
    phone: "407-825-1344",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Terminal A, Departing / Shops / Dining", "landside", "5:00pm - 10:00pm (Tuesday - Saturday, Closed Sundays and Mondays)"),
    ],
  }),
  jersey_mikes: restaurant({
    name: "Jersey Mike’s", cuisine: "Dining", amenity: "restaurant",
    description: "Jersey Mike’s started back in 1956, in a storefront location in the sea-side town of Point Pleasant, NJ. To survive and thrive, they had to offer exceptional quality products, coupled with unparalleled service. Our certified Angus Beef top rounds are trimmed and cooked right in the store. Our meats and cheeses are all top-quality premium brands. Our bread is fresh-baked each day on the premises. And of course, everything’s prepared right in front of you. It’s what makes Jersey Mike’s the most authentic tasting submarine sandwich available. And it’s a tradition of quality we’ll never outgrow.",
    website: "jerseymikes.com", logoUrl: logo("jerseymikes.com"),
    phone: "407-825-3860",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "4:30am - last flight."),
    ],
  }),
  le_grand_comptoir: restaurant({
    name: "Le Grand Comptoir", cuisine: "Dining", amenity: "restaurant",
    description: "Our sophisticated menu is an epicurean journey of the senses that presents travelers with simple, chic, culinary art created by our talented chefs. We use fresh, locally sourced, seasonal ingredients.",
    website: "foodtravelexperts.com", logoUrl: logo("foodtravelexperts.com"),
    phone: "407-825-7850",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 1-29, Gate 22", "airside", "Open 7 days 5:00am - last flight."),
    ],
  }),
  lobby_bar_at_hyatt_regency: restaurant({
    name: "Lobby Bar at Hyatt Regency", cuisine: "Dining", amenity: "bar",
    description: "Small plates, cocktails and local beers perfect for unwinding.",
    website: "hyatt.com", logoUrl: logo("hyatt.com"),
    phone: "(407) 825-1234",
    outlets: [
      o("Level 4", "Terminal B, Hyatt / McCoy's", "landside", "12:00pm - 11:59pm"),
    ],
  }),
  market_by_villa: restaurant({
    name: "Market by Villa", cuisine: "Dining", amenity: "fast_food",
    description: "Temporary Kiosk",
    outlets: [
      o("", "Terminal A, Gates 1-29", "airside", "4:30am-11:00pm"),
    ],
  }),
  mccoys_bar_grill_at_hyatt_regency: restaurant({
    name: "McCoy’s Bar & Grill at Hyatt Regency", cuisine: "Dining", amenity: "restaurant",
    description: "McCoy’s offers an eclectic array of menu items focusing on fresh, locally sourced ingredients combined to produce a globally inspired menu. Interact with fellow guests at one of two communal tables while enjoying a trio of small plates and a glass of wine. Dine at our sushi bar and savor creative runway fresh catches. Nourish your kids with healthy “fun fuel” from our children’s menu, or just sit back with your favorite drink. Now open for breakfast.",
    website: "orlandoairport.hyatt.com", logoUrl: logo("orlandoairport.hyatt.com"),
    phone: "407 825 1234",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 4", "Terminal B, Hyatt / McCoy's", "landside", "Breakfast: 7AM-11AM; Lunch: 11AM-5PM; Dinner: 5PM-10PM; Sushi Bar: 5PM-11PM; Late Night: 10PM-11:59PM"),
    ],
  }),
  mccoys_bar_grill_to_go: restaurant({
    name: "McCoy’s Bar & Grill To-Go", cuisine: "Dining", amenity: "restaurant",
    description: "Satisfy late-night cravings or order up an early breakfast and lunch in the privacy of your room with selections from McCoy’s Bar & Grill To-Go menu. Indulge in comfort with all-day in-room dining including sandwiches, salads, entrees, and a creative sushi menu. Enjoy McCoy’s To-Go from the pool deck. Please use the courtesy phone located to the left of the sliding doors and Dial extension 54. Contactless menu is available for scanning and viewing on your cell phone. All orders arrive in eco-friendly packaging.",
    website: "orlandoairport.hyatt.com", logoUrl: logo("orlandoairport.hyatt.com"),
    phone: "407 825 1234",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 4", "Terminal B, Hyatt / McCoy's", "landside", "24 Hours", true),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's", cuisine: "Dining", amenity: "restaurant",
    description: "Burgers, Fries and More!",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    phone: "407 825-3273",
    outlets: [
      o("Level 3", "Terminal A, Food Court, Departing / Shops / Dining", "landside", "Open 24 hours", true),
      o("", "Terminal A, Gates 100-129", "airside", "5:30 am – Last Departing Flight"),
    ],
  }),
  moes_southwest_grill: restaurant({
    name: "Moe's Southwest Grill", cuisine: "Dining", amenity: "restaurant",
    description: "Southwest Grill, offering dine-in and catering options",
    website: "moes.com", logoUrl: logo("moes.com"),
    phone: "407-735-5020",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 3", "Terminal A, Food Court, Departing / Shops / Dining", "landside", "6:00am - 10:00pm."),
    ],
  }),
  nathans_famous_hot_dogs: restaurant({
    name: "Nathan's Famous Hot Dogs", cuisine: "Dining", amenity: "restaurant",
    description: "Home to the Original Famous Frankfurter",
    website: "nathansfamous.com", logoUrl: logo("nathansfamous.com"),
    phone: "407-825-2841",
    outlets: [
      o("", "Terminal B, Gates 70-99, Gates 70-79", "airside", "4:00am - last flight."),
    ],
  }),
  on_the_border: restaurant({
    name: "On the Border", cuisine: "Dining", amenity: "restaurant",
    description: "Full service casual adult dining, with mesquite-grilled and Southwestern items",
    website: "ontheborder.com", logoUrl: logo("ontheborder.com"),
    phone: "407-735-5014",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal A, Gates 1-29", "airside", "6:00am - last flight."),
    ],
  }),
  on_the_border_to_go: restaurant({
    name: "On the Border To Go", cuisine: "Dining", amenity: "restaurant",
    description: "Mesquite-grilled and Southwestern items to go",
    website: "ontheborder.com", logoUrl: logo("ontheborder.com"),
    phone: "407 825-2001",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal A, Gates 1-29", "airside", "6:00am - last flight."),
    ],
  }),
  orange_county_brewery: restaurant({
    name: "Orange County Brewery", cuisine: "Dining", amenity: "restaurant",
    description: "Proudly providing a one-of-a-kind craft beer experience, Orange County Brewers is your ultimate Central Florida brewery dedicated to helping you raise a glass to wherever life takes you!",
    website: "theocbrewers.com", logoUrl: logo("theocbrewers.com"),
    phone: "407-825-8271",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal A, Departing / Shops / Dining", "landside", "6:00am – 10:00pm"),
    ],
  }),
  orlando_pride_city_pub: restaurant({
    name: "Orlando Pride City Pub", cuisine: "Dining", amenity: "restaurant",
    description: "Servicing burgers, salads, breakfast, beer, wine, cocktails and more.",
    phone: "407-825-8267",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal A, Departing / Shops / Dining", "landside", "6:00am - 10:00pm."),
    ],
  }),
  outback_steakhouse: restaurant({
    name: "Outback Steakhouse", cuisine: "Dining", amenity: "restaurant",
    description: "American casual dining restaurant featuring the Bloomin Onion and signature steaks",
    website: "outback.com", logoUrl: logo("outback.com"),
    phone: "407 825-7418",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal B, Gates 70-99, Gates 70-79", "airside", "5:00am - last flight."),
    ],
  }),
  outback_take_away: restaurant({
    name: "Outback Take Away", cuisine: "Dining", amenity: "restaurant",
    description: "American casual dining to go",
    website: "outback.com", logoUrl: logo("outback.com"),
    phone: "407 825-7418",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal B, Gates 70-99, Gates 70-79", "airside", "5:00am - last flight."),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "Dining", amenity: "restaurant",
    description: "Asian-inspired cuisine in a fast casual environment.",
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    phone: "407 825-3180",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal A, Food Court, Departing / Shops / Dining", "landside", "8:00am - 9:00pm."),
    ],
  }),
  revive: restaurant({
    name: "Revive", cuisine: "Dining", amenity: "bar",
    description: "Cocktail Bar and Lounge",
    phone: "407 825-2001",
    outlets: [
      o("", "Terminal B, Gates 70-99, Gate 80", "airside", ""),
      o("", "Terminal B, Gates 70-99, Gate 90", "airside", ""),
    ],
  }),
  romanos_macaroni_grill: restaurant({
    name: "Romano's Macaroni Grill", cuisine: "Dining", amenity: "restaurant",
    description: "Casually elegant Italian restaurant",
    website: "macaronigrill.com", logoUrl: logo("macaronigrill.com"),
    phone: "407-735-5017",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal B, Departing / Shops / Dining", "landside", "11:00am – 10:00pm. To Go Hours of Operation: 11:00am - 10:00pm."),
    ],
  }),
  romanos_on_the_fly: restaurant({
    name: "Romano's On the Fly", cuisine: "Dining", amenity: "restaurant",
    description: "Romano's On the Fly - Italian restaurant food to go!",
    website: "macaronigrill.com", logoUrl: logo("macaronigrill.com"),
    phone: "407-735-5017",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal B, Departing / Shops / Dining", "landside", "To Go 11:00am - 10:00pm."),
    ],
  }),
  sbarro: restaurant({
    name: "Sbarro", cuisine: "Dining", amenity: "restaurant",
    description: "Specializes in New York style pizza and other Italian-American cuisine",
    website: "sbarro.com", logoUrl: logo("sbarro.com"),
    phone: "407-735-5016",
    vegetarian: true,
    outlets: [
      o("Level 3", "Terminal B, Food Court, Departing / Shops / Dining", "landside", "6:00am - 10:00pm."),
    ],
  }),
  snack_and_drink_vending_machine: restaurant({
    name: "Snack and Drink Vending Machine", cuisine: "Dining", amenity: "vending_machine",
    description: "Snack and drink vending machine located on Terminal B, Level 1 across from the Rental Car counters.",
    vegetarian: true,
    outlets: [
      o("Level 1", "Terminal A, Rental Cars / Transportation", "landside", "24 hours/365 days/year.", true),
      o("Level 1", "Terminal B, Rental Cars / Transportation", "landside", "24 hours/365 days/year.", true),
    ],
  }),
  snacks_and_drink_vending_machine: restaurant({
    name: "Snacks and Drink Vending Machine", cuisine: "Dining", amenity: "vending_machine",
    description: "Snack and drink vending machine located on Terminal A, Level 1 across from the Rental Car counters.",
    vegetarian: true,
    outlets: [
      o("Level 1", "Terminal A, Rental Cars / Transportation", "landside", "24 hours/365 days/year.", true),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Dining", amenity: "cafe",
    description: "Passionate purveyors of coffee.",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    phone: "407-825-6431",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 1-29", "airside", "4:00am- Last departing Flight"),
      o("", "Terminal A, Gates 1-29", "airside", "4:00am - last flight."),
      o("", "Terminal A, Gates 100-129", "airside", "4:00am - last flight."),
      o("Level 3", "Terminal A - Level 3, Departing / Shops / Dining", "landside", "24 hours", true),
      o("Level 2", "Terminal A – Level 2 Baggage Claim, Arriving / Baggage Claim", "landside", "6:00am - 10:00pm"),
      o("", "Terminal B, Gates 70-99", "airside", "4:00am - last flight"),
    ],
  }),
  tacos_locos: restaurant({
    name: "Tacos Locos", cuisine: "Dining", amenity: "restaurant",
    phone: "407-825-8245",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("", "Terminal B, Gates 70-99, Gates 70-79", "airside", "4:00am - last flight"),
    ],
  }),
  urban_crave: restaurant({
    name: "Urban Crave", cuisine: "Dining", amenity: "restaurant",
    description: "UrbanCrave is the hottest new word on the street. Bringing you authentic street cuisine, we serve honest, no-frills food, sourced from the streets and packed with flavor. Our food is mouth-watering, fresh and straight off the open grill.",
    website: "craveurbancrave.com", logoUrl: logo("craveurbancrave.com"),
    phone: "407-825-7850",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 1-29", "airside", "5:00am - Last Departing Flight"),
    ],
  }),
  villa_italian_kitchen: restaurant({
    name: "Villa Italian Kitchen", cuisine: "Dining", amenity: "restaurant",
    description: "Villa Italian Kitchen was founded with one store, one family and one concept in 1964, when our founder, Michele “Michael” Scotto brought his authentic old-world recipes from Naples, Italy to New York City. Michele’s commitment to hospitality, quality ingredients, like homemade dough, 100% whole milk mozzarella and fresh sauce and the strict loyalty to those now famous recipes, built the business.",
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"),
    phone: "407-825-3860",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "4:30am - last flight."),
    ],
  }),
  vino_volo: restaurant({
    name: "Vino Volo", cuisine: "Dining", amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("", "Terminal B, Gates 70-99, Gates 70-79", "airside", "9:00am – 9:00pm"),
    ],
  }),
  zaza_cafe: restaurant({
    name: "ZaZa CAFE", cuisine: "Dining", amenity: "cafe",
    website: "zazacubancomfort.com", logoUrl: logo("zazacubancomfort.com"),
    vegetarian: true,
    outlets: [
      o("", "Terminal B, Gates 30-59", "airside", "4:30am - last flight."),
    ],
  }),
  zaza_cuban_cafe_temp_market: restaurant({
    name: "ZaZa Cuban Café Temp Market", cuisine: "Dining", amenity: "fast_food",
    description: "Temp Kiosk",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 100-129", "airside", "4am-last departing flight"),
    ],
  }),
  zaza_to_go: restaurant({
    name: "ZaZa To Go", cuisine: "Dining", amenity: "cafe",
    description: "Cafe featuring Cuban Coffee",
    phone: "407 825-2001",
    vegetarian: true,
    outlets: [
      o("", "Terminal A, Gates 1-29", "airside", "4:30am - last flight."),
    ],
  }),
};

// ─── Terminal C ───

const terminalCVenues = {
  auntie_annes_cinnabon: restaurant({
    name: "Auntie Anne’s/Cinnabon", cuisine: "Dining", amenity: "restaurant",
    description: "Our Mission. Build the Cinnabon ® brand by offering World Famous Cinnamon Rolls ®, Baked Goods, and Specialty Beverages",
    website: "cinnabon.com", logoUrl: logo("cinnabon.com"),
    phone: "407-825-6135",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "4:00am – last departing flight"),
    ],
  }),
  barnies_coffee_tea_co: restaurant({
    name: "Barnie's Coffee & Tea Co.", cuisine: "Dining", amenity: "restaurant",
    description: "Barnie’s Coffee & Tea Co. offers an elevated coffee experience for every type of airport traveler. Leisure travelers can relax and rejuvenate, while enjoying their favorite coffee or tea blend with one of Barnie’s signature, freshly prepared, menu items. Airport employees and business visitors will also appreciate the quick turn-around time specifically designed to accommodate lunch or meeting schedules. On the Go? Simply choose from Barnie’s extensive grab and go selections. Grab and Go Items will be strategically displayed for visual appeal and ease of access in order to facilitate the on-the-go traveler.",
    website: "barniescoffee.com", logoUrl: logo("barniescoffee.com"),
    phone: "407-825-6186",
    vegetarian: true,
    outlets: [
      o("Level 6", "Terminal C, Bag Claim/Passenger Pickup", "landside", "6:00am – 12midnight"),
    ],
  }),
  cask_larder_provisions: restaurant({
    name: "Cask & Larder Provisions", cuisine: "Dining", amenity: "restaurant",
    description: "Since October 2016, Cask & Larder has been serving travelers nationally acclaimed food and drink at the Orlando International Airport. With its experienced culinary team, C&L creates modern interpretations of classic Southern dishes, as well as interesting new takes on some of the South’s most well loved favorites. The restaurant sports a seasonal bar program pouring craft cocktails and award winning house-brewed beers from Brewmaster Larry Foor. The attached Marketplace offers locally produced provisions, as well as fresh salads and sandwiches put together daily on-site. Cask & Larder’s interior picks you up from the hustle and bustle of one of the busiest airports in the country, and sets you down in a warm and inviting atmosphere drenched in Southern hospitality. Guests can enjoy the charming ambiance of soft yellow lighting and hard wood finishes in the main Dining Area, or have a drink at the bar.",
    website: "caskandlarder.com", logoUrl: logo("caskandlarder.com"),
    phone: "407-825-6247",
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "5:00AM – last departing flight"),
    ],
  }),
  cask_larder_public_house: restaurant({
    name: "Cask & Larder Public House", cuisine: "Dining", amenity: "restaurant",
    description: "Since October 2016, Cask & Larder has been serving travelers nationally acclaimed food and drink at the Orlando International Airport. With its experienced culinary team, C&L creates modern interpretations of classic Southern dishes, as well as interesting new takes on some of the South’s most well loved favorites. The restaurant sports a seasonal bar program pouring craft cocktails and award winning house-brewed beers from Brewmaster Larry Foor. The attached Marketplace offers locally produced provisions, as well as fresh salads and sandwiches put together daily on-site. Cask & Larder’s interior picks you up from the hustle and bustle of one of the busiest airports in the country, and sets you down in a warm and inviting atmosphere drenched in Southern hospitality. Guests can enjoy the charming ambiance of soft yellow lighting and hard wood finishes in the main Dining Area, or have a drink at the bar.",
    website: "caskandlarder.com", logoUrl: logo("caskandlarder.com"),
    phone: "407-825-6247",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "5:00AM – last departing flight"),
    ],
  }),
  chick_fil_a: restaurant({
    name: "Chick-fil-A", cuisine: "Dining", amenity: "restaurant",
    description: "Home of the Original Chicken Sandwich",
    website: "chick-fil-a.com", logoUrl: logo("chick-fil-a.com"),
    phone: "407-825-6408",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "4:00am until last flight. (Mon - Sat); Closed Sundays"),
    ],
  }),
  cucina_co: restaurant({
    name: "Cucina & Co.", cuisine: "Dining", amenity: "restaurant",
    description: "Prepared foods, sandwiches & more. The menu consists of popular breakfast, lunch / all-day options.",
    phone: "407-825-6229",
    vegetarian: true,
    outlets: [
      o("Level 2", "Terminal C, Gates C230-C254, Gates C230-C245", "airside", "3:30am – last departing flight"),
    ],
  }),
  desano_pizzeria: restaurant({
    name: "Desano Pizzeria", cuisine: "Dining", amenity: "restaurant",
    description: "Master pizza makers, from the moment you step into our restaurant, you realize this is more than just another pizza joint - it's a culinary event.",
    website: "desanopizza.com", logoUrl: logo("desanopizza.com"),
    phone: "407-825-6226",
    vegetarian: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "10:00am – last departing flight"),
    ],
  }),
  dunkin_donuts_baskin_robbins: restaurant({
    name: "Dunkin Donuts & Baskin-Robbins", cuisine: "Dining", amenity: "cafe",
    description: "One of the quickest stops for a cup of coffee on the go, Dunkin’ proudly offers daily fresh doughnuts in a variety of flavors, and nearly a dozen varieties of coffee treats. Get a quick caffeine fix before even arriving at the security gate, or choose from an array of bagels, breakfast sandwiches and other tempting baked goods to stave off hunger through the screening.",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    vegetarian: true,
    outlets: [
      o("", "Terminal C", "landside", "5:00am - 10:00pm."),
    ],
  }),
  greenbeat: restaurant({
    name: "Greenbeat", cuisine: "Dining", amenity: "restaurant",
    description: "Devoted to the idea that healthy, vibrant, and flavorsome food should be accessible to everyone. For that purpose, we have partnered with numerous suppliers in order to bring the most vibrant, seasonal and healthy ingredients possible with the ultimate aim of crafting exquisite health conscious meals, that are affordable to nearly everyone.",
    website: "green-beat.com", logoUrl: logo("green-beat.com"),
    phone: "407-825-6222",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "8:00am – last departing flight"),
    ],
  }),
  harvest_and_grounds: restaurant({
    name: "Harvest and Grounds", cuisine: "Dining", amenity: "cafe",
    description: "Marries a boutique coffee-shop vibe with a standout food experience. The Euro-American-style café offers a robust menu of specialty espresso and house blends, pastries, warm breakfast sandwiches and gourmet wraps and salads.",
    phone: "407-825-6201",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 2", "Terminal C, Departing / Shops / Dining", "landside", "4:00am – 8:00pm"),
    ],
  }),
  olde_hearth_bread_co: restaurant({
    name: "Olde Hearth Bread Co.", cuisine: "Dining", amenity: "restaurant",
    description: "Orlando’s original artisan bakery, serves natural, fresh-baked breads, soups, sandwiches, and rustic breakfast pastries. Olde Hearth’s commitment to quality has helped earned numerous awards and accolades. As Central Florida’s first handcrafted artisan bakery, we are committed to bringing you unique, natural and tasty breads, soups, sandwiches, pastries and baked products. Proudly serving: • Fresh baked Olde Hearth breads, Danish, pastries, croissants, and more • Boar's Head meats & cheeses for all house-made sandwiches, wraps and salads • Fresh Brewed Barnie's Coffee and Cold Brew",
    website: "oldehearthbreadcompany.com", logoUrl: logo("oldehearthbreadcompany.com"),
    phone: "407-825-6251",
    vegetarian: true,
    vegan: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "5:00am-Last Flight"),
    ],
  }),
  orange_county_brewery: restaurant({
    name: "Orange County Brewery", cuisine: "Dining", amenity: "restaurant",
    description: "Proudly providing a one-of-a-kind craft beer experience, Orange County Brewers is your ultimate Central Florida brewery dedicated to helping you raise a glass to wherever life takes you!",
    website: "theocbrewers.com", logoUrl: logo("theocbrewers.com"),
    phone: "407-825-6156",
    vegetarian: true,
    outlets: [
      o("Level 2", "Terminal C, Gates C230-C254, Gates C230-C245", "airside", "7:00am – last departing flight"),
    ],
  }),
  ravenous_pig_brewing_co_general_store: restaurant({
    name: "Ravenous Pig Brewing Co. General Store.", cuisine: "Dining", amenity: "restaurant",
    description: "Stylish gastropub serving inventive New American fare, beers brewed on-site & handcrafted cocktails.",
    website: "theravenouspig.com", logoUrl: logo("theravenouspig.com"),
    phone: "407-825-6156",
    vegetarian: true,
    outlets: [
      o("Level 2", "Terminal C, Gates C230-C254, Gates C230-C245", "airside", "5:00am – last departing flight"),
    ],
  }),
  raw_juce: restaurant({
    name: "raw JUCE", cuisine: "Dining", amenity: "cafe",
    description: "Support our universe in their journey to live a healthy lifestyle by serving great-tasting, organic, cold-pressed juices, smoothies, acai bowls, salads and other organic foods [A MCO Rewards participating partner!](https://flymco.com/mco-rewards/)",
    phone: "407-825-6201",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 2", "Terminal C, Departing / Shops / Dining", "landside", "3:30am – 8:00pm"),
    ],
  }),
  replenish_with_illys_coffee: restaurant({
    name: "Replenish with Illy's Coffee", cuisine: "Dining", amenity: "cafe",
    description: "Replenish is a News Stand with an Illy Cafe inside it. Our Illy Cafe offers an authentic Italian coffee experience, focusing on high-quality, 100% Arabica espresso blends alongside classic Italian drinks, pastries, and simple, tasty food. There are local pastries and sandwiches available as well as a wide range of snack items and drinks. There is a small selection of top selling tech items such as Apple headphones and accessories, Android compatible headphones, cords, and portable power. Replenish offers Orlando T shirts, sweaters and accessories to check off your list before flying out. Books and Magazines are also available.",
    phone: "407-825-6114",
    vegetarian: true,
    outlets: [
      o("Level 2", "Terminal C, Gates C230-C254, Gates C230-C245", "airside", "4:30AM – 10:00PM"),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "Dining", amenity: "restaurant",
    description: "Shake Shack is a modern day “roadside” burger stand serving a classic American menu of premium burgers, hot dogs, crinkle-cut fries, shakes, frozen custard",
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"),
    phone: "407-825-6138",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "4:00am – Last Departing Flight"),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Dining", amenity: "cafe",
    description: "To inspire and nurture the human spirit – one person, one cup and one neighborhood at a time",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    phone: "407-825-6133",
    vegetarian: true,
    outlets: [
      o("Level 6", "Terminal C - Level 6, Bag Claim/Passenger Pickup", "landside", "8:00am – 1:00am"),
      o("Level 2", "Terminal C Palm Court, Departing / Shops / Dining", "airside", "4:00am – last departing flight"),
    ],
  }),
  summer_house_orlando: restaurant({
    name: "Summer House Orlando", cuisine: "Dining", amenity: "restaurant",
    description: "Summer House Santa Monica is a California-inspired restaurant featuring a fresh, seasonal menu and a breezy, beach house environment. Breakfast is served daily until 10:00 AM, as well as lunch and dinner featuring a variety of burgers, tacos, pizza, and more. The restaurant also offers a full market with its famous cookies and pastries from the bakery, a coffee bar featuring La Colombe Coffee Roasters, and an extensive wine and cocktail list. Summer House in the Orlando airport is open for dine-in and carryout daily.",
    website: "summerhouserestaurants.com", logoUrl: logo("summerhouserestaurants.com"),
    phone: "407-825-6207",
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "(Dining) 11:00am - 8:00pm; (Market) 3:30am - 8:00pm"),
    ],
  }),
  sunshine_diner_by_chef_art_smith: restaurant({
    name: "Sunshine Diner by Chef Art Smith", cuisine: "Dining", amenity: "restaurant",
    description: "Sunshine Diner is a fun, bright signature concept developed by none other than award-winning, celebrity Chef Art Smith. A sixth generation Floridian, Chef Art loves the idea of bringing people together through food. That’s what has paved the way to his success today. The Sunshine Diner at MCO will offer guests a vintage diner experience with a colorful and decidedly retro Florida design. The menu is classic Chef Art with a fresh, healthy take on flavor profiles guests expect to come from a diner. Fresh, seasonal fruits and vegetables, buttermilk pancakes and Johnny cakes, eggs benedict, omelettes, steak and eggs, and avocado toast make this breakfast-all-day diner a delight for travelers.",
    website: "mca-airports.com", logoUrl: logo("mca-airports.com"),
    phone: "407-825-6253",
    vegetarian: true,
    glutenFree: true,
    outlets: [
      o("Level 2", "Terminal C, Gates C230-C254, Gates C230-C245", "airside", "5:00am – last departing flight"),
    ],
  }),
  the_scoop: restaurant({
    name: "The Scoop", cuisine: "Dining", amenity: "cafe",
    description: "The Scoop is a pre-security News Stand where we offer snacks, drinks and tech to meet your needs. With a wide selection of headphones, power cords, and portable power, you'll find what you need! The store also has luggage for all the treasures you picked up on your visit to Orlando. Grab your reading materials before your flight from our variety of books and magazines.",
    phone: "407-825-6112",
    vegetarian: true,
    outlets: [
      o("Level 2", "Terminal C, Departing / Shops / Dining", "landside", "4:30AM – 8:00PM"),
    ],
  }),
  wine_bar_george: restaurant({
    name: "Wine Bar George", cuisine: "Dining", amenity: "bar",
    description: "Join us alongside George Miliotes, Master Sommelier, for more than 100 wines all available by the glass, bottle...and the ounce! Enjoy alongside a full menu of small plates, cheese and charcuterie, family style plates and sweets.",
    website: "winebargeorge.com", logoUrl: logo("winebargeorge.com"),
    phone: "407-825-6187",
    outlets: [
      o("Level 2", "Gates C230-C254, Terminal C Palm Court", "airside", "5:00am – last departing flight"),
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

  const r1 = await processTerminal(AIRPORT, TERMINALS_AB, 'Terminals A & B (North Terminal)', terminalsABVenues);
  const r2 = await processTerminal(AIRPORT, TERMINAL_C, 'Terminal C', terminalCVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINALS_AB, TERMINAL_C]));

  const totalCreated = r1.created + r2.created;
  const totalDeleted = r1.deleted + r2.deleted;
  const totalVenues = Object.keys(terminalsABVenues).length
    + Object.keys(terminalCVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
