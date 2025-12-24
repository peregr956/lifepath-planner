'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { ChartContainer } from './ChartContainer';

// Chart color palette
const CHART_COLORS = [
  'hsl(238 84% 67%)', // primary
  'hsl(160 84% 39%)', // success
  'hsl(38 92% 50%)',  // warning
  'hsl(280 65% 60%)', // purple
  'hsl(189 94% 43%)', // info
  'hsl(330 80% 60%)', // pink
];

type CategoryData = {
  name: string;
  share: number;
  percentage: string;
};

type CategoryBarChartProps = {
  data: Record<string, number>;
  loading?: boolean;
  maxItems?: number;
};

export function CategoryBarChart({ data, loading = false, maxItems = 6 }: CategoryBarChartProps) {
  const chartData: CategoryData[] = Object.entries(data)
    .map(([name, share]) => ({
      name: name.length > 12 ? name.slice(0, 12) + '...' : name,
      fullName: name,
      share,
      percentage: `${(share * 100).toFixed(1)}%`,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, maxItems);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: CategoryData & { fullName: string } }> }) => {
    if (active && payload && payload.length) {
      const { fullName, percentage } = payload[0].payload;
      return (
        <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
          <p className="font-medium text-foreground">{fullName}</p>
          <p className="text-sm text-muted-foreground">{percentage}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ChartContainer
      title="Top Spending Categories"
      description="Your biggest expense areas"
      loading={loading}
    >
      {chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          No category data available
        </div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <XAxis
                type="number"
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
              <Bar dataKey="share" radius={[0, 4, 4, 0]}>
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartContainer>
  );
}

