'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { EditableBudgetSection } from '@/components/EditableBudgetSection';
import { EditableQuerySection } from '@/components/EditableQuerySection';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import type { PatchIncomeEntry, PatchExpenseEntry, PatchDebtEntry } from '@/hooks/useBudgetSession';
import { fetchSummaryAndSuggestions } from '@/utils/apiClient';
import { Card, CardContent, Skeleton, Button, Badge } from '@/components/ui';
import { AlertCircle, Loader2, BarChart3, RefreshCw, Pencil } from 'lucide-react';
import type { BudgetPreferences, FoundationalContext } from '@/types';

// Phase 9.5: Import new summary components
import {
  AnswerCard,
  ProfileContextBar,
  BudgetSnapshotCard,
  SuggestionsSection,
  ProjectedImpactCard,
  NextActionsCard,
} from '@/components/summary';

// Raw API model uses snake_case
type RawBudgetModel = {
  income: Array<{
    id: string;
    name: string;
    monthly_amount: number;
    type: 'earned' | 'passive' | 'transfer';
    stability: 'stable' | 'variable' | 'seasonal';
  }>;
  expenses: Array<{
    id: string;
    category: string;
    monthly_amount: number;
    essential?: boolean | null;
    notes?: string | null;
  }>;
  debts: Array<{
    id: string;
    name: string;
    balance: number;
    interest_rate: number;
    min_payment: number;
    priority: 'high' | 'medium' | 'low';
    approximate: boolean;
  }>;
  preferences: {
    optimization_focus: 'debt' | 'savings' | 'balanced';
    protect_essentials: boolean;
    max_desired_change_per_category: number;
  };
};

