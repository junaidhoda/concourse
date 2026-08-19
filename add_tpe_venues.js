'use strict';
/**
 * Fills in complete data for Taiwan Taoyuan International Airport (TPE) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-17 from the
 * official site, taoyuan-airport.com (Taoyuan International Airport
 * Corporation), using Claude in Chrome browser automation per this
 * project's standing convention (no WebFetch for venue data).
 *
 * METHODOLOGY: TPE's dining directory is backed by a REST API
 * (POST taoyuan-airport.com/api/api/facilitys/list, body
 * {"language":"en","mainId":"9CBEA40D-B7AB-EB11-AB4D-D45D6481BBEB",
 * "page":1,"pageSize":1000} — mainId is the "Dining" categoryMain id taken
 * from the page's own m= URL query param) that returns all 76 dining
 * venues in one response, each with per-outlet `maps[]` (terminal, floor,
 * hours, mapArea) and real site category tags (`categorySub[]`). A second
 * endpoint (POST .../facilitys/item, body {"language":"en","id":"<id>"})
 * returns richer per-venue data: a real marketing `en_info` description and
 * a `urls[]` website-link array (21 of 76 venues have one). The exact list
 * payload shape wasn't visible via network-request inspection (the page's
 * bundled API client didn't respond to window.fetch/XMLHttpRequest
 * monkey-patching installed after page load), so it was reverse-engineered
 * by calling the endpoint directly from the page's own origin and iterating
 * on its validation error messages until it returned real data. Both
 * responses exceeded get_page_text's ~50KB output cap and were split into
 * chunks (2 for the list, 4 for the item-detail batch) via .slice() in the
 * page and reassembled. The item-detail JSON had 2 unescaped embedded
 * quotes in marketing copy that broke parsing on the first attempt —
 * repaired via a string-aware scan that escapes a `"` only when the next
 * non-whitespace character isn't one of `,:}]` (i.e. it isn't really
 * closing the JSON string).
 *
 * TERMINAL STRUCTURE: Taoyuan has two passenger terminals. Wikipedia
 * confirms Terminal 1 and Terminal 2 each have their own separate check-in
 * and security operations (Terminal 1 across its two concourses; Terminal
 * 2's originally-separate-per-concourse security was later consolidated to
 * a central location in front of passport control — still Terminal-2-only).
 * The two terminals are linked by the Taoyuan Airport Skytrain (APM), which
 * carries both cleared and uncleared passengers in separate cars — a
 * connector, not evidence of a shared security perimeter. T1/T2 both PASS
 * this project's "own check-in AND own security" test independently, so —
 * unlike BKK's SAT-1 — this is a normal 2-bucket airport. Confirmed further
 * by the official site's own dining directory, which presents "Terminal 1
 * T1" and "Terminal 2 T2" as first-class peer filters (same pattern as
 * Changi's T1-T4, this project's positive precedent for a site's own filter
 * structure as corroborating evidence). Terminal 3 is under construction
 * (Wikipedia: "now scheduled to be complete by 2026"), not yet open to
 * passengers — no bucket needed; the live directory's Terminal filter only
 * offers T1/T2.
 *
 * LOCATION / AIRSIDE MAPPING: only two `mapArea` values (2, 3) appear
 * anywhere in the 76 venues' 101 outlet entries (mapArea 1, "Arrival Area",
 * never appears for Dining). CONFIRMED (not just inferred) via a real venue
 * detail page: navigating to a Chatime detail page (mapArea:3, floor:-1)
 * rendered the store-info line "09:00-21:00 +886-3-3833087 Terminal
 * 1-B1(Non-Controlled Area)" — directly confirming mapArea 3 =
 * "Non-Controlled Area" = landside. By elimination, mapArea 2 = "Departure
 * Area" = airside.
 *
 * MULTI-OUTLET / SAME-BRAND HANDLING: standard project rule — same-brand
 * outlets in the SAME terminal merge into one doc with multiple outlets[];
 * a brand present in BOTH terminals becomes two separate per-terminal docs.
 * 7 content ids span both terminals and were split this way: 7-11, Burger
 * King, IJYSHENG, Le Moût, Mos Burger, Starbucks, Wing Café. "hómee KITCHEN"
 * is already listed as two separate content ids by the site itself (one
 * Terminal 1 only, one Terminal 2 only) and lands as two per-terminal docs
 * naturally. "Lao Dong Beef Noodles (Terminal 1)"/"(Terminal 2)" are also
 * two separate content ids with the terminal baked into the name — cleaned
 * to drop the redundant "(Terminal N)" suffix since the terminal is already
 * the bucket.
 *
 * AMENITY / CUISINE / HALAL / VEGETARIAN: sourced directly from TPE's own
 * per-venue categorySub tags — no free-text inference needed, unlike BKK.
 * cuisine = verbatim join of a venue's own categorySub tag names. halal =
 * true only if "Halal Cuisine" is among a venue's tags (2 venues: Lou Zhang
 * Muslim Beef Restaurant, 台北中東料理坊— matches exactly). vegetarian = true
 * only if "Vegetarian Food" is among its tags. No vegan/kosher/gluten-free
 * tag exists in this taxonomy, so those fields stay blank (no-fabrication
 * rule). amenity mapped from categorySub with one deliberate exception: the
 * site's own "Alcoholic Drinks & Beverage Shops" tag is, despite its name,
 * applied broadly to plain tea/coffee/juice shops (Chatime, COMEBUYTEA, and
 * Tasameng- Chun Shui Tang — all well-known Taiwanese bubble-tea chains —
 * carry ONLY this tag). Verified by reading all 11 tagged venues' own
 * descriptions: only SUNMAI BAR and D3 Bar are genuinely alcohol-centric
 * (both literally named "...Bar" and their descriptions foreground beer),
 * so those two alone map to 'bar'; every other beverage-tagged venue falls
 * through to 'cafe' as the closer fit. "Convenience Stores" (7-11,
 * FamilyMart) has no exact precedent in this project's amenity set — mapping
 * them to cafe/fast_food would misrepresent them, so a dedicated
 * 'convenience_store' value is used. A few venue names are Chinese-only in
 * the site's own en_title field (三商巧福, 台北中東料理坊, 航隅食堂 Airport Corne
 * [partially translated], 萬芳冰室, 壱力麵屋本舖) — kept verbatim as sourced, no
 * invented English translation; their Firestore doc keys fall back to a
 * short id-derived slug since nothing ASCII survives slugification.
 *
 * WEBSITE: sourced from the item-detail endpoint's `urls[]` array (21 of 76
 * venues have one), bare hostname only, per this project's standing
 * convention. Left blank where the site provides no external link.
 *
 * VERIFIED TOTALS: 76 raw dining content-id listings (101 raw outlet
 * entries) reconciled to 83 restaurant docs / 101 outlets across 2 terminal
 * buckets (7 content ids splitting into 2 per-terminal docs each account
 * for 76 -> 83; outlet count is unchanged since no dedup was needed — every
 * outlet is a real distinct physical location per the source data).
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['tpe', 'taiwan-taoyuan', 'taoyuan', 'taipei-taoyuan'];
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

// ─── Terminal 1 venues ────────────────────────────────────────────────────

const terminal1Venues = {
  chatime: restaurant({
    name: "Chatime",
    cuisine: "Alcoholic Drinks & Beverage Shops",
    description: "Tea drinking has become so much more than just a way to quench your thirst — it’s a way to express your attitude, mood, and personality.\nSince 2005, Chatime has been serving millions of customers with their favorite cup of tea, making it part of every occasion, celebration or simply cupping a busy day at work.",
    amenity: "cafe",
    outlets: [
      o("-1", "Floor -1", "landside", "09:00-21:00", false),
    ],
  }),
  _7_11: restaurant({
    name: "7-11",
    cuisine: "Convenience Stores",
    description: "convenience store Payment Instrument： Cash (NTD)、Credit Card、UnionPay Card、Apple Pay、Google Pay、Samsung Pay、Line Pay、Taiwan Pay、OpenPoint、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、icash EasyCard",
    website: "7-11.com.tw",
    logoUrl: logo("7-11.com.tw"),
    amenity: "convenience_store",
    outlets: [
      o("-1", "Floor -1", "landside", "00:00~24:00", true),
      o("-1", "Floor -1", "landside", "00:00~24:00", true),
    ],
  }),
  barista_premium: restaurant({
    name: "Barista Premium",
    cuisine: "Cafés & Light Foods",
    description: "",
    amenity: "cafe",
    outlets: [
      o("-1", "Floor -1; 07:00-20:00(假日)", "landside", "07:00-18:00(平日)", false),
    ],
  }),
  bistro_d: restaurant({
    name: "Bistro:D",
    cuisine: "Cafés & Light Foods / Chinese Cuisine",
    description: "Bistros are a popular type of restaurant in the west, and it’s apparent why. A main dish here, a panfried grouper with truffle, mashed cauliflower and Chiayi O’long soy sauce, adeptly uses Italian techniques to blend Taiwanese seasonal vegetables. New interpretations on flavor emerge when paired with a carefully crafted beverage. (Near Boarding Gate A6、B5) Payment Instrument： EasyCard、iPASS、WeChat、Alipay、HANA、Line、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~23:00", false),
      o("3", "Floor 3", "airside", "06:00~23:00", false),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King",
    cuisine: "Fast Food Restaurants",
    description: "Burger King was founded in 1954. It is globally the second largest fast-food chain store brand, and is famous for providing customers with quality products and delicious meals at rational prices. American-style grilled burger, fries and chicken nuggets, etc.\n\nPayment Instrument： Cash、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    website: "burgerking.com.tw",
    logoUrl: logo("burgerking.com.tw"),
    amenity: "fast_food",
    outlets: [
      o("3", "Floor 3", "airside", "06:00-23:00", false),
      o("-1", "Floor -1", "landside", "05:45-21:00", false),
    ],
  }),
  comeme: restaurant({
    name: "COMEME",
    cuisine: "Dessert shop & Bakeries",
    description: "We believe that food is more than just nourishment — it is a bridge that\nconnects cultures, relationships, and emotions.\nTo uphold this belief, we carefully select premium ingredients, craft each\ndessert by hand daily, and maintain the highest standards at every step of the process.\nWe continuously innovate and refine our recipes, striving to create irresistible desserts that bring warmth from the first bite to the heart and soul.\n\nPayment Instrument： EasyCard、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "bakery",
    outlets: [
      o("3", "Floor 3", "airside", " 06:00-22:00", false),
    ],
  }),
  gontran_cherrier: restaurant({
    name: "Gontran Cherrier",
    cuisine: "Dessert shop & Bakeries",
    description: "Born in 1978, Gontran Cherrier, the French chef, has cultivated his skills, quality, and sensitivity by working dedicatedly at high-end restaurants over the past years. In 2010, he established a bakery at the same time as the one in Montmartre, Paris, France. Since then, the bakery has spread rapidly around the world. EVERRICH has introduced the bakery, selling croissants with seasonal flavors and delicious and crunchy tastes at Taoyuan International Airport. Payment Instrument： EasyCard、WeChat、Alipay、HANA、Line、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "bakery",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~20:00", false),
    ],
  }),
  guiji: restaurant({
    name: "Guiji",
    cuisine: "Alcoholic Drinks & Beverage Shops",
    description: "Guiji's slogan, \"Dream Big, Live Fresh.\", reminds us of our core business belief, \"Don't forget our initial intention.\" It reflects the attitude we have maintained since the establishment of our brand. Guiji's diligence and core competence are rooted not only in skills but also in collaboration with numerous local craftsmen who work silently and diligently to produce raw materials.\nThese high-quality raw materials undergo repeated testing and monitoring before being processed into beverages that we proudly serve to our consumers. This exemplifies the results of the meticulous work of local craftsmen, encapsulating Guiji's true core value.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~22:00", false),
    ],
  }),
  hanlin_tea_room: restaurant({
    name: "Hanlin Tea Room",
    cuisine: "Chinese Cuisine",
    description: "World-popular: The Hanlin Tea Room was the first bubble tea store established in 1986, where ingenious creativity stimulated affection for tea beyond just tea fragrances. Bubble tea is chewy, crystal clear, and refreshing. The hometown for the national beverage of Taiwan is the Hanlin Tea Room, which sells all types of set meals and beverages, etc. Payment Instrument： 現金、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    website: "hanlin-tea.com.tw",
    logoUrl: logo("hanlin-tea.com.tw"),
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "landside", "10:00-20:00", false),
    ],
  }),
  homee_kitchen: restaurant({
    name: "hómee KITCHEN",
    cuisine: "Chinese Cuisine",
    description: "homee was named because \"home\" sound like \"taste good\" in Taiwanese, intending to express the aim of serving up tasty food to travelers at the airport. Chinese and Western dishes are served, including set meals; local dishes that are famed around the",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "05:00~23:00", false),
      o("3", "Floor 3", "airside", "05:00~23:00", false),
    ],
  }),
  homee_rice: restaurant({
    name: "Hómee RICE",
    cuisine: "Chinese Cuisine",
    description: "From the moment you arrive at the airport, your journey begins.\nHómee RICE is built on the concept of \"the taste of home.\" Whether you're returning home or traveling abroad, we understand the feelings and expectations of travelers, preparing meals that bring the flavors of your home kitchen to life.\nWe focus on rice-based dishes, each combining classic Taiwanese home flavors with distinctive Asian influences. Our signature dishes include the \" Thick Pork Chop Rice\" and \" Taiwanese Style Hainanese Chicken Rice.\" We carefully select local Taiwanese ingredients to provide airport travelers with a high-quality, diverse dining experience.\nHómee RICE, the taste of home, only at Taoyuan International Airport\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "05:00-23:00", false),
    ],
  }),
  ijysheng: restaurant({
    name: "IJYSHENG",
    cuisine: "Vegetarian Food / Cafés & Light Foods / Dessert shop & Bakeries",
    description: "Using future trend dietary methods to create plant-based baking, reducing the burden on the body and the Earth. We sell all types of bread, souvenirs, coffee and tea beverages, etc. Types of vegetarianism: vegan, lacto-vegetarian, lacto-ovo vegetarian.\n\nPayment Instrument： Cash(NTD), EasyCard, Credit Card, Apple Pay, Andriod Pay, Google Pay, Samsung Pay, Line Pay",
    website: "ijysheng.com",
    logoUrl: logo("ijysheng.com"),
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("-1", "Floor -1", "landside", "05:00-21:30(不定期24小時營業)", false),
    ],
  }),
  juice_bear: restaurant({
    name: "Juice Bear",
    cuisine: "Dessert shop & Bakeries / Alcoholic Drinks & Beverage Shops",
    description: "We sell all types of juices, light food and fruits, etc.\n\nPayment Instrument：\nCash、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    amenity: "cafe",
    outlets: [
      o("-1", "Floor -1", "landside", "07:00-18:00", false),
    ],
  }),
  kafed: restaurant({
    name: "kafeD",
    cuisine: "Cafés & Light Foods",
    description: "The first cup of coffee you must drink in Taiwan! kafeD use coffee beans from world estates to bring you a variety of coffee flavor, aroma and tastes.\n“Precise drops, perfect cups” is our highest pursuit of coffee.",
    amenity: "cafe",
    outlets: [
      o("1", "Floor 1", "landside", "09:30-20:00", false),
    ],
  }),
  korean_cuisine: restaurant({
    name: "Korean Cuisine",
    cuisine: "Japanese & Korean Cuisine / Vegetarian Food",
    description: "We sell all types of Korean cuisine and vegetarian set meals. Payment Instrument： Cash、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("-1", "Floor -1", "landside", "09:30-21:30", false),
    ],
  }),
  l_e_a_f_cafe: restaurant({
    name: "L.E.A.F CAFÉ",
    cuisine: "Cafés & Light Foods / Dessert shop & Bakeries",
    description: "\"L.E.A.F CAFE\" derives from the combination of four words \"LIFE\", \"ENJOY\", \"AWESOME\" and \"FLAVOR\", each of which carries the brand spirit we want to convey. Whenever you visit \"L.E.A.F\", you can have a cup of good coffee and meals, allowing our customers to enjoy life freely. We mainly sell simple light snacks, pastries, hand brewed and regular coffee. We also have a variety of exquisite meals that you can enjoy while waiting for your flight.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "00:00~24:00", true),
      o("3", "Floor 3", "airside", "05:00-23:00", false),
    ],
  }),
  lao_dong_beef_noodles: restaurant({
    name: "Lao Dong Beef Noodles",
    cuisine: "Chinese Cuisine",
    description: "Payment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card(VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover)、Apple/Google/Samsung pay",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "06:00-23:00", false),
    ],
  }),
  le_mout: restaurant({
    name: "Le Moût",
    cuisine: "Dessert shop & Bakeries",
    description: "Le Moût is a brand that signifies the eternal pursuit of perfection. It has been selected as one Asia’s 50 best, and awarded best restaurant in Taiwan for 4 years consecutively.\nAs a continuation of the spirit of Le Moût, Chef Lanshu Chen established the Le Moût Pâtisserie Boulangerie.\nApplying her passion for absolute gourmet taste to bread, she selects the best ingredients, to produce the best handmade French style bread.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "bakery",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~21:00", false),
    ],
  }),
  mos_burger: restaurant({
    name: "Mos Burger",
    cuisine: "Vegetarian Food / Fast Food Restaurants",
    description: "Since its establishment in 1990, An-shin Food Services Co., Ltd. has introduced MOS BURGER, one of the leading brands in the Japanese restaurant industry. It operates branch stores in Taiwan, where provide comfortable seats, clean environments, and delicious on-demand meals, allowing customers to feel happiness! Mos Burger hopes to provide delicious, safe, and healthy meals to everyone with sincere and friendly service. Payment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Samsung Pay, UnionPay Card, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS, JKOPAY, icash.",
    website: "mos.com.tw",
    logoUrl: logo("mos.com.tw"),
    amenity: "fast_food",
    vegetarian: true,
    outlets: [
      o("3", "Floor 3", "landside", "05:30-21:00(不定期24小時營業)", false),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks",
    cuisine: "Cafés & Light Foods",
    description: "Tracing its roots back to Seattle’s Pike Place Market, Starbucks opened its first Taipei store in 1998. Committed to sourcing the world’s finest Arabica beans, the brand ensures each cup is roasted and brewed to perfection, then served in a space that feels truly like home. By blending warm hospitality with a unique coffee culture, Starbucks has established the “Third Place” - a retreat between home and work. With uncompromising standards for both beverage quality and ambiance, Starbucks continues to define a lifestyle where aesthetics meet excellence.\n\nPayment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Samsung Pay, UnionPay Card, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS",
    website: "starbucks.com.tw",
    logoUrl: logo("starbucks.com.tw"),
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3; 05:30-19:00(Weekend)", "landside", "05:30~20:00", false),
    ],
  }),
  subway: restaurant({
    name: "SUBWAY",
    cuisine: "Cafés & Light Foods / Fast Food Restaurants",
    description: "The largest chain store submarine sandwich brand in the world. Payment Instrument： Cash、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    amenity: "fast_food",
    outlets: [
      o("1", "Floor 1", "landside", "11:00-20:00(週四休)", false),
    ],
  }),
  sunmai_bar: restaurant({
    name: "SUNMAI BAR",
    cuisine: "Fast Food Restaurants / Alcoholic Drinks & Beverage Shops / Cafés & Light Foods",
    description: "Le Ble D’or – a renowned Taiwanese brand that has won several medals in international contests, is famous for its craft beer. It is also the first concept restaurant at the airport that EVERRICH has ever collaborated with. With a modern and fashionable design, it presents beers with wheat, rye, and honey flavors. It also serves beers with new and seasonal flavors to allow travelers to enjoy the topsy-turvy and festival mood at the airport. Payment Instrument： EasyCard、iPASS、WeChat、Alipay、HANA、Line、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "bar",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~23:00", false),
    ],
  }),
  taiwan_snack: restaurant({
    name: "Taiwan Snack",
    cuisine: "Chinese Cuisine",
    description: "Taiwan Snacks: Taiwanese fried chicken, all types of deep-fried food, bubble tea, and sausage in sticky rice rolls, etc. Payment Instrument： 現金、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    amenity: "restaurant",
    outlets: [
      o("-1", "Floor -1", "landside", "11:00~20:00", false),
    ],
  }),
  the_creative_cuisine_of_southeast_asia: restaurant({
    name: "The creative cuisine of southeast asia",
    cuisine: "Southeast Asian Cuisine",
    description: "We sell Southeast Asia flavor creative cuisine and hotpots, set meals, etc. Payment Instrument： Cash、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    amenity: "restaurant",
    outlets: [
      o("-1", "Floor -1", "landside", "10:00-21:30(不定期24小時營業)", false),
    ],
  }),
  tkk_fried_chicken_x_kung_fu_tea: restaurant({
    name: "TKK Fried Chicken x KUNG FU TEA",
    cuisine: "Fast Food Restaurants",
    description: "Founded in 1974, the restaurant has maintained the same delicious taste for 50 years, with fresh chicken meat freshly slaughtered and delivered within 72 hours, locking in the phenomenal tastiness of the chicken. Enjoy the familiar classic \"TKK Bun\" with nostalgic taste.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line、Jko pay、Credit Card ( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "fast_food",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~23:00", false),
    ],
  }),
  wing_cafe: restaurant({
    name: "Wing Café",
    cuisine: "Cafés & Light Foods",
    description: "Wing Café - where the wings symbolize taking off into the skies to the promise of good scenery. Stop over at Wing Café and savor light bites of sandwiches and confectionaries. Relax in the comforting warmth where the air emanates the fragrance of hand-dripped coffee. Revel in the moment of tranquility and embark on your next journey.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card(VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover)、Apple/Google/Samsung pay",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "24hr", false),
    ],
  }),
  yo_kai_express: restaurant({
    name: "Yo-Kai Express",
    cuisine: "Japanese & Korean Cuisine",
    description: "Yo-Kai Express pioneered and is at the forefront of food technology with the simple vision of providing delicious meals on demand anytime and anywhere without lowering food quality or restrictions. Collaborating with Globally recognized food partners to introduce food without boundaries. Yo-Kai Express is the crowd favorite at, Hotels, Airports, Train Stations, Universities, Fortune 500 HQ Offices, Shopping Malls, Tea Shops, Ski Resorts, Hospitals, Casinos, Rest Areas, and Manufacturing Facilities.\n\nPayment Instrument： EasyCard、Credit Card(VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover)、Apple Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、JKOPAY",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "00:00-24:00", true),
      o("3", "Floor 3", "airside", "00:00-24:00", true),
    ],
  }),
  venue_5f0cffcb: restaurant({
    name: "三商巧福",
    cuisine: "Chinese Cuisine",
    description: "",
    amenity: "restaurant",
    outlets: [
      o("-1", "Floor -1", "landside", "09:30-21:30", false),
    ],
  }),
  venue_30303679: restaurant({
    name: "台北中東料理坊",
    cuisine: "Halal Cuisine",
    description: "",
    amenity: "restaurant",
    halal: true,
    outlets: [
      o("-1", "Floor -1", "landside", "09:00-17:00", false),
    ],
  }),
  venue_c21192d8: restaurant({
    name: "壱力麵屋本舖",
    cuisine: "Japanese & Korean Cuisine",
    description: "Originating from Aichi Prefecture, Ichiriki Menya Honpo was founded by Dime Co., Ltd., inheriting the true spirit of Japanese culinary craftsmanship.\nEvery bowl of noodles and every dish we serve is crafted with dedication — from carefully simmered broths and house-made noodles to carefully selected ingredients and hand-prepared side dishes. What we offer is not only flavor, but also warmth and sincerity.\nIn 2025, Ichiriki Menya Honpo opens its very first overseas branch at the Food Court of Taoyuan International Airport Terminal 1. Beyond our signature ramen, we also bring a variety of beloved Japanese flavors, including curry rice, donburi, and set meals. Whether you are about to embark on a journey or returning home, we hope to provide every guest with comfort, satisfaction, and a fulfilling dining experience.\n\nPayment Instrument：Cash, Credit Card, UnionPay Card, Apple/ Andriod/ Google/ Samsung Pay, Line Pay, Alipay, WeChat, EasyCard, iPASS, Pi, GAMA PAY, icash",
    amenity: "restaurant",
    outlets: [
      o("-1", "Floor -1", "landside", "10:00-20:30", false),
    ],
  }),
};

// ─── Terminal 2 venues ──────────────────────────────────────────────────

const terminal2Venues = {
  _7_11: restaurant({
    name: "7-11",
    cuisine: "Convenience Stores",
    description: "convenience store Payment Instrument： Cash (NTD)、Credit Card、UnionPay Card、Apple Pay、Google Pay、Samsung Pay、Line Pay、Taiwan Pay、OpenPoint、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、icash EasyCard",
    website: "7-11.com.tw",
    logoUrl: logo("7-11.com.tw"),
    amenity: "convenience_store",
    outlets: [
      o("5", "Floor 5", "landside", "00:00~24:00", true),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King",
    cuisine: "Fast Food Restaurants",
    description: "Burger King was founded in 1954. It is globally the second largest fast-food chain store brand, and is famous for providing customers with quality products and delicious meals at rational prices. American-style grilled burger, fries and chicken nuggets, etc.\n\nPayment Instrument： Cash、Foreign Currencies、Credit Card、UnionPay Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、EasyCard、iPASS、JKOPAY、Pi、GAMA PAY、icash",
    website: "burgerking.com.tw",
    logoUrl: logo("burgerking.com.tw"),
    amenity: "fast_food",
    outlets: [
      o("4", "Floor 4", "landside", "06:00-21:00", false),
    ],
  }),
  burger_land: restaurant({
    name: "Burger Land",
    cuisine: "Alcoholic Drinks & Beverage Shops / Western Cuisine / Cafés & Light Foods",
    description: "Burger Land is a Taiwanese local brand located beside Gate D7 in Terminal 2 of Taoyuan International Airport. It specializes in serving Wagyu beef burgers and signature breads paired with a variety of fried sides, Taiwanese teas, and beverages from local Taiwanese brands. By blending the island’s cultural essence with refined flavors, Burger Land offers travelers quick yet delicious Western-style cuisine.",
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~22:00", false),
    ],
  }),
  c_est_bon_cafe: restaurant({
    name: "C’est Bon Café",
    cuisine: "Dessert shop & Bakeries / Cafés & Light Foods",
    description: "C’est Bon Cafe, run by Chengmeng, is committed to providing an elegant and comfortable environment. The warm and bright atmosphere makes it easy for travelers to enjoy delicious meals and pure coffee aromas. Payment Instrument： Cash (NTD)、Credit Card",
    website: "chengmeng.com.tw",
    logoUrl: logo("chengmeng.com.tw"),
    amenity: "cafe",
    outlets: [
      o("1", "Floor 1", "landside", "05:00~23:00", false),
    ],
  }),
  chengmeng: restaurant({
    name: "Chengmeng",
    cuisine: "Cafés & Light Foods / Chinese Cuisine",
    description: "Chengmeng offers authentic Hong Kong-style meals and snacks for consumers to taste. It carefully selects ingredients, so signature roasted meat, pork dumplings (Siu Mai), black gold taro buns, radish cakes, red date, and white fungus so\n\nPayment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Line Pay, Samsung Pay, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS, UnionPay Card",
    amenity: "cafe",
    outlets: [
      o("1", "Floor 1", "landside", "07:00-20:00", false),
    ],
  }),
  chinese_herb_rib_stew: restaurant({
    name: "Chinese Herb Rib Stew",
    cuisine: "Chinese Cuisine",
    description: "Tender rib stew slow-cooked with natural herbs—nourishing and delicious.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "10:00-20:00", false),
    ],
  }),
  comebuytea: restaurant({
    name: "COMEBUYTEA",
    cuisine: "Alcoholic Drinks & Beverage Shops",
    description: "COMEBUYTEA brings to you the most professional, innovative and the freshest Taiwanese tea beverages with up-to-date and cutting-edge tea grinder and Teapresso machine. You will be able to find a cup of fine tea that suits your preference here. COMEBUYTEA is doubtlessly the first stop to start your gourmet journey in Taiwan.\n\nPayment Instrument：Cash (NTD)、Credit Card、Apple Pay、Android Pay、Google Pay、Samsung Pay、EasyCard",
    amenity: "cafe",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00~21:00", false),
    ],
  }),
  d3_bar: restaurant({
    name: "D3 Bar",
    cuisine: "Alcoholic Drinks & Beverage Shops / Western Cuisine / Cafés & Light Foods",
    description: "The brunch counter, run by Chengmeng, offers American brunch, light cakes, soft drinks, beer, and other dining options. There are still halal foods, Taiwanese-style beef noodles, and pure fruit juice popsicles, offering travelers a variety of options",
    website: "chengmeng.com.tw",
    logoUrl: logo("chengmeng.com.tw"),
    amenity: "bar",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~23:00", false),
    ],
  }),
  familymart: restaurant({
    name: "FamilyMart",
    cuisine: "Convenience Stores",
    description: "Based on the business philosophy “Customer satisfaction first! Grow together with our customers!”, FamilyMart Convenience Store originated in Japan has successfully developed deep roots in Taiwan.\n\nPayment Instrument：\nCash (NTD)、Credit Card、Apple Pay、Google Pay、Samsung Pay、Alipay、WeChat、EasyCard",
    website: "family.com.tw",
    logoUrl: logo("family.com.tw"),
    amenity: "convenience_store",
    outlets: [
      o("5", "Floor 5", "landside", "00:00~24:00", true),
    ],
  }),
  gentry_noodle: restaurant({
    name: "Gentry Noodle",
    cuisine: "Vegetarian Food / Chinese Cuisine",
    description: "A Bowl of Chicken Soup Noodle: A Taste of Refined Living.\n\nThe Shilin-based sensation, Gentry Noodle, has officially arrived at Taoyuan International Airport! We are proud to bring our signature, soul-warming Jinhua Ham Chicken Soup to travelers from around the world.\nOur signature broth is simmered for eight hours using old hens, Jinhua ham, and dried scallops, resulting in a rich, naturally sweet flavor. Paired with sous-vide meats that are flame-seared to perfection and a colorful array of fresh vegetables, every bite offers a tender, succulent, and premium experience.\n\nDon't miss our fan-favorite Grilled Beef Tendon Rice—crispy on the outside, tender on the inside. Mix it with our signature spicy sauce for an irresistibly savory kick.\n\nAt Gentry Noodle, we specialize in refreshing, mellow broths. Before you take flight, treat yourself to a steaming bowl of chicken soup and savor a \"gentleman-class\" feast filled with warmth and heart.",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("4", "Floor 4", "landside", "05:00-22:00", false),
    ],
  }),
  hanlin_tea_house: restaurant({
    name: "Hanlin Tea House",
    cuisine: "Fast Food Restaurants",
    description: "Founded in 1986, Hanlin is renowned for inventing the world’s first bubble milk tea, where chewy tapioca pearls are blended with rich, aromatic milk tea, which introduced a brand-new “drink and chew” experience. In addition, its Japanese-style oden featuring broth prepared with golden clams and signature spicy taste allows the food ingredients to fully absorb both delicate sweetness and savory spiciness, not only satisfying the palate, but further embodies the happiness and warmth of everyday life, thereby showcasing the delicacy and charisma of Taiwanese food culture.\n\nEasyCard、Credit Card(VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover)、Apple Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、JKOPAY",
    amenity: "fast_food",
    outlets: [
      o("4", "Floor 4", "airside", "06:00~22:00", false),
    ],
  }),
  hao_hao_chi: restaurant({
    name: "Hao Hao Chi",
    cuisine: "Chinese Cuisine",
    description: "We care about all the cuisine steps and details to perform the high quality dishes for every customers. Each of dishes perform「thin wonton dough, very fresh meat and tasty clear soup」we called it 好好吃大餛飩 Hao Hao Chi Da Wonton.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "05:00~23:00", false),
    ],
  }),
  homee_kitchen: restaurant({
    name: "hómee KITCHEN",
    cuisine: "Chinese Cuisine",
    description: "The name “hómee” is inspired by the Taiwanese pronunciation of “hó-bī” (meaning “delicious”), reflecting our commitment to serving flavorful dishes to travelers. The menu features a selection of Taiwanese local specialties, offering an authentic taste of Taiwan and creating a memorable culinary impression of its food culture.\n\nPayment: EasyCard、Credit Card(VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover)、Apple Pay、Google Pay、Samsung Pay、Line Pay、Alipay、WeChat、JKOPAY",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4", "airside", "06:00-23:00", false),
    ],
  }),
  hong_master_danzai_noodles: restaurant({
    name: "Hong Master Danzai Noodles",
    cuisine: "Chinese Cuisine",
    description: "During the Qing Dynasty's Guangxu era (around 1895 AD), a man named Hong was known as Hong Yutou Gong in Tainan, the provincial capital of Taiwan. He had the privilege of learning the culinary arts from a renowned master and dedicated himself to perfecting them. He used pork to create minced meat sauce, which he served on noodles, accompanied by shrimp broth, garlic paste, black vinegar, and other seasonings. This resulted in an exquisite and popular dish called \"Danzai Noodles\". Hong became recognized as the founding master of Danzai Noodles throughout Taiwan, and later generations respectfully referred to him as \"Master Hong\" to honor his significant contribution to Taiwanese cuisine. This is the origin of the \"Hong Master\" brand.\n\nOur restaurant uses top-quality rice from Taiwan's Hualien region, local pork, seafood, eggs, and domestically produced pure soy sauce from reputable brands. We insist on using genuine ingredients to create authentic and delicious broth.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00~20:00", false),
    ],
  }),
  ijysheng: restaurant({
    name: "IJYSHENG",
    cuisine: "Vegetarian Food / Cafés & Light Foods / Dessert shop & Bakeries",
    description: "Using future trend dietary methods to create plant-based baking, reducing the burden on the body and the Earth. We sell all types of bread, souvenirs, coffee and tea beverages, etc. Types of vegetarianism: vegan, lacto-vegetarian, lacto-ovo vegetarian.\n\nPayment Instrument： Cash(NTD), EasyCard, Credit Card, Apple Pay, Andriod Pay, Google Pay, Samsung Pay, Line Pay",
    website: "ijysheng.com",
    logoUrl: logo("ijysheng.com"),
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("-2", "Floor -2", "landside", "06:00 - 21:30", false),
    ],
  }),
  i_mei_classic_restaurant: restaurant({
    name: "I-MEI CLASSIC RESTAURANT",
    cuisine: "Chinese Cuisine",
    description: "I-Mei Foods established in 1934, has dedicated itself to providing the highest-quality foods.\nGiven this principle of, “Food as Medicine,” the company has safeguarded consumer health by performing rigorous tests at its laboratories, in order to produce safe and nutritious food products. Today, I-Mei’s food products are available around the world.\nBeef Noodle is one of the signature dishes at I-Mei Classic Restaurant, which selects Australian beef shank and simmers beef bones with fresh vegetables and fruit to cook a broth base. The savory broth goes perfectly with the chewy but substantial noodles. No monosodium glutamate is added.\nIn addition to the classic Beef Noodle, braised pork rice and braised pork belly with pickled vegetables are Taiwan specialties you won’t want to miss.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "07:00~21:00", false),
    ],
  }),
  j_g_fried_chicken: restaurant({
    name: "J&G Fried Chicken",
    cuisine: "Fast Food Restaurants",
    description: "Inheriting a legacy of 50 years as the premier fried chicken brand in Taiwan, we marinate fresh chicken with a unique blend of over a dozen exclusive spices. Our signature pepper-salt seasoning is generously sprinkled on our irresistibly crispy and juicy fried chicken, creating an unparalleled and delectable taste experience that must be savored.",
    amenity: "fast_food",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00-22:00", false),
      o("3", "Floor 3", "airside", "07:00-23:00", false),
    ],
  }),
  jin_xian_platinum_braised_pork_rice: restaurant({
    name: "Jin Xian Platinum Braised Pork Rice",
    cuisine: "Chinese Cuisine",
    description: "Jinxian Platinum selects only quality ingredients, slowly braising our signature pork to create a rich, delicate flavor. Paired with fluffy rice and classic Taiwanese sides, every meal is crafted with heart and depth.\nSince the 1980s, we’ve remained true to traditional methods and authentic tastes, winning the hearts of food lovers. Now at our airport branch, we offer a variety of dishes and familiar Taiwanese flavors to comfort travelers as they depart or return—bringing a warm, memorable dining experience..\n\nPayment Instrument：\nCash (NTD)、Credit Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、EasyCard",
    amenity: "restaurant",
    outlets: [
      o("5", "Floor 5", "landside", "11:00~19:00", false),
      o("3", "Floor 3", "airside", "00:00~24:00", true),
    ],
  }),
  lao_dong_beef_noodles: restaurant({
    name: "Lao Dong Beef Noodles",
    cuisine: "Chinese Cuisine",
    description: "Payment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Line Pay, Samsung Pay, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS, UnionPay Card",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4", "airside", "05:00~22:30", false),
    ],
  }),
  lao_tao_eatery: restaurant({
    name: "LAO TAO EATERY",
    cuisine: "Dessert shop & Bakeries / Alcoholic Drinks & Beverage Shops / Cafés & Light Foods",
    description: "\"The more you know about food, the more selective you become. A true gourmet never settles.\"\n\nThe warmth on a Taiwanese dining table often stems from a pure obsession with ingredients—whether it's Honey Glazed Chashu, Slow-Braised Meatballs, or Flat Iron Steak. At LAO TAO EATERY, we pursue high-quality cuts and celebrate local flavors, striving to satisfy the palate of every discerning customer.\n\nFrom sourcing the finest ingredients to the art of cooking, we care about every detail. Our dedication to culinary excellence is our way of offering a gentle, heartfelt reception to every guest.",
    amenity: "cafe",
    outlets: [
      o("4", "Floor 4", "landside", "06:00-22:00", false),
    ],
  }),
  le_mout: restaurant({
    name: "Le Moût",
    cuisine: "Dessert shop & Bakeries",
    description: "Le Moût is a brand that signifies the eternal pursuit of perfection. It has been selected as one Asia’s 50 best, and awarded best restaurant in Taiwan for 4 years consecutively.\nAs a continuation of the spirit of Le Moût, Chef Lanshu Chen established the Le Moût Pâtisserie Boulangerie.\nApplying her passion for absolute gourmet taste to bread, she selects the best ingredients, to produce the best handmade French style bread.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "bakery",
    outlets: [
      o("3", "Floor 3", "airside", "00:00~24:00", true),
    ],
  }),
  lin_dong_fang_beef_noodles: restaurant({
    name: "LIN DONG FANG BEEF NOODLES",
    cuisine: "Chinese Cuisine",
    description: "For the past 40 years, founder Mr Lin, Dong Fang has never stopped searching for the perfect balance in his braised beef dishes. Like a movie director, he makes sure that the quantity and quality of the supporting characters complement but do not overshadow the main character – the beef, which should retain its original lusciousness. The soup base, a combination of a clear and braised broth, has a clean and fragrant taste and yet is rich and flavorful. The Lin, Dong Fang firmly believes that a true and sincere taste brings comfort to a person. A traditional taste that originated half a century ago lives on today. The Tao Yuan Airport outlet presents a limited edition of the beef short ribs noodle set. Let our beef noodles melt away the international boundaries. Payment Instrument： EasyCard、iPASS、WeChat、Alipay、HANA、Line、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4", "airside", "05:00~23:00", false),
    ],
  }),
  lou_zhang_muslim_beef_restaurant: restaurant({
    name: "Lou Zhang Muslim Beef Restaurant",
    cuisine: "Halal Cuisine",
    description: "Established in 1950, Lao Zhang Halal Beef Noodles has insisted on serving delicious beef noodles. Insisting on hygiene and food safety, it always selects Halal beef. Recommended by Taipei City Government, its mellow and tasty beef soup is cooked with beef bones and homemade recipe from the ancestors\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "restaurant",
    halal: true,
    outlets: [
      o("3", "Floor 3", "airside", "05:00~23:00", false),
    ],
  }),
  mata_tofu_pudding: restaurant({
    name: "Mata Tofu Pudding",
    cuisine: "Dessert shop & Bakeries",
    description: "Taitung, the serene coastal city often called the backyard of Taiwan, is the cherished birthplace of Mata Tofu Pudding. Inspired by the region`s lush landscapes and pure ocean breeze, our co-founders, Ating and Yoshi, crafted this delicate treat by blending fresh, locally sourced ingredients with time-honored traditional methods.\n\nEach bowl captures the gentle essence of Taiwan – wholesome, natural, and beautifully simple. Through this healthy, vegan indulgence, Ating and Yoshi hope to share a taste of Taiwan`s warmth and harmony with everyone who takes a bite.\n\nThoroughly crafted, gently steamed, and made with love – a little sweetness to brighten your day, one smile at a time.",
    amenity: "bakery",
    outlets: [
      o("4", "Floor 4", "landside", "06:30~22:00", false),
    ],
  }),
  mazuvillage: restaurant({
    name: "Mazuvillage",
    cuisine: "Alcoholic Drinks & Beverage Shops",
    description: "Hand shake beverage, wheel cakes, Guabao(Pork Belly Buns). These refreshing tea drinks are created using premium tea leaves sourced from across the globe and fresh seasonal fruits and milk.\nThe most popular and delicious Taiwanese snacks that every traveler should try in Taiwan.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~22:00", false),
      o("3", "Floor 3", "airside", "06:00~22:00", false),
    ],
  }),
  mcdonalds: restaurant({
    name: "McDonalds",
    cuisine: "Fast Food Restaurants",
    description: "McDonald's is the world's largest fast food service restaurant brand. With nearly 36,000 restaurants in over 100 countries worldwide, it serves customers with value-packed, delicious McDonald's meals every day. To learn more about McDonald's and its latest products, please visit the McDonald's Taiwan website.\n\nPayment methods: Cash (TWD), EasyCard, credit cards, Apple Pay, Android Pay, Google Pay, Samsung Pay",
    website: "mcdonalds.com.tw",
    logoUrl: logo("mcdonalds.com.tw"),
    amenity: "fast_food",
    outlets: [
      o("-2", "Floor -2", "landside", "00:00~24:00", true),
      o("4", "Floor 4", "airside", "06:00~23:00", false),
    ],
  }),
  mi_solo_yakiniku: restaurant({
    name: "Mi Solo Yakiniku",
    cuisine: "Japanese & Korean Cuisine / Chinese Cuisine",
    description: "Enjoy a Personalized Yakiniku Experience, perfect for Solo Dining or Sharing with Family and Friends\nWith our self-service tablet system for ordering, pick-up, returns, and payment, you can enjoy a seamless dining experience without any cleaning service charge. Each session lasts 80 minutes and includes unlimited complimentary side dishes and access to the beverage bar.\n\nWe offer a comfortable dining environment and take pride in our carefully selected premium chilled aged beef, odor-free local probiotic pork, and freshly caught seafood delivered directly from Penghu. All ingredients are strictly managed and processed in our HACCP-certified central kitchen. Paired with our signature white salt, fruity dipping sauce, and high-quality side dishes, every bite is a taste of refinement and care.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00-21:00", false),
    ],
  }),
  moonmoonfood: restaurant({
    name: "MOONMOONFOOD",
    cuisine: "Chinese Cuisine",
    description: "The premier brand of Chinese soups.\nMichelin Bib Gourmand has recommended.\nOur culinary philosophy is promoting health and authenticity through the selection of high-quality local ingredients from Taiwan.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4", "airside", "06:00~23:00", false),
    ],
  }),
  mos_burger: restaurant({
    name: "Mos Burger",
    cuisine: "Vegetarian Food / Fast Food Restaurants",
    description: "Since its establishment in 1990, An-shin Food Services Co., Ltd. has introduced MOS BURGER, one of the leading brands in the Japanese restaurant industry. It operates branch stores in Taiwan, where provide comfortable seats, clean environments, and delicious on-demand meals, allowing customers to feel happiness! Mos Burger hopes to provide delicious, safe, and healthy meals to everyone with sincere and friendly service. Payment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Samsung Pay, UnionPay Card, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS, JKOPAY, icash.",
    website: "mos.com.tw",
    logoUrl: logo("mos.com.tw"),
    amenity: "fast_food",
    vegetarian: true,
    outlets: [
      o("4", "Floor 4", "landside", "06:00~22:00", false),
      o("4", "Floor 4", "airside", "05:00-22:00", false),
    ],
  }),
  pine_korean_restaurant: restaurant({
    name: "PINE KOREAN Restaurant",
    cuisine: "Japanese & Korean Cuisine",
    description: "【PINE KOREAN Restaurant】It is an exquisite Korean restaurant founded in 2010. The special dishes include the crispy and moist bibimbap series, the tender tofu soup series cooked slowly on low heat, as well as single items such as oba fried chicken and spicy fried rice cakes.\nDelicious and vibrant food, enjoy the joy of travel!\n\nPayment methods include：cash (TWD), credit card, Apple Pay, Android Pay, Google Pay, Samsung Pay, and Easy Card.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00~21:00", false),
    ],
  }),
  pizza_creafe: restaurant({
    name: "Pizza CreAfe'",
    cuisine: "Western Cuisine",
    description: "PizzaCreAfe’ uses fresh and local ingredients, including fresh neritic squid directly from the Badouzi Fishing Port, delicate duck from Cherry Valley, Ilan, pearl pork, grown up with music from Yunlin, and kiln oven from Morello Forni, Italy, fresh dough made with Beiyi natural flour, and assorted variety Mediterranean grilled chicken, pasta and risotto. Payment Instrument： Cash (NTD)、Credit Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、EasyCard",
    website: "pizzacreafe.oddle.me",
    logoUrl: logo("pizzacreafe.oddle.me"),
    amenity: "restaurant",
    outlets: [
      o("5", "Floor 5", "landside", "11:00~15:00 16:00~21:00", false),
    ],
  }),
  ramen_iroha: restaurant({
    name: "RAMEN IROHA",
    cuisine: "Japanese & Korean Cuisine",
    description: "Ramen Iroha originates from Toyama Prefecture in Japan and was founded by Kiyoshi Kurihar, in 1992. It has been the five-time champion at Japan's largest outdoor ramen event, the Tokyo Ramen Show, since 2009. Black soy sauce ramen its signature dish.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "07:30-21:30", false),
      o("5", "Floor 5; Business Hours in Weekend: 10:00-20:00", "landside", "10:30-19:30", false),
    ],
  }),
  ramen_makotoya: restaurant({
    name: "Ramen Makotoya",
    cuisine: "Japanese & Korean Cuisine",
    description: "Makotoya, from Osaka, is founded with its tenet “ Presenting the same taste, quality and appraise as Japanese ramen to the people in Taiwan”. This means that Makotoya is dedicated to become the most-favored ramen restaurant in Taiwan. Makotoya is also ambitious to be No1. In Asia by providing a more approachable ramen to the diners, instead of a high-threshold price. There will be more branches opened around Taiwan and hopefully blends into Taiwan’s culture. Makotoya aims to not only warms visitors with a bowl of rich beef/pork broth and chewy ramen noodle, but also brings the great Ramen culture to the people from around the world.",
    amenity: "restaurant",
    outlets: [
      o("5", "Floor 5", "landside", "11:00~15:00,17:00~21:00", false),
    ],
  }),
  royal_house: restaurant({
    name: "Royal-House",
    cuisine: "Chinese Cuisine",
    description: "Founded in 1993, Royal-House participated in the Taipei International Beef Noodle Festival, placing 1st in both Braised and Clear stewed categories. Moreover, we have passed HACCP and ISO22000 Certifications. With professional skills, we made the native cuisine – beef noodles have been perfect. Holding the costumer-first principle, we put our loving, patience and attention into every dishes. Making every customers feel warm and comfortable.\n\nPayment Instrument： Cash (NTD)、Credit Card、Apple Pay、Andriod Pay、Google Pay、Samsung Pay、EasyCard",
    website: "royal-beefnoodles.com",
    logoUrl: logo("royal-beefnoodles.com"),
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4; Business Hour: Mon~Sun.", "landside", "07:00-21:00", false),
      o("-2", "Floor -2; Business Day: Mon~Sat", "landside", "11:00~19:00", false),
    ],
  }),
  second_master_young_young_bak_kut_teh: restaurant({
    name: "Second Master& Young Young Bak Kut Teh",
    cuisine: "Chinese Cuisine",
    description: "In this fast-paced life, a bowl of good soup and noodles brings simple joy.\n\nAt SecondMaster, we honor Taiwan’s street food with humble noodles full of homey flavors and warmth. Fast, affordable, and tasty — that’s our promise. We may not be perfect, but we always strive to be part of your meals.\n\nYoung Young Bak Kut Teh is inspired by Southeast Asia. Made with premium white pepper and pork ribs, slow-cooked with herbs like goji berries, angelica, star anise, and cinnamon, it creates a rich and fragrant broth.\n\nWhen Taiwanese tradition meets Southeast Asian spices, it’s a cultural blend. We believe a hot bowl connects beyond taste — it bridges time and place.\n\nLet’s journey together, one meal at a time.\n\nAccepted Payment Methods:Cash (TWD), EasyCard, Credit Cards, Apple Pay, Android Pay, Google Pay, Samsung Pay, Line Pay",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4", "landside", "07:00-21:00", false),
    ],
  }),
  shu_sheep_a_bowl_of_lamb: restaurant({
    name: "Shu Sheep a Bowl of Lamb",
    cuisine: "Chinese Cuisine",
    description: "Shu Sheep’s mutton, whether it is mutton slices, mutton short ribs or mutton hamstrings, is cooked through the unique angelica soup.\nThe dish is carefully slow-cooked with private Chinese medicine bags. The taste is fresh and tender, while the ingredients are rich and substantial.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "10:00~20:00", false),
    ],
  }),
  sky_elephant_thai_restaurant: restaurant({
    name: "Sky Elephant Thai Restaurant",
    cuisine: "Southeast Asian Cuisine",
    description: "Sky Elephant Thai Restaurant was opened in Tainan in 2011. It is the latest masterpiece launched by Tainan's well-known snack Zhou's Shrimp Roll Catering Group, following Hong Ding Shark's Fins Restaurant. The restaurant is named because elephants pl.\nPayment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Line Pay, Samsung Pay, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS, UnionPay Card",
    website: "chengmeng.com.tw",
    logoUrl: logo("chengmeng.com.tw"),
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "06:00~22:30", false),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks",
    cuisine: "Cafés & Light Foods",
    description: "Tracing its roots back to Seattle’s Pike Place Market, Starbucks opened its first Taipei store in 1998. Committed to sourcing the world’s finest Arabica beans, the brand ensures each cup is roasted and brewed to perfection, then served in a space that feels truly like home. By blending warm hospitality with a unique coffee culture, Starbucks has established the “Third Place” - a retreat between home and work. With uncompromising standards for both beverage quality and ambiance, Starbucks continues to define a lifestyle where aesthetics meet excellence.\n\nPayment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Samsung Pay, UnionPay Card, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS",
    website: "starbucks.com.tw",
    logoUrl: logo("starbucks.com.tw"),
    amenity: "cafe",
    outlets: [
      o("5", "Floor 5", "landside", "07:00~20:00", false),
      o("4", "Floor 4", "landside", "05:30-22:00", false),
      o("-2", "Floor -2", "landside", "07:00~20:00", false),
      o("4", "Floor 4", "airside", "05:30~23:00", false),
      o("3", "Floor 3", "airside", "05:30~22:00", false),
    ],
  }),
  tasameng_chun_shui_tang: restaurant({
    name: "Tasameng- Chun Shui Tang",
    cuisine: "Chinese Cuisine / Dessert shop & Bakeries / Alcoholic Drinks & Beverage Shops",
    description: "Chun Shui Tang is the birthplace of hand-shaken cold drinks culture. Established in 1983, it broke through the traditional concept of tea drinking and pioneered the world's first foam black tea shaken with a cocktail shaker. In 1987, it invented iconic bubble milk tea, creating a new trend in cold tea drinks and leading the revolutionary tea culture of the era.\nPayment Instrument：Cash(NTD)、Credit Card、Apple Pay、Android Pay、Google Pay、Samsung Pay、EasyCard、IPASS、LINE Pay、Taiwan Pay、Taishin Pay、Alipay、WeChat Pay",
    amenity: "cafe",
    outlets: [
      o("4", "Floor 4", "airside", "06:00~22:00", false),
    ],
  }),
  tasameng_simple_kaffa: restaurant({
    name: "Tasameng- Simple Kaffa",
    cuisine: "Alcoholic Drinks & Beverage Shops / Dessert shop & Bakeries / Cafés & Light Foods",
    description: "Founded by the World Barista Champion 2016, Berg Wu, Simple Kaffa was selected as the “World's Best Coffee Shop” for two consecutive years in 2019 and 2020.The upcoming Simple Kaffa Kiosk in Taoyuan Airport will provide simple yet great coffee for busy travelers to enjoy a moment of world-class coffee time.\nPayment Instrument：Cash(NTD)、Credit Card、Apple Pay、Android Pay、Google Pay、Samsung Pay、EasyCard、IPASS、LINE Pay、Taiwan Pay、Taishin Pay、Alipay、WeChat Pay",
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "05:00-22:00", false),
      o("4", "Floor 4", "airside", "05:00-21:00", false),
    ],
  }),
  tasameng_xiao_nan_men: restaurant({
    name: "Tasameng- Xiao Nan Men",
    cuisine: "Dessert shop & Bakeries / Chinese Cuisine",
    description: "Xiao Nan Men, a famous casual dining restaurant in Taiwan, is known for its homemade sweet silky “Douhua (tofu pudding)”. Made by traditional recipe, and with ginger, boba, or beans, it is definitely a must-try when you come to Xiao Nan Men!\nOther than that, there are also popular local Taiwanese food including \"braised pork rice\", \"migao (Sticky rice with minced pork\", \"Pork thick soup\", and \"xiaolongbao\"…etc.,\nXiao Nan Men – Simply delicious!\n\nPayment Instrument：Cash(NTD)、Credit Card、Apple Pay、Android Pay、Google Pay、Samsung Pay、EasyCard、IPASS、LINE Pay、Taiwan Pay、Taishin Pay、Alipay、WeChat Pay",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4", "airside", "05:00~22:30", false),
    ],
  }),
  the_master_xiao_hun_spicy_noodles_restaurant: restaurant({
    name: "The Master Xiao-Hun Spicy Noodles Restaurant",
    cuisine: "Chinese Cuisine",
    description: "This ordinary bowl of noodles possesses an extraordinary soul that originates from a single drop of Xiao-Hun spicy oil. It is cooked using premium chili peppers, a blend of traditional Chinese medicinal herbs, and fresh vegetables & fruits. With meticulous care, craftsmen devote 8 hours to its preparation, subjecting the spicy oil to repeated filtration to retain only the top 10% essence. The result is the unforgettable \"Soul-Enchanting Spicy Oil,\" also known as Xiao-Hun spicy oil.\n\nDrizzle this aromatic creation over the perfectly mixed, irresistibly chewy handmade noodles, meticulously chosen from a plethora of options. As you take your first bite of the Master's noodles, you will discover that \"soul-enchanting\" transcends being a mere adjective - it becomes an enchanting reality.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00 ~ 21:00", false),
    ],
  }),
  think_curry_house: restaurant({
    name: "THINK CURRY HOUSE",
    cuisine: "Japanese & Korean Cuisine",
    description: "《Cream Omelet X Craftsman Curry》\n\nCustomers can not only \"miss\" the taste, but also \"enjoy\" the enjoyment of food by simmering Japanese curry pieces and vegetables, supporting the notion that \"cooking makes the world warmer\" to please the taste buds of children and adults.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00~19:00", false),
    ],
  }),
  tofu_hot_pot_is_a_new_brand_by_shang_shan_dou_jia: restaurant({
    name: "Tofu Hot Pot is a new brand by Shang Shan Dou Jia.",
    cuisine: "Japanese & Korean Cuisine / Vegetarian Food",
    description: "Moving beyond the typical Korean hot pot style, we focus on authentic Taiwanese flavors in our soups.\nServed with fried dishes and snacks, each meal is designed to be a warm and memorable part of your journey.",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("4", "Floor 4", "airside", "10:00-23:00", false),
    ],
  }),
  tonkatsu: restaurant({
    name: "TONKATSU",
    cuisine: "Japanese & Korean Cuisine",
    description: "As the last two syllables of the term“ pork chop” in Japanese“ 豚カツ” (TonKaTsu) have the same pronunciation as“ 勝つ” (KaTsu) meaning victory, Japanese people often eat pork chops before attending a job interview or taking an exam for good luck. Driven by a feeling of fullness and joy after eating pork chops, things usually go smoothly, whether at a job interview or an exam. This meaning of“ happiness and luck” also became the origin for the name“ 福勝亭” (Tonkatsu)“: 福” (happiness) refers to happy and satisfied customers, while“ 勝” (victory) refers to the good luck brought about from eating pork chops.",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00-21:00", false),
    ],
  }),
  vwi_coffee_bar: restaurant({
    name: "VWI COFFEE BAR",
    cuisine: "Cafés & Light Foods",
    description: "Winning the 2017 World Brewers Cup, Chad chose to come close to the crowd and shares his\npassion and profession towards coffee through his brand and coffeehouse, thus VWI by\nCHADWANG was born.\nWater takes more than 98% in a cup of coffee.\nV - Vapour W - Water I - Ice\nTo name the brand with its three forms - Vapour, Water, Ice, represents the seriousness a barista have\nfor the coffee he/she presenting to people.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "cafe",
    outlets: [
      o("3", "Floor 3", "airside", "05:00~23:00", false),
    ],
  }),
  wang_s_broth: restaurant({
    name: "WANG'S BROTH",
    cuisine: "Chinese Cuisine",
    description: "Founded in 1975, the exclusive Clear Broth Soup with Cucumber and Meat is simmered for six hours in a large bone broth base with canned cucumber sauce to create the best flavor. The Mushroom Braised Pork Rice, another signature dish, offers diners gelatinous tenderness and glimmering shine, known as “black gold braised pork rice”. It is an ever-popular classic night market streetside snack that has been recommended by the Michelin Guide for many years, and is a tasty dish for the common folk, as well as a signature dish for the Wang family of Bangka! Try it out for yourself!\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card( VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover )、Apple/Google/Samsung pay",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "05:00~23:00", false),
    ],
  }),
  wing_cafe: restaurant({
    name: "Wing Café",
    cuisine: "Cafés & Light Foods",
    description: "Wing Café - where the wings symbolize taking off into the skies to the promise of good scenery. Stop over at Wing Café and savor light bites of sandwiches and confectionaries. Relax in the comforting warmth where the air emanates the fragrance of hand-dripped coffee. Revel in the moment of tranquility and embark on your next journey.\n\nPayment Instrument： EasyCard、WeChat、Alipay、Line Pay、JKOPAY、Credit Card(VISA/Master/JCB/UnionPay Card/AE/Diners club/Discover)、Apple/Google/Samsung pay",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "cafe",
    outlets: [
      o("4", "Floor 4", "airside", "00:00~24:00", true),
    ],
  }),
  xi_zai_bian_grilled_meat_rice: restaurant({
    name: "Xi Zai Bian Grilled Meat Rice",
    cuisine: "Chinese Cuisine",
    description: "Xizaibian has been established for more than 35 years. It is part of the growing memories of many families in the greater Taipei area. Our signature barbecue rice and grilled chicken leg rice are not only delicious, but have also experienced long-term testing in the market and are deeply loved. Popular with customers of all ages.\n\nWe insist on using the freshest ingredients to ensure that every bite is a guarantee of safety and health. When you choose Xizaibian , you are not only choosing a gourmet meal, but also choosing a sincerity and quality that has been accumulated for 35 years. Let us continue to accompany you and your family to create more wonderful taste bud memories.",
    amenity: "restaurant",
    outlets: [
      o("5", "Floor 5", "landside", "11:00-14:30 , 15:30-19:00", false),
    ],
  }),
  xiang_nu: restaurant({
    name: "Xiang Nu",
    cuisine: "Chinese Cuisine",
    description: "Xiang Nu Taiwan Beef Noodle Bar uses locally sourced beef from Taiwan's farms. The Chiayi ranch, with its excellent environment and climate, nurtures tender and delicious local beef. We are committed to carefully selecting our beef ingredients, ensuring that no growth hormones or lean meat additives are used, and all beef production meets the government's traceability and origin requirements, offering consumers peace of mind and trust. Xiang Nu serves a bowl of authentic hometown flavor, introducing travelers to the beauty of Formosa Taiwan, and embodying the warmth and friendliness of the Taiwanese people, which is the best representation of Taiwan. Xiang Nu warmly welcomes you to savor the taste of home.\n\nPayment Methods: Cash (TWD), Credit Card, Apple Pay, Google Pay, Line Pay, Samsung Pay, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, iPass, UnionPay.",
    amenity: "restaurant",
    outlets: [
      o("3", "Floor 3", "airside", "04:00-01:00", false),
    ],
  }),
  xiao_nan_men: restaurant({
    name: "Xiao Nan Men",
    cuisine: "Chinese Cuisine / Dessert shop & Bakeries",
    description: "Xiao Nan Men, a famous casual dining restaurant in Taiwan, is known for its homemade sweet silky “Douhua (tofu pudding)”. Made by traditional recipe, and with ginger, boba, or beans, it is definitely a must-try when you come to Xiao Nan Men!\nOther than that, there are also popular local Taiwanese food including \"braised pork rice\", \"migao (Sticky rice with minced pork\", \"Pork thick soup\", and \"xiaolongbao\"…etc.,\nXiao Nan Men – Simply delicious!",
    website: "everrich-group.com",
    logoUrl: logo("everrich-group.com"),
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "06:00-22:00", false),
    ],
  }),
  airport_corne: restaurant({
    name: "航隅食堂 Airport Corne",
    cuisine: "Western Cuisine",
    description: "Airport Corner specializes in Chinese-style hot meals, offering popular dishes such as pork chop fried rice, Thai basil pork rice bowls, and chicken braised pork rice. Freshly prepared to order with quick service, it allows travelers to enjoy warm, comforting, and satisfying meals during their journey. Whether before departure or after arrival, Airport Corner is a great place to recharge and enjoy a delightful dining experience",
    amenity: "restaurant",
    outlets: [
      o("-2", "Floor -2", "landside", "11:00-19:30", false),
    ],
  }),
  venue_39cc10fd: restaurant({
    name: "萬芳冰室",
    cuisine: "Chinese Cuisine",
    description: "Payment Instrument: Cash (TWD), Credit Card, Apple Pay, Google Pay, Line Pay, Samsung Pay, Taiwan Pay, Taishin Pay, Alipay, WeChat Pay, EasyCard, IPASS, UnionPay Card",
    amenity: "restaurant",
    outlets: [
      o("4", "Floor 4", "airside", "05:00~22:30", false),
    ],
  }),
};

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
  console.error('Fatal error:', err);
  process.exit(1);
});
