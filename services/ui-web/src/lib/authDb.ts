/**
 * Auth-specific database operations for NextAuth.js
 * 
 * This module provides database adapter functions for NextAuth.js
 * following the Auth.js adapter interface.
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { getPool, hasPostgres, type User } from './db';

const BCRYPT_ROUNDS = 12;

// ============================================================================
// User Operations
// ============================================================================

/**
 * Create a new user with email/password
 */
export async function createUserWithCredentials(
  email: string,
  password: string,
  name?: string
): Promise<User> {
  if (!hasPostgres()) {
    throw new Error('User creation requires PostgreSQL database');
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  // Check if user already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();

  await dbPool.query(
    `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, email.toLowerCase(), name ?? null, passwordHash, now.toISOString(), now.toISOString()]
  );

  const user = await getUserById(userId);
  if (!user) {
    throw new Error('Failed to create user');
  }

  return user;
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  if (!hasPostgres()) {
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified ? new Date(row.emailVerified) : null,
    name: row.name,
    image: row.image,
    password_hash: row.password_hash,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  if (!hasPostgres()) {
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified ? new Date(row.emailVerified) : null,
    name: row.name,
    image: row.image,
    password_hash: row.password_hash,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

/**
 * Verify user password
 */
export async function verifyPassword(
  email: string,
  password: string
): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user || !user.password_hash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  return user;
}

/**
 * Update user
 */
export async function updateUser(
  id: string,
  data: Partial<Pick<User, 'name' | 'email' | 'image' | 'emailVerified'>>
): Promise<User | null> {
  if (!hasPostgres()) {
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const updates: string[] = [];
  const values: (string | Date | null)[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.email !== undefined) {
    updates.push(`email = $${paramIndex++}`);
    values.push(data.email.toLowerCase());
  }
  if (data.image !== undefined) {
    updates.push(`image = $${paramIndex++}`);
    values.push(data.image);
  }
  if (data.emailVerified !== undefined) {
    updates.push(`"emailVerified" = $${paramIndex++}`);
    values.push(data.emailVerified ? data.emailVerified.toISOString() : null);
  }

  if (updates.length === 0) {
    return getUserById(id);
  }

  updates.push(`updated_at = $${paramIndex++}`);
  values.push(new Date().toISOString());
  values.push(id);

  await dbPool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  return getUserById(id);
}

/**
 * Delete user and all associated data
 */
export async function deleteUser(id: string): Promise<boolean> {
  if (!hasPostgres()) {
    return false;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  // Cascading delete will handle accounts, sessions, and profiles
  const result = await dbPool.query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// OAuth Account Linking
// ============================================================================

interface AccountLink {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
}

/**
 * Link an OAuth account to a user
 */
export async function linkAccount(account: AccountLink): Promise<void> {
  if (!hasPostgres()) {
    throw new Error('Account linking requires PostgreSQL database');
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const accountId = uuidv4();

  await dbPool.query(
    `INSERT INTO accounts (id, "userId", type, provider, "providerAccountId", refresh_token, access_token, expires_at, token_type, scope, id_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      accountId,
      account.userId,
      account.type,
      account.provider,
      account.providerAccountId,
      account.refresh_token ?? null,
      account.access_token ?? null,
      account.expires_at ?? null,
      account.token_type ?? null,
      account.scope ?? null,
      account.id_token ?? null,
    ]
  );
}

/**
 * Get user by OAuth account
 */
export async function getUserByAccount(
  provider: string,
  providerAccountId: string
): Promise<User | null> {
  if (!hasPostgres()) {
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    `SELECT u.* FROM users u
     INNER JOIN accounts a ON a."userId" = u.id
     WHERE a.provider = $1 AND a."providerAccountId" = $2`,
    [provider, providerAccountId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified ? new Date(row.emailVerified) : null,
    name: row.name,
    image: row.image,
    password_hash: row.password_hash,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

/**
 * Unlink an OAuth account
 */
export async function unlinkAccount(
  provider: string,
  providerAccountId: string
): Promise<boolean> {
  if (!hasPostgres()) {
    return false;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    'DELETE FROM accounts WHERE provider = $1 AND "providerAccountId" = $2 RETURNING id',
    [provider, providerAccountId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// Session Operations (for database sessions - optional with JWT)
// ============================================================================

/**
 * Create a session
 */
export async function createSession(
  userId: string,
  sessionToken: string,
  expires: Date
): Promise<{ sessionToken: string; userId: string; expires: Date }> {
  if (!hasPostgres()) {
    throw new Error('Sessions require PostgreSQL database');
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const sessionId = uuidv4();

  await dbPool.query(
    `INSERT INTO sessions (id, "sessionToken", "userId", expires)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, sessionToken, userId, expires.toISOString()]
  );

  return { sessionToken, userId, expires };
}

/**
 * Get session and user by session token
 */
export async function getSessionAndUser(
  sessionToken: string
): Promise<{ session: { sessionToken: string; userId: string; expires: Date }; user: User } | null> {
  if (!hasPostgres()) {
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    `SELECT s.*, u.* FROM sessions s
     INNER JOIN users u ON s."userId" = u.id
     WHERE s."sessionToken" = $1`,
    [sessionToken]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Check if session has expired
  const expires = new Date(row.expires);
  if (expires < new Date()) {
    await deleteSession(sessionToken);
    return null;
  }

  return {
    session: {
      sessionToken: row.sessionToken,
      userId: row.userId,
      expires,
    },
    user: {
      id: row.id,
      email: row.email,
      emailVerified: row.emailVerified ? new Date(row.emailVerified) : null,
      name: row.name,
      image: row.image,
      password_hash: row.password_hash,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    },
  };
}

/**
 * Update session expiry
 */
export async function updateSession(
  sessionToken: string,
  data: { expires?: Date }
): Promise<{ sessionToken: string; userId: string; expires: Date } | null> {
  if (!hasPostgres()) {
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  if (!data.expires) {
    const result = await dbPool.query(
      'SELECT * FROM sessions WHERE "sessionToken" = $1',
      [sessionToken]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      sessionToken: row.sessionToken,
      userId: row.userId,
      expires: new Date(row.expires),
    };
  }

  await dbPool.query(
    'UPDATE sessions SET expires = $1 WHERE "sessionToken" = $2',
    [data.expires.toISOString(), sessionToken]
  );

  const result = await dbPool.query(
    'SELECT * FROM sessions WHERE "sessionToken" = $1',
    [sessionToken]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    sessionToken: row.sessionToken,
    userId: row.userId,
    expires: new Date(row.expires),
  };
}

/**
 * Delete a session
 */
export async function deleteSession(sessionToken: string): Promise<boolean> {
  if (!hasPostgres()) {
    return false;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    'DELETE FROM sessions WHERE "sessionToken" = $1 RETURNING id',
    [sessionToken]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================================
// Verification Tokens (for email verification)
// ============================================================================

/**
 * Create a verification token
 */
export async function createVerificationToken(
  identifier: string,
  token: string,
  expires: Date
): Promise<{ identifier: string; token: string; expires: Date }> {
  if (!hasPostgres()) {
    throw new Error('Verification tokens require PostgreSQL database');
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  await dbPool.query(
    `INSERT INTO verification_tokens (identifier, token, expires)
     VALUES ($1, $2, $3)
     ON CONFLICT (identifier, token) DO UPDATE SET expires = $3`,
    [identifier, token, expires.toISOString()]
  );

  return { identifier, token, expires };
}

/**
 * Use (consume) a verification token
 */
export async function useVerificationToken(
  identifier: string,
  token: string
): Promise<{ identifier: string; token: string; expires: Date } | null> {
  if (!hasPostgres()) {
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    'DELETE FROM verification_tokens WHERE identifier = $1 AND token = $2 RETURNING *',
    [identifier, token]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    identifier: row.identifier,
    token: row.token,
    expires: new Date(row.expires),
  };
}
