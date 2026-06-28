import { NextRequest, NextResponse } from 'next/server';
import { getRosterForToken } from '@/lib/ensemble-attendance';
import { rosterWorkbook, studentsToRosterRows, XLSX_CONTENT_TYPE } from '@/lib/xlsx-export';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Per-ensemble roster export from the open attendance page (token-gated, no
 * login). Returns a single-sheet .xlsx of just THAT ensemble's roster
 * (Name · Instrument · Grade) — same scoped data the page already shows, no
 * PII. Unknown/revoked tokens → uniform 404; rate-limited per IP.
 */
export const GET = async (
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`e:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const data = await getRosterForToken(params.token);
  if (!data) {
    return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
  }

  const buf = rosterWorkbook([{ ensemble: data.ensemble, rows: studentsToRosterRows(data.roster) }]);
  const safe = data.ensemble.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'ensemble';
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${safe}-roster.xlsx"`,
    },
  });
};
