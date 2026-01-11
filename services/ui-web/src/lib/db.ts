/**
 * Database connection and models for PostgreSQL
 * 
 * This module provides database connectivity using the standard pg library.
 * Supports both POSTGRES_URL (Vercel Postgres) and DATABASE_URL (Prisma/other integrations).
 * For local development, it can fall back to in-memory storage.
 */

import { Pool } from 'pg';

// Types matching the SQLAlchemy models from the Python backend
export interface BudgetSession {
  id: string;
  stage: 'draft' | 'partial' | 'final';
  draft: Record<string, unknown> | null;
  partial: Record<string, unknown> | null;
  final: Record<string, unknown> | null;
  user_query: string | null;
  user_profile: Record<string, unknown> | null;
  // Phase 8.5.3: Foundational context from pre-clarification questions
  foundational_context: Record<string, unknown> | null;
  // Phase 9: User account association
  user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// Phase 9: User account types
export interface User {
  id: string;
  email: string;
  emailVerified: Date | null;
  name: string | null;
  image: string | null;
  password_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserProfile {
  id: string;
  user_id: string;
  default_financial_philosophy: string | null;
  default_optimization_focus: string | null;
  default_risk_tolerance: string | null;
  onboarding_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuditEvent {
  id: number;
  session_id: string;
  action: string;
  source_ip: string | null;
  from_stage: string | null;
  to_stage: string | null;
  details: Record<string, unknown> | null;
  created_at: Date;
}

// In-memory fallback for development without Postgres
const memoryStore: Map<string, BudgetSession> = new Map();
const auditEvents: AuditEvent[] = [];
let auditEventId = 1;

// Database connection pool (lazy initialization)
let pool: Pool | null = null;

/**
 * Get or create database connection pool
 */
function getPool(): Pool | null {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  // Create connection pool with SSL for production
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 1, // Serverless-friendly: use single connection
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err);
  });

  return pool;
}

/**
 * Check if PostgreSQL is available
 * Supports both POSTGRES_URL (Vercel Postgres) and DATABASE_URL (Prisma/other integrations)
 */
