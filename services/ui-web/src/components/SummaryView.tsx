'use client';

import type { BudgetSummary } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { CategoryDonutChart, CategoryBarChart } from './charts';
import { cn, formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank } from 'lucide-react';

type Props = {
  summary: BudgetSummary;
  categoryShares?: Record<string, number>;
};

export function SummaryView({ summary, categoryShares = {} }: Props) {
  const hasCategories = Object.keys(categoryShares).length > 0;

  const metrics = [
    {
      label: 'Total Income',
      value: summary.totalIncome,
      icon: Wallet,
      color: 'text-foreground',
      bgColor: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      label: 'Total Expenses',
      value: summary.totalExpenses,
      icon: CreditCard,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      iconColor: 'text-destructive',
    },
    {
      label: 'Monthly Surplus',
      value: summary.surplus,
      icon: summary.surplus >= 0 ? PiggyBank : TrendingDown,
      color: summary.surplus >= 0 ? 'text-success' : 'text-destructive',
      bgColor: summary.surplus >= 0 ? 'bg-success/10' : 'bg-destructive/10',
      iconColor: summary.surplus >= 0 ? 'text-success' : 'text-destructive',
      showSign: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <CardTitle>Your Budget at a Glance</CardTitle>
              <CardDescription>
                Based on the information you provided
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <Card
              key={metric.label}
              className="animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className={cn('mt-2 text-2xl font-bold font-mono tabular-nums', metric.color)}>
                      {metric.showSign && metric.value > 0 && '+'}
                      {formatCurrency(metric.value)}
                    </p>
                  </div>
                  <div className={cn('rounded-full p-2', metric.bgColor)}>
                    <Icon className={cn('h-5 w-5', metric.iconColor)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Savings Rate */}
      {summary.totalIncome > 0 && (
        <Card className="animate-fade-in-up stagger-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Savings Rate</p>
                <p className="text-xs text-muted-foreground/70">
                  Percentage of income not spent
                </p>
              </div>
              <div className="text-right">
                <p className={cn(
                  'text-3xl font-bold font-mono tabular-nums',
                  summary.surplus >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {((summary.surplus / summary.totalIncome) * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary.surplus >= 0 ? 'of income saved' : 'over budget'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  summary.surplus >= 0
                    ? 'bg-gradient-to-r from-primary to-success'
                    : 'bg-destructive'
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, (summary.surplus / summary.totalIncome) * 100 + (summary.surplus < 0 ? 100 : 0)))}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      {hasCategories && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="animate-fade-in-up stagger-3">
            <CategoryDonutChart data={categoryShares} />
          </div>
          <div className="animate-fade-in-up stagger-4">
            <CategoryBarChart data={categoryShares} />
          </div>
        </div>
      )}

      {/* Categories Table (fallback if no charts) */}
      {!hasCategories && Object.keys(categoryShares).length > 0 && (
        <Card className="animate-fade-in-up stagger-3">
          <CardHeader>
            <CardTitle className="text-base">Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-0 py-2 font-medium">Category</th>
                    <th className="px-0 py-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(categoryShares)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, share]) => (
                      <tr key={category}>
                        <td className="px-0 py-2 font-medium text-foreground">{category}</td>
                        <td className="px-0 py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {(share * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
