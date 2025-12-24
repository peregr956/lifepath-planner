'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { FieldErrors, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { QuestionRenderer } from './QuestionRenderer';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { CheckCircle2, AlertCircle, MessageSquareText } from 'lucide-react';
import type {
  ClarificationAnswerValue,
  ClarificationAnswers,
  ClarificationComponentDescriptor,
  ClarificationNumberInputDescriptor,
  ClarificationQuestion,
  ClarificationSliderDescriptor,
} from '@/types';

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
  const fieldLabels = useMemo(() => buildFieldLabelMap(questions), [questions]);
  const formSchema = useMemo(() => buildClarificationSchema(questions), [questions]);
  const resolver = useMemo(
    () => createFormResolver(formSchema, fieldLabels),
    [fieldLabels, formSchema]
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<FormValues>({
    defaultValues,
    resolver,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  useEffect(() => {
    if (wasSuccessful && isDirty) {
      setWasSuccessful(false);
    }
  }, [isDirty, wasSuccessful, setWasSuccessful]);

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
    <form onSubmit={handleFormSubmit} className="animate-fade-in" aria-label="clarification form">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MessageSquareText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>A few quick questions</CardTitle>
              <CardDescription>
                Help us understand your budget better so we can give you more relevant suggestions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {noQuestionsAvailable ? (
            <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="text-sm text-success">No questions needed right now. You&apos;re all set!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <QuestionRenderer
                    question={question}
                    control={control}
                    disabled={inputsDisabled}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {submitError && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{submitError}</p>
            </div>
          )}

          {/* Success message */}
          {showSuccess && (
            <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              <p className="text-sm text-success">Saved! Preparing your results…</p>
            </div>
          )}

          {/* Submit button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={inputsDisabled || noQuestionsAvailable}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
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

function buildFieldLabelMap(questions: ClarificationQuestion[]): Record<string, string> {
  const labels: Record<string, string> = {};
  questions.forEach((question) => {
    question.components.forEach((component) => {
      labels[component.fieldId] = component.label;
    });
  });
  return labels;
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
      if (component.component === 'slider') {
        const min = component.constraints?.minimum ?? 0;
        const max = component.constraints?.maximum ?? 100;
        const midpoint = Math.round((min + max) / 2);
        return component.constraints?.default ?? midpoint;
      }
      return component.constraints?.default;
    case 'dropdown':
      return component.constraints?.default;
    case 'toggle':
      return component.constraints?.default ?? false;
    default:
      return undefined;
  }
}

type ClarificationSchema = z.ZodObject<Record<string, z.ZodTypeAny>>;
type NumericComponentDescriptor = ClarificationNumberInputDescriptor | ClarificationSliderDescriptor;

function buildClarificationSchema(questions: ClarificationQuestion[]): ClarificationSchema {
  const shape: Record<string, z.ZodTypeAny> = {};
  questions.forEach((question) => {
    question.components.forEach((component) => {
      shape[component.fieldId] = deriveComponentSchema(component);
    });
  });
  return z.object(shape);
}

function createFormResolver(
  schema: ClarificationSchema,
  labels: Record<string, string>
): Resolver<FormValues> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) {
      return {
        values: result.data as FormValues,
        errors: {} as const,
      };
    }

    const errors: FieldErrors<FormValues> = {};
    const flattened = result.error.flatten();
    Object.entries(flattened.fieldErrors).forEach(([fieldId, messages]) => {
      if (messages?.length) {
        errors[fieldId] = {
          type: 'validation',
          message: resolveErrorMessage(messages, labels[fieldId] ?? fieldId),
        };
      }
    });

    return {
      values: {} as Record<string, never>,
      errors,
    };
  };
}

function resolveErrorMessage(messages: string[] | undefined, label: string): string {
  const fallback = `${label} is required.`;
  if (!messages || messages.length === 0) {
    return fallback;
  }
  const message = messages[0];
  if (/invalid input/i.test(message) || /required/i.test(message)) {
    return fallback;
  }
  return message;
}

function deriveComponentSchema(component: ClarificationComponentDescriptor): z.ZodTypeAny {
  const requiredMessage = `${component.label} is required.`;
  switch (component.component) {
    case 'number_input':
      return buildNumberSchema(component, requiredMessage);
    case 'slider':
      return buildNumberSchema(component, requiredMessage);
    case 'dropdown': {
      const options = component.options;
      return z
        .string({ message: `${component.label} must be selected.` })
        .refine((value) => value !== undefined && value !== '', {
          message: requiredMessage,
        })
        .refine((value) => options.includes(value), {
          message: `${component.label} must match one of the provided options.`,
        });
    }
    case 'toggle':
      return z
        .boolean({ message: `${component.label} must be true or false.` })
        .refine((value) => value !== undefined, {
          message: requiredMessage,
        });
    default:
      return z.any();
  }
}

function buildNumberSchema(
  component: NumericComponentDescriptor,
  _requiredMessage: string
): z.ZodTypeAny {
  let schema: z.ZodNumber = z.number({ message: `${component.label} must be a number.` });

  const { constraints } = component;
  if (constraints?.minimum !== undefined) {
    schema = schema.min(
      constraints.minimum,
      `${component.label} must be at least ${constraints.minimum}.`
    );
  }
  if (constraints?.maximum !== undefined) {
    schema = schema.max(
      constraints.maximum,
      `${component.label} must be less than or equal to ${constraints.maximum}.`
    );
  }
  return schema;
}
