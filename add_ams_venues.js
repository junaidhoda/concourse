'use strict';
/**
 * Adds the missing Amsterdam Schiphol (AMS) restaurants/bars/cafés to Firestore.
 *
 * Context: airports/ams/terminals/main_terminal/restaurants only had 15 of the
 * 56 real venues listed on Schiphol's official "Restaurants, bars and cafés"
 * page (schiphol.nl/en/at-schiphol/eat-and-drink/facilities/). This script adds
 * the other 41, cross-referenced against that page on 2026-08-03, using the
 * exact same restaurant()/outlet() schema as the admin app's editor screen
 * (app/airport_app/lib/screens/admin_restaurant_editor_screen.dart) and the
 * other upload_*.js scripts in this repo.
 *
 * It will NOT touch the 15 existing docs (including "Douwe Egberts Coffee Bar",
 * which is the same physical outlet Schiphol now just calls "Coffee Bar" —
 * left alone since its data is already accurate).
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_ams_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const AIRPORT = 'ams';
const basePath = `airports/${AIRPORT}/terminals/main_terminal/restaurants`;

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

// ─── data — 41 venues from schiphol.nl's official directory, not yet in Firestore ──

const venues = {
  frames_main_terminal: restaurant({
    name: 'Frames',
    cuisine: 'International, Wine Bar',
    amenity: 'restaurant',
    description: 'Design-led all-day dining spot serving breakfast through dinner, with fine wines, creative small plates and décor inspired by the Stedelijk Museum.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2. On your way to gates D1-D57, E, F, G and H.', openingHours: '07:00 - 21:00' })],
  }),

  grab_and_fly_main_terminal: restaurant({
    name: 'Grab&Fly',
    cuisine: 'Snacks, Grab & Go',
    amenity: 'fast_food',
    description: 'Chain of small kiosks scattered across the piers selling last-minute snacks, crisps, confectionery and soft drinks on the way to the gate.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, B-pier. On your way to gate B.', openingHours: '24/7', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'After security, C-pier. On your way to gate C.', openingHours: '03:00 - 21:30' }),
      outlet({ airside: 'airside', locationNotes: 'After security, D-pier. On your way to gates D59-D87.', openingHours: '24/7', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'After security, E-pier. On your way to gate E.', openingHours: '24/7', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'After security, F-pier. On your way to gate F.', openingHours: '24/7', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'After security, G-pier. On your way to gate G.', openingHours: '24/7', open247: true }),
    ],
  }),

  grand_cafe_plaza_main_terminal: restaurant({
    name: 'Grand Café Plaza',
    cuisine: 'Café, International',
    amenity: 'restaurant',
    description: 'All-day grand café on Plaza covering breakfast, lunch and dinner, from sandwiches and salads to warm dishes and seasonal specials.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before security, Plaza. Accessible to all visitors and passengers.', openingHours: '24/7', open247: true })],
  }),

  harvest_market_main_terminal: restaurant({
    name: 'Harvest Market',
    cuisine: 'International, Pizza',
    amenity: 'restaurant',
    description: 'Market-style restaurant built around seasonal produce, with oven pizzas, burgers off the grill, fresh breakfasts and a wide range of gluten-free options.',
    glutenFree: true,
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, D-pier. On your way to gates D1-D57.', openingHours: '24/7', open247: true })],
  }),

  heineken_bar_main_terminal: restaurant({
    name: 'Heineken Bar',
    cuisine: 'Bar, Dutch',
    amenity: 'bar',
    description: 'Dutch beer bar built around a perfectly poured Heineken, with juicy burgers, hotdogs and bites to share.',
    logoUrl: logo('heineken.com'),
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2. On your way to gates D1-D57, E, F, G and H.', openingHours: '06:30 - 21:00' })],
  }),

  hello_goodbye_bar_main_terminal: restaurant({
    name: 'Hello Goodbye Bar',
    cuisine: 'Café, Bar',
    amenity: 'cafe',
    description: "Cosy arrivals-hall café for a refreshing drink, good coffee and homemade toasties that change daily.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before security, Arrivals 1. Accessible to all visitors and passengers.', openingHours: 'Thu - Sat 00:30 - 00:00' })],
  }),

  hema_food_main_terminal: restaurant({
    name: 'HEMA Food',
    cuisine: 'Dutch, Fast Food',
    amenity: 'fast_food',
    description: 'Take-away counter from Dutch retailer HEMA, known for its smoked sausage, hot dogs and sandwiches, plus coffee and smoothies.',
    logoUrl: logo('hema.com'),
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before security, Plaza. Accessible to all visitors and passengers.', openingHours: '06:30 - 22:00' })],
  }),

  het_koekemannetje_main_terminal: restaurant({
    name: 'Het Koekemannetje',
    cuisine: 'Bakery, Snacks',
    amenity: 'bakery',
    description: 'Cookie stall baking soft, chocolate-loaded biscuits fresh each day from local flour and Belgian chocolate.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '06:30 - 22:00' })],
  }),

  joe_and_the_juice_main_terminal: restaurant({
    name: 'Joe & The Juice',
    cuisine: 'Juice Bar, Café',
    amenity: 'cafe',
    description: 'Danish juice-and-coffee chain serving fresh juices, smoothies, coffee and sandwiches, all with organic ingredients.',
    logoUrl: logo('joejuice.com'),
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 3. On your way to gates D1-D57, E, F, G and H.', openingHours: '06:30 - 21:00' })],
  }),

  kebaya_main_terminal: restaurant({
    name: 'Kebaya',
    cuisine: 'Asian, Pan-Asian',
    amenity: 'restaurant',
    description: '24 dishes from seven countries — Indonesian, Vietnamese, Japanese and Chinese among them — prepared to order in an open kitchen, with a separate take-away counter.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Holland Boulevard. On your way to gates D1-D57, E, F, G and H.', openingHours: '10:00 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2 (take-away). On your way to gates D1-D57, E, F, G and H.', openingHours: '07:00 - 21:30' }),
    ],
  }),

  kiosco_comunal_main_terminal: restaurant({
    name: 'Kiosco Comunal',
    cuisine: 'Café, Grab & Go',
    amenity: 'fast_food',
    description: 'Compact grab-and-go sibling of Café Comunal, with warm sandwiches, fresh salads, pastries, fruit and yoghurt.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, C-pier. On your way to gate C.', openingHours: '05:00 - 21:00' })],
  }),

  kiosk_b_pier_main_terminal: restaurant({
    name: 'Kiosk',
    cuisine: 'Snacks, Grab & Go',
    amenity: 'fast_food',
    description: 'Last stop before the gate for coffee, snacks and sweet treats to go.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, B-pier. On your way to gate B.', openingHours: '05:00 - 21:30' })],
  }),

  la_place_main_terminal: restaurant({
    name: 'La Place',
    cuisine: 'Café, Bakery, International',
    amenity: 'restaurant',
    description: 'Market-style eatery for hand-prepared sandwiches, taglio pizza, crisp salads and soup, with a quicker La Place Express counter also on Plaza for juices, flatbreads and snacks.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '02:00 - 21:00' })],
  }),

  lavazza_main_terminal: restaurant({
    name: 'Lavazza',
    cuisine: 'Café, Italian',
    amenity: 'cafe',
    description: 'Italian coffee bar for espresso, cappuccino, rolls, salads and confectionery to go.',
    logoUrl: logo('lavazza.com'),
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, D-pier. On your way to gates D1-D57.', openingHours: '06:00 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2. On your way to gates D1-D57, E, F, G and H.', openingHours: '07:00 - 21:00' }),
    ],
  }),

  leon_main_terminal: restaurant({
    name: 'LEON',
    cuisine: 'Fast Food, Mediterranean',
    amenity: 'fast_food',
    description: 'British healthy-fast-food chain with Mediterranean-leaning porridge, wraps, rice bowls and salads.',
    vegetarian: true,
    logoUrl: logo('leon.co'),
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '07:00 - 21:00' })],
  }),

  loaf_main_terminal: restaurant({
    name: 'LOAF',
    cuisine: 'French, Bakery',
    amenity: 'bakery',
    description: 'French-style bakery with an open terrace and nearly 200 seats, serving handmade sourdough baguettes and sandwiches around the clock.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '24/7', open247: true })],
  }),

  mcdonald_s_main_terminal: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, American',
    amenity: 'fast_food',
    description: 'Global fast-food chain serving burgers, fries, salads, wraps and fruit, plus the Dutch specialty McKroket.',
    logoUrl: logo('mcdonalds.com'),
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 3. On your way to gates D1-D57, E, F, G and H.', openingHours: '06:00 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2. On your way to gates D1-D57, E, F, G and H.', openingHours: '05:00 - 21:30' }),
    ],
  }),

  moods_eatery_bar_main_terminal: restaurant({
    name: 'Moods Eatery & Bar',
    cuisine: 'American, Bar',
    amenity: 'bar',
    description: 'All-day eatery and bar for juicy burgers and an ice-cold beer, or breakfast buns and fresh juices for a lighter start.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, F-pier. On your way to gate F.', openingHours: '08:00 - 21:00' })],
  }),

  murphy_s_irish_pub_main_terminal: restaurant({
    name: "Murphy's Irish Pub",
    cuisine: 'Irish, Pub',
    amenity: 'pub',
    description: "Traditional Irish pub for a proper pint of Murphy's Stout and hearty pub classics in a warm, wood-panelled setting.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, D-pier. On your way to gates D1-D57.', openingHours: '06:30 - 21:00' })],
  }),

  olea_main_terminal: restaurant({
    name: 'Olea',
    cuisine: 'Mediterranean, Bar',
    amenity: 'bar',
    description: 'Mediterranean-style bar on the E-pier with a striking light installation, serving Mediterranean sandwiches, desserts and a wide drinks selection.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, E-pier. On your way to gate E.', openingHours: '06:30 - 21:00' })],
  }),

  pana_eatery_bar_main_terminal: restaurant({
    name: 'Pana Eatery & Bar',
    cuisine: 'Mediterranean, Bar',
    amenity: 'bar',
    description: 'Colourful G-pier bar with handmade flatbreads, crisp salads, bar bites and a cocktail-led drinks menu.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, G-pier. On your way to gate G.', openingHours: '06:30 - 21:00' })],
  }),

  panorama_restaurant_main_terminal: restaurant({
    name: 'Panorama Restaurant',
    cuisine: 'International',
    amenity: 'restaurant',
    description: 'Restaurant on the third floor of Departures 1 with a terrace overlooking the runways — pizza, burgers, chicken nuggets and salads with a view of planes taking off.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before security, Panorama terrace. Walk towards Departures 1 and take the lift or stairs to the 3rd floor.', openingHours: '09:00 - 20:00' })],
  }),

  park_cafe_main_terminal: restaurant({
    name: 'Park Café',
    cuisine: 'Café, Healthy',
    amenity: 'cafe',
    description: 'Relaxed lounge-chair hangout for a fresh sandwich, salad or juice, or a build-your-own burger.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '24/7', open247: true })],
  }),

  per_tutti_main_terminal: restaurant({
    name: 'Per Tutti!',
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    description: 'Italian spot on Plaza for handmade pasta, pizza, fresh salads, sandwiches and Illy coffee, sit-down or to go.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before security, Plaza. Accessible to all visitors and passengers.', openingHours: '07:00 - 22:00' })],
  }),

  poke_perfect_main_terminal: restaurant({
    name: 'Poké Perfect',
    cuisine: 'Poke, Healthy',
    amenity: 'fast_food',
    description: 'Fresh poké bowls with fish, meat or vegan options — pick a signature bowl or build your own, plus sides and a drink.',
    vegan: true,
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before security, Plaza. Accessible to all visitors and passengers.', openingHours: '10:00 - 22:00' })],
  }),

  salon_main_terminal: restaurant({
    name: 'Salon',
    cuisine: 'Café, International',
    amenity: 'restaurant',
    description: 'Amsterdam-inspired Grand Café and Deli combined under one roof in Lounge 1, with over 300 seats and a varied menu for any time of day.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1 (Deli Salon). On your way to gates B, C and D59-D87.', openingHours: '04:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1 (Grand Café Salon). On your way to gates B, C and D59-D87.', openingHours: '06:30 - 21:30' }),
    ],
  }),

  silverscreen_bar_main_terminal: restaurant({
    name: 'Silverscreen Bar',
    cuisine: 'American, Bar',
    amenity: 'bar',
    description: 'Retro movie-set styled bar near the E-pier serving iconic American dishes including the classic smashburger.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, E-pier. On your way to gate E.', openingHours: '06:30 - 21:00' })],
  }),

  stach_main_terminal: restaurant({
    name: 'STACH',
    cuisine: 'Café, Healthy',
    amenity: 'cafe',
    description: 'Fresh food for life on the move — cold-pressed juices, coffee, sandwiches, salads and seasonal products from local suppliers, with vegan options.',
    vegan: true,
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 4. On your way to gate M.', openingHours: '04:30 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, Holland Boulevard. On your way to gates D1-D57, E, F, G and H.', openingHours: '06:30 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, D Pier. On your way to gate D.', openingHours: '05:00 - 21:00' }),
    ],
  }),

  starbucks_main_terminal: restaurant({
    name: 'Starbucks',
    cuisine: 'Café',
    amenity: 'cafe',
    description: 'World-famous coffee chain for hot and cold coffee drinks, lattes and pastries to go.',
    logoUrl: logo('starbucks.com'),
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '24/7', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2 (The Pavillion). On your way to gates D1-D57, E, F, G and H.', openingHours: '04:00 - 21:30' }),
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 3. On your way to gates D1-D57, E, F, G and H.', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, C-pier. On your way to gate C.', openingHours: '06:30 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, D Pier. On your way to gate D.', openingHours: '06:30 - 21:30' }),
    ],
  }),

  street_food_market_main_terminal: restaurant({
    name: 'Street Food Market',
    cuisine: 'International, Pizza',
    amenity: 'food_court',
    description: 'Two stalls in one spot: The Oven for freshly baked pizzas, salads and homemade lemonade, and The Grill for hot dogs loaded with toppings.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2 (The Oven & The Grill). On your way to gates D1-D57, E, F, G and H.', openingHours: '07:00 - 21:00' })],
  }),

  sushi_noodles_main_terminal: restaurant({
    name: 'Sushi & Noodles',
    cuisine: 'Japanese, Asian',
    amenity: 'fast_food',
    description: 'Sushi prepared fresh in view of guests, plus homemade noodle dishes — quick to take away or eat in the seating area nearby.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 2. On your way to gates D1-D57, E, F, G and H.', openingHours: '07:00 - 21:00' })],
  }),

  the_butcher_main_terminal: restaurant({
    name: 'The Butcher',
    cuisine: 'American, Burgers',
    amenity: 'fast_food',
    description: 'Dutch burger brand serving smashed and classic burgers, schnitzels, steaks, fries and boozy milkshakes, plus a full breakfast.',
    logoUrl: logo('thebutcher.nl'),
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, F-pier. On your way to gate F.', openingHours: '07:00 - 22:00' })],
  }),

  upper_floor_bar_main_terminal: restaurant({
    name: 'The Upper Floor Bar',
    cuisine: 'Bar',
    amenity: 'bar',
    description: 'Runway-view bar for a drink while watching planes take off and land.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '02:00 - 21:00' })],
  }),

  the_wanderer_main_terminal: restaurant({
    name: 'The Wanderer',
    cuisine: 'International, Bar',
    amenity: 'bar',
    description: 'Extravagant all-day bar with handcrafted cocktails, streetfood-style dishes from around the world, a mocktail vending machine and a live DJ.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '07:00 - 21:00' })],
  }),

  two_tigers_main_terminal: restaurant({
    name: 'Two Tigers',
    cuisine: 'Asian, Sushi',
    amenity: 'fast_food',
    description: 'Modern Asian counter with sushi prepared to order, homemade noodles and snacks for a quick, affordable meal to take on board.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '07:00 - 21:00' })],
  }),

  urban_beans_main_terminal: restaurant({
    name: 'Urban Beans',
    cuisine: 'Café',
    amenity: 'cafe',
    description: 'Quick coffee stop for a cappuccino, espresso or pastry to go.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, D-pier. On your way to gates D1-D57.', openingHours: '04:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, E-pier. On your way to gate E.', openingHours: '08:00 - 14:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, M hall. On your way to gate M.', openingHours: '06:00 - 12:00' }),
    ],
  }),

  urban_food_market_main_terminal: restaurant({
    name: 'Urban Food Market',
    cuisine: 'Dutch, Sandwiches',
    amenity: 'food_court',
    description: 'Dutch-style market restaurant with warm and cold sandwiches made fresh in view of guests, topped with grilled chicken, smoked salmon or tuna, plus fresh juices.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 4. On your way to gate M.', openingHours: '05:00 - 21:00' })],
  }),

  vit_main_terminal: restaurant({
    name: 'VIT',
    cuisine: 'Healthy, Juice Bar',
    amenity: 'cafe',
    description: 'Fresh juices, smoothies, nourishing meals and sugar-free treats made from natural ingredients, prepared to order or ready to grab and go.',
    glutenFree: true,
    outlets: [outlet({ airside: 'airside', locationNotes: 'After security, Lounge 3. On your way to gates D1-D57, E, F, G and H.', openingHours: '07:00 - 21:00' })],
  }),

  wingstop_main_terminal: restaurant({
    name: 'Wingstop',
    cuisine: 'Fast Food, American',
    amenity: 'fast_food',
    description: 'American wings-and-tenders chain with more than 10 flavours from sweet to extra spicy, plus crispy sides.',
    logoUrl: logo('wingstop.com'),
    outlets: [outlet({ airside: 'landside', locationNotes: 'Before security, Plaza. Accessible to all visitors and passengers.', openingHours: '10:00 - 22:00' })],
  }),

  de_koffiesalon_main_terminal: restaurant({
    name: 'De Koffiesalon',
    cuisine: 'Café',
    amenity: 'cafe',
    description: "Fair-trade Buscaglione coffee brewed Italian-style, paired with a cookie or brownie. Found inside the UP TO DO GOOD concept store on Plaza, in Arrivals 1, in Lounge 1, and as a smaller 'Piaggio' cart near gates B16 and D74.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Lounge 1. On your way to gates B, C and D59-D87.', openingHours: '04:00 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'After security, B-pier (Piaggio cart, near gate B16). On your way to gate B.', openingHours: '' }),
      outlet({ airside: 'airside', locationNotes: 'After security, D-pier (Piaggio cart, near gate D74). On your way to gates D59-D87.', openingHours: '07:00 - 15:00' }),
    ],
  }),

  febo_main_terminal: restaurant({
    name: 'FEBO',
    cuisine: 'Dutch, Fast Food',
    amenity: 'fast_food',
    description: "Dutch vending-wall classic, famous for crispy croquettes, a juicy grill burger and golden fries, freshly prepared each morning in FEBO's own kitchen.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Before security, Plaza. Accessible to all visitors and passengers.', openingHours: '10:00 - 22:00' }),
      outlet({ airside: 'landside', locationNotes: 'Before security, Arrivals 2 (FEBO Wall). Accessible to all visitors and passengers.', openingHours: '12:00 - 20:00' }),
    ],
  }),
};

// ─── upload ────────────────────────────────────────────────────────────────

async function run() {
  const colRef = db.collection('airports').doc(AIRPORT)
    .collection('terminals').doc('main_terminal')
    .collection('restaurants');

  const ids = Object.keys(venues);
  console.log(`\nAdding ${ids.length} missing AMS venues to ${basePath} ...\n`);

  const batch = db.batch();
  for (const id of ids) {
    batch.set(colRef.doc(id), venues[id], { merge: false });
    console.log(`  Queued: ${venues[id].name} (${id})`);
  }
  await batch.commit();

  console.log(`\n✅ Done — added ${ids.length} restaurant documents for AMS.`);
  console.log(`   AMS now has 15 (existing) + ${ids.length} (new) = ${15 + ids.length} venues,`);
  console.log('   matching the 56 listed on schiphol.nl/en/at-schiphol/eat-and-drink/facilities/.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
