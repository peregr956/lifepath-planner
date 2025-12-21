'use client';

import * as Select from '@radix-ui/react-select';
import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import type {
  ClarificationAnswerValue,
  ClarificationComponentDescriptor,
  ClarificationDropdownDescriptor,
  ClarificationNumberInputDescriptor,
  ClarificationQuestion,
  ClarificationSliderDescriptor,
  ClarificationToggleDescriptor,
} from '@/types';

type QuestionRendererProps<TFieldValues extends FieldValues> = {
  question: ClarificationQuestion;
  control: Control<TFieldValues>;
  disabled?: boolean;
};

export function QuestionRenderer<TFieldValues extends FieldValues>({
  question,
  control,
  disabled = false,
}: QuestionRendererProps<TFieldValues>) {
  return (
    <fieldset
      className="flex flex-col gap-5 rounded-xl border border-white/10 bg-white/5 p-4 text-white"
      aria-describedby={question.description ? `${question.id}-description` : undefined}
    >
      <legend className="space-y-1 text-base font-semibold leading-tight text-white">
        <span>{question.prompt}</span>
        {question.description && (
          <p id={`${question.id}-description`} className="text-sm font-normal text-white/70">
            {question.description}
          </p>
        )}
      </legend>

      <div className="flex flex-col gap-4">
        {question.components.map((component) => (
          <Controller
            key={component.fieldId}
            control={control}
            name={component.fieldId as FieldPath<TFieldValues>}
            render={({ field, fieldState }) => (
              <ComponentField
                component={component}
                value={field.value as ClarificationAnswerValue | undefined}
                onChange={field.onChange}
                disabled={disabled}
                errorMessage={fieldState.error?.message}
              />
            )}
          />
        ))}
      </div>
    </fieldset>
  );
}

type ComponentFieldProps = {
  component: ClarificationComponentDescriptor;
  value?: ClarificationAnswerValue;
  disabled?: boolean;
  errorMessage?: string;
  onChange: (value: ClarificationAnswerValue | undefined) => void;
};

