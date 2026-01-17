'use client';

import { useState } from 'react';
import { Button, Input, Label } from '@/components/ui';
import type { PlannerStateReturn } from '@/hooks/usePlannerState';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpensesStepProps {
  planner: PlannerStateReturn;
}

export function ExpensesStep({ planner }: ExpensesStepProps) {
  const { inputs, updateSubcategory, goNext, goBack } = planner;
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(inputs.budgetCategories.slice(0, 3).map((c) => c.id))
  );

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const getCategoryTotal = (categoryId: string) => {
    const category = inputs.budgetCategories.find((c) => c.id === categoryId);
    if (!category) return 0;
    return category.subcategories.reduce((sum, sub) => sum + sub.monthlyAmount, 0);
  };

  const totalMonthlyExpenses = inputs.budgetCategories.reduce((total, category) => {
    return total + category.subcategories.reduce((sum, sub) => sum + sub.monthlyAmount, 0);
  }, 0);

  const addSubcategory = (categoryId: string) => {
    const newSub = {
      id: crypto.randomUUID(),
      name: '',
      monthlyAmount: 0,
      isEssential: false,
    };
    planner.addSubcategory(categoryId, newSub);
  };

  // Filter to show only expense categories (not Savings/Retirement which are handled in SavingsStep)
  const expenseCategories = inputs.budgetCategories.filter(
    (c) => !['Savings', 'Retirement'].includes(c.name)
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Enter your typical monthly spending for each category. Don&apos;t worry about being exact—you can always adjust later.
      </p>

      {/* Category accordion */}
      <div className="space-y-3">
        {expenseCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);
          const categoryTotal = getCategoryTotal(category.id);
          const hasValues = categoryTotal > 0;

          return (
            <div
              key={category.id}
              className={cn(
                'rounded-lg border transition-colors',
                hasValues ? 'border-primary/30 bg-primary/5' : 'border-border'
              )}
            >
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{category.name}</span>
                  {hasValues && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      ${categoryTotal.toLocaleString()}/mo
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {/* Subcategories */}
              {isExpanded && (
                <div className="border-t px-4 py-4">
                  <div className="space-y-3">
                    {category.subcategories.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-3">
                        <div className="flex-1">
                          <Input
                            placeholder="Expense name"
                            value={sub.name}
                            onChange={(e) =>
                              updateSubcategory(category.id, sub.id, { name: e.target.value })
                            }
                            className="h-9"
                          />
                        </div>
                        <div className="w-28">
                          <Input
                            type="number"
                            prefix="$"
                            placeholder="0"
                            value={sub.monthlyAmount || ''}
                            onChange={(e) =>
                              updateSubcategory(category.id, sub.id, {
                                monthlyAmount: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="h-9"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={() => planner.removeSubcategory(category.id, sub.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 text-muted-foreground"
                    onClick={() => addSubcategory(category.id)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add item
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Total Monthly Expenses</span>
          <span className="text-lg font-semibold">
            ${totalMonthlyExpenses.toLocaleString()}/mo
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between border-t pt-6">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button onClick={goNext}>Continue to Debts</Button>
      </div>
    </div>
  );
}
