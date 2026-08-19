'use strict';
/**
 * Fills in complete data for Guangzhou Baiyun International Airport (CAN),
 * Guangzhou, China, restaurants/bars/cafés in Firestore. Originally researched
 * from the Chinese-language version of the official site on 2026-08-16; this
 * revision (2026-08-16, same day) was rebuilt from the ENGLISH-language
 * version of the same site at the user's request, so every user-facing
 * field (name, location_notes, opening_hours) below is sourced from the
 * site's English content rather than translated by this script's author.
 *
 * TERMINAL STRUCTURE: CAN nominally has three terminals (T1, T2, T3), but
 * as of this writing only TWO are operating. Terminal 1 — the original
 * three-part complex (Main Terminal + Areas A/B) that had run continuously
 * since 2004 — officially closed for renovation on 2026-05-07 after 22
 * years of service; its scheduled reopening date has not been announced,
 * and it publishes no dining listings on the official site (confirmed: the
 * site's own terminal filter only offers "Terminal2"/"Terminal3", no
 * Terminal1 option at all, in either language). Terminal 2 (opened 2018)
 * and Terminal 3 (opened 2025-10-30) are genuinely separate buildings, each
 * with its own check-in, security, and gates, meeting this dataset's "own
 * check-in AND own security" bar for separate terminal buckets. This
 * script therefore populates only terminal_2 and terminal_3; if a
 * terminal_1 bucket exists in Firestore from a prior/different revision,
 * purgeOrphanedTerminals() below will clean it up as an orphan (its
 * restaurants, if any, deleted along with the terminal doc) rather than
 * leaving stale data behind. Should T1 reopen with F&B in the future, it
 * should get a dedicated research pass and its own terminal bucket in a
 * later revision.
 *
 * SOURCES & METHODOLOGY: built entirely from the official airport site,
 * www.baiyunairport.com (operated by Guangzhou Baiyun International
 * Airport Company, stock code 600004), switched to English via the site's
 * own language toggle (top-right globe icon) — its Shops/Attractions >
 * Shop & Dine section, an SPA at /shop/mall/list?type=1 backed by a
 * paginated /byairport-cms/shop/queryList API whose response text is
 * served pre-translated by the site itself (not machine-translated by this
 * script). Claude in Chrome repeatedly clicked "Load more" until the
 * button disappeared, at which point the page held 170 DOM card nodes —
 * confirmed via inspection to be exactly TWO renders of the same 85 cards
 * (a "list-view" render and a differently laid-out duplicate, both present
 * in the DOM simultaneously), i.e. 85 genuinely distinct outlet listings,
 * each with a name, terminal badge (T2/T3), a free-text location string,
 * and opening hours — all in English.
 *
 * AIRSIDE/LANDSIDE — AUTHORITATIVE FILTER, NOT TEXT INFERENCE: the list
 * page exposes a third filter dropdown (Before Security Check / After
 * Security Check / Arrival Area in English) which is the site's own
 * per-venue classification (also shown on each venue's detail page,
 * alongside a domestic/international-departure-or-arrival field and a
 * redundant terminal field). Every one of the 85 listings was captured
 * under this filter during the original Chinese-language research pass —
 * 61 fell under "after security" (airside) and 24 under "before security"
 * (landside); "arrival area" returned zero additional venues beyond those
 * two groups. Since this is a structural CMS field rather than translated
 * text, the airside/landside value for each outlet below is carried over
 * unchanged from that verification pass rather than being re-derived from
 * the English location strings (many of which — e.g. "Transportation
 * Center F1", "the middle of dining platform of the 4th floor", "the 1st
 * floor of Domestic Arrivals" — carry no security-related wording at all,
 * so text alone would still be unusable for a large share of the dataset
 * in English just as it was in Chinese).
 *
 * DATA-QUALITY NOTES:
 *   - TWO venues have a genuine site inconsistency between their location
 *     text and their security-check filter tag (confirmed during the
 *     Chinese-language research pass): "XIAO NOODLES" at "T2 - the
 *     southwest of Dining Area of the 3th floor after domestic security
 *     check" and "Chinese Sauerkraut Fish" at the same location text both
 *     explicitly say "after ... security check" in their own location
 *     string, yet both are tagged "before security" (landside) by the
 *     site's filter. Per this dataset's page-truth-over-label precedent
 *     (the same principle used for DXB's Qinwan Café and BOM's Jumbo
 *     King/Chaipoint), the more specific, directly-worded signal — the
 *     location text itself — is trusted over the filter tag, so both
 *     outlets are modelled as `airside` here. Noted inline via each doc's
 *     `description`.
 *   - One venue's name on the official site is literally "store by jpg"
 *     (English) / "store by.jpg" (Chinese) — confirmed on both its list
 *     card and its own detail page in both languages, apparently an
 *     unfixed placeholder filename rather than a real brand name. Recorded
 *     verbatim per the no-fabrication principle, with the anomaly flagged
 *     in its `description`.
 *   - LANGUAGE-VERSION MISMATCH: at the T3 list position corresponding to
 *     gate B916/B922, the Chinese-language site shows a "翠华" (Tsui Wah)
 *     outlet at "B916登机口对面", while the English-language site shows a
 *     DIFFERENT-looking listing — name "Express", at "beside the Boarding
 *     Gate B922" — same terminal, same general gate cluster, but a
 *     different gate number and a name with no visible connection to Tsui
 *     Wah. Every other one of the 85 listings matched 1:1 in name+location
 *     between the two language versions when cross-checked; this is the
 *     only spot where they diverge. Rather than assume "Express" is a
 *     mistranslation of Tsui Wah's B916 outlet (there is no textual
 *     evidence for that — no "Tsui Wah" wording appears anywhere in the
 *     English listing), it is kept as its own separate one-outlet doc
 *     (`express_t3`) using exactly what the English site publishes, with
 *     this discrepancy flagged in its `description` so it can be
 *     investigated against the live site directly.
 *   - Several smaller single-field wording differences exist between the
 *     zh/en pages for a handful of listings (e.g. one McDonald's B165
 *     outlet's security-check text reads "domestic" in Chinese but
 *     "international" in English) — these don't change the outlet's
 *     airside/landside classification (both are after some security
 *     check), so they are not flagged individually; the English wording is
 *     used as published.
 *   - Two same-named-brand pairs turned out to be the same underlying
 *     concept published under slightly different labels and were merged:
 *     "COSTA COFFEE" and "Costa Coffee" both appear within Terminal 3 and
 *     are combined into one `costa_coffee` doc with 2 outlets, matching
 *     this dataset's same-brand-same-terminal convention.
 *   - Several venues are published as explicit multi-brand shared
 *     storefronts (e.g. "DUOHETANG CHAOMIGUO", "DUOHETANG CHAOMIGUO
 *     SONGHELOU", "CHEN XIANG GUI Fish you together", "Keming Cafe、Old
 *     Chengdu Three-Flavor Noodles") — kept as single docs under their
 *     combined on-site names rather than being split, since that is how
 *     the airport itself lists each as one shop.
 *   - No free-text descriptions, cuisine tags, or phone numbers are
 *     published anywhere on this site (list view or detail view, in
 *     either language) — only name, terminal, a location string, and
 *     opening hours. `description` is therefore left blank except for the
 *     flagged venues above; `phone` is blank throughout; `cuisine` uses a
 *     short, non-fabricated categorization based on the brand's
 *     well-known concept (e.g. "Coffee" for Starbucks) rather than any
 *     site-sourced text. `website`/`logo_url` are filled in only for
 *     brands independently confirmed as global or major chains with an
 *     unambiguous official domain (McDonald's, KFC, Starbucks, Burger
 *     King, Subway, Costa Coffee, Luckin Coffee, HEYTEA, BreadTalk, %
 *     Arabica, Ajisen Ramen, Bee Cheng Hiang, Tsui Wah, Dicos) — left
 *     blank for regional-only brands.
 *   - `level` captures the floor only where the location text states one
 *     explicitly ("3rd floor" → 3, "4th floor" → 4, "5th floor" → 5, "1st
 *     floor" → 1); otherwise left blank rather than guessed. Full text
 *     goes in `location_notes` regardless, exactly as published in
 *     English (including the site's own minor typos, e.g. "Bate" for
 *     "Gate" on a couple of Starbucks/Dicos listings, kept verbatim rather
 *     than silently corrected).
 *
 * The 85 English-language listings resolve to 62 terminal-scoped venue
 * docs (38 in Terminal 2, 24 in Terminal 3 — one more than the
 * Chinese-language revision's 23, due to the Express/Tsui Wah split noted
 * above) — brands appearing with multiple outlets WITHIN the same terminal
 * are combined into one doc with multiple `outlets[]` entries (e.g.
 * Terminal 3's KFC has 4 outlets; Terminal 2's McDonald's, Starbucks,
 * Luckin Coffee, and XIAO NOODLES each have 3); the SAME brand appearing
 * in BOTH terminals (e.g. McDonald's, KFC, Starbucks, Luckin Coffee, XIAO
 * NOODLES, CHINARICE, JIUMAOJIU, Ajisen Ramen, To To Kui, Guangzhou
 * Restaurant) gets a separate doc per terminal per this dataset's standing
 * convention.
 *
 * CAN does not appear in either reference script (migrate_firestore.js's
 * AIRPORT_SLUGS nor cleanup_firestore.js), so its Firestore slug is
 * unconfirmed. This script auto-detects the airport slug at runtime
 * (checking 'can' first, then 'guangzhou', using whichever has existing
 * terminal data). It never creates a new `airports/{id}` metadata doc
 * itself.
 *
 * WIPE-AND-REPLACE BEHAVIOR: like the other current-generation add_*_venues.
 * js scripts in this repo, this script does a hard wipe, not a diff. For
 * each terminal grouping below, it first deletes EVERY existing restaurant
 * doc in that terminal's `restaurants` subcollection — unconditionally,
 * regardless of whether its name matches anything in this run — and only
 * then creates every venue defined here as a brand-new doc. There is no
 * update-in-place step and no name-matching against what's already there;
 * nothing from a previous run survives. Run this only when the venue list
 * below is meant to be the complete, authoritative set for both terminal
 * buckets.
 *
 * It also purges ORPHANED TERMINAL DOCS: any `terminals/{id}` doc under
 * this airport whose id isn't one of THIS script's terminal ids
 * (terminal_2, terminal_3) gets its restaurants subcollection and then the
 * terminal doc itself deleted, so a stale/orphaned terminal bucket (e.g. a
 * terminal_1 left over from before T1's 2026-05-07 closure) doesn't keep
 * inflating the terminal count the app shows for this airport.
 *
 * Setup: same as the other add_*_venues.js scripts — needs
 *   ~/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json
 * Run:
 *   node add_can_venues.js
 */

