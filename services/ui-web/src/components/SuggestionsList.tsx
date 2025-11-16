import type { BudgetSuggestion } from '@/types';

type Props = {
  suggestions: BudgetSuggestion[];
};

const impactBadge: Record<BudgetSuggestion['impact'], string> = {
  high: 'bg-rose-400/20 text-rose-100',
  medium: 'bg-amber-400/20 text-amber-100',
  low: 'bg-emerald-400/20 text-emerald-100',
};

export function SuggestionsList({ suggestions }: Props) {
  if (!suggestions.length) {
    return (
      <div className="card">
        <p className="text-sm text-white/70">
          No AI-generated suggestions yet. Upload a budget and answer clarification prompts to see
          tailored suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-white">AI Suggestions</h2>
      <ul className="flex flex-col gap-3">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-white">{suggestion.title}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${impactBadge[suggestion.impact]}`}>
                {suggestion.impact.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/70">{suggestion.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
