import type { BudgetSummary } from '@/types';

type Props = {
  summary: BudgetSummary;
  categoryShares?: Record<string, number>;
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const percentage = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

export function SummaryView({ summary, categoryShares = {} }: Props) {
  const cards = [
    { label: 'Total income', value: summary.totalIncome },
    { label: 'Total expenses', value: summary.totalExpenses },
    { label: 'Surplus', value: summary.surplus },
  ];

  const categories = Object.entries(categoryShares);

  return (
    <div className="card flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Your budget at a glance</h2>
        <p className="text-xs text-white/60">Based on the information you provided</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const isSurplus = card.label.toLowerCase().includes('surplus');
          const isExpenses = card.label.toLowerCase().includes('expenses');
          const valueColor = isSurplus
            ? card.value >= 0
              ? 'text-emerald-400'
              : 'text-rose-400'
            : isExpenses
              ? 'text-rose-300'
              : 'text-white';

          return (
            <div key={card.label} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-white/60">{card.label}</p>
              <p className={`text-2xl font-semibold ${valueColor}`}>
                {currency.format(card.value)}
              </p>
            </div>
          );
        })}
      </div>

      {categories.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-white">Where your money goes</p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-white/70">
                  <th className="px-0 py-2 font-medium">Category</th>
                  <th className="px-0 py-2 font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {categories.map(([category, share]) => (
                  <tr key={category}>
                    <td className="px-0 py-2 font-medium text-white">{category}</td>
                    <td className="px-0 py-2 text-white/80">{percentage.format(share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
