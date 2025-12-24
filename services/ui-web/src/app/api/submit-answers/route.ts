/**
 * Submit Answers API Route
 * 
 * Applies user answers to the partial budget model.
 * Ported from Python api-gateway + clarification-service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSessionFinal, storeUserProfile, initDatabase } from '@/lib/db';
import { applyAnswersToModel, validateAnswers } from '@/lib/normalization';
import type { UnifiedBudgetModel } from '@/lib/budgetModel';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

// Profile field IDs that should be stored separately
const PROFILE_FIELD_IDS = new Set([
  'financial_philosophy',
  'risk_tolerance',
  'goal_timeline',
  'primary_goal',
  'financial_concerns',
]);

export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const body = await request.json();
    const { budget_id, answers } = body;

    if (!budget_id) {
      return NextResponse.json(
        { error: 'budget_id_required', details: 'Budget ID is required.' },
        { status: 400 }
      );
    }

    // Get session
    const session = await getSession(budget_id);
    if (!session) {
      return NextResponse.json(
        { error: 'budget_session_not_found', details: 'Budget session not found.' },
        { status: 404 }
      );
    }

    // Check for partial model
    if (!session.partial) {
      return NextResponse.json(
        { error: 'clarification_not_completed', details: 'Clarification has not run for this budget; please answer the clarification questions first.' },
        { status: 400 }
      );
    }

    const partialModel = session.partial as unknown as UnifiedBudgetModel;
    const answersObj = (answers ?? {}) as Record<string, unknown>;

    // Separate profile answers from model answers
    const profileAnswers: Record<string, unknown> = {};
    const modelAnswers: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(answersObj)) {
      if (PROFILE_FIELD_IDS.has(key)) {
        profileAnswers[key] = value;
      } else {
        modelAnswers[key] = value;
      }
    }

    // Validate model answers
    const validationIssues = validateAnswers(partialModel, modelAnswers);
    if (validationIssues.length > 0) {
      console.warn(`[submit-answers] Validation issues for session ${budget_id}:`, validationIssues);
      return NextResponse.json(
        {
          error: 'invalid_answers',
          details: 'Some answers failed validation.',
          issues: validationIssues,
        },
        { status: 400 }
      );
    }

    // Apply answers to model
    const updatedModel = applyAnswersToModel(partialModel, modelAnswers);

    // Store profile data if any
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    
    if (Object.keys(profileAnswers).length > 0) {
      await storeUserProfile(budget_id, profileAnswers, sourceIp);
    }

    // Update session with final model
    await updateSessionFinal(
      budget_id,
      updatedModel as unknown as Record<string, unknown>,
      sourceIp,
      { answer_count: Object.keys(answersObj).length }
    );

    console.log(`[submit-answers] Applied ${Object.keys(answersObj).length} answers for session ${budget_id}`);

    return NextResponse.json({
      budget_id,
      status: 'ready_for_summary',
      ready_for_summary: true,
    });
  } catch (error) {
    console.error('[submit-answers] Unexpected error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}


