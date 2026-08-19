'use strict';
/**
 * Fills in complete data for all Munich Airport (MUC) restaurants/bars/cafés
 * in Firestore, cross-referenced against the official Munich Airport
 * restaurants directory (munich-airport.com/restaurants-261920) and each
 * venue's own detail page on 2026-08-05.
 *
 * The directory page is a classic server-rendered site (not Next.js/Nuxt —
 * no __NEXT_DATA__ or similar JSON payload was found) with a "Show more"
 * pagination button (`.btn-load-more`) that had to be clicked repeatedly to
 * load the full list. A plain JS `.click()` on the button worked once, then
 * silently stopped advancing the page on subsequent calls even after a
 * wait — switching to a genuine simulated click (via the `find` tool's
 * element ref + the `computer` tool's `scroll_to` + `left_click`) reliably
 * advanced the list each time. The reliable venue count came from the
 * `.product-overview-item` card elements (58 total once fully loaded), not
 * from counting `<a>` tags matching the venue-URL pattern — that regex also
 * matched nav/footer links and overcounted (71+ and climbing).
 *
 * Each venue's own detail page was then visited for its description, area
 * (airside/landside), phone, email, hours and dietary alternatives. Several
 * venues have more than one physical counter, exposed via a `<select
 * class="places">` location dropdown built on the jQuery `selectBox`
 * plugin. That plugin doesn't react to a plain `select.value =`/`change`
 * dispatch — the fix was calling the plugin's own API directly:
 *   sel.selectedIndex = i; jQuery(sel).selectBox('refresh').trigger('change');
 * which correctly re-renders the contact panel for each location in turn.
 *
 * Munich Airport doesn't use a simple T1/T2 split for its food & drink
 * venues the way most other airports in this dataset do — venues are
 * spread across Terminal 1 (modules A-E / Gates A pier), Terminal 2 (Gates
 * G,H and the Gates K,L satellite building), the landside Munich Airport
 * Center (MAC) mall between the terminals, and a landside cluster of hotel/
 * visitor-park venues (Hilton, Novotel, Gastronomiegebäude Besucherpark).
 * Those four groupings are used as the Firestore `terminals/{id}` buckets
 * here. A brand present in multiple of those groupings (Coffee Fellows,
 * Cucina Popolare, dean&david, Subralott — each T1 *and* T2) gets a
 * separate doc per grouping, matching the Manchester convention for brands
 * spanning multiple terminals; multiple counters of the same brand WITHIN
 * one grouping (Foodji's three T2 pickup-kiosk locations) are combined into
 * a single doc with multiple `outlets[]`.
 *
 * Data-quality notes so the choices below aren't mistaken for gaps:
 *   - `airside` is mapped directly from each outlet's own "Area" field on
 *     its detail page: "Behind security check" -> airside, "Public area" ->
 *     landside. This is authoritative per-outlet data, not inferred.
 *   - Dietary tags (vegetarian/vegan/gluten-free/halal) come from each
 *     venue's own "the following alternatives are also available" bullet
 *     list on its detail page. A few venues note an alternative is only
 *     available "at the gates A/B/G/D" (Cucina Popolare, dean&david,
 *     Subralott) — the flag is still set true at the venue level to match
 *     the convention used elsewhere in this dataset (flags are venue-level,
 *     not per-outlet), with the restriction kept in the description/notes.
 *     No venue mentions kosher options, so that field is left blank
 *     throughout.
 *   - Seven venues that the directory itself flags as "temporarily closed"
 *     with no listed hours are EXCLUDED entirely, since they aren't
 *     currently real dining options: Alfredo Bar & Biergarten, Bruschetteria,
 *     Coca-Cola Bar & Biergarten, Hofbräu Bistro (Terminal 1, Module A),
 *     Magnum Bar, Münchner Leibspeise, and Paulaner Bar & Biergarten (T1 A).
 *     Two venues have ONE of their counters closed while another stays
 *     open — only the open counter is included: Bamee (its Terminal 2,
 *     Gates H counter is closed; the Terminal 1 C counter is kept) and
 *     Coffee Fellows (its Terminal 1 E counter is closed; T1 D and T2 are
 *     kept).
 *   - `website`/`logo_url` are only filled in for brands independently
 *     verifiable as real national/international chains or the specific
 *     domain given on the venue's own contact panel (McDonald's, Starbucks,
 *     Subway, Airbräu, Caffè Vergnano, Segafredo, dean&david, Coffee
 *     Fellows, Erdinger, Käfer/Käfer Bistro/the ODEON by Käfer, Hans im
 *     Glück, Mountain Hub Gourmet/Social Dining, Nightflight Bar (Hilton),
 *     Selmans Restaurant & Bar, Café-Konditorei Aida, Dallmayr Bistro,
 *     Mionetto Bar, Airport Oliva) — Munich Airport-exclusive concepts with
 *     no independent public domain are left blank rather than guessing one.
 *
 * Munich appears in NEITHER reference script (upload_to_firestore.py nor
 * migrate_firestore.js/cleanup_firestore.js) — confirmed via grep for
 * "munich"/"muc" returning zero matches in all three files — so its
 * Firestore slug is unconfirmed. This script auto-detects the airport slug
 * at runtime (checking 'munich' first, then 'muc', using whichever has
 * existing terminal data) and matches existing restaurant docs by
 * normalized name within each terminal grouping — updating in place if
 * found, creating new otherwise. It never creates a new `airports/{id}`
 * metadata doc itself.
 *
 * Setup: same as the other upload_*.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_muc_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['munich', 'muc'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const TERMINAL_2 = 'terminal_2';
const MUNICH_AIRPORT_CENTER = 'munich_airport_center';
const AIRPORT_PARK = 'airport_park';

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

// ─── Terminal 1 venues (modules A-E / Gates A pier) ──────────────────────────

const t1Venues = {
  apollinaris_bar: restaurant({
    name: 'Apollinaris Bar',
    cuisine: 'Café, Snacks',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 931 50',
    description: 'This bar takes its name from the self-crowned "Queen of the Table Waters", offering coffee, cappuccino and other hot beverages plus snacks like focaccia with various toppings, with a modern but cosy decor and a view of the C Arrivals area in Terminal 1.',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Terminal 1 C', openingHours: 'daily 6:30 a.m. - 9:00 p.m.' })],
  }),
  bamee_t1: restaurant({
    name: 'Bamee',
    cuisine: 'Thai, Asian',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 931 70',
    description: 'Bamee, the wok master, serves up real Asian cuisine with fresh ingredients and diverse spices in a display kitchen. The Terminal 1 restaurant has a covered terrace for al-fresco Asian dining, and everything can also be packed up to go. Note: the separate Bamee counter in Terminal 2, Gates H, Level 05 is currently temporarily closed.',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Terminal 1 C', openingHours: 'daily 9:00 a.m. - 8:30 p.m.' })],
  }),
  erdinger_bar_biergarten: restaurant({
    name: 'Erdinger Bar & Biergarten',
    cuisine: 'Bavarian, German',
    amenity: 'pub',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 931 50',
    description: "A wood-decorated beer garden serving the full range of beers from the Erdinger brewery, plus regional specialties such as white sausages, wieners and leberkäse with bread pretzels and fresh potato salad, home-made cakes and ice creams, and a sand play area for kids.",
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Terminal 1 C', openingHours: 'daily 7:30 a.m. - 3:00 p.m.' })],
  }),
  kaefer: restaurant({
    name: 'Käfer',
    cuisine: 'German, Fine Dining',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    website: 'https://www.feinkost-kaefer.de',
    logoUrl: logo('feinkost-kaefer.de'),
    description: 'A true "Munich Love Brand" offering exceptional gourmet cuisine in an exclusive setting, combining classics such as beef tartare and Wiener schnitzel with seasonal specialties, a show dessert of spaghetti ice cream served from an airplane trolley, and an open show kitchen with more than 100 German and international wines.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 1 - Gates A', openingHours: 'daily 5:00 a.m. - 9:30 p.m.' })],
  }),
  mionetto_bar: restaurant({
    name: 'Mionetto Bar',
    cuisine: 'Italian, Bar',
    amenity: 'bar',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 931 22',
    website: 'https://www.mionetto.com',
    logoUrl: logo('mionetto.com'),
    description: 'A snack bar named for the Italian Prosecco of Veneto and Friuli Venezia Giulia, serving salads, snacks, cakes, coffee specialities, soft drinks and regional beers, with a view of the action on the airport apron.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 1 C', openingHours: 'daily 4:00 a.m. - 3:00 p.m.' })],
  }),
  the_odeon_by_kaefer: restaurant({
    name: 'the ODEON by Käfer',
    cuisine: 'German, Deli, Bar',
    amenity: 'restaurant',
    vegetarian: true,
    glutenFree: true,
    website: 'https://www.feinkost-kaefer.de',
    logoUrl: logo('feinkost-kaefer.de'),
    description: 'Urban bar culture, modern fine foods and deli highlights come together in an international airport setting, with a kitchen focused on small, high-quality dishes, sharing plates and appetizers, plus a fresh to-go selection from a quick coffee to an evening drink.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 1 - Gates A', openingHours: 'daily 4:00 a.m. - 10:30 p.m.' })],
  }),
  coffee_fellows_t1: restaurant({
    name: 'Coffee Fellows',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 931 50',
    website: 'https://www.coffee-fellows.com',
    logoUrl: logo('coffee-fellows.com'),
    description: 'A place to feel at home, with baristas whipping up more than 100 coffee specialties and fresh bagels made to order, including vegetarian options. Note: the separate Coffee Fellows counter in Terminal 1 E is currently temporarily closed.',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Terminal 1 D', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' })],
  }),
  dean_david_t1: restaurant({
    name: 'dean&david',
    cuisine: 'Healthy, Salads, Bowls',
    amenity: 'fast_food',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    website: 'https://deananddavid.de/en/',
    logoUrl: logo('deananddavid.de'),
    description: 'dean&david represents freshness, quality and responsible, sustainable consumption — healthy food with high-quality ingredients, without flavour enhancers, colourings or preservatives. Gluten-free dishes are only available at the Gates B and G locations.',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Terminal 1 B', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' })],
  }),
  cucina_popolare_t1: restaurant({
    name: 'Cucina Popolare',
    cuisine: 'Italian',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'Authentic Italian cuisine — freshly prepared, full of flavor, made with high-quality ingredients, from crispy pizza to delicate pasta. This Terminal 1 Pier location offers hand-topped pizzas, refined pasta creations such as truffle pasta, a curated wine selection in a glass climate cabinet, and panoramic views of the airport apron. Vegan and gluten-free dishes are only available at the Gates A location.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 1 - Gates A', openingHours: 'daily 8:30 a.m. - 10:00 p.m.' })],
  }),
  subralott_t1: restaurant({
    name: 'Subralott',
    cuisine: 'Healthy, Bavarian',
    amenity: 'fast_food',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'Healthy, regional, fresh, authentic, hand-made products following an unmistakable Bavarian-influenced trend, with around 60% of all ingredients sourced locally from Bavaria. Gluten-free options are only available at the Gates D location.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 1 D', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' })],
  }),
};

// ─── Terminal 2 venues (Gates G,H and the Gates K,L satellite building) ─────

const t2Venues = {
  adelholzener_bar: restaurant({
    name: 'Adelholzener Bar',
    cuisine: 'Beverages, Snacks',
    amenity: 'bar',
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 932 92',
    description: 'The mineral water after which this snack bar is named comes directly from the Bavarian Alps, alongside regional freshly tapped beers, non-alcoholic hot and cold drinks, freshly prepared sandwiches and a view of the apron.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' })],
  }),
  airbraeu_next_to_heaven: restaurant({
    name: 'Airbräu Next to Heaven',
    cuisine: 'Bavarian, German',
    amenity: 'pub',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 932 80',
    website: 'https://www.airbraeu.com',
    logoUrl: logo('airbraeu.com'),
    description: "The big Airbräu restaurant's little sister, located in the Terminal 2 departure area, serving Bavarian and international fare with beer from Airbräu's own brewery, prepared by experienced chefs using local ingredients.",
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 7:00 a.m. - 9:00 p.m.' })],
  }),
  airport_oliva: restaurant({
    name: 'Airport Oliva',
    cuisine: 'Turkish, Mediterranean',
    amenity: 'fast_food',
    phone: '+49 89 975 844 58',
    website: 'https://www.meinoliva.de',
    logoUrl: logo('meinoliva.de'),
    description: 'Freshly prepared southern European and Turkish specialties in an attractive, clean-lined setting, including fresh salads, baked goods, döner kebab and Turkish pizza, all made from organic ingredients.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 7:00 a.m. - 10:30 p.m.' })],
  }),
  backstube_wuensche: restaurant({
    name: 'Backstube Wünsche',
    cuisine: 'Bakery',
    amenity: 'bakery',
    phone: '+49 89 973 068 14',
    description: 'A Bavarian bakeshop from Ingolstadt baking everything fresh daily — country-style bread and rolls, hearty snacks and sweet baked goods, all carrying the Bavarian quality seal, baked with selected grains and offered at reasonable prices.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 10:00 p.m.' })],
  }),
  bluebird_bar: restaurant({
    name: 'Bluebird Bar',
    cuisine: 'Bavarian, Italian, Snacks',
    amenity: 'fast_food',
    phone: '+49 89 975 850 46',
    description: 'Tasty items to go from the early morning hours — sandwiches, snacks and baked goods, plus hearty Bavarian sausages, thin-crust Italian pizza, fine pasta, shakes and ice cream.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 7:30 a.m. - 1:00 p.m.' })],
  }),
  boconero: restaurant({
    name: 'Boconero',
    cuisine: 'Bakery, Café',
    amenity: 'cafe',
    phone: '+49 89 975 850 45',
    description: 'Bread and coffee from the masters — high-quality breads baked on the premises, bruschette, buttered bread, pitas, sandwiches, panini and French baguettes, plus sweet crepes, hearty galettes and a Brew Bar.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:30 a.m. - 9:30 p.m.' })],
  }),
  boconero_express: restaurant({
    name: 'Boconero Express',
    cuisine: 'Café, Snacks',
    amenity: 'cafe',
    description: 'High-quality Boconero coffee in three blends (100% Arabica, "Delicato" and "Forte" espresso), plus fresh sandwiches, homemade salads, snacks and local specialities. Only open during the operating hours of the Special Control Area USA.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 7:30 a.m. - 1:00 p.m.' })],
  }),
  cafe_konditorei_aida: restaurant({
    name: 'Café-Konditorei Aida',
    cuisine: 'Austrian, Café, Patisserie',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    phone: '+49 174 3355219',
    website: 'https://aida.at/en/',
    logoUrl: logo('aida.at'),
    description: 'Traditional Viennese coffeehouse culture and AÏDA Konditorei specialties since 1913, with exquisite cake variations, high-quality coffee like the "AÏDA Melange", apple strudel and the famous AÏDA cream slice.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 5:00 a.m. - 10:00 p.m.' })],
  }),
  ciao_amici: restaurant({
    name: 'Ciao Amici',
    cuisine: 'Italian, Café',
    amenity: 'cafe',
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 845 90',
    description: 'A large open lounge bar in Italian design serving delicious focaccia, hot and cold snacks, sweets, coffee specialties and soft drinks, with large screens showing weather and news from Italy. Opens three hours before the first departure from gates G61 to G72.',
    outlets: [outlet({ airside: 'airside', level: '03', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 24 hours', open247: true })],
  }),
  cloud_7: restaurant({
    name: 'Cloud 7',
    cuisine: 'Café, Bar',
    amenity: 'cafe',
    phone: '+49 89 975 850 47',
    description: 'A small, carefully curated selection of sweet treats paired with coffee, espresso or cappuccino, and a relaxing spot after work with refreshing Spritz variations, offering a fascinating view of the taxiways.',
    outlets: [outlet({ airside: 'landside', level: '07', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 10:00 a.m. - 8:00 p.m.' })],
  }),
  dallmayr_bistro: restaurant({
    name: 'Dallmayr Bistro',
    cuisine: 'German, Café',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 936 88',
    website: 'https://www.dallmayr.com',
    logoUrl: logo('dallmayr.com'),
    description: "Munich's gourmet food specialist, standing for quality, enjoyment and classical coffeehouse atmosphere, with refined bistro kitchen, fine pâtisserie and its own coffee and tea specialties, overlooking the terminal.",
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 10:00 p.m.' })],
  }),
  fuerstenlounge: restaurant({
    name: 'Fürstenlounge',
    cuisine: 'Café, Bar',
    amenity: 'bar',
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 932 93',
    description: 'Named for Fürst von Metternich sparkling wine, offering coffee specialties, refreshing beverages and regional beers alongside cakes, salads, snacks and warm meals.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 10:00 p.m.' })],
  }),
  hans_im_glueck: restaurant({
    name: 'Hans im Glück',
    cuisine: 'Burgers, American',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 174 335 52 19',
    website: 'https://www.hansimglueck-burgergrill.de',
    logoUrl: logo('hansimglueck-burgergrill.de'),
    description: 'High-quality ingredients delivered fresh daily, from juicy beef or tender chicken breast burgers to a veggie burger with brie and cranberries or a grilled-vegetable vegan option — the chain\'s very first airport location, with a full view of the airport apron.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 8:00 a.m. - 9:00 p.m.' })],
  }),
  kaefer_factory_of_enjoyment: restaurant({
    name: 'Käfer - factory of enjoyment',
    cuisine: 'Deli, International',
    amenity: 'cafe',
    vegetarian: true,
    phone: '+49 89 975 93 272',
    website: 'https://www.feinkost-kaefer.de',
    logoUrl: logo('feinkost-kaefer.de'),
    description: 'The "Käfer Genusswerkstatt" offers arriving and waiting guests regional and international highlights — coffee from Munich roasters emilo, French quiche, oriental meals, Italian red wine, tasty wraps and fresh salads, plus an integrated gift shop of olive oil, porcelain, wine and spices.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 6:00 a.m. - 9:00 p.m.' })],
  }),
  kaefer_bistro: restaurant({
    name: 'Käfer Bistro',
    cuisine: 'German, Bistro',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 932 70',
    website: 'https://www.feinkost-kaefer.de',
    logoUrl: logo('feinkost-kaefer.de'),
    description: 'The Käfer feeling at Munich Airport — Bavarian and international cuisine in the ambience of an old Paris bistro, with selected Käfer wines, traditional salmon dishes and Käfer-branded accessories for sale.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 7:00 a.m. - 9:00 p.m.' })],
  }),
  lenbachs_bar_gallery: restaurant({
    name: 'Lenbachs Bar & Gallery',
    cuisine: 'Bar, Tapas',
    amenity: 'bar',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 174 33 55 219',
    description: "Named for Franz von Lenbach, Munich's 19th-century \"painter prince\", this tower bar at the heart of the satellite terminal's central marketplace is known for its beverage menu and creative tapas selection.",
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 6:00 a.m. - 9:00 p.m.' })],
  }),
  paulaner_bierhaus: restaurant({
    name: 'Paulaner Bierhaus',
    cuisine: 'Bavarian, German',
    amenity: 'pub',
    vegetarian: true,
    glutenFree: true,
    website: 'https://www.paulaner.de',
    logoUrl: logo('paulaner.de'),
    description: 'True Munich tavern flair brought to the airport, with an authentically Bavarian atmosphere, traditional coziness, modern gastronomy and Paulaner beer culture, whether just passing through or making it a destination.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 6:00 a.m. - 9:00 p.m.' })],
  }),
  seafood_meets_asia: restaurant({
    name: 'Seafood meets Asia',
    cuisine: 'Seafood, Asian',
    amenity: 'restaurant',
    phone: '+49 89 975 850 40',
    description: 'Asian cuisine meets Sylt tradition — freshly baked and filled sandwiches or pasta at the counter, individually prepared Thai curry in the full-service area, prawn dishes at the bar, or Bavarian white sausages and grilled Leberkäs.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 4:30 a.m. - 10:00 p.m.' })],
  }),
  selmans_restaurant_bar: restaurant({
    name: 'Selmans Restaurant & Bar',
    cuisine: 'International, Asian',
    amenity: 'restaurant',
    phone: '+49 89 975 850 43',
    website: 'https://www.selmansrestaurant.com/?lang=en',
    logoUrl: logo('selmansrestaurant.com'),
    description: "Exclusive cuisine for discerning guests on the international departures level — freshly baked bagels and baguettes, bowls, Asian soups and dim sum, pasta and curries, exclusive salads, fresh desserts, champagne, smoothies and lassis.",
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 9:30 p.m.' })],
  }),
  sissi_franz: restaurant({
    name: 'Sissi & Franz',
    cuisine: 'Austrian, Café',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 174 33 55 219',
    description: 'Elegant dining imbued with Empress "Sissi"\'s special charisma — Habsburg-era decor with monumental, ornate architecture complemented by simple contemporary elements, clean lines and light wooden furnishings.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 5:00 a.m. - 10:00 p.m.' })],
  }),
  sissi_franz_bar: restaurant({
    name: 'Sissi & Franz Bar',
    cuisine: 'Austrian, Bar',
    amenity: 'bar',
    phone: '+49 174 33 55 219',
    description: 'The elegant imperial flair of Sissi & Franz continues here with a contemporary touch — fine wines from Germany and Austria and sparkling aperitifs, combining Viennese coffeehouse charm with an international spirit.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 8:00 a.m. - 4:30 p.m.' })],
  }),
  sportalm: restaurant({
    name: 'Sportalm',
    cuisine: 'Bavarian, Alpine',
    amenity: 'restaurant',
    vegetarian: true,
    phone: '+49 174 33 55 21 4',
    description: 'Bavarian comfort food in a relaxed, rustic setting with log cabin decor, a sun terrace and a real ski lift gondola — traditional specialties, classic pasta dishes, salads and sandwiches, plus quick take-out options.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 6:00 a.m. - 10:00 p.m.' })],
  }),
  starbucks: restaurant({
    name: 'Starbucks',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    phone: '+49 89 97 33 78 43',
    website: 'https://www.starbucks.com',
    logoUrl: logo('starbucks.com'),
    description: "Coffee just the way you like it, from iced cappuccino to traditional coffee and cake, plus high-quality teas, baked goods and other treats in a friendly, inviting atmosphere.",
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 6:00 a.m. - 9:00 p.m.' })],
  }),
  subway: restaurant({
    name: 'Subway',
    cuisine: 'Sandwiches, Fast Food',
    amenity: 'fast_food',
    phone: '+49 89 978 807 18',
    website: 'https://www.dein-subway.de',
    logoUrl: logo('subway.com'),
    description: "The world's biggest sandwich chain, with every sandwich prepared fresh as customers watch, plus chips, cookies and a selection of soft drinks.",
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'Mon-Sat 8:00 a.m. - 9:00 p.m.; Sun 9:00 a.m. - 9:00 p.m.' })],
  }),
  urban_biergarten: restaurant({
    name: 'urban Biergarten',
    cuisine: 'Bavarian',
    amenity: 'pub',
    vegetarian: true,
    glutenFree: true,
    description: 'Hand-made products following an unmistakable Bavarian-influenced trend, with around 60% of all ingredients sourced locally from Bavaria.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 8:00 a.m. - 4:00 p.m.' })],
  }),
  viktualien_stubn: restaurant({
    name: 'Viktualien Stubn',
    cuisine: 'Bavarian',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 174 33 55 219',
    description: "Bavarian way of life meets exquisite cuisine just off the satellite terminal's bright central market square, with three market stands reminiscent of Munich's iconic Viktualienmarkt and authentically Bavarian decor.",
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 5:00 a.m. - 10:00 p.m.' })],
  }),
  wieners: restaurant({
    name: "Wiener's",
    cuisine: 'Austrian, Café',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 850 21',
    description: 'A coffee house embodying Austrian lifestyle — authentic Vienna melange coffee and decadent cake, coffee specialties, soft drinks and champagne at the bar, plus a wide selection of hot and cold dishes and Austrian desserts.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 6:00 a.m. - 10:00 p.m.' })],
  }),
  four_food_street_kitchen: restaurant({
    name: '4 FOOD Street Kitchen',
    cuisine: 'Italian, Asian, Fast Food',
    amenity: 'food_court',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    halal: true,
    phone: '+49 89 975 932 90',
    description: 'International street food at five stations: Pizza Amore (Neapolitan pizza, stone-baked), PastaRossa (customizable fresh pasta), Bamee (Asian wok, curries, sushi), POMMES Freunde (fries, burgers, currywurst, halal selection) and the Münchner Wurstküche pop-up (Weißwurst and more).',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' })],
  }),
  foodji: restaurant({
    name: 'Foodji',
    cuisine: 'Healthy, Salads, Snacks',
    amenity: 'fast_food',
    website: 'https://www.foodji.com',
    logoUrl: logo('foodji.com'),
    description: 'Automated pickup stations in Terminal 2 filled with fresh food and drinks selected via touchscreen — salads by dean&david, organic charitea drinks and soups from the Munich soup kitchen. Orders can be pre-selected and reserved via the Foodji app, or bought directly at the touchscreen.',
    outlets: [
      outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 - Gates G, H (pickup kiosk)', openingHours: 'daily 24 hours', open247: true }),
      outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 – Gates K, L (pickup kiosk)', openingHours: 'daily 24 hours', open247: true }),
      outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 – Gates K, L (pickup kiosk)', openingHours: 'daily 24 hours', open247: true }),
    ],
  }),
  coffee_fellows_t2: restaurant({
    name: 'Coffee Fellows',
    cuisine: 'Café, Coffee',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    website: 'https://www.coffee-fellows.com',
    logoUrl: logo('coffee-fellows.com'),
    description: 'A place to feel at home, with baristas whipping up more than 100 coffee specialties and fresh bagels made to order, including vegetarian options.',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 5:00 p.m.' })],
  }),
  dean_david_t2: restaurant({
    name: 'dean&david',
    cuisine: 'Healthy, Salads, Bowls',
    amenity: 'fast_food',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    website: 'https://deananddavid.de/en/',
    logoUrl: logo('deananddavid.de'),
    description: 'dean&david represents freshness, quality and responsible, sustainable consumption — healthy food with high-quality ingredients, without flavour enhancers, colourings or preservatives. Gluten-free dishes are only available at the Gates B and G locations.',
    outlets: [
      outlet({ airside: 'landside', level: '04', locationNotes: 'Terminal 2 - Gates G, H', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' }),
      outlet({ airside: 'landside', level: '04', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' }),
    ],
  }),
  cucina_popolare_t2: restaurant({
    name: 'Cucina Popolare',
    cuisine: 'Italian',
    amenity: 'restaurant',
    vegetarian: true,
    description: 'Authentic Italian cuisine — freshly prepared, full of flavor, made with high-quality ingredients. This satellite-terminal location puts authentic Italian pizza center stage, from classic Margherita to Parma, baked to a golden crisp.',
    outlets: [outlet({ airside: 'airside', level: '05', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 8:00 a.m. - 4:30 p.m.' })],
  }),
  subralott_t2: restaurant({
    name: 'Subralott',
    cuisine: 'Healthy, Bavarian',
    amenity: 'fast_food',
    vegan: true,
    vegetarian: true,
    description: 'Healthy, regional, fresh, authentic, hand-made products following an unmistakable Bavarian-influenced trend, with around 60% of all ingredients sourced locally from Bavaria.',
    outlets: [outlet({ airside: 'airside', level: '04', locationNotes: 'Terminal 2 – Gates K, L', openingHours: 'daily 5:00 a.m. - 9:00 p.m.' })],
  }),
};

// ─── Munich Airport Center (landside mall between the terminals) ───────────

const macVenues = {
  airbraeu: restaurant({
    name: 'Airbräu',
    cuisine: 'Bavarian, German',
    amenity: 'pub',
    vegan: true,
    vegetarian: true,
    phone: '+49 89 975 931 11',
    website: 'https://www.airbraeu.com',
    logoUrl: logo('airbraeu.com'),
    description: "Europe's only airport brewery, serving hearty Bavarian classics like roast pork and dumplings plus international dishes in a tavern and adjoining covered beer garden, with a regular program of live entertainment.",
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Munich Airport Center', openingHours: 'daily 8:00 a.m. - 11:00 p.m.' })],
  }),
  breznsalzer: restaurant({
    name: 'Breznsalzer',
    cuisine: 'Bakery',
    amenity: 'bakery',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: 'A bakery in the center of Munich Airport with pastries, sandwiches, sweet treats and pretzels — local, fresh and always delicious, perfect for a quick break or to take away.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Munich Airport Center', openingHours: 'daily 5:30 a.m. - 10:00 p.m.' })],
  }),
  caffe_vergnano: restaurant({
    name: 'Caffè Vergnano',
    cuisine: 'Italian, Café',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 93120',
    website: 'https://www.caffevergnano.com/en/',
    logoUrl: logo('caffevergnano.com'),
    description: 'Authentic Italian coffee and snacks since 1882, with a bright modern bar area for coffee specialties to stay or go, plus a restaurant area serving Bavarian specialties, grilled meat and fish, pasta and Asian dishes throughout the day.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Munich Airport Center', openingHours: 'daily 24 hours', open247: true })],
  }),
  mcdonalds: restaurant({
    name: "McDonald's",
    cuisine: 'American, Fast Food',
    amenity: 'fast_food',
    phone: '+49 89 975 931 40',
    website: 'https://www.mcdonalds.com/de',
    logoUrl: logo('mcdonalds.com'),
    description: "Round-the-clock opening hours, an integrated McCafé lounge, a business zone and breakfast options, with 230 indoor seats plus 100 more on the terrace — Germany's only airport McDonald's with a McDrive drive-through.",
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Munich Airport Center', openingHours: 'daily 6:00 a.m. - 1:00 a.m.' })],
  }),
  segafredo: restaurant({
    name: 'Segafredo',
    cuisine: 'Italian, Café, Gelato',
    amenity: 'cafe',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    description: "A perfect spot for la dolce vita in the Munich Airport Center — perfectly brewed coffees, hearty panini, small desserts and gelato made in the airport's own gelateria, with a new featured flavor every month.",
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Munich Airport Center', openingHours: 'daily 6:00 a.m. - 7:00 p.m.' })],
  }),
  surf_and_turf: restaurant({
    name: 'Surf and Turf',
    cuisine: 'International, Sandwiches, Burgers',
    amenity: 'fast_food',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 933 30',
    description: 'A restaurant with beach feeling and surfer-world impressions — colorful, fresh, healthy and light sandwiches, salads, burgers and bowls.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Munich Airport Center', openingHours: 'daily 7:30 a.m. - 7:00 p.m.' })],
  }),
  smokey_joes: restaurant({
    name: "Smokey Joe's",
    cuisine: 'German, Sausages',
    amenity: 'fast_food',
    vegetarian: true,
    phone: '+49 174 33 55 214',
    description: 'Affectionately known as the "sausage plane", this food cart between the two terminals serves signature curry sausages — red or white, Munich, Berlin or Ruhr style — with a choice of regional beers and soft drinks.',
    outlets: [outlet({ airside: 'landside', level: '03', locationNotes: 'Outside area, Munich Airport Center', openingHours: 'daily 11:00 a.m. - 8:00 p.m.' })],
  }),
};

// ─── Airport Park: Hilton, Novotel & Gastronomiegebäude Besucherpark ───────

const parkVenues = {
  mountain_hub_gourmet: restaurant({
    name: 'Mountain Hub Gourmet',
    cuisine: 'International, Fine Dining',
    amenity: 'restaurant',
    phone: '+49 89 97 82 45 00',
    website: 'https://mountainhub.de/en/',
    logoUrl: logo('mountainhub.de'),
    description: 'A Michelin-starred restaurant at the Hilton Munich Airport offering international specialties of the highest class with regional Alpine influence.',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Hilton Munich Airport', openingHours: 'Wed-Fri 12:00 p.m. - 1:30 p.m.; Tue-Fri 6:30 p.m. - 9:00 p.m.' })],
  }),
  mountain_hub_social_dining: restaurant({
    name: 'Mountain Hub Social Dining',
    cuisine: 'International',
    amenity: 'restaurant',
    phone: '+49 89 97 82 45 00',
    website: 'https://mountainhub.de/en/',
    logoUrl: logo('mountainhub.de'),
    description: 'A casual, urban-lifestyle restaurant at the Hilton Munich Airport with modern alpine flair, classic delicacies reinterpreted creatively, and a popular changing Sunday brunch (on summer break 2 August - 19 September 2026).',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Hilton Munich Airport', openingHours: 'daily 6:00 a.m. - 10:00 a.m.; Mon-Fri 12:00 p.m. - 5:00 p.m.; daily 5:00 p.m. - 10:00 p.m.; Sun 11:30 a.m. - 2:00 p.m.' })],
  }),
  nightflight_bar: restaurant({
    name: 'Nightflight Bar',
    cuisine: 'Bar, International',
    amenity: 'bar',
    phone: '+49 89 978 20',
    website: 'https://www.hilton.com/en/hotels/muctmhi-hilton-munich-airport/',
    logoUrl: logo('hilton.com'),
    description: 'A stylish gathering spot at the Hilton Munich Airport for cocktails and spirits, bar snacks and light meals, set in the impressive glass-fronted Palm Atrium.',
    outlets: [outlet({ airside: 'landside', level: '04', locationNotes: 'Hilton Munich Airport', openingHours: 'daily 8:00 a.m. - 1:30 a.m.' })],
  }),
  tante_jus_speisenwerkstatt: restaurant({
    name: "Tante Ju’s Speisenwerkstatt",
    cuisine: 'German, Family',
    amenity: 'restaurant',
    vegan: true,
    vegetarian: true,
    glutenFree: true,
    phone: '+49 89 975 995 10',
    description: "A family restaurant with a workshop corner where kids can build things while parents dine, with a beer garden overlooking the playground, vintage aircraft and Visitors Hill. Opening hours may vary due to weather.",
    outlets: [outlet({ airside: 'landside', level: '00', locationNotes: 'Gastronomiegebäude Besucherpark', openingHours: 'daily 9:00 a.m. - 6:00 p.m.' })],
  }),
  the_flave_of_munich: restaurant({
    name: 'The Flave of Munich',
    cuisine: 'German, International',
    amenity: 'restaurant',
    phone: '+49 89 9705130',
    description: 'A bread-forward restaurant at the Novotel Munich Airport, in cooperation with regional bakery Geisenhofer — handmade, natural, local bread served with schnitzel, steak, fish or soup, plus salads, burgers, a kids’ menu and vegetarian/vegan options clearly marked on the menu. "Bella", a service robot, is also on hand.',
    outlets: [outlet({ airside: 'landside', level: '00', locationNotes: 'Novotel Munich Airport', openingHours: 'daily 10:00 a.m. - 10:00 p.m.' })],
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
  const macResult = await processTerminal(AIRPORT, MUNICH_AIRPORT_CENTER, 'Munich Airport Center', macVenues);
  const parkResult = await processTerminal(AIRPORT, AIRPORT_PARK, 'Airport Park (Hilton / Novotel / Besucherpark)', parkVenues);

  const totalUpdated = t1Result.updated + t2Result.updated + macResult.updated + parkResult.updated;
  const totalCreated = t1Result.created + t2Result.created + macResult.created + parkResult.created;
  const totalVenues = Object.keys(t1Venues).length + Object.keys(t2Venues).length + Object.keys(macVenues).length + Object.keys(parkVenues).length;

  console.log(`\nDone. Updated ${totalUpdated} existing venues, created ${totalCreated} new venue(s). Total: ${totalUpdated + totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
