/**
 * Clarification Questions API Route
 * 
 * Generates clarification questions based on the draft budget.
 * 
 * Phase 8.5.4: Uses pre-interpreted model from upload when available.
 * Falls back to two-stage processing if no interpreted model exists.
 * 
 * Phase 8.5.3: Accepts foundational context to inform question generation.
 * 
 * Uses AI when available, falls back to deterministic processing.
 * Ported from Python api-gateway + clarification-service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSessionPartial, getUserContext, initDatabase } from '@/lib/db';
import { draftToUnifiedModel } from '@/lib/normalization';
import { generateClarificationQuestionsWithContext, getProviderMetadata } from '@/lib/ai';
import type { DraftBudgetModel } from '@/lib/parsers';
import type { UnifiedBudgetModel } from '@/lib/budgetModel';
import type { FoundationalContext } from '@/types/budget';

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

    // Phase 8.5.3: Get foundational context from session
    const foundationalContext = (session.foundational_context || null) as FoundationalContext | null;

    // Phase 8.5.4: Check for pre-interpreted model from upload
    const draftPayload = session.draft as unknown as DraftBudgetModel & {
      interpreted_model?: UnifiedBudgetModel | null;
      interpretation_metadata?: {
        used_ai?: boolean;
        notes?: string;
        ai_enabled?: boolean;
      } | null;
    };
    
    const hasInterpretedModel = !!draftPayload.interpreted_model;
    let unifiedModel: UnifiedBudgetModel;
    let interpretationUsedAI = false;
    
    if (hasInterpretedModel && draftPayload.interpreted_model) {
      // Use the pre-interpreted model from upload (Phase 8.5.4)
      unifiedModel = draftPayload.interpreted_model;
      interpretationUsedAI = draftPayload.interpretation_metadata?.used_ai ?? false;
      
      console.log(`[clarification-questions] Using pre-interpreted model for budget ${budgetId}`, {
        usedAI: interpretationUsedAI,
        incomeCount: unifiedModel.income.length,
        expenseCount: unifiedModel.expenses.length,
        debtCount: unifiedModel.debts.length,
      });
    } else {
      // Fallback: Convert draft to unified model (legacy flow)
      const draftBudget = draftPayload as DraftBudgetModel;
      
      console.log(`[clarification-questions] No pre-interpreted model, running normalization for budget ${budgetId}`, {
        lineCount: draftBudget.lines?.length || 0,
        detectedFormat: draftBudget.detected_format,
      });

      unifiedModel = await draftToUnifiedModel(draftBudget);
    }

    console.log(`[clarification-questions] Budget ready:`, {
      incomeCount: unifiedModel.income.length,
      expenseCount: unifiedModel.expenses.length,
      debtCount: unifiedModel.debts.length,
      totalIncome: unifiedModel.summary.total_income,
      totalExpenses: unifiedModel.summary.total_expenses,
      surplus: unifiedModel.summary.surplus,
      usedPreInterpretation: hasInterpretedModel,
    });

    // Generate clarification questions (Phase 8.5.3: pass foundational context)
    const clarificationResult = await generateClarificationQuestionsWithContext(
      unifiedModel,
      effectiveUserQuery,
      foundationalContext,
      5 // max questions
    );
    const questions = clarificationResult.questions;

    // Update session with partial model
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    await updateSessionPartial(
      budgetId,
      unifiedModel as unknown as Record<string, unknown>,
      sourceIp,
      { 
        question_count: questions.length,
        used_pre_interpretation: hasInterpretedModel,
        interpretation_used_ai: interpretationUsedAI,
      }
    );

    console.log(`[clarification-questions] Generated ${questions.length} questions for session ${budgetId}`);

    const providerMetadata = getProviderMetadata();
    
    return NextResponse.json({
      budget_id: budgetId,
      needs_clarification: questions.length > 0,
      questions,
      partial_model: unifiedModel,
      // Phase 8.5.3: Include analysis and grouping from AI
      analysis: clarificationResult.analysis || null,
      question_groups: clarificationResult.question_groups || null,
      next_steps: clarificationResult.next_steps || null,
      provider_metadata: {
        ...providerMetadata,
        // Phase 8.5.4: Include interpretation metadata
        used_pre_interpretation: hasInterpretedModel,
        interpretation_used_ai: interpretationUsedAI,
        foundational_context_provided: !!foundationalContext,
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

