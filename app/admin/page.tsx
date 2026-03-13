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
  const { user, loading: authLoading, signIn } = useAuth();

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

        <form onSubmit={handleLogin} className="space-y-4">
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

          {error && <div className="text-red-600 text-sm font-semibold">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full camp-btn-primary py-3 text-lg font-bold disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <a href="/" className="text-camp-green hover:opacity-75 font-medium text-center block">
            &larr; Back to Main
          </a>
        </div>
      </div>
    </div>
  );
}
