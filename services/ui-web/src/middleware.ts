/**
 * Next.js Middleware for Authentication
 * 
 * This middleware protects routes that require authentication:
 * - /upload, /clarify, /summarize require auth
 * - Landing page, login, signup are public
 * - API routes handle their own auth
 * 
 * Uses the Edge-compatible auth.config.ts which doesn't import
 * database modules that use Node.js crypto.
 */

import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

// Create auth middleware from Edge-compatible config
const { auth } = NextAuth(authConfig);

export default auth;

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