export default function SummarizePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, hydrated, isDirty, isUpdating, updateBudget, clearDirty } = useBudgetSession();
  const budgetId = session?.budgetId;
  const readyForSummary = session?.readyForSummary ?? false;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showEditors, setShowEditors] = useState(false);

  // Get foundational context from session
  const foundationalContext = session?.foundationalContext as FoundationalContext | null | undefined;

  useEffect(() => {
    if (hydrated && !budgetId) {
      router.replace('/upload');
    }
  }, [budgetId, hydrated, router]);

  const summaryQuery = useQuery({
    queryKey: ['summary-and-suggestions', budgetId],
    queryFn: () => fetchSummaryAndSuggestions(budgetId!),
    enabled: Boolean(budgetId && readyForSummary),
    staleTime: 30_000,
  });

  // Fetch budget model for editing
  const budgetQuery = useQuery({
    queryKey: ['budget-model', budgetId],
    queryFn: async () => {
      const response = await fetch(`/api/budget/${budgetId}`);
      if (!response.ok) throw new Error('Failed to fetch budget');
      return response.json();
    },
    enabled: Boolean(budgetId && readyForSummary),
    staleTime: 60_000,
  });

  // Handle refresh suggestions after edits
  const handleRefreshSuggestions = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['summary-and-suggestions', budgetId] });
      await queryClient.invalidateQueries({ queryKey: ['budget-model', budgetId] });
      clearDirty();
    } finally {
      setIsRefreshing(false);
    }
  }, [budgetId, queryClient, clearDirty]);

  // Handle budget updates
  const handleIncomeChange = useCallback(
    async (updates: PatchIncomeEntry[]) => {
      await updateBudget({ income: updates });
      queryClient.invalidateQueries({ queryKey: ['budget-model', budgetId] });
    },
    [updateBudget, budgetId, queryClient]
  );

  const handleExpenseChange = useCallback(
    async (updates: PatchExpenseEntry[]) => {
      await updateBudget({ expenses: updates });
      queryClient.invalidateQueries({ queryKey: ['budget-model', budgetId] });
    },
    [updateBudget, budgetId, queryClient]
  );

  const handleDebtChange = useCallback(
    async (updates: PatchDebtEntry[]) => {
      await updateBudget({ debts: updates });
      queryClient.invalidateQueries({ queryKey: ['budget-model', budgetId] });
    },
    [updateBudget, budgetId, queryClient]
  );

  const handlePreferenceChange = useCallback(
    async (updates: Partial<BudgetPreferences>) => {
      // Convert camelCase to snake_case for API
      const apiUpdates: Record<string, unknown> = {};
      if (updates.optimizationFocus !== undefined) apiUpdates.optimization_focus = updates.optimizationFocus;
      if (updates.protectEssentials !== undefined) apiUpdates.protect_essentials = updates.protectEssentials;
      if (updates.maxDesiredChangePerCategory !== undefined) apiUpdates.max_desired_change_per_category = updates.maxDesiredChangePerCategory;
      await updateBudget({ preferences: apiUpdates as Partial<BudgetPreferences> });
      queryClient.invalidateQueries({ queryKey: ['budget-model', budgetId] });
    },
    [updateBudget, budgetId, queryClient]
  );

  const handleQueryChange = useCallback(
    async (query: string) => {
      await updateBudget({ userQuery: query });
    },
    [updateBudget]
  );

  const handleAskAnotherQuestion = useCallback(() => {
    router.push('/clarify');
  }, [router]);

  // Extract model data for editors (API returns snake_case)
  const budgetModel = budgetQuery.data?.model as RawBudgetModel | undefined;

  const isAIPowered = summaryQuery.data?.providerMetadata?.suggestionProvider === 'openai' 
    && !summaryQuery.data?.providerMetadata?.usedDeterministic;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Loading state */}
      {summaryQuery.isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Analyzing your budget and preparing personalized insights…
              </p>
            </div>
            {/* Loading skeleton for new layout */}
            <div className="mt-6 space-y-4">
              <Skeleton className="h-12" /> {/* Profile bar */}
              <Skeleton className="h-48" /> {/* Answer card */}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Skeleton className="h-96" /> {/* Suggestions */}
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-40" /> {/* Budget snapshot */}
                  <Skeleton className="h-48" /> {/* Projected impact */}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {summaryQuery.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Unable to load results</p>
              <p className="mt-1 text-sm text-destructive/80">
                Something went wrong while loading your results. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => summaryQuery.refetch()}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results - Phase 9.5 Redesigned Layout */}
      {summaryQuery.data ? (
        <div className="flex flex-col gap-6">
          {/* Dirty state indicator and refresh button */}
          {isDirty && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <Badge variant="warning" className="gap-1">
                    <Pencil className="h-3 w-3" />
                    Changes Made
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    You&apos;ve made changes. Refresh to update your suggestions.
                  </p>
                </div>
                <Button
                  onClick={handleRefreshSuggestions}
                  disabled={isRefreshing}
                  className="gap-2 w-full sm:w-auto"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh Suggestions
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Profile Context Bar */}
          <ProfileContextBar foundationalContext={foundationalContext} />

          {/* The Answer Card - Hero element */}
          <AnswerCard
            userQuery={summaryQuery.data.userQuery}
            executiveSummary={summaryQuery.data.executiveSummary}
            isAIPowered={isAIPowered}
          />

          {/* Main content: 2-column on desktop, stacked on mobile */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column: Suggestions (main content) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Editable Query Section */}
              <EditableQuerySection
                query={summaryQuery.data.userQuery}
                disabled={isUpdating || isRefreshing}
                onQueryChange={handleQueryChange}
              />

              {/* Toggle editors button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEditors(!showEditors)}
                  className="gap-2"
                >
                  <Pencil className="h-3 w-3" />
                  {showEditors ? 'Hide Budget Details' : 'Edit Budget Details'}
                </Button>
              </div>

              {/* Editable Budget Section (collapsible) */}
              {showEditors && budgetModel && (
                <EditableBudgetSection
                  income={budgetModel.income.map((inc) => ({
                    id: inc.id,
                    name: inc.name,
                    monthlyAmount: inc.monthly_amount,
                    type: inc.type,
                    stability: inc.stability,
                  }))}
                  expenses={budgetModel.expenses.map((exp) => ({
                    id: exp.id,
                    category: exp.category,
                    monthlyAmount: exp.monthly_amount,
                    essential: exp.essential,
                    notes: exp.notes,
                  }))}
                  debts={budgetModel.debts.map((debt) => ({
                    id: debt.id,
                    name: debt.name,
                    balance: debt.balance,
                    interestRate: debt.interest_rate,
                    minPayment: debt.min_payment,
                    priority: debt.priority,
                    approximate: debt.approximate,
                  }))}
                  preferences={{
                    optimizationFocus: budgetModel.preferences.optimization_focus,
                    protectEssentials: budgetModel.preferences.protect_essentials,
                    maxDesiredChangePerCategory: budgetModel.preferences.max_desired_change_per_category,
                  }}
                  disabled={isUpdating || isRefreshing}
                  onIncomeChange={handleIncomeChange}
                  onExpenseChange={handleExpenseChange}
                  onDebtChange={handleDebtChange}
                  onPreferenceChange={handlePreferenceChange}
                />
              )}

              {/* Suggestions Section */}
              <SuggestionsSection
                suggestions={summaryQuery.data.suggestions}
                extendedSuggestions={summaryQuery.data.extendedSuggestions}
                providerMetadata={summaryQuery.data.providerMetadata}
                financialPhilosophy={foundationalContext?.financialPhilosophy}
                assumptions={summaryQuery.data.assumptions}
              />
            </div>

            {/* Right column: Supporting info */}
            <div className="space-y-6">
              {/* Budget Snapshot (compact) */}
              <BudgetSnapshotCard
                summary={summaryQuery.data.summary}
                categoryShares={summaryQuery.data.categoryShares}
                compact
              />

              {/* Projected Impact */}
              <ProjectedImpactCard
                summary={summaryQuery.data.summary}
                suggestions={summaryQuery.data.suggestions}
                projectedOutcomes={summaryQuery.data.projectedOutcomes}
              />

              {/* What's Next */}
              <NextActionsCard
                suggestions={summaryQuery.data.suggestions}
                extendedSuggestions={summaryQuery.data.extendedSuggestions}
                onAskAnotherQuestion={handleAskAnotherQuestion}
              />
            </div>
          </div>
        </div>
      ) : (
        !summaryQuery.isLoading &&
        !summaryQuery.isError && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {budgetId
                  ? readyForSummary
                    ? 'Preparing Your Results…'
                    : 'Almost There!'
                  : 'Upload a Budget to Get Started'}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {budgetId
                  ? readyForSummary
                    ? 'Your personalized financial analysis will appear here in just a moment.'
                    : 'Complete the clarification questions to see your personalized results.'
                  : 'Upload your budget file to get started with your financial analysis.'}
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
