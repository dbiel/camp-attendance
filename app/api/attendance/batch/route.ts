import { NextRequest, NextResponse } from 'next/server';
import { markAttendanceBatch, AttendanceBatchItem } from '@/lib/firestore';
import { withAuth } from '@/lib/with-auth';
import { getClientIp } from '@/lib/rate-limit';
import { verifyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_ITEMS = 1000;
const VALID_STATUSES = new Set(['present', 'absent', 'tardy']);

export const POST = withAuth(
  'teacher',
  async (request: NextRequest, { role }) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const rawItems = (body as { items?: unknown }).items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { error: 'items[] required and non-empty' },
        { status: 400 }
      );
    }
    if (rawItems.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `batch too large (max ${MAX_ITEMS})` },
        { status: 413 }
      );
    }

    // Per-item validation. Bail on first bad item with its index.
    const items: AttendanceBatchItem[] = [];
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i] as Record<string, unknown> | null | undefined;
      if (
        !it ||
        typeof it !== 'object' ||
        typeof it.student_id !== 'string' ||
        typeof it.session_id !== 'string' ||
        typeof it.date !== 'string' ||
        typeof it.status !== 'string' ||
        !VALID_STATUSES.has(it.status)
      ) {
        return NextResponse.json(
          { error: `invalid item at index ${i}` },
          { status: 400 }
        );
      }
      items.push({
        student_id: it.student_id,
        session_id: it.session_id,
        date: it.date,
        status: it.status as 'present' | 'absent' | 'tardy',
      });
    }

    // Derive marked_by from verified identity; never trust client-supplied value.
    let markedBy: string;
    if (role === 'admin') {
      const admin = await verifyAdmin(request);
      markedBy = admin ? `admin:${admin.uid}` : 'admin';
    } else {
      markedBy = `teacher:${getClientIp(request)}`;
    }

    const result = await markAttendanceBatch(items, markedBy);
    return NextResponse.json(result);
  },
  { rateLimitKey: 'attendance-batch' }
);
