'use strict';
/**
 * Fills in complete data for Mexico City International Airport / Aeropuerto
 * Internacional de la Ciudad de México "Benito Juárez" (MEX) —
 * restaurants/cafés/bars in Firestore. Researched 2026-08-18 from the airport's
 * own official site, aicm.com.mx, using Claude in Chrome browser automation per
 * explicit user instruction. No third-party/aggregator source was used for any
 * venue field.
 *
 * SOURCE: https://www.aicm.com.mx/pasajeros/servicios/prestadores-de-servicios/alimentos
 * — AICM's own "Alimentos y bebidas" (food and drink) service-provider
 * directory. It is a plain server-rendered table, paginated at ?cpage=1..17 at
 * ten rows a page, with AICM's own column headings: Subcategoría, Nombre,
 * Local, Teléfono, Horario, Terminal. All 17 pages were fetched same-origin
 * from the directory page itself and parsed from the table's own cells, not by
 * free-text regex. 170 rows.
 *
 * EXTRACTION + VERIFICATION: the rows were serialised in-page to a
 * printable-ASCII format (`@@` field delimiter) with every non-ASCII character
 * replaced by a reversible `<U+hex>` escape — MEX is the first airport in this
 * dataset whose source is not in English, so the escapes carry AICM's own
 * accents (Cafetería, Comida rápida, La Mansión, 100°C, Gino´s) losslessly —
 * and every field whitespace-normalised in the browser before checksumming,
 * split into 3 chunks under 6,600 chars on line boundaries, written into a
 * `<pre id="dataDump">` and retrieved via get_page_text. Every chunk verified
 * EXACTLY on first pass against values computed in the browser before
 * retrieval — len/lines/checksum: 6557/66/24174241, 6528/61/25408310,
 * 4504/42/17438908 — as did the rejoined 169-line dataset at len 17591,
 * checksum 67170752, using checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * LANGUAGE: the verified extract preserves AICM's own Spanish verbatim. The
 * enumerable Spanish vocabulary is translated at reconciliation, against fixed
 * tables, so that every translation stays auditable against the checksummed
 * source instead of being baked into it. Venue names are NEVER translated —
 * "La Tía Goyita", "El Fogoncito", "Tortas Don Polo", "La Cachondita Pibil"
 * and the rest stand exactly as AICM publishes them. The tables are:
 *   Levels   Planta baja → Ground Floor; Planta alta → Upper Floor;
 *            Segundo nivel → Second Level; Mezzanine → Mezzanine.
 *   Subcats  Comida rápida → "Fast food"; Comida empaquetada → "Packaged
 *            food"; Cafetería → "Café"; Restaurante bar → "Restaurant bar";
 *            Bares y cafeterías → "Bars and cafés".
 *   Hours    día names (lunes…domingo, plural and abbreviated forms), the
 *            connectors "a"/"de"/"las"/"y", "horas"/"hrs"/"HRAS", and the two
 *            idioms "las 24:00 horas" and "24 HORAS TODOS LOS DÍAS DE LA
 *            SEMANA". Clock times are never altered. The bare "24:00 HRS"
 *            collapse is anchored to the whole string so that a closing time
 *            inside a range ("de 05:00 a 24:00 hrs") is left intact.
 * AICM'S OWN TYPO PRESERVED: one record's hours read "SABABADOS" for
 * "SÁBADOS". It is outside the translation vocabulary and is carried through
 * as the airport publishes it rather than silently corrected.
 *
 * TERMINAL STRUCTURE — 2 buckets (Terminal 1 and Terminal 2). AICM's own
 * directory files every dining venue under one of exactly two terminal values,
 * T1 or T2, and publishes no other. The two are separate buildings roughly
 * 3 km apart, each with its own check-in halls and its own security filters,
 * with no post-security connection between them — the Aerotrén that links them
 * airside is restricted to connecting passengers of specific airlines and does
 * not make the two one zone for a departing passenger. Each therefore passes
 * this dataset's "own check-in AND own security" test independently. Applying
 * the test WITHIN a terminal produces no further split: AICM's own level
 * values (Planta baja / Planta alta / Segundo nivel / Mezzanine) are floors of
 * one building, not independently-screened piers.
 *
 * SCOPE — 3 of the 170 rows EXCLUDED, all on AICM's own words: two whose
 * tenant name is the airport's own placeholder "NO APLICA" ("not applicable")
 * and one, Crepes & Crepes at T1 unit NA145, whose published hours are "Sin
 * operar" ("not operating"). Nothing was invented to fill them. Separately,
 * AICM publishes one venue twice — Fly By Wings at T1 unit NB7, identical in
 * every field except phone punctuation ("2599-1504" vs "2599 1504") — and that
 * pair was collapsed to one record under a narrow rule (same name + same unit +
 * same terminal + same hours). 170 rows → 169 after the collapse → 166 in scope.
 *
 * AIRSIDE / LANDSIDE: BLANK on every outlet, and this is the notable gap at
 * MEX. AICM's directory publishes a terminal and a floor but NO security-zone
 * information of any kind — there is no "antes/después de filtros" column and
 * no equivalent tag anywhere in the table. Rather than infer a zone from the
 * floor (T1's Planta alta holds both landside and airside concessions, so that
 * inference would be wrong for a large share of the file) the field is left
 * empty. It is empty because the airport does not publish it.
 *
 * LEVEL: AICM's own floor, translated per the table above.
 *
 * LOCATION_NOTES: each venue's own `Local` unit code verbatim — "A-47", "NB7",
 * "PASUES10", "MZ13", "TS22", "01.TT-02, 01.TT-03 Y 01.TT-04". This is the
 * airport's own addressing for the unit and is the most specific location it
 * publishes. Left BLANK for the records whose Local is AICM's own placeholder
 * "S/N" (sin número, "no number") or "NA".
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal are merged
 * into one doc with one `outlets[]` entry per unit; same-brand venues in
 * DIFFERENT terminals stay separate docs, per this dataset's standing rule. MEX
 * merges heavily — its directory lists each unit separately, so Starbucks
 * Coffee becomes one T1 doc and one T2 doc rather than fourteen records, and
 * 7 Eleven, Wings, La Taba, Carls Jr, Krispy Kreme, El Gran Pastor, Chilim
 * Balam, Subway, Sbarro and Garabatos all fold the same way. Brand matching is
 * case- and apostrophe-insensitive, which is what folds AICM's mixed casing
 * ("STARBUCKS COFFEE" ≡ "Starbucks Coffee", "WINGS" ≡ "Wings", "LA TABA" ≡
 * "La Taba", "MC DONALDS" ≡ "Mc Donalds", "POXO" ≡ "Poxo"), plus two
 * documented aliases: "SUBWAY INTERNATIONAL B.V." ≡ "Subway" (AICM records the
 * corporate entity on one unit) and "KERICO" ≡ "Ke Rico". Distinctly NAMED
 * venues are kept separate per this dataset's page-truth-over-label precedent,
 * even where they plainly share an operator: "La Taba" vs "La Taba Express" vs
 * "La Taba Sport Bar"; "Salute" vs "Salute Mx"; "PRONTO GINOS" vs "Gino´s";
 * "El Café Bar" vs "Snack Bar". 166 records → 102 docs.
 *
 * CUISINE: AICM's own Subcategoría, in the English rendering given above. It
 * is the only classification the airport publishes for these venues — there is
 * no cuisine, genre or dietary tag anywhere in the table — so it is what
 * `cuisine` carries. Where merged outlets were filed under different
 * subcategories (AICM does this for a few brands, e.g. Krispy Kreme filed as
 * Cafetería on one unit and Comida rápida on another), the union is used,
 * first-seen order preserved.
 *
 * AMENITY: taken from AICM's own Subcategoría — "Comida rápida" and "Comida
 * empaquetada" → `fast_food`, "Cafetería" → `cafe`, "Restaurante bar" →
 * `restaurant`, "Bares y cafeterías" → `bar`. Per this dataset's standing rule
 * a `bar` is then verified against the venue's own name: a "Restaurante bar"
 * whose name says Bar / Cantina / Taberna / Pub / Sport Bar / Terraza is
 * promoted to `bar` (La Taba Sport Bar and Terraza Mx, both Terminal 2), and a
 * "Bares y cafeterías" venue whose name says only a food format would be
 * demoted to `restaurant` — no venue trips that second test, since the one
 * record AICM files under that subcategory is "DINO SNACK BAR & FAST FOOD",
 * whose own name does say Bar. Resulting mix across the 166 records: 95
 * fast_food, 38 restaurant, 30 cafe, 3 bar. Note that "Comida empaquetada"
 * ("packaged food") is AICM's category for its convenience stores — OXXO,
 * 7 Eleven, Círculo K — which is why they appear here at all and why they are
 * `fast_food` rather than a shop category; the airport itself files them under
 * food and drink.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: blank on every doc. AICM
 * publishes no dietary tag of any kind.
 *
 * DESCRIPTION: blank on every doc. AICM's directory publishes no description
 * for any venue.
 *
 * OPENING HOURS / 24-7: `opening_hours` is each venue's own Horario, translated
 * per the table above and otherwise unaltered — including AICM's own
 * inconsistencies of form ("Monday to Sunday 06:00 to 22:00 hrs",
 * "06:00:00 to 22:00", "Monday to Sunday 7:00 - 21:00 hrs", and one unit whose
 * hours describe two units at once: "IS-08 24HRS and IS-07 05:00 to 23:00
 * hrs"). Published on all 166 in-scope records. `open_24_7` is set where the
 * translated string is a bare round-the-clock statement ("24 hrs", "Monday to
 * Sunday 24 hrs", "24 hrs every day of the week") — 57 outlets.
 *
 * PHONE: each venue's own Teléfono verbatim, never regex-scraped. AICM's own
 * formatting and its multi-number entries are preserved as published —
 * "2599-1159", "55-4866-1298", "25-99-13-35", "5281-3310, 5523-1111 y
 * 5536-1881", "3003-3300 Ext. 8460" and "52-63-75-60 EXT. 1038 Y 1030
 * 044-55-34-55-52-96" all appear in AICM's table exactly as written here.
 * Two venues are published with no number and one with the placeholder "S/N";
 * those get a blank phone.
 *
 * WEBSITE / LOGO: AICM's directory carries no website field. Following this
 * dataset's KUL precedent, `website` (and the logo.dev logo derived from it) is
 * set only for globally or nationally recognisable chains whose primary domain
 * is confidently known — 46 of the 102 docs — and left blank for every other
 * independent concept ("La Tía Goyita", "Xocolia", "Poxo", "Ke Rico", "La
 * Cachondita Pibil", "Tasca Don Quino", "Semillero" and the rest) rather than
 * guessed.
 *
 * VERIFIED TOTALS: 170 source rows − 1 duplicate − 3 out of scope = 166 → 102
 * restaurant docs / 166 outlets. Terminal 1: 106 records → 65 docs / 106
 * outlets. Terminal 2: 60 → 37 / 60.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['mex', 'mexico-city', 'benito-juarez'];
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


// ─── Terminal 1 ───

const terminal1Venues = {
  '100_natural': restaurant({
    name: "100% Natural", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-0019",
    website: "100natural.com", logoUrl: logo("100natural.com"),
    outlets: [
      o("Upper Floor", "NB10", "", "Monday to Sunday 05:00 to 22:00 hrs"),
    ],
  }),
  '7_eleven': restaurant({
    name: "7 Eleven", cuisine: "Packaged food", amenity: "fast_food",
    phone: "52-63-75-60 EXT. 1038 Y 1030 044-55-34-55-52-96",
    website: "7-eleven.com", logoUrl: logo("7-eleven.com"),
    outlets: [
      o("Upper Floor", "1", "", "24 hrs", true),
      o("Ground Floor", "20", "", "24 hrs", true),
      o("Ground Floor", "A-155", "", "24 hrs", true),
      o("Upper Floor", "NB26", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  asador_bariloche: restaurant({
    name: "ASADOR BARILOCHE", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "2599-1343",
    outlets: [
      o("Ground Floor", "NA-N7", "", "09:00 to 21:30 hrs"),
    ],
  }),
  bistrot_mosaico: restaurant({
    name: "BISTROT MOSAICO", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5081-6150",
    outlets: [
      o("Upper Floor", "67 A", "", "Monday to Saturday 06:00 to 23:30 hrs, Sundays 06:00 to 23:00 hrs"),
    ],
  }),
  cafe_punta_del_cielo: restaurant({
    name: "CAFE PUNTA DEL CIELO", cuisine: "Café", amenity: "cafe",
    phone: "55-1757-2430",
    website: "puntadelcielo.com.mx", logoUrl: logo("puntadelcielo.com.mx"),
    outlets: [
      o("Ground Floor", "A-17", "", "06:00 to 22:00 hrs"),
    ],
  }),
  candy_gold: restaurant({
    name: "Candy Gold", cuisine: "Packaged food", amenity: "fast_food",
    phone: "2599-0470",
    outlets: [
      o("Upper Floor", "NB 32B", "", "Monday to Sunday 10:00 to 18:00 hrs"),
    ],
  }),
  casa_avila: restaurant({
    name: "CASA AVILA", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5081-6150",
    outlets: [
      o("Second Level", "47", "", "07:00 to 23:00 hrs"),
    ],
  }),
  chilim_balam: restaurant({
    name: "Chilim Balam", cuisine: "Packaged food", amenity: "fast_food",
    phone: "5952-2761",
    outlets: [
      o("Upper Floor", "NB45", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  chilis_vips_y_starbucks: restaurant({
    name: "Chilis, Vips y Starbucks", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5241-7033",
    outlets: [
      o("Upper Floor", "NB61", "", "Monday to Sunday 07:00 to 22:00 hrs"),
    ],
  }),
  cinnabon: restaurant({
    name: "CINNABON", cuisine: "Café", amenity: "cafe",
    phone: "5786-9023",
    website: "cinnabon.com", logoUrl: logo("cinnabon.com"),
    outlets: [
      o("Ground Floor", "A-89", "", "24 hrs Monday to Sunday"),
    ],
  }),
  circulo_k: restaurant({
    name: "CIRCULO K", cuisine: "Packaged food", amenity: "fast_food",
    phone: "2599-1159",
    website: "circlek.com", logoUrl: logo("circlek.com"),
    outlets: [
      o("Ground Floor", "A-47", "", "24 hrs Monday to Sunday"),
      o("Ground Floor", "A-91", "", "24 hrs Monday to Sunday"),
      o("Upper Floor", "NA-17D2", "", "24 hrs", true),
    ],
  }),
  cucara_macara: restaurant({
    name: "CUCARA MACARA", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5081-6150",
    outlets: [
      o("Second Level", "25", "", "06:30 to 23:30 hrs"),
    ],
  }),
  deli_cia_daily_smart_food: restaurant({
    name: "DELI&CIA DAILY SMART FOOD", cuisine: "Restaurant bar, Packaged food", amenity: "restaurant",
    phone: "55-3130-5280",
    outlets: [
      o("Upper Floor", "9-A", "", "24 hrs", true),
      o("Upper Floor", "", "", "24 hrs", true),
    ],
  }),
  dino_snack_bar_fast_food: restaurant({
    name: "DINO SNACK BAR & FAST FOOD", cuisine: "Bars and cafés", amenity: "bar",
    phone: "5786-9495",
    outlets: [
      o("Upper Floor", "R2-A", "", "24 hrs", true),
    ],
  }),
  dotcom: restaurant({
    name: "DOTCOM", cuisine: "Café", amenity: "cafe",
    phone: "2599-0453",
    outlets: [
      o("Upper Floor", "13 Y 14", "", "24 hrs", true),
    ],
  }),
  el_alcatraz: restaurant({
    name: "El Alcatraz", cuisine: "Fast food", amenity: "fast_food",
    phone: "2163-3550",
    outlets: [
      o("Upper Floor", "NB27", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  el_cafe_bar: restaurant({
    name: "El Café Bar", cuisine: "Fast food", amenity: "fast_food",
    phone: "5784-8335",
    outlets: [
      o("Upper Floor", "NB36", "", "Monday to Sunday 04:00 to 21:30 hrs"),
      o("Upper Floor", "NB3", "", "Monday to Sunday 04:30 to 21:30 hrs"),
    ],
  }),
  el_fogoncito: restaurant({
    name: "El Fogoncito", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-0457",
    website: "elfogoncito.mx", logoUrl: logo("elfogoncito.mx"),
    outlets: [
      o("Upper Floor", "1", "", "24 hrs", true),
      o("Upper Floor", "NB30", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  el_globo: restaurant({
    name: "El Globo", cuisine: "Café", amenity: "cafe",
    phone: "2599-0312",
    website: "elglobo.com.mx", logoUrl: logo("elglobo.com.mx"),
    outlets: [
      o("Ground Floor", "NA-143", "", "24 hrs Monday to Sunday"),
      o("Upper Floor", "NB14", "", "Monday to Sunday 05:00 to 22:00 hrs"),
    ],
  }),
  el_gran_pastor: restaurant({
    name: "El Gran Pastor", cuisine: "Packaged food", amenity: "fast_food",
    phone: "5786- 9372",
    outlets: [
      o("Ground Floor", "NA-146", "", "6:00 to 22:00 hrs Mon to Sun"),
      o("Upper Floor", "NB34", "", "Monday to Sunday 6:00 to 22:00 hrs"),
    ],
  }),
  fly_by_wings: restaurant({
    name: "Fly By Wings", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1504",
    outlets: [
      o("Upper Floor", "NB7", "", "Monday to Sunday 09:00 to 21:30 hrs"),
    ],
  }),
  garabatos: restaurant({
    name: "Garabatos", cuisine: "Café, Fast food", amenity: "cafe",
    phone: "4170-4499",
    website: "garabatos.com.mx", logoUrl: logo("garabatos.com.mx"),
    outlets: [
      o("Ground Floor", "NA-144", "", "10:00 to 19:00 hrs"),
      o("Upper Floor", "NB9A", "", "Monday to Sunday 06:30 to 22:00 hrs"),
    ],
  }),
  gloria_jeans_coffees: restaurant({
    name: "GLORIA JEAN´S COFFEES", cuisine: "Café", amenity: "cafe",
    phone: "5661-2269",
    website: "gloriajeans.com", logoUrl: logo("gloriajeans.com"),
    outlets: [
      o("Upper Floor", "SUES SN-03", "", "06:00 to 12:00 hrs"),
    ],
  }),
  helados_santa_clara: restaurant({
    name: "HELADOS SANTA CLARA", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1520",
    website: "santaclara.com.mx", logoUrl: logo("santaclara.com.mx"),
    outlets: [
      o("Ground Floor", "01.A-77", "", "07:00 to 21:00 hrs"),
    ],
  }),
  italiannis: restaurant({
    name: "ITALIANNIS", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "75-83-34-61",
    website: "italiannis.com.mx", logoUrl: logo("italiannis.com.mx"),
    outlets: [
      o("Upper Floor", "ONA A-11", "", "Monday to Saturday 06:00 to 23:00 hrs, Sunday 07:00 to 22:00 hrs"),
    ],
  }),
  juan_valdez_cafe: restaurant({
    name: "JUAN VALDEZ CAFE", cuisine: "Café", amenity: "cafe",
    phone: "9127 0457",
    website: "juanvaldezcafe.com", logoUrl: logo("juanvaldezcafe.com"),
    outlets: [
      o("Upper Floor", "19", "", "24 hrs", true),
    ],
  }),
  ke_rico: restaurant({
    name: "Ke Rico", cuisine: "Fast food, Packaged food", amenity: "fast_food",
    phone: "2599-1572",
    outlets: [
      o("Upper Floor", "NB5", "", "Monday to Sunday 05:00 to 22:00 hrs"),
      o("Upper Floor", "SUESN-06", "", "24 hrs Monday to Sunday"),
    ],
  }),
  krispy_kreme: restaurant({
    name: "Krispy Kreme", cuisine: "Café, Fast food", amenity: "cafe",
    phone: "2599-1140",
    website: "krispykreme.com", logoUrl: logo("krispykreme.com"),
    outlets: [
      o("Ground Floor", "A-57", "", "Monday to Sunday 24 hrs", true),
      o("Upper Floor", "F-03", "", "24 hrs", true),
      o("Upper Floor", "NB28", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  la_baguetelle: restaurant({
    name: "La Baguetelle", cuisine: "Fast food", amenity: "fast_food",
    phone: "5786-9044",
    outlets: [
      o("Upper Floor", "NB 1", "", "Monday-Sunday 24 hrs"),
      o("Upper Floor", "NB2", "", "Monday-Sunday 24 hrs"),
    ],
  }),
  la_buena_tierra: restaurant({
    name: "LA BUENA TIERRA", cuisine: "Fast food", amenity: "fast_food",
    phone: "5571-1678",
    website: "labuenatierra.com.mx", logoUrl: logo("labuenatierra.com.mx"),
    outlets: [
      o("Upper Floor", "5", "", "24 hrs", true),
    ],
  }),
  la_mansion: restaurant({
    name: "LA MANSION", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "50816150",
    website: "lamansion.com.mx", logoUrl: logo("lamansion.com.mx"),
    outlets: [
      o("Upper Floor", "3", "", "07:00 to 23:00 hrs"),
    ],
  }),
  la_taba: restaurant({
    name: "La Taba", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "2599-1053",
    outlets: [
      o("Upper Floor", "NB16", "", "Monday to Sunday 07:00 to 23:00 hrs"),
      o("Upper Floor", "NB17", "", "Monday to Sunday 07:00 to 23:00 hrs"),
      o("Upper Floor", "NB18", "", "Monday to Sunday 07:00 to 23:00 hrs"),
      o("Upper Floor", "SUESIS-07", "", "IS-08 24HRS and IS-07 05:00 to 23:00 hrs"),
      o("Upper Floor", "SUESIS08", "", "IS-08 24HRS and IS-07 05:00 to 23:00 hrs"),
    ],
  }),
  la_tia_goyita: restaurant({
    name: "LA TIA GOYITA", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1571",
    outlets: [
      o("Upper Floor", "10", "", "Sunday to Friday 24 hrs and Saturday 7:00 AM to 11:00 PM"),
    ],
  }),
  las_juanas_torteria: restaurant({
    name: "LAS JUANAS TORTERIA", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1271",
    outlets: [
      o("Upper Floor", "2-A", "", "24 hrs", true),
    ],
  }),
  maison_kayser: restaurant({
    name: "MAISON KAYSER", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1390",
    website: "maison-kayser.com", logoUrl: logo("maison-kayser.com"),
    outlets: [
      o("Upper Floor", "", "", "24 hrs", true),
    ],
  }),
  mc_donalds: restaurant({
    name: "Mc Donalds", cuisine: "Fast food", amenity: "fast_food",
    phone: "3003-3300 Ext. 8460",
    website: "mcdonalds.com", logoUrl: logo("mcdonalds.com"),
    outlets: [
      o("Upper Floor", "NB23", "", "Monday to Sunday 07:00 to 22:00 hrs"),
      o("Upper Floor", "SUBANCLA 2", "", "24 hrs", true),
    ],
  }),
  na: restaurant({
    name: "Na", cuisine: "Fast food", amenity: "fast_food",
    phone: "5784-3260",
    outlets: [
      o("Upper Floor", "NB38", "", "Monday to Sunday 06:00 to 21:30 hrs"),
      o("Upper Floor", "NB4", "", "Monday to Sunday 05:00 to 22:00 hrs"),
    ],
  }),
  nagaoka: restaurant({
    name: "Nagaoka", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "55-8487-5356",
    outlets: [
      o("Upper Floor", "F-54", "", "Monday to Sunday 07:00 to 22:30 hrs"),
    ],
  }),
  nutrisa: restaurant({
    name: "NUTRISA", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-0451",
    website: "nutrisa.com", logoUrl: logo("nutrisa.com"),
    outlets: [
      o("Ground Floor", "A-25", "", "Monday to Sunday 10:00 to 21:00 hrs"),
    ],
  }),
  oxxo: restaurant({
    name: "OXXO", cuisine: "Packaged food", amenity: "fast_food",
    phone: "2599-1167",
    website: "oxxo.com", logoUrl: logo("oxxo.com"),
    outlets: [
      o("Ground Floor", "17", "", "24 hrs", true),
      o("Ground Floor", "A-157", "", "24 hrs", true),
      o("Ground Floor", "A-19", "", "24 hrs", true),
      o("Upper Floor", "F-89", "", "24 hrs", true),
    ],
  }),
  pasion_del_cielo: restaurant({
    name: "PASION DEL CIELO", cuisine: "Café", amenity: "cafe",
    phone: "2529-1505",
    website: "pasiondelcielo.com", logoUrl: logo("pasiondelcielo.com"),
    outlets: [
      o("Upper Floor", "A-129", "", "06:00 to 23:00 hrs SABABADOS 07:00 to 21:00 hrs and Sundays 08:00 to 20:00 hrs"),
      o("Ground Floor", "E-52", "", "Monday-Friday 06:00 to 23:00 hrs, Saturday 07:00 to 21:00 and Sunday 08:00 to 20:00 hrs"),
    ],
  }),
  picard: restaurant({
    name: "Picard", cuisine: "Fast food", amenity: "fast_food",
    phone: "5044-7413",
    website: "picard.fr", logoUrl: logo("picard.fr"),
    outlets: [
      o("Upper Floor", "NB44", "", "Monday to Sunday 07:00 to 21:00 hrs"),
    ],
  }),
  pick_joy: restaurant({
    name: "PICK & JOY", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1386",
    outlets: [
      o("Upper Floor", "TT-01", "", "7:00 to 22:00"),
    ],
  }),
  pizza_bar: restaurant({
    name: "Pizza Bar", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-1337",
    outlets: [
      o("Upper Floor", "SUESNS22", "", "Monday to Sunday 06:00 to 23:00 hrs"),
    ],
  }),
  poxo: restaurant({
    name: "POXO", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-0043",
    outlets: [
      o("Upper Floor", "3 Y 4", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  pronto_ginos: restaurant({
    name: "PRONTO GINOS", cuisine: "Fast food, Café", amenity: "fast_food",
    phone: "5081-6150",
    outlets: [
      o("Upper Floor", "15 Y 16", "", "06:30 to 23:00 hrs"),
      o("Upper Floor", "19 BIS", "", "24 hrs", true),
      o("Upper Floor", "5-A", "", "24 hrs", true),
    ],
  }),
  restotal: restaurant({
    name: "RESTOTAL", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5281-2133 Y 5281-2201",
    outlets: [
      o("Ground Floor", "A-12", "", "08:00 to 23:00 hrs"),
      o("Ground Floor", "A-13 AL A-16", "", "24 hrs", true),
    ],
  }),
  rock_wok: restaurant({
    name: "ROCK & WOK", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1611",
    outlets: [
      o("Upper Floor", "2", "", "24 hrs", true),
    ],
  }),
  sala_21: restaurant({
    name: "SALA 21", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5081-6150",
    outlets: [
      o("Upper Floor", "44", "", "24 hrs", true),
    ],
  }),
  salute: restaurant({
    name: "SALUTE", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1509",
    outlets: [
      o("Upper Floor", "11 Y 12", "", "24 hrs", true),
    ],
  }),
  sbarro: restaurant({
    name: "Sbarro", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1274",
    website: "sbarro.com", logoUrl: logo("sbarro.com"),
    outlets: [
      o("Upper Floor", "10", "", "24 hrs", true),
      o("Upper Floor", "NB10A", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  semillero: restaurant({
    name: "SEMILLERO", cuisine: "Fast food", amenity: "fast_food",
    phone: "55-4766-7111",
    outlets: [
      o("Upper Floor", "01.G-01", "", "06:00:00 to 22:00"),
    ],
  }),
  snack_bar: restaurant({
    name: "Snack Bar", cuisine: "Fast food", amenity: "fast_food",
    phone: "5762-2194",
    outlets: [
      o("Upper Floor", "NB37", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Café", amenity: "cafe",
    phone: "7583-3461",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Ground Floor", "A-83", "", "24 hrs", true),
      o("Upper Floor", "F-06", "", "24 hrs", true),
      o("Upper Floor", "NA N-12a", "", "24 hrs", true),
      o("Upper Floor", "NB12", "", "Monday to Sunday 07:00 to 22:00 hrs"),
      o("Upper Floor", "NB13A", "", "Monday to Sunday 07:00 to 22:00 hrs"),
      o("Upper Floor", "", "", "24 hrs", true),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-0060",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("Upper Floor", "5-B", "", "Monday to Sunday 06:00 to 23:00 hrs"),
      o("Upper Floor", "8", "", "Monday to Sunday 06:00 to 23:00 hrs"),
      o("Upper Floor", "NB11", "", "Monday to Sunday 06:00 to 23:00 hrs"),
    ],
  }),
  sushi_roll: restaurant({
    name: "SUSHI ROLL", cuisine: "Fast food", amenity: "fast_food",
    phone: "25-99-13-35",
    website: "sushiroll.com.mx", logoUrl: logo("sushiroll.com.mx"),
    outlets: [
      o("Upper Floor", "6", "", "24 hrs", true),
    ],
  }),
  tacanon: restaurant({
    name: "TACAÑON", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-0401",
    outlets: [
      o("Upper Floor", "3", "", "24 hrs every day of the week", true),
    ],
  }),
  taco_beef: restaurant({
    name: "Taco Beef", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "2599-1325",
    outlets: [
      o("Upper Floor", "NB 13", "", "Monday to Sunday 08:00 to 22:00 hrs"),
    ],
  }),
  taco_inn: restaurant({
    name: "TACO INN", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1548",
    website: "tacoinn.com.mx", logoUrl: logo("tacoinn.com.mx"),
    outlets: [
      o("Upper Floor", "7", "", "Monday to Sunday 05:00 to 02:00 hrs"),
    ],
  }),
  tasca_don_quino: restaurant({
    name: "Tasca Don Quino", cuisine: "Fast food", amenity: "fast_food",
    phone: "5786-9045",
    outlets: [
      o("Upper Floor", "NB29", "", "Monday to Sunday 06:00 to 21:00 hrs"),
    ],
  }),
  tere_cazola: restaurant({
    name: "Tere Cazola", cuisine: "Packaged food", amenity: "fast_food",
    phone: "99 9930 0730",
    website: "terecazola.com", logoUrl: logo("terecazola.com"),
    outlets: [
      o("Upper Floor", "210T1", "", "Monday to Saturday 7:30 to 22:00 hrs and Sundays 9:00 to 21:00 hrs"),
    ],
  }),
  the_urban_deli_cafe: restaurant({
    name: "THE URBAN DELI & CAFE", cuisine: "Fast food", amenity: "fast_food",
    phone: "55-1757-2430",
    outlets: [
      o("Upper Floor", "2", "", "24 hrs", true),
    ],
  }),
  urban_corner: restaurant({
    name: "URBAN CORNER", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "55-4866-1298",
    outlets: [
      o("Upper Floor", "F-50", "", "24 hrs", true),
    ],
  }),
  wings: restaurant({
    name: "Wings", cuisine: "Restaurant bar, Fast food", amenity: "restaurant",
    phone: "2599-1176",
    website: "wingsrestaurants.com.mx", logoUrl: logo("wingsrestaurants.com.mx"),
    outlets: [
      o("Ground Floor", "31", "", "24 hrs", true),
      o("Ground Floor", "NA-94", "", "Monday to Sunday 24 hrs", true),
      o("Ground Floor", "NA132", "", "Monday to Sunday 24 hrs", true),
      o("Upper Floor", "NB08", "", "Monday to Sunday 00:00 to 24:00 hrs"),
      o("Upper Floor", "NB39", "", "Monday to Sunday 00:00 to 24:00 hrs"),
      o("Upper Floor", "NMZ1", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  xocolia: restaurant({
    name: "XOCOLIA", cuisine: "Fast food", amenity: "fast_food",
    phone: "2599-1589",
    outlets: [
      o("Upper Floor", "11", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
};

// ─── Terminal 2 ───

const terminal2Venues = {
  '100_c_fresco_y_mexicano': restaurant({
    name: "100°C Fresco y Mexicano", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0176",
    outlets: [
      o("Upper Floor", "TS13", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  '7_eleven': restaurant({
    name: "7 Eleven", cuisine: "Packaged food", amenity: "fast_food",
    phone: "5263-7560",
    website: "7-eleven.com", logoUrl: logo("7-eleven.com"),
    outlets: [
      o("Ground Floor", "ALL47", "", "Monday to Sunday 24 hrs", true),
      o("Upper Floor", "AS03", "", "Monday to Sunday 24 hrs", true),
      o("Upper Floor", "AS04", "", "Monday to Sunday 24 hrs", true),
      o("Upper Floor", "PASUES08", "", "Monday to Sunday 24 hrs", true),
      o("Upper Floor", "PASUES09", "", "Monday to Sunday 24 hrs", true),
      o("Upper Floor", "TS49", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  alfajores: restaurant({
    name: "Alfajores", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "2598-3423",
    outlets: [
      o("Mezzanine", "MZ-02", "", "Monday to Sunday 05:00 to 23:00 hrs"),
    ],
  }),
  carls_jr: restaurant({
    name: "Carls Jr", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-1491",
    website: "carlsjr.com", logoUrl: logo("carlsjr.com"),
    outlets: [
      o("Ground Floor", "ALL15B", "", "Monday to Sunday 06:00 to 22:30 hrs"),
      o("Upper Floor", "TS07", "", "Monday to Sunday 06:00 to 22:30 hrs"),
      o("Upper Floor", "TS08", "", "Monday to Sunday 06:00 to 22:30 hrs"),
      o("Upper Floor", "TS09", "", "Monday to Sunday 06:00 to 22:30 hrs"),
    ],
  }),
  casa_avila: restaurant({
    name: "Casa Avila", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "4313-0287",
    outlets: [
      o("Ground Floor", "LLN19", "", "Monday to Sunday 07:00 to 01:00 hrs"),
    ],
  }),
  chilim_balam: restaurant({
    name: "Chilim Balam", cuisine: "Packaged food", amenity: "fast_food",
    phone: "1082-4248",
    outlets: [
      o("Upper Floor", "AS16", "", "Monday to Sunday 06:00 to 22:00 hrs"),
      o("Upper Floor", "PASUES03", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  chillis: restaurant({
    name: "Chillis", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "4313 0288",
    website: "chilis.com.mx", logoUrl: logo("chilis.com.mx"),
    outlets: [
      o("Mezzanine", "MZ15", "", "Monday to Sunday 05:00 to 22:00 hrs"),
    ],
  }),
  china_king: restaurant({
    name: "China King", cuisine: "Fast food", amenity: "fast_food",
    phone: "5561-1673",
    outlets: [
      o("Upper Floor", "TS15", "", "Monday to Sunday 09:00 to 21:00 hrs"),
    ],
  }),
  cup_stop: restaurant({
    name: "Cup Stop", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-1371",
    outlets: [
      o("Upper Floor", "TS17", "", "Monday to Sunday 7:00 - 21:00 hrs"),
    ],
  }),
  el_fogoncito: restaurant({
    name: "El Fogoncito", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0307",
    website: "elfogoncito.mx", logoUrl: logo("elfogoncito.mx"),
    outlets: [
      o("Ground Floor", "TT01", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  el_globo: restaurant({
    name: "El Globo", cuisine: "Café", amenity: "cafe",
    phone: "4313-1498",
    website: "elglobo.com.mx", logoUrl: logo("elglobo.com.mx"),
    outlets: [
      o("Upper Floor", "TS12", "", "Monday to Sunday 05:00 to 22:00 hrs"),
    ],
  }),
  el_gran_pastor: restaurant({
    name: "El Gran Pastor", cuisine: "Packaged food", amenity: "fast_food",
    phone: "4313-1330",
    outlets: [
      o("Ground Floor", "ALL53", "", "Monday to Sunday 06:00 to 22:00 hrs"),
      o("Upper Floor", "AS09", "", "Monday to Sunday 06:00 to 22:00 hrs"),
      o("Upper Floor", "PASUES07", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  farolito: restaurant({
    name: "Farolito", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0193",
    outlets: [
      o("Upper Floor", "TS24", "", "Monday to Sunday 06:00 to 22:00 hrs"),
    ],
  }),
  garabatos: restaurant({
    name: "Garabatos", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-1497",
    website: "garabatos.com.mx", logoUrl: logo("garabatos.com.mx"),
    outlets: [
      o("Upper Floor", "TS19", "", "Monday to Sunday 06:30 to 22:00 hrs"),
    ],
  }),
  ginos: restaurant({
    name: "Gino´s", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "4313-0351",
    outlets: [
      o("Ground Floor", "LLN08", "", "Monday to Sunday 07:00 to 24:00 hrs"),
    ],
  }),
  kerico: restaurant({
    name: "KERICO", cuisine: "Packaged food", amenity: "fast_food",
    phone: "4313-1465",
    outlets: [
      o("Upper Floor", "PASUES22", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  krispy_kreme: restaurant({
    name: "Krispy Kreme", cuisine: "Fast food", amenity: "fast_food",
    phone: "4113-0199",
    website: "krispykreme.com", logoUrl: logo("krispykreme.com"),
    outlets: [
      o("Upper Floor", "AS10", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  la_cachondita_pibil: restaurant({
    name: "La Cachondita Pibil", cuisine: "Fast food", amenity: "fast_food",
    outlets: [
      o("Upper Floor", "TS14", "", "Monday-Sunday 24 hrs"),
    ],
  }),
  la_mansion: restaurant({
    name: "La Mansión", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "2598-3472",
    website: "lamansion.com.mx", logoUrl: logo("lamansion.com.mx"),
    outlets: [
      o("Ground Floor", "LLN20", "", "Monday to Sunday 07:00 to 01:00 hrs"),
    ],
  }),
  la_taba_express: restaurant({
    name: "La Taba Express", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "2598-3557",
    outlets: [
      o("Upper Floor", "SUESNS14", "", "Monday to Sunday 05:00 to 22:00 hrs"),
    ],
  }),
  la_taba_sport_bar: restaurant({
    name: "La Taba Sport Bar", cuisine: "Restaurant bar", amenity: "bar",
    phone: "5662-3165 ext 16",
    outlets: [
      o("Upper Floor", "PASUES01A", "", "Monday to Sunday 05:00 to 22:00 hrs"),
    ],
  }),
  la_vieja_molienda: restaurant({
    name: "La Vieja Molienda", cuisine: "Café", amenity: "cafe",
    phone: "4313-1427",
    outlets: [
      o("Upper Floor", "TS11", "", "Monday to Sunday 06:00 to 22:30 hrs"),
    ],
  }),
  maison_kayser: restaurant({
    name: "Maison Kayser", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "4313-1373",
    website: "maison-kayser.com", logoUrl: logo("maison-kayser.com"),
    outlets: [
      o("Upper Floor", "AS01", "", "Monday to Sunday 07:00 to 22:00 hrs"),
      o("Upper Floor", "SUESIS20", "", "Monday to Sunday 07:00 to 22:00 hrs"),
    ],
  }),
  oxxo: restaurant({
    name: "OXXO", cuisine: "Packaged food", amenity: "fast_food",
    phone: "4313-1474",
    website: "oxxo.com", logoUrl: logo("oxxo.com"),
    outlets: [
      o("Ground Floor", "ALL09", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  potzollcalli: restaurant({
    name: "Potzollcalli", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0182",
    website: "potzollcalli.com.mx", logoUrl: logo("potzollcalli.com.mx"),
    outlets: [
      o("Upper Floor", "TS22", "", "Monday to Sunday 06:00 to 23:00 hrs"),
    ],
  }),
  poxo: restaurant({
    name: "Poxo", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0211",
    outlets: [
      o("Upper Floor", "TS21", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  quiznoz_sub: restaurant({
    name: "Quiznoz Sub", cuisine: "Fast food", amenity: "fast_food",
    phone: "2598-3424",
    website: "quiznos.com", logoUrl: logo("quiznos.com"),
    outlets: [
      o("Upper Floor", "TS20", "", "Monday to Sunday 06:00 to 22:30 hrs"),
    ],
  }),
  salute: restaurant({
    name: "Salute", cuisine: "Restaurant bar, Fast food", amenity: "restaurant",
    phone: "4313-1456",
    outlets: [
      o("Upper Floor", "SUESNS11", "", "24 hrs", true),
      o("Upper Floor", "TS23", "", "Monday to Sunday 06:00 to 23:00 hrs"),
    ],
  }),
  salute_mx: restaurant({
    name: "Salute Mx", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5662-9271, 5662-3165, 4313-1373",
    outlets: [
      o("Upper Floor", "SUESIS19", "", "Monday to Sunday 07:00 to 22:00 hrs"),
    ],
  }),
  sbarro: restaurant({
    name: "Sbarro", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0178",
    website: "sbarro.com", logoUrl: logo("sbarro.com"),
    outlets: [
      o("Upper Floor", "TS16", "", "Monday to Sunday 07:00 to 22:00 hrs"),
    ],
  }),
  starbucks_coffee: restaurant({
    name: "Starbucks Coffee", cuisine: "Café", amenity: "cafe",
    phone: "3186-1398",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("Ground Floor", "ALL15 A", "", "Monday to Sunday 05:00 to 24:00 hrs"),
      o("Upper Floor", "PASUES10", "", "Monday to Sunday 05:00 to 24:00 hrs"),
      o("Upper Floor", "PASUES11", "", "Monday to Sunday 05:00 to 24:00 hrs"),
      o("Upper Floor", "PASUES23", "", "Monday to Sunday 05:00 to 24:00 hrs"),
      o("Upper Floor", "PASUES24", "", "Monday to Sunday 05:00 to 24:00 hrs"),
      o("Upper Floor", "TS26", "", "Monday to Sunday 05:00 to 24:00 hrs"),
      o("Upper Floor", "TS27", "", "Monday to Sunday 05:00 to 24:00 hrs"),
    ],
  }),
  subway: restaurant({
    name: "Subway", cuisine: "Café, Fast food", amenity: "cafe",
    phone: "4313-0246",
    website: "subway.com", logoUrl: logo("subway.com"),
    outlets: [
      o("Upper Floor", "PASUES12", "", "Monday to Sunday 06:00 to 22:30 hrs"),
      o("Upper Floor", "PASUES13", "", "Monday to Sunday 07:00 to 22:00 hrs"),
      o("Upper Floor", "TS18", "", "Monday to Sunday 06:00 to 23:00 hrs"),
    ],
  }),
  sushi_itto: restaurant({
    name: "Sushi-itto", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0181",
    website: "sushi-itto.com", logoUrl: logo("sushi-itto.com"),
    outlets: [
      o("Upper Floor", "TS25", "", "Monday to Sunday 9:00 to 21:30 hrs"),
    ],
  }),
  terraza_mx: restaurant({
    name: "Terraza Mx", cuisine: "Restaurant bar", amenity: "bar",
    phone: "4313-1370",
    outlets: [
      o("Upper Floor", "VLPA01", "", "24 hrs", true),
    ],
  }),
  toks: restaurant({
    name: "Toks", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5281-3310, 5523-1111 y 5536-1881",
    website: "toks.com.mx", logoUrl: logo("toks.com.mx"),
    outlets: [
      o("Mezzanine", "MZ14", "", "Monday to Sunday 24 hrs", true),
    ],
  }),
  tortas_don_polo: restaurant({
    name: "Tortas Don Polo", cuisine: "Fast food", amenity: "fast_food",
    phone: "4313-0179",
    outlets: [
      o("Upper Floor", "TS06", "", "Monday to Friday 07:00 to 22:00 and Saturdays 10:00 to 22:00 hrs"),
    ],
  }),
  wings: restaurant({
    name: "Wings", cuisine: "Restaurant bar", amenity: "restaurant",
    phone: "5263-6912",
    website: "wingsrestaurants.com.mx", logoUrl: logo("wingsrestaurants.com.mx"),
    outlets: [
      o("Upper Floor", "AS32", "", "Monday to Sunday 06:00 to 22:30 hrs"),
      o("Ground Floor", "LLN18", "", "Monday to Sunday 06:00 to 22:30 hrs"),
      o("Mezzanine", "MZ13", "", "Monday to Sunday 24 hrs", true),
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
  const totalVenues = Object.keys(terminal1Venues).length
    + Object.keys(terminal2Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
