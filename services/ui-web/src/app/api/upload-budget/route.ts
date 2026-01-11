/**
 * Upload Budget API Route
 * 
 * Accepts budget file uploads (CSV/XLSX) and parses them into draft budget models.
 * Ported from Python api-gateway + budget-ingestion-service.
 * 
 * Phase 8.5.4: Now includes AI-first budget interpretation for meaningful labels.
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { parseCsvToDraftModel, parseXlsxToDraftModel } from '@/lib/parsers';
import { createSession, initDatabase, associateSessionWithUser } from '@/lib/db';
import { interpretBudgetWithAI, isInterpretationAIEnabled } from '@/lib/aiBudgetInterpretation';
import { auth } from '@/lib/auth';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

// Determine file type from content type or filename
function getFileType(contentType: string | null, filename: string): 'csv' | 'xlsx' | null {
  const ct = contentType?.toLowerCase() ?? '';
  const fn = filename.toLowerCase();

  if (ct.includes('csv') || ct.includes('text/plain') || fn.endsWith('.csv')) {
    return 'csv';
  }
  if (ct.includes('spreadsheet') || ct.includes('excel') || fn.endsWith('.xlsx')) {
    return 'xlsx';
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user (optional - budgets can be created anonymously)
    const session = await auth();
    const userId = session?.user?.id ?? null;

    // Initialize database
    try {
      await ensureDbInitialized();
    } catch (dbError) {
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      console.error('[upload-budget] Database initialization error:', {
        error: errorMessage,
        stack: dbError instanceof Error ? dbError.stack : undefined,
      });
      return NextResponse.json(
        { 
          error: 'database_error', 
          details: 'Failed to initialize database connection. Please check your database configuration.',
          ...(process.env.NODE_ENV === 'development' && { 
            technical_details: errorMessage 
          })
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'file_required', details: 'File upload is required.' },
        { status: 400 }
      );
    }

    const fileType = getFileType(file.type, file.name);
    if (!fileType) {
      return NextResponse.json(
        { error: 'unsupported_file_type', details: 'Only CSV and XLSX files are supported.' },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: 'file_empty', details: 'Uploaded file is empty.' },
        { status: 400 }
      );
    }

    // Parse the file
    let draftBudget;
    try {
      if (fileType === 'csv') {
        const text = new TextDecoder().decode(arrayBuffer);
        draftBudget = parseCsvToDraftModel(text);
      } else {
        draftBudget = parseXlsxToDraftModel(arrayBuffer);
      }
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      console.error('[upload-budget] Parse error:', {
        error: errorMessage,
        stack: parseError instanceof Error ? parseError.stack : undefined,
        filename: file.name,
        fileType,
      });
      return NextResponse.json(
        { 
          error: 'parse_error', 
          details: 'Failed to parse the budget file. Please ensure the file is a valid CSV or XLSX format.',
          ...(process.env.NODE_ENV === 'development' && { 
            technical_details: errorMessage 
          })
        },
        { status: 400 }
      );
    }

    // Count income and expense lines from raw draft
    let detectedIncomeLines = 0;
    let detectedExpenseLines = 0;
    for (const line of draftBudget.lines) {
      if (line.amount > 0) {
        detectedIncomeLines++;
      } else if (line.amount < 0) {
        detectedExpenseLines++;
      }
    }

    // Phase 8.5.4: AI-first budget interpretation
    // This step reads all columns (including description) and produces meaningful labels
    let interpretationResult = null;
    let usedAI = false;
    let interpretationNotes = '';

    try {
      console.log('[upload-budget] Starting AI budget interpretation...');
      interpretationResult = await interpretBudgetWithAI(draftBudget);
      usedAI = interpretationResult.usedAI;
      interpretationNotes = interpretationResult.notes;
      
      console.log('[upload-budget] Budget interpretation complete', {
        usedAI,
        incomeCount: interpretationResult.model.income.length,
        expenseCount: interpretationResult.model.expenses.length,
        debtCount: interpretationResult.model.debts.length,
      });
    } catch (interpretError) {
      const errorMessage = interpretError instanceof Error ? interpretError.message : String(interpretError);
      console.error('[upload-budget] Budget interpretation error (will continue with raw draft):', {
        error: errorMessage,
        stack: interpretError instanceof Error ? interpretError.stack : undefined,
      });
      // Continue with raw draft - interpretation is optional
    }

    // Create budget session with both raw draft and interpreted model
    const budgetId = uuidv4();
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    
    // Store both the raw draft and the interpreted model
    // The interpreted model (if available) will be used for clarification questions
    const sessionPayload = {
      ...draftBudget,
      // Phase 8.5.4: Include interpreted model for downstream use
      interpreted_model: interpretationResult?.model || null,
      interpretation_metadata: {
        used_ai: usedAI,
        notes: interpretationNotes,
        ai_enabled: isInterpretationAIEnabled(),
      },
    };

    try {
      await createSession(
        budgetId,
        sessionPayload as unknown as Record<string, unknown>,
        sourceIp,
        { 
          filename: file.name, 
          detected_income_lines: detectedIncomeLines,
          detected_expense_lines: detectedExpenseLines,
          interpretation_used_ai: usedAI,
        }
      );

      // Phase 9: Associate budget session with authenticated user
      if (userId) {
        await associateSessionWithUser(budgetId, userId);
        console.log(`[upload-budget] Associated session ${budgetId} with user ${userId}`);
      }
    } catch (sessionError) {
      const errorMessage = sessionError instanceof Error ? sessionError.message : String(sessionError);
      console.error('[upload-budget] Session creation error:', {
        error: errorMessage,
        stack: sessionError instanceof Error ? sessionError.stack : undefined,
        budgetId,
        filename: file.name,
      });
      return NextResponse.json(
        { 
          error: 'session_creation_error', 
          details: 'Failed to save budget session. Please try again.',
          ...(process.env.NODE_ENV === 'development' && { 
            technical_details: errorMessage 
          })
        },
        { status: 500 }
      );
    }

    console.log(`[upload-budget] Created session ${budgetId} from ${file.name}`);

    // Return response with interpretation metadata
    return NextResponse.json({
      budget_id: budgetId,
      status: 'parsed',
      detected_format: draftBudget.detected_format,
      detected_format_hints: draftBudget.format_hints || {},
      summary_preview: {
        detected_income_lines: interpretationResult?.model.income.length ?? detectedIncomeLines,
        detected_expense_lines: interpretationResult?.model.expenses.length ?? detectedExpenseLines,
      },
      // Phase 8.5.4: Include interpretation metadata in response
      interpretation: {
        used_ai: usedAI,
        ai_enabled: isInterpretationAIEnabled(),
        notes: interpretationNotes || undefined,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[upload-budget] Unexpected error:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { 
        error: 'internal_error', 
        details: 'An unexpected error occurred. Please try again.',
        ...(process.env.NODE_ENV === 'development' && { 
          technical_details: errorMessage 
        })
      },
      { status: 500 }
    );
  }
}

