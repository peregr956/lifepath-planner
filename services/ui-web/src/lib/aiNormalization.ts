/**
 * AI-powered budget normalization
 * 
 * @deprecated Phase 8.5.4: This module is superseded by aiBudgetInterpretation.ts
 * which provides a unified AI-first interpretation that handles both sign normalization
 * AND meaningful label selection in a single step.
 * 
 * This module is retained for:
 * - Backward compatibility with existing sessions
 * - Fallback when aiBudgetInterpretation is not used
 * 
 * For new development, use aiBudgetInterpretation.ts instead.
 * 
 * Original purpose:
 * Analyzes raw budget data and correctly classifies amounts as income (positive)
 * or expenses (negative) regardless of the original format.
 * 
 * Ported from Python services/clarification-service/src/providers/openai_budget_normalization.py
 * 
 * Phase 8.5.2: Refactored for AI generalizability
 * - Removed keyword classification lists (AI understands financial terms)
 * - Retained sign convention (technical requirement, not behavioral rule)
 * - Retained traceability requirement (architectural need)
 */

import OpenAI from 'openai';
import type { DraftBudgetModel, RawBudgetLine } from './parsers';
import { loadProviderSettings } from './providerSettings';

// Load normalization-specific provider settings
const normalizationSettings = loadProviderSettings({
  providerEnv: 'NORMALIZATION_PROVIDER',
  timeoutEnv: 'NORMALIZATION_TIMEOUT_SECONDS',
  temperatureEnv: 'NORMALIZATION_TEMPERATURE',
  maxTokensEnv: 'NORMALIZATION_MAX_TOKENS',
  defaultProvider: process.env.OPENAI_API_KEY ? 'openai' : 'deterministic',
  defaultTimeout: 30,
  defaultTemperature: 0.3, // Slightly higher for better classification decisions
  defaultMaxTokens: 4096, // Increased for larger budgets
});

// JSON schema for OpenAI function calling
const NORMALIZATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    lines: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          source_row_index: {
            type: 'integer' as const,
            description: 'Original row index from the input, must match exactly.',
          },
          amount: {
            type: 'number' as const,
            description: 'Normalized amount: positive for income, negative for expenses/debt payments.',
          },
          category_label: {
            type: 'string' as const,
            description: 'Category or label for this line item.',
          },
          description: {
            type: ['string', 'null'] as const,
            description: 'Optional description or memo for this line.',
          },
          line_type: {
            type: 'string' as const,
            enum: ['income', 'expense', 'debt_payment', 'savings', 'transfer'],
            description: 'Classification of this line item.',
          },
        },
        required: ['source_row_index', 'amount', 'category_label', 'line_type'],
      },
      description: 'Normalized budget lines with correctly signed amounts.',
    },
    detected_income_count: {
      type: 'integer' as const,
      description: 'Number of income items detected.',
    },
    detected_expense_count: {
      type: 'integer' as const,
      description: 'Number of expense items detected.',
    },
    detected_debt_count: {
      type: 'integer' as const,
      description: 'Number of debt payment items detected.',
    },
    normalization_notes: {
      type: 'string' as const,
      description: 'Brief explanation of normalization decisions made.',
    },
  },
  required: [
    'lines',
    'detected_income_count',
    'detected_expense_count',
    'detected_debt_count',
    'normalization_notes',
  ],
};

/**
 * SYSTEM_PROMPT for Budget Normalization
 * 
 * Refactored for AI generalizability - removed keyword lists.
 */
const SYSTEM_PROMPT = `Objective: Normalize budget amounts so income is positive and expenses are negative.

Role: You are a financial data analyst preparing raw budget data for analysis.

Context: The budget data arrives in a <budget_data> section. Input may have all-positive amounts, all-negative, or mixed signs depending on the source format.

Sign convention:
- Income (money coming in) → positive
- Expenses, debt payments, savings contributions → negative

Output: Return JSON matching the normalize_budget schema. Preserve source_row_index for traceability. Include brief notes explaining non-obvious classification decisions.`;

/**
 * Build the user prompt from draft budget data
 * 
 * Phase 8.5.2: Restructured with clear XML-style delimiters
 */
