#!/usr/bin/env bash
set -euo pipefail

# Bootstrap Firebase emulator, mint a TEST_ADMIN_TOKEN, run integration tests.
# Usage:
#   scripts/test-with-emulator.sh                     # runs tests/integration/ + tests/security/
#   scripts/test-with-emulator.sh tests/security/     # runs only given path

TARGET_PATHS="${*:-tests/integration/ tests/security/}"

export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FB_PROJECT_ID=demo-test-project
export FIREBASE_PROJECT_ID=demo-test-project
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test-project
export CAMP_CODE=test-camp-2026

npx firebase emulators:start --only firestore,auth --project demo-test-project &
EMULATOR_PID=$!
trap "kill $EMULATOR_PID 2>/dev/null || true" EXIT

for i in {1..30}; do
  if curl -s "http://127.0.0.1:8080" > /dev/null 2>&1 && \
     curl -s "http://127.0.0.1:9099" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

TEST_ADMIN_TOKEN=$(node -e "
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ projectId: 'demo-test-project' });
(async () => {
  const auth = getAuth();
  let uid;
  try {
    const u = await auth.getUserByEmail('admin@test.com');
    uid = u.uid;
  } catch {
    const u = await auth.createUser({ email: 'admin@test.com', password: 'testpassword123' });
    uid = u.uid;
  }
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const json = await res.json();
  process.stdout.write(json.idToken);
})();
")
export TEST_ADMIN_TOKEN

if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
  npm run dev &
  DEV_PID=$!
  trap "kill $DEV_PID 2>/dev/null || true; kill $EMULATOR_PID 2>/dev/null || true" EXIT
  for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then break; fi
    sleep 1
  done
fi

npx vitest run $TARGET_PATHS
