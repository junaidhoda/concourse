'use strict';
/**
 * Fills in complete data for all Frankfurt Airport (FRA) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official Frankfurt Airport
 * "Eat & Drink" directory (frankfurt-airport.com/en/at-the-airport/eat-drink.html)
 * and each venue's individual detail page on 2026-08-03.
 *
 * Frankfurt's live directory lists ~90 individual outlet rows (some brands have
 * multiple physical counters) across 64 distinct brand names, each tagged with
 * Terminal + Area + landside/airside zone + open status, but NOT description/
 * cuisine/hours — those only appear on each brand's own detail page(s), which
 * were visited individually to source the description, cuisine, opening hours,
 * payment types, phone and email used below.
 *
 * Terminal/location groupings used here (matching the live site, NOT the older
 * upload_to_firestore.py list which still shows a since-closed Terminal 2):
 *   - Terminal 1: Areas A, B, C, Z (all currently active)
 *   - Terminal 3: Areas H, J (opened since upload_to_firestore.py was written)
 *   - The Squaire: a landside shopping/office complex directly connected to T1,
 *     not part of the original terminal list — modeled as its own terminal
 *     grouping ("the_squaire") since it's a physically distinct building.
 *   - Terminal 2 is OMITTED: the live directory shows zero current F&B listings
 *     there, consistent with T2 being phased out as T3 opened.
 *
 * As with Dublin, docs are grouped by (name, terminal-grouping): multiple
 * physical counters of the same brand WITHIN the same terminal grouping are
 * combined into one doc with multiple `outlets[]`. A brand with counters in
 * DIFFERENT terminal groupings (AMORE, Burger King, QUICKER's, REWE To Go,
 * Starbucks) gets a separate doc per terminal grouping.
 *
 * A few site data-quality notes, so the choices below aren't mistaken for gaps:
 *   - "Le Crogbag" is a duplicate/typo listing of "Le Crobag" (identical brand
 *     copy) — merged into one Le Crobag doc with 2 outlets.
 *   - "Goodman & Filippo" and 3 of "MONDO Bar"'s listed rows repeat the exact
 *     same Terminal/Area/zone under different generated URLs — treated as one
 *     physical outlet each rather than real duplicates.
 *   - "Heberer Traditional Bakery" / "Heberer's Traditional Bakery" (missing
 *     vs. present apostrophe) are the same bakery chain at 3 physical counters
 *     — merged into one "Heberer's Traditional Bakery" doc.
 *   - Only the specific outlet page visited for each brand had its exact
 *     level/hours confirmed; sibling same-brand outlets in the same terminal
 *     reuse that brand's confirmed level/hours as the best available estimate
 *     (multi-counter chains at FRA run near-identical hours in practice).
 *
 * Because Firebase Console access isn't available, this script uses 'fra'
 * directly (found consistently across upload_to_firestore.py, migrate_firestore.js
 * and cleanup_firestore.js with no ambiguity), with an override constant
 * available as a defensive escape hatch, and matches existing restaurant docs
 * by normalized name within each terminal grouping — updating in place if
 * found, creating new otherwise.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_fra_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const AIRPORT_ID_OVERRIDE = null; // set this if 'fra' turns out to be wrong
const AIRPORT_ID_DEFAULT = 'fra';

const TERMINAL_1 = 'terminal_1';
const TERMINAL_3 = 'terminal_3';
const THE_SQUAIRE = 'the_squaire';

// ─── helpers (matches admin_restaurant_editor_screen.dart's save shape) ──────

function outlet({ airside = 'airside', level = '', locationNotes = '', gateArea = '', openingHours = '', open247 = false }) {
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

// ─── Terminal 1 venues (Areas A, B, C, Z) ────────────────────────────────────

const t1Venues = {
  amore_t1: restaurant({
    name: 'AMORE',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'AMORE stands for authentic Italian cuisine with a modern twist and attention to detail—evident in the product range and stylish store design. The menu includes pasta, pizza, focaccia, and a selection of classic Italian drinks such as Negroni or Aperol Spritz for a typical aperitivo. AMORE is aimed at modern families and quality-conscious connoisseurs who value high-quality food, excellent drinks, and a special atmosphere.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  anton_and_anni: restaurant({
    name: 'Anton & Anni',
    cuisine: 'German, Bavarian',
    amenity: 'bar',
    description: "Spend some time in Anton & Anni's small yet charming Bavarian beer garden. Here, you can enjoy traditional German dishes such as white sausage, hearty snacks, liver sausage, and fresh sausage salad. There is also a selection of different beers to try. Surrounded by warm wood, blue-and-white décor, and bright fairy lights, you can experience authentic Bavarian coziness and hospitality — a little piece of Bavaria right at the airport. Anton & Anni is a partner of Miles & More.",
    outlets: [
      outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area Z', openingHours: 'Mon-Sun 06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 22:00' }),
    ],
  }),
  bean_love: restaurant({
    name: 'Bean Love',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'With its minimalist design and the friendly smiles of our barista-trained staff, Bean Love brings authentic coffee culture to Frankfurt Airport. With our beans – whether prepared with a fully automatic machine, a filter coffee machine, or heated on the stove with an Italian espresso maker – coffee becomes a little taste sensation.',
    phone: '',
    outlets: [outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 07:00 - 20:00' })],
  }),
  best_worscht_in_town: restaurant({
    name: 'Best Worscht in Town',
    cuisine: 'German, Currywurst',
    amenity: 'fast_food',
    description: 'Best Worscht in Town, located in Terminal 1, Level U1, Area A, has long been known beyond Frankfurt for its wide variety of curry sauces. It\'s a must-visit for currywurst lovers. Chili fans in particular will enjoy the different levels of spiciness on the "Brenn-O-Meter." The currywurst is served with either crispy French fries or fresh farmhouse bread. There is also an organic vegan version of the currywurst.',
    phone: '+49 69 031748',
    vegan: true,
    outlets: [outlet({ airside: 'landside', level: 'Level 0', gateArea: 'Area A', locationNotes: 'Airport City Mall', openingHours: 'Mon-Sun 10:00 - 22:00' })],
  }),
  bistrot_frankfurt_airport: restaurant({
    name: 'Bistrot Frankfurt Airport',
    cuisine: 'Italian, International',
    amenity: 'restaurant',
    description: 'The Bistrot offers a wide range of lovingly prepared dishes. Enjoy freshly baked pizza, delicious pasta or regional specialities such as Frankfurt schnitzel. The menu also features hearty burgers, crisp salads and tempting desserts. The integrated coffee bar is the perfect place to take a relaxing break and enjoy aromatic coffee specialities. There are also numerous snacks and meals available to take away for those in a hurry.',
    phone: '+49 69 690 31120',
    outlets: [outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 10:00 - 18:00' })],
  }),
  bistrot_snack_bar: restaurant({
    name: 'Bistrot Snack Bar',
    cuisine: 'Italian, International',
    amenity: 'fast_food',
    description: 'In the Bistrot Frankfurt Airport you can enjoy pizza, pasta and many other lovingly prepared dishes such as Frankfurter Schnitzel, burgers, salads and desserts. The integrated coffee bar is a starting point for small breaks. If you can\'t linger, you will also find many snacks to take away.',
    phone: '+49 69 69031120',
    outlets: [outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  brewgate: restaurant({
    name: 'Brewgate - Coffee, Beer & Bites',
    cuisine: 'Gastropub, International',
    amenity: 'bar',
    description: 'A large selection of brewed beers and freshly brewed coffee specialities are at the heart of the Brewgate experience. Exquisite wines and spirits, served by experienced bartenders, round off the range of drinks. The culinary offering includes a wide selection of savoury dishes, such as sausages or the Brewgate Pizza. Brewgate combines a love of diverse beer, the art of brewing coffee, a hearty menu and live sports broadcasts in a modern gastropub setting.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  burger_king_t1: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('bk.com'),
    website: 'https://www.burgerking.de',
    description: 'Frankfurt Airport\'s Burger King serves the full range of classics, with vegetarian and vegan alternatives and the King Jr. Box for kids. Burger King is a partner of Miles & More.',
    phone: '+49 (0)69 690-28599',
    vegetarian: true,
    vegan: true,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area Z', openingHours: 'Mon-Sun 06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 22:00' }),
    ],
  }),
  caffe_ritazza: restaurant({
    name: 'Caffè Ritazza',
    cuisine: 'Café, Italian',
    amenity: 'cafe',
    description: 'Caffè Ritazza covers sandwiches, pinsas, salads, sweets, and coffee in a relaxed café setting.',
    phone: '+49 69 9511500',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area Z', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  ciao_italia: restaurant({
    name: 'Ciao Italia',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'Ciao Italia serves Italian pizza, salads, pasta and gelato in Terminal 1.',
    phone: '+49 69 69024466',
    outlets: [outlet({ airside: 'landside', level: 'Level 1', gateArea: 'Area B', openingHours: 'Mon-Sun 10:00 - 21:00' })],
  }),
  coffee_fellows: restaurant({
    name: 'Coffee Fellows',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'At Coffee Fellows, located directly opposite the visitor center, you can enjoy a cozy atmosphere where you can savor high-quality coffee specialties and a wide selection of snacks and sweet treats. Indulge in freshly brewed coffee, aromatic teas, and delicious bagels, sandwiches, or cakes.',
    outlets: [outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area C', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  deli_bros: restaurant({
    name: 'DELI BROS',
    cuisine: 'German, International',
    amenity: 'restaurant',
    description: 'DELI BROS. combines German and international cuisine, modeled on the classic New York deli. In addition to its all-day breakfast selection, DELI BROS. impresses with uncomplicated and delicious dishes: sausages and pasta, salads and burgers, homemade cakes and ice cream, high-quality food and delicacies, wine, and champagne.',
    phone: '+49 151 72488992',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', locationNotes: 'Between gates B60 and B63', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  falconis: restaurant({
    name: "Falconi's",
    cuisine: 'Italian, American',
    amenity: 'restaurant',
    description: "Falconi's serves Pasta and Pollo. After a lavish American-style breakfast, the focus shifts to classic Italian dishes and their American counterparts. First and second courses, salads, and desserts are served alongside panini and burgers, served just as in Little Italy in the heart of Manhattan.",
    phone: '+49 171 64 90 511',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  goethe_bar: restaurant({
    name: 'Goethe Bar',
    cuisine: 'German, International',
    amenity: 'bar',
    description: "Dedicated to Frankfurt's famous son, the Goethe Bar offers coffee, wine, beer and even champagne, alongside a variety of hot and cold snacks. The bar is understated yet elegant. Frankfurt specialities are extremely popular, but the international dishes and all-day breakfast options are impressive too.",
    phone: '+49 151 72488994',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  goodman_and_filippo: restaurant({
    name: 'Goodman & Filippo',
    cuisine: 'Italian, American',
    amenity: 'restaurant',
    description: 'GOODMAN & FILIPPO offers exceptional food and beverages from its Italian-American deli concept. Everything is available to go or to enjoy on site, from detox salads and New York surf-and-turf burgers to focaccia, sandwiches, desserts, and breakfast items, as well as soft drinks, beers, and wines. Goodman & Filippo is a partner of Miles & More.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 05:30 - 21:30' })],
  }),
  hausmanns_bar: restaurant({
    name: "Hausmann's Bar (To Go) by Tim Mälzer",
    cuisine: 'German, Bar',
    amenity: 'bar',
    description: "Just a stone's throw from the restaurant, guests can help themselves to a wide range of takeaway delicacies in the 'house bar'. As well as a wide range of snacks, bar guests can enjoy craft beer and homemade juices, smoothies and shakes, alcoholic and non-alcoholic. Hausmann's Bar is a partner of Miles & More.",
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  hausmanns_restaurant: restaurant({
    name: "Hausmann's Restaurant (by Tim Mälzer)",
    cuisine: 'German',
    amenity: 'restaurant',
    description: "Hausmann's is an all-day establishment that combines a restaurant, bar, and takeaway service. Its home-cooking atmosphere and open kitchen offer honest, home-style cooking. The menu features vegan and vegetarian dishes, as well as meat products from sustainable farms. The craft beer bar offers freshly tapped beer from the Überquell brewery. TV chef Tim Mälzer and gastronomic multi-concept operator Patrick Rüther created the concept. Hausmann's Restaurant is a partner of Miles & More.",
    vegetarian: true,
    vegan: true,
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  heberers_traditional_bakery: restaurant({
    name: "Heberer's Traditional Bakery",
    cuisine: 'Bakery',
    amenity: 'bakery',
    description: "Family tradition for more than 100 years. Using the finest ingredients and tried-and-true recipes, the bakers draw on over 100 years of family tradition. Enjoy savory specialties such as truffle salami in ciabatta dough, fougasse with oilseeds, and classic poppy seed cake, paired with freshly brewed coffee made from 100% Arabica beans, various teas, or hot chocolate.",
    phone: '+49 69 69027537',
    outlets: [
      outlet({ airside: 'landside', level: 'Level 0', gateArea: 'Area B', locationNotes: 'Airport City Mall', openingHours: 'Mon-Sun 05:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 05:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area Z', openingHours: 'Mon-Sun 05:00 - 22:00' }),
    ],
  }),
  hermanns: restaurant({
    name: "Hermann's",
    cuisine: 'German, Sausages',
    amenity: 'restaurant',
    description: "At Hermann's Restaurant, you can expect a wide selection of regional sausages, accompanied by homemade salads and fresh pretzels, and a freshly tapped beer. Be inspired by the special 1950s-style ambience, which combines the iconic retro butcher's style with modern design. Hermann's is a partner of Miles & More.",
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', locationNotes: 'Near gate A24', openingHours: 'Mon-Sun 06:00 - 21:30' })],
  }),
  hermanns_mobile: restaurant({
    name: "Hermann's Mobile",
    cuisine: 'German, Sausages',
    amenity: 'fast_food',
    description: "Hermann's Mobile food trucks bring Hermann's most popular sausage specialties right to where travelers are craving a delicious snack, with a small but exquisite selection of sauces, salads, bread rolls, and drinks to go with them.",
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 05:30 - 22:30' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 05:30 - 22:30' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area Z', openingHours: 'Mon-Sun 05:30 - 22:30' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area Z', openingHours: 'Mon-Sun 05:30 - 22:30' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area Z', openingHours: 'Mon-Sun 05:30 - 22:30' }),
    ],
  }),
  hucks_lieblingsplatz: restaurant({
    name: 'Hucks Lieblingsplatz',
    cuisine: 'Bakery, German',
    amenity: 'bakery',
    description: 'The Huck Bakery and Pastry Shop is a family-run business based in Frankfurt. Since 1936, it has been operated with passion by the third generation. In addition to breakfast items, Huck offers snacks, soups, salads, traditional Hessian dishes, and a wide variety of fresh, homemade baked goods. Located directly at the entrance to Terminal 1, Hall A, Huck is the perfect meeting place.',
    phone: '+49 69 97843523',
    outlets: [outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 20:00' })],
  }),
  kamps: restaurant({
    name: 'Kamps',
    cuisine: 'Bakery',
    amenity: 'bakery',
    description: 'At Kamps you will find a wide selection of freshly baked rolls, crispy bread specialties, and savory snacks — perfect for a quick breakfast, a snack between meals, or something to enjoy on the go. Kamps is a partner of Miles & More.',
    phone: '+49 69 69715848',
    outlets: [outlet({ airside: 'landside', level: 'Level 1', gateArea: 'Area B', openingHours: 'Mon-Sun 05:00 - 21:00' })],
  }),
  kfc: restaurant({
    name: 'KFC Kentucky Fried Chicken',
    cuisine: 'Fast Food, Chicken',
    amenity: 'fast_food',
    logoUrl: logo('kfc.com'),
    website: 'https://www.kfc.de',
    description: "At the KFC location in Frankfurt Airport, you'll find classic buckets of crispy chicken pieces, fillet strips, or hot wings, grilled chicken products, juicy fillet bites, tasty wraps, burgers, and popular side dishes such as corn on the cob, mashed potatoes, fresh salads, and coleslaw.",
    phone: '+49 69 69027295',
    outlets: [outlet({ airside: 'landside', level: 'Level 0', gateArea: 'Area A', openingHours: 'Mon-Sun 11:00 - 19:00' })],
  }),
  le_crobag: restaurant({
    name: 'Le Crobag',
    cuisine: 'Bakery, French',
    amenity: 'bakery',
    description: "Le Crobag serves sweet and savory French croissants and baguettes, or try the ficelle, a delicate variant of the baguette, alongside an extensive coffee selection.",
    outlets: [outlet({ airside: 'landside', level: 'Level 1', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  lucullus_nero: restaurant({
    name: 'Lucullus Nero',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'The Lucullus NERO restaurant serves traditional cucina Italiana in an authentic atmosphere. The wide choice of reinterpreted Italian dishes can either be enjoyed in the cozy à la carte area with show kitchen or ordered to take away. Lucullus Nero is a partner of Miles & More.',
    phone: '+49 69 9511500',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area Z', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  manga_sushi: restaurant({
    name: 'Manga Sushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    description: 'Manga Sushi is a fresh, modern concept inspired by Japanese comics. Lovers of Japanese cuisine will find authentic sushi as well as creative and surprising delicacies and refreshments, all available to take away, alongside comics, gifts, and stylish accessories. Manga Sushi is a partner of Miles & More.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 05:30 - 22:00' })],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('mcdonalds.com'),
    website: 'https://www.mcdonalds.de',
    description: "Many factors contribute to a unique dining experience at McDonald's Frankfurt Airport: excellent ingredients, fast service, and a welcoming atmosphere. Here you'll find all the McDonald's classics, sweet treats from McCafé, and delicious new menu items.",
    phone: '+49 69 69032068',
    outlets: [outlet({ airside: 'landside', level: 'Level 0', gateArea: 'Area A', openingHours: 'Mon-Sun 04:00 - 01:00' })],
  }),
  meyer_deli_coffee_kitchen: restaurant({
    name: 'Meyer Deli Coffee Kitchen',
    cuisine: 'Café, Deli',
    amenity: 'cafe',
    description: 'Meyer Deli Coffee Kitchen is a third-generation family business in Frankfurt that delights customers with a lovingly selected range of food and drinks: delicious paninis, homemade sandwiches, and crisp salads prepared with fresh ingredients, complemented by desserts and freshly squeezed juices.',
    phone: '+49 69 69029265',
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 21:30' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 21:30' }),
      outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 21:30' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 21:30' }),
    ],
  }),
  minibar: restaurant({
    name: 'Minibar',
    cuisine: 'Café, Deli',
    amenity: 'fast_food',
    description: 'Minibar offers delicious focaccia, paninis and sandwiches, as well as select cold meats.',
    phone: '+49 1517 2488995',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  mondo_bar: restaurant({
    name: 'MONDO Bar',
    cuisine: 'Italian, Café',
    amenity: 'bar',
    description: "MONDO Bar offers travelers authentic Italian cuisine — a traditional Italian espresso or delicious dolci all'italiana in the stylish ambiance of an authentic Italian caffè bar. MONDO Bar is a partner of Miles & More.",
    phone: '+49 69 65007260',
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area C', locationNotes: 'Near gate C16', openingHours: 'Mon-Sun 07:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 07:00 - 22:00' }),
    ],
  }),
  mondo_mobil: restaurant({
    name: 'MONDO Mobil',
    cuisine: 'Italian, Snacks',
    amenity: 'fast_food',
    description: 'MONDO Mobil offers a varied selection of snacks and a range of cold and hot drinks for your journey.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', locationNotes: 'Near gate A18', openingHours: 'Mon-Sun 05:30 - 22:30' })],
  }),
  natoo: restaurant({
    name: 'Natoo',
    cuisine: 'Vegan, Healthy',
    amenity: 'restaurant',
    description: '"Healthy all the way" - Natoo offers a unique food selection with vegan and vegetarian high-quality ingredients from local production, complemented by food-lifestyle retail products. Enjoy bowls such as the "Mother Earth" or "Namaste Bowl", breakfast bowls, fresh salads, vegan yogurts, homemade iced teas, and healthy berry boosts. Natoo is a partner of Miles & More.',
    phone: '+49 69 64350076',
    vegetarian: true,
    vegan: true,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 21:30' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', locationNotes: 'Near departure gates B20-B23', openingHours: 'Mon-Sun 06:00 - 21:30' }),
    ],
  }),
  perfect_day: restaurant({
    name: 'perfect day',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'perfect day brings a fine selection of coffees and freshly prepared snacks, featuring coffee from its own plantations in southern India, alongside snacks, soups, pastries, and healthy foods. In the evening, the focus shifts from café to bar service. perfect day is a partner of Miles & More.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  perfect_day_micro: restaurant({
    name: 'perfect day micro',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'perfect day micro brings the popular perfect day gastronomic concept — coffee, snacks, soups, pastries and healthy foods — directly to the gate.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', locationNotes: 'Near gate A34', openingHours: 'Mon-Sun 06:30 - 22:00' })],
  }),
  pezzo_di_pane: restaurant({
    name: 'Pezzo di Pane',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'Pezzo di Pane transports you to a flamingo-coloured synthesis of traditional and modern décor, inspired by the convivial decadence of 1960s Rimini. Highlights include pinsa, freshly prepared pasta, crisp salads, selected fine wines and excellent coffee specialities. Pezzo di Pane is a partner of Miles & More.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 07:00 - 22:00' })],
  }),
  puro_gusto: restaurant({
    name: 'Puro Gusto',
    cuisine: 'Italian, Café',
    amenity: 'cafe',
    description: 'Enjoy a break with Italian flair at Puro Gusto: an aromatic espresso or creamy cappuccino and a variety of freshly prepared paninis, fine pasticcini and a wide range of antipasti, with a view of the apron.',
    phone: '+49 69 69024362',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area B', openingHours: 'Mon-Sun 05:30 - 22:00' })],
  }),
  quickers_t1: restaurant({
    name: "QUICKER's",
    cuisine: 'Convenience, Snacks',
    amenity: 'fast_food',
    description: "QUICKER'S has last-minute travel items: tasty snacks, healthy salads, hot coffee, freshly squeezed juices, practical travel accessories, sweets and tobacco products. QUICKER's is a partner of Miles & More.",
    phone: '+49 (0)69 650 - 07260',
    outlets: [
      outlet({ airside: 'landside', level: 'Level 1', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 1', gateArea: 'Area A', openingHours: 'Mon-Sun 06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 1', gateArea: 'Area B', openingHours: 'Mon-Sun 06:00 - 22:00' }),
    ],
  }),
  rewe_to_go_t1: restaurant({
    name: 'REWE To Go',
    cuisine: 'Convenience, Grocery',
    amenity: 'fast_food',
    description: 'The REWE To Go Shop offers a round-the-clock, checkout-free shopping experience using camera and AI technology — around 570 items including fresh sandwiches and salads, drinks, coffee specialties, ice cream, snacks and confectionery, plus travel supplies and drugstore goods.',
    outlets: [outlet({ airside: 'landside', level: 'Level 1', gateArea: 'Area B', openingHours: 'Mon-Sun 00:01 - 23:59', open247: true })],
  }),
  starbucks_t1: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.de',
    description: 'Starbucks is a popular meeting place offering exciting and diverse coffee creations, refreshing iced teas, sweet and savoury treats, and a welcoming atmosphere. All drinks and food are also available to take away, with plant-based milk alternatives such as oat, almond, and soy milk. Starbucks is a partner of Miles & More.',
    phone: '+49 172 4044671',
    outlets: [
      outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area C', openingHours: 'Mon-Sun 05:30 - 21:00' }),
      outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 05:30 - 21:00' }),
      outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area B', openingHours: 'Mon-Sun 05:30 - 21:00' }),
    ],
  }),
  superfood: restaurant({
    name: 'Superfood',
    cuisine: 'Healthy, Asian',
    amenity: 'fast_food',
    description: 'Superfood by NATURAL offers sustainable specialties prepared fresh daily, including sandwiches, wraps, sushi, summer rolls and poke bowls, plus smoothies and milkshakes. Superfood is a partner of Miles & More.',
    outlets: [outlet({ airside: 'airside', level: 'Level 2', gateArea: 'Area A', openingHours: 'Mon-Sun 06:30 - 21:00' })],
  }),
  the_bar: restaurant({
    name: 'The Bar',
    cuisine: 'International, Café',
    amenity: 'bar',
    description: 'The Bar offers fresh snacks and sandwiches, crisp salads, various breakfast options, and a large selection of cold and hot drinks — available to take away or enjoy on site. The Bar is a partner of Miles & More.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area Z', openingHours: 'Mon-Sun 06:00 - 21:30' })],
  }),
  thong_thai: restaurant({
    name: 'Thong Thai',
    cuisine: 'Thai',
    amenity: 'fast_food',
    description: 'Thong Thai is a sophisticated Thai takeaway concept with several locations in the Rhine-Main area, serving high-quality, fresh, authentic Thai cuisine prepared without MSG using only the finest ingredients and authentic Thai spices.',
    phone: '+49 69 68098930',
    outlets: [outlet({ airside: 'landside', level: 'Level 0', gateArea: 'Area A', openingHours: 'Mon-Sun 11:00 - 21:00' })],
  }),
  tribs: restaurant({
    name: "Trib's",
    cuisine: 'Café, Healthy',
    amenity: 'fast_food',
    description: "Trib's is the ideal place for travelers who want quick yet balanced meals: nutritious superfood bowls, freshly prepared fruit cups, crisp salads, oven-fresh pizza, hearty sandwiches, wraps, focaccia, sweet pastries, drinks, coffee, and fine chocolates. Trib's is a partner of Miles & More.",
    outlets: [outlet({ airside: 'landside', level: 'Level 2', gateArea: 'Area B', locationNotes: 'Hall B', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  wiener_feinbaeckerei: restaurant({
    name: 'Wiener Feinbäckerei',
    cuisine: 'Bakery, Austrian',
    amenity: 'bakery',
    description: 'Wiener Feinbäckerei stands for artisanal perfection, living tradition, and a genuine passion for the baking trade — from hearty Wiener Krustis to a selection of the finest cakes and pastries to delicious snacks for in between.',
    phone: '+49 69 69026179',
    outlets: [outlet({ airside: 'landside', level: 'Level 0', gateArea: 'Area B', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
};

// ─── Terminal 3 venues (Areas H, J) ──────────────────────────────────────────

const t3Venues = {
  amore_t3: restaurant({
    name: 'AMORE',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'AMORE stands for authentic Italian cuisine with a modern twist and attention to detail—evident in the product range and stylish store design. The menu includes pasta, pizza, focaccia, and a selection of classic Italian drinks such as Negroni or Aperol Spritz for a typical aperitivo. AMORE is aimed at modern families and quality-conscious connoisseurs who value high-quality food, excellent drinks, and a special atmosphere.',
    outlets: [outlet({ airside: 'airside', gateArea: 'Area H', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  asia_street_cooking: restaurant({
    name: 'Asia Street Cooking',
    cuisine: 'Pan-Asian',
    amenity: 'fast_food',
    description: 'Asia Street Cooking is a modern fast-casual restaurant that brings together authentic Pan-Asian flavors from Thailand, Vietnam, China, and Korea. The menu ranges from trendy banh mi sandwiches and traditional appetizers to popular Asian classics, ideal for a quick snack, takeout, or a full meal.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  brewd: restaurant({
    name: "Brew'd",
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: "Brew'd focuses heavily on coffee and beer, developed in collaboration with premium coffee partners, and is a go-to spot for guests with a short stay. The menu evolves throughout the day, ranging from hearty breakfast items in the morning (pastries, sandwiches) to savory snacks in the afternoon (hot dogs, salad, beer).",
    outlets: [
      outlet({ airside: 'landside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' }),
      outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area H', openingHours: 'Mon-Sun 06:00 - 22:00' }),
    ],
  }),
  brot_by_axel_schmitt: restaurant({
    name: 'Brot by Axel Schmitt',
    cuisine: 'Bakery',
    amenity: 'bakery',
    description: 'The innovative bread concept developed in collaboration with Axel Schmitt.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 21:30' })],
  }),
  burger_king_t3: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('bk.com'),
    website: 'https://www.burgerking.de',
    description: 'Frankfurt Airport\'s Burger King serves the full range of classics, with vegetarian and vegan alternatives and the King Jr. Box for kids. Burger King is a partner of Miles & More.',
    vegetarian: true,
    vegan: true,
    outlets: [
      outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' }),
      outlet({ airside: 'landside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' }),
    ],
  }),
  daily_deli: restaurant({
    name: 'Daily Deli',
    cuisine: 'Café, Healthy',
    amenity: 'fast_food',
    description: 'Daily Deli offers a perfect blend of wholesome, balanced cuisine and pure flavor, in a natural, high-quality atmosphere, whether for a quick snack to go or a relaxing culinary break before a flight. Every meal is handmade with fresh ingredients.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  eln_london: restaurant({
    name: 'EL&N London',
    cuisine: 'Café, British',
    amenity: 'cafe',
    description: "London's most famous café and lifestyle brand, serving classics all day long for dining in or takeout — from specialty coffees and matcha to brunch, lunch, and the famous, freshly prepared pastries.",
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 21:30' })],
  }),
  espresso_house: restaurant({
    name: 'Espresso House',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Espresso House is Scandinavia’s leading coffee shop chain, known for its cozy, Nordic "living room atmosphere" and high-quality specialty coffee. The menu combines artisanal roasted coffee with traditional Swedish pastries and fresh, handmade snacks.',
    outlets: [outlet({ airside: 'landside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  hausmanns: restaurant({
    name: "Hausmann's",
    cuisine: 'German',
    amenity: 'restaurant',
    description: "Whether you're enjoying the cozy atmosphere of the restaurant, grabbing a quick bite at the takeout counter, or having a nightcap at the bar, Hausmann's has the perfect recipe for every occasion. The concept is based on traditional German home-style cooking, made more accessible and to-go-friendly with a touch of modern simplicity, using only high-quality, carefully sourced ingredients.",
    phone: '+49 (0)69 690-27541',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  haferkater: restaurant({
    name: 'Haferkater',
    cuisine: 'Café, Healthy',
    amenity: 'fast_food',
    description: 'All about oats: creamy porridge, sweet or savory, topped with colorful, delicious ingredients. Savory oat bowls, salads, open-faced sandwiches, wraps, and sweet cakes round out the selection. All ingredients are natural, with no hidden additives or artificial ingredients.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  main_bissen: restaurant({
    name: 'MAIN BISSEN',
    cuisine: 'German, Sandwiches',
    amenity: 'fast_food',
    description: 'MAIN BISSEN serves everything from fresh sandwiches to Frankfurt classics, available anytime in a stylish, modern setting.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  neni_deli: restaurant({
    name: 'NENI Deli',
    cuisine: 'Levantine, Mediterranean',
    amenity: 'restaurant',
    description: "Inspired by Tel Aviv's culinary diversity, NENI Deli combines Levantine and Mediterranean cuisine with tradition and innovation.",
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  origin_bar_and_eatery: restaurant({
    name: 'Origin Bar & Eatery',
    cuisine: 'Bar, Cocktails',
    amenity: 'bar',
    description: 'The Origin Bar & Eatery is a visual highlight that creates a relaxed atmosphere through its organic design and high-quality materials. At the open bar, guests can watch bartenders meticulously prepare exquisite cocktails and snacks, in a modern ambiance that invites travelers to unwind.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  rewe_to_go_t3: restaurant({
    name: 'REWE To Go',
    cuisine: 'Convenience, Grocery',
    amenity: 'fast_food',
    description: 'The REWE To Go Shop offers a round-the-clock, checkout-free shopping experience using camera and AI technology — around 570 items including fresh sandwiches and salads, drinks, coffee specialties, ice cream, snacks and confectionery, plus travel supplies and drugstore goods.',
    outlets: [outlet({ airside: 'landside', gateArea: 'Area J', openingHours: 'Mon-Sun 00:01 - 23:59', open247: true })],
  }),
  sophia_loren: restaurant({
    name: 'Sophia Loren',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: 'The Sophia Loren Restaurant pays homage to the Italian icon, blending timeless glamour with authentic cuisine. Inspired by old Hollywood charm, the concept features sophisticated design, a warm atmosphere, and dishes celebrating the essence of Italy through high-quality ingredients.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  zigolini: restaurant({
    name: 'Zigolini',
    cuisine: 'Italian, Café',
    amenity: 'cafe',
    description: 'Fresh, homemade pinsa and focaccia, tramezzini, and antipasti, paired with authentic Italian espresso from a portafilter and fine wines — a lively Italian vibe for a quick break.',
    outlets: [outlet({ airside: 'airside', level: 'Level 3', gateArea: 'Area J', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
};

// ─── The Squaire venues (landside complex connected to T1) ──────────────────

const squaireVenues = {
  ditsch: restaurant({
    name: 'Ditsch',
    cuisine: 'Bakery, Pretzels',
    amenity: 'bakery',
    description: "It is impossible to say exactly how many pretzels have been devoured since the Ditsch bakery was founded. For over 90 years, the Ditsch company's primary goal has been to delight people with its baked goods, prepared and baked fresh in front of you shortly before you eat them.",
    phone: '+49 69 69023165',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Squaire', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  le_crobag_squaire: restaurant({
    name: 'Le Crobag',
    cuisine: 'Bakery, French',
    amenity: 'bakery',
    description: "Le Crobag serves sweet and savory French croissants and baguettes, or try the ficelle, a delicate variant of the baguette, alongside an extensive coffee selection.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Squaire', openingHours: 'Mon-Sun 06:00 - 20:00' })],
  }),
  little_italy: restaurant({
    name: 'Little Italy',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: "LITTLE ITALY offers Italian cuisine with colorful and aromatic dishes: crisp salads and soups, juicy meats and fresh fish, pizza and pasta, and desserts from tiramisu to panna cotta. Red and sparkling white wines, smooth beers, and fragrant Italian coffee specialities round out the menu.",
    phone: '+49 69 75661252',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Squaire', openingHours: 'Mon-Fri 11:30 - 22:00' })],
  }),
  paulaner: restaurant({
    name: 'Paulaner',
    cuisine: 'German, Bavarian',
    amenity: 'restaurant',
    logoUrl: logo('paulaner.com'),
    website: 'https://www.paulaner-thesquaire.de',
    description: 'Welcome to the Paulaner restaurant at THE SQUAIRE: delicious traditional cuisine, friendly service, and a typically Bavarian atmosphere. Enjoy a freshly tapped Paulaner beer alongside an extensive menu, including vegetarian and vegan delicacies for meat-free diners.',
    phone: '+49 69 75662599',
    vegetarian: true,
    vegan: true,
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Squaire', openingHours: 'Mon-Sun 11:00 - 22:00' })],
  }),
  quickers_squaire: restaurant({
    name: "QUICKER's",
    cuisine: 'Convenience, Snacks',
    amenity: 'fast_food',
    description: "QUICKER'S has last-minute travel items: tasty snacks, healthy salads, hot coffee, freshly squeezed juices, practical travel accessories, sweets and tobacco products. QUICKER's is a partner of Miles & More.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Squaire', openingHours: 'Mon-Sun 06:00 - 22:00' })],
  }),
  starbucks_squaire: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.de',
    description: 'Starbucks is a popular meeting place offering exciting and diverse coffee creations, refreshing iced teas, sweet and savoury treats, and a welcoming atmosphere. All drinks and food are also available to take away, with plant-based milk alternatives such as oat, almond, and soy milk. Starbucks is a partner of Miles & More.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Squaire', openingHours: 'Mon-Sun 05:30 - 21:00' })],
  }),
  cantine_1889: restaurant({
    name: '1889 CANTINE',
    cuisine: 'International, Modern',
    amenity: 'restaurant',
    description: '1889 CANTINE is named after the founding year of the Michelin mobility company. It has a lot to offer: a monthly changing menu with seasonal touches, plus a delicious weekly menu featuring crisp poke bowls, sandwiches, and salads, using fresh, organically grown regional products, freshly prepared.',
    phone: '+49 176 95572270',
    outlets: [outlet({ airside: 'landside', locationNotes: 'The Squaire', openingHours: 'Mon-Fri 11:30 - 21:00' })],
  }),
};

// ─── upload: match existing docs by normalized name within each terminal ────

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
  const AIRPORT = AIRPORT_ID_OVERRIDE || AIRPORT_ID_DEFAULT;
  console.log(`Using airport doc '${AIRPORT}'.`);

  const t1Result = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', t1Venues);
  const t3Result = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues);
  const squaireResult = await processTerminal(AIRPORT, THE_SQUAIRE, 'The Squaire', squaireVenues);

  const totalUpdated = t1Result.updated + t3Result.updated + squaireResult.updated;
  const totalCreated = t1Result.created + t3Result.created + squaireResult.created;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t3Venues).length + Object.keys(squaireVenues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
