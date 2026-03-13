/**
 * CI script: seed test data into Firebase Emulator and write admin token to env.
 * Run with: npx tsx tests/setup/seed-and-start.ts
 */
import { seedTestData, getAdminToken, clearFirestore } from './emulator.setup';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  console.log('Clearing Firestore emulator...');
  await clearFirestore();

  console.log('Seeding test data...');
  const ids = await seedTestData();
  console.log('Seeded:', {
    periods: ids.periodIds.length,
    faculty: ids.facultyIds.length,
    sessions: ids.sessionIds.length,
    students: ids.studentIds.length,
  });

  console.log('Getting admin token...');
  const token = await getAdminToken();
  console.log('Admin token obtained.');

  // Write token to .env.test for integration tests to pick up
  const envContent = `TEST_ADMIN_TOKEN=${token}\nTEST_BASE_URL=http://localhost:3000\n`;
  writeFileSync(resolve(__dirname, '../../.env.test'), envContent);
  console.log('Wrote .env.test with admin token.');

  // Also export for current process
  process.env.TEST_ADMIN_TOKEN = token;

  console.log('Done! Ready for integration tests.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
