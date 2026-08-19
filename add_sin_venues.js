'use strict';
/**
 * Fills in complete data for Singapore Changi Airport (SIN) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-16 from the
 * official site, changiairport.com/en/dine-and-shop/dining-directory.html
 * (216 total dining listings), using Claude in Chrome browser automation
 * per this project's standing convention (no WebFetch for venue data).
 *
 * METHODOLOGY: the directory is a single page with client-side "LOAD MORE"
 * pagination (15 items/click); all 216 cards were loaded by repeatedly
 * clicking "Load More" until "Showing 216 of 216 result(s)", then extracted
 * via a `parseCard()` DOM-scraping script run in the browser console. Each
 * card gives name, category tags, and (for single-outlet brands) a location
 * token (T1/T2/T3/T4/Jewel), a Public/Transit area flag, unit, and hours —
 * but 31 brands are multi-outlet on the card ("N Outlets") with no per-
 * outlet detail shown there.
 *
 * All 216 venues' individual detail pages (dine-detail.<slug>.html) were
 * then bulk-fetched to get: (1) each outlet's precise per-terminal
 * location/hours for the 31 multi-outlet brands (structurally required —
 * the card alone doesn't say where each location is), and (2) a real
 * external "Visit Website" link + marketing description for every venue,
 * matching this project's NRT/KIX richness bar. Plain `fetch()` did NOT
 * work for detail pages (the fetched HTML is an empty client-rendered SPA
 * shell) — the working technique was a `display:none` `<iframe src="...">`
 * per detail page, read via `iframe.contentDocument` after ~1.3-2.5s to
 * load. Because the iframe is never actually rendered on screen, its
 * Location/About tab panel's `.innerText` ignores the tabs' CSS show/hide
 * and returns BOTH tabs' text concatenated in one read (Location content
 * followed by About content) — split at the last literal "Share" (a UI
 * button label after each outlet's "View On Map" link) with no need to
 * simulate a tab click. Full technique logged in this project's working
 * notes for reuse at future large airports.
 *
 * TERMINAL STRUCTURE: T1, T2, T3, T4 each have their OWN check-in AND own
 * security checkpoint — confirmed via milelion.com/2024/05/29/clarified-
 * transiting-between-changi-terminals-1-2-3-and-4/, quoting an official
 * Changi Airport Group statement that passengers clear immigration
 * according to their specific departure terminal. T1-T3 share an airside
 * Skytrain for passenger movement between concourses (no document check
 * needed to ride it), but this does NOT merge their check-in/security
 * processing — each terminal still independently processes its own
 * departing passengers. T4 has no Skytrain link at all (shuttle-bus only).
 * So all four are genuinely separate terminal-test-passing buckets.
 *
 * JEWEL CHANGI AIRPORT — NOT A REAL TERMINAL, MODELLED AS ONE ANYWAY (BY
 * EXPLICIT USER DECISION): Jewel is a landside-only shopping/dining/
 * attraction complex bridge-connected to T1 (with an underground link to
 * T2/T3 too). It has NO check-in, NO security, NO boarding gates of its
 * own — it fails this project's usual "own check-in AND own security"
 * terminal test outright, unlike T1-T4. However Changi's own dining
 * directory treats "Jewel" as a first-class, peer-level Location filter
 * alongside T1-T4 (not nested under T1), and it accounts for roughly half
 * of the airport's 216 total dining listings — far too large and central
 * to Changi's identity to exclude. Since the app's Firestore schema has no
 * bucket type other than `terminals`, the user was asked (AskUserQuestion)
 * how to model it and chose to give Jewel its own bucket: doc id `jewel`,
 * name "Jewel Changi Airport", alongside terminal_1 through terminal_4.
 * This is the first airport in this project's history with a 5th,
 * non-terminal "terminal" bucket — flagged here clearly so it isn't
 * mistaken for a real aircraft terminal by future readers of this data.
 *
 * MULTI-OUTLET / SAME-BRAND HANDLING: standard project rule — a brand's
 * outlets within the SAME bucket (terminal_1-4 or jewel) are combined into
 * one doc with multiple `outlets[]` entries; outlets in DIFFERENT buckets
 * become separate docs per bucket. E.g. Starbucks (5 outlets total) becomes
 * 4 docs: terminal_2 (2 outlets: T2 Public + T2 Transit, merged), plus one
 * single-outlet doc each in terminal_3, terminal_4, and jewel. Burger King
 * (5 outlets) similarly splits into docs in terminal_1, terminal_2 (merged
 * Public+Transit), terminal_3, terminal_4. All 31 multi-outlet brands from
 * the card data were verified to parse into exactly their stated outlet
 * count from the detail-page location text (zero mismatches).
 *
 * AMENITY: mapped from the site's own category tags — Food Court ->
 * food_court; Cafe -> cafe; Pubs & Bars (without Cafe) -> bar; Fast Food or
 * Quick Bites (without the above) -> fast_food; else -> restaurant. HALAL:
 * set true only where the word "Halal" literally appears in the venue's own
 * category tags, description, or header text (11 venues) — not inferred
 * from cuisine type. Vegetarian/vegan/kosher/gluten-free were not
 * separately indicated anywhere in Changi's directory for any venue, so
 * those fields are left blank per this project's no-fabrication rule
 * (blank rather than guessed).
 *
 * WEBSITE: bare hostname only (no protocol/www/path) per this project's
 * standing convention, applied uniformly including where Changi's own
 * "Visit Website" link happens to point at a social-media profile rather
 * than a brand domain (10 venues link to Instagram/Facebook profiles
 * instead of a proper site) — kept bare per the same rule as every other
 * website field, not special-cased.
 *
 * HOURS: Changi's detail pages show per-outlet hours far more granularly
 * than most airports in this project — often per day-of-week group (e.g.
 * "07:30 AM - 09:00 PM (Mon-Thu, Sun) | 12:00 AM - 12:00 AM (Fri, Sat)").
 * The full granular string is preserved as scraped (day-groups joined with
 * " | "), not collapsed or simplified. A leading "Closed"/"Open till HH:MM"
 * token — a LIVE point-in-time open/closed status snapshot from the
 * moment of scraping, not real operating-hours data — was stripped from
 * every outlet's hours string so stale state doesn't get stored; "Open 24
 * hours" was kept as-is since that IS real hours information, not a status
 * snapshot.
 *
 * VERIFIED TOTALS: 216 raw venue listings / 268 parsed outlets (185
 * single-outlet + 31 multi-outlet brands totalling 83 more outlets) ->
 * terminal_1: 32 docs / 34 outlets; terminal_2: 48 docs / 50 outlets;
 * terminal_3: 47 docs / 50 outlets; terminal_4: 16 docs / 16 outlets;
 * jewel: 118 docs / 118 outlets. Total: 261 docs / 268 outlets, matching
 * the reconciliation script's output exactly (zero data loss).
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['sin', 'singapore-changi', 'changi'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const TERMINAL_3 = 'terminal_3';
const TERMINAL_4 = 'terminal_4';
const JEWEL = 'jewel';

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
  a_noodle_story: restaurant({
    name: "A Noodle Story", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "A Noodle Story, established in 2013 by innovative hawkers Gwern Koo and Ben Tham, is Singapore's first and only Singapore-style ramen eatery. Fusing traditional HK egg noodles with Japanese ramen influences, the restaurant has earned a Michelin Bib Gourmand award every year since 2016. Their acclaimed Singapore-Style Ramen showcases the best of their unique blend, while the menu also features local favourites like Nonya Chicken Curry Noodle and Smoky Char Siew Noodle. Diners can also savour delightful sides such as HK-style Poached Wanton in Soup and Ngoh Hiang, adding to the authentic and diverse dining experience.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-K19", "airside", "Open 24 hours Daily", true),
    ],
  }),
  andes_by_astons: restaurant({
    name: "Andes by Astons", cuisine: "Restaurant", amenity: "restaurant",
    description: "If you cannot get enough of ASTONS Specialties, you certainly must try ANDES BY ASTONS! Created by the same people who brought you the mouth-watering steaks, ANDES is the much sought-after cowboy themed version which is also priced affordably and serves up dishes that are just as delectable. Discerning diners will be applauding to the fantastic food and prices at ANDES. With quality ingredients and generous portions, the menu includes a wide selection of steak cuts, chicken, seafood and spaghetti with most of the main courses including two side dishes where diners can select from a vast variety of delicious chips, salads and so much more!",
    outlets: [
    o("Level 3", "T1 Public Level 3, #03-18", "landside", "10:30 – 23:00 Daily", false),
    ],
  }),
  anjappar: restaurant({
    name: "Anjappar", cuisine: "24 Hours / Restaurant", amenity: "restaurant",
    description: "Indulge in the rich and diverse flavors of Indian cuisine at Anjappar. From fragrant biryanis to spicy curries, Anjappar's menu offers a tantalizing selection of dishes that promise to tantalize your taste buds and leave you wanting more.",
    outlets: [
    o("Level 3", "T1 Public Level 3, #03-20", "landside", "Open 24 hours Daily", true),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "24 Hours / Fast Food / Kids", amenity: "fast_food",
    description: "Welcome to the home of flame-grilled perfection! Enjoy the best-selling, signature flame-grilled WHOPPER®️ as well as other top BK favourites such as the velvety smooth Double Mushroom Swiss, deliciously juicy Tendergrill®️ Chicken that is made of chicken thigh fillet and the irresistible sides such as Onion Rings, Taro Turnover, HERSHEY’S®️ Sundae Pie and more! Sink your teeth in our juicy burgers now.",
    outlets: [
    o("Level 3", "T1 Public Level 3, #03-23", "landside", "Open 24 hours Daily", true),
    o("Level 3", "T1 Transit Level 3, #03-02", "airside", "Open 24 hours Daily", true),
    ],
  }),
  chatterbox_express: restaurant({
    name: "Chatterbox Express", cuisine: "Cafe", amenity: "cafe",
    description: "When Chatterbox opened its doors in 1971 at what was then known as The Mandarin Singapore, the dream was simple, but bold for its time: to bring authentic Singapore hawker food from the city’s streets and into the comforts of a five-star luxury hotel. Being the pioneer in Singapore’s elevated hawker food scene, Chatterbox quickly grew in popularity for its rendition of classic local favourites and became home of the Legendary Mandarin Chicken Rice with the dish evolving into its own ritual over the years.\n\nNow proudly extending the brand's iconic flavours beyond its home ground, Chatterbox Express presents a curated selection of the Singapore’s delicacies, convenient daily meals, and noteworthy beverages. This quick-service venue features a modern, simple, and clean design, offering a friendly and casual dining experience.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-52", "airside", "06:00 – 00:00 Daily", false),
    ],
  }),
  crave_the_original_adam_road_nasi_lemak_by_selera_rasa: restaurant({
    name: "Crave - The Original Adam Road Nasi Lemak By Selera Rasa", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "If you are looking for a taste that is quintessentially Singaporean, look no further than Crave. Offering both the award-winning Adam Road Nasi Lemak by Selera Rasa and the famous Amoy Street Teh Tarik from Rafee’s Corner, Crave is where you can enjoy local cuisine that is sensationally popular with locals and tourists alike. The Nasi Lemak dish is scrumptious with generous servings of coconut-flavoured rice and delicious fried fish and chicken wing options. Paired with Teh Tarik, you will be feasting on a tasty combination that pays tribute to Singapore’s rich food and beverage culture.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-K19A", "airside", "Open 24 hours Daily", true),
    ],
  }),
  crystal_jade_la_mian_xiao_long_bao: restaurant({
    name: "Crystal Jade La Mian Xiao Long Bao", cuisine: "Restaurant", amenity: "restaurant",
    description: "An exquisite culinary journey into the rich traditions of Chinese regional cuisine. Inspired by the Jiangnan region, south of the Yangtze River, an area famed for its skillfully crafted snacks and delicacies. Classic and contemporary interpretations of the much loved Xiao Long Bao and La Mian are just some of the delights to savour at Crystal Jade La Mian Xiao Long Bao. A charming, rustic ambience with a distinctively bold and modern twist, Crystal Jade La Mian Xiao Long Bao is a casual dining experience that will delight the senses.",
    outlets: [
    o("Level 3", "T1 Transit Level 3, #03-54", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  harry_s: restaurant({
    name: "Harry's", cuisine: "24 Hours / Restaurant", amenity: "restaurant",
    description: "Founded in 1992, Harry’s is a collection of everyday bars and kitchens - your home away from home. Harry’s is a meeting spot where you always feel welcome to be yourself and connect with old and new friends while enjoying inclusive and comforting drinks with generous, hearty mains, snacks and shareables.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-65", "airside", "Open 24 hours Daily", true),
    ],
  }),
  heavenly_wang: restaurant({
    name: "Heavenly Wang", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    description: "Heavenly Wang, (旺角, which translates to Prosperity Corner) was founded in 1953 along Bugis Street, Singapore, serving local-styled breakfast favourites – Kopi, Kaya Toast and Soft-Boiled Eggs. Inspired by our Nanyang tradition and ingredients of Asian heritage, we continuously reinvent our uniquely Singapore local favourites to keep up with changing times. Today, Heavenly Wang is a household halal-cartified cafe with more than 30 locations across the island, serving signature dishes set in a modern retro ambience.",
    halal: true,
    outlets: [
    o("Level 2", "T1 Public Level 2, #02-04", "landside", "Open 24 hours Daily", true),
    o("Level 2", "T1 Transit Level 2, #02-K09", "airside", "Open 24 hours Daily", true),
    ],
  }),
  hudsons_coffee: restaurant({
    name: "Hudsons Coffee", cuisine: "Cafe", amenity: "cafe",
    description: "Originating from Melbourne, Hudsons Coffee brings Australia’s vibrant coffee culture to Changi Airport Terminal 3. Known for its premium Arabica bean blends, the café offers a variety of espresso-based drinks, frappes, milkshakes, and gourmet sandwiches, along with seasonal promotions. The outlet’s design features natural materials and reclaimed timber, creating a cozy and inviting atmosphere for travelers.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-K10", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  ippudo_express: restaurant({
    name: "Ippudo Express", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Craving for scrumptious Japanese cuisine? Step into world-acclaimed ramen emporium IPPUDO EXPRESS to satiate your taste buds. With their new quick service style concept, they have designed a convenient yet high quality dining option for travellers on the go. Take your pick from IPPUDO’s signature tonkotsu broth and al dente noodles, as well as a spread of wholesome Japanese dip sandwiches and delightful salads. At IPPUDO EXPRESS, you will never have to compromise on quality and taste – it will certainly be an experience that is absolutely “oishii”.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-K08", "airside", "06:00 – 00:00 Daily", false),
    ],
  }),
  kopikakis: restaurant({
    name: "Kopikakis", cuisine: "Cafe", amenity: "cafe",
    description: "The Kopifellas Journey: From Modern Kopi Stall to Global Café Brand. Founded in Singapore, Kopifellas is a homegrown brand built on a deep appreciation for traditional food and beverages, crafted with quality ingredients and a modern touch.\nThe aspiration was to create a new kind of coffee shop—one that blends the charm of local kopi culture with the appeal of a modern, lifestyle café. Opened first in 2017, the concept quickly gained popularity, leading to the launch of two additional brands and a network of nine outlets across Singapore within five years.\nAt Changi Airport Terminal 1, we proudly introduce KopiKakis—a Halal-certified concept developed exclusively for Changi Airport. KopiKakis will offer an elevated menu, featuring a wider range of local favourites, premium beverages, and snacks crafted for both international travellers and locals alike.",
    halal: true,
    outlets: [
    o("Level 3", "T1 Transit Level 3, #03-53", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  lixin_teochew_fishball_noodle: restaurant({
    name: "LiXin Teochew Fishball Noodle", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "It was in 1968, a time where jobs were hard to come by. To make a living, our founder started a business selling fishball noodles from a pushcart. Ready to work hard and long for a better life, he soon mastered the skill of making fish balls that continue to win him new customers, even today!\n\nFrom the very beginning, Lixin Fishball Noodles always believed in delivering good, honest food using the freshest ingredients. In the early days, our founder would travel all the way to the fishery port in Jurong to buy freshly caught yellowtail fish. Then, he would spend six hours painstakingly scraping meat off the bones, filleting, mincing, kneading and moulding each fishball – all by hand.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-K17", "airside", "Open 24 hours Daily", true),
    ],
  }),
  luckin_coffee: restaurant({
    name: "Luckin Coffee", cuisine: "24 Hours / Cafe", amenity: "cafe",
    website: "luckincoffee.com", logoUrl: logo("luckincoffee.com"),
    description: "Founded in 2017, Luckin Coffee pioneers a technological-driven retail concept aims to provide quality coffee and products accessible to its customers. Using only sustainably, ethically sourced coffee beans roasted to perfection by its WBC Champion Team, Luckin Coffee created a range of unique and delicious blends of coffee that has won the hearts of millions of coffee lovers. Luckin Coffee’s success and rapid growth over the years are a testament to its unique approach to retail that focuses on technology and customer centric approach, and its relentless dedication to customer satisfaction.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-59", "airside", "Open 24 hours Daily", true),
    ],
  }),
  ma_mum_to_go: restaurant({
    name: "MA MUM To Go", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    description: "Enjoy a wide array of delicious traditional local foods at the new Halal concept restaurant, Ma Mum. Named after the charming local catchphrase of “mum mum” (which means “to eat” in the local baby talk), this is where friends and loved ones gather to play, relax, and most importantly, eat. Here, you will find a splendid range of local dishes done to perfection so that you will not only delight in the taste of Singapore flavors, but also experience the joys of how Singaporeans absolutely relish having their food on this foodie paradise island.",
    halal: true,
    outlets: [
    o("Level 1", "T1 Public Level 1, #01-K23", "landside", "Open 24 hours Daily", true),
    ],
  }),
  mango_tree_heineken_world_bar: restaurant({
    name: "Mango Tree/ Heineken World Bar", cuisine: "Pubs & Bars / Restaurant", amenity: "bar",
    description: "Mango Tree Kitchen serves authentic Thai favourites in a quick, casual setting. Enjoy flavourful dishes like green curry and pad Thai, made with no pork, no lard. Perfect for a satisfying meal before your flight.\n\nIntroducing Asia’s first ever Heineken World Bar at Changi Airport – refreshing pitstops that exist to spark connections beyond all barriers. Born in Amsterdam in 1873, Heineken has a very rich story to tell. As one of the first beer brands to travel the world, Heineken is almost everywhere but never lost in translation. Changi’s Heineken World Bars allow you to step inside the refreshing Worlds of Heineken for a peek at Heineken’s inspiring history, present and future. Alongside ice cold beers, we serve a menu of delicious Western dishes, including burgers, pastas, and bar snacks. Whether you're looking for a relaxing drink before your flight or a casual meal with friends, Heineken World Bar promises an unforgettable experience with every visit.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-39", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  marche: restaurant({
    name: "Marché", cuisine: "Cafe", amenity: "cafe",
    description: "Looking for a healthy and satisfying bite before your flight? Visit Marché at Terminal 1 for fresh, wholesome dishes made with top-quality ingredients, all prepared in an open kitchen where you can see, hear, and taste the freshness. Savor crispy rösti, handcrafted pasta, flavorful sandwiches, artisanal focaccia, along with a variety of irresistible pastries and cakes. With a variety of mouthwatering dishes, including vegetarian-friendly options and all meals made with no pork and no lard, you’ll find the perfect choice to satisfy every craving. Complete your meal with a refreshing homemade lemonade or a cup of organic, fair-trade coffee or tea. Whether you choose to relax in our tranquil seating area or grab a meal to go, we’ve got you covered for your journey ahead.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-40", "airside", "06:00 – 00:00 Daily", false),
    ],
  }),
  orchis_cafeteria: restaurant({
    name: "Orchis Cafeteria", cuisine: "Food Court", amenity: "food_court",
    description: "Orchis Food Court features a wide variety of hand-picked Asian and local cuisines that are sure to satisfy your taste buds at a pocket friendly price. Serving largely the staff of Changi Airport Group and even tourists, Orchis Food Court maintains exceptional food quality to guarantee a memorable and positive impression in customers’ minds..",
    outlets: [
    o("Basement 1", "T1 Public Basement 1, #B1-12A", "landside", "07:00 – 20:00 Daily", false),
    ],
  }),
  paul: restaurant({
    name: "PAUL", cuisine: "24 Hours / Cafe", amenity: "cafe",
    description: "PAUL is dedicated to the taste of good bread has been passing down through five generations of bakers since 1889.\nAt our outlet located in Changi Airport Terminal 1 Departure Transit Lounge, travellers can now enjoy the well-loved nutty flavours of our breads, as well as our signature pastries, sandwiches and other quick bites and snacks before boarding their next flight. Enjoy the true taste of France with authentic French breads, viennoiseries, pastries and baked specialties from PAUL, right here at Changi Airport!",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-26", "airside", "Open 24 hours Daily", true),
    ],
  }),
  penang_culture: restaurant({
    name: "Penang Culture", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Penang Culture is where the flavours and spirit of authentic Penang street food come alive. We’re here for anyone looking to indulge in some of the city’s most iconic dishes like Penang Fried Kway Teow, Assam Curry Fish Head, Lor Bak and many more — with every dish expertly crafted by true\nblue Penangite chefs who learnt their craft right on the streets of vibrant Penang.",
    outlets: [
    o("Level 3", "T1 Public Level 3, #03-19A", "landside", "10:30 – 00:00 Daily", false),
    ],
  }),
  pizza_hut: restaurant({
    name: "Pizza Hut", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Pizza Hut is Singapore’s most-loved pizza brand and is the largest pizza chain restaurant in the city. We’re all about creating the perfect pizza experience, whether you’re grabbing a quick bite or enjoying a cosy meal at home. With a menu inspired by our passion for quality and flavour, satisfy your cravings with offerings such as our Crackin' Thin Crust pizzas, Honey Roasted Wings, and the all-time favourite Melts! Rooted in the traditions of great food and warm hospitality, we’re your go-to for any occasion, and our recipe is simple – good pizza, good value, and good times. At Pizza Hut, we serve up joy one slice at a time so you can experience the warmth of home wherever you may be, however you like it, and with the people that matter.",
    outlets: [
    o("Level 3", "T1 Transit Level 3, #03-K04", "airside", "06:00 – 00:00 Daily", false),
    ],
  }),
  popeyes: restaurant({
    name: "Popeyes", cuisine: "24 Hours / Fast Food", amenity: "fast_food",
    description: "Crispy, juicy, authentic Cajun fried chicken – what more can you ask for? Marinated for 12 hours, hand battered, cooked slow and served fast for that shatter crunch texture, we bring Louisiana to you.",
    outlets: [
    o("Level 3", "T1 Transit Level 3, #03-47", "airside", "Open 24 hours Daily", true),
    ],
  }),
  saboten: restaurant({
    name: "Saboten", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Saboten was founded in 1966 in the neighbourhood of Shinjuku in Tokyo. The name Saboten or \"cactus\" in Japanese was selected to represent the founder's vision, which is to build a shop that will thrive with vitality even in the harshest conditions. With dedication to serve the best Tonkatsu, Saboten has flourished into one of the largest Tonkatsu chains with over 500 shops around the globe. Each ingredient is carefully selected with our passion to create the perfect tonkatsu. At Saboten, we only use premium pork lightly coated with our house-made bread crumbs to ensure the juice of the cutlets is preserved.",
    outlets: [
    o("Level 3", "T1 Public Level 3, #03-21", "landside", "10:00 – 23:00 Daily", false),
    ],
  }),
  sg_hawker: restaurant({
    name: "SG Hawker", cuisine: "24 Hours / Fast Food / Food Court", amenity: "food_court",
    description: "SG Hawker encapsulates the authentic flavours of popular street foods that many Singaporeans grew up with, presenting them in the setting of a modern kopitiam. Stalls are carefully handpicked and curated to showcase nostalgic, age-old flavours alongside dishes created by well-acclaimed local foodies. Experience the multi-racial and cultural diversity of Singapore through the unique and diverse cuisines all gathered in one trendy dining spot.",
    outlets: [
    o("Level 3", "T1 Transit Level 3, #03-48", "airside", "Open 24 hours Daily", true),
    ],
  }),
  terrace_chinese_kitchen: restaurant({
    name: "Terrace Chinese Kitchen", cuisine: "Cafe / Quick Bites / Restaurant", amenity: "cafe",
    description: "Embracing the soul of true Chinese culinary art, Terrace Chinese Kitchen brings authentic yum cha culture to passengers at the airport. Serving our signature cart noodles “Che Zai Mian”, a wide selection of Hong Kong bakery, appetisers and stir-fried dishes in traditional “Cha Lou” inspired interior décor; Terrace provides an exceptional culinary experience with a setting to match.",
    outlets: [
    o("Level 3", "T1 Public Level 3, #03-22", "landside", "08:00 – 23:00 Daily", false),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "24 Hours / Cafe", amenity: "cafe",
    website: "coffeebean.com.sg", logoUrl: logo("coffeebean.com.sg"),
    description: "Kick back with a cuppa at The Coffee Bean & Tea Leaf. Sip on long-time favourites like The Original Ice Blended, Vanilla and Mocha Lattes, or the popular Chai Latte. Those who prefer their coffee simple can also choose from a wide selection of espresso-based drinks and the Brew Of The Day. Complement your drink with a mouth-watering selection of puffs, muffins, bagels and irresistible cakes.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-66", "airside", "Open 24 hours Daily", true),
    ],
  }),
  the_hainan_story_coffee_toast: restaurant({
    name: "The Hainan Story Coffee & Toast", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Here at The Hainan Story Coffee & Toast, you’ll find old-school breakfasts done just right, with traditional Hainanese toasts that boast thick, fluffy buns with a pillowy-soft centre and wonderfully crisp crust — unlike the thin, flat toasts commonly found elsewhere. Traditionalists will insist on topping their toast with Home-Made Gula Melaka Kaya & Cold Butter, while the adventurous opt for the crunchy Rojak & Peanut Butter Spread. Wash that quintessential Hainanese breakfast down with some good ol’ decadent ‘Kopi Gu You’ – either Kopi C or Kopi O with a slice of additional butter thrown in. Introduced by Hainanese coffee shops in the 1930s, Kopi Gu You is Singapore’s very own rendition of the trendy Bulletproof Coffee —way before it even became a hipster drink.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-K18", "airside", "Open 24 hours Daily", true),
    ],
  }),
  tiger_bar_restuarant: restaurant({
    name: "Tiger Bar & Restuarant", cuisine: "24 Hours / Pubs & Bars / Restaurant", amenity: "bar",
    description: "Welcome to Tiger Bar & Restuarant, Singapore's premier destination for beer enthusiasts and food lovers! This flagship outlet offers a unique experience where Tiger® Beer takes center stage. Indulge in exclusive beer-infused cocktails, blending bold flavors with refreshing notes to tantalize your taste buds. Our culinary team has curated a menu that pairs seamlessly with Tiger® Beer, featuring innovative dishes infused with the essence of this iconic brew. From savory appetizers to mouth-watering mains, every bite celebrates Tiger®'s legacy. Step into a world where the impossible becomes possible, and uncage your Tiger. Whether you're here for a casual drink or a gourmet meal, World of Tiger Beer guarantees an unforgettable experience. Discover the true spirit of Tiger® Beer!",
    outlets: [
    o("Level 3", "T1 Transit Level 3, #03-52", "airside", "Open 24 hours Daily", true),
    ],
  }),
  tip_top: restaurant({
    name: "Tip Top", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Tip Top, a classic curry puff made with a special family recipe, is the epicurean pinnacle of traditional goodness since 1979.\nThrough rigorous periods of trial runs and taste tests, we finally fine-tuned the formula for a distinct texture and taste thus creating Tip Top Curry Puffs. Even today, our unending commitment to our customers is evident in the consistent quality of our curry puffs. With an unwavering determination for excellence, Tip Top is set to pursuit a wide range of local snacks and traditional delights.",
    outlets: [
    o("Level 2", "T1 Transit Level 2, #02-K11", "airside", "Open 24 hours Daily", true),
    ],
  }),
  woke_ramen: restaurant({
    name: "Woke Ramen", cuisine: "24 Hours / Kids / Restaurant", amenity: "restaurant",
    description: "Located at the intersection between Singapore and the world in Changi Airport Terminal 1, WOKE Ramen gives travellers a taste of Singapore’s unique wok-fried ramen in ultra-rich Japanese chicken or prawn-based broth, serving up a delightful alchemy of culture, deliciousness and umami.",
    outlets: [
    o("Level 3", "T1 Public Level 3, #03-19B", "landside", "Open 24 hours Daily", true),
    ],
  }),
  wu_fang_zhai: restaurant({
    name: "Wu Fang Zhai", cuisine: "Quick Bites", amenity: "fast_food",
    description: "With over a century of Jiangnan culinary heritage, Wu Fang Zhai reinvents traditional Chinese delicacies for modern travelers. Our signature freshly baked mooncakes feature premium Iberico pork and truffles, while handcrafted zongzi preserve ancient bamboo-leaf wrapping techniques.",
    outlets: [
    o("Level 3", "T1 Transit Level 3, #03-K05", "airside", "06:00 – 00:00 Daily", false),
    ],
  }),
  zus_coffee: restaurant({
    name: "ZUS Coffee", cuisine: "Quick Bites", amenity: "fast_food",
    description: "ZUS Coffee is the leading Malaysian coffee chain dedicated to transforming high-quality, freshly brewed specialty coffee from an occasional luxury into a daily necessity for all to enjoy. With a commitment to delivering clean, consistent, and expertly crafted coffee in every cup, ZUS Coffee only uses the best quality ingredients to make specialty coffee affordable and accessible for everyone, every day.",
    outlets: [
    o("Level 2", "T1 Public Level 2, #02-05", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
};

const terminal2Venues = {
  a_roy_thai_restaurant: restaurant({
    name: "A-Roy Thai Restaurant", cuisine: "Restaurant", amenity: "restaurant",
    description: "A-Roy Thai Restaurant is a family business that has been the heart of Northeast Thai cuisine in Singapore for over 30 years.\nFrom Thailand's Isaan province, known for robust, spicy flavours and fragrant herbs, they take pride in Thai heritage and authentic dishes, crafted with love from the freshest ingredients.\nA-Roy Thai Restaurant is dedicated to serving Thailand's finest recipes, staying true to their Thai roots and believing in the power of good food to unite people.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-14", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  asian_street_kitchen: restaurant({
    name: "Asian Street Kitchen", cuisine: "Pubs & Bars / Restaurant", amenity: "bar",
    description: "Asian Street Kitchen is a vibrant dining concept that brings together a diverse range of Asian cuisines under one roof. Designed with eclectic street art and bold neon lights, the outlet captures the energy of bustling street food markets across Asia. Travellers can enjoy a wide selection of regional favourites, from Pad Thai and spicy Korean fried chicken to Japanese rice bowls and local Singaporean delights. The menu is complemented by a variety of refreshing beverages, including Thai milk tea, sugar cane juice, Asian-inspired mocktails, traditional hot drinks, and a curated selection of beers from across Asia.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-170", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  boost_juice_bars: restaurant({
    name: "Boost Juice Bars", cuisine: "Quick Bites", amenity: "fast_food",
    website: "boostjuicebars.com.sg", logoUrl: logo("boostjuicebars.com.sg"),
    description: "Boost Juice - the nation’s favourite makers of fresh smoothies and juices! We serve millions of Singaporeans our iconic green cups, filled with fruits and veggies deliciousness.\nHere at Boost we’ve made it our pledge to get more fruits and veggies into every customers day and make healthy living easy!! So naturally, nutrition is a key component in developing our range of smoothies and juices that sees us blending through millions of tonnes of fruits and veggies every year.\nDeliciousness that comes from simple, natural goodness, served to you with a love life attitude that will make you so happy!\nDon’t believe us? Come and see us at any Boost Juice store in Singapore and try it for yourself.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K16", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  buk_chang_dong_soon_tofu: restaurant({
    name: "Buk Chang Dong Soon Tofu", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Chef and Co-founder Nam Kyoung Soo, started SBCD Korean Tofu house with the passion to bring only authentic and wholesome Korean Cuisine to Singapore. Its express version BCD Soon Tofu is similar with a specialisation in soft tofu soup (or Soon Tofu) made from a 10-ingredient secret recipe soup paste. BCD Soon Tofu uses silken tofu made using specially imported premium soybean from Paju, South Korea, a city near the Korean Demilitarised Zone (DMZ), known for its pristine produce due to its isolated location. Chef Nam’s belief: \"To bring out only the finest in everyday comfort food, for everyone to enjoy.\"",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K12", "airside", "Open 24 hours Daily", true),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "24 Hours / Fast Food / Kids", amenity: "fast_food",
    description: "Welcome to the home of flame-grilled perfection! Enjoy the best-selling, signature flame-grilled WHOPPER®️ as well as other top BK favourites such as the velvety smooth Double Mushroom Swiss, deliciously juicy Tendergrill®️ Chicken that is made of chicken thigh fillet and the irresistible sides such as Onion Rings, Taro Turnover, HERSHEY’S®️ Sundae Pie and more! Sink your teeth in our juicy burgers now.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-01", "landside", "Open 24 hours Daily", true),
    ],
  }),
  cafe_o: restaurant({
    name: "Cafe O", cuisine: "24 Hours / Cafe", amenity: "cafe",
    description: "CAFE O by Soup Restaurant — Proudly serving the best of Singapura’s comfort food, kopi and teh Conceived as a place to showcase Singapore’s unique coffee shop culture, CAFE O is where you can savour authentic Kopi O, Teh Tarik, Nasi Lemak, Roti Prata and more. Open 24/7, CAFE O presents an array of local cuisines from our four races to exhibit Singapore's unique food heritage and a place of comfort where locals and tourists can gather to savour the country’s quintessential fare. Enjoy the food with a piping hot brew of kopi, teh and teh halia, and busk in the good old days of Singapura.",
    outlets: [
    o("Level 2", "T2 Public Level 2, #02-07/08/09", "landside", "Open 24 hours Daily", true),
    ],
  }),
  chagee: restaurant({
    name: "CHAGEE", cuisine: "Cafe / Quick Bites", amenity: "cafe",
    description: "CHAGEE is an international tea brand that brings traditional tea to modern life. Drawing from centuries of tea heritage, we craft premium whole-leaf brews that blend tradition with innovation — creating shared moments of connection, every day, in every cup. CHAGEE TOGETHER.",
    outlets: [
    o("Level 2", "T2 Public Level 2, #02-01", "landside", "09:00 – 23:00 Daily", false),
    ],
  }),
  chef_wei_hk_cheong_fun: restaurant({
    name: "Chef Wei HK Cheong Fun", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Chef Wei HK Cheong Fun specialises in making authentic Hong Kong-style cheong fun, meticulously handmade to order. Driven by Chef Thoo's passion for this timeless dim sum dish, it stands as a testament to his extensive experience and unwavering dedication in mastering the art of preparing this quintessential classic, paired with a diverse range of ingredients.\n\nDiners are presented with an irresistible array of cheong fun, thoughtfully tailored to diverse tastes and preferences. Among the must-try options are the Mushroom Cheong Fun and Char Siew Cheong Fun. Each element of this humble dish, from the soft and velvety rice noodle sheets to the homemade Hong Kong-style sauce and delightful fillings, is meticulously prepared using traditional methods every day.\n\nCheong fun may be a simple dish, but it perfectly embodies Chef Thoo’s philosophy that anything basic and simple can be delicious and comforting when crafted with time, love, passion, and effort.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K06", "airside", "Open 24 hours Daily", true),
    ],
  }),
  chutney_mary_indian_fast_food: restaurant({
    name: "Chutney Mary Indian Fast Food", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Savour the flavours of India with delicious street snacks at Chutney Mary! Be it Pani Puri from Calcutta, Pav Bhaji from Mumbai, or Papri Chaat from Jaipur, there is myriad of tasty delights simply perfect for everyone. Whet your appetite as you try out a mouth-watering selection of traditional Indian foods ranging from kebabs to curries. There is even a menu of vegetarian fare that is absolutely finger licking amazing. Who says you’ll need to head to India just to try the best Indian snacks? It’s all here! Just drop by at Chutney Mary here at Changi Airport to satisfy your cravings for Indian chaat.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-26/27", "landside", "05:00 – 23:00 Daily", false),
    ],
  }),
  claypot_daddy: restaurant({
    name: "Claypot Daddy", cuisine: "Restaurant", amenity: "restaurant",
    description: "Claypot Daddy - as its name suggests, specialises in claypot dishes. A new claypot institution in town by local restaurateur Shawn Lim. With over 30 piping hot claypot and hotplate dishes, each perfected through years of cooking with love and passion for his daughter. Come Home to Claypot Daddy, Singapore’s Latest Claypot Concept Packs a Sizzling Hot Punch with over 30 Claypot and Hotplate Dishes from only $5.90!",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-11B", "landside", "10:30 – 22:00 Daily", false),
    ],
  }),
  cookhouse: restaurant({
    name: "Cookhouse", cuisine: "24 Hours / Food Court", amenity: "food_court",
    description: "Cookhouse by Koufu is the perfect destination for a delightful dining experience, offering a superb menu that ranges from beloved local fare to international classics. With a wide array of superb culinary selections, it is the perfect spot to gather, dine, and satisfy every appetite and palate.",
    outlets: [
    o("Level 3", "T2 Transit Level 3, #03-180", "airside", "Open 24 hours Daily", true),
    ],
  }),
  crave_the_original_adam_road_nasi_lemak_by_selera_rasa: restaurant({
    name: "Crave - The Original Adam Road Nasi Lemak By Selera Rasa", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "If you are looking for a taste that is quintessentially Singaporean, look no further than Crave. Offering both the award-winning Adam Road Nasi Lemak by Selera Rasa and the famous Amoy Street Teh Tarik from Rafee’s Corner, Crave is where you can enjoy local cuisine that is sensationally popular with locals and tourists alike. The Nasi Lemak dish is scrumptious with generous servings of coconut-flavoured rice and delicious fried fish and chicken wing options. Paired with Teh Tarik, you will be feasting on a tasty combination that pays tribute to Singapore’s rich food and beverage culture.",
    outlets: [
    o("Level 1", "T2 Public Level 1, #01-09C", "landside", "Open 24 hours Daily", true),
    ],
  }),
  dunkin_donuts: restaurant({
    name: "Dunkin' Donuts", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Dunkin’ is Singapore’s favourite coffee & baked goods quick-service restaurant brand, serving up freshly-made handcrafted beverages, scrumptious donuts and bakery items every day! Drop by before your flight for a delicious coffee and donut pick-me-up, or choose a dozen of your favourite treats to bring on board!\nWhether you love traditional flavours like Boston Kreme or go mad over our chewy Mochimochis, you are sure to find your favourite donut at Dunkin’. Pair it with a refreshing, aromatic espresso beverage and continue your travels happy & refreshed!\nDunkin’ is a Straits Times Singapore's Best Customer Service 2023/24 winner. We are delighted to serve Singapore since 2009.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K14", "airside", "Open 24 hours Daily", true),
    ],
  }),
  encik_tan: restaurant({
    name: "Encik Tan", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Recognising the demand from our Muslim counterparts for authentic Chinese hawker fare, the Encik Tan brand was introduced as a Halal-certified mini food atrium concept that dishes up a parade of popular local Chinese dishes, such as Hainanese Curry Rice, Wanton Noodles and Claypot Rice. All recipes are adapted using Halal ingredients and fine-tuned to deliver the same nostalgic flavour and taste of the original dishes. Encik Tan ensures that every dining experience is a flavourful journey that delights all. Encik Tan offers a pleasant dining experience, complete with air conditioning for added comfort. With numerous outlets across Singapore, Encik Tan ensures that authentic Chinese hawker fare is conveniently accessible to all, allowing more people to savour these beloved flavours in comfort.",
    halal: true,
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K08", "airside", "Open 24 hours Daily", true),
    ],
  }),
  foodies_clan: restaurant({
    name: "Foodies' Clan", cuisine: "Food Court", amenity: "food_court",
    description: "Drawing upon a diverse spread of culinary cultures, Foodies’ Clan® presents a collection of food and beverage brands housed under one roof - where the community can dine and make memories around the dining table together.",
    outlets: [
    o("Level 3M", "T2 Public Level 3M, #0610-ASC", "landside", "07:00 – 20:00 Daily", false),
    ],
  }),
  go_noodle_house: restaurant({
    name: "GO Noodle House", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Come step into our Qing Dynasty-inspired shop and try our amazing broth that’s steeped by more than 14 types of fish bones with our noodles cooked in Jiangxi province style. One of the all-time favourite choice of noodle bowl is our Signature Bursting Meatball Mi Xian. The burst in your mouth will blow your mind and pairing with delicious broth that comes from a tinge of the premium ShaoXing HuaDiao wine is quite essential in bringing out the distinctive taste, which only in GO Noodle House. While quality is never compromised, quantity is another factor that will leave you full, satisfied and most importantly with a smile.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-24/25B", "landside", "11:00 – 21:30 Daily", false),
    ],
  }),
  gopizza: restaurant({
    name: "GOPIZZA", cuisine: "Quick Bites", amenity: "fast_food",
    description: "GOPIZZA is a global food-tech pizza company that revolutionized the pizza industry by introducing fast and affordable personal-sized pizzas of the highest quality. Starting as a single food truck in Korea, we have experienced remarkable growth, establishing a strong presence in Korea, India, Singapore, Indonesia, Hong Kong, and expanding further worldwide, even at this very moment. By harnessing the power of food technology, including our innovative GOVEN and AI Smart Topping Table, we continuously push the boundaries of the traditional food service industry. Just as pizza allows endless transformations with its versatile toppings on a canvas of dough, we're dedicated to \"blazing\" new trails of innovation. Join us on this exciting journey as we redefine the way the world enjoys pizza.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K15", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  hard_rock_cafe_changi_airport_singapore: restaurant({
    name: "Hard Rock Cafe Changi Airport Singapore", cuisine: "Pubs & Bars / Restaurant", amenity: "bar",
    description: "Hard Rock Cafe is returning to Singapore Changi Airport and will be operating out of Terminal 2 Departures. The cafe is in the centre of Terminal 2 and features a Rock Shop, restaurant and indoor bar with a total seating capacity for 76 guests. The cafe will display a tropical mural integrating with the Tropical theme of the airport. Visit the Hard Rock Cafe Changi Airport as we serve signature Hard Rock dishes such as Legendary Steak Burgers, Baby Back Ribs and sip on signature cocktails like Hurricane while waiting to board your flight or when you are in transit. \nThe venue’s interior combines Hard Rock’s globally recognizable design, complimented by a selection of original and priceless music memorabilia from international artists, such as a full-size concert costume worn by Asian superstar Jay Chou, a Stratocaster guitar signed by the members of KISS and many other items. \nThe Rock Shop of Hard Rock Cafe Changi Airport has a wide range of collectible limited edition merchandise with unique city collection items for those who want to grab that last minute souvenir from Singapore before their flight or add unique items to their collection.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-177", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  heavenly_wang: restaurant({
    name: "Heavenly Wang", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    description: "Heavenly Wang, (旺角, which translates to Prosperity Corner) was founded in 1953 along Bugis Street, Singapore, serving local-styled breakfast favourites – Kopi, Kaya Toast and Soft-Boiled Eggs. Inspired by our Nanyang tradition and ingredients of Asian heritage, we continuously reinvent our uniquely Singapore local favourites to keep up with changing times. Today, Heavenly Wang is a household halal-cartified cafe with more than 30 locations across the island, serving signature dishes set in a modern retro ambience.",
    halal: true,
    outlets: [
    o("Level 1", "T2 Public Level 1, #01-09A", "landside", "Open 24 hours Daily", true),
    ],
  }),
  hudsons_coffee: restaurant({
    name: "Hudsons Coffee", cuisine: "Cafe", amenity: "cafe",
    description: "Originating from Melbourne, Hudsons Coffee brings Australia’s vibrant coffee culture to Changi Airport Terminal 3. Known for its premium Arabica bean blends, the café offers a variety of espresso-based drinks, frappes, milkshakes, and gourmet sandwiches, along with seasonal promotions. The outlet’s design features natural materials and reclaimed timber, creating a cozy and inviting atmosphere for travelers.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-178", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  ippudo_express: restaurant({
    name: "Ippudo Express", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Craving for scrumptious Japanese cuisine? Step into world-acclaimed ramen emporium IPPUDO EXPRESS to satiate your taste buds. With their new quick service style concept, they have designed a convenient yet high quality dining option for travellers on the go. Take your pick from IPPUDO’s signature tonkotsu broth and al dente noodles, as well as a spread of wholesome Japanese dip sandwiches and delightful salads. At IPPUDO EXPRESS, you will never have to compromise on quality and taste – it will certainly be an experience that is absolutely “oishii”.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K10", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  kenangan_coffee: restaurant({
    name: "Kenangan Coffee", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "kenangancoffee.sg", logoUrl: logo("kenangancoffee.sg"),
    description: "Kenangan Coffee, Indonesia’s fastest growing coffee chain and Southeast Asia’s first F&B Unicorn, has launched one of its first outlets in Singapore at Changi Airport Terminal 2. Offering high-quality coffee at an accessible price point, Kenangan Coffee’s wide selection of beverages meets both Asian tastes and a global palate. Among its distinctive flavours is the Kenangan Latte, which is a perfect blend of espresso-based coffee and Black Aren, a natural sweetener with a fruity, caramel-like and slightly smoky flavour.",
    outlets: [
    o("Level 2", "T2 Public Level 2, #02-12", "landside", "Open 24 hours Daily", true),
    ],
  }),
  kimchi_mama: restaurant({
    name: "Kimchi Mama", cuisine: "Restaurant", amenity: "restaurant",
    description: "Kimchi Mama brings the warmth of Korean home cooking to every dish. Inspired by her mother from young, Mrs. Kim began her journey to explore on creating the most loved kimchi dishes in the world, the taste of home where people would come together to connect and bond over a shared meal.\n\nGuests can enjoy over 50 dishes from $5.90, including Hotstone Rice Bowls, Korean-style samgyetang, soups, tteokbokki, Korean fried chicken, and more — all crafted to share the heart and flavours of Korean home kitchens.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-10", "landside", "10:30 – 22:00 Daily", false),
    ],
  }),
  liho: restaurant({
    name: "LiHO", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "LiHO was launched in Singapore on 27 May 2017 with a very simple vision to bring the joy of drinking tea to everyone through affordable and quality tea beverage creations.\n\nThere are over 80 outlets in Singapore, making quality tea available to anyone, anywhere and at any time.\n\nAt LiHO, we believe that despite differences in language, culture and beliefs within a religiously harmonious society, a simple greeting of LiHO can start conversations and create bonds. We signify a proud homegrown tea brand that every Singaporean can relate to. \n\nWe are not just selling beverages. We are providing an experience.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K13", "airside", "Open 24 hours Daily", true),
    ],
  }),
  luke_s_lobster: restaurant({
    name: "Luke's Lobster", cuisine: "Restaurant", amenity: "restaurant",
    description: "Luke's Lobster is committed to serving top-quality, sustainably sourced seafood directly from the Northeast and Canada. Our signature lobster roll, featuring four ounces of wild-caught lobster on a buttered bun with mayo, lemon butter, and Secret Seasoning is a perfect blend of freshness and flavour.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-179", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  mcdonald_s: restaurant({
    name: "McDonald’s", cuisine: "24 Hours / Fast Food / Kids", amenity: "fast_food",
    website: "mcdonalds.com.sg", logoUrl: logo("mcdonalds.com.sg"),
    description: "McDonald’s isn’t just the place for a hearty fast food meal, complete with a refreshing cup of cola and delicious fries. It is also where you would want to head to even when you are catching a red-eye flight or caught in a transit in between meal times. If you would like more than the classic McDonald’s burgers like the McChicken and the Fillet-O-Fish, you might want to check out its menu for mouth-watering meal combos that are specially created for certain festive occasions.",
    outlets: [
    o("Level 1", "T2 Public Level 1, #01-08", "landside", "Open 24 hours Daily", true),
    o("Level 3", "T2 Transit Level 3, #03-178", "airside", "Open 24 hours Daily", true),
    ],
  }),
  old_chang_kee: restaurant({
    name: "Old Chang Kee", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "oldchangkee.com", logoUrl: logo("oldchangkee.com"),
    description: "For over half a century, Singaporeans from all walks of life have enjoyed Old Chang Kee's signature Curry’O - a crispy pastry shell generously stuffed with curried potato, chicken and an egg slice, all cooked with special herbs and spices.\n\nOld Chang Kee also offers other delectable hot snacks and lip-smacking quick bites.\n\nEmbracing the wonderful traditions and noble heritage of Singapore, Old Chang Kee strives to bring to their customers the good old tastes that all come to love since 1956.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K07", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  papparich: restaurant({
    name: "PappaRich", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "The key to PappaRich’s success lies in the passion of the people dedicated to creating and showcasing authentic cuisine from age-old traditions with the best of ingredients sourced locally featuring a selection of the very best from our extended menu, bestselling dishes served quickly and efficiently without compromising to quality. Our menu features recipes ranging from 70-year old recipe of Hainan Bread spanning 3 generations, PappaRich’s special recipe Fried Chicken, PappaRich’s own White Coffee sweetened with Stevia and CNN’s Top recommendations of all-time favorites such as Satay, Pappa Chicken Rice, Pappa Prawn Mee, Char Kway Teow, Roti Canai with Curry sauce and the deliciously rich and creative drinks menu that fits right to your stomach and warms right up to your heart. You can be sure to find the ease and comfort food at PappaRich to satisfy your hunger.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-24/25A", "landside", "10:00 – 21:30 Daily", false),
    ],
  }),
  paris_baguette: restaurant({
    name: "Paris Baguette", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "parisbaguette.com.sg", logoUrl: logo("parisbaguette.com.sg"),
    description: "Born from a love of bread and a passion for quality, Paris Baguette is an international, fast-casual bakery founded in 1988 specializing in French-inspired goods. In addition to chef-inspired cakes, pastries, sandwiches, salads, all day dining menus and signature coffee and tea, we offer a unique experience to thousands of guests daily",
    outlets: [
    o("Level 1", "T2 Public Level 1, #01-04", "landside", "Open 24 hours Daily", true),
    ],
  }),
  pastamania: restaurant({
    name: "PastaMania", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Established in 1998, PastaMania is a halal-certified Italian casual dining chain offering a diverse range of pastas. From Italian classics like Prawn Aglio and Carbonara, to specially crafted fusion delights like Seafood Tom Yum and even pizzas, there is something for everyone!",
    halal: true,
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-22A", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  peach_garden: restaurant({
    name: "Peach Garden", cuisine: "Restaurant", amenity: "restaurant",
    description: "Peach Garden is a notable household name that is synonymous with authentic Chinese cuisine served in a warm and welcoming environment. From its humble beginnings to today, Peach Garden has continued to delight customers with its consistent high quality food and service standards. Today, Peach Garden Group consists of multiple Chinese dining concepts and an outdoor catering arm.\n\nAs a premium caterer of authentic Chinese cuisine, Peach Garden's catering service offers an exceptional dining experience to complement every successful event. Over the years, Peach Garden has served some of the most eminent guests at high-profile events, including royalties, presidents, senior government officials, dignitaries, celebrities, CEOs and corporate honchos.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-16", "landside", "10:30 – 22:30 Daily", false),
    ],
  }),
  pizza_maru: restaurant({
    name: "Pizza Maru", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Pizza Maru is one of Korea’s most iconic pizza brands, with over 620 outlets across Korea. Renowned for its signature green tea well-being dough, Pizza Maru’s patented recipe combines green tea, flaxseed, chlorella, barley and 12 other wholesome grains to create a uniquely healthier and flavourful pizza crust.\nBeyond its distinctive Korean-style pizzas, Pizza Maru also offers a wide range of Korean favourites including Korean fried chicken, pasta and other interesting dishes, bringing the bold and vibrant flavours of Korea to diners worldwide.\nIn Singapore, Pizza Maru can be found at Bugis+, Plaza Singapura, and Changi Airport Terminal 2, along with Pizza Maru Express at i12 Katong, continuing to share the taste of Korea with local diners.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-09", "landside", "10:30 – 22:00 Daily", false),
    ],
  }),
  pret_a_manger: restaurant({
    name: "Pret A Manger", cuisine: "Cafe", amenity: "cafe",
    description: "Pret A Manger is a beloved sandwich and coffee chain commonly referred to as Pret and based in the United Kingdom. The first shop opened in London in 1986 where the company is headquartered today. Pret’s sandwiches, salads and wraps are freshly handmade each day in shop kitchens using quality ingredients and all coffees and teas are organic. There’s plenty more to discover, including a delicious selection of veggie options. Pop in and say hello to the lovely team at Changi Airport!",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-165", "airside", "05:00 – 01:00 Daily", false),
    ],
  }),
  ramen_keisuke_singapore: restaurant({
    name: "Ramen Keisuke Singapore", cuisine: "Quick Bites / Restaurant", amenity: "fast_food",
    description: "Embark on a culinary adventure at Ramen Keisuke Singapore, where tantalizing aromas of local flavours mingle with the warmth of Japanese flavours. Indulge in our exclusive Keisuke Laksa Ramen, Keisuke Bak Kut Teh and Keisuke Hokkien Mee. Each spoonful is a testament to the chef's culinary artistry, leaving you wanting for more.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-15A", "landside", "11:00 – 22:00 Daily", false),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "starbucks.com.sg", logoUrl: logo("starbucks.com.sg"),
    description: "Sometimes, all you need is that familiar taste of your favourite cup of coffee — and that is exactly what Starbucks delivers all over the world, and here at Changi Airport too. Discover the world of coffee with a fresh cuppa brewed with the best Arabica beans from Latin America, Africa and Asia Pacific. A delightful selection of juices, cakes and pastries are also available, and are the perfect light bites before you travel.",
    outlets: [
    o("Level 2", "T2 Public Level 2, #02-33", "landside", "Open 24 hours Daily", true),
    o("Level 2", "T2 Transit Level 2, #02-158", "airside", "Open 24 hours Daily", true),
    ],
  }),
  sukiya: restaurant({
    name: "Sukiya", cuisine: "24 Hours / Cafe / Fast Food / Kids", amenity: "cafe",
    description: "SUKIYA is Japan’s No. 1 quick-service restaurant, founded in 1982 in Yokohama, and has over 2,600 locations across the world. SUKIYA specializes in Gyudon – a delicious combination of thinly-sliced tender beef cooked in a soy sauce-based savory sauce with onions all served on top of fluffy, perfectly-cooked Japanese rice. Renowned for its lightning-fast, friendly and energetic service, SUKIYA uplifts and energizes its customers around the world by providing a truly authentic Japanese experience to all.",
    outlets: [
    o("Level 2", "T2 Public Level 2, #02-02", "landside", "Open 24 hours Daily", true),
    ],
  }),
  swee_choon: restaurant({
    name: "Swee Choon", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    description: "Established in 1962, Swee Choon has a long history of serving high-quality dim sum in a quaint and casual coffee-shop setting. The restaurant's popularity stems from its use of high-quality ingredients and its extensive menu of Hong Kong and Shanghai dim sum. It is a household name amongst local gourmands and has also attracted droves of tourists",
    outlets: [
    o("Level 1", "T2 Public Level 1, #01-07", "landside", "Open 24 hours Daily", true),
    ],
  }),
  swensen_s_unlimited: restaurant({
    name: "Swensen's Unlimited", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Scoop up a taste of nostalgia with the irresistible array of Swensen’s mainstays, desserts and more at Swensen’s Unlimited, the inaugural international buffet concept located at Changi Airport, Terminal 2 (T2) Arrival Hall, #01-03. Returning to its original location at T2, bigger and better than before, this time with the world’s first Swensen’s Unlimited store. Travellers can continue to look forward to their favourites before and/or after their trips abroad and enjoy hearty reunions with loved ones in this new convivial space.",
    outlets: [
    o("Level 1", "T2 Public Level 1, #01-03", "landside", "11:00 – 23:00 Daily", false),
    ],
  }),
  taiwan_culture: restaurant({
    name: "Taiwan Culture", cuisine: "24 Hours / Restaurant", amenity: "restaurant",
    description: "Welcome to Taiwan Culture\n\nEmbark on a journey into Taiwan's vibrant culture at our restaurant, where every dish tells a unique story. Inspired by the iconic Shifen, with its bustling train tracks winding through picturesque landscapes, we blend the nostalgic charm of Taiwan's railway heritage with the enchanting allure of sky lanterns illuminating the evening skies.\n\nLocated in Singapore's Changi Airport Terminal 2, our restaurant offers a culinary exploration of Taiwan's diverse flavors, showcasing savory and authentic local dishes. Each dish is meticulously prepared using traditional recipes and locally-sourced ingredients that capture the essence of Taiwan's rich culinary heritage.\n\nJoin us at Taiwan Culture to experience the essence of Taiwan, where each meal celebrates community, craftsmanship, and the warm hospitality that defines this island nation.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-11A", "landside", "Open 24 hours Daily", true),
    ],
  }),
  texas_chicken: restaurant({
    name: "Texas Chicken", cuisine: "24 Hours / Fast Food / Kids / Quick Bites", amenity: "fast_food",
    description: "At Singapore’s Texas Chicken, we deliver authentic traditions, bold tastes and straightforward, consistent food you can trust. After all, we’re more than broasted chicken in Singapore. We’re the rugged territory forged by sun and terrain. The crisp, satisfying bite of a meal earned through hard work. The feeling of community that comes through shared moments and simple pleasures.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-22B", "landside", "Open 24 hours Daily", true),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "24 Hours / Cafe", amenity: "cafe",
    website: "coffeebean.com.sg", logoUrl: logo("coffeebean.com.sg"),
    description: "Kick back with a cuppa at The Coffee Bean & Tea Leaf. Sip on long-time favourites like The Original Ice Blended, Vanilla and Mocha Lattes, or the popular Chai Latte. Those who prefer their coffee simple can also choose from a wide selection of espresso-based drinks and the Brew Of The Day. Complement your drink with a mouth-watering selection of puffs, muffins, bagels and irresistible cakes.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-800", "airside", "Open 24 hours Daily", true),
    ],
  }),
  the_hainan_story_bakery: restaurant({
    name: "The Hainan Story Bakery", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "The best of The Hainan Story pastries get their own spotlight with a standalone bakery at Changi Airport Terminal 2 transit area.\n\nExpect all the breads, cakes and pastries you have come to love at The Hainan Story at the bakery, each handmade with love every day for the freshest bite. All breads retain The Hainan Story’s signature firm yet fluffy texture, with a good bite. All the breads are made daily and baked fresh in individual steel trays as a nod to tradition. Each of them evokes a taste of nostalgia of traditional Hainanese bakeries of the past that the Hainan community loves dearly. ️\n \n*Made Daily*Baked Freshly*Love Dearly!",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K05", "airside", "Open 24 hours Daily", true),
    ],
  }),
  the_hainan_story_coffee_toast: restaurant({
    name: "The Hainan Story Coffee & Toast", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Here at The Hainan Story Coffee & Toast, you’ll find old-school breakfasts done just right, with traditional Hainanese toasts that boast thick, fluffy buns with a pillowy-soft centre and wonderfully crisp crust — unlike the thin, flat toasts commonly found elsewhere. Traditionalists will insist on topping their toast with Home-Made Gula Melaka Kaya & Cold Butter, while the adventurous opt for the crunchy Rojak & Peanut Butter Spread. Wash that quintessential Hainanese breakfast down with some good ol’ decadent ‘Kopi Gu You’ – either Kopi C or Kopi O with a slice of additional butter thrown in. Introduced by Hainanese coffee shops in the 1930s, Kopi Gu You is Singapore’s very own rendition of the trendy Bulletproof Coffee —way before it even became a hipster drink.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K11", "airside", "Open 24 hours Daily", true),
    ],
  }),
  the_satay_club: restaurant({
    name: "The Satay Club", cuisine: "24 Hours / Pubs & Bars / Restaurant", amenity: "bar",
    description: "The Satay Club by Harry's is a fresh and exciting addition to the ever-evolving restaurant and bar scene in Singapore. This innovative concept provides patrons with a contemporary twist on the nostalgic Singaporean dining experience. As you step into The Satay Club, you'll find yourself enveloped in a modern restaurant setting that pays homage to Singapore's rich multi-ethnic and cultural heritage. Travelers and locals alike can expect a delightful fusion of local favourites with a Western influence, making it the perfect spot to indulge before embarking on their next journey. The menu is a delightful journey through Singapore's diverse culinary landscape, offering an array of popular Asian snacks like Gado Gado, Crackers & Achar, as well as mains such as Nasi Goreng Istimewa and Kicap Manis Fried Noodles. Dessert enthusiasts will be thrilled with options like Pandan Churros with Gula Melaka and Deep-Fried Kueh Salat, which seamlessly blend local flavours with international dessert concepts. The grill section takes the classic satay experience to the next level with not only the traditional satay flavours but also Kushi-yaki style skewers featuring delectable options like Tiger Prawns and Wagyu Beef Rib Fingers. To complement the flavourful dishes, The Satay Club by Harry’s offers a selection of refreshing beverages. Savour Singapore's iconic Tiger Beer or Harry's Premium Lager, brewed right here in Singapore. Don't miss the chance to explore Harry's unique cocktail creations, where international and local flavours collide in tantalizing concoctions such as Chendol Colada, TSC “Kopi” Ice and the one-of-a-kind Harry's Singapore Sling. The Satay Club by Harry's is not just a restaurant; it's a culinary adventure that combines tradition, innovation, and the vibrant flavours of Singapore to create an unforgettable dining experience.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-169", "airside", "Open 24 hours Daily", true),
    ],
  }),
  wang_noodle_house: restaurant({
    name: "Wang Noodle House", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    description: "Wang Noodle House is a noodle concept store that serves up joyful renditions of your favourite noodle staples - Wanton Noodles, Chicken Char Siew Noodles, our Signature Curry Noodles, and the Classic Trio - Laksa Sayang, Bibik's Mee Siam and Ibu's Mee Rebus.",
    outlets: [
    o("Level 1", "T2 Public Level 1, #01-09B", "landside", "Open 24 hours Daily", true),
    ],
  }),
  wee_nam_kee_hainanese_chicken_rice: restaurant({
    name: "Wee Nam Kee Hainanese Chicken Rice", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Founded in 1987, Wee Nam Kee takes pride in serving one of Singapore’s favourite and iconic dishes - Hainanese Chicken Rice.\n\nOur Founder, late Mr Wee Toon Ouut was known to be a gracious host. He often credits his father, who works as a Head Chef aboard a ship, for helping him develop a discerning palate.\n\nIt is this uncompromising commitment to quality and culinary heritage that has garnered Wee Nam Kee a loyal following, various accolades from the press, and prestigious commissions by the Singapore government to serve its famous chicken rice at various overseas events.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-K09", "airside", "Open 24 hours Daily", true),
    ],
  }),
  xw_western_grill: restaurant({
    name: "XW Western Grill", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Being the western casual dining place, XW Western Grill is your one-stop for all things grilled. Offering a line-up of smoky favourites such as steaks, chicken and fish, the combination of mouth-watering natural juices and charred flavours are perfect for insatiable palates.\n \nThe all-you-can-eat salad bar boasting unlimited servings of hot and cold sides won’t disappoint either, it comes free with any main course order or go straight for the à la carte salad bar. Kick back and enjoy western grub in this vibrant value-for-money diner – a perfect avenue for gatherings with family and friends.",
    outlets: [
    o("Level 3", "T2 Public Level 3, #03-23", "landside", "11:30 – 22:00 Daily", false),
    ],
  }),
  ya_kun_kaya_toast: restaurant({
    name: "Ya Kun Kaya Toast", cuisine: "Cafe / Homegrown / Quick Bites", amenity: "cafe",
    website: "yakun.com", logoUrl: logo("yakun.com"),
    description: "Founded more than 70 years ago as a humble coffee stall business, Ya Kun has grown leaps and bounds as a strong homegrown brand. With more than 100 outlets across Asia, it has done Singapore proud with its signature piping hot coffee and charcoal-grilled toast with homemade kaya. With the inception of its new dining experience in the form of Ya Kun Family Café, you can now find Asian Signatures – a new range of scrumptious local favourites that includes Nasi Lemak Istimewa, Laksa and Mee Rebus which are made with premium quality ingredients and freshly prepared daily.",
    outlets: [
    o("Level 2", "T2 Transit Level 2, #02-803", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
};

const terminal3Venues = {
  "365_juices_bar": restaurant({
    name: "365 Juices Bar", cuisine: "Quick Bites", amenity: "fast_food",
    description: "365果汁吧 provides refreshing and healthy fruit juices & smoothies for our customers, made with 100% natural fruits. We seek to satisfy the daily nutritional needs of our customers with high quality fruits. We aim to make Singapore a healthier country through our contribution as a fruit juice bar.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-27", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  "7cafe": restaurant({
    name: "7Café", cuisine: "Cafe / Fast Food / Quick Bites", amenity: "cafe",
    website: "7-eleven.com.sg", logoUrl: logo("7-eleven.com.sg"),
    description: "Singapore’s favourite convenience store, 7-Eleven, unveiled the city’s 2nd 7Café concept store at Changi Airport Terminal 3, elevating the convenience store experience for customers. Guests can enjoy the relaxed seating space with friends and family, and be treated to baristas preparing their drinks and meals in this chic retail outlet with a vibrant atmosphere. Located at Basement 2 of Changi Airport Terminal 3, 7Eleven & 7Café is the perfect place to make a quick pit stop for a cup of coffee and croissant, or energise yourself with a refreshing lemonade before you leave to explore the island city! Look out for the favourites from 7-Eleven’s popular range of Ready-to-Eat Meals for tasty, filling, and affordable options!",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-05", "landside", "07:00 – 23:00 Daily", false),
    ],
  }),
  "886_taiwan_ye_shi": restaurant({
    name: "886 Taiwan Ye Shi", cuisine: "", amenity: "restaurant",
    description: "Transport yourself to Taiwan at 886 Taiwan Ye Shi, where authentic street food meets the iconic sights of Shifen. From glowing tian deng to the signature railway setting, enjoy an immersive Taiwanese dining experience right here in Changi Airport Terminal 3.\n走进 886 Taiwan Yeshi，仿佛瞬间置身台湾。品尝道地台湾街头美食，沉浸于以十分老街为灵感打造的经典铁道与璀璨天灯场景，在樟宜机场第三航厦享受一场身临其境的台湾美食体验。",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-40/40A", "landside", "10:30 – 22:30 Daily", false),
    ],
  }),
  allora_ristorante_bar_at_crowne_plaza_changi_airport: restaurant({
    name: "Allora Ristorante & Bar at Crowne Plaza Changi Airport", cuisine: "Cafe / Fine Dining / Pubs & Bars / Restaurant", amenity: "cafe",
    description: "The award-winning Allora Ristorante and Bar is an authentic Italian restaurant, bar, and alfresco dining spot that serves up comfort food with authentic Italian flair promising a warm and approachable atmosphere and comforting food and beverages that will take you on a journey through Italy. Allora has been recognised as among the TOP 100 Restaurants of the World by Luxury Lifestyle Awards 2024.\n\nAt the helm of Allora's culinary expertise is Chef Stefano Sanna, a globetrotting culinary artist with over a decade of experience and award-winning Head Pizzaiolo Chef Vincenzo Lavecchia, who handcrafts pizzas made in the mosaic centerpiece oven - a delectable experience not to be missed!",
    outlets: [
    o("Level 1", "T3 Public Level 1, #01-999", "landside", "06:00 – 00:00 Daily", false),
    ],
  }),
  bikanervala: restaurant({
    name: "Bikanervala", cuisine: "Restaurant", amenity: "restaurant",
    description: "Hungry for sugar and spice and everything nice at Terminal 3? Satisfy your cravings for amazingly rich Indian vegetarian food at Bikanervala. As a one-stop shop that serves up diverse and deluxe cuisines from the best of India, it also offers a wide range of freshly made Indian sweet and savoury snacks that are bound to entice your taste buds. Experience the signature dishes through the richness of the Raj Kachori, the crunchiness of the Samosas and the homeliness of the Chole Bhature. So stop by for an unforgettable experience that will truly let you have a taste of real India.",
    outlets: [
    o("Level 4", "T3 Public Level 4, #04-01", "landside", "09:00 – 23:00 Daily", false),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "24 Hours / Fast Food / Kids", amenity: "fast_food",
    description: "Welcome to the home of flame-grilled perfection! Enjoy the best-selling, signature flame-grilled WHOPPER®️ as well as other top BK favourites such as the velvety smooth Double Mushroom Swiss, deliciously juicy Tendergrill®️ Chicken that is made of chicken thigh fillet and the irresistible sides such as Onion Rings, Taro Turnover, HERSHEY’S®️ Sundae Pie and more! Sink your teeth in our juicy burgers now.",
    outlets: [
    o("Level 3", "T3 Transit Level 3, #03-13", "airside", "Open 24 hours Daily", true),
    ],
  }),
  central_thai: restaurant({
    name: "Central Thai", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Central Thai continuously strive & aim to bring honest and quality Thai fare to discerning diners. Every dishes we offer is exciting and prepared with the freshest ingredients from Thailand and locally. We whip up a spread of favourites from Thai salads, curries, soups to wok stir-fries. Having a high commitment to cook fresh in our dishes right after taking your order to ensure every dish is fresh and flavoursome when they arrive at your table. Here at Central Thai, we believe everyone should be able to enjoy good & affordable Halal Thai cuisine.",
    halal: true,
    outlets: [
    o("Level 3", "T3 Public Level 3, #03-30/31", "landside", "11:30 AM - 09:30 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 11:30 AM - 10:00 PM (Friday, Saturday)", false),
    ],
  }),
  curry_times_old_chang_kee: restaurant({
    name: "Curry Times & Old Chang Kee", cuisine: "Kids / Quick Bites", amenity: "fast_food",
    description: "For over half a century, Singaporeans from all walks of life have enjoyed Old Chang Kee's signature Curry’O - a crispy pastry shell generously stuffed with curried potato, chicken and an egg slice, all cooked with special herbs and spices.\nOld Chang Kee also offers other delectable hot snacks and lip-smacking quick bites.\n\nEmbracing the wonderful traditions and noble heritage of Singapore, Old Chang Kee strives to bring to their customers the good old tastes that all come to love since 1956.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-51", "landside", "08:00 – 21:30 Daily", false),
    ],
  }),
  encik_tan: restaurant({
    name: "Encik Tan", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Recognising the demand from our Muslim counterparts for authentic Chinese hawker fare, the Encik Tan brand was introduced as a Halal-certified mini food atrium concept that dishes up a parade of popular local Chinese dishes, such as Hainanese Curry Rice, Wanton Noodles and Claypot Rice. All recipes are adapted using Halal ingredients and fine-tuned to deliver the same nostalgic flavour and taste of the original dishes. Encik Tan ensures that every dining experience is a flavourful journey that delights all. Encik Tan offers a pleasant dining experience, complete with air conditioning for added comfort. With numerous outlets across Singapore, Encik Tan ensures that authentic Chinese hawker fare is conveniently accessible to all, allowing more people to savour these beloved flavours in comfort.",
    halal: true,
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-K6", "airside", "Open 24 hours Daily", true),
    ],
  }),
  gourmet_sarawak: restaurant({
    name: "Gourmet Sarawak", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "At Singapore Changi Airport, Gourmet Sarawak brings the flavours of Sarawakian cuisine to global travelers. K.L. Lim, a Sarawak-born partner, launched the outlet in Terminal 4, with a second opening in Terminal 3 on May 24, 2023. They serve traditional dishes like Kolo Mee, Laksa, Curry Chicken Rice, and Hainanese Chicken Rice. The Kolo Mee uses noodles flown directly from a reputable Kuching factory. The menu includes a variety of specialty drinks, such as the 3 Layer Milk Tea sweetened with healthier Gula Apong. Also, they provide Grab & Go items and Kek Lapis, a beautiful layer cake naive to Sarawak. Recognized by Sarawak Trade & Tourism Office in Singapore (Statos) as one of Singapore's Top 3 Best Sarawak Foods, and holding a 4.8 Google ratng, Gourmet Sarawak successfully delivers authentic Sarawakian gastronomy to the airport's international visitors.",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-K5", "airside", "Open 24 hours Daily", true),
    ],
  }),
  harry_s: restaurant({
    name: "Harry's", cuisine: "24 Hours / Restaurant", amenity: "restaurant",
    description: "Founded in 1992, Harry’s is a collection of everyday bars and kitchens - your home away from home. Harry’s is a meeting spot where you always feel welcome to be yourself and connect with old and new friends while enjoying inclusive and comforting drinks with generous, hearty mains, snacks and shareables.",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-08", "airside", "Open 24 hours Daily", true),
    ],
  }),
  heavenly_wang: restaurant({
    name: "Heavenly Wang", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    description: "Heavenly Wang, (旺角, which translates to Prosperity Corner) was founded in 1953 along Bugis Street, Singapore, serving local-styled breakfast favourites – Kopi, Kaya Toast and Soft-Boiled Eggs. Inspired by our Nanyang tradition and ingredients of Asian heritage, we continuously reinvent our uniquely Singapore local favourites to keep up with changing times. Today, Heavenly Wang is a household halal-cartified cafe with more than 30 locations across the island, serving signature dishes set in a modern retro ambience.",
    halal: true,
    outlets: [
    o("Level 1", "T3 Public Level 1, #01-25", "landside", "Open 24 hours Daily", true),
    o("Level 2", "T3 Transit Level 2, #02-K1", "airside", "Open 24 hours Daily", true),
    ],
  }),
  hokkaido_baked_cheese_tart: restaurant({
    name: "Hokkaido Baked Cheese Tart", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Sink your teeth into one of the most scrumptious baked delights at Hokkaido Baked Cheese Tart! These tarts originate from Hokkaido, Japan and are made by resident bakers who have worked with counterparts from their place of origin to further improve the recipe of this baked pastry to ensure every bite is simply heavenly. Absolutely unique in its taste and texture, every tart is created with a soft and creamy centre. This centre is a blend of three different high quality specialty cheeses, piped into a crunchy shortcrust pastry base. No wonder no one can get enough of these tarts!",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-11", "landside", "11:00 – 21:00 Daily", false),
    ],
  }),
  hudsons_coffee: restaurant({
    name: "Hudsons Coffee", cuisine: "Cafe", amenity: "cafe",
    description: "Originating from Melbourne, Hudsons Coffee brings Australia’s vibrant coffee culture to Changi Airport Terminal 3. Known for its premium Arabica bean blends, the café offers a variety of espresso-based drinks, frappes, milkshakes, and gourmet sandwiches, along with seasonal promotions. The outlet’s design features natural materials and reclaimed timber, creating a cozy and inviting atmosphere for travelers.",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-60", "airside", "Open 24 hours Daily", true),
    ],
  }),
  ichikokudo_hokkaido_ramen: restaurant({
    name: "Ichikokudo Hokkaido Ramen", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Be the first to try Ichikokudo Hokkaido Ramen.\n \nEvery day we spend hours slowly simmering chicken bones to create a rich and flavorful soup. The finishing touch is made with a blend of bonito and mackerel all brought together with subtle umami from 100% Hokkaido kelp. We use a special blend of flour that includes Hokkaido wheat to make our noodles richly textured and satisfyingly firm. Topped with a generous helping of aosa seaweed to evoke the aroma of the Hokkaido sea.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-58", "landside", "11:00 – 00:00 Daily", false),
    ],
  }),
  ippudo_express: restaurant({
    name: "Ippudo Express", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Craving for scrumptious Japanese cuisine? Step into world-acclaimed ramen emporium IPPUDO EXPRESS to satiate your taste buds. With their new quick service style concept, they have designed a convenient yet high quality dining option for travellers on the go. Take your pick from IPPUDO’s signature tonkotsu broth and al dente noodles, as well as a spread of wholesome Japanese dip sandwiches and delightful salads. At IPPUDO EXPRESS, you will never have to compromise on quality and taste – it will certainly be an experience that is absolutely “oishii”.",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-K3", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  itea_premium: restaurant({
    name: "ITEA Premium", cuisine: "Quick Bites", amenity: "fast_food",
    website: "itea.sg", logoUrl: logo("itea.sg"),
    description: "itea is a Tropical Asia Tea Brand from Singapore, inspired by the vibrant flavours, fruits, and culture of Southeast Asia. By combining quality tea with tropical ingredients, we create refreshing tea experiences that bring the Taste of Tropical Asia to the world. Taste of Tropical Asia.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-30", "landside", "11:00 – 22:00 Daily", false),
    ],
  }),
  koi_the: restaurant({
    name: "KOI Thé", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Why head to Taiwan for delicious bubble milk tea when you can enjoy excellent ones right here at the airport? Established in Taiwan, KOI is one of the trendiest bubble milk tea brands to have arrived on our shores. KOI stands for the Key Of Inspiration, suitably named because of how the drinks provide great taste and amazing refreshment. Made through a process that uses natural ingredients, you can rest assured that the drinks are delicious just as the pearls are fun to chew. So cool and refreshing, you will simply want more and more of these bubble milk tea drinks!. Sip in the fun today.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-12", "landside", "11:00 – 20:00 Daily", false),
    ],
  }),
  kopitiam: restaurant({
    name: "Kopitiam", cuisine: "24 Hours / Food Court / Kids / Quick Bites", amenity: "food_court",
    description: "At Kopitiam, we make good food affordable for everyone. We connect family and friends through joyful food experiences.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-03", "landside", "Open 24 hours Daily", true),
    o("Basement 2", "T3 Public Basement 2, #B2-10(A)", "landside", "Open 24 hours Daily", true),
    ],
  }),
  korea_culture: restaurant({
    name: "Korea Culture", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Korea Culture – A New Korean Dining Experience! Welcome to Korea Culture, where we blend the best of Korean and Western cuisine with an exciting buffet-style twist! Indulge in free-flow banchan, beverages, and ice cream, making every meal a feast to remember. To keep things fresh, we introduce a new concept every six months—right now, step into the world of Squid Game with an immersive dining experience inspired by the global sensation. Stay tuned for more exciting adventures at Korea Culture!",
    outlets: [
    o("Level 3", "T3 Public Level 3, #03-33", "landside", "10:30 – 22:30 Daily", false),
    ],
  }),
  krispy_kreme: restaurant({
    name: "Krispy Kreme", cuisine: "Quick Bites", amenity: "fast_food",
    website: "manna360.com.sg", logoUrl: logo("manna360.com.sg"),
    description: "Krispy Kreme is an American Icon - home to world famous original glazed doughnuts. Krispy Kreme delivers a wide variety of delicious doughnuts, made fresh daily, with a mission to bring joy and to enhance lives. At Krispy Kreme, we believe that everyone deserves a Happy Place!",
    outlets: [
    o("Level 2", "T3 Public Level 2, #02-93A", "landside", "10:30 AM - 09:30 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 10:30 AM - 10:00 PM (Friday, Saturday)", false),
    ],
  }),
  lema_dumpling_and_le_congee_noodle_house: restaurant({
    name: "LeMa Dumpling and LE Congee & Noodle House", cuisine: "Restaurant", amenity: "restaurant",
    website: "paradisegp.com", logoUrl: logo("paradisegp.com"),
    description: "LeMa Dumpling brings you food that reminds you of home — comforting, familiar, and made with love. Savour each and every of our jumbo dumplings, handcrafted with premium ingredients, filled with care, patience, and a whole lot of heart, just like how mum would make them. Each dumpling is a little parcel of joy, with tender and juicy fillings encased in delicate dough, pressed with skill and soul. Whether you’re craving the warmth of classic pork and cabbage, succulence of prawn and chives, or kids’ favourite prawn and corn, there’s one thing you’ll taste in every bite — satisfying, homely fulfilment. At LeMa Dumpling, immerse yourself in sweet, nostalgic memories, and the heartwarming taste of happiness.",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-28", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  llaollao: restaurant({
    name: "Llaollao", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Dig in to the delicious taste of Llaollao! Llaollao is brand of healthy frozen yogurt from Alicante, Spain. Made from skimmed milk at the moment of serving, it is absolutely loaded with natural goodness. Combine it with a generous serving of the finest toppings (ranging from freshly-chopped seasonal fruits to cereals and other crunchy delights) and you get a cupful of naturally scrumptious treats. Try it yourself today!",
    outlets: [
    o("Level 2", "T3 Public Level 2, #02-93", "landside", "10:30 AM - 09:30 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 10:30 AM - 10:00 PM (Friday, Saturday)", false),
    ],
  }),
  mala_mia: restaurant({
    name: "Mala Mia", cuisine: "", amenity: "restaurant",
    description: "Turn up the heat at Malamia, where hot, bold, and anything but ordinary is the vibe. Reimagining Singapore's favourite mala with signature soup bases inspired by local favourites, fully customisable bowls, and spice levels that match your mood, every visit is made your way. It's the mala experience you'll keep coming back for, right here at Changi Airport Terminal 3.\n来到 Malamia，点燃你的麻辣热潮！以新加坡人喜爱的风味为灵感，推出多款招牌汤底，搭配自由选择的食材与辣度，每一碗都能随心打造，满足你的味蕾。从香浓顺口到火辣过瘾，Malamia 为你带来耳目一新的本地麻辣体验，就在樟宜机场第三航厦。",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-49/50", "landside", "10:30 – 22:30 Daily", false),
    ],
  }),
  mcdonald_s: restaurant({
    name: "McDonald’s", cuisine: "24 Hours / Fast Food / Kids", amenity: "fast_food",
    website: "mcdonalds.com.sg", logoUrl: logo("mcdonalds.com.sg"),
    description: "McDonald’s isn’t just the place for a hearty fast food meal, complete with a refreshing cup of cola and delicious fries. It is also where you would want to head to even when you are catching a red-eye flight or caught in a transit in between meal times. If you would like more than the classic McDonald’s burgers like the McChicken and the Fillet-O-Fish, you might want to check out its menu for mouth-watering meal combos that are specially created for certain festive occasions.",
    outlets: [
    o("Level 1", "T3 Public Level 1, #01-21", "landside", "Open 24 hours Daily", true),
    ],
  }),
  mr_teh_tarik_express: restaurant({
    name: "Mr Teh Tarik Express", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "From its humble origins back in 2004 as a pushcart stall, Mr Teh Tarik has grown into a local favourite, with 20 outlets across Singapore serving a wide variety of popular local beverages. Apart from its renowned Teh Tarik (a local name for “pulled tea”), it also offers a wonderful spread of lights snacks, local fare, and Singaporean-Indian dishes like customer favourites Mutton or Chicken Briyani, Mee Goreng, Nasi Goreng, Prata, and Thosai.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-22", "landside", "Open 24 hours Daily", true),
    ],
  }),
  mr_coconut: restaurant({
    name: "Mr. Coconut", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "mrcoconut.sg", logoUrl: logo("mrcoconut.sg"),
    description: "Mr Coconut is a beverage brand specializing in fresh coconut-based drinks and desserts. Our menu features signature coconut shakes, fresh coconut milk teas, and refreshing drinks crafted to deliver a rich, tropical taste.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-30A", "landside", "10:30 – 21:15 Daily", false),
    ],
  }),
  nam_kee_pau_hong_kong_egglet_mee_hoon_kueh: restaurant({
    name: "Nam Kee Pau/ Hong Kong Egglet/ Mee Hoon Kueh", cuisine: "Quick Bites", amenity: "fast_food",
    website: "facebook.com", logoUrl: logo("facebook.com"),
    description: "Nam Kee Pau (南記)\n \nNam Kee Pau is a renowned traditional delicacy from Malaysia. With each Pau meticulously crafted daily using the brand’s exclusive secret recipe. Beyond their signature Paus, customers can also enjoy a variety of steamed snacks or savour a hearty meal of hand-torn Mee Hoon Kueh. Proudly operating more than 40 outlets across Singapore, Nam Kee Pau continues to serve customers with its authentic offerings.\n\nHong Kong Egglet (香港鷄蛋仔)\n \nHong Kong Egglet is a popular street food chain establishment, specialising in freshly made “Gai Daan Zai” (Egg Waffles). Known for its crispy exterior and fluffy texture, these Egglets are made using a traditional secret recipe, obtained from a renowned vendor in Hong Kong. While staying true to its nostalgic taste, Hong Kong Egglet takes charge in creativity and innovation by offering unique variations, to provide customers with a wider and more delicious selections.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-25", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
  namnam: restaurant({
    name: "NamNam", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "NamNam was founded by founder Chef Nam Q Nguyen through his love for cooking, serving fresh, wholesome, and no added MSG Vietnamese pho and banh mi in Singapore since 2012. NamNam is about repackaging the old and traditional into a modern interpretation of the increasingly popular Vietnamese street food. Every element, from the interior decoration and tightly arranged communal seating to the menu, is carefully curated to resemble the nostalgic street setting in Vietnam, juxtaposed with an industrial chic touch.",
    outlets: [
    o("Level 2", "T3 Public Level 2, #02-91", "landside", "07:00 – 22:00 Daily", false),
    ],
  }),
  o_coffee_club: restaurant({
    name: "O'Coffee Club", cuisine: "24 Hours / Cafe / Kids / Quick Bites", amenity: "cafe",
    description: "Get your fix of gourmet coffee and delicious comfort food at O' Coffee Club. \n \nOur richly brewed gourmet coffee is made from a range of freshly roasted coffee beans including Jamaican Blue Mountain, rare Ethiopian Yirgacheffe, and the O' Coffee Club Classic.\n \nWe have mains such as our All-Day Breakfast selection (including Hearty Breakfast, Eggs Benedict and our Belgian Waffle range), Creamy Carbonara (a bestseller), Truffle Mushroom Pizza and Seafood Pizza, to name a few. Also don't miss our Muddy Mud Pie dessert, a popular choice.",
    outlets: [
    o("Level 2", "T3 Public Level 2, #02-81", "landside", "Open 24 hours Daily", true),
    ],
  }),
  old_chang_kee: restaurant({
    name: "Old Chang Kee", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "oldchangkee.com", logoUrl: logo("oldchangkee.com"),
    description: "For over half a century, Singaporeans from all walks of life have enjoyed Old Chang Kee's signature Curry’O - a crispy pastry shell generously stuffed with curried potato, chicken and an egg slice, all cooked with special herbs and spices.\n\nOld Chang Kee also offers other delectable hot snacks and lip-smacking quick bites.\n\nEmbracing the wonderful traditions and noble heritage of Singapore, Old Chang Kee strives to bring to their customers the good old tastes that all come to love since 1956.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-51B", "landside", "08:00 – 21:30 Daily", false),
    o("Level 2", "T3 Transit Level 2, #02-K2", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  paradise_dynasty: restaurant({
    name: "Paradise Dynasty", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Set to delight with both northern and southern Chinese cuisine with an innovative touch, Dynasty captures the finer points of bygone eras in contemporary style. Delve into the legend of Paradise’s Xiao Long Bao as we pay tribute to this time-honoured delicacy with eight types of fusion xiao long bao. Touted as a world-first, our xiao long bao comes in never-before, innovative flavours like crab roe, cheese, garlic, Korean kimchi, ma la, and the kings among kings - foie gras and black truffle. Be awed by the experience, the refreshing take on delicacies and the dragon’s impeccable presence at Paradise Dynasty.",
    outlets: [
    o("Level 3", "T3 Public Level 3, #03-32", "landside", "10:30 – 23:00 Daily", false),
    ],
  }),
  paris_baguette: restaurant({
    name: "Paris Baguette", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "parisbaguette.com.sg", logoUrl: logo("parisbaguette.com.sg"),
    description: "Born from a love of bread and a passion for quality, Paris Baguette is an international, fast-casual bakery founded in 1988 specializing in French-inspired goods. In addition to chef-inspired cakes, pastries, sandwiches, salads, all day dining menus and signature coffee and tea, we offer a unique experience to thousands of guests daily",
    outlets: [
    o("Level 1", "T3 Public Level 1, #01-22", "landside", "Open 24 hours Daily", true),
    ],
  }),
  pret_a_manger: restaurant({
    name: "Pret A Manger", cuisine: "Cafe", amenity: "cafe",
    description: "Pret A Manger is a beloved sandwich and coffee chain commonly referred to as Pret and based in the United Kingdom. The first shop opened in London in 1986 where the company is headquartered today. Pret’s sandwiches, salads and wraps are freshly handmade each day in shop kitchens using quality ingredients and all coffees and teas are organic. There’s plenty more to discover, including a delicious selection of veggie options. Pop in and say hello to the lovely team at Changi Airport!",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-59", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  rasamala: restaurant({
    name: "RASAMALA", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "RASAMALA by Chengdu Bowl is a modern Halal Sichuan dining concept, reimagining the bold, multifaceted flavours of Sichuan cuisine for a broader and more diverse audience.\nEvolving from Chengdu Bowl’s flagship at Changi Airport, the concept marks a new chapter for the brand — one that embraces inclusivity while staying rooted in the essence of Sichuan cooking. Here, diners are invited to discover a cuisine that goes beyond heat and numbing spice, revealing layers of aroma, depth, and balance.\nSet within one of Singapore’s busiest international gateways, RASAMALA offers a welcoming space for travellers and families alike — where familiar comforts meet vibrant flavours, and where Sichuan cuisine becomes approachable, shareable, and enjoyable for all.",
    halal: true,
    outlets: [
    o("Level 3", "T3 Public Level 3, #03-21", "landside", "11:00 – 22:00 Daily", false),
    ],
  }),
  roost: restaurant({
    name: "Roost", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    description: "Roost – A Brand-New Approach to Singapore’s Favourite Chicken Rice Roost’s innovative kitchen and cozy restaurant are focused on Singapore’s beloved national dish – Chicken Rice. Savour in the wonderful satisfaction we bring to you through our updated take on popular Local and South-East Asian delights. Roost is where families and friends come together to relax and enjoy good company and great food. All recipes contain No Added MSG and use only the freshest locally-sourced ingredients.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-34", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  rotiboy: restaurant({
    name: "Rotiboy", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Rotiboy is a specialty bakery that offers the iconic signature bun - “Rotiboybun”, which is crispy on the outside and moist on the inside and has an unforgettable taste and aroma of coffee. The exceptional taste of the Rotiboybun keeps our customers wanting more — “One is Never Enough”. Other signature bun options available are — Buttermilkboy, Mochaboy, and Cheeseboy. Also, a-must-try are Rotiboy’s Signature Croissants – Croboy & Coffee Croboy. \nRotiboy’s vision is to be an outstanding global brand that touches the lives of all the people in the world through their products, services and values.\nThe Rotiboy @ Changi Airport Terminal 3 is MUIS halal certified and has been recognised as one of the Top 3 Bakeries in Changi by Three Best Rated®. Rotiboy’s products are available for takeaway or a quick bite at the public seating area in front of the kiosk.",
    halal: true,
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-28", "landside", "10:00 – 20:00 Daily", false),
    ],
  }),
  singapore_food_street: restaurant({
    name: "Singapore Food Street", cuisine: "24 Hours / Food Court", amenity: "food_court",
    description: "Discover Singapore Food Street at Changi Airport Terminal 3 Transit Area\n\nLocated in the heart of Changi Airport’s Terminal 3 transit area, Singapore Food Street offers travellers and locals alike a chance to experience the vibrant flavours of Singapore’s \nculinary heritage.\n\nSavour iconic hawker classics like Tiong Bahru Chicken Rice, Rong Cheng Rou Gu Cha, and the Michelin Bib Gourmand-awarded Tai Wah Pork Noodle. For those craving international delights, enjoy highlights such as Ramen King, Chef Wei HK Cheong Fun, Chef Kin HK Wanton Noodle, Flourful Delights, Chef Minh Vietnamese Pho, and King of Fried Rice. Looking for Muslim-friendly options? Indulge in crowd-pleasers like Thai Makan, Husk Nasi Lemak, and Kaveri — ensuring there’s something for every palate and preference.\n\nSet amidst lush greenery and rustic décor, Singapore Food Street combines the charm of nature with a cozy, welcoming dining atmosphere. Whether you’re on a layover, catching a flight, or just exploring the transit area, take your taste buds on a delightful culinary journey before your next adventure!",
    outlets: [
    o("Level 3", "T3 Transit Level 3, #03-11", "airside", "Open 24 hours Daily", true),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "starbucks.com.sg", logoUrl: logo("starbucks.com.sg"),
    description: "Sometimes, all you need is that familiar taste of your favourite cup of coffee — and that is exactly what Starbucks delivers all over the world, and here at Changi Airport too. Discover the world of coffee with a fresh cuppa brewed with the best Arabica beans from Latin America, Africa and Asia Pacific. A delightful selection of juices, cakes and pastries are also available, and are the perfect light bites before you travel.",
    outlets: [
    o("Level 2", "T3 Public Level 2, #02-90", "landside", "Open 24 hours Daily", true),
    ],
  }),
  swensen_s: restaurant({
    name: "Swensen's", cuisine: "Cafe / Kids / Restaurant", amenity: "cafe",
    description: "Swensen's has developed over the years to become an award-winning restaurant chain offering not only ice cream, but fun and friendly casual-dining with a wide selection of hearty food, desserts, beverages, ice cream cakes and takeaway novelties. \n\nNow a household name in Singapore, Swensen’s is synonymous with sweet memories of good time spent with loved ones. Since the opening of the first 200-seater restaurant 1979, Swensen’s has expanded to over 20 full-service restaurants serving an all-day menu of food and ice cream sundaes, and continues to bring people together for hearty meals and shared memories.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-31/32", "landside", "11:00 – 22:30 Daily", false),
    ],
  }),
  tealive: restaurant({
    name: "tealive", cuisine: "Quick Bites", amenity: "fast_food",
    description: "tealive began its breakthrough journey as a humble tea brand from Malaysia. Today, we are Southeast Asia’s largest lifestyle tea brand with over 800 outlets around the world! Still, one thing remains true to us – our quest to bring joy through tea. From serving freshly-brewed beverages at our outlets to delivering our popular DIY bubble tea kits to your doorstep, you know you can count on tealive for an unforgettable experience!",
    outlets: [
    o("Level 1", "T3 Public Level 1, #01-23", "landside", "10:30 AM - 09:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 10:30 AM - 09:30 PM (Friday, Saturday) | 10:30 – 21:00", false),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "24 Hours / Cafe", amenity: "cafe",
    website: "coffeebean.com.sg", logoUrl: logo("coffeebean.com.sg"),
    description: "Kick back with a cuppa at The Coffee Bean & Tea Leaf. Sip on long-time favourites like The Original Ice Blended, Vanilla and Mocha Lattes, or the popular Chai Latte. Those who prefer their coffee simple can also choose from a wide selection of espresso-based drinks and the Brew Of The Day. Complement your drink with a mouth-watering selection of puffs, muffins, bagels and irresistible cakes.",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-K4", "airside", "Open 24 hours Daily", true),
    ],
  }),
  the_kitchen_by_wolfgang_puck: restaurant({
    name: "The Kitchen By Wolfgang Puck", cuisine: "Restaurant", amenity: "restaurant",
    description: "Located in Terminal 3, The Kitchen by Wolfgang Puck is a premium casual dining restaurant offering an all-day menu curated by the renowned chef. The restaurant provides a relaxed setting for travellers to enjoy everything from light appetisers to hearty mains, including hand-stretched pizzas and specially curated burgers made with Wolfgang Puck’s signature recipes, along with a selection of beverages at the bar.",
    outlets: [
    o("Level 2", "T3 Transit Level 2, #02-42", "airside", "06:00 – 01:00 Daily", false),
    ],
  }),
  thejellyhearts: restaurant({
    name: "TheJellyHearts", cuisine: "Cafe / Quick Bites", amenity: "cafe",
    description: "Founded in 2007, TheJellyHearts specialises in customisable, handcrafted cakes and sweet treats suitable for all ages. Each creation is handmade daily using fresh ingredients, and crafted to be a delicious art piece that makes for a feast for both the eyes and the mouth.\n\nTheJellyHearts is the first retailer in Singapore to sell a full range of jelly cheesecakes and sweet treats. Its mastery in customisation makes it an excellent choice for celebrations and corporate events.\n\nAll products are Halal-certified, making the sweet treats available to everyone and suitable for all occasions. \n\nTheJellyHearts Cookies are gluten-free. For cookie flavour availability, kindly approach the staff at the outlet.",
    halal: true,
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-29", "landside", "11:00 AM - 09:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 11:00 AM - 09:30 PM (Friday, Saturday)", false),
    ],
  }),
  tim_hortons_sg: restaurant({
    name: "Tim Hortons SG", cuisine: "Cafe / Kids / Quick Bites", amenity: "cafe",
    website: "timhortons.sg", logoUrl: logo("timhortons.sg"),
    description: "Tim Hortons® Singapore Founded in 1964, Tim Hortons® has grown from a single Canadian coffee shop into a global icon built on the promise of being \"Always Fresh.\" Now brewing smiles across the Lion City, Tim Hortons® Singapore is dedicated to serving our world-famous 100% Arabica coffee, signature Timbits®, and hand-dipped donuts to local communities. With 15 outlets and growing, we are rapidly expanding our footprint to bring high-quality brews and freshly prepared sourdough melts across Singapore. Whether it’s a morning caffeine fix or a mid-day treat, we invite you to experience a taste of Canadian heritage and hospitality at our Changi Airport outlet.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-13", "landside", "09:00 – 23:00 Daily", false),
    ],
  }),
  tp_tea: restaurant({
    name: "TP TEA", cuisine: "Quick Bites", amenity: "fast_food",
    description: "With more than 30 years of experience, TP TEA has now expanded across Asia to bring its brand of high quality tea to tea lovers. TP TEA selects only tea leaves of the finest quality in the creation of its brew. It is also committed to innovating its products, bringing fresh ways of enjoying tea.",
    outlets: [
    o("Level 2", "T3 Public Level 2, #02-93B", "landside", "10:30 AM - 09:30 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 10:30 AM - 10:00 PM (Friday, Saturday)", false),
    ],
  }),
  ya_kun_family_cafe: restaurant({
    name: "Ya Kun Family Cafe", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Founded more than 70 years ago as a humble coffee stall business, Ya Kun has grown leaps and bounds as a strong homegrown brand. With more than 100 outlets across Asia, it has done Singapore proud with its signature piping hot coffee and charcoal-grilled toast with homemade kaya. With the inception of its new dining experience in the form of Ya Kun Family Café, you can now find Asian Signatures – a new range of scrumptious local favourites that includes Nasi Lemak Istimewa, Laksa and Mee Rebus which are made with premium quality ingredients and freshly prepared daily.",
    outlets: [
    o("Basement 2", "T3 Public Basement 2, #B2-07", "landside", "07:30 – 23:00 Daily", false),
    ],
  }),
};

const terminal4Venues = {
  andes_by_astons: restaurant({
    name: "Andes by Astons", cuisine: "Restaurant", amenity: "restaurant",
    description: "If you cannot get enough of ASTONS Specialties, you certainly must try ANDES BY ASTONS! Created by the same people who brought you the mouth-watering steaks, ANDES is the much sought-after cowboy themed version which is also priced affordably and serves up dishes that are just as delectable. Discerning diners will be applauding to the fantastic food and prices at ANDES. With quality ingredients and generous portions, the menu includes a wide selection of steak cuts, chicken, seafood and spaghetti with most of the main courses including two side dishes where diners can select from a vast variety of delicious chips, salads and so much more!",
    outlets: [
    o("Level 2M", "T4 Public Level 2M, #02-202", "landside", "10:30 – 23:00 Daily", false),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "24 Hours / Fast Food / Kids", amenity: "fast_food",
    description: "Welcome to the home of flame-grilled perfection! Enjoy the best-selling, signature flame-grilled WHOPPER®️ as well as other top BK favourites such as the velvety smooth Double Mushroom Swiss, deliciously juicy Tendergrill®️ Chicken that is made of chicken thigh fillet and the irresistible sides such as Onion Rings, Taro Turnover, HERSHEY’S®️ Sundae Pie and more! Sink your teeth in our juicy burgers now.",
    outlets: [
    o("Level 2M", "T4 Public Level 2M, #02-204", "landside", "Open 24 hours Daily", true),
    ],
  }),
  crystal_jade_go: restaurant({
    name: "Crystal Jade GO", cuisine: "Restaurant", amenity: "restaurant",
    description: "Designed to provide quick and quality Cantonese dishes for dine-in and takeaway, Crystal Jade GO’s menu is curated to cater to diners who are looking for a no-fuss, quality and affordable dining experience; be it a hearty meal, light bites or take-away, anytime of the day. Boasting classics and modern interpretations dishes at value-for-money prices, the all-day dining menu spans signature roast bowl, succulent roast meats, dim sum, congee, sides and desserts.",
    outlets: [
    o("Level 2", "T4 Transit Level 2, #02-41", "airside", "06:00 – 00:00 Daily", false),
    ],
  }),
  curry_times_old_chang_kee: restaurant({
    name: "Curry Times & Old Chang Kee", cuisine: "Kids / Quick Bites", amenity: "fast_food",
    description: "For over half a century, Singaporeans from all walks of life have enjoyed Old Chang Kee's signature Curry’O - a crispy pastry shell generously stuffed with curried potato, chicken and an egg slice, all cooked with special herbs and spices.\nOld Chang Kee also offers other delectable hot snacks and lip-smacking quick bites.\n\nEmbracing the wonderful traditions and noble heritage of Singapore, Old Chang Kee strives to bring to their customers the good old tastes that all come to love since 1956.",
    outlets: [
    o("Level 2", "T4 Transit Level 2, #02-81/82", "airside", "08:00 – 20:00 Daily", false),
    ],
  }),
  go_noodle_house: restaurant({
    name: "GO Noodle House", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "Come step into our Qing Dynasty-inspired shop and try our amazing broth that’s steeped by more than 14 types of fish bones with our noodles cooked in Jiangxi province style. One of the all-time favourite choice of noodle bowl is our Signature Bursting Meatball Mi Xian. The burst in your mouth will blow your mind and pairing with delicious broth that comes from a tinge of the premium ShaoXing HuaDiao wine is quite essential in bringing out the distinctive taste, which only in GO Noodle House. While quality is never compromised, quantity is another factor that will leave you full, satisfied and most importantly with a smile.",
    outlets: [
    o("Level 2M", "T4 Public Level 2M, #02-203", "landside", "11:00 – 22:00 DailyLast Order - 30 minutes before closing time", false),
    ],
  }),
  heavenly_wang: restaurant({
    name: "Heavenly Wang", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    description: "Heavenly Wang, (旺角, which translates to Prosperity Corner) was founded in 1953 along Bugis Street, Singapore, serving local-styled breakfast favourites – Kopi, Kaya Toast and Soft-Boiled Eggs. Inspired by our Nanyang tradition and ingredients of Asian heritage, we continuously reinvent our uniquely Singapore local favourites to keep up with changing times. Today, Heavenly Wang is a household halal-cartified cafe with more than 30 locations across the island, serving signature dishes set in a modern retro ambience.",
    halal: true,
    outlets: [
    o("Level 2", "T4 Transit Level 2, #02-80", "airside", "06:00 – 21:00 Daily", false),
    ],
  }),
  kopitiam: restaurant({
    name: "Kopitiam", cuisine: "24 Hours / Food Court / Kids / Quick Bites", amenity: "food_court",
    description: "At Kopitiam, we make good food affordable for everyone. We connect family and friends through joyful food experiences.",
    outlets: [
    o("Level 2M", "T4 Public Level 2M, #02-205", "landside", "05:00 – 23:00 Daily", false),
    ],
  }),
  ma_mum: restaurant({
    name: "Ma Mum", cuisine: "24 Hours / Quick Bites", amenity: "fast_food",
    description: "Enjoy a wide array of delicious traditional local foods at the Halal concept restaurant, Ma Mum! Named after the charming local catchphrase of “mum mum” (which means “to eat” in the local baby talk), this is where friends and loved ones gather to play, relax, and most importantly, eat. Here, you will find a splendid range of local dishes done to perfection so that you will not only delight in the taste of Singapore flavors but also experience the joys of how Singaporeans absolutely relish having their food on this foodie paradise island.",
    halal: true,
    outlets: [
    o("Level 1", "T4 Public Level 1, #01-04", "landside", "Open 24 hours Daily", true),
    ],
  }),
  o_coffee_club: restaurant({
    name: "O'Coffee Club", cuisine: "24 Hours / Cafe / Kids / Quick Bites", amenity: "cafe",
    description: "Get your fix of gourmet coffee and delicious comfort food at O' Coffee Club. \n \nOur richly brewed gourmet coffee is made from a range of freshly roasted coffee beans including Jamaican Blue Mountain, rare Ethiopian Yirgacheffe, and the O' Coffee Club Classic.\n \nWe have mains such as our All-Day Breakfast selection (including Hearty Breakfast, Eggs Benedict and our Belgian Waffle range), Creamy Carbonara (a bestseller), Truffle Mushroom Pizza and Seafood Pizza, to name a few. Also don't miss our Muddy Mud Pie dessert, a popular choice.",
    outlets: [
    o("Level 2", "T4 Public Level 2, #02-13", "landside", "Open 24 hours Daily", true),
    ],
  }),
  papparich: restaurant({
    name: "PappaRich", cuisine: "Kids / Restaurant", amenity: "restaurant",
    description: "The key to PappaRich’s success lies in the passion of the people dedicated to creating and showcasing authentic cuisine from age-old traditions with the best of ingredients sourced locally featuring a selection of the very best from our extended menu, bestselling dishes served quickly and efficiently without compromising to quality. Our menu features recipes ranging from 70-year old recipe of Hainan Bread spanning 3 generations, PappaRich’s special recipe Fried Chicken, PappaRich’s own White Coffee sweetened with Stevia and CNN’s Top recommendations of all-time favorites such as Satay, Pappa Chicken Rice, Pappa Prawn Mee, Char Kway Teow, Roti Canai with Curry sauce and the deliciously rich and creative drinks menu that fits right to your stomach and warms right up to your heart. You can be sure to find the ease and comfort food at PappaRich to satisfy your hunger.",
    outlets: [
    o("Level 2M", "T4 Public Level 2M, #02-203A", "landside", "10:00 – 21:30 DailyLast Order - 30 minutes before closing time", false),
    ],
  }),
  paris_baguette: restaurant({
    name: "Paris Baguette", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "parisbaguette.com.sg", logoUrl: logo("parisbaguette.com.sg"),
    description: "Born from a love of bread and a passion for quality, Paris Baguette is an international, fast-casual bakery founded in 1988 specializing in French-inspired goods. In addition to chef-inspired cakes, pastries, sandwiches, salads, all day dining menus and signature coffee and tea, we offer a unique experience to thousands of guests daily",
    outlets: [
    o("Level 1", "T4 Public Level 1, #01-05", "landside", "Open 24 hours Daily", true),
    ],
  }),
  roost: restaurant({
    name: "Roost", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    description: "Roost – A Brand-New Approach to Singapore’s Favourite Chicken Rice Roost’s innovative kitchen and cozy restaurant are focused on Singapore’s beloved national dish – Chicken Rice. Savour in the wonderful satisfaction we bring to you through our updated take on popular Local and South-East Asian delights. Roost is where families and friends come together to relax and enjoy good company and great food. All recipes contain No Added MSG and use only the freshest locally-sourced ingredients.",
    outlets: [
    o("Level 1", "T4 Public Level 1, #01-10", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "starbucks.com.sg", logoUrl: logo("starbucks.com.sg"),
    description: "Sometimes, all you need is that familiar taste of your favourite cup of coffee — and that is exactly what Starbucks delivers all over the world, and here at Changi Airport too. Discover the world of coffee with a fresh cuppa brewed with the best Arabica beans from Latin America, Africa and Asia Pacific. A delightful selection of juices, cakes and pastries are also available, and are the perfect light bites before you travel.",
    outlets: [
    o("Level 2", "T4 Public Level 2, #02-04", "landside", "Open 24 hours Daily", true),
    ],
  }),
  texas_chicken: restaurant({
    name: "Texas Chicken", cuisine: "24 Hours / Fast Food / Kids / Quick Bites", amenity: "fast_food",
    description: "At Singapore’s Texas Chicken, we deliver authentic traditions, bold tastes and straightforward, consistent food you can trust. After all, we’re more than broasted chicken in Singapore. We’re the rugged territory forged by sun and terrain. The crisp, satisfying bite of a meal earned through hard work. The feeling of community that comes through shared moments and simple pleasures.",
    outlets: [
    o("Level 2", "T4 Transit Level 2, #02-86", "airside", "Open 24 hours Daily", true),
    ],
  }),
  tiger_den: restaurant({
    name: "Tiger Den", cuisine: "24 Hours / Pubs & Bars", amenity: "bar",
    description: "The Tiger Den is an exceptional bar that opened on the 31 October 2017 in Changi Airport, Terminal 4. This iconic bar has been inspired by the energy and excitement of classic Singaporean Hawker markets combined with the urban Tiger Beer brand - the most popular beer in Singapore. This have been combined to deliver a unique experience for Travelling passengers. The Tiger Den offers customers a relaxing atmosphere serving Ice Cold Tiger beers by the bottle and draft along with a mouth-watering range of Bar bites all inspired by Singapore Street Food.",
    outlets: [
    o("Level 2", "T4 Transit Level 2, #02-39", "airside", "Open 24 hours Daily", true),
    ],
  }),
  zus_coffee: restaurant({
    name: "ZUS Coffee", cuisine: "Quick Bites", amenity: "fast_food",
    description: "ZUS Coffee is the leading Malaysian coffee chain dedicated to transforming high-quality, freshly brewed specialty coffee from an occasional luxury into a daily necessity for all to enjoy. With a commitment to delivering clean, consistent, and expertly crafted coffee in every cup, ZUS Coffee only uses the best quality ingredients to make specialty coffee affordable and accessible for everyone, every day.",
    outlets: [
    o("Level 1", "T4 Public Level 1, #01-08", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
};

const jewelVenues = {
  arabica: restaurant({
    name: "% Arabica", cuisine: "Cafe", amenity: "cafe",
    website: "arabica.coffee", logoUrl: logo("arabica.coffee"),
    description: "Through % Arabica, coffee drinkers can 'See the world through Coffee', with prime quality coffee with unique taste profiles and a richness that you can only get from freshly roasted coffee to a meticulously roasted roast profile.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-K208", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  a_w: restaurant({
    name: "A&W", cuisine: "Fast Food", amenity: "fast_food",
    website: "awrestaurants.com", logoUrl: logo("awrestaurants.com"),
    description: "Founded in 1919, A&W® stands for Allen & Wright – the two founders of an iconic American brand.\n\nThe A&W® Root Beer is freshly made in-store daily, just like it was 100 years ago. Hand-crafted from a secret blend of spices, cane sugar and water, and proudly caffeine free, A&W® still serves its signature root beer in an ice-cold frosty mug.\n\nExpect also international favourites such as A&W® Mozza® Burger, Coney Dogs, Curly Fries and Waffle Ice Cream as well as other global best-sellers world such as A&W® Cream Cheese Burgers and Golden Aroma® Chicken.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-209", "landside", "08:00 AM - 12:00 AM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 08:00 AM - 01:00 AM (Friday, Saturday)", false),
    ],
  }),
  aburi_en: restaurant({
    name: "Aburi-EN", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "aburi-en.com", logoUrl: logo("aburi-en.com"),
    description: "Specialising in aburi or partially grilled meat, Aburi-EN offers high quality donburi (rice bowls) using premium ingredients from Japan. We serve a fine selection of Japanese and Australian wagyu, and our pride is the highly acclaimed A4/A5 Miyazaki wagyu which has won Japan's \"National Wagyu Award\" three consecutive times.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-233", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  actioncity_cafe: restaurant({
    name: "ActionCity Café", cuisine: "Cafe / Homegrown", amenity: "cafe",
    website: "instagram.com", logoUrl: logo("instagram.com"),
    description: "Known for its largest showcase of BE@RBRICK in Singapore, ActionCity Cafe is the flagship Designer-Art Toys cafe and gallery by ActionCity, an established homegrown multi-brands label for art toy collectibles and all things pop culture. ActionCity Cafe is an experiential place where food and fun connects, customers can dine among their favourite art collectible toys and bring on their creativity taking toy photos while enjoying delectable food.",
    outlets: [
    o("Level 4", "Jewel Public Level 4, #04-223", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
  an_acai_affair: restaurant({
    name: "An Acai Affair", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    description: "In Rio De Janeiro, the healthy and beautiful love acai, a small, dark purple, berry-like fruit with a juicy pulp that is often used in beverages or eaten raw.\n\nKnown to have high antioxidants, anti-aging and weight loss properties, you can now get a taste of Brazil right here in Singapore, at An Acai Affair.\n\nBe it fruit bowls or smoothies, every item on the menu is chockful of the freshest ingredients ranging from 100% natural granola, almond butter (made in-house!), organic chia seeds and or course, its star ingredient – acai.\n\nWho says healthy food is boring?",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-262", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  arteastiq: restaurant({
    name: "Arteastiq", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "arteastiq.com", logoUrl: logo("arteastiq.com"),
    description: "Arteastiq Bistro is a casual diner and a sanctuary for city dwellers to retreat from the hustle and bustle of urban living.\n\nWith its classy yet relaxed English interior and feet-tapping jazzy tunes, the restaurant bears a warm and welcoming ambience.\n\nChoose from an array of comfort food at the best value, or enjoy its extensive bar menu after dark, featuring beer on tap.",
    outlets: [
    o("Level 5", "Jewel Public Level 5, #05-201", "landside", "10:00 AM - 11:00 PM (Monday, Tuesday, Wednesday, Thursday, Friday) | 10:00 AM - 12:00 AM (Saturday, Sunday)", false),
    ],
  }),
  arteastiq_depatio: restaurant({
    name: "Arteastiq DePatio", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "arteastiqdepatio.com", logoUrl: logo("arteastiqdepatio.com"),
    description: "Travel through the gastronomical scenes of Europe over the simple pleasures of great food and drinks. A sanctuary where relaxation abounds while experiencing fresh creations based on classic home-cooked recipes; it has become clear why this place was called out when one considers how comfortable dining becomes here. Expect hearty takes on chef recommendations to the menu additions. There is something for everyone at our restaurant, from Pancetta Roast Pork Belly, Gemelli Parmigiana , Paccheri Beer Butter , Al Taglio Pizza to Flattened Potatoes! It’s a foodie's dream come true.",
    outlets: [
    o("Level 5", "Jewel Public Level 5, #05-200", "landside", "10:00 AM - 11:00 PM (Monday, Tuesday, Wednesday, Thursday, Friday) | 10:00 AM - 12:00 AM (Saturday, Sunday)", false),
    ],
  }),
  auntie_anne_s: restaurant({
    name: "Auntie Anne's", cuisine: "Quick Bites", amenity: "fast_food",
    website: "auntieannesg.com", logoUrl: logo("auntieannesg.com"),
    description: "Auntie Anne's are hand rolled and freshly baked every day. With no preservatives, no egg and no butter in their dough mix, the pretzels are vegetarian-friendly and are good alternatives for healthy snacks Bestsellers include the Almond Crunch, Cinnamon Sugar, Parmesan Cheese, and Sour Cream & Onion. Savour your pretzels with a refreshing beverage such as the lemonade or passionfruit drink. Or try their Pretzel Bites and Pretzel Dogs for a convenient, on-the-go treat!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-272", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  baba_nyonya: restaurant({
    name: "Baba Nyonya", cuisine: "Fine Dining / Restaurant", amenity: "restaurant",
    website: "babanyonyadelicacy.com", logoUrl: logo("babanyonyadelicacy.com"),
    description: "Baba Nyonya offers a modern take on traditional Peranakan cuisine, bringing together bold heritage flavours with contemporary presentation. Rooted in Straits Chinese culture, the menu features signature dishes such as Buah Keluak, Rendang, Laksa, and other familiar classics, crafted to be both authentic and approachable.\n\nAt Baba Nyonya, we serve comforting, flavourful dishes that celebrate tradition while making it accessible for today’s diners.",
    outlets: [
    o("Level 5", "Jewel Public Level 5, #05-204", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  beauty_in_the_pot: restaurant({
    name: "Beauty in the Pot", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "paradisegp.com", logoUrl: logo("paradisegp.com"),
    description: "Savour the essence of health and beauty with every steaming pot of soup at Beauty in The Pot. Inspired by the culture of food for health, the hotpot concept offers six nourishing soup bases that promise rich flavours coupled with abundant benefits. All ingredients are artfully made by our team of chefs to match seamlessly with the rich and flavourful soup bases for maximum enjoyment. Be awed by the sumptuous menu of fresh ingredients and homemade specialties coupled with the dense and nutrient-rich beauty collagen soup and/or spicy nourishing soup (with three levels of spiciness).",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-224/225/226", "landside", "11:00 – 03:00 Daily", false),
    ],
  }),
  beryl_s_chocolate: restaurant({
    name: "Beryl's Chocolate", cuisine: "", amenity: "restaurant",
    description: "Beryl’s Chocolate offers a diverse selection of chocolates, cookies, and gift sets that blend tradition with innovation. From smooth classic chocolates to unique creations featuring a wide variety of flavours and textures, every bite is a delight. Made with high-quality ingredients and meticulous attention to detail, each product promises a rich, indulgent experience. Whether for yourself or as a thoughtful gift, Beryl’s Chocolate brings joy and elegance to every occasion.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-212", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  bhc_chicken: restaurant({
    name: "BHC Chicken", cuisine: "", amenity: "restaurant",
    description: "BHC stands for Better & Happier Choice — and it's more than just a name. As the #1 Korean fried chicken brand inSouth Korea, BHC is known for offering the largest variety of fried chicken flavours and styles. Beyond chicken, BHC serves up authentic Korean mains and sides for a complete comfort food experience — all fried with healthier high oleic sunflower oil.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-247", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  birds_of_paradise: restaurant({
    name: "Birds of Paradise", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "facebook.com", logoUrl: logo("facebook.com"),
    description: "Birds of Paradise delights in creating botanical gelato, flavoured with beauty that nature has given to us - fruits, flowers, herbs, spices, nuts and pods. We draw inspiration from nature to create new, beautiful flavours and experiences. Enjoy a delicious botanically-flavoured cone at our gelato parlour.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-254", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  boost_juice_bars: restaurant({
    name: "Boost Juice Bars", cuisine: "Quick Bites", amenity: "fast_food",
    website: "boostjuicebars.com.sg", logoUrl: logo("boostjuicebars.com.sg"),
    description: "Boost Juice - the nation’s favourite makers of fresh smoothies and juices! We serve millions of Singaporeans our iconic green cups, filled with fruits and veggies deliciousness.\nHere at Boost we’ve made it our pledge to get more fruits and veggies into every customers day and make healthy living easy!! So naturally, nutrition is a key component in developing our range of smoothies and juices that sees us blending through millions of tonnes of fruits and veggies every year.\nDeliciousness that comes from simple, natural goodness, served to you with a love life attitude that will make you so happy!\nDon’t believe us? Come and see us at any Boost Juice store in Singapore and try it for yourself.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-261", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  briyanis_and_kebabs: restaurant({
    name: "Briyanis And Kebabs", cuisine: "Restaurant", amenity: "restaurant",
    website: "bazilkitchen.sg", logoUrl: logo("bazilkitchen.sg"),
    description: "Briyanis And Kebabs by Bazil Kitchen is a restaurant brand dedicated to serving authentic, flavorful biryanis and expertly grilled kebabs inspired by traditional Indian and Middle Eastern culinary heritage. The brand focuses on premium ingredients, aromatic spices, and time-honored cooking techniques to deliver a memorable dining experience. Whether for dine-in, takeaway, or delivery, Briyanis And Kebabs aims to offer rich flavors, generous portions, and consistent quality in every meal.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-229", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  butter_cream: restaurant({
    name: "Butter & Cream", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Since 2021, Butter & Cream has proudly expanded to 12 locations across Singapore, renowned for our signature fluffy muffins, creamy egg tarts, and decadent burnt cheesecakes. Our dedication to premium ingredients has garnered trust and loyalty customers island-wide. Experience our commitment to freshness, creativity, and excellence in every little bite.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-266", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  cafe_kitsune: restaurant({
    name: "Café Kitsuné", cuisine: "Cafe", amenity: "cafe",
    description: "Café Kitsuné reinvests the great French coffee tradition with a Japanese twist and contemporary standards. With unique expertise in meticulously sourced specialty coffee, Café Kitsuné embodies a spirit of freedom and boldness. Situated in prime locations within iconic neighborhoods, the brand offers welcoming atmosphere to enjoy specialty coffee, artisanal drinks, and a diverse menu from breakfast to brunch. As a destination for coffee and food enthusiasts, Café Kitsuné crafts unique experiences, showcasing its own Art de Vivre.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-K209", "landside", "09:00 – 22:00 Daily", false),
    ],
  }),
  cha_mulan: restaurant({
    name: "CHA MULAN", cuisine: "Quick Bites", amenity: "fast_food",
    description: "CHA MULAN blends artisan tea with traditional Chinese superfoods like snow fungus and peach gum—delivering health, beauty, and flavor in every sip.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-259", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  chicha_san_chen: restaurant({
    name: "CHICHA San Chen", cuisine: "Cafe", amenity: "cafe",
    website: "chichasanchen.com.sg", logoUrl: logo("chichasanchen.com.sg"),
    description: "CHICHA San Chen utilises an exclusive patented Teapresso machine to ensure consistency in the quality and taste profiles of their tea, marrying the best of bubble tea with traditional tea.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-213", "landside", "10:00 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 10:00 AM - 10:30 PM (Friday, Saturday)", false),
    ],
  }),
  coucou_hotpot_brew_tea: restaurant({
    name: "Coucou Hotpot.Brew Tea", cuisine: "Restaurant", amenity: "restaurant",
    website: "xiabuasia.com", logoUrl: logo("xiabuasia.com"),
    description: "Coucou Hotpot, which has been known as the online celebrity hot pot restaurant in recent years, was founded in 2016 and is a mid-to-high-end hot pot brand incubated by Taiwan’s hot pot brand Xiabuxiabu. It uses a combination of hot pot and milk tea as an innovative model and focuses on gathering young people.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-208/209", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  creamie_sippies: restaurant({
    name: "Creamie Sippies", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Creamie Sippies is a Japanese-inspired specialty café devoted to crafting premium matcha and coffee dessert drinks using only ceremonial-grade matcha, 100 % Arabica beans, and artisanal ingredients. Each cup is handcrafted in-store for the highest quality. At Jewel, we debut Singapore’s first Nitro Matcha Latte, alongside our TikTok-viral Banana Pudding Matcha Latte, Strawberry Matcha Latte, and the signature Banana Bread Latte — a banana bread in a cup.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-K214", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  dian_xiao_er: restaurant({
    name: "Dian Xiao Er", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "dianxiaoer.com.sg", logoUrl: logo("dianxiaoer.com.sg"),
    description: "Since its inception in 2002, Dian Xiao Er has grown into one of the most renowned household names in Singapore – famed for its Herbal Roast Ducks and mouth-watering specials such as the Pan-Fried Cod Fish and Wheatgrass Tofu. The brand prides itself on dishing out nutritious and balanced quality meals, which explains a menu brimming with a wide array of meat, seafood, and vegetables. A meal at Dian Xiao Er is reminiscent of a taste of home.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-229", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  din_tai_fung: restaurant({
    name: "Din Tai Fung", cuisine: "Restaurant", amenity: "restaurant",
    website: "dintaifung.com.sg", logoUrl: logo("dintaifung.com.sg"),
    description: "Ranked as one of the world’s Top Ten Best Restaurants by The New York Times, Din Tai Fung has its roots dating back to Taiwan more than 40 years ago\n\nSavour their classic signature dishes such as xiao long bao (steamed pork dumplings) and steamed chicken soup. Din Tai Fung uses the freshest ingredients combined with simple cooking styles. The recipe selection is never too rich or heavy on the palate, catering to consumers’ increasing preference for healthy cooking.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-214/215", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  elfuego_by_collin_s: restaurant({
    name: "Elfuego by COLLIN’S®", cuisine: "Restaurant", amenity: "restaurant",
    description: "Elfuego®, the first Halal European concept by award-winning local chain COLLIN’S®, has reopened at Canopy Park, Jewel Changi Airport. This intimate 80-seater with an exclusive mezzanine serves premium European cuisine in a relaxed setting, inviting everyone to enjoy its refined flavors.\n \nA multi-award-winning restaurant, Elfuego® has earned accolades such as Best Halal Restaurant (2020/2022) & Best Steak (2022) at the Halal Awards, and Best Halal Restaurant (Fine Dining) at the RAS Epicurean Star Awards (2021/2022).",
    halal: true,
    outlets: [
    o("Level 5", "Jewel Public Level 5, #05-203", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  fish_co: restaurant({
    name: "Fish & Co", cuisine: "Restaurant", amenity: "restaurant",
    website: "fish-co.com", logoUrl: logo("fish-co.com"),
    description: "Established in 1998, Fish & Co. is a casual, family-friendly restaurant serving fresh seafood in a pan. Inspired by Mediterranean fishermen who cooked their catch straight from the sea, we offer generous portions, great-tasting meals, and warm service. With a cheerful nautical vibe, our crew ensures a welcoming dining experience. We use only the freshest seafood, olive oil, herbs, and spices to bring out natural, hearty flavours—simple, delicious, and satisfying.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-300", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  food_republic: restaurant({
    name: "Food Republic", cuisine: "Food Court / Homegrown", amenity: "food_court",
    website: "foodrepublic.com.sg", logoUrl: logo("foodrepublic.com.sg"),
    description: "Food Republic was founded on the concept of serving well-loved Singapore street food housed in the air-conditioned comfort of shopping malls. The brand has revolutionised the local food court scene by being the first to introduce the quintessential thematic food atrium experience, bringing together the best of hawker and restaurant fare under a single roof. We hand-pick reputable, dedicated hawkers and showcase all ’live cooking’ demonstrations in open-kitchen concepts in our food atriums.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-238/239/240", "landside", "08:00 AM - 10:30 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 08:00 AM - 11:00 PM (Friday, Saturday)", false),
    ],
  }),
  gelatissimo: restaurant({
    name: "Gelatissimo", cuisine: "Quick Bites", amenity: "fast_food",
    website: "gelatissimo.sg", logoUrl: logo("gelatissimo.sg"),
    description: "Obsession and imagination - two ingredients that drive Gelatissimo to create the best tasting gelato. We make our gelato fresh in-store using traditional gelato making techniques, but there’s nothing traditional about us. With fresh, seasonal ingredients, indulgent inclusions and better for you options, our gelato will inspire all your senses. We believe that flavour is more than taste. That’s why we’re always thinking about what’s next - dedicated to delighting our customers wherever they find us. Gelato is our obsession and the world is our inspiration.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-206", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  gochi_so_shokudo: restaurant({
    name: "Gochi-So Shokudo", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "instagram.com", logoUrl: logo("instagram.com"),
    description: "At Gochi-So Shokudo, its top quality Iberico Pork is imported from Spain and brought to you at affordable prices. Grilled over charcoal fire, every bite is a burst of delicate, nutty, and melt-in-your-mouth flavours.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-289", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  greendot_plus: restaurant({
    name: "Greendot Plus", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    description: "Greendot Plus is the go-to lifestyle F&B concept for people to enjoy healthy great food, we aim to cook at its simplest, to bring out the ingredient's natural flavours which are full of blessings from the sun, soil, and water. Dine with ’Simple Food’ that is gentle for your body, kind to the world, and delicious, amidst the relaxing ambiance at Greendot Plus. Simple food can be healthy & delicious at the same time.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-297", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  guzman_y_gomez: restaurant({
    name: "Guzman y Gomez", cuisine: "Fast Food", amenity: "fast_food",
    website: "gyg.com.sg", logoUrl: logo("gyg.com.sg"),
    description: "At Guzman y Gomez, our passion is creating delicious 100% CLEAN Mexican food using only the highest quality ingredients. Try the GYG Mexican food experience in Singapore today!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-211", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  gwangjang_gaon: restaurant({
    name: "Gwangjang GAON", cuisine: "Restaurant", amenity: "restaurant",
    description: "Gwangjang GAON is a place where the essence of traditional Korean cuisine is reinterpreted in a modern way, offering a harmonious blend of scenic Han River views and a serene, refined interior. It is also notable for being the first Korean restaurant in Korea to operate within Myeongdong Cathedral. The restaurant is especially popular for its authentic traditional Korean dishes, including GAON Galbi, Samgye-tang, Bibimbap, Kimchi-jjigae, and other signature stews, noodles, and pancakes.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-243", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  hakka_yu: restaurant({
    name: "Hakka Yu", cuisine: "Restaurant", amenity: "restaurant",
    description: "Hakka Yu was founded in 2013 in Guangzhou, China, serving family-style Hakka cuisine. For the past decade, it has used fresh ingredients prepared on-site with natural cooking techniques that highlight the true flavours of the ingredients. With over 80 stores across China, it has become a leading brand in Hakka cuisine.\n\nHakka Yu is committed to using natural, mountain-sourced ingredients from Hakka regions. Its chefs, with over 20 years of experience, refine and modernize traditional Hakka dishes, sharing authentic flavours with everyone.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-220/221/222", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  heytea: restaurant({
    name: "HEYTEA", cuisine: "Quick Bites", amenity: "fast_food",
    description: "In 2012, HEYTEA originated from a small alley called Jiangbianli. From a humble 20-square-meter small shop, HEYTEA has insisted on using real milk, real fruits, real premium tea, and real cane sugar, bringing everyone real quality tea and kicking off an era of “New Asian Tea”. Today, HEYTEA has integrated the consistent use of real ingredients while focusing on promoting a healthy lifestyle, providing nutritional & calorie information of their tea beverages; offering a truly REAL & LITE tea beverages to every customer. Tea drinks offered: Fruit Teas, Milk Teas, Pure Teas, Lite Recommendations",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-212", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  hitoyoshi_izakaya: restaurant({
    name: "Hitoyoshi Izakaya", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    description: "Hitoyoshi Izakaya is a Japanese restaurant under Hitoyoshi Group, focusing on kebabs, sashimi, sake and other specialties. We only offer high-quality sashimi and meat, which are perfect for your taste buds to pair with sake or various liquors. And the environment of our shop is comfortable, suitable for all kinds of gatherings, eating, drinking and having fun.",
    outlets: [
    o("Level 5", "Jewel Public Level 5, #05-205", "landside", "11:30 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 11:30 AM - 12:00 AM (Friday, Saturday)", false),
    ],
  }),
  hoshino_coffee_japanese_cafe_restaurant: restaurant({
    name: "Hoshino Coffee Japanese Café & Restaurant", cuisine: "Restaurant", amenity: "restaurant",
    description: "Hoshino will introduce its specialty of hand-dripped coffee with only premium Arabica roasted coffee beans selected by our own coffee blend specialist, and signature dishes such as the Fuwa Fuwa Souffle, Omu Rice and fluffy Pancakes. Also, it will launch pork-free and lard-free dishes for offering more options to traveling customers who have different culture and religious background. Also, Hoshino will introduce JEWEL exclusive Pancake and French toast also to attract local customers.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-249", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  hot_tomato: restaurant({
    name: "Hot Tomato", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "hottomato.com.sg", logoUrl: logo("hottomato.com.sg"),
    description: "Hot Tomato is a contemporary casual steakhouse offering grilled steaks and seafood, pasta, salads and sides. Several dishes on Hot Tomato’s menu are below 500 calories. Hot Tomato is certified by Singapore’s Health Promotion Board as a healthy dining partner.",
    outlets: [
    o("Level 4", "Jewel Public Level 4, #04-229", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  imperial_treasure_super_peking_duck: restaurant({
    name: "Imperial Treasure Super Peking Duck", cuisine: "Restaurant", amenity: "restaurant",
    website: "imperialtreasure.com", logoUrl: logo("imperialtreasure.com"),
    description: "Well-known for roasting peking duck to perfection, Imperial Treasure Super Peking Duck serves only the finest and most authentic iteration of this prized dish. With a solemn dedication to preserving the centuries-old methods of the Emperor’s imperial kitchen, each whole duck is roasted to crisp perfection by our chefs and sliced on the platter before your eyes.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-219/220", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  ipoh_town: restaurant({
    name: "Ipoh Town 怡保城茶室", cuisine: "Restaurant", amenity: "restaurant",
    website: "facebook.com", logoUrl: logo("facebook.com"),
    description: "Ipoh Kopitiam is a traditional coffee shop founded by 2 sisters born in Ipoh Malaysia. Determined to serve traditional hometown taste, 2 Ipoh sisters serves traditional authentic Ipoh food including but not limited to:\n- Baked, Fried and Steamed Dim Sums (e.g.: Rendang Pie, Portuguese Egg Tart, Siew Mai & etc.)\n- Nasi Ayam Goreng Berempah (Malay Spiced Fried Chicken Rice)\n- Authentic Ipoh White Coffee\n- Traditional Toast",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-299", "landside", "09:00 – 22:00 Daily", false),
    ],
  }),
  jack_s_place: restaurant({
    name: "Jack's Place", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "jppepperdine.com", logoUrl: logo("jppepperdine.com"),
    description: "For the past five decades, Jack’s Place has been the trusted favourite for family and friends to enjoy great value sizzling steaks, specialty meals, and sumptuous cakes. Jack’s Place is committed to serving quality food and creating memorable dining experiences in a cheerful and cozy environment for its guests.",
    outlets: [
    o("Level 5", "Jewel Public Level 5, #05-202", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  josh_s_grill: restaurant({
    name: "Josh's Grill", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "minorfoodsingapore.com", logoUrl: logo("minorfoodsingapore.com"),
    description: "A dining destination that offers the complete grill experience with premium cuts from high grade beef meats to Grilled Chicken Chops, Josh’s Famous Onion Rings, Fish & Chips, Prawn Aglio Olio and sharing dishes like Porterhouse Steak and Tomahawk Steak.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-210", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  jumbo_seafood: restaurant({
    name: "JUMBO Seafood", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "jumboseafood.com.sg", logoUrl: logo("jumboseafood.com.sg"),
    description: "JUMBO Seafood had its humble beginnings in 1987. Operating from a single outlet in East Coast Seafood Centre, the brand now comprises multiple restaurants in Singapore and abroad, capturing the hearts of local and overseas gastronomes alike with its award-winning Chilli Crab, Black Pepper Crab and other fresh seafood cooked to perfection. It has garnered many prestigious culinary and service accolades over the years, including being featured as one of the “Top 50 most iconic places in Singapore to visit” by TripAdvisor.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-202/203/204", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  kam_s_roast: restaurant({
    name: "Kam's Roast", cuisine: "Restaurant", amenity: "restaurant",
    website: "kamsroast.com.sg", logoUrl: logo("kamsroast.com.sg"),
    description: "You can now savour the same high quality and standards that is Kam’s Roast, right here in Singapore. The Roast Duck is one of their signature dishes, and the dish showcases the full flavour of the duck, as well as its succulent meat and enticing texture. Other menu highlights include Crispy Roast Pork, Iberico Char Siu, Pipa Duck, Orange Peel Red Bean Soup and braised dishes.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-210", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  kane_mochi: restaurant({
    name: "KANE MOCHI", cuisine: "Quick Bites", amenity: "fast_food",
    website: "kanemochi.com.sg", logoUrl: logo("kanemochi.com.sg"),
    description: "Originating in Bangkok in 2008,KANE MOCHI is famous for its Japanese mochi with premium ice cream filling, also known as “daifuku”. The Japanese eats “daifuku” during important events, believing that it will bring them good fortune.\n\nIn Japanese, the word “kanemochi” means “rich”, and “daifuku” means “extremely lucky”. Hence, KANE MOCHI hopes that all its customers will be happy, lucky and wealthy.\n\nToday KANE MOCHI has expanded globally, with branches in Thailand, Cambodia, Kuwait, Bahrain, and Singapore.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-269", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  kantin: restaurant({
    name: "Kantin", cuisine: "Restaurant", amenity: "restaurant",
    website: "instagram.com", logoUrl: logo("instagram.com"),
    description: "Singapore's iconic Jewel Changi Airport is set to welcome a new gastronomic marvel. Introducing KANTIN, a restaurant that will transport diners to an enchanting allure of Borneo's wild and legendary rainforest culture. \n\nAmong KANTIN's culinary treasures are the Rainforest Fried Rice, Jungle Omelette, Salmon Island and the renowned Sarawak Laksa. KANTIN also proudly offers the \"Headhunter Pansuh Set,\" a dish steeped in Borneo's age-old traditions. Delight in a voyage of authenticity with a range of Dayak classics and a selection of creative Borneo-inspired cocktails.\n\nThe rainforest beckons in the heart of Singapore, KANTIN at Jewel Changi Airport stands ready to welcome you to a sensory dining journey like no other.",
    outlets: [
    o("Level 5", "Jewel Public Level 5, #05-206/207", "landside", "10:00 AM - 11:00 PM (Monday, Tuesday, Wednesday, Thursday, Friday) | 10:00 AM - 12:00 AM (Saturday, Sunday)", false),
    ],
  }),
  kei_kaisendon: restaurant({
    name: "Kei Kaisendon", cuisine: "Restaurant", amenity: "restaurant",
    website: "keikaisendon.com", logoUrl: logo("keikaisendon.com"),
    description: "Kei Kaisendon is a Japanese restaurant that serves delicious rice bowls topped with fresh sashimi from the seas of Japan! Every dish is specially designed with the right blend of fish, toppings, and seasonings to give you a unique taste every time. Come discover our Kaisendon for yourself!",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-213", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  kenangan_coffee: restaurant({
    name: "Kenangan Coffee", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "kenangancoffee.sg", logoUrl: logo("kenangancoffee.sg"),
    description: "Kenangan Coffee, Indonesia’s fastest growing coffee chain and Southeast Asia’s first F&B Unicorn, has launched one of its first outlets in Singapore at Changi Airport Terminal 2. Offering high-quality coffee at an accessible price point, Kenangan Coffee’s wide selection of beverages meets both Asian tastes and a global palate. Among its distinctive flavours is the Kenangan Latte, which is a perfect blend of espresso-based coffee and Black Aren, a natural sweetener with a fruity, caramel-like and slightly smoky flavour.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-255", "landside", "09:00 – 22:00 Daily", false),
    ],
  }),
  kfc: restaurant({
    name: "KFC", cuisine: "Fast Food", amenity: "fast_food",
    website: "kfc.com.sg", logoUrl: logo("kfc.com.sg"),
    description: "Savour your favourite fried chicken at KFC! Freshly prepared and hand-breaded in-store with Colonel Sander’s secret blend of 11 herbs and spice, the Original Recipe Chicken is pressure-cooked to juicy perfection. Bring your family and friends down to KFC for a dining experience that’s affordable, convenient and finger lickin’ good.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-275/276/277", "landside", "07:00 – 22:00 Daily", false),
    ],
  }),
  kiwami_ramen_gyoza_bar: restaurant({
    name: "Kiwami Ramen & Gyoza Bar", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "kiwami.com.sg", logoUrl: logo("kiwami.com.sg"),
    description: "The elegant interior and architecture of the restaurant & bar brings to you a modern, posh and cozy vibe. The food menu puts together a range of premium selections of ramen with local fusion flavours, elevated Japanese sides to pair with Japanese and local craft cocktails and craft beers. Find yourself exploring Japanese flavours with exciting touches of Singaporean favourites such as laksa, chilli crab, satay and more! Experience a tour around Singapore and Japan at the bar with artisanal craft cocktails that would take you to a multi-dimensional taste of Japanese liqueurs with a local twist.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-225", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  koi_express: restaurant({
    name: "KOI Express", cuisine: "Quick Bites", amenity: "fast_food",
    website: "koithe.com", logoUrl: logo("koithe.com"),
    description: "As Singapore’s renowned bubble tea brand, KOI focuses on brewing aromatic tea with quality. The freshly brewed tea and flavourful ingredients, prepared with passion are the key to KOI’s authentic taste. KOI shares its happiness and love of tea with everyone, making every experience memorable.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-263", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  krispy_kreme: restaurant({
    name: "Krispy Kreme", cuisine: "Quick Bites", amenity: "fast_food",
    website: "manna360.com.sg", logoUrl: logo("manna360.com.sg"),
    description: "Krispy Kreme is an American Icon - home to world famous original glazed doughnuts. Krispy Kreme delivers a wide variety of delicious doughnuts, made fresh daily, with a mission to bring joy and to enhance lives. At Krispy Kreme, we believe that everyone deserves a Happy Place!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-270", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  lady_m: restaurant({
    name: "Lady M", cuisine: "Cafe", amenity: "cafe",
    website: "ladym.com.sg", logoUrl: logo("ladym.com.sg"),
    description: "Lady M Singapore is a luxury patisserie known for its elegant, handcrafted cakes and refined confections. Best recognised for our Signature Mille Crêpes, each cake features delicate layers of handmade crêpes and light pastry cream. Blending French pastry techniques with Japanese precision, we offer a curated selection of cakes, pastries, and gift sets—perfect for celebrations, gifting, and everyday indulgence.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-253", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  lema_dumpling: restaurant({
    name: "LeMa Dumpling", cuisine: "Restaurant", amenity: "restaurant",
    website: "paradisegp.com", logoUrl: logo("paradisegp.com"),
    description: "LeMa Dumpling brings you food that reminds you of home — comforting, familiar, and made with love. Savour each and every of our jumbo dumplings, handcrafted with premium ingredients, filled with care, patience, and a whole lot of heart, just like how mum would make them. Each dumpling is a little parcel of joy, with tender and juicy fillings encased in delicate dough, pressed with skill and soul. Whether you’re craving the warmth of classic pork and cabbage, succulence of prawn and chives, or kids’ favourite prawn and corn, there’s one thing you’ll taste in every bite — satisfying, homely fulfilment. At LeMa Dumpling, immerse yourself in sweet, nostalgic memories, and the heartwarming taste of happiness.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-232", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  llaollao: restaurant({
    name: "Llaollao", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Dig in to the delicious taste of Llaollao! Llaollao is brand of healthy frozen yogurt from Alicante, Spain. Made from skimmed milk at the moment of serving, it is absolutely loaded with natural goodness. Combine it with a generous serving of the finest toppings (ranging from freshly-chopped seasonal fruits to cereals and other crunchy delights) and you get a cupful of naturally scrumptious treats. Try it yourself today!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-271", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  lotteria: restaurant({
    name: "Lotteria", cuisine: "Fast Food", amenity: "fast_food",
    website: "lotteria.com.sg", logoUrl: logo("lotteria.com.sg"),
    description: "Born in Korea and loved around the world, Lotteria is the first and original K-burger brand – serving up iconic and fun flavours for decades. More than just burgers, Lotteria is a slice of everyday Korean culture, where comfort food meets unique flavours and every meal is made to spark joy. From Korea to Singapore, our flavour DNA is built on familiarity, consistency and the kind of craveable taste that keeps fans coming back. At the end of the day, we’re here to bring flavour, fun and joy to everyday life. Our fan favourites say it all. The Ria’s Bulgogi Burger delivers that sweet-savory bulgogi hit Koreans know and love. The Ria’s Shrimp Burger brings crispy seafood crunch in every bite. And the Mozzarella Burger Tomato Basil? Pure cheese pull energy, layered with rich mozzarella and a tomato-basil twist for maximum crave factor. Now in Singapore, Lotteria is here to do burgers differently – rooted in Korean heritage, powered by proven favourites, and served with a whole lot of personality. Whether you’re deep into K-food or just getting started, it’s time to Taste the Fun – and bite into the original K-burger that’s been bringing smiles for generations.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-248", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  luckin_coffee: restaurant({
    name: "Luckin Coffee", cuisine: "24 Hours / Cafe", amenity: "cafe",
    website: "luckincoffee.com", logoUrl: logo("luckincoffee.com"),
    description: "Founded in 2017, Luckin Coffee pioneers a technological-driven retail concept aims to provide quality coffee and products accessible to its customers. Using only sustainably, ethically sourced coffee beans roasted to perfection by its WBC Champion Team, Luckin Coffee created a range of unique and delicious blends of coffee that has won the hearts of millions of coffee lovers. Luckin Coffee’s success and rapid growth over the years are a testament to its unique approach to retail that focuses on technology and customer centric approach, and its relentless dedication to customer satisfaction.",
    outlets: [
    o("Level 4", "Jewel Public Level 4, #04-231/232", "landside", "09:00 – 22:30 Daily", false),
    ],
  }),
  mamma_mia_trattoria_e_caffe: restaurant({
    name: "Mamma Mia Trattoria E Caffé", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "minorfoodsingapore.com", logoUrl: logo("minorfoodsingapore.com"),
    description: "Mamma Mia Trattoria E Caffé is a casual-style dining restaurant that serves true and simple Italian fare in an unpretentious and inviting Trattoria atmosphere. Artisan pastas that are handcrafted with fresh ingredients and cooked á la minute take centrestage. From antipasti, handcrafted pasta, rice and other mealtime delectables to mouth-watering desserts, the Italian nosh at Mamma Mia Trattoria E Caffé is sure to satisfy all palates.",
    outlets: [
    o("Level 4", "Jewel Public Level 4, #04-200", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  mcdonald_s: restaurant({
    name: "McDonald’s", cuisine: "24 Hours / Fast Food / Kids", amenity: "fast_food",
    website: "mcdonalds.com.sg", logoUrl: logo("mcdonalds.com.sg"),
    description: "McDonald’s isn’t just the place for a hearty fast food meal, complete with a refreshing cup of cola and delicious fries. It is also where you would want to head to even when you are catching a red-eye flight or caught in a transit in between meal times. If you would like more than the classic McDonald’s burgers like the McChicken and the Fillet-O-Fish, you might want to check out its menu for mouth-watering meal combos that are specially created for certain festive occasions.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-298", "landside", "06:30 – 00:00 Daily", false),
    ],
  }),
  monarchs_milkweed: restaurant({
    name: "Monarchs & Milkweed", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    description: "Founded in 2020 by two passionate cooks, Monarchs & Milkweed is a local gelato shop known for its balance of classic favourites and inventive flavour pairings. With a focus on creativity and quality, they offer not just delicious gelato, but a glimpse into their ongoing journey of exploring the endless possibilities of gelato making.",
    outlets: [
    o("Level 4", "Jewel Public Level 4, #04-218", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  monster_curry: restaurant({
    name: "Monster Curry", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "monstercurry.com.sg", logoUrl: logo("monstercurry.com.sg"),
    description: "Monster Curry is Singapore’s leading Japanese curry chain restaurant. Be mesmerized by the distinct flavour of the curry sauce, made from fresh fruits and a special blend of spices, resulting in a truly unique Japanese curry. With a spiciness level of your choosing, coupled with a range of assortments on a whopping plate size of 41cm in diameter, no one will leave feeling unfulfilled. The even bigger Japanese combo curry rice options are perfect for sharing. Other items such as Japanese pastas, curry ramen and honey toast are available to round out your meal.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-200", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  more_yogurt: restaurant({
    name: "More Yogurt", cuisine: "", amenity: "restaurant",
    description: "MoreYogurt is a nature-inspired yogurt brand dedicated to crafting freshly made yogurt beverages and treats. We infuse our respect for nature into every step — from sourcing quality ingredients to developing unique yogurt flavours and creating a wholesome brand experience. By combining natural ingredients with artisanal craftsmanship, we aim to bring refreshing, nourishing yogurt creations to modern urban lifestyles, offering a delicious way to recharge both body and mind.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-234", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  mr_coconut: restaurant({
    name: "Mr. Coconut", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "mrcoconut.sg", logoUrl: logo("mrcoconut.sg"),
    description: "Mr Coconut is a beverage brand specializing in fresh coconut-based drinks and desserts. Our menu features signature coconut shakes, fresh coconut milk teas, and refreshing drinks crafted to deliver a rich, tropical taste.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-268", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  mrs_pho: restaurant({
    name: "Mrs Pho", cuisine: "Restaurant", amenity: "restaurant",
    website: "mrspho.com", logoUrl: logo("mrspho.com"),
    description: "Mrs Pho offers authentic Vietnamese cuisine in Singapore, honouring the culinary traditions of Vietnamese mothers. More than just a meal, it is a cultural experience where each dish tells a story rooted in tradition. With no fusion or compromises, Mrs Pho stays true to the essence of traditional Vietnamese cooking, just like how mamma used to make. At Mrs Pho, it is ‘Pho Real’.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-216", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  munchi_pancakes: restaurant({
    name: "Munchi Pancakes", cuisine: "Quick Bites", amenity: "fast_food",
    website: "munchipancakes.com", logoUrl: logo("munchipancakes.com"),
    description: "At Munchi Pancakes, we offer the classic Min Jiang Kueh—crispy on the outside, soft on the inside, and filled to perfection. Our menu features Min Jiang Kueh and Munchi Pancakes, which are made with hot and cold fillings for a fresh twist on tradition. For those who prefer smaller bites, our Mini Munchi offers bite-sized treats packed with irresistible flavors.\nWe take pride in using fresh ingredients to ensure the freshest taste. Plus, we offer vegan-friendly options so everyone can enjoy our delicious creations. \nExperience the perfect balance of tradition and innovation with every bite.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-273", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
  naixue: restaurant({
    name: "Naixue", cuisine: "Cafe", amenity: "cafe",
    website: "naixue.com", logoUrl: logo("naixue.com"),
    description: "Naixue is the world's only IPO-listed (HK.2150) Tea company, the pioneer of the new tea industry, and the leading tea lifestyle brand with the most directly-operated stores in the world. At Naixue, we insist on making fine and healthy tea drinks. Selected top-notch Gold awarded tea, paired with fresh fruits, pure milk, self created 0-calorie sweetener, and the first cheese cream fresh fruit tea, pure milk tea and sugar-free tea as the main signature products. We also sell bakery products and mini box loose-leaf tea.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-243", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  nasty_cookie: restaurant({
    name: "Nasty Cookie", cuisine: "Quick Bites", amenity: "fast_food",
    website: "nastycookie.com", logoUrl: logo("nastycookie.com"),
    description: "Bringing bold flavors and oversized indulgence to Singapore, Nasty Cookie is the go-to spot for thick, gooey, and ultra-chunky cookies inspired by New York City. Made with premium ingredients and innovative flavors, each bite delivers the perfect balance of crunch and melt-in-your-mouth goodness. A local favorite and a must-try for visitors, Nasty Cookie is where dessert dreams come true. Whether you're after a timeless classic or craving something a little more adventurous, one thing's for sure: you're in for pure, unfiltered satisfaction.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-207", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  nesuto: restaurant({
    name: "Nesuto", cuisine: "Cafe / Homegrown", amenity: "cafe",
    website: "dear-nesuto.com", logoUrl: logo("dear-nesuto.com"),
    description: "Nesuto is an atelier of exquisite confectionary, nestled within immersive places and spaces. Meticulously handcrafting a collection of products with a passion for pure expression of substance and detail, for people looking to elevate life’s most simple and significant moments. Presenting the best flavours through quality ingredients. Making it possible for everyone to enjoy specialty creations of the finest quality, in an age where luxury is having access to products and experiences that evoke a deep sense of connection and conversation. Capturing moments through simple joy of indulgence.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-236/237", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  nine_fresh: restaurant({
    name: "Nine Fresh", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "ninefresh.com", logoUrl: logo("ninefresh.com"),
    description: "Nothing beats having a cool and delicious dessert on a hot and humid day. Nine Fresh is a Singapore-based, Taiwan-inspired brand serving fresh, chilled taro ball desserts daily. Take your pick from three signature bases (Bean Curd, Grass Jelly and Ai-Yu Jelly), and top it off with your choice of beans, jellies, chewy black pearls or taro balls.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-246", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  nong_geng_ji: restaurant({
    name: "Nong Geng Ji", cuisine: "Restaurant", amenity: "restaurant",
    description: "Nong Geng Ji is the leading brand of authentic Hunan cuisine in China, with over 100 directly operated stores worldwide. \nWe specialize in traditional Hunan dishes known for their bold flavors, spiciness, and rich aromas. Our menu offers a wide variety of signature dishes made with fresh ingredients, providing customers an authentic taste of Hunan culture and culinary heritage. \nVisit Nong Geng Ji to experience the true flavors of Hunan cuisine!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-235/236", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  ny_char_grill: restaurant({
    name: "NY Char Grill", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "nychargrill.com", logoUrl: logo("nychargrill.com"),
    description: "At NY Char Grill, we provide charcoal grill and meats in a modern barn house setting",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-227/228", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  old_chang_kee: restaurant({
    name: "Old Chang Kee", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "oldchangkee.com", logoUrl: logo("oldchangkee.com"),
    description: "For over half a century, Singaporeans from all walks of life have enjoyed Old Chang Kee's signature Curry’O - a crispy pastry shell generously stuffed with curried potato, chicken and an egg slice, all cooked with special herbs and spices.\n\nOld Chang Kee also offers other delectable hot snacks and lip-smacking quick bites.\n\nEmbracing the wonderful traditions and noble heritage of Singapore, Old Chang Kee strives to bring to their customers the good old tastes that all come to love since 1956.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-247", "landside", "08:00 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 08:00 AM - 11:00 PM (Friday, Saturday) | 08:00 – 22:00", false),
    ],
  }),
  omega_pork_noodle: restaurant({
    name: "OMEGA Pork Noodle", cuisine: "Restaurant", amenity: "restaurant",
    website: "omegaporknoodles.com", logoUrl: logo("omegaporknoodles.com"),
    description: "OMEGA Pork Noodle is a trusted name in hearty, flavorful pork noodles, with over 1 million bowls sold yearly, OMEGA earned the place as a trusted favorite for those who crave bold, satisfying flavors. Whether served in soup or dry versions, every bowl is thoughtfully crafted using premium pork ingredients to deliver depth, richness and satisfaction in every bite.\n\nWe're the first pork noodle brand certified by Bleu-Blanc-Cœur (Biru-Putih-Hati), and Chinese Medicinal Diet Health Food Culture Award, honoring our dedication to taste and wellness.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-223", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  paradise_classic: restaurant({
    name: "Paradise Classic", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "paradisegp.com", logoUrl: logo("paradisegp.com"),
    description: "Helmed by a team of sincere and well-trained chefs, every dish at Paradise Classic is prepared from the heart with a flair for Chinese cooking. Embark on a journey of classic Chinese cuisine at Paradise Classic, with dishes that reminisce the taste of nostalgia home-cooked flavours, making an ideal choice for casual meals among friends and family.",
    outlets: [
    o("Level 4", "Jewel Public Level 4, #04-244/245", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  paris_baguette: restaurant({
    name: "Paris Baguette", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "parisbaguette.com.sg", logoUrl: logo("parisbaguette.com.sg"),
    description: "Born from a love of bread and a passion for quality, Paris Baguette is an international, fast-casual bakery founded in 1988 specializing in French-inspired goods. In addition to chef-inspired cakes, pastries, sandwiches, salads, all day dining menus and signature coffee and tea, we offer a unique experience to thousands of guests daily",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-200", "landside", "08:00 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday, Friday) | 12:00 AM - 12:00 AM (Saturday, Sunday) | 08:00 – 22:00", false),
    ],
  }),
  paul_bakery_restaurant: restaurant({
    name: "PAUL Bakery & Restaurant", cuisine: "Cafe / Restaurant", amenity: "cafe",
    website: "paul-singapore.com", logoUrl: logo("paul-singapore.com"),
    description: "Enjoy the true taste of France at PAUL. Freshly made French breads and pastries are now available all-day at Jewel. Enjoy the full range of our food & coffee drink menu as and when you want it. \n\nThe signature French butter croissant is the perfect accompaniment to our freshly brewed coffee. Have a satisfying meal for lunch or dinner complete with full table service from $12.90. Pair savoury selections with PAUL’s proprietary blend French chocolate drink, Singapore-made kombucha or any of the coffee-blended drinks available hot and chilled.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-225", "landside", "10:00 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday) | 10:00 AM - 11:00 PM (Friday) | 09:00 AM - 11:00 PM (Saturday) | 09:00 AM - 10:00 PM (Sunday)", false),
    ],
  }),
  pop_play_planet_cafe: restaurant({
    name: "Pop Play Planet Cafe", cuisine: "Cafe", amenity: "cafe",
    website: "facebook.com", logoUrl: logo("facebook.com"),
    description: "Welcome to the Pop Play Planet Café, where we offer an enhanced experience in the vibrant world of fashionable toys! True to our essence, we have curated a collection of stylish and playful designer toys that celebrate the spirit of fun and creativity.\nNow, we're extending this passion to your palate by crafting premium coffee and innovative desserts to take your trendy journey to the next level.\n\nHere, imagination meets flavour, and every visit takes your playtime to the next level!",
    outlets: [
    o("Level 4", "Jewel Public Level 4, #04-246", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  potato_corner: restaurant({
    name: "Potato Corner", cuisine: "Quick Bites", amenity: "fast_food",
    website: "potatocorner.com", logoUrl: logo("potatocorner.com"),
    description: "Filipino french fries chain Potato Corner has been delighting fries lovers all over the world since 1992, serving up what many have called the “world’s best flavoured fries”.\n\nFries are prepared fresh, fried to order, seasoned with passionately formulated flavours, and served hot and crispy.\n\nTake your pick from Cheese, Barbecue, Sour Cream & Onion, Chili Barbecue and a whole lot more!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-264", "landside", "10:00 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 10:00 AM - 11:00 PM (Friday, Saturday)", false),
    ],
  }),
  poulet_bijou: restaurant({
    name: "Poulet Bijou", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "poulet.com.sg", logoUrl: logo("poulet.com.sg"),
    description: "Poulet Bijou is a modern French-themed bistro offering affordable French classics to the mass public since 2012. The French Roast Chicken maestro serves freshly roasted chicken that are brined overnight using an in-house secret recipe. The Poulet Roti is complemented with signature sauces: delicious homemade Mushroom Cream Sauce, Diane Sauce, Cranberry Sauce and Black Pepper Sauce. They create a perfect symphony to the signature dish. Poulet presents itself as the perfect place for any occasion worth celebrating, with something for everyone to savour and indulge in.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-227", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  ps_cafe: restaurant({
    name: "PS.Cafe", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "pscafe.com", logoUrl: logo("pscafe.com"),
    description: "PS.Cafe opened in 1999 as a cosy cafe hidden within Projectshop clothing store. This charming and understated spot quickly gained a following for its hearty takes on savoury cafe classics, famous truffle shoestring fries and indulgent cakes, puddings and tarts. Thoughtfully detailed interiors, lush surroundings, friendly relaxed service and generous portions have made this homegrown Singapore brand an internationally recognized local favourite. PS.Cafe is the place for legendary brunches and lazy afternoon teas, romantic dates and friendly celebrations in beautiful surroundings.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-244/245", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  putien: restaurant({
    name: "PUTIEN", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "putien.com", logoUrl: logo("putien.com"),
    description: "Voted one of Singapore’s best 50 restaurants, Singapore-based Chinese restaurant PUTIEN has been serving authentic Putian cuisine from China’s Fujian province since 2000. PUTIEN focuses on bringing out the original taste of its ingredients, from the selection of the freshest ingredients to food preparation. The end result is uncomplicated and homely dishes that exude memorable flavours of come-home dining.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-249", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  queic_by_olivia: restaurant({
    name: "Queic by Olivia", cuisine: "Cafe / Homegrown", amenity: "cafe",
    website: "queic.com.sg", logoUrl: logo("queic.com.sg"),
    description: "Queic by Olivia is Singapore’s first boutique dedicated entirely to the art of cheesecake. Born from the acclaimed Olivia Restaurant and inspired by its signature homemade cheesecake, Queic has quickly earned recognition as one of Singapore’s finest. Celebrated both locally and internationally, our cheesecakes have become a must-try for visitors and dessert lovers alike.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-k218", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  royal_host: restaurant({
    name: "Royal Host", cuisine: "Restaurant", amenity: "restaurant",
    website: "royalhost.com.sg", logoUrl: logo("royalhost.com.sg"),
    description: "Royal Host offers a taste of its famous Japanese-Western comfort food.\nIndulge in signature Japanese Hamburg, sizzled to juicy goodness on a hot plate and Omu Rice, smoky fried rice blanketed with the perfect creamy egg omelette, glazed in sauce for full taste factor. Do not miss the Japanese Steaks cut from the most prized Wagyu beef for incomparable marbling and Doria, a casserole of white rice gratin topped with meat, white sauce and cheese.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-219", "landside", "10:00 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 10:00 AM - 11:00 PM (Friday, Saturday) | 10:00 – 22:00", false),
    ],
  }),
  sampanman_kelong_changi: restaurant({
    name: "Sampanman Kelong Changi", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "sampanman.sg", logoUrl: logo("sampanman.sg"),
    description: "The Sampanman Kelong Changi pays homage to traditional seafaring ethnic groups of the Southeast Asian region. These ethnic groups made a living from fishing and consumed a diet that consisted of delicious and hearty seafood recipes. Enjoy the visual delight of having fresh seafood adorned on a custom-made griller sampan boat, calling for fond memories to be created. Another signature dish is the Truffle Crab Bee Hoon, doused in a hearty and addictive milky broth. Simulating the pastoral offshore villages built by fishermen, the interiors feature plenty of old stained-wood finishing and rattan textures.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-223", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  sanook_kitchen: restaurant({
    name: "Sanook Kitchen", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    description: "Come to Sanook Kitchen and savour a wide variety of authentic Thai food classics ranging from appetisers, soup, curries to seafood and more at wallet-friendly prices!",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-223/224", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  sf_fruits_juices: restaurant({
    name: "SF Fruits & Juices", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "sfsingapore.com", logoUrl: logo("sfsingapore.com"),
    description: "SF established its first store in 2004, providing freshly cut fruits and a menu of blended fresh fruits juices with rice health benefits. We currently have around 30 outlets islandwide, with some selling whole fruits as well. SF strives to provide consumers with quality fruits and farm product at reasonable prices. Our products are carefully sourced from trusted farms and growers across the world and brought to us on a regular basis via land, sea, and air. We guarantee freshness!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-260", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "Restaurant", amenity: "restaurant",
    website: "shakeshack.com.sg", logoUrl: logo("shakeshack.com.sg"),
    description: "Shake Shack is a modern day “roadside” burger stand known for its 100% all-natural Angus beef burgers, flat-top beef dogs (no hormones or antibiotics – ever), frozen custard, crinkle cut fries, craft beer and more.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-256", "landside", "08:30 – 22:30 Daily", false),
    ],
  }),
  song_fa_bak_kut_teh: restaurant({
    name: "Song Fa Bak Kut Teh", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "songfa.com.sg", logoUrl: logo("songfa.com.sg"),
    description: "Established in 1969, Song Fa Bak Kut Teh has grown to become a time-honoured and prominent name in the local food scene. High quality pork ribs are carefully simmered with garlic and pepper to yield the trademark clear and peppery soup, popularly paired with braised dishes and Kung Fu tea. It is at Song Fa, where one can relive the heritage of good old Bak Kut Teh in its truest sense.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-278/279/280", "landside", "09:00 – 21:30 Daily", false),
    ],
  }),
  soup_restaurant: restaurant({
    name: "Soup Restaurant", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "souprestaurant.com.sg", logoUrl: logo("souprestaurant.com.sg"),
    description: "Established Soup Restaurant Group is pleased to unveil a new modern casual Chinese concept, SAMSUI, at JEWEL Changi Airport on 17 April 2019.\n\nLocated on the third floor of Jewel Changi Airport, the restaurant boasts a stunning view of the 40-metre Rain Vortex the world's tallest indoor waterfall - surrounded by a verdant and lush Forest Valley. \nPresenting a fresh and contemporary space with a young and energetic vibe, SAMSUI is proud to showcase an expertly-executed menu featuring modern renditions of heirloom Cantonese dishes that have stood the test of time. Conceptualised by the stellar team of veteran and rising chefs, this culinary direction is in line with the group's aim to showcase its unique brand of home-style dishes to a greater audience.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-201", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "24 Hours / Cafe / Quick Bites", amenity: "cafe",
    website: "starbucks.com.sg", logoUrl: logo("starbucks.com.sg"),
    description: "Sometimes, all you need is that familiar taste of your favourite cup of coffee — and that is exactly what Starbucks delivers all over the world, and here at Changi Airport too. Discover the world of coffee with a fresh cuppa brewed with the best Arabica beans from Latin America, Africa and Asia Pacific. A delightful selection of juices, cakes and pastries are also available, and are the perfect light bites before you travel.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-204", "landside", "07:30 AM - 09:00 PM (Monday, Tuesday, Wednesday, Thursday, Sunday) | 12:00 AM - 12:00 AM (Friday, Saturday)", false),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "24 Hours / Fast Food / Quick Bites", amenity: "fast_food",
    website: "subway.com.sg", logoUrl: logo("subway.com.sg"),
    description: "SUBWAY® offers foot long and 6-inch sandwiches, made on freshly baked bread and prepared just as you want it, right before your eyes with a wide assortment of meats, cheeses, vegetables and toppings. We also offer wraps, delis and salads, potato chips, freshly baked cookies and choice of drinks to make every visit a fresh one.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-230", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  sugarbelly: restaurant({
    name: "SugarBelly", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "instagram.com", logoUrl: logo("instagram.com"),
    description: "Founded by Alexan Tang in 2020, SugarBelly is Singapore’s first specialty mochi doughnut store, offering fresh-to-order mochi doughnuts with a unique texture — crispy outside and a light chew inside. Eggless and preservative-free, our doughnuts are freshly made using premium quality Japanese ingredients. With new flavours weekly, SugarBelly always offers something exciting from classic to adventurous and is also home to Singapore’s first matcha on tap. A proud homegrown Singaporean brand, we don’t just make desserts, we make memories. Experience the future of doughnuts at SugarBelly today!",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-256", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  sukiya_gyudon_curry: restaurant({
    name: "SUKIYA. Gyudon. Curry", cuisine: "Restaurant", amenity: "restaurant",
    website: "sukiya.com.sg", logoUrl: logo("sukiya.com.sg"),
    description: "SUKIYA is the No. 1 Gyudon chain in Japan and has over 2,500 restaurants worldwide. The 1st SUKIYA restaurant was opened in Yokohama, Japan in 1982. It has become a well-loved brand to many over the past years. SUKIYA has expanded outside of Japan from 2008. There are over 600 stores in East Asia, South-east Asia & Latin America now. SUKIYA's mission is to serve authentic Japanese food with reliable quality at affordable prices throughout the world.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-200", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
  sushi_tei: restaurant({
    name: "Sushi Tei", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "sushitei.com", logoUrl: logo("sushitei.com"),
    description: "Homegrown Japanese restaurant chain Sushi Tei is one of the most popular dining venues in Singapore. With an extensive menu featuring more than 370 dishes, from sashimi and sushi, to yakimono and nabemono, be prepared to be spoilt for choice.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-209", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  sushiro: restaurant({
    name: "Sushiro", cuisine: "Restaurant", amenity: "restaurant",
    website: "facebook.com", logoUrl: logo("facebook.com"),
    description: "SUSHIRO is Japan’s number 1 kaiten sushi chain. With more than 670 outlets in Japan and other countries, Sushiro serves over 100 varieties of delicious sushi and Japanese dishes to about 150 million customers every year. \n\nWith the core corporate mission, \"Tasty Sushi for All. Tasty Sushi for the Heart.\" Sushiro maintains its key focus on careful ingredient selection, constant development of new flavours, employment of advanced technology to enhance service quality and is committed to serving high-quality and value-for-money Japanese sushi to customers.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-227/228", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tai_er_suancai_fish: restaurant({
    name: "Tai Er Suancai & Fish", cuisine: "Restaurant", amenity: "restaurant",
    description: "Established in 2015, Tai Er is an innovative F&B brand that spreading via Internet, focusing on its signature dish: Chinese sauerkraut fish. Tai Er has expressed the attitude of being \"Er\" (one-track mind or seemingly silly) in an interesting way with Internet interpretation, and insisted on innovating the traditional culture, advocating that sauerkraut tastes even better than fish, which turns the sauerkraut with a 3,000-year history into a symbol representing Chinese lifestyle and culture.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-208", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  talad_thai_banana: restaurant({
    name: "Talad Thai Banana", cuisine: "Homegrown / Quick Bites", amenity: "fast_food",
    website: "taladthaibanana.com", logoUrl: logo("taladthaibanana.com"),
    description: "A proud homegrown Singaporean brand founded in 2023, Talad Thai Banana is built on an authentic Thai recipe crafted with love. Its signature batter uses fresh, hand-picked ingredients prepared daily with good intentions. All products are vegan-friendly, cooked in small batches, and served crisp, warm, and full of flavour. Talad Thai Banana aims to bring this traditional Thai recipe to the heart of Singapore.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-257", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tambuah_mas_indonesian_restaurant: restaurant({
    name: "Tambuah Mas Indonesian Restaurant", cuisine: "Restaurant", amenity: "restaurant",
    website: "tambuahmas.com.sg", logoUrl: logo("tambuahmas.com.sg"),
    description: "Established in 1981, Tambuah Mas is one of Singapore’s most enduring Indonesian restaurants, known for authentic cuisine from Padang, Sulawesi, and Java. Our signature dishes are crafted from closely guarded family recipes, refined for the modern palate. Led by Indonesian chefs, we blend bold regional flavours with fresh ingredients and thoughtful presentation — offering a culturally elevated urban dining experience that matches the vibrant energy of Jewel.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-225/226", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tempura_en: restaurant({
    name: "Tempura-EN", cuisine: "Restaurant", amenity: "restaurant",
    website: "tempura-en.com.sg", logoUrl: logo("tempura-en.com.sg"),
    description: "Tempura-EN elevates the art of Japanese tempura through meticulous craftsmanship and premium ingredients. Each piece is freshly prepared with a light, delicate batter that enhances natural flavours without overpowering them. From crisp seafood and seasonal vegetables to thoughtfully composed Japanese dishes, Tempura-EN delivers a refined yet comforting dining experience that celebrates tradition, precision and the joy of simple excellence.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-223", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  the_1872_clipper_tea_co: restaurant({
    name: "The 1872 Clipper Tea Co.", cuisine: "Cafe / Homegrown / Quick Bites", amenity: "cafe",
    website: "clippertea.com.sg", logoUrl: logo("clippertea.com.sg"),
    description: "The 1872 Clipper Tea Co. is Singapore’s heritage tea producer, blender, and retailer, dedicated to crafting premium farm-to-cup specialty teas for over 150 years. Our space brings together a tea bar and retail boutique in one seamless experience. At the tea bar, enjoy a curated menu of handcrafted teas—from bold classics to gentle, caffeine-free blends—served alongside artisanal bakes, savoury sandwiches, waffles, and tea gelatos. Explore our range of premium teas, perfect for daily enjoyment, thoughtful gifting, or as uniquely Singaporean keepsakes in a our tea boutique.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-237", "landside", "08:30 AM - 10:00 PM (Monday, Tuesday, Wednesday, Thursday, Friday) | 10:00 AM - 10:00 PM (Saturday, Sunday) | 10:00 – 22:00", false),
    ],
  }),
  the_coach_restaurant: restaurant({
    name: "The Coach Restaurant", cuisine: "Restaurant", amenity: "restaurant",
    description: "The Coach Restaurant Singapore is part of Coach’s distinctive world of bespoke and immersive lifestyle experiences that blend fashion, culture, and community. Inspired by our hometown, the vibrant spirit of New York City.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-207", "landside", "11:30 – 22:00 Daily", false),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "24 Hours / Cafe", amenity: "cafe",
    website: "coffeebean.com.sg", logoUrl: logo("coffeebean.com.sg"),
    description: "Kick back with a cuppa at The Coffee Bean & Tea Leaf. Sip on long-time favourites like The Original Ice Blended, Vanilla and Mocha Lattes, or the popular Chai Latte. Those who prefer their coffee simple can also choose from a wide selection of espresso-based drinks and the Brew Of The Day. Complement your drink with a mouth-watering selection of puffs, muffins, bagels and irresistible cakes.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-200", "landside", "Open 24 hours Daily", true),
    ],
  }),
  the_hainan_story: restaurant({
    name: "The Hainan Story", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "thehainanstory.com.sg", logoUrl: logo("thehainanstory.com.sg"),
    description: "The Hainan Story was created to celebrate the love of Hainanese food for Singaporeans.\n\nHainanese immigrants were among the last Chinese communities to arrive in Singapore after the Teochews, Hokkiens, and Cantonese.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-201/202", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
  tian_tian_hainanese_chicken_rice: restaurant({
    name: "Tian Tian Hainanese Chicken Rice", cuisine: "", amenity: "restaurant",
    description: "Tian Tian Hainanese Chicken Rice is a Michelin Bib Gourmand-recognised Singapore brand, awarded consecutively from 2016 to 2026. Known for its signature Hainanese chicken rice, fragrant rice, tender chicken, house-made chilli, and comforting local side dishes, Tian Tian has been serving a taste of Maxwell’s heritage since 1986 through dine-in, takeaway, and casual family-friendly dining.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-243/244", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tim_ho_wan: restaurant({
    name: "Tim Ho Wan", cuisine: "Restaurant", amenity: "restaurant",
    website: "timhowan.com", logoUrl: logo("timhowan.com"),
    description: "Award-winning dim sum restaurant Tim Ho Wan offers handmade dim sum at affordable prices. With more than 50 outlets in eight countries, Tim Ho Wan continues to win fans, from discerning critics to budget-conscious foodies. Fans can savour all-time favourites such as its famous Baked BBQ Pork Buns.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-223", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  toast_box_thye_moh_chan: restaurant({
    name: "Toast Box & Thye Moh Chan", cuisine: "", amenity: "restaurant",
    website: "thyemohchan.com", logoUrl: logo("thyemohchan.com"),
    description: "Looking for authentic, Singapore-style coffee, otherwise known as kopi among locals? Welcome to Toast Box, a homegrown coffee chain that seeks to recreate the nostalgic vibes of Singapore’s coffee shops in Singapore back in the 60s and 70s. Besides getting your kopi fix, you will also find familiar favourites such as kaya toast, curry chicken with rice, and laksa on the menu.\nOperating hours: 08:00 AM - 10:00 PM, Daily\n\nSince 1943, Thye Moh Chan has served a loyal following with its handcrafted traditional Teochew baked goods such as Tau Sar Piah, a flaky pastry filled with mung bean paste. Over the years, Thye Moh Chan continues to win customers’ hearts with its skillfully handcrafted products, using traditional baking techniques. Today, the veteran chefs transfer their respected skills to a new team, ensuring that these all-time favourite pastries are faithfully reproduced with time-honoured techniques, and continue to appeal to future generations.\nOperating hours: 10:00 AM - 10:00 PM, Daily",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-231", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
  tokyo_milk_cheese_factory_cow_cow_kitchen: restaurant({
    name: "Tokyo Milk Cheese Factory & Cow Cow Kitchen", cuisine: "Quick Bites", amenity: "fast_food",
    website: "tokyomilkcheesesg.com", logoUrl: logo("tokyomilkcheesesg.com"),
    description: "Based on the whimsical concept of “a factory filled with creativity and innovation”, Tokyo Milk Cheese Factory & Cow Cow Kitchen was born in Japan in 2011. The brand endeavours to create sweets that no one has ever made, using carefully selected milk and high quality cheese, combined with ingredients from not only Japan, but also around the world. Here, New meets Nostalgic, and the Unexpected with the Flavourful. The Japanese have an expression “ほおがおちる” (Hoppe ga ochiru) which literally means “Your Cheeks Drop“ – expressed when something delicious is eaten. That’s what Tokyo Milk Cheese Factory is about.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-265", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tonkatsu_by_ma_maison: restaurant({
    name: "Tonkatsu by Ma Maison", cuisine: "Restaurant", amenity: "restaurant",
    website: "ma-maison.sg", logoUrl: logo("ma-maison.sg"),
    description: "Backed by the experience of the Japanese-French fusion restaurant chain, Tonkastsu by Ma Maison serves up the most aromatic, tender and succulent breaded Kurobuta pork cutlets, accompanied by shredded cabbage, tonjiru soup and pickles.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-211", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  treasures_yi_dian_xin: restaurant({
    name: "Treasures Yi Dian Xin", cuisine: "Restaurant", amenity: "restaurant",
    website: "imperialtreasure.com", logoUrl: logo("imperialtreasure.com"),
    description: "A casual dining concept that serves up signature selections of classic Chinese cuisine, Treasures Yi Dian Xin aspires to deliver the “Art of Daily Luxury” through affordably priced dishes that uses only quality ingredients. Its brand philosophy of “Tastes of Life” aims to introduce food that transcend cultural barriers whilst offering great quality, taste and value for money.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-221/222", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tsui_wah: restaurant({
    name: "Tsui Wah", cuisine: "Restaurant", amenity: "restaurant",
    website: "shop.tsuiwah.com", logoUrl: logo("shop.tsuiwah.com"),
    description: "Famed Cha Chaan Teng from Hong Kong, Tsui Wah Singapore offers an extensive range of Cantonese-style Western and Chinese dishes. Some of the must-try dishes: BBQ Pork and Scrambled Egg expertly executed with HK-style BBQ Sauce, Crispy Bun with Condensed Milk, Milk tea and more.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-230", "landside", "08:00 – 22:00 Daily", false),
    ],
  }),
  tsuta_japanese_soba_noodles: restaurant({
    name: "Tsuta Japanese Soba Noodles", cuisine: "Restaurant", amenity: "restaurant",
    website: "tsuta.com", logoUrl: logo("tsuta.com"),
    description: "Tsuta began as a modest 9-seater ramen shop in Tokyo in 2012, founded by Chef Yuki Onishi. Driven by a passion for crafting truly original flavours, Chef Onishi sought to redefine the classic ramen experience with natural, premium ingredients—no MSG or artificial additives. By 2015, Tsuta achieved a remarkable milestone: becoming the World's First Michelin-Starred Ramen Restaurant.\nAvoiding shortcuts and applying meticulous technique, Chef Onishi constantly worked on refining and enhancing his ramen's taste and texture. For him, ramen is never perfect—only better with each creation.",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-218", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tun_xiang_hokkien_delights: restaurant({
    name: "Tun Xiang Hokkien Delights", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "facebook.com", logoUrl: logo("facebook.com"),
    description: "Welcome to Tun Xiang Hokkien Delights, our brand philosophy is always\nstriving to achieve excellent food quality as well as providing a unique dining\nexperience to all our guests.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-290", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  tutto_by_da_paolo: restaurant({
    name: "Tutto by Da Paolo", cuisine: "Restaurant", amenity: "restaurant",
    website: "dapaolo.com.sg", logoUrl: logo("dapaolo.com.sg"),
    description: "Tutto, the newest chapter in the Da Paolo family story, is a fresh, youthful casual Italian restaurant celebrating Italy's culture through the food the family loves most. Pasta is made on site daily, paired with sauces that reflect the stories of Italy’s regions. Pizzas are slow fermented for over 72 hours for a soft, crisp crust, and gelato created with Milan’s Chocolat reflects the family’s passion for chocolate and quality ingredients. Tutto is everything Italian for everyone: the heart of Da Paolo's heritage, shared with a new generation, with welcoming prices and an invitation to enjoy.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-246/247", "landside", "11:30 AM - 09:30 PM (Monday, Tuesday, Wednesday, Thursday) | 11:30 AM - 10:00 PM (Friday) | 11:00 AM - 10:00 PM (Saturday) | 11:00 AM - 09:30 PM (Sunday) | 10:00 – 22:00", false),
    ],
  }),
  wa_en_wagyu_yakiniku: restaurant({
    name: "Wa-En Wagyu Yakiniku", cuisine: "Restaurant", amenity: "restaurant",
    website: "wa-en.com.sg", logoUrl: logo("wa-en.com.sg"),
    description: "Recommended in the Michelin guide in year 2016 and 2017, Wa-En Wagyu Yakiniku flagship restaurant has been operating in Hong Kong for more than 10 years, specialising in premium and delicate A4 and A5 Wagyu from Miyazaki, Japan, for Yakiniku. Wa-En’s first outlet opening in Singapore is located at the heart of Jewel Changi Airport, positioning its menu to focus on Japanese Yakiniku together with an exquisite bar experience, boasting an assortment of wines & Japanese whiskeys alongside with crafted cocktails using Miyazaki fats infused in whiskey and sakes.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-224", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  white_restaurant: restaurant({
    name: "White Restaurant", cuisine: "Homegrown / Restaurant", amenity: "restaurant",
    website: "whiterestaurant.com.sg", logoUrl: logo("whiterestaurant.com.sg"),
    description: "White Beehoon (or White Rice Vermicelli) is a local dish popularised by the founders of White Restaurant back in 1999. With its beginnings as a humble stall in a coffee shop, this family business has since opened restaurants across Singapore, serving up the same comfort food and friendly service.",
    outlets: [
    o("Basement 1", "Jewel Public Basement 1, #B1-245/246", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  wild_coco: restaurant({
    name: "Wild Coco", cuisine: "", amenity: "restaurant",
    description: "Indulge in a First-Class dining experience where culinary tradition meets art. We elevate beloved Singapore delights using traditional cooking methods and premium, fresh ingredients. Savor our signature Ayam Berempah, meticulously marinated in a rich blend of herbs and spices for over 24 hours, or dive into a deeply flavorful Fresh Prawn Laksa, crafted from a heritage recipe dating back to the 1960s.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-248", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  wu_fang_zhai: restaurant({
    name: "Wu Fang Zhai", cuisine: "Quick Bites", amenity: "fast_food",
    description: "With over a century of Jiangnan culinary heritage, Wu Fang Zhai reinvents traditional Chinese delicacies for modern travelers. Our signature freshly baked mooncakes feature premium Iberico pork and truffles, while handcrafted zongzi preserve ancient bamboo-leaf wrapping techniques.",
    outlets: [
    o("Basement 2", "Jewel Public Basement 2, #B2-258", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  ya_kun_kaya_toast: restaurant({
    name: "Ya Kun Kaya Toast", cuisine: "Cafe / Homegrown / Quick Bites", amenity: "cafe",
    website: "yakun.com", logoUrl: logo("yakun.com"),
    description: "Founded more than 70 years ago as a humble coffee stall business, Ya Kun has grown leaps and bounds as a strong homegrown brand. With more than 100 outlets across Asia, it has done Singapore proud with its signature piping hot coffee and charcoal-grilled toast with homemade kaya. With the inception of its new dining experience in the form of Ya Kun Family Café, you can now find Asian Signatures – a new range of scrumptious local favourites that includes Nasi Lemak Istimewa, Laksa and Mee Rebus which are made with premium quality ingredients and freshly prepared daily.",
    outlets: [
    o("Level 1", "Jewel Public Level 1, #01-230", "landside", "07:30 – 22:00 Daily", false),
    ],
  }),
  yes_lemon: restaurant({
    name: "YES LEMON", cuisine: "Quick Bites", amenity: "fast_food",
    description: "Originating from Nanjing, Yes Lemon specializes in handcrafted lemon tea. We meticulously blend unique lemon varieties to achieve the perfect balance of flavors. Quality and innovation drive us, as we strive to create a truly distinctive and memorable lemon tea experience",
    outlets: [
    o("Level 3", "Jewel Public Level 3, #03-211", "landside", "10:00 – 22:00 Daily", false),
    ],
  }),
  yun_nans_temporarily_closed: restaurant({
    name: "Yun Nans (Temporarily Closed)", cuisine: "Restaurant", amenity: "restaurant",
    description: "Yun Nans is the largest casual dining restaurant chain from Yunnan, China, specialising in Yunnan cuisine. The popular restaurant uses the freshest ingredients from the highlands of the Yunnan Province, offering specialities such as steamed pot chicken soup, braised wild porcini mushrooms, Yunnan rice noodles and handmade rose pastries. Yun Nans has over 150 outlets in China. The Jewel Changi Airport outlet is their first overseas outpost.",
    outlets: [
    o("Level 2", "Jewel Public Level 2, #02-217", "landside", "10:00 – 22:00 Daily", false),
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
  const r3 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', terminal3Venues);
  const r4 = await processTerminal(AIRPORT, TERMINAL_4, 'Terminal 4', terminal4Venues);
  const r5 = await processTerminal(AIRPORT, JEWEL, 'Jewel Changi Airport', jewelVenues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, TERMINAL_2, TERMINAL_3, TERMINAL_4, JEWEL]));

  const totalCreated = r1.created + r2.created + r3.created + r4.created + r5.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted + r4.deleted + r5.deleted;
  const totalVenues = Object.keys(terminal1Venues).length + Object.keys(terminal2Venues).length
    + Object.keys(terminal3Venues).length + Object.keys(terminal4Venues).length + Object.keys(jewelVenues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
