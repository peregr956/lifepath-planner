'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ClarificationAnswers } from '@/types';
import { ClarificationForm, QueryInput } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { fetchClarificationQuestions, submitClarificationAnswers, submitUserQuery } from '@/utils/apiClient';

type ClarifyStep = 'query' | 'questions';

export default function ClarifyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, hydrated, setUserQuery, markClarified, markReadyForSummary } = useBudgetSession();
  const budgetId = session?.budgetId;
  const existingUserQuery = session?.userQuery;

  // Determine initial step based on whether user has already provided a query
  const [step, setStep] = useState<ClarifyStep>(() => 
    existingUserQuery ? 'questions' : 'query'
  );
  const [localUserQuery, setLocalUserQuery] = useState(existingUserQuery || '');

  // Sync step with session when it changes
  useEffect(() => {
    if (existingUserQuery && step === 'query') {
      setStep('questions');
      setLocalUserQuery(existingUserQuery);
    }
  }, [existingUserQuery, step]);

  useEffect(() => {
    if (hydrated && !budgetId) {
      router.replace('/upload');
    }
  }, [budgetId, hydrated, router]);

  // Query submission mutation
  const queryMutation = useMutation({
    mutationFn: async (query: string) => {
      if (!budgetId) {
        throw new Error('Upload a budget before submitting a query.');
      }
      return await submitUserQuery(budgetId, query);
    },
    onSuccess: (response) => {
      setUserQuery(response.query);
      setLocalUserQuery(response.query);
      setStep('questions');
    },
  });

  // Handle query submission
  const handleQuerySubmit = useCallback(
    async (query: string) => {
      await queryMutation.mutateAsync(query);
    },
    [queryMutation]
  );

  // Fetch clarification questions only after user has provided a query
  const clarificationQuery = useQuery({
    queryKey: ['clarification-questions', budgetId, localUserQuery],
    queryFn: () => fetchClarificationQuestions(budgetId!, localUserQuery || undefined),
    enabled: Boolean(budgetId) && step === 'questions',
  });

  useEffect(() => {
    if (!clarificationQuery.data) {
      return;
    }
    if (!clarificationQuery.data.needsClarification) {
      if (!session?.clarified) {
        markClarified();
      }
      router.push('/summarize');
    }
  }, [clarificationQuery.data, markClarified, router, session?.clarified]);

  const submitMutation = useMutation({
    mutationFn: async (answers: ClarificationAnswers) => {
      if (!budgetId) {
        throw new Error('Upload a budget before submitting clarifications.');
      }
      return await submitClarificationAnswers(budgetId, answers);
    },
    onSuccess: async (response) => {
      markClarified();
      if (response.readyForSummary) {
        markReadyForSummary();
      }
      await queryClient.invalidateQueries({ queryKey: ['summary-and-suggestions', budgetId] });
      router.push('/summarize');
    },
  });

  const needsClarification = clarificationQuery.data?.needsClarification ?? true;
  const questions = clarificationQuery.data?.questions ?? [];

  // Render query input step
  if (step === 'query') {
    return (
      <div className="flex flex-col gap-4">
        {queryMutation.isError && (
          <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {queryMutation.error instanceof Error
              ? queryMutation.error.message
              : 'Unable to submit your question. Please try again.'}
          </p>
        )}
        <QueryInput
          onSubmit={handleQuerySubmit}
          disabled={!budgetId}
          isLoading={queryMutation.isPending}
          initialQuery={existingUserQuery || ''}
        />
      </div>
    );
  }

  // Render clarification questions step
  return (
    <div className="flex flex-col gap-4">
      {/* Show user's query as context */}
      {localUserQuery && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">Your Question</p>
          <p className="mt-1 text-sm text-white">&ldquo;{localUserQuery}&rdquo;</p>
          <button
            type="button"
            onClick={() => setStep('query')}
            className="mt-2 text-xs text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
          >
            Edit question
          </button>
        </div>
      )}

      {clarificationQuery.isLoading && (
        <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          Generating personalized questions based on your query…
        </p>
      )}
      {clarificationQuery.isError && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {clarificationQuery.error instanceof Error
            ? clarificationQuery.error.message
            : 'Unable to load clarification questions right now.'}
        </p>
      )}
      {submitMutation.isError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {submitMutation.error instanceof Error ? (
            <div>
              <p className="font-semibold">{submitMutation.error.message}</p>
              {submitMutation.error && typeof submitMutation.error === 'object' && 'payload' in submitMutation.error && 
               typeof (submitMutation.error as any).payload === 'object' && 
               (submitMutation.error as any).payload !== null &&
               'invalid_fields' in (submitMutation.error as any).payload && (
                <ul className="mt-2 list-disc list-inside space-y-1">
                  {Array.isArray((submitMutation.error as any).payload.invalid_fields) &&
                   (submitMutation.error as any).payload.invalid_fields.map((field: any, idx: number) => (
                    <li key={idx}>
                      <span className="font-mono text-xs">{field.field_id}</span>: {field.detail || field.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            'Unable to submit answers. Please try again.'
          )}
        </div>
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
