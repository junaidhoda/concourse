'use strict';
/**
 * Fills in complete data for Tokyo Haneda International Airport (HND) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-17 from the
 * official site, tokyo-haneda.com (Tokyo International Air Terminal Corp.),
 * using Claude in Chrome browser automation per this project's standing
 * convention (no WebFetch for venue data).
 *
 * METHODOLOGY: the Restaurant Search page
 * (tokyo-haneda.com/en/shop_and_dine/search_r.html) is a Vue 2 app whose
 * root instance `window.shopSearch` holds `$data.showItems` — the exact
 * 170-item list shown on the page (166 items tagged category:'レストラン'
 * (Restaurant) plus 4 tagged category:'ショップ' (Shop) whose own
 * subcategory also includes 'レストラン', i.e. combo shop+eatery listings).
 * Each item's `data` object carries id/category/subcategory/terminal
 * (raw Japanese)/floor/place (raw Japanese)/number/genre (raw Japanese
 * array)/area (raw Japanese: セキュリティチェック前=landside/before security,
 * セキュリティチェック後=airside/after security)/other tags (raw Japanese
 * array)/business_hours (per-day open/close arrays — note the nested field
 * is itself named `business_hours`, not `hours`). All of this is small,
 * enumerable, fixed-vocabulary Japanese (terminal/category/place/genre/
 * area/other — verified translated with zero missing mappings) rather than
 * free text, so it was translated to English via in-page JS dictionaries
 * BEFORE transcription, eliminating the risk of hand-copying Japanese
 * characters (an earlier attempt at raw-Japanese transcription silently
 * dropped ~195 characters on a large chunk and, even after shrinking chunk
 * size, produced 3 full-width/half-width space substitutions undetected by
 * eye — both caught via a length+checksum cross-check between the
 * in-browser JS value and the file written to disk, not by the user).
 * Remaining non-ASCII characters in real free text (a handful of venue
 * names containing É/é/curly quotes/full-width parens/ideographic spaces)
 * were reversibly encoded as `<U+XXXX>` codepoint placeholders and decoded
 * back to real characters during Python reconciliation. Data was
 * serialized with plain-ASCII `@@`/`##` delimiters (control-character
 * delimiters were tested first and found unsafe — they made
 * get_page_text report "no text content"), chunked into <=8.8KB pieces via
 * a `<pre>`+document.title relay, and each chunk verified against a
 * browser-computed length+checksum before being trusted, per this
 * project's dry-run verification discipline.
 *
 * Per-venue `description`/`phone`/`website` were NOT in the search-page
 * item data, so each of the 170 venues' own detail page
 * (/en/shop_and_dine/detail/tenant_<id>.html) was same-origin-fetched (10
 * concurrent) from within the browser tab, with the marketing description
 * pulled from `.store-detail__description` and phone/website pulled from
 * the "Shop Information" table's own labelled rows (`<th>Phone
 * Number</th>`/`<th>Website</th>`) rather than free-text regex — an
 * initial regex-based phone extraction silently truncated any number using
 * the site's full-width dash character (e.g. "03－6631－3810" -> "03"),
 * caught by cross-referencing one real page's rendered text against the
 * fetched value. 119 of 170 venues have a real external website link (bare
 * hostname kept per this project's convention); the rest are blank per the
 * no-fabrication rule — the site itself does not always link one.
 *
 * TERMINAL STRUCTURE: HND requires a 4-bucket structure — terminal_1,
 * terminal_2_domestic, terminal_2_international, terminal_3 — rather than
 * the simpler 1-bucket-per-physical-terminal pattern used at most other
 * airports in this project. Background research (Wikipedia, ANA's own
 * terminal guide, flyingsmarter.com) confirms Terminal 2's international
 * wing has its OWN dedicated check-in counter AND its own security
 * checkpoint (Checkpoint D), physically and operationally distinct from
 * Terminal 2's domestic side — so this project's "own check-in AND own
 * security" test was applied not just at the T1/T2/T3 level but WITHIN T2
 * itself. This was independently corroborated by the live site's own
 * filter UI (`all / T1 / T2 Domestic / T2 International / T3`) and by
 * directly clicking each T2 sub-tab and reading the resulting item count:
 * "T2 Domestic" sets `condition.terminal='第2ターミナル国内線'` and yields 50
 * items; "T2 International" sets `condition.terminal='第2ターミナル国際線'`
 * and yields 49 — both confirmed to include the same 39 "Domestic &
 * International" shared landside venues (raw terminal tag 第2ターミナル,
 * mapped here to T2SHARED). Rather than inventing a novel 5th bucket the
 * site's own UI doesn't expose, this script replicates that exact
 * dual-listing behavior: each of the 39 T2SHARED venues is duplicated into
 * BOTH terminal_2_domestic and terminal_2_international as a real, separate
 * outlet — not merely referenced — mirroring the site's own confirmed
 * behavior exactly (50 = 11 T2-Domestic-only + 39 shared;
 * 49 = 10 T2-International-only + 39 shared, verified live).
 *
 * MULTI-OUTLET / SAME-BRAND HANDLING: standard project rule — same-brand
 * outlets in the SAME terminal bucket merge into one doc with multiple
 * outlets[]; the same brand in different buckets stays separate per-bucket
 * docs. 5 such merges occurred: ARISO SUSHI (2 outlets, terminal_3),
 * Tully's Coffee (2 outlets, terminal_1), and — only visible AFTER the
 * T2SHARED duplication step above, since one occurrence of each pair
 * originates from a shared listing — Starbucks Coffee and Tully's Coffee
 * (terminal_2_domestic) and Ginza Kiya (terminal_2_international).
 *
 * AMENITY / CUISINE / HALAL / VEGETARIAN: cuisine = verbatim join of a
 * venue's own (now-English) genre tags, unfiltered, matching this
 * project's established convention of trusting a site's own taxonomy
 * as-is rather than curating it. amenity defaults to 'restaurant'; maps to
 * 'cafe' when the Cafe tag is present without a Japanese/Chinese cuisine
 * tag; maps to 'fast_food' when every genre tag is a non-cuisine
 * descriptor (Light Meals/Fast Food, Food Court, Groceries, Souvenirs,
 * Stationery & Sundries, Travel Goods, Books, Massage) with nothing else;
 * maps to 'bar' only for the small set of venues whose own name is
 * unambiguously bar/pub-branded AND which carry the Bar/Izakaya tag (HUB
 * Haneda Airport Terminal 2, World Wine Bar by Pieroth, Bar Rage, Café &
 * Bar BAR RAGE) — verified by reading each one's own description; every
 * other Bar/Izakaya-tagged venue is a Japanese izakaya-style restaurant,
 * not a standalone bar, and stays 'restaurant'. halal = true only when the
 * venue's own "Halal-friendly" other-tag is present (7 venues, incl. 2
 * duplicate vending-machine listings at different gates); vegetarian = true
 * only when "Vegetarian-friendly" is present (22 source rows / 26 docs
 * after T2SHARED duplication). No vegan/kosher/gluten-free tag exists in
 * HND's own taxonomy, so those fields stay blank per the no-fabrication
 * rule.
 *
 * LOCATION: `level` = the site's own floor label verbatim (e.g. "4F",
 * "B1F"); `location_notes` = the site's own named area/concourse
 * ("place", e.g. "Edo Koji", "Domestic Departure Gate Lounge (North)")
 * plus its shop number when given (e.g. "Edo Koji, Shop 36"); `airside` =
 * the site's own area classification, confirmed via its own two values
 * (セキュリティチェック前 = "before security check" = landside;
 * セキュリティチェック後 = "after security check" = airside) — this maps
 * directly onto this project's landside/airside convention, not an
 * inference. `opening_hours`/`open_24_7` are taken verbatim from each
 * venue's own per-day business_hours data (compact OSM-style string,
 * e.g. "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED"); the recurring
 * "Tu-Su:CLOSED" pattern on OPEN24 venues is the source data's own
 * placeholder quirk (business_hours only fully populates Monday), kept
 * verbatim rather than "corrected" per the no-fabrication rule.
 *
 * VERIFIED TOTALS: 170 raw dining/combo-shop listings (170 + 39 T2SHARED
 * duplicate outlets = 209 outlet-records) reconciled to 204 restaurant
 * docs / 209 outlets across 4 terminal buckets — terminal_1: 66 docs/67
 * outlets, terminal_2_domestic: 48 docs/50 outlets,
 * terminal_2_international: 48 docs/49 outlets, terminal_3: 42 docs/43
 * outlets (matching the site's own live T2 Domestic/International tab
 * counts of 50/49 exactly).
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['hnd', 'tokyo-haneda', 'haneda', 'tokyo-hnd'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2_DOMESTIC = 'terminal_2_domestic';
const TERMINAL_2_INTERNATIONAL = 'terminal_2_international';
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

// ─── Terminal 1 venues ────────────────────────────────────────────────────

const terminal1Venues = {
  temporarily_closed_ginza_lion_haneda_market_place: restaurant({
    name: "(temporarily closed) GINZA LION HANEDA MARKET PLACE",
    cuisine: "Western",
    description: "We offer a menu centered on Western cuisine that can be enjoyed by everyone from children to seniors, as well as a wide variety of draft beer and snacks that only a beer hall can offer. Feel free to come and enjoy a meal on a family trip, a company outing party or social gathering, or just a little free time while waiting for a plane to take off or land.The spacious restaurant has a total of 160 seats and includes four private rooms perfect for parties, accommodating between 10 and 60 people.",
    website: "ginzalion.jp",
    logoUrl: logo("ginzalion.jp"),
    phone: "03-5757-9130",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 25", "landside", "Mo:11:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  azusa: restaurant({
    name: "Azusa",
    cuisine: "Japanese / Chinese / Bar/Izakaya",
    description: "We offer soba and udon noodles made with our special broth, traditional ramen, and authentic Japanese and Chinese cuisine, all prepared in two separate kitchens.We offer a selection of alcoholic beverages and snacks, so please feel free to stop by even if you just want \"a quick drink.\"",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8895",
    amenity: "restaurant",
    outlets: [
      o("1F", "Arrival Lobby, Shop 32", "landside", "Mo-Su:11:00-15:30,17:00-21:00(LO20:30)", false),
    ],
  }),
  badiani: restaurant({
    name: "Badiani",
    cuisine: "Food Court / Light Meals/Fast Food",
    description: "Badiani, a long-established gelato shop from Florence, Italy, founded in 1932, has opened its first store in the Kanto region at Sora Chika in Haneda Airport's Terminal 1.The brand's signature pure white flavor, \"Buontalenti,\" is a masterpiece made from simple ingredients such as cream, milk, eggs, and sugar, following the original 16th-century gelato recipe. Enjoy the rich milk flavor and smooth texture.Additionally, we offer 7 to 10 varieties, including \"Buontalenti Dolce Vita,\" an award-winning product from a London contest, and a refreshing sorbet full of fruit. Be sure to enjoy the authentic flavors of Italy during your trip.",
    website: "badiani.juchheim.co.jp",
    logoUrl: logo("badiani.juchheim.co.jp"),
    phone: "03-3747-0231",
    amenity: "fast_food",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  caffe_beer_restaurant_miya: restaurant({
    name: "Caffe & Beer Restaurant MIYA",
    cuisine: "Western / Cafe",
    description: "The first restaurant in the airport to open a steak restaurant “Steak Palace” based on the concept of “delicious and fun”.You can enjoy safe and secure steak and 100% beef hamburger steak with the founding taste \"Miyano Sauce\".",
    website: "miya.com",
    logoUrl: logo("miya.com"),
    phone: "03-5579-7564",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Lobby, Shop 1", "landside", "Mo:9:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  caffe_lat_25_haneda: restaurant({
    name: "caffe LAT.25° HANEDA",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "Roasted coffee beans for 60 years.We have chosen coffees from around the world and have been roasting. .",
    website: "mmc-coffee.co.jp",
    logoUrl: logo("mmc-coffee.co.jp"),
    phone: "03-5757-8852",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Lobby, Shop 26", "landside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  cafe_bar_bar_rage: restaurant({
    name: "Café & Bar BAR RAGE",
    cuisine: "Western / Cafe / Food Court / Light Meals/Fast Food / Bar/Izakaya",
    description: "With a theme of \"MADE IN JAPAN,\" we offer fruit, beer, whiskey, cocktails, juice, smoothies, and we are particular about using domestically produced ingredients. Our concept is to convey the wonders of Japan to not only overseas customers, but also business people who travel all over Japan.We are waiting for you with a wide selection of coffee, bread, baked goods and desserts made in our own workshop, to meet your various needs from breakfast to lunch, cafe time and bar time.We will provide you with hospitality to ensure that you are satisfied with your time in Japan.",
    phone: "03-5579-7277",
    amenity: "bar",
    vegetarian: true,
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:07:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  curry_smile: restaurant({
    name: "CuRRy Smile",
    cuisine: "Western",
    description: "We offer a variety of curries with rich flavors, all served in visually appealing red bowls for easy eating.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8866",
    amenity: "restaurant",
    outlets: [
      o("1F", "Arrival Lobby, Shop 21", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  cuud: restaurant({
    name: "cuud",
    cuisine: "Japanese",
    description: "Please enjoy curry udon with spices in Japanese soup and boiled seasonal vegetables.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8857",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Lobby, Shop 5", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  dean_deluca_haneda_airport: restaurant({
    name: "DEAN & DELUCA HANEDA AIRPORT",
    cuisine: "Cafe / Souvenirs / Groceries",
    description: "Please use it for a break before your Flights a meeting. We also have many gifts recommended for souvenirs to visit. We look forward to your coming.",
    website: "deandeluca.co.jp",
    logoUrl: logo("deandeluca.co.jp"),
    phone: "03-5757-9605",
    amenity: "cafe",
    outlets: [
      o("B1F", "Market Place, Shop 4", "landside", "Mo:07:00-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  foot_bath_cafe_body_care_luck: restaurant({
    name: "Foot Bath Cafe＆Body Care LUCK",
    cuisine: "Cafe / Massage",
    description: "Relax and have some time for yourself. Would you like to charge your power in the glamping space?It is a body care shop that offers a footbath cafe with private baths and all rooms in private rooms.We offer body care by skilled staff in a spacious space.At the footbath cafe, we are waiting for you with 8 types of LUCK original herbal tea and 5 types of foot herbal spa.",
    website: "hanedaluck.com",
    logoUrl: logo("hanedaluck.com"),
    phone: "03-5579-7474",
    amenity: "cafe",
    outlets: [
      o("3F", "Terminal Lobby (South), Shop 5", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  gangnam_gimbap: restaurant({
    name: "Gangnam Gimbap",
    cuisine: "Food Court / Groceries",
    description: "A specialty store for kimbap (Korean seaweed rolls) made with carefully selected ingredients.This is a stylish and fashionable new fast food restaurant.In addition to kimbap, we also have a wide selection of popular Korean side dishes and bento boxes, including bibimbap and yangnyeom chicken.",
    website: "kimuchikan.co.jp",
    logoUrl: logo("kimuchikan.co.jp"),
    amenity: "fast_food",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ginza_lion: restaurant({
    name: "GINZA LION",
    cuisine: "Western / Bar/Izakaya",
    description: "It is a restaurant that focuses on a wide variety of Western dishes such as hamburgers, gratin, and pasta. Of course, there are many snacks, highballs and wines that are perfect for various varieties of draft beer and beer like a beer hall.There is also a private room for 20 people in the store, so we can accept parties.",
    website: "r.gnavi.co.jp",
    logoUrl: logo("r.gnavi.co.jp"),
    phone: "03-5757-9090",
    amenity: "restaurant",
    outlets: [
      o("1F", "Arrival Lobby, Shop 17", "landside", "Mo:11:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  gokoku_hojo_kuraichi: restaurant({
    name: "Gokoku Hojo Kuraichi",
    cuisine: "Japanese",
    description: "This shop serves specially made miso soup and handmade rice balls, made with carefully selected miso that is carefully selected for its aroma and flavor.Please enjoy a \"cup of bliss\" as you embark on your journey.*The store is located in the departure gate lounge, which is accessible only to boarding passengers.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8837",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 119", "airside", "Mo:06:15-18:00|Tu-Su:CLOSED", false),
    ],
  }),
  haneda_sanchokukan: restaurant({
    name: "Haneda Sanchokukan",
    cuisine: "Light Meals/Fast Food / Souvenirs",
    description: "Under the theme of \"Get to know Japan. Get to know it at Haneda,\" the store sells fresh seasonal vegetables and fruits, as well as local specialties from around Japan, including sweets and local sake, and also serves light meals such as soft serve ice cream and ramen.During limited-time events held in collaboration with local governments across the country, you can enjoy experiential content that allows you to experience the local culture, as well as local people introducing and selling their regional products, promoting tourism, and more.",
    website: "haneda-sanchokukan.jp",
    logoUrl: logo("haneda-sanchokukan.jp"),
    phone: "03-3747-0727",
    amenity: "fast_food",
    outlets: [
      o("2F", "Market Place, Shop 14", "landside", "Mo:10:00-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  haneda_sushiko: restaurant({
    name: "Haneda Sushiko",
    cuisine: "Japanese",
    description: "A sister store supervised by \"Ginza Sushiko Honten\", the ultimate in Edo-style sushi. Savor the culinary secrets and delights of Edo-mae sushi.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8838",
    amenity: "restaurant",
    outlets: [
      o("3F", "Market Place, Shop 11", "landside", "Mo-Fr:11:00-15:00(LO14:30),17:00-20:00(LO19:30)|Sa-Su:11:00-20:00(LO19:30)", false),
    ],
  }),
  haneda_taishoken: restaurant({
    name: "Haneda Taishoken",
    cuisine: "Chinese",
    description: "Special Morisoba is the spark of the tsukemen boom and the originator. Please enjoy the taste that has been loved for more than 45 years since the establishment.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8851",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Lobby, Shop 25", "landside", "Mo:10:00-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  hitoshinaya: restaurant({
    name: "Hitoshinaya",
    cuisine: "Japanese",
    description: "A small town house was born, with three stores - breakfast, donburi, and 100% buckwheat noodles - all under one roof.・Breakfast: This breakfast, with its strong dashi flavor, can be eaten all day long.・Rice bowl: A luxurious rice bowl made with marinated lean tuna and chewy fatty tuna mixed with mildly sour pickled plum vinegar.・Juwari Soba: Made with 100% stone-ground Hokkaido buckwheat flour. Enjoy the aroma of dashi, soba, and real wasabi.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8853",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Lobby, Shop 22", "landside", "Mo:05:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ichinoi: restaurant({
    name: "Ichinoi",
    cuisine: "Japanese",
    description: "Commitment of \"Ichinoi\".We offer flat homemade noodles with homemade noodles. You can enjoy rich flavor and rich texture. Try our seafood tempura bowl, made with home-polished rice and various toppings dipped in a rich sauce.",
    website: "kobe505.co.jp",
    logoUrl: logo("kobe505.co.jp"),
    phone: "03-5757-9505",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant North, Shop 23", "landside", "Mo:06:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  ikyutyaya: restaurant({
    name: "Ikyutyaya",
    cuisine: "Japanese / Western",
    description: "We offer premium beef tongue and egg rice bowls made with carefully selected red eggs.",
    website: "mmc-coffee.co.jp",
    logoUrl: logo("mmc-coffee.co.jp"),
    phone: "03-5757-9446",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant North, Shop 20", "landside", "Mo:11:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  isetan_haneda_store_men_s_terminal1_traveler_s_coffee: restaurant({
    name: "Isetan Haneda Store（Men's）Terminal1 TRAVELER‘S COFFEE",
    cuisine: "Cafe",
    description: "A cafe at the back of the Isetan Haneda Store, a select shop produced by Isetan Shinjuku Men's Building. You can enjoy coffee produced by Yoshiaki Kawashima, known as a coffee hunter. It is a calm space that you can not imagine inside the airport gate. The spacious chairs and tables, and the panorama of the runway taking off and landing through the window are impressive. Kawashima travels around the world's producing countries and finds not only attractive cups, but also food, alcohol and dessert menus. WI-FI environment and AC adapter are fully equipped so you can work in a little time ◎",
    phone: "03-5757-8700",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 123", "airside", "Mo:08:00-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  ishiusuhiki_soba_azumino: restaurant({
    name: "Ishiusuhiki soba AZUMINO",
    cuisine: "Japanese",
    description: "Nihachi soba noodles are made using buckwheat flour from Hokkaido and domestic wheat, and are milled on a stone mill at the Kurashina Flour Mill in Nagano Prefecture, resulting in a superior aroma and flavor. We also boast tempura made with wild shrimp, which goes perfectly with the soba noodles. Feel free to enjoy some before you depart.*The store is located in the departure gate lounge, which is accessible only to boarding passengers.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8841",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 120", "airside", "Mo-We:06:00-20:00(LO20:00)|Th-Fr:05:45-20:00(LO20:00)|Sa-Su:06:00-20:00(LO20:00)", false),
    ],
  }),
  jal_plaza_haneda_airport_domestic_terminal_gate_11_shop: restaurant({
    name: "JAL PLAZA Haneda Airport Domestic Terminal Gate 11 Shop",
    cuisine: "Cafe / Souvenirs / Groceries / Stationery & Sundries / Travel Goods",
    description: "In October 2023, the store name became \"JAL PLAZA\". We offer a wide variety of products, including Tokyo sightseeing souvenirs and items popular among business travelers and tourists, such as the ``Imperial Palace Gaien'' series and `` Ginza Sembikiya'' products. This store is convenient for customers to use. Please come and visit us. In addition, there is no distinction between snacks and combinations such as bento and draft beer, and you only have to pay once. The shop is located in the departure gate lounge area, which is only available to passengers who will be boarding a flight.*Arrival guests can use this service before going to Arrival Lobby",
    website: "jalplaza-airport.jalux.com",
    logoUrl: logo("jalplaza-airport.jalux.com"),
    phone: "03-5757-9491",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Gate Lounge (South), Shop 114", "airside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  jal_plaza_haneda_airport_domestic_terminal_gate_14_shop: restaurant({
    name: "JAL PLAZA Haneda Airport Domestic Terminal Gate 14 Shop",
    cuisine: "Cafe / Souvenirs / Groceries / Stationery & Sundries / Travel Goods",
    description: "In October 2023, the store name became \"JAL PLAZA\". We offer a wide variety of products, including Tokyo sightseeing souvenirs and items popular among business travelers and tourists, such as the ``Imperial Palace Gaien'' series and `` Ginza Sembikiya'' products. This store is convenient for customers to use. Please come and visit us. In addition, there is no distinction between snacks and combinations such as bento and draft beer, and you only have to pay once. The shop is located in the departure gate lounge area, which is only available to passengers who will be boarding a flight.*Arrival guests can use this service before going to Arrival Lobby",
    website: "jalplaza-airport.jalux.com",
    logoUrl: logo("jalplaza-airport.jalux.com"),
    phone: "03-5757-9335",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 122", "airside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  jal_plaza_haneda_airport_domestic_terminal_gate_7_snack: restaurant({
    name: "JAL PLAZA Haneda Airport Domestic Terminal Gate 7 Snack",
    cuisine: "Light Meals/Fast Food",
    description: "In October 2023, the store name will be \"JAL PLAZA\". We offer Chinese noodles from Harukiya in Ogikubo, Tokyo, the ramen shop that started the ramen boom. We also offer a variety of popular \"soba, udon, curry, and meat buns,\" so please feel free to stop by before your departure.The shop is located in the departure gate lounge area, which is only available to passengers who will be boarding a flight.* Arriving passengers can use the shop before going to the arrivals lobby.",
    website: "jalplaza-airport.jalux.com",
    logoUrl: logo("jalplaza-airport.jalux.com"),
    phone: "03-5757-9489",
    amenity: "fast_food",
    outlets: [
      o("2F", "Departure Gate Lounge (South), Shop 107", "airside", "Mo:06:10-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  japan_gourmet_port: restaurant({
    name: "Japan Gourmet Port",
    cuisine: "Japanese / Western / Chinese",
    description: "You can easily enjoy local specialties from all over Japan, such as curry, udon, and ramen, before boarding your flight.*The shop is located in the departure gate lounge, which is only accessible to passengers boarding a flight.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8859",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 121", "airside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  kaisendon_ginza_onodera_haneda_airport_terminal_1_store: restaurant({
    name: "Kaisendon Ginza Onodera Haneda Airport Terminal 1 Store",
    cuisine: "Japanese / Food Court",
    description: "\"Sushi Ginza Onodera\" served in a bowl.Even during your travel time, you can enjoy a bowl of rice packed with the attention to detail of Sushi Ginza Onodera.Enjoy red rice and fresh ingredients in a seafood bowl.",
    phone: "03-5579-7255",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:11:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  koganeiro_no_buta: restaurant({
    name: "KOGANEIRO NO BUTA",
    cuisine: "Japanese",
    description: "Carefully cooked carefully selected brand pigs one by one. We provide crispy and deep-fried tonkatsu freshly and hotly. You can enjoy your meal while watching the runway spreading out by the window and the arrival and departure of aircraft. You can see Mt. Fuji far away when the weather is nice.",
    phone: "03-5757-9044",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 4", "landside", "Mo:11:00-20:30|Tu-Fr:CLOSED|Sa-Su:10:00-20:30", false),
    ],
  }),
  krung_siam: restaurant({
    name: "Krung Siam",
    cuisine: "Chinese / Cafe / Bar/Izakaya",
    description: "Delivering \"HAPPY THAILAND\" to Haneda Airport!You can enjoy authentic Thai cuisine prepared by Thai chefs who have honed their skills at famous hotels in Thailand in an exotic atmosphere.We use fresh Thai herbs grown in our own farm, using elephant compost.All food items are available for takeout. Please feel free to ask us for adjustments to your spiciness.",
    website: "sscy.co.jp",
    logoUrl: logo("sscy.co.jp"),
    phone: "03-5579-7899",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("B1F", "Sora chika (Restaurant), Shop 11", "landside", "Mo:10:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  kuriya_kurogi_junchan: restaurant({
    name: "Kuriya Kurogi Junchan",
    cuisine: "Japanese / Food Court",
    description: "This food court-style tonkatsu specialty restaurant is overseen by Jun Kurogi, the owner and chef of Daimon Kurogi, a leading Japanese \"Tokyo Kappo\" restaurant with roots in the elegance of Edo. The restaurant offers set meals and katsu curry, centered around carefully selected pork and rice.It will be served in the style unique to Tokyo Kappo, with a specially made sauce and grated daikon radish.",
    website: "kurogi.co.jp",
    logoUrl: logo("kurogi.co.jp"),
    amenity: "restaurant",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:10:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  kyozen: restaurant({
    name: "Kyozen",
    cuisine: "Japanese",
    description: "Enjoy authentic Japanese cuisine (tempura, eel, sashimi, and kaiseki cuisine) in a relaxed and tranquil atmosphere. We also offer seasonal menus, ensuring you'll never tire of our restaurant, no matter how many times you visit.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8838",
    amenity: "restaurant",
    outlets: [
      o("3F", "Market Place, Shop 12", "landside", "Mo-Fr:11:00-15:00(LO14:30),17:00-20:00(LO19:45)|Sa-Su:11:00-20:00(LO19:45)", false),
    ],
  }),
  ldh_kitchen_the_tokyo_haneda: restaurant({
    name: "LDH kitchen THE TOKYO HANEDA",
    cuisine: "Japanese / Western / Cafe / Bar/Izakaya",
    description: "\"NEO TOKYO DINER\" The familiar casual diner menu has been transformed into an original menu that focuses on restaurant quality.It's exciting to see, and even more exciting to eat. Enjoy a colorful array of dishes straight from Tokyo while gazing out at different views of the airport throughout the day.",
    website: "ldhkitchen-thetokyohaneda.jp",
    logoUrl: logo("ldhkitchen-thetokyohaneda.jp"),
    phone: "03-5579-7461",
    amenity: "restaurant",
    outlets: [
      o("5F", "THE HANEDA HOUSE, Shop 17", "landside", "Mo:11:00-20:00|Tu-Fr:CLOSED|Sa-Su:11:00-21:00", false),
    ],
  }),
  machidashoten_gansoaburadou_nagaoka_shokudou: restaurant({
    name: "MACHIDASHOTEN GANSOABURADOU NAGAOKA SHOKUDOU",
    cuisine: "Chinese",
    description: "Three unique and popular ramen restaurants have opened on the South Terrace on the 3rd floor of Haneda Airport Terminal 1.Three restaurants with different tastes and styles will be gathered together at Haneda Airport, each offering their own unique flavors: Machida Shoten, a family ramen restaurant known for its rich and creamy pork bone soup; Ganso Yudo, where you can enjoy your own abura soba noodles with their specially selected noodles and a wide selection of table condiments; and Nagaoka Shokudo, which serves exquisite ginger soy sauce ramen with a light soup made with plenty of ginger and freshly cut pork.Machida Shoten: https://www.machidashoten.com/Ganso Aburado: https://www.ganso-aburado.com/Nagaoka Shokudo: https://www.gift-group.co.jp/brand/nagaoka-shokudou",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant South, Shop 3", "landside", "Mo:8:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  marufuku_coffee: restaurant({
    name: "MARUFUKU COFFEE",
    cuisine: "Cafe",
    description: "This coffee specialty store has been in business for about 90 years since it was founded in 1934, using its homemade roasting techniques and secret extraction methods. Please enjoy the \"ultimate strong coffee\" with its deep flavor and refreshing aftertaste.",
    phone: "03-5757-8865",
    amenity: "cafe",
    outlets: [
      o("1F", "Arrival Lobby, Shop 30", "landside", "Mo:08:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  matakoiya: restaurant({
    name: "Matakoiya",
    cuisine: "Japanese",
    description: "Stand-up sushi restaurant. Please enjoy the seasonal fresh fish and the proud drift ice southern bluefin tuna procured from Tsukiji every morning.The shop is located in the departure gate lounge area, which is only available to passengers who will be boarding a flight.* Arriving passengers can use the shop before going to the arrivals lobby.",
    website: "megumi-food.com",
    logoUrl: logo("megumi-food.com"),
    phone: "03-3747-0133",
    amenity: "restaurant",
    outlets: [
      o("2F", "Terrace Restaurant North, Shop 118", "airside", "Mo-Su:06:30-20:00", false),
    ],
  }),
  mitsumoto_coffee_ten_haneda_terminal_north_wing: restaurant({
    name: "MITSUMOTO COFFEE TEN HANEDA Terminal North Wing",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "This is an authentic coffee shop run by a long-established roaster in Yokohama with over 60 years of history.Based on the concept of \"delivering small moments of happiness to people all over the world,\" we are committed to providing high-quality drinks and food, and all of our coffee is roasted in our own factory.",
    website: "mmc-coffee.co.jp",
    logoUrl: logo("mmc-coffee.co.jp"),
    phone: "03-5757-8862",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 136", "airside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  mitsumoto_coffee_ten_haneda_terminal_south_wing: restaurant({
    name: "MITSUMOTO COFFEE TEN HANEDA Terminal South Wing",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "This is an authentic coffee shop run by a long-established roaster in Yokohama with over 60 years of history.Based on the concept of \"delivering small moments of happiness to people all over the world,\" we are committed to providing high-quality drinks and food, and all of our coffee is roasted in our own factory.",
    website: "mmc-coffee.co.jp",
    logoUrl: logo("mmc-coffee.co.jp"),
    phone: "03-5757-8864",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Gate Lounge (South), Shop 101", "airside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  musashi_no_mori_coffee_haneda_terminal_shop: restaurant({
    name: "Musashi No Mori Coffee HANEDA Terminal Shop",
    cuisine: "Cafe",
    description: "This cafe has comfortable sofas and chairs, their proud fluffy pancakes, speciality coffee, and a full menu of meals.",
    website: "skylark.co.jp",
    logoUrl: logo("skylark.co.jp"),
    phone: "03-6459-9888",
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("4F", "Market Place, Shop 3", "landside", "Mo:09:00-21:00|Tu-Fr:CLOSED|Sa-Su:08:00-21:00(LO20:00)", false),
    ],
  }),
  nanadashiya: restaurant({
    name: "NANADASHIYA",
    cuisine: "Chinese",
    description: "We offer a quick and authentic ramen noodle dish made with carefully selected broth. We also have a wide selection of beer and snacks, so you can enjoy the time before boarding.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8813",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 131", "airside", "Mo-Fr:10:30-20:00(LO19:30)|Sa-Su:06:30-20:00(LO19:30)", false),
    ],
  }),
  ningyochoimahan_haneda_terminal1_shop: restaurant({
    name: "Ningyochoimahan HANEDA Terminal1 Shop",
    cuisine: "Food Court / Souvenirs / Groceries",
    description: "Founded in 1895 as a beef hotpot restaurant, Ningyocho Imahan offers a convenient way to enjoy their proud bento lunches and side dishes. You can savor their sukiyaki bento lunches made with carefully selected Japanese Black beef, as well as Japanese Black beef minced cutlets, which are only available at Haneda Airport. Be sure to use them to accompany you on your comfortable flight.",
    amenity: "fast_food",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  onigiri_konga: restaurant({
    name: "Onigiri Konga",
    cuisine: "Japanese",
    description: "Using Hokkaido-grown \"Nanatsuboshi\" rice and carefully selected ingredients,Each item is carefully handcrafted using techniques that have been passed down for generations.At the Terminal 1 store, we are collaborating with \"Hokkaido Dosanko Plaza Haneda Airport Store,\"We offer original rice balls made with ingredients nurtured by the rich land and sea of Hokkaido.",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terminal Lobby (South), Shop 0", "landside", "Mo:7:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  pronto: restaurant({
    name: "PRONTO",
    cuisine: "Cafe / Bar/Izakaya",
    description: "During cafe time, you can enjoy freshly ground coffee, freshly baked bread, and freshly boiled pasta, perfect for a quick break or a full meal. During bar time, we have a wide variety of drinks on the menu, including draft beer and wine, as well as a food menu that goes well with alcohol, including pasta and pizza, regardless of genre.Cafe time is from 7:00 and bar time is from 17:30.",
    website: "pronto.co.jp",
    logoUrl: logo("pronto.co.jp"),
    phone: "03-5757-9598",
    amenity: "cafe",
    outlets: [
      o("1F", "Arrival Lobby, Shop 33", "landside", "Mo-Fr:07:00-23:00|Sa-Su:08:00-23:00(LO22:30)", false),
    ],
  }),
  ramen_honda_noodles_haneda_airport_terminal_1_branch: restaurant({
    name: "Ramen Honda Noodles Haneda Airport Terminal 1 Branch",
    cuisine: "Japanese / Food Court",
    description: "Honda Noodles was born as a new brand supervised by the owner of Honta Mensho, a restaurant that has produced many famous restaurant owners. They are committed to providing ramen made with Japanese ingredients from Haneda to all over Japan and the world!",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:07:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  ringerhut_premium_haneda_terminal_shop: restaurant({
    name: "ringerhut Premium haneda terminal Shop",
    cuisine: "Japanese / Light Meals/Fast Food",
    description: "Ringer Hut’s Premium line of restaurants was created to provide even more culinary delight. The champon and sara-udon noodles served here use a special soup with an enhanced umami flavor, and dishes at Premium locations include 14 new ingredients, such as squid tentacles, asari clams, and quail eggs.",
    website: "ringerhut.jp",
    logoUrl: logo("ringerhut.jp"),
    phone: "03-5579-7363",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Sora chika (Restaurant), Shop 9", "landside", "Mo:09:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  ristorante_mitsumoto_coffee_ten: restaurant({
    name: "Ristorante Mitsumoto coffee ten",
    cuisine: "Western / Cafe",
    description: "The concept is \"Temahima\"It is a full-fledged restaurant that has spared time and effort in terms of ingredients, space, and service.From light meals such as sandwiches and pancakes to authentic meals such as pasta and roast duckEnjoy the menu carefully created by the chef and pastry chef from the hotel with the coffee of the long-established roaster Mitsumoto Coffee.",
    website: "mmc-coffee.co.jp",
    logoUrl: logo("mmc-coffee.co.jp"),
    phone: "03-5757-8856",
    amenity: "cafe",
    outlets: [
      o("3F", "Terrace Restaurant South, Shop 4", "landside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ronherman_isetan_haneda_store: restaurant({
    name: "RonHerman ISETAN HANEDA STORE",
    cuisine: "Light Meals/Fast Food",
    description: "Our spacious and relaxing interior, where you can watch the airplanes from near the boarding gate, offers a variety of food, drinks, and sweets.Additionally, Ron Herman Cafe will be introducing its first-ever lemon cake stand.Enjoy this airplane-shaped lemon cake, available only at Isetan Haneda Store.We offer a comfortable space that accompanies each moment, whether it's a coffee break at the start of an exciting journey, or a moment to reflect on memories upon returning home from work or travel.",
    phone: "03-6835-3426",
    amenity: "fast_food",
    outlets: [
      o("2F", "Departure Gate Lounge (South), Shop 113", "airside", "Mo:08:00-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  royal_host_haneda_airport: restaurant({
    name: "ROYAL HOST haneda airport",
    cuisine: "Western",
    description: "Seats at the window overlook the runway, allowing you to enjoy a relaxing meal.",
    website: "royal-ahf.jp",
    logoUrl: logo("royal-ahf.jp"),
    phone: "03-5757-9020",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 5", "landside", "Mo:09:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  saiho_chinese_restaurant: restaurant({
    name: "Saiho Chinese Restaurant",
    cuisine: "Chinese",
    description: "1963. The year before the Tokyo Olympics, Haneda Airport opened a series of restaurants with the finest cuisine and service, and among them, the most popular “Chinese cuisine Ayame” was reopened. In addition to the popular menu at that time, please enjoy a variety of dishes from the chef who are particular about details, such as a new menu that makes you feel a new era.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8839",
    amenity: "restaurant",
    outlets: [
      o("3F", "Market Place, Shop 13", "landside", "Mo-Th:11:00-15:30(LO15:00),16:30-20:30(LO19:45)|Fr-Su:10:30-15:30(LO15:00),16:30-20:30(LO19:45)", false),
    ],
  }),
  shin_yamato: restaurant({
    name: "Shin-yamato",
    cuisine: "Japanese",
    description: "Located in the center of the departure lobby, our restaurant offers a wide selection of Japanese cuisine to relax you before your journey. We have ample seating that can accommodate large groups, and you can also enjoy a view of the garden inside the gate.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8843",
    amenity: "restaurant",
    outlets: [
      o("2F", "Market Place, Shop 13", "landside", "Mo:10:00-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  shinshu_soba_azumino: restaurant({
    name: "Shinshu soba AZUMINO",
    cuisine: "Japanese",
    description: "We are proud of our leaf wasabi soba, a specialty of Shinshu. We offer seasonal menus based on authentic raw soba noodles.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5757-8835",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 22", "landside", "Mo:11:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  soba_azumino: restaurant({
    name: "SOBA AZUMINO",
    cuisine: "Japanese / Food Court",
    description: "The salt soba noodles, made without any soy sauce and with the addition of the umami of scallops and shiitake mushrooms to a basic dashi stock made with bonito and kelp, have a unique flavor that cannot be found anywhere else.The clear soup, which allows you to enjoy the delicious flavor of seafood, is further enhanced by adding ginger and dried seaweed as condiments.",
    phone: "03-5757-8869",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:07:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  soba_restaurant_sora_north_wing: restaurant({
    name: "Soba restaurant SORA North wing",
    cuisine: "Japanese",
    description: "Located in the departure gate lounge, our restaurant serves authentic fresh soba noodles.We aim to provide quick service so that even passengers who don't have much time before boarding can easily enjoy their meal.",
    phone: "03-5757-8861",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Gate Lounge (North), Shop 133", "airside", "Mo:05:45-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  soba_restaurant_sora_south_wing: restaurant({
    name: "Soba restaurant SORA South wing",
    cuisine: "Japanese",
    description: "Located in the departure gate lounge, our restaurant serves authentic fresh soba noodles.We aim to provide quick service so that even passengers who don't have much time before boarding can easily enjoy their meal.",
    phone: "03-5757-8863",
    amenity: "restaurant",
    outlets: [
      o("2F", "Departure Gate Lounge (South), Shop 104", "airside", "Mo:05:45-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  sora_chika_food_court_restaurants: restaurant({
    name: "Sora chika (food court / Restaurants)",
    cuisine: "Japanese / Western / Chinese / Cafe / Food Court / Light Meals/Fast Food / Souvenirs / Groceries",
    description: "",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:07:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  starbucks_coffee_haneda_airport_terminal_1_station_marketplace_f: restaurant({
    name: "STARBUCKS COFFEE Haneda Airport Terminal 1 Station MarketPlace ３F",
    cuisine: "Cafe",
    description: "A specialty coffee store born in Seattle, USA. Enjoy a wide variety of drinks, pastries and sandwiches based on espresso extracted from high quality Arabica coffee beans.In addition, we also offer many original products such as coffee beans, coffee extraction equipment, mugs, etc. so that you can enjoy them at home.",
    phone: "03-5757-9088",
    amenity: "cafe",
    outlets: [
      o("3F", "Market Place, Shop 6", "landside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  starbucks_coffee_haneda_airport_terminal_1_station_the_haneda_house_5f: restaurant({
    name: "STARBUCKS COFFEE Haneda Airport Terminal 1 Station THE HANEDA HOUSE 5F",
    cuisine: "Cafe",
    description: "A specialty coffee store born in Seattle, USA. Enjoy a variety of drinks, pastries and sandwiches based on espresso extracted from high quality Arabica coffee beans.We also have many original products such as coffee beans, coffee extractors, and mugs that you can enjoy at home.You can see the runway and airplane takeoff and landing from the store.",
    phone: "03-5579-7410",
    amenity: "cafe",
    outlets: [
      o("5F", "THE HANEDA HOUSE, Shop 14", "landside", "Mo:06:30-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  subway: restaurant({
    name: "SUBWAY",
    cuisine: "Light Meals/Fast Food",
    description: "Subway, the world's No. 1 sandwich chain, offers the best sandwich experience for all customers, with over 40.000 stores worldwide!Subway creates sandwich culture in Japan!It is a custom-made sandwich made while listening to your preference in front of the customer.Over 70 million combinations of delicious sandwiches! Please enjoy a fresh sandwich with roast beef, chicken and plenty of vegetables on the bread baked in the shop.",
    website: "subway.co.jp",
    logoUrl: logo("subway.co.jp"),
    phone: "03-6459-9660",
    amenity: "fast_food",
    vegetarian: true,
    outlets: [
      o("B1F", "Terminal Lobby (South), Shop 19", "landside", "Mo:08:15-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  sushi_den: restaurant({
    name: "Sushi Den",
    cuisine: "Japanese",
    description: "This is a full-fledged Edo-style sushi restaurant. There is a set menu at the counter seat and a reasonable set menu at the table seat.",
    phone: "03-5757-9034",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 23", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  tendon_tenya_haneda_airport_shop: restaurant({
    name: "TENDON TENYA Haneda Airport Shop",
    cuisine: "Japanese",
    description: "Easy, delicious and enjoyable. It is a specialty store that provides traditional Japanese food culture, tempura and tempura at a more affordable price. As a store where businessmen and tourists using Haneda Airport can drop in comfortably, we will respond to both requests for eat-in and take-out.",
    phone: "03-5757-9046",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Sora chika (Restaurant), Shop 10", "landside", "Mo:09:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  tenho: restaurant({
    name: "TENHO",
    cuisine: "Chinese",
    description: "Ankake ramen \"Tenho noodles\" is exquisite. Lots of vegetables, very healthy! The lightly flavored shoyu ramen is one of our delicacies.",
    phone: "03-5757-9246",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Terminal Lobby (North), Shop 17", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  tully_s_coffee: restaurant({
    name: "Tully's Coffee",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "A specialty coffee shop originating from Seattle. They use carefully selected beans from all over the world, roast them domestically, and carefully extract each cup of espresso with a manual machine after an order is placed, striving for the highest quality in every process. In addition to drinks, they also offer light snacks that go well with coffee.",
    website: "shop.tullys.co.jp",
    logoUrl: logo("shop.tullys.co.jp"),
    phone: "03-5757-9490",
    amenity: "cafe",
    outlets: [
      o("2F", "Departure Gate Lounge (South), Shop 111", "airside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
      o("2F", "Departure Gate Lounge (North), Shop 125", "airside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  western_style_restaurant_ginza_grill_cardinal_express: restaurant({
    name: "Western-style Restaurant Ginza Grill Cardinal Express",
    cuisine: "Western / Food Court",
    description: "This Western-style restaurant in Tokyo Skytree Town's Solamachi offers a casual dining experience, offering the flavors of Ginza Grill Cardinal, a beloved Western restaurant for 13 years. In addition to the popular \"Fluffy Omelette Rice\" and \"Cardinal Plate with Hamburg Steak and Fried Shrimp,\" they also offer the \"Menchi-katsu with Black Wagyu Beef and Omelette Rice Plate,\" which is only available at Haneda Airport. In addition to the secret demi-glace sauce, you can choose from three special sauces (truffle mushroom, spice curry, and craft ketchup) to create your own unique dish.",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:10:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  withgreen_haneda_airport_terminal_1_store: restaurant({
    name: "WithGreen Haneda Airport Terminal 1 Store",
    cuisine: "Food Court / Light Meals/Fast Food",
    description: "WithGreen is a salad bowl specialty store with locations mainly in Tokyo. They offer salads that can be used as a main meal and are satisfying in just one bowl. Since their founding, they have been committed to using domestically grown vegetables, using ingredients carefully grown by Japanese farmers to spread the appeal of vegetables in each season.Please enjoy our salad bowls that allow you to experience the natural flavor of vegetables.",
    website: "withgreen.club",
    logoUrl: logo("withgreen.club"),
    phone: "03-5579-7388",
    amenity: "fast_food",
    vegetarian: true,
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  yakiniku_shinjyuku_kouei: restaurant({
    name: "yakiniku shinjyuku kouei",
    cuisine: "Japanese",
    description: "“Extreme taste” continues to be chosen in Kabukicho in the Yakiniku battlefield. Please enjoy the exquisite taste of carefully selected meat and secret sauce.",
    website: "horumonyakikouei.com",
    logoUrl: logo("horumonyakikouei.com"),
    phone: "03-5579-7780",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 21", "landside", "Mo-Fr:11:00-22:00(LO21:00)|Sa-Su:10:00-22:00(LO21:00)", false),
    ],
  }),
  yoshinoya_haneda_airport_domestic_terminal_gate_1_shop: restaurant({
    name: "YOSHINOYA Haneda Airport Domestic Terminal Gate 1 Shop",
    cuisine: "Light Meals/Fast Food",
    description: "Yoshinoya has been offering products and services for more than 110 years since its establishment, with a focus on “delicious, easy and fast”. It continues to evolve into a brand that is loved not only in Japan but around the world.",
    phone: "03-6459-9910",
    amenity: "fast_food",
    outlets: [
      o("3F", "Terrace Restaurant South, Shop 2", "landside", "Mo:07:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  yukiakari: restaurant({
    name: "YUKIAKARI",
    cuisine: "Chinese",
    description: "We have various menus such as soft drinks, alcohol and other items, mainly Sapporo ramen, and we are looking forward to your visit.",
    phone: "03-5757-9484",
    amenity: "restaurant",
    outlets: [
      o("1F", "Arrival Lobby, Shop 18", "landside", "Mo:09:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  yuupaimu: restaurant({
    name: "Yuupaimu",
    cuisine: "Food Court / Light Meals/Fast Food",
    description: "\"Yupaimu\" is a new type of pie specialty store from the Western confectionery manufacturer \"Juchheim.\" The brand's commitment is to use 100% butter in its pies, without using alternative fats or oils like margarine. They offer flavorful pies that highlight the richness and fragrant flavor of butter and a crispy texture. Their signature dish, the \"Kobe Beef Meat Pie,\" is baked with 432 layers of pie dough mixed with domestic butter, and a filling made with Kobe beef, chopped onions, and boiled eggs. The light and crispy pie is characterized by the rich, juicy flavor of the meat. For those with a sweet tooth, apple pie is also available. It's perfect for a break during your trip, a snack to take home, or as a gift.",
    website: "juchheim.co.jp",
    logoUrl: logo("juchheim.co.jp"),
    phone: "03-3747-0231",
    amenity: "fast_food",
    outlets: [
      o("B1F", "Sora chika (Food Court), Shop 7", "landside", "Mo:10:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
};

const terminal2DomesticVenues = {
  airport_grill_bar: restaurant({
    name: "Airport Grill & Bar",
    cuisine: "Western",
    description: "An authentic hamburger specialty store, featuring juicy, soft meat with overflowing juices.The large glass windows offer a beautiful view of Tokyo Bay and the runway, allowing you to enjoy your meal while watching planes take off and land.The sound and aroma of grilling hamburgers fills the restaurant, stimulating all five senses.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5756-0033",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 3", "landside", "Mo:11:00-20:30|Tu-Fr:CLOSED|Sa-Su:10:30-21:00", false),
    ],
  }),
  aloha_taco_company: restaurant({
    name: "Aloha Taco Company",
    cuisine: "Light Meals/Fast Food",
    description: "Founded in 1992 by Buffalo in Ota Ward, Big Island Flavors is a restaurant where you can enjoy Hawaiian-style tacos and homemade Wagyu corned beef sandwiches.",
    phone: "03-4400-5829",
    amenity: "fast_food",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 20", "landside", "Mo:08:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  amici_del_te: restaurant({
    name: "Amici del te",
    cuisine: "Cafe",
    description: "This café is located in the new observation room on the 5th floor of Terminal 2. The view is very good and you can enjoy the best coffee while watching the airplane taking off and landing from the runway. We also have a full menu of meals (pasta, etc.) and desserts (pancakes and parfaits).",
    phone: "03-6428-9333",
    amenity: "cafe",
    outlets: [
      o("5F", "Market Place, Shop 14", "landside", "Mo:09:00-19:30|Tu:CLOSED|We:HOLIDAY|Th-Su:CLOSED", false),
    ],
  }),
  ana_festa_haneda_gate_53_food_shop_soba_udon_noodles: restaurant({
    name: "ANA FESTA Haneda Gate 53 Food Shop (soba & udon noodles)",
    cuisine: "Japanese",
    description: "Soba and udon noodles are available in front of departure gate 53.The soba noodles are hand-made by ANA FESTA's dedicated craftsmen at the foot of the Northern Alps, using a stone mill to create a 28% buckwheat flour noodle with a strong aroma and firm texture. The dashi stock used is made with dried bonito flakes.*The store is located in the departure gate area, which only passengers boarding an airplane can enter.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "050-1707-8130",
    amenity: "restaurant",
    outlets: [
      o("2F", "Domestic Departure Gate Lounge (North), Shop 107", "airside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ana_festa_haneda_gate_60_food_shop: restaurant({
    name: "ANA FESTA Haneda Gate 60 Food Shop",
    cuisine: "Japanese",
    description: "The stone milled Nihachi soba is handmade at the foot of the Northern Alps, and the soup stock is made from Honbetsu. Onigiri is handmade in the store using domestic Koshihikari, Ariake seaweed and Okinawan salt. Please enjoy the special taste while looking at the airport and the sea in front of you for a moment before departure.* The store is located in the departure gate area where only passengers boarding an airplane can enter.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "050-1707-8130",
    amenity: "restaurant",
    outlets: [
      o("2F", "Domestic Departure Gate Lounge (North), Shop 119", "airside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ana_hangar_bay_kitchen: restaurant({
    name: "ANA Hangar bay Kitchen",
    cuisine: "Western / Cafe / Light Meals/Fast Food",
    description: "We serve a variety of Western-style meals, such as Salisbury steak and curry and rice with pork cutlet, and snacks and light meals like fried chicken, freshly ground coffee, and draft beer.You can enjoy a moment before boarding in a spacious space.* The store is located in the departure gate lounge, which only passengers boarding an airplane can enter. Please use the elevators and escalators on the 2nd floor to access the area.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "050-1707-8130",
    amenity: "cafe",
    outlets: [
      o("1F", "Domestic Departure Gate Lounge (North), Shop 117", "airside", "Mo:14:00-19:30|Tu-Su:CLOSED", false),
    ],
  }),
  beef_tongue_barbecue_shop_ara_sashimi_rice_bowl_shop_yakichi: restaurant({
    name: "Beef tongue barbecue shop ARA / Sashimi rice bowl shop YAKICHI",
    cuisine: "Japanese / Bar/Izakaya",
    description: "A low-fat, high-protein beef tongue shop that offers beef tongues in a true Sendai style. Taste the fresh seafood and make it even more delicious in the sunshade style. Charter available.",
    website: "ichirokudo.com",
    logoUrl: logo("ichirokudo.com"),
    phone: "03-5756-0078 03-5756-0078＃荒 03-5756-1188＃八吉",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Terminal Lobby (South), Shop 19", "landside", "Mo:09:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  beer_cafe: restaurant({
    name: "BEER CAFÉ+",
    cuisine: "Cafe",
    description: "Enjoy craft beer with tapas and sandwiches made with freshly sliced prosciutto sandwiched between soft, crisp French bread. We offer Kawagoe-based COEDO Beer in varieties like Marihana, Kyara, and Jet Black. We also offer bottled craft beers from around Japan and around the world.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8537",
    amenity: "cafe",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 10", "landside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  blue_seal: restaurant({
    name: "BLUE SEAL",
    cuisine: "Groceries",
    description: "“American-born in Okinawa” A taste that nurtures something that suits Okinawa's climate and taste while taking advantage of American original recipes is truly “American-born, Okinawa-grown ice cream”.",
    website: "blueseal.co.jp",
    logoUrl: logo("blueseal.co.jp"),
    phone: "03-6459-9078",
    amenity: "fast_food",
    outlets: [
      o("1F", "Domestic Arrival Lobby, Shop 9", "landside", "Mo:11:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  cafe_lounge_gate_53: restaurant({
    name: "Cafe Lounge Gate 53",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "Our restaurant is located in an open area at Haneda Airport, where you can feel the planes up close.You can enjoy the view of the sky through the large windows while slowly sipping on carefully brewed, specially selected coffee.Whether you're feeling excited at the start of your journey or just want to relax, a cup of fragrant tea will gently accompany you.Please enjoy a moment of relaxation in our special space before boarding.*The store is located in the departure gate lounge, which is only accessible to passengers boarding the plane.Please use the elevators and escalators on the 2nd floor to access the area.",
    phone: "03-5757-6147",
    amenity: "cafe",
    outlets: [
      o("3F", "Domestic Departure Gate Lounge (North), Shop 103", "airside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  cafe_nenrinya: restaurant({
    name: "CAFÉ nenrinya",
    cuisine: "Cafe / Light Meals/Fast Food / Souvenirs",
    description: "A special Baumkuchen cafe opened by Tokyo's leading Baumkuchen specialty store \"Nenrinya\" exclusively for customers traveling from Haneda Airport. Enjoy a moment before your Flights while relaxing on the living terrace with an open atrium. The most popular menu \"Hot Baumkuchen\" that you can enjoy with gelato. The drink menu is also abundant.* The store is located in the departure gate lounge, which only passengers boarding an airplane can enter.* As a measure to prevent the spread of the new coronavirus, we have changed the provision method of some menus and discontinued the provision.",
    website: "nenrinya.jp",
    logoUrl: logo("nenrinya.jp"),
    phone: "03-6428-8710",
    amenity: "cafe",
    outlets: [
      o("2F", "Domestic Departure Gate Lounge (North), Shop 111", "airside", "Mo:06:30-19:00|Tu-Su:CLOSED", false),
    ],
  }),
  castelmola: restaurant({
    name: "CASTELMOLA",
    cuisine: "Western / Cafe",
    description: "Grilled dishes using charcoal fire and authentic Italian dishes sold with a dedicated pizza kiln.“Friendliness” is our motto, so please feel free to use it.",
    website: "mmc-coffee.co.jp",
    logoUrl: logo("mmc-coffee.co.jp"),
    phone: "03-6459-9555",
    amenity: "cafe",
    outlets: [
      o("5F", "Market Place, Shop 15", "landside", "Mo-Su:11:00-15:00(LO14:30),17:00-21:00", false),
    ],
  }),
  china_town_deli: restaurant({
    name: "China Town Deli",
    cuisine: "Chinese / Food Court",
    description: "This is a store that deals with Chinese food in general, from Chinese lunches, side dishes, sweets, and dim sum. This time, we will open “Fu Tairo” and Hong Kong “Yan Chim Kee”.",
    phone: "03-5579-7779",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terminal Lobby (South), Shop 25", "landside", "Mo:09:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  comel_haneda_gate_63_shop: restaurant({
    name: "COMEL Haneda Gate 63 Shop",
    cuisine: "Light Meals/Fast Food",
    description: "At the COMEL Haneda Gate 63 Store, we hope to make rice a more familiar and convenient food while sharing Japanese food culture. Our rice burgers feature select ingredients, such as seafood and grilled meat, sandwiched between rice buns made from Japan-grown rice. Coffee, draft beer and bento are also available.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "050-1707-8130",
    amenity: "fast_food",
    outlets: [
      o("2F", "Domestic Departure Gate Lounge (South), Shop 122", "airside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  cuud: restaurant({
    name: "cuud",
    cuisine: "Japanese",
    description: "Please enjoy curry udon with spices in Japanese soup and boiled seasonal vegetables.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8525",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 7", "landside", "Mo:11:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  donsabatini: restaurant({
    name: "DONSABATINI",
    cuisine: "Western",
    description: "The second brand of Sabatini di Firenze, a long-established Ginza store.You can enjoy authentic Italian pasta made using the same recipe as our main restaurant.*We apologize for the inconvenience, but we will temporarily suspend sales of pizza and will only be selling pasta.",
    website: "cardinal-japan.com",
    logoUrl: logo("cardinal-japan.com"),
    phone: "03-6428-9210",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("4F", "Market Place, Shop 1", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  gansozushi_haneda_airport_terminal_2_store: restaurant({
    name: "Gansozushi HANEDA AIRPORT Terminal 2 Store",
    cuisine: "Japanese",
    description: "We offer fresh sushi that is hand-crafted by craftsmen and specializes in in-store cooking. We look forward to your visit.",
    website: "gansozushi.com",
    logoUrl: logo("gansozushi.com"),
    phone: "03-3747-0373",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 24", "landside", "Mo:10:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ggg_cafe: restaurant({
    name: "GGG CAFÉ",
    cuisine: "Western / Cafe / Light Meals/Fast Food",
    description: "We offer photogenic menu items such as salad plates with plenty of carefully selected vegetables and hearty omelet rice. The store is filled with greenery and is equipped with charging outlets, making it the perfect place to relax in a cafe.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8535",
    amenity: "cafe",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 9", "landside", "Mo:09:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ginza_kiya: restaurant({
    name: "Ginza Kiya",
    cuisine: "Japanese",
    description: "We are proud of our homemade udon soup stock and koji udon. Please enjoy authentic soba and sake lees. We also have a variety of kites.",
    website: "ginza-kiya.com",
    logoUrl: logo("ginza-kiya.com"),
    phone: "03-6428-9200",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 6", "landside", "Mo:06:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  gong_cha: restaurant({
    name: "Gong cha",
    cuisine: "Cafe",
    description: "Originating in Taiwan, Gong cha landed in Japan in 2015 and is a global tea café expanding worldwide. Through delicious tea carefully brewed in-store using high-quality tea leaves, with meticulous attention to water temperature and brewing time, and an exciting in-store experience, Gong cha aims to deliver \"a wonderful tea time\" to its customers. Moving forward, Gong cha will continue to strive to create a new tea culture, bringing \"happy tea time\" to our customers' daily lives.",
    website: "gongcha.co.jp",
    logoUrl: logo("gongcha.co.jp"),
    phone: "03-5579-7130",
    amenity: "cafe",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 0", "landside", "Mo:09:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  grilled_meat_rice_bowl_shop_tokyo_karubi: restaurant({
    name: "Grilled meat rice bowl shop TOKYO KARUBI",
    cuisine: "Japanese / Western / Light Meals/Fast Food / Bar/Izakaya",
    description: "\"We want you to enjoy the best meat in the best condition,\" says our customer, as a \"meat grill\" restaurant, rather than a \"yakiniku\" restaurant where customers grill the meat themselves, and we welcome you at Haneda Airport, the gateway to the world.",
    website: "ichirokudo.com",
    logoUrl: logo("ichirokudo.com"),
    phone: "03-5579-7788",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 7", "landside", "Mo:07:00-19:30|Tu-Su:CLOSED", false),
    ],
  }),
  gyoza_and_tanmen_ten: restaurant({
    name: "Gyoza and Tanmen TEN",
    cuisine: "Chinese",
    description: "The daily vegetable intake goal for adults (recommended by the Ministry of Health, Labor and Welfare)Our goal is to make our food easy to eat and delicious.As a specialty store of \"gyoza\" and \"tanmen\" that mainly use vegetables as ingredients,Gyoza to Tanmen Ten opened in October 2016.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8558",
    amenity: "restaurant",
    outlets: [
      o("1F", "Market Place, Shop 11", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  haneda_excel_hotel_tokyu_cafe_dining_flyer_s_table: restaurant({
    name: "HANEDA EXCEL HOTEL TOKYU cafe ＆ dining 「FLYER'S TABLE」",
    cuisine: "Japanese / Western / Chinese / Cafe / Bar/Izakaya",
    description: "A world-class cuisine is prepared in a bright atmosphere full of openness. A wide selection of Japanese and Western à la carte menus is available, with a buffet of Japanese and Western dishes in the morning, noodles such as pasta and Chinese noodles in the morning, and an a la carte menu such as rice and a lunch course.",
    website: "tokyuhotels.co.jp",
    logoUrl: logo("tokyuhotels.co.jp"),
    phone: "03-5756-6000",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("2F", "Domestic Departure Lobby, Shop 2", "landside", "Mo-Su:05:00-10:00,11:30-15:00,17:30-23:00", false),
    ],
  }),
  hub_haneda_airport_terminal_2: restaurant({
    name: "HUB Haneda Airport Terminal 2",
    cuisine: "Western / Light Meals/Fast Food / Bar/Izakaya",
    description: "A HUB is a ``center of a wheel'' and a ``place where people gather.'' We offer products at ``reasonable prices, like buying a weekly magazine'' in the ``luxurious atmosphere'' of an authentic British PUB. \"CASH ON DELIVERY SYSTEM\" where orders and payments are made at the cashier counter each time. There are no charges, so you can easily buy your favorite products at any time you like! Power taps and WiFi are also available, which can be a problem when traveling on business or traveling! Enjoy your time before your Flights with our signature fish and chips and original ale beer in hand, while watching the planes take off and land on the terrace!",
    website: "pub-hub.com",
    logoUrl: logo("pub-hub.com"),
    phone: "03-5579-7715",
    amenity: "bar",
    outlets: [
      o("5F", "UPPER DECK TOKYO, Shop 18", "landside", "Mo:11:00-22:00|Tu-Fr:CLOSED|Sa-Su:10:00-22:00", false),
    ],
  }),
  jiyugaoka_burger: restaurant({
    name: "JIYUGAOKA BURGER",
    cuisine: "Cafe / Food Court",
    description: "Based on the concept of “Reliable × Easy = Delicious”, we offer hamburgers that are friendly to the body and mind, using organic products as much as possible.",
    phone: "03-6459-9313",
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("3F", "Terrace Restaurant, Shop 21", "landside", "Mo:08:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  komeraku: restaurant({
    name: "Komeraku",
    cuisine: "Japanese",
    description: "We are particular about the soup stock, the rice, and the ingredients of the Japanese food culture, \"Ochazuke\". In addition, we have prepared a space where you can feel \"delicious\" with your family, friends, and even by yourself.",
    website: "komeraku.jp",
    logoUrl: logo("komeraku.jp"),
    phone: "03-5579-7988",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 5", "landside", "Mo:07:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  krispy_kreme_doughnuts: restaurant({
    name: "Krispy Kreme Doughnuts",
    cuisine: "Cafe",
    description: "This donut store was founded in the United States in 1937. Their \"Original GlazedⓇ\" is made using a secret recipe that has remained unchanged since the store's founding, and is known for its delicate softness when you hold it in your hand and its light texture that melts in your mouth. In addition to this, you can enjoy all of their donuts, from regular items to limited-time promotional items, as well as their carefully selected coffee and drinks. They are perfect for a quick break between trips, or as a souvenir when you return home.",
    website: "krispykreme.jp",
    logoUrl: logo("krispykreme.jp"),
    phone: "07064471155",
    amenity: "cafe",
    outlets: [
      o("B1F", "Market Place, Shop 13", "landside", "Mo:08:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  kuro_cho_bei: restaurant({
    name: "KURO CHO BEI",
    cuisine: "Japanese / Bar/Izakaya",
    description: "Grilled fish, grilled fish and stewed udon. From a set meal that can be used casually, it is a shop that can be conveniently used for both small meals and drinks.In a dress before the departure, and a moment of talk to heal fatigue after arrival. Please spend a relaxed time in the calm shop based on black.",
    website: "kiwa-group.co.jp",
    logoUrl: logo("kiwa-group.co.jp"),
    phone: "03-5757-6096",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 10", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  manjidou: restaurant({
    name: "MANJIDOU",
    cuisine: "Japanese / Bar/Izakaya",
    description: "A specialty restaurant of \"Inaniwa Umebushi,\" which is one of Japan's three major udon dishes and is a traditional Akita dish. Original noodles that are only available at the Haneda store are used at the Inaba Kojodo, a long-established Inaniwa noodle shop.",
    website: "granada-jp.net",
    logoUrl: logo("granada-jp.net"),
    phone: "03-5757-6611",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 9", "landside", "Mo:10:30-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  marugameseimen: restaurant({
    name: "MARUGAMESEIMEN",
    cuisine: "Japanese",
    description: "We make udon every day by handmade at the store.Smooth, sticky udon and freshly made tempura.We look forward to all the staff.",
    website: "marugame-seimen.com",
    logoUrl: logo("marugame-seimen.com"),
    phone: "03-5756-6057",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Terminal Lobby (South), Shop 18", "landside", "Mo:07:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  matakoiya: restaurant({
    name: "Matakoiya",
    cuisine: "Japanese",
    description: "Authentic Edomae sushi served standing up. Enjoy Edomae sushi made using traditional Japanese techniques, using fresh, seasonal fish delivered from Toyosu every morning and our prized drift ice southern tuna.In addition to sushi, we also offer sashimi, rice bowls, and alcohol that goes well with sushi. In addition to the standing counter and standing tables, table seating is also available.We create fresh surprises through the combination of ingredients and cooking methods, providing an enjoyable experience to customers from Japan and abroad who use the airport.You can order as little as one piece of your favorite topping. Please enjoy some fresh, authentic Edomae sushi before your flight. We look forward to welcoming you.",
    website: "megumi-food.com",
    logoUrl: logo("megumi-food.com"),
    phone: "03-5579-7702",
    amenity: "restaurant",
    outlets: [
      o("2F", "Domestic Departure Gate Lounge (North), Shop 132", "airside", "Mo-Th:10:00-20:00(LO19:45)|Fr-Su:07:00-20:00(LO19:45)", false),
    ],
  }),
  miss_korea: restaurant({
    name: "Miss Korea",
    cuisine: "Food Court",
    description: "Our restaurant is an organic restaurant JAS certified store. We use 100% organically grown rice grown in Japan based on the idea that food and medicine are the same source, and use JAS-certified organic onions, carrots, Japanese mustard spinach, shiitake mushrooms, bean sprouts, and lemons every day.In addition, we are particular about ingredients such as domestic organic tofu, eggs, soy sauce, sesame oil, sugar, and sesame, as well as seasonings.All the staff are looking forward to your visit.",
    website: "koraidou.com",
    logoUrl: logo("koraidou.com"),
    phone: "03-5756-6168",
    amenity: "fast_food",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 26", "landside", "Mo:08:30-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  mrs_istanbul: restaurant({
    name: "Mrs Istanbul",
    cuisine: "Light Meals/Fast Food",
    description: "Traditional Turkish cuisine, one of the world's three great cuisines, will be presented by a top chef from the country. Enjoy the food of Istanbul to your heart's content.",
    phone: "03-5756-6183",
    amenity: "fast_food",
    halal: true,
    vegetarian: true,
    outlets: [
      o("3F", "Terrace Restaurant, Shop 22", "landside", "Mo:07:30-20:30|Tu-Fr:CLOSED|Sa-Su:08:00-20:30(LO20:00)", false),
    ],
  }),
  nangokusyuka: restaurant({
    name: "NANGOKUSYUKA",
    cuisine: "Chinese",
    description: "A large panorama with a 180 ° view of the runway and the sea. An open space overlooking the airplane runway is unique to airport restaurants.Enjoy a variety of Chinese cuisine from a tropical liquor store with a flagship store in Harajuku in a comfortable spacePlease enjoy.We also offer various set menus recommended for those who want to enjoy meals during limited time.",
    website: "nangokusyuka.co.jp",
    logoUrl: logo("nangokusyuka.co.jp"),
    phone: "03-6428-9130",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 4", "landside", "Mo:11:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  numazu_uogashizushi: restaurant({
    name: "NUMAZU UOGASHIZUSHI",
    cuisine: "Japanese",
    description: "Our shop is a sushi bar with the right to compete in the Numazu Fish Market. Handles fresh seafood delivered directly from Numazu Port, with large material and low price. I'm doing my best to make a good word for your customers.",
    website: "uogashizushi.co.jp",
    logoUrl: logo("uogashizushi.co.jp"),
    phone: "03-5757-6600",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 5", "landside", "Mo:10:30-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  ozashiki_tempura_tenmasa: restaurant({
    name: "Ozashiki Tempura Tenmasa",
    cuisine: "Japanese",
    description: "A long-established tempura shop founded in 1927. We offer freshly fried food in front of you. The first was a store that served tempura to His Majesty before Emperor Showa.",
    website: "ten-masa.jp",
    logoUrl: logo("ten-masa.jp"),
    phone: "03-6428-9110",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 12", "landside", "Mo:11:30-22:00|Tu-Fr:CLOSED|Sa-Su:11:00-22:00", false),
    ],
  }),
  ramen_toridashiya: restaurant({
    name: "RAMEN TORIDASHIYA",
    cuisine: "Chinese",
    description: "The soup, made with whole domestic chicken, has a rich flavor that brings out the full flavor of the chicken.The special thin noodles that are coated with the soup and the homemade char siu made with carefully selected pork and chicken create a delicious dish that you will want to keep eating.Please enjoy a cup of our specialty.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8531",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 4", "landside", "Mo:10:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  sanuki_udon_hannyarin: restaurant({
    name: "Sanuki Udon Hannyarin",
    cuisine: "Japanese",
    description: "Wheat flour is organic wheat and carefully selected and blended with the best flour from the north to the south of Japan. Dashi is a blend of carefully selected domestic bonito and boiled raisins according to the season, such as Hokkaido natural konbu and Rishiri kelp. With no added ingredients, we always aim for safety and security. The water is mellow and soft, and the material taste is maximized.",
    phone: "03-5756-6163",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 23", "landside", "Mo:07:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  seaside_cafe_1: restaurant({
    name: "Seaside Cafe #1",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "Located in the departure gate lounge, our shop offers a wide selection of snacks and souvenirs, with a focus on boxed lunches that can be eaten on board. Even those who are short on time can easily make a purchase before boarding.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8571",
    amenity: "cafe",
    outlets: [
      o("2F", "Domestic Departure Gate Lounge (North), Shop 105", "airside", "Mo:05:30-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  shinjuku_acacia: restaurant({
    name: "SHINJUKU ACACIA",
    cuisine: "Western",
    description: "Since its founding in 1963, the Acacia specialty roll cabbage stew has been making. Wrapped beef pork broiled with fresh cabbage, boiled in chicken soup and cooked in white stew without using milk. It is also recommended that you eat while hot and hot rice. In addition, Hayashi rice, Indian-style spicy curry rice, scallop cream croquette, pork sauté, etc., you can quickly and securely prepare your stomach.",
    website: "restaurant-acacia.com",
    logoUrl: logo("restaurant-acacia.com"),
    phone: "03-6428-9511",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 6", "landside", "Mo:11:00-20:20|Tu-Su:CLOSED", false),
    ],
  }),
  soba_kappo_azumino: restaurant({
    name: "Soba Kappo AZUMINO",
    cuisine: "Japanese",
    description: "The restaurant is filled with the aroma of carefully made dashi broth and offers a selection of soba noodles. The most popular dish is the \"leaf wasabi soba,\" an addictive dish with a lingering, spicy flavor. In the Japanese-style, relaxed atmosphere, we also offer carefully selected Japanese sake and shochu, so you can enjoy our carefully selected soba noodles and alcohol not only at lunchtime but also in the evening.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8521",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 13", "landside", "Mo-Su:11:00-15:30,17:00-20:00", false),
    ],
  }),
  soba_sakedokoro_tsukijian: restaurant({
    name: "Soba Sakedokoro TSUKIJIAN",
    cuisine: "Japanese",
    description: "Soba and carefully selected dishes from Hokkaido.",
    phone: "03-6428-9119",
    amenity: "restaurant",
    outlets: [
      o("1F", "Market Place, Shop 12", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee",
    cuisine: "Cafe",
    description: "This is the only Book and Cafe at Haneda Airport, operated by Culture Convenience Club Co., Ltd. Why not spend some time in a wonderful space with carefully selected books and a variety of drinks and pastries based on espresso extracted from high-quality Arabica coffee beans?We also have many original products such as coffee beans, coffee brewing equipment, and mugs that you can enjoy at home.You can see the runway and planes taking off and landing from inside the store.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "03-5579-7870",
    amenity: "cafe",
    outlets: [
      o("4F", "International Departure Lobby, Shop 216", "landside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
      o("2F", "Domestic Departure Gate Lounge (North), Shop 108", "airside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  tachigui_soba_sakedokoro_tsukijitei: restaurant({
    name: "Tachigui Soba Sakedokoro TSUKIJITEI",
    cuisine: "Japanese",
    description: "We have soba noodles made with Edo-mae soup, sake and sake.",
    phone: "03-6428-9118",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Terminal Lobby (North), Shop 7", "landside", "Mo:07:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  tempura_soba_monzaemon: restaurant({
    name: "Tempura Soba Monzaemon",
    cuisine: "Japanese",
    description: "Monzaemon's commitment 1, strong soba boiled in a large feather pot, crispy tempura fried in a large pot 2, homemade noodle soba with rich flavor 3, Koshihikari from Niigata prefecture with the highest sweetness and stickiness 4, bonito flakes and mackerel flakes Elegant Kyoto-style soup stock using Ichiban Dashi 5, body-friendly rapeseed oil with zero cholesterol",
    website: "kobe505.co.jp",
    logoUrl: logo("kobe505.co.jp"),
    phone: "03-6428-9505",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 8", "landside", "Mo:06:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  tonkatsu_wako: restaurant({
    name: "TONKATSU WAKO",
    cuisine: "Japanese",
    description: "A safe and secure brand that has been loved by customers for over 60 years. As a tonkatsu specialty store, always try to make delicious menus casually, stable food quality through the succession of technology since its establishment, customer service that delivers smile and spirit, rice, miso soup, cabbage can be changed freely and satisfied with customers Only special dishes. We look forward to your visit.",
    website: "wako-group.co.jp",
    logoUrl: logo("wako-group.co.jp"),
    phone: "03-6428-9100",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 2", "landside", "Mo:11:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  tully_s_coffee: restaurant({
    name: "Tully's Coffee",
    cuisine: "Cafe",
    description: "This specialty coffee shop offers authentic espresso, made with carefully selected beans from around the world, pursuing the highest quality and handcrafted one cup at a time, allowing you to easily enjoy delicious coffee.Enjoy Tully's offerings, including seasonal specialty drinks that bring you delicious flavors with each season, coffee made with domestically roasted beans using only carefully selected Arabica beans from around the world, and luxuriously brewed espresso.We also have quick-serve sandwiches and hot dogs.All products can be carried on board, so you can enjoy them while waiting to board or during the flight.",
    website: "tullys.co.jp",
    logoUrl: logo("tullys.co.jp"),
    phone: "03-5579-7726",
    amenity: "cafe",
    outlets: [
      o("2F", "Domestic Departure Gate Lounge (North), Shop 115", "airside", "Mo:07:00-20:00|Tu-Su:CLOSED", false),
      o("1F", "Domestic Arrival Lobby, Shop 2", "landside", "Mo:07:30-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  world_wine_bar_by_pieroth: restaurant({
    name: "World Wine Bar by Pieroth",
    cuisine: "Western / Cafe / Food Court / Bar/Izakaya",
    description: "Along with Western-style snacks, you can easily enjoy refreshing German wines, famous wines from around the world, and champagne. (There is also a soft drink)",
    website: "pieroth.jp",
    logoUrl: logo("pieroth.jp"),
    phone: "03-5756-6157",
    amenity: "bar",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 19", "landside", "Mo:07:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
};

const terminal2InternationalVenues = {
  vending_machine_haneda_airport_original_matcha_baumkuchen_near_gate_70_halal_certified: restaurant({
    name: "(Vending Machine) Haneda Airport Original Matcha Baumkuchen（Near Gate 70）[Halal-Certified]",
    cuisine: "Light Meals/Fast Food / Groceries",
    description: "This moist Baumkuchen is made with fragrant domestic matcha green tea and baked slowly at a low temperature.As a product exclusive to Haneda Airport, the packaging features a design of \"Haneda Nihonbashi,\" a landmark located in Terminal 3.",
    amenity: "fast_food",
    halal: true,
    outlets: [
      o("2F", "International After Security Area, Shop 241", "airside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  airport_grill_bar: restaurant({
    name: "Airport Grill & Bar",
    cuisine: "Western",
    description: "An authentic hamburger specialty store, featuring juicy, soft meat with overflowing juices.The large glass windows offer a beautiful view of Tokyo Bay and the runway, allowing you to enjoy your meal while watching planes take off and land.The sound and aroma of grilling hamburgers fills the restaurant, stimulating all five senses.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-5756-0033",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 3", "landside", "Mo:11:00-20:30|Tu-Fr:CLOSED|Sa-Su:10:30-21:00", false),
    ],
  }),
  aloha_taco_company: restaurant({
    name: "Aloha Taco Company",
    cuisine: "Light Meals/Fast Food",
    description: "Founded in 1992 by Buffalo in Ota Ward, Big Island Flavors is a restaurant where you can enjoy Hawaiian-style tacos and homemade Wagyu corned beef sandwiches.",
    phone: "03-4400-5829",
    amenity: "fast_food",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 20", "landside", "Mo:08:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  amici_del_te: restaurant({
    name: "Amici del te",
    cuisine: "Cafe",
    description: "This café is located in the new observation room on the 5th floor of Terminal 2. The view is very good and you can enjoy the best coffee while watching the airplane taking off and landing from the runway. We also have a full menu of meals (pasta, etc.) and desserts (pancakes and parfaits).",
    phone: "03-6428-9333",
    amenity: "cafe",
    outlets: [
      o("5F", "Market Place, Shop 14", "landside", "Mo:09:00-19:30|Tu:CLOSED|We:HOLIDAY|Th-Su:CLOSED", false),
    ],
  }),
  beef_tongue_barbecue_shop_ara_sashimi_rice_bowl_shop_yakichi: restaurant({
    name: "Beef tongue barbecue shop ARA / Sashimi rice bowl shop YAKICHI",
    cuisine: "Japanese / Bar/Izakaya",
    description: "A low-fat, high-protein beef tongue shop that offers beef tongues in a true Sendai style. Taste the fresh seafood and make it even more delicious in the sunshade style. Charter available.",
    website: "ichirokudo.com",
    logoUrl: logo("ichirokudo.com"),
    phone: "03-5756-0078 03-5756-0078＃荒 03-5756-1188＃八吉",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Terminal Lobby (South), Shop 19", "landside", "Mo:09:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  beer_cafe: restaurant({
    name: "BEER CAFÉ+",
    cuisine: "Cafe",
    description: "Enjoy craft beer with tapas and sandwiches made with freshly sliced prosciutto sandwiched between soft, crisp French bread. We offer Kawagoe-based COEDO Beer in varieties like Marihana, Kyara, and Jet Black. We also offer bottled craft beers from around Japan and around the world.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8537",
    amenity: "cafe",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 10", "landside", "Mo:06:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  blue_seal: restaurant({
    name: "BLUE SEAL",
    cuisine: "Groceries",
    description: "“American-born in Okinawa” A taste that nurtures something that suits Okinawa's climate and taste while taking advantage of American original recipes is truly “American-born, Okinawa-grown ice cream”.",
    website: "blueseal.co.jp",
    logoUrl: logo("blueseal.co.jp"),
    phone: "03-6459-9078",
    amenity: "fast_food",
    outlets: [
      o("1F", "Domestic Arrival Lobby, Shop 9", "landside", "Mo:11:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  castelmola: restaurant({
    name: "CASTELMOLA",
    cuisine: "Western / Cafe",
    description: "Grilled dishes using charcoal fire and authentic Italian dishes sold with a dedicated pizza kiln.“Friendliness” is our motto, so please feel free to use it.",
    website: "mmc-coffee.co.jp",
    logoUrl: logo("mmc-coffee.co.jp"),
    phone: "03-6459-9555",
    amenity: "cafe",
    outlets: [
      o("5F", "Market Place, Shop 15", "landside", "Mo-Su:11:00-15:00(LO14:30),17:00-21:00", false),
    ],
  }),
  china_town_deli: restaurant({
    name: "China Town Deli",
    cuisine: "Chinese / Food Court",
    description: "This is a store that deals with Chinese food in general, from Chinese lunches, side dishes, sweets, and dim sum. This time, we will open “Fu Tairo” and Hong Kong “Yan Chim Kee”.",
    phone: "03-5579-7779",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terminal Lobby (South), Shop 25", "landside", "Mo:09:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  cuud: restaurant({
    name: "cuud",
    cuisine: "Japanese",
    description: "Please enjoy curry udon with spices in Japanese soup and boiled seasonal vegetables.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8525",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 7", "landside", "Mo:11:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  donsabatini: restaurant({
    name: "DONSABATINI",
    cuisine: "Western",
    description: "The second brand of Sabatini di Firenze, a long-established Ginza store.You can enjoy authentic Italian pasta made using the same recipe as our main restaurant.*We apologize for the inconvenience, but we will temporarily suspend sales of pizza and will only be selling pasta.",
    website: "cardinal-japan.com",
    logoUrl: logo("cardinal-japan.com"),
    phone: "03-6428-9210",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("4F", "Market Place, Shop 1", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  gansozushi_haneda_airport_terminal_2_store: restaurant({
    name: "Gansozushi HANEDA AIRPORT Terminal 2 Store",
    cuisine: "Japanese",
    description: "We offer fresh sushi that is hand-crafted by craftsmen and specializes in in-store cooking. We look forward to your visit.",
    website: "gansozushi.com",
    logoUrl: logo("gansozushi.com"),
    phone: "03-3747-0373",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 24", "landside", "Mo:10:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ggg_cafe: restaurant({
    name: "GGG CAFÉ",
    cuisine: "Western / Cafe / Light Meals/Fast Food",
    description: "We offer photogenic menu items such as salad plates with plenty of carefully selected vegetables and hearty omelet rice. The store is filled with greenery and is equipped with charging outlets, making it the perfect place to relax in a cafe.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8535",
    amenity: "cafe",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 9", "landside", "Mo:09:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  ginza_kiya: restaurant({
    name: "Ginza Kiya",
    cuisine: "Japanese / Food Court",
    description: "We are proud of our homemade udon soup stock and koji udon. Please enjoy authentic soba and sake lees. We also have a variety of kites.",
    website: "ginza-kiya.com",
    logoUrl: logo("ginza-kiya.com"),
    phone: "03-6428-9200",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 6", "landside", "Mo:06:00-21:00|Tu-Su:CLOSED", false),
      o("2F", "International After Security Area, Shop 230", "airside", "Mo-Fr:00:00-01:00,6:45-12:00,18:30-23:59|Sa-Su:6:45-12:00,18:30-22:00", false),
    ],
  }),
  grilled_meat_rice_bowl_shop_tokyo_karubi: restaurant({
    name: "Grilled meat rice bowl shop TOKYO KARUBI",
    cuisine: "Japanese / Western / Light Meals/Fast Food / Bar/Izakaya",
    description: "\"We want you to enjoy the best meat in the best condition,\" says our customer, as a \"meat grill\" restaurant, rather than a \"yakiniku\" restaurant where customers grill the meat themselves, and we welcome you at Haneda Airport, the gateway to the world.",
    website: "ichirokudo.com",
    logoUrl: logo("ichirokudo.com"),
    phone: "03-5579-7788",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 7", "landside", "Mo:07:00-19:30|Tu-Su:CLOSED", false),
    ],
  }),
  gyoza_and_tanmen_ten: restaurant({
    name: "Gyoza and Tanmen TEN",
    cuisine: "Chinese",
    description: "The daily vegetable intake goal for adults (recommended by the Ministry of Health, Labor and Welfare)Our goal is to make our food easy to eat and delicious.As a specialty store of \"gyoza\" and \"tanmen\" that mainly use vegetables as ingredients,Gyoza to Tanmen Ten opened in October 2016.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8558",
    amenity: "restaurant",
    outlets: [
      o("1F", "Market Place, Shop 11", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  haneda_excel_hotel_tokyu_cafe_dining_flyer_s_table: restaurant({
    name: "HANEDA EXCEL HOTEL TOKYU cafe ＆ dining 「FLYER'S TABLE」",
    cuisine: "Japanese / Western / Chinese / Cafe / Bar/Izakaya",
    description: "A world-class cuisine is prepared in a bright atmosphere full of openness. A wide selection of Japanese and Western à la carte menus is available, with a buffet of Japanese and Western dishes in the morning, noodles such as pasta and Chinese noodles in the morning, and an a la carte menu such as rice and a lunch course.",
    website: "tokyuhotels.co.jp",
    logoUrl: logo("tokyuhotels.co.jp"),
    phone: "03-5756-6000",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("2F", "Domestic Departure Lobby, Shop 2", "landside", "Mo-Su:05:00-10:00,11:30-15:00,17:30-23:00", false),
    ],
  }),
  hitoshinaya: restaurant({
    name: "Hitoshinaya",
    cuisine: "Japanese",
    description: "The long-awaited second store of \"Hitoshinaya,\" a specialty store that focuses on \"hitoshina\" and is supervised by Hiroshi Nagashima, who has been awarded the \"Contemporary Master Craftsman\" award.We offer dishes such as a yakiniku-style rice bowl made with Japanese black beef, a grilled salmon set meal made with plump sockeye salmon, and a Vegetarian menu of grilled vegetable curry.",
    phone: "03-6428-5860",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("2F", "International After Security Area, Shop 229", "airside", "Mo-Su:06:30-22:30", false),
    ],
  }),
  hub_haneda_airport_terminal_2: restaurant({
    name: "HUB Haneda Airport Terminal 2",
    cuisine: "Western / Light Meals/Fast Food / Bar/Izakaya",
    description: "A HUB is a ``center of a wheel'' and a ``place where people gather.'' We offer products at ``reasonable prices, like buying a weekly magazine'' in the ``luxurious atmosphere'' of an authentic British PUB. \"CASH ON DELIVERY SYSTEM\" where orders and payments are made at the cashier counter each time. There are no charges, so you can easily buy your favorite products at any time you like! Power taps and WiFi are also available, which can be a problem when traveling on business or traveling! Enjoy your time before your Flights with our signature fish and chips and original ale beer in hand, while watching the planes take off and land on the terrace!",
    website: "pub-hub.com",
    logoUrl: logo("pub-hub.com"),
    phone: "03-5579-7715",
    amenity: "bar",
    outlets: [
      o("5F", "UPPER DECK TOKYO, Shop 18", "landside", "Mo:11:00-22:00|Tu-Fr:CLOSED|Sa-Su:10:00-22:00", false),
    ],
  }),
  ishiya_cafe_airport: restaurant({
    name: "ISHIYA CAFÉ AIRPORT",
    cuisine: "Cafe",
    description: "ISHIYA CAFÉ is a collaboration with ISHIYA, the maker of Shiroi Koibito, a famous Hokkaido confectionery that is also popular among overseas customers. We offer Shiroi Koibito soft serve ice cream, coffee, and more. We also have bento boxes and bottled drinks that you can bring on board. We look forward to your visit.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "050-1707-8130",
    amenity: "cafe",
    outlets: [
      o("2F", "International After Security Area, Shop 238", "airside", "Mo-Su:00:00-01:30,06:30-12:10,13:30-23:59", false),
    ],
  }),
  jiyugaoka_burger: restaurant({
    name: "JIYUGAOKA BURGER",
    cuisine: "Cafe / Food Court",
    description: "Based on the concept of “Reliable × Easy = Delicious”, we offer hamburgers that are friendly to the body and mind, using organic products as much as possible.",
    phone: "03-6459-9313",
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("3F", "Terrace Restaurant, Shop 21", "landside", "Mo:08:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  kangei_haneda_airport_terminal_2_shop: restaurant({
    name: "KANGEI Haneda Airport Terminal 2 shop",
    cuisine: "Chinese",
    description: "Founded in 1985, we are a ``Chinese restaurant welcome'' located in Kamata, Ota-ku, Tokyo, famous for ``feather dumplings''. This is a restaurant where you can enjoy authentic Chinese home-cooked food at an affordable price. Dumplings, other dim sum, noodles, etc. are handmade in the central kitchen and delivered fresh directly from the central kitchen in Kamata every day. Please enjoy our delicious ``feathered gyoza''.",
    website: "kangeigyoza.com",
    logoUrl: logo("kangeigyoza.com"),
    phone: "03-5579-7797",
    amenity: "restaurant",
    outlets: [
      o("2F", "International After Security Area, Shop 232", "airside", "Mo-Su:0:00-1:05,6:30-23:59", false),
    ],
  }),
  komeraku: restaurant({
    name: "Komeraku",
    cuisine: "Japanese",
    description: "We are particular about the soup stock, the rice, and the ingredients of the Japanese food culture, \"Ochazuke\". In addition, we have prepared a space where you can feel \"delicious\" with your family, friends, and even by yourself.",
    website: "komeraku.jp",
    logoUrl: logo("komeraku.jp"),
    phone: "03-5579-7988",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 5", "landside", "Mo:07:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  krispy_kreme_doughnuts: restaurant({
    name: "Krispy Kreme Doughnuts",
    cuisine: "Cafe",
    description: "This donut store was founded in the United States in 1937. Their \"Original GlazedⓇ\" is made using a secret recipe that has remained unchanged since the store's founding, and is known for its delicate softness when you hold it in your hand and its light texture that melts in your mouth. In addition to this, you can enjoy all of their donuts, from regular items to limited-time promotional items, as well as their carefully selected coffee and drinks. They are perfect for a quick break between trips, or as a souvenir when you return home.",
    website: "krispykreme.jp",
    logoUrl: logo("krispykreme.jp"),
    phone: "07064471155",
    amenity: "cafe",
    outlets: [
      o("B1F", "Market Place, Shop 13", "landside", "Mo:08:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  kuro_cho_bei: restaurant({
    name: "KURO CHO BEI",
    cuisine: "Japanese / Bar/Izakaya",
    description: "Grilled fish, grilled fish and stewed udon. From a set meal that can be used casually, it is a shop that can be conveniently used for both small meals and drinks.In a dress before the departure, and a moment of talk to heal fatigue after arrival. Please spend a relaxed time in the calm shop based on black.",
    website: "kiwa-group.co.jp",
    logoUrl: logo("kiwa-group.co.jp"),
    phone: "03-5757-6096",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 10", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  manjidou: restaurant({
    name: "MANJIDOU",
    cuisine: "Japanese / Bar/Izakaya",
    description: "A specialty restaurant of \"Inaniwa Umebushi,\" which is one of Japan's three major udon dishes and is a traditional Akita dish. Original noodles that are only available at the Haneda store are used at the Inaba Kojodo, a long-established Inaniwa noodle shop.",
    website: "granada-jp.net",
    logoUrl: logo("granada-jp.net"),
    phone: "03-5757-6611",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 9", "landside", "Mo:10:30-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  marugameseimen: restaurant({
    name: "MARUGAMESEIMEN",
    cuisine: "Japanese",
    description: "We make udon every day by handmade at the store.Smooth, sticky udon and freshly made tempura.We look forward to all the staff.",
    website: "marugame-seimen.com",
    logoUrl: logo("marugame-seimen.com"),
    phone: "03-5756-6057",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Terminal Lobby (South), Shop 18", "landside", "Mo:07:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  matakoiya_terminal_2_international_wing: restaurant({
    name: "MATAKOIYA_Terminal 2 International Wing",
    cuisine: "Japanese / Food Court",
    description: "Enjoy a satisfying seafood bowl featuring fresh tuna and salmon, highlighting the natural flavors of the ingredients.With a focus on freshness and flavor, we want both Japanese customers and visitors from overseas to easily experience the delicious taste of authentic seafood.",
    website: "megumi-food.com",
    logoUrl: logo("megumi-food.com"),
    phone: "03-5579-7752",
    amenity: "restaurant",
    outlets: [
      o("2F", "International After Security Area, Shop 228", "airside", "Mo-Su:07:00-14:00", false),
    ],
  }),
  miss_korea: restaurant({
    name: "Miss Korea",
    cuisine: "Food Court",
    description: "Our restaurant is an organic restaurant JAS certified store. We use 100% organically grown rice grown in Japan based on the idea that food and medicine are the same source, and use JAS-certified organic onions, carrots, Japanese mustard spinach, shiitake mushrooms, bean sprouts, and lemons every day.In addition, we are particular about ingredients such as domestic organic tofu, eggs, soy sauce, sesame oil, sugar, and sesame, as well as seasonings.All the staff are looking forward to your visit.",
    website: "koraidou.com",
    logoUrl: logo("koraidou.com"),
    phone: "03-5756-6168",
    amenity: "fast_food",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 26", "landside", "Mo:08:30-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  mitsumoto_coffee_shop: restaurant({
    name: "MITSUMOTO COFFEE SHOP",
    cuisine: "Cafe",
    description: "Please enjoy \"a little happiness\" before leaving in a full-fledged cafe delivered by the well-established roaster \"MITSUMOTO COFFEE\" which has been in Yokohama for over 60 years.In addition to coffee and other drinks, you can also bring home sandwiches and freshly made hot dogs and hot sands.",
    phone: "03-5579-7855",
    amenity: "cafe",
    outlets: [
      o("2F", "International After Security Area, Shop 239", "airside", "Mo-Su:06:30-11:00,17:00-22:30", false),
    ],
  }),
  mrs_istanbul: restaurant({
    name: "Mrs Istanbul",
    cuisine: "Light Meals/Fast Food",
    description: "Traditional Turkish cuisine, one of the world's three great cuisines, will be presented by a top chef from the country. Enjoy the food of Istanbul to your heart's content.",
    phone: "03-5756-6183",
    amenity: "fast_food",
    halal: true,
    vegetarian: true,
    outlets: [
      o("3F", "Terrace Restaurant, Shop 22", "landside", "Mo:07:30-20:30|Tu-Fr:CLOSED|Sa-Su:08:00-20:30(LO20:00)", false),
    ],
  }),
  mugi_to_olive: restaurant({
    name: "Mugi to Olive",
    cuisine: "Food Court",
    description: "Our restaurant is a ramen restaurant located in the food court after passing through immigration at International Departure gate on the 2nd floor Terminal 2. This ramen shop has its main store in Ginza, and is popular among women and overseas customers due to its cafe-like storefront, and its signature product is ``Hamaguri SOBA,'' which was featured in the Michelin Guide Tokyo Bib Gourmand from 2015 to 2017. We look forward to your visit.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "050-1707-8130",
    amenity: "fast_food",
    outlets: [
      o("2F", "International After Security Area, Shop 231", "airside", "Mo-Su:6:30-14:15,16:30-23:30", false),
    ],
  }),
  nangokusyuka: restaurant({
    name: "NANGOKUSYUKA",
    cuisine: "Chinese",
    description: "A large panorama with a 180 ° view of the runway and the sea. An open space overlooking the airplane runway is unique to airport restaurants.Enjoy a variety of Chinese cuisine from a tropical liquor store with a flagship store in Harajuku in a comfortable spacePlease enjoy.We also offer various set menus recommended for those who want to enjoy meals during limited time.",
    website: "nangokusyuka.co.jp",
    logoUrl: logo("nangokusyuka.co.jp"),
    phone: "03-6428-9130",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 4", "landside", "Mo:11:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  numazu_uogashizushi: restaurant({
    name: "NUMAZU UOGASHIZUSHI",
    cuisine: "Japanese",
    description: "Our shop is a sushi bar with the right to compete in the Numazu Fish Market. Handles fresh seafood delivered directly from Numazu Port, with large material and low price. I'm doing my best to make a good word for your customers.",
    website: "uogashizushi.co.jp",
    logoUrl: logo("uogashizushi.co.jp"),
    phone: "03-5757-6600",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 5", "landside", "Mo:10:30-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  ozashiki_tempura_tenmasa: restaurant({
    name: "Ozashiki Tempura Tenmasa",
    cuisine: "Japanese",
    description: "A long-established tempura shop founded in 1927. We offer freshly fried food in front of you. The first was a store that served tempura to His Majesty before Emperor Showa.",
    website: "ten-masa.jp",
    logoUrl: logo("ten-masa.jp"),
    phone: "03-6428-9110",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 12", "landside", "Mo:11:30-22:00|Tu-Fr:CLOSED|Sa-Su:11:00-22:00", false),
    ],
  }),
  ramen_toridashiya: restaurant({
    name: "RAMEN TORIDASHIYA",
    cuisine: "Chinese",
    description: "The soup, made with whole domestic chicken, has a rich flavor that brings out the full flavor of the chicken.The special thin noodles that are coated with the soup and the homemade char siu made with carefully selected pork and chicken create a delicious dish that you will want to keep eating.Please enjoy a cup of our specialty.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8531",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 4", "landside", "Mo:10:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  sanuki_udon_hannyarin: restaurant({
    name: "Sanuki Udon Hannyarin",
    cuisine: "Japanese",
    description: "Wheat flour is organic wheat and carefully selected and blended with the best flour from the north to the south of Japan. Dashi is a blend of carefully selected domestic bonito and boiled raisins according to the season, such as Hokkaido natural konbu and Rishiri kelp. With no added ingredients, we always aim for safety and security. The water is mellow and soft, and the material taste is maximized.",
    phone: "03-5756-6163",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 23", "landside", "Mo:07:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  schmatz_beer_stand: restaurant({
    name: "SCHMATZ Beer Stand",
    cuisine: "Food Court",
    description: "SCHMATZ began with the strong desire of two Germans to let customers experience the real Germany of today through authentic German beer and original German cuisine.At our restaurant, we offer the finest German draft beer, brewed in accordance with the German Beer Purity Law, along with sausages and snacks that pair perfectly with beer.Whether you're looking for a drink before your flight, a light meal, or simply to relax with friends while waiting for Flights, we're here to help you enjoy our drinks in a variety of situations, so please feel free to stop by.",
    website: "schmatz.jp",
    logoUrl: logo("schmatz.jp"),
    phone: "03-5579-7765",
    amenity: "fast_food",
    outlets: [
      o("2F", "International After Security Area, Shop 233", "airside", "Mo-We:07:00-23:59,00:00-01:00(LO00:30)|Th:07:00-23:59,24:00-01:00(LO00:30)|Fr-Su:07:00-23:59,00:00-01:00(LO00:30)", false),
    ],
  }),
  shinjuku_acacia: restaurant({
    name: "SHINJUKU ACACIA",
    cuisine: "Western",
    description: "Since its founding in 1963, the Acacia specialty roll cabbage stew has been making. Wrapped beef pork broiled with fresh cabbage, boiled in chicken soup and cooked in white stew without using milk. It is also recommended that you eat while hot and hot rice. In addition, Hayashi rice, Indian-style spicy curry rice, scallop cream croquette, pork sauté, etc., you can quickly and securely prepare your stomach.",
    website: "restaurant-acacia.com",
    logoUrl: logo("restaurant-acacia.com"),
    phone: "03-6428-9511",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 6", "landside", "Mo:11:00-20:20|Tu-Su:CLOSED", false),
    ],
  }),
  soba_kappo_azumino: restaurant({
    name: "Soba Kappo AZUMINO",
    cuisine: "Japanese",
    description: "The restaurant is filled with the aroma of carefully made dashi broth and offers a selection of soba noodles. The most popular dish is the \"leaf wasabi soba,\" an addictive dish with a lingering, spicy flavor. In the Japanese-style, relaxed atmosphere, we also offer carefully selected Japanese sake and shochu, so you can enjoy our carefully selected soba noodles and alcohol not only at lunchtime but also in the evening.",
    website: "airport-restaurant.com",
    logoUrl: logo("airport-restaurant.com"),
    phone: "03-6428-8521",
    amenity: "restaurant",
    outlets: [
      o("5F", "Market Place, Shop 13", "landside", "Mo-Su:11:00-15:30,17:00-20:00", false),
    ],
  }),
  soba_sakedokoro_tsukijian: restaurant({
    name: "Soba Sakedokoro TSUKIJIAN",
    cuisine: "Japanese",
    description: "Soba and carefully selected dishes from Hokkaido.",
    phone: "03-6428-9119",
    amenity: "restaurant",
    outlets: [
      o("1F", "Market Place, Shop 12", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "STARBUCKS COFFEE",
    cuisine: "Cafe",
    description: "This is the only Book and Cafe at Haneda Airport, operated by Culture Convenience Club Co., Ltd. Why not spend some time in a wonderful space with carefully selected books and a variety of drinks and pastries based on espresso extracted from high-quality Arabica coffee beans?We also have many original products such as coffee beans, coffee brewing equipment, and mugs that you can enjoy at home.You can see the runway and planes taking off and landing from inside the store.",
    phone: "03-5579-7870",
    amenity: "cafe",
    outlets: [
      o("4F", "International Departure Lobby, Shop 216", "landside", "Mo:06:30-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  starbuks_coffee_haneda_airport_internatinal_terminal2: restaurant({
    name: "STARBUKS COFFEE Haneda Airport internatinal Terminal2",
    cuisine: "Cafe",
    description: "Specialty coffee store born in Seattle, USA. Enjoy a wide variety of drinks based on espresso extracted from high-quality Arabica coffee beans.Please stop by before boarding.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "03－6631－3810",
    amenity: "cafe",
    outlets: [
      o("2F", "International After Security Area, Shop 234", "airside", "Mo-Su:0:00-1:00,6:30-24:00", false),
    ],
  }),
  tachigui_soba_sakedokoro_tsukijitei: restaurant({
    name: "Tachigui Soba Sakedokoro TSUKIJITEI",
    cuisine: "Japanese",
    description: "We have soba noodles made with Edo-mae soup, sake and sake.",
    phone: "03-6428-9118",
    amenity: "restaurant",
    outlets: [
      o("B1F", "Terminal Lobby (North), Shop 7", "landside", "Mo:07:00-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  tempura_soba_monzaemon: restaurant({
    name: "Tempura Soba Monzaemon",
    cuisine: "Japanese",
    description: "Monzaemon's commitment 1, strong soba boiled in a large feather pot, crispy tempura fried in a large pot 2, homemade noodle soba with rich flavor 3, Koshihikari from Niigata prefecture with the highest sweetness and stickiness 4, bonito flakes and mackerel flakes Elegant Kyoto-style soup stock using Ichiban Dashi 5, body-friendly rapeseed oil with zero cholesterol",
    website: "kobe505.co.jp",
    logoUrl: logo("kobe505.co.jp"),
    phone: "03-6428-9505",
    amenity: "restaurant",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 8", "landside", "Mo:06:00-21:00|Tu-Su:CLOSED", false),
    ],
  }),
  tonkatsu_wako: restaurant({
    name: "TONKATSU WAKO",
    cuisine: "Japanese",
    description: "A safe and secure brand that has been loved by customers for over 60 years. As a tonkatsu specialty store, always try to make delicious menus casually, stable food quality through the succession of technology since its establishment, customer service that delivers smile and spirit, rice, miso soup, cabbage can be changed freely and satisfied with customers Only special dishes. We look forward to your visit.",
    website: "wako-group.co.jp",
    logoUrl: logo("wako-group.co.jp"),
    phone: "03-6428-9100",
    amenity: "restaurant",
    outlets: [
      o("4F", "Market Place, Shop 2", "landside", "Mo:11:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  tully_s_coffee: restaurant({
    name: "TULLY'S COFFEE",
    cuisine: "Cafe",
    description: "Tully's delivers such coffee that uses only domestically roasted beans that are carefully selected from all over the world, espresso with a luxurious taste that is carefully extracted, and seasonal specialty drinks that deliver deliciousness every season. Enjoy your drink. We will deliver the best cup.",
    website: "tullys.co.jp",
    logoUrl: logo("tullys.co.jp"),
    phone: "03-5579-7688",
    amenity: "cafe",
    outlets: [
      o("1F", "Domestic Arrival Lobby, Shop 2", "landside", "Mo:07:30-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  world_wine_bar_by_pieroth: restaurant({
    name: "World Wine Bar by Pieroth",
    cuisine: "Western / Cafe / Food Court / Bar/Izakaya",
    description: "Along with Western-style snacks, you can easily enjoy refreshing German wines, famous wines from around the world, and champagne. (There is also a soft drink)",
    website: "pieroth.jp",
    logoUrl: logo("pieroth.jp"),
    phone: "03-5756-6157",
    amenity: "bar",
    outlets: [
      o("3F", "Terrace Restaurant, Shop 19", "landside", "Mo:07:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
};

const terminal3Venues = {
  vending_machine_haneda_airport_original_matcha_baumkuchen_near_gate_109_halal_certified: restaurant({
    name: "(Vending Machine) Haneda Airport Original Matcha Baumkuchen（Near Gate 109）[Halal-Certified]",
    cuisine: "Light Meals/Fast Food / Groceries",
    description: "This moist Baumkuchen is made with fragrant domestic matcha green tea and baked slowly at a low temperature.As a product exclusive to Haneda Airport, the packaging features a design of \"Haneda Nihonbashi,\" a landmark located in Terminal 3.",
    amenity: "fast_food",
    halal: true,
    outlets: [
      o("3F", "After Security Area, Shop 170", "airside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  agro_fruit_parlor: restaurant({
    name: "AGRO＠fruit parlor",
    cuisine: "Cafe / Light Meals/Fast Food / Bar/Izakaya",
    description: "You can also enjoy sweets such as fresh fruit parfaits and pancakes made with plenty of domestic fruits, and mixology cocktails made with plenty of domestic fruits. We also offer nutritionally balanced meals such as burritos, homemade calzones, and quick menus. Please come and visit us.",
    website: "instagram.com",
    logoUrl: logo("instagram.com"),
    phone: "03-5579-7272",
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("4F", "Edo Koji, Shop 8", "landside", "Mo:07:00-22:00|Tu-Th:CLOSED|Fr-Su:07:00-22:30(LO22:15)", false),
    ],
  }),
  ariso_sushi: restaurant({
    name: "ARISO SUSHI",
    cuisine: "Japanese",
    description: "We use only domestically caught wild fish, and our sushi rice is a blend of red vinegar and rice vinegar. We accept orders for as little as one piece in the restaurant, and we also have a selection of sushi for takeout.*Take-out is not available from June to October.",
    phone: "03-6428-0444",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 36", "landside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
      o("4F", "Edo Koji, Shop 5", "landside", "Mo:08:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  bar_rage: restaurant({
    name: "Bar Rage",
    cuisine: "Food Court / Light Meals/Fast Food / Bar/Izakaya",
    description: "A popular bar famous for cocktails made with fresh fruits. Mr. Kitazoe, a leading mixologist, will give you a cocktail that focuses on Japan.",
    website: "mixologist.co.jp",
    logoUrl: logo("mixologist.co.jp"),
    phone: "03-6428-0022",
    amenity: "bar",
    vegetarian: true,
    outlets: [
      o("3F", "After Security Area, Shop 108", "airside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  bon_vivant_e: restaurant({
    name: "Bon Vivant + e",
    cuisine: "Light Meals/Fast Food",
    description: "Fresh bread and fresh deli sandwiches made by a 100-year-old bakery",
    website: "instagram.com",
    logoUrl: logo("instagram.com"),
    phone: "070-9271-6460",
    amenity: "fast_food",
    outlets: [
      o("4F", "Edo Koji, Shop 9", "landside", "Mo:08:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  cafe_108: restaurant({
    name: "CAFE 108",
    cuisine: "Cafe",
    description: "It's a great location where you can see the planes up close.We offer Japanese blended relaxing coffee inspired by Japanese tea culture.Please spend a relaxing time at our shop before boarding.*The store is located in the area after immigration procedures where only passengers boarding an airplane can enter.",
    website: "ufs.co.jp",
    logoUrl: logo("ufs.co.jp"),
    phone: "03-6428-0689",
    amenity: "cafe",
    outlets: [
      o("3F", "After Security Area, Shop 148", "airside", "Mo:06:30-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  cafe_cardinal: restaurant({
    name: "CAFE CARDINAL",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "Experience the “easy”, “comfortable” and discerning menus in an open space with the theme of having such a place at the airport.",
    website: "cardinal-japan.com",
    logoUrl: logo("cardinal-japan.com"),
    phone: "03-3747-0073",
    amenity: "cafe",
    outlets: [
      o("4F", "Edo Koji, Shop 38", "landside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  caffe_146: restaurant({
    name: "Caffé 146",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "We wait for various menus such as sandwiches collaborated with Maison Kaiser as well as coffee.",
    phone: "03-3747-1311",
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("3F", "After Security Area, Shop 103", "airside", "Mo-Su:0:00-2:00(LO1:30),05:30-24:00", false),
    ],
  }),
  cafe_books: restaurant({
    name: "CAFÉ&BOOKS",
    cuisine: "Cafe / Books",
    description: "Enjoy a little happiness before you depart at this authentic cafe brought to you by MITSUMOTO COFFEE, a long-established roaster in Yokohama that has been in business for over 60 years.In addition to coffee and other drinks, we also have handmade waffles. In addition, we have a wide selection of useful guidebooks, magazines, popular new publications, paperbacks, etc. that will help you enjoy your travels and business trips. Please come and visit us.",
    phone: "03-6428-0435",
    amenity: "cafe",
    outlets: [
      o("3F", "After Security Area, Shop 101", "airside", "Mo:07:30-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  champion_yakiniku_grilled_meat: restaurant({
    name: "CHAMPION Yakiniku (Grilled Meat)",
    cuisine: "Japanese",
    description: "A yakiniku restaurant with its main store in Ebisu. Please enjoy the real thrill of eating up the rare parts and sticking to the meat quality of the highest grade A5 rank.",
    website: "yakiniku-champion.com",
    logoUrl: logo("yakiniku-champion.com"),
    phone: "03-5708-0529",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 19", "landside", "Mo:07:30-23:00|Tu-Su:CLOSED", false),
    ],
  }),
  chaya_vegan_friendly_tokyo: restaurant({
    name: "CHAYA VEGAN FRIENDLY TOKYO",
    cuisine: "Food Court",
    description: "This sustainable pizza stand offers authentic Neapolitan-style pizza and vegan pizza, realizing food diversity. We are committed to plant-based food, prioritizing the future of the earth, the environment, and the health of our customers. From here at Haneda Airport, we will spread the deliciousness of Japanese vegan food to people all over the world.",
    website: "chayam.co.jp",
    logoUrl: logo("chayam.co.jp"),
    phone: "03-6428-0021",
    amenity: "fast_food",
    vegetarian: true,
    outlets: [
      o("3F", "After Security Area, Shop 108", "airside", "Mo-Su:0:00-1:00,05:00-24:00", false),
    ],
  }),
  curacion_cafe: restaurant({
    name: "Curacion Cafe",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "We offer \"moderate happiness to customers all over the world\" with delicious coffee from the long-established roaster [MMC]. Breakfast is also available. Please come to the healing space.",
    phone: "03-6428-0687",
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("3F", "After Security Area, Shop 116", "airside", "Mo-Su:0:00-2:00,05:30-24:00", false),
    ],
  }),
  expasa_cafe_haneda: restaurant({
    name: "EXPASA Cafe HANEDA",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "As the only observation cafe in the terminal, you can enjoy the scenery unique to the airport. We offer a bakery menu that uses carefully selected fruits and vegetables as the ingredients, original sweets only for our shop, and a drink menu such as discerning Japanese black tea using red fuuki. All menus can be taken home, so please use them on the Observation Deck.",
    website: "highway-advance.co.jp",
    logoUrl: logo("highway-advance.co.jp"),
    phone: "03-6459-9520",
    amenity: "cafe",
    outlets: [
      o("5F", "TOKYO POPTOWN, Shop 44", "landside", "Mo:08:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  ginza_ogura_oden_dashi_chazuke: restaurant({
    name: "GINZA OGURA (Oden,Dashi-chazuke)",
    cuisine: "Japanese",
    description: "Enjoy \"dashi chazuke\" with seasonal ingredients and traditional dashi stock, and at night, casually enjoy a cup of Ogura oden and stylish snacks from the famous Ginza store Ogura.",
    phone: "03-5755-9920",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 39", "landside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  ginza_ten_ichi_tempura: restaurant({
    name: "GINZA TEN-ICHI (Tempura)",
    cuisine: "Japanese",
    description: "Ginza Tenichi was founded in 1930 (Showa 5).As a long-established Edomae tempura restaurant, it has attracted many customers from both Japan and abroad.We purchase carefully selected seasonal ingredients, and our skilled craftsmen carefully prepare them into tempura and serve them to our customers.At the counter seats, you can enjoy the delicious taste of freshly fried food right in front of you.",
    website: "tenichi.co.jp",
    logoUrl: logo("tenichi.co.jp"),
    phone: "03-5579-7661",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("4F", "Edo Koji, Shop 13", "landside", "Mo:11:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  hokkaido_kitchen: restaurant({
    name: "HOKKAIDO KITCHEN",
    cuisine: "Japanese",
    description: "We will be serving dishes using Hokkaido ingredients that are popular among foreigners, such as curry and ramen, using recipes from the restaurant YOSHIMI. We look forward to your visit.",
    website: "anafesta.com",
    logoUrl: logo("anafesta.com"),
    phone: "03-6428-0066",
    amenity: "restaurant",
    outlets: [
      o("3F", "After Security Area, Shop 143", "airside", "Mo:06:00-23:00|Tu-Su:CLOSED", false),
    ],
  }),
  honolu_premier_air_haneda: restaurant({
    name: "Honolu Premier Air HANEDA",
    cuisine: "Japanese / Western / Cafe / Light Meals/Fast Food / Souvenirs / Groceries",
    description: "Halal/vegan menu available.A renowned restaurant with numerous halal-certified locations both domestically and internationally, also offers a selection of vegan menu items.",
    website: "assetfrontier.net",
    logoUrl: logo("assetfrontier.net"),
    phone: "03-6428-0711",
    amenity: "restaurant",
    halal: true,
    vegetarian: true,
    outlets: [
      o("4F", "Edo Koji, Shop 4", "landside", "Mo:0:00-23:00(LO22:00)|Tu-Th:10:00-23:00(LO22:00)|Fr:10:00-23:59(LO23:00)|Sa:00:00-02:00(LO01:00),06:00-23:59|Su:00:00-02:00(LO01:00),06:00-23:59(LO23:00)", false),
    ],
  }),
  hyakuzen: restaurant({
    name: "Hyakuzen",
    cuisine: "Japanese",
    description: "One hundred camellia is derived from offering twenty-five sanctuaries in one hundred seasons throughout the season. A good old Japanese table is expressed in a bowl.",
    website: "hyakuzen.jp",
    logoUrl: logo("hyakuzen.jp"),
    phone: "03-6428-0425",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 11", "landside", "Mo:08:00-23:00|Tu-Su:CLOSED", false),
    ],
  }),
  jinroku_anti: restaurant({
    name: "JINROKU Anti",
    cuisine: "Japanese / Food Court",
    description: "A very popular Kansai-style okonomiyaki and teppanyaki restaurant in Shirokane.",
    website: "jinroku.jp",
    logoUrl: logo("jinroku.jp"),
    phone: "03-6428-0023",
    amenity: "restaurant",
    outlets: [
      o("3F", "After Security Area, Shop 108", "airside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  katsusen_tonkatsu_fried_pork_cutlet: restaurant({
    name: "KATSUSEN Tonkatsu (Fried Pork Cutlet)",
    cuisine: "Japanese",
    description: "“Japanese tonkatsu” is a long-established tonkatsu specialty store. It is packed with specialties such as connoisseurs and excellent skills.",
    website: "wako-group.co.jp",
    logoUrl: logo("wako-group.co.jp"),
    phone: "03-5708-7448",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 14", "landside", "Mo:09:00-23:00|Tu-Su:CLOSED", false),
    ],
  }),
  kebab_stand_take_away_only: restaurant({
    name: "Kebab Stand (Take-away Only)",
    cuisine: "Light Meals/Fast Food",
    description: "A full-fledged Turkish restaurant produced by the popular Turkish restaurant \"Misse Swiss Tambour\" at Haneda Airport Terminal 2.Savor delicious kebabs by top-notch chefs in Turkey.Doner Kebab, a very popular menu loved by people all over the world, is dipped in homemade sauce and is exquisite if sandwiched between plump and original bread. We also have Halal certification so that Muslims can eat with peace of mind.",
    website: "tugba.co.jp",
    logoUrl: logo("tugba.co.jp"),
    phone: "03-6459-9377",
    amenity: "fast_food",
    halal: true,
    vegetarian: true,
    outlets: [
      o("4F", "Edo Koji, Shop 7", "landside", "Mo:09:00-20:00|Tu-Su:CLOSED", false),
    ],
  }),
  machiya: restaurant({
    name: "Machiya",
    cuisine: "Japanese",
    description: "In addition to the \"konamon menu\" such as Hiroshima-yaki and okonomiyaki, we also have a wide variety of \"teppanyaki dishes\" and \"alcoholic beverages\".We carefully select ingredients from all over Japan and offer them one by one.We also have reasonable menus such as morning menu and lunch menu, so we look forward to using it in various scenes.",
    phone: "03-6459-9505",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 16", "landside", "Mo:08:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  meat_stars_29: restaurant({
    name: "MEAT STARS 29",
    cuisine: "Western / Food Court",
    description: "Meat Stars 29 prides itself on its original hamburgers and Wagyu steaks. Our hamburgers feature patties made with 100% Kobe beef, and we offer an all-star selection of meat dishes, including our signature melt cheeseburger and steak rice bowls made with A5 Kuroge Wagyu beef. We also have a wide selection of snacks and alcoholic beverages, so please relax and enjoy your time before departure.",
    phone: "03-6428-0024",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("3F", "After Security Area, Shop 108", "airside", "Mo-Su:0:00-2:30,5:00-24:00", false),
    ],
  }),
  mos_burger_cafe: restaurant({
    name: "MOS BURGER & CAFE",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "In addition to the delicious MOS Burger hamburgers, you can also enjoy original sweets and cafe drinks that are only available at MOS Burger & Cafe and are not available at MOS Burger.Please enjoy the relaxed atmosphere of a café and the comfort of our space, spending your time however you like.",
    website: "mos.jp",
    logoUrl: logo("mos.jp"),
    phone: "03-5708-7521",
    amenity: "cafe",
    vegetarian: true,
    outlets: [
      o("4F", "Edo Koji, Shop 2", "landside", "Mo:08:00-21:00|Tu-Th:CLOSED|Fr:08:00-24:00|Sa:00:00-24:00|Su:00:00-21:00", false),
    ],
  }),
  nanrinka: restaurant({
    name: "NANRINKA",
    cuisine: "Chinese",
    description: "A Chinese restaurant specializing in Japanese ingredients. We will provide you with peace of mind and safety.",
    website: "nangokusyuka.co.jp",
    logoUrl: logo("nangokusyuka.co.jp"),
    phone: "03-6428-0433",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 20", "landside", "Mo:11:00-21:30|Tu-Su:CLOSED", false),
    ],
  }),
  ningyocho_imahan: restaurant({
    name: "NINGYOCHO IMAHAN",
    cuisine: "Japanese",
    description: "Ningyocho Imahan's sukiyaki is characterized by being cooked so that the flavor of the meat is not lost.We first cook just the meat in a special sauce that brings out the flavor of the Kuroge Wagyu beef, providing you with an amazing first bite.Please enjoy a blissful moment with seasonal vegetables.",
    phone: "03-5708-7529",
    amenity: "restaurant",
    outlets: [
      o("4F", "Shop 15", "landside", "Mo-Tu:11:00-15:00,17:00-22:00|We:HOLIDAY|Th-Su:11:00-15:00,17:00-22:00", false),
    ],
  }),
  onigiri_konga: restaurant({
    name: "Onigiri Konga",
    cuisine: "Light Meals/Fast Food",
    description: "With ingredients hand-prepared daily,An impressive rice ball made with Koshihikari rice produced in Iwafune, Niigata Prefecture.The fluffy texture that melts in your mouthWe invite you to experience the best onigiri in Japan.You can add one more ingredient for an additional fee.Please enjoy your favorite original rice balls.",
    phone: "03-5579-7756",
    amenity: "fast_food",
    outlets: [
      o("4F", "Edo Koji, Shop 10", "landside", "Mo:07:30-20:30|Tu-Su:CLOSED", false),
    ],
  }),
  planetarium_starry_cafe: restaurant({
    name: "PLANETARIUM Starry Cafe",
    cuisine: "Cafe",
    description: "Open from 11:00 to 22:00A planetarium where you can enjoy 40 million stars that you wouldn't normally see in everyday life.How about an extraordinary experience in your free time?You will be seated at a table, so you can enjoy your drinks and food while you wait.You can watch planetarium shows and animated programs.Admission fee: Adults (junior high school age and older) 530 yen / Children (2 years and older) 320 yen*Please order one drink upon entry.",
    phone: "03-6428-0694",
    amenity: "cafe",
    outlets: [
      o("5F", "TOKYO POPTOWN, Shop 50", "landside", "Mo:09:00-22:30|Tu-Su:CLOSED", false),
    ],
  }),
  port_side_kitchen_by_gril_mantenboshi: restaurant({
    name: "PORT-SIDE KITCHEN by Gril Mantenboshi",
    cuisine: "Western",
    description: "Offering high-quality Western foods casually with a focus on Japanese ingredients. We are proud of Wagyu beef hamburger and deep-flavored curry.",
    phone: "03-6428-0370",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 18", "landside", "Mo-Fr:11:00-15:00,17:00-22:00(LO21:00)|Sa-Su:11:00-22:00(LO21:00)", false),
    ],
  }),
  pronto: restaurant({
    name: "PRONTO",
    cuisine: "Cafe / Bar/Izakaya",
    description: "9:00~ Morning cafe time offers \"freshly ground coffee\" and \"morning sets\"For lunch, we offer dishes such as pasta and cake, and can be used for a variety of occasions, from a quick break to a full meal.During bar time from 5:00pm onwards, we offer a wide range of drinks including draft beer, wine, whiskey and cocktails, as well as a variety of snacks to go with your alcoholic beverages, including pasta and pizza.",
    website: "pronto.co.jp",
    logoUrl: logo("pronto.co.jp"),
    phone: "03-6428-0694",
    amenity: "cafe",
    outlets: [
      o("5F", "TOKYO POPTOWN, Shop 50", "landside", "Mo:09:00-22:30|Tu-Su:CLOSED", false),
    ],
  }),
  rokurinsha: restaurant({
    name: "Rokurinsha",
    cuisine: "Japanese / Food Court",
    description: "Rokurinsha created a tsukemen whirlwind around the world with the desire to \"make tsukemen a culture.\"This popular tsukemen and ramen restaurant in Tokyo Station always ranks high in ramen rankings, and it's not uncommon to have to wait an hour for it.",
    website: "rokurinsha.com",
    logoUrl: logo("rokurinsha.com"),
    phone: "03-6303-6825",
    amenity: "restaurant",
    outlets: [
      o("3F", "After Security Area, Shop 108", "airside", "Mo-Su:0:00-1:30,4:00-24:00", false),
    ],
  }),
  saryo_itoen: restaurant({
    name: "saryo ITOEN",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "Enjoy a relaxing Japanese moment at the gateway to the skies. Itoen Tea's \"Once in a Lifetime\" hospitality.You can enjoy Japan's traditional \"tea culture\" in a variety of styles.We offer drinks and sweets made with carefully selected matcha and other teas sold at Itoen specialty stores.The matcha and other green tea used are sold on the spot and are recommended as souvenirs.",
    website: "itoen.co.jp",
    logoUrl: logo("itoen.co.jp"),
    phone: "03-6428-0055",
    amenity: "cafe",
    outlets: [
      o("4F", "Edo Koji, Shop 37", "landside", "Mo:08:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  setagaya_ramen: restaurant({
    name: "SETAGAYA (Ramen)",
    cuisine: "Japanese",
    description: "Japanese ramen that is proud of the world created by Tsukasa Maejima, an up-and-coming ramen craftsman who pursues individuality, balance, and deliciousness.",
    website: "setaga-ya.com",
    logoUrl: logo("setaga-ya.com"),
    phone: "03-5708-0899",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 21", "landside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  spaghetteria_vavnova: restaurant({
    name: "SPAGHETTERIA VAVnova",
    cuisine: "Western",
    description: "By incorporating the \"boiling theory\" devised by Chef Masayuki Okuda of Al-Che-Ciano, we have shortened the time it takes to cook spaghetti, allowing us to provide meals at a good pace even for busy airport travelers.Please enjoy our proud spaghetti, made with delicious ingredients carefully selected from all over Japan, including carefully selected sausages and bacon, high-quality spiny lobster and crab, and delicious local farm vegetables.We also have menus that can be catered to Vegetarian and vegans.",
    website: "vavnova.com",
    logoUrl: logo("vavnova.com"),
    phone: "080-7696-6275",
    amenity: "restaurant",
    vegetarian: true,
    outlets: [
      o("4F", "Edo Koji, Shop 17", "landside", "Mo-Su:11:30-15:30,17:30-22:00", false),
    ],
  }),
  suginoko: restaurant({
    name: "Suginoko",
    cuisine: "Japanese",
    description: "A discerning Japanese-style izakaya with a selection of seasonal vegetables and food, as well as abundant local sake. Everyone will be satisfied.",
    phone: "03-5708-7717",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 41", "landside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  tailwind: restaurant({
    name: "Tailwind",
    cuisine: "Japanese / Western / Bar/Izakaya",
    description: "Can be used for various occasions throughout the dayRestaurant and bar \"Tailwind\".Breakfast, lunch, sweets, and even a la carte dishesAn all-day dining venue offering a diverse menu.In the evening, we serve a variety of drinks as a bar.Feel free to use our facilities from one person to a group.",
    website: "the-royalpark.jp",
    logoUrl: logo("the-royalpark.jp"),
    phone: "03-6830-1101",
    amenity: "restaurant",
    outlets: [
      o("3F", "Departure Lobby, Shop 2", "landside", "Mo:06:00-23:00|Tu-Su:CLOSED", false),
    ],
  }),
  tempura_sakitei: restaurant({
    name: "Tempura Sakitei",
    cuisine: "Japanese / Food Court",
    description: "Please enjoy the tempura made with the skill of a tempura specialty store, with fresh and deep-fried tempura tangled in a sweet and spicy sauce. Alcohol and snacks are also available.",
    phone: "03-6428-0295",
    amenity: "restaurant",
    outlets: [
      o("3F", "After Security Area, Shop 108", "airside", "Mo-Su:0:00-2:00,4:00-24:00", false),
    ],
  }),
  tsurutontan_udon_noodles: restaurant({
    name: "TSURUTONTAN (Udon Noodles)",
    cuisine: "Japanese",
    description: "In accordance with the traditional Sanuki udon technique, we will deliver the best taste based on the belief that it has been made, cut, and brewed.",
    website: "tsurutontan.co.jp",
    logoUrl: logo("tsurutontan.co.jp"),
    phone: "03-6428-0326",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 12", "landside", "Mo:06:00-23:00|Tu-Su:CLOSED", false),
    ],
  }),
  tully_s_coffee: restaurant({
    name: "TULLY'S COFFEE",
    cuisine: "Cafe / Light Meals/Fast Food",
    description: "A specialty coffee shop where you can casually enjoy authentic espresso, which is handcrafted one cup at a time, using carefully selected beans from all over the world in pursuit of the highest quality.Enjoy drinks offered by Tully's, including seasonal specialty drinks that deliver delicious flavors for every season, coffee made from beans carefully selected from around the world and roasted domestically using only Arabica beans, and carefully extracted espresso with a luxurious flavor.",
    website: "tullys.co.jp",
    logoUrl: logo("tullys.co.jp"),
    phone: "03-6428-0319",
    amenity: "cafe",
    outlets: [
      o("2F", "Arrival Lobby, Shop 17", "landside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
    ],
  }),
  uogashi_nihon_ichi: restaurant({
    name: "UOGASHI NIHON-ICHI",
    cuisine: "Japanese / Food Court",
    description: "Freshly made Edomae sushi made with warm rice and fresh fish and Edomae techniques.Prices start from 130 yen per piece.Feel free to enjoy as much of your favorite material as you like.",
    website: "susinippan.co.jp",
    logoUrl: logo("susinippan.co.jp"),
    phone: "03-6428-0028",
    amenity: "restaurant",
    outlets: [
      o("3F", "After Security Area, Shop 108", "airside", "OPEN24|Mo-Su:0:00-2:00(LO1:50),4:00-24:00", true),
    ],
  }),
  yakitori_soba_nishakugosun: restaurant({
    name: "Yakitori Soba Nishakugosun",
    cuisine: "Japanese",
    description: "Spend a great time with Edo-mae soba at noon, delicious sake and yakitori from southern chicken at night, and soba with soba noodles over the throat.",
    website: "gourmet-kineya.co.jp",
    logoUrl: logo("gourmet-kineya.co.jp"),
    phone: "03-6428-0303",
    amenity: "restaurant",
    outlets: [
      o("4F", "Edo Koji, Shop 40", "landside", "Mo:07:00-22:00|Tu-Su:CLOSED", false),
    ],
  }),
  yoshinoya: restaurant({
    name: "Yoshinoya",
    cuisine: "Light Meals/Fast Food",
    description: "Founded in Meiji 32. Beef bowl of the Yoshinoya of the same taste. Please enjoy it.",
    website: "yoshinoya.com",
    logoUrl: logo("yoshinoya.com"),
    phone: "03-5708-7505",
    amenity: "fast_food",
    outlets: [
      o("4F", "Edo Koji, Shop 3", "landside", "OPEN24|Mo:00:00-24:00|Tu-Su:CLOSED", true),
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
  const r2 = await processTerminal(AIRPORT, TERMINAL_2_DOMESTIC, 'Terminal 2 (Domestic)', terminal2DomesticVenues);
  const r3 = await processTerminal(AIRPORT, TERMINAL_2_INTERNATIONAL, 'Terminal 2 (International)', terminal2InternationalVenues);
  const r4 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', terminal3Venues);

  const purgeResult = await purgeOrphanedTerminals(
    AIRPORT,
    new Set([TERMINAL_1, TERMINAL_2_DOMESTIC, TERMINAL_2_INTERNATIONAL, TERMINAL_3])
  );

  const totalCreated = r1.created + r2.created + r3.created + r4.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r4.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2DomesticVenues).length
    + Object.keys(terminal2InternationalVenues).length + Object.keys(terminal3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
