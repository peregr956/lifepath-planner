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
};

export function ChartContainer({
  title,
  description,
  loading = false,
  className,
  children,
}: ChartContainerProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
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

