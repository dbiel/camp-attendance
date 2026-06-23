import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
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
  // Local/dev: explicit service-account credentials from env.
  // Prod (Cloud Functions/frameworks): no env key present, so fall back to
  // Application Default Credentials — the deployed function's own service
  // account — instead of crashing. Keeps secrets out of the deployed bundle.
  const projectId = process.env.FB_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FB_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FB_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  _app = initializeApp(
    privateKey && clientEmail
      ? { credential: cert({ projectId, clientEmail, privateKey }) }
      : { credential: applicationDefault(), projectId }
  );
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
// Methods are bound to the real instance so `this` points at the target, not
// the Proxy (admin SDK methods rely on internal state via `this`).
// TODO(code-health): migrate callers to getAdminDb() / getAdminAuth() and remove.
export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const target = getAdminDb();
    const value = Reflect.get(target, prop);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const target = getAdminAuth();
    const value = Reflect.get(target, prop);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
