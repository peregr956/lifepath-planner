'use client';

import { useState, useCallback } from 'react';
import type { IncomeEntry, ExpenseEntry, DebtEntry, BudgetPreferences } from '@/types';
import type { PatchIncomeEntry, PatchExpenseEntry, PatchDebtEntry } from '@/hooks/useBudgetSession';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Switch,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Select,
  Separator,
} from '@/components/ui';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Pencil,
  Check,
  X,
  Wallet,
  CreditCard,
  Landmark,
  ChevronDown,
  Plus,
  Trash2,
} from 'lucide-react';

type Props = {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  debts: DebtEntry[];
  preferences: BudgetPreferences;
  disabled?: boolean;
  onIncomeChange?: (updates: PatchIncomeEntry[]) => void;
  onExpenseChange?: (updates: PatchExpenseEntry[]) => void;
  onDebtChange?: (updates: PatchDebtEntry[]) => void;
  onPreferenceChange?: (updates: Partial<BudgetPreferences>) => void;
};

type EditingState = {
  type: 'income' | 'expense' | 'debt' | null;
  id: string | null;
};

// Inline editable number field
function EditableAmount({
  value,
  onChange,
  disabled,
  prefix = '$',
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  prefix?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));

  const handleSave = () => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(String(value));
    setIsEditing(false);
  };

  if (isEditing && !disabled) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">{prefix}</span>
        <Input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className="h-7 w-24 text-right font-mono"
          autoFocus
        />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setEditValue(String(value));
        setIsEditing(true);
      }}
      disabled={disabled}
      className={cn(
        'group flex items-center gap-1 rounded px-1 font-mono tabular-nums transition-colors',
        !disabled && 'hover:bg-muted cursor-pointer'
      )}
    >
      {prefix}{value.toLocaleString()}
      {!disabled && (
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

// Income row component
function IncomeRow({
  income,
  disabled,
  onChange,
}: {
  income: IncomeEntry;
  disabled?: boolean;
  onChange: (update: PatchIncomeEntry) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
          <Wallet className="h-3 w-3 text-primary" />
        </div>
        <span className="font-medium">{income.name}</span>
        <span className="text-xs text-muted-foreground">({income.type})</span>
      </div>
      <EditableAmount
        value={income.monthlyAmount}
        onChange={(value) => onChange({ id: income.id, monthly_amount: value })}
        disabled={disabled}
      />
    </div>
  );
}

// Expense row component
function ExpenseRow({
  expense,
  disabled,
  onChange,
}: {
  expense: ExpenseEntry;
  disabled?: boolean;
  onChange: (update: PatchExpenseEntry) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-destructive/10">
          <CreditCard className="h-3 w-3 text-destructive" />
        </div>
        <span className="font-medium">{expense.category}</span>
        <div className="flex items-center gap-1">
          <Label htmlFor={`essential-${expense.id}`} className="text-xs text-muted-foreground">
            Essential
          </Label>
          <Switch
            id={`essential-${expense.id}`}
            checked={expense.essential ?? false}
            onCheckedChange={(checked) => onChange({ id: expense.id, essential: checked })}
            disabled={disabled}
            className="scale-75"
          />
        </div>
      </div>
      <EditableAmount
        value={expense.monthlyAmount}
        onChange={(value) => onChange({ id: expense.id, monthly_amount: value })}
        disabled={disabled}
      />
    </div>
  );
}

// Debt row component
function DebtRow({
  debt,
  disabled,
  onChange,
}: {
  debt: DebtEntry;
  disabled?: boolean;
  onChange: (update: PatchDebtEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="py-2 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-warning/10">
            <Landmark className="h-3 w-3 text-warning" />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 font-medium hover:text-primary"
          >
            {debt.name}
            <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
          </button>
          <span className="text-xs text-muted-foreground">{debt.interestRate}% APR</span>
        </div>
        <EditableAmount
          value={debt.balance}
          onChange={(value) => onChange({ id: debt.id, balance: value })}
          disabled={disabled}
        />
      </div>
      {expanded && (
        <div className="ml-8 mt-2 grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-3">
          <div>
            <Label className="text-xs text-muted-foreground">Interest Rate</Label>
            <div className="mt-1">
              <EditableAmount
                value={debt.interestRate}
                onChange={(value) => onChange({ id: debt.id, interest_rate: value })}
                disabled={disabled}
                prefix=""
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Min Payment</Label>
            <div className="mt-1">
              <EditableAmount
                value={debt.minPayment}
                onChange={(value) => onChange({ id: debt.id, min_payment: value })}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function EditableBudgetSection({
  income,
  expenses,
  debts,
  preferences,
  disabled = false,
  onIncomeChange,
  onExpenseChange,
  onDebtChange,
  onPreferenceChange,
}: Props) {
  const [openSections, setOpenSections] = useState<string[]>([]);

  const handleIncomeUpdate = useCallback(
    (update: PatchIncomeEntry) => {
      onIncomeChange?.([update]);
    },
    [onIncomeChange]
  );

  const handleExpenseUpdate = useCallback(
    (update: PatchExpenseEntry) => {
      onExpenseChange?.([update]);
    },
    [onExpenseChange]
  );

  const handleDebtUpdate = useCallback(
    (update: PatchDebtEntry) => {
      onDebtChange?.([update]);
    },
    [onDebtChange]
  );

  const totalIncome = income.reduce((sum, inc) => sum + inc.monthlyAmount, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.monthlyAmount, 0);
  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Pencil className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Budget Details</CardTitle>
              <CardDescription>Click any amount to edit</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion
          type="multiple"
          value={openSections}
          onValueChange={setOpenSections}
          className="w-full"
        >
          {/* Income Section */}
          <AccordionItem value="income" className="border-b-0">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex w-full items-center justify-between pr-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span>Income</span>
                  <span className="text-xs text-muted-foreground">({income.length} sources)</span>
                </div>
                <span className="font-mono tabular-nums text-primary">
                  {formatCurrency(totalIncome)}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="divide-y divide-border pl-6">
                {income.map((inc) => (
                  <IncomeRow
                    key={inc.id}
                    income={inc}
                    disabled={disabled}
                    onChange={handleIncomeUpdate}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Expenses Section */}
          <AccordionItem value="expenses" className="border-b-0">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex w-full items-center justify-between pr-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-destructive" />
                  <span>Expenses</span>
                  <span className="text-xs text-muted-foreground">
                    ({expenses.length} categories)
                  </span>
                </div>
                <span className="font-mono tabular-nums text-destructive">
                  {formatCurrency(totalExpenses)}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="divide-y divide-border pl-6">
                {expenses.map((exp) => (
                  <ExpenseRow
                    key={exp.id}
                    expense={exp}
                    disabled={disabled}
                    onChange={handleExpenseUpdate}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Debts Section */}
          {debts.length > 0 && (
            <AccordionItem value="debts" className="border-b-0">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex w-full items-center justify-between pr-2">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-warning" />
                    <span>Debts</span>
                    <span className="text-xs text-muted-foreground">({debts.length} accounts)</span>
                  </div>
                  <span className="font-mono tabular-nums text-warning">
                    {formatCurrency(totalDebt)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="divide-y divide-border pl-6">
                  {debts.map((debt) => (
                    <DebtRow
                      key={debt.id}
                      debt={debt}
                      disabled={disabled}
                      onChange={handleDebtUpdate}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Preferences Section */}
          <AccordionItem value="preferences" className="border-b-0">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span>Optimization Preferences</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pl-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="optimization-focus">Optimization Focus</Label>
                  <select
                    id="optimization-focus"
                    value={preferences.optimizationFocus}
                    onChange={(e) =>
                      onPreferenceChange?.({
                        optimizationFocus: e.target.value as 'debt' | 'savings' | 'balanced',
                      })
                    }
                    disabled={disabled}
                    className="rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="debt">Pay Off Debt</option>
                    <option value="savings">Build Savings</option>
                    <option value="balanced">Balanced Approach</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="protect-essentials">Protect Essential Expenses</Label>
                  <Switch
                    id="protect-essentials"
                    checked={preferences.protectEssentials}
                    onCheckedChange={(checked) =>
                      onPreferenceChange?.({ protectEssentials: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
