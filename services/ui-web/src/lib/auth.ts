/**
 * NextAuth.js (Auth.js v5) Full Configuration
 * 
 * This module configures authentication for LifePath Planner using:
 * - Google OAuth (primary OAuth provider)
 * - Credentials (email/password authentication)
 * - JWT session strategy (serverless-compatible)
 * 
 * This extends the Edge-compatible base config (auth.config.ts) with
 * database-dependent callbacks for API routes.
 */

import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
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
import { authConfig, type ExtendedJWT } from './auth.config';

/**
 * Full NextAuth.js configuration with database callbacks
 * 
 * This extends the base config with database-dependent operations
 * for the Credentials provider and OAuth account linking.
 */
const fullAuthConfig: NextAuthConfig = {
  ...authConfig,
  // Override providers with full implementations
  providers: [
    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      allowDangerousEmailAccountLinking: true,
    }),
    // Email/Password credentials with full authorize logic
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        action: { label: 'Action', type: 'text' },
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
  // Extend callbacks with database operations
  callbacks: {
    ...authConfig.callbacks,
    // Add user ID to JWT with OAuth account linking
    async jwt({ token, user, account }: { token: Record<string, unknown>; user?: { id: string; email?: string | null; name?: string | null; image?: string | null }; account?: { provider: string; providerAccountId: string; type: string; refresh_token?: string | null; access_token?: string | null; expires_at?: number | null; token_type?: string | null; scope?: string | null; id_token?: string | null } | null }) {
      if (user) {
        token.id = user.id;
        token.email = user.email!;
      }
      
      // Handle OAuth account linking
      if (account && user) {
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
  },
  // Events for logging
  events: {
    async signIn({ user, account }) {
      console.log(`[Auth] User signed in: ${user?.email} via ${account?.provider}`);
    },
    async signOut(message) {
      const email = 'token' in message && message.token ? String(message.token.email ?? 'unknown') : 'unknown';
      console.log(`[Auth] User signed out: ${email}`);
    },
  },
  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',
};

// Export handlers and auth utilities
export const { handlers, auth, signIn, signOut } = NextAuth(fullAuthConfig);

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
