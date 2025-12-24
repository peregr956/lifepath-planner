/**
 * Budget file parsing utilities
 * 
 * Ported from Python budget-ingestion-service to TypeScript for Vercel deployment.
 * Supports CSV and XLSX file formats.
 */

import * as XLSX from 'xlsx';

// Types matching the Python models
export interface RawBudgetLine {
  source_row_index: number;
  date: string | null;
  category_label: string;
  description: string | null;
  amount: number;
  metadata: Record<string, unknown>;
}

export interface DraftBudgetModel {
  lines: RawBudgetLine[];
  detected_format: 'categorical' | 'ledger' | 'unknown';
  notes: string | null;
  format_hints: Record<string, unknown> | null;
}

// Header detection constants
const CATEGORY_HEADERS = ['category', 'category_label', 'category name', 'type'];
const AMOUNT_HEADERS = ['amount', 'value', 'total'];
const DESCRIPTION_HEADERS = ['description', 'memo', 'notes', 'note'];
const DATE_HEADERS = ['date', 'transaction date', 'posted date'];
const LEDGER_DEBIT_HEADERS = ['debit', 'withdrawal', 'withdraw', 'dr'];
const LEDGER_CREDIT_HEADERS = ['credit', 'deposit', 'cr'];
const LEDGER_BALANCE_HEADERS = ['balance', 'running balance'];

interface HeaderSignals {
  has_debit_column: boolean;
  has_credit_column: boolean;
  has_balance_column: boolean;
}

/**
 * Parse a CSV file into a DraftBudgetModel
 */
