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
  clarified?: boolean;
  readyForSummary?: boolean;
};

type MarkClarifiedOptions = {
  readyForSummary?: boolean;
};

type BudgetSessionContextValue = {
  session: BudgetSession | null;
  hydrated: boolean;
  saveSession: (next: BudgetSession) => void;
  markClarified: (options?: MarkClarifiedOptions) => void;
  clearSession: () => void;
};

const BudgetSessionContext = createContext<BudgetSessionContextValue | undefined>(undefined);

export function BudgetSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
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
      ['budget_id', 'format', 'income_lines', 'expense_lines', 'clarified', 'summary_ready'].forEach((key) =>
        params.delete(key)
      );
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
          params.set('summary_ready', '1');
        }
      }
      const query = params.toString();
      const nextUrl = query.length ? `${pathname}?${query}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    const storedSession = storedValue ? safeParseSession(storedValue) : null;
    const fromUrl = parseSessionFromString(searchParamsString);
    const nextSession = fromUrl ?? storedSession;
    if (nextSession) {
      const normalized = normalizeSession(nextSession);
      setSession(normalized);
      persist(normalized);
    } else {
      setSession(null);
      persist(null);
    }
    setHydrated(true);
  }, [persist, searchParamsString]);

  const saveSession = useCallback(
    (value: BudgetSession) => {
      const nextSession = normalizeSession(value);
      setSession(nextSession);
      persist(nextSession);
      updateUrl(nextSession);
    },
    [persist, updateUrl]
  );

  const markClarified = useCallback(
    (options?: MarkClarifiedOptions) => {
      setSession((prev) => {
        if (!prev) return prev;
        const nextSession = normalizeSession({
          ...prev,
          clarified: true,
          readyForSummary:
            options?.readyForSummary ?? (prev.readyForSummary ?? false),
        });
        persist(nextSession);
        updateUrl(nextSession);
        return nextSession;
      });
    },
    [persist, updateUrl]
  );

  const clearSession = useCallback(() => {
    setSession(null);
    persist(null);
    updateUrl(null);
  }, [persist, updateUrl]);

  const value = useMemo<BudgetSessionContextValue>(
    () => ({
      session,
      hydrated,
      saveSession,
      markClarified,
      clearSession,
    }),
    [session, hydrated, saveSession, markClarified, clearSession]
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
  const summaryReadyParam = params.get('summary_ready');
  const readyForSummary = summaryReadyParam === '1' || summaryReadyParam === 'true';
  return {
    budgetId,
    detectedFormat: detectedFormat ?? undefined,
    summaryPreview: summaryPreview ?? undefined,
    clarified,
    readyForSummary,
  };
}

function safeParseSession(raw: string): BudgetSession | null {
  try {
    const parsed = JSON.parse(raw) as BudgetSession;
    if (!parsed || typeof parsed !== 'object' || !('budgetId' in parsed)) {
      return null;
    }
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

function normalizeSession(session: BudgetSession): BudgetSession {
  return {
    ...session,
    clarified: session.clarified ?? false,
    readyForSummary: session.readyForSummary ?? false,
  };
}
