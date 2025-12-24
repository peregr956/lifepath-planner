'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SuggestionsList, SummaryView } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { fetchSummaryAndSuggestions } from '@/utils/apiClient';
import { Card, CardContent, Skeleton } from '@/components/ui';
import { AlertCircle, Loader2, BarChart3 } from 'lucide-react';

export default function SummarizePage() {
  const router = useRouter();
  const { session, hydrated } = useBudgetSession();
  const budgetId = session?.budgetId;
  const readyForSummary = session?.readyForSummary ?? false;

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

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Loading state */}
      {summaryQuery.isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Analyzing your budget and preparing suggestions…
              </p>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Skeleton className="h-[300px]" />
              <Skeleton className="h-[300px]" />
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
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {summaryQuery.data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <SummaryView
              summary={summaryQuery.data.summary}
              categoryShares={summaryQuery.data.categoryShares}
            />
          </div>
          <div>
            <SuggestionsList
              suggestions={summaryQuery.data.suggestions}
              providerMetadata={summaryQuery.data.providerMetadata}
              userQuery={summaryQuery.data.userQuery}
            />
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
