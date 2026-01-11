/**
 * NextAuth.js API Route Handler
 * 
 * This dynamic route handles all NextAuth.js authentication endpoints:
 * - GET/POST /api/auth/signin - Sign in
 * - GET/POST /api/auth/signout - Sign out
 * - GET /api/auth/session - Get current session
 * - GET /api/auth/providers - List available providers
 * - GET/POST /api/auth/callback/:provider - OAuth callbacks
 */

import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
