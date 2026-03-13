import { NextRequest, NextResponse } from 'next/server';
import { createSession, getPeriods } from '@/lib/firestore';
import { getCallerRole } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { sessions } = await request.json();

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json(
        { error: 'Invalid data format' },
        { status: 400 }
      );
    }

    const periods = await getPeriods();
    const periodMap = new Map(periods.map(p => [p.number, p.id]));

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const session of sessions) {
      try {
        const periodId = periodMap.get(parseInt(session.period_number));
        if (!periodId) {
          throw new Error(`Invalid period number: ${session.period_number}`);
        }

        await createSession({
          period_id: periodId,
          name: session.name,
          type: session.type,
          location: session.location,
          faculty_id: session.faculty_id ? String(session.faculty_id) : undefined,
          ensemble: session.ensemble,
          instrument: session.instrument,
        });
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${sessions.indexOf(session) + 1}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error importing sessions:', error);
    return NextResponse.json({ error: 'Failed to import sessions' }, { status: 500 });
  }
}
