import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { CurrencyDisplay } from './CurrencyDisplay';
import { cn } from '@/lib/utils';

type FinancialMetricCardProps = {
  /** Label for the metric */
  label: string;
  /** The numeric value */
  value: number;
  /** Optional icon component */
  icon?: LucideIcon;
  /** Whether to color-code the value */
  colorCode?: boolean;
  /** Show +/- sign */
  showSign?: boolean;
  /** Optional description or subtitle */
  description?: string;
  /** Comparison value (e.g., previous month) */
  comparison?: {
    value: number;
    label: string;
  };
  /** Size of the value display */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
};

export function FinancialMetricCard({
  label,
  value,
  icon: Icon,
  colorCode = false,
  showSign = false,
  description,
  comparison,
  size = 'lg',
  className,
}: FinancialMetricCardProps) {
  const getComparisonColor = (currentValue: number, previousValue: number) => {
    if (currentValue > previousValue) return 'text-success';
    if (currentValue < previousValue) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const getComparisonPercentage = (currentValue: number, previousValue: number) => {
    if (previousValue === 0) return currentValue > 0 ? 100 : 0;
    return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  };

  return (
    <Card className={cn('', className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            {description && (
              <p className="text-xs text-muted-foreground/70">{description}</p>
            )}
            <CurrencyDisplay
              value={value}
              size={size}
              colorCode={colorCode}
              showSign={showSign}
              className="mt-2"
            />
            {comparison && (
              <p
                className={cn(
                  'mt-1 text-xs font-medium',
                  getComparisonColor(value, comparison.value)
                )}
              >
                {getComparisonPercentage(value, comparison.value) > 0 ? '+' : ''}
                {getComparisonPercentage(value, comparison.value).toFixed(1)}% {comparison.label}
              </p>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                'rounded-full p-2',
                colorCode
                  ? value >= 0
                    ? 'bg-success/10'
                    : 'bg-destructive/10'
                  : 'bg-primary/10'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5',
                  colorCode
                    ? value >= 0
                      ? 'text-success'
                      : 'text-destructive'
                    : 'text-primary'
                )}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

