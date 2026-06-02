/**
 * Firestore cleanup script — strips junk fields, keeps only crucial data.
 *
 * For each restaurant doc it:
 *  - Extracts cuisine + dietary flags from `categories`, then deletes `categories`
 *  - Derives `amenity` type from the category if missing
 *  - Migrates `floor_level` → outlets[0].level if outlet level is blank, then deletes it
 *  - Keeps: name, cuisine, amenity, description, website, opening_hours, dietary{}, outlets[]
 *  - Deletes: airport, verified_status, lat, lon, osm_id, phone, address, takeaway,
 *             wheelchair_accessible, reservable, delivery, kids_menu, open_24_7,
 *             vegan_options, vegetarian_options, halal (root-level), categories,
 *             floor_level, all per-day opening_* fields
 */

const admin = require('firebase-admin');
const os    = require('os');
const path  = require('path');

const KEY_PATH = path.join(os.homedir(), '.firebase', 'airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });

const db  = admin.firestore();
const DEL = admin.firestore.FieldValue.delete();

const AIRPORTS = ['heathrow','gatwick','birmingham','manchester','cdg','fra','jfk','lax','sin','dxb','bkk','ist'];

const JUNK_FIELDS = [
  'airport','verified_status','lat','lon','osm_id','phone','address',
  'takeaway','wheelchair_accessible','reservable','delivery','kids_menu','open_24_7',
  'vegan_options','vegetarian_options','halal',
  'opening_monday','opening_tuesday','opening_wednesday','opening_thursday',
  'opening_friday','opening_saturday','opening_sunday',
  'floor_level','categories',
];

const DIETARY_TAGS = new Set(['gluten-free','halal','vegan','vegetarian']);

function deriveAmenity(categoryStr) {
  const c = (categoryStr || '').toLowerCase();
  if (c.includes('coffee') || c.includes('café') || c.includes('cafe') || c.includes('espresso')) return 'cafe';
  if (c.includes('pub'))        return 'pub';
  if (c.includes('bar'))        return 'bar';
  if (c.includes('fast food') || c.includes('fast_food')) return 'fast_food';
  if (c.includes('bakery'))     return 'bakery';
  if (c.includes('ice cream'))  return 'ice_cream';
  if (c.includes('food court')) return 'food_court';
  if (c.includes('confection')) return 'confectionery';
  return 'restaurant';
}

async function cleanupAirport(slug) {
  const terminalsSnap = await db.collection('airports').doc(slug).collection('terminals').get();
  if (terminalsSnap.empty) return 0;

  let total = 0;

  for (const termDoc of terminalsSnap.docs) {
    const restsSnap = await termDoc.ref.collection('restaurants').get();
    if (restsSnap.empty) continue;

    const batch = db.batch();
    let count = 0;

    for (const restDoc of restsSnap.docs) {
      const data = restDoc.data();
      const update = {};

      // ── Parse categories ────────────────────────────────────
      const rawCategories = (data.categories || '').split(',').map(s => s.trim()).filter(Boolean);
      const dietaryCats   = rawCategories.filter(c => DIETARY_TAGS.has(c.toLowerCase()));
      const venueCats     = rawCategories.filter(c => !DIETARY_TAGS.has(c.toLowerCase()));

      // ── Populate cuisine from categories if blank ────────────
      if (!data.cuisine && venueCats.length > 0) {
        update.cuisine = venueCats[0];
      }

      // ── Derive amenity if missing ────────────────────────────
      if (!data.amenity) {
        update.amenity = deriveAmenity(venueCats[0] || data.cuisine || '');
      }

      // ── Build / update dietary object ────────────────────────
      const existing = data.dietary || {};
      update.dietary = {
        vegan:       existing.vegan       || dietaryCats.some(c => c.toLowerCase() === 'vegan'),
        vegetarian:  existing.vegetarian  || dietaryCats.some(c => c.toLowerCase() === 'vegetarian'),
        halal:       existing.halal       || dietaryCats.some(c => c.toLowerCase() === 'halal'),
        kosher:      existing.kosher      || false,
        gluten_free: existing.gluten_free || dietaryCats.some(c => c.toLowerCase() === 'gluten-free'),
      };

      // ── Migrate floor_level → outlets[0].level if blank ─────
      if (data.floor_level && Array.isArray(data.outlets) && data.outlets.length > 0) {
        const outlets = data.outlets.map((o, i) => {
          if (i === 0 && !o.level) return { ...o, level: `Floor ${data.floor_level}` };
          return o;
        });
        update.outlets = outlets;
      }

      // ── Delete all junk fields ───────────────────────────────
      for (const field of JUNK_FIELDS) {
        if (field in data) update[field] = DEL;
      }

      batch.update(restDoc.ref, update);
      count++;
    }

    if (count > 0) {
      await batch.commit();
      total += count;
      console.log(`  ✓ ${slug} / ${termDoc.id}: cleaned ${count} doc(s)`);
    }
  }
  return total;
}

async function main() {
  console.log('\n🧹  Starting Firestore cleanup...\n');
  let grand = 0;
  for (const slug of AIRPORTS) {
    process.stdout.write(`📍 ${slug}...`);
    try {
      const n = await cleanupAirport(slug);
      grand += n;
      console.log(n > 0 ? ' done' : ' (no data)');
    } catch (e) {
      console.log(` skipped (${e.message})`);
    }
  }
  console.log(`\n✅  Done — ${grand} documents cleaned.\n`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
