'use client';

import { useState } from 'react';
import type { BudgetSuggestion, ExtendedBudgetSuggestion } from '@/types';
import {
  Card,
  CardContent,
  Badge,
  Button,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Separator,
} from '@/components/ui';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Lightbulb,
  TrendingUp,
  Target,
  Info,
  CheckCircle2,
  Scale,
  CreditCard,
  PiggyBank,
  Wallet,
  Zap,
  Check,
  X,
} from 'lucide-react';

type Props = {
  suggestion: BudgetSuggestion | ExtendedBudgetSuggestion;
  index: number;
  priority?: number;
  onMarkDone?: (id: string) => void;
  onMarkWontDo?: (id: string) => void;
};

function isExtendedSuggestion(
  s: BudgetSuggestion | ExtendedBudgetSuggestion
): s is ExtendedBudgetSuggestion {
  return 'priority' in s;
}

function getPriorityFromImpact(impact: number): 'high' | 'medium' | 'low' {
  if (impact >= 200) return 'high';
  if (impact >= 50) return 'medium';
  return 'low';
}

function getPriorityConfig(priority: 'high' | 'medium' | 'low') {
  switch (priority) {
    case 'high':
      return {
        label: 'High Impact',
        variant: 'success' as const,
        icon: TrendingUp,
        bgColor: 'bg-success/10',
        textColor: 'text-success',
      };
    case 'medium':
      return {
        label: 'Medium Impact',
        variant: 'warning' as const,
        icon: Target,
        bgColor: 'bg-warning/10',
        textColor: 'text-warning',
      };
    case 'low':
      return {
        label: 'Low Impact',
        variant: 'secondary' as const,
        icon: Info,
        bgColor: 'bg-muted',
        textColor: 'text-muted-foreground',
      };
  }
}

function getCategoryIcon(category?: ExtendedBudgetSuggestion['category']) {
  switch (category) {
    case 'debt':
      return CreditCard;
    case 'savings':
      return PiggyBank;
    case 'spending':
      return Wallet;
    case 'income':
      return TrendingUp;
    default:
      return Lightbulb;
  }
}

export function SuggestionCard({
  suggestion,
  index,
  priority,
  onMarkDone,
  onMarkWontDo,
}: Props) {
  const [status, setStatus] = useState<'pending' | 'done' | 'wont_do'>('pending');
  
  const displayPriority = priority ?? (isExtendedSuggestion(suggestion) ? suggestion.priority : index + 1);
  const impactPriority = getPriorityFromImpact(suggestion.expectedMonthlyImpact);
  const priorityConfig = getPriorityConfig(impactPriority);
  const CategoryIcon = isExtendedSuggestion(suggestion)
    ? getCategoryIcon(suggestion.category)
    : Lightbulb;
  const keyInsight = isExtendedSuggestion(suggestion) ? suggestion.keyInsight : undefined;
  const assumptions = isExtendedSuggestion(suggestion) ? suggestion.assumptions : undefined;

  const handleMarkDone = () => {
    setStatus('done');
    onMarkDone?.(suggestion.id);
  };

  const handleMarkWontDo = () => {
    setStatus('wont_do');
    onMarkWontDo?.(suggestion.id);
  };

  return (
    <Card
      className={cn(
        'group animate-fade-in-up transition-all',
        status === 'done' && 'border-success/30 bg-success/5 opacity-75',
        status === 'wont_do' && 'border-muted bg-muted/30 opacity-50',
        status === 'pending' && 'hover:border-primary/30'
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <CardContent className="pt-5">
        <div className="flex gap-4">
          {/* Priority Number */}
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold',
              status === 'done' && 'bg-success text-success-foreground',
              status === 'wont_do' && 'bg-muted text-muted-foreground',
              status === 'pending' && priorityConfig.bgColor,
              status === 'pending' && priorityConfig.textColor
            )}
          >
            {status === 'done' ? (
              <Check className="h-5 w-5" />
            ) : status === 'wont_do' ? (
              <X className="h-5 w-5" />
            ) : (
              displayPriority
            )}
          </div>

          {/* Content */}
          <div className="flex-1 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">{suggestion.title}</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {suggestion.description}
                </p>
              </div>
              <Badge variant={priorityConfig.variant} className="shrink-0">
                {priorityConfig.label}
              </Badge>
            </div>

            {/* Key Insight (if available) */}
            {keyInsight && (
              <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm font-medium text-primary">{keyInsight}</p>
              </div>
            )}

            {/* Impact */}
            <div className="flex items-center justify-between rounded-lg bg-success/10 px-4 py-3">
              <span className="text-sm font-medium text-success">
                Monthly Savings
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-success">
                +{formatCurrency(suggestion.expectedMonthlyImpact)}
              </span>
            </div>

            {/* Expandable Details */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="details" className="border-none">
                <AccordionTrigger className="py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    Why this? Details & tradeoffs
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  {/* Rationale */}
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Why We Recommend This
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {suggestion.rationale}
                    </p>
                  </div>

                  <Separator />

                  {/* Tradeoffs */}
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Scale className="h-3.5 w-3.5" />
                      Tradeoffs to Consider
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {suggestion.tradeoffs}
                    </p>
                  </div>

                  {/* Assumptions (if available) */}
                  {assumptions && assumptions.length > 0 && (
                    <>
                      <Separator />
                      <div className="rounded-lg bg-warning/10 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warning">
                          <Info className="h-3.5 w-3.5" />
                          Assumptions
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-foreground">
                          {assumptions.map((assumption, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-warning">•</span>
                              {assumption}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Action Buttons */}
            {status === 'pending' && (onMarkDone || onMarkWontDo) && (
              <div className="flex gap-2 pt-2">
                {onMarkDone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMarkDone}
                    className="gap-1.5 text-success hover:bg-success/10 hover:text-success"
                  >
                    <Check className="h-3.5 w-3.5" />
                    I&apos;ll do this
                  </Button>
                )}
                {onMarkWontDo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkWontDo}
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    Not for me
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
