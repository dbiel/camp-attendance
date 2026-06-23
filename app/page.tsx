import { redirect } from 'next/navigation';

// Admin-only incident command center: land straight on the admin portal
// (Google sign-in, no camp code). The dormant teacher flow lives at /teacher.
// force-dynamic so the redirect runs in the SSR function at request time
// rather than being statically prerendered (which errors under frameworks).
export const dynamic = 'force-dynamic';

export default function Home() {
  redirect('/admin');
}
