#!/usr/bin/env node
// One-shot: convert attendance docs with status='tardy' to status='present'.
//
// Usage:
//   node scripts/migrate-remove-tardy.mjs           # dry run (counts + samples)
//   node scripts/migrate-remove-tardy.mjs --apply   # write changes

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';

// Load .env.local explicitly (dotenv alone only reads .env)
try {
  const envLocal = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envLocal.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY } = process.env;
if (!FB_PROJECT_ID || !FB_CLIENT_EMAIL || !FB_PRIVATE_KEY) {
  console.error('Missing one of FB_PROJECT_ID / FB_CLIENT_EMAIL / FB_PRIVATE_KEY');
  process.exit(1);
}

const apply = process.argv.includes('--apply');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FB_PROJECT_ID,
    clientEmail: FB_CLIENT_EMAIL,
    privateKey: FB_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

async function main() {
  const snap = await db.collection('attendance').where('status', '==', 'tardy').get();
  console.log(`Found ${snap.size} attendance docs with status='tardy'.`);

  if (!apply) {
    for (const doc of snap.docs.slice(0, 10)) {
      console.log('  sample:', doc.id, doc.data());
    }
    console.log('Dry run only. Pass --apply to commit changes.');
    return;
  }

  let batchCount = 0;
  let batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { status: 'present' });
    batchCount++;
    if (batchCount % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (batchCount % 400 !== 0) await batch.commit();
  console.log(`Updated ${batchCount} docs to status='present'.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
