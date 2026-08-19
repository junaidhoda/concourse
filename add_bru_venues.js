'use strict';
/**
 * Fills in complete data for all Brussels Airport (BRU) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official Brussels Airport
 * "Restaurants & bars" directory
 * (brusselsairport.be/en/passengers/at-the-airport/restaurants-bars) on 2026-08-03.
 *
 * The 30 venues and all fields below (location/zone, description, weekly opening
 * hours) were pulled directly from each venue's own detail page on
 * brusselsairport.be. Zone -> airside classification: Gates A / Gates B / Gates T
 * are after security (airside); Arrival Hall and Departure Hall are both before
 * security (landside) — confirmed directly by copy on several detail pages
 * (e.g. Café Artois: "before security screening"; Belle & Belge: "before
 * security"). The site doesn't list phone numbers on these venue pages, so
 * phone is left blank throughout. A handful of chains (Starbucks, Panos, Exki,
 * Quick, Bar Festiv) have multiple outlets but the site only shows per-day hours
 * for single-location venues — those outlets are recorded with location/zone
 * only and a note that hours vary by outlet.
 *
 * Context: unlike AMS/ATH/BHX, Brussels doesn't appear anywhere in this repo
 * (no CSV, not referenced by upload_to_firestore.py or migrate_firestore.js /
 * cleanup_firestore.js) — but per the user it already exists in the live
 * Firestore under some airport slug. Since Firebase Console access isn't
 * available to confirm which, this script auto-detects at runtime by checking
 * a list of plausible slugs and using whichever already has terminal data
 * (falling back to 'brussels' if none do). It does NOT create or touch
 * airport-level metadata (name/code/city/country/continent/lat/lon) — only
 * the restaurants subcollection.
 *
 * Because the live doc IDs for existing venues are unknown, this script:
 *   1. Reads all existing docs across every terminal under the detected
 *      airport slug.
 *   2. For each of the 30 real venues, matches by normalized name.
 *      - If a matching doc exists -> full overwrite (.set with merge:false) so
 *        every field is completely filled in.
 *      - If no match exists -> creates a new doc under terminal "main_terminal"
 *        with a generated slug ID.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_bru_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['brussels', 'bru', 'zaventem'];
const DEFAULT_TERMINAL = 'main_terminal';

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

// Zone -> airside/location_notes convention:
//   Gates A / Gates B / Gates T -> airside (after security)
//   Arrival Hall / Departure Hall -> landside (before security)
const zoneNotes = {
  gatesA: 'After security, Gates A.',
  gatesB: 'After security, Gates B.',
  gatesT: 'After security, Gates T.',
  arrivals: 'Landside, Arrival Hall (before security).',
  departures: 'Before security, Departure Hall.',
};

// ─── data — all 30 real venues from brusselsairport.be's official directory ──

const venues = {
  chocolate_shack: restaurant({
    name: 'The Chocolate Shack by Dominique Persoone',
    cuisine: 'Belgium, Chocolate, Take away',
    amenity: 'confectionery',
    description: 'Indulge in a sweet experience at the airport with an exclusive take-out concept by Dominique Persoone. Create your own snack by personalizing it with chocolate and a wide range of toppings — crunchy, fruity or decadent, you’re in control. Belgian chocolate taken to a whole new level, perfect for a tasty treat before takeoff.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Sun 07:00 - 21:00' }),
    ],
  }),

  panos_sweet_bakery: restaurant({
    name: 'Panos Sweet Bakery',
    cuisine: 'Coffee, Breakfast, Take away',
    amenity: 'bakery',
    description: 'Discover the Sweet Bakery by Panos at the airport, where indulgence meets creativity. Choose from breakfast buns, pastries, cakes, waffles and pancakes, finished off with toppings of your choice — fruity, chocolatey, crunchy or creamy. A cozy, feel-good stopover before your flight, with a sweet twist.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 06:00 - 21:00' }),
    ],
  }),

  bistrot_bakery: restaurant({
    name: 'Bistrot Bakery',
    cuisine: 'Bar, Coffee, Family, Sandwich, Take away',
    amenity: 'bakery',
    description: 'Craving something sweet or savoury before your flight? Bistrot Bakery has you covered — warm waffles, the iconic pistachio croissant, focaccias, pizzas, or fresh pasta from their own Pastaria. Take away or enjoy it on the spot.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 03:30 - 21:00' }),
    ],
  }),

  bistrot_bar: restaurant({
    name: 'Bistrot Bar',
    cuisine: 'Bar, Belgium, Burgers, Family, Fries, Alcohol, Eat in',
    amenity: 'bar',
    description: 'Sit back and relax at Bistrot Bar, with views on the tarmac and a casual vibe — the perfect place to enjoy a Belgian beer and a menu of focaccias, pizzas, snacks and sweets. You can also bring food from nearby units and pair it with a drink from the bar.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 06:00 - 21:00' }),
    ],
  }),

  bar_festiv: restaurant({
    name: 'Bar Festiv',
    cuisine: 'Bar, Belgium, Apero, Take away',
    amenity: 'bar',
    description: 'Festival vibes await at Bar Festiv, just steps from the gate. Stop by for quick, flavourful bites like wraps, spring rolls and other easy-to-grab finger food, perfect for a pre-flight snack.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesA} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesT} Hours vary by outlet — see on-site signage.` }),
    ],
  }),

  cafe_artois: restaurant({
    name: 'Café Artois',
    cuisine: 'Bar, Belgium, Sandwich, Breakfast',
    amenity: 'bar',
    description: 'Café Artois is the perfect place to spend a little more time together before security screening. At this cosy bar in the Departure Hall, enjoy Belgian beer classics, 0.0% options, breakfast dishes and croques.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.departures} Gates A side.`, openingHours: 'Mon-Sun 05:00 - 20:00' }),
    ],
  }),

  guapa: restaurant({
    name: 'Guapa',
    cuisine: 'Smoothies, Breakfast, Take away',
    amenity: 'cafe',
    description: 'Bright, colorful and refreshingly healthy, Guapa is a pit stop for natural juices, smoothies and wholesome bites like banana bread, cakes and fruit cups. Cold-pressed juices, vibrant smoothies and a sustainable, short-supply-chain approach make it a green boost before a flight.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Sun 04:30 - 20:30' }),
    ],
  }),

  coffee_and_more: restaurant({
    name: 'Coffee & More',
    cuisine: 'Coffee, Sandwich, Take away',
    amenity: 'cafe',
    description: 'Need a recharge? Coffee & More offers favourite brews alongside waffles, buns, sandwiches and snacks, all ready to grab and go — a reliable stop for a quick boost before take-off.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 07:00 - 12:00' }),
    ],
  }),

  le_pain_quotidien: restaurant({
    name: 'Le Pain Quotidien',
    cuisine: 'Belgium, Coffee, Salad, Sandwich, Vegan, Smoothies, Breakfast, Eat in',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    description: 'At Le Pain Quotidien, Belgian charm meets wholesome food — tartines, quiche, soup or a fresh salad, perfect for breakfast, lunch or brunch. In a rush? Grab something to go before security screening.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: zoneNotes.departures, openingHours: 'Mon-Sun 03:30 - 20:00' }),
    ],
  }),

  amo: restaurant({
    name: 'Amo',
    cuisine: 'Family, Pizza, Pasta, Apero, Breakfast, Eat in',
    amenity: 'restaurant',
    description: 'Taste the warmth of Italy at Amo, where timeless dishes like Margherita pizza, lasagna and tiramisu are served straight from a traditional wooden oven. Enjoy the meal with a view of the runway. A kids’ menu is also available.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Fri, Sun 07:00 - 21:30; Sat 07:00 - 19:30' }),
    ],
  }),

  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Burgers, Family, Fries, Eat in',
    amenity: 'fast_food',
    logoUrl: logo('bk.com'),
    description: 'In the mood for a quick bite before take-off? Head to Burger King at Gates B for the iconic Whopper, Chicken Royale, or a veggie option — comfort food classics that never disappoint.',
    vegetarian: true,
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 07:30 - 21:00' }),
    ],
  }),

  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee, Sandwich, Donuts, Take away',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    description: 'Whether it’s a creamy Latte Macchiato, an icy Frappuccino, or a classic cookie, Starbucks has a treat for every time of day — a familiar taste of coffee or pastry before takeoff.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesA} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesB} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesT} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.departures} Hours vary by outlet — see on-site signage.` }),
    ],
  }),

  panos: restaurant({
    name: 'Panos',
    cuisine: 'Coffee, Family, Salad, Sandwich, Donuts, Vegan, Take away',
    amenity: 'bakery',
    vegan: true,
    vegetarian: true,
    description: 'Need a quick bite or something sweet? Panos has freshly filled sandwiches, creamy yoghurts and vegetarian options, perfect for a tasty snack on the move.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesA} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesA} (second unit). Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.departures} Hours vary by outlet — see on-site signage.` }),
    ],
  }),

  quick: restaurant({
    name: 'Quick',
    cuisine: 'Belgium, Burgers, Family, Fries, Eat in',
    amenity: 'fast_food',
    description: 'From the Veggie Giant to the King Fish, Quick has a burger for everyone. Not into burgers? Try wraps, salads, or finger foods, all ordered easily at digital kiosks. Flying with kids? Let them create their own Magic Box with a surprise toy inside.',
    vegetarian: true,
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesA} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.arrivals} Hours vary by outlet — see on-site signage.` }),
    ],
  }),

  exki: restaurant({
    name: 'Exki',
    cuisine: 'Belgium, Coffee, Salad, Sandwich, Vegan, Smoothies, Breakfast, Take away',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    description: 'Looking for something healthy and fresh? EXKi is the go-to destination for seasonal, vegetable-based dishes, from salads and soups to creative sandwiches and tasty desserts. The self-service buffet offers plenty of options with a global twist, all sustainably packaged and easy to enjoy on the go.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesA} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'airside', locationNotes: `${zoneNotes.gatesB} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.departures} Hours vary by outlet — see on-site signage.` }),
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.departures} (second unit). Hours vary by outlet — see on-site signage.` }),
    ],
  }),

  beers_and_cheers: restaurant({
    name: 'Beers & Cheers',
    cuisine: 'Bar, Belgium, Sandwich, Apero, Take away',
    amenity: 'bar',
    description: 'Beer lovers, this one’s for you. Located in the heart of Gates A, Beers & Cheers offers a top-notch selection of Belgian brews, on tap and bottled. Pair a drink with a croque monsieur, sandwich or snack — and there’s a full range of hot and cold drinks too.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Sun 04:00 - 21:00' }),
    ],
  }),

  hi_brussels: restaurant({
    name: 'Hi! Brussels',
    cuisine: 'Bar, Belgium, Fries, Sandwich, Eat in',
    amenity: 'bar',
    description: 'Just arrived or waiting in Arrivals? Head to Hi! Brussels for traditional Belgian fries, beers, waffles, fried snacks and other warm local flavours in a cozy setting — the perfect place to relax, meet someone, or simply enjoy a welcome to Belgium.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: zoneNotes.arrivals, openingHours: 'Mon-Sun 05:30 - 00:00' }),
    ],
  }),

  belle_and_belge: restaurant({
    name: 'Belle & Belge',
    cuisine: 'Bar, Belgium, Burgers, Fries, Salad, Apero, Vegan, Breakfast, Eat in',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    description: 'Belgian beer and a classic Belgian dish — a golden combo. At Belle & Belge, enjoy the best Belgian classics, including beers you must try, or a quick dish if in a hurry. Located before security, it’s also a great spot to say goodbye to friends and family.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: zoneNotes.departures, openingHours: 'Mon-Fri, Sun 07:30 - 20:00; Sat 07:30 - 19:30' }),
    ],
  }),

  itsu: restaurant({
    name: 'Itsu',
    cuisine: 'Vegan, Sushi, Eat in',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    description: 'Asian, delicious and healthy. All dishes at itsu are prepared on the spot, featuring healthy dishes like salmon salad and the Thai noodle bowl — perfect for lunch or dinner. In a hurry? Choose a Grab&go meal and take it to the gate.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 08:00 - 21:00' }),
    ],
  }),

  leffe_bar: restaurant({
    name: 'Leffe Bar',
    cuisine: 'Bar, Belgium, Sandwich, Apero',
    amenity: 'bar',
    description: 'A wide range of Belgian beers, including Leffe and Stella Artois, plus hot and cold non-alcoholic drinks for non-beer fans. In the cosy bar you’ll also find sandwiches, salads and delicious snacks — with a phenomenal view.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Sun 04:00 - 21:30' }),
    ],
  }),

  black_pearls: restaurant({
    name: 'Black Pearls',
    cuisine: 'Vegan, Sushi, Breakfast, Eat in',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    description: 'A culinary meal combined with an outstanding view of the airplanes. At Black Pearls, enjoy fish soup, Belgian mussels, risotto, exclusive wines and champagne. In a hurry? Grab fresh sushi from the counter and head straight to the gate. American Express Belgian Platinum Cardmembers can enjoy a complimentary dining experience here.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Fri, Sun 07:00 - 21:00; Sat 07:00 - 19:30' }),
    ],
  }),

  belgorama: restaurant({
    name: 'Belgorama',
    cuisine: 'Belgium, Burgers, Family, Fries, Vegan, Eat in',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    description: 'Discover Belgian flavours at Belgorama, a classic self-service brasserie with views of the tarmac. From Brussels waffles to ‘stoofvlees met frietjes’, this is the place to try Belgian comfort food, with kids’ options also on the menu.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Fri, Sun 04:00 - 21:00; Sat 04:00 - 20:00' }),
    ],
  }),

  gullivers_restaurant: restaurant({
    name: 'Gullivers Restaurant',
    cuisine: 'Bar, Burgers, Fries, Salad, Pasta, Apero, Vegan, Breakfast, Eat in',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    description: 'Located in the Sheraton Hotel lobby, Gullivers is ideal for all-day dining in a relaxed setting. Chef Jonathan Delain blends Belgian classics with signature Sheraton dishes. Note: only the bar is open daily from 06:00 to midnight.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.departures} Sheraton Hotel lobby. Bar open daily 06:00-24:00.`, openingHours: 'Mon-Sun 06:00 - 10:30 & 12:00 - 23:00 (kitchen); bar 06:00 - 24:00' }),
    ],
  }),

  grab_and_fly: restaurant({
    name: 'Grab & Fly',
    cuisine: 'Coffee, Sandwich, Sushi, Smoothies, Take away',
    amenity: 'fast_food',
    description: 'Short on time? Grab & Fly, at the start of Gates A, offers cold drinks, snacks, and a convenient Panos to go assortment of pastries and sandwiches — a light bite or quick refresh before boarding.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Sun 04:00 - 22:00' }),
    ],
  }),

  brewgate: restaurant({
    name: 'Brewgate',
    cuisine: 'Bar, Belgium, Sandwich, Apero',
    amenity: 'bar',
    description: 'Fancy a Belgian beer before departure? At Brewgate, enjoy a beer with delicious tapas such as nachos or chicken wings. Don’t have much time? Pick up something at the ‘Grab & go’ and take it to the gate.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 04:00 - 22:00' }),
    ],
  }),

  dunkin_pop_up: restaurant({
    name: "Dunkin' Pop-Up",
    cuisine: 'Coffee, Donuts, Vegan, Take away',
    amenity: 'cafe',
    logoUrl: logo('dunkindonuts.com'),
    vegan: true,
    vegetarian: true,
    description: 'Dunkin’ now serves passengers from its pop-up truck at the Curb, just outside the departures hall. Grab favourite donuts, Munchkins, and signature coffee before a journey, or try one of the custom seasonal creations.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: `${zoneNotes.departures} Pop-up truck at the Curb, just outside the Departure Hall.`, openingHours: 'Mon-Sun 06:00 - 14:00' }),
    ],
  }),

  cafe_comptoir: restaurant({
    name: 'Café Comptoir',
    cuisine: 'Bar, Coffee, Sandwich',
    amenity: 'bar',
    description: 'Start the day or unwind with a Belgian beer, fresh coffee, or a satisfying snack at Café Comptoir. Take in the ambiance — there’s even a public piano just outside. Whether arriving or departing, this spot brings a touch of Brussels charm to the journey.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesA, openingHours: 'Mon-Fri, Sun 04:00 - 21:00; Sat 04:00 - 20:30' }),
    ],
  }),

  java_coffee_house: restaurant({
    name: 'JAVA Coffee House',
    cuisine: 'Coffee, Sandwich, Take away',
    amenity: 'cafe',
    description: 'In need of an energy boost, or a delicious latte? JAVA serves coffee that gives energy all day long, plus fresh sandwiches and tasty pastries. JAVA’s coffee roasting process is 100% climate neutral.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: zoneNotes.arrivals, openingHours: 'Mon-Sun 05:00 - 20:30' }),
    ],
  }),

  bar_b: restaurant({
    name: 'Bar B',
    cuisine: 'Bar, Sandwich, Take away',
    amenity: 'bar',
    description: 'Bar B serves breakfast, sandwiches, snacks and Belgian beers — from delicious croissants to paninis over a coffee. Stay in the bar or take the order to the gate, it’s your choice.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 04:00 - 21:30' }),
    ],
  }),

  kimbo: restaurant({
    name: 'Kimbo',
    cuisine: 'Coffee, Sandwich, Take away',
    amenity: 'cafe',
    description: 'For a cozy coffee break, stop by Kimbo. Enjoy authentic Italian coffee alongside croissants, sandwiches or sweet treats — a smooth espresso and something sweet.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: zoneNotes.gatesB, openingHours: 'Mon-Sun 06:30 - 11:30' }),
    ],
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
  console.log(`No existing terminals found under any of [${CANDIDATE_AIRPORT_IDS.join(', ')}] — defaulting to '${CANDIDATE_AIRPORT_IDS[0]}'. If this airport uses a different slug, set AIRPORT_ID_OVERRIDE below and re-run.`);
  return CANDIDATE_AIRPORT_IDS[0];
}

// If you know the exact live slug (e.g. from Firebase Console), set it here to
// skip auto-detection entirely.
const AIRPORT_ID_OVERRIDE = null;

async function main() {
  const AIRPORT = AIRPORT_ID_OVERRIDE || await findAirportId();

  // Gather every existing restaurant doc across every terminal for this airport.
  const terminalsSnap = await db.collection('airports').doc(AIRPORT).collection('terminals').get();
  const existingByName = new Map(); // normalizedName -> { terminalId, docId }

  for (const terminalDoc of terminalsSnap.docs) {
    const restSnap = await terminalDoc.ref.collection('restaurants').get();
    restSnap.forEach((doc) => {
      const data = doc.data();
      if (data && data.name) {
        existingByName.set(normalizeName(data.name), { terminalId: terminalDoc.id, docId: doc.id });
      }
    });
  }

  console.log(`Found ${existingByName.size} existing restaurant doc(s) across ${terminalsSnap.size} terminal(s) under '${AIRPORT}'.`);

  const batch = db.batch();
  let updated = 0;
  let created = 0;

  for (const [key, data] of Object.entries(venues)) {
    const norm = normalizeName(data.name);
    const existing = existingByName.get(norm);
    if (existing) {
      const ref = db
        .collection('airports').doc(AIRPORT)
        .collection('terminals').doc(existing.terminalId)
        .collection('restaurants').doc(existing.docId);
      batch.set(ref, data, { merge: false });
      console.log(`UPDATE  ${data.name}  ->  ${AIRPORT}/${existing.terminalId}/${existing.docId}`);
      updated++;
    } else {
      const newId = key || slugify(`${data.name}_${DEFAULT_TERMINAL}`);
      const ref = db
        .collection('airports').doc(AIRPORT)
        .collection('terminals').doc(DEFAULT_TERMINAL)
        .collection('restaurants').doc(newId);
      batch.set(ref, data, { merge: false });
      console.log(`CREATE  ${data.name}  ->  ${AIRPORT}/${DEFAULT_TERMINAL}/${newId}`);
      created++;
    }
  }

  if (created > 0) {
    await db.collection('airports').doc(AIRPORT).collection('terminals').doc(DEFAULT_TERMINAL)
      .set({ name: 'Main Terminal' }, { merge: true });
  }

  await batch.commit();
  console.log(`\nDone. Updated ${updated} existing venues, created ${created} new venue(s). Total: ${updated + created}/${Object.keys(venues).length}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
