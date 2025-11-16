'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { useApiBase } from '@/utils/apiClient';

const steps = [
  {
    key: 'upload',
    label: 'Upload',
    description: 'Send CSV/XLSX exports',
    href: '/upload',
  },
  {
    key: 'clarify',
    label: 'Clarify',
    description: 'Answer AI follow-ups',
    href: '/clarify',
  },
  {
    key: 'summarize',
    label: 'Summarize',
    description: 'Review AI summary',
    href: '/summarize',
  },
] as const;

type StepKey = (typeof steps)[number]['key'];

export function FlowShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, hydrated, clearSession } = useBudgetSession();
  const { activeApiBase } = useApiBase();

  const hasBudget = Boolean(session?.budgetId);
  const clarificationsDone = Boolean(session?.clarified);

  const stepMeta = useMemo(() => {
    const getCompletion = (key: StepKey) => {
      if (key === 'upload') return hasBudget;
      return clarificationsDone;
    };
    return steps.map((step, index) => {
      const prevStep = steps[index - 1];
      const isActive =
        pathname === step.href || (step.href !== '/' && pathname.startsWith(`${step.href}/`));
      const isComplete = getCompletion(step.key);
      const isUnlocked = !prevStep || getCompletion(prevStep.key as StepKey);
      return {
        ...step,
        isActive,
        isComplete,
        isUnlocked,
      };
    });
  }, [clarificationsDone, hasBudget, pathname]);

  const activeIndex = Math.max(
    0,
    stepMeta.findIndex((step) => step.isActive)
  );
  const progressPercent = ((activeIndex + 1) / stepMeta.length) * 100;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 lg:py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.4em] text-indigo-200">AI budget suite</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Upload → Clarify → Summarize</h1>
        <p className="text-white/70">
          Route budgets through the ingestion, clarification, and optimization services without leaving
          this browser tab.
        </p>
        <p className="text-xs text-white/50">Active gateway: {activeApiBase}</p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-indigo-500/5">
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-4">
            {stepMeta.map((step, index) => {
              const state = step.isComplete ? 'complete' : step.isActive ? 'active' : 'upcoming';
              const statusDot =
                state === 'complete'
                  ? 'bg-emerald-400'
                  : state === 'active'
                    ? 'bg-indigo-400'
                    : 'bg-white/30';
              return (
                <li
                  key={step.key}
                  className="flex flex-1 items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <Link
                    href={step.href}
                    aria-disabled={!step.isUnlocked}
                    className="flex flex-1 items-center gap-3 text-left text-white/80 aria-disabled:cursor-not-allowed aria-disabled:text-white/30"
                    onClick={(event) => {
                      if (!step.isUnlocked) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <span
                      className={`flex h-3 w-3 items-center justify-center rounded-full ${statusDot}`}
                      aria-hidden
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-white">{`${index + 1}. ${
                        step.label
                      }`}</span>
                      <span className="text-xs text-white/60">{step.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {hydrated && session && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white shadow-lg shadow-indigo-500/5">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Budget ID</p>
              <p className="font-semibold text-white">{session.budgetId}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Detected format</p>
              <p className="font-semibold text-white">
                {session.detectedFormat ?? 'Pending gateway response'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Summary preview</p>
              {session.summaryPreview ? (
                <p className="font-semibold text-white">
                  {session.summaryPreview.detectedIncomeLines} income ·{' '}
                  {session.summaryPreview.detectedExpenseLines} expenses
                </p>
              ) : (
                <p className="font-semibold text-white">Waiting for ingestion</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Clarifications</p>
              <p className="font-semibold text-white">
                {session.clarified ? 'Submitted' : 'Outstanding'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="text-xs font-semibold text-white/70 underline underline-offset-4 transition hover:text-white"
              onClick={clearSession}
            >
              Reset session
            </button>
          </div>
        </section>
      )}

      <section>{children}</section>
    </main>
  );
}
