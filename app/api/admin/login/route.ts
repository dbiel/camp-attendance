import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// This endpoint is no longer used for cookie-based auth.
// Admin auth is now handled client-side via Firebase Auth.
// Kept for backwards compatibility during migration.
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Use Firebase Auth for admin login. This endpoint is deprecated.' },
    { status: 410 }
  );
}
