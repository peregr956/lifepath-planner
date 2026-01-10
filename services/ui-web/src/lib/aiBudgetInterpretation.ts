/**
 * AI-First Budget Interpretation
 * 
 * Phase 8.5.4: Replaces the over-constrained two-stage parsing flow with a single
 * AI-first interpretation step that reads the entire raw budget and returns a
 * complete, machine-readable structured model with meaningful, distinguishable labels.
 * 
 * Key Principle: Get out of our own way. Pass the full budget data (all columns)
 * to AI, specify the output format, and let it interpret holistically.
 */

import OpenAI from 'openai';
import type { DraftBudgetModel, RawBudgetLine } from './parsers';
import type { 
  UnifiedBudgetModel, 
  Income, 
  Expense, 
  Debt, 
  Preferences, 
  Summary 
} from './budgetModel';
import { loadProviderSettings } from './providerSettings';

// Load provider settings for budget interpretation
const interpretationSettings = loadProviderSettings({
  providerEnv: 'INTERPRETATION_PROVIDER',
  timeoutEnv: 'INTERPRETATION_TIMEOUT_SECONDS',
  temperatureEnv: 'INTERPRETATION_TEMPERATURE',
  maxTokensEnv: 'INTERPRETATION_MAX_TOKENS',
  defaultProvider: process.env.OPENAI_API_KEY ? 'openai' : 'deterministic',
  defaultTimeout: 45, // Slightly longer for full interpretation
  defaultTemperature: 0.2, // Low temperature for consistent classification
  defaultMaxTokens: 4096,
});

// Default preferences for new budgets
const DEFAULT_PREFERENCES: Preferences = {
  optimization_focus: 'balanced',
  protect_essentials: true,
  max_desired_change_per_category: 0.25,
};

/**
 * JSON schema for AI budget interpretation
 * 
 * The AI returns a fully structured budget with meaningful labels derived
 * from all available columns (category, description, amount, metadata).
 */
const INTERPRETATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    income: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          source_row_index: { 
            type: 'integer' as const,
            description: 'Original row index from the input for traceability.',
          },
          label: { 
            type: 'string' as const, 
            description: 'Descriptive name for this income source. Use the most specific identifier available.',
          },
          monthly_amount: { 
            type: 'number' as const,
            description: 'Monthly amount as a positive number.',
          },
          type: { 
            type: 'string' as const, 
            enum: ['earned', 'passive', 'transfer'],
            description: 'Income type classification.',
          },
          stability: { 
            type: 'string' as const, 
            enum: ['stable', 'variable', 'seasonal'],
            description: 'Income stability classification.',
          },
        },
        required: ['source_row_index', 'label', 'monthly_amount'],
      },
      description: 'Income items identified from the budget.',
    },
    expenses: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          source_row_index: { 
            type: 'integer' as const,
            description: 'Original row index from the input for traceability.',
          },
          label: { 
            type: 'string' as const, 
            description: 'Unique, descriptive name. Prefer description over category when description is more specific.',
          },
          monthly_amount: { 
            type: 'number' as const,
            description: 'Monthly amount as a positive number.',
          },
          essential: { 
            type: ['boolean', 'null'] as const,
            description: 'true=essential (must pay), false=discretionary, null=uncertain (ask user).',
          },
          original_category: { 
            type: 'string' as const,
            description: 'The original category from the budget file, for reference.',
          },
        },
        required: ['source_row_index', 'label', 'monthly_amount'],
      },
      description: 'Expense items identified from the budget.',
    },
    debts: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          source_row_index: { 
            type: 'integer' as const,
            description: 'Original row index from the input for traceability.',
          },
          label: { 
            type: 'string' as const,
            description: 'Descriptive name for this debt.',
          },
          min_payment: { 
            type: 'number' as const,
            description: 'Minimum monthly payment as a positive number.',
          },
        },
        required: ['source_row_index', 'label', 'min_payment'],
      },
      description: 'Debt payment items identified from the budget.',
    },
    interpretation_notes: { 
      type: 'string' as const,
      description: 'Brief notes about interpretation decisions, especially for ambiguous items.',
    },
  },
  required: ['income', 'expenses', 'debts'],
};

/**
 * INTERPRETATION_SYSTEM_PROMPT
 * 
 * CORE-compliant prompt for budget interpretation.
 * Follows the framework: Objective, Role, Context, Output Contract, Quality Bar.
 */
