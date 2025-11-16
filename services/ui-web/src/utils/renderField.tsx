'use client';

import { type ComponentProps } from 'react';
import type { ClarificationQuestion } from '@/types';

type Props = {
  question: ClarificationQuestion;
  value?: string;
  onChange: (value: string) => void;
};

export function FieldRenderer({ question, value, onChange }: Props) {
  const baseStyles =
    'w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

  const sharedProps: Pick<ComponentProps<'input'>, 'id' | 'required'> = {
    id: question.id,
    required: question.required,
  };

  switch (question.type) {
    case 'number':
      return (
        <input
          {...sharedProps}
          type="number"
          className={baseStyles}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'select':
      return (
        <select
          {...sharedProps}
          className={baseStyles}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select...</option>
          {(question.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case 'textarea':
      return (
        <textarea
          {...sharedProps}
          rows={4}
          className={`${baseStyles} resize-none`}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <input
          {...sharedProps}
          type="text"
          className={baseStyles}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
