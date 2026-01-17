/**
 * Planner Normalization
 * 
 * Converts Goldleaf-style planner inputs to the UnifiedBudgetModel
 * used by the existing AI and summary infrastructure.
 */

import type { GoldleafInputs, FinancialAnalysis, ScoreComponent } from '@/types/planner';
import type { UnifiedBudgetModel, Income, Expense, Debt, Preferences, Summary } from '@/lib/budgetModel';
import type { BudgetAnalysis } from '@/lib/calculators/budgetCalculator';
import type { TaxAnalysis } from '@/lib/calculators/taxCalculator';

/**
 * Convert Goldleaf inputs and analysis to UnifiedBudgetModel
 */
export function convertToUnifiedBudgetModel(
  inputs: GoldleafInputs,
  analysis: { taxes: TaxAnalysis; budget: BudgetAnalysis }
): UnifiedBudgetModel {
  // Convert income
  const incomeEntries: Income[] = [
    {
      id: 'primary_salary',
      name: 'Salary',
      monthly_amount: inputs.employmentIncome.annualSalary / 12,
      type: 'earned' as const,
      stability: 'stable' as const,
    },
    ...inputs.additionalIncome.map((source): Income => ({
      id: source.id,
      name: source.name,
      monthly_amount: source.monthlyAmount,
      type: (source.type === 'rental' ? 'passive' : source.type === 'side_gig' ? 'earned' : 'passive') as 'earned' | 'passive' | 'transfer',
      stability: (source.isRecurring ? 'stable' : 'variable') as 'stable' | 'variable' | 'seasonal',
    })),
  ];

  // Convert expenses from budget categories
  const expenseEntries: Expense[] = [];
  for (const category of inputs.budgetCategories) {
    // Skip Savings and Retirement as they're not expenses
    if (['Savings', 'Retirement'].includes(category.name)) continue;
    
    for (const sub of category.subcategories) {
      if (sub.monthlyAmount > 0) {
        expenseEntries.push({
          id: sub.id,
          category: `${category.name}: ${sub.name}`,
          monthly_amount: sub.monthlyAmount,
          essential: sub.isEssential,
          notes: sub.notes || null,
        });
      }
    }
  }

  // Convert debts
  const debtEntries: Debt[] = inputs.debts.map((debt) => ({
    id: debt.id,
    name: debt.name,
    balance: debt.balance,
    interest_rate: debt.interestRate * 100, // Convert to percentage
    min_payment: debt.monthlyPayment,
    priority: debt.interestRate >= 0.15 ? 'high' : debt.interestRate >= 0.08 ? 'medium' : 'low' as const,
    approximate: false,
    rate_changes: null,
  }));

  // Set preferences based on debt situation
  const hasHighInterestDebt = inputs.debts.some((d) => d.interestRate >= 0.08);
  const preferences: Preferences = {
    optimization_focus: hasHighInterestDebt ? 'debt' : 'balanced',
    protect_essentials: true,
    max_desired_change_per_category: 0.25,
  };

  // Calculate summary from analysis
  const summary: Summary = {
    total_income: analysis.budget.monthlyGrossIncome,
    total_expenses: analysis.budget.monthlyExpenses,
    surplus: analysis.budget.monthlySurplus,
  };

  return {
    income: incomeEntries,
    expenses: expenseEntries,
    debts: debtEntries,
    preferences,
    summary,
  };
}

/**
 * Build FinancialAnalysis output for AI consumption
 */
