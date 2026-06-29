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

type Primary = 'incident' | 'data' | null;

// Two sections only: Incident + Data. Inbox/iMessage is dropped from nav (code
// kept dormant at /admin/inbox in case David wants it back).
const PRIMARY_TABS: { key: Exclude<Primary, null>; label: string; href: string }[] = [
  { key: 'incident', label: 'Incident', href: '/admin/cases' },
  { key: 'data', label: 'Data', href: '/admin/data/students' },
];

const SUB_TABS: { key: string; label: string; href: string }[] = [
  { key: 'reports', label: 'Reports', href: '/admin/cases/history' },
  { key: 'students', label: 'Students', href: '/admin/data/students' },
  { key: 'faculty', label: 'Faculty', href: '/admin/data/faculty' },
  { key: 'sessions', label: 'Classes', href: '/admin/data/sessions' },
  { key: 'attendance', label: 'Attendance', href: '/admin/data/attendance' },
];

/** Explicit route → tab mapping (no loose startsWith that would misfire). */
function resolveTabs(pathname: string): { primary: Primary; sub: string | null } {
  if (pathname === '/admin/cases/history') return { primary: 'data', sub: 'reports' };
  if (pathname === '/admin/cases' || pathname.startsWith('/admin/cases/')) return { primary: 'incident', sub: null };
  if (pathname.startsWith('/admin/data/faculty')) return { primary: 'data', sub: 'faculty' };
  if (pathname.startsWith('/admin/data/sessions')) return { primary: 'data', sub: 'sessions' };
  if (pathname.startsWith('/admin/data/attendance')) return { primary: 'data', sub: 'attendance' };
  if (pathname.startsWith('/admin/data/')) return { primary: 'data', sub: 'students' };
  return { primary: null, sub: null };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { user, signOut } = useAuth();

  // Login page and unauthenticated states get no chrome.
  if (pathname === '/admin' || !user) return <>{children}</>;

  const { primary, sub } = resolveTabs(pathname);
  const showSubRow = primary === 'data';
  const visiblePrimary = PRIMARY_TABS;

  async function handleSignOut() {
    await signOut();
    router.push('/admin');
  }

  const primaryClass = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap ${
      active
        ? 'font-semibold text-[var(--text)] bg-white/60 shadow-sm'
        : 'font-medium text-[var(--text-2)] hover:text-[var(--text)] hover:bg-white/30 transition-all'
    }`;
  const subClass = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap ${
      active
        ? 'font-semibold text-[var(--text)] bg-white/60 shadow-sm'
        : 'font-medium text-[var(--text-2)] hover:text-[var(--text)] hover:bg-white/30 transition-all'
    }`;

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <header className="glass sticky top-0 z-40 shadow-md">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-2">
            <nav className="glass rounded-full p-1 flex items-center gap-1 overflow-x-auto">
              {visiblePrimaryLinks(visiblePrimary, primary, primaryClass)}
            </nav>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/admin/settings" className="text-[var(--text-2)] hover:text-[var(--text)] text-sm" aria-label="Settings">
                Settings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-[var(--text-2)] hover:text-[var(--text)] text-sm"
              >
                Sign out
              </button>
            </div>
          </div>
          {showSubRow && (
            <div className="pb-2">
              <nav className="glass rounded-full p-1 flex items-center gap-1 overflow-x-auto">
                {SUB_TABS.map((t) => (
                  <Link key={t.key} href={t.href} className={subClass(sub === t.key)}>
                    {t.label}
                  </Link>
                ))}
              </nav>
            </div>
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
