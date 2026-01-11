'use client';

import { useState } from 'react';
import type { BudgetSummary } from '@/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Dialog,
  Separator,
} from '@/components/ui';
import { CategoryDonutChart, CategoryBarChart } from '@/components/charts';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  PieChart,
  BarChart3,
} from 'lucide-react';

type Props = {
  summary: BudgetSummary;
  categoryShares?: Record<string, number>;
  compact?: boolean;
};

function MetricRow({
  label,
  value,
  icon: Icon,
  valueColor,
  showSign,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  valueColor?: string;
  showSign?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          valueColor || 'text-foreground'
        )}
      >
        {showSign && value > 0 && '+'}
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function SavingsRateDisplay({
  surplus,
  totalIncome,
}: {
  surplus: number;
  totalIncome: number;
}) {
  if (totalIncome <= 0) return null;

  const rate = (surplus / totalIncome) * 100;
  const isPositive = surplus >= 0;

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">Savings Rate</span>
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          isPositive ? 'text-success' : 'text-destructive'
        )}
      >
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}

export function BudgetSnapshotCard({
  summary,
  categoryShares = {},
  compact = true,
}: Props) {
  const [showCharts, setShowCharts] = useState(false);
  const hasCategories = Object.keys(categoryShares).length > 0;

  const surplusColor = summary.surplus >= 0 ? 'text-success' : 'text-destructive';
  const SurplusIcon = summary.surplus >= 0 ? PiggyBank : TrendingDown;

  if (!compact) {
    // Full view - original layout with charts visible
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Your Budget Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <MetricRow
              label="Total Income"
              value={summary.totalIncome}
              icon={Wallet}
            />
            <Separator />
            <MetricRow
              label="Total Expenses"
              value={summary.totalExpenses}
              icon={CreditCard}
              valueColor="text-destructive"
            />
            <Separator />
            <MetricRow
              label="Monthly Surplus"
              value={summary.surplus}
              icon={SurplusIcon}
              valueColor={surplusColor}
              showSign
            />
            <Separator />
            <SavingsRateDisplay
              surplus={summary.surplus}
              totalIncome={summary.totalIncome}
            />
          </div>

          {hasCategories && (
            <div className="grid gap-4 md:grid-cols-2 pt-2">
              <CategoryDonutChart data={categoryShares} />
              <CategoryBarChart data={categoryShares} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Compact view - main display
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          Your Budget Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-0">
          <MetricRow
            label="Income"
            value={summary.totalIncome}
            icon={Wallet}
          />
          <MetricRow
            label="Expenses"
            value={summary.totalExpenses}
            icon={CreditCard}
          />
          <Separator className="my-1" />
          <MetricRow
            label="Surplus"
            value={summary.surplus}
            icon={SurplusIcon}
            valueColor={surplusColor}
            showSign
          />
          <MetricRow
            label="Savings Rate"
            value={0}
            icon={PiggyBank}
          />
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Savings Rate</span>
            </div>
            {summary.totalIncome > 0 && (
              <span
                className={cn(
                  'font-mono font-semibold tabular-nums',
                  summary.surplus >= 0 ? 'text-success' : 'text-destructive'
                )}
              >
                {((summary.surplus / summary.totalIncome) * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* View Breakdown Button */}
        {hasCategories && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCharts(!showCharts)}
            className="w-full gap-2 text-muted-foreground hover:text-foreground"
          >
            <PieChart className="h-4 w-4" />
            {showCharts ? 'Hide' : 'View'} Breakdown
            {showCharts ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Expandable Charts Section */}
        {showCharts && hasCategories && (
          <div className="pt-3 space-y-4 animate-fade-in">
            <Separator />
            <CategoryDonutChart data={categoryShares} />
            <CategoryBarChart data={categoryShares} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
