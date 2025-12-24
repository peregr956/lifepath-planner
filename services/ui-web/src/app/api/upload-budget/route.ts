/**
 * Upload Budget API Route
 * 
 * Accepts budget file uploads (CSV/XLSX) and parses them into draft budget models.
 * Ported from Python api-gateway + budget-ingestion-service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { parseCsvToDraftModel, parseXlsxToDraftModel } from '@/lib/parsers';
import { createSession, initDatabase } from '@/lib/db';

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
    await ensureDbInitialized();

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
      console.error('[upload-budget] Parse error:', parseError);
      return NextResponse.json(
        { error: 'parse_error', details: 'Failed to parse the budget file.' },
        { status: 400 }
      );
    }

    // Count income and expense lines
    let detectedIncomeLines = 0;
    let detectedExpenseLines = 0;
    for (const line of draftBudget.lines) {
      if (line.amount > 0) {
        detectedIncomeLines++;
      } else if (line.amount < 0) {
        detectedExpenseLines++;
      }
    }

    // Create budget session
    const budgetId = uuidv4();
    const sourceIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    
    await createSession(
      budgetId,
      draftBudget as unknown as Record<string, unknown>,
      sourceIp,
      { 
        filename: file.name, 
        detected_income_lines: detectedIncomeLines,
        detected_expense_lines: detectedExpenseLines,
      }
    );

    console.log(`[upload-budget] Created session ${budgetId} from ${file.name}`);

    return NextResponse.json({
      budget_id: budgetId,
      status: 'parsed',
      detected_format: draftBudget.detected_format,
      detected_format_hints: draftBudget.format_hints || {},
      summary_preview: {
        detected_income_lines: detectedIncomeLines,
        detected_expense_lines: detectedExpenseLines,
      },
    });
  } catch (error) {
    console.error('[upload-budget] Unexpected error:', error);
    return NextResponse.json(
      { error: 'internal_error', details: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

