import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui';
import { PercentageDisplay } from './PercentageDisplay';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

type SavingsRateIndicatorProps = {
  /** The savings rate as a decimal (0.15 = 15%) */
  rate: number;
  /** Optional target rate for comparison */
  targetRate?: number;
  /** Show the progress bar */
  showProgress?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
};

export function SavingsRateIndicator({
  rate,
  targetRate = 0.2, // Default target: 20%
  showProgress = true,
  size = 'md',
  className,
}: SavingsRateIndicatorProps) {
  const isOnTrack = rate >= targetRate;
  const progressValue = Math.min(100, Math.max(0, (rate / targetRate) * 100));

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOnTrack ? (
            <TrendingUp className="h-4 w-4 text-success" />
          ) : (
            <TrendingDown className="h-4 w-4 text-warning" />
          )}
          <span className={cn('font-medium', sizeClasses[size])}>
            Savings Rate
          </span>
        </div>
        <PercentageDisplay
          value={rate}
          size={size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md'}
          colorCode
        />
      </div>

      {showProgress && (
        <>
          <Progress
            value={progressValue}
            className="h-2"
            indicatorClassName={cn(
              'transition-all duration-500',
              isOnTrack ? 'bg-success' : 'bg-warning'
            )}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              <span>Target: {(targetRate * 100).toFixed(0)}%</span>
            </div>
            <span>100%</span>
          </div>
        </>
      )}

      <p
        className={cn(
          'text-xs',
          isOnTrack ? 'text-success' : 'text-warning'
        )}
      >
        {isOnTrack
          ? `Great! You're saving ${((rate - targetRate) * 100).toFixed(1)}% above target.`
          : `You're ${((targetRate - rate) * 100).toFixed(1)}% below the recommended savings rate.`}
      </p>
    </div>
  );
}

