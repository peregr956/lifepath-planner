/**
 * Phase 8.5.3: Foundational Questions
 * 
 * Question definitions, options, and explanations for the foundational
 * context gathering step. These questions establish the user's financial
 * worldview before budget-specific AI questions.
 */

import type { 
  FinancialPhilosophy, 
  RiskTolerance, 
  GoalTimeline, 
  LifeStage, 
  EmergencyFundStatus 
} from '@/types/budget';

/**
 * Option definition with value, label, and optional description
 */
export type FoundationalOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

/**
 * Question definition with metadata for rendering
 */
export type FoundationalQuestionDef<T extends string> = {
  id: string;
  fieldKey: string;
  title: string;
  prompt: string;
  whyWeAsk: string;
  learnMore?: string;
  options: FoundationalOption<T>[];
  allowCustom?: boolean;
};

// =============================================================================
// Financial Philosophy Options
// =============================================================================

export const FINANCIAL_PHILOSOPHY_OPTIONS: FoundationalOption<FinancialPhilosophy>[] = [
  {
    value: 'neutral',
    label: 'No specific approach',
    description: "I don't follow any particular framework",
  },
  {
    value: 'r_personalfinance',
    label: 'r/personalfinance Prime Directive',
    description: 'Reddit community flowchart: emergency fund → employer match → high-interest debt → max retirement',
  },
  {
    value: 'money_guy',
    label: 'Money Guy FOO',
    description: 'Financial Order of Operations: 9-step wealth building framework',
  },
  {
    value: 'dave_ramsey',
    label: 'Dave Ramsey Baby Steps',
    description: 'Debt snowball, $1000 starter fund, then full emergency fund',
  },
  {
    value: 'bogleheads',
    label: 'Bogleheads',
    description: 'Low-cost index fund investing, live below your means',
  },
  {
    value: 'fire',
    label: 'FIRE Movement',
    description: 'Financial Independence, Retire Early through aggressive saving',
  },
  {
    value: 'custom',
    label: 'My own approach',
    description: "I have a personal strategy that works for me",
  },
];

export const FINANCIAL_PHILOSOPHY_QUESTION: FoundationalQuestionDef<FinancialPhilosophy> = {
  id: 'financial_philosophy',
  fieldKey: 'financialPhilosophy',
  title: 'Financial Philosophy',
  prompt: 'Do you follow a particular budgeting or financial approach?',
  whyWeAsk: 'Different frameworks prioritize things differently. Knowing your approach helps us give advice that aligns with your values.',
  learnMore: 'For example, Dave Ramsey prioritizes paying off all debt before investing, while r/personalfinance suggests balancing debt payoff with retirement savings.',
  options: FINANCIAL_PHILOSOPHY_OPTIONS,
};

// =============================================================================
// Risk Tolerance Options
// =============================================================================

export const RISK_TOLERANCE_OPTIONS: FoundationalOption<RiskTolerance>[] = [
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Prefer stability and guaranteed returns over potential growth',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    description: 'Balanced approach with some risk for reasonable growth',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Comfortable with volatility for maximum long-term growth potential',
  },
];

export const RISK_TOLERANCE_QUESTION: FoundationalQuestionDef<RiskTolerance> = {
  id: 'risk_tolerance',
  fieldKey: 'riskTolerance',
  title: 'Risk Tolerance',
  prompt: 'How comfortable are you with financial risk?',
  whyWeAsk: 'Your risk comfort affects whether we suggest aggressive debt payoff vs. investing, or high-yield savings vs. market investments.',
  options: RISK_TOLERANCE_OPTIONS,
};

// =============================================================================
// Goal Timeline Options
// =============================================================================

export const GOAL_TIMELINE_OPTIONS: FoundationalOption<GoalTimeline>[] = [
  {
    value: 'immediate',
    label: 'Immediate (< 1 year)',
    description: 'Need to achieve this within the next 12 months',
  },
  {
    value: 'short_term',
    label: 'Short-term (1-3 years)',
    description: 'Planning for the next few years',
  },
  {
    value: 'medium_term',
    label: 'Medium-term (3-10 years)',
    description: 'Thinking several years ahead',
  },
  {
    value: 'long_term',
    label: 'Long-term (10+ years)',
    description: 'Planning for the distant future or retirement',
  },
];

