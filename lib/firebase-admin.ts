import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function getApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length) {
    _app = existing[0]!;
    return _app;
  }
  _app = initializeApp({
    credential: cert({
      projectId: process.env.FB_PROJECT_ID || process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FB_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: (process.env.FB_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
    }),
  });
  return _app;
}

export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getApp());
  return _db;
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(getApp());
  return _auth;
}

// Back-compat exports — callers use these today. Both are lazy because they
// only resolve when a property is accessed, which happens at request time.
// TODO(code-health): migrate callers to getAdminDb() / getAdminAuth() and remove.
export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    return Reflect.get(getAdminDb(), prop, receiver);
  },
});

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    return Reflect.get(getAdminAuth(), prop, receiver);
  },
});