const admin = require('firebase-admin');
const serviceAccount = require(process.env.HOME + '/.firebase/airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CANDIDATE_AIRPORT_IDS = ['can', 'guangzhou'];
const AIRPORT_ID_OVERRIDE = null; // set this if you already know the live slug

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

// ─── Terminal 2 venues ────────────────────────────────────────────────────

const terminal2Venues = {
  tianqi_lou: restaurant({
    name: 'Tianqi Tower', cuisine: 'Halal Chinese', amenity: 'restaurant', halal: true,
    outlets: [o('3', 'T2 - the Duty Free Area of the 3rd floor after international security check', 'airside', '07:00-22:00')],
  }),
  weiqian_lamian_t2: restaurant({
    name: 'AJISEN RAMEN', cuisine: 'Japanese Ramen', amenity: 'restaurant',
    website: 'ajisen.com.cn', logoUrl: logo('ajisen.com.cn'),
    outlets: [o('3', 'T2 - the southwest of Dining Area of the 3th floor after domestic security check', 'airside', '07:00-22:00')],
  }),
  taotaoju_t2: restaurant({
    name: 'To To Kui', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [o('', 'T2 - the entrance of the 5th West finger corridor after domestic security check', 'airside', '06:00-22:30')],
  }),
  kenyue: restaurant({
    name: 'Kcoffee', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [
      o('', 'T2 - the west of the entrance of GTC', 'landside', '06:30-22:00'),
      o('', 'T2 - before the Boarding Gate B276 after domestic security check', 'airside', '07:00-22:00'),
    ],
  }),
  hefu_laomian: restaurant({
    name: 'Hefu Noodle', cuisine: 'Noodles', amenity: 'restaurant',
    outlets: [o('3', 'T2 - the southeast of Dining Area of the 3th floor after domestic security check', 'airside', '07:00-22:00')],
  }),
  naixue_de_cha: restaurant({
    name: 'NAIXUE', cuisine: 'Tea, Bakery', amenity: 'cafe',
    outlets: [o('', 'T2 - beside the Boarding Gate B265 after domestic security check', 'airside', '07:00-22:00')],
  }),
  mcdonalds_t2: restaurant({
    name: "McDonald's", cuisine: 'Fast Food, Burgers', amenity: 'fast_food',
    website: 'mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [
      o('', 'T2 - before the Boarding Gate B252 after domestic security check', 'airside', '6:00-Until the end of the departure flight'),
      o('', 'T2 - before the Boarding Gate B165 after international security check', 'airside', '06:00-22:00'),
      o('3', 'T2 - the southwest of Dining Area of the 3th floor after domestic security check', 'airside', '06:00-23:00'),
    ],
  }),
  kfc_t2: restaurant({
    name: 'KFC', cuisine: 'Fast Food, Fried Chicken', amenity: 'fast_food',
    website: 'kfc.com', logoUrl: logo('kfc.com'),
    outlets: [o('1', 'T2 - beside the Gate 50 of the 1st floor of Domestic Arrivals', 'landside', '24 hours', true)],
  }),
  yujian_xiaomian_t2: restaurant({
    name: 'XIAO NOODLES', cuisine: 'Noodles', amenity: 'restaurant',
    description: 'Site data quirk: this location\'s text explicitly says "after domestic security check", but the official site\'s own security-check filter tags it "before security" (landside). Modelled as airside here, trusting the more specific location text over the filter tag.',
    outlets: [
      o('3', 'T2 - the southwest of Dining Area of the 3th floor after domestic security check', 'airside', '07:00-22:00'),
      o('4', 'T2 - the middle of dining platform of the 4th floor', 'landside', '24 hours', true),
      o('', 'T2 - before the Boarding Gate B275 after domestic security check', 'airside', '6:00-Until the end of the departure flight'),
    ],
  }),
  erke_jidan_jianbing: restaurant({
    name: 'Double Eggs', cuisine: 'Chinese Street Food, Jianbing', amenity: 'fast_food',
    outlets: [o('', 'T2 - beside the Boarding Gate B274 after domestic security check', 'airside', '07:00-22:00')],
  }),
  store_by: restaurant({
    name: 'store by jpg', cuisine: 'Convenience Store', amenity: 'fast_food',
    description: 'Data-quality note: this is the venue\'s actual published name on the official site, in both Chinese ("store by.jpg") and English ("store by jpg") — confirmed on its list card and detail page in both languages, apparently an unfixed placeholder filename rather than a real brand name. Recorded verbatim rather than fabricating a corrected name.',
    outlets: [o('', 'T2 - the entrance of the 5th West finger corridor after domestic security check', 'airside', '07:00-22:00')],
  }),
  starbucks_t2: restaurant({
    name: 'Starbucks', cuisine: 'Coffee', amenity: 'cafe',
    website: 'starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [
      o('', 'T2 - beside the Boarding Gate B264 after domestic security check', 'airside', '06:15-22:30'),
      o('', 'T2 - beside the Boarding Gate A151 after international security check', 'airside', '07:00-22:00'),
      o('', 'T2 - beside the Boarding Bate B259 after domestic security check', 'airside', '07:00-22:00'),
    ],
  }),
  luckin_coffee_t2: restaurant({
    name: 'luckin coffee', cuisine: 'Coffee', amenity: 'cafe',
    website: 'luckincoffee.com', logoUrl: logo('luckincoffee.com'),
    outlets: [
      o('1', 'T2 - before the Gate 51 of the 1st floor of Domestic Arrivals', 'landside', '06:00-22:00'),
      o('4', 'T2 - the middle of dining platform of the 4th floor', 'landside', '06:00-22:00'),
      o('', 'T2 - the entrance of the 5th West finger corridor after domestic security check', 'airside', '07:00-22:00'),
    ],
  }),
  micang_shitang: restaurant({
    name: 'MICANG', cuisine: 'Chinese Food Court', amenity: 'food_court',
    outlets: [o('', 'T2 - before the Boarding Gate A152 after international security check', 'airside', '07:00-22:00')],
  }),
  dicos_t2: restaurant({
    name: 'DICOS', cuisine: 'Fast Food, Fried Chicken', amenity: 'fast_food',
    website: 'dicos.com.cn', logoUrl: logo('dicos.com.cn'),
    outlets: [
      o('', 'T2 - before the Boarding Bate B70 after domestic security check', 'airside', '06:00-22:00'),
      o('', 'T2 - beside the Boarding Gate A169 after international security check', 'airside', '04:00-Until the end of the departure flight'),
      o('4', 'T2 - the middle of dining platform of the 4th floor', 'landside', '06:00-22:00'),
    ],
  }),
  cailan_dianxin: restaurant({
    name: 'CHUA LAMS DIM SUM', cuisine: 'Cantonese Dim Sum', amenity: 'restaurant',
    outlets: [o('4', 'T2 - the middle of dining platform of the 4th floor', 'landside', '06:00-22:00')],
  }),
  duohetang_chaomiguo: restaurant({
    name: 'DUOHETANG CHAOMIGUO', cuisine: 'Chaoshan Soup, Snacks', amenity: 'restaurant',
    description: 'Published by the official site as one shared storefront listing two brand names; kept as a single doc rather than split.',
    outlets: [o('3', 'T2 - the Duty Free Area of the 3rd floor after international security check', 'airside', '05:30-23:30')],
  }),
  saibaiwei: restaurant({
    name: 'SUBWAY', cuisine: 'Sandwiches', amenity: 'fast_food',
    website: 'subway.com', logoUrl: logo('subway.com'),
    outlets: [o('', 'T2 - the entrance of the 5th East finger corridor after international security check', 'airside', '06:00-23:30')],
  }),
  songhelou_t2: restaurant({
    name: 'SONG HE LOU', cuisine: 'Suzhou Cuisine', amenity: 'restaurant',
    outlets: [o('', 'T2 - the entrance of the 5th East finger corridor after international security check', 'airside', '06:00-23:30')],
  }),
  duohetang_chaomiguo_songhelou: restaurant({
    name: 'DUOHETANG CHAOMIGUO SONGHELOU', cuisine: 'Chaoshan Soup, Snacks, Suzhou Cuisine', amenity: 'restaurant',
    description: 'Published by the official site as one shared storefront listing three brand names (a different physical location from the separate two-brand "DUOHETANG CHAOMIGUO" storefront and the solo "SONG HE LOU" listing elsewhere in T2); kept as a single doc rather than split.',
    outlets: [o('1', 'T2 - beside the Gate 49 of the 1st floor of Domestic Arrivals', 'landside', '06:00-22:00')],
  }),
  mengziyuan_t2: restaurant({
    name: 'CHINARICE', cuisine: 'Yunnan Rice Noodles', amenity: 'restaurant',
    outlets: [o('', 'T2 - before the Boarding Gate B173 after domestic security check', 'airside', '07:00-22:00')],
  }),
  taier: restaurant({
    name: 'Chinese Sauerkraut Fish', cuisine: 'Sauerkraut Fish, Sichuan', amenity: 'restaurant',
    description: 'Site data quirk: this location\'s text explicitly says "after domestic security check", but the official site\'s own security-check filter tags it "before security" (landside). Modelled as airside here, trusting the more specific location text over the filter tag.',
    outlets: [o('3', 'T2 - the southwest of Dining Area of the 3th floor after domestic security check', 'airside', '07:00-22:00')],
  }),
  cuihua_canting: restaurant({
    name: 'Tsui Wah Restaurant', cuisine: 'Hong Kong Cha Chaan Teng', amenity: 'restaurant',
    website: 'tsuiwahrestaurant.com', logoUrl: logo('tsuiwahrestaurant.com'),
    outlets: [o('3', 'T2 - the Duty Free Area of the 3rd floor after international security check', 'airside', '07:00-22:00')],
  }),
  guangzhou_jiujia_t2: restaurant({
    name: 'Guangzhou Restaurant', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [o('4', 'T2 - the middle of dining platform of the 4th floor', 'landside', '07:00-22:00')],
  }),
  chenxianggui_yuniyaizaiyiqi: restaurant({
    name: 'CHEN XIANG GUI Fish you together', cuisine: 'Lanzhou Beef Noodles, Fish Soup', amenity: 'restaurant',
    description: 'Published by the official site as one shared storefront listing two brand names; kept as a single doc rather than split.',
    outlets: [o('', 'T2 - the entrance of the 5th West finger corridor after domestic security check', 'airside', '05:30-11:00')],
  }),
  jiumaojiu_t2: restaurant({
    name: 'JIUMAOJIU', cuisine: 'Northwestern Chinese', amenity: 'restaurant',
    outlets: [o('', 'T2 - beside the Boarding Gate B267 after domestic security check', 'airside', '07:00-22:00')],
  }),
  arabica: restaurant({
    name: 'Arabica', cuisine: 'Coffee', amenity: 'cafe',
    website: 'arabica.coffee', logoUrl: logo('arabica.coffee'),
    outlets: [o('3', 'T2 - the Duty Free Area of the 3rd floor after international security check', 'airside', '07:00-22:00')],
  }),
  sanliangfen: restaurant({
    name: 'SAN LIANG FEN', cuisine: 'Rice Noodles', amenity: 'restaurant',
    outlets: [o('3', 'T2 - the southeast of Dining Area of the 3th floor after domestic security check', 'airside', '07:00-22:00')],
  }),
  paix_coffee: restaurant({
    name: 'PAIX COFFEE', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [o('', 'T2 - before the Boarding Gate B164 after international security check', 'airside', '7:00-22:00')],
  }),
  mianbao_xinyu: restaurant({
    name: 'BreadTalk', cuisine: 'Bakery', amenity: 'cafe',
    website: 'breadtalk.com', logoUrl: logo('breadtalk.com'),
    outlets: [o('3', 'T2 - the 3th floor of Dining Area after domestic security check', 'airside', '07:00-22:00')],
  }),
  xicha: restaurant({
    name: 'HEYTEA', cuisine: 'Tea', amenity: 'cafe',
    website: 'heytea.com', logoUrl: logo('heytea.com'),
    outlets: [o('', 'T2 - before the Boarding Gate B172 after domestic security check', 'airside', '07:00-22:00')],
  }),
  maikafei: restaurant({
    name: 'MCCAFE', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [o('1', 'T2 - beside the Gate 53 of the 1st floor of Domestic Arrivals', 'landside', '06:00-22:00')],
  }),
  hanbaowang: restaurant({
    name: 'BURGER KING', cuisine: 'Fast Food, Burgers', amenity: 'fast_food',
    website: 'burgerking.com', logoUrl: logo('burgerking.com'),
    outlets: [o('', 'T2 - the entrance of the 5th West finger corridor after domestic security check', 'airside', '07:00-22:00')],
  }),
  xishaoye: restaurant({
    name: 'Master Xi', cuisine: 'Rou Jia Mo (Chinese Burger)', amenity: 'fast_food',
    outlets: [o('', 'T2 - the entrance of the 5th East finger corridor after international security check', 'airside', '06:00-23:00')],
  }),
  wuzhi_luer: restaurant({
    name: 'WU ZHI SPICED GOOSE', cuisine: 'Chaoshan Marinated Goose', amenity: 'restaurant',
    outlets: [o('4', 'the middle of dining platform of the 4th floor', 'landside', '06:00-22:00')],
  }),
  baitianer_hongtufu: restaurant({
    name: 'White Swan Hotel Hongtu Hall', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [o('3', 'T2 - the southwest of Dining Area of the 3th floor after domestic security check', 'airside', '07:00-22:00')],
  }),
  molly_naibai: restaurant({
    name: 'MOLLY TEA', cuisine: 'Tea', amenity: 'cafe',
    outlets: [o('4', 'T2 - the middle of dining platform of the 4th floor', 'landside', '6:00-22:00')],
  }),
  yeren_xiansheng: restaurant({
    name: 'Mr Savage', cuisine: 'Snacks', amenity: 'fast_food',
    outlets: [o('4', 'T2 - the middle of dining platform of the 4th floor', 'landside', '06:00-22:00')],
  }),
};

