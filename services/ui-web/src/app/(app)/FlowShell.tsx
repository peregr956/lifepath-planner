'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { DeveloperPanel } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';

const steps = [
  {
    key: 'upload',
    label: 'Upload',
    description: 'Share your budget file',
    href: '/upload',
  },
  {
    key: 'clarify',
    label: 'Clarify',
    description: 'Answer a few questions',
    href: '/clarify',
  },
  {
    key: 'summarize',
    label: 'Results',
    description: 'Get personalized suggestions',
    href: '/summarize',
  },
] as const;

type StepKey = (typeof steps)[number]['key'];

export function FlowShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, hydrated, clearSession } = useBudgetSession();

  const hasBudget = Boolean(session?.budgetId);
  const clarificationsDone = Boolean(session?.clarified);

  const stepMeta = useMemo(() => {
    const getCompletion = (key: StepKey) => {
      if (key === 'upload') return hasBudget;
      if (key === 'clarify') return clarificationsDone;
      return false; // Step 3 (Results) is never "complete" in the same way, it's the destination
    };
    return steps.map((step, index) => {
      const prevStep = index > 0 ? steps[index - 1] : undefined;
      const isActive =
        pathname === step.href || (step.href !== '/upload' && pathname.startsWith(`${step.href}/`));
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
    stepMeta.findIndex((step) => step.isActive),
  );
  const progressPercent = ((activeIndex + 1) / stepMeta.length) * 100;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 lg:py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.4em] text-indigo-200">LifePath Planner</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">
          Get personalized financial guidance
        </h1>
        <p className="text-white/70">
          Upload your budget in the format you already use. We&apos;ll understand it, ask what we
          need, and give you thoughtful suggestions.
        </p>
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

      {/* User-facing session controls */}
      {hydrated && session && (
        <div className="flex justify-end">
          <button
            type="button"
            className="text-xs font-medium text-white/60 underline underline-offset-4 transition hover:text-white"
            onClick={clearSession}
          >
            Start over with a new budget
          </button>
        </div>
      )}

      <section>{children}</section>

      {/* Diagnostics link - visible in all environments for troubleshooting */}
      {process.env.NODE_ENV === 'production' && (
        <div className="flex justify-end">
          <a
            href="/diagnostics"
            className="text-xs font-medium text-white/40 underline-offset-4 transition hover:text-white/60 hover:underline"
          >
            Diagnostics
          </a>
        </div>
      )}

      {/* Developer panel - floating, only visible in dev mode */}
      <DeveloperPanel
        session={
          session
            ? {
                ...session,
                detectedFormat:
                  session.detectedFormat === null ? undefined : session.detectedFormat,
                summaryPreview:
                  session.summaryPreview === null ? undefined : session.summaryPreview,
                userQuery: session.userQuery === null ? undefined : session.userQuery,
              }
            : null
        }
        onClearSession={clearSession}
      />
    </main>
  );
}
