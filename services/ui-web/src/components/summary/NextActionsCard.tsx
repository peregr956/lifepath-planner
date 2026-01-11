'use client';

import Link from 'next/link';
import type { BudgetSuggestion, ExtendedBudgetSuggestion } from '@/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  Calculator,
  CreditCard,
  PiggyBank,
  TrendingUp,
  User,
  MessageSquareText,
  Download,
  Share2,
  ChevronRight,
  Landmark,
  Home,
  ArrowRight,
} from 'lucide-react';

type Props = {
  suggestions: BudgetSuggestion[];
  extendedSuggestions?: ExtendedBudgetSuggestion[];
  onAskAnotherQuestion?: () => void;
};

type CalculatorLink = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  available: boolean;
};

/**
 * Determine which calculators are most relevant based on suggestion categories
 */
function getRelevantCalculators(
  suggestions: BudgetSuggestion[],
  extendedSuggestions?: ExtendedBudgetSuggestion[]
): CalculatorLink[] {
  const allCalculators: CalculatorLink[] = [
    {
      id: 'debt-payoff',
      title: 'Debt Payoff Calculator',
      description: 'See exactly when you\'ll be debt-free',
      href: '/calculators/debt-payoff',
      icon: CreditCard,
      available: false, // Phase 12
    },
    {
      id: 'savings',
      title: 'Savings Growth Calculator',
      description: 'Project your savings over time',
      href: '/calculators/savings',
      icon: PiggyBank,
      available: false, // Phase 12
    },
    {
      id: 'retirement',
      title: 'Retirement Calculator',
      description: 'Check your retirement readiness',
      href: '/calculators/retirement',
      icon: Landmark,
      available: false, // Phase 12
    },
    {
      id: 'mortgage',
      title: 'Mortgage Calculator',
      description: 'Explore home buying scenarios',
      href: '/calculators/mortgage',
      icon: Home,
      available: false, // Phase 12
    },
  ];

  // Prioritize calculators based on suggestion categories
  const categories = new Set<string>();
  
  // Check extended suggestions for categories
  if (extendedSuggestions) {
    extendedSuggestions.forEach(s => categories.add(s.category));
  }

  // Also check suggestion titles/descriptions for keywords
  suggestions.forEach(s => {
    const text = `${s.title} ${s.description}`.toLowerCase();
    if (text.includes('debt') || text.includes('credit') || text.includes('loan')) {
      categories.add('debt');
    }
    if (text.includes('sav') || text.includes('emergency fund')) {
      categories.add('savings');
    }
    if (text.includes('retire') || text.includes('401k') || text.includes('ira')) {
      categories.add('retirement');
    }
    if (text.includes('house') || text.includes('home') || text.includes('mortgage')) {
      categories.add('home');
    }
  });

  // Order by relevance
  const orderedIds: string[] = [];
  if (categories.has('debt')) orderedIds.push('debt-payoff');
  if (categories.has('savings')) orderedIds.push('savings');
  if (categories.has('retirement')) orderedIds.push('retirement');
  if (categories.has('home')) orderedIds.push('mortgage');

  // Add remaining calculators
  allCalculators.forEach(c => {
    if (!orderedIds.includes(c.id)) orderedIds.push(c.id);
  });

  // Return ordered calculators, limited to 3
  return orderedIds
    .slice(0, 3)
    .map(id => allCalculators.find(c => c.id === id)!)
    .filter(Boolean);
}

function ActionCard({
  icon: Icon,
  title,
  description,
  href,
  onClick,
  disabled,
  badge,
  variant = 'default',
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  variant?: 'default' | 'primary';
}) {
  const content = (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-lg border p-4 transition-all',
        disabled
          ? 'opacity-50 cursor-not-allowed bg-muted/30'
          : variant === 'primary'
          ? 'border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10 cursor-pointer'
          : 'hover:border-primary/30 hover:bg-accent/50 cursor-pointer'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          variant === 'primary'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{title}</span>
          {badge && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground truncate">
          {description}
        </p>
      </div>
      <ChevronRight
        className={cn(
          'h-5 w-5 text-muted-foreground transition-transform',
          !disabled && 'group-hover:translate-x-1 group-hover:text-primary'
        )}
      />
    </div>
  );

  if (disabled) {
    return content;
  }

  if (href) {
    // Use type assertion for placeholder routes that don't exist yet
    return <Link href={href as never}>{content}</Link>;
  }

  return (
    <button onClick={onClick} className="w-full text-left">
      {content}
    </button>
  );
}

export function NextActionsCard({
  suggestions,
  extendedSuggestions,
  onAskAnotherQuestion,
}: Props) {
  const relevantCalculators = getRelevantCalculators(suggestions, extendedSuggestions);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRight className="h-4 w-4" />
          What&apos;s Next?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Primary action: Edit profile */}
        <ActionCard
          icon={User}
          title="Update Your Profile"
          description="Adjust your financial philosophy, goals, or preferences"
          href="/settings/profile"
          variant="default"
        />

        {/* Ask another question */}
        {onAskAnotherQuestion && (
          <ActionCard
            icon={MessageSquareText}
            title="Ask Another Question"
            description="Get guidance on a different financial topic"
            onClick={onAskAnotherQuestion}
            variant="primary"
          />
        )}

        {/* Relevant calculators */}
        {relevantCalculators.map(calc => (
          <ActionCard
            key={calc.id}
            icon={calc.icon}
            title={calc.title}
            description={calc.description}
            href={calc.href}
            disabled={!calc.available}
            badge={!calc.available ? 'Coming Soon' : undefined}
          />
        ))}

        {/* Export/Share (future) */}
        <div className="pt-2 border-t border-border">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              disabled
            >
              <Download className="h-4 w-4" />
              Export PDF
              <Badge variant="secondary" className="ml-auto text-xs">
                Soon
              </Badge>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              disabled
            >
              <Share2 className="h-4 w-4" />
              Share
              <Badge variant="secondary" className="ml-auto text-xs">
                Soon
              </Badge>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
