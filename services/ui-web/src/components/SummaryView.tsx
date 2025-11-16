import type { BudgetSummary } from '@/types';

type Props = {
  summary: BudgetSummary;
};

export function SummaryView({ summary }: Props) {
  return (
    <div className="card flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Budget Summary</h2>
        <p className="text-xs text-white/60">Generated {new Date(summary.generatedAt).toLocaleString()}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead>
            <tr className="text-left text-white/70">
              <th className="px-0 py-2 font-medium">Category</th>
              <th className="px-0 py-2 font-medium">Allocated</th>
              <th className="px-0 py-2 font-medium">Spent</th>
              <th className="px-0 py-2 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {summary.categories.map((category) => {
              const delta = category.allocated - category.spent;
              const isOver = delta < 0;
              return (
                <tr key={category.name}>
                  <td className="px-0 py-2 font-semibold text-white">{category.name}</td>
                  <td className="px-0 py-2 text-white/80">${category.allocated.toLocaleString()}</td>
                  <td className="px-0 py-2 text-white/80">${category.spent.toLocaleString()}</td>
                  <td
                    className={`px-0 py-2 font-semibold ${
                      isOver ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {isOver ? '+' : '-'}${Math.abs(delta).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
