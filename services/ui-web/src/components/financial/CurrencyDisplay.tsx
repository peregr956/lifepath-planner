import { cn, formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type CurrencyDisplayProps = {
  /** The numeric value to display */
  value: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether to show +/- sign */
  showSign?: boolean;
  /** Whether to color-code based on positive/negative */
  colorCode?: boolean;
  /** Whether to show a trend icon */
  showTrendIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
};

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-4xl',
};

export function CurrencyDisplay({
  value,
  size = 'md',
  showSign = false,
  colorCode = false,
  showTrendIcon = false,
  className,
}: CurrencyDisplayProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const isZero = value === 0;

  const colorClass = colorCode
    ? isPositive
      ? 'text-success'
      : isNegative
        ? 'text-destructive'
        : 'text-muted-foreground'
    : 'text-foreground';

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  const displayValue = showSign && isPositive ? `+${formatCurrency(value)}` : formatCurrency(value);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono font-bold tabular-nums',
        sizeClasses[size],
        colorClass,
        className
      )}
    >
      {showTrendIcon && !isZero && (
        <TrendIcon
          className={cn(
            size === 'sm' && 'h-3.5 w-3.5',
            size === 'md' && 'h-4 w-4',
            size === 'lg' && 'h-5 w-5',
            size === 'xl' && 'h-6 w-6'
          )}
        />
      )}
      {displayValue}
    </span>
  );
}

