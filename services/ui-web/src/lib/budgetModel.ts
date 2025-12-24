/**
 * Budget model types and utilities
 * 
 * Ported from Python clarification-service/src/budget_model.py
 */

// Income types
export interface Income {
  id: string;
  name: string;
  monthly_amount: number;
  type: 'earned' | 'passive' | 'transfer';
  stability: 'stable' | 'variable' | 'seasonal';
}

// Expense types
export interface Expense {
  id: string;
  category: string;
  monthly_amount: number;
  essential: boolean | null;
  notes: string | null;
}

// Rate change for debts
export interface RateChange {
  date: string;
  new_rate: number;
}

// Debt types
export interface Debt {
  id: string;
  name: string;
  balance: number;
  interest_rate: number;
  min_payment: number;
  priority: 'high' | 'medium' | 'low';
  approximate: boolean;
  rate_changes: RateChange[] | null;
}

// User preferences
export interface Preferences {
  optimization_focus: 'debt' | 'savings' | 'balanced';
  protect_essentials: boolean;
  max_desired_change_per_category: number;
}

// Summary of budget
export interface Summary {
  total_income: number;
  total_expenses: number;
  surplus: number;
}

// Unified budget model
export interface UnifiedBudgetModel {
  income: Income[];
  expenses: Expense[];
  debts: Debt[];
  preferences: Preferences;
  summary: Summary;
}

// Question component for UI
export interface QuestionComponent {
  component: 'toggle' | 'dropdown' | 'number_input' | 'slider';
  field_id: string;
  label: string;
  binding: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

// Question specification
export interface QuestionSpec {
  question_id: string;
  prompt: string;
  components: QuestionComponent[];
}

// Suggestion from optimization
export interface Suggestion {
  id: string;
  title: string;
  description: string;
  expected_monthly_impact: number;
  rationale: string;
  tradeoffs: string;
}

/**
 * Create a default preferences object
 */
export function createDefaultPreferences(): Preferences {
  return {
    optimization_focus: 'balanced',
    protect_essentials: true,
    max_desired_change_per_category: 0.25,
  };
}

/**
 * Compute summary from model
 */
export function computeSummary(model: UnifiedBudgetModel): Summary {
  const total_income = model.income.reduce((sum, inc) => sum + inc.monthly_amount, 0);
  const total_expenses = model.expenses.reduce((sum, exp) => sum + Math.abs(exp.monthly_amount), 0);
  const debt_payments = model.debts.reduce((sum, debt) => sum + debt.min_payment, 0);
  const surplus = total_income - total_expenses - debt_payments;

  return {
    total_income,
    total_expenses: total_expenses + debt_payments,
    surplus,
  };
}

/**
 * Compute category shares from model
 */
export function computeCategoryShares(model: UnifiedBudgetModel): Record<string, number> {
  const total_expenses = model.expenses.reduce((sum, exp) => sum + Math.abs(exp.monthly_amount), 0);
  
  if (total_expenses === 0) return {};

  const shares: Record<string, number> = {};
  for (const expense of model.expenses) {
    shares[expense.category] = Math.abs(expense.monthly_amount) / total_expenses;
  }

  return shares;
}