export const GOAL_TIMELINE_QUESTION: FoundationalQuestionDef<GoalTimeline> = {
  id: 'goal_timeline',
  fieldKey: 'goalTimeline',
  title: 'Goal Timeline',
  prompt: 'What is your timeline for your primary financial goal?',
  whyWeAsk: 'Urgency changes the strategy. Short-term goals need safer money, while long-term goals can weather more volatility.',
  options: GOAL_TIMELINE_OPTIONS,
};

// =============================================================================
// Life Stage Options
// =============================================================================

export const LIFE_STAGE_OPTIONS: FoundationalOption<LifeStage>[] = [
  {
    value: 'early_career',
    label: 'Early Career',
    description: 'Just starting out, building foundational savings',
  },
  {
    value: 'mid_career',
    label: 'Mid-Career',
    description: 'Established career, actively building wealth',
  },
  {
    value: 'family_building',
    label: 'Family Building',
    description: 'Starting or raising a family, major life expenses',
  },
  {
    value: 'peak_earning',
    label: 'Peak Earning Years',
    description: 'Highest income years, maximizing savings and catch-up',
  },
  {
    value: 'pre_retirement',
    label: 'Pre-Retirement',
    description: 'Within 5-10 years of retirement, shifting to preservation',
  },
  {
    value: 'retired',
    label: 'Retired',
    description: 'Drawing down savings, managing retirement income',
  },
];

export const LIFE_STAGE_QUESTION: FoundationalQuestionDef<LifeStage> = {
  id: 'life_stage',
  fieldKey: 'lifeStage',
  title: 'Life Stage',
  prompt: 'Which best describes your current life stage?',
  whyWeAsk: 'Life stage affects everything from risk tolerance to tax strategies. Early career advice differs significantly from pre-retirement planning.',
  options: LIFE_STAGE_OPTIONS,
};

// =============================================================================
// Emergency Fund Status Options
// =============================================================================

export const EMERGENCY_FUND_OPTIONS: FoundationalOption<EmergencyFundStatus>[] = [
  {
    value: 'none',
    label: 'No emergency fund',
    description: "I don't have dedicated emergency savings",
  },
  {
    value: 'partial',
    label: 'Partial (1-2 months)',
    description: 'Some savings but less than 3 months of expenses',
  },
  {
    value: 'adequate',
    label: 'Adequate (3-6 months)',
    description: 'I have 3-6 months of expenses saved',
  },
  {
    value: 'robust',
    label: 'Robust (6+ months)',
    description: 'I have more than 6 months of expenses saved',
  },
];

export const EMERGENCY_FUND_QUESTION: FoundationalQuestionDef<EmergencyFundStatus> = {
  id: 'emergency_fund',
  fieldKey: 'hasEmergencyFund',
  title: 'Emergency Fund',
  prompt: 'Do you have an emergency fund?',
  whyWeAsk: 'If you already have adequate savings, we can focus on other goals. If not, we may suggest building one depending on your situation.',
  options: EMERGENCY_FUND_OPTIONS,
};

// =============================================================================
// Primary Goal (free-text with common suggestions)
// =============================================================================

export const COMMON_GOALS = [
  'Pay off debt',
  'Build emergency fund',
  'Save for house down payment',
  'Save for retirement',
  'Reduce monthly expenses',
  'Start investing',
  'Save for a major purchase',
  'Build wealth long-term',
];

export const PRIMARY_GOAL_QUESTION = {
  id: 'primary_goal',
  fieldKey: 'primaryGoal',
  title: 'Primary Goal',
  prompt: "What's your primary financial goal right now?",
  whyWeAsk: 'We tailor all suggestions to help you achieve what matters most to you.',
  placeholder: 'e.g., Pay off credit card debt, Save for house down payment',
  suggestions: COMMON_GOALS,
};

