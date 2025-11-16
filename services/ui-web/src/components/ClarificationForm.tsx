'use client';

import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import type {
  ClarificationAnswerValue,
  ClarificationAnswers,
  ClarificationComponentDescriptor,
  ClarificationQuestion,
} from '@/types';
import { FieldRenderer } from '@/utils/renderField';

type FormValues = Record<string, ClarificationAnswerValue | undefined>;

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [wasSuccessful, setWasSuccessful] = useState(false);

  const defaultValues = useMemo<FormValues>(() => deriveDefaultValues(questions), [questions]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<FormValues>({
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const handleFormSubmit = handleSubmit(async (values) => {
    const answers = prepareAnswers(values);
    setSubmitError(null);
    setWasSuccessful(false);
    try {
      await onSubmit?.(answers);
      setWasSuccessful(true);
    } catch (submissionError) {
      setSubmitError(
        submissionError instanceof Error ? submissionError.message : 'Unable to submit right now.'
      );
    }
  });

  const inputsDisabled = disabled || !needsClarification || isSubmitting;
  const noQuestionsAvailable = !needsClarification || questions.length === 0;
  const showSuccess = wasSuccessful && !isDirty;

  return (
    <form onSubmit={handleFormSubmit} className="card flex flex-col gap-6" aria-label="clarification form">
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
            <div
              key={question.id}
              className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white"
            >
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
                    <Controller
                      name={component.fieldId}
                      control={control}
                      render={({ field }) => (
                        <FieldRenderer
                          component={component}
                          value={field.value}
                          disabled={inputsDisabled}
                          onChange={(next) => {
                            field.onChange(next);
                            setWasSuccessful(false);
                          }}
                        />
                      )}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {submitError && (
        <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-100">{submitError}</p>
      )}
      {showSuccess && (
        <p className="rounded bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100">
          Clarifications queued successfully.
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/30"
          disabled={inputsDisabled || noQuestionsAvailable}
        >
          {isSubmitting ? 'Submitting…' : 'Send clarifications'}
        </button>
      </div>
    </form>
  );
}

function deriveDefaultValues(questions: ClarificationQuestion[]): FormValues {
  const defaults: FormValues = {};
  questions.forEach((question) => {
    question.components.forEach((component) => {
      const defaultValue = deriveDefaultValue(component);
      defaults[component.fieldId] = defaultValue;
    });
  });
  return defaults;
}

function prepareAnswers(values: FormValues): ClarificationAnswers {
  const answers: ClarificationAnswers = {};
  Object.entries(values).forEach(([fieldId, value]) => {
    if (value !== undefined) {
      answers[fieldId] = value;
    }
  });
  return answers;
}

function deriveDefaultValue(
  component: ClarificationComponentDescriptor
): ClarificationAnswerValue | undefined {
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
