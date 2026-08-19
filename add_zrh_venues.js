'use strict';
/**
 * Fills in complete data for all Zurich Airport (ZRH) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official Flughafen Zürich
 * "Eat & Drink" directory (flughafen-zuerich.ch/en/passengers/shopping-and-
 * enjoy/eat-and-drink/all-food-and-drink) and each outlet's own detail page
 * on 2026-08-15.
 *
 * The "all-food-and-drink" listing page enumerates every food & beverage
 * outlet at once — 63 distinct venue detail pages (a handful of which are
 * "brand" pages that themselves list 2-5 separate physical outlets: Bellevue,
 * Brezelkönig, Caffè Spettacolo, Pret A Manger, Roots, Starbucks, Startbar,
 * Steiner Flughafebeck, Yooji's). Every one of those 63 pages was fetched and
 * parsed to build this script.
 *
 * TERMINAL STRUCTURE: unlike Fiumicino (two physically separate landside
 * terminal buildings) or Paris-CDG (multiple physically separate terminal
 * buildings), Zurich Airport has only ONE passenger terminal. Its own site
 * and Wikipedia both describe a single ground-side terminal complex ("Airport
 * Centre") — covering Check-in 1, Check-in 2 and the landside "Airport
 * Shopping" hall — feeding through one security checkpoint into a single
 * airside hub (the "Airside Center"), from which the finger piers/docks A, B,
 * D and E branch out. All of that — check-in halls, the landside shopping
 * hall, the airside hub, and every gate pier — is the SAME terminal building,
 * so it is modelled here as one Firestore terminal bucket, `terminal_1`
 * (numbered only for consistency with this dataset's naming convention, not
 * because Zurich has a second numbered terminal). The zone each venue
 * actually sits in (Check-in 1, Check-in 2, Airport Shopping, Airside Center,
 * Gates A/B/D/E, plus the individual Arrival 1/2 halls) is recorded in that
 * outlet's own `location_notes` instead of being used to fragment the
 * terminal into buckets that don't correspond to anything physically
 * separate.
 *
 * One genuinely separate complex is kept as its own bucket rather than
 * folded into `terminal_1`, because it is not part of the terminal building
 * at all: `the_circle`. The Circle, opened in 2020, is its own commercial/
 * hotel complex directly across from the Airside Center — the airport's own
 * site describes it as a separate development, not part of the terminal.
 *
 * The off-site "Around the Airport" venues (Oberglatt snack stands near the
 * runway, the Observation Deck B terrace, the Radisson Blu Hotel/Prime
 * Center, the Freight West building) that an earlier revision of this script
 * carried as their own terminal bucket have been removed entirely — they
 * aren't part of the airport's own terminal/passenger-area food & drink
 * offering and don't belong in this dataset.
 *
 * A brand present in more than one zone WITHIN the terminal (Bellevue in
 * Gates A/B/D, Brezelkönig in Airport Shopping/Airside Center, Pret A Manger
 * in Gates A/B/D/E, Starbucks in Airport Shopping/Check-in 2/Gates A/B/E,
 * Startbar in Gates A/D, Steiner Flughafebeck in Check-in 1/Check-in
 * 2/Airport Shopping) is now combined into a SINGLE `terminal_1` doc with one
 * `outlets[]` entry per physical zone, each carrying its own accurate
 * `location_notes` and `airside`/landside flag — since, per this dataset's
 * standing convention, multiple outlets of the same brand within one
 * terminal bucket are combined rather than split. Pret A Manger's Circle
 * outlet stays a separate doc under `the_circle`, since that's a genuinely
 * different building. Marché's two separately-listed "Take Away" pages
 * (Airside Center and Gates E/"E West") are likewise combined into one
 * `terminal_1` doc now that both zones fall inside the same terminal bucket.
 * Multiple outlets already combined on the site's own brand page within one
 * zone (Caffè Spettacolo's Airport Shopping + Arrival 1 counters, Roots'
 * Airport Shopping + Arrival 2 counters, Yooji's two Airside Center counters)
 * remain combined as before.
 *
 * Every one of the 55 venues kept here carries a published zone badge on its
 * detail page or brand-listing page — unlike Fiumicino, no `other_areas`/
 * no-badge catch-all bucket was needed here.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - `airside` is set per outlet from each venue's own published zone:
 *     Check-in 1, Check-in 2, Airport Shopping and The Circle are all
 *     landside (pre-security); Airside Center and Gates A/B/D/E are airside
 *     (post-security). The site doesn't publish a separate per-outlet
 *     airside/landside flag beyond the
 *     zone itself, so this is a direct mapping, not a guess.
 *   - Dietary tags are sparse on this site compared to Fiumicino's structured
 *     "SERVICE PROVIDED" tag list — Zurich's venue pages only occasionally
 *     use the words "vegetarian" or "vegan" in free-text descriptions, and no
 *     venue publishes gluten-free, halal or kosher information anywhere in
 *     the directory. Only venues whose own description explicitly uses the
 *     word "vegetarian" and/or "vegan" have those flags set here (AIR
 *     Restaurant, Little Orient, McDonald's, Negishi, Pret A Manger, Roots,
 *     Yooji's); `gluten_free`, `halal` and `kosher` are left blank throughout
 *     since the site never publishes those tags for any Zurich outlet.
 *   - `phone` is left blank where the site itself doesn't publish one for
 *     that outlet. Several brands share a single operator contact number
 *     (Autogrill, SSP/"Food Travel Experts", Marché, Hyatt, Radisson Blu
 *     house lines) rather than a per-shop line — that's what's actually
 *     published, not a gap in this script. The site does not expose email
 *     addresses in the app's restaurant schema, so none are stored here even
 *     where the source page listed one.
 *   - `opening_hours` reproduces the site's own published hours verbatim
 *     where given; many venues (mostly brand-listing pages covering several
 *     outlets, and a handful of individual pages) publish no hours at all and
 *     are left blank here rather than guessed. Zum Mitnäh and Alpine Bar are
 *     explicitly published as around-the-clock and are marked `open_24_7`.
 *   - `website`/`logo_url` are only filled in for brands independently
 *     verifiable as real regional/international chains or venues with their
 *     own dedicated domain (McDonald's, Burger King, KFC, Starbucks, Pret A
 *     Manger, Confiserie Sprüngli, Caviar House & Prunier, Confiseur
 *     Bachmann, Marché, Negishi, Holy Cow!, Sternen Grill, and the various
 *     Hyatt/Radisson Blu/Bindella/independent restaurant-specific domains
 *     published on their own pages). Where the page's only "website" value
 *     was the shared operator's generic corporate site (autogrill.ch,
 *     foodtravelexperts.com) rather than a brand- or venue-specific domain —
 *     AIR Bakery, Aviolino, Bye Bye Bar, Edelweiss Café, Greens, Pizza,
 *     Umaizushi, Alpenblick Bar, Bakeside, NZZ Café, Sportsbar & Terrace —
 *     that generic link is treated the same as Fiumicino's unlisted-website
 *     concession brands and left blank rather than stored as if it were the
 *     venue's own site. Brands with no site-published domain at all
 *     (Bellevue, Brezelkönig, Caffè Spettacolo, Roots, Startbar, Steiner
 *     Flughafebeck, TUK, India, Little Orient, Route 90 Grill and More)
 *     are likewise left blank rather than guessed.
 *
 * Zurich Airport appears in NEITHER reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js) — confirmed via inspection of
 * migrate_firestore.js's AIRPORT_SLUGS array, which lists none of
 * 'zurich'/'zrh' — so its Firestore slug is unconfirmed. This script
 * auto-detects the airport slug at runtime (checking 'zurich' first, then
 * 'zrh', using whichever has existing terminal data). It never creates a
 * new `airports/{id}` metadata doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: this script does a hard wipe, not a diff. For
 * every terminal grouping below, it first deletes EVERY existing restaurant
 * doc in that terminal's `restaurants` subcollection — unconditionally,
 * regardless of whether its name matches anything in this file — and only
 * then creates every venue defined here as a brand-new doc. There is no
 * update-in-place step and no name-matching against what's already there;
 * nothing from a previous run survives. Run this only when the venue lists
 * below are meant to be the complete, authoritative set for each terminal
 * bucket.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't one of THIS script's terminal ids (TERMINAL_1,
 * THE_CIRCLE) gets its restaurants subcollection and then the terminal doc
 * itself deleted. This matters because wiping a terminal's restaurants
 * subcollection never removed the terminal-level doc — so every bucket a
 * previous revision of this script ever used (this file went through
 * revisions with 10, then 3, then 2 terminal buckets before settling here)
 * was left behind as an empty terminal doc, which is why the app was
 * showing far more terminals for this airport than actually exist.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_zrh_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['zurich', 'zrh'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const THE_CIRCLE = 'the_circle';

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

// ─── Terminal 1 venues (the single terminal building — Check-in 1/2, ────────
// ─── Airport Shopping, Airside Center, Gates A/B/D/E) ────────────────────────

const terminal1Venues = {
  // — Check-in 1 —
  the_gallery: restaurant({
    name: 'The Gallery',
    cuisine: 'Asian',
    amenity: 'restaurant',
    phone: '+41 76 718 29 22',
    description: "The Gallery offers guests a unique culinary experience, presented in a spacious area on the airport's gallery floor with views of airport activity — blending international with national flair, Asian culinary delights paired with modern design.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in 1, Public Area', openingHours: '10:30 - 21:00' })],
  }),
  edelweiss_cafe: restaurant({
    name: 'Edelweiss Café',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '+41 76 260 18 33',
    description: 'At the Edelweiss Bar you can enjoy delicious Italian coffee, crispy sandwiches or small snacks from morning to night — an informal atmosphere to unwind right in the middle of the hustle and bustle of the airport.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in 1, Public Area', openingHours: '4:30 - 21:00' })],
  }),

  // — Check-in 2 —
  air_bakery: restaurant({
    name: 'AIR Bakery',
    cuisine: 'Bakery',
    amenity: 'bakery',
    phone: '+41 76 448 18 55',
    description: 'Home-made baked goods, prepared fresh every day — breads, sandwiches and pastries made visible through a glass front.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in 2, Public Area', openingHours: '4:30 - 19:00' })],
  }),
  air_restaurant: restaurant({
    name: 'AIR Restaurant',
    cuisine: 'International, Self-Service',
    amenity: 'food_court',
    website: 'https://www.air-zrh.ch',
    vegetarian: true,
    phone: '+41 79 201 54 24',
    description: 'A self-service restaurant with a world of food: pizza and pasta, Asian wok, various grilled foods and a sumptuous vegetarian buffet, with runway views.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in 2, Public Area', openingHours: '' })],
  }),
  bye_bye_bar: restaurant({
    name: 'Bye Bye Bar',
    cuisine: 'Bar',
    amenity: 'bar',
    phone: '+41 76 467 25 14',
    description: 'The place to say a proper farewell to your loved ones amid the hustle and bustle of the airport, with the culinary delights on offer in an inviting design ambiance.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in 2, Public Area', openingHours: '4:30 - 21:00' })],
  }),
  holy_cow: restaurant({
    name: 'Holy Cow!',
    cuisine: 'Burgers',
    amenity: 'fast_food',
    website: 'https://www.holycow.ch',
    logoUrl: logo('holycow.ch'),
    phone: '+41 79 201 54 94',
    description: 'Burger lovers are in for a treat at Holy Cow, watching their favourite burgers being prepared — nothing less than juicy Swiss premium beef ends up on the grill.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in 2, Public Area', openingHours: '11:00 - 21:00' })],
  }),

  // — Airport Shopping (landside hall between check-ins, incl. Arrival 1/2) —
  sternen_grill: restaurant({
    name: 'Sternen Grill',
    cuisine: 'Grill, Sausages',
    amenity: 'fast_food',
    website: 'https://www.sternengrill.ch',
    logoUrl: logo('sternengrill.ch'),
    phone: '+41 43 268 20 80',
    description: "A must for sausage lovers: the famous St Gallen bratwurst with gold Bürli bread rolls and hot mustard — Zurich's cult grill pampers you daily with BBQ specialties, to take away or eat on the premises.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '11:00 - 19:00' })],
  }),
  tuk: restaurant({
    name: 'TUK',
    cuisine: 'Thai',
    amenity: 'restaurant',
    phone: '+41 76 357 32 43',
    description: 'Treat yourself to tom kha gai, spring rolls, red and green curry, various fried rice and fried noodle dishes and other far eastern highlights.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '11:00 - 22:00' })],
  }),
  umaizushi: restaurant({
    name: 'Umaizushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    phone: '+41 76 387 98 80',
    description: 'Watch specially trained sushi chefs prepare traditional nigiri, sashimi, hosomaki and uramaki, plus exciting variations and interpretations of authentic Japanese cuisine.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '11:00 - 20:00' })],
  }),
  upperdeck: restaurant({
    name: 'upperdeck',
    cuisine: 'International, Grill',
    amenity: 'restaurant',
    website: 'https://www.upperdeck-zrh.ch',
    phone: '+41 76 732 57 55',
    description: 'Grill specialities prepared on the spot and a culinary journey around the globe — from Swiss classics to internationally inspired in-house creations — in an inspirational atmosphere.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '08:00 - 22:00' })],
  }),
  greens: restaurant({
    name: 'Greens',
    cuisine: 'Salads, Healthy',
    amenity: 'fast_food',
    phone: '+41 76 387 98 80',
    description: "Seasonal, freshly made products for health-conscious gourmets — known for its range of salads with grilled toppings and a variety of dressings, all prepared before their guests' eyes.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '11:00 - 20:00' })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'American, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc-suisse.ch',
    logoUrl: logo('kfc-suisse.ch'),
    phone: '+41 76 552 81 32',
    description: "The secret original recipe plus top quality make KFC's chicken specialities so popular everywhere — chicken wings, crispy salads and delicious coffee for the ideal snack on the go.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '10:30 - 22:30' })],
  }),
  india: restaurant({
    name: 'India',
    cuisine: 'Indian',
    amenity: 'fast_food',
    phone: '+41 76 357 32 43',
    description: 'Popular dishes like curry avial, daal makhani, butter chicken, beef vindaloo and many more delights.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area (take away)', openingHours: '11:00 - 21:00' })],
  }),
  little_orient: restaurant({
    name: 'Little Orient',
    cuisine: 'Middle Eastern, Mediterranean',
    amenity: 'fast_food',
    vegetarian: true,
    phone: '+41 76 357 32 43',
    description: 'Vegetarian and meat-based classics and popular dishes such as kebab, falafel box and much more.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area (take away)', openingHours: '11:00 - 20:00' })],
  }),
  pizza: restaurant({
    name: 'Pizza',
    cuisine: 'Italian, Pizza',
    amenity: 'fast_food',
    phone: '+41 76 357 32 43',
    description: 'Amazing pizza varieties straight out of the oven, available to take away too — Mediterranean ambiance and the allure of classic Italian cuisine.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '11:00 - 20:00' })],
  }),
  mc_donalds: restaurant({
    name: "McDonald's",
    cuisine: 'American, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.ch',
    logoUrl: logo('mcdonalds.ch'),
    vegetarian: true,
    phone: '+41 43 305 28 00',
    description: "The iconic Big Mac, crispy veggie burgers or Happy Meals for the little ones — the unique McDonald's taste, before or even after a long trip.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area (take away)', openingHours: '06:00 - 23:00' })],
  }),
  marche_cafebar: restaurant({
    name: 'Marché coffee bar',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.marche-schweiz.ch',
    phone: '+41 43 816 65 10',
    description: "Freshly pressed juices, hearty breads and crispy focaccias to generous sandwiches — everything the hungry traveller's heart desires just after arrival.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '05:30 - 22:00' })],
  }),
  zueri_kafi: restaurant({
    name: 'Züri Kafi',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '+41 76 387 98 80',
    description: 'A coffee counter in the Airport Shopping public area.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '06:00 - 20:00' })],
  }),
  spruengli_cafe_bar: restaurant({
    name: 'Sprüngli Café-Bar',
    cuisine: 'Café, Confectionery',
    amenity: 'cafe',
    website: 'https://www.spruengli.ch',
    logoUrl: logo('spruengli.ch'),
    description: "In the stylish ambience of the Sprüngli Café-Bar, Confiserie Sprüngli invites guests to enjoy home-made specialities, fine coffee, lunch options and aperitifs — one of Europe's premier confectioners, known for Swiss chocolate pralines, truffles and its signature Luxemburgerli.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Level 0, next to the Sprüngli store (Airport Center)', openingHours: '07:00 - 21:00' })],
  }),
  caffe_spettacolo: restaurant({
    name: 'Caffè Spettacolo',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'A café brand with counters in the Airport Shopping area and the Arrivals hall.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '' }),
      outlet({ airside: 'landside', locationNotes: 'Arrival 1, Public Area', openingHours: '' }),
    ],
  }),
  roots: restaurant({
    name: 'Roots',
    cuisine: 'Vegetarian, Café',
    amenity: 'cafe',
    vegetarian: true,
    description: 'A varied selection of vegetarian dishes, including sandwiches, salads, bowls and various snacks, complemented by a selection of coffee, tea and smoothies.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '' }),
      outlet({ airside: 'landside', locationNotes: 'Arrival 2, Public Area', openingHours: '' }),
    ],
  }),

  // — Airside Center (central hub just past security) —
  sportsbar_terrace: restaurant({
    name: 'Sportsbar & Terrace',
    cuisine: 'Bar, Grill',
    amenity: 'bar',
    phone: '+41 43 816 85 98',
    description: 'Fresh ingredients on your plate and live sports events on the screen — a sports-oriented ambiance with a great view of flight activities.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '04:30 - 22:00' })],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'American, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.burgerking.ch',
    logoUrl: logo('burgerking.ch'),
    phone: '+41 43 816 85 98',
    description: 'Order the popular Whopper, a burger of your fancy or a salad at the world-famous Burger King fast food chain — in the self-service zone or, if on a tight schedule, to take away.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '07:00 - 22:00' })],
  }),
  chalet_suisse: restaurant({
    name: 'Chalet Suisse',
    cuisine: 'Swiss',
    amenity: 'restaurant',
    website: 'https://www.chaletsuisse-zrh.ch',
    phone: '+41 76 374 37 33',
    description: 'Both the menu and the ambiance in the Chalet Suisse are authentically Swiss — cosmopolitan and traditional at the same time.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '05:00 - 22:00' })],
  }),
  center_bar_kitchen: restaurant({
    name: 'Center Bar and Kitchen',
    cuisine: 'Asian, Sushi',
    amenity: 'restaurant',
    website: 'https://www.centerbar.ch',
    phone: '+41 44 576 46 80',
    description: 'Welcome to Asia at the heart of Zurich Airport — authentic atmosphere and cuisine, from sushi and dim sum to a range of curries.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '04:30 - 22:00' })],
  }),
  spruengli_cafe_lounge: restaurant({
    name: 'Confiserie Sprüngli Café & Lounge',
    cuisine: 'Café, Confectionery',
    amenity: 'cafe',
    website: 'https://www.spruengli.ch',
    logoUrl: logo('spruengli.ch'),
    description: "Start the day with an appetising breakfast or enjoy an exclusive snack in the Confiserie Sprüngli Café & Lounge — the Confiserie's popular creations such as macaroons, pralines and truffles are an absolute must too.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '05:00 - 20:00' })],
  }),
  marche_restaurant: restaurant({
    name: 'Marché Restaurant',
    cuisine: 'International',
    amenity: 'food_court',
    website: 'https://www.marche-schweiz.ch',
    phone: '+41 43 816 65 10',
    description: 'An abundant salad and vegetable buffet, delicious Asian soup, crispy pizzas or something tasty from the grill — plus sandwiches and pastries for takeaway.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '05:30 - 22:00' })],
  }),
  villa_antinori: restaurant({
    name: 'Villa Antinori da Bindella',
    cuisine: 'Tuscan, Italian',
    amenity: 'restaurant',
    website: 'https://www.bindella.ch/gastronomie/villa-antinori-da-bindella',
    phone: '+41 43 816 16 16',
    description: 'A Mediterranean island in the midst of the airport hustle and bustle — Tuscan specialities and select wines, an homage to the Antinori wine-growing dynasty, with numerous artworks and a great view of the take-off runway.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '05:30 - 22:00' })],
  }),
  yoojis: restaurant({
    name: "Yooji's",
    cuisine: 'Sushi, Poké, Salads',
    amenity: 'fast_food',
    vegetarian: true,
    vegan: true,
    description: 'A range of sushi creations, poké, salads and desserts — both vegetarian and vegan — made fresh daily, from early until late.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area (A)', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area (B)', openingHours: '' }),
    ],
  }),

  // — Gates A/B/D/E (finger piers, reached from the Airside Center) —
  caviar_house_seafood_bar: restaurant({
    name: 'Caviar House Seafood Bar',
    cuisine: 'Seafood',
    amenity: 'restaurant',
    website: 'https://www.caviarhouseprunier.com',
    logoUrl: logo('caviarhouseprunier.com'),
    phone: '+41 43 816 35 04',
    description: 'A unique contemporary restaurant with the refinement of a surprising menu — caviar, Balik smoked salmon, foie gras, Pata Negra, king crab, oysters and other seafood.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gates A, Passenger Area', openingHours: '07:00 - 20:00' })],
  }),
  nzz_cafe: restaurant({
    name: 'NZZ Café',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '+41 43 816 85 98',
    description: "Delicious drinks and tasty snacks while you find out what is going on in the world — free access to the Swiss daily NZZ's digital news repertoire.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gates A, Passenger Area', openingHours: '' })],
  }),
  alpenblick_bar: restaurant({
    name: 'Alpenblick Bar',
    cuisine: 'Bar, Salads',
    amenity: 'bar',
    phone: '+41 43 816 85 98',
    description: 'A spectacular Alpine panorama and a drink as fresh as a Swiss mountain lake, with tasty, healthy salads and sandwiches — airport view included.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gates E, Passenger Area', openingHours: '' })],
  }),
  bakeside: restaurant({
    name: 'Bakeside',
    cuisine: 'Café, Bakery',
    amenity: 'cafe',
    phone: '+41 43 816 85 98',
    description: 'A compact choice of drinks and snacks to go, plus a cosy seating area to relax in before take-off.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gates E, Passenger Area', openingHours: '07:00 - 14:00' })],
  }),

  // — brands that recur across several of the zones above, combined into
  //   one doc per brand with one outlet per zone —
  steiner_flughafebeck: restaurant({
    name: 'Steiner Flughafebeck',
    cuisine: 'Bakery, Sandwiches',
    amenity: 'bakery',
    description: 'Fresh sandwiches every day, crispy breads, pastries, tarts and many other delights from this bakery/café brand.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Check-in 1, Public Area', openingHours: '' }),
      outlet({ airside: 'landside', locationNotes: 'Check-in 2, Public Area', openingHours: '' }),
      outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '' }),
    ],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'Starbucks is a byword for delicious coffee, exquisite teas, tasty baked goods and numerous other delicacies.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Check-in 2, Public Area', openingHours: '' }),
      outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates A, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates B, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates E, Passenger Area', openingHours: '' }),
    ],
  }),
  brezelkonig: restaurant({
    name: 'Brezelkönig',
    cuisine: 'Bakery, Pretzels',
    amenity: 'bakery',
    description: 'The finest pretzels from a convenient take-away — delicious pretzels in every possible variation, baguettes, sandwiches and other snacks.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Airport Shopping, Public Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '' }),
    ],
  }),
  marche_take_away: restaurant({
    name: 'Marché Take Away',
    cuisine: 'Healthy, Sandwiches',
    amenity: 'fast_food',
    website: 'https://www.marche-schweiz.ch',
    phone: '+41 43 816 65 10',
    description: 'Healthy and speedy snacks — freshly squeezed juices, savoury bread variations, crispy focaccias and nutritious sandwiches.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Airside Center, Passenger Area', openingHours: '05:30 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'Gates E, Passenger Area ("E West" pop-up)', openingHours: '05:30 - 22:30' }),
    ],
  }),
  startbar: restaurant({
    name: 'Startbar',
    cuisine: 'Bar, Beer',
    amenity: 'bar',
    description: 'A generous choice of local beers, complemented by a seasonal specialty beer.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Gates A, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates D, Passenger Area', openingHours: '' }),
    ],
  }),
  bellevue: restaurant({
    name: 'Bellevue',
    cuisine: 'Café',
    amenity: 'cafe',
    description: 'Delightful views at Café Bellevue — tables adorned with a large choice of drinks and snacks, and the walls with paintings by Zurich artist Otto Baumberger.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Gates A, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates B, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates D, Passenger Area', openingHours: '' }),
    ],
  }),
  pret_a_manger_terminal: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Sandwiches, Café',
    amenity: 'fast_food',
    website: 'https://www.pret.com',
    logoUrl: logo('pret.com'),
    vegan: true,
    description: 'Traditional sandwiches, wraps and vegan meals as well as hot and cold drinks to consume on the premises or take away.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Gates A, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates B, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates D, Passenger Area', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'Gates E, Passenger Area', openingHours: '' }),
    ],
  }),
};

// ─── The Circle venues (landside — separate commercial/hotel complex, ───────
// ─── not part of the terminal building) ──────────────────────────────────────

const theCircleVenues = {
  sablier: restaurant({
    name: 'Sablier Rooftop Restaurant & Bar',
    cuisine: 'French',
    amenity: 'restaurant',
    website: 'https://www.sablier.ch',
    phone: '+41 44 521 99 99',
    description: "A journey through the culinary diversity of France, paired with irresistible wines, in a stylish restaurant and bar featuring Switzerland's largest rooftop terrace with green views.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  sapori_ditalia: restaurant({
    name: "Sapori d'Italia",
    cuisine: 'Italian, Deli',
    amenity: 'deli',
    website: 'https://www.saporiditalia.ch',
    phone: '+41 44 204 36 85',
    description: 'Formaggio, Prosciutto, Pane e Focaccia — a speciality store with everything needed for an Italian feast at home, and gifts too.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  zoom_restaurant_bar: restaurant({
    name: 'Zoom Restaurant & Bar',
    cuisine: 'International, Regional',
    amenity: 'restaurant',
    website: 'https://www.hyattrestaurants.com/en/zurich-airport/restaurant/zoom-restaurant-the-circle-zurich-airport',
    phone: '+41 44 597 12 34',
    description: 'Glocal dining in an urban design atmosphere — a menu loaded with responsibly sourced, regionally inspired fare as well as international classics.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area (Hyatt Place)', openingHours: '' })],
  }),
  zum_mitnaeh: restaurant({
    name: 'Zum Mitnäh',
    cuisine: 'Café, Sandwiches',
    amenity: 'cafe',
    website: 'https://www.hyattregencyzurichairportthecircle.com',
    phone: '+41 44 592 1234',
    description: 'Freshly brewed coffee, gourmet sandwiches, healthy snacks and beverages around the clock, with environmentally-friendly packaging.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area (by Hyatt Regency)', openingHours: '', open247: true })],
  }),
  rice_up: restaurant({
    name: 'Rice Up!',
    cuisine: 'Asian, Street Food',
    amenity: 'fast_food',
    website: 'https://www.riceup-restaurant.com',
    phone: '+41 44 534 60 25',
    description: 'Diverse cuisine inspired by the street-food markets of Asia — create your own bowl with your favourite ingredients and enjoy it there and then.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  babel_restaurant: restaurant({
    name: 'Babel Restaurant',
    cuisine: 'Lebanese',
    amenity: 'restaurant',
    website: 'https://www.hyattrestaurants.com/en/zurich-airport/restaurant/babel-restaurant-zurich-the-circle',
    phone: '+41 44 592 49 00',
    description: 'Discover the vibrancy and aromas of Lebanon, with a spacious terrace offering beautiful views of the park in the warmer months of the year.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area (Hyatt Regency)', openingHours: '' })],
  }),
  bar_iris: restaurant({
    name: 'Bar Iris',
    cuisine: 'Swiss, Bar',
    amenity: 'bar',
    website: 'https://www.hyattrestaurants.com/de/zurich-airport/bar/bar-iris',
    phone: '+41 44 592 42 60',
    description: 'Mark the end of the working day with friends over a chilled beer or a fruity cocktail, with a meal inspired by Switzerland — a modern atmosphere at the heart of the Circle.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area (Hyatt Regency)', openingHours: '17:00 - 00:00' })],
  }),
  chreis_14: restaurant({
    name: 'Chreis 14 / Café BelleVUE',
    cuisine: 'International',
    amenity: 'food_court',
    website: 'https://circle.sv-restaurant.ch',
    phone: '+41 58 432 45 45',
    description: 'Excellent ingredients, freshness and creativity across four serving counters with daily rotating menus; the BelleVUE coffee bar offers specialty coffee creations in an inspiring atmosphere.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  confiseur_bachmann: restaurant({
    name: 'Confiseur Bachmann',
    cuisine: 'Bakery, Confectionery',
    amenity: 'bakery',
    website: 'https://www.confiserie.ch',
    logoUrl: logo('confiserie.ch'),
    phone: '+41 41 227 70 70',
    description: 'Founded in Sursee in 1897 and now run by the 4th generation — croissants and bread rolls, salads, bowls and hot menus, pastries, cakes and patisserie made fresh every day from regional ingredients, without any additives.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  leons_bodega: restaurant({
    name: "Leon's Bodega",
    cuisine: 'Spanish, Wine Bar',
    amenity: 'bar',
    website: 'https://www.leonsbodega.ch',
    phone: '+41 43 816 20 80',
    description: 'Feel-good food, wine, spirits & soul — culinary bites and curated wines, operating as a bodega, wine shop and event venue with communal long tables and standing areas.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  leons_loft: restaurant({
    name: "Leon's Loft",
    cuisine: 'Burgers, Bowls',
    amenity: 'restaurant',
    website: 'https://www.leonsloft.ch',
    phone: '+41 43 816 20 80',
    description: 'Feel-good food from early until late in a refreshingly down-to-earth atmosphere — gourmet burgers, salads and various bowls, plus porridge and other delicacies.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  loro_di_napoli: restaurant({
    name: "l'Oro di Napoli",
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    website: 'https://www.lorodinapoli.ch',
    phone: '+41 76 586 08 46',
    description: "Crispy pizza from a specially imported wood-fired oven and 'dolce far niente' — authentic Italian cuisine and warmth.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  negishi: restaurant({
    name: 'Negishi',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    website: 'https://www.negishi.ch',
    logoUrl: logo('negishi.ch'),
    vegetarian: true,
    vegan: true,
    phone: '+41 43 305 26 44',
    description: 'A special kind of restaurant experience embedded in Far Eastern botany and Japanese art — traditionally prepared sushi and other Japanese delicacies in a breathtaking ambience.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  novu_campus_coffee_bar: restaurant({
    name: 'Novu Campus Coffee Bar',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.novucampus.com',
    phone: '+41 44 505 51 26',
    description: 'A favourite spot for first-class coffee, healthy snacks and a relaxed atmosphere.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
  pret_a_manger_the_circle: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Sandwiches, Café',
    amenity: 'fast_food',
    website: 'https://www.pret.com',
    logoUrl: logo('pret.com'),
    vegan: true,
    description: 'Traditional sandwiches, wraps and vegan meals as well as hot and cold drinks to consume on the premises or take away.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Circle, Public Area', openingHours: '' })],
  }),
};

// ─── upload: detect airport slug, unconditionally wipe each terminal's ──────
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
// terminal-level doc itself, so every terminal bucket this script has ever
// used (checkin_1, checkin_2, airport_shopping, airside_center, gates_a,
// gates_b, gates_d, gates_e, around_airport, from earlier revisions of this
// file) was left behind as an empty-but-still-present `terminals/{id}` doc —
// which is why the app was showing far more terminals for this airport than
// actually exist. This purges any terminal doc under the airport that isn't
// one of THIS run's terminal ids, deleting its restaurants subcollection
// first and then the terminal doc itself.
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

  const results = [
    await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', terminal1Venues),
    await processTerminal(AIRPORT, THE_CIRCLE, 'The Circle', theCircleVenues),
  ];

  const venueLists = [terminal1Venues, theCircleVenues];

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, THE_CIRCLE]));

  const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
  const totalVenues = venueLists.reduce((sum, v) => sum + Object.keys(v).length, 0);

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
