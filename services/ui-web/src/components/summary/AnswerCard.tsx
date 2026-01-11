'use client';

import { useState } from 'react';
import type { ExecutiveSummary } from '@/types';
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  MessageSquareText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  Calculator,
} from 'lucide-react';

type Props = {
  userQuery?: string | null;
  executiveSummary?: ExecutiveSummary | null;
  isAIPowered?: boolean;
};

function ConfidenceBadge({
  level,
  explanation,
}: {
  level: ExecutiveSummary['confidenceLevel'];
  explanation?: string;
}) {
  const config = {
    high: {
      label: 'High Confidence',
      variant: 'success' as const,
      icon: CheckCircle2,
      description: 'Based on explicit data you provided',
    },
    medium: {
      label: 'Moderate Confidence',
      variant: 'warning' as const,
      icon: AlertCircle,
      description: 'Some values were estimated or inferred',
    },
    low: {
      label: 'Low Confidence',
      variant: 'secondary' as const,
      icon: HelpCircle,
      description: 'Based on limited information',
    },
  };

  const { label, variant, icon: Icon, description } = config[level];

  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant} className="gap-1.5 px-2.5 py-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {explanation || description}
      </span>
    </div>
  );
}

function KeyMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-center',
        highlight
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-muted/30'
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-bold font-mono tabular-nums',
          highlight ? 'text-primary' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function AnswerCard({ userQuery, executiveSummary, isAIPowered }: Props) {
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  // If no query, show a prompt to ask a question
  if (!userQuery) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="rounded-full bg-muted p-3">
            <MessageSquareText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            You didn&apos;t ask a specific question. The suggestions below are
            based on general optimization of your budget.
          </p>
        </CardContent>
      </Card>
    );
  }

  // If no executive summary yet, show the question with placeholder
  if (!executiveSummary) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2.5">
              <MessageSquareText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Your Question
              </p>
              <p className="mt-1 text-lg font-medium text-foreground">
                &ldquo;{userQuery}&rdquo;
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            See the recommendations below for guidance tailored to your question.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2.5">
              <MessageSquareText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Your Question
              </p>
              <p className="mt-1 text-lg font-medium text-foreground">
                &ldquo;{userQuery}&rdquo;
              </p>
            </div>
          </div>
          {isAIPowered && (
            <Badge variant="default" className="shrink-0 gap-1 bg-primary/20 text-primary">
              <Sparkles className="h-3 w-3" />
              AI Analysis
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* The Answer */}
        <div className="rounded-xl border border-success/30 bg-gradient-to-r from-success/10 to-success/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-success mb-2">
            The Answer
          </p>
          <p className="text-base leading-relaxed text-foreground">
            {executiveSummary.answer}
          </p>
        </div>

        {/* Key Metrics */}
        {executiveSummary.keyMetrics && executiveSummary.keyMetrics.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {executiveSummary.keyMetrics.map((metric, index) => (
              <KeyMetric
                key={index}
                label={metric.label}
                value={metric.value}
                highlight={metric.highlight}
              />
            ))}
          </div>
        )}

        {/* Confidence Indicator */}
        <div className="flex items-center justify-between">
          <ConfidenceBadge
            level={executiveSummary.confidenceLevel}
            explanation={executiveSummary.confidenceExplanation}
          />
        </div>

        {/* Methodology Expandable */}
        {executiveSummary.methodology && (
          <Accordion
            type="single"
            collapsible
            value={methodologyOpen ? 'methodology' : ''}
            onValueChange={(value) => setMethodologyOpen(value === 'methodology')}
          >
            <AccordionItem value="methodology" className="border-none">
              <AccordionTrigger className="py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:no-underline">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  How did we calculate this?
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <div className="rounded-lg bg-muted/50 p-4 text-sm text-foreground">
                  {executiveSummary.methodology}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
