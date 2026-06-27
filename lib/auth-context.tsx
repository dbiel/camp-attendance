'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth } from './firebase';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';

/** Resolved admin tier for client-side chrome. `'admin'` === super_admin.
 * COSMETIC ONLY — the real boundary is server-side per-route enforcement. */
export type ClientRole = 'admin' | 'lookup_admin' | null;

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** Resolved role from /api/me, or null until known / if unauthorized. */
  role: ClientRole;
  /** True only once /api/me confirms a super admin. */
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<ClientRole>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Resolve the client role from the server whenever the signed-in user
  // changes. Cosmetic gate only; failures simply leave role null.
  useEffect(() => {
    let cancelled = false;
    async function resolveRole() {
      if (!user) {
        setRole(null);
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          if (!cancelled) setRole(null);
          return;
        }
        const body = (await res.json()) as { role: ClientRole };
        if (!cancelled) setRole(body.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      }
    }
    resolveRole();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }

  async function signOut() {
    setRole(null);
    await firebaseSignOut(auth);
  }

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        role,
        isSuperAdmin: role === 'admin',
        signIn,
        signInWithGoogle,
        signOut,
        getAuthHeaders,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