export function buildFinancialAnalysis(
  inputs: GoldleafInputs,
  budgetAnalysis: BudgetAnalysis,
  taxAnalysis: TaxAnalysis
): FinancialAnalysis {
  // Calculate retirement balances
  const currentRetirementBalance = 
    inputs.accountBalances.retirement401k +
    inputs.accountBalances.rothIRA +
    inputs.accountBalances.tsp;

  // Simple retirement projection (would be more sophisticated in production)
  const yearsToRetirement = inputs.personalProfile.targetRetirementAge - 
    (inputs.personalProfile.dateOfBirth 
      ? Math.floor((Date.now() - inputs.personalProfile.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 30);
  
  const annualReturn = inputs.investmentAssumptions.expectedStockReturn;
  const annualContributions = budgetAnalysis.annualRetirementContributions;
  
  // Simple FV calculation: FV = PV(1+r)^n + PMT × ((1+r)^n - 1) / r
  const fvFactor = Math.pow(1 + annualReturn, yearsToRetirement);
  const annuityFactor = annualReturn > 0 ? (fvFactor - 1) / annualReturn : yearsToRetirement;
  const projectedRetirementBalance = 
    currentRetirementBalance * fvFactor + 
    annualContributions * annuityFactor;

  // Simple retirement readiness check
  const targetNestEgg = budgetAnalysis.livingExpenses * 12 * 25; // 25x annual expenses
  const onTrack = projectedRetirementBalance >= targetNestEgg * 0.8;

  // Calculate health score components
  const healthScore = calculateHealthScore(inputs, budgetAnalysis, taxAnalysis);

  return {
    // Budget outputs
    monthlyGrossIncome: budgetAnalysis.monthlyGrossIncome,
    monthlyNetIncome: budgetAnalysis.monthlyNetIncome,
    monthlyExpenses: budgetAnalysis.monthlyExpenses,
    monthlySurplus: budgetAnalysis.monthlySurplus,
    savingsRate: budgetAnalysis.savingsRate,
    categoryShares: budgetAnalysis.categoryShares,

    // Tax outputs
    annualFederalTax: taxAnalysis.federalTax,
    annualStateTax: taxAnalysis.stateTax,
    annualFICA: taxAnalysis.totalFICA,
    effectiveTaxRate: taxAnalysis.effectiveTaxRate,
    marginalTaxRate: taxAnalysis.marginalFederalRate,

    // Debt outputs
    totalDebt: budgetAnalysis.totalDebt,
    totalMonthlyDebtPayments: budgetAnalysis.monthlyDebtPayments,
    debtToIncomeRatio: budgetAnalysis.debtToIncomeRatio,
    monthlyInterestCost: budgetAnalysis.monthlyInterestCost,
    monthsToDebtFree: estimateMonthsToDebtFree(inputs.debts, budgetAnalysis.monthlySurplus),
    interestSavedWithAvalanche: 0, // Would calculate with debt engine

    // Retirement outputs
    currentRetirementBalance,
    annualContributions,
    projectedRetirementBalance,
    retirementReadinessStatus: onTrack ? 'on_track' : 'behind',
    yearsToRetirement,
    sustainableAnnualWithdrawal: projectedRetirementBalance * 0.04,

    // Net worth
    totalAssets: calculateTotalAssets(inputs),
    totalLiabilities: budgetAnalysis.totalDebt,
    netWorth: calculateTotalAssets(inputs) - budgetAnalysis.totalDebt,
    liquidNetWorth: calculateLiquidAssets(inputs) - budgetAnalysis.totalDebt,

    // Health score
    healthScore,

    // Rental (if applicable)
    rentalCashFlow: budgetAnalysis.totalRentalCashFlow,
    rentalNOI: undefined, // Would calculate if properties exist
    rentalScheduleELoss: taxAnalysis.rentalScheduleEIncome < 0 ? taxAnalysis.rentalScheduleEIncome : undefined,
  };
}

function calculateTotalAssets(inputs: GoldleafInputs): number {
  const { accountBalances } = inputs;
  return (
    accountBalances.checking +
    accountBalances.emergencyFund +
    accountBalances.retirement401k +
    accountBalances.rothIRA +
    accountBalances.tsp +
    accountBalances.brokerage +
    accountBalances.hsa +
    accountBalances.rentalPropertyReserves
  );
}

function calculateLiquidAssets(inputs: GoldleafInputs): number {
  const { accountBalances } = inputs;
  return (
    accountBalances.checking +
    accountBalances.emergencyFund +
    accountBalances.brokerage
  );
}

function estimateMonthsToDebtFree(
  debts: GoldleafInputs['debts'],
  monthlySurplus: number
): number | null {
  if (debts.length === 0) return 0;
  
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMinPayments = debts.reduce((sum, d) => sum + d.monthlyPayment, 0);
  const availableForDebt = totalMinPayments + Math.max(0, monthlySurplus);
  
  // Simplified estimate - doesn't account for interest
  if (availableForDebt <= 0) return null;
  return Math.ceil(totalDebt / availableForDebt);
}

function calculateHealthScore(
  inputs: GoldleafInputs,
  budget: BudgetAnalysis,
  _taxes: TaxAnalysis
): FinancialAnalysis['healthScore'] {
  // Security (35 points max)
  const emergencyMonths = inputs.accountBalances.emergencyFund / (budget.livingExpenses || 1);
  const securityPoints = Math.min(15, emergencyMonths * 5) + // Up to 15 for e-fund
    (inputs.debts.length === 0 ? 10 : 0) + // 10 if debt-free
    10; // 10 for having income (baseline)
  
  const security: ScoreComponent = {
    name: 'Security',
    points: Math.min(35, securityPoints),
    maxPoints: 35,
    status: emergencyMonths >= 3 ? 'Good' : 'Needs work',
    details: `${emergencyMonths.toFixed(1)} months emergency fund`,
  };

  // Debt (25 points max)
  const debtPoints = inputs.debts.length === 0 
    ? 25 
    : Math.max(0, 25 - (budget.debtToIncomeRatio * 50));
  
  const debt: ScoreComponent = {
    name: 'Debt',
    points: Math.round(debtPoints),
    maxPoints: 25,
    status: inputs.debts.length === 0 ? 'Debt-free' : `${(budget.debtToIncomeRatio * 100).toFixed(1)}% DTI`,
    details: inputs.debts.length === 0 
      ? 'No debt' 
      : `$${budget.totalDebt.toLocaleString()} total`,
  };

  // Wealth (25 points max)
  const wealthPoints = Math.min(15, budget.savingsRate * 100) + // Up to 15 for savings rate
    (budget.savingsRate >= 0.15 ? 10 : budget.savingsRate >= 0.10 ? 5 : 0); // Bonus for high rate
  
  const wealth: ScoreComponent = {
    name: 'Wealth',
    points: Math.min(25, Math.round(wealthPoints)),
    maxPoints: 25,
    status: budget.savingsRate >= 0.15 ? 'On track' : 'Building',
    details: `${(budget.savingsRate * 100).toFixed(1)}% savings rate`,
  };

  // Flexibility (15 points max)
  const surplusRatio = budget.monthlySurplus / (budget.monthlyNetIncome || 1);
  const flexPoints = Math.min(10, surplusRatio * 30) + // Up to 10 for surplus
    (budget.discretionaryExpenses > 0 ? 5 : 0); // 5 for having discretionary
  
  const flexibility: ScoreComponent = {
    name: 'Flexibility',
    points: Math.min(15, Math.round(flexPoints)),
    maxPoints: 15,
    status: surplusRatio >= 0.1 ? 'Good' : 'Tight',
    details: `${(surplusRatio * 100).toFixed(0)}% discretionary`,
  };

  const totalScore = security.points + debt.points + wealth.points + flexibility.points;
  const maxScore = 100;

  return {
    totalScore,
    maxScore,
    grade: totalScore >= 80 ? 'Excellent' : 
           totalScore >= 60 ? 'Good' : 
           totalScore >= 40 ? 'Building' : 
           totalScore >= 20 ? 'Needs Work' : 'Critical',
    security,
    debt,
    wealth,
    flexibility,
  };
}
