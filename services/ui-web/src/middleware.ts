/**
 * Next.js Middleware for Authentication
 * 
 * This middleware protects routes that require authentication:
 * - /upload, /clarify, /summarize require auth
 * - Landing page, login, signup are public
 * - API routes handle their own auth
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

// Routes that require authentication
const protectedRoutes = [
  '/upload',
  '/clarify',
  '/summarize',
  '/settings',
];

// Routes that should redirect to /upload if already authenticated
const authRoutes = [
  '/login',
  '/signup',
];

// Public routes (no auth check needed)
const publicRoutes = [
  '/',
  '/api/health',
  '/api/auth',
  '/diagnostics',
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Check if this is an API route (handled separately)
  if (pathname.startsWith('/api/')) {
    // Auth routes are always accessible
    if (pathname.startsWith('/api/auth')) {
      return NextResponse.next();
    }
    // Other API routes - let them handle their own auth
    return NextResponse.next();
  }

  // Check if this is a protected route
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  // Check if this is an auth route (login/signup)
  const isAuthRoute = authRoutes.some(route => pathname === route);

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users from auth routes to upload
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL('/upload', req.url));
  }

  return NextResponse.next();
});

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
