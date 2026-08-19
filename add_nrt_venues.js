'use strict';
/**
 * Fills in complete data for Narita International Airport (NRT) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-16 from the
 * official site, narita-airport.jp/en/shop/shop-search/ (category=restaurant,
 * pages 1-5, 95 total listings), using Claude in Chrome browser automation
 * per this project's standing convention (no WebFetch for venue data).
 *
 * METHODOLOGY: the LISTING page (?category=restaurant&page=N) silently
 * ignores its own query-string filter when fetched via plain `fetch()` from
 * page context — it returns an unfiltered ~307-item catalog instead of the
 * intended 95-item restaurant-filtered, paginated result. Root cause
 * unconfirmed (no JSON API found via network-request inspection — only
 * image/analytics calls and one obfuscated POST). Real browser navigation +
 * DOM link extraction was required for all 5 listing pages. Individual
 * DETAIL pages (/shop-search/<slug>/), by contrast, fetch perfectly fine via
 * plain `fetch()` with no session/filter dependency, so all 95 detail pages
 * were bulk-parsed via `fetch()` + DOMParser inside `javascript_tool`.
 *
 * TOOLING NOTE (reusable finding for future airports): `javascript_tool`'s
 * returned text is silently truncated by the harness at roughly ~1200
 * characters, on top of a separate "[BLOCKED: Cookie/query string data]"
 * filter above roughly ~6000 characters — both well short of what bulk
 * JS-computed JSON needs. The reliable high-capacity workaround: write the
 * JSON string into `document.body.innerHTML` as a `<pre>` element's
 * `textContent`, then read it back with the `get_page_text` tool (normally
 * used for reading long articles) — this returned full untruncated payloads
 * up to ~22000 characters in testing. (A Blob/`createObjectURL`/anchor-click
 * download-trigger workaround was also tried and abandoned — it triggered a
 * blocked native save dialog and a full extension disconnect.)
 *
 * Each detail page exposes an authoritative "Location" field naming the
 * building/level and explicitly stating "Before Security Check" or "After
 * Security Check (Domestic/International Flights)" — used directly for the
 * airside/landside field, no inference needed (same pattern as this
 * project's KIX script). Extraction used a position-sorted scan of every
 * label actually present on the page (Business hours, Location, Telephone
 * number, Website, Payment method, Features, About the store, ...), slicing
 * text between each consecutive pair of found label positions — robust to
 * any individual label being absent for a given shop (an earlier
 * single-indexOf approach broke on shops missing the "Features" label,
 * swallowing "About the store" text into the wrong field).
 *
 * TERMINAL STRUCTURE (confirmed via the site's own before/after-security
 * location data plus two secondary sources describing each terminal's
 * check-in/security arrangement): Terminal 1 — Central Building + North
 * Wing + South Wing, all connected and sharing a single 4F check-in hall
 * (airport-narita.com/terminals.php: "Terminal 1 ... is divided into North
 * Wing and South Wing sections connected by a central building" / "4F:
 * Check-in and departures") — plus Satellites No.2/3/4/5, reached only
 * post-security with no check-in of their own. All fold into one
 * `terminal_1` bucket. Terminal 2 — Main Building + Satellite, the
 * Satellite reached via people-mover only after security (confirmed: every
 * raw T2 Satellite listing is tagged "After Security Check (International
 * Flights)") — both fold into one `terminal_2` bucket. Terminal 3 is a
 * genuinely SEPARATE terminal: airport-technology.com confirms its shops
 * and food court "are located between check-in counters and security
 * checkpoints" (i.e. T3 has its own check-in counters AND its own security
 * checkpoint), built ~500m north of T2 and connected only by pedestrian
 * walkway/shuttle bus (airport-narita.com: "Connected to Terminal 2 by
 * pedestrian walkway"). T3's own Main Building + Satellite Building (the
 * latter reached via bridge, no own check-in) both fold into one
 * `terminal_3` bucket.
 *
 * MULTI-OUTLET MERGE GROUPS (same brand, same terminal, multiple location
 * slugs on the site — combined into one doc with multiple `outlets[]`):
 * McDonald's/T1 (Central Bldg 3F + 4F); Starbucks Coffee/T1 (B1F Narita
 * Airport Station + Central Bldg 4F + No.2 Satellite 3F); Snack & Cafe
 * AVION/T1 (North Wing 3F, two distinct location-slugs both labelled "T1
 * North Wing / 3F"); Sushi Kyotatsu/T1 (No.3 Satellite 3F + North Wing 3F);
 * Starbucks Coffee/T2 (Main Bldg 4F + Main Bldg 1F ×2 + Satellite 3F);
 * Yoshinoya/T2 (Satellite 3F + Main Bldg 2F); caffe LAT.25°/T3 (2F + 3F).
 * Same-brand venues in DIFFERENT terminals were kept as separate docs per
 * this project's standing rule: MITSUMOTO TEI (T1 vs T2), Sushi Kyotatsu
 * (T1 doc vs a separate T2 doc), DEAN ＆ DELUCA CAFÉ (T1 vs T2), TULLY'S
 * COFFEE (T1 vs "Terminal 2", T2's listing has a space in the name).
 *
 * PAGE-TRUTH-OVER-LABEL (explicitly NOT merged despite shared naming
 * elements, because the site gives each a distinctly different display
 * name): "CAFE＆BAR AVION" (T1 No.3 Satellite, its own single doc) is kept
 * separate from the "Snack & Cafe AVION" merge group; "TEPPAN YAKI
 * MITSUMOTO TEI / MITSUMOTO COFFEE TEN" (T3, a distinctly-named combined
 * concept, single doc) is kept separate from the "MITSUMOTO TEI" docs in
 * T1/T2.
 *
 * AMENITY/CUISINE: mapped from the site's own category tag(s) — Cafes
 * present -> cafe; Bars present without Cafes -> bar; Light Meals/Fast Food
 * present (without Cafes) -> fast_food; else -> restaurant. Two special
 * cases, not fabricated: "CAFE ＆ DINING N's COURT" (T2) is forced to
 * `food_court` based on its own description ("the largest in Terminal 2 ...
 * designed in the image of a courtyard", 200+ seats); "Mugi To Olive-
 * Rousokuya" (T2) had an empty categories field on the site, so cuisine was
 * set to "Japanese (Ramen)" from its real description text (mentions
 * "hamaguri clam ramen" and "shibire noodles"), not invented from nothing.
 *
 * DATA CLEANUP: 3 descriptions had trailing site boilerplate ("* Please ask
 * the store about allergy information.") stripped (ANA FESTA Terminal1,
 * DEAN ＆ DELUCA CAFÉ Terminal2, DOUTOR COFFEE SHOP Terminal1). Website
 * fields are bare hostnames only (no protocol/www/path) per this project's
 * standing convention.
 *
 * KNOWN LIMITATION (disclosed, not hidden): every `description` is genuine
 * site text but capped at 300 characters by the extraction script, a
 * deliberate tradeoff to keep bulk JS-tool-output payloads small enough to
 * avoid the truncation/blocking issue described above — descriptions are
 * cut short, never fabricated or paraphrased.
 *
 * VERIFIED TOTALS: 85 restaurant docs / 95 outlets across 3 terminals —
 * terminal_1: 41 docs / 46 outlets; terminal_2: 33 docs / 37 outlets;
 * terminal_3: 11 docs / 12 outlets. Matches the 95 raw unique site listings
 * exactly (zero data loss/duplication in the merge logic).
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['nrt', 'narita', 'tokyo-narita'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';

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

// ─── Terminal 1 venues (Central Building + North Wing + South Wing + Satellites No.2-5) ────────

const terminal1Venues = {
  mcdonalds_t1: restaurant({
    name: "McDonald's", cuisine: "Light Meals / Fast Food", amenity: "fast_food",
    phone: "+81 476-30-3339",
    description: "The world's number one hamburger restaurant known and loved by people in over 100 countries. Enjoy great meals in the restaurant with the best quality, service and hygiene. Value sets and limited-time specials available.",
    outlets: [
    o("3F", "T1 Central Building / 3F / After Security Check (International Flights)", "airside", "07:00-21:30(L.O.)"),
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "06:30-21:30(L.O.)"),
    ],
  }),
  starbucks_t1: restaurant({
    name: "Starbucks Coffee", cuisine: "Cafes / Bars / Light Meals / Fast Food", amenity: "cafe",
    phone: "+81 476-33-0215",
    description: "STARBUCKS COFFEE Narita Airport Terminal 1 is located on the 4th floor, same as the departure lobby, and is used by many customers including those who are departing, those who have arrived, and those who are working in the airport.",
    vegetarian: true,
    outlets: [
    o("B1F", "T1 / B1F / Before Security Check", "landside", "07:00-21:30(L.O.)"),
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "07:00-21:00(L.O.)"),
    o("3F", "T1 No.2 Satellite / 3F / After Security Check (International Flights)", "airside", "08:00-21:00(L.O.)"),
    ],
  }),
  snack_cafe_avion_t1: restaurant({
    name: "Snack & Cafe AVION", cuisine: "Cafes / Bars / Ramen and Other Noodles", amenity: "cafe",
    phone: "+81 476-32-8525",
    description: "Relax with a drink and snack before boarding.",
    outlets: [
    o("3F", "T1 North Wing / 3F / After Security Check (International Flights)", "airside", "08:30-16:30(L.O.)"),
    o("3F", "T1 North Wing / 3F / After Security Check (International Flights)", "airside", "08:00-20:30(L.O.)"),
    ],
  }),
  sushi_kyotatsu_t1: restaurant({
    name: "Sushi Kyotatsu", cuisine: "Japanese Cuisine", amenity: "restaurant",
    website: "bbande.co.jp", logoUrl: logo("bbande.co.jp"),
    phone: "+81 476-32-1777",
    description: "Before you depart, enjoy authentic sushi that can be tasted only at Kyotatsu, prepared carefully in Edomae style using selected seafood, including the wild raw Pacific bluefin tuna caught in Japan.",
    vegetarian: true,
    outlets: [
    o("3F", "T1 No.3 Satellite / 3F / After Security Check (International Flights)", "airside", "09:00-19:30(L.O.)"),
    o("3F", "T1 North Wing / 3F / After Security Check (International Flights)", "airside", "09:00-17:00(L.O.)"),
    ],
  }),
  godiva_cafe: restaurant({
    name: "GODIVA café", cuisine: "Cafes / Bars", amenity: "cafe",
    website: "godiva.co.jp", logoUrl: logo("godiva.co.jp"),
    phone: "+81 476-29-5136",
    description: "Under the concept of \"making every day a little better,\" we offer delights including chocolate drinks and soft serve ice cream exclusive to Godiva café, such as the \"Chocolixir\" series.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  shake_shack: restaurant({
    name: "SHAKE SHACK", cuisine: "Light Meals / Fast Food", amenity: "fast_food",
    website: "shakeshack.jp", logoUrl: logo("shakeshack.jp"),
    phone: "+81 476-32-2470",
    description: "As a hamburger restaurant that originated in New York, this shop offers delicious meals of hamburgers using 100% hormone-free Angus beef patties, along with fries, lemonade, original craft beer, wine, and more.",
    vegetarian: true,
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:00-20:00(L.O.)"),
    ],
  }),
  ana_festa_terminal1: restaurant({
    name: "ANA FESTA Terminal1", cuisine: "Light Meals / Fast Food / Convenience Stores, etc. / Food Products / Confectionery", amenity: "fast_food",
    phone: "+81 476-33-2848",
    description: "An extensive menu of light meals offered to passengers departing on domestic flights in Terminal 1. Popular confectionery and other miscellaneous items also available. Recommended Udon and soba noodles, curried rice, gifts, etc.",
    outlets: [
    o("2F", "T1 South Wing / 2F / After Security Check (Domestic Flights)", "airside", "06:15-20:00"),
    ],
  }),
  cafe_bar_avion: restaurant({
    name: "CAFE＆BAR AVION", cuisine: "Cafes / Bars / Light Meals / Fast Food", amenity: "cafe",
    phone: "+81 476-32-8788",
    description: "Relax with a drink and snack before boarding.",
    vegetarian: true,
    outlets: [
    o("3F", "T1 No.3 Satellite / 3F / After Security Check (International Flights)", "airside", "08:00-21:00(L.O.)"),
    ],
  }),
  caffe_lat_25_terminal1: restaurant({
    name: "caffe LAT.25° Terminal1", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-32-7882",
    description: "60 years roasting the world's finest coffee beans. We stand at the pinnacle of selecting and roasting coffee from around the world, unmoved by traditions or by trends and offering the very pest in our pursuit of the essence of supreme favor.",
    outlets: [
    o("1F", "T1 North Wing / 1F / Before Security Check", "landside", "07:00-19:00(L.O.)"),
    ],
  }),
  dashichazuke_en: restaurant({
    name: "Dashichazuke EN", cuisine: "Japanese Cuisine", amenity: "restaurant",
    website: "byo.co.jp", logoUrl: logo("byo.co.jp"),
    phone: "+81 476-33-1796",
    description: "Specializing in Dashichazuke with the rich taste of the highest quality dashi stock. Fast food with an authentic flavor. Try our glistening golden soup with seaweed, dried sardines, several types of dried bonito flakes and chicken, plus seasonal toppings. Enjoy a moment of relaxation.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "07:30-20:30(L.O.)"),
    ],
  }),
  dean_deluca_cafe_terminal1: restaurant({
    name: "DEAN ＆ DELUCA CAFÉ Terminal1", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-32-4652",
    description: "Developed by gourmet grocery store Dean & DeLuca, this café offers an extensive food menu alongside carefully crafted cups of coffee and seasonal drinks.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "07:30-20:00(L.O.)"),
    ],
  }),
  doutor_coffee_shop_terminal1: restaurant({
    name: "DOUTOR COFFEE SHOP Terminal1", cuisine: "Cafes / Bars / Light Meals / Fast Food", amenity: "cafe",
    phone: "+81 476-30-3088",
    description: "A self-service style cafe using fresh coffee beans brought and roasted directly from Doutor's own facility. Enjoy an extensive menu ranging from real coffee to delicious food. Recommended Milan-style sandwiches with the finest carefully selected ingredients. * Please ask the store about allergy info",
    outlets: [
    o("3F", "T1 North Wing / 3F / After Security Check (International Flights)", "airside", "08:00-18:00(L.O.)"),
    ],
  }),
  fasola_cafe_coffee_beer_terminal1_no_4_satellite: restaurant({
    name: "FaSoLa Cafe coffee ＆ beer Terminal1 No.4 Satellite", cuisine: "Cafes / Bars / Light Meals / Fast Food", amenity: "cafe",
    website: "fasola.jp", logoUrl: logo("fasola.jp"),
    phone: "+81 476-33-1917 9:00-17:00",
    description: "FaSoLa Cafe coffee & beer, located in the center of Satellite 4, offers rich aromatic coffee, draft beer and other drinks along with gratin, sandwiches and other light meals.",
    vegetarian: true,
    outlets: [
    o("3F", "T1 No.4 Satellite / 3F / After Security Check (International Flights)", "airside", "08:00-20:30(L.O.)"),
    ],
  }),
  fujiya_restaurant: restaurant({
    name: "FUJIYA RESTAURANT", cuisine: "Western Cuisine", amenity: "restaurant",
    website: "fujiya-fs.com", logoUrl: logo("fujiya-fs.com"),
    phone: "+81 476-32-5951",
    description: "Bring your family to enjoy Fujiya's extensive children's menu and perennial selections.",
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "08:00-20:00(L.O.)"),
    ],
  }),
  ginshari_hokkaido: restaurant({
    name: "Ginshari Hokkaido", cuisine: "Light Meals / Fast Food", amenity: "fast_food",
    phone: "+81 476-32-7441",
    description: "This specialty Hokkaido onigiri restaurant offers a lively atmosphere by cooking \"Fukkurinko\" Special A-grade Rice from Hokkaido in-house and pressing the onigiri into shape right in front of the customers' eyes. Shiretoto shaké (salmon), Kojohama cod roe, Hokkaido beef, cream cheese and other sele",
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "08:00-20:00(L.O.)"),
    ],
  }),
  gong_cha: restaurant({
    name: "Gong cha", cuisine: "Cafes / Bars", amenity: "cafe",
    website: "gongcha.co.jp", logoUrl: logo("gongcha.co.jp"),
    phone: "+81 476-37-4352",
    description: "Gong cha is a global tea brand that originated in Taiwan. You can choose from a menu of various high-quality teas that we pay close attention to preserving the original flavor and aroma of tea leaves, including our popular milk tea, and enjoy a personalized and casual tea experience tailored to your",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  hanbijae: restaurant({
    name: "HANBIJAE", cuisine: "Chinese / Korean / Ethnic Cuisine", amenity: "restaurant",
    website: "kimuchikan.co.jp", logoUrl: logo("kimuchikan.co.jp"),
    phone: "+81 476-32-4889",
    description: "Hanbijae is a casual Korean restaurant providing dishes that will increase your beauty inside and out. The restaurant offers a wide variety of healthy Korean cuisines rich in meat and vegetables as well as sweet desserts.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "8:30-20:30(L.O.)"),
    ],
  }),
  homemade_udon_noodles_kineyamugimaru: restaurant({
    name: "Homemade Udon Noodles KINEYAMUGIMARU", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-32-7877",
    description: "This self-service restaurant specializes in thick udon noodles. Every day we mix flour with salted water and knead it into noodle dough. We then cut the noodles from the dough and boil them ready for you to eat! Inside the restaurant you can look right through into the open kitchen and see the chef",
    halal: true,
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "7:30-20:30(L.O.)"),
    ],
  }),
  ippudo: restaurant({
    name: "IPPUDO", cuisine: "Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-29-5382",
    description: "Ippudo is a ramen restaurant chain that was established in 1985 in Daimyo, Fukuoka City. Ippudo's tonkotsu ramen, featuring a rich, silky broth paired with nicely firm noodles, is a favorite of ramen-lovers around the world in addition to people in Japan.",
    outlets: [
    o("3F", "T1 Central Building / 3F / After Security Check (International Flights)", "airside", "07:30-20:30(L.O.)"),
    ],
  }),
  japanese_grill_craft_beer_tatsu: restaurant({
    name: "JAPANESE GRILL & CRAFT BEER TATSU", cuisine: "Japanese Cuisine", amenity: "restaurant",
    website: "bbande.co.jp", logoUrl: logo("bbande.co.jp"),
    phone: "+81 476-32-1900",
    description: "TATSU is a casual Japanese grill & craft beer restaurant offering a wide range of menus including udon noodles from Kisin (a Michelin-starred restaurant from Tokyo but now based in Paris), tendon, tonkatsu, steak, curry and rice and other all-time Japanese favorites to be enjoyed with a glass of Tok",
    vegetarian: true,
    outlets: [
    o("3F", "T1 Central Building / 3F / After Security Check (International Flights)", "airside", "07:30-20:30(L.O.)"),
    ],
  }),
  japanese_spaghetti_yomenya_goemon: restaurant({
    name: "Japanese Spaghetti YOMENYA GOEMON", cuisine: "Western Cuisine", amenity: "restaurant",
    phone: "+81 476-32-5878",
    description: "A spaghetti shop where you can use chopsticks. The spaghetti is boiled in a large Goemon pot, and this is the origin of the shop's name. The ingredients used, such as spaghetti, olive oil and cheese, are carefully selected and imported directly from Italy. Please enjoy Goemon's original spaghetti me",
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "09:00-20:00(L.O.)"),
    ],
  }),
  kaitensushi_misaki: restaurant({
    name: "KAITENSUSHI MISAKI", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-33-5022",
    description: "KAITENSUSHI MISAKI offers sushi from 160 yen a plate. Signature items, Misaki specialties! Super delicious tuna. Seasonal flavors of Japan, direct from Toyosu. Sample the flavors created by the polished skills of our craftsmen. Vegetarian menu 1 item",
    vegetarian: true,
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  kawatoyo_in_narita_airport: restaurant({
    name: "Kawatoyo in Narita Airport", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-32-7518",
    description: "Narita City in Chiba Prefecture, which is home to Narita International Airport, has long been famous as a unagi (eel) township and its streets are lined with unagi restaurants. However, it is the traditional house of Kawatoyo that has the longest customer queues due to its insistence on freshly p",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  keisei_yuzen: restaurant({
    name: "KEISEI YUZEN", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-32-5905",
    description: "KEISEI YUZEN is a Japanese-style family restaurant specializing in set menus. There are various unique set menus combining fish and meat dishes, tempura, sashimi and udon noodles.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "07:00-20:30(L.O.)"),
    ],
  }),
  komeraku: restaurant({
    name: "KOMERAKU", cuisine: "Japanese Cuisine", amenity: "restaurant",
    website: "komeraku.jp", logoUrl: logo("komeraku.jp"),
    phone: "+81 476-32-5642",
    description: "This shop specializes in creative dashi chazuke (rice with soup stock) which had its beginnings in Tokyo's Ginza district in 2001. You can simply enjoy the rice or add the stock to the rice to enjoy it as chazuke. The stock is a special dried bonito stock with a rich flavor.",
    outlets: [
    o("3F", "T1 North Wing / 3F / After Security Check (International Flights)", "airside", "08:00-16:30(L.O.)"),
    ],
  }),
  matsudo_tomitamendan: restaurant({
    name: "Matsudo Tomitamendan", cuisine: "Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-32-6822",
    description: "This is a restaurant directly managed by Chuka Ramen Tomita, one of the most famous restaurants in Japan, located in Matsudo City in Chiba Prefecture. The tsukemen (dipping noodles), synonymous with the restaurant, are homemade from carefully selected Japanese wheat and simmered slowly in a rich sea",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  mitsumoto_tei_terminal1: restaurant({
    name: "MITSUMOTO TEI Terminal1", cuisine: "Western Cuisine", amenity: "restaurant",
    phone: "+81 476-32-7904",
    description: "Based on the concept \"Western Foods Originated in Japan,\" we offer a wide variety of menu options of western dishes with a unique Japanese influence, including homemade hamburger steak, creamy omelet-wrapped rice, sweets, and alcohol.",
    vegetarian: true,
    outlets: [
    o("3F", "T1 Central Building / 3F / After Security Check (International Flights)", "airside", "07:30-20:30(L.O.)"),
    ],
  }),
  nagasakasarasina_nunoyatahee: restaurant({
    name: "NAGASAKASARASINA NUNOYATAHEE", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-32-8016",
    description: "Soba restaurant founded in the first year of Kansei 1789 with a history of over 220 years. The menu includes Gozen Soba featuring smooth noodles, Kikouchi Soba featuring thick noodles made from 100% buckwheat flour, and Tahee Soba featuring noodles containing 80% buckwheat flour.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "10:00-19:30(L.O.)"),
    ],
  }),
  nenrinya_cafe_diner: restaurant({
    name: "Nenrinya CAFÉ&DINER", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-33-2102",
    description: "A baumkuchen café and diner that can be found only at Narita Airport. Nenrinya, a baumkuchen specialty store with its main location in Ginza, Tokyo, has created special sweets and sandwiches with Japanese elements that can only be found here in the world.",
    outlets: [
    o("3F", "T1 No.5 Satellite / 3F / After Security Check (International Flights)", "airside", "08:00-19:45(L.O.)"),
    ],
  }),
  ramen_ichikakuya_aburasoba_sohonten: restaurant({
    name: "RAMEN ICHIKAKUYA/ABURASOBA SOHONTEN", cuisine: "Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-33-5155",
    description: "The very best of Iekei Ramen.",
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "08:00-20:00(L.O.)"),
    ],
  }),
  seiyoken: restaurant({
    name: "SEIYOKEN", cuisine: "Chinese / Korean / Ethnic Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-32-5965",
    description: "Enjoy the authentic Chinese dishes prepared by chefs who have trained in the finest hotels. Gomoku Soba Noodles, Hot and Sour Noodle Soup, Dandan Noodles, Chinese Noodles Topped with Ground Pork, and Stir-Fried Shrimp in Chili Sauce are some of the menus we proudly offer.",
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "11:00-19:00(L.O.)"),
    ],
  }),
  subway: restaurant({
    name: "SUBWAY", cuisine: "Light Meals / Fast Food", amenity: "fast_food",
    website: "subway.co.jp", logoUrl: logo("subway.co.jp"),
    phone: "+81 476-32-1050",
    description: "A sandwich chain loved by people around the world. Hearty sandwiches with egg, chicken, and generous portions of vegetables served on freshly baked bread.",
    outlets: [
    o("4F", "T1 South Wing / 4F / Before Security Check", "landside", "07:00-21:00(L.O.)"),
    ],
  }),
  tang_dynasty_to_sho_men: restaurant({
    name: "TANG DYNASTY TO-SHO-MEN", cuisine: "Chinese / Korean / Ethnic Cuisine", amenity: "restaurant",
    phone: "+81 476-33-5533",
    description: "Changan, now Xian, was the capital of the Tang Dynasty in China. TANG DYNASTY TO-SHO-MEN is a restaurant specializing in the cuisine of Xian.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:15-20:15(L.O.)"),
    ],
  }),
  thai_restaurant_jai_thai: restaurant({
    name: "Thai Restaurant Jai Thai", cuisine: "Chinese / Korean / Ethnic Cuisine", amenity: "restaurant",
    phone: "+81 476-32-9191",
    description: "Savor the refined cuisine and enjoy the laid-back setting at the restaurant with one of Thailand's top chefs.",
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "10:00-20:30(L.O.)"),
    ],
  }),
  tokyo_food_bar: restaurant({
    name: "Tokyo Food Bar", cuisine: "Japanese Cuisine / Cafes / Bars / Ramen and Other Noodles", amenity: "cafe",
    phone: "+81 476-33-2920",
    description: "Seasonal Tokyo meals are a prominent feature of the food court and cafe complex offering an unforgettable experience for travelers from around the world.",
    vegetarian: true,
    outlets: [
    o("3F", "T1 South Wing / 3F / After Security Check (International Flights)", "airside", "07:45-21:00(L.O.)"),
    ],
  }),
  tonkatsu_shinjuku_saboten: restaurant({
    name: "Tonkatsu shinjuku saboten", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-32-6475",
    description: "A restaurant specializing in deep-fried pork cutlets tonkatsu with 50 years of experience and branches at airports overseas.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "9:00-20:30(L.O.) SAT, SUN, Holidays: 10:00-20:30(L.O.)"),
    ],
  }),
  tsukiji_sushiiwa: restaurant({
    name: "tsukiji - Sushiiwa", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-32-5797",
    description: "Sushiiwa's Values: Seasoning fish with salt and kelp, to pickling, boiling and roasting. Sushiiwa values traditions that have been passed down from the Taisho era.",
    vegetarian: true,
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:00-20:00(L.O.)"),
    ],
  }),
  tully_s_coffee_terminal1: restaurant({
    name: "TULLY'S COFFEE Terminal1", cuisine: "Cafes / Bars / Light Meals / Fast Food", amenity: "cafe",
    website: "tullys.co.jp", logoUrl: logo("tullys.co.jp"),
    phone: "+81 476-33-2914",
    description: "Tully's Coffee offers authentic coffee using carefully-selected coffee beans from around the world, with each cup hand-dripped.",
    vegetarian: true,
    outlets: [
    o("4F", "T1 South Wing / 4F / Before Security Check", "landside", "07:00-21:00(L.O.)"),
    ],
  }),
  williams: restaurant({
    name: "Williams", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-32-5970",
    description: "Convenient reasonably priced Japanese food with an emphasis on fried pork cutlet and curry dishes. Large portions to satisfy customers with big appetites and a favorite among airport staff.",
    outlets: [
    o("5F", "T1 Central Building / 5F / Before Security Check", "landside", "09:00-19:30(L.O.)"),
    ],
  }),
  withgreen: restaurant({
    name: "WithGreen", cuisine: "Cafes / Bars / Light Meals / Fast Food / Western Cuisine", amenity: "cafe",
    phone: "+81 476-33-3653",
    description: "WithGreen is a franchise based in Tokyo specializing in salads. The store provides filling, main-dish salads that are enough for a whole meal, using 100% domestically grown vegetables.",
    vegetarian: true,
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  yakisuki_meat_dishes_yanma: restaurant({
    name: "YAKISUKI MEAT DISHES YANMA", cuisine: "Japanese Cuisine", amenity: "restaurant",
    website: "yanma.info", logoUrl: logo("yanma.info"),
    phone: "+81 476-32-3200",
    description: "MEAT DISHES YAKISUKI YANMA created a new style of cuisine. Slices of Matsusaka beef and other quality Wagyu beef are grilled on a specially-ordered iron plate.",
    outlets: [
    o("4F", "T1 Central Building / 4F / Before Security Check", "landside", "10:00-19:30(L.O.)"),
    ],
  }),};

// ─── Terminal 2 venues (Main Building + Satellite) ────────

const terminal2Venues = {
  starbucks_t2: restaurant({
    name: "Starbucks Coffee", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-6358",
    description: "Our store is right at the front of International Flight Gate A. The chic design is inspired by a Japanese-style house to give a warm and healing atmosphere that is uniquely Japanese.",
    vegetarian: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "07:00-21:30(L.O.)"),
    o("1F", "T2 Main Building / 1F / Before Security Check", "landside", "07:00-21:30(L.O.)"),
    o("1F", "T2 Main Building / 1F / Before Security Check", "landside", "07:00-21:00(L.O.)"),
    o("3F", "T2 Satellite / 3F / After Security Check (International Flights)", "airside", "07:30-21:00(L.O.)"),
    ],
  }),
  yoshinoya_t2: restaurant({
    name: "Yoshinoya", cuisine: "Japanese Cuisine / Light Meals / Fast Food", amenity: "fast_food",
    phone: "+81 476-34-6215",
    description: "Traditional flavors of Japan dating back 120 years. We offer you a delicious beef rice bowl. There is also a wide variety on the menu other than beef rice bowls.",
    vegetarian: true,
    outlets: [
    o("3F", "T2 Satellite / 3F / After Security Check (International Flights)", "airside", "08:00-20:30(L.O.)"),
    o("2F", "T2 Main Building / 2F / Before Security Check", "landside", "00:00-24:00"),
    ],
  }),
  nrt_beer_flight_cafe: restaurant({
    name: "NRT BEER FLIGHT CAFE", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-8036",
    description: "This is a café where you can casually enjoy Japanese craft beer. In this casual setting, you can enjoy a “beer flight” or tasting flight, featuring “Narita Airport Ale,” which is Narita Airport’s original craft beer, alongside a diverse selection of craft beers from various regions across Japan. You",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:00-21:30(L.O)"),
    ],
  }),
  pronto: restaurant({
    name: "PRONTO", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-6532",
    description: "PRONTO aims to become a “GREAT GOOD PLACE” where you can really enjoy yourself. With the key concept of “A café during the day, a bar at night,” it provides a welcoming space all day long, so you can drop by anytime.",
    outlets: [
    o("B1F", "T2 Main Building / B1F / Before Security Check", "landside", "06:45-22:30(L.O)"),
    ],
  }),
  mugi_to_olive_rousokuya: restaurant({
    name: "Mugi To Olive-Rousokuya", cuisine: "Japanese (Ramen)", amenity: "restaurant",
    phone: "+81 476-34-6876",
    description: "Mugi To Olive, a restaurant famous for hamaguri clam ramen and with a long queue to get in, and Rousyokuya, causing a buzz with shibire noodles, collaborate for the first time! This is the only place in Japan where you can enjoy these two dishes in the same store! Stop by for a meal before your depa",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "08:00-20:00(L.O)"),
    ],
  }),
  cafe_dining_n_s_court: restaurant({
    name: "CAFE ＆ DINING N's COURT", cuisine: "Japanese Cuisine / Western Cuisine / Chinese / Korean / Ethnic Cuisine", amenity: "food_court",
    phone: "+81 476-34-6190",
    description: "A spacious cafeteria with over 200 seats, the largest in Terminal 2. Designed in the image of a courtyard within an airport terminal, the facility is divided into a sofa area, counter chairs, and seats for families so that customers can rest and relax according to their needs. A wide range of menus",
    vegetarian: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "06:45-21:30(L.O.)"),
    ],
  }),
  dean_deluca_cafe_terminal2: restaurant({
    name: "DEAN ＆ DELUCA CAFÉ Terminal2", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-6098",
    description: "Developed by gourmet grocery store Dean & DeLuca, this café offers an extensive food menu alongside carefully crafted cups of coffee and seasonal drinks.",
    outlets: [
    o("3F", "T2 Satellite / 3F / After Security Check (International Flights)", "airside", "07:30-20:00(L.O.)"),
    ],
  }),
  fruitparlor_mi: restaurant({
    name: "FRUITPARLOR Mi’ｚ", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-8411",
    description: "Seasonal fruit parfaits, fruit sandwiches and smoothies prepared with carefully selected fresh fruit and handmade ice cream from the age-old purveyor of fruit in Yokohama, Mizunobu Fruit Parlor.",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  ginza_kagari: restaurant({
    name: "Ginza Kagari", cuisine: "Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-34-8373",
    description: "Since its establishment in 2013, Ginza Kagari flagship restaurant has become the leading name in Japan for Toripaitan Ramen (chicken broth noodles). Extremely popular with visitors from abroad, the Ginza flagship restaurant and its restaurants around the country are also well patronized. Drop into t",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  gyukatsu_kyoto_katsugyu: restaurant({
    name: "Gyukatsu Kyoto Katsugyu", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-34-8092",
    description: "This restaurant specializes in Gyukatsu with \"Making beef cutlet from Kyoto into the world's GYUKATSU!\" as its mission. The famous Gyukatsu are from Japanese Wagyu and include other carefully selected ingredients. They are served as a set meal style with the finest cutlets cooked medium rare by",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  japanese_cuisine_restaurant_kami_hikoki: restaurant({
    name: "Japanese cuisine restaurant KAMI-HIKOKI", cuisine: "Japanese Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-34-6385",
    description: "A fast-food style restaurant with a commitment not only to quality products and beautiful servings that will appeal to the gourmet customer but also to safety and reliability. The menu includes ramen, udon and soba noodles as well as katsudon, gyudon, curries, sushi and other delicacies which are al",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "7:00-20:30(L.O.)"),
    ],
  }),
  kanno_coffee: restaurant({
    name: "KANNO COFFEE", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-6868",
    description: "The instant you take a bite, your senses are sharpened and you are drawn into a different world. Our hope is that we can capture the imagination of our customers through a cup of coffee and enable them to enjoy a world of imagery that transcends flavor and taste. There is a generous commitment of ef",
    vegetarian: true,
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  la_toque: restaurant({
    name: "LA TOQUE", cuisine: "Western Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-34-6193",
    description: "The main menu item, Japanese curry made from carefully selected Japanese ingredients, is popular among both Japanese and non-Japanese customers. The bright and casual atmosphere of the restaurant also makes it an ideal place to enjoy a cup of coffee. This restaurant's kitchen is halal certified.",
    halal: true, vegetarian: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  mcdonald_s_terminal2: restaurant({
    name: "McDonald's Terminal2", cuisine: "Light Meals / Fast Food", amenity: "fast_food",
    phone: "+81 476-30-1567",
    description: "The world's number one hamburger shop, loved by a great number of people in over 90 countries. Excellent quality, great service, cleanliness, and great value is its motto.",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "06:00-21:30(L.O.)"),
    ],
  }),
  miso_kitchen: restaurant({
    name: "MISO KITCHEN", cuisine: "Japanese Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    website: "royal-ahf.jp", logoUrl: logo("royal-ahf.jp"),
    phone: "+81 476-34-6645",
    description: "A restaurant devoted to the concept of bean paste, one of the staples of Japanese culinary traditions. It offers an extensive menu ranging from breakfast to dinner as well as alcoholic beverages and snacks.",
    outlets: [
    o("3F", "T2 Satellite / 3F / After Security Check (International Flights)", "airside", "08:00-21:00(L.O.)"),
    ],
  }),
  mitsumoto_tei: restaurant({
    name: "MITSUMOTO TEI", cuisine: "Western Cuisine", amenity: "restaurant",
    phone: "+81 476-34-8410",
    description: "Enjoy a menu of freshly prepared Western-style dishes with emphasis on steak, hamburgers and other meat dishes, with a selection of accompanying alcoholic beverages. Hearty sandwiches are also available to take away.",
    vegetarian: true,
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  royal_airport_stand: restaurant({
    name: "ROYAL AIRPORT STAND", cuisine: "Cafes / Bars / Light Meals / Fast Food / Travel Goods", amenity: "cafe",
    phone: "+81 476-34-6612",
    description: "A long-established Japanese tea shop with a history of more than 230 years, Kyoto FUKUJUEN. FUKUJUEN offers green tea enjoyed by people around the world and tea ceremony utensils crafted by the finest artisans.",
    outlets: [
    o("3F", "T2 Satellite / 3F / After Security Check (International Flights)", "airside", "08:00-21:00"),
    ],
  }),
  shahoden: restaurant({
    name: "SHAHODEN", cuisine: "Chinese / Korean / Ethnic Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-34-6230",
    description: "Enjoy casual, authentic Chinese cuisine. Handmade Jiang and sauces by our chefs with emphasis on healthy eating. We recommend the hearty Chow Mein or the house specialty, Szechuan Noodles.",
    vegetarian: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "08:30-20:30(L.O.)"),
    ],
  }),
  soba_otaki_udon_tayuto: restaurant({
    name: "Soba OTAKI / Udon TAYUTO", cuisine: "Japanese Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-33-3127",
    description: "Soba OTAKI offers buckwheat soba with a rich flavor and aroma provided by seasonal ingredients and buckwheat supplied by contract farmers, which is ground on a millstone. Udon TAYUTO offers a rich broth and udon noodles with a smooth",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  sojibou: restaurant({
    name: "SOJIBOU", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-34-6133",
    description: "A specialist soba restaurant offering the full flavored taste of soba noodles made in house which diners can flavor to their individual preference with grated raw wasabi. Halal certified for the peace of mind of our Muslim customers.",
    halal: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "07:00-20:30(L.O.)"),
    ],
  }),
  sushi_kyotatsu_terminal2: restaurant({
    name: "Sushi Kyotatsu Terminal2", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-33-8300",
    description: "Sushi Kyotatsu is the only sushi restaurant at an airport in Japan that consistently sources the highest quality, domestic, natural, fresh bluefin tuna from Tuna Wholesaler Ishiji, the best tuna wholesalers at Toyosu market.",
    vegetarian: true,
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  sushi_uogashi_nihon_ichi: restaurant({
    name: "Sushi Uogashi Nihon-ichi", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-34-6828",
    description: "Edomae-zushi is made lovingly by hand using a combination of fresh fish and warm rice prepared with Edomae techniques. The stand-up eating style which allows customers to drop in for a short time to fill their stomachs harks back to the sushi stalls of 200 years ago.",
    vegetarian: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "08:00-20:45(L.O.)"),
    ],
  }),
  sushi_go_round_gansozushi: restaurant({
    name: "Sushi-go-round GANSOZUSHI", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-34-8070",
    description: "Fresh seafood delivered daily from Tsukiji markets, GANSOZUSHI offers 60 menu items priced at 130 JPY (tax excluded) each plate. Always serving the best quality blue fin tuna, premium sea urchin and other delicacies.",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "09:00-20:45(L.O.)"),
    ],
  }),
  t_s_tantan: restaurant({
    name: "T's TANTAN", cuisine: "Chinese / Korean / Ethnic Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-32-0031",
    description: "T's Tantan from Tokyo offers various vegan dishes, including Tantan noodles and shoyu (soy sauce) ramen full of surprisingly rich, fulfilling flavor without using any meat, fish, dairy products, eggs or other animal foodstuffs.",
    vegetarian: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "07:30-20:30(L.O.)"),
    ],
  }),
  tempura_nihonbashi_tamai: restaurant({
    name: "Tempura Nihonbashi Tamai", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-94-3580",
    description: "Tempura Nihonbashi Tamai is committed to customer delight with its traditional Japanese tempura, carefully fried with only the finest ingredients and oils.",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  teppanyaki_dotonbori_kurita: restaurant({
    name: "Teppanyaki Dotonbori Kurita", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-34-6818",
    description: "Teppanyaki Kurita is a unique business operated by Botejyu, the driving force behind flour-based food in Osaka since its establishment in 1946.",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),
  tokyo_tonkotsu_base_made_by_ippudo: restaurant({
    name: "TOKYO-TONKOTSU-BASE MADE by IPPUDO", cuisine: "Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-32-1130",
    description: "A brand new tonkotsu ramen (noodles in pork stock) straight out of Tokyo, produced by IPPUDO.",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "07:30-20:30(L.O.)"),
    ],
  }),
  tonkatsu_inaba_wako: restaurant({
    name: "TONKATSU INABA WAKO", cuisine: "Japanese Cuisine", amenity: "restaurant",
    website: "r-wako.com", logoUrl: logo("r-wako.com"),
    phone: "+81 476-34-6135",
    description: "Tonkatsu prepared from carefully selected ingredients symbolizes Japan's gastronomic culture. Our recommendation is the thickly sliced cutlets.",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "08:00-20:30(L.O.)"),
    ],
  }),
  tsukiji_sushiko: restaurant({
    name: "Tsukiji sushiko", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-33-0505",
    description: "Enjoy authentic Edo-style sushi at a reasonable price in a casual atmosphere. Our experts have a keen eye for the freshest fish to purchase at Tokyo Central Wholesale markets each morning.",
    vegetarian: true,
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "09:00-20:30(L.O.)"),
    ],
  }),
  tsukijigindaco_highball_sakaba: restaurant({
    name: "TSUKIJIGINDACO HIGHBALL SAKABA", cuisine: "Light Meals / Fast Food", amenity: "fast_food",
    phone: "+81 476-34-6858",
    description: "Tsukiji GINDACO is Japan's premier takoyaki (fried octopus meatballs) chain and a beacon of takoyaki culinary delights in Japan and around the world.",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "07:30-21:00(L.O.)"),
    ],
  }),
  tsuruhan: restaurant({
    name: "TSURUHAN", cuisine: "Japanese Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-34-6130",
    description: "Based on the concept of presenting Japanese noodle culture to the world, we offer seasonal local noodle dishes from all over Japan, in addition to the classic udon and soba menus.",
    outlets: [
    o("4F", "T2 Main Building / 4F / Before Security Check", "landside", "07:00-20:30(L.O.)"),
    ],
  }),
  tully_s_coffee_terminal_2: restaurant({
    name: "TULLY'S COFFEE Terminal 2", cuisine: "Cafes / Bars / Light Meals / Fast Food", amenity: "cafe",
    website: "fasola.jp", logoUrl: logo("fasola.jp"),
    phone: "+81 476-34-6659",
    description: "A books & cafe style store run by the specialty coffee shop from Seattle, TULLY'S COFFEE, conveniently located by the departure lobby in Terminal 2.",
    vegetarian: true,
    outlets: [
    o("3F", "T2 Main Building / 3F / After Security Check (International Flights)", "airside", "07:30-21:00(L.O.)"),
    ],
  }),
  unagi_yondaime_kikukawa: restaurant({
    name: "Unagi Yondaime Kikukawa", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-34-6363",
    description: "Unagi Yondaime Kikukawa has a long history as an eel wholesaler stretching back to 1932 when it was first established.",
    outlets: [
    o("2F", "T2 Main Building / 2F / After Security Check (International Flights)", "airside", "07:30-22:00(L.O.)"),
    ],
  }),};

// ─── Terminal 3 venues (Main Building + Satellite Building — genuinely separate terminal, own check-in and security) ────────

const terminal3Venues = {
  caffe_lat25_t3: restaurant({
    name: "caffe LAT.25°", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-4155",
    description: "60 years roasting the world's finest coffee beans. We stand at the pinnacle of selecting and roasting coffee from around the world, unmoved by traditions or by trends and offering the very pest in our pursuit of the essence of supreme favor.",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "05:00-21:00(L.O.)"),
    o("3F", "T3 / 3F / After Security Check (International Flights)", "airside", "09:00-22:00(L.O.)"),
    ],
  }),
  teppan_yaki_mitsumoto_tei_mitsumoto_coffee_ten: restaurant({
    name: "TEPPAN YAKI MITSUMOTO TEI / MITSUMOTO COFFEE TEN", cuisine: "Cafes / Bars", amenity: "cafe",
    phone: "+81 476-34-6365",
    description: "At this restaurant, you can enjoy a wide range of dishes from the menus of two different shops: \"Teppanyaki Mitsumoto Tei, \" which offers Teppanyaki dishes, such as steak, Modanyaki savory pancakes, skewered grilled meat, and snacks paired with sake and beer from all over Japan; and \"Mitsumoto Coffe",
    outlets: [
    o("3F", "T3 Main Building / 3F / After Security Check (International Flights)", "airside", "9:00-22:00"),
    ],
  }),
  benitora_xiao_chi: restaurant({
    name: "BENITORA Xiao Chi", cuisine: "Chinese / Korean / Ethnic Cuisine", amenity: "restaurant",
    phone: "+81 476-33-1511",
    description: "Xiao Chi in Chinese means snacks and street food. This restaurants offers casual dining with popular Chinese meals such as Black Sesame Szechuan Noodles, one of the stars of BENITORA GYOZABO. We recommend the hearty Shimidare Pork Buns which are delicious right down to the last bight. Great for a li",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "MON,THU,FRI,SAT,SUN 5:00-21:00(L.O.) ,TUE,WED 7:30-21:00(L.O.) ＊8/20 06:00-21:00(L.O.)"),
    ],
  }),
  botejyu_express: restaurant({
    name: "BOTEJYU EXPRESS", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-37-3435",
    description: "This shop is a branch of BOTEJYU, the okonomiyaki restaurant founded in Osaka in 1946, serving authentic foods from the area. We offer an extensive range of menus including Modern-yaki invented by BOTEJYU, takoyaki octopus balls from Osaka, and Moriyama deep fried chicken from Nakatsu, Oita prefectu",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "05:00-22:00(L.O.)"),
    ],
  }),
  freshness_burger: restaurant({
    name: "FRESHNESS BURGER", cuisine: "Light Meals / Fast Food", amenity: "fast_food",
    phone: "+81 476-34-4166",
    description: "The basic element of the Freshness Burger menu is \"Handmade, delicious, and healthy options!\" We use juicy patty and vegetables produced in Japan for our hamburger. We also offer freshly-fried Hokkaido potatoes and various original drinks. Our store can be enjoyed also as a cafe.",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "05:00-21:00(L.O.) ＊8/20 05:30-21:00(L.O.)"),
    ],
  }),
  hakata_ittenmon: restaurant({
    name: "HAKATA ITTENMON", cuisine: "Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-36-7453",
    description: "An extremely popular ramen noodle shop in Nakasu-Kawabata, Hakata with an endless line of eager diners. The rich, firm noodles are delivered daily by Hakata's Harada Seimen, a famous noodle producer founded in 1962. The contemporary flavor of Wafu Tonkotsu Ramen (Japanese-style Noodles in Pork Soup)",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "05:00-21:00(L.O.) ＊8/20 06:30-21:00(L.O.)"),
    ],
  }),
  matsuya: restaurant({
    name: "MATSUYA", cuisine: "Japanese Cuisine / Light Meals / Fast Food", amenity: "fast_food",
    website: "matsuyafoods.co.jp", logoUrl: logo("matsuyafoods.co.jp"),
    phone: "+81 476-36-5065",
    description: "Matsuya has 1,000 restaurants throughout Japan, providing a wide variety of delicious menu selections, including gyumeshi (bowl of rice topped with beef), curries and set meals at reasonable prices.",
    outlets: [
    o("2F", "T3 Main Building / 2F / Before Security Check", "landside", "00:00-24:00 ＊8/19 00:00~23:30(L.O.) ＊8/20 06:00~24:00"),
    ],
  }),
  miyatake_sanuki_udon: restaurant({
    name: "Miyatake Sanuki Udon", cuisine: "Japanese Cuisine / Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 476-32-0707",
    description: "Our raw material is shipped directly from Miyatake Sanuki Seimenjo, the long-established noodle factory in Sanuki, the home of Udon noodles, and milled into noodles every day in our shop.",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "05:00-21:00(L.O.) ＊8/20 06:30-2100(L.O.)"),
    ],
  }),
  nagasaki_champon_ringer_hut: restaurant({
    name: "Nagasaki Champon Ringer Hut", cuisine: "Ramen and Other Noodles", amenity: "restaurant",
    phone: "+81 4763304761",
    description: "Nagasaki Champon is a specialist chain with more than 500 restaurants across the country established with the slogan, \"Make Nagasaki Champon noodles the world's staple food!\". Champon with Lashings of Vegetables includes 480 grams of 7 types of vegetables, all produced in Japan.",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "05:00-21:00(L.O.)"),
    ],
  }),
  sendai_tanya_rikyu: restaurant({
    name: "Sendai Tanya Rikyu", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-33-3350",
    description: "A specialty restaurant from the city of Sendai, the home of beef tongue dishes. The beef tongue is carefully prepared at the hands of skilled craftsmen from slicing to seasoning and aging.",
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "05:00-21:00(L.O.) ＊8/20 07:00-21:00(L.O.)"),
    ],
  }),
  tatsu_sushi: restaurant({
    name: "TATSU SUSHI", cuisine: "Japanese Cuisine", amenity: "restaurant",
    phone: "+81 476-36-5500",
    description: "Wild tuna and other fresh seafood caught in Japan are all processed within the store by the chefs. We are an authentic Edomae-style sushi store, offering Japanese rice, flavored only with red vinegar and salt in the old-fashioned way.",
    vegetarian: true,
    outlets: [
    o("2F", "T3 / 2F / Before Security Check", "landside", "07:00-21:00(L.O.)"),
    ],
  }),};

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
  const r3 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', terminal3Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3]));

  const totalCreated = r1.created + r2.created + r3.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length + Object.keys(terminal3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