function hasPostgres(): boolean {
  return !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

/**
 * Initialize database tables (run on first request)
 */
export async function initDatabase(): Promise<void> {
  if (!hasPostgres()) {
    console.log('[DB] Using in-memory storage (no POSTGRES_URL or DATABASE_URL configured)');
    return;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Failed to create database connection pool');
  }

  // Log which env var is being used
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const envVarName = process.env.POSTGRES_URL ? 'POSTGRES_URL' : 'DATABASE_URL';
  console.log(`[DB] Using database connection from ${envVarName}`);

  console.log('[DB] Initializing database connection...');
  const startTime = Date.now();

  // Log connection info (without exposing sensitive data)
  const hasPostgresUrl = !!process.env.POSTGRES_URL;
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const connectionUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const urlPreview = connectionUrl ? `${connectionUrl.substring(0, 20)}...` : 'none';
  console.log('[DB] Connection info:', {
    hasPostgresUrl,
    hasDatabaseUrl,
    urlPreview,
    urlLength: connectionUrl?.length || 0,
  });

  try {
    // Test connection with a simple query first
    const testResult = await dbPool.query('SELECT 1 as test');
    console.log('[DB] Database connection test successful', { test: testResult.rows[0] });

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS budget_sessions (
        id VARCHAR(36) PRIMARY KEY,
        stage VARCHAR(32) NOT NULL DEFAULT 'draft',
        draft JSONB,
        partial JSONB,
        final JSONB,
        user_query VARCHAR(1000),
        user_profile JSONB,
        foundational_context JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    
    // Phase 8.5.3: Add foundational_context column if it doesn't exist (for existing databases)
    await dbPool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'budget_sessions' AND column_name = 'foundational_context'
        ) THEN
          ALTER TABLE budget_sessions ADD COLUMN foundational_context JSONB;
        END IF;
      END $$;
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(36) NOT NULL REFERENCES budget_sessions(id) ON DELETE CASCADE,
        action VARCHAR(64) NOT NULL,
        source_ip VARCHAR(45),
        from_stage VARCHAR(32),
        to_stage VARCHAR(32),
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Phase 9: Auth tables for NextAuth.js
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        "emailVerified" TIMESTAMP WITH TIME ZONE,
        name VARCHAR(100),
        image TEXT,
        password_hash VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(36) PRIMARY KEY,
        "userId" VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        "providerAccountId" VARCHAR(255) NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type VARCHAR(50),
        scope TEXT,
        id_token TEXT,
        UNIQUE(provider, "providerAccountId")
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(36) PRIMARY KEY,
        "sessionToken" VARCHAR(255) UNIQUE NOT NULL,
        "userId" VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS verification_tokens (
        identifier VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (identifier, token)
      )
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        default_financial_philosophy VARCHAR(32),
        default_optimization_focus VARCHAR(32),
        default_risk_tolerance VARCHAR(32),
        onboarding_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Phase 9: Add user_id FK to budget_sessions if it doesn't exist
    await dbPool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'budget_sessions' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE budget_sessions ADD COLUMN user_id VARCHAR(36) REFERENCES users(id);
          CREATE INDEX IF NOT EXISTS idx_budget_sessions_user_id ON budget_sessions(user_id);
        END IF;
      END $$;
    `);

    const duration = Date.now() - startTime;
    console.log(`[DB] Tables initialized successfully in ${duration}ms`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code;
    const errorDetails = {
      error: errorMessage,
      errorCode,
      stack: error instanceof Error ? error.stack : undefined,
      hasPostgresUrl,
      hasDatabaseUrl,
      urlPreview,
    };
    console.error('[DB] Failed to initialize tables:', errorDetails);
    
    // Provide more specific error messages based on error type
    let userMessage = `Database initialization failed: ${errorMessage}`;
    if (errorCode === 'ENOTFOUND' || errorMessage.includes('getaddrinfo')) {
      userMessage = 'Database host not found. Check your DATABASE_URL or POSTGRES_URL connection string.';
    } else if (errorCode === 'ECONNREFUSED' || errorMessage.includes('connection refused')) {
      userMessage = 'Database connection refused. Check that your database is running and accessible.';
    } else if (errorMessage.includes('password') || errorMessage.includes('authentication')) {
      userMessage = 'Database authentication failed. Check your database credentials in DATABASE_URL or POSTGRES_URL.';
    } else if (errorMessage.includes('does not exist') || errorMessage.includes('database')) {
      userMessage = 'Database does not exist. Check your DATABASE_URL or POSTGRES_URL connection string.';
    }
    
    // Wrap the error with more context
    const dbError = new Error(userMessage);
    if (error instanceof Error && error.stack) {
      dbError.stack = error.stack;
    }
    (dbError as any).originalError = error;
    throw dbError;
  }
}

/**
 * Create a new budget session
 */
export async function createSession(
  sessionId: string,
  draftPayload: Record<string, unknown>,
  sourceIp?: string | null,
  details?: Record<string, unknown>
): Promise<BudgetSession> {
  const now = new Date();
  const session: BudgetSession = {
    id: sessionId,
    stage: 'draft',
    draft: draftPayload,
    partial: null,
    final: null,
    user_query: null,
    user_profile: null,
    foundational_context: null,
    user_id: null,
    created_at: now,
    updated_at: now,
  };

  console.log(`[DB] Creating session ${sessionId}...`);
  const startTime = Date.now();

  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    try {
      await dbPool.query(
        `INSERT INTO budget_sessions (id, stage, draft, created_at, updated_at)
         VALUES ($1, 'draft', $2::jsonb, $3, $4)`,
        [sessionId, JSON.stringify(draftPayload), now.toISOString(), now.toISOString()]
      );

      await recordAuditEvent({
        session_id: sessionId,
        action: 'upload_budget',
        source_ip: sourceIp ?? null,
        from_stage: null,
        to_stage: 'draft',
        details: details ?? null,
      });
      
      const duration = Date.now() - startTime;
      console.log(`[DB] Session ${sessionId} created in Postgres (${duration}ms)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DB] Failed to create session ${sessionId} in Postgres:`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
      });
      // Wrap the error with more context
      const dbError = new Error(
        `Failed to create database session: ${errorMessage}. This may indicate a database connection or permissions issue.`
      );
      if (error instanceof Error && error.stack) {
        dbError.stack = error.stack;
      }
      throw dbError;
    }
  } else {
    memoryStore.set(sessionId, session);
    auditEvents.push({
      id: auditEventId++,
      session_id: sessionId,
      action: 'upload_budget',
      source_ip: sourceIp ?? null,
      from_stage: null,
      to_stage: 'draft',
      details: details ?? null,
      created_at: now,
    });
    console.log(`[DB] Session ${sessionId} created in memory`);
  }

  return session;
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<BudgetSession | null> {
  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    console.log(`[DB] Fetching session ${sessionId} from Postgres...`);
    const startTime = Date.now();
    try {
      const result = await dbPool.query(
        'SELECT * FROM budget_sessions WHERE id = $1',
        [sessionId]
      );
      const duration = Date.now() - startTime;
      
      if (result.rows.length === 0) {
        console.log(`[DB] Session ${sessionId} not found in Postgres (${duration}ms)`);
        return null;
      }
      
      const row = result.rows[0];
      console.log(`[DB] Session ${sessionId} retrieved from Postgres (${duration}ms)`);
      return {
        id: row.id,
        stage: row.stage,
        draft: row.draft,
        partial: row.partial,
        final: row.final,
        user_query: row.user_query,
        user_profile: row.user_profile,
        foundational_context: row.foundational_context,
        user_id: row.user_id,
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
      };
    } catch (error) {
      console.error(`[DB] Error fetching session ${sessionId} from Postgres:`, error);
      throw error;
    }
  } else {
    const session = memoryStore.get(sessionId) ?? null;
    if (session) {
      console.log(`[DB] Session ${sessionId} retrieved from memory`);
    } else {
      console.log(`[DB] Session ${sessionId} not found in memory`);
    }
    return session;
  }
}

/**
 * Update session with partial model (after clarification)
 */
export async function updateSessionPartial(
  sessionId: string,
  partialModel: Record<string, unknown>,
  sourceIp?: string | null,
  details?: Record<string, unknown>
): Promise<BudgetSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const previousStage = session.stage;
  const now = new Date();

  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    await dbPool.query(
      `UPDATE budget_sessions 
       SET partial = $1::jsonb, stage = 'partial', updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(partialModel), now.toISOString(), sessionId]
    );

    await recordAuditEvent({
      session_id: sessionId,
      action: 'clarification_questions',
      source_ip: sourceIp ?? null,
      from_stage: previousStage,
      to_stage: 'partial',
      details: details ?? null,
    });
  } else {
    session.partial = partialModel;
    session.stage = 'partial';
    session.updated_at = now;
    memoryStore.set(sessionId, session);

    auditEvents.push({
      id: auditEventId++,
      session_id: sessionId,
      action: 'clarification_questions',
      source_ip: sourceIp ?? null,
      from_stage: previousStage,
      to_stage: 'partial',
      details: details ?? null,
      created_at: now,
    });
  }

  return getSession(sessionId);
}

