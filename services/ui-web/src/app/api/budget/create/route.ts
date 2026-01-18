/**
 * Create Budget API Route
 * 
 * Creates a budget session from the Budget Builder wizard.
 * Unlike upload-budget which parses files, this accepts a pre-built
 * UnifiedBudgetModel directly from the client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createSession, initDatabase, associateSessionWithUser } from '@/lib/db';
import { auth } from '@/lib/auth';
import type { UnifiedBudgetModel } from '@/types/budget';

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
    // Get authenticated user
    const session = await auth();
    const userId = session?.user?.id ?? null;

    // Initialize database
    try {
      await ensureDbInitialized();
    } catch (dbError) {
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      console.error('[budget/create] Database initialization error:', {
        error: errorMessage,
        stack: dbError instanceof Error ? dbError.stack : undefined,
      });
      return NextResponse.json(
        { 
          error: 'database_error', 
          details: 'Failed to initialize database connection.',
          ...(process.env.NODE_ENV === 'development' && { 
            technical_details: errorMessage 
          })
        },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { unifiedModel, plannerInputs } = body as {
      unifiedModel: UnifiedBudgetModel;
      plannerInputs?: Record<string, unknown>;
    };

    if (!unifiedModel) {
      return NextResponse.json(
        { error: 'model_required', details: 'UnifiedBudgetModel is required.' },
        { status: 400 }
      );
    }

    // Validate the model has required fields
    if (!unifiedModel.income || !unifiedModel.expenses || !unifiedModel.summary) {
      return NextResponse.json(
        { error: 'invalid_model', details: 'Model must have income, expenses, and summary.' },
        { status: 400 }
      );
    }

    // Generate a unique budget ID
    const budgetId = uuidv4();

    // Create the draft payload (matching upload-budget structure)
    const draftPayload = {
      source: 'budget_builder',
      detected_format: 'budget_builder',
      lines: [], // Not used for builder
      raw_text: null,
      // Store the pre-built model as interpreted_model
      interpreted_model: unifiedModel,
      interpretation_metadata: {
        used_ai: false,
        notes: 'Built from Budget Builder wizard',
        ai_enabled: false,
      },
      // Store the original planner inputs for reference
      planner_inputs: plannerInputs ?? null,
    };

    // Create session in database
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    
    try {
      await createSession(budgetId, draftPayload, sourceIp, {
        source: 'budget_builder',
        income_count: unifiedModel.income.length,
        expense_count: unifiedModel.expenses.length,
        debt_count: unifiedModel.debts?.length ?? 0,
      });

      // Associate with user if authenticated
      if (userId) {
        await associateSessionWithUser(budgetId, userId);
        console.log(`[budget/create] Associated budget ${budgetId} with user ${userId}`);
      }

      console.log(`[budget/create] Created budget session ${budgetId}`, {
        incomeCount: unifiedModel.income.length,
        expenseCount: unifiedModel.expenses.length,
        debtCount: unifiedModel.debts?.length ?? 0,
        totalIncome: unifiedModel.summary.totalIncome,
        totalExpenses: unifiedModel.summary.totalExpenses,
        userId: userId ?? 'anonymous',
      });

      return NextResponse.json({
        budget_id: budgetId,
        status: 'created',
        detected_format: 'budget_builder',
        summary_preview: {
          detected_income_lines: unifiedModel.income.length,
          detected_expense_lines: unifiedModel.expenses.length,
        },
      });
    } catch (dbError) {
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      console.error('[budget/create] Failed to create session:', {
        error: errorMessage,
        budgetId,
      });
      return NextResponse.json(
        { 
          error: 'session_creation_failed', 
          details: 'Failed to save budget session.',
          ...(process.env.NODE_ENV === 'development' && { 
            technical_details: errorMessage 
          })
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[budget/create] Unexpected error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
