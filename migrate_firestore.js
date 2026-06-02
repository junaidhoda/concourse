/**
 * Firestore migration script
 *
 * What it does:
 *  1. Reads every restaurant document across all airports & terminals
 *  2. Migrates each doc to the new schema:
 *       - Promotes additional.description → description (top-level)
 *       - Promotes additional.website     → website    (top-level)
 *       - Builds an `outlets` array from legacy airside / additional.level / additional.location_notes
 *       - Removes the now-redundant `additional` map and `airside` root field
 *  3. Skips docs that already have an `outlets` array
 *
 * Setup:
 *  1. Go to Firebase Console → Project Settings → Service Accounts
 *  2. Click "Generate new private key" → save as serviceAccountKey.json in this folder
 *  3. node migrate_firestore.js
 */

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const KEY_PATH = process.env.KEY_PATH ||
  path.join(require('os').homedir(), '.firebase', 'airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');

if (!fs.existsSync(KEY_PATH)) {
  console.error('\n❌  Service account key not found at:', KEY_PATH);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
});

const db = admin.firestore();

// All airports stored as slugs in Firestore
const AIRPORT_SLUGS = [
  'heathrow', 'gatwick', 'birmingham', 'manchester',
  'cdg', 'fra', 'jfk', 'lax', 'sin', 'dxb', 'bkk', 'ist',
];

function buildOutletFromLegacy(data) {
  const additional = data.additional || {};
  return {
    gate_area:      '',
    airside:        data.airside        || '',
    level:          additional.level    || '',
    location_notes: additional.location_notes || '',
  };
}

async function migrateAirport(airportSlug) {
  const terminalsSnap = await db
    .collection('airports').doc(airportSlug)
    .collection('terminals')
    .get();

  if (terminalsSnap.empty) return;

  for (const terminalDoc of terminalsSnap.docs) {
    const restaurantsSnap = await terminalDoc.ref.collection('restaurants').get();
    if (restaurantsSnap.empty) continue;

    const batch = db.batch();
    let count = 0;

    for (const restaurantDoc of restaurantsSnap.docs) {
      const data = restaurantDoc.data();

      // Already migrated — skip
      if (Array.isArray(data.outlets)) continue;

      const additional = data.additional || {};

      const update = {
        // Promote from additional
        description: data.description || additional.description || '',
        website:     data.website     || additional.website     || '',

        // Build outlets from legacy single-location fields
        outlets: [buildOutletFromLegacy(data)],

        // Clean up old fields
        additional: admin.firestore.FieldValue.delete(),
        airside:    admin.firestore.FieldValue.delete(),

        // Remove fields that no longer belong at root level
        brand:          admin.firestore.FieldValue.delete(),
        terminal_name:  admin.firestore.FieldValue.delete(),
        terminal_short: admin.firestore.FieldValue.delete(),
        terminal_id:    admin.firestore.FieldValue.delete(),
      };

      batch.update(restaurantDoc.ref, update);
      count++;
    }

    if (count > 0) {
      await batch.commit();
      console.log(`  ✓ ${airportSlug} / ${terminalDoc.id}: migrated ${count} restaurant(s)`);
    }
  }
}

async function main() {
  console.log('\n🚀  Starting Firestore migration...\n');
  for (const slug of AIRPORT_SLUGS) {
    process.stdout.write(`📍 ${slug}...`);
    try {
      await migrateAirport(slug);
      console.log(' done');
    } catch (e) {
      console.log(` skipped (${e.message})`);
    }
  }
  console.log('\n✅  Migration complete.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
