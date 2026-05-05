import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = [
  '/dashboard',
  '/setup',
  '/story',
  '/audio-generation',
  '/video-preview',
  '/video'
];

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value;
  const { pathname } = request.nextUrl;

  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  if (isProtectedRoute && !session) {
    const url = new URL('/auth', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Prevent logged-in users from visiting auth pages
  const isAuthRoute = pathname === '/auth' || pathname === '/signup' || pathname === '/forgot-password' || pathname === '/reset-password';
  
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
