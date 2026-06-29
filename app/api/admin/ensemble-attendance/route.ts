import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * Admin period×day attendance grid data. One row per submitted ensemble-link
 * day+period (the `ensemble_attendance` docs), with the absent count derived
 * from the marks. Read-only; lookup_admin and up. Sorted day → period →
 * ensemble so the client can pivot it into a grid.
 */
interface GridRow {
  ensemble: string;
  day_key: string;
  period_number: number;
  period_name: string;
  roster_size: number;
  absent_count: number;
  submitted_at: string;
}

export const GET = withAuth(
  'lookup_admin',
  async () => {
    const snap = await adminDb.collection('ensemble_attendance').get();
    const rows: GridRow[] = snap.docs.map((d) => {
      const x = d.data() as {
        ensemble?: string;
        day_key?: string;
        period_number?: number;
        period_name?: string;
        marks?: Record<string, 'present' | 'absent'>;
        roster_size?: number;
        submitted_at?: string;
      };
      const absent = Object.values(x.marks ?? {}).filter((m) => m === 'absent').length;
      return {
        ensemble: x.ensemble ?? '',
        day_key: x.day_key ?? '',
        period_number: x.period_number ?? 0,
        period_name: x.period_name ?? (x.period_number ? `Period ${x.period_number}` : '—'),
        roster_size: x.roster_size ?? 0,
        absent_count: absent,
        submitted_at: x.submitted_at ?? '',
      };
    });
    rows.sort(
      (a, b) =>
        a.day_key.localeCompare(b.day_key) ||
        a.period_number - b.period_number ||
        a.ensemble.localeCompare(b.ensemble)
    );
    return NextResponse.json({ rows });
  },
  { rateLimitKey: 'admin-ensemble-attendance' }
);
