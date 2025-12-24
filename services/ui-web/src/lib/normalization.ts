/**
 * Budget normalization utilities
 * 
 * Converts raw draft budgets into unified budget models.
 * Ported from Python clarification-service normalization logic.
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

// Default preferences
const DEFAULT_PREFERENCES: Preferences = {
  optimization_focus: 'balanced',
  protect_essentials: true,
  max_desired_change_per_category: 0.25,
};

// Common income keywords
const INCOME_KEYWORDS = [
  'salary', 'wage', 'income', 'paycheck', 'pay', 'earnings',
  'freelance', 'bonus', 'commission', 'dividend', 'interest earned',
  'rental income', 'pension', 'social security', 'disability',
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
 */
export async function draftToUnifiedModel(
  draft: DraftBudgetModel,
  enrich: boolean = true
): Promise<UnifiedBudgetModel> {
  const income: Income[] = [];
  const expenses: Expense[] = [];
  const debts: Debt[] = [];

  for (const line of draft.lines) {
    const category = line.category_label.toLowerCase();
    const amount = Math.abs(line.amount);

    // Skip zero amounts
    if (amount === 0) continue;

    // Classify the line
    if (isIncomeCategory(category) || (line.amount > 0 && !isDebtCategory(category))) {
      income.push(createIncome(line, income.length));
    } else if (isDebtCategory(category)) {
      debts.push(createDebt(line, debts.length));
    } else {
      expenses.push(createExpense(line, expenses.length));
    }
  }

  // Compute summary
  const total_income = income.reduce((sum, inc) => sum + inc.monthly_amount, 0);
  const total_expenses = expenses.reduce((sum, exp) => sum + Math.abs(exp.monthly_amount), 0);
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

  // Apply AI enrichment if requested and enabled
  if (enrich && isAIEnabled()) {
    return await enrichBudgetModel(model);
  }

  return model;
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
 */
function createExpense(line: RawBudgetLine, index: number): Expense {
  const category = line.category_label || `Expense ${index + 1}`;
  const essential = isEssentialCategory(category) ? true : null; // null means needs clarification

  return {
    id: `expense-draft-${line.source_row_index}-${index}`,
    category,
    monthly_amount: -Math.abs(line.amount), // Expenses are negative
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
  const total_income = updated.income.reduce((sum, inc) => sum + inc.monthly_amount, 0);
  const total_expenses = updated.expenses.reduce((sum, exp) => sum + Math.abs(exp.monthly_amount), 0);
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

