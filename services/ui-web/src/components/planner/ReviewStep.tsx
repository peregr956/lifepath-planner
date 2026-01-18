'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import type { PlannerStateReturn } from '@/hooks/usePlannerState';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { analyzeBudget, calculateTotalMonthlyIncome } from '@/lib/calculators/budgetCalculator';
import { analyzeTaxes } from '@/lib/calculators/taxCalculator';
import { convertToUnifiedBudgetModel } from '@/lib/plannerNormalization';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  CreditCard,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewStepProps {
  planner: PlannerStateReturn;
}

export function ReviewStep({ planner }: ReviewStepProps) {
  const router = useRouter();
  const { saveSession } = useBudgetSession();
  const { inputs, goBack, complete } = planner;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate all metrics
  const analysis = useMemo(() => {
    const taxes = analyzeTaxes(
      inputs.employmentIncome,
      inputs.taxInputs,
      inputs.rentalProperties
    );
    const budget = analyzeBudget(inputs, taxes.monthlyTakeHome);
    return { taxes, budget };
  }, [inputs]);

  const { taxes, budget } = analysis;

  // Calculate quick stats
  const totalMonthlyIncome = calculateTotalMonthlyIncome(
    inputs.employmentIncome,
    inputs.additionalIncome
  );
  const monthlyTakeHome = taxes.monthlyTakeHome;
  const isPositiveCashFlow = budget.monthlySurplus >= 0;

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Convert to UnifiedBudgetModel
      const unifiedModel = convertToUnifiedBudgetModel(inputs, analysis);
      
      // Call the API to create the budget session in the database
      const response = await fetch('/api/budget/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unifiedModel,
          plannerInputs: inputs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || 'Failed to save budget');
      }

      const data = await response.json();
      const budgetId = data.budget_id;
      
      // Save to local session
      saveSession({
        budgetId,
        detectedFormat: 'budget_builder',
        clarified: true, // Skip clarification since user built it themselves
        readyForSummary: true,
        summaryPreview: {
          detectedIncomeLines: unifiedModel.income.length,
          detectedExpenseLines: unifiedModel.expenses.length,
        },
      });
      
      complete();
      
      // Navigate to summary
      router.push('/summarize');
    } catch (err) {
      console.error('[ReviewStep] Failed to save budget:', err);
      setError(err instanceof Error ? err.message : 'Failed to save budget. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Here&apos;s your financial snapshot. Review the numbers and click &quot;Complete&quot; to get AI-powered recommendations.
      </p>

      {/* Cash Flow Summary */}
      <div
        className={cn(
          'rounded-lg border p-6',
          isPositiveCashFlow
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-destructive/30 bg-destructive/5'
        )}
      >
        <div className="flex items-center gap-3 mb-4">
          {isPositiveCashFlow ? (
            <TrendingUp className="h-6 w-6 text-green-600" />
          ) : (
            <TrendingDown className="h-6 w-6 text-destructive" />
          )}
          <h3 className="text-lg font-semibold">Monthly Cash Flow</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Gross Income</p>
            <p className="text-xl font-semibold">
              ${totalMonthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Take-Home Pay</p>
            <p className="text-xl font-semibold">
              ${monthlyTakeHome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {isPositiveCashFlow ? 'Surplus' : 'Deficit'}
            </p>
            <p
              className={cn(
                'text-xl font-semibold',
                isPositiveCashFlow ? 'text-green-600' : 'text-destructive'
              )}
            >
              {isPositiveCashFlow ? '+' : ''}$
              {budget.monthlySurplus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Expenses */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-medium">Expenses</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Essential</span>
              <span>${budget.essentialExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discretionary</span>
              <span>${budget.discretionaryExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
            </div>
            <div className="flex justify-between text-sm font-medium border-t pt-2">
              <span>Total</span>
              <span>${budget.monthlyExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
            </div>
          </div>
        </div>

        {/* Savings */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <PiggyBank className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-medium">Savings</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Retirement</span>
              <span>${budget.monthlyRetirementContributions.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
            </div>
            <div className="flex justify-between text-sm font-medium border-t pt-2">
              <span>Savings Rate</span>
              <span className={cn(
                budget.savingsRate >= 0.15 ? 'text-green-600' : ''
              )}>
                {(budget.savingsRate * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Debt */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-medium">Debt</h4>
          </div>
          {inputs.debts.length === 0 ? (
            <p className="text-sm text-green-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Debt-free!
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Balance</span>
                <span>${budget.totalDebt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monthly Payments</span>
                <span>${budget.monthlyDebtPayments.toLocaleString()}/mo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Debt-to-Income</span>
                <span className={cn(
                  budget.debtToIncomeRatio > 0.36 ? 'text-destructive' : ''
                )}>
                  {(budget.debtToIncomeRatio * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Taxes */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-medium">Taxes</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Federal</span>
              <span>${(taxes.federalTax / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">State</span>
              <span>${(taxes.stateTax / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">FICA</span>
              <span>${(taxes.totalFICA / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
            </div>
            <div className="flex justify-between text-sm font-medium border-t pt-2">
              <span>Effective Rate</span>
              <span>{(taxes.effectiveTaxRate * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between border-t pt-6">
        <Button variant="outline" onClick={goBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button onClick={handleComplete} size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Complete & Get Recommendations'
          )}
        </Button>
      </div>
    </div>
  );
}
