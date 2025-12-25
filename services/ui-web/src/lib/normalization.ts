/**
 * Budget normalization utilities
 * 
 * Converts raw draft budgets into unified budget models.
 * Ported from Python clarification-service normalization logic.
 * 
 * Two-stage normalization:
 * 1. AI normalization: Analyzes category labels to correctly sign amounts (income positive, expenses negative)
 * 2. Deterministic conversion: Converts normalized draft into structured UnifiedBudgetModel
 * 
 * IMPORTANT: Expense amounts are stored as POSITIVE values (matching Python convention).
 * This ensures consistency across the entire system.
 */

import type { RawBudgetLine, DraftBudgetModel } from './parsers';
import type { 
  UnifiedBudgetModel, 
  Income, 
  Expense, 
  Debt, 
  Preferences, 
  Summary 
} from './budgetModel';
import { enrichBudgetModel } from './aiEnrichment';
import { isAIEnabled } from './ai';
import { normalizeDraftBudget, isNormalizationAIEnabled } from './aiNormalization';

// Default preferences
const DEFAULT_PREFERENCES: Preferences = {
  optimization_focus: 'balanced',
  protect_essentials: true,
  max_desired_change_per_category: 0.25,
};

// Common income keywords
// NOTE: Avoid short patterns like "pay" that match unintended words (e.g., "car payment", "copay")
const INCOME_KEYWORDS = [
  'salary', 'wages', 'income', 'paycheck', 'earnings',
  'freelance', 'bonus', 'commission', 'dividend', 'interest earned',
  'rental income', 'pension', 'social security', 'disability',
  'side gig', 'side hustle', 'revenue',
];

// Common essential expense categories
const ESSENTIAL_CATEGORIES = [
  'rent', 'mortgage', 'housing', 'utilities', 'electric', 'gas',
  'water', 'insurance', 'health', 'medical', 'groceries', 'food',
  'transportation', 'car payment', 'childcare', 'education', 'loan',
];

// Common debt keywords
const DEBT_KEYWORDS = [
  'credit card', 'loan', 'mortgage', 'debt', 'payment', 'car loan',
  'student loan', 'personal loan', 'line of credit', 'finance',
];

/**
 * Convert a draft budget to a unified budget model
 * 
 * This performs two-stage normalization:
 * 1. AI normalization: Analyzes category labels and descriptions to correctly classify
 *    amounts as income (positive) or expenses (negative), regardless of original format.
 * 2. Deterministic conversion: Converts the normalized draft into the structured model.
 * 
 * @param draft - The raw draft budget from parsing
 * @param enrich - Whether to apply AI enrichment after conversion (default: true)
 * @param skipAINormalization - Skip AI normalization (use for already-normalized drafts)
 */
