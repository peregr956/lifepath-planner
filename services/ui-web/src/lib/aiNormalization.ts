/**
 * AI-powered budget normalization
 * 
 * Analyzes raw budget data and correctly classifies amounts as income (positive)
 * or expenses (negative) regardless of the original format.
 * 
 * Ported from Python services/clarification-service/src/providers/openai_budget_normalization.py
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
  defaultTemperature: 0.1, // Low temperature for consistent normalization
  defaultMaxTokens: 2048, // Larger to handle full budget data
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

const SYSTEM_PROMPT = `You are a financial data analyst that normalizes budget data into a standard format.

Your task is to analyze raw budget data and normalize the amounts so that:
- INCOME (money coming in) = POSITIVE numbers
- EXPENSES (money going out) = NEGATIVE numbers
- DEBT PAYMENTS = NEGATIVE numbers (they are outflows)
- SAVINGS CONTRIBUTIONS = NEGATIVE numbers (they are outflows from spending budget)
- TRANSFERS = Can be positive or negative depending on direction

CRITICAL RULES:
1. Preserve the original source_row_index for each line - this is essential for traceability
2. Analyze the category labels and descriptions to determine if each item is income or expense
3. Common INCOME indicators: salary, wages, paycheck, income, deposit, revenue, bonus, refund
4. Common EXPENSE indicators: rent, mortgage, groceries, utilities, bills, payment, subscription, insurance
5. Common DEBT indicators: loan payment, credit card, student loan, car payment, debt
6. Common SAVINGS indicators: 401k, retirement, savings, investment, IRA, HSA
7. If amounts are already correctly signed (income positive, expenses negative), keep them as-is
8. If all amounts are positive but the budget has expenses, negate the expense amounts
9. Use the category_label and description to make classification decisions

IMPORTANT: Look at the semantic meaning of each line. A "Salary" of 5000 should be +5000.
A "Rent" of 1800 should be -1800 even if the input shows it as positive.

Return the normalized data in the exact schema specified.`;

/**
 * Build the user prompt from draft budget data
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

  return `Analyze and normalize this budget data:

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

Normalize all amounts so income is positive and expenses/debt are negative.
Preserve the exact source_row_index for each line.`;
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

  try {
    console.log('[aiNormalization] Normalizing budget with AI', {
      lineCount: draft.lines.length,
      model: normalizationSettings.openai?.model,
    });

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
      console.warn('[aiNormalization] No tool calls in response, falling back to passthrough');
      return passthroughNormalization(draft);
    }

    const parsed = JSON.parse(toolCalls[0].function.arguments);
    return parseNormalizationResponse(parsed, draft);
  } catch (error) {
    console.error('[aiNormalization] Error during normalization:', error);
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

/**
 * Passthrough normalization - returns draft unchanged
 */
function passthroughNormalization(draft: DraftBudgetModel): NormalizationResult {
  const incomeCount = draft.lines.filter(line => line.amount > 0).length;
  const expenseCount = draft.lines.filter(line => line.amount < 0).length;

  return {
    normalizedDraft: draft,
    incomeCount,
    expenseCount,
    debtCount: 0,
    notes: 'Passthrough - original data unchanged',
    providerUsed: 'deterministic',
  };
}

