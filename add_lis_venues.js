'use strict';
/**
 * Fills in complete data for all Lisbon Airport (LIS) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official Lisbon Airport
 * "Restaurants and cafes" directory
 * (lisbonairport.pt/en/lis/services-shopping/shops-and-food/restaurants-and-cafes)
 * and each venue's individual detail page on 2026-08-04.
 *
 * Lisbon Airport (ANA Aeroportos de Portugal / VINCI Airports) has TWO
 * terminals — T1 and T2 — confirmed via each venue's own detail page, which
 * explicitly labels "T1" / "T2" plus a Before Security / After Security /
 * After security – Non Schengen zone and opening hours. The listing page
 * itself (an isotope grid of 72 `li.store` cards, 31 tagged
 * `category-food-drinks`) only exposes broader before/after-security classes
 * and category tags, not the terminal split, so every one of the 31
 * food & drink cards was opened individually to get terminal + zone + hours +
 * description.
 *
 * Docs are grouped by (name, terminal), matching the Dublin/Frankfurt
 * convention: a brand with multiple physical counters WITHIN THE SAME
 * terminal (SoHo — two After Security counters both in T2; Starbucks — one
 * Before Security + one After Security counter both in T1) is combined into
 * one doc with multiple `outlets[]`. A brand with counters in DIFFERENT
 * terminals (Heineken Grand Café: T1 before-security + T2 after-security;
 * McDonald's: T1 after-security + T2 after-security) gets a SEPARATE doc per
 * terminal.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - "Dots Bakery" and "Pane & Cuore" detail pages don't state a terminal at
 *     all ("by the doors 7-13 and 19-21" and no location string respectively).
 *     Both are grouped under Terminal 1 as the best available estimate (T1 is
 *     the airport's larger/main terminal and every other unlabelled-gate
 *     venue on this site sits in T1's gate-numbering range); `location_notes`
 *     preserves the raw text so this assumption is visible/reversible.
 *   - "Pane & Cuore"'s English-language URL 404s — its live page only exists
 *     under the Portuguese path (lisbonairport.pt/en/lis/servicos-e-compras/
 *     lojas-e-restaurantes/-pane-cuore), which renders mixed PT/EN content
 *     (hours shown as "Seg-Dom" = Mon-Sun); translated to English below.
 *   - "Cockpit"'s live description rendered in Spanish
 *     ("En este espacio encontrarás bebidas frías y calientes y bollería.")
 *     while its near-identical sibling "Cockpit Coffee Shop" rendered the
 *     same copy in English — a site localization bug. Cockpit's description
 *     is translated to English below for schema consistency.
 *   - The site doesn't publish phone numbers or dietary tags for any of these
 *     venues, so those fields are left blank/false throughout — that reflects
 *     what's actually published, not a research gap. Logos/websites are only
 *     filled in for recognizable international chains (McDonald's, KFC,
 *     Starbucks, Pizza Hut, Nespresso, Heineken); Lisbon's local/Portuguese
 *     brands have no independently verifiable official domain, so those are
 *     left blank rather than guessed.
 *
 * Because Firebase Console access isn't available to confirm the exact live
 * airport slug (Lisbon appears in NONE of upload_to_firestore.py,
 * migrate_firestore.js or cleanup_firestore.js — unlike FRA/IST which had
 * high-confidence hardcoded slugs), this script auto-detects the airport
 * slug at runtime (checking 'lisbon' then 'lis', using whichever has existing
 * terminal data) and matches existing restaurant docs by normalized name
 * within each terminal — updating in place if found, creating new otherwise.
 * It never creates a new `airports/{id}` metadata doc itself.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_lis_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['lisbon', 'lis'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';

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
  cockpit: restaurant({
    name: 'Cockpit',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    description: 'In this space you will find hot and cold drinks and pastries.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  cockpit_coffee_shop: restaurant({
    name: 'Cockpit Coffee Shop',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    description: 'In this space you will find hot and cold beverages and pastries.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  delta_mundo_do_cafe: restaurant({
    name: 'Delta - Mundo do Café',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    description: 'The ideal place to have a good cup of coffee and the best pastries.',
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  delta_cafe_central: restaurant({
    name: 'Delta Café Central',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    description: 'The ideal place to have a good cup of coffee and one of the best pastries.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Close to Gate 25', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  dots_bakery: restaurant({
    name: 'Dots Bakery',
    cuisine: 'Bakery, Coffee',
    amenity: 'bakery',
    description: 'If you want to taste different options besides the classic Portuguese pastry, the best spot is Dots Bakery. At this place, the Dots are the Stars that will challenge our palate. You can also choose between the healthy bagel and the carob bread.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'By the doors 7-13 and 19-21 (terminal not stated on site; grouped under T1 as best estimate)', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  first_cafe: restaurant({
    name: 'First Café',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    description: "You're waiting for your bags and want to have a cup of coffee or something to eat? Before, you had to wait until you left the airport. Now you don't.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Baggage claim area', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  first_class_cafe: restaurant({
    name: 'First Class Café',
    cuisine: 'Portuguese, Café',
    amenity: 'restaurant',
    description: 'The rich tradition of typical Portuguese flavours in a meticulous and varied menu.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Non-Schengen area', openingHours: 'Mon-Sun 06:30 - 01:00' })],
  }),
  go_natural: restaurant({
    name: 'Go natural',
    cuisine: 'International, Healthy, Sushi',
    amenity: 'fast_food',
    description: 'A new concept of healthy fast food with lots of flavour. It includes a sushi Bar, freshly made salads and pastas, sandwiches, wraps, desserts and on the go natural juices.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 05:00 - 23:00' })],
  }),
  go_to_coffee: restaurant({
    name: 'Go to Coffee',
    cuisine: 'Coffee & Bakery, Food to Go',
    amenity: 'cafe',
    description: 'A cosmopolitan and functional space with a lot to offer for breakfast and luncheons where you can taste a good warm meal or a healthy salad, in a relaxed and comfortable way, indoors or outdoors. You will also be able to enjoy the Go Natural offer at this space, healthy and very tasty, that includes sushi, sandwiches, wraps, salads, pasta, desserts and natural juices on the go.',
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  grabit: restaurant({
    name: 'Grabit',
    cuisine: 'Coffee & Bakery, Food to Go',
    amenity: 'fast_food',
    description: 'Where the offer matches the need and the time of day. Pre-packed and ready to go products.',
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  hediard: restaurant({
    name: 'Hediard',
    cuisine: 'Beerhouse & Small Bites, Delicatessen',
    amenity: 'restaurant',
    description: 'A delicatessen of the highest level, which offers clients a divine gastronomic experience with outstanding food, carefully selected. We highlight the Foie Gras, Iberian charcuterie, innovative and creative patisserie.',
    outlets: [outlet({ airside: 'airside', openingHours: 'Mon-Sun 05:00 - 21:00' })],
  }),
  heineken_grand_cafe_t1: restaurant({
    name: 'Heineken Grand Café',
    cuisine: 'Beerhouse & Small Bites, International',
    amenity: 'bar',
    logoUrl: logo('heineken.com'),
    description: 'Although beer is the star, it comes with a wide and delicious range of products. From breakfast menus, to snacks and an exclusive sushi area, you will find great taste and variety.',
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 05:30 - 22:00' })],
  }),
  ice_cream_flowers: restaurant({
    name: 'Ice Cream & Flowers',
    cuisine: 'Ice Cream',
    amenity: 'ice_cream',
    description: "While you're enjoying an ice cream with irresistible flavours or with sweets, why not take the opportunity to buy that last-minute gift? Give flowers and show how you feel.",
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 07:15 - 22:00' })],
  }),
  just_arrived: restaurant({
    name: 'Just Arrived',
    cuisine: 'Coffee & Bakery, Food to Go',
    amenity: 'cafe',
    description: "You're waiting for your bags and want to have a cup of coffee or something to eat? Before, you had to wait until you left the airport. Now you don't.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Baggage claim area', openingHours: 'Mon-Sun 06:30 - 23:00' })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'International, Fast Food, Chicken',
    amenity: 'fast_food',
    logoUrl: logo('kfc.com'),
    website: 'https://www.kfc.com',
    description: 'The secret of KFC is its chicken. Present in sandwiches and salads, the chicken recipes are the most appreciated in the entire world, alongside the hot wings and crispy strings.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 05:00 - 23:00' })],
  }),
  la_pausa_self_service: restaurant({
    name: 'La Pausa Self Service',
    cuisine: 'Portuguese, Self-Service',
    amenity: 'restaurant',
    description: "Ideal for a quick break, offering a faster and lighter meal. With such variety, it won't be easy to choose.",
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 11:00 - 15:00' })],
  }),
  my_bistro: restaurant({
    name: 'MY Bistro',
    cuisine: 'International, Portuguese',
    amenity: 'restaurant',
    description: 'For all tastes: breakfast, sandwiches, steaks, pastas, typical Portuguese cod gratin - in addition to others delicious dishes.',
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 05:30 - 22:00' })],
  }),
  my_bistro_coffee_drinks: restaurant({
    name: 'MY Bistro Coffee & Drinks',
    cuisine: 'Coffee & Bakery, Beerhouse & Small Bites',
    amenity: 'cafe',
    description: "The outdoor seating area at My Bistro Coffee & Drinks is the ideal place for a cup of coffee or juice from the vast drinks menu, while enjoying Lisbon's unique light.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: 'Mon-Sun 07:00 - 21:00' })],
  }),
  mccafe: restaurant({
    name: 'McCafé',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('mcdonalds.com'),
    description: 'The ideal place to enjoy a Sundae or take a coffee break.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  mcdonalds_t1: restaurant({
    name: "McDonald's",
    cuisine: 'International, Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('mcdonalds.com'),
    website: 'https://www.mcdonalds.com',
    description: "McDonald's is increasingly familiar, accessible and healthy with services and products catered to its consumers. If your time is limited, why not taste one of these meals, from salads to McMenus?",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  o_mercado: restaurant({
    name: 'O Mercado',
    cuisine: 'Beerhouse & Small Bites, Coffee & Bakery, Portuguese',
    amenity: 'food_court',
    description: "In the centre of the airport, you can find a space inspired by the Portuguese markets. It offers the opportunity to taste Lisbon's best custard tarts or typical Portuguese dishes, such as codfish cakes.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 05:30 - 22:00' })],
  }),
  padaria_lisboa: restaurant({
    name: 'Padaria Lisboa',
    cuisine: 'Portuguese, Bakery',
    amenity: 'bakery',
    description: 'Inspired by the traditional Portuguese bakeries, Padaria Lisboa offers a new and different concept, combining the typical Portuguese bread with your favourite nespresso coffees.',
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 05:30 - 24:00' })],
  }),
  pane_cuore: restaurant({
    name: 'Pane & Cuore',
    cuisine: 'Italian',
    amenity: 'restaurant',
    description: "Pane & Cuore is a concept inspired by traditional Italian grocery stores, bringing an authentic and welcoming touch to the international environment of Lisbon Airport. With an offering based on the simplicity and quality of ingredients, it combines the essence of Italian cuisine with a friendly and relaxed service.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Terminal not stated on site; grouped under T1 as best estimate', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  pastelaria_versailles: restaurant({
    name: 'Pastelaria Versailles',
    cuisine: 'Coffee & Bakery, International',
    amenity: 'bakery',
    description: 'The most elegant and emblematic cake shop in Lisbon, the cake shop Versailles features a variety of irresistable cakes and dishes prepared in the great Rotisserie.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  paul: restaurant({
    name: 'Paul',
    cuisine: 'French, Bakery',
    amenity: 'bakery',
    description: 'A representative place of the French way of living, where atmosphere and good taste carry us to traditional French bakeries and pastries.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  pizza_hut: restaurant({
    name: 'Pizza Hut',
    cuisine: 'International, Pizza',
    amenity: 'fast_food',
    logoUrl: logo('pizzahut.com'),
    website: 'https://www.pizzahut.com',
    description: 'A space where you can enjoy delicious slices of pizza with a variety of new flavours.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Food court', openingHours: 'Mon-Sun 06:00 - 23:00' })],
  }),
  specially: restaurant({
    name: 'Specially',
    cuisine: 'Beerhouse & Small Bites, Coffee & Bakery, Food to Go',
    amenity: 'fast_food',
    description: 'An ideal last stop before boarding, with a large offer of sandwiches, pastries, salads, pastas and coffee drinks.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Non-Schengen area', openingHours: 'Mon-Sun 00:00 - 24:00', open247: true })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.com',
    description: 'From its famous Frappuccino to all varieties of great tasting coffee.',
    outlets: [
      outlet({ airside: 'landside', openingHours: 'Mon-Sun 06:00 - 23:00' }),
      outlet({ airside: 'airside', openingHours: 'Mon-Sun 05:00 - 22:00' }),
    ],
  }),
};

// ─── Terminal 2 venues ────────────────────────────────────────────────────

const t2Venues = {
  confeitaria_nacional: restaurant({
    name: 'Confeitaria Nacional',
    cuisine: 'Portuguese, Bakery',
    amenity: 'bakery',
    description: 'A journey you cannot miss through the typical Portuguese pastries in the hands of the oldest bakery in Lisbon.',
    outlets: [outlet({ airside: 'landside', openingHours: 'Mon-Sun 05:00 - 21:00' })],
  }),
  heineken_grand_cafe_t2: restaurant({
    name: 'Heineken Grand Café',
    cuisine: 'Beerhouse & Small Bites, International',
    amenity: 'bar',
    logoUrl: logo('heineken.com'),
    description: 'Although beer is the star, it comes with a wide and delicious range of products. From breakfast menus, to snacks and an exclusive sushi area, you will find great taste and variety.',
    outlets: [outlet({ airside: 'airside', openingHours: 'Mon-Sun 05:30 - 22:00' })],
  }),
  mcdonalds_t2: restaurant({
    name: "McDonald's",
    cuisine: 'International, Fast Food, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('mcdonalds.com'),
    website: 'https://www.mcdonalds.com',
    description: "McDonald's is increasingly familiar, accessible and healthy with services and products catered to its consumers. If your time is limited, why not taste one of these meals, from salads to McMenus?",
    outlets: [outlet({ airside: 'airside', openingHours: 'Mon-Sun 04:00 - 22:30' })],
  }),
  nespresso: restaurant({
    name: 'Nespresso',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('nespresso.com'),
    website: 'https://www.nespresso.com',
    description: 'Nespresso is an international reference brand driven by high standards, both product and service wise. It offers a variety of coffees and hot and cold recipes with a Ready to Fly service.',
    outlets: [outlet({ airside: 'airside', openingHours: 'Mon-Sun 05:00 - 22:00' })],
  }),
  soho: restaurant({
    name: 'SoHo',
    cuisine: 'International, Coffee',
    amenity: 'cafe',
    description: 'Products based on a philosophy of fair trade and organic coffee, an offering of fresh hand-made and quality products with a service of excellence for people who appreciate a true gastronomic experience at a competitive price.',
    outlets: [
      outlet({ airside: 'airside', openingHours: 'Mon-Sun 05:00 - Last flight' }),
      outlet({ airside: 'airside', locationNotes: 'Non-Schengen area', openingHours: 'Mon-Sun 05:00 - 22:00' }),
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
  console.log(`No existing terminals found under any of [${CANDIDATE_AIRPORT_IDS.join(', ')}] — defaulting to '${CANDIDATE_AIRPORT_IDS[0]}'. If this airport uses a different slug, set AIRPORT_ID_OVERRIDE above and re-run.`);
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

  const totalUpdated = t1Result.updated + t2Result.updated;
  const totalCreated = t1Result.created + t2Result.created;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t2Venues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
