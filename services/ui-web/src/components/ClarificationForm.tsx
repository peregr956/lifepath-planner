'use client';

import { useMemo, useState } from 'react';
import type { ClarificationAnswer, ClarificationQuestion } from '@/types';
import { FieldRenderer } from '@/utils/renderField';

type Props = {
  questions: ClarificationQuestion[];
  onSubmit?: (answers: ClarificationAnswer[]) => Promise<void> | void;
};

export function ClarificationForm({ questions, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  const answers = useMemo<ClarificationAnswer[]>(
    () =>
      Object.entries(values).map(([questionId, value]) => ({
        questionId,
        value,
      })),
    [values]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      await onSubmit?.(answers);
      setStatus('success');
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Unable to submit right now.'
      );
      setStatus('idle');
    }
  }

  function handleChange(questionId: string, value: string) {
    setValues((prev) => ({
      ...prev,
      [questionId]: value,
    }));
    setStatus('idle');
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-6" aria-label="clarification form">
      <div>
        <h2 className="text-xl font-semibold text-white">Clarifications</h2>
        <p className="mt-1 text-sm text-white/70">
          Fill in the gaps so the clarification service can normalize the budget data faster.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {questions.map((question) => (
          <label key={question.id} className="flex flex-col gap-2 text-sm text-white">
            <div>
              <span className="font-medium">{question.prompt}</span>
              {question.required && <span className="ml-1 text-red-300">*</span>}
            </div>
            {question.description && (
              <p className="text-xs text-white/60">{question.description}</p>
            )}

            <FieldRenderer
              question={question}
              value={values[question.id]}
              onChange={(value) => handleChange(question.id, value)}
            />
          </label>
        ))}
      </div>

      {error && <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p>}
      {status === 'success' && (
        <p className="rounded bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100">
          Clarifications queued successfully.
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/30"
          disabled={status === 'submitting' || !questions.length}
        >
          {status === 'submitting' ? 'Submitting…' : 'Send clarifications'}
        </button>
      </div>
    </form>
  );
}