/**
 * Update session with final model (after submitting answers)
 */
export async function updateSessionFinal(
  sessionId: string,
  finalModel: Record<string, unknown>,
  sourceIp?: string | null,
  details?: Record<string, unknown>
): Promise<BudgetSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const previousStage = session.stage;
  const now = new Date();

  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    await dbPool.query(
      `UPDATE budget_sessions 
       SET final = $1::jsonb, stage = 'final', updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(finalModel), now.toISOString(), sessionId]
    );

    await recordAuditEvent({
      session_id: sessionId,
      action: 'submit_answers',
      source_ip: sourceIp ?? null,
      from_stage: previousStage,
      to_stage: 'final',
      details: details ?? null,
    });
  } else {
    session.final = finalModel;
    session.stage = 'final';
    session.updated_at = now;
    memoryStore.set(sessionId, session);

    auditEvents.push({
      id: auditEventId++,
      session_id: sessionId,
      action: 'submit_answers',
      source_ip: sourceIp ?? null,
      from_stage: previousStage,
      to_stage: 'final',
      details: details ?? null,
      created_at: now,
    });
  }

  return getSession(sessionId);
}

/**
 * Store user query in session
 */
export async function storeUserQuery(
  sessionId: string,
  query: string,
  sourceIp?: string | null,
  details?: Record<string, unknown>
): Promise<BudgetSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const now = new Date();

  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    await dbPool.query(
      `UPDATE budget_sessions 
       SET user_query = $1, updated_at = $2
       WHERE id = $3`,
      [query, now.toISOString(), sessionId]
    );

    await recordAuditEvent({
      session_id: sessionId,
      action: 'user_query_submitted',
      source_ip: sourceIp ?? null,
      from_stage: session.stage,
      to_stage: session.stage,
      details: { query_length: query.length, ...details },
    });
  } else {
    session.user_query = query;
    session.updated_at = now;
    memoryStore.set(sessionId, session);

    auditEvents.push({
      id: auditEventId++,
      session_id: sessionId,
      action: 'user_query_submitted',
      source_ip: sourceIp ?? null,
      from_stage: session.stage,
      to_stage: session.stage,
      details: { query_length: query.length, ...details },
      created_at: now,
    });
  }

  return getSession(sessionId);
}

/**
 * Store/update user profile data
 */
export async function storeUserProfile(
  sessionId: string,
  profileData: Record<string, unknown>,
  sourceIp?: string | null,
  details?: Record<string, unknown>
): Promise<BudgetSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const existingProfile = session.user_profile ?? {};
  const mergedProfile = { ...existingProfile, ...profileData };
  const now = new Date();

  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    await dbPool.query(
      `UPDATE budget_sessions 
       SET user_profile = $1::jsonb, updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(mergedProfile), now.toISOString(), sessionId]
    );

    await recordAuditEvent({
      session_id: sessionId,
      action: 'user_profile_updated',
      source_ip: sourceIp ?? null,
      from_stage: session.stage,
      to_stage: session.stage,
      details: { profile_fields: Object.keys(profileData), ...details },
    });
  } else {
    session.user_profile = mergedProfile;
    session.updated_at = now;
    memoryStore.set(sessionId, session);

    auditEvents.push({
      id: auditEventId++,
      session_id: sessionId,
      action: 'user_profile_updated',
      source_ip: sourceIp ?? null,
      from_stage: session.stage,
      to_stage: session.stage,
      details: { profile_fields: Object.keys(profileData), ...details },
      created_at: now,
    });
  }

  return getSession(sessionId);
}

