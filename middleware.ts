import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Auth is handled client-side by useAuth() + Firebase Auth.
  // Middleware just passes through — each page redirects if not authenticated.
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
