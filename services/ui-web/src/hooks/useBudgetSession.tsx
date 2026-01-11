'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { 
  UploadSummaryPreview, 
  UnifiedBudgetModel, 
  BudgetPreferences, 
  FoundationalContext,
  HydratedFoundationalContext,
} from '@/types';
import { 
  getPlainFoundationalContext, 
  isFieldFromAccount,
  getHydratedCompletionPercent,
} from '@/types/budget';
import {
  hydrateFromAccountProfile,
  mergeSessionExplicit,
  fromPlainFoundationalContext,
  hasAccountHydratedFields,
  type ApiUserProfile,
} from '@/lib/sessionHydration';

const STORAGE_KEY = 'lifepath-budget-session';

export type BudgetSession = {
  budgetId: string;
  detectedFormat?: string | null;
  summaryPreview?: UploadSummaryPreview | null;
  userQuery?: string | null;
  clarified?: boolean;
  readyForSummary?: boolean;
  // Phase 8.5.3: Foundational context from pre-clarification questions
  // Legacy: plain context without source tracking
  foundationalContext?: FoundationalContext | null;
  foundationalCompleted?: boolean;
  // Phase 9.1.2: Hydrated context with source tracking (account vs session_explicit)
  hydratedFoundationalContext?: HydratedFoundationalContext | null;
  // Phase 9.1.2: Track if profile hydration has been attempted
  profileHydrated?: boolean;
};

// Types for budget updates
export type PatchIncomeEntry = {
  id: string;
  name?: string;
  monthly_amount?: number;
  type?: 'earned' | 'passive' | 'transfer';
  stability?: 'stable' | 'variable' | 'seasonal';
};

export type PatchExpenseEntry = {
  id: string;
  category?: string;
  monthly_amount?: number;
  essential?: boolean | null;
  notes?: string | null;
};

export type PatchDebtEntry = {
  id: string;
  name?: string;
  balance?: number;
  interest_rate?: number;
  min_payment?: number;
  priority?: 'high' | 'medium' | 'low';
  approximate?: boolean;
};

export type BudgetPatchRequest = {
  income?: PatchIncomeEntry[];
  expenses?: PatchExpenseEntry[];
  debts?: PatchDebtEntry[];
  preferences?: Partial<BudgetPreferences>;
  userQuery?: string;
  userProfile?: Record<string, unknown>;
};

type BudgetSessionContextValue = {
  session: BudgetSession | null;
  hydrated: boolean;
  isDirty: boolean;
  isUpdating: boolean;
  saveSession: (next: BudgetSession) => void;
  setUserQuery: (query: string) => void;
  markClarified: () => Promise<void>;
  markReadyForSummary: () => Promise<void>;
  clearSession: () => void;
  // Phase 4.6: Inline editing mutations
  updateBudget: (updates: BudgetPatchRequest) => Promise<void>;
  markDirty: () => void;
  clearDirty: () => void;
  // Phase 8.5.3: Foundational context management
  setFoundationalContext: (context: FoundationalContext) => void;
  markFoundationalCompleted: () => void;
  // Phase 9.1.2: Session hydration from account profile
  hydratedContext: HydratedFoundationalContext | null;
  isProfileHydrating: boolean;
  profileHydrationComplete: boolean;
  hydrateFromProfile: () => Promise<void>;
  isFieldFromAccountProfile: (field: keyof HydratedFoundationalContext) => boolean;
  getProfileCompletionPercent: () => number;
  hasHydratedFields: boolean;
};

const BudgetSessionContext = createContext<BudgetSessionContextValue | undefined>(undefined);

