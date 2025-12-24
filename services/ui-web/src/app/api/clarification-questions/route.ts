/**
 * Clarification Questions API Route
 * 
 * Generates clarification questions based on the draft budget.
 * 
 * Two-stage processing:
 * 1. AI normalization: Correctly classifies amounts as income/expenses
 * 2. Question generation: Creates clarification questions for the user
 * 
 * Uses AI when available, falls back to deterministic processing.
 * Ported from Python api-gateway + clarification-service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSessionPartial, getUserContext, initDatabase } from '@/lib/db';
import { draftToUnifiedModel } from '@/lib/normalization';
import { generateClarificationQuestions, getProviderMetadata } from '@/lib/ai';
import { isNormalizationAIEnabled } from '@/lib/aiNormalization';
import type { DraftBudgetModel } from '@/lib/parsers';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const { searchParams } = new URL(request.url);
    const budgetId = searchParams.get('budget_id');
    const userQueryParam = searchParams.get('user_query');

    if (!budgetId) {
      return NextResponse.json(
        { error: 'budget_id_required', details: 'Budget ID is required.' },
        { status: 400 }
      );
    }

    // Get session
    const session = await getSession(budgetId);
    if (!session) {
      return NextResponse.json(
        { error: 'budget_session_not_found', details: 'Budget session not found.' },
        { status: 404 }
      );
    }

    // Check for draft
    if (!session.draft) {
      return NextResponse.json(
        { error: 'draft_budget_missing', details: 'No draft budget found; please upload a budget before requesting clarifications.' },
        { status: 404 }
      );
    }

    // Get user context
    const userContext = getUserContext(session);
    const effectiveUserQuery = userQueryParam || userContext.user_query || '';

    // Convert draft to unified model (includes AI normalization)
    const draftBudget = session.draft as unknown as DraftBudgetModel;
    const normalizationEnabled = isNormalizationAIEnabled();
    
    console.log(`[clarification-questions] Processing budget ${budgetId}`, {
      lineCount: draftBudget.lines?.length || 0,
      detectedFormat: draftBudget.detected_format,
      normalizationEnabled,
    });

    const unifiedModel = await draftToUnifiedModel(draftBudget);

    console.log(`[clarification-questions] Budget normalized:`, {
      incomeCount: unifiedModel.income.length,
      expenseCount: unifiedModel.expenses.length,
      debtCount: unifiedModel.debts.length,
      totalIncome: unifiedModel.summary.total_income,
      totalExpenses: unifiedModel.summary.total_expenses,
      surplus: unifiedModel.summary.surplus,
    });

    // Generate clarification questions
    const questions = await generateClarificationQuestions(
      unifiedModel,
      effectiveUserQuery,
      5 // max questions
    );

    // Update session with partial model
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    await updateSessionPartial(
      budgetId,
      unifiedModel as unknown as Record<string, unknown>,
      sourceIp,
      { 
        question_count: questions.length,
        normalization_enabled: normalizationEnabled,
      }
    );

    console.log(`[clarification-questions] Generated ${questions.length} questions for session ${budgetId}`);

    const providerMetadata = getProviderMetadata();
    
    return NextResponse.json({
      budget_id: budgetId,
      needs_clarification: questions.length > 0,
      questions,
      partial_model: unifiedModel,
      provider_metadata: {
        ...providerMetadata,
        normalization_enabled: normalizationEnabled,
      },
    });
  } catch (error) {
    console.error('[clarification-questions] Unexpected error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

