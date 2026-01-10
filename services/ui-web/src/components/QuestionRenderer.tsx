'use client';

import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Card,
  CardContent,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type {
  ClarificationAnswerValue,
  ClarificationComponentDescriptor,
  ClarificationDropdownDescriptor,
  ClarificationNumberInputDescriptor,
  ClarificationQuestion,
  ClarificationSliderDescriptor,
  ClarificationTextInputDescriptor,
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
    <Card className="animate-fade-in">
      <CardContent className="pt-6">
        <fieldset
          className="flex flex-col gap-5"
          aria-describedby={question.description ? `${question.id}-description` : undefined}
        >
          <legend className="space-y-1">
            <span className="text-base font-semibold leading-tight text-foreground">
              {question.prompt}
            </span>
            {question.description && (
              <p id={`${question.id}-description`} className="text-sm font-normal text-muted-foreground">
                {question.description}
              </p>
            )}
          </legend>

          <div className="flex flex-col gap-5">
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
      </CardContent>
    </Card>
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
        <Label id={labelId} className="text-sm font-medium text-foreground">
          {component.label}
        </Label>
        {component.description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {component.description}
          </p>
        )}
        {helperText && (
          <p id={helperId} className="text-xs text-muted-foreground/70">
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
        <p id={errorId} className="text-xs font-medium text-destructive">
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
    case 'text_input':
      return (
        <TextInputField
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
  const resolvedValue = typeof value === 'number' ? String(value) : '';
  const unit = constraints.unit;

  return (
    <Input
      id={descriptor.fieldId}
      type="number"
      inputMode="decimal"
      min={constraints.minimum}
      max={constraints.maximum}
      step={constraints.step ?? 'any'}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-required="true"
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
      prefix={unit === 'USD' ? '$' : undefined}
      suffix={unit && unit !== 'USD' ? unit : undefined}
      className={cn(
        'font-mono',
        unit === 'USD' && 'pl-8'
      )}
    />
  );
}

function DropdownField({
  descriptor,
  value,
  disabled,
  onChange,
}: BasePrimitiveProps<ClarificationDropdownDescriptor>) {
  const resolvedValue = typeof value === 'string' ? value : undefined;

  return (
    <Select
      value={resolvedValue}
      onValueChange={(next) => onChange(next)}
      disabled={disabled}
    >
      <SelectTrigger id={`${descriptor.fieldId}-dropdown`}>
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        {descriptor.options.map((option) => (
          <SelectItem key={option} value={option}>
            {formatOptionLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleField({
  descriptor,
  value,
  disabled,
  onChange,
}: BasePrimitiveProps<ClarificationToggleDescriptor>) {
  const defaultValue = descriptor.constraints?.default ?? false;
  const resolvedValue = typeof value === 'boolean' ? value : defaultValue;

  return (
    <div className="flex items-center gap-3">
      <Switch
        id={`${descriptor.fieldId}-toggle`}
        checked={resolvedValue}
        onCheckedChange={(checked) => {
          onChange(checked);
        }}
        disabled={disabled}
      />
      <Label
        htmlFor={`${descriptor.fieldId}-toggle`}
        className={cn(
          'text-sm cursor-pointer',
          resolvedValue ? 'text-success' : 'text-muted-foreground'
        )}
      >
        {resolvedValue ? 'Yes' : 'No'}
      </Label>
    </div>
  );
}

function SliderField({
  descriptor,
  value,
  disabled,
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
    <div className="flex flex-col gap-3">
      <Slider
        aria-describedby={ariaDescribedBy}
        min={min}
        max={max}
        step={step}
        value={[resolvedValue]}
        onValueChange={(next) => onChange(next[0])}
        disabled={disabled}
        showValue
        formatValue={(val) => `${val}${constraints.unit ?? ''}`}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {min}
          {constraints.unit}
        </span>
        <span className="text-sm font-semibold text-foreground">
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

function TextInputField({
  descriptor,
  value,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
  onChange,
}: BasePrimitiveProps<ClarificationTextInputDescriptor>) {
  const constraints = descriptor.constraints ?? {};
  const resolvedValue = typeof value === 'string' ? value : (constraints.default ?? '');

  return (
    <Input
      id={descriptor.fieldId}
      type="text"
      minLength={constraints.minLength}
      maxLength={constraints.maxLength}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-required="true"
      placeholder={constraints.placeholder ?? 'Enter text'}
      value={resolvedValue}
      onChange={(event) => {
        const next = event.target.value;
        if (!next.length) {
          onChange(undefined);
          return;
        }
        onChange(next);
      }}
      disabled={disabled}
    />
  );
}

function formatOptionLabel(option: string): string {
  // Capitalize first letter and format known options nicely
  const formatted = option.charAt(0).toUpperCase() + option.slice(1);
  return formatted.replace(/_/g, ' ');
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
    parts.push(`Min: ${component.constraints.minimum}`);
  }
  if ('maximum' in component.constraints && typeof component.constraints.maximum === 'number') {
    parts.push(`Max: ${component.constraints.maximum}`);
  }

  return parts.length ? parts.join(' · ') : undefined;
}
