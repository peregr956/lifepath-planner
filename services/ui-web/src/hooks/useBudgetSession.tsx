'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { UploadSummaryPreview } from '@/types';

const STORAGE_KEY = 'lifepath-budget-session';

export type BudgetSession = {
  budgetId: string;
  detectedFormat?: string | null;
  summaryPreview?: UploadSummaryPreview | null;
  userQuery?: string | null;
  clarified?: boolean;
  readyForSummary?: boolean;
};

type BudgetSessionContextValue = {
  session: BudgetSession | null;
  hydrated: boolean;
  saveSession: (next: BudgetSession) => void;
  setUserQuery: (query: string) => void;
  markClarified: () => Promise<void>;
  markReadyForSummary: () => Promise<void>;
  clearSession: () => void;
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
    const nextSession = fromUrl ?? storedSession;
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
  }, [persist]);

  const value = useMemo<BudgetSessionContextValue>(
    () => ({
      session,
      hydrated,
      saveSession,
      setUserQuery,
      markClarified,
      markReadyForSummary,
      clearSession,
    }),
    [
      session,
      hydrated,
      saveSession,
      setUserQuery,
      markClarified,
      markReadyForSummary,
      clearSession,
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
