'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ClarificationAnswers, SubmitAnswersResponse } from '@/types';
import { ClarificationForm } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { fetchClarificationQuestions, submitClarificationAnswers } from '@/utils/apiClient';

export default function ClarifyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, hydrated, markClarified } = useBudgetSession();
  const budgetId = session?.budgetId;
  const readyForSummary = session?.readyForSummary ?? false;

  useEffect(() => {
    if (hydrated && !budgetId) {
      router.replace('/upload');
    }
  }, [budgetId, hydrated, router]);

  const clarificationQuery = useQuery({
    queryKey: ['clarification-questions', budgetId],
    queryFn: () => fetchClarificationQuestions(budgetId!),
    enabled: Boolean(budgetId),
  });

  useEffect(() => {
    if (!clarificationQuery.data) {
      return;
    }
    if (!clarificationQuery.data.needsClarification) {
      if (!session?.clarified || !readyForSummary) {
        markClarified({ readyForSummary: true });
      }
      router.push('/summarize');
    }
  }, [clarificationQuery.data, markClarified, readyForSummary, router, session?.clarified]);

  const submitMutation = useMutation<SubmitAnswersResponse, Error, ClarificationAnswers>({
    mutationFn: async (answers: ClarificationAnswers) => {
      if (!budgetId) {
        throw new Error('Upload a budget before submitting clarifications.');
      }
      return submitClarificationAnswers(budgetId, answers);
    },
    onSuccess: async (response) => {
      markClarified({ readyForSummary: response.readyForSummary });
      if (response.readyForSummary && budgetId) {
        await queryClient.invalidateQueries({ queryKey: ['summary-and-suggestions', budgetId] });
        router.push('/summarize');
      }
    },
  });

  const needsClarification = clarificationQuery.data?.needsClarification ?? true;
  const questions = clarificationQuery.data?.questions ?? [];

  return (
    <div className="flex flex-col gap-4">
      {clarificationQuery.isLoading && (
        <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          Fetching clarification prompts from the gateway…
        </p>
      )}
      {clarificationQuery.isError && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {clarificationQuery.error instanceof Error
            ? clarificationQuery.error.message
            : 'Unable to load clarification questions right now.'}
        </p>
      )}
      <ClarificationForm
        questions={questions}
        needsClarification={needsClarification}
        disabled={!budgetId || clarificationQuery.isLoading || submitMutation.isPending}
        onSubmit={(answers) => submitMutation.mutateAsync(answers)}
      />
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>
          Once prompts are submitted we automatically persist the clarified state in URL params +
          localStorage so the session can resume in the summary step.
        </span>
        <button
          type="button"
          className="font-semibold text-white underline-offset-4 hover:underline"
          onClick={() => clarificationQuery.refetch()}
        >
          Reload prompts
        </button>
      </div>
    </div>
  );
}
