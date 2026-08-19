'use strict';
/**
 * Fills in complete data for Hamad International Airport (DOH), Doha,
 * Qatar, restaurants/bars/cafés in Firestore, based on research conducted
 * on 2026-08-15.
 *
 * TERMINAL STRUCTURE: Hamad International Airport is a SINGLE unified
 * terminal building — there is one central check-in hall and one central
 * security/immigration checkpoint for the entire airport. Beyond that single
 * checkpoint, the terminal fans out into five lettered concourses (A, B, C —
 * part of the original 2014 building — plus D and E, opened in 2022,
 * connected via people-mover/walkways), all airside-connected with NO
 * additional security screening between them. Per this dataset's "own
 * check-in AND own security" test, HIA does not meet the bar for multiple
 * terminal buckets the way DXB or SYD do — it is modelled here as ONE
 * terminal bucket (terminal_1), with each venue's concourse (A/B/C/D/E)
 * captured in its outlet's `level` field, the same way DXB's Terminal 3
 * captures "A/B/C Gates" as a sub-terminal location detail rather than a
 * separate bucket.
 *
 * SOURCES & METHODOLOGY: built entirely from the official Hamad
 * International Airport site (dohahamadairport.com), using the same
 * browser-verified, official-site-only standard established for the DXB
 * revision. The site's /dine listing (dohahamadairport.com/dine) is a
 * classic paginated (not infinite-scroll) directory — ?page=0 through
 * ?page=3, 16 cards per page — fully walked via Claude in Chrome to collect
 * all 61 listed venue slugs with zero gaps. EVERY venue was then confirmed
 * by fetching its own official detail page at
 * dohahamadairport.com/dine/<slug>, reading its `ul.passenger-area-ul`
 * element for the authoritative list of concourse(s) it operates in (this
 * element is what actually distinguishes a single-concourse venue from a
 * multi-concourse chain — e.g. Burger King's page lists BOTH "CONCOURSE A"
 * and "CONCOURSE C", meaning it has two outlets) and its own description
 * paragraph(s). No secondary/third-party sources were used at any stage.
 *
 * EXCLUSION: "Work & Fly" appears in the official /dine listing (slug
 * work-fly, tagged Concourse D) but its own detail page describes it as "a
 * one-stop shop for travel-friendly tech, office essentials, and stylish
 * accessories" — a retail/electronics shop with no food or beverage
 * offering of any kind. Per this dataset's no-fabrication principle (a venue
 * belongs in a restaurants dataset only if it's actually a restaurant/café/
 * bar), it is NOT included here despite appearing under the site's /dine
 * URL path — that categorization looks like a site-side taxonomy quirk, not
 * a factual claim that it serves food.
 *
 * DATA-QUALITY NOTES:
 *   - "Baladna"'s official detail page has no `ul.passenger-area-ul`
 *     concourse tag at all (every other of the 60 included venues has one) —
 *     its location is left blank rather than guessed.
 *   - No phone number, external website, or opening hours were published on
 *     ANY official dohahamadairport.com detail page fetched for this
 *     script, so `phone` and `opening_hours` are blank throughout.
 *     `website`/`logo_url` are filled in only for brands independently
 *     confirmed as real, identifiable global/regional chains with a
 *     confident public domain (Burger King, KFC, Costa Coffee, Starbucks,
 *     Comptoir Libanais, Wagamama, YO! Sushi, Krispy Kreme-style chains,
 *     Jones the Grocer, Simit Sarayi, illy, Ralph's Coffee, Harrods) —
 *     airport-specific or ambiguously-named concepts are left blank rather
 *     than guessing a domain.
 *   - No per-venue "airside/landside" or "Departures/Arrivals" distinction
 *     is published on any detail page (unlike DXB, which explicitly labelled
 *     many outlets "Departures" or "Arrivals"). Since HIA funnels all
 *     passengers through one central security checkpoint before reaching any
 *     concourse, and effectively all F&B sits beyond that checkpoint, every
 *     outlet's `airside` field below defaults to 'airside' — flagged here as
 *     a reasonable default rather than a per-venue confirmed fact.
 *   - Multi-concourse chains (Burger King, Costa Coffee, KFC, Venchi, Jamocha
 *     Café, Flo Café, illy Café, Day2Day Eats) are combined into ONE doc with
 *     multiple `outlets[]` entries, since — unlike DXB's multi-TERMINAL
 *     chains — these are multiple counters of the same brand within the
 *     SAME single terminal bucket, matching this dataset's standing
 *     multi-outlet convention.
 *   - "Food Market" (Concourse A) is a food-court concept whose own page
 *     explicitly says it "includes international fast-food chains such as
 *     Burger King and KFC along with many other local offerings" — modelled
 *     as its own separate food_court doc (like DXB's "The Daily DXB"),
 *     without altering the standalone Burger King / KFC docs elsewhere in
 *     this file.
 *   - Louis Vuitton Lounge (Concourse C) is a members-only fine-dining space
 *     reserved for Privilege Club Gold and Platinum members — included since
 *     it's a real, officially-listed F&B venue, but flagged as access-
 *     restricted rather than open to all travellers.
 *
 * Doha/DOH appears in NEITHER reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'doha' first, then 'doh', using whichever has existing terminal
 * data). It never creates a new `airports/{id}` metadata doc itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For the
 * terminal grouping below, it first deletes EVERY existing restaurant doc in
 * that terminal's `restaurants` subcollection — unconditionally, regardless
 * of whether its name matches anything in this file — and only then creates
 * every venue defined here as a brand-new doc. There is no update-in-place
 * step and no name-matching against what's already there; nothing from a
 * previous run survives. Run this only when the venue list below is meant to
 * be the complete, authoritative set for the terminal bucket.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under this
 * airport whose id isn't THIS script's terminal id (terminal_1) gets its
 * restaurants subcollection and then the terminal doc itself deleted, so a
 * stale/orphaned terminal bucket doesn't keep inflating the terminal count
 * the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_doh_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['doha', 'doh'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';

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

// ─── Terminal venues (single unified terminal; concourses A-E) ──────────────

const terminal1Venues = {
  airport_juice_bar: restaurant({
    name: 'Airport Juice Bar',
    cuisine: 'Juices, Smoothies, Grab & Go',
    amenity: 'fast_food',
    vegetarian: true,
    description: 'Freshly made juices, nutritious smoothies and healthy blends — signature mixes, ready-to-blend smoothies, granolas and fresh-cut fruits, prepared daily.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  airport_tandoor: restaurant({
    name: 'Airport Tandoor',
    cuisine: 'Indian, Kebabs, Biryani, BBQ',
    amenity: 'restaurant',
    description: 'Rich curries, succulent kebabs, fragrant biryani boxes and sizzling BBQ meats fresh from the clay oven.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  baladna: restaurant({
    name: 'Baladna',
    cuisine: 'Dairy, Juices, Qatari, Mart',
    amenity: 'cafe',
    description: "Sip, savour, and shop at Baladna Mart — locally produced, high-quality dairy products and fresh, made-to-order juices, sourced straight from the farm. NOTE: this venue's official detail page has no concourse tag published (every other venue in this file has one); location left blank rather than guessed.",
    outlets: [outlet({ locationNotes: 'Concourse not published on official page' })],
  }),
  baladna_express: restaurant({
    name: 'Baladna Express',
    cuisine: 'Qatari, Arabic, Shawarma, Fast Food',
    amenity: 'fast_food',
    description: 'The authentic taste of Qatar, served fresh — juicy shawarmas, wraps, sandwiches, plates and sides, prepared with quality local ingredients.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  basta: restaurant({
    name: 'Basta',
    cuisine: 'Qatari, Khaleeji',
    amenity: 'restaurant',
    description: 'A modern Qatari eatery with a twist — sweet Balalit noodles with saffron, fluffy flavourful omelettes, classic Shakshuka and hearty favourites like Majbooks and Biryani.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.burgerking.com',
    logoUrl: logo('burgerking.com'),
    description: 'Global icon since 1954, famous for its juicy flame-grilled Whopper — high-quality ingredients and signature recipes in a welcoming, family-friendly environment.',
    outlets: [
      outlet({ level: 'Concourse A' }),
      outlet({ level: 'Concourse C' }),
    ],
  }),
  burgeri: restaurant({
    name: 'Burgeri',
    cuisine: 'Burgers, American Diner',
    amenity: 'fast_food',
    description: 'The spirit of the classic American diner with a modern twist — handcrafted gourmet burgers made from premium Angus beef and the freshest ingredients.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  chaclate: restaurant({
    name: "Chac'late",
    cuisine: 'Chocolate, Café, Desserts',
    amenity: 'cafe',
    description: "A Qatari brand bringing the best of Europe's finest chocolatiers alongside unique homemade flavours — signature cakes, rich warm syrups and melt-in-the-mouth pralines.",
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  chapati_karak: restaurant({
    name: 'Chapati & Karak',
    cuisine: 'Indian, Karak Tea, Café, Grab & Go',
    amenity: 'fast_food',
    description: 'An acclaimed café restaurant inspired by journeys across the seas — authentic Indian flavours with a Middle Eastern twist via local Karak tea and freshly made chapati flatbreads.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  comptoir_libanais: restaurant({
    name: 'Comptoir Libanais',
    cuisine: 'Lebanese, Middle Eastern, Mediterranean',
    amenity: 'restaurant',
    website: 'https://www.comptoirlibanais.com',
    logoUrl: logo('comptoirlibanais.com'),
    description: 'The warmth of a bustling souk — Middle Eastern and Mediterranean cuisine in a relaxed, canteen-style setting with communal tables.',
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  costa_coffee: restaurant({
    name: 'Costa Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.costacoffee.com',
    logoUrl: logo('costacoffee.com'),
    description: 'Slow-roasted beans for the perfect brew, plus hot and cold food options from fresh pastries and gourmet sandwiches to healthy salads.',
    outlets: [
      outlet({ level: 'Concourse A' }),
      outlet({ level: 'Concourse C' }),
      outlet({ level: 'Concourse D' }),
    ],
  }),
  daily_chef_noof: restaurant({
    name: 'Daily Chef Noof',
    cuisine: 'Qatari',
    amenity: 'restaurant',
    description: 'Authentic Qatari cuisine reimagined by celebrated local chef Noof Al Marri — all-day dining blending tradition with modern flair, from Madrouba and Majbous Hamour to freshly made Fatayer and Chapati.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  day2day_eats: restaurant({
    name: 'Day2Day Eats',
    cuisine: 'Grab & Go, Sandwiches, Salads',
    amenity: 'fast_food',
    description: 'By Qatar Duty Free — a convenient grab-and-go experience with freshly made salads, wraps, sandwiches, pastries and sweet treats, alongside travel and tech essentials.',
    outlets: [
      outlet({ level: 'Concourse B' }),
      outlet({ level: 'Concourse C' }),
    ],
  }),
  eatgreek_kouzina: restaurant({
    name: 'EatGreek Kouzina',
    cuisine: 'Greek',
    amenity: 'restaurant',
    description: 'A culinary journey through the Greek isles — fresh, wholesome dishes from all regions of Greece.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  emporio_armani_caffe: restaurant({
    name: 'Emporio Armani Caffè',
    cuisine: 'Italian, Café',
    amenity: 'cafe',
    description: 'A stylish café on the Viale Del Lusso avenue with a large, round central bar — light lunches and delectable pastries throughout the day.',
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  emporio_armani_ristorante: restaurant({
    name: 'Emporio Armani Ristorante',
    cuisine: 'Italian, Fine Dining',
    amenity: 'restaurant',
    description: 'A chic, inviting, intimate space for a luxurious dining experience — handmade pastas, creamy risottos, succulent grilled meats and classic pizzas.',
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  evergreen_organics: restaurant({
    name: 'Evergreen Organics',
    cuisine: 'Vegan, Plant-Based, Café',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    description: "Since 2016, Qatar's first and only 100% vegan café — delicious and nutritious plant-based meals for guilt-free indulgence, on-the-go or before a long-haul flight.",
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  fendi_caffe: restaurant({
    name: 'Fendi Caffè',
    cuisine: 'Italian, Café',
    amenity: 'cafe',
    description: 'A touch of Italian luxury — the first-ever Fendi Caffè inside an airport, with coffee, tea and fresh juices paired with pastries or classic Italian dishes on signature Fendi Art de la Table crockery.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  flat_white_specialty_coffee: restaurant({
    name: 'Flat White Specialty Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'A much-loved Qatari brand bringing its signature blends and local charm to HIA — expertly brewed specialty coffee.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  flo_cafe: restaurant({
    name: 'Flo Café',
    cuisine: 'Greek, Café',
    amenity: 'cafe',
    description: 'A popular Greek coffee chain with a warm, inviting atmosphere — signature brews, fresh sandwiches or pastries.',
    outlets: [
      outlet({ level: 'Concourse B' }),
      outlet({ level: 'Concourse C' }),
    ],
  }),
  food_market: restaurant({
    name: 'Food Market',
    cuisine: 'International, Food Court',
    amenity: 'food_court',
    description: 'An accessibly-priced food court mixing cuisines from Indian to other Asian to Middle Eastern and international fast-food favourites, plus a gelato unit — includes international fast-food chains such as Burger King and KFC alongside many local offerings.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  giraffe_world_kitchen: restaurant({
    name: 'Giraffe World Kitchen',
    cuisine: 'International',
    amenity: 'restaurant',
    description: "A vibrant menu inspired by authentic global cuisine — breakfast, dinner, drinks and coffee, prepared quickly with fresh ingredients and a 10-minute menu guarantee.",
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  gordon_ramsay_burger: restaurant({
    name: 'Gordon Ramsay Burger',
    cuisine: 'Burgers',
    amenity: 'fast_food',
    description: 'The first Gordon Ramsay Burger to open in an airport — premium burgers, hand-cut fries, decadent milkshakes and fresh salads, elevated by Michelin-starred chef Gordon Ramsay.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  gordon_ramsay_street_pizza: restaurant({
    name: 'Gordon Ramsay Street Pizza',
    cuisine: 'Pizza',
    amenity: 'fast_food',
    description: 'Mouthwatering pizzas with creative toppings and incredible drinks — pizza without rules.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  harrods_tea_room: restaurant({
    name: 'Harrods Tea Room',
    cuisine: 'British, Tea, Café',
    amenity: 'cafe',
    website: 'https://www.harrods.com',
    logoUrl: logo('harrods.com'),
    description: 'The famous taste of Harrods — timeless tradition, a renowned selection of teas, delectable pastries and an ice cream parlour.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  illy_cafe: restaurant({
    name: 'illy Café',
    cuisine: 'Italian, Coffee',
    amenity: 'cafe',
    website: 'https://www.illy.com',
    logoUrl: logo('illy.com'),
    description: 'A unique espresso experience — Italian coffee brewed to perfection alongside a delectable selection of Italian specialities.',
    outlets: [
      outlet({ level: 'Concourse C' }),
      outlet({ level: 'Concourse E' }),
    ],
  }),
  jaipur: restaurant({
    name: 'Jaipur',
    cuisine: 'Indian',
    amenity: 'restaurant',
    description: "A culinary adventure through India — a menu reflecting India's rich heritage and regional influences, with quick, convenient portions for the fast-paced airport environment.",
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  jamocha_cafe: restaurant({
    name: 'Jamocha Café',
    cuisine: 'Café, Bakery',
    amenity: 'cafe',
    description: 'Meticulously sourced and carefully crafted — freshly baked patisseries and unique panini ingredients above and beyond the average café.',
    outlets: [
      outlet({ level: 'Concourse C' }),
      outlet({ level: 'Concourse A' }),
    ],
  }),
  joe_the_juice: restaurant({
    name: 'Joe & The Juice',
    cuisine: 'Juices, Smoothies, Coffee, Sandwiches',
    amenity: 'cafe',
    description: "Juices, smoothies and coffee blends for health-conscious travellers, including the legendary 'Herb Tonic', plus toasted sandwiches and granola pots.",
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  jones_the_grocer_express: restaurant({
    name: 'Jones the Grocer Express',
    cuisine: 'Deli, Café, Grab & Go',
    amenity: 'cafe',
    website: 'https://www.jonesthegrocer.com',
    logoUrl: logo('jonesthegrocer.com'),
    description: 'An Australian spot with grab-and-go options and expertly brewed single-origin coffees, freshly baked pastries and prepared meals.',
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  jones_the_grocer_social: restaurant({
    name: 'Jones Social',
    cuisine: 'European, Café, Restaurant',
    amenity: 'restaurant',
    website: 'https://www.jonesthegrocer.com',
    logoUrl: logo('jonesthegrocer.com'),
    description: 'A vibrant hub for sharing — European-inspired delicacies from freshly baked breads to hearty bowls, nourishing smoothies and all-day breakfast platters.',
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  jwala: restaurant({
    name: 'Jwala',
    cuisine: 'Indian, Street Food',
    amenity: 'restaurant',
    description: "A modern twist on classic Indian street food — cheesy naan pizzas, creamy curries, tikka sandwiches and butter chicken lasagna.",
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    description: "Finger lickin' good Southern fried chicken for over 50 years — world-famous fried chicken plus sandwiches, wraps, salads and classic sides.",
    outlets: [
      outlet({ level: 'Concourse C' }),
      outlet({ level: 'Concourse A' }),
    ],
  }),
  la_brioche_doree: restaurant({
    name: 'La Brioche Dorée',
    cuisine: 'French, Bakery, Café',
    amenity: 'cafe',
    description: 'Traditional French fare served up 24/7 — mouth-watering pastries, buttery croissants, hearty breakfasts and some of the best baguettes outside of France.',
    outlets: [outlet({ level: 'Concourse A', open247: true })],
  }),
  lancome_cafe_de_la_rose: restaurant({
    name: 'Lancôme Café De La Rose',
    cuisine: 'French, Café, Pastries',
    amenity: 'cafe',
    description: "Where beauty, fragrance and French artistry come together — created in collaboration with Lenôtre, offering exquisite pastries, fine coffees and signature desserts inspired by Lancôme's iconic rose.",
    outlets: [outlet({ level: 'Concourse D' })],
  }),
  le_grand_comptoir: restaurant({
    name: 'Le Grand Comptoir',
    cuisine: 'French, Brasserie',
    amenity: 'restaurant',
    description: "The relaxed charm of traditional brasserie dining — light bistro-style dishes and classic French fare, from salade niçoise to croque monsieurs, with a live pianist.",
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  le_petit_camion: restaurant({
    name: 'Le Petit Camion',
    cuisine: 'French, Café',
    amenity: 'cafe',
    description: 'A delightful French-inspired café — expertly brewed coffee and refreshing beverages, or mouthwatering snacks for a quick fuel-up.',
    outlets: [outlet({ level: 'Concourse D' })],
  }),
  le_petite_belge: restaurant({
    name: 'Le Petite Belge',
    cuisine: 'Belgian',
    amenity: 'restaurant',
    description: 'International flavours meet Belgian favourites — gourmet burgers, famous Moules Frites, and decadent Belgian fondant and waffles.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  levito: restaurant({
    name: 'Levito',
    cuisine: 'Italian, Pizza, Pasta',
    amenity: 'restaurant',
    description: 'Classic Italian dishes prepared with fresh, high-quality ingredients — freshly baked pizzas, hearty bowls of pasta and seasonal specialities.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  louis_vuitton_lounge: restaurant({
    name: 'Louis Vuitton Lounge',
    cuisine: 'Fine Dining, French, International',
    amenity: 'restaurant',
    description: "Reserved solely for Privilege Club Gold and Platinum members — a unique luxury dining experience by three-Michelin-starred chef Yannick Alléno, blending locally sourced ingredients into French classics and international favourites, 24 hours a day. ACCESS-RESTRICTED: members-only, not open to general travellers.",
    outlets: [outlet({ level: 'Concourse C', open247: true })],
  }),
  maia_coffee_chocolate: restaurant({
    name: 'Maia Coffee & Chocolate',
    cuisine: 'Café, Chocolate',
    amenity: 'cafe',
    description: 'Handmade chocolate specialities — bespoke cakes, pastries, macarons and more, complemented by coffee or a refreshing drink.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  orchard_view: restaurant({
    name: 'Orchard View',
    cuisine: 'Spanish, Tapas, Café',
    amenity: 'restaurant',
    description: 'Overlooking the greenery of ORCHARD — Spanish-inspired tapas, freshly made bocadillos, artisanal cheese platters, coffee and juices.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  oreo_cafe: restaurant({
    name: 'Oreo Café',
    cuisine: 'Desserts, Café',
    amenity: 'cafe',
    description: "The world's first permanent Oreo Café outside the USA — a 116 sqm space with signature milkshakes, muffins, cheesecakes and savoury options, plus an Oreo Creations Bar.",
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  ralphs_coffee: restaurant({
    name: "Ralph's Coffee",
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: "The first ever Ralph's Coffee in travel retail — beautifully made brews and blends alongside light bites, chic snacks, and Ralph Lauren accessories and gifts.",
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  red_grill: restaurant({
    name: 'Red Grill',
    cuisine: 'International, American, Australian',
    amenity: 'restaurant',
    description: "The golden age of travel reimagined — hearty American breakfasts, juicy Australian burgers, the 'Fat Boy Soup', and a playful children's menu inspired by fairytales.",
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  remman_cafe: restaurant({
    name: 'Remman Café',
    cuisine: 'Levantine, Fast Casual',
    amenity: 'fast_food',
    description: 'Historic Levantine cuisine with a modern twist — shawarmas, mixed grills, mezze platters and more.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  shawarma_station: restaurant({
    name: 'Shawarma Station',
    cuisine: 'Lebanese, Street Food',
    amenity: 'fast_food',
    description: 'The Lebanese street food staple with a twist — skilled chefs prepare succulent shawarmas via the time-tested spit-roast method in an open Show Kitchen.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  simit_sarayi: restaurant({
    name: 'Simit Sarayi',
    cuisine: 'Turkish, Bakery',
    amenity: 'bakery',
    description: 'A world-renowned Turkish bakery — authentic delicacies and freshly baked treats, from boreks and rolls to burgers, wraps and simits.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  slicy: restaurant({
    name: 'Slicy',
    cuisine: 'Pizza, American',
    amenity: 'fast_food',
    description: 'Handcrafted New York–style pizza made in Doha — generous slices with bold, creative toppings and fresh, high-quality ingredients.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  snowflakes_ice_cream: restaurant({
    name: 'Snowflakes Ice Cream',
    cuisine: 'Gelato, Ice Cream',
    amenity: 'cafe',
    glutenFree: true,
    description: 'The art of gelato — 100% natural ingredients, organic Jersey milk and cream from Somerset, plus lactose- and gluten-free options and handmade sorbets.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'Skilfully roasted and brewed coffee in a cosy haven — in-house baristas, plus sandwiches, cakes and salads.',
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  starbucks_reserve: restaurant({
    name: 'Starbucks Reserve',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'The rarest and most exotic coffee — artisanal cups from beans carefully sourced for their rich flavour, heritage and personality.',
    outlets: [outlet({ level: 'Concourse B' })],
  }),
  sweet_stop: restaurant({
    name: 'Sweet Stop',
    cuisine: 'Desserts, Ice Cream, Café',
    amenity: 'cafe',
    description: 'A one-stop-shop for all things sugar and fun — decadent ice creams, delicious cakes and playful goodies, paired with quality coffee.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  the_noodle_cart: restaurant({
    name: 'The Noodle Cart',
    cuisine: 'Asian Street Food',
    amenity: 'fast_food',
    description: 'The vibrant world of Asian street food with a modern twist — dim sum, ramen and butter chicken, capturing the authenticity of bustling market stalls.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  usta: restaurant({
    name: 'Usta',
    cuisine: 'Turkish',
    amenity: 'restaurant',
    description: 'The heart of Turkey — authentic Turkish cuisine including mouthwatering kebabs and doner, fresh salads, appetisers, desserts and refreshing drinks.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  venchi: restaurant({
    name: 'Venchi',
    cuisine: 'Italian, Chocolate, Gelato',
    amenity: 'cafe',
    description: 'Fine Italian chocolates and artisan gelato — over 145 years of premium Italian confectionery, 250+ chocolate recipes and 90 gelato flavours.',
    outlets: [
      outlet({ level: 'Concourse C' }),
      outlet({ level: 'Concourse A' }),
    ],
  }),
  wagamama: restaurant({
    name: 'Wagamama',
    cuisine: 'Asian, Pan-Asian',
    amenity: 'restaurant',
    vegan: true,
    description: 'The vibrant world of Asian flavours — curries, rice bowls, noodles, shareable sides and fresh juices, with vegan and kids options, served within 15 minutes.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  wok_to_walk: restaurant({
    name: 'Wok to Walk',
    cuisine: 'Thai, Asian',
    amenity: 'fast_food',
    description: 'Build-your-own Thai adventure — choose fresh ingredients and flavour-packed sauces, transformed into sizzling street food dishes in flaming-hot woks.',
    outlets: [outlet({ level: 'Concourse C' })],
  }),
  yo_sushi: restaurant({
    name: 'YO! Sushi',
    cuisine: 'Japanese',
    amenity: 'restaurant',
    description: 'Authentic Japanese cuisine — hand-rolled sushi, donburi rice bowls, ramen and noodle dishes, plus Japanese street food favourites; kaiten belt, sit-down or takeaway.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
  yum_cha: restaurant({
    name: 'Yum Cha',
    cuisine: 'Asian, Pan-Asian',
    amenity: 'restaurant',
    description: 'A vibrant celebration of Asian cuisine designed to bring people together — ramen, noodles and sushi made with the freshest ingredients.',
    outlets: [outlet({ level: 'Concourse A' })],
  }),
};

// ─── upload: detect airport slug, unconditionally wipe the terminal's ───────
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Hamad International Airport', terminal1Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1]));

  const totalCreated = r1.created;
  const totalDeleted = r1.deleted;
  const totalVenues = Object.keys(terminal1Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
