'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ClarificationAnswerValue,
  ClarificationAnswers,
  ClarificationComponentDescriptor,
  ClarificationQuestion,
} from '@/types';
import { FieldRenderer } from '@/utils/renderField';

type Props = {
  questions: ClarificationQuestion[];
  needsClarification?: boolean;
  disabled?: boolean;
  onSubmit?: (answers: ClarificationAnswers) => Promise<void> | void;
};

export function ClarificationForm({
  questions,
  needsClarification = true,
  disabled = false,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<ClarificationAnswers>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      questions.forEach((question) => {
        question.components.forEach((component) => {
          if (next[component.fieldId] !== undefined) {
            return;
          }
          const defaultValue = deriveDefaultValue(component);
          if (defaultValue !== undefined) {
            next[component.fieldId] = defaultValue;
          }
        });
      });
      return next;
    });
  }, [questions]);

  const preparedAnswers = useMemo<ClarificationAnswers>(() => {
    const next: ClarificationAnswers = {};
    Object.entries(values).forEach(([fieldId, value]) => {
      if (value !== undefined) {
        next[fieldId] = value;
      }
    });
    return next;
  }, [values]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      await onSubmit?.(preparedAnswers);
      setStatus('success');
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Unable to submit right now.'
      );
      setStatus('idle');
    }
  }

  function handleChange(fieldId: string, value: ClarificationAnswerValue | undefined) {
    setValues((prev) => {
      if (value === undefined) {
        if (!(fieldId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[fieldId];
        return next;
      }
      return {
        ...prev,
        [fieldId]: value,
      };
    });
    setStatus('idle');
  }

  const noQuestionsAvailable = !needsClarification || questions.length === 0;

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-6" aria-label="clarification form">
      <div>
        <h2 className="text-xl font-semibold text-white">Clarifications</h2>
        <p className="mt-1 text-sm text-white/70">
          Fill in the gaps so the clarification service can normalize the budget data faster.
        </p>
      </div>

      {noQuestionsAvailable ? (
        <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
          No outstanding questions right now. Upload a budget to generate follow-up prompts.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {questions.map((question) => (
            <div key={question.id} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white">
              <div>
                <p className="font-medium">{question.prompt}</p>
                {question.description && (
                  <p className="mt-1 text-xs text-white/60">{question.description}</p>
                )}
              </div>

              <div className="flex flex-col gap-4">
                {question.components.map((component) => (
                  <label key={component.fieldId} className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
                      {component.label}
                    </span>
                    <FieldRenderer
                      component={component}
                      value={values[component.fieldId]}
                      onChange={(value) => handleChange(component.fieldId, value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
          disabled={status === 'submitting' || noQuestionsAvailable || disabled}
        >
          {status === 'submitting' ? 'Submitting…' : 'Send clarifications'}
        </button>
      </div>
    </form>
  );
}

function deriveDefaultValue(component: ClarificationComponentDescriptor): ClarificationAnswerValue | undefined {
  switch (component.component) {
    case 'number_input':
    case 'slider':
      return component.constraints?.default;
    case 'dropdown':
      return component.constraints?.default;
    case 'toggle':
      return component.constraints?.default;
    default:
      return undefined;
  }
}
