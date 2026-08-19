'use strict';
/**
 * Fills in complete data for all Athens International Airport (ATH) restaurants
 * in Firestore, cross-referenced against the official AIA "Restaurants & Coffee
 * Shops" directory (aia.gr/en/traveller/airport-agora/restaurants-coffee-shops-airport)
 * on 2026-08-03.
 *
 * Context: app/tools/data/restaurants/ath_restaurants.csv had 33 rows for ATH,
 * mostly with placeholder/generic descriptions and blank hours/phone/zone detail.
 * The live aia.gr directory lists 34 venues — the same 33 by name, plus one new
 * one ("Overoll"). This script covers all 34 with real, verified data (zone,
 * description, phone, opening hours) pulled directly from each venue's detail
 * page on aia.gr, using the exact same restaurant()/outlet() schema as the admin
 * app's editor screen (app/airport_app/lib/screens/admin_restaurant_editor_screen.dart).
 *
 * Because Firebase Console access wasn't available to inspect the live ath
 * Firestore state directly, this script does NOT assume fixed doc IDs. Instead
 * it:
 *   1. Reads all existing docs in airports/ath/terminals/main_terminal/restaurants
 *   2. For each of the 34 real venues, matches by normalized name
 *      - If a matching doc exists -> full overwrite (.set with merge:false) so
 *        every field is completely filled in, per the task ("even if all
 *        restaurants are already there").
 *      - If no match exists (expected only for "Overoll") -> creates a new doc
 *        with a generated slug ID.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_ath_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const AIRPORT = 'ath';
const TERMINAL = 'main_terminal';
const colRef = db.collection(`airports/${AIRPORT}/terminals/${TERMINAL}/restaurants`);

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

function normalizeName(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Zone → airside/location_notes convention used across this doc:
//   All Users Area      -> landside (before security, open to all)
//   Railway Station      -> landside (metro/suburban rail station, before security)
//   Baggage Reclaim Area -> landside (arrivals, before customs exit)
//   Schengen Area         -> airside (departures, Schengen flights)
//   Non Schengen Area     -> airside (departures, non-Schengen/international flights)
//   Satellite             -> airside (Satellite Terminal, reached by train after security)

const zoneNotes = {
  allUsers: 'Before security, All Users Area (landside terminal — accessible to all visitors and passengers).',
  railway: "Before security, at Athens Airport's Railway/Metro Station (Line 3 / Suburban Railway).",
  baggage: 'Landside, in the Baggage Reclaim / Arrivals area, before the customs exit.',
  schengen: 'After security, Schengen Area (departures for Schengen-zone flights).',
  nonSchengen: 'After security, Non-Schengen Area (departures for international/non-Schengen flights).',
  satellite: 'After security, Satellite Terminal (reached via the free automated train from the Main Terminal).',
};

// ─── data — all 34 real venues from aia.gr's official directory ─────────────

const venues = {
  amore: restaurant({
    name: 'Amore',
    cuisine: 'Italian, Café',
    amenity: 'restaurant',
    description: 'A taste of Italy with authentic dishes and quick takeaway options. Amore offers a culinary journey through the flavours and traditions of different regions of Italy, with a dine-in menu of pizza, risotto, pasta and salads, plus grab-and-go focaccia sandwiches, cold and hot beverages, organic coffee and desserts.',
    phone: '+30 210 3534226',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen} Departures, Platea.`, openingHours: 'Self Service Mon-Sun 05:00-23:00; Dine-in Mon-Sun 11:00-23:00' }),
    ],
  }),

  ancho: restaurant({
    name: 'Ancho',
    cuisine: 'Mexican, Tex-Mex',
    amenity: 'restaurant',
    description: 'Experience the flavours of Mexico with spicy dishes and quick takeaway options. Ancho takes you on a journey to vibrant Mexico through bold flavours and a lively, atmospheric setting reflecting an authentic Tex-Mex restaurant — build your own burrito and pair it with a chilled margarita, or grab nachos on the move.',
    phone: '+30 210 3531459',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: 'Mon-Sun 10:00 - 22:00' }),
    ],
  }),

  artisan_taf: restaurant({
    name: 'Artisan-Taf',
    cuisine: 'Café, Vegan, Bakery',
    amenity: 'cafe',
    vegan: true,
    description: 'Specialty coffee, artisanal pizza and inventive vegan dishes. Artisan-Taf is an oasis of culinary elegance with a coffee collection from Taf expertly prepared by skilled baristi, plus a menu of Italian pizza, homemade sandwiches, fresh juices and a wide range of vegan options such as the Tofu Tango Rice Bowl, Smoky Jackfruit Noodle Bowl and Acai Kick and Green Reviver salads.',
    phone: '+30 210 3531119',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: '24 hours', open247: true }),
    ],
  }),

  barbadimos: restaurant({
    name: 'Barbadimos',
    cuisine: 'Greek',
    amenity: 'restaurant',
    description: "Savor the authentic flavors of Greece. Through the history, experience and recipes of one of the oldest restaurants in Piraeus, Barbadimos focuses on traditional Greek cuisine — its gyros is a unique and beloved meal that won't let you down.",
    phone: '+30 210 3533477',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: 'Mon-Sun 05:00 - 22:00' }),
    ],
  }),

  bistrot_attica_athens_lukumades: restaurant({
    name: 'Bistrot Attica Athens / Lukumades',
    cuisine: 'Greek, Café, Desserts',
    amenity: 'restaurant',
    description: 'Seasonal delights and sweet treats. Bistrot Attica Athens is the ideal place to enjoy a meal before your flight in a traditional open-market environment, with hot dishes renewed regularly according to seasonal ingredients, coffee, beverages, snacks and sweets. Its Lukumades counter serves the famous bite-sized, fried-dough balls traditionally topped with honey and cinnamon, plus a variety of other toppings and fillings.',
    phone: '+30 210 3534226',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen} Departures, Platea.`, openingHours: 'Bistrot Attica Athens: Mon-Sun 24h; Lukumades: Mon-Sun 08:00-21:00' }),
    ],
  }),

  bufala_gelato: restaurant({
    name: 'Bufala Gelato',
    cuisine: 'Italian, Ice Cream, Desserts',
    amenity: 'ice_cream',
    logoUrl: logo('bufalagelato.com'),
    description: 'Premium ice cream and irresistible desserts. Bufala Gelato makes selected ice cream flavors every day using 100% fresh buffalo milk, including the signature Buffle cone (ice cream wrapped in a crunchy bubble waffle) and vanilla or chocolate Buffle pops, plus creamy milkshakes and build-your-own waffles/crepes.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen} Departures, Platea.`, openingHours: 'Mon-Sun 10:00 - 23:00' }),
    ],
  }),

  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('bk.com'),
    description: "Premium burgers and iconic flavors at the home of the Whopper®. BURGER KING® was founded in 1954 and welcomes more than 11 million visitors daily worldwide, offering the original flame-grilled Whopper and exclusive recipes from premium ingredients, with 'Have It Your Way' customisation.",
    phone: '+30 210 3533388',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} 2nd Floor, Entrance 3.`, openingHours: 'Mon-Sun 05:00 - 03:00' }),
    ],
  }),

  camden_food_co: restaurant({
    name: 'Camden Food Co',
    cuisine: 'Café, Sandwiches & Deli',
    amenity: 'cafe',
    logoUrl: logo('camdenfoodco.com'),
    description: 'Fresh pies, sandwiches and everyday favourites. Camden Food Co offers a selection of pies, freshly prepared sandwiches, salads, desserts and a wide variety of hot and cold beverages, served in a welcoming setting — a convenient stop combining quality ingredients with a relaxed atmosphere.',
    phone: '+30 210 3530360',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.satellite}` }),
    ],
  }),

  cinnabon: restaurant({
    name: 'Cinnabon',
    cuisine: 'Bakery, Desserts',
    amenity: 'bakery',
    logoUrl: logo('cinnabon.com'),
    description: 'Irresistible cinnamon rolls and sweet indulgences. Cinnabon offers cinnamon rolls made with premium Indonesian Makara® cinnamon and the brand’s signature cream-cheese frosting, plus cupcakes, cold beverages and milkshakes in a variety of flavours, alongside coffees and ice cream served on the brand’s signature rolls.',
    phone: '+30 210 3530318',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen}` }),
    ],
  }),

  coffee_berry: restaurant({
    name: 'Coffee Berry',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('coffeeberry.coffee'),
    description: 'Premium coffee and gourmet options for every moment. Coffee Berry is a popular urban coffee destination offering a wide range of coffees including the top-selling 100% Arabica Premium Espresso blend, plus freshly prepared sandwiches, healthy salads, yoghurts, homemade cereal bars and selected sweets, premium teas, and packaged coffee beans/capsules and home-barista equipment to go.',
    phone: '+30 210 3534226',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen} Departures, Gate B24.`, openingHours: 'Mon-Sun 05:00 - 22:00' }),
    ],
  }),

  cultivos: restaurant({
    name: 'Cultivos',
    cuisine: 'Café, Healthy',
    amenity: 'cafe',
    description: 'From bean to cup, savour premium specialty coffee. Cultivos follows coffee’s journey from bean to cup, offering specialty coffee in a classic espresso blend and a Single Estate selection, alongside cakes, baked goods, sandwiches and sweets.',
    phone: '+30 210 3533485',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: '24 hours', open247: true }),
    ],
  }),

  easy_grab_n_go: restaurant({
    name: 'EASY grab-n-go',
    cuisine: 'Grab & Go, Café',
    amenity: 'fast_food',
    description: 'Quick pick-me-ups: fresh coffee and tasty snacks. EASY Grab-n-Go serves freshly roasted coffee and a wide selection of beverages, paired with sandwiches, freshly baked pastries or fresh salads — everything needed before boarding, for a pleasant journey.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen} Departures, Gate B31.`, openingHours: 'Mon-Sun 06:00 - 22:00' }),
    ],
  }),

  eat_greek: restaurant({
    name: 'Eat Greek',
    cuisine: 'Greek',
    amenity: 'restaurant',
    description: 'Traditional tastes and fresh snacks. Eat Greek is a restaurant café offering authentic Greek dishes, including the well-known Greek gyros, alongside a variety of freshly prepared sandwiches and other tasty options, plus a selection of hot and cold beverages.',
    phone: '+30 210 3533619',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen} Departures, Platea.`, openingHours: '24 hours', open247: true }),
    ],
  }),

  ergon_greek_cuisine: restaurant({
    name: 'Ergon Greek Cuisine',
    cuisine: 'Greek, Deli',
    amenity: 'restaurant',
    description: 'Artisanal Greek deli and traditional dishes. Ergon is a deli and cuisine concept showcasing a wide range of artisanal Greek products, with a menu of dishes made exclusively from those ingredients — ideal for lunch or dinner, dine-in or takeaway, complemented by Greek wine or beer from local microbreweries.',
    phone: '+30 210 3532940',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen} Departures, Retail Concourse.`, openingHours: 'Self service: Mon-Sun 24h; Dine-in: Mon-Sun 06:30-22:00' }),
    ],
  }),

  everest: restaurant({
    name: 'Everest',
    cuisine: 'Café, Greek, Fast Food',
    amenity: 'cafe',
    description: 'Signature sandwiches, pastries and quality coffee. Everest, a well-known brand in the Greek market, offers its signature sandwiches, a variety of pastry products and a wide selection of coffee options — a convenient stop at any time of day.',
    phone: '+30 210 3532757',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.railway}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen}` }),
    ],
  }),

  everest_exclusive: restaurant({
    name: 'Everest Exclusive',
    cuisine: 'Café, Greek, Bakery',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    description: 'Crafted dough delights: savoury and sweet treats. Everest Exclusive brings a refined approach to street food — its dough matures for 48 hours before baking, forming the basis of savoury and sweet creations including hot/cold sandwiches, pizza, peinirli and filled croissants, plus original sandwich combinations, vegan and vegetarian options, salads, yoghurts with toppings and cereal bars.',
    phone: '+30 210 3533144',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
    ],
  }),

  flocafe_espresso_room: restaurant({
    name: 'Flocafe Espresso Room',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Exceptional coffee blends and gourmet treats. Flocafe Espresso Room offers the ultimate coffee experience with a variety of coffee blends, selected teas, signature beverages and snacks, served by highly trained and certified baristi.',
    phone: '+30 210 3532302',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen}` }),
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
    ],
  }),

  green_veneti_1948: restaurant({
    name: 'Green Veneti 1948',
    cuisine: 'Bakery, Café, Healthy',
    amenity: 'bakery',
    description: 'Refresh and recharge: fresh beverages and wholesome treats. GREEN Veneti 1948 offers freshly-squeezed juices, smoothies and fruits, cold sandwiches with fresh vegetables, outstanding baked goods made with ZEA flour, yoghurts made from 100% pure Greek milk with fruits and nuts, and organic VENETI coffee.',
    phone: '+30 210 3535148',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.satellite} Gates C, Level 2.`, openingHours: 'Mon-Sun 05:00 - 23:00' }),
    ],
  }),

  gregorys: restaurant({
    name: "Gregory's",
    cuisine: 'Fast Food, Greek',
    amenity: 'fast_food',
    logoUrl: logo('gregoryscoffee.com'),
    description: 'The authentic experience: pastries, sandwiches, and coffee. Gregory’s serves traditional Greek pastry alongside tasty and nutritional pies, sandwiches, salads, pasta salads, desserts and an authentic coffee experience.',
    phone: '+30 210 3531459',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen}` }),
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen}` }),
    ],
  }),

  holy_burger: restaurant({
    name: 'Holy Burger',
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    logoUrl: logo('holyburger.nyc'),
    vegan: true,
    description: 'Mouthwatering street food: unique burgers, vegan delights, and refreshing drinks. Holy Burger serves street food made with high-quality ingredients, including burgers made from 100% beef, crispy chicken nuggets, hot dogs, and vegan options like Vegan Burgers and Vegan Nuggets, plus the Caesar’s Chicken Burger and hot dogs paired with draught beer.',
    phone: '+30 210 3530944',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen} Departures, Platea.`, openingHours: 'Mon-Sun 08:00 - 23:00' }),
    ],
  }),

  kayak: restaurant({
    name: 'Kayak',
    cuisine: 'Ice Cream, Desserts',
    amenity: 'ice_cream',
    description: 'Delicious ice cream and refreshing frozen yogurt. Kayak offers authentic gourmet ice cream, real frozen yogurt and desserts, combining unique flavors, fresh ingredients and textures — made with natural ingredients such as fresh milk, real yogurt and fruit.',
    phone: '+30 210 3531031',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: 'Mon-Sun 06:00 - 21:00' }),
    ],
  }),

  koi_sushi_bar: restaurant({
    name: 'Koi Sushi Bar',
    cuisine: 'Japanese, Asian, Sushi',
    amenity: 'restaurant',
    logoUrl: logo('koisushibar.com'),
    vegetarian: true,
    description: 'Flavors of street sushi and Asian delicacies. Koi Sushi Bar serves street sushi and other Asian delicacies such as signature rolls, rice bowls, bao buns and noodles, with meat, seafood and vegetarian selections.',
    phone: '+30 210 3533486',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: 'Mon-Sun 11:00 - 21:00' }),
    ],
  }),

  koulourades: restaurant({
    name: 'Koulourades',
    cuisine: 'Bakery, Greek',
    amenity: 'bakery',
    logoUrl: logo('koulourades.gr'),
    description: "Savory and sweet bagels and more. Koulourades is a Greek brand that turned Thessaloniki's traditional bagel into a daily habit, baking high-quality savory and sweet products daily from pure traditional ingredients. Also carries the 'Sauce Toast' sandwich shop's offerings — XXL bread with a variety of fillings.",
    phone: '+30 210 3534226',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
    ],
  }),

  la_pasteria_flocafe: restaurant({
    name: 'La Pasteria - Flocafe',
    cuisine: 'Italian, Café',
    amenity: 'restaurant',
    description: "Authentic Italian cuisine and exquisite coffee. La Pasteria, the beloved Italian restaurant, and the Flocafé Espresso Room, serve authentic Italian dishes and a variety of coffee blends across three different selections, in a warm and elegant setting overlooking the runway.",
    phone: '+30 210 3534280',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} 2nd Floor, Entrance 3.`, openingHours: 'La Pasteria: Mon-Sun 11:00-21:30; Flocafe: Mon-Sun 07:30-21:30' }),
    ],
  }),

  levito: restaurant({
    name: 'Levito',
    cuisine: 'Italian, Pizza, Pasta',
    amenity: 'restaurant',
    description: "Delicious Italian dishes on the go. Inspired by the 'Italian neighborhood restaurant', Levito offers Italian flavors — at its bakery, freshly baked crispy pizzas are prepared, and right next door, pasta with ingredients of your choice is cooked on the spot.",
    phone: '+30 210 3533486',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: '24 hours', open247: true }),
    ],
  }),

  mailos_the_pasta_project: restaurant({
    name: "Mailo's The Pasta Project",
    cuisine: 'Italian, Pasta',
    amenity: 'restaurant',
    description: "Deliciously fresh pasta and sauces crafted daily. Mailo's The Pasta Project is the destination for a quick, hearty meal — choose between three fresh pasta types (rigatoni, casarecce, campanelle) and one of ten signature Mailo's sauces such as Carbonara, Parmesan Chicken, Chicken Broccoli or the classic Pasticio, or opt for a lighter pasta salad.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: 'Mon-Sun 11:00 - 21:00' }),
    ],
  }),

  mon_kooloor: restaurant({
    name: 'Mon Kooloor',
    cuisine: 'Bakery, Greek',
    amenity: 'bakery',
    logoUrl: logo('monkooloor.gr'),
    description: "The art of freshly baked Greek koulouri. Mon Kooloor bakes fresh, quality koulouri (Greek bagel) every day — salty, sweet or as a koulouri-sandwich — best paired with coffee or another beverage.",
    phone: '+30 210 3533488',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers} Departures.`, openingHours: '24 hours', open247: true }),
    ],
  }),

  overoll: restaurant({
    name: 'Overoll',
    cuisine: 'Bakery, French, Café',
    amenity: 'bakery',
    description: 'The art of croissants and contemporary flavours for every moment of the day. Overoll combines the elegance of French baking with contemporary culinary creativity, placing the croissant at the heart of its concept — every croissant is prepared daily using premium butter and carefully selected ingredients, alongside premium coffee, freshly squeezed juices and quality grab-and-go options, ideal for breakfast, brunch or a quick snack.',
    phone: '+30 210 3531459',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen}` }),
    ],
  }),

  pret_a_manger: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches & Deli',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    description: 'Freshly made food, organic coffee, and artisan delights. Since its first store opened in 1986, Pret A Manger has served freshly made food and good organic coffee, handmade in-shop throughout the day. The menu offers fresh sandwiches, salads, hot dishes, snacks, artisan products, and hot and cold beverages.',
    phone: '+30 210 3531575',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.schengen}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.satellite}` }),
    ],
  }),

  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    description: 'World-renowned coffee and signature blends. Starbucks offers the ultimate coffee experience, with a variety of coffee blends, selected teas, signature beverages and snacks, served by highly trained and certified baristi.',
    phone: '+30 210 3533479',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen}` }),
    ],
  }),

  the_beer_house: restaurant({
    name: 'The Beer House',
    cuisine: 'Bar, Burgers',
    amenity: 'bar',
    description: 'Authentic burgers and draught beers. The Beer House invites you to enjoy authentic burgers accompanied by a wide range of draught beers, fine wines, and hot and cold beverages, in a unique beer-house atmosphere.',
    phone: '+30 2103535126',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.satellite} Gates C, Level 2.`, openingHours: 'Mon-Sun 11:00 - 21:00' }),
    ],
  }),

  to_go: restaurant({
    name: 'To Go',
    cuisine: 'Grab & Go, Café',
    amenity: 'fast_food',
    description: 'Beverages and snacks on the go. To Go offers hot and cold beverages, fresh sandwiches and other homemade snacks for travelers in a hurry.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.nonSchengen} Departures, Gate A01.`, openingHours: 'Mon-Sun 06:00 - 22:00' }),
    ],
  }),

  veneti: restaurant({
    name: 'Veneti',
    cuisine: 'Bakery, Café, Greek',
    amenity: 'bakery',
    description: 'Classic and organic coffee, fresh juices, and a variety of baked goods. At Veneti 1948, the open self-service café & snack bar, enjoy classic or organic Veneti coffee, fresh fruit juices and smoothies, sandwiches, and a unique variety of freshly made bread products, tsourekia, croissants, cookies, muffins and pizza, plus original Venetis ice cream made from fresh milk and confectionery products.',
    phone: '+30 210 3531558',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.allUsers}` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.satellite}` }),
    ],
  }),

  veneti_go: restaurant({
    name: 'Veneti-GO!',
    cuisine: 'Bakery, Grab & Go, Café',
    amenity: 'bakery',
    description: "Quick snacks, premium coffee, and fresh salads. Veneti-Go! is the Grab n' Go concept from Veneti, offering fast service and quality products upon arrival — quick snacks like sandwiches, pastries and pizzas, premium organic coffee, fresh salads, beverages and mini bites, sweet and savoury.",
    phone: '+30 2103530552',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.baggage} Arrivals, Schengen.`, openingHours: '24 hours', open247: true }),
    ],
  }),
};

// ─── upload: match existing docs by normalized name, else create new ────────

async function main() {
  const existingSnap = await colRef.get();
  const existingByName = new Map();
  existingSnap.forEach((doc) => {
    const data = doc.data();
    if (data && data.name) existingByName.set(normalizeName(data.name), doc.id);
  });

  console.log(`Found ${existingSnap.size} existing docs in airports/${AIRPORT}/terminals/${TERMINAL}/restaurants`);

  const batch = db.batch();
  let updated = 0;
  let created = 0;

  for (const [key, data] of Object.entries(venues)) {
    const norm = normalizeName(data.name);
    const existingId = existingByName.get(norm);
    if (existingId) {
      batch.set(colRef.doc(existingId), data, { merge: false });
      console.log(`UPDATE  ${data.name}  ->  ${existingId}`);
      updated++;
    } else {
      const newId = key || slugify(`${data.name}_${TERMINAL}`);
      batch.set(colRef.doc(newId), data, { merge: false });
      console.log(`CREATE  ${data.name}  ->  ${newId}`);
      created++;
    }
  }

  await batch.commit();
  console.log(`\nDone. Updated ${updated} existing venues, created ${created} new venue(s). Total: ${updated + created}/${Object.keys(venues).length}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
