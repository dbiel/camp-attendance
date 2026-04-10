import { NextRequest, NextResponse } from 'next/server';
import { getCallerRole } from '@/lib/auth';
import { loadActiveCampServer, toPublicCampConfig } from '@/lib/camp-config';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const role = await getCallerRole(request);
    if (!role) {
      if (!checkRateLimit(`config-camp:${getClientIp(request)}`)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cfg = await loadActiveCampServer();
    if (role === 'teacher') {
      return NextResponse.json(toPublicCampConfig(cfg));
    }
    return NextResponse.json(cfg);
  } catch (error) {
    console.error('Error loading camp config:', error);
    return NextResponse.json({ error: 'Failed to load camp config' }, { status: 500 });
  }
}
