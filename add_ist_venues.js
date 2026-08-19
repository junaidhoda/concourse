'use strict';
/**
 * Fills in complete data for all Istanbul Airport (IST) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official iGA Istanbul Airport
 * "Restaurants & Cafes" directory
 * (istairport.com/en/services/food-beverage/restaurants-cafes) and each
 * venue's individual detail page on 2026-08-03.
 *
 * Istanbul's live directory lists 112 individual outlet cards across 63
 * distinct brand names, each filterable by "Terminal Building" zone
 * (International Airside / Domestic Airside / Landside). The listing itself
 * doesn't show description/cuisine/hours — those were sourced by visiting one
 * representative detail page per brand. Rather than guess floor/level (the
 * site doesn't expose it — Istanbul's single terminal is organized by
 * pier/gate, not by level), each outlet's `gate_area` is taken directly from
 * its listing location string (e.g. "Close to F Pier", "Domestic Airside",
 * "Gate G4"), and `location_notes` records which of the three zones it's in.
 * Almost every venue is open 24/7 per its detail page; the couple with
 * posted hours (Pizzeria Enzo, Vivanda Burger) use those instead.
 *
 * Per upload_to_firestore.py, Istanbul Airport has a single ["Main Terminal"]
 * — unlike Heathrow/CDG/Dublin/Frankfurt there's no multi-terminal split, so
 * all docs live under one terminal grouping ('main_terminal') with
 * multi-outlet brands (Simit Sarayı x10, Burger King x6, Caffe Nero x6, etc.)
 * combined into one doc with multiple `outlets[]`.
 *
 * A couple of site data-quality notes:
 *   - "Cups & Clouds" / "Cups&Clouds" (spacing variant) are the same brand —
 *     merged into one doc with all 6 outlets.
 *   - The site doesn't publish phone numbers for these outlets (each detail
 *     page only links to a brand "Website", no digits) — phone is left blank
 *     throughout, reflecting what's actually published, not a gap.
 *   - Paşa Döner's detail page explicitly states its halal certification —
 *     flagged accordingly. Dietary flags elsewhere come from each detail
 *     page's "Products" tag list (Vegan/Vegetarian/Gluten Free).
 *
 * Because Firebase Console access isn't available, this script uses 'ist'
 * directly (found consistently in upload_to_firestore.py and
 * migrate_firestore.js/cleanup_firestore.js's AIRPORT_SLUGS with no
 * ambiguity), with an override constant as a defensive escape hatch.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_ist_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const AIRPORT_ID_OVERRIDE = null; // set this if 'ist' turns out to be wrong
const AIRPORT_ID_DEFAULT = 'ist';

const MAIN_TERMINAL = 'main_terminal';

// ─── helpers (matches admin_restaurant_editor_screen.dart's save shape) ──────

function outlet({ airside = 'airside', level = '', locationNotes = '', gateArea = '', openingHours = 'Mon-Sun 24/7', open247 = true }) {
  return {
    gate_area: gateArea,
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

// zone-aware outlet shorthand: zone is 'intl' | 'dom' | 'land'
function zoneOutlet(zone, gateArea, opts = {}) {
  const zoneMap = {
    intl: { airside: 'airside', locationNotes: 'International Airside' },
    dom: { airside: 'airside', locationNotes: 'Domestic Airside' },
    land: { airside: 'landside', locationNotes: 'Landside' },
  };
  const z = zoneMap[zone];
  return outlet({ airside: z.airside, locationNotes: z.locationNotes, gateArea, ...opts });
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

// ─── all venues (single terminal grouping) ───────────────────────────────────

const venues = {
  arbys: restaurant({
    name: "Arby's",
    cuisine: 'Fast Food, Roast Beef',
    amenity: 'fast_food',
    logoUrl: logo('arbys.com'),
    description: "Known for its distinctive tastes, Arby's has transformed the traditional fast-food experience by introducing exceptional dishes: excellent roast beef sandwiches, delicious wraps, fresh salads, and delightful curly fries. Arby's sandwiches are filled with tender beef that's slow-cooked for four hours and freshly sliced on request.",
    outlets: [
      zoneOutlet('intl', 'Close to F Pier', { locationNotes: 'International Airside Food Court' }),
      zoneOutlet('intl', 'Close to B Pier'),
    ],
  }),
  avenue_bistro_bar: restaurant({
    name: 'Avenue Bistro Bar',
    cuisine: 'French, Bar',
    amenity: 'bar',
    description: 'Avenue, blending luxury and prestige with elegance, is meticulously designed with a French concept, offering fresh salads, pizzas prepared with special recipes, and desserts to guests at iGA Istanbul Airport.',
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  backhaus: restaurant({
    name: 'Backhaus',
    cuisine: 'Bakery, German',
    amenity: 'bakery',
    description: "iGA Istanbul Airport's Backhaus serves fresh artisan bakery products in the domestics area, providing quality and diverse products to make travelers' journeys more enjoyable.",
    vegan: true,
    glutenFree: true,
    outlets: [zoneOutlet('dom', 'Gate G4')],
  }),
  bi_bar: restaurant({
    name: 'Bi Bar',
    cuisine: 'Bar, Cocktails',
    amenity: 'bar',
    description: 'Carefully crafted cocktails, a selection of premium drinks, and light bites — Bi Bar welcomes guests who wish to take a short break before or after their flight and unwind in a pleasant atmosphere, with comfortable seating and music.',
    outlets: [zoneOutlet('intl', 'Close to A Pier')],
  }),
  bi_coffee: restaurant({
    name: 'Bi Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Coffee enriched with various flavors at any time of day, along with cold and hot sandwiches and salads from fresh vegetables and seasonal fruits, in an environment accompanied by music.',
    outlets: [zoneOutlet('intl', 'Close to A Pier')],
  }),
  bi_coffee_bi_bar: restaurant({
    name: 'Bi Coffee&Bi Bar',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'A combined Bi Coffee and Bi Bar location offering coffee, sandwiches and salads alongside cocktails and premium drinks in a relaxed, music-accompanied setting.',
    outlets: [zoneOutlet('intl', 'Close to F Pier')],
  }),
  bite: restaurant({
    name: 'Bite',
    cuisine: 'Café, Waffles',
    amenity: 'fast_food',
    description: "Bite's menu is filled with freshly prepared waffles, unique donut flavors, refreshing ice cream choices, hot and cold sandwiches, quick snacks, homemade beverages, and Bite's special roasted coffees, in a cozy seating area on the domestic departures floor.",
    outlets: [zoneOutlet('land', 'Departures Floor Landside')],
  }),
  bottega: restaurant({
    name: 'Bottega',
    cuisine: 'Bar, Italian, Wine',
    amenity: 'bar',
    description: 'Bottega Prosecco Bar, a quintessential Venetian establishment, offers snacks and bite-sized treats accompanied by an extensive selection of wines, unique cocktails and appetizers in a cozy setting, plus excellent Mediterranean cuisine.',
    outlets: [zoneOutlet('intl', 'Bosphorus')],
  }),
  brewmark: restaurant({
    name: 'Brewmark',
    cuisine: 'Pub, Beer',
    amenity: 'bar',
    website: '',
    description: 'The Brewmark Pub offers both bottled and on-tap premium beers and an extensive range of cocktails, from classic favorites to contemporary alternatives, with ambient lighting and a tranquil atmosphere for pre-flight drinks and snacks.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to F Pier')],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('bk.com'),
    website: 'https://www.burgerking.com.tr',
    description: "Established in Türkiye in 1995, the Burger King network has grown rapidly, becoming a top meal choice in the country, with more than 650 restaurants nationwide, maintaining international quality and hygiene standards.",
    vegetarian: true,
    outlets: [
      zoneOutlet('land', 'Arrivals Floor Landside'),
      zoneOutlet('intl', 'Close to D Pier', { locationNotes: 'International Airside Food Court' }),
      zoneOutlet('intl', 'Close to F Pier 1'),
      zoneOutlet('intl', 'Close to F Pier 2'),
      zoneOutlet('land', 'Departure Landside Floor'),
      zoneOutlet('dom', 'Domestic Airside'),
    ],
  }),
  cafe_yanimda: restaurant({
    name: 'Cafe Yanımda',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Café Yanımda, in the domestic area of Istanbul Airport, fosters the inclusion of special individuals in society under the "Society For All" concept, embracing difference in a warm and welcoming café setting.',
    vegetarian: true,
    outlets: [zoneOutlet('dom', 'Gate G4')],
  }),
  caffe_nero: restaurant({
    name: 'Caffe Nero',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Caffe Nero offers a distinctive classic Italian-style medium roast coffee with a rich, well-balanced scent that includes notes of caramel and dark chocolate.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [
      zoneOutlet('land', 'Arrival Landside', { locationNotes: 'Landside' }),
      zoneOutlet('intl', 'B10 Gate'),
      zoneOutlet('intl', 'D9 Gate'),
      zoneOutlet('intl', 'F5 Kapısı'),
      zoneOutlet('dom', 'Gate G2'),
      zoneOutlet('land', 'Landside'),
    ],
  }),
  carls_jr: restaurant({
    name: "Carl's Jr",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: 'https://www.carlsjr.com.tr',
    description: "Founded in 1941, Carl's Jr. brings iconic burgers and superior service, with over 3,800 establishments across 43 countries worldwide. Its 18th Turkish restaurant, at iGA Istanbul Airport, offers generously-sized premium burgers, unlimited sauces and delicious beverages.",
    glutenFree: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Food Court' })],
  }),
  carls_cafe: restaurant({
    name: 'Carls Cafe',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Carls Cafe, in the international airside of iGA Istanbul Airport, offers a variety of coffee options suitable for every time of day, carefully prepared snacks, and a delicious go-to menu.',
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  carluccios: restaurant({
    name: "Carluccio's",
    cuisine: 'Italian, Casual Dining',
    amenity: 'restaurant',
    website: '',
    description: "Carluccio's has dedicated itself to introducing authentic Italian flavors to its customers. Having traveled around Italy to find the finest ingredients, its chefs create inspiring dishes for food enthusiasts at iGA Istanbul Airport.",
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Food Court' })],
  }),
  carluccios_bar: restaurant({
    name: "Carluccio's Bar",
    cuisine: 'Italian, Bar',
    amenity: 'bar',
    description: "Carluccio's Bar brings the same authentic Italian flavors and dishes as Carluccio's, made from the finest ingredients sourced across Italy, to iGA Istanbul Airport passengers.",
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Food Court' })],
  }),
  cay_saati: restaurant({
    name: 'Çay Saati',
    cuisine: 'Café, Turkish Tea',
    amenity: 'cafe',
    description: 'Çay Saati invites passengers to indulge in freshly brewed traditional Turkish teas, herbal teas, and freshly-made coffees, plus sandwiches, croissants, freshly-baked pastries, soups, healthy meals, and desserts.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [
      zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Bosphorus' }),
      zoneOutlet('intl', 'D3 Gate'),
      zoneOutlet('dom', 'Domestic Airside'),
      zoneOutlet('land', 'Landside'),
    ],
  }),
  chocnette: restaurant({
    name: 'Chocnette',
    cuisine: 'Confectionery, Chocolate',
    amenity: 'confectionery',
    description: "Established in 2008, Chocnette is Türkiye's premier chocolate provider, with 40 locations nationwide. Guests can indulge in ice cream, a range of coffees, fresh fruit juices, and unique chocolate delicacies.",
    outlets: [zoneOutlet('intl', 'Close to F Pier')],
  }),
  cuisine_anatolia: restaurant({
    name: 'Cuisine Anatolia',
    cuisine: 'Turkish, Anatolian',
    amenity: 'restaurant',
    website: '',
    description: "Cuisine Anatolia reminds us of Türkiye's Anatolian cuisine, carefully preparing delicious recipes that are gradually disappearing from the Anatolian culinary landscape.",
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  cups_and_clouds: restaurant({
    name: 'Cups & Clouds',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: '',
    description: 'Founded in America with a passion for distinctive coffee flavors, Cups & Clouds sources beans from around the world and, with advanced roasting techniques, offers salads, quick and healthy snacks, sandwiches, soups, desserts, and coffee.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [
      zoneOutlet('land', 'Arrivals Floor Landside'),
      zoneOutlet('intl', 'B1 Gate'),
      zoneOutlet('intl', 'Close to F Pier'),
      zoneOutlet('intl', 'F7 Gate'),
      zoneOutlet('dom', 'G6 Gate'),
      zoneOutlet('land', 'Landside Plaza'),
    ],
  }),
  deli_aux_pain: restaurant({
    name: 'Deli Aux Pain',
    cuisine: 'Bakery, Café',
    amenity: 'cafe',
    description: "Deli Aux Pain offers a sweet start to the day with pastries baked fresh every morning, a selection of the world's finest coffee, local and international beers, and other alcoholic beverages.",
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  eat_and_joy: restaurant({
    name: 'Eat & Joy',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: '',
    description: 'Eat & Joy offers a delightful respite for guests prior to their departure at iGA Istanbul Airport, with a wide selection of tasty menu items.',
    vegetarian: true,
    outlets: [zoneOutlet('land', 'Departures Floor Landside')],
  }),
  enva: restaurant({
    name: 'Enva',
    cuisine: 'Café, Healthy',
    amenity: 'cafe',
    description: 'Enva offers healthy and delicious meals at any time of day, with light snacks, freshly-baked pastries, sandwiches, desserts, salads, soups, and freshly-brewed coffee.',
    vegan: true,
    vegetarian: true,
    outlets: [
      zoneOutlet('intl', 'Close to A-B Pier'),
      zoneOutlet('land', 'Departure Landside Floor'),
    ],
  }),
  godiva: restaurant({
    name: 'Godiva',
    cuisine: 'Confectionery, Chocolate',
    amenity: 'confectionery',
    description: "Godiva Café offers innovative flavors for chocolate enthusiasts: a wide selection of chocolates, chocolate-dipped flowers, fondue, crepes served with ice cream and chocolate, plus coffees and beverages, in a sophisticated interior with round-the-clock service.",
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  gram: restaurant({
    name: 'Gram',
    cuisine: 'Turkish, Healthy',
    amenity: 'restaurant',
    website: '',
    description: 'Istanbul\'s well-known brand Gram, in line with its "For everything, there is a season" motto, seeks simplicity while remaining loyal to authentic flavors in creative dishes made with premium ingredients, run by Didem Şenol Tiryakioğlu.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  hd_doner: restaurant({
    name: 'HD Döner',
    cuisine: 'Turkish, Döner',
    amenity: 'fast_food',
    description: 'With 26 years of service experience, HD Döner produces classic flavors of Turkish cuisine since 1995 across over 300 HD Holding restaurants, never compromising on taste and service standards.',
    outlets: [zoneOutlet('land', 'Landside', { locationNotes: 'Landside Food Court' })],
  }),
  highborn_coffee: restaurant({
    name: 'HighBorn Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'HighBorn offers a delightful and comfortable pre-flight menu: delicious snacks, sandwiches, croissants, and freshly baked culinary delights including desserts, all prepared by master chefs.',
    outlets: [zoneOutlet('dom', 'Domestic Airside', { locationNotes: 'Domestic Airside Food Court' })],
  }),
  jackies: restaurant({
    name: "Jackie's",
    cuisine: 'Bar, Burgers',
    amenity: 'bar',
    description: "Jackie's Bar and Burger Jack offer a wide selection of high-quality burgers, pancakes, sandwiches, and beverages including coffee, cold drinks, and freshly squeezed juices, embracing Turkish traditions and hospitality.",
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Gate A1')],
  }),
  kaimakk: restaurant({
    name: 'Kaimakk',
    cuisine: 'Café, Turkish, Dessert',
    amenity: 'cafe',
    description: 'Kaimakk strikes a balance between the essence of history and the rhythm of the modern world, offering traditional Turkish flavors with a modern touch — each bite blending old and new.',
    vegan: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to Pier D')],
  }),
  komyuniti: restaurant({
    name: 'Komyuniti Bar & Restaurant',
    cuisine: 'International, Turkish',
    amenity: 'restaurant',
    website: '',
    description: 'Komyuniti bar and restaurant, open 24/7 as part of YOTEL Istanbul Airport, offers international dishes and Turkish specialties. Breakfast runs 6:00-10:30 a.m., after which the restaurant serves light meals like sandwiches and salads plus steaks, fish, and pasta. The bar offers local and international beers, wines, spirits, and cocktails, with complimentary Wi-Fi and co-working spaces.',
    outlets: [outlet({ airside: 'landside', gateArea: 'Landside', locationNotes: 'YOTEL Istanbul Airport, near entrance 7 and check-in counter R', openingHours: 'Mon-Sun 24/7 (breakfast 06:00-10:30)' })],
  }),
  loba_coffe: restaurant({
    name: 'Loba Coffe',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Located in the domestic terminal, Loba Coffe offers a delicious break with a variety of coffees, fresh snacks, sandwiches, and croissants.',
    outlets: [zoneOutlet('dom', 'Domestic Airside')],
  }),
  malatya_pazari: restaurant({
    name: 'Malatya Pazarı',
    cuisine: 'Turkish, Specialty Foods',
    amenity: 'confectionery',
    website: '',
    description: 'An Istanbul classic, Malatya Pazarı, located after the domestic security checkpoint, sells healthy snacks and local souvenirs from the well-known Spice Market.',
    outlets: [zoneOutlet('dom', 'Domestic Area Airside')],
  }),
  max_brenner: restaurant({
    name: 'Max Brenner',
    cuisine: 'Café, Chocolate',
    amenity: 'cafe',
    description: 'Max Brenner is creating a worldwide new chocolate culture that allows people to experience chocolate just the way they have always imagined, known for its unique chocolate concepts and fun presentation.',
    outlets: [zoneOutlet('land', 'Landside', { locationNotes: 'Landside, Arrivals Subway Area' })],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('mcdonalds.com'),
    website: 'https://www.mcdonalds.com.tr',
    description: "McDonald's, the pioneer of the fast-food service industry in Türkiye since 1986, offers its favorite flavors combined with the restaurant experience of the future.",
    outlets: [
      zoneOutlet('intl', 'Close to Pier A-B', { locationNotes: 'International Airside Food Court' }),
      zoneOutlet('intl', 'Close to Pier B'),
    ],
  }),
  mood_up: restaurant({
    name: 'Mood Up',
    cuisine: 'Café, Healthy',
    amenity: 'cafe',
    description: 'Mood Up, just after the international security checkpoint, offers sandwiches freshly-made with the finest ingredients, delicious cakes, and freshly-squeezed juices.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [
      zoneOutlet('intl', 'Close to A-B Pier'),
      zoneOutlet('intl', 'Close to F Pier'),
    ],
  }),
  mvnch: restaurant({
    name: 'Mvnch',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: '',
    description: 'Mvnch, an Istanbul-based chain, offers a dynamic menu of hot and cold dishes, expertly roasted coffee, freshly squeezed juices, house-made herbal teas, and daily menu offerings sourced fresh each morning.',
    vegetarian: true,
    outlets: [
      zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Bosphorus' }),
      zoneOutlet('intl', 'Close to F Pier'),
      zoneOutlet('land', 'Departure Landside Floor'),
    ],
  }),
  nusret: restaurant({
    name: 'Nusr‒Et',
    cuisine: 'Turkish, Steakhouse, Burgers',
    amenity: 'restaurant',
    description: 'Signature burgers, delightful snacks, and refreshing beverages await guests at iGA Istanbul Airport with their unique flavors.',
    outlets: [zoneOutlet('intl', 'Close to Pier F')],
  }),
  obica: restaurant({
    name: 'Obica',
    cuisine: 'Italian, Mozzarella Bar',
    amenity: 'bar',
    website: '',
    description: "The world's first Obica Mozzarella Bar opened in 2004. Obica maintains its passion for fine Italian cuisine made with premium, fresh ingredients.",
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [
      zoneOutlet('intl', 'Close to A-B Pier'),
      zoneOutlet('intl', 'Close to F Pier'),
    ],
  }),
  pasa_doner: restaurant({
    name: 'Paşa Döner',
    cuisine: 'Turkish, Döner',
    amenity: 'fast_food',
    website: '',
    description: "Featuring its signature döner kebab made exclusively with chicken drumsticks in a distinctive sauce, Türkiye's well-known Paşa Döner is open 24 hours a day, maintaining the highest standards in producing and serving halal food.",
    halal: true,
    outlets: [zoneOutlet('intl', 'Close to F Pier', { locationNotes: 'International Airside Food Court' })],
  }),
  pidem: restaurant({
    name: 'Pidem',
    cuisine: 'Turkish, Pita',
    amenity: 'fast_food',
    website: '',
    description: "Pidem, one of Türkiye's largest pita chains with over 150 establishments, brings this prominent Turkish dish to guests, prepared to order with daily fresh ingredients.",
    outlets: [
      zoneOutlet('intl', 'Close to F Pier', { locationNotes: 'International Airside Food Court' }),
      zoneOutlet('land', 'Landside'),
    ],
  }),
  pierre_herme: restaurant({
    name: 'Pierre Herme',
    cuisine: 'French, Pastry',
    amenity: 'confectionery',
    description: 'The unique flavors of world-famous French pastry chef Pierre Hermé are available at the Pierre Hermé Paris store.',
    vegan: true,
    glutenFree: true,
    outlets: [zoneOutlet('intl', 'Close to F Pier')],
  }),
  pizzeria_enzo: restaurant({
    name: 'Pizzeria Enzo',
    cuisine: 'Italian, Pizza',
    amenity: 'restaurant',
    website: '',
    description: 'Part of the Gourmet Trilogy concept, Pizzeria Enzo brings exquisite Italian flavors with an elegant yet comfortable design, offering genuine Italian-style pizzas crafted with locally-sourced ingredients.',
    glutenFree: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier', { openingHours: 'Mon-Sun 07:00 - 23:00', open247: false })],
  }),
  popeyes: restaurant({
    name: 'Popeyes',
    cuisine: 'Fast Food, Chicken',
    amenity: 'fast_food',
    website: '',
    description: 'Popeyes chicken, marinated with special spices for 12 hours and served crispy and warm, combines traditional flavors and tastes.',
    outlets: [
      zoneOutlet('land', 'Arrivals Floor Landside'),
      zoneOutlet('intl', 'Close to A-B Pier'),
      zoneOutlet('intl', 'Close to F Pier'),
      zoneOutlet('dom', 'Domestic Airside'),
      zoneOutlet('land', 'Landside'),
    ],
  }),
  refresh: restaurant({
    name: 'Refresh',
    cuisine: 'Ice Cream, Turkish & Italian',
    amenity: 'ice_cream',
    description: 'Refresh offers guests a delicious choice of fresh, organic ice creams: traditional Turkish and Italian ice cream made on-site, plus hot and cold beverages and freshly-prepared sandwiches and salads.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  rey_food_and_drink: restaurant({
    name: 'Rey Food&Drınk',
    cuisine: 'Café, Organic',
    amenity: 'cafe',
    description: "Born from a passion for healthy living and mindful nutrition, this Rey concept welcomes guests at Istanbul Airport's International Terminal, Pier A, with recipes crafted from organic, plant-based ingredients and smoothies blended with fresh seasonal fruits and vegetables.",
    outlets: [zoneOutlet('intl', 'Close to A Pier')],
  }),
  rey_organic: restaurant({
    name: 'Rey Organic',
    cuisine: 'Café, Organic',
    amenity: 'cafe',
    description: "This Rey concept brings natural, fresh flavors to iGA Istanbul Airport's international departures, offering organic and healthy fatburning and detox drinks for travelers before takeoff.",
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to D Pier')],
  }),
  sbarro: restaurant({
    name: 'Sbarro',
    cuisine: 'Fast Food, Pizza',
    amenity: 'fast_food',
    website: '',
    description: 'Sbarro, never compromising on quality or freshness, prepares its pizzas in front of customers, offering an extensive selection of pizzas, pastas, salads, baked potatoes, vegetable stir-fry, wraps, soups, and desserts.',
    vegetarian: true,
    outlets: [
      zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Food Court' }),
      zoneOutlet('intl', 'Close to F Pier'),
      zoneOutlet('dom', 'Domestic Airside'),
      zoneOutlet('land', 'Landside'),
    ],
  }),
  seferi: restaurant({
    name: 'Seferi',
    cuisine: 'Convenience, Snacks',
    amenity: 'fast_food',
    website: '',
    description: 'Seferi appeals to passengers with limited time, with ready-to-serve and pre-packaged products as well as hot and cold drinks, offering a market-like experience with instantly accessible, diverse, and affordable offerings.',
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('dom', 'G1 Gate')],
  }),
  shake_shack: restaurant({
    name: 'Shake Shack',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    website: '',
    description: 'Shake Shack offers 100% organic burgers made with non-GMO, 100% Angus beef, hotdogs, and ice creams, with fresh, premium quality ingredients and a fun, vibrant atmosphere.',
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  simit_sarayi: restaurant({
    name: 'Simit Sarayı',
    cuisine: 'Bakery, Turkish',
    amenity: 'bakery',
    website: '',
    description: 'An essential staple of Turkish street food, Simit is brought to guests by Simit Sarayı, open all day with a wide range of products from freshly baked bagels to desserts, and fresh sandwiches to pizzas.',
    vegan: true,
    glutenFree: true,
    outlets: [
      zoneOutlet('land', 'Arrival Landside Floor - 1'),
      zoneOutlet('land', 'Arrival Landside Floor - 2'),
      zoneOutlet('intl', 'B10 Gate'),
      zoneOutlet('intl', 'Close to A-B Pier'),
      zoneOutlet('intl', 'Close to F Pier'),
      zoneOutlet('dom', 'Domestic Airside'),
      zoneOutlet('intl', 'F13 Gates'),
      zoneOutlet('dom', 'G9 Gate'),
      zoneOutlet('intl', 'Gate A7'),
      zoneOutlet('land', 'Landside Plaza'),
    ],
  }),
  slim_chickens: restaurant({
    name: "Slim Chicken's",
    cuisine: 'Fast Food, Chicken',
    amenity: 'fast_food',
    description: 'Slim Chickens delicately prepares chicken using the freshest ingredients in a setting delivering warm hospitality, offering flavors the whole family can enjoy.',
    outlets: [zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Food Court' })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.com.tr',
    description: 'Starbucks, with its renowned service quality, offers passengers a range of coffee flavors from this well-known brand.',
    vegan: true,
    glutenFree: true,
    outlets: [
      zoneOutlet('intl', 'Close to B Pier'),
      zoneOutlet('intl', 'Close to F Pier'),
      zoneOutlet('intl', 'D6 Gate'),
      zoneOutlet('dom', 'Domestic Airside'),
    ],
  }),
  subway: restaurant({
    name: 'Subway',
    cuisine: 'Fast Food, Sandwiches',
    amenity: 'fast_food',
    website: '',
    description: 'Offering a fresh, healthy taste with daily baked breads, Subway offers hot and cold sandwiches, burritos, and salads at every hour of the day, plus freshly-baked cookies.',
    vegetarian: true,
    outlets: [
      zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Food Court' }),
      zoneOutlet('intl', 'Close to F Pier'),
    ],
  }),
  the_gang_foods: restaurant({
    name: 'The Gang Foods',
    cuisine: 'International, Street Food',
    amenity: 'fast_food',
    description: 'The Gang Foods brings world flavors with a wide range of options including pastas, hamburgers, must-try street delicacies, and great desserts.',
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier', { locationNotes: 'International Airside Food Court' })],
  }),
  the_house_cafe: restaurant({
    name: 'The House Cafe',
    cuisine: 'Café, Healthy',
    amenity: 'cafe',
    website: '',
    description: 'The House Café offers high-quality, fresh, healthy, and natural products in a family-friendly setting, a delightful respite for passengers before their flight.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to F Pier')],
  }),
  tickerdaze: restaurant({
    name: 'Tickerdaze',
    cuisine: 'Pub, Sports Bar',
    amenity: 'bar',
    website: '',
    description: 'Tickerdaze Sports Pub is a sophisticated gastro-pub with breakfast alternatives, a kids menu, and snack options, for a memorable pre-flight visit.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
  trt_world_cafe: restaurant({
    name: 'TRT World Cafe',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'TRT World offers sandwiches, croissants, freshly baked pastries, soups, and expertly crafted desserts alongside tasty beverages, with light and comfortable menu options before flights.',
    outlets: [zoneOutlet('intl', 'Close to Pier F', { locationNotes: 'International Airside Bosphorus' })],
  }),
  via_bakery: restaurant({
    name: 'Via Bakery',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    description: 'Via Bakery offers a delightful start to the day with delectable pastries freshly baked on site every morning, in a comfortable and inviting atmosphere, also serving Illy coffee.',
    outlets: [zoneOutlet('dom', 'Gate G3')],
  }),
  via_fici: restaurant({
    name: 'Via Fıçı',
    cuisine: 'Bakery, Café',
    amenity: 'cafe',
    description: 'Via Fıçı serves fresh sandwiches made daily, as well as a selection of hot and cold beverages, for those looking for a quick and convenient snack.',
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Gate D16')],
  }),
  via_kiosk: restaurant({
    name: 'Via Kiosk',
    cuisine: 'Convenience, Snacks',
    amenity: 'fast_food',
    description: 'The Via Kiosks, found after the security checkpoints, are quick and easy to use, serving fresh sandwiches made daily as well as a selection of hot and cold beverages.',
    outlets: [
      zoneOutlet('intl', 'Gate F6'),
      zoneOutlet('dom', 'Domestic Airside'),
      zoneOutlet('intl', 'Gate A11'),
      zoneOutlet('intl', 'Gate B18'),
      zoneOutlet('intl', 'Gate C1'),
    ],
  }),
  vivanda_burger: restaurant({
    name: 'Vivanda Burger',
    cuisine: 'Fast Food, Gourmet Burgers',
    amenity: 'fast_food',
    website: '',
    description: 'Vivanda Burger, a gourmet burger establishment by Chef Akrame Benallal, features freshly-prepared, high-quality meat selections with homemade specialty pickles and special sauces, plus banana, caramel, peanut, raspberry, and vanilla milkshakes.',
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier', { openingHours: 'Mon-Sun 07:00 - 23:00', open247: false })],
  }),
  yo_sushi: restaurant({
    name: 'YO! Sushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    website: '',
    description: 'YO! Sushi serves fresh and authentic Japanese street food with an innovative concept introducing Asian flavors, including a range of sushi and fusion dishes prepared by its master chef and team, plus vegan options.',
    vegan: true,
    glutenFree: true,
    vegetarian: true,
    outlets: [zoneOutlet('intl', 'Close to A-B Pier')],
  }),
};

// ─── upload: match existing docs by normalized name within the terminal ─────

async function processTerminal(AIRPORT, terminalId, terminalName, venuesMap) {
  const restCol = db.collection('airports').doc(AIRPORT).collection('terminals').doc(terminalId).collection('restaurants');
  const existingSnap = await restCol.get();
  const existingByName = new Map();
  existingSnap.forEach((doc) => {
    const data = doc.data();
    if (data && data.name) existingByName.set(normalizeName(data.name), doc.id);
  });

  console.log(`\n${terminalName} (${terminalId}): found ${existingByName.size} existing restaurant doc(s).`);

  const batch = db.batch();
  let updated = 0;
  let created = 0;

  for (const [key, data] of Object.entries(venuesMap)) {
    const norm = normalizeName(data.name);
    const existingId = existingByName.get(norm);
    if (existingId) {
      batch.set(restCol.doc(existingId), data, { merge: false });
      console.log(`  UPDATE  ${data.name}  ->  ${terminalId}/${existingId}`);
      updated++;
    } else {
      const newId = key || slugify(`${data.name}_${terminalId}`);
      batch.set(restCol.doc(newId), data, { merge: false });
      console.log(`  CREATE  ${data.name}  ->  ${terminalId}/${newId}`);
      created++;
    }
  }

  if (created > 0) {
    await db.collection('airports').doc(AIRPORT).collection('terminals').doc(terminalId)
      .set({ name: terminalName }, { merge: true });
  }

  await batch.commit();
  return { updated, created };
}

async function main() {
  const AIRPORT = AIRPORT_ID_OVERRIDE || AIRPORT_ID_DEFAULT;
  console.log(`Using airport doc '${AIRPORT}'.`);

  const result = await processTerminal(AIRPORT, MAIN_TERMINAL, 'Main Terminal', venues);

  const totalVenues = Object.keys(venues).length;
  console.log(`\nDone. Updated ${result.updated} existing venues, created ${result.created} new venue(s). Total: ${result.updated + result.created}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