export function BudgetSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // useSearchParams must be used in a component wrapped in Suspense
  // This is handled by the layout.tsx file
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const [session, setSession] = useState<BudgetSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Phase 4.6: Track dirty state and update status
  const [isDirty, setIsDirty] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Phase 9.1.2: Profile hydration state
  const { data: authSession, status: authStatus } = useSession();
  const [isProfileHydrating, setIsProfileHydrating] = useState(false);
  const [profileHydrationComplete, setProfileHydrationComplete] = useState(false);
  const hydrationAttemptedRef = useRef(false);

  const persist = useCallback((value: BudgetSession | null) => {
    if (typeof window === 'undefined') return;
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const updateUrl = useCallback(
    (value: BudgetSession | null) => {
      const params = new URLSearchParams(searchParams.toString());
      [
        'budget_id',
        'format',
        'income_lines',
        'expense_lines',
        'clarified',
        'ready_for_summary',
      ].forEach((key) => params.delete(key));
      if (value) {
        params.set('budget_id', value.budgetId);
        if (value.detectedFormat) {
          params.set('format', value.detectedFormat);
        }
        if (value.summaryPreview) {
          params.set('income_lines', String(value.summaryPreview.detectedIncomeLines ?? 0));
          params.set('expense_lines', String(value.summaryPreview.detectedExpenseLines ?? 0));
        }
        if (value.clarified) {
          params.set('clarified', '1');
        }
        if (value.readyForSummary) {
          params.set('ready_for_summary', '1');
        }
      }
      const query = params.toString();
      const nextUrl = query.length ? `${pathname}?${query}` : pathname;
      router.replace(nextUrl as any, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    const storedSession = storedValue ? safeParseSession(storedValue) : null;
    const fromUrl = parseSessionFromString(searchParamsString);
    
    // Phase 9.1.5: Merge URL params with stored session instead of replacing
    // This preserves foundationalContext, hydratedFoundationalContext, and profileHydrated
    // which are not represented in URL params
    let nextSession: BudgetSession | null = null;
    if (fromUrl && storedSession && fromUrl.budgetId === storedSession.budgetId) {
      // Same budget: merge URL params over stored session, preserving context fields
      nextSession = {
        ...storedSession,
        ...fromUrl,
        // Explicitly preserve context fields that URL doesn't have
        foundationalContext: storedSession.foundationalContext,
        hydratedFoundationalContext: storedSession.hydratedFoundationalContext,
        foundationalCompleted: storedSession.foundationalCompleted,
        profileHydrated: storedSession.profileHydrated,
      };
    } else if (fromUrl) {
      // Different budget or no stored session: use URL session
      nextSession = fromUrl;
    } else {
      // No URL session: use stored session
      nextSession = storedSession;
    }
    
    if (nextSession) {
      setSession(nextSession);
      persist(nextSession);
    } else {
      setSession(null);
      persist(null);
    }
    setHydrated(true);
  }, [persist, searchParamsString]);

  // Sync URL when session changes (but not during initial hydration)
  useEffect(() => {
    if (!hydrated) return;
    // Only update URL if it doesn't match the current session
    const currentUrlSession = parseSessionFromString(searchParamsString);
    const sessionMatchesUrl =
      (!session && !currentUrlSession) ||
      (session &&
        currentUrlSession &&
        session.budgetId === currentUrlSession.budgetId &&
        session.clarified === currentUrlSession.clarified &&
        session.readyForSummary === currentUrlSession.readyForSummary &&
        session.detectedFormat === currentUrlSession.detectedFormat);
    if (!sessionMatchesUrl) {
      updateUrl(session);
    }
  }, [session, hydrated, searchParamsString, updateUrl]);

  const saveSession = useCallback(
    (value: BudgetSession) => {
      const nextSession = {
        ...value,
        clarified: value.clarified ?? false,
      };
      setSession(nextSession);
      persist(nextSession);
    },
    [persist],
  );

  const markClarified = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      setSession((prev) => {
        if (!prev) {
          resolve();
          return prev;
        }
        const nextSession = { ...prev, clarified: true };
        persist(nextSession);
        // Resolve after state update is scheduled
        queueMicrotask(resolve);
        return nextSession;
      });
    });
  }, [persist]);

  const markReadyForSummary = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      setSession((prev) => {
        if (!prev) {
          resolve();
          return prev;
        }
        const nextSession = { ...prev, readyForSummary: true };
        persist(nextSession);
        // Resolve after state update is scheduled
        queueMicrotask(resolve);
        return nextSession;
      });
    });
  }, [persist]);

  const setUserQuery = useCallback(
    (query: string) => {
      setSession((prev) => {
        if (!prev) return prev;
        const nextSession = { ...prev, userQuery: query };
        persist(nextSession);
        return nextSession;
      });
    },
    [persist],
  );

  const clearSession = useCallback(() => {
    setSession(null);
    persist(null);
    setIsDirty(false);
  }, [persist]);

  // Phase 4.6: Update budget via PATCH API
  const updateBudget = useCallback(
    async (updates: BudgetPatchRequest): Promise<void> => {
      if (!session?.budgetId) {
        throw new Error('No active budget session');
      }

      setIsUpdating(true);
      try {
        const response = await fetch(`/api/budget/${session.budgetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.details || 'Failed to update budget');
        }

        // Update local session if query changed
        if (updates.userQuery !== undefined) {
          setSession((prev) => {
            if (!prev) return prev;
            const nextSession = { ...prev, userQuery: updates.userQuery };
            persist(nextSession);
            return nextSession;
          });
        }

        // Mark as dirty so user knows to refresh suggestions
        setIsDirty(true);
      } finally {
        setIsUpdating(false);
      }
    },
    [session?.budgetId, persist]
  );

  // Phase 4.6: Manual dirty state control
  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const clearDirty = useCallback(() => {
    setIsDirty(false);
  }, []);

  // Phase 8.5.3: Set foundational context
  // Phase 9.1.2: Updated to also track source as session_explicit
  // Phase 9.1.5: Also sync to server so API routes have the context
  const setFoundationalContext = useCallback(
    (context: FoundationalContext) => {
      setSession((prev) => {
        if (!prev) return prev;
        
        // Update plain foundational context for backwards compatibility
        const mergedPlain = {
          ...prev.foundationalContext,
          ...context,
        };

        // Phase 9.1.2: Also update hydrated context, marking new values as session_explicit
        const updatedHydrated = mergeSessionExplicit(
          prev.hydratedFoundationalContext ?? {},
          context
        );

        const nextSession = { 
          ...prev, 
          foundationalContext: mergedPlain,
          hydratedFoundationalContext: updatedHydrated,
        };
        persist(nextSession);
        
        // Phase 9.1.5: Sync to server in the background
        // Convert to snake_case for API
        const apiContext: Record<string, unknown> = {};
        if (context.financialPhilosophy !== undefined) apiContext.financial_philosophy = context.financialPhilosophy;
        if (context.riskTolerance !== undefined) apiContext.risk_tolerance = context.riskTolerance;
        if (context.primaryGoal !== undefined) apiContext.primary_goal = context.primaryGoal;
        if (context.goalTimeline !== undefined) apiContext.goal_timeline = context.goalTimeline;
        if (context.lifeStage !== undefined) apiContext.life_stage = context.lifeStage;
        if (context.hasEmergencyFund !== undefined) apiContext.has_emergency_fund = context.hasEmergencyFund;
        
        if (Object.keys(apiContext).length > 0) {
          fetch(`/api/budget/${prev.budgetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ foundationalContext: apiContext }),
          }).catch((err) => {
            console.warn('[useBudgetSession] Failed to sync foundational context to server:', err);
          });
        }
        
        return nextSession;
      });
    },
    [persist]
  );

  // Phase 8.5.3: Mark foundational questions as completed
  const markFoundationalCompleted = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const nextSession = { ...prev, foundationalCompleted: true };
      persist(nextSession);
      return nextSession;
    });
  }, [persist]);

  // Phase 9.1.2: Fetch user profile and hydrate session
  const hydrateFromProfile = useCallback(async (): Promise<void> => {
    // Only hydrate if authenticated
    if (authStatus !== 'authenticated' || !authSession?.user) {
      return;
    }

    setIsProfileHydrating(true);
    try {
      const response = await fetch('/api/user/profile');
      if (!response.ok) {
        console.warn('[useBudgetSession] Failed to fetch profile for hydration');
        return;
      }

      const data = await response.json();
      const profile: ApiUserProfile | null = data.profile;

      if (!profile) {
        return;
      }

      // Hydrate foundational context from account profile
      const hydratedFromProfile = hydrateFromAccountProfile(profile);

      setSession((prev) => {
        if (!prev) return prev;

        // If session already has hydrated context, merge with profile defaults
        // Session-explicit values take precedence
        let finalHydrated: HydratedFoundationalContext;

        if (prev.hydratedFoundationalContext) {
          // Merge: keep session-explicit values, fill gaps with account values
          finalHydrated = { ...hydratedFromProfile };
          const existingFields = Object.keys(prev.hydratedFoundationalContext) as (keyof HydratedFoundationalContext)[];
          for (const field of existingFields) {
            const existing = prev.hydratedFoundationalContext[field];
            if (existing && existing.source === 'session_explicit') {
              // Session-explicit takes precedence
              finalHydrated[field] = existing as any;
            }
          }
        } else if (prev.foundationalContext) {
          // Migrate legacy foundational context to hydrated format
          // These are session-explicit since user set them before hydration existed
          const legacyHydrated = fromPlainFoundationalContext(prev.foundationalContext, 'session_explicit');
          // Merge: session-explicit takes precedence over account
          finalHydrated = { ...hydratedFromProfile };
          const existingFields = Object.keys(legacyHydrated) as (keyof HydratedFoundationalContext)[];
          for (const field of existingFields) {
            const existing = legacyHydrated[field];
            if (existing?.value !== null && existing?.value !== undefined) {
              finalHydrated[field] = existing as any;
            }
          }
        } else {
          // No existing context, use hydrated from profile
          finalHydrated = hydratedFromProfile;
        }

        const nextSession = {
          ...prev,
          hydratedFoundationalContext: finalHydrated,
          profileHydrated: true,
          // Also update plain foundational context for backwards compatibility
          foundationalContext: getPlainFoundationalContext(finalHydrated),
        };
        persist(nextSession);
        return nextSession;
      });
    } catch (error) {
      console.error('[useBudgetSession] Error hydrating from profile:', error);
    } finally {
      setIsProfileHydrating(false);
      setProfileHydrationComplete(true);
    }
  }, [authStatus, authSession, persist]);

  // Phase 9.1.2: Auto-hydrate when authenticated and session exists
  // Phase 9.1.6: Always re-fetch profile to ensure fresh data when user completes profile in Settings
  useEffect(() => {
    // Only attempt hydration once per page load
    if (hydrationAttemptedRef.current) return;
    // Wait for both session hydration and auth to be ready
    if (!hydrated || authStatus === 'loading') return;
    // Only hydrate if we have a session and user is authenticated
    if (!session || authStatus !== 'authenticated') return;

    hydrationAttemptedRef.current = true;
    hydrateFromProfile();
  }, [hydrated, authStatus, session, hydrateFromProfile]);

  // Phase 9.1.2: Helper to check if a field is from account profile
  const isFieldFromAccountProfile = useCallback(
    (field: keyof HydratedFoundationalContext): boolean => {
      return isFieldFromAccount(session?.hydratedFoundationalContext, field);
    },
    [session?.hydratedFoundationalContext]
  );

  // Phase 9.1.2: Get profile completion percent
  const getProfileCompletionPercent = useCallback((): number => {
    return getHydratedCompletionPercent(session?.hydratedFoundationalContext);
  }, [session?.hydratedFoundationalContext]);

  // Phase 9.1.2: Check if any fields are hydrated from account
  const hasHydratedFields = useMemo(
    () => hasAccountHydratedFields(session?.hydratedFoundationalContext),
    [session?.hydratedFoundationalContext]
  );

  const value = useMemo<BudgetSessionContextValue>(
    () => ({
      session,
      hydrated,
      isDirty,
      isUpdating,
      saveSession,
      setUserQuery,
      markClarified,
      markReadyForSummary,
      clearSession,
      updateBudget,
      markDirty,
      clearDirty,
      setFoundationalContext,
      markFoundationalCompleted,
      // Phase 9.1.2: Session hydration from account profile
      hydratedContext: session?.hydratedFoundationalContext ?? null,
      isProfileHydrating,
      profileHydrationComplete,
      hydrateFromProfile,
      isFieldFromAccountProfile,
      getProfileCompletionPercent,
      hasHydratedFields,
    }),
    [
      session,
      hydrated,
      isDirty,
      isUpdating,
      saveSession,
      setUserQuery,
      markClarified,
      markReadyForSummary,
      clearSession,
      updateBudget,
      markDirty,
      clearDirty,
      setFoundationalContext,
      markFoundationalCompleted,
      isProfileHydrating,
      profileHydrationComplete,
      hydrateFromProfile,
      isFieldFromAccountProfile,
      getProfileCompletionPercent,
      hasHydratedFields,
    ],
  );

  return <BudgetSessionContext.Provider value={value}>{children}</BudgetSessionContext.Provider>;
}

