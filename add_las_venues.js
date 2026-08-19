'use strict';
/**
 * Fills in complete data for Harry Reid International Airport (LAS) —
 * restaurants/cafés/bars/vending in Firestore. Researched 2026-08-17 from the
 * airport's own official site, harryreidairport.com, using Claude in Chrome
 * browser automation per explicit user instruction. No third-party/aggregator
 * source was used for any venue field.
 *
 * SOURCE: https://www.harryreidairport.com/dine-shop-and-more?category=dining
 * (Clark County Department of Aviation's own Dine, Shop & More directory,
 * filtered to its "Dining" category). The directory is a paginated card list;
 * each card links to the airport's own Mappedin-backed interactive map at
 * /map#/profile?location=<id>. All ten pages of the dining category were read.
 *
 * WHAT THE SOURCE DOES AND DOES NOT PUBLISH — this is the important caveat for
 * this airport. For each dining venue LAS publishes exactly five things: the
 * venue name, a map location id, a nearby landmark ("Near Gate C21", "Near
 * D-Gates - Great Hall", "Near Esplanade", "Near Rotunda", "Near Shake
 * Shack"), a security-zone badge ("After Security" / "Before Security") and a
 * terminal badge. It publishes NO opening hours, NO phone number, NO
 * description, NO website, NO level/floor, and NO cuisine, genre, service-
 * style or dietary tag of any kind beyond the single top-level "Dining"
 * category pill that was used to select these records in the first place.
 * Consequently `description`, `phone`, `opening_hours`, `open_24_7`, `level`,
 * `halal`, `kosher`, `vegetarian_options`, `vegan_options` and `gluten_free`
 * are BLANK on every doc in this file. They are blank because the airport does
 * not publish them — not because they were missed — and they are left blank
 * rather than filled in from any other source or guessed.
 *
 * EXTRACTION + VERIFICATION: the cards were read with structural selectors
 * (.PoiCard_poi-title__oe7uI for the name, div.Text_text__c4Cox for the two
 * text lines, .PoiCard_badges-container__fA4WC for the badges) rather than by
 * splitting rendered innerText, after a first innerText pass produced two
 * malformed rows. The 110 records were serialised in-page to a printable-ASCII
 * format (`@@` field delimiter) with every non-ASCII character replaced by a
 * reversible `<U+hex>` escape and every field whitespace-normalised in the
 * browser before checksumming, split into 2 chunks on line boundaries, written
 * into a `<pre id="dataDump">` and retrieved via get_page_text. Both chunks
 * verified EXACTLY on first pass against values computed in the browser before
 * retrieval — len/lines/checksum: 6745/90/26615078 and 1470/19/5824124 — as
 * did the rejoined 109-line in-scope dataset at len 8216, checksum 32390089,
 * using checksum(s) = Σ charCodeAt(i)·(i%97+1) mod 1e9+7.
 *
 * TERMINAL STRUCTURE — 3 buckets, decided by testing the airport's own filter
 * UI. LAS has two passenger terminals, Terminal 1 and Terminal 3, each with
 * its own ticketing hall and its own security checkpoints, so each is plainly
 * its own bucket. The open question is Concourse D: it is a standalone
 * satellite with NEITHER its own check-in NOR its own security, reached by
 * automated tram from BOTH Terminal 1 and Terminal 3, which makes it exactly
 * the kind of shared airside zone this dataset's rules say to resolve against
 * the site's own filter UI rather than by inventing a bucket. That test was
 * run directly. The terminal dropdown on the directory offers: All terminals,
 * Terminal 1, Terminal 3, A/B/C Gates, D Gates, E Gates. Selecting each in
 * turn gave `terminal=terminal-1` → "Page 1 of 5" with every card badged
 * "Terminal 1 (A, B, C Gates)"; `terminal=gates-d` → "Page 1 of 3" with every
 * card badged "D Gates"; `terminal=terminal-3` → "Page 1 of 2" with every card
 * badged "Terminal 3 (E Gates)". The three sets are MUTUALLY EXCLUSIVE — LAS
 * does not dual-list a single D-gates venue under Terminal 1 or Terminal 3.
 * So there is no shared-zone duplication to do, and the three buckets here are
 * precisely the three peer terminal values LAS itself publishes and files
 * every dining venue under: `terminal_1`, `d_gates`, `terminal_3`. Applying
 * the check-in-and-security test WITHIN Terminal 1 produces no further split:
 * the A/B and C gates are fed by checkpoints in one shared ticketing hall and
 * LAS itself labels the whole thing "Terminal 1 (A, B, C Gates)".
 *
 * SCOPE — 1 dining record EXCLUDED: location id LOC-L22L00V5, "Vending
 * Machine", which LAS publishes with a security badge ("After Security") but
 * NO terminal badge at all. It is the only record of the 110 with no terminal,
 * and rather than guess which of the three buckets it belongs to it is left
 * out of scope. That leaves 109 of the 110 records.
 *
 * AIRSIDE / LANDSIDE: taken directly from each card's own security badge —
 * "After Security" → `airside`, "Before Security" → `landside`. Present on all
 * 109 in-scope records; no inference was needed. Note that where LAS publishes
 * a security zone but no landmark, its location line carries no "•" separator
 * and the zone occupies the first slot; those rows were detected and the field
 * order corrected rather than being read as a landmark.
 *
 * LEVEL: blank on every outlet. LAS's directory publishes no floor or level
 * for any dining venue.
 *
 * LOCATION_NOTES: each card's own nearby-landmark string verbatim — "Near Gate
 * C21", "Near D-Gates - Great Hall", "Near Esplanade", "Near Rotunda", "Near B
 * Gates", "Near Security Checkpoint - A/B Gates", "Near Shake Shack". For the
 * 3 records where LAS publishes a security zone but no landmark it is left
 * BLANK rather than restating the terminal name, which would be the bucket
 * label rather than a real location detail.
 *
 * MULTI-OUTLET HANDLING: same-brand venues within the SAME terminal bucket are
 * merged into one doc with one `outlets[]` entry per physical unit; same-brand
 * venues in DIFFERENT terminals stay separate docs, per this dataset's
 * standing rule. So Starbucks appears three times in this file — once in
 * Terminal 1 (4 outlets), once in D Gates (3) and once in Terminal 3 (2) — and
 * never as one cross-terminal doc. Brand matching is case- and
 * apostrophe-insensitive. Distinctly NAMED venues are kept separate per this
 * dataset's page-truth-over-label precedent, even where they share a parent
 * operator: "Chili's" vs "Chili's Too" vs "Chili's Bar"; "Ruby's Diner" vs
 * "Ruby's Bar"; "PGA Tour Grill" vs "PGA TO GO"; "Sammy's Beach Bar & Grill"
 * vs "Sammy's Woodfired Pizza"; "Port of Subs" vs "Port of Subs/Mrs. Fields";
 * "Jose Cuervo Tequileria" vs "Tequileria Grille"; "Fresh Attractions" vs
 * "Fresh Market On The Go". 109 source records → 87 docs.
 *
 * CUISINE: "Dining" on every doc. This is not a placeholder and not a guess —
 * it is verbatim the only category LAS's own directory assigns these venues,
 * and the filter value (?category=dining) used to select them. The airport
 * publishes no finer cuisine or genre tag for any dining venue, so there is
 * nothing more specific to join, and inventing one per venue would be
 * fabrication.
 *
 * AMENITY: because LAS publishes no service-style or category tag at all, the
 * amenity is derived ONLY from the other thing the airport does publish — the
 * venue's own name — and defaults to `restaurant` where the name does not
 * settle it. The order is: a "Vending Machine" name → `vending_machine`; a
 * name carrying Bar / Lounge / Pub / Cantina / Tequileria / Brewery / Cocktail
 * / Beer Union → `bar`; a name carrying Coffee / Café / Starbucks / Dunkin /
 * Bagel / Cinnabon / Espresso / Tea / Boba / TCBY / Jamba / Juice → `cafe`;
 * otherwise `restaurant`. Per this dataset's standing rule that a "bar" is
 * checked against the venue's own name rather than a tag alone, a name that
 * ALSO carries a full-service dining word (Grill, Grille, Chophouse, Kitchen,
 * Diner, Pizza, Pizzeria, Steak, BBQ) is treated as a restaurant that has a
 * bar rather than as a bar — which is what keeps "Sammy's Beach Bar & Grill",
 * "Las Vegas Chophouse & Brewery" and "Tequileria Grille" as `restaurant`,
 * while "Crafted Bar", "The Layover Bar", "Barney's Lounge", "Corcoran's Irish
 * Pub", "Village Pub", "Modelo Cantina", "Beer Union", "Kona Big Wave Bar",
 * "Chili's Bar" and "Ruby's Bar" stand as `bar`. Resulting mix across the 109
 * records: 61 restaurant, 29 cafe, 17 bar, 2 vending_machine. The venues LAS
 * publishes as markets or grab-and-go concepts under the same single "Dining"
 * pill ("Fresh Attractions", "Fresh Market On The Go", "LAS MKT", "LV
 * Provisions", "Snack Shack", "Vegas Born") take the `restaurant` default,
 * since the source gives no basis to classify them more finely.
 *
 * VEGETARIAN / VEGAN / GLUTEN-FREE / HALAL / KOSHER: blank on every doc. LAS
 * publishes no dietary tag of any kind, and this dataset's rule is that these
 * flags are set only where the source explicitly says so.
 *
 * DESCRIPTION / OPENING HOURS / 24-7 / PHONE: blank on every doc — LAS's
 * directory publishes none of these fields for any dining venue. Nothing was
 * carried across from a secondary source to fill them.
 *
 * WEBSITE / LOGO: LAS's cards carry no website field. Following this dataset's
 * KUL precedent, `website` (and the logo.dev logo derived from it) is set only
 * for globally or nationally recognisable chains and well-known Las Vegas
 * concepts whose primary domain is confidently known — 59 of the 87 docs — and
 * left blank for every airport-only concept ("Crafted Bar", "Fresh
 * Attractions", "LAS MKT", "The Layover Bar", "Vegas Born", "Snack Shack",
 * "The Local", "Vegas Baby Bar" and the rest) rather than guessed.
 *
 * VERIFIED TOTALS: 110 source dining records − 1 out of scope = 109 → 87
 * restaurant docs / 109 outlets. Terminal 1 (A, B, C Gates): 60 records → 46
 * docs / 60 outlets. D Gates: 33 → 27 / 33. Terminal 3 (E Gates): 16 → 14 /
 * 16.
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['las', 'harry-reid', 'mccarran', 'las-vegas'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

const TERMINAL_1 = 'terminal_1';
const D_GATES = 'd_gates';
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


// ─── Terminal 1 (A, B, C Gates) ───

const terminal1Venues = {
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Dining", amenity: "restaurant",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("", "Near Gate C21", "airside", ""),
    ],
  }),
  barneys_lounge: restaurant({
    name: "Barney's Lounge", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate C25", "airside", ""),
    ],
  }),
  beer_union: restaurant({
    name: "Beer Union", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate B25", "airside", ""),
    ],
  }),
  brb_boba_tea: restaurant({
    name: "BRB Boba Tea", cuisine: "Dining", amenity: "cafe",
    outlets: [
      o("", "Near Gate B17", "airside", ""),
    ],
  }),
  brookwood_farms_bbq: restaurant({
    name: "Brookwood Farms BBQ", cuisine: "Dining", amenity: "restaurant",
    website: "brookwoodfarms.com", logoUrl: logo("brookwoodfarms.com"),
    outlets: [
      o("", "Near Gate C7", "airside", ""),
    ],
  }),
  bud_29_track_lounge: restaurant({
    name: "Bud 29 Track Lounge", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Esplanade", "airside", ""),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Dining", amenity: "restaurant",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("", "Near Gate C14", "airside", ""),
    ],
  }),
  cocktail_bar: restaurant({
    name: "Cocktail Bar", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate A17", "airside", ""),
    ],
  }),
  corcorans_irish_pub: restaurant({
    name: "Corcoran's Irish Pub", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate C2", "airside", ""),
    ],
  }),
  crafted_bar: restaurant({
    name: "Crafted Bar", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Shake Shack", "airside", ""),
      o("", "Near Gate C7", "airside", ""),
    ],
  }),
  dunkin_express: restaurant({
    name: "Dunkin' Express", cuisine: "Dining", amenity: "cafe",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
      o("", "Near Gate A7", "airside", ""),
    ],
  }),
  einstein_bros_bagels: restaurant({
    name: "Einstein Bros. Bagels", cuisine: "Dining", amenity: "cafe",
    website: "einsteinbros.com", logoUrl: logo("einsteinbros.com"),
    outlets: [
      o("", "Near Gate B9", "airside", ""),
    ],
  }),
  fresh_attractions: restaurant({
    name: "Fresh Attractions", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate A7", "airside", ""),
      o("", "Near Gate C14", "airside", ""),
      o("", "Near Rotunda", "airside", ""),
      o("", "Near B Gates", "airside", ""),
      o("", "Near Gate C3", "airside", ""),
      o("", "Near Gate B17", "airside", ""),
    ],
  }),
  fresh_market_on_the_go: restaurant({
    name: "Fresh Market On The Go", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate C21", "airside", ""),
    ],
  }),
  great_steak_and_potato_company: restaurant({
    name: "Great Steak and Potato Company", cuisine: "Dining", amenity: "restaurant",
    website: "greatsteak.com", logoUrl: logo("greatsteak.com"),
    outlets: [
      o("", "Near Gate A23", "airside", ""),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "Dining", amenity: "cafe",
    website: "jamba.com", logoUrl: logo("jamba.com"),
    outlets: [
      o("", "Near Rotunda", "airside", ""),
      o("", "Near Gate C25", "airside", ""),
    ],
  }),
  jersey_mikes_subs: restaurant({
    name: "Jersey Mike's Subs", cuisine: "Dining", amenity: "restaurant",
    website: "jerseymikes.com", logoUrl: logo("jerseymikes.com"),
    outlets: [
      o("", "Near Gate C22", "airside", ""),
    ],
  }),
  jimmy_johns: restaurant({
    name: "Jimmy John's", cuisine: "Dining", amenity: "restaurant",
    website: "jimmyjohns.com", logoUrl: logo("jimmyjohns.com"),
    outlets: [
      o("", "Near Esplanade", "airside", ""),
    ],
  }),
  jose_cuervo_tequileria: restaurant({
    name: "Jose Cuervo Tequileria", cuisine: "Dining", amenity: "bar",
    website: "cuervo.com", logoUrl: logo("cuervo.com"),
    outlets: [
      o("", "Near Gate C5", "airside", ""),
    ],
  }),
  joyba_bubble_tea: restaurant({
    name: "Joyba Bubble Tea", cuisine: "Dining", amenity: "cafe",
    website: "joyba.com", logoUrl: logo("joyba.com"),
    outlets: [
      o("", "Near Gate C25", "airside", ""),
    ],
  }),
  la_familia_tacos_tequila: restaurant({
    name: "La Familia Tacos & Tequila", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate B15", "airside", ""),
    ],
  }),
  las_mkt: restaurant({
    name: "LAS MKT", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate C7", "airside", ""),
    ],
  }),
  licorice: restaurant({
    name: "Licorice", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate C24", "airside", ""),
    ],
  }),
  little_tonys_pizzeria: restaurant({
    name: "Little Tony's Pizzeria", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate B25", "airside", ""),
    ],
  }),
  lucky_streak_cocktail_lounge: restaurant({
    name: "Lucky Streak Cocktail Lounge", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate C23", "airside", ""),
    ],
  }),
  moes_southwest_grill: restaurant({
    name: "Moe's Southwest Grill", cuisine: "Dining", amenity: "restaurant",
    website: "moes.com", logoUrl: logo("moes.com"),
    outlets: [
      o("", "Near Gate A15", "airside", ""),
    ],
  }),
  nathans_famous_hot_dogs: restaurant({
    name: "Nathan's Famous Hot Dogs", cuisine: "Dining", amenity: "restaurant",
    website: "nathansfamous.com", logoUrl: logo("nathansfamous.com"),
    outlets: [
      o("", "Near Gate C22", "airside", ""),
    ],
  }),
  pei_wei: restaurant({
    name: "Pei Wei", cuisine: "Dining", amenity: "restaurant",
    website: "peiwei.com", logoUrl: logo("peiwei.com"),
    outlets: [
      o("", "Near Gate C19", "airside", ""),
    ],
  }),
  pga_to_go: restaurant({
    name: "PGA TO GO", cuisine: "Dining", amenity: "restaurant",
    website: "pgatour.com", logoUrl: logo("pgatour.com"),
    outlets: [
      o("", "Near Gate B17", "airside", ""),
    ],
  }),
  pga_tour_grill: restaurant({
    name: "PGA Tour Grill", cuisine: "Dining", amenity: "restaurant",
    website: "pgatour.com", logoUrl: logo("pgatour.com"),
    outlets: [
      o("", "Near Gate B17", "airside", ""),
    ],
  }),
  popeyes: restaurant({
    name: "Popeye's", cuisine: "Dining", amenity: "restaurant",
    website: "popeyes.com", logoUrl: logo("popeyes.com"),
    outlets: [
      o("", "Near Gate C23", "airside", ""),
    ],
  }),
  port_of_subs_mrs_fields: restaurant({
    name: "Port of Subs/Mrs. Fields", cuisine: "Dining", amenity: "restaurant",
    website: "portofsubs.com", logoUrl: logo("portofsubs.com"),
    outlets: [
      o("", "Near Gate B25", "airside", ""),
    ],
  }),
  sammys_beach_bar_grill: restaurant({
    name: "Sammy's Beach Bar & Grill", cuisine: "Dining", amenity: "restaurant",
    website: "sammysbeachbarandgrill.com", logoUrl: logo("sammysbeachbarandgrill.com"),
    outlets: [
      o("", "Near Gate C24", "airside", ""),
    ],
  }),
  shake_shack: restaurant({
    name: "Shake Shack", cuisine: "Dining", amenity: "restaurant",
    website: "shakeshack.com", logoUrl: logo("shakeshack.com"),
    outlets: [
      o("", "Near Security Checkpoint - A/B Gates", "airside", ""),
    ],
  }),
  siegels_bagelmania: restaurant({
    name: "Siegel's Bagelmania", cuisine: "Dining", amenity: "cafe",
    website: "bagelmanialv.com", logoUrl: logo("bagelmanialv.com"),
    outlets: [
      o("", "Near Gate A10", "airside", ""),
    ],
  }),
  snack_shack: restaurant({
    name: "Snack Shack", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate A3", "airside", ""),
      o("", "Near Gate B2", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Dining", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Near Gate C16", "airside", ""),
      o("", "Near Esplanade", "airside", ""),
      o("", "", "landside", ""),
      o("", "Near Gate B17", "airside", ""),
    ],
  }),
  tacos_locos: restaurant({
    name: "Tacos Locos", cuisine: "Dining", amenity: "restaurant",
    website: "tacoslocoslv.com", logoUrl: logo("tacoslocoslv.com"),
    outlets: [
      o("", "Near Gate B15", "airside", ""),
    ],
  }),
  tequileria_grille: restaurant({
    name: "Tequileria Grille", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate C7", "airside", ""),
    ],
  }),
  the_b_lounge: restaurant({
    name: "The B Lounge", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate A7", "airside", ""),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "Dining", amenity: "cafe",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("", "Near Gate C4", "airside", ""),
      o("", "Near Gate C25", "airside", ""),
    ],
  }),
  the_layover_bar: restaurant({
    name: "The Layover Bar", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Esplanade", "airside", ""),
    ],
  }),
  vegas_baby_bar: restaurant({
    name: "Vegas Baby Bar", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate A15", "airside", ""),
    ],
  }),
  vending_machine: restaurant({
    name: "Vending Machine", cuisine: "Dining", amenity: "vending_machine",
    outlets: [
      o("", "Near Gate C19", "airside", ""),
      o("", "Near Gate C19", "airside", ""),
    ],
  }),
  villa_fresh_italian_kitchen: restaurant({
    name: "Villa Fresh Italian Kitchen", cuisine: "Dining", amenity: "restaurant",
    website: "villaitaliankitchen.com", logoUrl: logo("villaitaliankitchen.com"),
    outlets: [
      o("", "Near Gate C23", "airside", ""),
    ],
  }),
  wendys: restaurant({
    name: "Wendy's", cuisine: "Dining", amenity: "restaurant",
    website: "wendys.com", logoUrl: logo("wendys.com"),
    outlets: [
      o("", "Near Gate C23", "airside", ""),
      o("", "Near Esplanade", "airside", ""),
    ],
  }),
};

// ─── D Gates (shared satellite concourse) ───

const dGatesVenues = {
  auntie_annes: restaurant({
    name: "Auntie Anne's", cuisine: "Dining", amenity: "restaurant",
    website: "auntieannes.com", logoUrl: logo("auntieannes.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  brb_boba_tea: restaurant({
    name: "BRB Boba Tea", cuisine: "Dining", amenity: "cafe",
    outlets: [
      o("", "Near Gate D16", "airside", ""),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Dining", amenity: "restaurant",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("", "Near Gate D6", "airside", ""),
    ],
  }),
  california_pizza_kitchen: restaurant({
    name: "California Pizza Kitchen", cuisine: "Dining", amenity: "restaurant",
    website: "cpk.com", logoUrl: logo("cpk.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  chilis: restaurant({
    name: "Chili's", cuisine: "Dining", amenity: "restaurant",
    website: "chilis.com", logoUrl: logo("chilis.com"),
    outlets: [
      o("", "Near Gate D35", "airside", ""),
    ],
  }),
  chilis_bar: restaurant({
    name: "Chili's Bar", cuisine: "Dining", amenity: "bar",
    website: "chilis.com", logoUrl: logo("chilis.com"),
    outlets: [
      o("", "Near Gate D16", "airside", ""),
    ],
  }),
  chilis_too: restaurant({
    name: "Chili's Too", cuisine: "Dining", amenity: "restaurant",
    website: "chilis.com", logoUrl: logo("chilis.com"),
    outlets: [
      o("", "Near Gate D18", "airside", ""),
    ],
  }),
  cinnabon: restaurant({
    name: "Cinnabon", cuisine: "Dining", amenity: "cafe",
    website: "cinnabon.com", logoUrl: logo("cinnabon.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  daves_hot_chicken: restaurant({
    name: "Dave's Hot Chicken", cuisine: "Dining", amenity: "restaurant",
    website: "daveshotchicken.com", logoUrl: logo("daveshotchicken.com"),
    outlets: [
      o("", "Near Gate D36", "airside", ""),
    ],
  }),
  dunkin_express: restaurant({
    name: "Dunkin' Express", cuisine: "Dining", amenity: "cafe",
    website: "dunkindonuts.com", logoUrl: logo("dunkindonuts.com"),
    outlets: [
      o("", "Near Gate D6", "airside", ""),
      o("", "Near Gate D6", "airside", ""),
    ],
  }),
  fresh_attractions: restaurant({
    name: "Fresh Attractions", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate D26", "airside", ""),
      o("", "Near Gate D56", "airside", ""),
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  jamba_juice: restaurant({
    name: "Jamba Juice", cuisine: "Dining", amenity: "cafe",
    website: "jamba.com", logoUrl: logo("jamba.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  kona_big_wave_bar: restaurant({
    name: "Kona Big Wave Bar", cuisine: "Dining", amenity: "bar",
    website: "konabrewingco.com", logoUrl: logo("konabrewingco.com"),
    outlets: [
      o("", "Near Gate D38", "airside", ""),
    ],
  }),
  metro_pizza: restaurant({
    name: "Metro Pizza", cuisine: "Dining", amenity: "restaurant",
    website: "metropizza.com", logoUrl: logo("metropizza.com"),
    outlets: [
      o("", "Near Gate D36", "airside", ""),
    ],
  }),
  modelo_cantina: restaurant({
    name: "Modelo Cantina", cuisine: "Dining", amenity: "bar",
    website: "modelousa.com", logoUrl: logo("modelousa.com"),
    outlets: [
      o("", "Near Gate D7", "airside", ""),
    ],
  }),
  panda_express: restaurant({
    name: "Panda Express", cuisine: "Dining", amenity: "restaurant",
    website: "pandaexpress.com", logoUrl: logo("pandaexpress.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  port_of_subs: restaurant({
    name: "Port of Subs", cuisine: "Dining", amenity: "restaurant",
    website: "portofsubs.com", logoUrl: logo("portofsubs.com"),
    outlets: [
      o("", "Near Gate D5", "airside", ""),
      o("", "Near Gate D50", "airside", ""),
    ],
  }),
  quiznos_sub: restaurant({
    name: "Quiznos Sub", cuisine: "Dining", amenity: "restaurant",
    website: "quiznos.com", logoUrl: logo("quiznos.com"),
    outlets: [
      o("", "Near Gate D34", "airside", ""),
    ],
  }),
  rachels_kitchen: restaurant({
    name: "Rachel's Kitchen", cuisine: "Dining", amenity: "restaurant",
    website: "rachelskitchen.com", logoUrl: logo("rachelskitchen.com"),
    outlets: [
      o("", "Near Gate D6", "airside", ""),
    ],
  }),
  rubys_bar: restaurant({
    name: "Ruby's Bar", cuisine: "Dining", amenity: "bar",
    website: "rubys.com", logoUrl: logo("rubys.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  rubys_diner: restaurant({
    name: "Ruby's Diner", cuisine: "Dining", amenity: "restaurant",
    website: "rubys.com", logoUrl: logo("rubys.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  sammys_woodfired_pizza: restaurant({
    name: "Sammy's Woodfired Pizza", cuisine: "Dining", amenity: "restaurant",
    website: "sammysbeachbarandgrill.com", logoUrl: logo("sammysbeachbarandgrill.com"),
    outlets: [
      o("", "Near Gate D7", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Dining", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Near Gate D36", "airside", ""),
      o("", "Near Gate D55", "airside", ""),
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  tcby_mrs_fields: restaurant({
    name: "TCBY/Mrs. Fields", cuisine: "Dining", amenity: "cafe",
    website: "tcby.com", logoUrl: logo("tcby.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  the_great_american_bagel_bakery: restaurant({
    name: "The Great American Bagel Bakery", cuisine: "Dining", amenity: "cafe",
    website: "greatamericanbagel.com", logoUrl: logo("greatamericanbagel.com"),
    outlets: [
      o("", "Near D-Gates - Great Hall", "airside", ""),
    ],
  }),
  vegas_born: restaurant({
    name: "Vegas Born", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate D52", "airside", ""),
    ],
  }),
  wolfgang_puck_express: restaurant({
    name: "Wolfgang Puck Express", cuisine: "Dining", amenity: "restaurant",
    website: "wolfgangpuck.com", logoUrl: logo("wolfgangpuck.com"),
    outlets: [
      o("", "Near Gate D17", "airside", ""),
    ],
  }),
};

// ─── Terminal 3 (E Gates) ───

const terminal3Venues = {
  brb_boba_tea: restaurant({
    name: "BRB Boba Tea", cuisine: "Dining", amenity: "cafe",
    outlets: [
      o("", "Near Gate E4", "airside", ""),
    ],
  }),
  burger_king: restaurant({
    name: "Burger King", cuisine: "Dining", amenity: "restaurant",
    website: "bk.com", logoUrl: logo("bk.com"),
    outlets: [
      o("", "Near Gate E11", "airside", ""),
    ],
  }),
  carls_jr: restaurant({
    name: "Carl's Jr.", cuisine: "Dining", amenity: "restaurant",
    website: "carlsjr.com", logoUrl: logo("carlsjr.com"),
    outlets: [
      o("", "Near Gate E4", "airside", ""),
    ],
  }),
  espresso_urbano_by_sambalatte: restaurant({
    name: "Espresso Urbano by Sambalatte", cuisine: "Dining", amenity: "cafe",
    website: "sambalatte.com", logoUrl: logo("sambalatte.com"),
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  fresh_attractions: restaurant({
    name: "Fresh Attractions", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "", "landside", ""),
      o("", "Near Gate E4", "airside", ""),
    ],
  }),
  las_vegas_chophouse_brewery: restaurant({
    name: "Las Vegas Chophouse & Brewery", cuisine: "Dining", amenity: "restaurant",
    website: "lasvegaschophouse.com", logoUrl: logo("lasvegaschophouse.com"),
    outlets: [
      o("", "Near Gate E8", "airside", ""),
    ],
  }),
  lv_provisions: restaurant({
    name: "LV Provisions", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "", "airside", ""),
    ],
  }),
  pei_wei: restaurant({
    name: "Pei Wei", cuisine: "Dining", amenity: "restaurant",
    website: "peiwei.com", logoUrl: logo("peiwei.com"),
    outlets: [
      o("", "Near Gate E11", "airside", ""),
    ],
  }),
  pga_tour_grill: restaurant({
    name: "PGA Tour Grill", cuisine: "Dining", amenity: "restaurant",
    website: "pgatour.com", logoUrl: logo("pgatour.com"),
    outlets: [
      o("", "Near Gate E3", "airside", ""),
    ],
  }),
  starbucks: restaurant({
    name: "Starbucks", cuisine: "Dining", amenity: "cafe",
    website: "starbucks.com", logoUrl: logo("starbucks.com"),
    outlets: [
      o("", "Near Gate E4", "airside", ""),
      o("", "", "landside", ""),
    ],
  }),
  the_coffee_bean_tea_leaf: restaurant({
    name: "The Coffee Bean & Tea Leaf", cuisine: "Dining", amenity: "cafe",
    website: "coffeebean.com", logoUrl: logo("coffeebean.com"),
    outlets: [
      o("", "Near Gate E10", "airside", ""),
    ],
  }),
  the_great_american_bagel_bakery: restaurant({
    name: "The Great American Bagel Bakery", cuisine: "Dining", amenity: "cafe",
    website: "greatamericanbagel.com", logoUrl: logo("greatamericanbagel.com"),
    outlets: [
      o("", "Near Gate E4", "airside", ""),
    ],
  }),
  the_local: restaurant({
    name: "The Local", cuisine: "Dining", amenity: "restaurant",
    outlets: [
      o("", "Near Gate E11", "airside", ""),
    ],
  }),
  village_pub: restaurant({
    name: "Village Pub", cuisine: "Dining", amenity: "bar",
    outlets: [
      o("", "Near Gate E14", "airside", ""),
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

  const r1 = await processTerminal(AIRPORT, TERMINAL_1, 'Terminal 1 (A, B, C Gates)', terminal1Venues);
  const r2 = await processTerminal(AIRPORT, D_GATES, 'D Gates', dGatesVenues);
  const r3 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3 (E Gates)', terminal3Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_1, D_GATES, TERMINAL_3]));

  const totalCreated = r1.created + r2.created + r3.created;
  const totalDeleted = r1.deleted + r2.deleted + r3.deleted;
  const totalVenues = Object.keys(terminal1Venues).length
    + Object.keys(dGatesVenues).length
    + Object.keys(terminal3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
