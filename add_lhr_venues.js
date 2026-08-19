'use strict';
/**
 * Fills in complete data for all London Heathrow Airport (LHR) restaurants/
 * bars/cafés in Firestore, cross-referenced against the official Heathrow
 * "Restaurants A-Z" directory (heathrow.com/at-the-airport/restaurants-a-z)
 * and each venue's own detail page(s) on 2026-08-04.
 *
 * Heathrow has FOUR live terminals — T2, T3, T4, T5 (Terminal 1 was
 * demolished years ago and does not appear anywhere on the live site or in
 * upload_to_firestore.py's terminal list, which is why it's omitted here
 * too). The directory's 33 brand cards only carry name + terminal badges +
 * category tags, so every brand's own detail page was visited for
 * description, phone, and hours. 5 of the 33 brands (Caffè Nero, Giraffe,
 * Pret A Manger, Starbucks, YO!) operate in more than one terminal; their
 * detail pages present a per-terminal tab that had to be clicked through to
 * read each terminal's own set of physical outlets (each with its own
 * location/phone/hours) — e.g. Caffè Nero has 12 physical outlets across
 * T2/T3/T5, Pret A Manger has 9 across all four terminals.
 *
 * Docs are grouped by (name, terminal), matching the Dublin/Frankfurt/
 * Lisbon/Gatwick convention: multiple physical counters of the same brand
 * WITHIN one terminal are combined into a single doc with multiple
 * `outlets[]` (e.g. Costa's 2 counters in T4, Caffè Nero's 4 counters in
 * T2). A brand present in MULTIPLE terminals gets a separate doc per
 * terminal (Caffè Nero: 3 docs; Giraffe: 2 docs; Pret A Manger: 4 docs;
 * Starbucks: 2 docs; YO!: 3 docs).
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - "The Oceanic" (T3) has no opening hours published on its detail page —
 *     left blank rather than guessed.
 *   - Caffè Nero's "Level 1, upper departures" outlet (T3) likewise has no
 *     hours published on the site — left blank.
 *   - `website`/`logo_url` are only filled in for brands independently
 *     verifiable as real national/international chains (Costa, Starbucks,
 *     Five Guys, itsu, Pret A Manger, wagamama, Caffè Nero, Leon,
 *     Harris + Hoole, Black Sheep Coffee, YO!, Slim Chickens, Giraffe, Jones
 *     the Grocer, Gordon Ramsay [restaurant group], JD Wetherspoon pubs
 *     [Star Light, The Crown Rivers], Fortnum & Mason, Bill's, Wafflemeister)
 *     — Heathrow-exclusive or one-off concepts (Aura bar, Co-Pilots Bar and
 *     Kitchen, Le Café Louis Vuitton, London's Pride By Fuller's, Pilots Bar
 *     and Kitchen, Shan Shui, The Curator, The Evergreen Bar & Restaurant,
 *     The Globe, The Oceanic, The Queen's Arms, The Vinery, Wild Olive) are
 *     left blank rather than guessing a domain.
 *   - The site doesn't publish dietary tags for any of these venues, so
 *     those fields are left blank/false throughout.
 *
 * Because Firebase Console access isn't available to confirm the exact live
 * airport slug, and the two reference scripts in this repo disagree — same
 * pattern as Gatwick — upload_to_firestore.py uses 'lhr', while
 * migrate_firestore.js and cleanup_firestore.js (the current-schema-aware,
 * more authoritative tools) both list 'heathrow'. This script auto-detects
 * the airport slug at runtime (checking 'heathrow' first, then 'lhr', using
 * whichever has existing terminal data) and matches existing restaurant docs
 * by normalized name within each terminal — updating in place if found,
 * creating new otherwise. It never creates a new `airports/{id}` metadata
 * doc itself.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_lhr_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['heathrow', 'lhr'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';
const TERMINAL_4 = 'terminal_4';
const TERMINAL_5 = 'terminal_5';

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

// ─── Terminal 2 venues ────────────────────────────────────────────────────

const t2Venues = {
  bills: restaurant({
    name: "Bill's",
    cuisine: 'British, All-day Dining',
    amenity: 'restaurant',
    logoUrl: logo('bills-website.co.uk'),
    website: 'https://www.bills-website.co.uk',
    description: "Bill's is a welcoming all-day restaurant serving seasonal, British-inspired dishes in a relaxed and friendly setting. From hearty breakfasts and brunches to fresh lunches and comforting classics, the menu offers something for everyone. With warm hospitality and flexible dining, Bill's is ideal for meeting, unwinding, or grabbing a bite on the go.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '04:30 - 21:30' })],
  }),
  jones_the_grocer: restaurant({
    name: 'Jones the Grocer',
    cuisine: 'Café, Bakery, Gourmet',
    amenity: 'cafe',
    logoUrl: logo('jonesthegrocer.com'),
    website: 'https://www.jonesthegrocer.com',
    phone: '+44 (0)20 3117 5016',
    description: "Jones the Grocer, founded in Australia in 1996, is a haven for artisan food lovers. Offering fresh, simple, gourmet food for everyday living. Breakfast with intent, brunch like you mean it, and put the 'art' in artisan at Jones the Grocer. With over 30 locations worldwide, travellers passing through Heathrow can enjoy freshly baked cakes, pastries, and breads.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:00 - 22:00' })],
  }),
  le_cafe_louis_vuitton: restaurant({
    name: 'Le Café Louis Vuitton',
    cuisine: 'Café, Fine Dining',
    amenity: 'cafe',
    description: 'Take the time to indulge in a visit to Le Café Louis Vuitton, tucked inside the Terminal 2 Louis Vuitton store. This elegant café offers a sophisticated escape with its intimate atmosphere and a menu that perfectly balances indulgence and refinement.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:30 - 22:00' })],
  }),
  leon: restaurant({
    name: 'Leon',
    cuisine: 'Fast Food, Mediterranean',
    amenity: 'fast_food',
    logoUrl: logo('leon.co'),
    website: 'https://leon.co',
    phone: '+44 (0)20 8976 7528',
    description: "Naturally Fast Food that tastes good, does you good and is kind to the planet. It's fast food, but not as you know it. Inspired by the flavours, variety and natural healthiness of Mediterranean cooking, LEON endeavours to cater to every food craving, no matter your taste. Enjoy everything from salads to great burgers - whether you're gluten-free, vegan, vegetarian or a meat-eater.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate A16', openingHours: '06:00 - 21:00' })],
  }),
  londons_pride_by_fullers: restaurant({
    name: "London's Pride By Fuller's",
    cuisine: 'British, Pub',
    amenity: 'pub',
    phone: '+44 (0)20 3759 9988',
    description: "Located just 8.3 miles from Heathrow, this centuries-old brewer has crafted a special Terminal 2 lager, named Wingman, at the historic Griffin Brewery in Chiswick. Fuller's will offer passengers a traditional gastropub experience as well as a 'grab and go' selection for those dining at 35,000 feet.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:00 - 21:30' })],
  }),
  shan_shui: restaurant({
    name: 'Shan Shui',
    cuisine: 'Chinese, Southeast Asian',
    amenity: 'restaurant',
    phone: '+44 (0)20 8976 7527',
    description: "Shan Shui's first restaurant opened in 2018, drawing its inspiration from Shanghai in the 1920s when it used to be the place to be for art, architecture, dance halls and glitzy restaurants. The menu is curated to showcase the gastronomic delights of China and Southeast Asia, with a cocktail selection crafted with Old Shanghai speakeasies in mind. Shan Shui, Terminal 2 overlooks the runway and has its own private observation deck.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:30 - 21:30' })],
  }),
  the_queens_arms: restaurant({
    name: "The Queen's Arms",
    cuisine: 'British, International, Pub',
    amenity: 'pub',
    phone: '+44 (0)20 8976 7540',
    description: "The Queen's Arms dominates one end of the departure hall and offers a range of comfortable seating areas for relaxing, drinking and dining over two floors. It offers an international menu with dishes including spiced chicken thighs, Moroccan lamb tagine and Keralan vegetable curry, and an impressive range of cask and craft beers stored in a glass-fronted cellar.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Check-in', openingHours: '06:00 - 21:30' })],
  }),
  the_vinery: restaurant({
    name: 'The Vinery',
    cuisine: 'British, Wine Bar',
    amenity: 'restaurant',
    phone: '+44 (0)20 8745 4355',
    description: "Discover The Vinery at Heathrow Terminal 2, where fine dining meets modern convenience. This stylish restaurant features a 360-degree digital screen showcasing beautiful vineyard videography and delicious menu items. Wine enthusiasts will love the Sommelier App, offering expert recommendations and tasting notes, including selections from the renowned Gusbourne Estate.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 22:00' })],
  }),
  caffe_nero_t2: restaurant({
    name: 'Caffè Nero',
    cuisine: 'Café, Italian, Coffee',
    amenity: 'cafe',
    logoUrl: logo('caffenero.com'),
    website: 'https://caffenero.com/uk/',
    description: "Ever since we opened our first coffee house in 1997, Caffè Nero has been dedicated to two things: creating the very finest handcrafted Italian coffee and providing a warm and relaxing atmosphere in which to enjoy it. As every second counts when you're flying, you need good food - fast! This is why Caffè Nero at Heathrow offers a 15-minute menu.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '00:00 - 24:00', open247: true }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '05:30 - 22:00' }),
      outlet({ airside: 'landside', locationNotes: 'Check-in', openingHours: '00:00 - 24:00', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'Terminal 2 B', openingHours: '05:30 - 21:30' }),
    ],
  }),
  pret_a_manger_t2: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    phone: '+44 (0)20 8745 4802',
    description: "Whether it's a croissant or bowl for breakfast, or a salad or sandwich for lunch, whether you fancy a bake, bar or bite for those in-between moments, Pret has you covered.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '04:45 - 22:00' })],
  }),
  starbucks_t2: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.co.uk',
    description: "One of the world's most iconic coffee brands offering a fine range of freshly roasted coffees, Italian-style espressos and ice-blended drinks, plus delicious panini, sandwiches, cakes and pastries.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate A20', openingHours: '05:00 - 22:00' })],
  }),
  yo_t2: restaurant({
    name: 'YO!',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    logoUrl: logo('yosushi.com'),
    website: 'https://yosushi.com',
    description: 'YO! is your go-to for adventurous, tasty food before you fly. In Terminals 2 and 3, enjoy dine-in/to go restaurants showcasing the iconic kaiten (conveyor belt) and colourful plates, filled with freshly made Japanese street food and sushi – from Katsu Curry to sushi rolls and sashimi.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 22:00' }),
    ],
  }),
};

// ─── Terminal 3 venues ────────────────────────────────────────────────────

const t3Venues = {
  aura_bar: restaurant({
    name: 'Aura bar',
    cuisine: 'Bar, British',
    amenity: 'bar',
    phone: '+44(0)20 3117 5370',
    description: 'Unwind at the Aura bar with a glass of our signature champagne or a handcrafted cocktail. Feeling peckish? Our menu features refined classics, from indulgent scrambled eggs with smoked salmon in the morning to small plates and sharing platters in the afternoon, filled with seafood, charcuterie, and British cheeses.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:30 - 21:30' })],
  }),
  black_sheep_coffee: restaurant({
    name: 'Black Sheep Coffee',
    cuisine: 'Coffee',
    amenity: 'cafe',
    logoUrl: logo('leavetheherdbehind.com'),
    website: 'https://leavetheherdbehind.com',
    description: "Serving the world's first specialty-grade robusta beans on the market, every coffee served has a unique story to tell. Black Sheep Coffee's extensive menu has something for everyone to enjoy, whether it's a warming latte, an iced mocha or one of their 100% organic smoothies.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Central Bus Station', openingHours: '05:00 - 24:00' })],
  }),
  slim_chickens: restaurant({
    name: 'Slim Chickens',
    cuisine: 'American, Chicken',
    amenity: 'fast_food',
    logoUrl: logo('slimchickens.co.uk'),
    website: 'https://slimchickens.co.uk',
    phone: '+44(0)20 7389 3880',
    description: 'From breakfast before boarding to tenders before take-off, Slim Chickens is serving up fresh, cooked-to-order chicken all day long. Expect hand-breaded tenders, crispy wings, stacked sandwiches, hand-spun shakes and their famous house sauces.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:00 - 21:15' })],
  }),
  the_curator: restaurant({
    name: 'The Curator',
    cuisine: 'Bar, British, Small Plates',
    amenity: 'bar',
    phone: '+44 (0)20 8564 8492',
    description: 'The Curator aims to introduce you to discoveries and innovations, expanding your knowledge, tempting your sophisticated palate to try new tastes and sensations. The Curator Bar & Dining offers a selection of small-batch artisan cocktails, craft beers and ales, Champagne and a wine collection, alongside food inspired by the changing seasons in Britain.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 21:00' })],
  }),
  the_evergreen: restaurant({
    name: 'The Evergreen Bar & Restaurant',
    cuisine: 'British, Bakery',
    amenity: 'pub',
    description: "At The Evergreen Bar & Restaurant, where tradition and quality meet, you'll find a menu enriched by the esteemed Paul Rhodes Bakery's artisanal breads and pastries, and elevated by local Sussex cheeses such as the award-winning Sussex Charmer. Complemented by a splendid breakfast menu, an extensive drinks selection, and a kids' menu.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate 23-42', openingHours: '05:30 - 21:30' })],
  }),
  the_oceanic: restaurant({
    name: 'The Oceanic',
    cuisine: 'Bar, British',
    amenity: 'bar',
    phone: '+44 (0)20 8897 6788',
    description: 'Serving you the freshest beers, signature cocktails and a delicious menu to suit all tastes.',
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in' })],
  }),
  caffe_nero_t3: restaurant({
    name: 'Caffè Nero',
    cuisine: 'Café, Italian, Coffee',
    amenity: 'cafe',
    logoUrl: logo('caffenero.com'),
    website: 'https://caffenero.com/uk/',
    description: "Ever since we opened our first coffee house in 1997, Caffè Nero has been dedicated to two things: creating the very finest handcrafted Italian coffee and providing a warm and relaxing atmosphere in which to enjoy it. As every second counts when you're flying, you need good food - fast! This is why Caffè Nero at Heathrow offers a 15-minute menu.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:00 - 22:30' }),
      outlet({ airside: 'airside', locationNotes: 'Gate 5', openingHours: '05:00 - 22:30' }),
      outlet({ airside: 'airside', locationNotes: 'Gate 16', openingHours: '05:30 - 22:30' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '00:00 - 24:00', open247: true }),
      outlet({ airside: 'airside', locationNotes: 'Level 1, upper departures' }),
    ],
  }),
  giraffe_t3: restaurant({
    name: 'Giraffe',
    cuisine: 'International, Family',
    amenity: 'restaurant',
    logoUrl: logo('giraffe.net'),
    website: 'https://www.giraffe.net',
    phone: '+44(0)20 3117 5333',
    description: "With colourful walls, bright neons and the iconic giraffe statue at the entrance, you can't miss the family-friendly world kitchens in Terminals 3 and 5. Whether you fancy the spicy huevos rancheros, a classic full English or American-style pancakes piled high at breakfast time, or a fresh and delicious salad, flavourful curry bowl or traditional plate of fish and chips.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:00 - 22:00' })],
  }),
  pret_a_manger_t3: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    phone: '+44 (0)20 7932 5446',
    description: "Whether it's a croissant or bowl for breakfast, or a salad or sandwich for lunch, whether you fancy a bake, bar or bite for those in-between moments, Pret has you covered.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Check-in', openingHours: '06:00 - 20:30' }),
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 20:30' }),
      outlet({ airside: 'airside', locationNotes: 'Gate 28', openingHours: '05:30 - 22:00' }),
    ],
  }),
  yo_t3: restaurant({
    name: 'YO!',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    logoUrl: logo('yosushi.com'),
    website: 'https://yosushi.com',
    phone: '+44 (0)20 8588 9959',
    description: 'YO! is your go-to for adventurous, tasty food before you fly. In Terminals 2 and 3, enjoy dine-in/to go restaurants showcasing the iconic kaiten (conveyor belt) and colourful plates, filled with freshly made Japanese street food and sushi – from Katsu Curry to sushi rolls and sashimi.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 21:00' })],
  }),
};

// ─── Terminal 4 venues ────────────────────────────────────────────────────

const t4Venues = {
  co_pilots_bar_and_kitchen: restaurant({
    name: 'Co-Pilots Bar and Kitchen',
    cuisine: 'British, International',
    amenity: 'bar',
    phone: '+44 (0)20 8812 3253',
    description: 'This all-day brasserie offers a deliciously diverse menu of British and international classics, including American-style pancakes, eggs benedict, freshly-made pastries, salads, sandwiches and a dedicated burger menu. Inspired by the golden era of the 1950s, Terminal 4’s stylish Co-Pilots is run by premium caterer and restauranteur Rhubarb Hospitality Collection.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 22:00' })],
  }),
  costa: restaurant({
    name: 'Costa',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('costa.co.uk'),
    website: 'https://www.costa.co.uk',
    phone: '+44 (0)20 8745 7903',
    description: 'Founded in London by Italian brothers Sergio and Bruno Costa in 1971, Costa Coffee has grown to over 2,800 coffee shops across the UK and Ireland. Whether jetting off, arriving home, or simply refuelling between flights, Costa Coffee offers handcrafted coffees, refreshing iced drinks, tasty lunchtime bites, and sweet treats to enjoy on the go.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Gate 8', openingHours: '00:00 - 24:00', open247: true }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '00:00 - 24:00', open247: true }),
    ],
  }),
  harris_and_hoole: restaurant({
    name: 'Harris + Hoole',
    cuisine: 'Coffee',
    amenity: 'cafe',
    logoUrl: logo('harrisandhoole.co.uk'),
    website: 'https://www.harrisandhoole.co.uk',
    phone: '+44(0)2046358041',
    description: "Harris + Hoole's accredited baristas strive to share their passion for exceptional speciality coffees and freshly prepared-in-store food, with all those seeking a better coffee experience.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate 21', openingHours: '05:00 - 23:00' })],
  }),
  star_light: restaurant({
    name: 'Star Light',
    cuisine: 'British, Pub',
    amenity: 'pub',
    logoUrl: logo('jdwetherspoon.com'),
    website: 'https://www.jdwetherspoon.com',
    description: "J D Wetherspoon's pub, Star Light, is offering quick service and traditional pub grub. The menu features British pub classics, like fish and chips and all-day brunch, as well as lighter bites, such as paninis and small plates, with a separate children's menu for younger travellers.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate 20', openingHours: '05:30 - 21:30' })],
  }),
  wafflemeister: restaurant({
    name: 'Wafflemeister',
    cuisine: 'Waffles, Dessert, Coffee',
    amenity: 'bakery',
    logoUrl: logo('wafflemeister.co.uk'),
    website: 'https://www.wafflemeister.co.uk',
    phone: '+44(0)20 3117 5371',
    description: "Is there anything better than an indulgent treat before taking off on holiday? As well as classic liège waffles with a variety of toppings and gelato flavours, Wafflemeister serves freshly baked pastries, fruit pots, a range of handmade toasties, coffee and a full drinks menu.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:30 - 21:30' })],
  }),
  wild_olive: restaurant({
    name: 'Wild Olive',
    cuisine: 'Mediterranean, Middle Eastern',
    amenity: 'restaurant',
    phone: '+44 (0)20 7930 8087',
    description: "Come join us at Wild Olive for a vibrant, no-fuss dining experience where Mediterranean and Middle Eastern flavours come to life with fresh, high-quality ingredients — bold, natural tastes, mezze plates, fresh flatbreads and perfectly charred halloumi.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Near Gate 7', openingHours: '05:30 - 21:30' })],
  }),
  pret_a_manger_t4: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    phone: '+44 (0)20 7932 5388',
    description: "Whether it's a croissant or bowl for breakfast, or a salad or sandwich for lunch, whether you fancy a bake, bar or bite for those in-between moments, Pret has you covered.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate 6B', openingHours: '05:00 - 22:00' })],
  }),
  yo_t4: restaurant({
    name: 'YO!',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    logoUrl: logo('yosushi.com'),
    website: 'https://yosushi.com',
    phone: '+44 (0)20 3011 1434',
    description: 'Prefer something faster than the sit-down kaiten restaurants in T2/T3? Grab and go options are available in Terminal 4, perfect when short on time, with bold Japanese street food and sushi flavours to go.',
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 22:00' }),
    ],
  }),
};

// ─── Terminal 5 venues ────────────────────────────────────────────────────

const t5Venues = {
  five_guys: restaurant({
    name: 'Five Guys',
    cuisine: 'American, Burgers',
    amenity: 'fast_food',
    logoUrl: logo('fiveguys.com'),
    website: 'https://www.fiveguys.co.uk',
    phone: '+44(0) 20 3697 7809',
    description: 'Five Guys is an American burger restaurant that hopped the pond in 2013. Everything is fresh and cooked to order, all produce is locally sourced, and Five Guys burgers are made from 120-day grain-fed beef with 15 free, fresh toppings to choose from.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:00 - 22:00' })],
  }),
  fortnum_and_mason_bar: restaurant({
    name: 'Fortnum and Mason Bar',
    cuisine: 'Bar, Champagne, British',
    amenity: 'bar',
    logoUrl: logo('fortnumandmason.com'),
    website: 'https://www.fortnumandmason.com',
    phone: '+44 (0)20 7734 8040',
    description: 'A moment of relaxed style in the busy heart of Heathrow, the T5 Bar is the perfect pre-flight destination for first-class dining and cocktails.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate A17', openingHours: '05:30 - 22:00' })],
  }),
  gordon_ramsay_plane_food: restaurant({
    name: 'Gordon Ramsay Plane Food Market',
    cuisine: 'International, Market',
    amenity: 'food_court',
    logoUrl: logo('gordonramsayrestaurants.com'),
    website: 'https://www.gordonramsayrestaurants.com',
    phone: '+44 (0) 208 897 4545',
    description: 'Looking for quality food at Heathrow Terminal 5? Gordon Ramsay Plane Food Market delivers premium airport dining from 5am through evening service. Located upstairs at Terminal 5, the menu spans global cuisines – from signature breakfast and artisan coffee to fresh sushi, gourmet burgers, and authentic pizza.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Upstairs, Terminal 5', openingHours: '05:00 - 21:30' })],
  }),
  itsu: restaurant({
    name: 'itsu',
    cuisine: 'Asian, Sushi',
    amenity: 'fast_food',
    logoUrl: logo('itsu.com'),
    website: 'https://www.itsu.com',
    phone: '+44 (0)20 3728 2469',
    description: 'itsu first opened its doors in 1997, after recognising a need for healthy, nutritious fast food. Most of the Asian-inspired menu is under 500 calories and packed with vitamins, fibre & protein, a third of dishes are plant-based and the vast majority costs under £8.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate A15', openingHours: '05:00 - 23:00' })],
  }),
  pilots_bar_and_kitchen: restaurant({
    name: 'Pilots Bar and Kitchen',
    cuisine: 'British, International',
    amenity: 'bar',
    phone: '+44 (0)20 8812 3213',
    description: 'This vintage-inspired all-day brasserie offers a deliciously diverse menu of British and international classics, including American-style pancakes, eggs benedict, freshly-made pastries, salads, sandwiches and a dedicated burger menu. Inspired by the golden era of the 1950s, Terminal 5’s stylish Pilots Bar & Kitchen is run by premium caterer and restauranteur Rhubarb Hospitality Collection.',
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate A19', openingHours: '06:00 - 21:00' })],
  }),
  the_crown_rivers_wetherspoon: restaurant({
    name: 'The Crown Rivers',
    cuisine: 'British, Pub',
    amenity: 'pub',
    logoUrl: logo('jdwetherspoon.com'),
    website: 'https://www.jdwetherspoon.com',
    phone: '+44 (0)20 8283 6208',
    description: "J D Wetherspoon has cracked the formula for a busy pub: more than a dozen beers on tap, double-quick service and solid pub grub. Near gates A1–A7, the menu features British pub classics like bangers and mash and fish and chips, as well as lighter bites, burgers and freshly baked pizzas.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Gate A5', openingHours: '04:45 - 21:00' })],
  }),
  the_globe: restaurant({
    name: 'The Globe',
    cuisine: 'Bar, British, American',
    amenity: 'bar',
    phone: '+44 (0)20 8283 8751',
    description: "The Globe is an independent craft beer and food destination before the security gates in Heathrow Airport's Terminal 5. The diverse food menu includes a range of English pub classics, American-style grills and ribs as well as meat-sharing platters and DIY tacos, with beers and cider supplied by local craft brewer Big Smoke Brew Co.",
    outlets: [outlet({ airside: 'landside', locationNotes: 'Check-in', openingHours: '06:30 - 21:30' })],
  }),
  wagamama: restaurant({
    name: 'wagamama',
    cuisine: 'Asian, Japanese',
    amenity: 'restaurant',
    logoUrl: logo('wagamama.com'),
    website: 'https://www.wagamama.com',
    phone: '+44 (0)20 8283 6186',
    description: "wagamama welcomes Asian twists on British classics for their refreshed airport breakfast menu, served between 6 - 11am. With curries, rice bowls, noodles and shareable sides, there's something for the whole family, with extensive vegan and kids' options, plus grab-and-go dishes for those on the move.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '06:00 - 21:30' })],
  }),
  caffe_nero_t5: restaurant({
    name: 'Caffè Nero',
    cuisine: 'Café, Italian, Coffee',
    amenity: 'cafe',
    logoUrl: logo('caffenero.com'),
    website: 'https://caffenero.com/uk/',
    phone: '+44 (0)20 8897 6160',
    description: "Ever since we opened our first coffee house in 1997, Caffè Nero has been dedicated to two things: creating the very finest handcrafted Italian coffee and providing a warm and relaxing atmosphere in which to enjoy it. As every second counts when you're flying, you need good food - fast! This is why Caffè Nero at Heathrow offers a 15-minute menu.",
    outlets: [
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '05:00 - 23:30' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '05:15 - 21:30' }),
      outlet({ airside: 'airside', locationNotes: 'Zone A, check-in area, departures', openingHours: '05:15 - 21:30' }),
    ],
  }),
  giraffe_t5: restaurant({
    name: 'Giraffe',
    cuisine: 'International, Family',
    amenity: 'restaurant',
    logoUrl: logo('giraffe.net'),
    website: 'https://www.giraffe.net',
    phone: '+44 (0)20 3117 5500',
    description: "With colourful walls, bright neons and the iconic giraffe statue at the entrance, you can't miss the family-friendly world kitchens in Terminals 3 and 5. Whether you fancy the spicy huevos rancheros, a classic full English or American-style pancakes piled high at breakfast time, or a fresh and delicious salad, flavourful curry bowl or traditional plate of fish and chips.",
    outlets: [outlet({ airside: 'airside', locationNotes: 'Departures', openingHours: '05:00 - 22:00' })],
  }),
  pret_a_manger_t5: restaurant({
    name: 'Pret A Manger',
    cuisine: 'Café, Sandwiches',
    amenity: 'cafe',
    logoUrl: logo('pret.co.uk'),
    website: 'https://www.pret.co.uk',
    phone: '+44 (0)20 8283 7230',
    description: "Whether it's a croissant or bowl for breakfast, or a salad or sandwich for lunch, whether you fancy a bake, bar or bite for those in-between moments, Pret has you covered. Pret's newest shop has landed at Heathrow T5 Arrivals, so if you're coming back home or just beginning your adventure, pick up a Pret to fuel your onward travels.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Gate A9', openingHours: '05:00 - 22:00' }),
      outlet({ airside: 'airside', locationNotes: 'Gate A3', openingHours: '05:00 - 22:00' }),
      outlet({ airside: 'landside', locationNotes: 'Check-in', openingHours: '04:00 - 21:00' }),
      outlet({ airside: 'landside', locationNotes: 'Arrivals', openingHours: '00:00 - 24:00', open247: true }),
    ],
  }),
  starbucks_t5: restaurant({
    name: 'Starbucks',
    cuisine: 'Coffee & Bakery',
    amenity: 'cafe',
    logoUrl: logo('starbucks.com'),
    website: 'https://www.starbucks.co.uk',
    phone: '+44 (0)20 8283 6538',
    description: "One of the world's most iconic coffee brands offering a fine range of freshly roasted coffees, Italian-style espressos and ice-blended drinks, plus delicious panini, sandwiches, cakes and pastries.",
    outlets: [
      outlet({ airside: 'airside', locationNotes: 'Gate B35', openingHours: '06:00 - 21:00' }),
      outlet({ airside: 'airside', locationNotes: 'Gate C55', openingHours: '06:00 - 21:30' }),
      outlet({ airside: 'airside', locationNotes: 'Gate A10', openingHours: '06:00 - 21:00' }),
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

  const t2Result = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', t2Venues);
  const t3Result = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', t3Venues);
  const t4Result = await processTerminal(AIRPORT, TERMINAL_4, 'Terminal 4', t4Venues);
  const t5Result = await processTerminal(AIRPORT, TERMINAL_5, 'Terminal 5', t5Venues);

  const totalUpdated = t2Result.updated + t3Result.updated + t4Result.updated + t5Result.updated;
  const totalCreated = t2Result.created + t3Result.created + t4Result.created + t5Result.created;
  const totalVenues = Object.keys(t2Venues).length + Object.keys(t3Venues).length + Object.keys(t4Venues).length + Object.keys(t5Venues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
