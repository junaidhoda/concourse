'use strict';
/**
 * Fills in complete data for all Adolfo Suárez Madrid-Barajas Airport (MAD)
 * restaurants/bars/cafés/bakeries in Firestore, cross-referenced against the
 * official Aena "Shops and restaurants" directory
 * (aena.es/en/adolfo-suarez-madrid-barajas/airport-services/shops-and-restaurants/see-all-shops.html)
 * and each venue's own detail page on 2026-08-04.
 *
 * Madrid-Barajas is run through Aena's shared multi-airport portal (not a
 * dedicated per-airport site like FRA/IST/Lisbon/Gatwick/Heathrow) — reaching
 * it required going through the generic "Cafeterias and restaurants" page and
 * selecting Madrid from a custom (non-native-<select>) airport dropdown.
 * The see-all-shops listing has 103 total shop/service entries; each card
 * carries a `data-tag` category (News/books, Fashion, Electronics, Duty
 * free, etc.) alongside the food & drink ones (Restaurants, Fast food,
 * Takeaway food, Beer/wine and tapas, Food and drink, Coffee shops) — only
 * the 51 entries tagged with an F&B category were kept. Of those, "La
 * Chinata" was dropped as a false positive: despite carrying a "Food and
 * drink" tag, its own description is explicitly a toiletry/cosmetics shop
 * built around olive oil, not a place to eat or drink — leaving 50 venues.
 *
 * Madrid-Barajas' live terminal tabs are T1, T2, T3, T4 and T4S (the T4
 * satellite building, reached by shuttle, which Aena treats as its own
 * terminal throughout the site — same pattern as Gatwick's North/South or
 * Heathrow's separate terminals). Docs are grouped by (name, terminal),
 * matching the Dublin/Frankfurt/Lisbon/Gatwick/Heathrow convention: multiple
 * physical counters of the same brand WITHIN one terminal are combined into
 * a single doc with multiple `outlets[]` (e.g. Café Pans' 3 counters in T4,
 * Burger King's 2 counters in T4S). A brand present in MULTIPLE terminals
 * gets a separate doc per terminal (Burger King: 5 docs across T1-T4S;
 * Sibarium: 4 docs; Hungry Club: 4 docs; Flax & Kale: 3 docs; Tutti Frutti: 3
 * docs; the rest: 1-2 docs).
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - Every outlet's `location_notes`/`level` are taken verbatim from each
 *     venue's own "Where to find X at the airport" block (e.g. "Floor 1.
 *     Departures. Boarding Area J"). `airside` is inferred from that text:
 *     "Boarding Area" / "Passenger-only zone" locations are marked airside;
 *     "Public Zone" (Departures, Arrivals, Parking or Bus Terminal) and
 *     "Arrivals" locations are marked landside, matching Aena's own use of
 *     "Public Zone" to mean the pre-security terminal hall.
 *   - StrEat's detail page lists terminal tabs T1/T2/T4 but only ever
 *     rendered ONE physical location block (T1, Boarding area A) — rather
 *     than fabricate T2/T4 outlets with guessed locations, only the
 *     confirmed T1 outlet is included here.
 *   - A few detail pages (Foodies', RODILLA) rendered an exact duplicate of
 *     one outlet block back-to-back — treated as a page-rendering glitch,
 *     not a real second physical counter, so only the unique outlets are
 *     kept.
 *   - `website`/`logo_url` are only filled in for brands independently
 *     verifiable as real national/international/Spanish chains (Burger
 *     King, McDonald's, Starbucks, Pret A Manger, Paul, VIPS, Ritazza,
 *     Coffee Republic, Soho Coffee, Tony Roma's, Kabuki, Flax & Kale, Corner
 *     by Real Madrid, La Place, Bottega Prosecco Bar & Caffè, RODILLA, Santa
 *     Gloria, Torrons Vicens, Origins by Enrique Tomás, Beher, Café
 *     Pans/Pans & Company, Chök, La Taberna de La Ancha, Levadura madre,
 *     Madrí, Pura Brasa) — smaller one-off airport concessions are left
 *     blank rather than guessing a domain.
 *   - Dietary tags are only set where the venue's own description explicitly
 *     calls them out (Chia: vegan; Corner by Real Madrid: vegetarian +
 *     vegan; Flax & Kale: vegetarian + vegan, given its "80% plant-based"
 *     description). No venue mentions halal, kosher or gluten-free options
 *     on its Aena page, so those are left blank throughout.
 *
 * Because Madrid doesn't appear at all in upload_to_firestore.py or in
 * migrate_firestore.js/cleanup_firestore.js's AIRPORT_SLUGS/AIRPORTS lists,
 * there's no existing reference for its live Firestore slug. This script
 * auto-detects it at runtime (checking 'madrid' first, then 'mad', using
 * whichever has existing terminal data) and matches existing restaurant docs
 * by normalized name within each terminal — updating in place if found,
 * creating new otherwise. It never creates a new `airports/{id}` metadata
 * doc itself, per standing practice — if NEITHER slug has existing terminal
 * data, confirm with the user before assuming Madrid needs to be created
 * from scratch.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_mad_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['madrid', 'mad'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';
const TERMINAL_4 = 'terminal_4';
const TERMINAL_4S = 'terminal_4s';

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

// ─── Terminal 1 venues ────────────────────────────────────────────────────

const t1Venues = {
  canas_y_tapas_cafe_pans: restaurant({
    name: 'Cañas y Tapas - Café Pans',
    cuisine: 'Spanish Tapas, Café, Bakery',
    amenity: 'bar',
    logoUrl: logo('pans.es'),
    website: 'https://www.pans.es',
    description: "Cañas y tapas represents the most authentic and renowned of Spanish gastronomy, Tapeo — Mediterranean cuisine to share great moments with friends, where tradition is combined with a modern and innovative feel. Café Pans (PANS & COMPANY) is the largest sandwich-shop brand in mainland Spain, complementing its sandwiches with the best bakery and pastry products.",
    outlets: [outlet({ airside: 'landside', level: 'Floor 0', locationNotes: 'Arrivals. Public Zone', openingHours: "Cañas y Tapas 24 hours; Café Pans 07:00 - 22:00" })],
  }),
  chok: restaurant({
    name: 'Chök',
    cuisine: 'Chocolate, Confectionery',
    amenity: 'confectionery',
    logoUrl: logo('chok.es'),
    website: 'https://www.chok.es',
    description: 'An area dedicated to chocolate, to be enjoyed and shared, where the quality of a kitchen is combined with absolute freedom for creation. At Chök, natural and local ingredients are used whenever possible to ensure the highest quality of all products.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '08:10 - 20:40' })],
  }),
  corner_by_real_madrid_t1: restaurant({
    name: 'Corner by Real Madrid',
    cuisine: 'Spanish, Traditional',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('realmadrid.com'),
    website: 'https://www.realmadrid.com',
    description: "A space that combines a catering area with the sale of official Real Madrid products. The restaurant's bar, inspired by the shape of the Santiago Bernabéu stadium, offers local and traditional Spanish cuisine, as well as vegetarian and vegan options.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area C', openingHours: '05:00 - 21:00' })],
  }),
  flax_kale_t1: restaurant({
    name: 'Flax & Kale',
    cuisine: 'Healthy, Plant-based',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('flaxandkale.com'),
    website: 'https://www.flaxandkale.com',
    phone: '+34 620 265 661',
    description: 'A delicious and balanced experience based on a gastronomic offer with 80% plant-based recipes and 20% high-quality animal protein. Dishes designed for nutritional value in an elegant, relaxing space, focused on health, leisure, innovation, balance and commitment. Eat Better®.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '05:10 - 21:40' })],
  }),
  hungry_club_t1: restaurant({
    name: 'Hungry Club',
    cuisine: 'Fast Casual, International',
    amenity: 'fast_food',
    description: 'Dabiz Muñoz, one of the best chefs in the world, presents a gastronomic concept designed for passengers who have little time but want to eat well at the airport — a dynamic, changing menu including soups (ramen or laksa), pizzas with unusual ingredients (kimchi, chips, Iberian ham), sandwiches, hot dogs and sweets such as the flat croissant.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area E', openingHours: '05:00 - 20:30' })],
  }),
  la_barra_de_la_bientirada_t1: restaurant({
    name: 'La Barra de la Bientirada',
    cuisine: 'Spanish, Bar',
    amenity: 'bar',
    phone: '+34 628 453 289',
    description: 'A modern-traditional beer bar with a simple, Mediterranean, quality and traditional menu — the perfect alternative to your time at the airport.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '24 hours', open247: true })],
  }),
  pret_a_manger_t1: restaurant({
    name: 'Pret a Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'fast_food',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    description: "Since the opening of their first shop in 1986, Pret a Manger's mission has been simple — to serve freshly made food and good organic coffee, handmade in their shops' kitchens throughout the day, with 100% organic coffee.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area K', openingHours: '05:00 - 22:00' })],
  }),
  pura_brasa: restaurant({
    name: 'Pura Brasa',
    cuisine: 'Grill, Spanish',
    amenity: 'restaurant',
    logoUrl: logo('purabrasa.com'),
    website: 'https://www.purabrasa.com',
    phone: '+34 620 247 731',
    description: 'The perfect place to enjoy a good meal at the airport. The open kitchen shows the heart of the restaurant: the Josper charcoal oven, trusted by the best national and international chefs. Enjoy the best grilled meats in a warm and cosy setting.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area C', openingHours: '05:10 - 21:40' })],
  }),
  sibarium_t1: restaurant({
    name: 'Sibarium',
    cuisine: 'Delicatessen, Spanish',
    amenity: 'bar',
    phone: '+34 912 302 492',
    description: 'Sibarium Delicatessen offers high quality foods, products with designation of origin and regional/artisan products — ham, sausages, cheese, wine and sweets. After a complete remodelling, the shop added a bar where customers can try some of its most exclusive products.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '07:00 - 22:00' })],
  }),
  starbucks_t1: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.com',
    phone: '+34 620 248 112',
    description: "One of the world's biggest coffee roasters and suppliers, with over 10,000 cafés around the world. Starbucks offers food and drink specialising in Caffé Mocca, Caramel Macchiato, Caffé Latte, Cappuccino, Espresso and Frappuccino, as well as muffins, organic yogurts, sandwiches, brioches and croissants.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '05:30 - 23:00' })],
  }),
  streat: restaurant({
    name: 'StrEat',
    cuisine: 'Food Market, International',
    amenity: 'food_court',
    phone: '+34 620 246 571',
    description: 'A Food Market concept combining different world cuisines. StrEAT is an umbrella brand integrating several specialised spaces themed by gastronomic concepts, inspired by the Street Food trend, offering the most famous brands in a city in a common, very urban and festive space, covering all meal times and combining international and Spanish cuisine.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding area A', openingHours: '07:10 - 22:40' })],
  }),
  tutti_frutti_t1: restaurant({
    name: 'Tutti Frutti',
    cuisine: 'Confectionery, Sweets',
    amenity: 'confectionery',
    description: 'Innovative sweets and a range of top-quality products, including wine gums, snacks, chocolates, nuts and gifts.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '07:00 - 23:00' })],
  }),
  burger_king_t1: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('burgerking.es'),
    website: 'https://www.burgerking.es',
    phone: '+34 620 248 138',
    description: "Burger King® is Do it your way! The most versatile of burgers, cooked to order and just how the customer likes it — the benchmark for grilled beef lovers who want to customise their burger in record time.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '08:30 - 23:00' })],
  }),
};

// ─── Terminal 2 venues ────────────────────────────────────────────────────

const t2Venues = {
  bareto_t2: restaurant({
    name: 'Bareto',
    cuisine: 'Spanish, Tapas Bar',
    amenity: 'bar',
    phone: '+34 620 276 392',
    description: "Bareto is a tribute to the most traditional Madrid bars — a place where the stars are well-poured beers, tapas to go with them and bustling life at the bar. A meeting point to enjoy a good conversation, have an aperitif and have lunch or dinner based on its tapas and dishes, regardless of the time.",
    outlets: [outlet({ airside: 'landside', level: 'Floor 0', locationNotes: 'Arrivals. Public Zone', openingHours: '24 hours', open247: true })],
  }),
  beher_t2: restaurant({
    name: 'Beher',
    cuisine: 'Iberian Deli, Wine Bar',
    amenity: 'bar',
    logoUrl: logo('beher.com'),
    website: 'https://www.beher.com',
    phone: '+34 915 455 000',
    description: 'The best Iberian cold meats, cut to order, and gourmet products such as cheeses, wines, olive oils and patés, plus wines from recognised denominations of origin.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area C', openingHours: '07:00 - 22:30' })],
  }),
  burger_king_t2: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('burgerking.es'),
    website: 'https://www.burgerking.es',
    phone: '+34 683 316 496',
    description: "Burger King® is Do it your way! The most versatile of burgers, cooked to order and just how the customer likes it — the benchmark for grilled beef lovers who want to customise their burger in record time.",
    outlets: [outlet({ airside: 'landside', level: 'Floor 1', locationNotes: 'Departures. Public Zone', openingHours: '04:15 - 22:00 (coffee); 08:30 - 22:00 (restaurant)' })],
  }),
  enrique_tomas_t2: restaurant({
    name: 'Origins by Enrique Tomás',
    cuisine: 'Iberian Ham Bar',
    amenity: 'bar',
    logoUrl: logo('enriquetomas.com'),
    website: 'https://www.enriquetomas.com',
    description: 'All the flavours of Iberia in one dish — a bar offering a varied sample of cuisine including the finest 100% Iberian acorn-fed ham and other typical Iberian products such as chorizo, salchichón and pork loin, washed down with D.O. wines. Ham is hand-cut by Serrano ham masters in front of customers, with the option to buy to take away.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 22:00' })],
  }),
  farine: restaurant({
    name: 'Farine',
    cuisine: 'Bakery, Churros',
    amenity: 'bakery',
    phone: '+34 620 241 873',
    description: 'Farine and La Emilita aim to provide a cosy and laid-back space to enjoy classic churros as well as a selection of high-quality pastries — the quintessential Madrid breakfast.',
    outlets: [outlet({ airside: 'landside', level: 'Floor 0', locationNotes: 'Arrivals. Public Zone', openingHours: '07:10 - 21:40' })],
  }),
  rodilla_t2: restaurant({
    name: 'RODILLA',
    cuisine: 'Sandwiches, Fast Food',
    amenity: 'fast_food',
    logoUrl: logo('rodilla.es'),
    website: 'https://www.rodilla.es',
    description: 'RODILLA is the sandwich brand with the best reputation in the catering sector. Created over 70 years ago, it offers a wide range of products with innovative recipes alongside classic sandwiches — 20 varieties to combine with three types of bread: white, whole-wheat and poppy seed.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area H', openingHours: '06:30 - 22:30' })],
  }),
  santa_gloria: restaurant({
    name: 'Santa Gloria',
    cuisine: 'Bakery, Pastries',
    amenity: 'bakery',
    logoUrl: logo('santagloria.com'),
    website: 'https://www.santagloria.com',
    description: 'A benchmark for artisanal and cosmopolitan breads and pastries, with an avant-garde yet welcoming design based on natural woods and open spaces. Specialises in artisan breads, traditional cakes and the latest international recipes, using top quality, organic, locally sourced ingredients where possible.',
    outlets: [
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area C', openingHours: '05:10 - 20:40', }),
      outlet({ airside: 'landside', level: 'Floor 2', locationNotes: 'Departures. Public Zone', openingHours: '04:10 - 20:40' }),
    ],
  }),
  sibarium_t2: restaurant({
    name: 'Sibarium',
    cuisine: 'Delicatessen, Spanish',
    amenity: 'bar',
    phone: '+34 912 302 492',
    description: 'Sibarium Delicatessen offers high quality foods, products with designation of origin and regional/artisan products — ham, sausages, cheese, wine and sweets. After a complete remodelling, the shop added a bar where customers can try some of its most exclusive products.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '08:10 - 23:20' })],
  }),
  tutti_frutti_t2: restaurant({
    name: 'Tutti Frutti',
    cuisine: 'Confectionery, Sweets',
    amenity: 'confectionery',
    description: 'Innovative sweets and a range of top-quality products, including wine gums, snacks, chocolates, nuts and gifts.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '05:00 - 22:00' })],
  }),
  viandas: restaurant({
    name: 'Viandas',
    cuisine: 'Iberian Deli',
    amenity: 'confectionery',
    phone: '+34 660 056 418',
    description: 'Under the slogan "We are farmers", Viandas is a benchmark brand in the production of ham, cheese and sausages, built on its own production and a real commitment to quality.',
    outlets: [outlet({ airside: 'landside', level: 'Floor 1', locationNotes: 'Parking. Public Zone', openingHours: '08:10 - 14:40' })],
  }),
  vips: restaurant({
    name: 'VIPS',
    cuisine: 'Spanish, International, Café',
    amenity: 'restaurant',
    logoUrl: logo('vips.es'),
    website: 'https://www.vips.es',
    description: "A well-known restaurant chain offering a wide variety of dining options in a comfortable and welcoming setting — a combination of café, restaurant and social space, perfect for breakfast, lunch or a quick break. Full breakfasts, quality coffee, salads, burgers, sandwiches, main courses and desserts.",
    outlets: [outlet({ airside: 'landside', level: 'Floor 2', locationNotes: 'Departures. Public Zone', openingHours: '09:10 - 16:40' })],
  }),
};

// ─── Terminal 3 venues ────────────────────────────────────────────────────

const t3Venues = {
  burger_king_t3: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('burgerking.es'),
    website: 'https://www.burgerking.es',
    phone: '+34 620 244 636',
    description: "Burger King® is Do it your way! The most versatile of burgers, cooked to order and just how the customer likes it — the benchmark for grilled beef lovers who want to customise their burger in record time.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area E', openingHours: '04:00 - 21:00 (coffee); 09:00 - 22:00 (restaurant)' })],
  }),
  chia: restaurant({
    name: 'Chia',
    cuisine: 'Healthy, Brunch',
    amenity: 'cafe',
    vegan: true,
    phone: '+34 660 056 418',
    description: 'The concept of "healthy food & brunch" perfect for any time of day and any type of diet — quality healthy cuisine and original dishes with vegan options and international flavours, made with fresh and natural ingredients, served in a meticulously cared-for, urban, relaxed and welcoming atmosphere.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area D', openingHours: '05:10 - 20:40' })],
  }),
  dehesa_santa_maria: restaurant({
    name: 'Dehesa Santa María',
    cuisine: 'Spanish, Iberian Tapas',
    amenity: 'restaurant',
    description: 'A restaurant offering Iberian tapas made with the best quality products, such as Iberian ham or farmhouse cheeses, plus salads and traditional dishes (Iberian pork fillet, shoulder or loin) from acorn-fed pigs, accompanied by wines with designation of origin and home-made desserts.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area E', openingHours: '05:00 - 21:00' })],
  }),
  hungry_club_t3: restaurant({
    name: 'Hungry Club',
    cuisine: 'Fast Casual, International',
    amenity: 'fast_food',
    description: 'Dabiz Muñoz, one of the best chefs in the world, presents a gastronomic concept designed for passengers who have little time but want to eat well at the airport — a dynamic, changing menu including soups (ramen or laksa), pizzas with unusual ingredients (kimchi, chips, Iberian ham), sandwiches, hot dogs and sweets such as the flat croissant.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '07:30 - 23:45' })],
  }),
  pannus: restaurant({
    name: 'Pannus',
    cuisine: 'Bakery',
    amenity: 'bakery',
    description: 'A key bakery franchise brand with an artisan tradition, bringing together the best professionals in the bakery sector since 1957, with continuous training and an elegant, dynamic corporate image.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area E', openingHours: '04:30 - 21:00' })],
  }),
};

// ─── Terminal 4 venues ────────────────────────────────────────────────────

const t4Venues = {
  aloha: restaurant({
    name: 'Aloha',
    cuisine: 'Poke, Healthy Fast Food',
    amenity: 'fast_food',
    phone: '+34 628 529 997',
    description: 'Aloha is a kind of oasis right in the middle of urban chaos, offering a culinary experience that is anything but ordinary. Freshness and authenticity are its hallmarks — join the fast and healthy food revolution where freshness and speed blend for a unique culinary experience.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area K', openingHours: '06:10 - 21:40' })],
  }),
  balbisiana: restaurant({
    name: 'Balbisiana',
    cuisine: 'Confectionery, Desserts',
    amenity: 'confectionery',
    description: "Point of sale for the artisanal confectionery brand's desserts and sweets, combining classic and innovative recipes.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 20:30' })],
  }),
  bareto_t4: restaurant({
    name: 'Bareto',
    cuisine: 'Spanish, Tapas Bar',
    amenity: 'bar',
    phone: '+34 620 243 982',
    description: "Bareto is a tribute to the most traditional Madrid bars — a place where the stars are well-poured beers, tapas to go with them and bustling life at the bar. A meeting point to enjoy a good conversation, have an aperitif and have lunch or dinner based on its tapas and dishes, regardless of the time.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area D', openingHours: '05:10 - 20:40' })],
  }),
  bottega: restaurant({
    name: 'Bottega Prosecco Bar & Caffè',
    cuisine: 'Italian, Wine Bar',
    amenity: 'bar',
    logoUrl: logo('bottegaspa.com'),
    website: 'https://www.bottegaspa.com',
    description: 'A concept created by Bottega S.p.A., a historic Italian winery from the land of Prosecco, offering a unique experience to enjoy authentic Italian wine — a warm, elegant atmosphere pairing fine Italian wine with Beher 100% Iberian ham and Italian recipes.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 22:00' })],
  }),
  burger_king_t4: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('burgerking.es'),
    website: 'https://www.burgerking.es',
    phone: '+34 620 246 916',
    description: "Burger King® is Do it your way! The most versatile of burgers, cooked to order and just how the customer likes it — the benchmark for grilled beef lovers who want to customise their burger in record time.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area C', openingHours: '04:15 - 22:00 (coffee); 09:00 - 22:00 (restaurant)' })],
  }),
  cafe_pans: restaurant({
    name: 'Café Pans',
    cuisine: 'Café, Bakery',
    amenity: 'cafe',
    logoUrl: logo('pans.es'),
    website: 'https://www.pans.es',
    description: 'The new Café Pans — a unique space to enjoy the best coffee and handmade pastries prepared every day in the restaurant, along with savoury snacks.',
    outlets: [
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area K', openingHours: '06:00 - 21:00' }),
      outlet({ airside: 'landside', level: 'Floor 2', locationNotes: 'Departures. Public Zone', openingHours: '07:00 - 21:00' }),
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area H', openingHours: '06:00 - 21:00' }),
    ],
  }),
  central_cafe: restaurant({
    name: 'Central Café',
    cuisine: 'Healthy, Salads',
    amenity: 'cafe',
    description: 'A commitment to new types of salads based on legumes, cereals, vegetables and fish — highly nutritious, healthy products for light eating every day.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '05:00 - 21:00' })],
  }),
  coffee_republic: restaurant({
    name: 'Coffee Republic',
    cuisine: 'Coffee, Café',
    amenity: 'cafe',
    logoUrl: logo('coffeerepublic.co.uk'),
    website: 'https://www.coffeerepublic.co.uk',
    description: 'A leading brand in the coffee market with extensive consumer recognition — the best coffee accompanied by a wide range of hot and cold drinks and healthy products such as sandwiches, wraps, salads, fruit, and fresh, natural smoothies.',
    outlets: [
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area K', openingHours: '05:00 - 21:00' }),
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '24 hours', open247: true }),
    ],
  }),
  corner_by_real_madrid_t4: restaurant({
    name: 'Corner by Real Madrid',
    cuisine: 'Spanish, Traditional',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('realmadrid.com'),
    website: 'https://www.realmadrid.com',
    description: "A space that combines a catering area with the sale of official Real Madrid products. The restaurant's bar, inspired by the shape of the Santiago Bernabéu stadium, offers local and traditional Spanish cuisine, as well as vegetarian and vegan options.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 22:00' })],
  }),
  deliquo: restaurant({
    name: 'Deliquo',
    cuisine: 'Grab & Go, Healthy',
    amenity: 'fast_food',
    phone: '+34 915 455 000',
    description: 'The most comprehensive and healthiest Grab & Go — salads, freshly baked pastries, sandwiches, baguettes and wraps prepared with the best ingredients, or healthy set menus ready to eat in or take away.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 22:00' })],
  }),
  enrique_tomas_t4: restaurant({
    name: 'Origins by Enrique Tomás',
    cuisine: 'Iberian Ham Bar',
    amenity: 'bar',
    logoUrl: logo('enriquetomas.com'),
    website: 'https://www.enriquetomas.com',
    description: 'All the flavours of Iberia in one dish — a bar offering a varied sample of cuisine including the finest 100% Iberian acorn-fed ham and other typical Iberian products such as chorizo, salchichón and pork loin, washed down with D.O. wines. Ham is hand-cut by Serrano ham masters in front of customers, with the option to buy to take away.',
    outlets: [outlet({ airside: 'landside', level: 'Floor 0', locationNotes: 'Arrivals. Boarding Area H', openingHours: '05:00 - 22:00' })],
  }),
  flax_kale_t4: restaurant({
    name: 'Flax & Kale',
    cuisine: 'Healthy, Plant-based',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('flaxandkale.com'),
    website: 'https://www.flaxandkale.com',
    phone: '+34 620 269 895',
    description: 'A delicious and balanced experience based on a gastronomic offer with 80% plant-based recipes and 20% high-quality animal protein. Dishes designed for nutritional value in an elegant, relaxing space, focused on health, leisure, innovation, balance and commitment. Eat Better®.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area B', openingHours: '07:10 - 22:40' })],
  }),
  foodies_t4: restaurant({
    name: "Foodies'",
    cuisine: 'Iberian Ham',
    amenity: 'confectionery',
    description: 'For almost 40 years, striving to secure Iberian ham the place it deserves in global gastronomic rankings — shops stocked with all types of hams in all possible formats, so every customer finds the right type and format.',
    outlets: [outlet({ airside: 'landside', level: 'Floor 2', locationNotes: 'Departures. Public Zone', openingHours: '05:00 - 21:00' })],
  }),
  hungry_club_t4: restaurant({
    name: 'Hungry Club',
    cuisine: 'Fast Casual, International',
    amenity: 'fast_food',
    description: 'Dabiz Muñoz, one of the best chefs in the world, presents a gastronomic concept designed for passengers who have little time but want to eat well at the airport — a dynamic, changing menu including soups (ramen or laksa), pizzas with unusual ingredients (kimchi, chips, Iberian ham), sandwiches, hot dogs and sweets such as the flat croissant.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '06:00 - 00:00' })],
  }),
  kabuki: restaurant({
    name: 'Kabuki',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    logoUrl: logo('kabukirestaurantes.com'),
    website: 'https://www.kabukirestaurantes.com',
    phone: '+34 620 266 405',
    description: 'The first Japanese restaurant to open in a Spanish airport — Japan and the Mediterranean united by gastronomy, with show cooking by sushi chefs supervised by chef Ricardo Sanz of the Kabuki Group (five restaurants, three with a Michelin star). Classic recipes for nigiris, sashimis and makis, soups and vegetables, plus takeaway for passengers pressed for time.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '08:10 - 21:40' })],
  }),
  la_barra_de_la_bientirada_t4: restaurant({
    name: 'La Barra de la Bientirada',
    cuisine: 'Spanish, Bar',
    amenity: 'bar',
    phone: '+34 620 275 864',
    description: 'A modern-traditional beer bar with a simple, Mediterranean, quality and traditional menu — the perfect alternative to your time at the airport.',
    outlets: [outlet({ airside: 'landside', level: 'Floor 2', locationNotes: 'Departures. Public Zone', openingHours: '06:10 - 22:40' })],
  }),
  la_bientirada: restaurant({
    name: 'La Bientirada',
    cuisine: 'Spanish, Traditional',
    amenity: 'restaurant',
    phone: '+34 620 275 166',
    description: 'A very traditional menu with dishes and portions to suit all tastes — famous Russian salad, tortilla slice, broken eggs, squid strips, or sandwiches, in a versatile menu focused on high-quality products.',
    outlets: [outlet({ airside: 'landside', level: 'Floor 2', locationNotes: 'Departures. Public Zone', openingHours: '13:10 - 16:40' })],
  }),
  la_place: restaurant({
    name: 'La Place',
    cuisine: 'Grab & Go, Bakery',
    amenity: 'fast_food',
    logoUrl: logo('la-place.com'),
    website: 'https://www.la-place.com',
    phone: '+34 620 259 252',
    description: "An internationally renowned brand coming to Spain for the first time, presenting fast service and an attractive range of Grab&Go products — a cool, trendy concept of freshly prepared, 100% natural, healthy products made with seasonal ingredients.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '05:10 - 21:40' })],
  }),
  la_taberna_de_la_ancha: restaurant({
    name: 'La Taberna de La Ancha',
    cuisine: 'Spanish, Tavern',
    amenity: 'bar',
    logoUrl: logo('familialaancha.com'),
    website: 'https://www.familialaancha.com',
    phone: '+34 620 266 771',
    description: 'A tavern specialising in omelettes and beer, designed as a space for traditional cuisine where every customer is welcomed as if at home — a project by chef Nino Redruello and Familia La Ancha, offering some of Armando’s most representative dishes such as Escalopes Armando or the San Jacoba burger.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '05:10 - 23:40' })],
  }),
  levadura_madre: restaurant({
    name: 'Levadura madre',
    cuisine: 'Bakery, Café',
    amenity: 'bakery',
    logoUrl: logo('levaduramadre.es'),
    website: 'https://www.levaduramadre.es',
    description: 'Known for its famous freshly baked breads and pastries, offering coffee, pastries, gourmet sandwiches and a carefully selected range of beverages to make your time at the airport more delicious.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 22:00' })],
  }),
  mcdonalds: restaurant({
    name: 'McDonald’s',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('mcdonalds.es'),
    website: 'https://www.mcdonalds.es',
    phone: '+34 913 338 018',
    description: "McDonald's is the leading catering company in Spain and worldwide — an absolute priority that products served in its restaurants are safe and top quality, given the responsibility of serving thousands of consumers every day.",
    outlets: [
      outlet({ airside: 'landside', level: 'Floor 2', locationNotes: 'Departures. Public Zone', openingHours: '24 hours', open247: true }),
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '24 hours', open247: true }),
    ],
  }),
  moscovitas: restaurant({
    name: 'Moscovitas',
    cuisine: 'Confectionery, Pastries',
    amenity: 'confectionery',
    description: 'Moscovitas markets fine almond and chocolate pastries from Asturias.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. South Dock Boarding Area', openingHours: '06:00 - 20:00' })],
  }),
  oliva_bellota: restaurant({
    name: 'Oliva & Bellota',
    cuisine: 'Gourmet, Spanish Regional',
    amenity: 'confectionery',
    phone: '+34 912 302 492',
    description: 'A space bringing together the best gastronomic brands on the market to create an attractive experience for passengers — experts in offering the best and highest-quality regional and local products.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area K', openingHours: '05:30 - 21:00' })],
  }),
  paul_t4: restaurant({
    name: 'Paul',
    cuisine: 'Bakery, French',
    amenity: 'bakery',
    logoUrl: logo('paul.fr'),
    website: 'https://www.paul.fr',
    phone: '+34 620 276 205',
    description: "Paul's success is based on the high quality of its products and the glamour and tradition of its warm, welcoming rustic architecture and elegant black façade — a wide variety of the best freshly-made filled rolls, prepared with respect for traditional baking.",
    outlets: [outlet({ airside: 'landside', level: 'Floor 0', locationNotes: 'Arrivals. Public Zone', openingHours: '07:10 - 21:40' })],
  }),
  pret_a_manger_t4: restaurant({
    name: 'Pret a Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'fast_food',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    description: "Since the opening of their first shop in 1986, Pret a Manger's mission has been simple — to serve freshly made food and good organic coffee, handmade in their shops' kitchens throughout the day, with 100% organic coffee.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area H', openingHours: '05:00 - 21:00' })],
  }),
  ritazza: restaurant({
    name: 'Ritazza',
    cuisine: 'Coffee, Italian',
    amenity: 'cafe',
    logoUrl: logo('ritazza.com'),
    website: 'https://www.ritazza.com',
    description: 'An exclusive experience combining great Italian coffee with attentive, personalised service, and an environment with attention to detail. Ground beans in every coffee, staff trained as professional baristas, and fresh products prepared daily — filled rolls, sandwiches, salads, fresh fruit and freshly baked pastries.',
    outlets: [outlet({ airside: 'landside', level: 'Floor 1', locationNotes: 'Bus Terminal. Public Zone', openingHours: '06:00 - 00:00' })],
  }),
  rodilla_t4: restaurant({
    name: 'RODILLA',
    cuisine: 'Sandwiches, Fast Food',
    amenity: 'fast_food',
    logoUrl: logo('rodilla.es'),
    website: 'https://www.rodilla.es',
    phone: '+34 620 244 756',
    description: 'RODILLA is the sandwich brand with the best reputation in the catering sector. Created over 70 years ago, it offers a wide range of products with innovative recipes alongside classic sandwiches — 20 varieties to combine with three types of bread: white, whole-wheat and poppy seed.',
    outlets: [
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area D', openingHours: '24 hours (self-service); 05:10 - 20:40 (kiosk)' }),
      outlet({ airside: 'landside', level: 'Floor 0', locationNotes: 'Arrivals. Public Zone', openingHours: '07:00 - 22:00' }),
    ],
  }),
  sibarium_t4: restaurant({
    name: 'Sibarium',
    cuisine: 'Delicatessen, Spanish',
    amenity: 'bar',
    phone: '+34 912 302 492',
    description: 'Sibarium Delicatessen offers high quality foods, products with designation of origin and regional/artisan products — ham, sausages, cheese, wine and sweets. After a complete remodelling, the shop added a bar where customers can try some of its most exclusive products.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '08:00 - 23:00' })],
  }),
  torrons_vicens: restaurant({
    name: 'Torrons Vicens',
    cuisine: 'Confectionery, Nougat',
    amenity: 'confectionery',
    logoUrl: logo('torronsvicens.com'),
    website: 'https://www.torronsvicens.com',
    description: 'Since 1775, Torrons Vicens has been handcrafting a wide selection of nougat and specialities, using top quality products and following the original recipes and formulas of the master nougat makers of Agramunt.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 21:30' })],
  }),
  tutti_frutti_t4: restaurant({
    name: 'Tutti Frutti',
    cuisine: 'Confectionery, Sweets',
    amenity: 'confectionery',
    description: 'Innovative sweets and a range of top-quality products, including wine gums, snacks, chocolates, nuts and gifts.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area D', openingHours: '07:00 - 23:00' })],
  }),
};

// ─── Terminal 4S venues (T4 satellite building) ──────────────────────────

const t4sVenues = {
  arzabal: restaurant({
    name: 'Arzábal',
    cuisine: 'Spanish, Tapas Bar',
    amenity: 'bar',
    phone: '+34 620 676 481',
    description: 'A shrine to traditional cuisine in which the very essence of tapas bars and glasses of wine offer the highest quality ingredients.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '06:00 - 00:30' })],
  }),
  beher_t4s: restaurant({
    name: 'Beher',
    cuisine: 'Iberian Deli, Wine Bar',
    amenity: 'bar',
    logoUrl: logo('beher.com'),
    website: 'https://www.beher.com',
    phone: '+34 915 455 000',
    description: 'The best Iberian cold meats, cut to order, and gourmet products such as cheeses, wines, olive oils and patés, plus wines from recognised denominations of origin.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '08:00 - 23:40' })],
  }),
  burger_king_t4s: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('burgerking.es'),
    website: 'https://www.burgerking.es',
    description: "Burger King® is Do it your way! The most versatile of burgers, cooked to order and just how the customer likes it — the benchmark for grilled beef lovers who want to customise their burger in record time.",
    outlets: [
      outlet({ airside: 'airside', level: 'Floor 2', locationNotes: 'Departures. Passenger-only zone', openingHours: '06:10 - 21:00 (coffee); 09:00 - 21:00 (restaurant)' }),
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '08:30 - 23:00' }),
    ],
  }),
  deli_cia: restaurant({
    name: 'Deli&Cia',
    cuisine: 'Sandwiches, Healthy Fast Food',
    amenity: 'fast_food',
    description: 'A young, internationally present brand with a varied offering for travellers on a tight schedule who want to eat healthily — sandwiches, wraps, hot Mediterranean snacks, fresh salads, seasonal creams, desserts, and a range of sweet and savoury snacks and drinks.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding area M', openingHours: '06:10 - 21:40' })],
  }),
  flax_kale_t4s: restaurant({
    name: 'Flax & Kale',
    cuisine: 'Healthy, Plant-based',
    amenity: 'restaurant',
    vegetarian: true,
    vegan: true,
    logoUrl: logo('flaxandkale.com'),
    website: 'https://www.flaxandkale.com',
    phone: '+34 620 262 041',
    description: 'A delicious and balanced experience based on a gastronomic offer with 80% plant-based recipes and 20% high-quality animal protein. Dishes designed for nutritional value in an elegant, relaxing space, focused on health, leisure, innovation, balance and commitment. Eat Better®.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '24 hours', open247: true })],
  }),
  foodies_t4s: restaurant({
    name: "Foodies'",
    cuisine: 'Iberian Ham',
    amenity: 'confectionery',
    description: 'For almost 40 years, striving to secure Iberian ham the place it deserves in global gastronomic rankings — shops stocked with all types of hams in all possible formats, so every customer finds the right type and format.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '06:00 - 20:30' })],
  }),
  hungry_club_t4s: restaurant({
    name: 'Hungry Club',
    cuisine: 'Fast Casual, International',
    amenity: 'fast_food',
    description: 'Dabiz Muñoz, one of the best chefs in the world, presents a gastronomic concept designed for passengers who have little time but want to eat well at the airport — a dynamic, changing menu including soups (ramen or laksa), pizzas with unusual ingredients (kimchi, chips, Iberian ham), sandwiches, hot dogs and sweets such as the flat croissant.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area J', openingHours: '06:00 - 22:00' })],
  }),
  la_jamoneria: restaurant({
    name: 'La Jamonería',
    cuisine: 'Iberian Ham, Sandwiches',
    amenity: 'fast_food',
    description: 'Specialised in preparing and selling ham sandwiches, selected cured meats, and gourmet products and drinks, with a careful selection of high-quality ingredients and a focus on Spanish culinary tradition.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '05:00 - 00:00' })],
  }),
  madri: restaurant({
    name: 'Madrí',
    cuisine: 'Spanish, Tavern',
    amenity: 'bar',
    logoUrl: logo('madriexcepcional.com'),
    website: 'https://www.madriexcepcional.com',
    description: 'A traditional tavern with an excellent product, a bar and accessible prices.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '08:00 - 23:40' })],
  }),
  on_your_way: restaurant({
    name: 'On your way',
    cuisine: 'Grab & Go, Convenience',
    amenity: 'fast_food',
    description: "The first self-service store in a Spanish airport, located in the Terminal 4 satellite building. With the collaboration of Mastercard, this store allows customers to purchase without going to a till, thanks to an advanced sensor system that links a person's shape with their credit cards.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding area M', openingHours: '07:00 - 23:00' })],
  }),
  paul_t4s: restaurant({
    name: 'Paul',
    cuisine: 'Bakery, French',
    amenity: 'bakery',
    logoUrl: logo('paul.fr'),
    website: 'https://www.paul.fr',
    phone: '+34 628 529 303',
    description: "Paul's success is based on the high quality of its products and the glamour and tradition of its warm, welcoming rustic architecture and elegant black façade — a wide variety of the best freshly-made filled rolls, prepared with respect for traditional baking.",
    outlets: [
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '07:10 - 23:00' }),
      outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '09:10 - 16:40 and 20:10 - 23:40' }),
    ],
  }),
  sibarium_t4s: restaurant({
    name: 'Sibarium',
    cuisine: 'Delicatessen, Spanish',
    amenity: 'bar',
    phone: '+34 912 302 492',
    description: 'Sibarium Delicatessen offers high quality foods, products with designation of origin and regional/artisan products — ham, sausages, cheese, wine and sweets. After a complete remodelling, the shop added a bar where customers can try some of its most exclusive products.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area D', openingHours: '08:00 - 20:30' })],
  }),
  soho_coffee: restaurant({
    name: 'Soho Coffee',
    cuisine: 'Coffee, Healthy Fast Food',
    amenity: 'cafe',
    logoUrl: logo('sohocoffee.co.uk'),
    website: 'https://www.sohocoffee.co.uk',
    description: 'The best organic coffee and a wide range of healthy food and takeaway — salads, wraps, sandwiches, juices and smoothies, with artisan roots to meet growing demand for vegetarian and vegan options.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '04:00 - 01:00' })],
  }),
  starbucks_t4s: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.com',
    phone: '+34 620 264 203',
    description: "One of the world's biggest coffee roasters and suppliers, with over 10,000 cafés around the world. Starbucks offers food and drink specialising in Caffé Mocca, Caramel Macchiato, Caffé Latte, Cappuccino, Espresso and Frappuccino, as well as muffins, organic yogurts, sandwiches, brioches and croissants.",
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '06:00 - 23:00' })],
  }),
  tony_romas: restaurant({
    name: "Tony Roma's",
    cuisine: 'American, Grill',
    amenity: 'restaurant',
    logoUrl: logo('tonyromas.com'),
    website: 'https://www.tonyromas.com',
    phone: '+34 915 455 000',
    description: 'Enjoy an authentic 100% American experience with a selection of food combining the most classic recipes with new proposals: world-famous baby back ribs, nachos, onion rings, grilled burgers and meat, and the popular cookie.',
    outlets: [outlet({ airside: 'airside', level: 'Floor 1', locationNotes: 'Departures. Boarding Area S', openingHours: '07:00 - 23:40' })],
  }),
};

// ─── upload: detect airport slug, match existing docs by normalized name ────

async function findAirportId() {
  for (const id of CANDIDATE_AIRPORT_IDS) {
    const terminalsSnap = await db.collection('airports').doc(id).collection('terminals').get();
    if (!terminalsSnap.empty) {
      console.log(`Using existing airport doc '${id}' (${terminalsSnap.size} terminal(s) found).`);
      return id;
    }
  }
  console.log(`No existing terminals found under any of [${CANDIDATE_AIRPORT_IDS.join(', ')}] — defaulting to '${CANDIDATE_AIRPORT_IDS[0]}'. If this airport uses a different slug, set AIRPORT_ID_OVERRIDE above and re-run. If NEITHER slug has any existing data, confirm with the user before proceeding — this script should not silently create a brand-new airport.`);
  return CANDIDATE_AIRPORT_IDS[0];
}

async function processTerminal(AIRPORT, terminalId, terminalName, venues) {
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

  for (const [key, data] of Object.entries(venues)) {
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
  const AIRPORT = AIRPORT_ID_OVERRIDE || await findAirportId();
  console.log(`Using airport doc '${AIRPORT}'.`);

  const t1Result = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', t1Venues);
  const t2Result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', t2Venues);
  const t3Result = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues);
  const t4Result = await processTerminal(AIRPORT, TERMINAL_4, 'Terminal 4', t4Venues);
  const t4sResult = await processTerminal(AIRPORT, TERMINAL_4S, 'Terminal 4S', t4sVenues);

  const totalUpdated = t1Result.updated + t2Result.updated + t3Result.updated + t4Result.updated + t4sResult.updated;
  const totalCreated = t1Result.created + t2Result.created + t3Result.created + t4Result.created + t4sResult.created;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t2Venues).length + Object.keys(t3Venues).length + Object.keys(t4Venues).length + Object.keys(t4sVenues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
