/**
 * Database connection and models for Vercel Postgres
 * 
 * This module provides database connectivity using Vercel Postgres.
 * For local development, it can fall back to in-memory storage.
 */

import { sql } from '@vercel/postgres';

// Types matching the SQLAlchemy models from the Python backend
export interface BudgetSession {
  id: string;
  stage: 'draft' | 'partial' | 'final';
  draft: Record<string, unknown> | null;
  partial: Record<string, unknown> | null;
  final: Record<string, unknown> | null;
  user_query: string | null;
  user_profile: Record<string, unknown> | null;
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

/**
 * Check if Vercel Postgres is available
 */
function hasPostgres(): boolean {
  return !!process.env.POSTGRES_URL;
}

/**
 * Initialize database tables (run on first request)
 */
export async function initDatabase(): Promise<void> {
  if (!hasPostgres()) {
    console.log('[DB] Using in-memory storage (no POSTGRES_URL configured)');
    return;
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS budget_sessions (
        id VARCHAR(36) PRIMARY KEY,
        stage VARCHAR(32) NOT NULL DEFAULT 'draft',
        draft JSONB,
        partial JSONB,
        final JSONB,
        user_query VARCHAR(1000),
        user_profile JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
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
    `;

    console.log('[DB] Tables initialized successfully');
  } catch (error) {
    console.error('[DB] Failed to initialize tables:', error);
    throw error;
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
    created_at: now,
    updated_at: now,
  };

  if (hasPostgres()) {
    await sql`
      INSERT INTO budget_sessions (id, stage, draft, created_at, updated_at)
      VALUES (${sessionId}, 'draft', ${JSON.stringify(draftPayload)}, ${now.toISOString()}, ${now.toISOString()})
    `;

    await recordAuditEvent({
      session_id: sessionId,
      action: 'upload_budget',
      source_ip: sourceIp ?? null,
      from_stage: null,
      to_stage: 'draft',
      details: details ?? null,
    });
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
  }

  return session;
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<BudgetSession | null> {
  if (hasPostgres()) {
    const result = await sql`
      SELECT * FROM budget_sessions WHERE id = ${sessionId}
    `;
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      stage: row.stage,
      draft: row.draft,
      partial: row.partial,
      final: row.final,
      user_query: row.user_query,
      user_profile: row.user_profile,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  } else {
    return memoryStore.get(sessionId) ?? null;
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
    await sql`
      UPDATE budget_sessions 
      SET partial = ${JSON.stringify(partialModel)}, stage = 'partial', updated_at = ${now.toISOString()}
      WHERE id = ${sessionId}
    `;

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
    await sql`
      UPDATE budget_sessions 
      SET final = ${JSON.stringify(finalModel)}, stage = 'final', updated_at = ${now.toISOString()}
      WHERE id = ${sessionId}
    `;

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
    await sql`
      UPDATE budget_sessions 
      SET user_query = ${query}, updated_at = ${now.toISOString()}
      WHERE id = ${sessionId}
    `;

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
    await sql`
      UPDATE budget_sessions 
      SET user_profile = ${JSON.stringify(mergedProfile)}, updated_at = ${now.toISOString()}
      WHERE id = ${sessionId}
    `;

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
 * Record an audit event
 */
async function recordAuditEvent(event: Omit<AuditEvent, 'id' | 'created_at'>): Promise<void> {
  if (hasPostgres()) {
    await sql`
      INSERT INTO audit_events (session_id, action, source_ip, from_stage, to_stage, details)
      VALUES (
        ${event.session_id}, 
        ${event.action}, 
        ${event.source_ip}, 
        ${event.from_stage}, 
        ${event.to_stage}, 
        ${event.details ? JSON.stringify(event.details) : null}
      )
    `;
  }
}

