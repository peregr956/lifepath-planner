'use client';

import { Button, Input, Label } from '@/components/ui';
import type { PlannerStateReturn } from '@/hooks/usePlannerState';
import { PiggyBank, TrendingUp, Shield } from 'lucide-react';

interface SavingsStepProps {
  planner: PlannerStateReturn;
}

export function SavingsStep({ planner }: SavingsStepProps) {
  const { inputs, setRothIRAAnnual, updateSubcategory, goNext, goBack, setInputs } = planner;

  // Find savings and retirement categories
  const savingsCategory = inputs.budgetCategories.find((c) => c.name === 'Savings');
  const retirementCategory = inputs.budgetCategories.find((c) => c.name === 'Retirement');

  // Get specific subcategories
  const emergencyFund = savingsCategory?.subcategories.find((s) => s.name === 'Emergency Fund');
  const brokerage = savingsCategory?.subcategories.find((s) => s.name === 'Brokerage');

  // Calculate totals
  const monthly401k = inputs.employmentIncome.annualSalary * inputs.employmentIncome.contribution401kPercent / 12;
  const monthlyMatch = inputs.employmentIncome.annualSalary * inputs.employmentIncome.employerMatchPercent / 12;
  const monthlyRothIRA = inputs.employmentIncome.annualRothIRA / 12;
  const monthlyEmergencyFund = emergencyFund?.monthlyAmount || 0;
  const monthlyBrokerage = brokerage?.monthlyAmount || 0;

  const totalMonthlySavings = monthly401k + monthlyMatch + monthlyRothIRA + monthlyEmergencyFund + monthlyBrokerage;
  const savingsRate = inputs.employmentIncome.annualSalary > 0
    ? (totalMonthlySavings * 12) / inputs.employmentIncome.annualSalary
    : 0;

  const handleEmergencyFundChange = (value: number) => {
    if (savingsCategory && emergencyFund) {
      updateSubcategory(savingsCategory.id, emergencyFund.id, { monthlyAmount: value });
    }
  };

  const handleBrokerageChange = (value: number) => {
    if (savingsCategory && brokerage) {
      updateSubcategory(savingsCategory.id, brokerage.id, { monthlyAmount: value });
    }
  };

  const handleAccountBalanceChange = (field: keyof typeof inputs.accountBalances, value: number) => {
    setInputs({
      accountBalances: {
        ...inputs.accountBalances,
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Set up your savings contributions and track your current account balances.
      </p>

      {/* Retirement Contributions */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Retirement Contributions</h3>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          {/* 401k Summary (from Income step) */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div>
              <p className="font-medium">401(k) + Employer Match</p>
              <p className="text-sm text-muted-foreground">
                {(inputs.employmentIncome.contribution401kPercent * 100).toFixed(0)}% + {(inputs.employmentIncome.employerMatchPercent * 100).toFixed(0)}% match
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">${(monthly401k + monthlyMatch).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</p>
              <p className="text-xs text-muted-foreground">Set in Income step</p>
            </div>
          </div>

          {/* Roth IRA */}
          <div className="space-y-2">
            <Label htmlFor="roth-ira">Roth IRA (annual contribution)</Label>
            <Input
              id="roth-ira"
              type="number"
              prefix="$"
              suffix="/year"
              placeholder="7,000"
              value={inputs.employmentIncome.annualRothIRA || ''}
              onChange={(e) => setRothIRAAnnual(parseFloat(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              2024 limit: $7,000 ($8,000 if 50+). That&apos;s ${monthlyRothIRA.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month.
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Fund */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Emergency Fund</h3>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Current Balance</Label>
              <Input
                type="number"
                prefix="$"
                placeholder="5,000"
                value={inputs.accountBalances.emergencyFund || ''}
                onChange={(e) =>
                  handleAccountBalanceChange('emergencyFund', parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Monthly Contribution</Label>
              <Input
                type="number"
                prefix="$"
                suffix="/mo"
                placeholder="500"
                value={monthlyEmergencyFund || ''}
                onChange={(e) => handleEmergencyFundChange(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Other Savings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Other Savings</h3>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Brokerage Account Balance</Label>
              <Input
                type="number"
                prefix="$"
                placeholder="10,000"
                value={inputs.accountBalances.brokerage || ''}
                onChange={(e) =>
                  handleAccountBalanceChange('brokerage', parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Monthly Brokerage Contribution</Label>
              <Input
                type="number"
                prefix="$"
                suffix="/mo"
                placeholder="200"
                value={monthlyBrokerage || ''}
                onChange={(e) => handleBrokerageChange(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Savings Rate Summary */}
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Total Savings Rate</p>
            <p className="text-sm text-muted-foreground">
              ${totalMonthlySavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month across all accounts
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">
              {(savingsRate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {savingsRate >= 0.20
                ? '🎉 Excellent!'
                : savingsRate >= 0.15
                ? '👍 Good progress'
                : savingsRate >= 0.10
                ? 'Building momentum'
                : 'Room to grow'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between border-t pt-6">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button onClick={goNext}>Review Budget</Button>
      </div>
    </div>
  );
}
