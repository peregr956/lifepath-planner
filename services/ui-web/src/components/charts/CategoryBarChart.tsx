'use client';

import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { ChartContainer } from './ChartContainer';
import { Button } from '@/components/ui';
import { Table, BarChart3 } from 'lucide-react';

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
  fullName: string;
  share: number;
  percentage: string;
};

type CategoryBarChartProps = {
  data: Record<string, number>;
  loading?: boolean;
  maxItems?: number;
  /** Allow toggling between chart and table view for accessibility */
  showTableToggle?: boolean;
};

export function CategoryBarChart({ data, loading = false, maxItems = 6, showTableToggle = true }: CategoryBarChartProps) {
  const [showTable, setShowTable] = useState(false);
  
  const chartData: CategoryData[] = Object.entries(data)
    .map(([name, share]) => ({
      name: name.length > 12 ? name.slice(0, 12) + '...' : name,
      fullName: name,
      share,
      percentage: `${(share * 100).toFixed(1)}%`,
    }))
    .sort((a, b) => b.share - a.share)
    .slice(0, maxItems);
  
  // Generate accessible description for screen readers
  const accessibleDescription = chartData.length > 0
    ? `Top ${chartData.length} spending categories: ${chartData.map(d => `${d.fullName} at ${d.percentage}`).join(', ')}.`
    : 'No spending data available.';

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

  // Accessible data table alternative
  const DataTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm" role="table">
        <caption className="sr-only">Top spending categories</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="px-0 py-2 font-medium">Rank</th>
            <th scope="col" className="px-0 py-2 font-medium">Category</th>
            <th scope="col" className="px-0 py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {chartData.map((item, index) => (
            <tr key={item.fullName}>
              <td className="px-0 py-2 text-muted-foreground">{index + 1}</td>
              <td className="px-0 py-2 font-medium text-foreground">
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded shrink-0"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    aria-hidden="true"
                  />
                  {item.fullName}
                </span>
              </td>
              <td className="px-0 py-2 text-right font-mono tabular-nums text-muted-foreground">
                {item.percentage}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartContainer
      title="Top Spending Categories"
      description="Your biggest expense areas"
      loading={loading}
      headerAction={
        showTableToggle && chartData.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTable(!showTable)}
            className="gap-1.5 text-xs"
            aria-label={showTable ? 'Show chart view' : 'Show table view'}
          >
            {showTable ? (
              <>
                <BarChart3 className="h-3.5 w-3.5" />
                Chart
              </>
            ) : (
              <>
                <Table className="h-3.5 w-3.5" />
                Table
              </>
            )}
          </Button>
        ) : undefined
      }
    >
      {chartData.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          No category data available
        </div>
      ) : showTable ? (
        <DataTable />
      ) : (
        <div 
          className="h-[200px]"
          role="img"
          aria-label={accessibleDescription}
        >
          {/* Hidden accessible description for screen readers */}
          <div className="sr-only">{accessibleDescription}</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              aria-hidden="true"
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

