'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SuggestionsList, SummaryView } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { fetchSummaryAndSuggestions } from '@/utils/apiClient';

export default function SummarizePage() {
  const router = useRouter();
  const { session, hydrated } = useBudgetSession();
  const budgetId = session?.budgetId;

  useEffect(() => {
    if (hydrated && !budgetId) {
      router.replace('/upload');
    }
  }, [budgetId, hydrated, router]);

  const summaryQuery = useQuery({
    queryKey: ['summary-and-suggestions', budgetId],
    queryFn: () => fetchSummaryAndSuggestions(budgetId!),
    enabled: Boolean(budgetId),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-4">
      {summaryQuery.isLoading && (
        <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          Generating summary and AI suggestions…
        </p>
      )}
      {summaryQuery.isError && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {summaryQuery.error instanceof Error
            ? summaryQuery.error.message
            : 'Unable to load the summary right now.'}
        </p>
      )}
      {summaryQuery.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryView summary={summaryQuery.data.summary} categoryShares={summaryQuery.data.categoryShares} />
          <SuggestionsList suggestions={summaryQuery.data.suggestions} />
        </div>
      ) : (
        <div className="card">
          <p className="text-sm text-white/70">
            {budgetId
              ? 'Complete any outstanding clarifications to unlock the summary view.'
              : 'Upload a budget to kick off the pipeline.'}
          </p>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-white underline-offset-4 hover:underline"
          onClick={() => summaryQuery.refetch()}
        >
          Refresh summary
        </button>
      </div>
    </div>
  );
}