/**
 * Get user context (query + profile) for personalization
 */
export function getUserContext(session: BudgetSession): { user_query: string | null; user_profile: Record<string, unknown> } {
  return {
    user_query: session.user_query,
    user_profile: session.user_profile ?? {},
  };
}

/**
 * Phase 8.5.3: Store/update foundational context from pre-clarification questions
 */
export async function storeFoundationalContext(
  sessionId: string,
  foundationalContext: Record<string, unknown>,
  sourceIp?: string | null,
  details?: Record<string, unknown>
): Promise<BudgetSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const existingContext = session.foundational_context ?? {};
  const mergedContext = { ...existingContext, ...foundationalContext };
  const now = new Date();

  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    await dbPool.query(
      `UPDATE budget_sessions 
       SET foundational_context = $1::jsonb, updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(mergedContext), now.toISOString(), sessionId]
    );

    await recordAuditEvent({
      session_id: sessionId,
      action: 'foundational_context_updated',
      source_ip: sourceIp ?? null,
      from_stage: session.stage,
      to_stage: session.stage,
      details: { context_fields: Object.keys(foundationalContext), ...details },
    });
  } else {
    session.foundational_context = mergedContext;
    session.updated_at = now;
    memoryStore.set(sessionId, session);

    auditEvents.push({
      id: auditEventId++,
      session_id: sessionId,
      action: 'foundational_context_updated',
      source_ip: sourceIp ?? null,
      from_stage: session.stage,
      to_stage: session.stage,
      details: { context_fields: Object.keys(foundationalContext), ...details },
      created_at: now,
    });
  }

  return getSession(sessionId);
}

/**
 * Record an audit event
 */
async function recordAuditEvent(event: Omit<AuditEvent, 'id' | 'created_at'>): Promise<void> {
  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      console.error('[DB] Cannot record audit event: database pool not available');
      return;
    }

    await dbPool.query(
      `INSERT INTO audit_events (session_id, action, source_ip, from_stage, to_stage, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        event.session_id,
        event.action,
        event.source_ip,
        event.from_stage,
        event.to_stage,
        event.details ? JSON.stringify(event.details) : null,
      ]
    );
  }
}