export async function draftToUnifiedModel(
  draft: DraftBudgetModel,
  enrich: boolean = true,
  skipAINormalization: boolean = false
): Promise<UnifiedBudgetModel> {
  // Stage 1: AI-powered normalization to correctly sign amounts
  let normalizedDraft = draft;
  
  if (!skipAINormalization && isNormalizationAIEnabled()) {
    try {
      console.log('[normalization] Running AI normalization...');
      const normalizationResult = await normalizeDraftBudget(draft);
      normalizedDraft = normalizationResult.normalizedDraft;
      console.log('[normalization] AI normalization complete:', {
        provider: normalizationResult.providerUsed,
        incomeCount: normalizationResult.incomeCount,
        expenseCount: normalizationResult.expenseCount,
        debtCount: normalizationResult.debtCount,
      });
    } catch (error) {
      console.error('[normalization] AI normalization failed, using original draft:', error);
      // Fall through to use original draft
    }
  }

  // Stage 2: Deterministic conversion to unified model
  const income: Income[] = [];
  const expenses: Expense[] = [];
  const debts: Debt[] = [];

  for (const line of normalizedDraft.lines) {
    const category = line.category_label.toLowerCase();
    const amount = Math.abs(line.amount);

    // Skip zero amounts
    if (amount === 0) continue;

    // Check AI line type metadata if available
    const aiLineType = line.metadata?.ai_line_type as string | undefined;
    
    // Classify the line based on:
    // 1. AI classification (if available and trusted)
    // 2. Category keywords (primary fallback)
    // 3. Amount sign ONLY when we have already-signed data (negative = expense)
    //
    // CRITICAL: For all-positive budgets without AI normalization, we MUST use
    // category keywords to classify. Unknown positive amounts should default to
    // EXPENSES (not income) since most budget lines are expenses.
    
    if (aiLineType === 'income' || aiLineType === 'transfer') {
      income.push(createIncome(line, income.length));
    } else if (aiLineType === 'debt_payment') {
      debts.push(createDebt(line, debts.length));
    } else if (aiLineType === 'expense' || aiLineType === 'savings') {
      expenses.push(createExpense(line, expenses.length));
    } else if (isIncomeCategory(category)) {
      // Explicit income keyword match - treat as income
      income.push(createIncome(line, income.length));
    } else if (isDebtCategory(category)) {
      // Explicit debt keyword match - treat as debt
      debts.push(createDebt(line, debts.length));
    } else if (line.amount < 0) {
      // Negative amount = already signed as expense
      expenses.push(createExpense(line, expenses.length));
    } else if (isExpenseCategory(category)) {
      // Explicit expense keyword match - treat as expense
      expenses.push(createExpense(line, expenses.length));
    } else {
      // DEFAULT: Unknown positive amounts should be treated as EXPENSES
      // This is critical for all-positive budgets where AI normalization failed.
      // Most budget lines are expenses, so this is the safer default.
      console.log(`[normalization] Unknown category "${category}" with positive amount ${line.amount} - defaulting to expense`);
      expenses.push(createExpense(line, expenses.length));
    }
  }

  // Compute summary
  // Note: Expenses are now stored as POSITIVE values (matching Python convention)
  const total_income = income.reduce((sum, inc) => sum + inc.monthly_amount, 0);
  const total_expenses = expenses.reduce((sum, exp) => sum + exp.monthly_amount, 0);
  const debt_payments = debts.reduce((sum, debt) => sum + debt.min_payment, 0);

  const summary: Summary = {
    total_income,
    total_expenses: total_expenses + debt_payments,
    surplus: total_income - total_expenses - debt_payments,
  };

  const model: UnifiedBudgetModel = {
    income,
    expenses,
    debts,
    preferences: { ...DEFAULT_PREFERENCES },
    summary,
  };

  // Validate normalization results
  const warnings = validateNormalizationResult(model, normalizedDraft);
  if (warnings.length > 0) {
    console.warn('[normalization] Validation warnings:', warnings);
  }

  // Apply AI enrichment if requested and enabled
  if (enrich && isAIEnabled()) {
    return await enrichBudgetModel(model);
  }

  return model;
}

/**
 * Validate normalization results for suspicious patterns
 * 
 * Checks for:
 * - Very high surplus ratio (may indicate expenses classified as income)
 * - All positive amounts in source (may indicate missing expense normalization)
 * - Expense-like categories in income list
 */
function validateNormalizationResult(model: UnifiedBudgetModel, draft: DraftBudgetModel): string[] {
  const warnings: string[] = [];

  // Check for very high surplus ratio
  if (model.summary.total_income > 0) {
    const surplusRatio = model.summary.surplus / model.summary.total_income;
    if (surplusRatio > 0.7) {
      warnings.push(`Very high surplus ratio (${(surplusRatio * 100).toFixed(0)}%) - some expenses may be incorrectly classified as income`);
    } else if (surplusRatio < -0.5) {
      warnings.push(`Large deficit (${(surplusRatio * 100).toFixed(0)}% of income) - some income may be incorrectly classified as expenses`);
    }
  }

  // Check for expense-like categories in income list
  const expenseKeywords = ['rent', 'mortgage', 'groceries', 'utilities', 'insurance', 'food', 'transportation', 'phone', 'internet'];
  const suspiciousIncome = model.income.filter(inc => {
    const nameLower = inc.name.toLowerCase();
    return expenseKeywords.some(keyword => nameLower.includes(keyword));
  });

  if (suspiciousIncome.length > 0) {
    const names = suspiciousIncome.slice(0, 3).map(i => i.name).join(', ');
    warnings.push(`Expense-like categories classified as income: ${names}${suspiciousIncome.length > 3 ? ` (and ${suspiciousIncome.length - 3} more)` : ''}`);
  }

  // Check if source had all positive amounts but we have few expenses
  const positiveSourceLines = draft.lines.filter(l => l.amount > 0).length;
  const negativeSourceLines = draft.lines.filter(l => l.amount < 0).length;
  if (positiveSourceLines > 2 && negativeSourceLines === 0 && model.expenses.length === 0) {
    warnings.push(`All ${positiveSourceLines} source amounts were positive but no expenses detected - classification may have failed`);
  }

  return warnings;
}

