/**
 * Budget Calculator
 * 
 * Deterministic calculations for budget analysis.
 * Mirrors the Goldleaf Excel budget calculations.
 */

import type {
  GoldleafInputs,
  BudgetCategory,
  DebtAccount,
  EmploymentIncome,
  AdditionalIncomeSource,
  RentalProperty,
} from '@/types/planner';

// ============================================================================
// Income Calculations
// ============================================================================

/**
 * Calculate monthly gross income from employment
 */
export function calculateMonthlyGrossIncome(employment: EmploymentIncome): number {
  return employment.annualSalary / 12;
}

/**
 * Calculate total monthly income from all sources
 */
export function calculateTotalMonthlyIncome(
  employment: EmploymentIncome,
  additionalIncome: AdditionalIncomeSource[]
): number {
  const employmentIncome = calculateMonthlyGrossIncome(employment);
  const additionalTotal = additionalIncome.reduce(
    (sum, source) => sum + source.monthlyAmount,
    0
  );
  return employmentIncome + additionalTotal;
}

/**
 * Calculate annual 401(k) contribution amount
 */
export function calculateAnnual401kContribution(employment: EmploymentIncome): number {
  return employment.annualSalary * employment.contribution401kPercent;
}

/**
 * Calculate annual employer match amount
 */
export function calculateAnnualEmployerMatch(employment: EmploymentIncome): number {
  return employment.annualSalary * employment.employerMatchPercent;
}

/**
 * Calculate total annual retirement contributions (employee + employer)
 */
export function calculateTotalAnnualRetirementContributions(
  employment: EmploymentIncome
): number {
  const employee401k = calculateAnnual401kContribution(employment);
  const employerMatch = calculateAnnualEmployerMatch(employment);
  const tspContribution = employment.annualSalary * employment.tspContributionPercent;
  const tspMatch = employment.annualSalary * employment.tspMatchPercent;
  const rothIRA = employment.annualRothIRA;
  
  return employee401k + employerMatch + tspContribution + tspMatch + rothIRA;
}

// ============================================================================
// Expense Calculations
// ============================================================================

/**
 * Calculate total monthly expenses from budget categories
 */
export function calculateTotalMonthlyExpenses(categories: BudgetCategory[]): number {
  return categories.reduce((total, category) => {
    const categoryTotal = category.subcategories.reduce(
      (sum, sub) => sum + sub.monthlyAmount,
      0
    );
    return total + categoryTotal;
  }, 0);
}

/**
 * Calculate essential vs discretionary expense breakdown
 */
export function calculateExpenseBreakdown(categories: BudgetCategory[]): {
  essential: number;
  discretionary: number;
} {
  let essential = 0;
  let discretionary = 0;

  for (const category of categories) {
    for (const sub of category.subcategories) {
      if (sub.isEssential) {
        essential += sub.monthlyAmount;
      } else {
        discretionary += sub.monthlyAmount;
      }
    }
  }

  return { essential, discretionary };
}

/**
 * Calculate category shares (percentage of total expenses)
 */
export function calculateCategoryShares(
  categories: BudgetCategory[]
): Record<string, number> {
  const totalExpenses = calculateTotalMonthlyExpenses(categories);
  if (totalExpenses === 0) return {};

  const shares: Record<string, number> = {};
  for (const category of categories) {
    const categoryTotal = category.subcategories.reduce(
      (sum, sub) => sum + sub.monthlyAmount,
      0
    );
    shares[category.name] = categoryTotal / totalExpenses;
  }

  return shares;
}

/**
 * Calculate living expenses (excluding debt payments, savings, retirement)
 */
export function calculateLivingExpenses(categories: BudgetCategory[]): number {
  const excludedCategories = ['Debt Payments', 'Savings', 'Retirement'];
  
  return categories
    .filter(cat => !excludedCategories.includes(cat.name))
    .reduce((total, category) => {
      const categoryTotal = category.subcategories.reduce(
        (sum, sub) => sum + sub.monthlyAmount,
        0
      );
      return total + categoryTotal;
    }, 0);
}

// ============================================================================
// Debt Calculations
// ============================================================================

/**
 * Calculate total debt balance
 */
export function calculateTotalDebt(debts: DebtAccount[]): number {
  return debts.reduce((sum, debt) => sum + debt.balance, 0);
}

/**
 * Calculate total monthly debt payments
 */
export function calculateTotalMonthlyDebtPayments(debts: DebtAccount[]): number {
  return debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
}

/**
 * Calculate monthly interest cost across all debts
 */
export function calculateMonthlyInterestCost(debts: DebtAccount[]): number {
  return debts.reduce((sum, debt) => {
    const monthlyRate = debt.interestRate / 12;
    return sum + (debt.balance * monthlyRate);
  }, 0);
}

/**
 * Calculate debt-to-income ratio
 */
export function calculateDebtToIncomeRatio(
  debts: DebtAccount[],
  monthlyGrossIncome: number
): number {
  if (monthlyGrossIncome === 0) return 0;
  const monthlyDebtPayments = calculateTotalMonthlyDebtPayments(debts);
  return monthlyDebtPayments / monthlyGrossIncome;
}

// ============================================================================
// Surplus & Savings Rate
// ============================================================================