function buildUserPrompt(draft: DraftBudgetModel): string {
  const positiveCount = draft.lines.filter(line => line.amount > 0).length;
  const negativeCount = draft.lines.filter(line => line.amount < 0).length;
  const zeroCount = draft.lines.filter(line => line.amount === 0).length;

  const linesSection = draft.lines.length === 0
    ? 'No lines detected.'
    : draft.lines.map(line => {
        const desc = line.description || 'N/A';
        const metadataStr = Object.keys(line.metadata).length > 0
          ? Object.entries(line.metadata).map(([k, v]) => `${k}=${v}`).join(', ')
          : 'N/A';

        return `- Row ${line.source_row_index}: category='${line.category_label}', amount=${line.amount}, description='${desc}', date=${line.date || 'N/A'}, metadata={${metadataStr}}`;
      }).join('\n');

  return `<budget_data>
## Detected Format
${draft.detected_format}

## Format Notes
${draft.notes || 'None'}

## Budget Lines (${draft.lines.length} items)
${linesSection}

## Raw Data Summary
- Lines with positive amounts: ${positiveCount}
- Lines with negative amounts: ${negativeCount}
- Lines with zero amounts: ${zeroCount}
</budget_data>`;
}

export interface NormalizationResult {
  normalizedDraft: DraftBudgetModel;
  incomeCount: number;
  expenseCount: number;
  debtCount: number;
  notes: string;
  providerUsed: string;
}

/**
 * Get OpenAI client for normalization
 */
function getOpenAIClient(): OpenAI | null {
  if (normalizationSettings.providerName !== 'openai' || !normalizationSettings.openai) {
    return null;
  }

  return new OpenAI({
    apiKey: normalizationSettings.openai.apiKey,
    baseURL: normalizationSettings.openai.apiBase,
    timeout: normalizationSettings.timeoutSeconds * 1000,
  });
}

/**
 * Check if AI normalization is enabled
 */
export function isNormalizationAIEnabled(): boolean {
  return normalizationSettings.providerName === 'openai' && !!normalizationSettings.openai?.apiKey;
}

/**
 * Normalize a draft budget using AI
 * 
 * Analyzes the raw budget data and returns a normalized version where amounts
 * are correctly signed: income positive, expenses/debt negative.
 */
export async function normalizeDraftBudget(draft: DraftBudgetModel): Promise<NormalizationResult> {
  // If no lines, return early
  if (draft.lines.length === 0) {
    return {
      normalizedDraft: draft,
      incomeCount: 0,
      expenseCount: 0,
      debtCount: 0,
      notes: 'Empty budget - no normalization needed',
      providerUsed: 'none',
    };
  }

  const client = getOpenAIClient();

  if (!client) {
    // Fall back to deterministic passthrough
    console.log('[aiNormalization] AI not configured, using passthrough');
    return passthroughNormalization(draft);
  }

  // Analyze budget structure before normalization
  const positiveCount = draft.lines.filter(line => line.amount > 0).length;
  const negativeCount = draft.lines.filter(line => line.amount < 0).length;
  const allPositive = negativeCount === 0 && positiveCount > 0;

  console.log('[aiNormalization] Starting AI normalization', {
    lineCount: draft.lines.length,
    positiveCount,
    negativeCount,
    allPositive,
    model: normalizationSettings.openai?.model,
    detectedFormat: draft.detected_format,
  });

  try {
    const response = await client.chat.completions.create({
      model: normalizationSettings.openai!.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(draft) },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'normalize_budget',
            description: 'Normalize budget data with correctly signed amounts.',
            parameters: NORMALIZATION_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'normalize_budget' } },
      temperature: normalizationSettings.temperature,
      max_tokens: normalizationSettings.maxOutputTokens,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.warn('[aiNormalization] No tool calls in response, falling back to heuristic normalization', {
        finishReason: response.choices[0]?.finish_reason,
        message: response.choices[0]?.message?.content?.substring(0, 200),
      });
      return passthroughNormalization(draft);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(toolCalls[0].function.arguments);
    } catch (parseError) {
      console.error('[aiNormalization] Failed to parse AI response JSON', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawArguments: toolCalls[0].function.arguments.substring(0, 500),
      });
      return passthroughNormalization(draft);
    }

    const result = parseNormalizationResponse(parsed, draft);

    // Validate the result makes sense
    const totalIncome = result.normalizedDraft.lines
      .filter(l => l.amount > 0)
      .reduce((sum, l) => sum + l.amount, 0);
    const totalExpenses = result.normalizedDraft.lines
      .filter(l => l.amount < 0)
      .reduce((sum, l) => sum + Math.abs(l.amount), 0);

    console.log('[aiNormalization] AI normalization complete', {
      incomeCount: result.incomeCount,
      expenseCount: result.expenseCount,
      debtCount: result.debtCount,
      totalIncome,
      totalExpenses,
      surplus: totalIncome - totalExpenses,
    });

    // Sanity check: if all-positive budget but AI returned no expenses, something is wrong
    if (allPositive && result.expenseCount === 0 && draft.lines.length > 1) {
      console.warn('[aiNormalization] AI returned no expenses for all-positive budget - falling back to heuristic', {
        originalLineCount: draft.lines.length,
        aiIncomeCount: result.incomeCount,
      });
      return passthroughNormalization(draft);
    }

    return result;
  } catch (error) {
    // Detailed error logging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.constructor.name : 'Unknown';

    console.error('[aiNormalization] Error during AI normalization', {
      errorType,
      errorMessage,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3) : undefined,
      lineCount: draft.lines.length,
      allPositive,
    });

    // Fall back to heuristic normalization
    console.log('[aiNormalization] Falling back to heuristic normalization due to error');
    return passthroughNormalization(draft);
  }
}

