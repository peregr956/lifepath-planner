'use client';

import { useState, useMemo, useCallback } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Progress,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Badge,
} from '@/components/ui';
import { 
  Sparkles, 
  HelpCircle, 
  ChevronRight, 
  SkipForward,
  CheckCircle2,
  Target,
  Shield,
  Clock,
  User,
  PiggyBank,
  Compass,
  UserCircle,
} from 'lucide-react';
import type { 
  FoundationalContext, 
  FinancialPhilosophy, 
  RiskTolerance, 
  GoalTimeline, 
  LifeStage, 
  EmergencyFundStatus,
  HydratedFoundationalContext,
} from '@/types/budget';
import { 
  getFoundationalCompletionPercent,
  getPlainFoundationalContext,
  getHydratedCompletionPercent,
} from '@/types/budget';
import {
  FINANCIAL_PHILOSOPHY_OPTIONS,
  RISK_TOLERANCE_OPTIONS,
  GOAL_TIMELINE_OPTIONS,
  LIFE_STAGE_OPTIONS,
  EMERGENCY_FUND_OPTIONS,
  COMMON_GOALS,
} from '@/lib/foundationalQuestions';

type Props = {
  initialContext?: FoundationalContext | null;
  // Phase 9.1.2: Hydrated context with source tracking
  hydratedContext?: HydratedFoundationalContext | null;
  onComplete: (context: FoundationalContext) => void;
  onSkip: () => void;
  disabled?: boolean;
  // Phase 9.1.2: Show condensed view for users with mostly-complete profiles
  showCondensed?: boolean;
};

// Icons for each question type
const QUESTION_ICONS = {
  primaryGoal: Target,
  goalTimeline: Clock,
  financialPhilosophy: Compass,
  riskTolerance: Shield,
  lifeStage: User,
  hasEmergencyFund: PiggyBank,
};

// Why we ask explanations
const WHY_WE_ASK = {
  primaryGoal: 'We tailor all suggestions to help you achieve what matters most to you.',
  goalTimeline: 'Urgency changes the strategy. Short-term goals need safer money, while long-term goals can weather more volatility.',
  financialPhilosophy: 'Different frameworks prioritize things differently. Knowing your approach helps us give advice that aligns with your values.',
  riskTolerance: 'Your risk comfort affects whether we suggest aggressive debt payoff vs. investing, or high-yield savings vs. market investments.',
  lifeStage: 'Life stage affects everything from risk tolerance to tax strategies. Early career advice differs significantly from pre-retirement planning.',
  hasEmergencyFund: 'If you already have adequate savings, we can focus on other goals. If not, we may suggest building one depending on your situation.',
};