// =============================================================================
// All Questions (ordered for the flow)
// =============================================================================

export const FOUNDATIONAL_QUESTIONS = [
  PRIMARY_GOAL_QUESTION,
  GOAL_TIMELINE_QUESTION,
  FINANCIAL_PHILOSOPHY_QUESTION,
  RISK_TOLERANCE_QUESTION,
  LIFE_STAGE_QUESTION,
  EMERGENCY_FUND_QUESTION,
] as const;

/**
 * Get a human-readable label for a financial philosophy value
 */
export function getPhilosophyLabel(value: FinancialPhilosophy | null | undefined): string {
  if (!value) return 'Not specified';
  const option = FINANCIAL_PHILOSOPHY_OPTIONS.find(o => o.value === value);
  return option?.label || value;
}

/**
 * Get a human-readable label for a risk tolerance value
 */
export function getRiskToleranceLabel(value: RiskTolerance | null | undefined): string {
  if (!value) return 'Not specified';
  const option = RISK_TOLERANCE_OPTIONS.find(o => o.value === value);
  return option?.label || value;
}

/**
 * Get a human-readable label for a goal timeline value
 */
export function getGoalTimelineLabel(value: GoalTimeline | null | undefined): string {
  if (!value) return 'Not specified';
  const option = GOAL_TIMELINE_OPTIONS.find(o => o.value === value);
  return option?.label || value;
}

/**
 * Get a human-readable label for a life stage value
 */
export function getLifeStageLabel(value: LifeStage | null | undefined): string {
  if (!value) return 'Not specified';
  const option = LIFE_STAGE_OPTIONS.find(o => o.value === value);
  return option?.label || value;
}

/**
 * Get a human-readable label for an emergency fund status
 */
export function getEmergencyFundLabel(value: EmergencyFundStatus | null | undefined): string {
  if (!value) return 'Not specified';
  const option = EMERGENCY_FUND_OPTIONS.find(o => o.value === value);
  return option?.label || value;
}

/**
 * Get a human-readable label for a primary goal value
 */
export function getPrimaryGoalLabel(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  return value;
}

// =============================================================================
// Why We Ask Explanations (for reuse in profile settings)
// =============================================================================

export const WHY_WE_ASK = {
  primaryGoal: 'We tailor all suggestions to help you achieve what matters most to you.',
  goalTimeline: 'Urgency changes the strategy. Short-term goals need safer money, while long-term goals can weather more volatility.',
  financialPhilosophy: 'Different frameworks prioritize things differently. Knowing your approach helps us give advice that aligns with your values.',
  riskTolerance: 'Your risk comfort affects whether we suggest aggressive debt payoff vs. investing, or high-yield savings vs. market investments.',
  lifeStage: 'Life stage affects everything from risk tolerance to tax strategies. Early career advice differs significantly from pre-retirement planning.',
  hasEmergencyFund: 'If you already have adequate savings, we can focus on other goals. If not, we may suggest building one depending on your situation.',
  optimizationFocus: 'This determines whether we prioritize debt payoff, building savings, or a balanced approach in our recommendations.',
} as const;

// =============================================================================
// Optimization Focus Options (for profile settings)
// =============================================================================

export type OptimizationFocus = 'debt_payoff' | 'savings' | 'balanced';

export const OPTIMIZATION_FOCUS_OPTIONS: FoundationalOption<OptimizationFocus>[] = [
  {
    value: 'debt_payoff',
    label: 'Debt Payoff',
    description: 'Prioritize eliminating debt as quickly as possible',
  },
  {
    value: 'savings',
    label: 'Savings & Investment',
    description: 'Focus on building savings and investment accounts',
  },
  {
    value: 'balanced',
    label: 'Balanced Approach',
    description: 'Balance debt payoff with saving for the future',
  },
];

export function getOptimizationFocusLabel(value: string | null | undefined): string {
  if (!value) return 'Not specified';
  const option = OPTIMIZATION_FOCUS_OPTIONS.find(o => o.value === value);
  return option?.label || value;
}