export function parseCsvToDraftModel(fileContent: string): DraftBudgetModel {
  const lines = fileContent.split('\n');
  if (lines.length === 0) {
    return {
      lines: [],
      detected_format: 'unknown',
      notes: 'CSV file is empty.',
      format_hints: null,
    };
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  if (headers.length === 0) {
    return {
      lines: [],
      detected_format: 'unknown',
      notes: 'CSV file is missing a header row.',
      format_hints: null,
    };
  }

  const categoryKey = findColumn(headers, CATEGORY_HEADERS);
  const amountKey = findColumn(headers, AMOUNT_HEADERS);
  const descriptionKey = findColumn(headers, DESCRIPTION_HEADERS);
  const dateKey = findColumn(headers, DATE_HEADERS);
  const headerSignals = extractHeaderSignals(headers);

  const warnings: string[] = [];
  if (categoryKey === null) {
    warnings.push('Category column not detected; leaving labels empty.');
  }
  if (amountKey === null) {
    warnings.push('Amount column not detected; skipping lines without numeric value.');
  }

  const budgetLines: RawBudgetLine[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const rowValues = parseCSVLine(lines[i]);
    const row = createRowObject(headers, rowValues);
    
    const categoryValue = categoryKey ? (row[categoryKey] ?? '').toString().trim() : '';
    const amountValue = amountKey ? row[amountKey] : null;
    
    if (amountValue === null || amountValue === undefined || String(amountValue).trim() === '') {
      continue;
    }

    const amount = parseAmount(amountValue);
    const description = descriptionKey ? row[descriptionKey]?.toString().trim() ?? null : null;
    const parsedDate = dateKey ? parseDate(row[dateKey]) : null;
    const metadata = buildMetadata(row, [categoryKey, amountKey, descriptionKey, dateKey]);

    budgetLines.push({
      source_row_index: i + 1, // 1-indexed, header is row 1
      date: parsedDate,
      category_label: categoryValue,
      description,
      amount,
      metadata,
    });
  }

  const { detected_format, format_hints } = detectFormat(budgetLines, headerSignals);
  const combinedNotes = warnings.length > 0 ? warnings.join(' ') : null;

  return {
    lines: budgetLines,
    detected_format,
    notes: combinedNotes,
    format_hints,
  };
}

/**
 * Parse an XLSX file into a DraftBudgetModel
 */
export function parseXlsxToDraftModel(fileBuffer: ArrayBuffer): DraftBudgetModel {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  if (!sheet) {
    return {
      lines: [],
      detected_format: 'unknown',
      notes: 'XLSX file is empty.',
      format_hints: null,
    };
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  if (rows.length === 0) {
    return {
      lines: [],
      detected_format: 'unknown',
      notes: 'XLSX file is empty.',
      format_hints: null,
    };
  }

  const headerRow = rows[0];
  const headers = normalizeHeaders(headerRow);

  const categoryKey = findColumn(headers, CATEGORY_HEADERS);
  const amountKey = findColumn(headers, AMOUNT_HEADERS);
  const descriptionKey = findColumn(headers, DESCRIPTION_HEADERS);
  const dateKey = findColumn(headers, DATE_HEADERS);
  const headerSignals = extractHeaderSignals(headers);

  const warnings: string[] = [];
  if (categoryKey === null) {
    warnings.push('Category column not detected; leaving labels empty.');
  }
  if (amountKey === null) {
    warnings.push('Amount column not detected; skipping lines without numeric value.');
  }

  const budgetLines: RawBudgetLine[] = [];

  for (let i = 1; i < rows.length; i++) {
    const rawRow = rows[i];
    const row = createRowObject(headers, rawRow as string[]);

    const categoryValue = categoryKey ? (row[categoryKey] ?? '').toString().trim() : '';
    const amountValue = amountKey ? row[amountKey] : null;

    if (amountValue === null || amountValue === undefined || String(amountValue).trim() === '') {
      continue;
    }

    const amount = parseAmount(amountValue);
    const description = descriptionKey ? row[descriptionKey]?.toString().trim() ?? null : null;
    const parsedDate = dateKey ? parseDate(row[dateKey]) : null;
    const metadata = buildMetadata(row, [categoryKey, amountKey, descriptionKey, dateKey]);

    budgetLines.push({
      source_row_index: i + 1,
      date: parsedDate,
      category_label: categoryValue,
      description,
      amount,
      metadata,
    });
  }

  const { detected_format, format_hints } = detectFormat(budgetLines, headerSignals);
  const combinedNotes = warnings.length > 0 ? warnings.join(' ') : null;

  return {
    lines: budgetLines,
    detected_format,
    notes: combinedNotes,
    format_hints,
  };
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Normalize header row values to strings
 */
function normalizeHeaders(headerRow: unknown[]): string[] {
  return headerRow.map(cell => {
    if (cell === null || cell === undefined) return '';
    return String(cell).trim();
  });
}

/**
 * Find a column by matching header names
 */
function findColumn(headers: string[], candidates: string[]): string | null {
  const lowered = new Map<string, string>();
  for (const header of headers) {
    if (header) {
      lowered.set(header.toLowerCase().trim(), header);
    }
  }

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().trim();
    if (lowered.has(normalized)) {
      return lowered.get(normalized)!;
    }
  }
  return null;
}

/**
 * Create a row object from headers and values
 */
function createRowObject(headers: string[], values: (string | number | unknown)[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    if (headers[i]) {
      obj[headers[i]] = values[i] ?? '';
    }
  }
  return obj;
}

/**
 * Parse an amount value, handling currency symbols and formatting
 */
function parseAmount(rawValue: unknown): number {
  if (rawValue === null || rawValue === undefined) return 0;
  if (typeof rawValue === 'number') return rawValue;

  let cleaned = String(rawValue).replace(/,/g, '').trim();
  for (const symbol of ['$', '€', '£']) {
    cleaned = cleaned.replace(symbol, '');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse a date string into ISO format
 */
function parseDate(rawValue: unknown): string | null {
  if (!rawValue) return null;

  // Handle Excel date numbers
  if (typeof rawValue === 'number') {
    const excelDate = XLSX.SSF.parse_date_code(rawValue);
    if (excelDate) {
      const year = excelDate.y;
      const month = String(excelDate.m).padStart(2, '0');
      const day = String(excelDate.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  const text = String(rawValue).trim();
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY or M/D/YYYY
  ];

  for (const format of formats) {
    const match = text.match(format);
    if (match) {
      if (format === formats[0]) {
        return text; // Already ISO format
      } else if (format === formats[1]) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  return null;
}

/**
 * Build metadata from row, excluding already-processed keys
 */
function buildMetadata(row: Record<string, unknown>, keptKeys: (string | null)[]): Record<string, unknown> {
  const reserved = new Set(keptKeys.filter((k): k is string => k !== null));
  const metadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (!reserved.has(key) && value !== null && value !== '' && value !== undefined) {
      metadata[key] = value;
    }
  }

  return metadata;
}

/**
 * Extract header signals for format detection
 */
function extractHeaderSignals(headers: string[]): HeaderSignals {
  const normalized = new Set(headers.map(h => h.toLowerCase().trim()).filter(h => h));
  
  return {
    has_debit_column: LEDGER_DEBIT_HEADERS.some(h => normalized.has(h)),
    has_credit_column: LEDGER_CREDIT_HEADERS.some(h => normalized.has(h)),
    has_balance_column: LEDGER_BALANCE_HEADERS.some(h => normalized.has(h)),
  };
}

/**
 * Detect whether the budget is categorical or ledger format
 */
function detectFormat(
  lines: RawBudgetLine[],
  headerSignals: HeaderSignals
): { detected_format: 'categorical' | 'ledger' | 'unknown'; format_hints: Record<string, unknown> } {
  const hints: Record<string, unknown> = {
    has_debit_column: headerSignals.has_debit_column,
    has_credit_column: headerSignals.has_credit_column,
    has_balance_column: headerSignals.has_balance_column,
    line_count: lines.length,
    has_dense_dates: hasDenseDateCadence(lines),
    has_positive_and_negative: hasPositiveAndNegative(lines),
  };

  let score = 0;
  if (headerSignals.has_debit_column || headerSignals.has_credit_column) {
    score += 2;
  }
  if (headerSignals.has_balance_column) {
    score += 1;
  }
  if (hints.has_dense_dates) {
    score += 1;
  }
  if (hints.has_positive_and_negative && lines.length >= 20) {
    score += 1;
  }
  if (lines.length >= 40) {
    score += 1;
  }

  const detected_format = score >= 2 ? 'ledger' : 'categorical';
  hints.detection_score = score;
  hints.detected_format = detected_format;

  return { detected_format, format_hints: hints };
}

/**
 * Check if lines have both positive and negative amounts
 */
function hasPositiveAndNegative(lines: RawBudgetLine[]): boolean {
  let hasPositive = false;
  let hasNegative = false;

  for (const line of lines) {
    if (line.amount > 0) hasPositive = true;
    if (line.amount < 0) hasNegative = true;
    if (hasPositive && hasNegative) return true;
  }

  return false;
}

/**
 * Check if lines have dense date cadence (typical of transaction logs)
 */
function hasDenseDateCadence(lines: RawBudgetLine[]): boolean {
  const dates = lines
    .map(l => l.date)
    .filter((d): d is string => d !== null)
    .map(d => new Date(d).getTime())
    .filter(d => !isNaN(d));

  const uniqueDates = [...new Set(dates)].sort((a, b) => a - b);

  if (uniqueDates.length < 6) return false;

  const differences: number[] = [];
  for (let i = 1; i < uniqueDates.length; i++) {
    const delta = (uniqueDates[i] - uniqueDates[i - 1]) / (1000 * 60 * 60 * 24);
    if (delta > 0) differences.push(delta);
  }

  if (differences.length === 0) return false;

  // Calculate median gap
  differences.sort((a, b) => a - b);
  const mid = Math.floor(differences.length / 2);
  const typicalGap = differences.length % 2 !== 0
    ? differences[mid]
    : (differences[mid - 1] + differences[mid]) / 2;

  return typicalGap <= 7;
}

