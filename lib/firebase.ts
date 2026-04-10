import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// During `next build`, env vars for the production deploy may not be set
// yet — the build itself just needs the module to import cleanly. At
// runtime, missing config is a hard error to avoid silently shipping an
// app pointed at demo-project.
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!isBuild && (!apiKey || !authDomain || !projectId)) {
  throw new Error(
    'Missing NEXT_PUBLIC_FIREBASE_* env vars. Set NEXT_PUBLIC_FIREBASE_API_KEY, ' +
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID.'
  );
}

const firebaseConfig = {
  apiKey: apiKey || 'dummy-key-for-build',
  authDomain: authDomain || 'localhost',
  projectId: projectId || 'demo-project',
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export default app;
