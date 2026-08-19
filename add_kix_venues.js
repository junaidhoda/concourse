'use strict';
/**
 * Fills in complete data for Kansai International Airport (KIX), Osaka —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-16 from the
 * official site, www.kansai-airport.or.jp (Kansai Airports), Shop & Dine >
 * Restaurants (https://www.kansai-airport.or.jp/en/shop-and-dine/dine),
 * using Claude in Chrome browser automation (not WebFetch — the listing
 * page needs a client-side "Search with these criteria" click to render
 * all 61 items, and each item's full detail — description, phone,
 * category tags, dietary tags, precise location — lives on a separate
 * per-shop detail page reachable only via an in-page link).
 *
 * METHODOLOGY: the search page itself renders every one of KIX's 61
 * dine listings on one page (no pagination) once "Search with these
 * criteria" is clicked, each linking to a detail page at
 * /en/dine/d<id>. Because the detail pages are same-origin, every one of
 * the 61 detail pages was fetched directly via `fetch()` executed in the
 * page context (avoiding 61 separate navigations) and parsed for:
 * `.spot-detail-info-title` (name), `.spot-detail-description` (real
 * descriptive text — used verbatim/trimmed to one sentence, never
 * invented), `.spot-detail-tags` (category chips, e.g. Western/Café/
 * Japanese Traditional, plus "preferred criteria" chips including Halal
 * and Vegetarian), `.spot-detail-info-items` (the Building/Floor/
 * Security-status location line — this site's own authoritative
 * structural field, see below), and `.spot-detail-main-items` (phone
 * number, where published). External (non-kansai-airport.or.jp,
 * non-platinumaps.jp map-widget) links were captured as each shop's
 * official website where one exists (e.g. a hotel restaurant page on
 * nikkokix.com, or a brand's own corporate site).
 *
 * TERMINAL STRUCTURE: KIX has exactly two buildings that pass this
 * dataset's "own check-in AND own security" test. Terminal 1 is the
 * original main terminal (all airlines except the two below), with its
 * own check-in halls and its own security/immigration screening; its
 * post-security area is subdivided into a Main Building plus North Wing
 * and South Wing reached via the Wing Shuttle people-mover, but those
 * wings have no check-in or security of their own (passengers only
 * reach them after already clearing T1 security), so they are not
 * modelled as separate buckets — and the site's own restaurant listing
 * does not expose wing-level detail per shop anyway, only "Terminal 1".
 * Terminal 2 is a fully separate building, used by Peach Aviation and
 * Jeju Air, with its own check-in and its own security screening,
 * connected to Terminal 1 only by a shuttle bus — so it is modelled as a
 * genuinely separate terminal_2 bucket. The site's own "Terminal /
 * Building" filter (Terminal 1 / Terminal 2 / Aeroplaza) matches this.
 *
 * AEROPLAZA: a third option in the site's own Terminal/Building filter,
 * Aeroplaza is a landside commercial building (home to Hotel Nikko
 * Kansai Airport) connected to Terminal 1's 2nd floor by a walkway —
 * confirmed via the airport's own FAQ ("To get there from Terminal 1, go
 * out through the 2nd floor exit... to Aeroplaza") and via LiveJapan's
 * airport guide, which describes Aeroplaza as "a commercial complex...
 * directly connected to Terminal 1's second floor", with no check-in or
 * security of its own. It fails this dataset's terminal test, so — same
 * treatment as ICN's Concourse in this dataset's prior run — every
 * Aeroplaza venue is folded into the terminal_1 bucket, with
 * `location_notes` explicitly naming the Aeroplaza building so the
 * distinction from the main Terminal 1 building isn't lost.
 *
 * AIRSIDE/LANDSIDE: unlike several previous airports in this dataset,
 * KIX's own site exposes this directly and authoritatively as a
 * structural field on every listing and detail page — "Before security"
 * (landside) or "After security (International)" / "After security
 * (Domestic)" (both airside) — so no text-based inference rule was
 * needed here.
 *
 * CUISINE/AMENITY: `cuisine` is built from the site's own category chips
 * (Japanese Traditional / Western / Chinese / Fast Food / Café / Bar /
 * Food Court / Others), condensed into a short human-readable label;
 * `amenity` (restaurant/cafe/fast_food/bar/food_court) was chosen to
 * match those same chips plus the shop's own description. `halal` and
 * `vegetarian` are set only where the site's own "Preferred criteria"
 * tags explicitly include Halal / Vegetarian for that shop (e.g.
 * Homemade Udon Kineya Mugimaru is Halal-tagged; nana's green tea, Osaka
 * Tenma Sushi Nishiya, OnigiriBurger, and Kamameshi & Macha Tsumugi are
 * Vegetarian-tagged) — nothing here is guessed from the cuisine alone.
 *
 * MULTI-OUTLET CONVENTION: "Starbucks Coffee" appears twice within the
 * Terminal 1 bucket (1F South Shop, before security; 2F Shop, before
 * security) and is combined into one doc with two outlets, per this
 * dataset's standard convention. "PRONTO" is a closer call: it appears
 * three times across the listing (Aeroplaza; Terminal 1 2F after
 * security, listed as "PRONTO TERMINAL 1"; Terminal 2 1F before
 * security). The Terminal 2 outlet is kept separate purely because it's
 * a different terminal bucket. But the Aeroplaza "PRONTO" and "PRONTO
 * TERMINAL 1" — despite sharing a terminal bucket here — were NOT merged
 * into one doc: their real descriptions are for two different underlying
 * concepts ("Il Bar" — "a plain and simple bar" — for the Aeroplaza shop,
 * vs. the actual Pronto Italian-bar concept, "'Pronto' means 'ready to
 * eat' in Italian", for the Terminal 1 and Terminal 2 shops, the latter
 * two sharing near-identical description text). Trusting the deliberate,
 * specific description text over the shared surface label (this
 * dataset's established page-truth-over-label precedent) means these are
 * kept as three separate docs. "BOTEJYU®1946" and "Japan Traveling
 * Restaurant® by BOTEJYU®" likewise sit in the same terminal and share a
 * parent brand, but are two distinctly named, distinctly described
 * concepts and so are kept separate rather than merged.
 *
 * DATA GAPS (left blank rather than guessed, per this dataset's
 * no-fabrication rule): Icho (Aeroplaza) and 551HORAI and MENSHO have no
 * description text published on their own detail pages (Icho is also
 * currently "Closed until further notice" per the site). Café DIOR by
 * Anne-Sophie Pic's real description was captured but got cut off
 * mid-word by a tool-output truncation during a mid-session browser
 * disconnect and was not re-fetchable before this file was written, so
 * its `description` is left blank rather than completed with a guess.
 * SUKIYA's phone number was likewise captured only as a truncated
 * "0120-498-0..." and is left blank rather than risk one wrong digit.
 * A handful of shops (TORISHO, Sakaiya, Ebiichi, KIX BEER, COCO'S
 * Airport Dining, GENKI SHOUTEN, ☆Soup, STARBUCKS COFFEE 2F Shop,
 * Tsukiji Magoemon, 551HORAI, JAPANESE RESTAURANT) simply have no phone
 * number published on the site at all — confirmed by checking their raw
 * "Shop Details" block contains no "Phone Number" row, not a parsing
 * miss.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['kix', 'kansai', 'osaka'];
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

// Shorthand: o(level, locationNotes, airside, openingHours, open247)
const o = (level, notes, airside, hours, open247 = false) =>
  outlet({ airside, level, locationNotes: notes, openingHours: hours, open247 });

// ─── Terminal 1 venues (includes Aeroplaza, landside, connected to T1) ────────

const terminal1Venues = {
  the_brasserie: restaurant({
    name: 'The Brasserie', cuisine: 'Western', amenity: 'restaurant',
    website: 'nikkokix.com', logoUrl: logo('nikkokix.com'),
    description: 'Our restaurant All Day Dining: The Brasserie has prepared a comprehensive buffet made with seasonal vegetables which is enjoyable for guests of all ages.',
    phone: '072-455-1120',
    outlets: [o('2F', 'Aeroplaza building, 2F, before security, connected to Terminal 1', 'landside',
      '[Breakfast] 5:45-10:00 (Last entry 9:30); [Lunch] 11:30-14:30 (Last entry 14:00); [Dinner] 17:30-22:00 (Last entry 20:30)')],
  }),
  torisho: restaurant({
    name: 'TORISHO', cuisine: 'Japanese Traditional (Chicken)', amenity: 'restaurant',
    description: 'TORISHO is a specialty restaurant serving authentic chicken dishes made with carefully selected chicken and prepared using a variety of techniques, including grilling, frying, and simmering.',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (hours may change with flight schedule)')],
  }),
  kamukura_premium: restaurant({
    name: 'KAMUKURA Premium', cuisine: 'Japanese Traditional (Ramen)', amenity: 'restaurant',
    website: 'kamukura.co.jp', logoUrl: logo('kamukura.co.jp'),
    description: 'KAMUKURA Premium offers a truly special bowl made with carefully selected, high-quality ingredients such as wagyu beef, crab, and shark fin.',
    phone: '072-468-6430',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (hours may change with flight schedule)')],
  }),
  burger_king_t1: restaurant({
    name: 'Burger King', cuisine: 'Fast Food', amenity: 'fast_food',
    website: 'burgerking.co.jp', logoUrl: logo('burgerking.co.jp'),
    description: 'Burger King is a hamburger chain born in the United States, known for its flame grilled 100% beef patties and fresh vegetables.',
    phone: '072-434-6997',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (hours may change with flight schedule)')],
  }),
  fresh: restaurant({
    name: 'FRESH', cuisine: 'Café / Fast Food', amenity: 'fast_food',
    description: 'Refuel your travel-weary body with nutritious snacks, wholesome pasta and freshly squeezed juices at FRESH!',
    phone: '072-434-8069',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (hours may change with flight schedule)')],
  }),
  wolfgang_puck_kitchen_counter: restaurant({
    name: 'WOLFGANG PUCK KITCHEN COUNTER', cuisine: 'Western', amenity: 'restaurant',
    description: 'An exciting Californian-inspired menu of Western classics with a touch of Asian flair.',
    phone: '072-434-8540',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (hours may change with flight schedule)')],
  }),
  crystal_jade: restaurant({
    name: 'Crystal Jade 翡翠拉麺小籠包', cuisine: 'Chinese', amenity: 'restaurant',
    description: 'Indulge in authentic Shanghainese classics and regional favorites, featuring modern twists from innovative Xiao Long Bao to hand-pulled La Mian, all served with warm hospitality.',
    phone: '072-434-8194',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (hours may change with flight schedule)')],
  }),
  kobist: restaurant({
    name: 'KOBIST', cuisine: 'Western (Kobe Beef)', amenity: 'fast_food',
    description: 'KOBIST was created around the concept of authentic Kobe beef in just five minutes, using premium Kobe beef grilled fresh in-store.',
    phone: '072-447-8265',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  sakaiya: restaurant({
    name: 'Sakaiya', cuisine: 'Japanese Traditional', amenity: 'restaurant',
    description: 'Sakaiya offers thoughtfully prepared set meals made with premium ingredients such as wagyu beef, fresh seafood, and seasonal produce.',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55')],
  }),
  kamameshi_macha_tsumugi: restaurant({
    name: 'KAMAMESHI & MACHA Tsumugi', cuisine: 'Japanese Traditional (Kamameshi & Matcha)', amenity: 'restaurant',
    website: 'pronto.co.jp', logoUrl: logo('pronto.co.jp'),
    description: 'In a cozy space inspired by Japanese motifs and colors, enjoy carefully crafted kamameshi rice dishes found only here, along with Japanese sweets and matcha.',
    phone: '072-447-6136', vegetarian: true,
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55')],
  }),
  ebiichi: restaurant({
    name: 'Ebiichi', cuisine: 'Japanese Traditional (Tempura)', amenity: 'restaurant',
    description: 'Ebiichi is a tempura specialty restaurant that uses carefully selected ingredients, including shrimp, and fries them to a light, crisp finish.',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55')],
  }),
  tullys_coffee: restaurant({
    name: "TULLY'S COFFEE", cuisine: 'Café', amenity: 'cafe',
    website: 'tullys.co.jp', logoUrl: logo('tullys.co.jp'),
    description: 'A specialty coffee shop originally from Seattle, USA.',
    phone: '072-468-7556',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55')],
  }),
  pronto_aeroplaza: restaurant({
    name: 'PRONTO', cuisine: 'Western Café & Bar', amenity: 'cafe',
    website: 'pronto.co.jp', logoUrl: logo('pronto.co.jp'),
    description: '"Il Bar" means a plain and simple bar — food and drink are served at reasonable prices in a mature atmosphere.',
    phone: '072-456-8586',
    outlets: [o('2F', 'Aeroplaza building, 2F, before security, connected to Terminal 1', 'landside', '7:00-20:00')],
  }),
  kiefel: restaurant({
    name: 'KIEFEL', cuisine: 'Café', amenity: 'cafe',
    website: 'kiefel-coffee.co.jp', logoUrl: logo('kiefel-coffee.co.jp'),
    description: 'Coffee roasted fresh on the premises, udon noodles, and draft beer.',
    phone: '072-456-6060',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '8:00-22:00')],
  }),
  hanazato: restaurant({
    name: 'Hanazato', cuisine: 'Japanese Traditional', amenity: 'restaurant',
    website: 'nikkokix.com', logoUrl: logo('nikkokix.com'),
    description: 'We offer courses and set menus showcasing Japanese flavors, including tempura.',
    phone: '072-455-1120',
    outlets: [o('2F', 'Aeroplaza building, 2F, before security, connected to Terminal 1', 'landside',
      '[Lunch] 11:30-14:30 (Last order 14:00); [Dinner] 17:30-21:00 (Last order 20:30). Closed every Thursday (excluding holidays) and Aug 10.')],
  }),
  musubiya_hinone_mizunone: restaurant({
    name: 'MUSUBIYA HINONE MIZUNONE', cuisine: 'Japanese Traditional (Onigiri)', amenity: 'fast_food',
    website: 'fujiofood.com', logoUrl: logo('fujiofood.com'),
    description: 'A special type of fast food from a Japanese restaurant, serving freshly made onigiri rice balls.',
    phone: '072-456-6594',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '8:00-22:00')],
  }),
  espresso_bakery: restaurant({
    name: 'ESPRESSO&BAKERY', cuisine: 'Café / Bakery', amenity: 'cafe',
    website: 'pronto.co.jp', logoUrl: logo('pronto.co.jp'),
    description: 'An authentic European-style café experience.',
    phone: '072-456-6526',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '8:00-23:00 (L.O. 22:30)')],
  }),
  starbucks_coffee: restaurant({
    name: 'Starbucks Coffee', cuisine: 'Café', amenity: 'cafe',
    website: 'starbucks.co.jp', logoUrl: logo('starbucks.co.jp'),
    description: 'A wide variety of drinks based on espresso made from high-quality arabica coffee beans, together with pastries and sandwiches.',
    phone: '072-456-8797',
    outlets: [
      o('1F', '1F South Shop, Terminal 1, 1F, before security', 'landside', '6:30-22:30 (L.O. 22:10)'),
      o('2F', '2F Shop, Terminal 1, 2F, before security', 'landside', '7:00-22:00'),
    ],
  }),
  e_pronto: restaurant({
    name: 'È PRONTO', cuisine: 'Café', amenity: 'cafe',
    website: 'pronto.co.jp', logoUrl: logo('pronto.co.jp'),
    description: 'A place where anyone can feel right at home.',
    phone: '072-456-6541',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '8:00-23:00 (hours may change with flight schedule)')],
  }),
  nakau: restaurant({
    name: 'NAKAU', cuisine: 'Japanese Traditional (Donburi & Udon)', amenity: 'fast_food',
    website: 'nakau.co.jp', logoUrl: logo('nakau.co.jp'),
    description: "Nakau serves donburi (rice bowls) topped with various ingredients and tender, Kyoto-style udon noodles.",
    phone: '0120-29-5770',
    outlets: [o('3F', 'Aeroplaza building, 3F, before security, connected to Terminal 1', 'landside', 'Open 24 hours', true)],
  }),
  doutor_coffee_shop: restaurant({
    name: 'Doutor Coffee Shop', cuisine: 'Café', amenity: 'cafe',
    website: 'doutor.co.jp', logoUrl: logo('doutor.co.jp'),
    description: 'Enjoy a cup of our delightful coffee that is always freshly ground and freshly brewed.',
    phone: '072-456-6663',
    outlets: [o('1F', 'Terminal 1, 1F, before security', 'landside', '6:30-22:30 (L.O. 22:00)')],
  }),
  san_marco_curry: restaurant({
    name: 'San Marco Curry', cuisine: 'Western (Curry)', amenity: 'restaurant',
    website: 'tonkatu-kyk.co.jp', logoUrl: logo('tonkatu-kyk.co.jp'),
    description: 'Enjoy deep, rich flavor that comes from a secret blend of more than twenty spices, used to season a vegetable and beef bouillon curry.',
    phone: '072-456-6588',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  mcdonalds_t1: restaurant({
    name: "McDonald's", cuisine: 'Fast Food', amenity: 'fast_food',
    website: 'mcdonalds.co.jp', logoUrl: logo('mcdonalds.co.jp'),
    description: 'Open 24 hours at the northern part of the second floor of the Terminal 1 building, for very late night or early morning meals.',
    phone: '072-488-7628',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', 'Open 24 hours', true)],
  }),
  kineya_mugimaru: restaurant({
    name: 'Homemade udon KINEYA MUGIMARU', cuisine: 'Japanese Traditional (Udon)', amenity: 'fast_food',
    description: 'Enjoy freshly cooked udon noodles made in-store with wheat flour from Mie Prefecture, served cafeteria-style.',
    phone: '072-456-6519', halal: true,
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  takomasa: restaurant({
    name: 'TAKOMASA', cuisine: 'Japanese (Takoyaki)', amenity: 'fast_food',
    description: "Authentic takoyaki octopus dumplings from Osaka's famous Dotonbori district.",
    phone: '072-456-6633',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  toh_lee: restaurant({
    name: 'Toh-Lee', cuisine: 'Chinese', amenity: 'restaurant',
    website: 'nikkokix.com', logoUrl: logo('nikkokix.com'),
    description: 'At Chinese Cuisine: Toh-Lee, guests are able to dine in a space filled with exotic atmosphere.',
    phone: '072-455-1120',
    outlets: [o('2F', 'Aeroplaza building, 2F, before security, connected to Terminal 1', 'landside',
      '[Lunch] 11:30-14:30 (Last order 14:00); [Dinner] 17:30-21:00 (Last order 20:30). Closed every Wednesday (excluding holidays).')],
  }),
  maidoookinishokudo_kankushokudo: restaurant({
    name: 'maidoookinishokudo kankushokudo', cuisine: 'Japanese Traditional', amenity: 'restaurant',
    website: 'shokudo.jp', logoUrl: logo('shokudo.jp'),
    description: 'Old-fashioned cafeteria-style dining, serving up home-cooked-style dishes to warm both the body and the soul.',
    phone: '072-456-6602',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  icho: restaurant({
    name: 'Icho', cuisine: 'Western', amenity: 'restaurant',
    website: 'nikkokix.com', logoUrl: logo('nikkokix.com'),
    description: '', // no description published; listing shows this venue as currently closed
    phone: '072-455-1120',
    outlets: [o('11F', 'Aeroplaza building, 11F, before security, connected to Terminal 1', 'landside', 'Closed until further notice')],
  }),
  dotonborikamukura: restaurant({
    name: 'DOTONBORIKAMUKURA', cuisine: 'Japanese (Ramen)', amenity: 'restaurant',
    website: 'kamukura.co.jp', logoUrl: logo('kamukura.co.jp'),
    description: 'Completely new flavors that transcend existing notions of ramen: this is Kamukura.',
    phone: '0724-68-6838',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  saint_marc_cafe: restaurant({
    name: 'SAINT MARC CAFÉ', cuisine: 'Café', amenity: 'cafe',
    website: 'saint-marc-hd.com', logoUrl: logo('saint-marc-hd.com'),
    description: 'A place to relax at virtually any time of day.',
    phone: '072-447-7309',
    outlets: [o('2F', 'Terminal 1, 2F, after security (Domestic)', 'airside', '5:30-21:10')],
  }),
  osaka_tenma_sushi_nishiya: restaurant({
    name: 'OSAKA TENMA SUSHI NISHIYA', cuisine: 'Japanese Traditional (Sushi)', amenity: 'restaurant',
    website: 'nishiya.jp', logoUrl: logo('nishiya.jp'),
    description: 'Freshly made sushi in the food court.',
    phone: '072-479-5676', vegetarian: true,
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  onigiriburger: restaurant({
    name: 'OnigiriBurger', cuisine: 'Fast Food (Onigiri)', amenity: 'fast_food',
    website: 'onigiriburger.com', logoUrl: logo('onigiriburger.com'),
    description: 'One hand like a burger! A rice-ball concept designed to be eaten quickly, one-handed, like a burger.',
    phone: '072-447-6567', vegetarian: true,
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  botejyu_1946: restaurant({
    name: 'BOTEJYU®1946', cuisine: 'Japanese Traditional (Okonomiyaki)', amenity: 'restaurant',
    website: 'japan-traveling-restaurant.jp', logoUrl: logo('japan-traveling-restaurant.jp'),
    description: 'A long-beloved okonomiyaki restaurant established in 1946, offering various local favorites from Osaka.',
    phone: '072-456-6611',
    outlets: [o('2F', 'Terminal 1, 2F, after security (Domestic)', 'airside', '5:30-21:30 (L.O. 21:00)')],
  }),
  japan_traveling_restaurant_botejyu: restaurant({
    name: 'Japan Traveling Restaurant® by BOTEJYU®', cuisine: 'Japanese Traditional (Okonomiyaki)', amenity: 'restaurant',
    website: 'japan-traveling-restaurant.jp', logoUrl: logo('japan-traveling-restaurant.jp'),
    description: 'Offering regional favorites full of history, local foods, and original dishes — enjoy the experience of traveling around Japan through food.',
    phone: '072-456-6655',
    outlets: [o('2F', 'Terminal 1, 2F, after security (Domestic)', 'airside', '5:30-21:30 (L.O. 21:00)')],
  }),
  kix_beer: restaurant({
    name: 'KIX BEER', cuisine: 'Bar', amenity: 'bar',
    description: 'Serving local craft beer, food, and more.',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  genki_shouten: restaurant({
    name: 'GENKI SHOUTEN', cuisine: 'Japanese (Beef Skirt Steak)', amenity: 'restaurant',
    description: 'Senshu Genki Harami skirt steak has fans all across Japan, and this restaurant serves it on topped rice bowls, or as teishoku meal sets.',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  sojibo: restaurant({
    name: 'SOJIBO', cuisine: 'Japanese Traditional (Soba)', amenity: 'restaurant',
    description: 'Serving premium soba noodles made with a traditional "ni-hachi" blend of 80% buckwheat and 20% wheat flour.',
    phone: '072-456-6502',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  colosseo: restaurant({
    name: 'COLOSSEO', cuisine: 'Italian Café', amenity: 'cafe',
    website: 'mcim.jp', logoUrl: logo('mcim.jp'),
    description: 'A new Italian café from Colosseo, the only restaurant in the Kansai region officially certified by the Italian government.',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
  soup: restaurant({
    name: '☆Soup', cuisine: 'Japanese / Chinese (Soup)', amenity: 'restaurant',
    description: 'Building bodies through soup.',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  segafredo_caffe: restaurant({
    name: 'SEGAFREDO CAFFE', cuisine: 'Café', amenity: 'cafe',
    description: 'The international brand Segafredo Zanetti comes to a Japanese airport for the first time ever.',
    phone: '072-456-6416',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  sukiya: restaurant({
    name: 'SUKIYA', cuisine: 'Japanese Traditional (Gyudon)', amenity: 'fast_food',
    website: 'sukiya.jp', logoUrl: logo('sukiya.jp'),
    description: 'The familiar gyudon beef bowl chain Sukiya is open nearly around the clock on the second floor of the Terminal 1 building.',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '23 hours daily (closed 3:00-4:00)')],
  }),
  tsukiji_magoemon: restaurant({
    name: 'Tsukiji Magoemon', cuisine: 'Japanese Traditional (Seafood)', amenity: 'restaurant',
    description: 'Enjoy dishes made with choice, chef-selected ingredients, with a focus on fresh seafood from Toyosu and Maizuru.',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  '551horai': restaurant({
    name: '551HORAI', cuisine: '', amenity: 'restaurant',
    description: '', // no description or category published on the site
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside',
      '7:00-22:00 (L.O. 21:30); chilled item sales 7:00-21:00 (limited quantity); hot item sales 10:00-21:00; bento sales 11:00-21:00; eat-in 11:00-22:00 (L.O. 21:30)')],
  }),
  japanese_restaurant: restaurant({
    name: 'JAPANESE RESTAURANT', cuisine: 'Japanese Traditional', amenity: 'restaurant',
    description: 'Serving homemade-style Japanese dishes designed to go with rice, built around a philosophy of foods that are as healthy as they are delicious.',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  tonkatsu_wako_keitei: restaurant({
    name: 'TONKATSU WAKO KEITEI', cuisine: 'Japanese Traditional (Tonkatsu)', amenity: 'restaurant',
    description: 'Choice pork, coated in coarse panko breadcrumbs, then lovingly fried in pure vegetable oil, for tonkatsu pork cutlets crunchy on the outside and juicy on the inside.',
    phone: '072-479-5503',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00 (L.O. 21:30)')],
  }),
  cafe_bar_sakura: restaurant({
    name: 'Cafe & Bar 和 SAKURA', cuisine: 'Café & Bar', amenity: 'bar',
    website: 'gourmet-kineya.co.jp', logoUrl: logo('gourmet-kineya.co.jp'),
    description: 'Cafe & Bar Wa-Sakura offers an inviting place to spend a moment, no matter what time of day.',
    phone: '072-468-6876',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-26:15 (L.O. 25:45)')],
  }),
  pronto_terminal_1: restaurant({
    name: 'PRONTO TERMINAL 1', cuisine: 'Western Café & Bar', amenity: 'cafe',
    website: 'pronto.co.jp', logoUrl: logo('pronto.co.jp'),
    description: '"Pronto" means "ready to eat" in Italian — an Italian bar serving coffee and bread in the morning, pasta at lunch, sweets with tea or coffee in the afternoon, and alcoholic drinks in the evening.',
    phone: '072-456-6571',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  mensho: restaurant({
    name: 'MENSHO', cuisine: 'Chinese (Ramen)', amenity: 'fast_food',
    description: '', // no description published on the site
    phone: '072-456-6587',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '6:30-24:55 (L.O. 24:25)')],
  }),
  le_pan_kobe_kitano: restaurant({
    name: 'LE PAN Kobe Kitano', cuisine: 'Western (Bakery)', amenity: 'cafe',
    website: 'l-s.jp', logoUrl: logo('l-s.jp'),
    description: 'A hotel-operated lounge with a luxurious atmosphere, operated by Hotel La Suite Kobe Harborland, serving lovingly prepared bread, sweets, and a full menu of meal options.',
    phone: '072-489-5599',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '6:30-22:00')],
  }),
  cafe_dior: restaurant({
    name: 'Café DIOR by Anne-Sophie Pic', cuisine: 'Café', amenity: 'cafe',
    website: 'dior.com', logoUrl: logo('dior.com'),
    description: '', // real description was captured but cut off mid-word by a tool-output truncation and could not be re-fetched before this file was written; left blank rather than guessed
    phone: '072-479-3821',
    outlets: [o('2F', 'Terminal 1, 2F, after security (International)', 'airside', '8:00-20:00 (L.O. 19:30)')],
  }),
  olive_hill: restaurant({
    name: 'Olive Hill', cuisine: 'Western (Pasta & Pizza)', amenity: 'restaurant',
    website: 'olivenooka.jp', logoUrl: logo('olivenooka.jp'),
    description: 'Pasta, Pizza, and More!',
    phone: '072-447-5312',
    outlets: [o('3F', 'Aeroplaza building, 3F, before security, connected to Terminal 1', 'landside', '9:00-23:00')],
  }),
  zetteria: restaurant({
    name: 'ZETTERIA', cuisine: 'Fast Food (Burgers)', amenity: 'fast_food',
    website: 'zetteria.jp', logoUrl: logo('zetteria.jp'),
    description: 'The name "Zetteria" combines their signature Zeppin ("masterpiece") Burgers with the word "cafeteria" — a casual Japanese burger chain aiming to offer great food any time, anywhere.',
    phone: '0120-29-5770',
    outlets: [o('2F', 'Aeroplaza building, 2F, before security, connected to Terminal 1', 'landside', 'Open 24 hours', true)],
  }),
  ryuka_seian_toushomen: restaurant({
    name: 'Ryu-ka Seian toushomen', cuisine: 'Chinese (Noodles)', amenity: 'restaurant',
    website: 'toushomen.jp', logoUrl: logo('toushomen.jp'),
    description: "Toshomen is a long-beloved local noodle dish from the Xi'an region of China — neither ramen nor udon.",
    phone: '072-468-8576',
    outlets: [o('3F', 'Aeroplaza building, 3F, before security, connected to Terminal 1', 'landside', '10:00-23:00 (L.O. 22:30)')],
  }),
  kanekohannosuke: restaurant({
    name: 'Kanekohannosuke', cuisine: 'Japanese Traditional (Tendon)', amenity: 'restaurant',
    website: 'kaneko-hannosuke.com', logoUrl: logo('kaneko-hannosuke.com'),
    description: 'Enjoy stylish and hearty Edomae tendon, made with a secret donburi sauce, from a leading figure in the world of Japanese cuisine born in Asakusa.',
    outlets: [o('2F', 'Terminal 1, 2F, before security', 'landside', '7:00-22:00')],
  }),
};

// ─── Terminal 2 venues (Peach Aviation / Jeju Air) ────────────────────────────

const terminal2Venues = {
  azusa_coffee: restaurant({
    name: 'Azusa Coffee', cuisine: 'Café', amenity: 'cafe',
    description: 'We offer our original blended coffee with a rich, refined aroma, along with freshly made bakery sandwiches that are quick and easy to enjoy.',
    phone: '072-434-8402',
    outlets: [o('1F', 'Terminal 2, 1F, after security (Domestic)', 'airside', '5:30-19:20 (hours may change with flight schedule)')],
  }),
  kagonoya: restaurant({
    name: 'Kagonoya', cuisine: 'Japanese Traditional', amenity: 'restaurant',
    description: 'Kagonoya uses premium Koshihikari rice from Uonuma, known for its naturally rich sweetness, in dishes including jidori chicken and egg rice bowls and beef udon.',
    phone: '072-434-8402',
    outlets: [o('1F', 'Terminal 2, 1F, after security (Domestic)', 'airside', '5:30-19:20 (hours may change with flight schedule)')],
  }),
  nanas_green_tea: restaurant({
    name: "nana's green tea", cuisine: 'Café', amenity: 'cafe',
    website: 'nanasgreentea.com', logoUrl: logo('nanasgreentea.com'),
    description: 'A popular Japanese cafe where you can enjoy the true taste of Japanese matcha (powdered green tea).',
    phone: '072-455-4897', vegetarian: true,
    outlets: [o('1F', 'Terminal 2, 1F, after security (International)', 'airside', '5:30-22:05 (L.O. 21:35)')],
  }),
  pronto_t2: restaurant({
    name: 'PRONTO', cuisine: 'Western Café & Bar', amenity: 'cafe',
    website: 'pronto.co.jp', logoUrl: logo('pronto.co.jp'),
    description: '"Pronto" means "ready to eat" in Italian — an Italian bar serving coffee and bread in the morning, pasta at lunch, sweets with tea or coffee in the afternoon, and a wide range of alcoholic drinks in the evening.',
    phone: '072-456-8585',
    outlets: [o('1F', 'Terminal 2, 1F, before security', 'landside', '6:00-22:30')],
  }),
  japan_gourmet: restaurant({
    name: 'JAPAN GOURMET', cuisine: 'Japanese, Western & Chinese', amenity: 'food_court',
    website: 'createrestaurants.com', logoUrl: logo('createrestaurants.com'),
    description: "Enjoy some of Kansai's favorite meals.",
    phone: '072-456-6496',
    outlets: [o('1F', 'Terminal 2, 1F, after security (International)', 'airside', '5:30-22:25 (L.O. 21:55)')],
  }),
  cocos_airport_dining: restaurant({
    name: "COCO'S Airport Dining", cuisine: 'Japanese, Western & Chinese', amenity: 'restaurant',
    description: "Enjoy a menu full of variety, from the trademark Coco's foil-wrapped Hamburg steaks to pasta, ramen, grilled unagi eel, shaved ice, and much more.",
    outlets: [o('1F', 'Terminal 2, 1F, before security', 'landside', '4:00-26:00')],
  }),
};

// ─── main ─────────────────────────────────────────────────────────────────

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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', terminal1Venues);
  const r2 = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', terminal2Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2]));

  const totalCreated = r1.created + r2.created;
  const totalDeleted = r1.deleted + r2.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
