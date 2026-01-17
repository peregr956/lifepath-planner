'use client';

import { usePlannerState } from '@/hooks/usePlannerState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '@/components/ui';
import { IncomeStep } from './IncomeStep';
import { ExpensesStep } from './ExpensesStep';
import { DebtsStep } from './DebtsStep';
import { SavingsStep } from './SavingsStep';
import { ReviewStep } from './ReviewStep';
import { cn } from '@/lib/utils';

const STEP_LABELS: Record<string, { title: string; description: string }> = {
  income: {
    title: 'Income',
    description: "Let's start with your income sources",
  },
  expenses: {
    title: 'Expenses',
    description: 'Track your monthly spending by category',
  },
  debts: {
    title: 'Debts',
    description: 'Add any debts or loans you have',
  },
  savings: {
    title: 'Savings & Retirement',
    description: 'Set up your savings and retirement contributions',
  },
  review: {
    title: 'Review',
    description: 'Review your budget and see your financial snapshot',
  },
};

const STEP_ORDER = ['income', 'expenses', 'debts', 'savings', 'review'] as const;

export function BudgetBuilder() {
  const planner = usePlannerState();
  const { currentStep, progress } = planner;
  const stepInfo = STEP_LABELS[currentStep];

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEP_ORDER.map((step, index) => (
            <button
              key={step}
              onClick={() => planner.goToStep(step)}
              className={cn(
                'flex items-center gap-2 text-sm font-medium transition-colors',
                currentStep === step
                  ? 'text-primary'
                  : planner.currentStepIndex > index
                  ? 'text-foreground hover:text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  currentStep === step
                    ? 'bg-primary text-primary-foreground'
                    : planner.currentStepIndex > index
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {index + 1}
              </span>
              <span className="hidden sm:inline">{STEP_LABELS[step].title}</span>
            </button>
          ))}
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{stepInfo.title}</CardTitle>
          <CardDescription>{stepInfo.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 'income' && <IncomeStep planner={planner} />}
          {currentStep === 'expenses' && <ExpensesStep planner={planner} />}
          {currentStep === 'debts' && <DebtsStep planner={planner} />}
          {currentStep === 'savings' && <SavingsStep planner={planner} />}
          {currentStep === 'review' && <ReviewStep planner={planner} />}
        </CardContent>
      </Card>
    </div>
  );
}
