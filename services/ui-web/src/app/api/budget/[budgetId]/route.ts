/**
 * Budget Update API Route
 * 
 * PATCH: Updates budget model in-place (income, expenses, debts, preferences, query)
 * GET: Retrieves the current budget model
 * 
 * Phase 4.6: Inline Editing on Summary Screen
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, storeUserQuery, storeUserProfile, storeFoundationalContext, initDatabase } from '@/lib/db';
import { Pool } from 'pg';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

// Types for the PATCH request body
type PatchIncomeEntry = {
  id: string;
  name?: string;
  monthly_amount?: number;
  type?: 'earned' | 'passive' | 'transfer';
  stability?: 'stable' | 'variable' | 'seasonal';
};

type PatchExpenseEntry = {
  id: string;
  category?: string;
  monthly_amount?: number;
  essential?: boolean | null;
  notes?: string | null;
};

type PatchDebtEntry = {
  id: string;
  name?: string;
  balance?: number;
  interest_rate?: number;
  min_payment?: number;
  priority?: 'high' | 'medium' | 'low';
  approximate?: boolean;
};

type PatchPreferences = {
  optimization_focus?: 'debt' | 'savings' | 'balanced';
  protect_essentials?: boolean;
  max_desired_change_per_category?: number;
};

type PatchBudgetRequest = {
  income?: PatchIncomeEntry[];
  expenses?: PatchExpenseEntry[];
  debts?: PatchDebtEntry[];
  preferences?: PatchPreferences;
  userQuery?: string;
  userProfile?: Record<string, unknown>;
  // Phase 9.1.5: Foundational context syncing
  foundationalContext?: Record<string, unknown>;
};

// Get database pool
function getPool(): Pool | null {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  return new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 1,
  });
}

function hasPostgres(): boolean {
  return !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

// In-memory store reference (for dev mode without Postgres)
const memoryStore: Map<string, Record<string, unknown>> = new Map();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ budgetId: string }> }
) {
  try {
    await ensureDbInitialized();

    const { budgetId } = await params;

    if (!budgetId) {
      return NextResponse.json(
        { error: 'budget_id_required', details: 'Budget ID is required.' },
        { status: 400 }
      );
    }

    const session = await getSession(budgetId);
    if (!session) {
      return NextResponse.json(
        { error: 'budget_session_not_found', details: 'Budget session not found.' },
        { status: 404 }
      );
    }

    // Return the most complete model available
    const model = session.final || session.partial || session.draft;

    return NextResponse.json({
      budget_id: budgetId,
      stage: session.stage,
      model,
      user_query: session.user_query,
      user_profile: session.user_profile,
    });
  } catch (error) {
    console.error('[budget/[budgetId]] GET error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ budgetId: string }> }
) {
  try {
    await ensureDbInitialized();

    const { budgetId } = await params;

    if (!budgetId) {
      return NextResponse.json(
        { error: 'budget_id_required', details: 'Budget ID is required.' },
        { status: 400 }
      );
    }

    const session = await getSession(budgetId);
    if (!session) {
      return NextResponse.json(
        { error: 'budget_session_not_found', details: 'Budget session not found.' },
        { status: 404 }
      );
    }

    const body = await request.json() as PatchBudgetRequest;
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;

    // Phase 9.1.8: Handle context updates BEFORE requiring final model
    // These can be set at any stage of the budget workflow (e.g., before clarification)
    let contextUpdated = false;

    if (body.userQuery !== undefined) {
      await storeUserQuery(budgetId, body.userQuery, sourceIp);
      contextUpdated = true;
    }

    if (body.userProfile !== undefined) {
      await storeUserProfile(budgetId, body.userProfile, sourceIp);
      contextUpdated = true;
    }

    if (body.foundationalContext !== undefined) {
      await storeFoundationalContext(budgetId, body.foundationalContext, sourceIp);
      contextUpdated = true;
    }

    // Check if any model edits are requested
    const hasModelEdits = body.income || body.expenses || body.debts || body.preferences;

    // If no model edits, return early with context update confirmation
    if (!hasModelEdits) {
      console.log(`[budget/[budgetId]] Context-only update for session ${budgetId}`, {
        contextUpdated,
        queryChanged: body.userQuery !== undefined,
        profileChanged: body.userProfile !== undefined,
        foundationalContextChanged: body.foundationalContext !== undefined,
      });

      return NextResponse.json({
        budget_id: budgetId,
        status: contextUpdated ? 'context_updated' : 'no_changes',
        user_query: body.userQuery !== undefined ? body.userQuery : session.user_query,
      });
    }

    // Require final model only for model edits (income, expenses, debts, preferences)
    if (!session.final) {
      return NextResponse.json(
        { error: 'model_not_ready', details: 'Budget model is not ready for editing. Complete clarification first.' },
        { status: 400 }
      );
    }

    const finalModel = session.final as Record<string, unknown>;
    let modelChanged = false;

    // Apply income updates
    if (body.income && Array.isArray(body.income)) {
      const incomeList = (finalModel.income as Record<string, unknown>[]) || [];
      for (const update of body.income) {
        const existing = incomeList.find((inc) => (inc as { id: string }).id === update.id);
        if (existing) {
          if (update.name !== undefined) (existing as Record<string, unknown>).name = update.name;
          if (update.monthly_amount !== undefined) (existing as Record<string, unknown>).monthly_amount = update.monthly_amount;
          if (update.type !== undefined) (existing as Record<string, unknown>).type = update.type;
          if (update.stability !== undefined) (existing as Record<string, unknown>).stability = update.stability;
          modelChanged = true;
        }
      }
    }

    // Apply expense updates
    if (body.expenses && Array.isArray(body.expenses)) {
      const expenseList = (finalModel.expenses as Record<string, unknown>[]) || [];
      for (const update of body.expenses) {
        const existing = expenseList.find((exp) => (exp as { id: string }).id === update.id);
        if (existing) {
          if (update.category !== undefined) (existing as Record<string, unknown>).category = update.category;
          if (update.monthly_amount !== undefined) (existing as Record<string, unknown>).monthly_amount = update.monthly_amount;
          if (update.essential !== undefined) (existing as Record<string, unknown>).essential = update.essential;
          if (update.notes !== undefined) (existing as Record<string, unknown>).notes = update.notes;
          modelChanged = true;
        }
      }
    }

    // Apply debt updates
    if (body.debts && Array.isArray(body.debts)) {
      const debtList = (finalModel.debts as Record<string, unknown>[]) || [];
      for (const update of body.debts) {
        const existing = debtList.find((debt) => (debt as { id: string }).id === update.id);
        if (existing) {
          if (update.name !== undefined) (existing as Record<string, unknown>).name = update.name;
          if (update.balance !== undefined) (existing as Record<string, unknown>).balance = update.balance;
          if (update.interest_rate !== undefined) (existing as Record<string, unknown>).interest_rate = update.interest_rate;
          if (update.min_payment !== undefined) (existing as Record<string, unknown>).min_payment = update.min_payment;
          if (update.priority !== undefined) (existing as Record<string, unknown>).priority = update.priority;
          if (update.approximate !== undefined) (existing as Record<string, unknown>).approximate = update.approximate;
          modelChanged = true;
        }
      }
    }

    // Apply preference updates
    if (body.preferences) {
      const prefs = (finalModel.preferences as Record<string, unknown>) || {};
      if (body.preferences.optimization_focus !== undefined) {
        prefs.optimization_focus = body.preferences.optimization_focus;
        modelChanged = true;
      }
      if (body.preferences.protect_essentials !== undefined) {
        prefs.protect_essentials = body.preferences.protect_essentials;
        modelChanged = true;
      }
      if (body.preferences.max_desired_change_per_category !== undefined) {
        prefs.max_desired_change_per_category = body.preferences.max_desired_change_per_category;
        modelChanged = true;
      }
      finalModel.preferences = prefs;
    }

    // Recalculate summary if model changed
    if (modelChanged) {
      const incomeList = (finalModel.income as Array<{ monthly_amount: number }>) || [];
      const expenseList = (finalModel.expenses as Array<{ monthly_amount: number }>) || [];
      
      const totalIncome = incomeList.reduce((sum, inc) => sum + (inc.monthly_amount || 0), 0);
      const totalExpenses = expenseList.reduce((sum, exp) => sum + (exp.monthly_amount || 0), 0);
      
      finalModel.summary = {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        surplus: totalIncome - totalExpenses,
      };
    }

    // Update the session in database
    const now = new Date();

    if (hasPostgres()) {
      const pool = getPool();
      if (pool) {
        await pool.query(
          `UPDATE budget_sessions 
           SET final = $1::jsonb, updated_at = $2
           WHERE id = $3`,
          [JSON.stringify(finalModel), now.toISOString(), budgetId]
        );
        await pool.end();
      }
    } else {
      // Update in-memory store
      memoryStore.set(budgetId, { ...session, final: finalModel, updated_at: now });
    }

    // Note: userQuery, userProfile, and foundationalContext are now handled
    // at the beginning of the function (Phase 9.1.8)

    console.log(`[budget/[budgetId]] Updated session ${budgetId}`, {
      modelChanged,
      contextUpdated,
    });

    return NextResponse.json({
      budget_id: budgetId,
      status: 'updated',
      model: finalModel,
      user_query: body.userQuery !== undefined ? body.userQuery : session.user_query,
    });
  } catch (error) {
    console.error('[budget/[budgetId]] PATCH error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
