/**
 * NextAuth.js Base Configuration (Edge-compatible)
 * 
 * This module contains the base authentication configuration that's safe
 * to use in Edge runtime (middleware). It does NOT include any database
 * operations that require the pg module.
 * 
 * For the full configuration with database callbacks, see auth.ts.
 */

import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  }
}

// Extend JWT type inline (avoid module augmentation issues)
export interface ExtendedJWT {
  id?: string;
  email?: string;
}

/**
 * Base NextAuth.js configuration (Edge-compatible)
 * 
 * This configuration is used by middleware and doesn't include
 * database-dependent callbacks.
 */
export const authConfig: NextAuthConfig = {
  // Use JWT for sessions (serverless-compatible)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Authentication pages
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
    newUser: '/upload', // Redirect new users to upload after signup
  },

  // Providers - Credentials authorize will be overridden in full config
  providers: [
    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: true,
    }),
    // Credentials placeholder - will be extended in auth.ts
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' },
        name: { label: 'Name', type: 'text' },
      },
      // This will be overridden in the full config
      async authorize() {
        // Return null here - actual authorization happens in auth.ts
        return null;
      },
    }),
  ],

  // Edge-safe callbacks (no database operations)
  callbacks: {
    // Add user ID to session from JWT
    async session({ session, token }) {
      const extToken = token as ExtendedJWT;
      if (extToken && session.user) {
        session.user.id = extToken.id ?? '';
        session.user.email = extToken.email ?? '';
      }
      return session;
    },

    // Custom sign-in handler for OAuth
    async signIn({ user, account }) {
      // Allow credentials sign-in
      if (account?.provider === 'credentials') {
        return true;
      }

      // For OAuth, check if email is available
      if (!user.email) {
        return false;
      }

      return true;
    },

    // Redirect after sign in
    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) {
        return url;
      }
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      return `${baseUrl}/upload`;
    },

    // Authorized check for middleware
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      
      // Protected routes
      const protectedRoutes = ['/upload', '/build', '/clarify', '/summarize', '/settings'];
      const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
      
      // Auth routes (login/signup)
      const authRoutes = ['/login', '/signup'];
      const isAuthRoute = authRoutes.some(route => pathname === route);
      
      const isLoggedIn = !!auth;

      // Redirect unauthenticated users from protected routes
      if (isProtectedRoute && !isLoggedIn) {
        return false; // Will redirect to signIn page
      }

      // Redirect authenticated users from auth routes
      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL('/upload', request.nextUrl.origin));
      }

      return true;
    },
  },

  // Trust host for Vercel deployment
  trustHost: true,
};
