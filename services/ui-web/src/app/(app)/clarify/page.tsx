'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ClarificationAnswers } from '@/types';
import { ClarificationForm, QueryInput } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import {
  fetchClarificationQuestions,
  submitClarificationAnswers,
  submitUserQuery,
} from '@/utils/apiClient';

type ClarifyStep = 'query' | 'questions';

/**
 * Safe navigation wrapper with retry logic
 */
async function safeNavigate(
  router: ReturnType<typeof useRouter>,
  path: string,
  maxRetries = 2
): Promise<boolean> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      router.push(path);
      return true;
    } catch (error) {
      console.error(`Navigation attempt ${attempt + 1} failed:`, error);
      if (attempt < maxRetries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  return false;
}

export default function ClarifyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, hydrated, setUserQuery, markClarified, markReadyForSummary } =
    useBudgetSession();
  const budgetId = session?.budgetId;
  const existingUserQuery = session?.userQuery;

  // Determine initial step based on whether user has already provided a query
  const [step, setStep] = useState<ClarifyStep>(() => (existingUserQuery ? 'questions' : 'query'));
  const [localUserQuery, setLocalUserQuery] = useState(existingUserQuery || '');
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const isNavigatingRef = useRef(false);

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
    [queryMutation],
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
      // Prevent duplicate navigation attempts
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      
      const navigateToSummary = async () => {
        if (!session?.clarified) {
          await markClarified();
        }
        const success = await safeNavigate(router, '/summarize');
        if (!success) {
          isNavigatingRef.current = false;
          setNavigationError('Unable to navigate to results. Please try clicking the Results step above.');
        }
      };
      navigateToSummary();
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
      // Clear any previous navigation errors
      setNavigationError(null);
      
      // Await session state updates before navigation to ensure state is persisted
      await markClarified();
      if (response.readyForSummary) {
        await markReadyForSummary();
      }
      await queryClient.invalidateQueries({ queryKey: ['summary-and-suggestions', budgetId] });
      
      // Navigate with retry logic
      const success = await safeNavigate(router, '/summarize');
      if (!success) {
        setNavigationError('Your answers were saved, but navigation failed. Please click the Results step above to continue.');
      }
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
            Something went wrong. Please try again.
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
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-300">
            Your Question
          </p>
          <p className="mt-1 text-sm text-white">&ldquo;{localUserQuery}&rdquo;</p>
          <button
            type="button"
            onClick={() => setStep('query')}
            className="mt-2 text-xs text-indigo-300 underline-offset-2 hover:text-indigo-200 hover:underline"
          >
            Edit question
          </button>
        </div>
      )}

      {clarificationQuery.isLoading && (
        <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          Preparing personalized questions for you…
        </p>
      )}
      {clarificationQuery.isError && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          <p className="font-medium">Unable to load questions</p>
          <p className="mt-1 text-red-200/80">
            {clarificationQuery.error instanceof Error
              ? clarificationQuery.error.message
                  .replace(/gateway/gi, 'server')
                  .replace(/clarification/gi, '')
              : 'Something went wrong. Please try again.'}
          </p>
          {clarificationQuery.error instanceof Error &&
            (clarificationQuery.error.message.includes('Unable to reach') ||
              clarificationQuery.error.message.includes('localhost') ||
              clarificationQuery.error.message.includes('127.0.0.1')) && (
              <p className="mt-2 text-xs text-red-200/70">
                Tip: Make sure the API is working correctly. Check Vercel logs for any server-side
                errors. In local development, ensure the server is running.
              </p>
            )}
        </div>
      )}
      {submitMutation.isError && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {submitMutation.error instanceof Error
            ? 'There was a problem saving your answers. Please check your responses and try again.'
            : 'Unable to submit answers. Please try again.'}
        </p>
      )}
      {navigationError && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <p>{navigationError}</p>
          <button
            type="button"
            onClick={() => {
              setNavigationError(null);
              router.push('/summarize');
            }}
            className="mt-2 rounded bg-amber-500/20 px-3 py-1 text-xs font-medium hover:bg-amber-500/30"
          >
            Try again
          </button>
        </div>
      )}
      <ClarificationForm
        questions={questions}
        needsClarification={needsClarification}
        disabled={!budgetId || clarificationQuery.isLoading || submitMutation.isPending}
        onSubmit={async (answers) => {
          await submitMutation.mutateAsync(answers);
        }}
      />
    </div>
  );
}
