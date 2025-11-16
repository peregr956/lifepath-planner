'use client';

import type { ClarificationAnswerValue, ClarificationComponentDescriptor } from '@/types';

type Props = {
  component: ClarificationComponentDescriptor;
  value?: ClarificationAnswerValue;
  onChange: (value: ClarificationAnswerValue | undefined) => void;
};

const baseInputStyles =
  'w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

export function FieldRenderer({ component, value, onChange }: Props) {
  switch (component.component) {
    case 'number_input': {
      const constraints = component.constraints;
      const resolvedValue = typeof value === 'number' ? value : '';
      return (
        <input
          id={component.fieldId}
          type="number"
          className={baseInputStyles}
          value={resolvedValue}
          min={constraints?.minimum}
          max={constraints?.maximum}
          step={constraints?.step}
          placeholder={constraints?.unit ? `Value (${constraints.unit})` : undefined}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (!nextValue.length) {
              onChange(undefined);
              return;
            }
            onChange(Number(nextValue));
          }}
        />
      );
    }
    case 'dropdown': {
      const resolvedValue = typeof value === 'string' ? value : '';
      return (
        <select
          id={component.fieldId}
          className={baseInputStyles}
          value={resolvedValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue.length ? nextValue : undefined);
          }}
        >
          <option value="">Select…</option>
          {component.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    case 'toggle': {
      const resolvedValue = typeof value === 'boolean' ? value : component.constraints?.default ?? false;
      return (
        <input
          id={component.fieldId}
          type="checkbox"
          className="h-4 w-4 rounded border-white/40 bg-white/5 text-indigo-500 focus:ring-2 focus:ring-indigo-400"
          checked={resolvedValue}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    }
    case 'slider': {
      const constraints = component.constraints;
      const min = constraints?.minimum ?? 0;
      const max = constraints?.maximum ?? 100;
      const step = constraints?.step ?? 1;
      const resolvedValue =
        typeof value === 'number'
          ? value
          : constraints?.default ?? Math.round((min + max) / 2);

      return (
        <div className="flex flex-col gap-2">
          <input
            id={component.fieldId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={resolvedValue}
            onChange={(event) => onChange(Number(event.target.value))}
            className="accent-indigo-400"
          />
          <div className="flex justify-between text-xs text-white/60">
            <span>
              {min}
              {constraints?.unit}
            </span>
            <span className="font-semibold text-white">
              {resolvedValue}
              {constraints?.unit}
            </span>
            <span>
              {max}
              {constraints?.unit}
            </span>
          </div>
        </div>
      );
    }
  }

  return null;
}