export function useBudgetSession(): BudgetSessionContextValue {
  const context = useContext(BudgetSessionContext);
  if (!context) {
    throw new Error('useBudgetSession must be used within a BudgetSessionProvider.');
  }
  return context;
}

function parseSessionFromString(queryString: string): BudgetSession | null {
  if (!queryString) return null;
  const params = new URLSearchParams(queryString);
  return parseSessionFromParams(params);
}

function parseSessionFromParams(params: URLSearchParams): BudgetSession | null {
  const budgetId = params.get('budget_id');
  if (!budgetId) return null;
  const detectedFormat = params.get('format');
  const incomeLines = params.get('income_lines');
  const expenseLines = params.get('expense_lines');
  let summaryPreview: UploadSummaryPreview | null = null;
  if (incomeLines || expenseLines) {
    summaryPreview = {
      detectedIncomeLines: Number(incomeLines ?? '0'),
      detectedExpenseLines: Number(expenseLines ?? '0'),
    };
  }
  const clarifiedParam = params.get('clarified');
  const clarified = clarifiedParam === '1' || clarifiedParam === 'true';
  const readyForSummaryParam = params.get('ready_for_summary');
  const readyForSummary = readyForSummaryParam === '1' || readyForSummaryParam === 'true';
  return {
    budgetId,
    detectedFormat: detectedFormat ?? undefined,
    summaryPreview: summaryPreview ?? undefined,
    clarified,
    readyForSummary: readyForSummary || undefined,
  };
}

function safeParseSession(raw: string): BudgetSession | null {
  try {
    const parsed = JSON.parse(raw) as BudgetSession;
    if (!parsed || typeof parsed !== 'object' || !('budgetId' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
