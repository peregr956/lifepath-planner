'use client';

import { useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { HelpCircle, X, ChevronDown, ChevronUp, Sparkles, MessageSquareText } from 'lucide-react';

type QueryInputProps = {
  onSubmit: (query: string) => void | Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
  initialQuery?: string;
};

const EXAMPLE_QUERIES = [
  'Should I pay off debt or save for an emergency fund?',
  'How can I save $50k for a house down payment?',
  'Am I spending too much? Where can I cut back?',
  'What should I prioritize with my monthly surplus?',
  'How do I balance retirement savings with debt payoff?',
];

export function QueryInput({
  onSubmit,
  disabled = false,
  isLoading = false,
  initialQuery = '',
}: QueryInputProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showExamples, setShowExamples] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;
      await onSubmit(trimmedQuery);
    },
    [query, onSubmit]
  );

  const handleExampleClick = useCallback((example: string) => {
    setQuery(example);
    setShowExamples(false);
  }, []);

  const isDisabled = disabled || isLoading;
  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-accent/10">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <MessageSquareText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>What would you like help with?</CardTitle>
              <CardDescription>
                Tell us your financial question or concern, and we&apos;ll ask only the relevant
                follow-up questions.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isDisabled}
                placeholder="e.g., Should I pay off my credit card debt or start an emergency fund?"
                rows={3}
                className={cn(
                  'w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground',
                  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-colors'
                )}
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  disabled={isDisabled}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Clear input</span>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowExamples(!showExamples)}
                disabled={isDisabled}
                className="justify-start text-primary hover:text-primary/80"
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                {showExamples ? 'Hide examples' : 'Show example questions'}
                {showExamples ? (
                  <ChevronUp className="ml-1 h-4 w-4" />
                ) : (
                  <ChevronDown className="ml-1 h-4 w-4" />
                )}
              </Button>

              <Button
                type="submit"
                size="lg"
                disabled={isDisabled || !hasQuery}
                loading={isLoading}
                className="bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/25 hover:from-primary/90 hover:to-accent/90"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Continue
              </Button>
            </div>
          </form>

          {showExamples && (
            <div className="animate-fade-in rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Example questions
              </p>
              <ul className="flex flex-col gap-1">
                {EXAMPLE_QUERIES.map((example, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => handleExampleClick(example)}
                      disabled={isDisabled}
                      className={cn(
                        'w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors',
                        'hover:bg-accent hover:text-foreground',
                        'disabled:cursor-not-allowed disabled:opacity-50'
                      )}
                    >
                      &ldquo;{example}&rdquo;
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Your question helps us personalize the experience. We&apos;ll only ask follow-up questions
        that are relevant to your specific situation.
      </p>
    </div>
  );
}