const INTERPRETATION_SYSTEM_PROMPT = `Objective: Interpret this budget data and return a structured model with meaningful, unique labels for each line item.

Role: You are a financial data analyst preparing raw budget data for a personal finance application.

Context:
- Budget data arrives in a <budget_data> section with category, description, amount, and metadata columns.
- Many budget files use generic category names (e.g., "Personal", "Bills") but have specific descriptions (e.g., "Gym Membership", "Electric Bill").
- Your job is to identify the BEST label for each item—use description when it's more specific than the category.
- Items should be classified as income (money coming in), expense (money going out), or debt payment.

Output Contract:
- Return JSON matching the interpret_budget function schema.
- Each expense MUST have a unique, descriptive label—avoid duplicate labels.
- Prefer description over category when description is more specific or unique.
- All amounts should be positive numbers (sign is determined by classification).
- Mark essential as null when uncertain—the user can clarify later.
- Preserve source_row_index for traceability.

Quality Bar:
- If a label would be duplicated, make it unique by combining category and description.
- When classification (income vs expense) is ambiguous, use context clues from the label and amount.
- Include brief interpretation_notes for any non-obvious decisions.`;

/**
 * Build the user prompt from draft budget data
 * 
 * Includes ALL available columns for holistic interpretation.
 */
function buildUserPrompt(draft: DraftBudgetModel): string {
  const linesSection = draft.lines.length === 0
    ? 'No lines detected.'
    : draft.lines.map(line => {
        const parts = [
          `Row ${line.source_row_index}:`,
          `category="${line.category_label || 'N/A'}"`,
          `description="${line.description || 'N/A'}"`,
          `amount=${line.amount}`,
        ];
        
        if (line.date) {
          parts.push(`date=${line.date}`);
        }
        
        // Include any additional metadata
        const metadataEntries = Object.entries(line.metadata || {});
        if (metadataEntries.length > 0) {
          const metadataStr = metadataEntries
            .map(([k, v]) => `${k}="${v}"`)
            .join(', ');
          parts.push(`metadata={${metadataStr}}`);
        }
        
        return `- ${parts.join(', ')}`;
      }).join('\n');

  // Analyze input structure for context
  const positiveCount = draft.lines.filter(l => l.amount > 0).length;
  const negativeCount = draft.lines.filter(l => l.amount < 0).length;
  const hasDescriptions = draft.lines.some(l => l.description && l.description.trim());
  
  // Check for duplicate categories (the problem we're solving)
  const categoryCount = new Map<string, number>();
  for (const line of draft.lines) {
    const cat = (line.category_label || '').toLowerCase().trim();
    if (cat) {
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
    }
  }
  const duplicateCategories = [...categoryCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([cat]) => cat);

  return `<budget_data>
## Detected Format
${draft.detected_format}

## Format Notes
${draft.notes || 'None'}

## Data Structure
- Total lines: ${draft.lines.length}
- Lines with positive amounts: ${positiveCount}
- Lines with negative amounts: ${negativeCount}
- Has description column: ${hasDescriptions ? 'Yes' : 'No'}
${duplicateCategories.length > 0 ? `- Categories appearing multiple times: ${duplicateCategories.join(', ')}` : ''}

## Budget Lines
${linesSection}
</budget_data>

Important: For any categories that appear multiple times, use the description column (or other distinguishing information) to create unique labels for each line item.`;
}

export interface InterpretationResult {
  model: UnifiedBudgetModel;
  usedAI: boolean;
  notes: string;
}

/**
 * Get OpenAI client for interpretation
 */
function getOpenAIClient(): OpenAI | null {
  if (interpretationSettings.providerName !== 'openai' || !interpretationSettings.openai) {
    return null;
  }

  return new OpenAI({
    apiKey: interpretationSettings.openai.apiKey,
    baseURL: interpretationSettings.openai.apiBase,
    timeout: interpretationSettings.timeoutSeconds * 1000,
  });
}

/**
 * Check if AI interpretation is enabled
 */
export function isInterpretationAIEnabled(): boolean {
  return interpretationSettings.providerName === 'openai' && !!interpretationSettings.openai?.apiKey;
}

