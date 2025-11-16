'use client';

import { useEffect, useState } from 'react';
import {
  ClarificationForm,
  SuggestionsList,
  SummaryView,
  UploadBudget,
} from '@/components';
import { fetchBudgetSummary, fetchClarificationQuestions, submitClarificationAnswers } from '@/utils/apiClient';
import type { BudgetSuggestion, BudgetSummary, ClarificationAnswer, ClarificationQuestion } from '@/types';

export default function Page() {
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);

  useEffect(() => {
    fetchClarificationQuestions().then(setQuestions);
    fetchBudgetSummary().then(setSummary);
  }, []);

  async function handleClarifications(answers: ClarificationAnswer[]) {
    const result = await submitClarificationAnswers(answers);
    setSuggestions(result);
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
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <UploadBudget />
        {summary && <SummaryView summary={summary} />}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ClarificationForm questions={questions} onSubmit={handleClarifications} />
        <SuggestionsList suggestions={suggestions} />
      </section>
    </main>
  );
}
