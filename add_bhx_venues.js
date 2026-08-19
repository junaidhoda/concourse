'use strict';
/**
 * Fills in complete data for all Birmingham Airport (BHX) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official Birmingham Airport
 * "Eating & Drinking" directory (birminghamairport.co.uk/at-the-airport/eating-and-drinking/)
 * on 2026-08-03.
 *
 * Context: unlike AMS/ATH, there was no local CSV for Birmingham at all — the
 * generic app/tools/scripts/firebase/upload_to_firestore.py script references a
 * bhx_restaurants.csv that doesn't exist on disk (so it was likely never actually
 * run for Birmingham, or that data has since diverged). Separately,
 * migrate_firestore.js / cleanup_firestore.js both operate on an airport slug of
 * 'birmingham' (not 'bhx'), which is the more recently-written, currently-active
 * tooling — so this script treats 'birmingham' as the primary slug, but will
 * fall back to checking 'bhx' at runtime in case that's what's actually live.
 *
 * The 18 venues and all fields below (zone, before/after security, description,
 * phone, hours) were pulled directly from birminghamairport.co.uk — including
 * using the site's own "Before security" / "After security" filter toggle to
 * get an authoritative airside/landside classification for every venue.
 *
 * Because Firebase Console access wasn't available to inspect the live
 * Firestore state directly, this script does NOT assume fixed doc IDs.
 * Instead it:
 *   1. Reads all existing docs across every terminal under the detected
 *      airport slug (birmingham, falling back to bhx).
 *   2. For each of the 18 real venues, matches by normalized name.
 *      - If a matching doc exists -> full overwrite (.set with merge:false) so
 *        every field is completely filled in with current-schema data (the
 *        old upload_to_firestore.py schema — floor_level/osm_id/opening_monday
 *        etc. — is entirely replaced).
 *      - If no match exists -> creates a new doc under terminal "main_terminal"
 *        with a generated slug ID.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_bhx_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['birmingham', 'bhx'];
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

// ─── data — all 18 real venues from birminghamairport.co.uk's official directory ──
// airside classification comes directly from the site's own "Before security" /
// "After security" filter toggle, not a guess.

const venues = {
  all_bar_one: restaurant({
    name: 'All Bar One',
    cuisine: 'Bar, British, Cocktails',
    amenity: 'bar',
    website: 'https://www.allbarone.co.uk',
    phone: '0121 767 5189',
    description: 'Take a moment to unwind in a fresh, new-look bar and restaurant. Breakfast, lunch or dinner — a wide range of menu options from a fry-up to healthy brunch, burgers or salads, alongside a strong focus on wines, cocktails and specially crafted beers, including a cocktail masterclass just a short walk from the main departure lounge.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, South Lounge, by Gates 1-20.', openingHours: '03:30 to last flight' }),
    ],
  }),

  bottega_prosecco_bar: restaurant({
    name: 'Bottega Prosecco Bar',
    cuisine: 'Bar, Italian, Wine Bar',
    amenity: 'bar',
    phone: '0121 767 8548',
    description: 'A luxury prosecco bar offering light bites, breakfast, cheese, cured meats, salads and sandwiches, with prosecco, sparkling wines, Chianti, Valpolicella, Soave and other still wines from the Venezia DOC wine region — a warm, elegant space to enjoy a glass of Bottega prosecco before a flight.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, within the departure lounge.', openingHours: '03:30 - 21:30 hrs' }),
    ],
  }),

  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('bk.com'),
    website: 'https://www.burgerking.co.uk',
    phone: '0121 767 7811',
    vegetarian: true,
    description: 'Grab flame-grilled favourites before you fly. Burgers made with 100% British and Irish beef grilled over real flames, plus salads, wraps, chicken nuggets, chilli bites and onion rings, with vegetarian options and a range of sundaes, soft drinks, shakes and hot drinks. Takeaway or seating available.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, within the departure lounge.', openingHours: '03:00 - 21:30 hrs' }),
    ],
  }),

  caffe_nero: restaurant({
    name: 'Caffè Nero',
    cuisine: 'Café, Coffee, Italian',
    amenity: 'cafe',
    website: 'https://www.caffenero.co.uk',
    phone: '0121 805 5063',
    description: 'Unwind and immerse yourself in the aroma of authentic, award-winning Italian coffee, handmade by friendly baristas. Also serves hot paninis, sandwiches, soups and salads inspired by Italian recipes, plus hot pastries, muffins, porridge, cakes, desserts and biscuits.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Before security, Ground floor, Check-in Zone C.', openingHours: '03:30 to 22:00 hrs' }),
    ],
  }),

  chaiiwala: restaurant({
    name: 'Chaiiwala',
    cuisine: 'Indian, Street Food, Café',
    amenity: 'fast_food',
    description: "Craving fresh, fast, and flavourful Indian street food? Chaiiwala, the UK's leading Indian street food cafe, offers all-day breakfast, the world-famous Karak Chai, and authentic Indian dishes made to order, with grab & go convenience for busy travellers.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Main departure lounge.', openingHours: '02:45 to last flight' }),
    ],
  }),

  costa: restaurant({
    name: 'Costa',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('costa.co.uk'),
    website: 'https://www.costa.co.uk',
    phone: '0121 782 7889',
    description: 'For a quick pick-me-up, Costa offers a range of signature coffees, hot chocolates and teas, handcrafted lattes, plus paninis, hot breakfasts, sandwiches, salads, pastries, muffins and cakes to enjoy on the go or in the coffee shop.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Before security, Arrivals greeting area.', openingHours: '24 hours daily', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'After security, Gates 1-20.', openingHours: '03:30 to last flight' }),
    ],
  }),

  giraffe: restaurant({
    name: 'Giraffe',
    cuisine: 'International, Café',
    amenity: 'restaurant',
    description: "Whether you're brunchin' or lunching, embark on a global culinary adventure — food made on site in under 15 minutes. An award-winning, all-day restaurant with a seasonally changing menu including hearty brunch served all day, mezze plates for sharing, burgers and fresh salads, plus signature fresh juices and smoothies, coffee, and a full range of alcoholic and soft drinks.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Departure lounge.', openingHours: '02:45 to last flight' }),
    ],
  }),

  greggs: restaurant({
    name: 'Greggs',
    cuisine: 'Bakery, Fast Food',
    amenity: 'bakery',
    logoUrl: logo('greggs.co.uk'),
    website: 'https://www.greggs.co.uk',
    description: 'Grab a taste of home no matter where you’re jetting to. Open 24/7, baking favourites fresh around the clock — perfect for an early flight or a post-landing Sausage Roll craving. Download the Greggs App for Click + Collect and loyalty rewards.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Before security, Arrivals area, ground floor.', openingHours: '24 hours daily', open247: true }),
    ],
  }),

  indian_brewery: restaurant({
    name: 'Indian Brewery',
    cuisine: 'Indian, Bar, Pizza',
    amenity: 'restaurant',
    description: "Indulge in craft beers, a delicious food menu and carefully crafted cocktails. Birmingham Airport is the first airport location for the popular brand, offering Indian-inspired breakfasts (until 11am), Indian pizzas, breakfast naan sandwiches, toasties, and a fresh range of craft beers including 'Juicy Mango Pale Ale', plus grab & go options.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, near Gate 55.', openingHours: '05:00 to last flight' }),
    ],
  }),

  ms_simply_food: restaurant({
    name: 'M&S Simply Food',
    cuisine: 'Grocery, Grab & Go, Deli',
    amenity: 'fast_food',
    phone: '0121 782 9755',
    description: 'Simply exceptional quality and delicious food & drinks on the go for every traveller. From a tasty lunchtime sandwich to M&S’s famous ready meals, plus award-winning wines, a deli selection, mouth-watering treats and everyday grocery items — for a quick snack or a weekly shop.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Before security, Arrivals area.', openingHours: '24 hours daily', open247: true }),
    ],
  }),

  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('mcdonalds.com'),
    description: "External to the BHX terminal, this branch serves the full McDonald's menu 24 hours a day — burgers, breakfasts and more, with a redesigned front counter and kitchen for shorter queues and faster service, plus an improved car park layout.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Landside, external to the terminal, near Car Park 6, Jetstream Road.', openingHours: '24 hours', open247: true }),
    ],
  }),

  popeyes_louisiana_chicken: restaurant({
    name: 'Popeyes Louisiana Chicken',
    cuisine: 'Fast Food, Chicken, American',
    amenity: 'fast_food',
    description: 'Popeyes Louisiana Chicken has landed at Birmingham Airport Departure Lounge. New Orleans-style fried chicken including the iconic Chicken Sandwich, Hot Wings, the Saucin’ Boneless range and a selection of sides — each piece marinated for 12 hours and hand-breaded for that signature shatter-crunch. Breakfast served until 10am, then an expanded menu takes over.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Departure lounge.', openingHours: '03:30 - 21:30' }),
    ],
  }),

  pret_a_manger: restaurant({
    name: 'Pret',
    cuisine: 'Café, Sandwiches & Deli',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    phone: '0121 767 8231',
    description: 'Where freshness meets convenience, to eat in or take away. Sandwiches, baguettes and wraps made daily in-shop with fresh ingredients, toasties and a daily-changing soup, an extensive salad and sushi menu, plus organic coffee, cakes, crisps, yoghurts and porridge.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Departure lounge.', openingHours: '03:00 - 21:30 hrs' }),
    ],
  }),

  shelby_and_co_bar_kitchen: restaurant({
    name: 'Shelby & Co. Bar + Kitchen',
    cuisine: 'British, Bar, Pub',
    amenity: 'restaurant',
    description: 'A unique, Peaky Blinders-themed all-day dining bar & kitchen. Classic plated breakfasts and indulgent baps in the morning, then burgers, pizzas and classic pub grub such as fish & chips, curries, sharers and salads from lunch through to late-night dinner, backed by international and local craft beers, cocktails, wines and spirits, drawing inspiration from post-war Birmingham.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Main departure lounge.', openingHours: '02:45 to last flight' }),
    ],
  }),

  soho_coffee: restaurant({
    name: 'SOHO Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Serving up the perfect brew since 1999. Crafted, conscious coffee alongside "good mood food" — piping-hot breakfast classics, fresh grab-and-go lunches and afternoon treats — to help get travels off to a flying start.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Departure lounge.', openingHours: '03:00 to last flight' }),
      outlet({ airside: 'airside', locationNotes: 'After security, along the International Pier.', openingHours: '05:00 to 21:00 hrs' }),
    ],
  }),

  spar: restaurant({
    name: 'SPAR',
    cuisine: 'Grocery, Grab & Go',
    amenity: 'fast_food',
    website: 'https://www.blakemoreretail.co.uk',
    phone: '0121 782 4400',
    description: 'A 24-hour convenience store and Post Office counter at the airport. Essential groceries, cigarettes and tobacco, flowers, last-minute travel accessories, National Lottery and Health Lottery, PayPoint and e-top-up services, plus hot coffee to go, hot and cold sandwiches, snacks, salads and breakfast/lunch meal deals.',
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Before security, Ground Floor, adjacent to Assisted Travel.', openingHours: '24 hrs daily', open247: true }),
    ],
  }),

  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    phone: '0121 767 8468',
    description: 'Experience a taste of comfort and familiarity before a flight. Premium coffee expertly crafted by passionate baristas, from classic lattes to vibrant iced beverages, a broad range of dairy alternatives at no extra charge, and an array of savoury and sweet treats.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Main departure lounge.', openingHours: '03:00 - 21:30 hrs' }),
    ],
  }),

  wetherspoon: restaurant({
    name: 'Wetherspoon',
    cuisine: 'Pub, British',
    amenity: 'pub',
    description: 'A family-friendly pub with something for everyone at breakfast, lunch, dinner, or just a drink. Full traditional breakfasts, all-day breakfast, fish & chips, chicken, pizzas and a range of burgers, plus colourful salads and freshly prepared focaccia. A wide range of craft beers, wines and cocktails, with table-service ordering available via app.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'After security, Departure lounge.', openingHours: '02:40 to last flight' }),
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
  console.log(`No existing terminals found under any of [${CANDIDATE_AIRPORT_IDS.join(', ')}] — defaulting to '${CANDIDATE_AIRPORT_IDS[0]}'.`);
  return CANDIDATE_AIRPORT_IDS[0];
}

async function main() {
  const AIRPORT = await findAirportId();

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

  // Make sure the terminal doc exists if we're creating fresh ones under it.
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
