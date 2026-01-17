'use client';

import { useState } from 'react';
import { Button, Input, Label } from '@/components/ui';
import type { PlannerStateReturn } from '@/hooks/usePlannerState';
import type { AdditionalIncomeSource } from '@/types/planner';
import { Plus, Trash2 } from 'lucide-react';

interface IncomeStepProps {
  planner: PlannerStateReturn;
}

export function IncomeStep({ planner }: IncomeStepProps) {
  const { inputs, setAnnualSalary, set401kPercent, setEmployerMatchPercent, goNext } = planner;
  const [showAdditional, setShowAdditional] = useState(inputs.additionalIncome.length > 0);

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value.replace(/,/g, '')) || 0;
    setAnnualSalary(value);
  };

  const handle401kChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    set401kPercent(value / 100); // Convert percentage to decimal
  };

  const handleMatchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setEmployerMatchPercent(value / 100);
  };

  const addIncomeSource = () => {
    const newSource: AdditionalIncomeSource = {
      id: crypto.randomUUID(),
      name: '',
      monthlyAmount: 0,
      type: 'other',
      isRecurring: true,
    };
    planner.addIncomeSource(newSource);
    setShowAdditional(true);
  };

  const monthlyGross = inputs.employmentIncome.annualSalary / 12;
  const annual401k = inputs.employmentIncome.annualSalary * inputs.employmentIncome.contribution401kPercent;
  const annualMatch = inputs.employmentIncome.annualSalary * inputs.employmentIncome.employerMatchPercent;

  return (
    <div className="space-y-6">
      {/* Primary Income */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Primary Income</h3>
        
        <div className="space-y-2">
          <Label htmlFor="annual-salary">Annual Salary (before taxes)</Label>
          <Input
            id="annual-salary"
            type="number"
            prefix="$"
            placeholder="75,000"
            value={inputs.employmentIncome.annualSalary || ''}
            onChange={handleSalaryChange}
          />
          {inputs.employmentIncome.annualSalary > 0 && (
            <p className="text-sm text-muted-foreground">
              That&apos;s ${monthlyGross.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month gross
            </p>
          )}
        </div>
      </div>

      {/* 401(k) Contributions */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-medium">Retirement Contributions</h3>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contribution-401k">Your 401(k) contribution</Label>
            <Input
              id="contribution-401k"
              type="number"
              suffix="%"
              placeholder="6"
              value={(inputs.employmentIncome.contribution401kPercent * 100) || ''}
              onChange={handle401kChange}
            />
            {annual401k > 0 && (
              <p className="text-sm text-muted-foreground">
                ${annual401k.toLocaleString(undefined, { maximumFractionDigits: 0 })}/year
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="employer-match">Employer match</Label>
            <Input
              id="employer-match"
              type="number"
              suffix="%"
              placeholder="3"
              value={(inputs.employmentIncome.employerMatchPercent * 100) || ''}
              onChange={handleMatchChange}
            />
            {annualMatch > 0 && (
              <p className="text-sm text-muted-foreground">
                ${annualMatch.toLocaleString(undefined, { maximumFractionDigits: 0 })}/year (free money!)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Additional Income */}
      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Additional Income</h3>
          <Button variant="outline" size="sm" onClick={addIncomeSource}>
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>
        </div>

        {inputs.additionalIncome.length === 0 && !showAdditional && (
          <p className="text-sm text-muted-foreground">
            No additional income sources. Click &quot;Add Source&quot; to add side gigs, rental income, etc.
          </p>
        )}

        {inputs.additionalIncome.map((source) => (
          <div key={source.id} className="flex items-end gap-3 rounded-lg border p-4">
            <div className="flex-1 space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Side gig, rental income, etc."
                value={source.name}
                onChange={(e) =>
                  planner.updateIncomeSource(source.id, { name: e.target.value })
                }
              />
            </div>
            <div className="w-32 space-y-2">
              <Label>Monthly</Label>
              <Input
                type="number"
                prefix="$"
                placeholder="500"
                value={source.monthlyAmount || ''}
                onChange={(e) =>
                  planner.updateIncomeSource(source.id, {
                    monthlyAmount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => planner.removeIncomeSource(source.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-end border-t pt-6">
        <Button onClick={goNext}>
          Continue to Expenses
        </Button>
      </div>
    </div>
  );
}
