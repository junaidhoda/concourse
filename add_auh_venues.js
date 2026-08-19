'use strict';
/**
 * Fills in complete data for Zayed International Airport (AUH), Abu Dhabi,
 * UAE, restaurants/bars/cafés in Firestore, based on research conducted on
 * 2026-08-15.
 *
 * TERMINAL STRUCTURE: Zayed International Airport now operates entirely out
 * of ONE unified building, Terminal A (opened November 2023), which replaced
 * the airport's former fragmented Terminal 1/Terminal 2/Terminal 3 setup —
 * those older terminals, which each had their own separate check-in and
 * security screening and were not airside-interconnected, are now closed
 * (confirmed via Wikipedia, cross-checked against the official site, which
 * itself only ever refers to "AUH Terminal A"). Terminal A has one central
 * check-in hall and one central security/immigration checkpoint for the
 * whole airport; beyond that single checkpoint it fans out into named piers
 * (Pier A, B, C, D) plus a set of "E Gates". Per this dataset's "own check-in
 * AND own security" test, AUH does not meet the bar for multiple terminal
 * buckets — it is modelled here as ONE terminal bucket (terminal_1, display
 * name "Terminal A"), with each venue's pier/area captured in its outlet's
 * `level` field, the same single-terminal treatment used for DOH (Hamad
 * International) and GIG/LIM.
 *
 * SOURCES & METHODOLOGY: built entirely from the official Zayed
 * International Airport site (zayedinternationalairport.ae), using the same
 * browser-verified, official-site-only standard established for the DXB/DOH
 * revisions. The listing page
 * (zayedinternationalairport.ae/en/shop-dine-and-experience/dining/restaurants)
 * renders all 36 venue cards directly in the DOM (no further pagination or
 * infinite-scroll needed — confirmed complete by extracting every
 * `a[href*="/restaurants/"]` link and finding exactly 36 unique slugs).
 * Despite cards visually showing only a logo with no name text, and links
 * that initially appeared to be same-page hash anchors, each card actually
 * does resolve to its own real, fetchable detail page at
 * zayedinternationalairport.ae/en/shop-dine-and-experience/dining/restaurants/<slug>.
 * EVERY one of the 36 venues was fetched individually via its own detail
 * page (using the page's same-origin `fetch()` from within Claude in
 * Chrome, parsed with DOMParser — equivalent to visiting each page
 * directly) and its name (`h1`), description (`.gcbParagraphWithMorePtag`),
 * category tags (`.gcb_highlightWpr` "Highlights" block), and Open/Location/
 * Food-Preparation-Time fields (`.gcb_flightCardItem` key-value rows) were
 * read directly from that venue's own page — never inferred from the
 * listing grid alone. No secondary/third-party sources were used at any
 * stage.
 *
 * DATA-QUALITY NOTES:
 *   - Starbucks's own detail page publishes NO location text at all — its
 *     "Location" field is a bare Google Maps pin link (a `maps.google.com`
 *     URL) with no address or pier/area description alongside it, and its
 *     description paragraph doesn't mention a location either. Rather than
 *     guess, `level`/`location_notes` are left blank with an explicit note.
 *   - McDonald's and Maison Samira Maatouk have no description paragraph
 *     published on their official detail pages at all (every other of the
 *     36 venues has one) — `description` is left blank/minimal for these
 *     two rather than fabricated.
 *   - "The Daily" is listed on the official site with a full detail page,
 *     but its own "Open" field reads "Opening Soon" (every other venue says
 *     "24 hours" or "24/7") — included since it's officially listed, but
 *     flagged in its description as not yet operating as of this research
 *     date.
 *   - "OTG Vending Machines - Masafi" is a self-service vending-machine
 *     format (coffee, hot/cold beverages, snacks) rather than a staffed
 *     counter — included since it's a real, officially-listed F&B offering,
 *     but its own page describes it as operating "at Zayed International
 *     Airport, Al Bateen International Airport & Al Ain International
 *     Airport" collectively, with no single in-terminal location given, so
 *     `level`/`location_notes` note this rather than guessing a pier.
 *   - The venue whose slug is `/restaurants/pier-d` displays only "Pier D"
 *     as its page `h1`, but its own description paragraph opens with "Pier D
 *     Sports Bar is a fantastic spot for sports enthusiasts..." — its actual
 *     name, "Pier D Sports Bar", is taken from that description text rather
 *     than the truncated `h1`, the same kind of page-truth-over-label fix
 *     applied to DXB's Qinwan Café in the prior revision of that script.
 *   - Maison Samira Maatouk's own page categorises it as "Coffee Shop" but
 *     its highlights (Gift Boxes, Coffee Machines, Fresh Pastries & Food
 *     Capsules, Instant coffee) describe a retail coffee-beans/capsules/gift
 *     shop that also serves hot and cold beverages — included as a café
 *     since it's officially listed under Restaurants and does serve
 *     beverages, but this retail-leaning mix is noted here.
 *   - "Patamar" (sit-down "Patamar Indo-Asian Kitchen", Airside Food Park)
 *     and "Patamar To Go" (landside kiosk before check-in) are two
 *     distinctly named venues with separate descriptions, menus and
 *     locations on the official site despite sharing a brand root — kept as
 *     two separate docs, matching the precedent set by DOH's "Jones the
 *     Grocer Express" vs "Jones Social" (same ownership group, different
 *     concepts, not merged).
 *   - "SO! Coffee" is the only venue whose own Location field lists two
 *     distinct piers ("Pier A End, Pier C Middle") — modelled as ONE doc
 *     with two `outlets[]` entries, per this dataset's standing multi-outlet
 *     convention for a single brand appearing twice within the same
 *     terminal bucket.
 *   - No phone number or external website is published on ANY official
 *     zayedinternationalairport.ae detail page fetched for this script, so
 *     `phone` is blank throughout. `website`/`logo_url` are filled in only
 *     for brands independently confirmed as real, identifiable global
 *     chains with an unambiguous public domain (Burger King, McDonald's,
 *     Starbucks, Costa Coffee, TGI Fridays, Texas Chicken, Krispy Kreme,
 *     Jones the Grocer, Häagen-Dazs, % Arabica, Butlers Chocolate Café) —
 *     smaller/regional or ambiguously-branded concepts (Café Ritazza, Puro
 *     Gusto, Bottega Bar, Camden Food Co., etc.) are left blank rather than
 *     guessing a domain.
 *   - A "Food Preparation Time" field (e.g. "8–10 mins") is published on the
 *     four venues clustered in the terminal's central dining area (The
 *     Majilis, The Meat District, Todd English, Yasamin). There's no
 *     dedicated schema field for this, so it's folded into each venue's
 *     `description` text as a parenthetical rather than dropped.
 *   - Costa Coffee (Arrivals Landside, Duty Free) and Patamar To Go (before
 *     Check-in) are the only two venues explicitly published as landside;
 *     every other venue's location text places it airside (Departures /
 *     Piers / Food Park), so `airside` defaults to 'airside' except for
 *     these two.
 *
 * AUH does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'auh' first, then 'abudhabi', then 'zayed', using whichever has
 * existing terminal data). It never creates a new `airports/{id}` metadata
 * doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For the
 * terminal grouping below, it first deletes EVERY existing restaurant doc in
 * that terminal's `restaurants` subcollection — unconditionally, regardless
 * of whether its name matches anything in this file — and only then creates
 * every venue defined here as a brand-new doc. There is no update-in-place
 * step and no name-matching against what's already there; nothing from a
 * previous run survives. Run this only when the venue list below is meant to
 * be the complete, authoritative set for the terminal bucket.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't THIS script's terminal id (terminal_1) gets its
 * restaurants subcollection and then the terminal doc itself deleted, so a
 * stale/orphaned terminal bucket (e.g. a hypothetical earlier "terminal_2"/
 * "terminal_3" modelled after AUH's now-closed old terminals) doesn't keep
 * inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_auh_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['auh', 'abudhabi', 'zayed'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';

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

// ─── Terminal venues (single unified Terminal A; Piers A-D + E Gates) ───────

const terminal1Venues = {
  arabica: restaurant({
    name: 'Arabica',
    cuisine: 'Japanese, Coffee',
    amenity: 'cafe',
    website: 'https://arabica.coffee',
    logoUrl: logo('arabica.coffee'),
    description: 'A renowned Japanese coffee brand offering a minimalist aesthetic and a commitment to the highest quality, single-origin coffee beans.',
    outlets: [outlet({ level: 'Duty Free', locationNotes: 'Duty Free', open247: true })],
  }),
  bottega_bar: restaurant({
    name: 'Bottega Bar',
    cuisine: 'Italian, Wine Bar, Pizza, Pasta',
    amenity: 'restaurant',
    description: 'Savour Italian delicacies, fine wine, and prosecco in a stylish, relaxed setting, perfect for a moment of European indulgence. Highlights: pastas, salads, pizzas, sandwiches, coffee & drinks, prosecco.',
    outlets: [outlet({ level: 'Central Area', locationNotes: 'Central Area', open247: true })],
  }),
  brioche_doree: restaurant({
    name: 'Brioche Dorée',
    cuisine: 'French, Bakery, Café',
    amenity: 'cafe',
    description: 'A taste of France, offering fresh pastries, artisan sandwiches, and light, authentic French meals.',
    outlets: [outlet({ level: 'Pier D', locationNotes: 'Pier D', open247: true })],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.burgerking.com',
    logoUrl: logo('burgerking.com'),
    description: 'Burger King is the second largest fast food hamburger chain in the world, committed to using only the freshest ingredients. The original Home of the Whopper, with signature recipes and family-friendly dining experiences for more than 50 years.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  butlers_chocolate_cafe: restaurant({
    name: 'Butlers Chocolate Café',
    cuisine: 'Café, Chocolate, Irish',
    amenity: 'cafe',
    website: 'https://www.butlerschocolates.com',
    logoUrl: logo('butlerschocolates.com'),
    description: 'Indulge in luxurious hot chocolates, gourmet coffee, and a selection of handcrafted Irish chocolates and decadent desserts. Serves alcohol.',
    outlets: [outlet({ level: 'Airside Level 3', locationNotes: 'AUH Terminal A Departures - Airside Level 3 - Beside Travelex', open247: true })],
  }),
  cafe_flor: restaurant({
    name: 'Café Flor',
    cuisine: 'Café, Breakfast',
    amenity: 'cafe',
    description: 'A welcoming café providing a selection of light snacks, fresh juices, and quality coffee for a refreshing break.',
    outlets: [outlet({ level: 'Central Area', locationNotes: 'Central Area', open247: true })],
  }),
  cafe_ritazza: restaurant({
    name: 'Café Ritazza',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    vegan: true,
    description: 'Ritazza serves premium coffee crafted from the finest beans and brewed on traditional Italian espresso machines, paired with fresh sandwiches, pastries, salads, or plant-forward options.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  camden_food_co: restaurant({
    name: 'Camden Food Co.',
    cuisine: 'Café, Grab & Go, Sandwiches',
    amenity: 'fast_food',
    vegan: true,
    description: 'Wholesome and indulgent choices — from organic pre-packaged meals to freshly prepared sandwiches, pastries, and salads, with an expanded plant-forward menu.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  costa_coffee: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.costacoffee.com',
    logoUrl: logo('costacoffee.com'),
    description: 'A popular UK-based coffee chain serving a wide range of hot and cold beverages, along with sandwiches and baked goods.',
    outlets: [outlet({ airside: 'landside', level: 'Arrivals, Duty Free', locationNotes: 'Arrivals Landside, Duty Free', open247: true })],
  }),
  culto_cafe: restaurant({
    name: 'Culto Cafe',
    cuisine: 'Italian, Coffee, Café',
    amenity: 'cafe',
    vegetarian: true,
    description: 'Culto Cafe brings Italian coffee culture to life, serving organic specialty coffees, hot and cold drinks, pastries and sweet treats alongside fresh sandwiches, wraps, salads and wholesome meals to go.',
    outlets: [outlet({ level: 'Pier A Middle', locationNotes: 'Pier A Middle', open247: true })],
  }),
  haagen_dazs: restaurant({
    name: 'Häagen-Dazs',
    cuisine: 'Ice Cream, Desserts',
    amenity: 'cafe',
    website: 'https://www.haagendazs.com',
    logoUrl: logo('haagendazs.com'),
    description: "The world-famous ice cream known for its iconic, rich, creamy flavours crafted from premium ingredients — signature scoops, delicious creations and classic affogatos.",
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  jones_the_grocer: restaurant({
    name: 'Jones the Grocer',
    cuisine: 'Deli, Café, Restaurant',
    amenity: 'restaurant',
    website: 'https://www.jonesthegrocer.com',
    logoUrl: logo('jonesthegrocer.com'),
    description: 'A casual dining restaurant and gourmet grocer offering artisan cheese, fine foods, and a full menu of contemporary, high-quality dishes. Serves alcohol.',
    outlets: [outlet({ level: 'Pier A', locationNotes: 'Pier A', open247: true })],
  }),
  krispy_kreme: restaurant({
    name: 'Krispy Kreme',
    cuisine: 'Doughnuts, Café',
    amenity: 'cafe',
    website: 'https://www.krispykreme.com',
    logoUrl: logo('krispykreme.com'),
    description: 'The world-famous Original Glazed® and a variety of delicious doughnuts made fresh daily.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  levito: restaurant({
    name: 'Levito',
    cuisine: 'Italian, Pizza, Pasta',
    amenity: 'restaurant',
    vegan: true,
    description: 'A neighborhood kitchen serving freshly baked pizzas and flavorful pastas, along with classic Italian dishes and desserts like tiramisu and panna cotta, centred around a signature pizza oven.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  maison_samira_maatouk: restaurant({
    name: 'Maison Samira Maatouk',
    cuisine: 'Coffee Shop, Retail',
    amenity: 'cafe',
    description: "A coffee-focused retail counter selling fresh coffee beans, gift boxes, coffee machines, pastries and food capsules, alongside hot and cold beverages. NOTE: this venue's official detail page publishes no description paragraph (every other venue in this file has one); category taken from its own 'Coffee Shop' page label and highlights list instead.",
    outlets: [outlet({ level: 'Airside Departure', locationNotes: 'Airside Departure', open247: true })],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com',
    logoUrl: logo('mcdonalds.com'),
    description: "NOTE: this venue's official detail page publishes no description paragraph (every other venue in this file has one); highlights per its own page: burgers, breakfast, sides and snacks, desserts, coffee, Happy Meal.",
    outlets: [outlet({ level: 'Airside Level 3, Pier A', locationNotes: 'AUH Terminal A Departures, Airside Level 3, Pier A', open247: true })],
  }),
  operation_falafel: restaurant({
    name: 'Operation Falafel',
    cuisine: 'Arabic, Middle Eastern, Street Food',
    amenity: 'fast_food',
    description: 'A Dubai-born casual dining chain reviving authentic Arabic street food with a modern twist — shawarma, hummus, falafel, and customizable salad bowls.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  otg_masafi: restaurant({
    name: 'OTG Vending Machines - Masafi',
    cuisine: 'Coffee, Snacks, Vending',
    amenity: 'fast_food',
    description: "OTG (formerly Opta and Masafi Vending) is a self-service automated vending format specialising in premium coffee and grab-and-go snacks/confectionery. Its own page describes it as operating at Zayed International Airport, Al Bateen International Airport & Al Ain International Airport collectively, with no single in-terminal location published, so no specific pier/level is set below.",
    outlets: [outlet({ locationNotes: 'No single in-terminal location published; site describes vending machines placed across Zayed International, Al Bateen International & Al Ain International airports collectively', open247: true })],
  }),
  pana: restaurant({
    name: 'Pana',
    cuisine: 'Breakfast, Bar',
    amenity: 'restaurant',
    description: 'At Pana you can enjoy delicious breakfast or a quick tasty meal and finish with a drink at the bar.',
    outlets: [outlet({ level: 'Pier B, Gate 21', locationNotes: 'Pier B, Gate 21', open247: true })],
  }),
  patamar: restaurant({
    name: 'Patamar Indo-Asian Kitchen',
    cuisine: 'Indo-Asian, Indian, Sushi, Ramen',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    description: 'An Indo-Asian kitchen blending the bold flavors of India and Southeast Asia — curries, tandoori chicken, and naan, alongside Asian favorites such as silog breakfasts, sushi, and ramen, plus vegetarian, vegan, and plant-forward options.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  patamar_to_go: restaurant({
    name: 'Patamar To Go',
    cuisine: 'Indo-Asian, Kiosk',
    amenity: 'fast_food',
    description: 'For travelers seeking a delicious sit-down meal, Patamar To Go brings bold Indo-Asian flavours to Abu Dhabi Airport — biryani, butter chicken, tandoori specialties, and Asian classics, along with vegetarian options, plus freshly brewed coffee, Karak and Masala Chai.',
    outlets: [outlet({ airside: 'landside', level: 'Landside before Check-in', locationNotes: 'AUH Terminal A Departures - Landside area before Check in - in between Gate 6-7', open247: true })],
  }),
  pier_d_sports_bar: restaurant({
    name: 'Pier D Sports Bar',
    cuisine: 'Bar, International',
    amenity: 'restaurant',
    description: 'Pier D Sports Bar is a fantastic spot for sports enthusiasts and travellers alike.',
    outlets: [outlet({ level: 'Pier D, Gate 49', locationNotes: 'Pier D, Gate 49', open247: true })],
  }),
  puro_gusto: restaurant({
    name: 'Puro Gusto',
    cuisine: 'Café, Bakery, Italian',
    amenity: 'cafe',
    description: 'A modern Coffee, Bakery & Tasty food shop for a quality break, where a premium coffee offer is accompanied by selected cuisine specialties in an elegant, engaging setting. Serves alcohol.',
    outlets: [outlet({ level: 'Pier B, Gate 18', locationNotes: 'Pier B, Gate 18', open247: true })],
  }),
  shawa: restaurant({
    name: 'Shawa',
    cuisine: 'Lebanese, Grill, Middle Eastern',
    amenity: 'fast_food',
    description: 'A Lebanese Grill offering authentic and flavourful Middle Eastern cuisine, specialising in fresh shawarma and grilled meats.',
    outlets: [outlet({ level: 'Pier D, Gate 43', locationNotes: 'Pier D, Gate 43', open247: true })],
  }),
  so_coffee: restaurant({
    name: 'SO! Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    vegetarian: true,
    description: 'Coffee, fresh baked goods, organic tea, pastries and sandwiches for dine-in or take away.',
    outlets: [
      outlet({ level: 'Pier A End', locationNotes: 'Pier A End', open247: true }),
      outlet({ level: 'Pier C Middle', locationNotes: 'Pier C Middle', open247: true }),
    ],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'Located in Zayed International Airport, this Starbucks store offers a convenient stop for travellers to enjoy their favourite beverages and snacks on the go.',
    outlets: [outlet({ locationNotes: "Precise location not published as text on official page (site provides only a Google Maps pin link, no pier/area description)", open247: true })],
  }),
  taste_of_india: restaurant({
    name: 'Taste of India',
    cuisine: 'Indian',
    amenity: 'restaurant',
    description: 'Offers a selection of classic and contemporary Indian dishes, bringing the rich and diverse flavours of the subcontinent to the airport. Serves alcohol.',
    outlets: [outlet({ level: 'Pier D, Gate 43', locationNotes: 'Pier D, Gate 43', open247: true })],
  }),
  texas_chicken: restaurant({
    name: 'Texas Chicken',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.texaschicken.com',
    logoUrl: logo('texaschicken.com'),
    description: 'Big, bold flavors with crispy, juicy fried chicken, buttery honey biscuits, and hearty sides.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  tgi_fridays: restaurant({
    name: 'TGI Fridays',
    cuisine: 'American, Burgers, Bar & Grill',
    amenity: 'restaurant',
    website: 'https://www.tgifridays.com',
    logoUrl: logo('tgifridays.com'),
    description: 'A casual dining restaurant & bar known for its American-style comfort food, signature burgers, steaks, and handcrafted cocktails, served in a lively, welcoming atmosphere. Serves alcohol.',
    outlets: [outlet({ level: 'Airside Food Park Mezzanine Level 5', locationNotes: 'AUH Terminal A Departures - Airside Food Park Mezzanine Level 5', open247: true })],
  }),
  the_daily: restaurant({
    name: 'The Daily',
    cuisine: 'Café, Grab & Go, Bakery',
    amenity: 'cafe',
    description: "Real food made fresh, served fast — bold coffee & bright juices, loaded sandwiches, pastries & house-baked breads. NOTE: officially listed on the site's Restaurants page, but its own detail page shows status \"Opening Soon\" as of this research date rather than published operating hours — not yet open.",
    outlets: [outlet({ level: 'E Gates', locationNotes: 'E Gates', openingHours: 'Opening Soon (not yet open)' })],
  }),
  the_majilis: restaurant({
    name: 'The Majilis',
    cuisine: 'Arabic, Middle Eastern, Café',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    description: 'Blends Arabian hospitality with global flavours — specialty coffees, teas, fresh juices, and camel milk, alongside Middle Eastern favourites, gourmet sandwiches, fresh salads, and nourishing international dishes. (Food preparation time: 8–10 mins per official site.)',
    outlets: [outlet({ level: 'Central Processor', locationNotes: 'Central Processor Rear', open247: true })],
  }),
  the_meat_district: restaurant({
    name: 'The Meat District',
    cuisine: 'American, Burgers, Hot Dogs',
    amenity: 'fast_food',
    vegetarian: true,
    description: 'New York-style hotdogs, hamburgers, and fries, plus homemade milkshakes and a variety of hot and cold beverages. Serves alcohol. (Food preparation time: 8–10 mins per official site.)',
    outlets: [outlet({ level: 'Central Processor', locationNotes: 'Central Processor, near entry to Pier B', open247: true })],
  }),
  todd_english: restaurant({
    name: 'Todd English',
    cuisine: 'International, Sushi, Pasta, Steaks',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    description: 'A culinary journey with airside views, featuring sushi, pasta, wok dishes, pizza, cured meats, rotisserie chicken, gourmet steaks, and a fully licensed bar experience. (Food preparation time: 10–14 mins per official site.)',
    outlets: [outlet({ level: 'Central Processor', locationNotes: 'Central Processor, near entry to Pier C', open247: true })],
  }),
  urban_food_market: restaurant({
    name: 'Urban Food Market',
    cuisine: 'Café, Grab & Go, Bakery',
    amenity: 'fast_food',
    description: 'Real food made fresh, served fast — bold coffee & bright juices, loaded sandwiches, pastries & house-baked breads.',
    outlets: [outlet({ level: 'Pier D, Gate 47', locationNotes: 'Pier D, Gate 47', open247: true })],
  }),
  vit: restaurant({
    name: 'VIT',
    cuisine: 'Juices, Sandwiches, Healthy',
    amenity: 'fast_food',
    description: 'Where passion meets refreshment — a menu of delicious and healthy juices, sandwiches, and more.',
    outlets: [outlet({ level: 'Pier B, Gate 14', locationNotes: 'Pier B, Gate 14', open247: true })],
  }),
  yasamin: restaurant({
    name: 'Yasamin',
    cuisine: 'International, European, Asian, Middle Eastern',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    description: 'Unwind with great food before your flight — a diverse menu blending all-day breakfast, global European, Asian and Middle Eastern flavours, coffee, pastries, and a licensed bar experience. (Food preparation time: 10–12 mins per official site.)',
    outlets: [outlet({ level: 'Pier C End', locationNotes: 'Pier C End', open247: true })],
  }),
};

// ─── upload: detect airport slug, unconditionally wipe the terminal's ───────
// ─── restaurants subcollection, then recreate every venue from this file ────

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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal A', terminal1Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1]));

  const totalCreated = r1.created;
  const totalDeleted = r1.deleted;
  const totalVenues = Object.keys(terminal1Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
