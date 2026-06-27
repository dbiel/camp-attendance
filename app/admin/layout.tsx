'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * Single source of nav truth for the admin app. Renders one shared top-tab
 * shell so every page stops hand-rolling its own header.
 *
 *   Primary:  Active Reports | Data | Inbox(super only)   + gear → Settings / Sign out
 *   Sub-row:  Reports | Students | Faculty | Sessions      (only on Data routes)
 *
 * Renders bare children (no chrome) on the login page (`/admin`) and whenever
 * there is no signed-in user — mirroring each child's own `if (!user)` guard so
 * there's no chrome flash during the redirect.
 */

type Primary = 'reports' | 'data' | 'inbox' | null;

const PRIMARY_TABS: { key: Exclude<Primary, null>; label: string; href: string; superOnly?: boolean }[] = [
  { key: 'reports', label: 'Active Reports', href: '/admin/cases' },
  { key: 'data', label: 'Data', href: '/admin/data/students' },
  { key: 'inbox', label: 'Inbox', href: '/admin/inbox', superOnly: true },
];

const SUB_TABS: { key: string; label: string; href: string }[] = [
  { key: 'reports', label: 'Reports', href: '/admin/cases/history' },
  { key: 'students', label: 'Students', href: '/admin/data/students' },
  { key: 'faculty', label: 'Faculty', href: '/admin/data/faculty' },
  { key: 'sessions', label: 'Sessions', href: '/admin/data/sessions' },
];

/** Explicit route → tab mapping (no loose startsWith that would misfire). */
function resolveTabs(pathname: string): { primary: Primary; sub: string | null } {
  if (pathname === '/admin/cases/history') return { primary: 'data', sub: 'reports' };
  if (pathname === '/admin/cases' || pathname.startsWith('/admin/cases/')) return { primary: 'reports', sub: null };
  if (pathname.startsWith('/admin/data/faculty')) return { primary: 'data', sub: 'faculty' };
  if (pathname.startsWith('/admin/data/sessions')) return { primary: 'data', sub: 'sessions' };
  if (pathname.startsWith('/admin/data/')) return { primary: 'data', sub: 'students' };
  if (pathname.startsWith('/admin/inbox')) return { primary: 'inbox', sub: null };
  return { primary: null, sub: null };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { user, isSuperAdmin, signOut } = useAuth();

  // Login page and unauthenticated states get no chrome.
  if (pathname === '/admin' || !user) return <>{children}</>;

  const { primary, sub } = resolveTabs(pathname);
  const showSubRow = primary === 'data';
  const visiblePrimary = PRIMARY_TABS.filter((t) => !t.superOnly || isSuperAdmin);

  async function handleSignOut() {
    await signOut();
    router.push('/admin');
  }

  const primaryClass = (active: boolean) =>
    `px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap ${
      active ? 'bg-white text-camp-green' : 'text-white/85 hover:bg-white/10'
    }`;
  const subClass = (active: boolean) =>
    `px-3 py-1 rounded text-sm whitespace-nowrap ${
      active ? 'bg-white/25 text-white font-semibold' : 'text-white/75 hover:bg-white/10'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-camp-green text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-2">
            <nav className="flex items-center gap-1 overflow-x-auto">
              {visiblePrimaryLinks(visiblePrimary, primary, primaryClass)}
            </nav>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/admin/settings" className="text-white/85 hover:text-white text-sm" aria-label="Settings">
                Settings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-white/85 hover:text-white text-sm"
              >
                Sign out
              </button>
            </div>
          </div>
          {showSubRow && (
            <nav className="flex items-center gap-1 overflow-x-auto pb-2 -mt-1">
              {SUB_TABS.map((t) => (
                <Link key={t.key} href={t.href} className={subClass(sub === t.key)}>
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

function visiblePrimaryLinks(
  tabs: typeof PRIMARY_TABS,
  active: Primary,
  cls: (a: boolean) => string
) {
  return tabs.map((t) => (
    <Link key={t.key} href={t.href} className={cls(active === t.key)}>
      {t.label}
    </Link>
  ));
}
