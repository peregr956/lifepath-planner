/**
 * User Query API Route
 * 
 * Stores the user's initial question/query for personalized guidance.
 * Ported from Python api-gateway.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, storeUserQuery, initDatabase } from '@/lib/db';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const body = await request.json();
    const { budget_id, query } = body;

    if (!budget_id) {
      return NextResponse.json(
        { error: 'budget_id_required', details: 'Budget ID is required.' },
        { status: 400 }
      );
    }

    // Check if session exists
    const session = await getSession(budget_id);
    if (!session) {
      return NextResponse.json(
        { error: 'budget_session_not_found', details: 'Budget session not found.' },
        { status: 404 }
      );
    }

    const trimmedQuery = (query ?? '').trim();
    if (!trimmedQuery) {
      return NextResponse.json(
        { error: 'query_empty', details: 'Query cannot be empty.' },
        { status: 400 }
      );
    }

    if (trimmedQuery.length > 1000) {
      return NextResponse.json(
        { error: 'query_too_long', details: 'Query must be 1000 characters or less.' },
        { status: 400 }
      );
    }

    // Store the query
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    await storeUserQuery(budget_id, trimmedQuery, sourceIp);

    console.log(`[user-query] Stored query for session ${budget_id}`);

    return NextResponse.json({
      budget_id,
      query: trimmedQuery,
      status: 'stored',
    });
  } catch (error) {
    console.error('[user-query] Unexpected error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}


