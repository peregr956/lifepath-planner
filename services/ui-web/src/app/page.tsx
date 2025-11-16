'use client';

import { useState } from 'react';
import {
  ClarificationForm,
  SuggestionsList,
  SummaryView,
  UploadBudget,
} from '@/components';
import {
  fetchClarificationQuestions,
  fetchSummaryAndSuggestions,
  submitClarificationAnswers,
  useApiBase,
} from '@/utils/apiClient';
import type {
  BudgetSuggestion,
  BudgetSummary,
  ClarificationAnswers,
  ClarificationQuestion,
  UploadBudgetResponse,
} from '@/types';

export default function Page() {
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [needsClarification, setNeedsClarification] = useState(true);
  const [clarificationLoading, setClarificationLoading] = useState(false);
  const [clarificationError, setClarificationError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [categoryShares, setCategoryShares] = useState<Record<string, number>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);
  const { activeApiBase } = useApiBase();

  async function handleBudgetUploaded(response: UploadBudgetResponse) {
    setBudgetId(response.budgetId);
    await loadClarificationQuestions(response.budgetId);
  }

  async function loadClarificationQuestions(currentBudgetId: string) {
    setClarificationLoading(true);
    setClarificationError(null);
    setQuestions([]);
    setNeedsClarification(true);
    setSummary(null);
    setCategoryShares({});
    setSuggestions([]);

    try {
      const data = await fetchClarificationQuestions(currentBudgetId);
      setQuestions(data.questions);
      setNeedsClarification(data.needsClarification);
      if (!data.needsClarification) {
        await loadSummary(currentBudgetId);
      }
    } catch (error) {
      setClarificationError(
        error instanceof Error
          ? error.message
          : 'Unable to load clarification questions from the gateway.'
      );
    } finally {
      setClarificationLoading(false);
    }
  }

  async function handleClarifications(answers: ClarificationAnswers) {
    if (!budgetId) {
      throw new Error('Upload a budget before submitting clarifications.');
    }

    try {
      await submitClarificationAnswers(budgetId, answers);
      setNeedsClarification(false);
      await loadSummary(budgetId);
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : 'Unable to submit clarification answers.'
      );
      throw error;
    }
  }

  async function loadSummary(currentBudgetId: string) {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await fetchSummaryAndSuggestions(currentBudgetId);
      setSummary(data.summary);
      setCategoryShares(data.categoryShares);
      setSuggestions(data.suggestions);
    } catch (error) {
      setSummary(null);
      setCategoryShares({});
      setSuggestions([]);
      setSummaryError(
        error instanceof Error ? error.message : 'Unable to load the summary right now.'
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 lg:py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.4em] text-indigo-200">AI budget suite</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Clarify, normalize, optimize.</h1>
        <p className="text-white/70">
          Upload raw budget exports, answer clarifying questions, and review optimization suggestions
          powered by the rest of this monorepo&apos;s services.
        </p>
        <p className="text-xs text-white/50">Active gateway: {activeApiBase}</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <UploadBudget onUploaded={handleBudgetUploaded} />
        <div className="flex flex-col gap-3">
          {summaryLoading && (
            <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
              Generating summary and suggestions…
            </p>
          )}
          {summaryError && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {summaryError}
            </p>
          )}
          {summary ? (
            <SummaryView summary={summary} categoryShares={categoryShares} />
          ) : (
            <div className="card">
              <p className="text-sm text-white/70">
                Upload a budget and complete clarification prompts to unlock the summary view.
              </p>
            </div>
          )}
          {budgetId && (
            <p className="text-xs text-white/50">Current budget ID: {budgetId}</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {clarificationError && (
            <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {clarificationError}
            </p>
          )}
          <ClarificationForm
            questions={questions}
            needsClarification={needsClarification}
            disabled={!budgetId || clarificationLoading}
            onSubmit={handleClarifications}
          />
        </div>
        <div className="flex flex-col gap-3">
          {summaryLoading && (
            <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
              Loading suggestions…
            </p>
          )}
          <SuggestionsList suggestions={suggestions} />
        </div>
      </section>
    </main>
  );
}