function ComponentField({
  component,
  value,
  onChange,
  disabled,
  errorMessage,
}: ComponentFieldProps) {
  const labelId = `${component.fieldId}-label`;
  const helperId = `${component.fieldId}-helper`;
  const errorId = `${component.fieldId}-error`;
  const descriptionId = component.description ? `${component.fieldId}-description` : undefined;
  const helperText = buildHelperText(component);

  const describedBy = mergeIds([
    descriptionId,
    helperText ? helperId : undefined,
    errorMessage ? errorId : undefined,
  ]);

  return (
    <div
      className="flex flex-col gap-2"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
    >
      <div className="space-y-1">
        <p id={labelId} className="text-xs font-semibold uppercase tracking-wide text-white/70">
          {component.label}
        </p>
        {component.description && (
          <p id={descriptionId} className="text-xs text-white/60">
            {component.description}
          </p>
        )}
        {helperText && (
          <p id={helperId} className="text-xs text-white/50">
            {helperText}
          </p>
        )}
      </div>

      <FieldPrimitive
        component={component}
        value={value}
        onChange={onChange}
        disabled={disabled}
        ariaLabelledBy={labelId}
        ariaDescribedBy={describedBy}
      />

      {errorMessage && (
        <p id={errorId} className="text-xs font-medium text-rose-300">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

type FieldPrimitiveProps = {
  component: ClarificationComponentDescriptor;
  value?: ClarificationAnswerValue;
  disabled?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  onChange: (value: ClarificationAnswerValue | undefined) => void;
};

function FieldPrimitive({
  component,
  value,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
  onChange,
}: FieldPrimitiveProps) {
  switch (component.component) {
    case 'number_input':
      return (
        <NumberInputField
          descriptor={component}
          value={value}
          onChange={onChange}
          disabled={disabled}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
        />
      );
    case 'dropdown':
      return (
        <DropdownField
          descriptor={component}
          value={value}
          onChange={onChange}
          disabled={disabled}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
        />
      );
    case 'toggle':
      return (
        <ToggleField
          descriptor={component}
          value={value}
          onChange={onChange}
          disabled={disabled}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
        />
      );
    case 'slider':
      return (
        <SliderField
          descriptor={component}
          value={value}
          onChange={onChange}
          disabled={disabled}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
        />
      );
    default:
      return null;
  }
}

type BasePrimitiveProps<T extends ClarificationComponentDescriptor> = {
  descriptor: T;
  value?: ClarificationAnswerValue;
  disabled?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  onChange: (value: ClarificationAnswerValue | undefined) => void;
};

function NumberInputField({
  descriptor,
  value,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
  onChange,
}: BasePrimitiveProps<ClarificationNumberInputDescriptor>) {
  const constraints = descriptor.constraints ?? {};
  const resolvedValue = typeof value === 'number' ? value : '';
  const unit = constraints.unit;

  return (
    <div className="relative">
      <input
        id={descriptor.fieldId}
        type="number"
        inputMode="decimal"
        min={constraints.minimum}
        max={constraints.maximum}
        step={constraints.step ?? 'any'}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-required="true"
        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 pr-10 text-sm text-white placeholder:text-white/40 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={unit ? `Value (${unit})` : 'Enter a value'}
        value={resolvedValue}
        onChange={(event) => {
          const next = event.target.value;
          if (!next.length) {
            onChange(undefined);
            return;
          }
          onChange(Number(next));
        }}
        disabled={disabled}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold uppercase tracking-wide text-white/50">
          {unit}
        </span>
      )}
    </div>
  );
}

function DropdownField({
  descriptor,
  value,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
  onChange,
}: BasePrimitiveProps<ClarificationDropdownDescriptor>) {
  const resolvedValue = typeof value === 'string' ? value : undefined;
  const triggerId = `${descriptor.fieldId}-dropdown`;

  return (
    <Select.Root value={resolvedValue} onValueChange={(next) => onChange(next)} disabled={disabled}>
      <Select.Trigger
        id={triggerId}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-left text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-white/40"
      >
        <Select.Value placeholder="Select an option" />
        <Select.Icon>
          <ChevronDownIcon className="h-4 w-4 text-white/70" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 overflow-hidden rounded-md border border-white/10 bg-slate-900/95 text-sm text-white shadow-2xl backdrop-blur">
          <Select.ScrollUpButton className="flex items-center justify-center py-1 text-xs text-white/70">
            ▲
          </Select.ScrollUpButton>
          <Select.Viewport className="p-1">
            {descriptor.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex items-center justify-center py-1 text-xs text-white/70">
            ▼
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ToggleField({
  descriptor,
  value,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
  onChange,
}: BasePrimitiveProps<ClarificationToggleDescriptor>) {
  const defaultValue = descriptor.constraints?.default ?? false;
  const resolvedValue = typeof value === 'boolean' ? value : defaultValue;

  return (
    <div className="flex items-center gap-3">
      <Switch.Root
        id={`${descriptor.fieldId}-toggle`}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        checked={resolvedValue}
        onCheckedChange={(checked) => onChange(checked)}
        disabled={disabled}
        className="relative inline-flex h-6 w-11 items-center rounded-full border border-white/30 bg-white/10 transition disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-white/15"
      >
        <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
      <span className="text-sm text-white/80">{resolvedValue ? 'Yes' : 'No'}</span>
    </div>
  );
}

function SliderField({
  descriptor,
  value,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
  onChange,
}: BasePrimitiveProps<ClarificationSliderDescriptor>) {
  const constraints = descriptor.constraints ?? {};
  const min = constraints.minimum ?? 0;
  const max = constraints.maximum ?? 100;
  const step = constraints.step ?? 1;
  const defaultValue = constraints.default ?? Math.round((min + max) / 2);
  const resolvedValue = typeof value === 'number' ? value : defaultValue;

  return (
    <div className="flex flex-col gap-2">
      <Slider.Root
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        min={min}
        max={max}
        step={step}
        value={[resolvedValue]}
        onValueChange={(next) => onChange(next[0])}
        disabled={disabled}
        className="relative flex h-5 w-full items-center"
      >
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-white/15">
          <Slider.Range className="absolute h-full rounded-full bg-indigo-400" />
        </Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-full border border-white bg-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" />
      </Slider.Root>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>
          {min}
          {constraints.unit}
        </span>
        <span className="text-sm font-semibold text-white">
          {resolvedValue}
          {constraints.unit}
        </span>
        <span>
          {max}
          {constraints.unit}
        </span>
      </div>
    </div>
  );
}

type SelectItemProps = {
  value: string;
  children: ReactNode;
};

function SelectItem({ value, children }: SelectItemProps) {
  return (
    <Select.Item
      value={value}
      className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-white data-[highlighted]:bg-indigo-500/80 data-[state=checked]:font-semibold"
    >
      <Select.ItemText>{children}</Select.ItemText>
      <Select.ItemIndicator>
        <CheckIcon className="h-3 w-3 text-white" />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

type IconProps = {
  className?: string;
};

function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3.5 6l4.5 4 4.5-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 8l2.5 2.5L12 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function mergeIds(ids: Array<string | undefined>): string | undefined {
  const filtered = ids.filter(Boolean) as string[];
  return filtered.length ? filtered.join(' ') : undefined;
}

function buildHelperText(component: ClarificationComponentDescriptor): string | undefined {
  if (!component.constraints) {
    return undefined;
  }

  const parts: string[] = [];
  if ('minimum' in component.constraints && typeof component.constraints.minimum === 'number') {
    parts.push(`Min ${component.constraints.minimum}`);
  }
  if ('maximum' in component.constraints && typeof component.constraints.maximum === 'number') {
    parts.push(`Max ${component.constraints.maximum}`);
  }
  if ('step' in component.constraints && typeof component.constraints.step === 'number') {
    parts.push(`Step ${component.constraints.step}`);
  }
  if ('unit' in component.constraints && component.constraints.unit) {
    parts.push(`Unit ${component.constraints.unit}`);
  }
  if ('default' in component.constraints && component.constraints.default !== undefined) {
    parts.push(`Default ${component.constraints.default}`);
  }

  return parts.length ? parts.join(' • ') : undefined;
}