/**
 * Interpret a draft budget using AI
 * 
 * This is the primary entry point for Phase 8.5.4.
 * Reads the entire raw budget and returns a complete UnifiedBudgetModel
 * with meaningful, distinguishable labels.
 */
export async function interpretBudgetWithAI(
  draft: DraftBudgetModel
): Promise<InterpretationResult> {
  // Handle empty budgets
  if (draft.lines.length === 0) {
    return {
      model: createEmptyModel(),
      usedAI: false,
      notes: 'Empty budget - no interpretation needed',
    };
  }

  const client = getOpenAIClient();

  if (!client) {
    console.log('[aiBudgetInterpretation] AI not configured, using enhanced deterministic fallback');
    return enhancedDeterministicInterpretation(draft);
  }

  console.log('[aiBudgetInterpretation] Starting AI interpretation', {
    lineCount: draft.lines.length,
    detectedFormat: draft.detected_format,
    model: interpretationSettings.openai?.model,
  });

  try {
    const response = await client.chat.completions.create({
      model: interpretationSettings.openai!.model,
      messages: [
        { role: 'system', content: INTERPRETATION_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(draft) },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'interpret_budget',
            description: 'Interpret budget data and return a structured model with meaningful labels.',
            parameters: INTERPRETATION_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'interpret_budget' } },
      temperature: interpretationSettings.temperature,
      max_tokens: interpretationSettings.maxOutputTokens,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.warn('[aiBudgetInterpretation] No tool calls in response, falling back to deterministic');
      return enhancedDeterministicInterpretation(draft);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(toolCalls[0].function.arguments);
    } catch (parseError) {
      console.error('[aiBudgetInterpretation] Failed to parse AI response JSON', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawArguments: toolCalls[0].function.arguments.substring(0, 500),
      });
      return enhancedDeterministicInterpretation(draft);
    }

    const model = parseInterpretationResponse(parsed, draft);
    
    // Validate the result
    const validation = validateInterpretation(model, draft);
    if (!validation.valid) {
      console.warn('[aiBudgetInterpretation] Validation failed:', validation.issues);
      // Still use the AI result but log the issues
    }

    console.log('[aiBudgetInterpretation] AI interpretation complete', {
      incomeCount: model.income.length,
      expenseCount: model.expenses.length,
      debtCount: model.debts.length,
      totalIncome: model.summary.total_income,
      totalExpenses: model.summary.total_expenses,
    });

    return {
      model,
      usedAI: true,
      notes: (parsed.interpretation_notes as string) || '',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[aiBudgetInterpretation] Error during AI interpretation', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3) : undefined,
    });

    return enhancedDeterministicInterpretation(draft);
  }
}

/**
 * Parse the AI response into a UnifiedBudgetModel
 */
function parseInterpretationResponse(
  parsed: Record<string, unknown>,
  originalDraft: DraftBudgetModel
): UnifiedBudgetModel {
  const rawIncome = (parsed.income || []) as Array<{
    source_row_index: number;
    label: string;
    monthly_amount: number;
    type?: string;
    stability?: string;
  }>;

  const rawExpenses = (parsed.expenses || []) as Array<{
    source_row_index: number;
    label: string;
    monthly_amount: number;
    essential?: boolean | null;
    original_category?: string;
  }>;

  const rawDebts = (parsed.debts || []) as Array<{
    source_row_index: number;
    label: string;
    min_payment: number;
  }>;

  // Build lookup for original lines
  const originalLookup = new Map<number, RawBudgetLine>();
  for (const line of originalDraft.lines) {
    originalLookup.set(line.source_row_index, line);
  }

  // Convert income
  const income: Income[] = rawIncome.map((item, index) => ({
    id: `income-${item.source_row_index}-${index}`,
    name: item.label || `Income ${index + 1}`,
    monthly_amount: Math.abs(item.monthly_amount),
    type: (item.type as Income['type']) || 'earned',
    stability: (item.stability as Income['stability']) || 'stable',
  }));

  // Convert expenses - ensure unique labels
  const usedLabels = new Set<string>();
  const expenses: Expense[] = rawExpenses.map((item, index) => {
    let label = item.label || `Expense ${index + 1}`;
    
    // Ensure unique labels
    if (usedLabels.has(label.toLowerCase())) {
      const originalLine = originalLookup.get(item.source_row_index);
      if (originalLine?.description && originalLine.description !== label) {
        label = originalLine.description;
      } else {
        label = `${label} (${item.source_row_index})`;
      }
    }
    usedLabels.add(label.toLowerCase());

    return {
      id: `expense-${item.source_row_index}-${index}`,
      category: label,
      monthly_amount: Math.abs(item.monthly_amount),
      essential: item.essential ?? null,
      notes: item.original_category || null,
    };
  });

  // Convert debts
  const debts: Debt[] = rawDebts.map((item, index) => ({
    id: `debt-${item.source_row_index}-${index}`,
    name: item.label || `Debt ${index + 1}`,
    balance: 0, // Unknown, needs clarification
    interest_rate: 0, // Unknown, needs clarification
    min_payment: Math.abs(item.min_payment),
    priority: 'medium' as const,
    approximate: true,
    rate_changes: null,
  }));

  // Compute summary
  const total_income = income.reduce((sum, inc) => sum + inc.monthly_amount, 0);
  const total_expenses = expenses.reduce((sum, exp) => sum + exp.monthly_amount, 0);
  const debt_payments = debts.reduce((sum, debt) => sum + debt.min_payment, 0);

  const summary: Summary = {
    total_income,
    total_expenses: total_expenses + debt_payments,
    surplus: total_income - total_expenses - debt_payments,
  };

  return {
    income,
    expenses,
    debts,
    preferences: { ...DEFAULT_PREFERENCES },
    summary,
  };
}