// ============================================================================
// Phase 9: User and Auth-related functions
// ============================================================================

/**
 * Get budget sessions for a specific user
 */
export async function getUserBudgetSessions(
  userId: string,
  limit: number = 20
): Promise<BudgetSession[]> {
  if (!hasPostgres()) {
    // In-memory fallback: filter by user_id
    return Array.from(memoryStore.values())
      .filter(s => s.user_id === userId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit);
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    `SELECT * FROM budget_sessions 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(row => ({
    id: row.id,
    stage: row.stage,
    draft: row.draft,
    partial: row.partial,
    final: row.final,
    user_query: row.user_query,
    user_profile: row.user_profile,
    foundational_context: row.foundational_context,
    user_id: row.user_id,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  }));
}

/**
 * Associate a budget session with a user
 */
export async function associateSessionWithUser(
  sessionId: string,
  userId: string
): Promise<BudgetSession | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const now = new Date();

  if (hasPostgres()) {
    const dbPool = getPool();
    if (!dbPool) {
      throw new Error('Database connection pool not available');
    }

    await dbPool.query(
      `UPDATE budget_sessions 
       SET user_id = $1, updated_at = $2
       WHERE id = $3`,
      [userId, now.toISOString(), sessionId]
    );
  } else {
    session.user_id = userId;
    session.updated_at = now;
    memoryStore.set(sessionId, session);
  }

  return getSession(sessionId);
}

/**
 * Get or create user profile
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!hasPostgres()) {
    // In-memory: no profile storage
    return null;
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const result = await dbPool.query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    default_financial_philosophy: row.default_financial_philosophy,
    default_optimization_focus: row.default_optimization_focus,
    default_risk_tolerance: row.default_risk_tolerance,
    onboarding_completed: row.onboarding_completed,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

/**
 * Create or update user profile
 */
export async function upsertUserProfile(
  userId: string,
  profileData: Partial<Omit<UserProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<UserProfile> {
  if (!hasPostgres()) {
    throw new Error('User profiles require PostgreSQL database');
  }

  const dbPool = getPool();
  if (!dbPool) {
    throw new Error('Database connection pool not available');
  }

  const { v4: uuidv4 } = await import('uuid');
  const profileId = uuidv4();
  const now = new Date();

  await dbPool.query(
    `INSERT INTO user_profiles (id, user_id, default_financial_philosophy, default_optimization_focus, default_risk_tolerance, onboarding_completed, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       default_financial_philosophy = COALESCE($3, user_profiles.default_financial_philosophy),
       default_optimization_focus = COALESCE($4, user_profiles.default_optimization_focus),
       default_risk_tolerance = COALESCE($5, user_profiles.default_risk_tolerance),
       onboarding_completed = COALESCE($6, user_profiles.onboarding_completed),
       updated_at = $8`,
    [
      profileId,
      userId,
      profileData.default_financial_philosophy ?? null,
      profileData.default_optimization_focus ?? null,
      profileData.default_risk_tolerance ?? null,
      profileData.onboarding_completed ?? false,
      now.toISOString(),
      now.toISOString(),
    ]
  );

  const profile = await getUserProfile(userId);
  if (!profile) {
    throw new Error('Failed to create/update user profile');
  }

  return profile;
}

/**
 * Export the pool getter for use by auth adapter
 */
export { getPool, hasPostgres };
