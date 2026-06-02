/**
 * Sets isAdmin: true in Firestore for each UID listed below.
 * Run: node set_admins.js
 */

const admin = require('firebase-admin');
const os    = require('os');
const path  = require('path');

const KEY_PATH = path.join(os.homedir(), '.firebase', 'airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });

const db = admin.firestore();

// Add any new UIDs here
const ADMIN_UIDS = [
  '9nwacTi5inQzvIHnLwjnPWYYTNH2',
  'IdYySfQ2yoVFvNurm9MVLJca2mo2',
  'MveIrGs0dYbAkQQbMGWnL0ryscs1',
  // Paste new UID below:
  // 'NEW_UID_HERE',
];

async function main() {
  console.log('\n🔐  Setting admin users...\n');
  for (const uid of ADMIN_UIDS) {
    await db.collection('users').doc(uid).set({ isAdmin: true }, { merge: true });
    console.log(`  ✓ ${uid}`);
  }
  console.log('\n✅  Done.\n');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
