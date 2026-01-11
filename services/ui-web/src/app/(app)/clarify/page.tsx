'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { ClarificationAnswers, FoundationalContext } from '@/types';
import { ClarificationForm, QueryInput, FoundationalQuestions } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import {
  fetchClarificationQuestions,
  submitClarificationAnswers,
  submitUserQuery,
} from '@/utils/apiClient';
import { Card, CardContent, Button, Skeleton, Badge } from '@/components/ui';
import { AlertCircle, Loader2, Pencil, UserCircle, CheckCheck, Settings2 } from 'lucide-react';

// Phase 8.5.3: Added 'foundational' step between query and questions
type ClarifyStep = 'query' | 'foundational' | 'questions';

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
      router.push(path as Parameters<typeof router.push>[0]);
      return true;
    } catch (error) {
      console.error(`Navigation attempt ${attempt + 1} failed:`, error);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  return false;
}

export default function ClarifyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status: authStatus } = useSession();
  const { 
    session, 
    hydrated, 
    setUserQuery, 
    markClarified, 
    markReadyForSummary,
    setFoundationalContext,
    markFoundationalCompleted,
    // Phase 9.1.2: Profile hydration state
    hydratedContext,
    isProfileHydrating,
    profileHydrationComplete,
    getProfileCompletionPercent,
    hasHydratedFields,
  } = useBudgetSession();
  const budgetId = session?.budgetId;
  const existingUserQuery = session?.userQuery;
  const foundationalCompleted = session?.foundationalCompleted;

  // Phase 9.1.2: Check if profile is substantially complete (>= 60%)
  const profileCompletionPercent = useMemo(() => getProfileCompletionPercent(), [getProfileCompletionPercent]);
  const hasSubstantialProfile = profileCompletionPercent >= 60;
  // Phase 9.1.3: Check if profile is fully complete (100%)
  const hasCompleteProfile = profileCompletionPercent === 100;

  // Phase 8.5.3: Determine initial step based on session state
  const [step, setStep] = useState<ClarifyStep>(() => {
    if (existingUserQuery && foundationalCompleted) return 'questions';
    if (existingUserQuery) return 'foundational';
    return 'query';
  });
  const [localUserQuery, setLocalUserQuery] = useState(existingUserQuery || '');
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const isNavigatingRef = useRef(false);
  // Phase 9.1.3: Track if user explicitly chose to edit preferences
  const [userChoseToEdit, setUserChoseToEdit] = useState(false);
  // Phase 9.1.3: Track auto-advance state for complete profiles
  const autoAdvanceAttemptedRef = useRef(false);

  // Sync step with session state changes
  useEffect(() => {
    if (existingUserQuery && step === 'query') {
      // User has query but on query step - advance appropriately
      if (foundationalCompleted) {
        setStep('questions');
      } else {
        setStep('foundational');
      }
      setLocalUserQuery(existingUserQuery);
    }
  }, [existingUserQuery, foundationalCompleted, step]);

  useEffect(() => {
    if (hydrated && !budgetId) {
      router.replace('/upload');
    }
  }, [budgetId, hydrated, router]);

  // Phase 9.1.3: Auto-advance for users with 100% complete profiles
  // Skip foundational step and go directly to questions
  useEffect(() => {
    // Only attempt auto-advance once
    if (autoAdvanceAttemptedRef.current) return;
    // Only for authenticated users with complete profiles
    if (authStatus !== 'authenticated') return;
    // Wait for hydration to complete
    if (!profileHydrationComplete) return;
    // Only when we're on the foundational step
    if (step !== 'foundational') return;
    // Don't auto-advance if user explicitly chose to edit
    if (userChoseToEdit) return;
    // Only if profile is fully complete
    if (!hasCompleteProfile) return;

    autoAdvanceAttemptedRef.current = true;
    
    // Apply current context (from hydrated profile) and advance
    const hydratedPlainContext = hydratedContext 
      ? {
          financialPhilosophy: hydratedContext.financialPhilosophy?.value ?? null,
          riskTolerance: hydratedContext.riskTolerance?.value ?? null,
          primaryGoal: hydratedContext.primaryGoal?.value ?? null,
          goalTimeline: hydratedContext.goalTimeline?.value ?? null,
          lifeStage: hydratedContext.lifeStage?.value ?? null,
          hasEmergencyFund: hydratedContext.hasEmergencyFund?.value ?? null,
        }
      : session?.foundationalContext ?? {};
    
    setFoundationalContext(hydratedPlainContext);
    markFoundationalCompleted();
    setStep('questions');
  }, [
    authStatus,
    profileHydrationComplete,
    step,
    userChoseToEdit,
    hasCompleteProfile,
    hydratedContext,
    session?.foundationalContext,
    setFoundationalContext,
    markFoundationalCompleted,
  ]);

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
      // Phase 8.5.3: Go to foundational questions after query
      setStep('foundational');
    },
  });

  // Phase 8.5.3: Handle foundational questions completion
  const handleFoundationalComplete = useCallback(
    (context: FoundationalContext) => {
      setFoundationalContext(context);
      markFoundationalCompleted();
      setStep('questions');
    },
    [setFoundationalContext, markFoundationalCompleted]
  );

  // Phase 8.5.3: Handle skip foundational questions
  const handleFoundationalSkip = useCallback(() => {
    markFoundationalCompleted();
    setStep('questions');
  }, [markFoundationalCompleted]);

  const handleQuerySubmit = useCallback(
    async (query: string) => {
      await queryMutation.mutateAsync(query);
    },
    [queryMutation]
  );

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
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;

      const navigateToSummary = async () => {
        if (!session?.clarified) {
          await markClarified();
        }
        const success = await safeNavigate(router, '/summarize');
        if (!success) {
          isNavigatingRef.current = false;
          setNavigationError(
            'Unable to navigate to results. Please try clicking the Results step above.'
          );
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
      setNavigationError(null);
      await markClarified();
      if (response.readyForSummary) {
        await markReadyForSummary();
      }
      await queryClient.invalidateQueries({ queryKey: ['summary-and-suggestions', budgetId] });
      const success = await safeNavigate(router, '/summarize');
      if (!success) {
        setNavigationError(
          'Your answers were saved, but navigation failed. Please click the Results step above to continue.'
        );
      }
    },
  });

  const needsClarification = clarificationQuery.data?.needsClarification ?? true;
  const questions = clarificationQuery.data?.questions ?? [];

  // Render query input step
  if (step === 'query') {
    return (
      <div className="flex flex-col gap-4 animate-fade-in">
        {queryMutation.isError && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
          </div>
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

  // Phase 8.5.3: Render foundational questions step
  // Phase 9.1.2: Pass hydrated context with source tracking
  if (step === 'foundational') {
    // Phase 9.1.2: Show loading state while profile is hydrating for authenticated users
    const showHydrationLoading = authStatus === 'authenticated' && isProfileHydrating && !profileHydrationComplete;
    // Phase 9.1.3: Show condensed view only if user has substantial profile AND hasn't explicitly chosen to edit
    const shouldShowCondensed = hasSubstantialProfile && !userChoseToEdit;

    return (
      <div className="flex flex-col gap-4 animate-fade-in">
        {/* Show user's query as context */}
        {localUserQuery && (
          <Card className="border-primary/20 bg-gradient-to-r from-primary/10 to-accent/10">
            <CardContent className="pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Your Question</p>
              <p className="mt-1 text-sm text-foreground">&ldquo;{localUserQuery}&rdquo;</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('query')}
                className="mt-2 h-auto p-0 text-xs text-primary hover:text-primary/80"
              >
                <Pencil className="mr-1 h-3 w-3" />
                Edit question
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Phase 9.1.2: Show loading while hydrating profile */}
        {showHydrationLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Loading your saved preferences…
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <FoundationalQuestions
            initialContext={session?.foundationalContext}
            hydratedContext={hydratedContext}
            onComplete={handleFoundationalComplete}
            onSkip={handleFoundationalSkip}
            disabled={!budgetId}
            showCondensed={shouldShowCondensed}
          />
        )}
      </div>
    );
  }

  // Phase 9.1.3: Handle user choosing to edit preferences from questions step
  const handleEditPreferences = useCallback(() => {
    setUserChoseToEdit(true);
    setStep('foundational');
  }, []);

  // Render clarification questions step
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Show user's query as context */}
      {localUserQuery && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/10 to-accent/10">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Your Question</p>
                <p className="mt-1 text-sm text-foreground">&ldquo;{localUserQuery}&rdquo;</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('query')}
                  className="mt-2 h-auto p-0 text-xs text-primary hover:text-primary/80"
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit question
                </Button>
              </div>
              {/* Phase 9.1.3: Show preferences indicator for users with profiles */}
              {hasHydratedFields && (
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="secondary" className="bg-success/10 text-success border-success/20 text-[10px]">
                    <CheckCheck className="mr-1 h-3 w-3" />
                    Using saved preferences
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEditPreferences}
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                  >
                    <Settings2 className="mr-1 h-3 w-3" />
                    Edit preferences
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {clarificationQuery.isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Preparing personalized questions for you…
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error states */}
      {clarificationQuery.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Unable to load questions</p>
              <p className="mt-1 text-sm text-destructive/80">
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
                  <p className="mt-2 text-xs text-destructive/70">
                    Tip: Make sure the API is working correctly. Check Vercel logs for any
                    server-side errors.
                  </p>
                )}
            </div>
          </div>
        </div>
      )}

      {submitMutation.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">
            There was a problem saving your answers. Please check your responses and try again.
          </p>
        </div>
      )}

      {navigationError && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm text-warning">{navigationError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              setNavigationError(null);
              router.push('/summarize');
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {/* Clarification form */}
      {!clarificationQuery.isLoading && !clarificationQuery.isError && (
        <ClarificationForm
          questions={questions}
          needsClarification={needsClarification}
          disabled={!budgetId || clarificationQuery.isLoading || submitMutation.isPending}
          onSubmit={async (answers) => {
            await submitMutation.mutateAsync(answers);
          }}
        />
      )}
    </div>
  );
}
