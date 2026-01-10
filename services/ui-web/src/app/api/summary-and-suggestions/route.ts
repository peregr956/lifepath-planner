/**
 * Summary and Suggestions API Route
 * 
 * Generates budget summary and optimization suggestions.
 * Uses AI when available, falls back to deterministic suggestions.
 * Ported from Python api-gateway + optimization-service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserContext, initDatabase } from '@/lib/db';
import { computeSummary, computeCategoryShares, type UnifiedBudgetModel } from '@/lib/budgetModel';
import { generateSuggestions, getProviderMetadata } from '@/lib/ai';

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

    // Check for final model
    if (!session.final) {
      return NextResponse.json(
        { error: 'answers_incomplete', details: 'Clarification answers are incomplete; please submit answers before requesting the summary.' },
        { status: 400 }
      );
    }

    const finalModel = session.final as unknown as UnifiedBudgetModel;

    // Get user context
    const userContext = getUserContext(session);

    // Compute summary and category shares
    const summary = computeSummary(finalModel);
    const categoryShares = computeCategoryShares(finalModel);

    // Generate suggestions (with retry logic for AI)
    const { suggestions, usedDeterministic } = await generateSuggestions(
      finalModel,
      userContext.user_query ?? undefined,
      userContext.user_profile ?? undefined
    );

    console.log(`[summary-and-suggestions] Generated ${suggestions.length} suggestions for session ${budgetId}`, {
      usedDeterministic,
    });

    return NextResponse.json({
      budget_id: budgetId,
      summary: {
        total_income: summary.total_income,
        total_expenses: summary.total_expenses,
        surplus: summary.surplus,
      },
      category_shares: categoryShares,
      suggestions,
      provider_metadata: getProviderMetadata(usedDeterministic),
      user_query: userContext.user_query,
    });
  } catch (error) {
    console.error('[summary-and-suggestions] Unexpected error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}