/**
 * Parse the OpenAI response into a NormalizationResult
 */
function parseNormalizationResponse(
  parsed: Record<string, unknown>,
  originalDraft: DraftBudgetModel
): NormalizationResult {
  const rawLines = (parsed.lines || []) as Array<{
    source_row_index: number;
    amount: number;
    category_label: string;
    description?: string | null;
    line_type: string;
  }>;

  // Build lookup from source_row_index to original line for metadata preservation
  const originalLookup = new Map<number, RawBudgetLine>();
  for (const line of originalDraft.lines) {
    originalLookup.set(line.source_row_index, line);
  }

  const normalizedLines: RawBudgetLine[] = [];

  for (const item of rawLines) {
    const sourceRowIndex = item.source_row_index;
    if (sourceRowIndex === undefined || sourceRowIndex === null) {
      continue;
    }

    // Get original line for metadata preservation
    const originalLine = originalLookup.get(sourceRowIndex);
    if (!originalLine) {
      console.warn('[aiNormalization] Unknown row index:', sourceRowIndex);
      continue;
    }

    // Create normalized line preserving original metadata
    const normalizedLine: RawBudgetLine = {
      source_row_index: sourceRowIndex,
      date: originalLine.date,
      category_label: item.category_label || originalLine.category_label,
      description: item.description ?? originalLine.description,
      amount: Number(item.amount) || originalLine.amount,
      metadata: {
        ...originalLine.metadata,
        ai_line_type: item.line_type || 'unknown',
        original_amount: originalLine.amount,
      },
    };
    normalizedLines.push(normalizedLine);
  }

  // Create normalized draft budget
  const normalizedDraft: DraftBudgetModel = {
    lines: normalizedLines,
    detected_format: originalDraft.detected_format,
    notes: (parsed.normalization_notes as string) || originalDraft.notes,
    format_hints: {
      ...(originalDraft.format_hints || {}),
      ai_normalized: true,
      ai_income_count: (parsed.detected_income_count as number) || 0,
      ai_expense_count: (parsed.detected_expense_count as number) || 0,
      ai_debt_count: (parsed.detected_debt_count as number) || 0,
    },
  };

  console.log('[aiNormalization] Normalization complete', {
    incomeCount: parsed.detected_income_count,
    expenseCount: parsed.detected_expense_count,
    debtCount: parsed.detected_debt_count,
  });

  return {
    normalizedDraft,
    incomeCount: (parsed.detected_income_count as number) || 0,
    expenseCount: (parsed.detected_expense_count as number) || 0,
    debtCount: (parsed.detected_debt_count as number) || 0,
    notes: (parsed.normalization_notes as string) || '',
    providerUsed: 'openai',
  };
}

// Keywords for heuristic classification
// NOTE: Order matters - more specific patterns should be checked first
// NOTE: Avoid short patterns like "pay" that match unintended words (e.g., "car payment")
const INCOME_KEYWORDS = [
  'salary', 'wages', 'income', 'paycheck', 'earnings',
  'freelance', 'bonus', 'commission', 'dividend', 'interest earned',
  'rental income', 'pension', 'social security', 'disability',
  'refund', 'revenue', 'side gig', 'side hustle',
  // Note: "pay" removed - too short, matches "payment", "copay", etc.
  // Note: "deposit" removed - too generic, could be security deposit (expense)
];

