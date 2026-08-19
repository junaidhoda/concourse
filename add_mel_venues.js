'use strict';
/**
 * Fills in complete data for all Melbourne Airport (MEL) restaurants/bars/
 * cafés in Firestore, cross-referenced against Melbourne Airport's own
 * website (melbourneairport.com.au) on 2026-08-15.
 *
 * The site's "Directory - Eat & Drink" listing (melbourneairport.com.au/
 * directory/eat) is a JS-rendered widget that doesn't expose venue data to a
 * static fetch, but every venue has its own static detail page at
 * melbourneairport.com.au/eat/<slug> (discovered via ~75 site-scoped search
 * queries), and the official Terminal 1 Square page/press release
 * (melbourneairport.com.au/terminal-1-square and the "$20 million dining
 * precinct" corporate release) statically lists that precinct's tenants in
 * full. Where a venue's own melbourneairport.com.au page didn't expose a
 * terminal tag in static text, terminal assignment was cross-checked against
 * the brand's own store-locator page (e.g. hudsonscoffee.com.au, sushisushi.
 * com.au, brasseriebread.com.au, earlcanteen.com.au, biggiesmalls.com.au,
 * pickettsdeli.com, stompingground.beer) or a reliable third-party listing
 * (HappyCow, Priority Pass, AFL.com.au) that names the specific terminal.
 * Legacy venues that turned up in older secondary write-ups (ifly.com, Yelp)
 * but have no current melbourneairport.com.au page and no live brand-site
 * confirmation — e.g. Gian Carlo, Healthy Habits, P.J. O'Brien's, Café Vue,
 * Café Vue Express, Able Baker Charlie — are treated as closed/superseded
 * (Melbourne Airport ran a major Terminal 1/2/3 dining overhaul roughly
 * 2022-2024) and are not included below, rather than guessed back in.
 *
 * TERMINAL STRUCTURE: Melbourne Airport has four genuinely separate,
 * currently-operating terminals — Terminal 1 (Qantas Domestic), Terminal 2
 * (International), Terminal 3 (Virgin Australia Domestic) and Terminal 4
 * (Jetstar, Rex, Virgin Australia & Link Airways) — confirmed via Wikipedia
 * and the airport's own terminal-guide pages (melbourneairport.com.au/
 * terminal-1-guide through terminal-4-guide). This is a different situation
 * from Zurich (one physical terminal building wrongly split into 8 zone-based
 * buckets in an earlier revision of that script) and Rome Fiumicino (2
 * buildings, whose airside piers were wrongly modelled as 2 extra standalone
 * terminals in an earlier revision of that script): at Melbourne, T1, T2, T3
 * and T4 each have their OWN separate check-in hall, their OWN separate
 * security checkpoint and their OWN gate numbering — the Terminal 3 guide
 * page explicitly states T3 uses gates 1-10 and T4 uses gates 11+, each
 * screened through its own security. T3 and T4 do physically share one
 * building ("linked under one roof", per Wikipedia, and directly walkable
 * without leaving the building), but that shared roof doesn't make T4 a zone
 * of T3 any more than two adjacent terminals connected by an airside walkway
 * at another airport would be — they're functionally distinct terminals with
 * distinct check-in/security/gates, which is exactly how Melbourne Airport's
 * own Eat & Drink directory organizes every venue (each /eat/<slug> page
 * carries a T1/T2/T3/T4 filter-tag list, e.g. McDonald's shows "T2 T4").
 * Because of that, this script keeps all four as separate terminal buckets
 * rather than collapsing any of them the way Zurich's zones or Rome's
 * boarding piers were collapsed.
 *
 * MULTI-OUTLET CONVENTION: unlike Zurich and Rome, this round of research did
 * not turn up any brand with two separate physical counters within the SAME
 * Melbourne Airport terminal — every brand present at Melbourne more than
 * once (Brunetti Classico in T1, T2 and T4; ST. ALi and Hungry Jack's in T1
 * and T2; McDonald's, Subway and Two Johns Taphouse in T2 and T4; Boost Juice
 * in T3 and T4; Icons Victoria, Krispy Kreme and Daniel's Donuts in T1 and
 * T4) has its outlets spread across DIFFERENT terminal buildings, so per this
 * dataset's standing convention each gets a separate doc per terminal rather
 * than being combined into one doc's outlets[] array. The outlet() helper and
 * every restaurant() call below are still structured to support multiple
 * outlets in a single doc, ready to combine automatically if a genuine
 * same-terminal duplicate location is confirmed in a future update.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - Opening hours and phone numbers are published by Melbourne Airport only
 *     through a JS-driven "Stores and opening hours" widget on each /eat/
 *     <slug> page, which a static fetch can't read — so both fields are left
 *     blank throughout except where a specific hour/24-7 claim was
 *     independently confirmed for that exact outlet (McDonald's T2 and T4,
 *     Hudsons Coffee T2, and Pickett's Deli & Rotisserie all explicitly
 *     advertise 24-hour trade on their own pages).
 *   - Dietary flags (halal/vegetarian/vegan/gluten-free) are set only where
 *     that specific venue publishes them (Grill'd, Subway, Salsas Fresh Mex,
 *     Nooodles, Two Johns Taphouse, Hanna's Cafe, Bà Xã, Liv Eat, Pickett's
 *     Deli & Rotisserie) — left blank for every other venue rather than
 *     assumed.
 *   - `website`/`logo_url` are filled in only for brands independently
 *     verifiable as real national/international chains with a confident
 *     public domain (ST. ALi, Veneziano, Hungry Jack's, Krispy Kreme,
 *     Brunetti Classico, Daniel's Donuts, Gloria Jean's Coffees, McDonald's,
 *     Nando's, MoVida, Grill'd, Axil Coffee Roasters, Subway, Salsas,
 *     Hudsons Coffee, Boost Juice, Oporto, Brasserie Bread, Sushi Sushi,
 *     Sushi Jiro, Rustica, EARL Canteen, Hanna's Cafe, Pickett's Deli &
 *     Rotisserie, Stomping Ground Brewery, The Local Taphouse, The Pelican,
 *     Bridge Road Brewers, WH Smith) — independent, concession-only concepts
 *     with no independently confirmed public domain (Pope Joan, Mobo Moga,
 *     The Grace, Icons Victoria, Cafe Sol, The Cellar Bar & Bistro, Flat Chat
 *     Espresso & Bar, Nooodles, Pizza Al Taglio, Urban Provodore, Bà Xã,
 *     Little Lygon, Villa & Hut, Dumpling Co, Noodles XO, Coffee Capital, AFL
 *     Kitchen & Bar, Biggie Smalls, Think Asia, Mezze Za Za, Gusto Pasta Bar)
 *     are left blank rather than guessing one.
 *
 * Melbourne Airport appears in NEITHER reference script (migrate_firestore.
 * js's AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'melbourne' first, then 'mel', using whichever has existing
 * terminal data). It never creates a new `airports/{id}` metadata doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For
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
 * airport whose id isn't one of THIS script's four terminal ids (TERMINAL_1,
 * TERMINAL_2, TERMINAL_3, TERMINAL_4) gets its restaurants subcollection and
 * then the terminal doc itself deleted, so a stale/orphaned terminal bucket
 * left behind by any earlier or wrongly-modelled revision of this script
 * doesn't keep inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_mel_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['melbourne', 'mel'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';
const TERMINAL_4 = 'terminal_4';

// ─── helpers (matches admin_restaurant_editor_screen.dart's save shape) ──────

function outlet({ airside = 'landside', level = '', locationNotes = '', openingHours = '', open247 = false }) {
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

// ─── Terminal 1 venues (Qantas Domestic) ─────────────────────────────────────

const t1Venues = {
  st_ali_t1: restaurant({
    name: 'ST. ALi',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.stali.com.au',
    logoUrl: logo('stali.com.au'),
    description: "Melbourne's specialty-coffee pioneer, serving signature espresso, coffee-spiked cocktails, brunch and Melbourne-made gifts.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  pope_joan: restaurant({
    name: 'Pope Joan',
    cuisine: 'Café, All-Day Dining',
    amenity: 'cafe',
    description: 'A well-loved Melbourne café (the original opened in Brunswick in 2010) serving all-day breakfast and lunch, quality coffee and house-made cakes.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  the_local_taphouse: restaurant({
    name: 'The Local Taphouse',
    cuisine: 'Bar, Pub Food',
    amenity: 'bar',
    website: 'https://thelocal.com.au',
    logoUrl: logo('thelocal.com.au'),
    description: "A 60-tap beer bar run by Stomping Ground Brewing Co, offering the airport's most extensive beer list alongside pub food and airfield views.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  veneziano_coffee_roasters: restaurant({
    name: 'Veneziano Coffee Roasters',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.venezianocoffee.com.au',
    logoUrl: logo('venezianocoffee.com.au'),
    description: 'An Italian-inspired specialty coffee roaster serving breakfast, lunch and takeaway roasted beans.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  mobo_moga: restaurant({
    name: 'Mobo Moga',
    cuisine: 'Modern Asian',
    amenity: 'restaurant',
    description: 'A modern Asian restaurant from MasterChef judge Gary Mehigan, built around Victorian produce and vibrant, "funky" flavours.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  the_grace: restaurant({
    name: 'The Grace Wine Bar and Eatery',
    cuisine: 'Wine Bar, Modern Australian',
    amenity: 'bar',
    description: "Chef Ray Capaldi's wine bar and eatery, serving globally-inspired seasonal share dishes, grazing boards, wine and cocktails.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  liv_eat: restaurant({
    name: 'Liv Eat',
    cuisine: 'Healthy, Quick Bites',
    amenity: 'fast_food',
    website: 'https://www.liveat.com.au',
    logoUrl: logo('liveat.com.au'),
    vegetarian: true,
    vegan: true,
    glutenFree: true,
    description: 'A healthy-eating concept offering nutritious food and beverages as a wholesome stop before flying, with vegan, vegetarian and gluten-free options.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1, immediately after security' })],
  }),
  icons_victoria_t1: restaurant({
    name: 'Icons Victoria',
    cuisine: 'Gourmet Food, Wine, Coffee, Tea (Retail)',
    amenity: 'cafe',
    description: 'A curated retail stop for locally-produced Victorian gourmet food, wine, coffee and tea, sold as gifts and treats. One of two Melbourne Airport outlets (also in Terminal 4).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  sushi_jiro_t1: restaurant({
    name: 'Sushi Jiro',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    website: 'https://www.sushijiro.com.au',
    logoUrl: logo('sushijiro.com.au'),
    description: 'Handcrafted, traditional sushi "with a fun twist," made fresh to order.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  rustica: restaurant({
    name: 'Rustica',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    website: 'https://www.rusticasourdough.com.au',
    logoUrl: logo('rusticasourdough.com.au'),
    description: 'Sourdough bakery-café (flagship store in South Yarra, established 2012) serving artisan breads, pastries and coffee.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  hungry_jacks_t1: restaurant({
    name: "Hungry Jack's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://www.hungryjacks.com.au',
    logoUrl: logo('hungryjacks.com.au'),
    description: "Australian fast-food burger chain (Burger King's Australian franchise); this Terminal 1 outlet is billed as one of its most modern locations. One of two Melbourne Airport outlets (also in Terminal 2).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  wh_smith_long_shot: restaurant({
    name: 'WH Smith Long Shot',
    cuisine: 'Coffee, Bookstore',
    amenity: 'cafe',
    website: 'https://www.whsmith.com.au',
    logoUrl: logo('whsmith.com.au'),
    description: 'A coffee counter combined with the WH Smith newsagent/bookstore concept, pairing espresso with a curated book and magazine selection.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1 Square dining precinct' })],
  }),
  krispy_kreme_t1: restaurant({
    name: 'Krispy Kreme',
    cuisine: 'Doughnuts',
    amenity: 'bakery',
    website: 'https://www.krispykreme.com.au',
    logoUrl: logo('krispykreme.com.au'),
    description: 'Doughnut and coffee chain outlet. One of two Melbourne Airport outlets (also in Terminal 4).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1' })],
  }),
  brunetti_classico_t1: restaurant({
    name: 'Brunetti Classico',
    cuisine: 'Italian, Café, Pasticceria',
    amenity: 'cafe',
    website: 'https://www.brunetticlassico.com.au',
    logoUrl: logo('brunetticlassico.com.au'),
    description: "Melbourne's well-known Italian pasticceria, serving artisan pasta, cakes, gelato, coffee, pizza, salads and panini. One of three Melbourne Airport outlets (also in Terminal 2 and Terminal 4).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1' })],
  }),
  daniels_donuts_t1: restaurant({
    name: "Daniel's Donuts",
    cuisine: 'Doughnuts, Sweets',
    amenity: 'bakery',
    website: 'https://www.danielsdonuts.com.au',
    logoUrl: logo('danielsdonuts.com.au'),
    description: 'Fresh doughnuts, milkshakes and pies. One of two Melbourne Airport outlets (also in Terminal 4).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 1' })],
  }),
  gloria_jeans_coffees: restaurant({
    name: "Gloria Jean's Coffees",
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.gloriajeanscoffees.com.au',
    logoUrl: logo('gloriajeanscoffees.com.au'),
    description: 'Australian coffee chain outlet in the Qantas Domestic terminal.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1, airside, Shop 10' })],
  }),
  the_pelican: restaurant({
    name: 'The Pelican',
    cuisine: 'Pub Food, Bar',
    amenity: 'bar',
    website: 'https://www.pelicanbar.com.au',
    logoUrl: logo('pelicanbar.com.au'),
    description: 'A pub serving parmas, burgers, pizzas and fish & chips alongside 10+ beers on tap and live sport; open for breakfast, lunch, dinner and drinks.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1, just past Gate 1, next to Brunetti Classico' })],
  }),
  bridge_road_brewers: restaurant({
    name: 'Bridge Road Brewers',
    cuisine: 'Brewery, Bar',
    amenity: 'bar',
    website: 'https://www.bridgeroadbrewers.com.au',
    logoUrl: logo('bridgeroadbrewers.com.au'),
    description: "A craft brewery bar from the Beechworth-based Bridge Road Brewers, serving their own beers alongside a bar menu.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 1, opposite Gate 21' })],
  }),
};

// ─── Terminal 2 venues (International) ───────────────────────────────────────

const t2Venues = {
  st_ali_t2: restaurant({
    name: 'ST. ALi',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.stali.com.au',
    logoUrl: logo('stali.com.au'),
    description: "Melbourne's specialty-coffee pioneer; this Terminal 2 outlet was ST. ALi's original Melbourne Airport location, serving signature espresso, coffee-spiked cocktails, brunch and gifts.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  hungry_jacks_t2: restaurant({
    name: "Hungry Jack's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://www.hungryjacks.com.au',
    logoUrl: logo('hungryjacks.com.au'),
    description: 'Australian fast-food burger chain. One of two Melbourne Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  hudsons_coffee_t2: restaurant({
    name: 'Hudsons Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.hudsonscoffee.com.au',
    logoUrl: logo('hudsonscoffee.com.au'),
    description: "Australian coffee chain trading 24 hours, serving Melbourne-style coffee and quick bites.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International', openingHours: '24 hours', open247: true })],
  }),
  mcdonalds_t2: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://mcdonalds.com.au',
    logoUrl: logo('mcdonalds.com.au'),
    description: "Fast-food chain using 100% Australian beef, including the Big Mac and Grand Angus; trades 24 hours. One of two Melbourne Airport outlets (also in Terminal 4).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International', openingHours: '24 hours', open247: true })],
  }),
  nandos_peri_peri: restaurant({
    name: "Nando's PERi-PERi",
    cuisine: 'Portuguese, Chicken',
    amenity: 'restaurant',
    website: 'https://www.nandos.com.au',
    logoUrl: logo('nandos.com.au'),
    description: 'Portuguese-style flame-grilled peri-peri chicken chain.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  bar_pulpo_by_movida: restaurant({
    name: 'Bar Pulpo by MoVida',
    cuisine: 'Spanish, Tapas',
    amenity: 'bar',
    website: 'https://www.movida.com.au',
    logoUrl: logo('movida.com.au'),
    description: 'A tapas bar from the MoVida group, serving Spanish share plates with an extensive Spanish and Australian wine list.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  cafe_sol: restaurant({
    name: 'Cafe Sol',
    cuisine: 'Café, Quick Bites',
    amenity: 'cafe',
    description: 'A café serving fresh meals and snacks on the way to the international gates.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 2, airside, near international gates' })],
  }),
  the_cellar_bar_bistro: restaurant({
    name: 'The Cellar Bar & Bistro',
    cuisine: 'Wine Bar, Bistro',
    amenity: 'bar',
    description: 'A wine bar and bistro offering seasonal dishes, premium local wines, craft beer and cocktails for pre-flight dining.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  flat_chat_espresso_bar: restaurant({
    name: 'Flat Chat Espresso & Bar',
    cuisine: 'Café, Coffee, Bar',
    amenity: 'cafe',
    description: 'Specialty coffee (roasted by ST. ALi) and craft beer, local wines, artisan rolls and pastries.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  axil_coffee_roasters: restaurant({
    name: 'Axil Coffee Roasters',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.axilcoffee.com.au',
    logoUrl: logo('axilcoffee.com.au'),
    description: 'Specialty coffee roaster serving espresso alongside jaffles and pastries.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, Landside 02' })],
  }),
  brunetti_classico_t2: restaurant({
    name: 'Brunetti Classico',
    cuisine: 'Italian, Café, Pasticceria',
    amenity: 'cafe',
    website: 'https://www.brunetticlassico.com.au',
    logoUrl: logo('brunetticlassico.com.au'),
    description: "Melbourne's well-known Italian pasticceria, serving artisan pasta, cakes, gelato, coffee, pizza, salads and panini. One of three Melbourne Airport outlets (also in Terminal 1 and Terminal 4).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  grilld_healthy_burgers: restaurant({
    name: "Grill'd Healthy Burgers",
    cuisine: 'Burgers',
    amenity: 'fast_food',
    website: 'https://www.grilld.com.au',
    logoUrl: logo('grilld.com.au'),
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: '"Guilt-free, delicious" burgers since 2004, with vegan, vegetarian and gluten-free options.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  nooodles: restaurant({
    name: 'Nooodles',
    cuisine: 'Asian, Noodles',
    amenity: 'restaurant',
    halal: true,
    glutenFree: true,
    description: 'Hot, soupy Asian noodle dishes; halal, MSG-free and gluten-free options available.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  pizza_al_taglio: restaurant({
    name: 'Pizza Al Taglio',
    cuisine: 'Italian, Pizza',
    amenity: 'fast_food',
    description: 'Traditional Italian toppings on artisan dough, sold by the slice.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  subway_t2: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches',
    amenity: 'fast_food',
    website: 'https://www.subway.com.au',
    logoUrl: logo('subway.com.au'),
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'Made-to-order sandwiches; vegan, vegetarian and gluten-free options available. One of two Melbourne Airport outlets (also in Terminal 4).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  ba_xa: restaurant({
    name: 'Bà Xã',
    cuisine: 'South-East Asian',
    amenity: 'restaurant',
    vegetarian: true,
    glutenFree: true,
    description: 'Casual South-East Asian dining, with vegetarian and gluten-free options.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  urban_provodore: restaurant({
    name: 'Urban Provodore',
    cuisine: 'Café, Healthy',
    amenity: 'cafe',
    description: 'Healthy meals cooked from fresh, local ingredients.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  salsas_fresh_mex: restaurant({
    name: 'Salsas Fresh Mex',
    cuisine: 'Mexican',
    amenity: 'fast_food',
    website: 'https://www.salsas.com.au',
    logoUrl: logo('salsas.com.au'),
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'Fresh Mexican fast-casual food, with vegetarian, gluten-free and vegan options.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  two_johns_taphouse_t2: restaurant({
    name: 'Two Johns Taphouse',
    cuisine: 'Bar, Pub Food',
    amenity: 'bar',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'A local pub in the heart of the airport, with vegan, vegetarian and gluten-free options. One of two Melbourne Airport outlets (also in Terminal 4).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  little_lygon: restaurant({
    name: 'Little Lygon',
    cuisine: 'Italian Deli',
    amenity: 'fast_food',
    description: "A deli and panino counter inspired by Carlton's Lygon Street, serving fresh pasta and panini.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International' })],
  }),
  villa_and_hut: restaurant({
    name: 'Villa & Hut',
    cuisine: 'Café',
    amenity: 'cafe',
    description: 'An airport café/kiosk serving coffee and casual food.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 2, International Arrivals hall' })],
  }),
};

// ─── Terminal 3 venues (Virgin Australia Domestic) ───────────────────────────

const t3Venues = {
  hudsons_coffee_t3: restaurant({
    name: 'Hudsons Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.hudsonscoffee.com.au',
    logoUrl: logo('hudsonscoffee.com.au'),
    description: 'Australian coffee chain outlet, serving Melbourne-style coffee and quick bites.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3' })],
  }),
  boost_juice_t3: restaurant({
    name: 'Boost Juice',
    cuisine: 'Juice, Smoothies',
    amenity: 'fast_food',
    website: 'https://www.boostjuice.com.au',
    logoUrl: logo('boostjuice.com.au'),
    description: 'Fresh juices and smoothies. One of two Melbourne Airport outlets (also in Terminal 4).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3' })],
  }),
  dumpling_co: restaurant({
    name: 'Dumpling Co',
    cuisine: 'Asian, Dumplings',
    amenity: 'fast_food',
    description: 'Dumplings, dim sims, banh mi and Asian salads in the "Little Melbourne" dining precinct.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, Little Melbourne precinct' })],
  }),
  noodles_xo: restaurant({
    name: 'Noodles XO',
    cuisine: 'Asian, Noodles',
    amenity: 'restaurant',
    description: 'Bold, cooked-to-order noodle dishes in the "Little Melbourne" dining precinct.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, Little Melbourne precinct' })],
  }),
  coffee_capital: restaurant({
    name: 'Coffee Capital',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'City-roaster coffee, iced drinks, teas and shakes in the "Little Melbourne" dining precinct.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3, Little Melbourne precinct' })],
  }),
  afl_kitchen_bar: restaurant({
    name: 'AFL Kitchen & Bar',
    cuisine: 'Sports Bar, Pub Food',
    amenity: 'bar',
    description: "An AFL-themed sports bar with pub food, drinks and big screens, part of Terminal 3's redevelopment.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3' })],
  }),
  biggie_smalls: restaurant({
    name: 'Biggie Smalls',
    cuisine: 'Bar, Café',
    amenity: 'bar',
    website: 'https://www.biggiesmalls.com.au',
    logoUrl: logo('biggiesmalls.com.au'),
    description: 'A 90s-hip-hop-themed bar and café from chef Shane Delia, serving vibrant food and drinks.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3' })],
  }),
  earl_canteen: restaurant({
    name: 'EARL Canteen',
    cuisine: 'Café, Quick Bites',
    amenity: 'cafe',
    website: 'https://www.earlcanteen.com.au',
    logoUrl: logo('earlcanteen.com.au'),
    description: '"Simple, honest, everyday eats" — breakfasts, coffee, salads and specialty sandwiches made from locally sourced produce.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3, Virgin Australia pier' })],
  }),
  picketts_deli_rotisserie: restaurant({
    name: "Pickett's Deli & Rotisserie",
    cuisine: 'Deli, Rotisserie',
    amenity: 'restaurant',
    website: 'https://www.pickettsdeli.com',
    logoUrl: logo('pickettsdeli.com'),
    vegetarian: true,
    glutenFree: true,
    description: "Chef Scott Pickett's deli, serving gourmet breakfast, sandwiches and rotisserie dinner mains around the clock; opened in the former P.J. O'Brien's space, with vegetarian and gluten-free options.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3', openingHours: '24 hours', open247: true })],
  }),
  stomping_ground_brewery: restaurant({
    name: 'Stomping Ground Brewery',
    cuisine: 'Brewery, Bar',
    amenity: 'bar',
    website: 'https://www.stompingground.beer',
    logoUrl: logo('stompingground.beer'),
    description: "Australia's first airport brewery, serving award-winning Melbourne craft beer alongside a High Country-inspired menu.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal 3, Pier E, before Gates 4 and 6' })],
  }),
  sushi_jiro_express_t3: restaurant({
    name: 'Sushi Jiro Express',
    cuisine: 'Japanese, Sushi',
    amenity: 'fast_food',
    website: 'https://www.sushijiro.com.au',
    logoUrl: logo('sushijiro.com.au'),
    description: 'A quick-service sister outlet of Sushi Jiro, serving handcrafted, traditional sushi.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 3' })],
  }),
};

// ─── Terminal 4 venues (Jetstar, Rex, Virgin Australia & Link Airways) ──────

const t4Venues = {
  mcdonalds_t4: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://mcdonalds.com.au',
    logoUrl: logo('mcdonalds.com.au'),
    description: 'Fast-food chain using 100% Australian beef; trades 24 hours. One of two Melbourne Airport outlets (also in Terminal 2).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4', openingHours: '24 hours', open247: true })],
  }),
  oporto: restaurant({
    name: 'Oporto',
    cuisine: 'Portuguese, Chicken',
    amenity: 'fast_food',
    website: 'https://www.oporto.com.au',
    logoUrl: logo('oporto.com.au'),
    description: 'Flame-grilled Portuguese-style chicken chain.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  subway_t4: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches',
    amenity: 'fast_food',
    website: 'https://www.subway.com.au',
    logoUrl: logo('subway.com.au'),
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'Made-to-order sandwiches; vegan, vegetarian and gluten-free options available. One of two Melbourne Airport outlets (also in Terminal 2).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  brasserie_bread: restaurant({
    name: 'Brasserie Bread',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    website: 'https://www.brasseriebread.com.au',
    logoUrl: logo('brasseriebread.com.au'),
    description: "One of Australia's leading sourdough bakeries, serving artisan bread, sweets, muffins and sandwiches.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  boost_juice_t4: restaurant({
    name: 'Boost Juice',
    cuisine: 'Juice, Smoothies',
    amenity: 'fast_food',
    website: 'https://www.boostjuice.com.au',
    logoUrl: logo('boostjuice.com.au'),
    description: 'Fresh juices and smoothies. One of two Melbourne Airport outlets (also in Terminal 3).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  brunetti_classico_t4: restaurant({
    name: 'Brunetti Classico',
    cuisine: 'Italian, Café, Pasticceria',
    amenity: 'cafe',
    website: 'https://www.brunetticlassico.com.au',
    logoUrl: logo('brunetticlassico.com.au'),
    description: "Melbourne's well-known Italian pasticceria. One of three Melbourne Airport outlets (also in Terminal 1 and Terminal 2).",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  icons_victoria_t4: restaurant({
    name: 'Icons Victoria',
    cuisine: 'Gourmet Food, Wine, Coffee, Tea (Retail)',
    amenity: 'cafe',
    description: 'A curated retail stop for locally-produced Victorian gourmet food, wine, coffee and tea. One of two Melbourne Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  think_asia: restaurant({
    name: 'Think Asia',
    cuisine: 'Pan-Asian',
    amenity: 'restaurant',
    website: 'https://www.thinkasiaexperience.com.au',
    logoUrl: logo('thinkasiaexperience.com.au'),
    description: 'Traditional and contemporary pan-Asian dishes in the Terminal 4 food court.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4, food court', openingHours: '9:00 - 21:00' })],
  }),
  mezze_za_za: restaurant({
    name: 'Mezze Za Za',
    cuisine: 'Mediterranean, Middle Eastern',
    amenity: 'restaurant',
    description: 'Mediterranean and Middle Eastern share plates and mezze in the Terminal 4 food court.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4, food court' })],
  }),
  daniels_donuts_t4: restaurant({
    name: "Daniel's Donuts",
    cuisine: 'Doughnuts, Sweets',
    amenity: 'bakery',
    website: 'https://www.danielsdonuts.com.au',
    logoUrl: logo('danielsdonuts.com.au'),
    description: 'Fresh doughnuts, milkshakes and pies. One of two Melbourne Airport outlets (also in Terminal 1).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  gusto_pasta_bar: restaurant({
    name: 'Gusto Pasta Bar',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'Fresh pasta made and cooked to order on-site, plus daily pastries, paninis and Italian coffee.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  hannas_cafe: restaurant({
    name: "Hanna's Cafe",
    cuisine: 'Café',
    amenity: 'cafe',
    website: 'https://www.hannascafe.com.au',
    logoUrl: logo('hannascafe.com.au'),
    halal: true,
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'A long-running airport café (over 18 years) serving coffee and food, with halal, vegan, vegetarian and gluten-free options.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  sushi_sushi: restaurant({
    name: 'Sushi Sushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'fast_food',
    website: 'https://www.sushisushi.com.au',
    logoUrl: logo('sushisushi.com.au'),
    description: 'Fresh sushi and Japanese food, hand-rolled and packaged fresh daily.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
  }),
  two_johns_taphouse_t4: restaurant({
    name: 'Two Johns Taphouse',
    cuisine: 'Bar, Pub Food',
    amenity: 'bar',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'A local pub in the heart of the airport, with vegan, vegetarian and gluten-free options. One of two Melbourne Airport outlets (also in Terminal 2).',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Terminal 4' })],
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

  const t1Result = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', t1Venues);
  const t2Result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', t2Venues);
  const t3Result = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues);
  const t4Result = await processTerminal(AIRPORT, TERMINAL_4, 'Terminal 4', t4Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3, TERMINAL_4]));

  const totalCreated = t1Result.created + t2Result.created + t3Result.created + t4Result.created;
  const totalDeleted = t1Result.deleted + t2Result.deleted + t3Result.deleted + t4Result.deleted;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t2Venues).length + Object.keys(t3Venues).length + Object.keys(t4Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
