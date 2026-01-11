/**
 * NextAuth.js (Auth.js v5) Configuration
 * 
 * This module configures authentication for LifePath Planner using:
 * - Google OAuth (primary OAuth provider)
 * - Credentials (email/password authentication)
 * - JWT session strategy (serverless-compatible)
 */

import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { v4 as uuidv4 } from 'uuid';
import {
  getUserByEmail,
  getUserById,
  verifyPassword,
  createUserWithCredentials,
  linkAccount,
  getUserByAccount,
} from './authDb';
import { getPool, hasPostgres } from './db';

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
interface ExtendedJWT {
  id?: string;
  email?: string;
}

/**
 * NextAuth.js configuration
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

  // Providers
  providers: [
    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: true, // Allow linking existing accounts
    }),

    // Email/Password credentials
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' }, // 'login' or 'signup'
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const action = (credentials.action as string) || 'login';
        const name = credentials.name as string | undefined;

        if (action === 'signup') {
          // Create new user
          try {
            const user = await createUserWithCredentials(email, password, name);
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
            };
          } catch (error) {
            if (error instanceof Error && error.message.includes('already exists')) {
              throw new Error('An account with this email already exists');
            }
            throw error;
          }
        } else {
          // Login existing user
          const user = await verifyPassword(email, password);
          if (!user) {
            throw new Error('Invalid email or password');
          }
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        }
      },
    }),
  ],

  // Callbacks
  callbacks: {
    // Add user ID to JWT
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.email = user.email!;
      }
      
      // Handle OAuth account linking
      if (account && user) {
        // Check if this is an OAuth sign-in that needs account linking
        if (account.provider !== 'credentials') {
          try {
            // Check if user already exists by email
            let existingUser = await getUserByEmail(user.email!);
            
            if (!existingUser) {
              // Create new user for OAuth
              const dbPool = getPool();
              if (dbPool && hasPostgres()) {
                const userId = uuidv4();
                const now = new Date();
                await dbPool.query(
                  `INSERT INTO users (id, email, name, image, "emailVerified", created_at, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                  [userId, user.email!.toLowerCase(), user.name, user.image, now.toISOString(), now.toISOString(), now.toISOString()]
                );
                existingUser = await getUserById(userId);
              }
            }

            if (existingUser) {
              // Link the OAuth account
              const existingOAuthUser = await getUserByAccount(account.provider, account.providerAccountId);
              if (!existingOAuthUser) {
                await linkAccount({
                  userId: existingUser.id,
                  type: account.type,
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                  refresh_token: account.refresh_token,
                  access_token: account.access_token,
                  expires_at: account.expires_at,
                  token_type: account.token_type,
                  scope: account.scope,
                  id_token: account.id_token,
                });
              }
              token.id = existingUser.id;
              token.email = existingUser.email;
            }
          } catch (error) {
            console.error('[Auth] Error linking OAuth account:', error);
          }
        }
      }

      return token;
    },

    // Add user ID to session
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
      // Redirect to upload page after sign in
      if (url.startsWith(baseUrl)) {
        return url;
      }
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      return `${baseUrl}/upload`;
    },
  },

  // Events for logging
  events: {
    async signIn({ user, account }) {
      console.log(`[Auth] User signed in: ${user.email} via ${account?.provider}`);
    },
    async signOut(message) {
      // signOut receives either { session } or { token } depending on strategy
      const email = 'token' in message ? (message.token as ExtendedJWT)?.email : 'unknown';
      console.log(`[Auth] User signed out: ${email}`);
    },
  },

  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',

  // Trust host for Vercel deployment
  trustHost: true,
};

// Export handlers and auth utilities
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/**
 * Helper to get current user from server components
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Helper to require authentication in server components/actions
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}