/**
 * Check if a category represents an expense (used as fallback)
 */
function isExpenseCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return ESSENTIAL_CATEGORIES.some(keyword => lower.includes(keyword)) ||
    ['subscription', 'entertainment', 'dining', 'shopping', 'travel'].some(keyword => lower.includes(keyword));
}

/**
 * Check if a category represents income
 */
function isIncomeCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return INCOME_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Check if a category represents debt
 */
function isDebtCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return DEBT_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Check if a category is typically essential
 */
function isEssentialCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return ESSENTIAL_CATEGORIES.some(keyword => lower.includes(keyword));
}

/**
 * Create an income entry from a budget line
 */
function createIncome(line: RawBudgetLine, index: number): Income {
  const category = line.category_label.toLowerCase();
  
  let type: Income['type'] = 'earned';
  if (category.includes('dividend') || category.includes('interest') || category.includes('rental')) {
    type = 'passive';
  } else if (category.includes('transfer') || category.includes('gift')) {
    type = 'transfer';
  }

  let stability: Income['stability'] = 'stable';
  if (category.includes('freelance') || category.includes('commission') || category.includes('bonus')) {
    stability = 'variable';
  } else if (category.includes('seasonal')) {
    stability = 'seasonal';
  }

  return {
    id: `income-draft-${line.source_row_index}-${index}`,
    name: line.category_label || `Income ${index + 1}`,
    monthly_amount: Math.abs(line.amount),
    type,
    stability,
  };
}

/**
 * Create an expense entry from a budget line
 * 
 * IMPORTANT: Expenses are stored as POSITIVE values to match Python convention.
 * This ensures consistency across the entire system.
 */
function createExpense(line: RawBudgetLine, index: number): Expense {
  const category = line.category_label || `Expense ${index + 1}`;
  const essential = isEssentialCategory(category) ? true : null; // null means needs clarification

  return {
    id: `expense-draft-${line.source_row_index}-${index}`,
    category,
    monthly_amount: Math.abs(line.amount), // Expenses stored as POSITIVE (Python convention)
    essential,
    notes: line.description,
  };
}

/**
 * Create a debt entry from a budget line
 */
function createDebt(line: RawBudgetLine, index: number): Debt {
  return {
    id: `debt-draft-${line.source_row_index}-${index}`,
    name: line.category_label || `Debt ${index + 1}`,
    balance: 0, // Unknown, needs clarification
    interest_rate: 0, // Unknown, needs clarification
    min_payment: Math.abs(line.amount),
    priority: 'medium',
    approximate: true,
    rate_changes: null,
  };
}

// Field ID prefixes and supported field IDs
export const ESSENTIAL_PREFIX = 'essential_';
export const SUPPORTED_SIMPLE_FIELD_IDS = new Set([
  'optimization_focus',
  'primary_income_type',
  'primary_income_stability',
  'financial_philosophy',
  'risk_tolerance',
  'goal_timeline',
]);

/**
 * Parse a debt field ID to extract the debt ID and field name
 */
export function parseDebtFieldId(fieldId: string): [string, string] | null {
  const debtFieldSuffixes = ['_balance', '_interest_rate', '_min_payment', '_priority', '_approximate'];
  
  for (const suffix of debtFieldSuffixes) {
    if (fieldId.endsWith(suffix)) {
      const debtId = fieldId.slice(0, -suffix.length);
      const fieldName = suffix.slice(1); // Remove leading underscore
      return [debtId, fieldName];
    }
  }
  
  return null;
}

/**
 * Apply user answers to the unified model
 */