/**
 * Validate the interpretation result
 */
function validateInterpretation(
  model: UnifiedBudgetModel,
  draft: DraftBudgetModel
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for duplicate expense labels
  const labels = model.expenses.map(e => e.category.toLowerCase());
  const uniqueLabels = new Set(labels);
  if (uniqueLabels.size !== labels.length) {
    issues.push('Duplicate expense labels detected');
  }

  // Check that we accounted for most lines
  const totalItems = model.income.length + model.expenses.length + model.debts.length;
  if (totalItems < draft.lines.length * 0.5) {
    issues.push(`Only ${totalItems} items from ${draft.lines.length} lines - some lines may be missing`);
  }

  // Check for suspicious surplus ratio
  if (model.summary.total_income > 0) {
    const surplusRatio = model.summary.surplus / model.summary.total_income;
    if (surplusRatio > 0.8) {
      issues.push(`Very high surplus ratio (${(surplusRatio * 100).toFixed(0)}%) - expenses may be under-counted`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Create an empty budget model
 */
function createEmptyModel(): UnifiedBudgetModel {
  return {
    income: [],
    expenses: [],
    debts: [],
    preferences: { ...DEFAULT_PREFERENCES },
    summary: {
      total_income: 0,
      total_expenses: 0,
      surplus: 0,
    },
  };
}

// ============================================================================
// ENHANCED DETERMINISTIC FALLBACK
// ============================================================================

// Common income keywords
const INCOME_KEYWORDS = [
  'salary', 'wages', 'income', 'paycheck', 'earnings',
  'freelance', 'bonus', 'commission', 'dividend', 'interest earned',
  'rental income', 'pension', 'social security', 'disability',
  'refund', 'revenue', 'side gig', 'side hustle',
];

// Common debt keywords
const DEBT_KEYWORDS = [
  'credit card', 'loan', 'student loan', 'car loan', 'personal loan',
  'line of credit', 'finance', 'debt', 'auto payment', 'mortgage payment',
];

// Common essential expense categories
const ESSENTIAL_KEYWORDS = [
  'rent', 'mortgage', 'housing', 'utilities', 'electric', 'gas',
  'water', 'insurance', 'health', 'medical', 'groceries', 'food',
  'transportation', 'car payment', 'childcare', 'education',
];

/**
 * Select the best label for a budget line
 * 
 * This is the key function for the enhanced deterministic fallback.
 * It prefers description over category when description is more specific.
 */
export function selectBestLabel(line: RawBudgetLine): string {
  const category = (line.category_label || '').trim();
  const description = (line.description || '').trim();

  // If only one exists, use it
  if (!description) return category || 'Unknown';
  if (!category) return description;

  // If they're the same, use either
  if (description.toLowerCase() === category.toLowerCase()) {
    return category;
  }

  // If description is more specific (longer and different), prefer it
  if (description.length > category.length) {
    return description;
  }

  // If category looks generic and description is specific, prefer description
  const genericCategories = ['personal', 'other', 'misc', 'miscellaneous', 'general', 'bills', 'expenses'];
  if (genericCategories.includes(category.toLowerCase()) && description.length >= 3) {
    return description;
  }

  // Default to description if both exist and are different
  return description;
}

/**
 * Classify a line based on keywords
 */
function classifyLine(label: string): 'income' | 'expense' | 'debt' {
  const lower = label.toLowerCase();

  if (INCOME_KEYWORDS.some(k => lower.includes(k))) return 'income';
  if (DEBT_KEYWORDS.some(k => lower.includes(k))) return 'debt';
  return 'expense';
}

/**
 * Check if a label indicates an essential expense
 */
function isEssentialLabel(label: string): boolean | null {
  const lower = label.toLowerCase();
  if (ESSENTIAL_KEYWORDS.some(k => lower.includes(k))) return true;
  return null; // Unknown - needs user clarification
}

/**
 * Enhanced deterministic interpretation fallback
 * 
 * Uses the description column when available and more specific than category.
 * Ensures unique labels by appending row index if needed.
 */
export function enhancedDeterministicInterpretation(
  draft: DraftBudgetModel
): InterpretationResult {
  console.log('[aiBudgetInterpretation] Using enhanced deterministic interpretation');

  const income: Income[] = [];
  const expenses: Expense[] = [];
  const debts: Debt[] = [];

  // Track used labels to ensure uniqueness
  const usedLabels = new Map<string, number>();

  for (const line of draft.lines) {
    // Skip zero amounts
    if (Math.abs(line.amount) < 0.01) continue;

    // Select the best label
    let label = selectBestLabel(line);
    
    // Ensure uniqueness
    const labelLower = label.toLowerCase();
    const count = usedLabels.get(labelLower) || 0;
    if (count > 0) {
      // Try to make it unique with additional context
      const desc = (line.description || '').trim();
      const cat = (line.category_label || '').trim();
      
      if (desc && cat && desc !== cat) {
        // Combine both for uniqueness
        label = `${desc} (${cat})`;
      } else {
        // Append index as last resort
        label = `${label} #${count + 1}`;
      }
    }
    usedLabels.set(labelLower, count + 1);

    // Classify the line
    const lineType = classifyLine(label);

    // Also check amount sign if available
    const isNegativeAmount = line.amount < 0;

    if (lineType === 'income' || (!isNegativeAmount && INCOME_KEYWORDS.some(k => label.toLowerCase().includes(k)))) {
      income.push({
        id: `income-${line.source_row_index}-${income.length}`,
        name: label,
        monthly_amount: Math.abs(line.amount),
        type: 'earned',
        stability: 'stable',
      });
    } else if (lineType === 'debt') {
      debts.push({
        id: `debt-${line.source_row_index}-${debts.length}`,
        name: label,
        balance: 0,
        interest_rate: 0,
        min_payment: Math.abs(line.amount),
        priority: 'medium',
        approximate: true,
        rate_changes: null,
      });
    } else {
      expenses.push({
        id: `expense-${line.source_row_index}-${expenses.length}`,
        category: label,
        monthly_amount: Math.abs(line.amount),
        essential: isEssentialLabel(label),
        notes: line.category_label !== label ? line.category_label : null,
      });
    }
  }

  // Compute summary
  const total_income = income.reduce((sum, inc) => sum + inc.monthly_amount, 0);
  const total_expenses = expenses.reduce((sum, exp) => sum + exp.monthly_amount, 0);
  const debt_payments = debts.reduce((sum, debt) => sum + debt.min_payment, 0);

  const summary: Summary = {
    total_income,
    total_expenses: total_expenses + debt_payments,
    surplus: total_income - total_expenses - debt_payments,
  };

  console.log('[aiBudgetInterpretation] Enhanced deterministic interpretation complete', {
    incomeCount: income.length,
    expenseCount: expenses.length,
    debtCount: debts.length,
  });

  return {
    model: {
      income,
      expenses,
      debts,
      preferences: { ...DEFAULT_PREFERENCES },
      summary,
    },
    usedAI: false,
    notes: 'Enhanced deterministic interpretation - AI unavailable. Description column used for unique labels.',
  };
}
