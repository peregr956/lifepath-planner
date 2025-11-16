import type { BudgetSuggestion } from '@/types';

type Props = {
  suggestions: BudgetSuggestion[];
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function SuggestionsList({ suggestions }: Props) {
  if (!suggestions.length) {
    return (
      <div className="card">
        <p className="text-sm text-white/70">
          No AI-generated suggestions yet. Upload a budget and answer clarification prompts to see
          tailored next steps.
        </p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-white">AI suggestions</h2>
      <ul className="flex flex-col gap-3">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold text-white">{suggestion.title}</p>
                <p className="text-sm text-white/70">{suggestion.description}</p>
              </div>
              <p className="text-sm font-semibold text-emerald-200">
                Expected monthly impact: {currency.format(suggestion.expectedMonthlyImpact)}
              </p>
              <div className="text-xs text-white/70">
                <p>
                  <span className="font-semibold text-white">Rationale:</span> {suggestion.rationale}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-white">Tradeoffs:</span> {suggestion.tradeoffs}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