export function applyAnswersToModel(
  model: UnifiedBudgetModel,
  answers: Record<string, unknown>
): UnifiedBudgetModel {
  // Clone the model
  const updated: UnifiedBudgetModel = JSON.parse(JSON.stringify(model));

  for (const [fieldId, value] of Object.entries(answers)) {
    // Handle expense essentials
    if (fieldId.startsWith(ESSENTIAL_PREFIX)) {
      const expenseId = fieldId.slice(ESSENTIAL_PREFIX.length);
      const expense = updated.expenses.find(e => e.id === expenseId);
      if (expense) {
        expense.essential = Boolean(value);
      }
      continue;
    }

    // Handle simple preference fields
    if (SUPPORTED_SIMPLE_FIELD_IDS.has(fieldId)) {
      switch (fieldId) {
        case 'optimization_focus':
          if (value === 'debt' || value === 'savings' || value === 'balanced') {
            updated.preferences.optimization_focus = value;
          }
          break;
        case 'primary_income_type':
          if (updated.income.length > 0 && (value === 'earned' || value === 'passive' || value === 'transfer')) {
            updated.income[0].type = value;
          }
          break;
        case 'primary_income_stability':
          if (updated.income.length > 0 && (value === 'stable' || value === 'variable' || value === 'seasonal')) {
            updated.income[0].stability = value;
          }
          break;
        // Profile fields are stored in user_profile, not in the model
      }
      continue;
    }

    // Handle debt fields
    const debtTarget = parseDebtFieldId(fieldId);
    if (debtTarget) {
      const [debtId, fieldName] = debtTarget;
      const debt = updated.debts.find(d => d.id === debtId);
      if (debt) {
        switch (fieldName) {
          case 'balance':
            debt.balance = Number(value) || 0;
            break;
          case 'interest_rate':
            debt.interest_rate = Number(value) || 0;
            break;
          case 'min_payment':
            debt.min_payment = Number(value) || 0;
            break;
          case 'priority':
            if (value === 'high' || value === 'medium' || value === 'low') {
              debt.priority = value;
            }
            break;
          case 'approximate':
            debt.approximate = Boolean(value);
            break;
        }
      }
    }
  }

  // Recompute summary
  // Note: Expenses are stored as POSITIVE values (matching Python convention)
  const total_income = updated.income.reduce((sum, inc) => sum + inc.monthly_amount, 0);
  const total_expenses = updated.expenses.reduce((sum, exp) => sum + exp.monthly_amount, 0);
  const debt_payments = updated.debts.reduce((sum, debt) => sum + debt.min_payment, 0);

  updated.summary = {
    total_income,
    total_expenses: total_expenses + debt_payments,
    surplus: total_income - total_expenses - debt_payments,
  };

  return updated;
}

/**
 * Validate answer field IDs against the model
 */
export function validateAnswers(
  model: UnifiedBudgetModel,
  answers: Record<string, unknown>
): { field_id: string; error: string }[] {
  const issues: { field_id: string; error: string }[] = [];
  const expenseIds = new Set(model.expenses.map(e => e.id));
  const debtIds = new Set(model.debts.map(d => d.id));

  for (const fieldId of Object.keys(answers)) {
    let isValid = false;

    // Check expense essentials
    if (fieldId.startsWith(ESSENTIAL_PREFIX)) {
      const expenseId = fieldId.slice(ESSENTIAL_PREFIX.length);
      isValid = expenseIds.has(expenseId);
      if (!isValid) {
        issues.push({ field_id: fieldId, error: `Expense '${expenseId}' not found` });
      }
      continue;
    }

    // Check simple field IDs
    if (SUPPORTED_SIMPLE_FIELD_IDS.has(fieldId)) {
      isValid = true;
      continue;
    }

    // Check debt fields
    const debtTarget = parseDebtFieldId(fieldId);
    if (debtTarget) {
      const [debtId] = debtTarget;
      isValid = debtIds.has(debtId);
      if (!isValid) {
        issues.push({ field_id: fieldId, error: `Debt '${debtId}' not found` });
      }
      continue;
    }

    // Unknown field
    if (!isValid) {
      issues.push({ field_id: fieldId, error: 'Unknown field ID' });
    }
  }

  return issues;
}

