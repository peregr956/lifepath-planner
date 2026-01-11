'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

type ChartContainerProps = {
  title: string;
  description?: string;
  loading?: boolean;
  className?: string;
  children: ReactNode;
  /** Optional action element to display in header (e.g., toggle button) */
  headerAction?: ReactNode;
};

export function ChartContainer({
  title,
  description,
  loading = false,
  className,
  children,
  headerAction,
}: ChartContainerProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[200px] items-center justify-center">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

