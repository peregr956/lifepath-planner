'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { DeveloperPanel } from '@/components';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { Button, Progress } from '@/components/ui';
import { UserMenu } from '@/components/auth';
import { cn } from '@/lib/utils';
import {
  Upload,
  MessageSquareText,
  TrendingUp,
  Check,
  ChevronRight,
  RotateCcw,
  Settings,
} from 'lucide-react';

const steps = [
  {
    key: 'upload',
    label: 'Upload',
    description: 'Share your budget file',
    href: '/upload',
    icon: Upload,
  },
  {
    key: 'clarify',
    label: 'Clarify',
    description: 'Answer a few questions',
    href: '/clarify',
    icon: MessageSquareText,
  },
  {
    key: 'summarize',
    label: 'Results',
    description: 'Get personalized suggestions',
    href: '/summarize',
    icon: TrendingUp,
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
      return false;
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
    stepMeta.findIndex((step) => step.isActive)
  );
  const progressPercent = ((activeIndex + 1) / stepMeta.length) * 100;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 lg:py-16">
      {/* Header */}
      <header className="flex flex-col gap-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-primary">
                LifePath Planner
              </p>
            </div>
          </Link>

          {/* Quick actions and user menu */}
          <div className="flex items-center gap-3">
            {hydrated && session && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSession}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Start over
              </Button>
            )}
            <UserMenu />
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Get personalized financial guidance
          </h1>
          <p className="mt-2 text-muted-foreground">
            Upload your budget in the format you already use. We&apos;ll understand it, ask what we
            need, and give you thoughtful suggestions.
          </p>
        </div>
      </header>

      {/* Step indicator */}
      <section className="rounded-2xl border border-border bg-card/50 p-4 shadow-lg animate-fade-in-up stagger-1">
        <div className="flex flex-col gap-4">
          {/* Steps */}
          <ol className="grid gap-3 md:grid-cols-3">
            {stepMeta.map((step, index) => {
              const Icon = step.icon;
              const state = step.isComplete ? 'complete' : step.isActive ? 'active' : 'upcoming';

              return (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    aria-disabled={!step.isUnlocked}
                    className={cn(
                      'group relative flex items-center gap-4 rounded-xl border p-4 transition-all duration-200',
                      state === 'complete' &&
                        'border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/10',
                      state === 'active' &&
                        'border-primary bg-primary/10 shadow-md shadow-primary/10',
                      state === 'upcoming' && 'border-border bg-background hover:bg-accent/50',
                      !step.isUnlocked && 'pointer-events-none opacity-50'
                    )}
                    onClick={(event) => {
                      if (!step.isUnlocked) {
                        event.preventDefault();
                      }
                    }}
                  >
                    {/* Step number / check */}
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                        state === 'complete' && 'bg-success text-success-foreground',
                        state === 'active' && 'bg-primary text-primary-foreground',
                        state === 'upcoming' && 'bg-muted text-muted-foreground'
                      )}
                    >
                      {state === 'complete' ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>

                    {/* Step info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            state === 'active' && 'text-foreground',
                            state === 'complete' && 'text-success',
                            state === 'upcoming' && 'text-muted-foreground'
                          )}
                        >
                          {`${index + 1}. ${step.label}`}
                        </span>
                        {state === 'active' && (
                          <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-xs',
                          state === 'active' ? 'text-muted-foreground' : 'text-muted-foreground/70'
                        )}
                      >
                        {step.description}
                      </span>
                    </div>

                    {/* Arrow for navigation hint */}
                    {step.isUnlocked && state !== 'active' && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>

          {/* Progress bar */}
          <Progress
            value={progressPercent}
            className="h-2"
            indicatorClassName="bg-gradient-to-r from-primary to-success transition-all duration-500"
          />
        </div>
      </section>

      {/* Main content */}
      <section className="animate-fade-in-up stagger-2">{children}</section>

      {/* Footer links */}
      <footer className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-4">
          <Link href="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
        </div>

        {/* Diagnostics link */}
        {process.env.NODE_ENV === 'production' && (
          <Link
            href="/diagnostics"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" />
            Diagnostics
          </Link>
        )}
      </footer>

      {/* Developer panel - floating, only visible in dev mode */}
      <DeveloperPanel
        session={
          session
            ? {
                ...session,
                detectedFormat: session.detectedFormat === null ? undefined : session.detectedFormat,
                summaryPreview: session.summaryPreview === null ? undefined : session.summaryPreview,
                userQuery: session.userQuery === null ? undefined : session.userQuery,
              }
            : null
        }
        onClearSession={clearSession}
      />
    </main>
  );
}
