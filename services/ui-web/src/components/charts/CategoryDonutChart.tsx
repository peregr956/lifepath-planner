'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ChartContainer } from './ChartContainer';
import { Button } from '@/components/ui';
import { Table, List } from 'lucide-react';

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
  /** Allow toggling between chart and table view for accessibility */
  showTableToggle?: boolean;
};

export function CategoryDonutChart({ data, loading = false, showTableToggle = true }: CategoryDonutChartProps) {
  const [showTable, setShowTable] = useState(false);
  
  const chartData: CategoryData[] = Object.entries(data)
    .map(([name, share]) => ({
      name,
      value: share,
      share,
    }))
    .sort((a, b) => b.value - a.value);

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  
  // Generate accessible description for screen readers
  const accessibleDescription = chartData.length > 0
    ? `Expense breakdown: ${chartData.slice(0, 5).map(d => `${d.name} at ${formatPercentage(d.share)}`).join(', ')}${chartData.length > 5 ? `, and ${chartData.length - 5} more categories` : ''}.`
    : 'No expense data available.';

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

  // Accessible data table alternative
  const DataTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm" role="table">
        <caption className="sr-only">Expense breakdown by category</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="px-0 py-2 font-medium">Category</th>
            <th scope="col" className="px-0 py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {chartData.map((item, index) => (
            <tr key={item.name}>
              <td className="px-0 py-2 font-medium text-foreground">
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    aria-hidden="true"
                  />
                  {item.name}
                </span>
              </td>
              <td className="px-0 py-2 text-right font-mono tabular-nums text-muted-foreground">
                {formatPercentage(item.share)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartContainer
      title="Where Your Money Goes"
      description="Expense breakdown by category"
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
                <List className="h-3.5 w-3.5" />
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
          className="h-[280px]"
          role="img"
          aria-label={accessibleDescription}
        >
          {/* Hidden accessible description for screen readers */}
          <div className="sr-only">{accessibleDescription}</div>
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
                aria-hidden="true"
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

