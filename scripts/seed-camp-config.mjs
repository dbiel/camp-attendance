#!/usr/bin/env node
/**
 * One-shot: seed the initial `config/camp` doc in Firestore so the
 * Settings page can load. Safe to re-run — if the doc exists, it bails
 * without writing.
 *
 * Usage:
 *   node scripts/seed-camp-config.mjs
 *
 * Reads the same env vars the app's admin SDK uses:
 *   FB_PROJECT_ID, FB_CLIENT_EMAIL, FB_PRIVATE_KEY
 */
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

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FB_PROJECT_ID,
    clientEmail: FB_CLIENT_EMAIL,
    privateKey: FB_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();
const docRef = db.collection('config').doc('camp');

const existing = await docRef.get();
if (existing.exists) {
  console.log('config/camp already exists — no changes. Current:');
  console.log(JSON.stringify(existing.data(), null, 2));
  process.exit(0);
}

// Generate a random 8-char camp code from an unambiguous charset
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const { randomInt } = await import('node:crypto');
let campCode = '';
for (let i = 0; i < 8; i++) campCode += CHARSET[randomInt(0, CHARSET.length)];

// Default dates: a week in summer 2026. Admin can edit via Settings.
const year = 2026;
const startDate = '2026-06-08';  // Monday
const endDate = '2026-06-13';    // Saturday

// Derive day_dates inline
const dayKeys = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];
const dayDates = {};
const start = new Date(`${startDate}T00:00:00`);
const end = new Date(`${endDate}T00:00:00`);
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const key = dayKeys[(d.getDay() + 6) % 7]; // Mon=0 → 'M'
  const iso = d.toISOString().slice(0, 10);
  dayDates[key] = iso;
}

const seed = {
  camp_id: String(year),
  camp_code: campCode,
  camp_year: year,
  start_date: startDate,
  end_date: endDate,
  timezone: 'America/Chicago',
  day_dates: dayDates,
};

await docRef.set(seed);
console.log('Seeded config/camp:');
console.log(JSON.stringify(seed, null, 2));
console.log(`\nCamp code for teachers: ${campCode}`);
process.exit(0);
