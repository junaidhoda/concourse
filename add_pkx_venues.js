'use strict';
/**
 * Fills in complete data for Beijing Daxing International Airport (PKX),
 * China, restaurants/bars/cafés in Firestore, based on research conducted
 * on 2026-08-15.
 *
 * TERMINAL STRUCTURE: PKX operates out of ONE single, massive terminal
 * building — at roughly 1.03 million m² it's one of the largest single-
 * building airport terminals in the world, designed by Zaha Hadid
 * Architects with a "starfish" layout: a central hub with FIVE radiating
 * concourses/piers (referred to on the official site simply as Pier A, B,
 * C, D and International Pier E), plus a central "Dining Island" (5F) and
 * shared check-in/arrivals halls. There is one integrated check-in/security
 * system for the whole building rather than separate terminals each with
 * their own — so per this dataset's "own check-in AND own security" test,
 * PKX does not meet the bar for multiple terminal buckets. It's modelled
 * here as ONE terminal bucket (terminal_1, "Terminal 1"), with each venue's
 * floor + pier/zone captured in its outlet's `level` field, the same
 * single-terminal treatment used for DOH, AUH, GIG and LIM.
 *
 * SOURCES & METHODOLOGY: built entirely from the official Beijing Daxing
 * International Airport site (bdia.com.cn — the operator is Capital
 * Airports Holdings), using the same browser-verified, official-site-only
 * standard established for prior scripts in this repo. The site is a
 * client-rendered SPA; its "商业" (Commerce) > "美食盛宴" (Food Feast) page
 * (bdia.com.cn/#/foodList) is a paginated directory (7 pages × up to 12
 * cards) fully walked via Claude in Chrome, using its own Location (F1-F5),
 * Type (Beverages/Desserts/Asian/Fast Food/Light Meals/Bakery/Snacks/
 * Western/Chinese) and Zone (outside-security / inside-security) filters
 * left on "All" to capture the complete, unfiltered set. This returned 83
 * individual outlet listings — each with a shop name, one-line floor+pier
 * location, and opening hours, but NO per-venue description paragraph
 * (unlike DXB/DOH/AUH, this site's directory is a bare listing, not a
 * detail-page-per-venue site — there's no secondary click-through page to
 * fetch). Cross-checking the "饮品" (Beverages) type filter alone (which
 * independently returned exactly 21 results — all 9 Starbucks outlets, the
 * Starbucks Reserve outlet, all 7 Luckin Coffee outlets, Lao She Teahouse,
 * M Stand, MANNER, and Nuo Ding Coffee) confirmed the listing's location/
 * hours data is internally consistent, giving confidence in the full
 * unfiltered pull. No secondary/third-party sources were used to source any
 * name, location, or hours data; brand/cuisine descriptions below are
 * limited to well-established, generic facts about each brand (see
 * DATA-QUALITY NOTES).
 *
 * The 83 raw listings resolve to 59 unique venues after combining exact
 * same-name outlets appearing at multiple piers into one doc with multiple
 * `outlets[]` entries (this dataset's standing multi-outlet convention) —
 * e.g. plain "星巴克"/Starbucks alone has NINE outlets across the terminal.
 * Distinctly-named combo storefronts (e.g. "牛角村+墨西果果" vs a
 * hypothetical standalone "牛角村") are kept as their own separate docs
 * exactly as named by the site, matching the precedent set by AUH's
 * "Patamar" vs "Patamar To Go".
 *
 * DATA-QUALITY NOTES:
 *   - The official listing publishes NO description paragraph for any of
 *     the 83 listings — only name, floor+pier location, and hours. Unlike
 *     CMB (which had the same gap), most of these are Chinese-language
 *     venue/dish names that are self-descriptive of cuisine (e.g. "牛肉面"
 *     = beef noodles, "拉面" = ramen, "包子铺" = steamed bun shop) — cuisine
 *     tags below are derived directly from those self-evident name
 *     meanings plus well-established public knowledge of named chains
 *     (Quanjude for Peking duck, Xiabu Xiabu for hot pot, Bee Cheng Hiang
 *     for Singaporean meat jerky, etc.), NOT from any airport-specific
 *     description text, since none is published.
 *   - `website`/`logo_url` are filled in only for the handful of brands
 *     independently confirmed as global chains with an unambiguous public
 *     domain (Starbucks, KFC, McDonald's, Burger King, Luckin Coffee) —
 *     the many well-known but China-specific chains (Quanjude, Xiabu Xiabu,
 *     Xibei, Manner, M Stand, etc.) are left blank rather than guessing a
 *     domain.
 *   - Two venues are flagged `halal: true` based on their own names/brand
 *     identity being unambiguously Muslim Chinese ("清真") concepts:
 *     "紫光园+东方炉匠" (Ziguangyuan is a well-known Beijing halal
 *     restaurant brand) and "西部马华" (Xibu Ma Hua is a well-known halal
 *     Lanzhou-style noodle chain). No other halal/vegetarian/vegan claims
 *     are asserted for any venue since the site publishes no dietary tags.
 *   - Hours published as "24小时营业" map to `open247: true`. A few outlets
 *     publish hours as "营业至夜航结束" ("open until the last night flight
 *     ends") instead of a fixed close time — these are recorded verbatim in
 *     `opening_hours` rather than approximated.
 *   - "Domestic Mixed-Flow Zone" (国内混流区) piers A-D are the site's own
 *     term for the airside zone where arriving and departing domestic
 *     passengers share concourse space; these are modelled as `airside`.
 *     Check-in halls (值机大厅) and Arrivals halls (到达大厅) are modelled
 *     as `landside`; the "Domestic Remote-Stand Waiting Area" (国内远机位
 *     候机区) is modelled as `airside` since it's a post-security gate
 *     waiting area.
 *
 * PKX does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'pkx' first, then 'daxing', then 'beijingdaxing', using
 * whichever has existing terminal data). It never creates a new
 * `airports/{id}` metadata doc itself.
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
 *   node add_pkx_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['pkx', 'daxing', 'beijingdaxing'];
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

// ─── Terminal venues (single unified terminal; Piers A-D + Intl Pier E) ─────

const terminal1Venues = {
  jing_a: restaurant({
    name: 'Jing-A',
    cuisine: 'Craft Beer, Bar, American',
    amenity: 'restaurant',
    description: 'Beijing-based craft brewery and taproom concept.',
    outlets: [outlet({ level: '3F, International Pier E', open247: true })],
  }),
  starbucks_reserve: restaurant({
    name: 'Starbucks Reserve',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: "Starbucks's premium small-batch coffee concept.",
    outlets: [outlet({ level: '2F, Domestic Pier C', open247: true })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: 'Global coffeehouse chain.',
    outlets: [
      outlet({ level: '3F, International Waiting Area', open247: true }),
      outlet({ level: '3F, International Pier E', open247: true }),
      outlet({ airside: 'landside', level: '1F, International Arrivals Hall', openingHours: '08:30-18:00' }),
      outlet({ airside: 'landside', level: '2F, Domestic Arrivals Hall', openingHours: '08:30-01:00' }),
      outlet({ airside: 'landside', level: '4F, Check-in Hall', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' }),
      outlet({ level: '1F, Domestic Remote-Stand Waiting Area', openingHours: '06:00-16:00' }),
    ],
  }),
  croissant_village_mexigo: restaurant({
    name: 'Croissant Village + ME&GO',
    cuisine: 'Bakery, Croissants, Mexican-Asian Fusion',
    amenity: 'fast_food',
    description: 'Combined bakery/croissant concept and Mexican-Asian fusion food concept sharing one storefront.',
    outlets: [outlet({ airside: 'landside', level: '2F, Domestic Arrivals Hall', open247: true })],
  }),
  fu_wan_fen: restaurant({
    name: 'Fu Wan Fen',
    cuisine: 'Chinese, Noodles',
    amenity: 'fast_food',
    outlets: [outlet({ level: '3F, International Pier E', open247: true })],
  }),
  lao_she_teahouse: restaurant({
    name: 'Lao She Teahouse',
    cuisine: 'Chinese Tea, Teahouse',
    amenity: 'cafe',
    description: 'Well-known Beijing teahouse brand named after author Lao She, serving traditional Chinese tea and light snacks.',
    outlets: [outlet({ level: '5F, Dining Island', open247: true })],
  }),
  kfc: restaurant({
    name: 'KFC',
    cuisine: 'Fried Chicken, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.kfc.com',
    logoUrl: logo('kfc.com'),
    description: "World-famous Southern fried chicken chain.",
    outlets: [
      outlet({ level: '2F, Domestic Pier C', open247: true }),
      outlet({ level: '3F, International Waiting Area', openingHours: '10:00-20:00' }),
      outlet({ level: '2F, Domestic Pier D', openingHours: '00:00 - open until end of night flights' }),
    ],
  }),
  manzhuang_xiaoguan_yujian_xiaomian: restaurant({
    name: 'Manzhuang Xiaoguan + Yujian Xiaomian',
    cuisine: 'Chinese, Noodles',
    amenity: 'fast_food',
    description: 'Combined home-style diner and Chongqing-style noodle concept sharing one storefront.',
    outlets: [outlet({ level: '3F, International Waiting Area', open247: true })],
  }),
  yujian_xiaomian: restaurant({
    name: 'Yujian Xiaomian',
    cuisine: 'Chinese, Sichuan/Chongqing Noodles',
    amenity: 'fast_food',
    description: 'Chongqing-style noodle chain ("Yujian Xiaomian" translates to "Meet Noodles").',
    outlets: [
      outlet({ level: '2F, Domestic Pier A', open247: true }),
      outlet({ level: '2F, Domestic Pier C', openingHours: '06:00-22:00' }),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.mcdonalds.com',
    logoUrl: logo('mcdonalds.com'),
    outlets: [
      outlet({ airside: 'landside', level: '2F, Domestic Arrivals Hall', open247: true }),
      outlet({ level: '3F, International Pier E', openingHours: '22:00-16:00' }),
      outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' }),
    ],
  }),
  quanjude: restaurant({
    name: 'Quanjude',
    cuisine: 'Chinese, Peking Duck',
    amenity: 'restaurant',
    description: 'Historic Beijing restaurant chain famous for Peking roast duck, founded 1864.',
    outlets: [outlet({ level: '5F, Dining Island', openingHours: '10:00-21:00' })],
  }),
  quan_niu_jiang_murakami: restaurant({
    name: 'Quan Niu Jiang + Murakami Ichiya',
    cuisine: 'Chinese Beef, Japanese',
    amenity: 'restaurant',
    description: 'Combined Chinese beef-specialty restaurant and Japanese concept sharing one storefront.',
    outlets: [outlet({ level: '5F, Dining Island', openingHours: '10:00-20:00' })],
  }),
  xiangshuiyao_laozhang_chuange: restaurant({
    name: 'Xiang Shui Yao + Lao Zhang Beef Noodles + Chuange Fish Dumplings',
    cuisine: 'Hunan, Beef Noodles, Dumplings',
    amenity: 'restaurant',
    description: 'A combined food-hall storefront hosting three concepts: Hunan cuisine, beef noodles, and fish dumplings.',
    outlets: [outlet({ level: '5F, Dining Island', openingHours: '10:00-20:00' })],
  }),
  grandmas_kitchen: restaurant({
    name: "Grandma's Kitchen",
    cuisine: 'Zhejiang, Chinese',
    amenity: 'restaurant',
    description: 'Well-known Zhejiang-cuisine restaurant chain ("Waipojia").',
    outlets: [outlet({ level: '5F, Dining Island', openingHours: '09:00-22:00' })],
  }),
  m_stand: restaurant({
    name: 'M Stand',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Shanghai-founded specialty coffee chain.',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' })],
  }),
  manner: restaurant({
    name: 'MANNER',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    description: 'Shanghai-founded specialty coffee chain.',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' })],
  }),
  ucc_coffee_shop: restaurant({
    name: 'UCC Coffee Shop',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.ucc.co.jp',
    logoUrl: logo('ucc.co.jp'),
    description: 'Japanese coffee brand (UCC Ueshima Coffee Co.).',
    outlets: [outlet({ level: '2F, Domestic Pier C', openingHours: '06:00-22:00' })],
  }),
  luckin_coffee: restaurant({
    name: 'Luckin Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    website: 'https://www.luckincoffee.com',
    logoUrl: logo('luckincoffee.com'),
    description: 'Major Chinese coffee chain.',
    outlets: [
      outlet({ airside: 'landside', level: '1F, International Arrivals Hall', openingHours: '06:00-22:00' }),
      outlet({ airside: 'landside', level: '2F, Domestic Arrivals Hall', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' }),
      outlet({ airside: 'landside', level: '4F, Check-in Hall', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier C', openingHours: '06:00-21:00' }),
      outlet({ level: '1F, Domestic Remote-Stand Waiting Area', openingHours: '06:00-16:00' }),
      outlet({ airside: 'landside', level: '3F, Domestic Check-in Hall', openingHours: '06:00 - open until end of night flights' }),
    ],
  }),
  quan_niu_jiang: restaurant({
    name: 'Quan Niu Jiang',
    cuisine: 'Chinese, Beef',
    amenity: 'restaurant',
    description: 'Chinese beef-specialty restaurant.',
    outlets: [outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' })],
  }),
  daoxiaoman_qiaomixian: restaurant({
    name: 'Dao Xiaoman Half-Chicken Crossing-Bridge Rice Noodles',
    cuisine: 'Yunnan, Rice Noodles, Chicken',
    amenity: 'restaurant',
    description: 'Yunnan-style "crossing-the-bridge" rice noodle concept.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  ajisen_ramen: restaurant({
    name: 'Ajisen Ramen',
    cuisine: 'Japanese, Ramen',
    amenity: 'restaurant',
    description: 'Japanese ramen chain.',
    outlets: [outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' })],
  }),
  xiabu_xiabu: restaurant({
    name: 'Xiabu Xiabu',
    cuisine: 'Chinese Hot Pot',
    amenity: 'restaurant',
    description: 'Well-known individual-serving Chinese hot pot chain.',
    outlets: [outlet({ level: '2F, Domestic Pier C', openingHours: '06:00-22:00' })],
  }),
  nuo_ding_coffee: restaurant({
    name: 'Nuo Ding Coffee',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    outlets: [outlet({ level: '3F, International Waiting Area', openingHours: '06:00-22:00' })],
  }),
  xijiade_lanxiong: restaurant({
    name: 'Xijiade + Lanxiong Fresh Milk',
    cuisine: 'Dumplings, Milk Tea',
    amenity: 'fast_food',
    description: 'Combined dumpling chain (known for shrimp dumplings) and fresh-milk beverage concept sharing one storefront.',
    outlets: [outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' })],
  }),
  xiyue_no8: restaurant({
    name: 'Xi Yue No. 8',
    cuisine: 'Cantonese',
    amenity: 'restaurant',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  grandmas_kitchen_lanxiong: restaurant({
    name: "Grandma's Kitchen + Lanxiong Fresh Milk",
    cuisine: 'Zhejiang, Chinese, Milk Tea',
    amenity: 'restaurant',
    description: 'Combined Zhejiang-cuisine restaurant and fresh-milk beverage concept sharing one storefront.',
    outlets: [outlet({ level: '5F, Dining Island', openingHours: '06:00-22:00' })],
  }),
  holiland: restaurant({
    name: 'Holiland',
    cuisine: 'Bakery, Desserts',
    amenity: 'bakery',
    description: 'Major Chinese bakery/dessert chain.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  qingfeng_baozi: restaurant({
    name: 'Qingfeng Steamed Buns',
    cuisine: 'Chinese, Steamed Buns, Baozi',
    amenity: 'fast_food',
    description: 'Well-known Beijing steamed-bun (baozi) chain.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  xin_zha_shi_xiong: restaurant({
    name: 'Xin Zha Shi Xiong',
    cuisine: 'Cantonese, Roast Meats',
    amenity: 'fast_food',
    description: 'Cantonese roast-meats (siu mei) concept.',
    outlets: [
      outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' }),
      outlet({ level: '3F, International Waiting Area', openingHours: '06:00-21:00' }),
    ],
  }),
  fangzhuanchang_69: restaurant({
    name: 'Fangzhuanchang No. 69 Zhajiangmian',
    cuisine: 'Beijing, Zhajiangmian Noodles',
    amenity: 'fast_food',
    description: 'Beijing-style soybean-paste noodle (zhajiangmian) concept.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  wudijia: restaurant({
    name: 'Wudijia',
    cuisine: 'Chinese, Beijing Home-Style',
    amenity: 'restaurant',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' })],
  }),
  wangshifu_yerenxiansheng: restaurant({
    name: 'Wang Shifu Super Chef Stir-Fry + Wild Man',
    cuisine: 'Chinese, Stir-Fry',
    amenity: 'restaurant',
    description: 'Combined home-style stir-fry concept and second brand sharing one storefront.',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' })],
  }),
  mr_lee_beef_noodles: restaurant({
    name: 'Mr. Lee Beef Noodles',
    cuisine: 'Taiwanese, Beef Noodles',
    amenity: 'fast_food',
    description: 'Taiwanese-style beef noodle soup chain.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  ikeda_sushi: restaurant({
    name: 'Ikeda Sushi',
    cuisine: 'Japanese, Sushi',
    amenity: 'restaurant',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  wagas: restaurant({
    name: 'Wagas',
    cuisine: 'Western, Café, Salads, Sandwiches',
    amenity: 'restaurant',
    description: 'Shanghai-founded Western-style café/deli chain.',
    outlets: [outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' })],
  }),
  yeye_bu_pao_cha: restaurant({
    name: 'Yeye Bu Pao Cha',
    cuisine: 'Milk Tea, Beverages',
    amenity: 'cafe',
    description: 'Chinese milk tea chain ("Grandpa Doesn\'t Brew Tea").',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  niu_rou_chuan: restaurant({
    name: 'Niu Rou Chuan',
    cuisine: 'Chinese, Beef',
    amenity: 'restaurant',
    outlets: [outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' })],
  }),
  micun_bibimbap: restaurant({
    name: 'Micun Bibimbap',
    cuisine: 'Korean, Bibimbap',
    amenity: 'fast_food',
    description: 'Korean bibimbap (mixed rice bowl) chain.',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' })],
  }),
  ziguangyuan_dongfang: restaurant({
    name: 'Ziguangyuan + Dongfang Grill',
    cuisine: 'Halal, Chinese, Grill',
    amenity: 'restaurant',
    halal: true,
    description: 'Combined storefront: Ziguangyuan is a well-known Beijing halal (Hui Muslim) Chinese restaurant brand, paired with a grill/roast concept.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  bee_cheng_hiang: restaurant({
    name: 'Bee Cheng Hiang',
    cuisine: 'Singaporean, Meat Jerky, Snacks',
    amenity: 'fast_food',
    description: 'Singaporean bak kwa (dried meat jerky) chain.',
    outlets: [
      outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-22:00' }),
    ],
  }),
  aifu_yunqiaoyuan: restaurant({
    name: 'Aifu Yunqiaoyuan',
    cuisine: 'Yunnan, Chinese',
    amenity: 'restaurant',
    outlets: [outlet({ level: '5F, Dining Island', openingHours: '06:00-22:00' })],
  }),
  su_mian_fang: restaurant({
    name: 'Su Mian Fang',
    cuisine: 'Suzhou, Noodles',
    amenity: 'fast_food',
    description: 'Suzhou-style noodle concept.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  xibei: restaurant({
    name: 'Xibei',
    cuisine: 'Northwestern Chinese, Youmian Noodles',
    amenity: 'restaurant',
    description: 'Major Northwestern-Chinese cuisine chain, known for oat-noodle (youmian) dishes.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  xibu_ma_hua: restaurant({
    name: 'Xibu Ma Hua',
    cuisine: 'Halal, Lanzhou Noodles',
    amenity: 'fast_food',
    halal: true,
    description: 'Well-known halal (Hui Muslim) Lanzhou-style hand-pulled noodle chain.',
    outlets: [outlet({ airside: 'landside', level: '1F, International Arrivals Hall', openingHours: '06:00-22:00' })],
  }),
  yangyang_chinese_meal: restaurant({
    name: 'Yangyang Chinese Meal',
    cuisine: 'Chinese',
    amenity: 'fast_food',
    outlets: [
      outlet({ airside: 'landside', level: '3F, Domestic Check-in Hall', openingHours: '06:00-22:00' }),
      outlet({ level: '2F, Domestic Pier B', openingHours: '05:00 - open until end of night flights' }),
    ],
  }),
  yu_ni_zai_yiqi: restaurant({
    name: 'Yu Ni Zai Yiqi',
    cuisine: 'Chinese, Fish',
    amenity: 'restaurant',
    description: 'Fish-dish specialty concept ("Together with Fish").',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  e_jiang: restaurant({
    name: 'E Jiang',
    cuisine: 'Chinese, Goose',
    amenity: 'restaurant',
    description: 'Goose-dish specialty concept.',
    outlets: [outlet({ level: '2F, Domestic Pier D', openingHours: '06:00-22:00' })],
  }),
  ma_liu_ji: restaurant({
    name: 'Ma Liu Ji',
    cuisine: 'Sichuan, Noodles',
    amenity: 'restaurant',
    description: 'Sichuan-style hot & sour noodle chain.',
    outlets: [outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-21:00' })],
  }),
  tang_gong: restaurant({
    name: 'Tang Gong',
    cuisine: 'Cantonese, Dim Sum',
    amenity: 'restaurant',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-21:00' })],
  }),
  xiao_diao_li_tang: restaurant({
    name: 'Xiao Diao Li Tang',
    cuisine: 'Beijing, Pear Soup, Dessert Drinks',
    amenity: 'cafe',
    description: 'Beijing dessert-drink chain known for stewed pear soup (tangshui).',
    outlets: [outlet({ level: '2F, Domestic Pier C', openingHours: '06:00-21:00' })],
  }),
  songhelou: restaurant({
    name: 'Songhelou',
    cuisine: 'Suzhou, Jiangsu',
    amenity: 'restaurant',
    description: 'Centuries-old, historic Suzhou restaurant brand.',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '06:00-21:00' })],
  }),
  qin_lu: restaurant({
    name: 'Qin Lu',
    cuisine: 'Chinese',
    amenity: 'restaurant',
    outlets: [outlet({ level: '2F, Domestic Pier B', openingHours: '06:00-21:00' })],
  }),
  jin_ding_xuan: restaurant({
    name: 'Jin Ding Xuan',
    cuisine: 'Cantonese, Dim Sum',
    amenity: 'restaurant',
    description: 'Well-known Beijing 24-hour Cantonese dim sum chain.',
    outlets: [outlet({ level: '2F, Domestic Pier C', openingHours: '06:00-21:00' })],
  }),
  axiang_mixian_xuxiaoshu: restaurant({
    name: 'Axiang Rice Noodles + Xu Xiaoshu',
    cuisine: 'Yunnan, Rice Noodles, Dessert',
    amenity: 'fast_food',
    description: 'Combined Yunnan rice-noodle chain and dessert concept sharing one storefront.',
    outlets: [outlet({ level: '2F, Domestic Pier C', openingHours: '06:00-21:00' })],
  }),
  hefu_laomian: restaurant({
    name: 'Hefu Laomian',
    cuisine: 'Chinese, Noodles',
    amenity: 'fast_food',
    description: 'Well-known Chinese noodle chain.',
    outlets: [outlet({ level: '3F, International Waiting Area', openingHours: '06:00-15:00' })],
  }),
  master_kong_beef_noodles: restaurant({
    name: 'Master Kong Private Kitchen Beef Noodles',
    cuisine: 'Chinese, Beef Noodles',
    amenity: 'fast_food',
    description: 'Beef noodle restaurant concept from Master Kong (Tingyi).',
    outlets: [outlet({ airside: 'landside', level: '1F, International Arrivals Hall', openingHours: '06:00-02:00' })],
  }),
  eggbomb_chansanchi: restaurant({
    name: 'Eggbomb + Chan San Chi',
    cuisine: 'Breakfast, Eggs, Snacks',
    amenity: 'fast_food',
    description: 'Combined egg-based breakfast concept and snack concept sharing one storefront.',
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '05:00-22:00' })],
  }),
  burger_king: restaurant({
    name: 'Burger King',
    cuisine: 'Burgers, Fast Food',
    amenity: 'fast_food',
    website: 'https://www.burgerking.com',
    logoUrl: logo('burgerking.com'),
    outlets: [outlet({ level: '2F, Domestic Pier A', openingHours: '05:00-00:00' })],
  }),
  micun_bibimbap_lemon: restaurant({
    name: 'Micun Bibimbap + Lemon Right',
    cuisine: 'Korean, Bibimbap, Beverages',
    amenity: 'fast_food',
    description: 'Combined Korean bibimbap concept and lemon-beverage concept sharing one storefront.',
    outlets: [outlet({ airside: 'landside', level: '2F, Domestic Arrivals Hall', openingHours: '04:00-01:30' })],
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1', terminal1Venues);

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
