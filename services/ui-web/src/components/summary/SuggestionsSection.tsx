'use client';

import { useState, useMemo } from 'react';
import type {
  BudgetSuggestion,
  ExtendedBudgetSuggestion,
  ProviderMetadata,
  FinancialPhilosophy,
  SuggestionAssumption,
} from '@/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from '@/components/ui';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Sparkles,
  Calculator,
  Target,
  AlertTriangle,
  X,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SuggestionCard } from './SuggestionCard';

type Props = {
  suggestions: BudgetSuggestion[];
  extendedSuggestions?: ExtendedBudgetSuggestion[];
  providerMetadata?: ProviderMetadata;
  financialPhilosophy?: FinancialPhilosophy | null;
  assumptions?: SuggestionAssumption[];
  onMarkDone?: (id: string) => void;
  onMarkWontDo?: (id: string) => void;
};

function formatPhilosophyName(philosophy: FinancialPhilosophy): string {
  const names: Record<FinancialPhilosophy, string> = {
    r_personalfinance: 'r/personalfinance',
    money_guy: 'Money Guy Show',
    dave_ramsey: 'Dave Ramsey',
    bogleheads: 'Bogleheads',
    fire: 'FIRE',
    neutral: 'General',
    custom: 'Custom',
  };
  return names[philosophy] || philosophy;
}

function AIDisclaimer({
  providerMetadata,
  onDismiss,
}: {
  providerMetadata?: ProviderMetadata;
  onDismiss: () => void;
}) {
  if (!providerMetadata?.aiEnabled) {
    return null;
  }

  return (
    <div className="relative rounded-lg border border-warning/30 bg-warning/10 p-4">
      <button
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-warning/70 transition-colors hover:bg-warning/20 hover:text-warning"
        aria-label="Dismiss disclaimer"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-semibold text-warning">AI-Generated Content</p>
          <p className="mt-1 text-warning/80">
            These suggestions are for educational purposes only and do not
            constitute financial advice. You are responsible for your financial
            decisions.
          </p>
        </div>
      </div>
    </div>
  );
}

function AssumptionsSection({
  assumptions,
}: {
  assumptions: SuggestionAssumption[];
}) {
  const [expanded, setExpanded] = useState(false);
  const displayAssumptions = expanded ? assumptions : assumptions.slice(0, 3);
  const hasMore = assumptions.length > 3;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-warning">
        <Info className="h-4 w-4" />
        Assumptions Made
      </div>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {displayAssumptions.map((a) => (
          <li key={a.id} className="flex items-start gap-2">
            <span className="text-warning">•</span>
            <span>
              {a.assumption}
              {a.source === 'inferred' && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Inferred
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 gap-1 text-warning hover:text-warning"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show {assumptions.length - 3} more
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function SuggestionsSection({
  suggestions,
  extendedSuggestions,
  providerMetadata,
  financialPhilosophy,
  assumptions,
  onMarkDone,
  onMarkWontDo,
}: Props) {
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);

  const isAI = providerMetadata?.suggestionProvider === 'openai';
  const usedDeterministic = providerMetadata?.usedDeterministic;

  // Use extended suggestions if available, otherwise fall back to regular
  const displaySuggestions = useMemo(() => {
    if (extendedSuggestions && extendedSuggestions.length > 0) {
      return extendedSuggestions.sort((a, b) => a.priority - b.priority);
    }
    // Convert regular suggestions to have implicit priority
    return suggestions.map((s, i) => ({
      ...s,
      priority: i + 1,
    }));
  }, [suggestions, extendedSuggestions]);

  if (!suggestions.length && (!extendedSuggestions || !extendedSuggestions.length)) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <Target className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            No Recommendations Yet
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Upload a budget and answer clarification questions to see tailored
            recommendations for improving your finances.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate total potential savings
  const totalPotentialSavings = displaySuggestions.reduce(
    (sum, s) => sum + s.expectedMonthlyImpact,
    0
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>
                  {usedDeterministic
                    ? 'Recommended Actions'
                    : isAI
                    ? 'AI-Powered Recommendations'
                    : 'Recommended Actions'}
                </CardTitle>
                <CardDescription>
                  {displaySuggestions.length} action
                  {displaySuggestions.length !== 1 ? 's' : ''} to improve your
                  finances
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Financial Philosophy Badge */}
              {financialPhilosophy && financialPhilosophy !== 'neutral' && (
                <Badge variant="outline" className="gap-1">
                  <Target className="h-3 w-3" />
                  {formatPhilosophyName(financialPhilosophy)}
                </Badge>
              )}
              {/* Mode Indicator Badge */}
              {usedDeterministic ? (
                <Badge variant="secondary" className="gap-1">
                  <Calculator className="h-3 w-3" />
                  Basic Analysis
                </Badge>
              ) : isAI ? (
                <Badge
                  variant="default"
                  className="gap-1 bg-primary/20 text-primary"
                >
                  <Sparkles className="h-3 w-3" />
                  AI-Powered
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Total Potential Savings */}
          <div className="rounded-xl border border-success/30 bg-gradient-to-r from-success/10 to-success/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-success">
                  Total Potential Monthly Savings
                </p>
                <p className="text-xs text-success/70">
                  If all recommendations are implemented
                </p>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-success">
                +{formatCurrency(totalPotentialSavings)}
              </p>
            </div>
          </div>

          {/* AI Disclaimer */}
          {!disclaimerDismissed && (
            <AIDisclaimer
              providerMetadata={providerMetadata}
              onDismiss={() => setDisclaimerDismissed(true)}
            />
          )}
        </CardContent>
      </Card>

      {/* Suggestion Cards */}
      <div className="flex flex-col gap-3">
        {displaySuggestions.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            index={index}
            priority={suggestion.priority}
            onMarkDone={onMarkDone}
            onMarkWontDo={onMarkWontDo}
          />
        ))}
      </div>

      {/* Global Assumptions */}
      {assumptions && assumptions.length > 0 && (
        <AssumptionsSection assumptions={assumptions} />
      )}
    </div>
  );
}
