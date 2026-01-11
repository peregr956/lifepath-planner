/**
 * Summary and Suggestions API Route
 * 
 * Generates budget summary and optimization suggestions.
 * 
 * Phase 9.1.4: Fetches user account profile with metadata for confidence-aware
 * prompt construction. Passes layered context to AI for better personalization.
 * 
 * Phase 8.5.3: Accepts foundational context to improve suggestion personalization.
 * 
 * Uses AI when available, falls back to deterministic suggestions.
 * Ported from Python api-gateway + optimization-service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserContext, getUserProfile, initDatabase } from '@/lib/db';
import { computeSummary, computeCategoryShares, type UnifiedBudgetModel } from '@/lib/budgetModel';
import { generateSuggestionsWithContext, getProviderMetadata } from '@/lib/ai';
import { auth } from '@/lib/auth';
import type { FoundationalContext, HydratedFoundationalContext } from '@/types/budget';
import { hydrateFromAccountProfile, type ApiUserProfile } from '@/lib/sessionHydration';

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

    // Phase 8.5.3: Get foundational context from session
    const foundationalContext = (session.foundational_context || null) as FoundationalContext | null;

    // Phase 9.1.4: Fetch user account profile with metadata for confidence-aware prompts
    let accountProfile = null;
    let hydratedContext: HydratedFoundationalContext | null = null;
    
    try {
      const authSession = await auth();
      if (authSession?.user?.id) {
        accountProfile = await getUserProfile(authSession.user.id);
        
        // Hydrate context from account profile for source tracking
        if (accountProfile) {
          const apiProfile: ApiUserProfile = {
            default_financial_philosophy: accountProfile.default_financial_philosophy,
            default_optimization_focus: accountProfile.default_optimization_focus,
            default_risk_tolerance: accountProfile.default_risk_tolerance,
            onboarding_completed: accountProfile.onboarding_completed,
            default_primary_goal: accountProfile.default_primary_goal,
            default_goal_timeline: accountProfile.default_goal_timeline,
            default_life_stage: accountProfile.default_life_stage,
            default_emergency_fund_status: accountProfile.default_emergency_fund_status,
            profile_metadata: accountProfile.profile_metadata as Record<string, unknown> | null,
          };
          hydratedContext = hydrateFromAccountProfile(apiProfile);
          
          console.log(`[summary-and-suggestions] Loaded account profile for user ${authSession.user.id}`, {
            hasMetadata: !!accountProfile.profile_metadata,
            hydratedFields: Object.keys(hydratedContext).length,
          });
        }
      }
    } catch (error) {
      // Non-fatal: continue without account context for anonymous users
      console.log('[summary-and-suggestions] No account profile available (anonymous or error):', error);
    }

    // Compute summary and category shares
    const summary = computeSummary(finalModel);
    const categoryShares = computeCategoryShares(finalModel);

    // Generate suggestions (Phase 9.1.4: pass layered context with confidence signals)
    const { suggestions, usedDeterministic } = await generateSuggestionsWithContext(
      finalModel,
      userContext.user_query ?? undefined,
      foundationalContext,
      userContext.user_profile ?? undefined,
      hydratedContext,
      accountProfile
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
      provider_metadata: {
        ...getProviderMetadata(usedDeterministic),
        foundational_context_provided: !!foundationalContext,
        // Phase 9.1.4: Include account context info
        has_account_profile: !!accountProfile,
        has_profile_metadata: !!accountProfile?.profile_metadata,
      },
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



