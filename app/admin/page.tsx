'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, loading: authLoading, signIn, signInWithGoogle } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/admin/dashboard');
    }
  }, [user, authLoading, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      router.push('/admin/dashboard');
    } catch (err: any) {
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        setError('Invalid email or password');
      } else if (err?.code === 'auth/user-not-found') {
        setError('No account found with this email');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push('/admin/dashboard');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        // User dismissed the popup; no error message needed.
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Browser blocked the sign-in popup. Allow popups and try again.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for Google sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-camp-green to-camp-light flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-camp-green to-camp-light flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-camp-green mb-2 text-center">Admin Portal</h1>
        <p className="text-gray-600 text-center mb-6">TTU Band & Orchestra Camp</p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 hover:border-camp-green text-gray-700 rounded-lg py-3 px-4 font-semibold transition-all disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        {error && <div className="text-red-600 text-sm font-semibold mt-4">{error}</div>}

        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            Sign in with email/password instead
          </summary>
        <form onSubmit={handleLogin} className="space-y-4 mt-4">
          <div>
            <label className="camp-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="camp-input"
              disabled={loading}
              autoFocus
            />
          </div>
          <div>
            <label className="camp-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="camp-input"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full camp-btn-primary py-3 text-lg font-bold disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        </details>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <a href="/" className="text-camp-green hover:opacity-75 font-medium text-center block">
            &larr; Back to Main
          </a>
        </div>
      </div>
    </div>
  );
}