export function FoundationalQuestions({ 
  initialContext, 
  hydratedContext,
  onComplete, 
  onSkip,
  disabled = false,
  showCondensed = false,
}: Props) {
  // Phase 9.1.2: Derive initial values from hydrated context if available
  const derivedInitialContext = useMemo(() => {
    if (hydratedContext) {
      return getPlainFoundationalContext(hydratedContext);
    }
    return initialContext ?? {};
  }, [hydratedContext, initialContext]);

  // Local state for form values
  const [context, setContext] = useState<FoundationalContext>(() => ({
    financialPhilosophy: derivedInitialContext?.financialPhilosophy ?? null,
    riskTolerance: derivedInitialContext?.riskTolerance ?? null,
    primaryGoal: derivedInitialContext?.primaryGoal ?? null,
    goalTimeline: derivedInitialContext?.goalTimeline ?? null,
    lifeStage: derivedInitialContext?.lifeStage ?? null,
    hasEmergencyFund: derivedInitialContext?.hasEmergencyFund ?? null,
  }));

  // Phase 9.1.2: Track which fields have been modified this session
  const [modifiedFields, setModifiedFields] = useState<Set<keyof FoundationalContext>>(new Set());

  const [customGoal, setCustomGoal] = useState(
    derivedInitialContext?.primaryGoal && !COMMON_GOALS.includes(derivedInitialContext.primaryGoal)
      ? derivedInitialContext.primaryGoal
      : ''
  );
  const [showCustomGoal, setShowCustomGoal] = useState(
    derivedInitialContext?.primaryGoal && !COMMON_GOALS.includes(derivedInitialContext.primaryGoal ?? '')
  );

  // Phase 9.1.2: Use hydrated completion if available, otherwise plain
  const completionPercent = useMemo(() => {
    if (hydratedContext) {
      return getHydratedCompletionPercent(hydratedContext);
    }
    return getFoundationalCompletionPercent(context);
  }, [hydratedContext, context]);

  // Phase 9.1.2: Check if a field is from account profile (not modified this session)
  const isFromAccount = useCallback((field: keyof FoundationalContext): boolean => {
    if (modifiedFields.has(field)) return false;
    if (!hydratedContext) return false;
    const hydratedField = hydratedContext[field];
    return hydratedField?.source === 'account' && hydratedField?.value !== null;
  }, [hydratedContext, modifiedFields]);

  // Count how many fields are using saved preferences
  const savedPreferencesCount = useMemo(() => {
    if (!hydratedContext) return 0;
    const fields: (keyof FoundationalContext)[] = [
      'financialPhilosophy', 'riskTolerance', 'primaryGoal', 
      'goalTimeline', 'lifeStage', 'hasEmergencyFund'
    ];
    return fields.filter(f => isFromAccount(f)).length;
  }, [hydratedContext, isFromAccount]);

  const handleContinue = () => {
    const finalContext = {
      ...context,
      primaryGoal: showCustomGoal ? customGoal : context.primaryGoal,
    };
    onComplete(finalContext);
  };

  // Phase 9.1.2: Track field modifications
  const updateField = <K extends keyof FoundationalContext>(
    field: K,
    value: FoundationalContext[K]
  ) => {
    setContext(prev => ({ ...prev, [field]: value }));
    // Mark as modified to remove "using saved preference" indicator
    setModifiedFields(prev => new Set(prev).add(field));
  };

  const handleGoalChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomGoal(true);
      updateField('primaryGoal', null);
    } else {
      setShowCustomGoal(false);
      setCustomGoal('');
      updateField('primaryGoal', value);
    }
  };

  const handleCustomGoalChange = (value: string) => {
    setCustomGoal(value);
    setModifiedFields(prev => new Set(prev).add('primaryGoal'));
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 animate-fade-in">
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  Help us understand you better
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>These optional questions help us give you more personalized advice that matches your financial style and goals.</p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <CardDescription>
                  Answer a few quick questions to get better recommendations
                </CardDescription>
              </div>
            </div>
            
            {/* Progress indicator */}
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Profile completeness</span>
                <span>{completionPercent}%</span>
              </div>
              <Progress value={completionPercent} className="h-2" />
            </div>

            {/* Phase 9.1.2: Show when using saved preferences */}
            {savedPreferencesCount > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
                <UserCircle className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary">
                  Using {savedPreferencesCount} saved preference{savedPreferencesCount !== 1 ? 's' : ''} from your profile
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Primary Goal */}
            <QuestionRow
              icon={QUESTION_ICONS.primaryGoal}
              title="What's your primary financial goal right now?"
              whyWeAsk={WHY_WE_ASK.primaryGoal}
              answered={!!context.primaryGoal || (showCustomGoal === true && !!customGoal)}
              isFromAccount={isFromAccount('primaryGoal')}
            >
              <div className="space-y-2">
                <Select
                  value={showCustomGoal ? '__custom__' : (context.primaryGoal || '')}
                  onValueChange={handleGoalChange}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a goal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_GOALS.map(goal => (
                      <SelectItem key={goal} value={goal}>{goal}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">Other (specify)</SelectItem>
                  </SelectContent>
                </Select>
                {showCustomGoal && (
                  <Input
                    placeholder="Describe your goal..."
                    value={customGoal}
                    onChange={e => handleCustomGoalChange(e.target.value)}
                    disabled={disabled}
                    className="animate-fade-in"
                  />
                )}
              </div>
            </QuestionRow>

            {/* Goal Timeline */}
            <QuestionRow
              icon={QUESTION_ICONS.goalTimeline}
              title="What's your timeline for this goal?"
              whyWeAsk={WHY_WE_ASK.goalTimeline}
              answered={!!context.goalTimeline}
              isFromAccount={isFromAccount('goalTimeline')}
            >
              <Select
                value={context.goalTimeline || ''}
                onValueChange={v => updateField('goalTimeline', v as GoalTimeline)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select timeline..." />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_TIMELINE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <div>{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </QuestionRow>

            {/* Financial Philosophy */}
            <QuestionRow
              icon={QUESTION_ICONS.financialPhilosophy}
              title="Do you follow a particular budgeting approach?"
              whyWeAsk={WHY_WE_ASK.financialPhilosophy}
              answered={!!context.financialPhilosophy}
              isFromAccount={isFromAccount('financialPhilosophy')}
              learnMore="For example, Dave Ramsey prioritizes paying off all debt before investing, while r/personalfinance suggests balancing debt payoff with retirement savings."
            >
              <Select
                value={context.financialPhilosophy || ''}
                onValueChange={v => updateField('financialPhilosophy', v as FinancialPhilosophy)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select approach..." />
                </SelectTrigger>
                <SelectContent>
                  {FINANCIAL_PHILOSOPHY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <div>{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </QuestionRow>

            {/* Risk Tolerance */}
            <QuestionRow
              icon={QUESTION_ICONS.riskTolerance}
              title="How comfortable are you with financial risk?"
              whyWeAsk={WHY_WE_ASK.riskTolerance}
              answered={!!context.riskTolerance}
              isFromAccount={isFromAccount('riskTolerance')}
            >
              <Select
                value={context.riskTolerance || ''}
                onValueChange={v => updateField('riskTolerance', v as RiskTolerance)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select comfort level..." />
                </SelectTrigger>
                <SelectContent>
                  {RISK_TOLERANCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <div>{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </QuestionRow>

            {/* Life Stage */}
            <QuestionRow
              icon={QUESTION_ICONS.lifeStage}
              title="Which best describes your current life stage?"
              whyWeAsk={WHY_WE_ASK.lifeStage}
              answered={!!context.lifeStage}
              isFromAccount={isFromAccount('lifeStage')}
            >
              <Select
                value={context.lifeStage || ''}
                onValueChange={v => updateField('lifeStage', v as LifeStage)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select life stage..." />
                </SelectTrigger>
                <SelectContent>
                  {LIFE_STAGE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <div>{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </QuestionRow>

            {/* Emergency Fund */}
            <QuestionRow
              icon={QUESTION_ICONS.hasEmergencyFund}
              title="Do you have an emergency fund?"
              whyWeAsk={WHY_WE_ASK.hasEmergencyFund}
              answered={!!context.hasEmergencyFund}
              isFromAccount={isFromAccount('hasEmergencyFund')}
            >
              <Select
                value={context.hasEmergencyFund || ''}
                onValueChange={v => updateField('hasEmergencyFund', v as EmergencyFundStatus)}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {EMERGENCY_FUND_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <div>{opt.label}</div>
                        {opt.description && (
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </QuestionRow>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="ghost"
                onClick={onSkip}
                disabled={disabled}
                className="text-muted-foreground"
              >
                <SkipForward className="mr-2 h-4 w-4" />
                Skip for now
              </Button>
              <Button
                onClick={handleContinue}
                disabled={disabled}
                size="lg"
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              All questions are optional. You can skip and still get useful suggestions.
            </p>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// Internal component for consistent question row layout
type QuestionRowProps = {
  icon: React.ElementType;
  title: string;
  whyWeAsk: string;
  learnMore?: string;
  answered: boolean;
  // Phase 9.1.2: Show "using saved preference" indicator
  isFromAccount?: boolean;
  children: React.ReactNode;
};

function QuestionRow({ 
  icon: Icon, 
  title, 
  whyWeAsk, 
  learnMore,
  answered,
  isFromAccount = false,
  children 
}: QuestionRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className={`
          mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
          ${answered ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}
          transition-colors duration-200
        `}>
          {answered ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm font-medium leading-tight">{title}</label>
            {/* Phase 9.1.2: Show badge when using saved preference */}
            {isFromAccount && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal bg-primary/10 text-primary border-primary/20">
                Saved
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium mb-1">Why we ask:</p>
                <p>{whyWeAsk}</p>
                {learnMore && (
                  <p className="mt-2 text-muted-foreground">{learnMore}</p>
                )}
                {isFromAccount && (
                  <p className="mt-2 text-primary text-xs">
                    This value is from your saved profile. You can change it here for this session.
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
