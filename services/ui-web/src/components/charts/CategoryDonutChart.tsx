'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ChartContainer } from './ChartContainer';

// Chart color palette based on CSS variables
const CHART_COLORS = [
  'hsl(238 84% 67%)', // primary
  'hsl(160 84% 39%)', // success
  'hsl(38 92% 50%)',  // warning
  'hsl(280 65% 60%)', // purple
  'hsl(189 94% 43%)', // info
  'hsl(330 80% 60%)', // pink
  'hsl(200 80% 50%)', // light blue
  'hsl(45 90% 55%)',  // gold
];

type CategoryData = {
  name: string;
  value: number;
  share: number;
};

type CategoryDonutChartProps = {
  data: Record<string, number>;
  loading?: boolean;
};

export function CategoryDonutChart({ data, loading = false }: CategoryDonutChartProps) {
  const chartData: CategoryData[] = Object.entries(data)
    .map(([name, share]) => ({
      name,
      value: share,
      share,
    }))
    .sort((a, b) => b.value - a.value);

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: CategoryData }> }) => {
    if (active && payload && payload.length) {
      const { name, share } = payload[0].payload;
      return (
        <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
          <p className="font-medium text-foreground">{name}</p>
          <p className="text-sm text-muted-foreground">{formatPercentage(share)} of expenses</p>
        </div>
      );
    }
    return null;
  };

  // Custom legend
  const CustomLegend = ({ payload }: { payload?: Array<{ value: string; color: string }> }) => {
    if (!payload) return null;
    return (
      <ul className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {payload.map((entry, index) => (
          <li key={`legend-${index}`} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate text-muted-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <ChartContainer
      title="Where Your Money Goes"
      description="Expense breakdown by category"
      loading={loading}
    >
      {chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          No category data available
        </div>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartContainer>
  );
}

