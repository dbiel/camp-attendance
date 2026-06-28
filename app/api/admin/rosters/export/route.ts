import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getStudents } from '@/lib/firestore';
import { rosterWorkbook, studentsToRosterRows, XLSX_CONTENT_TYPE } from '@/lib/xlsx-export';
import type { Student } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Admin "all rosters" export → an .xlsx with one tab per ensemble
 * (Name · Instrument · Grade). Available to any admin (lookup_admin+) — these
 * three columns are the same light info shown on the attendance screen, no PII.
 */
export const GET = withAuth('lookup_admin', async () => {
  const students = await getStudents();
  const byEnsemble = new Map<string, Student[]>();
  for (const s of students) {
    const key = s.ensemble || 'Unassigned';
    const list = byEnsemble.get(key);
    if (list) list.push(s);
    else byEnsemble.set(key, [s]);
  }
  const groups = [...byEnsemble.entries()].map(([ensemble, list]) => ({
    ensemble,
    rows: studentsToRosterRows(list),
  }));
  const buf = rosterWorkbook(groups);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': 'attachment; filename="camp-rosters.xlsx"',
    },
  });
});
