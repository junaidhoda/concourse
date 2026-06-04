const admin = require('firebase-admin');
const path = require('path');
const KEY_PATH = path.join(require('os').homedir(), '.firebase', 'airport-app-20516-firebase-adminsdk-fbsvc-96d88f4ebf.json');
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cleanup() {
  const airports = await db.collection('airports').get();
  let total = 0;
  for (const a of airports.docs) {
    await sleep(500);
    const terminals = await a.ref.collection('terminals').get();
    for (const t of terminals.docs) {
      await sleep(400);
      const restaurants = await t.ref.collection('restaurants').get();
      const toUpdate = restaurants.docs.filter(r => r.data().logo_url !== undefined);
      if (toUpdate.length === 0) continue;
      for (let i = 0; i < toUpdate.length; i += 400) {
        const batch = db.batch();
        toUpdate.slice(i, i + 400).forEach(r => {
          batch.update(r.ref, { logo_url: admin.firestore.FieldValue.delete() });
        });
        await batch.commit();
        total += toUpdate.slice(i, i + 400).length;
        await sleep(200);
      }
      process.stdout.write('.');
    }
    console.log(' ' + a.id);
    await sleep(500);
  }
  console.log('\nDone. Removed logo_url from ' + total + ' documents.');
  process.exit(0);
}
cleanup().catch(e => { console.error(e.message); process.exit(1); });