// ─── Terminal 3 venues ────────────────────────────────────────────────────

const terminal3Venues = {
  cuihua_t3: restaurant({
    name: 'Tsui Wah Restaurant', cuisine: 'Hong Kong Cha Chaan Teng', amenity: 'restaurant',
    website: 'tsuiwahrestaurant.com', logoUrl: logo('tsuiwahrestaurant.com'),
    outlets: [o('', 'T3 Terminal-West Side of the Commercial Area After International Security Check', 'airside', '07:00-22:00')],
  }),
  express_t3: restaurant({
    name: 'Express', cuisine: 'Chinese', amenity: 'restaurant',
    description: 'Language-version mismatch: the Chinese-language site shows "翠华" (Tsui Wah) at "B916登机口对面" in this same list position, while the English-language site shows this listing — a differently-named venue with no visible connection to Tsui Wah, at a different gate (B922). Every other one of the 85 listings matched 1:1 between languages; this is the only exception. Kept as its own doc using exactly what the English site publishes, rather than assuming it is a mistranslated Tsui Wah outlet.',
    outlets: [o('', 'T3 -beside the Boarding Gate B922 after domestic security check', 'airside', '07:00-22:00')],
  }),
  chenxianggui_t3: restaurant({
    name: 'Chen Xiang Gui', cuisine: 'Lanzhou Beef Noodles', amenity: 'restaurant',
    outlets: [
      o('', 'T3 - beside the Boarding Gate B938 after domestic security check', 'airside', '06:00-22:00'),
      o('5', 'T3 Main Terminal, West Side Commercial Zone, Fifth Floor', 'landside', '24 hours', true),
    ],
  }),
  costa_coffee: restaurant({
    name: 'COSTA COFFEE', cuisine: 'Coffee', amenity: 'cafe',
    website: 'costacoffee.com', logoUrl: logo('costacoffee.com'),
    description: 'Combined from two on-site listings for the same brand within T3 — "COSTA COFFEE" and "Costa Coffee" — published under slightly different capitalization at its two T3 outlets.',
    outlets: [
      o('', 'T3 - before the Boarding Gate A923 after international security check', 'airside', '06:00～03:00'),
      o('', 'T3 - Commercial Zone of West Concourse', 'airside', '05:30-22:00'),
    ],
  }),
  luckin_coffee_t3: restaurant({
    name: 'luckin coffee', cuisine: 'Coffee', amenity: 'cafe',
    website: 'luckincoffee.com', logoUrl: logo('luckincoffee.com'),
    outlets: [o('', 'T3-West Side of Domestic Arrivals', 'landside', '06:30-22:00')],
  }),
  kfc_t3: restaurant({
    name: 'KFC', cuisine: 'Fast Food, Fried Chicken', amenity: 'fast_food',
    website: 'kfc.com', logoUrl: logo('kfc.com'),
    outlets: [
      o('5', 'T3-Concentrated Dining Area on the 5th Floor', 'landside', '24 hours', true),
      o('', 'T3 - beside the Boarding Gate B923 after domestic security check', 'airside', '07:00-Flight ends'),
      o('', 'T3 - Commercial Zone of West Concourse', 'airside', '07:00-Flight ends'),
      o('', 'T3 - before the Boarding Gate A826 after international security check', 'airside', '07:00-Flight ends'),
    ],
  }),
  yujian_xiaomian_t3: restaurant({
    name: 'XIAO NOODLES', cuisine: 'Noodles', amenity: 'restaurant',
    outlets: [
      o('5', 'T3-Concentrated Dining Area on the 5th Floor', 'landside', '06:00-22:00'),
      o('1', 'T3-Transportation Center F1', 'landside', '06:30-22:00'),
    ],
  }),
  laoguangji: restaurant({
    name: 'Lao guang ji', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [
      o('', 'T3 - beside the Boarding Gate B911 after domestic security check', 'airside', '06:00-22:00'),
      o('', 'T3 - beside the Boarding Gate B938 after domestic security check', 'airside', '06:00-22:00'),
      o('', 'T3 - opposite Boarding Gate B825 and B826 after domestic security check', 'airside', '06:00-Flight ends'),
    ],
  }),
  xiguan_zhuyuan: restaurant({
    name: 'Xiguan Bamboo Garden', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [
      o('1', 'T3-Transportation Center F1', 'landside', '06:30-22:00'),
      o('5', 'T3 Main Terminal, West Side Commercial Zone, Fifth Floor', 'landside', '24 hours', true),
    ],
  }),
  mcdonalds_t3: restaurant({
    name: "McDonald's", cuisine: 'Fast Food, Burgers', amenity: 'fast_food',
    website: 'mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [
      o('1', 'T3-Transportation Center F1', 'landside', '07:00-24:00'),
      o('', 'T3 - opposite Boarding Gate B828 after domestic security check', 'airside', '07:00-22:00'),
    ],
  }),
  jiumaojiu_t3: restaurant({
    name: 'JIUMAOJIU', cuisine: 'Northwestern Chinese', amenity: 'restaurant',
    outlets: [o('', 'T3 - beside the Boarding Gate B926 after domestic security check', 'airside', '07:00-22:00')],
  }),
  laowanhui: restaurant({
    name: 'Lao Wan Hui', cuisine: 'Shaanxi Noodles', amenity: 'restaurant',
    outlets: [o('', 'T3-At the entrance of the Southeast Finger Corridor after passing through the domestic security check', 'airside', '07:00-Flight ends')],
  }),
  starbucks_t3: restaurant({
    name: 'Starbucks', cuisine: 'Coffee', amenity: 'cafe',
    website: 'starbucks.com', logoUrl: logo('starbucks.com'),
    outlets: [
      o('', 'T3 - between Boarding Gate B821 and B822 after domestic security check', 'airside', '05:00-22:00'),
      o('', 'T3 - before the Boarding Gate A821 after international security check', 'airside', '07:00-22:00'),
    ],
  }),
  weiqian_lamian_t3: restaurant({
    name: 'Ajisen Ramen', cuisine: 'Japanese Ramen', amenity: 'restaurant',
    website: 'ajisen.com.cn', logoUrl: logo('ajisen.com.cn'),
    outlets: [o('', 'T3 - beside Boarding Gate B822 after domestic security check', 'airside', '07:00-22:00')],
  }),
  m_stand: restaurant({
    name: 'M Stand', cuisine: 'Coffee', amenity: 'cafe',
    outlets: [
      o('', 'T3 - opposite Boarding Gate B826 and B827 after domestic security check', 'airside', '07:00-22:00'),
      o('', 'T3 - Commercial Zone of West Concourse', 'airside', '07:00-22:00'),
    ],
  }),
  mcdonalds_dessert: restaurant({
    name: 'McDonalds', cuisine: 'Ice Cream, Desserts', amenity: 'fast_food',
    website: 'mcdonalds.com', logoUrl: logo('mcdonalds.com'),
    outlets: [o('', 'T3 - beside Boarding Gate B815 after domestic security check', 'airside', '07:00-22:00')],
  }),
  mancun_xiaoguan: restaurant({
    name: 'Ruby restaurant&Mancun', cuisine: 'Chinese', amenity: 'restaurant',
    outlets: [o('', 'T3 - before the Boarding Gate A925 after international security check', 'airside', '07:00-Flight ends')],
  }),
  dijiuwei_daxia_huntun: restaurant({
    name: 'D9 Prawn Wonton', cuisine: 'Wonton Noodles', amenity: 'restaurant',
    outlets: [o('', 'T3 - before the Boarding Gate A822after international security check', 'airside', '07:00-Flight ends')],
  }),
  keming_bingshi_laochengdu: restaurant({
    name: 'Keming Cafe、Old Chengdu Three-Flavor Noodles', cuisine: 'Hong Kong Dessert, Sichuan Noodles', amenity: 'restaurant',
    description: 'Published by the official site as one shared storefront listing two brand names; kept as a single doc rather than split.',
    outlets: [o('', 'T3 - between Boarding Gate B821 and B822 after domestic security check', 'airside', '06:00-Flight ends')],
  }),
  mengziyuan_t3: restaurant({
    name: 'CHINARICE', cuisine: 'Yunnan Rice Noodles', amenity: 'restaurant',
    outlets: [o('', 'T3 - before the Boarding Gate A826 after international security check', 'airside', '07:00-Flight ends')],
  }),
  laomaque: restaurant({
    name: 'LAOMAQUE', cuisine: 'Sichuan', amenity: 'restaurant',
    outlets: [o('', 'T3 - opposite Boarding Gate B821 after domestic security check', 'airside', '07:00-22:00')],
  }),
  taotaoju_t3: restaurant({
    name: 'To To Kui', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [o('', 'T3 - Commercial Zone of West Concourse', 'airside', '07:00-22:00')],
  }),
  meizhenxiang: restaurant({
    name: 'Bee Cheng Hian', cuisine: 'Bak Kwa (Dried Meat Snacks)', amenity: 'fast_food',
    website: 'beechenghiang.com.sg', logoUrl: logo('beechenghiang.com.sg'),
    outlets: [o('', 'T3 - beside the Boarding Gate B925 after domestic security check', 'airside', '07:00-22:00')],
  }),
  guangzhou_jiujia_t3: restaurant({
    name: 'Guangzhou Restaurant', cuisine: 'Cantonese', amenity: 'restaurant',
    outlets: [o('5', 'T3-Concentrated Dining Area on the 5th Floor', 'landside', '06:00-22:00')],
  }),
};

// ─── upload: detect airport slug, unconditionally wipe each terminal's ──────
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

  const r2 = await processTerminal(AIRPORT, TERMINAL_2, 'Terminal 2', terminal2Venues);
  const r3 = await processTerminal(AIRPORT, TERMINAL_3, 'Terminal 3', terminal3Venues);

  const purgeResult = await purgeOrphanedTerminals(AIRPORT, new Set([TERMINAL_2, TERMINAL_3]));

  const totalCreated = r2.created + r3.created;
  const totalDeleted = r2.deleted + r3.deleted;
  const totalVenues = Object.keys(terminal2Venues).length + Object.keys(terminal3Venues).length;

  console.log(`\nDone. Wiped ${totalDeleted} old venue doc(s), created ${totalCreated} new venue(s) from this file. Purged ${purgeResult.purgedTerminals} orphaned terminal doc(s) (and ${purgeResult.purgedRestaurants} restaurant doc(s) within them). Total: ${totalCreated}/${totalVenues}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
