'use client';

import { useState } from 'react';
import type { BudgetSummary, ProjectedOutcome, BudgetSuggestion } from '@/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
} from '@/components/ui';
import { cn, formatCurrency } from '@/lib/utils';
import {
  TrendingUp,
  ArrowRight,
  Zap,
  Clock,
  ChevronRight,
  Calculator,
  Info,
} from 'lucide-react';

type Props = {
  summary: BudgetSummary;
  suggestions: BudgetSuggestion[];
  projectedOutcomes?: ProjectedOutcome[];
};

function OutcomeRow({
  label,
  currentValue,
  projectedValue,
  percentChange,
  timelineChange,
  highlight,
}: {
  label: string;
  currentValue: number;
  projectedValue: number;
  percentChange: number;
  timelineChange?: { before: string; after: string };
  highlight?: boolean;
}) {
  const isPositive = percentChange > 0;

  return (
    <div
      className={cn(
        'rounded-lg p-3',
        highlight ? 'bg-success/10 border border-success/20' : 'bg-muted/50'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Badge
          variant={isPositive ? 'success' : 'destructive'}
          className="text-xs"
        >
          {isPositive ? '+' : ''}{percentChange.toFixed(0)}%
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="font-mono text-lg text-muted-foreground">
          {formatCurrency(currentValue)}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span
          className={cn(
            'font-mono text-xl font-bold',
            isPositive ? 'text-success' : 'text-destructive'
          )}
        >
          {formatCurrency(projectedValue)}
        </span>
      </div>
      {timelineChange && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{timelineChange.before}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium text-success">{timelineChange.after}</span>
        </div>
      )}
    </div>
  );
}

export function ProjectedImpactCard({
  summary,
  suggestions,
  projectedOutcomes,
}: Props) {
  // Calculate simple projection: current surplus + all suggestion impacts
  const totalSuggestionImpact = suggestions.reduce(
    (sum, s) => sum + s.expectedMonthlyImpact,
    0
  );
  const projectedSurplus = summary.surplus + totalSuggestionImpact;
  const surplusPercentChange =
    summary.surplus !== 0
      ? ((projectedSurplus - summary.surplus) / Math.abs(summary.surplus)) * 100
      : projectedSurplus > 0
      ? 100
      : 0;

  // Calculate projected savings rate
  const currentSavingsRate =
    summary.totalIncome > 0 ? (summary.surplus / summary.totalIncome) * 100 : 0;
  const projectedSavingsRate =
    summary.totalIncome > 0
      ? (projectedSurplus / summary.totalIncome) * 100
      : 0;
  const savingsRateChange = projectedSavingsRate - currentSavingsRate;

  // Use API-provided outcomes if available, otherwise use calculated values
  const displayOutcomes: ProjectedOutcome[] = projectedOutcomes?.length
    ? projectedOutcomes
    : [
        {
          label: 'Monthly Surplus',
          currentValue: summary.surplus,
          projectedValue: projectedSurplus,
          percentChange: surplusPercentChange,
        },
      ];

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-success" />
          If You Follow These Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main outcomes */}
        <div className="space-y-3">
          {displayOutcomes.map((outcome, index) => (
            <OutcomeRow
              key={index}
              label={outcome.label}
              currentValue={outcome.currentValue}
              projectedValue={outcome.projectedValue}
              percentChange={outcome.percentChange}
              timelineChange={outcome.timelineChange}
              highlight={index === 0}
            />
          ))}
        </div>

        {/* Summary callout */}
        <div className="rounded-lg bg-gradient-to-r from-success/10 to-success/5 border border-success/20 p-4">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-success mt-0.5" />
            <div>
              <p className="font-medium text-success">
                Potential Monthly Improvement
              </p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-success">
                +{formatCurrency(totalSuggestionImpact)}/month
              </p>
              {savingsRateChange > 0 && (
                <p className="mt-1 text-sm text-success/80">
                  Savings rate: {currentSavingsRate.toFixed(1)}% → {projectedSavingsRate.toFixed(1)}%
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Expandable calculation details */}
        <Accordion type="single" collapsible>
          <AccordionItem value="details" className="border-none">
            <AccordionTrigger className="py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                How we calculated this
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Monthly Surplus</span>
                  <span className="font-mono">{formatCurrency(summary.surplus)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Total Suggestion Impact ({suggestions.length} recommendations)
                  </span>
                  <span className="font-mono text-success">
                    +{formatCurrency(totalSuggestionImpact)}
                  </span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-medium">
                  <span>Projected Monthly Surplus</span>
                  <span className="font-mono text-success">
                    {formatCurrency(projectedSurplus)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  <Info className="inline h-3 w-3 mr-1" />
                  This projection assumes all recommendations are fully implemented.
                  Actual results may vary based on your specific circumstances.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Placeholder link to full projections (Phase 14) */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          disabled
        >
          <TrendingUp className="h-4 w-4" />
          See Full 12-Month Projection
          <ChevronRight className="h-4 w-4" />
          <Badge variant="secondary" className="ml-auto text-xs">
            Coming Soon
          </Badge>
        </Button>
      </CardContent>
    </Card>
  );
}