const EXPENSE_KEYWORDS = [
  'rent', 'mortgage', 'housing', 'utilities', 'electric', 'gas',
  'water', 'insurance', 'health', 'medical', 'groceries', 'food',
  'transportation', 'car payment', 'childcare', 'education',
  'subscription', 'entertainment', 'dining', 'shopping', 'travel',
  'phone', 'internet', 'cable', 'gym', 'personal', 'clothing',
  'pet', 'household', 'maintenance', 'repair',
];

const DEBT_KEYWORDS = [
  'credit card', 'loan', 'student loan', 'car loan', 'personal loan',
  'line of credit', 'finance', 'debt', 'auto payment',
];

const SAVINGS_KEYWORDS = [
  '401k', 'retirement', 'savings', 'investment', 'ira', 'hsa',
  'emergency fund', 'brokerage', 'roth',
];

/**
 * Classify a category using keyword matching
 */
function classifyCategory(category: string): 'income' | 'expense' | 'debt_payment' | 'savings' | 'unknown' {
  const lower = category.toLowerCase();

  if (INCOME_KEYWORDS.some(k => lower.includes(k))) return 'income';
  if (DEBT_KEYWORDS.some(k => lower.includes(k))) return 'debt_payment';
  if (SAVINGS_KEYWORDS.some(k => lower.includes(k))) return 'savings';
  if (EXPENSE_KEYWORDS.some(k => lower.includes(k))) return 'expense';

  return 'unknown';
}

/**
 * Heuristic normalization using keyword matching
 * 
 * For all-positive budgets, this uses keyword matching to classify lines.
 * CRITICAL: Unknown positive amounts default to EXPENSES (not income).
 */
function heuristicNormalization(draft: DraftBudgetModel): NormalizationResult {
  console.log('[aiNormalization] Using heuristic normalization for all-positive budget');

  let incomeCount = 0;
  let expenseCount = 0;
  let debtCount = 0;

  const normalizedLines: RawBudgetLine[] = draft.lines.map(line => {
    const category = line.category_label || '';
    const lineType = classifyCategory(category);

    let normalizedAmount: number;
    if (lineType === 'income') {
      normalizedAmount = Math.abs(line.amount);
      incomeCount++;
    } else {
      // Everything else (expense, debt, savings, unknown) becomes negative
      normalizedAmount = -Math.abs(line.amount);
      if (lineType === 'debt_payment') {
        debtCount++;
      } else {
        expenseCount++;
      }
    }

    return {
      ...line,
      amount: normalizedAmount,
      metadata: {
        ...line.metadata,
        ai_line_type: lineType === 'unknown' ? 'expense' : lineType,
        original_amount: line.amount,
        heuristic_classification: true,
      },
    };
  });

  console.log('[aiNormalization] Heuristic normalization complete', {
    incomeCount,
    expenseCount,
    debtCount,
  });

  return {
    normalizedDraft: {
      ...draft,
      lines: normalizedLines,
      format_hints: {
        ...(draft.format_hints || {}),
        heuristic_normalized: true,
        original_all_positive: true,
      },
    },
    incomeCount,
    expenseCount,
    debtCount,
    notes: 'Heuristic normalization for all-positive budget - unknown categories treated as expenses',
    providerUsed: 'deterministic_heuristic',
  };
}

/**
 * Passthrough/heuristic normalization fallback
 * 
 * For all-positive budgets, uses keyword-based heuristics.
 * For already-signed budgets, passes through unchanged.
 */
function passthroughNormalization(draft: DraftBudgetModel): NormalizationResult {
  const positiveCount = draft.lines.filter(line => line.amount > 0).length;
  const negativeCount = draft.lines.filter(line => line.amount < 0).length;

  // If budget is all-positive, use heuristic normalization
  if (negativeCount === 0 && positiveCount > 0) {
    return heuristicNormalization(draft);
  }

  // Budget already has signs - pass through
  console.log('[aiNormalization] Using passthrough (budget already has correct signs)');

  return {
    normalizedDraft: draft,
    incomeCount: positiveCount,
    expenseCount: negativeCount,
    debtCount: 0,
    notes: 'Passthrough - budget already has correct signs',
    providerUsed: 'deterministic',
  };
}

