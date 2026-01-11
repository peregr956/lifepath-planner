/**
 * User Profile API Route
 * 
 * GET - Retrieve current user's profile
 * PATCH - Update current user's profile preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserProfile, upsertUserProfile, initDatabase } from '@/lib/db';

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
 * Get current user's profile with preferences
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
      profile: profile ?? {
        default_financial_philosophy: null,
        default_optimization_focus: null,
        default_risk_tolerance: null,
        onboarding_completed: false,
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
    
    // Validate and extract allowed fields
    const allowedFields = [
      'default_financial_philosophy',
      'default_optimization_focus',
      'default_risk_tolerance',
      'onboarding_completed',
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

    // Validate enum values
    const validPhilosophies = ['rpf', 'money_guy', 'dave_ramsey', 'bogleheads', 'fire', 'neutral', 'custom'];
    const validOptimizations = ['debt_payoff', 'savings', 'balanced', 'custom'];
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

    const profile = await upsertUserProfile(session.user.id, updates as {
      default_financial_philosophy?: string | null;
      default_optimization_focus?: string | null;
      default_risk_tolerance?: string | null;
      onboarding_completed?: boolean;
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