/**
 * Calculate monthly surplus (income - expenses)
 */
export function calculateMonthlySurplus(
  monthlyNetIncome: number,
  monthlyExpenses: number
): number {
  return monthlyNetIncome - monthlyExpenses;
}

/**
 * Calculate savings rate (savings / gross income)
 * Includes retirement contributions as savings
 */
export function calculateSavingsRate(
  employment: EmploymentIncome,
  categories: BudgetCategory[]
): number {
  if (employment.annualSalary === 0) return 0;

  // Retirement contributions
  const annualRetirement = calculateTotalAnnualRetirementContributions(employment);
  
  // Savings category contributions
  const savingsCategory = categories.find(c => c.name === 'Savings');
  const monthlySavings = savingsCategory
    ? savingsCategory.subcategories.reduce((sum, sub) => sum + sub.monthlyAmount, 0)
    : 0;
  const annualSavings = monthlySavings * 12;
  
  // Total savings as percentage of gross income
  return (annualRetirement + annualSavings) / employment.annualSalary;
}

// ============================================================================
// Rental Property Calculations
// ============================================================================

/**
 * Calculate net operating income (NOI) for a rental property
 */
export function calculateRentalNOI(property: RentalProperty): number {
  const effectiveGrossIncome = property.monthlyGrossRent * (1 - property.vacancyReservePercent);
  
  const operatingExpenses = 
    (property.monthlyGrossRent * property.propertyManagementPercent) +
    property.monthlyPropertyTax +
    property.monthlyInsurance +
    property.monthlyRepairsReserve +
    property.monthlyUtilitiesOwner;
  
  return (effectiveGrossIncome - operatingExpenses) * 12;
}

/**
 * Calculate monthly cash flow for a rental property
 */
export function calculateRentalCashFlow(property: RentalProperty): number {
  const monthlyNOI = calculateRentalNOI(property) / 12;
  return monthlyNOI - property.monthlyPIPayment;
}

/**
 * Calculate total rental cash flow across all properties
 */
export function calculateTotalRentalCashFlow(properties: RentalProperty[]): number {
  return properties.reduce((sum, prop) => sum + calculateRentalCashFlow(prop), 0);
}

// ============================================================================
// Complete Budget Analysis
// ============================================================================

export interface BudgetAnalysis {
  // Income
  monthlyGrossIncome: number;
  monthlyNetIncome: number;
  annualGrossIncome: number;
  
  // Expenses
  monthlyExpenses: number;
  essentialExpenses: number;
  discretionaryExpenses: number;
  livingExpenses: number;
  categoryShares: Record<string, number>;
  
  // Debt
  totalDebt: number;
  monthlyDebtPayments: number;
  monthlyInterestCost: number;
  debtToIncomeRatio: number;
  
  // Surplus & Savings
  monthlySurplus: number;
  savingsRate: number;
  
  // Rental (if applicable)
  totalRentalCashFlow: number;
  
  // Retirement
  annualRetirementContributions: number;
  monthlyRetirementContributions: number;
}

/**
 * Perform complete budget analysis from Goldleaf inputs
 * 
 * Note: This function expects monthlyNetIncome to be pre-calculated
 * by the tax calculator. If not available, pass monthlyGrossIncome.
 */
export function analyzeBudget(
  inputs: GoldleafInputs,
  monthlyNetIncome: number
): BudgetAnalysis {
  const monthlyGrossIncome = calculateMonthlyGrossIncome(inputs.employmentIncome);
  const monthlyExpenses = calculateTotalMonthlyExpenses(inputs.budgetCategories);
  const expenseBreakdown = calculateExpenseBreakdown(inputs.budgetCategories);
  const livingExpenses = calculateLivingExpenses(inputs.budgetCategories);
  const categoryShares = calculateCategoryShares(inputs.budgetCategories);
  
  const totalDebt = calculateTotalDebt(inputs.debts);
  const monthlyDebtPayments = calculateTotalMonthlyDebtPayments(inputs.debts);
  const monthlyInterestCost = calculateMonthlyInterestCost(inputs.debts);
  const debtToIncomeRatio = calculateDebtToIncomeRatio(inputs.debts, monthlyGrossIncome);
  
  const monthlySurplus = calculateMonthlySurplus(monthlyNetIncome, monthlyExpenses);
  const savingsRate = calculateSavingsRate(inputs.employmentIncome, inputs.budgetCategories);
  
  const totalRentalCashFlow = calculateTotalRentalCashFlow(inputs.rentalProperties);
  
  const annualRetirementContributions = calculateTotalAnnualRetirementContributions(
    inputs.employmentIncome
  );

  return {
    monthlyGrossIncome,
    monthlyNetIncome,
    annualGrossIncome: inputs.employmentIncome.annualSalary,
    monthlyExpenses,
    essentialExpenses: expenseBreakdown.essential,
    discretionaryExpenses: expenseBreakdown.discretionary,
    livingExpenses,
    categoryShares,
    totalDebt,
    monthlyDebtPayments,
    monthlyInterestCost,
    debtToIncomeRatio,
    monthlySurplus,
    savingsRate,
    totalRentalCashFlow,
    annualRetirementContributions,
    monthlyRetirementContributions: annualRetirementContributions / 12,
  };
}
