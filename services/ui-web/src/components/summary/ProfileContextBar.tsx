'use client';

import Link from 'next/link';
import type {
  FinancialPhilosophy,
  RiskTolerance,
  FoundationalContext,
  HydratedFoundationalContext,
} from '@/types';
import { getPlainFoundationalContext } from '@/types/budget';
import { Badge, Button, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  Target,
  Shield,
  Compass,
  Clock,
  User,
  PiggyBank,
  Settings,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';

type Props = {
  foundationalContext?: FoundationalContext | null;
  hydratedContext?: HydratedFoundationalContext | null;
  completionPercent?: number;
};

const philosophyLabels: Record<FinancialPhilosophy, string> = {
  r_personalfinance: 'r/personalfinance',
  money_guy: 'Money Guy Show',
  dave_ramsey: 'Dave Ramsey',
  bogleheads: 'Bogleheads',
  fire: 'FIRE',
  neutral: 'General',
  custom: 'Custom',
};

const riskLabels: Record<RiskTolerance, string> = {
  conservative: 'Conservative',
  moderate: 'Moderate',
  aggressive: 'Aggressive',
};

function ContextBadge({
  icon: Icon,
  label,
  value,
  fromAccount,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  fromAccount?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Badge
        variant="outline"
        className={cn(
          'gap-1.5 py-1',
          fromAccount && 'border-primary/30 bg-primary/5'
        )}
      >
        <Icon className="h-3 w-3" />
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{value}</span>
        {fromAccount && (
          <CheckCircle2 className="h-3 w-3 text-primary" />
        )}
      </Badge>
    </div>
  );
}

export function ProfileContextBar({
  foundationalContext,
  hydratedContext,
  completionPercent = 0,
}: Props) {
  // Phase 9.1.5: Derive effective context from hydrated context if foundational is empty
  // This ensures we use account profile data even if session foundational context is null
  const effectiveContext: FoundationalContext | null = foundationalContext ?? 
    (hydratedContext ? getPlainFoundationalContext(hydratedContext) : null);

  // Check what context is available from the effective context
  const hasPhilosophy = effectiveContext?.financialPhilosophy && effectiveContext.financialPhilosophy !== 'neutral';
  const hasRiskTolerance = !!effectiveContext?.riskTolerance;
  const hasPrimaryGoal = !!effectiveContext?.primaryGoal;
  const hasTimeline = !!effectiveContext?.goalTimeline;
  const hasLifeStage = !!effectiveContext?.lifeStage;
  const hasEmergencyFund = !!effectiveContext?.hasEmergencyFund;

  const hasAnyContext = hasPhilosophy || hasRiskTolerance || hasPrimaryGoal || hasTimeline || hasLifeStage || hasEmergencyFund;

  // Check if values came from account (hydrated)
  const philosophyFromAccount = hydratedContext?.financialPhilosophy?.source === 'account';
  const riskFromAccount = hydratedContext?.riskTolerance?.source === 'account';
  const goalFromAccount = hydratedContext?.primaryGoal?.source === 'account';
  const timelineFromAccount = hydratedContext?.goalTimeline?.source === 'account';
  const lifeStageFromAccount = hydratedContext?.lifeStage?.source === 'account';
  const emergencyFundFromAccount = hydratedContext?.hasEmergencyFund?.source === 'account';

  // If no context at all, show prompt to complete profile
  if (!hasAnyContext) {
    return (
      <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Complete your profile for better results
              </p>
              <p className="text-xs text-muted-foreground">
                Tell us about your financial goals and preferences
              </p>
            </div>
          </div>
          <Link href="/settings/profile">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Set Up Profile
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        {completionPercent > 0 && (
          <div className="mt-2">
            <Progress value={completionPercent} className="h-1" />
            <p className="mt-1 text-xs text-muted-foreground">
              {completionPercent}% complete
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your Profile
          </span>
          
          {hasPhilosophy && effectiveContext?.financialPhilosophy && (
            <ContextBadge
              icon={Compass}
              label="Approach"
              value={philosophyLabels[effectiveContext.financialPhilosophy]}
              fromAccount={philosophyFromAccount}
            />
          )}
          
          {hasRiskTolerance && effectiveContext?.riskTolerance && (
            <ContextBadge
              icon={Shield}
              label="Risk"
              value={riskLabels[effectiveContext.riskTolerance]}
              fromAccount={riskFromAccount}
            />
          )}
          
          {hasPrimaryGoal && effectiveContext?.primaryGoal && (
            <ContextBadge
              icon={Target}
              label="Goal"
              value={effectiveContext.primaryGoal}
              fromAccount={goalFromAccount}
            />
          )}
          
          {hasTimeline && effectiveContext?.goalTimeline && (
            <ContextBadge
              icon={Clock}
              label="Timeline"
              value={effectiveContext.goalTimeline.replace('_', ' ')}
              fromAccount={timelineFromAccount}
            />
          )}
          
          {hasLifeStage && effectiveContext?.lifeStage && (
            <ContextBadge
              icon={User}
              label="Stage"
              value={effectiveContext.lifeStage.replace('_', ' ')}
              fromAccount={lifeStageFromAccount}
            />
          )}
          
          {hasEmergencyFund && effectiveContext?.hasEmergencyFund && (
            <ContextBadge
              icon={PiggyBank}
              label="Emergency Fund"
              value={effectiveContext.hasEmergencyFund.replace('_', ' ')}
              fromAccount={emergencyFundFromAccount}
            />
          )}
        </div>
        
        <Link href="/settings/profile">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <Settings className="h-3.5 w-3.5" />
            Edit
          </Button>
        </Link>
      </div>
    </div>
  );
}
