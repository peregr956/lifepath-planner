'use client';

import { useState, useCallback } from 'react';
import type { FormEvent } from 'react';

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
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 p-6 shadow-lg shadow-indigo-500/5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-white">
              What would you like help with?
            </h2>
            <p className="text-sm text-white/70">
              Tell us your financial question or concern, and we&apos;ll ask only the
              relevant follow-up questions to give you personalized guidance.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isDisabled}
                placeholder="e.g., Should I pay off my credit card debt or start an emergency fund?"
                rows={3}
                className="w-full resize-none rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-3 rounded p-1 text-white/40 hover:text-white/70"
                  disabled={isDisabled}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setShowExamples(!showExamples)}
                className="text-sm text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                disabled={isDisabled}
              >
                {showExamples ? 'Hide examples' : 'Show example questions'}
              </button>

              <button
                type="submit"
                disabled={isDisabled || !hasQuery}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-400 hover:to-purple-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          </form>

          {showExamples && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-white/50">
                Example questions
              </p>
              <ul className="flex flex-col gap-1">
                {EXAMPLE_QUERIES.map((example, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => handleExampleClick(example)}
                      disabled={isDisabled}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      &ldquo;{example}&rdquo;
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-white/50">
        Your question helps us personalize the experience. We&apos;ll only ask
        follow-up questions that are relevant to your specific situation.
      </p>
    </div>
  );
}

