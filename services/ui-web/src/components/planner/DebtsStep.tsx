'use client';

import { Button, Input, Label } from '@/components/ui';
import type { PlannerStateReturn } from '@/hooks/usePlannerState';
import type { DebtAccount } from '@/types/planner';
import { Plus, Trash2, CreditCard, GraduationCap, Car, Home, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DebtsStepProps {
  planner: PlannerStateReturn;
}

const DEBT_TYPE_ICONS: Record<DebtAccount['type'], React.ReactNode> = {
  credit_card: <CreditCard className="h-5 w-5" />,
  student_loan: <GraduationCap className="h-5 w-5" />,
  auto_loan: <Car className="h-5 w-5" />,
  mortgage: <Home className="h-5 w-5" />,
  personal_loan: <Wallet className="h-5 w-5" />,
  other: <Wallet className="h-5 w-5" />,
};

const DEBT_TYPE_LABELS: Record<DebtAccount['type'], string> = {
  credit_card: 'Credit Card',
  student_loan: 'Student Loan',
  auto_loan: 'Auto Loan',
  mortgage: 'Mortgage',
  personal_loan: 'Personal Loan',
  other: 'Other',
};

export function DebtsStep({ planner }: DebtsStepProps) {
  const { inputs, addDebt, updateDebt, removeDebt, goNext, goBack } = planner;
  const { debts } = inputs;

  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const totalMonthlyPayments = debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
  const monthlyInterestCost = debts.reduce((sum, debt) => {
    return sum + (debt.balance * debt.interestRate) / 12;
  }, 0);

  const handleAddDebt = (type: DebtAccount['type']) => {
    addDebt({ type, name: DEBT_TYPE_LABELS[type] });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Add your debts to help us calculate payoff strategies and prioritize your financial plan.
      </p>

      {/* Quick add buttons */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(DEBT_TYPE_LABELS) as DebtAccount['type'][]).map((type) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            onClick={() => handleAddDebt(type)}
            className="gap-2"
          >
            {DEBT_TYPE_ICONS[type]}
            {DEBT_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {/* Debt list */}
      {debts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Wallet className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 font-medium text-muted-foreground">No debts added</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click a button above to add a debt, or skip this step if you&apos;re debt-free!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {debts.map((debt) => (
            <div
              key={debt.id}
              className={cn(
                'rounded-lg border p-4 transition-colors',
                debt.interestRate >= 0.15
                  ? 'border-destructive/30 bg-destructive/5'
                  : debt.interestRate >= 0.08
                  ? 'border-warning/30 bg-warning/5'
                  : 'border-border'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-muted p-2">
                  {DEBT_TYPE_ICONS[debt.type]}
                </div>
                <div className="flex-1 space-y-4">
                  {/* Name and delete */}
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="Debt name"
                      value={debt.name}
                      onChange={(e) => updateDebt(debt.id, { name: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeDebt(debt.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Details row */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Balance</Label>
                      <Input
                        type="number"
                        prefix="$"
                        placeholder="5,000"
                        value={debt.balance || ''}
                        onChange={(e) =>
                          updateDebt(debt.id, { balance: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Interest Rate</Label>
                      <Input
                        type="number"
                        suffix="%"
                        placeholder="8.9"
                        value={debt.interestRate ? (debt.interestRate * 100).toFixed(2) : ''}
                        onChange={(e) =>
                          updateDebt(debt.id, {
                            interestRate: (parseFloat(e.target.value) || 0) / 100,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Monthly Payment</Label>
                      <Input
                        type="number"
                        prefix="$"
                        placeholder="200"
                        value={debt.monthlyPayment || ''}
                        onChange={(e) =>
                          updateDebt(debt.id, {
                            monthlyPayment: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Interest warning */}
                  {debt.interestRate >= 0.15 && (
                    <p className="text-xs text-destructive">
                      ⚠️ High interest rate! This debt should be prioritized.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {debts.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total Debt</p>
              <p className="text-lg font-semibold">${totalDebt.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Payments</p>
              <p className="text-lg font-semibold">${totalMonthlyPayments.toLocaleString()}/mo</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Interest Cost</p>
              <p className="text-lg font-semibold text-destructive">
                ${monthlyInterestCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between border-t pt-6">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button onClick={goNext}>
          {debts.length === 0 ? 'Skip (No Debts)' : 'Continue to Savings'}
        </Button>
      </div>
    </div>
  );
}
