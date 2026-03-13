import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

function getApp(): App {
  if (getApps().length) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FB_PROJECT_ID || process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FB_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: (process.env.FB_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
    }),
  });
}

// Lazy getters — avoid initializing at module load (breaks next build when env vars are empty)
let _db: Firestore | null = null;
let _auth: Auth | null = null;

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_, prop) {
    if (!_db) _db = getFirestore(getApp());
    return (_db as any)[prop];
  },
});

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    if (!_auth) _auth = getAuth(getApp());
    return (_auth as any)[prop];
  },
});
