/**
 * User Profile API Route
 * 
 * GET - Retrieve current user's profile
 * PATCH - Update current user's profile preferences
 * 
 * Phase 9.1.1: Extended to support all foundational fields and confidence metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserProfile, upsertUserProfile, initDatabase } from '@/lib/db';
import type { ProfileMetadata } from '@/lib/db';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

/**
 * GET /api/user/profile
 * Get current user's profile with all foundational fields
 */
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'unauthorized', details: 'Authentication required' },
        { status: 401 }
      );
    }

    await ensureDbInitialized();

    const profile = await getUserProfile(session.user.id);

    return NextResponse.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
      },
      // Phase 9.1.1: Return all foundational fields with defaults
      profile: profile ?? {
        default_financial_philosophy: null,
        default_optimization_focus: null,
        default_risk_tolerance: null,
        onboarding_completed: false,
        // Phase 9.1.1: Extended foundational fields
        default_primary_goal: null,
        default_goal_timeline: null,
        default_life_stage: null,
        default_emergency_fund_status: null,
        profile_metadata: null,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[user-profile] GET error:', errorMessage);
    return NextResponse.json(
      { error: 'internal_error', details: 'Failed to retrieve profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/profile
 * Update user profile preferences
 * Phase 9.1.1: Extended to support all foundational fields and metadata
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'unauthorized', details: 'Authentication required' },
        { status: 401 }
      );
    }

    await ensureDbInitialized();

    const body = await request.json();
    
    // Phase 9.1.1: Extended allowed fields list
    const allowedFields = [
      // Original Phase 9 fields
      'default_financial_philosophy',
      'default_optimization_focus',
      'default_risk_tolerance',
      'onboarding_completed',
      // Phase 9.1.1: Extended foundational fields
      'default_primary_goal',
      'default_goal_timeline',
      'default_life_stage',
      'default_emergency_fund_status',
      'profile_metadata',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'no_updates', details: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Validate enum values for original fields
    const validPhilosophies = ['rpf', 'money_guy', 'dave_ramsey', 'bogleheads', 'fire', 'neutral', 'custom', 'r_personalfinance'];
    const validOptimizations = ['debt_payoff', 'savings', 'balanced', 'custom', 'debt'];
    const validRiskTolerances = ['conservative', 'moderate', 'aggressive'];

    if (updates.default_financial_philosophy && !validPhilosophies.includes(updates.default_financial_philosophy as string)) {
      return NextResponse.json(
        { error: 'invalid_value', details: 'Invalid financial philosophy' },
        { status: 400 }
      );
    }

    if (updates.default_optimization_focus && !validOptimizations.includes(updates.default_optimization_focus as string)) {
      return NextResponse.json(
        { error: 'invalid_value', details: 'Invalid optimization focus' },
        { status: 400 }
      );
    }

    if (updates.default_risk_tolerance && !validRiskTolerances.includes(updates.default_risk_tolerance as string)) {
      return NextResponse.json(
        { error: 'invalid_value', details: 'Invalid risk tolerance' },
        { status: 400 }
      );
    }

    // Phase 9.1.1: Validate new enum fields
    const validGoalTimelines = ['immediate', 'short_term', 'medium_term', 'long_term'];
    const validLifeStages = ['early_career', 'mid_career', 'family_building', 'peak_earning', 'pre_retirement', 'retired'];
    const validEmergencyFundStatuses = ['none', 'partial', 'adequate', 'robust'];

    if (updates.default_goal_timeline && !validGoalTimelines.includes(updates.default_goal_timeline as string)) {
      return NextResponse.json(
        { error: 'invalid_value', details: 'Invalid goal timeline' },
        { status: 400 }
      );
    }

    if (updates.default_life_stage && !validLifeStages.includes(updates.default_life_stage as string)) {
      return NextResponse.json(
        { error: 'invalid_value', details: 'Invalid life stage' },
        { status: 400 }
      );
    }

    if (updates.default_emergency_fund_status && !validEmergencyFundStatuses.includes(updates.default_emergency_fund_status as string)) {
      return NextResponse.json(
        { error: 'invalid_value', details: 'Invalid emergency fund status' },
        { status: 400 }
      );
    }

    // Validate profile_metadata structure if provided
    if (updates.profile_metadata !== undefined && updates.profile_metadata !== null) {
      if (typeof updates.profile_metadata !== 'object') {
        return NextResponse.json(
          { error: 'invalid_value', details: 'profile_metadata must be an object' },
          { status: 400 }
        );
      }
    }

    // primary_goal is free text (VARCHAR(200)), no enum validation needed

    const profile = await upsertUserProfile(session.user.id, updates as {
      default_financial_philosophy?: string | null;
      default_optimization_focus?: string | null;
      default_risk_tolerance?: string | null;
      onboarding_completed?: boolean;
      default_primary_goal?: string | null;
      default_goal_timeline?: string | null;
      default_life_stage?: string | null;
      default_emergency_fund_status?: string | null;
      profile_metadata?: ProfileMetadata | null;
    });

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[user-profile] PATCH error:', errorMessage);
    return NextResponse.json(
      { error: 'internal_error', details: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
