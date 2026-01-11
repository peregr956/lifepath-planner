/**
 * Submit Answers API Route
 * 
 * Applies user answers to the partial budget model.
 * Ported from Python api-gateway + clarification-service.
 * 
 * Handles three types of fields:
 * 1. Profile fields - stored in user profile for personalization
 * 2. Model fields - applied to budget model (expenses, debts, preferences)
 * 3. Extra context fields - AI-generated fields stored as context
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSessionFinal, storeUserProfile, initDatabase } from '@/lib/db';
import { applyAnswersToModel, validateAnswers, ESSENTIAL_PREFIX, SUPPORTED_SIMPLE_FIELD_IDS, parseDebtFieldId } from '@/lib/normalization';
import type { UnifiedBudgetModel } from '@/lib/budgetModel';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

// Profile field IDs that should be stored in user profile
// Expanded to include common AI-generated profile-like fields
const PROFILE_FIELD_IDS = new Set([
  'financial_philosophy',
  'risk_tolerance',
  'goal_timeline',
  'primary_goal',
  'financial_concerns',
  // Additional fields AI might generate
  'life_stage',
  'has_emergency_fund',
  'emergency_fund_status',
  'savings_goals',
  'investment_experience',
  'financial_knowledge',
  'household_size',
  'dependents',
]);

// Prefixes that indicate profile-related fields
const PROFILE_FIELD_PREFIXES = [
  'goal_',
  'preference_',
  'lifestyle_',
  'family_',
  'career_',
];

/**
 * Check if a field ID is a model field (affects the budget model)
 */
function isModelField(fieldId: string): boolean {
  // Expense essential fields
  if (fieldId.startsWith(ESSENTIAL_PREFIX)) {
    return true;
  }
  
  // Known simple preference fields
  if (SUPPORTED_SIMPLE_FIELD_IDS.has(fieldId)) {
    return true;
  }
  
  // Debt fields
  if (parseDebtFieldId(fieldId)) {
    return true;
  }
  
  return false;
}

/**
 * Check if a field ID is a profile field
 */
function isProfileField(fieldId: string): boolean {
  if (PROFILE_FIELD_IDS.has(fieldId)) {
    return true;
  }
  
  // Check prefixes
  for (const prefix of PROFILE_FIELD_PREFIXES) {
    if (fieldId.startsWith(prefix)) {
      return true;
    }
  }
  
  return false;
}

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

    // Separate answers into three categories:
    // 1. Model answers - affect the budget model (expense essentials, debt details, preferences)
    // 2. Profile answers - stored in user profile for personalization
    // 3. Extra context - AI-generated fields that don't fit the above categories
    const profileAnswers: Record<string, unknown> = {};
    const modelAnswers: Record<string, unknown> = {};
    const extraContext: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(answersObj)) {
      if (isModelField(key)) {
        modelAnswers[key] = value;
      } else if (isProfileField(key)) {
        profileAnswers[key] = value;
      } else {
        // Unknown field - store as extra context rather than reject
        // This allows AI to generate new question types
        extraContext[key] = value;
      }
    }

    // Log field categorization for debugging
    console.log(`[submit-answers] Field categorization for session ${budget_id}:`, {
      modelFields: Object.keys(modelAnswers).length,
      profileFields: Object.keys(profileAnswers).length,
      extraContextFields: Object.keys(extraContext).length,
      extraContextKeys: Object.keys(extraContext),
    });

    // Validate model answers (now permissive - logs warnings but doesn't reject)
    const validationIssues = validateAnswers(partialModel, modelAnswers);
    if (validationIssues.length > 0) {
      // Log validation issues as warnings but continue processing
      console.warn(`[submit-answers] Validation warnings for session ${budget_id}:`, validationIssues);
      // Note: We no longer return 400 here - validation is now informational
    }

    // Apply model answers to the budget model
    const updatedModel = applyAnswersToModel(partialModel, modelAnswers);

    // Store profile data and extra context
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    
    // Merge extra context into profile answers (stored together)
    const allProfileData = { ...profileAnswers };
    if (Object.keys(extraContext).length > 0) {
      // Store extra context under a dedicated key to keep it organized
      allProfileData.extra_context = {
        ...(typeof allProfileData.extra_context === 'object' && allProfileData.extra_context !== null 
          ? allProfileData.extra_context as Record<string, unknown>
          : {}),
        ...extraContext,
      };
    }
    
    if (Object.keys(allProfileData).length > 0) {
      await storeUserProfile(budget_id, allProfileData, sourceIp);
    }

    // Update session with final model
    await updateSessionFinal(
      budget_id,
      updatedModel as unknown as Record<string, unknown>,
      sourceIp,
      { 
        answer_count: Object.keys(answersObj).length,
        model_field_count: Object.keys(modelAnswers).length,
        profile_field_count: Object.keys(profileAnswers).length,
        extra_context_count: Object.keys(extraContext).length,
      }
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



