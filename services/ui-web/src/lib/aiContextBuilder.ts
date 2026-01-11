/**
 * Phase 9.1.4: AI Context Builder
 *
 * Constructs confidence-aware context sections for AI prompts.
 * Enables the AI to reason over layered context with explicit confidence signals,
 * supporting:
 * - Acting decisively on high-confidence preferences
 * - Probing appropriately on lower-confidence data
 * - Surfacing tensions between stated preferences and budget patterns
 */

import type {
  FoundationalContext,
  HydratedFoundationalContext,
  ProfileMetadata,
  FieldMetadata,
  ConfidenceLevel,
  FinancialPhilosophy,
  RiskTolerance,
  GoalTimeline,
  LifeStage,
  EmergencyFundStatus,
} from '@/types/budget';
import type { UserProfile } from '@/lib/db';
import type { UnifiedBudgetModel } from '@/lib/budgetModel';

// ============================================================================
// Types
// ============================================================================

/**
 * A tension signal indicating a discrepancy between profile and budget data
 */
export interface TensionSignal {
  type: 'savings_rate' | 'debt_priority' | 'emergency_fund' | 'risk_behavior' | 'philosophy_mismatch';
  description: string;
  profileValue: string;
  observedValue: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * A context field with its value and confidence metadata
 */
interface ContextField {
  name: string;
  value: string;
  confidence: ConfidenceLevel;
  source: 'explicit' | 'onboarding' | 'session_promoted' | 'inferred' | 'session_explicit';
  lastConfirmed?: string; // ISO date
  annotation?: string; // e.g., "confirmed across 3 sessions"
}

/**
 * Observed patterns from budget data that may inform AI behavior
 */
export interface ObservedPatterns {
  savingsRate: number; // 0-1
  hasHighInterestDebt: boolean;
  debtToIncomeRatio: number;
  emergencyFundMonths: number; // Estimated based on surplus
  primaryExpenseCategories: string[];
}

/**
 * Output from the layered context builder
 */
export interface LayeredContextOutput {
  highConfidenceSection: string;
  mediumConfidenceSection: string;
  sessionContextSection: string;
  observedPatternsSection: string;
  tensionsSection: string;
  guidanceSection: string;
  hasAccountContext: boolean;
  tensionCount: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine confidence level based on metadata
 */
function getEffectiveConfidence(metadata?: FieldMetadata | null): ConfidenceLevel {
  if (!metadata) return 'low';

  // Explicit profile settings are always high confidence
  if (metadata.source === 'explicit') return 'high';

  // Check staleness - if last confirmed > 6 months ago, downgrade
  if (metadata.last_confirmed) {
    const lastConfirmed = new Date(metadata.last_confirmed);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (lastConfirmed < sixMonthsAgo) {
      // Downgrade by one level if stale
      if (metadata.confidence === 'high') return 'medium';
      if (metadata.confidence === 'medium') return 'low';
    }
  }

  return metadata.confidence;
}

/**
 * Get human-readable label for philosophy
 */
function getPhilosophyLabel(philosophy: FinancialPhilosophy | null | undefined): string {
  const labels: Record<FinancialPhilosophy, string> = {
    r_personalfinance: 'r/personalfinance Prime Directive',
    money_guy: 'Money Guy Show FOO',
    dave_ramsey: 'Dave Ramsey Baby Steps',
    bogleheads: 'Bogleheads',
    fire: 'FIRE movement',
    neutral: 'No specific framework',
    custom: 'Custom approach',
  };
  return philosophy ? labels[philosophy] || philosophy : 'not specified';
}

/**
 * Get human-readable label for risk tolerance
 */
function getRiskLabel(risk: RiskTolerance | null | undefined): string {
  const labels: Record<RiskTolerance, string> = {
    conservative: 'Conservative',
    moderate: 'Moderate',
    aggressive: 'Aggressive',
  };
  return risk ? labels[risk] || risk : 'not specified';
}

/**
 * Get human-readable label for goal timeline
 */
function getTimelineLabel(timeline: GoalTimeline | null | undefined): string {
  const labels: Record<GoalTimeline, string> = {
    immediate: 'Immediate (< 1 year)',
    short_term: 'Short-term (1-3 years)',
    medium_term: 'Medium-term (3-10 years)',
    long_term: 'Long-term (10+ years)',
  };
  return timeline ? labels[timeline] || timeline : 'not specified';
}

/**
 * Get human-readable label for life stage
 */
function getLifeStageLabel(stage: LifeStage | null | undefined): string {
  const labels: Record<LifeStage, string> = {
    early_career: 'Early career',
    mid_career: 'Mid-career',
    family_building: 'Family building',
    peak_earning: 'Peak earning years',
    pre_retirement: 'Pre-retirement',
    retired: 'Retired',
  };
  return stage ? labels[stage] || stage : 'not specified';
}

/**
 * Get human-readable label for emergency fund status
 */
function getEmergencyFundLabel(status: EmergencyFundStatus | null | undefined): string {
  const labels: Record<EmergencyFundStatus, string> = {
    none: 'No emergency fund',
    partial: 'Partial (< 3 months)',
    adequate: 'Adequate (3-6 months)',
    robust: 'Robust (6+ months)',
  };
  return status ? labels[status] || status : 'not specified';
}

/**
 * Format a date relative to now
 */
function formatRelativeDate(isoDate: string | undefined): string {
  if (!isoDate) return '';

  const date = new Date(isoDate);
  const now = new Date();
  const diffMonths = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30));

  if (diffMonths < 1) return 'recently';
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;
  return 'over a year ago';
}

// ============================================================================
// Tension Detection
// ============================================================================

/**
 * Detect tensions between stated profile preferences and observed budget patterns
 */
export function detectTensions(
  accountProfile: UserProfile | null,
  foundationalContext: FoundationalContext | null,
  budget: UnifiedBudgetModel
): TensionSignal[] {
  const tensions: TensionSignal[] = [];

  // Use account profile if available, otherwise foundational context
  const philosophy = accountProfile?.default_financial_philosophy || foundationalContext?.financialPhilosophy;
  const riskTolerance = accountProfile?.default_risk_tolerance || foundationalContext?.riskTolerance;
  const emergencyFundStatus = accountProfile?.default_emergency_fund_status || foundationalContext?.hasEmergencyFund;

  // Calculate observed patterns
  const totalIncome = budget.summary.total_income;
  const surplus = budget.summary.surplus;
  const savingsRate = totalIncome > 0 ? surplus / totalIncome : 0;
  const hasHighInterestDebt = budget.debts.some(d => d.interest_rate > 15);

  // Tension 1: Aggressive saver with low savings rate
  if (riskTolerance === 'aggressive' && savingsRate < 0.1 && savingsRate >= 0) {
    tensions.push({
      type: 'savings_rate',
      description: 'Aggressive risk tolerance typically implies high savings capacity, but current savings rate is low.',
      profileValue: 'Aggressive risk tolerance',
      observedValue: `${(savingsRate * 100).toFixed(1)}% savings rate`,
      severity: savingsRate < 0.05 ? 'high' : 'medium',
    });
  }

  // Tension 2: FIRE philosophy with low savings rate
  if (philosophy === 'fire' && savingsRate < 0.25 && savingsRate >= 0) {
    tensions.push({
      type: 'philosophy_mismatch',
      description: 'FIRE philosophy typically targets 25-50%+ savings rate.',
      profileValue: 'FIRE movement approach',
      observedValue: `${(savingsRate * 100).toFixed(1)}% savings rate`,
      severity: savingsRate < 0.15 ? 'high' : 'medium',
    });
  }

  // Tension 3: Dave Ramsey approach with no debt payoff focus
  if (philosophy === 'dave_ramsey' && hasHighInterestDebt && budget.preferences.optimization_focus !== 'debt') {
    tensions.push({
      type: 'debt_priority',
      description: 'Dave Ramsey methodology prioritizes debt payoff, but optimization focus is not set to debt.',
      profileValue: 'Dave Ramsey Baby Steps',
      observedValue: `Optimization focus: ${budget.preferences.optimization_focus}, has high-interest debt`,
      severity: 'medium',
    });
  }

  // Tension 4: Claims adequate emergency fund but budget suggests otherwise
  if ((emergencyFundStatus === 'adequate' || emergencyFundStatus === 'robust') && surplus < 0) {
    tensions.push({
      type: 'emergency_fund',
      description: 'Profile indicates adequate emergency fund, but budget shows deficit. Verify emergency fund status.',
      profileValue: getEmergencyFundLabel(emergencyFundStatus as EmergencyFundStatus),
      observedValue: 'Monthly deficit (negative surplus)',
      severity: 'medium',
    });
  }

  // Tension 5: Conservative risk tolerance but has high-interest debt
  if (riskTolerance === 'conservative' && hasHighInterestDebt) {
    const highestRate = Math.max(...budget.debts.map(d => d.interest_rate));
    tensions.push({
      type: 'risk_behavior',
      description: 'Conservative risk tolerance may conflict with carrying high-interest debt.',
      profileValue: 'Conservative risk tolerance',
      observedValue: `High-interest debt at ${highestRate.toFixed(1)}% APR`,
      severity: highestRate > 20 ? 'high' : 'low',
    });
  }

  return tensions;
}

/**
 * Extract observed patterns from budget data
 */
export function extractObservedPatterns(budget: UnifiedBudgetModel): ObservedPatterns {
  const totalIncome = budget.summary.total_income;
  const surplus = budget.summary.surplus;
  const totalDebt = budget.debts.reduce((sum, d) => sum + d.balance, 0);
  const totalDebtPayments = budget.debts.reduce((sum, d) => sum + d.min_payment, 0);

  // Calculate savings rate (0-1)
  const savingsRate = totalIncome > 0 ? Math.max(0, surplus / totalIncome) : 0;

  // Check for high-interest debt
  const hasHighInterestDebt = budget.debts.some(d => d.interest_rate > 15);

  // Debt-to-income ratio (using annual income)
  const annualIncome = totalIncome * 12;
  const debtToIncomeRatio = annualIncome > 0 ? totalDebt / annualIncome : 0;

  // Estimate emergency fund months based on surplus and expenses
  const monthlyExpenses = budget.summary.total_expenses;
  const emergencyFundMonths = monthlyExpenses > 0 && surplus > 0 ? surplus / monthlyExpenses : 0;

  // Top expense categories
  const sortedExpenses = [...budget.expenses].sort((a, b) => b.monthly_amount - a.monthly_amount);
  const primaryExpenseCategories = sortedExpenses.slice(0, 3).map(e => e.category);

  return {
    savingsRate,
    hasHighInterestDebt,
    debtToIncomeRatio,
    emergencyFundMonths,
    primaryExpenseCategories,
  };
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build context fields from account profile with metadata
 */
function buildAccountContextFields(
  profile: UserProfile,
  metadata: ProfileMetadata | null
): ContextField[] {
  const fields: ContextField[] = [];

  if (profile.default_financial_philosophy) {
    const fieldMeta = metadata?.financial_philosophy;
    const confidence = getEffectiveConfidence(fieldMeta);
    fields.push({
      name: 'Financial Philosophy',
      value: getPhilosophyLabel(profile.default_financial_philosophy as FinancialPhilosophy),
      confidence,
      source: fieldMeta?.source || 'explicit',
      lastConfirmed: fieldMeta?.last_confirmed,
      annotation: confidence === 'high' ? 'explicitly set in profile' : undefined,
    });
  }

  if (profile.default_risk_tolerance) {
    const fieldMeta = metadata?.risk_tolerance;
    const confidence = getEffectiveConfidence(fieldMeta);
    fields.push({
      name: 'Risk Tolerance',
      value: getRiskLabel(profile.default_risk_tolerance as RiskTolerance),
      confidence,
      source: fieldMeta?.source || 'explicit',
      lastConfirmed: fieldMeta?.last_confirmed,
    });
  }

  if (profile.default_primary_goal) {
    const fieldMeta = metadata?.primary_goal;
    const confidence = getEffectiveConfidence(fieldMeta);
    fields.push({
      name: 'Primary Goal',
      value: profile.default_primary_goal,
      confidence,
      source: fieldMeta?.source || 'explicit',
      lastConfirmed: fieldMeta?.last_confirmed,
    });
  }

  if (profile.default_goal_timeline) {
    const fieldMeta = metadata?.goal_timeline;
    const confidence = getEffectiveConfidence(fieldMeta);
    fields.push({
      name: 'Goal Timeline',
      value: getTimelineLabel(profile.default_goal_timeline as GoalTimeline),
      confidence,
      source: fieldMeta?.source || 'explicit',
      lastConfirmed: fieldMeta?.last_confirmed,
    });
  }

  if (profile.default_life_stage) {
    const fieldMeta = metadata?.life_stage;
    const confidence = getEffectiveConfidence(fieldMeta);
    fields.push({
      name: 'Life Stage',
      value: getLifeStageLabel(profile.default_life_stage as LifeStage),
      confidence,
      source: fieldMeta?.source || 'explicit',
      lastConfirmed: fieldMeta?.last_confirmed,
    });
  }

  if (profile.default_emergency_fund_status) {
    const fieldMeta = metadata?.emergency_fund_status;
    const confidence = getEffectiveConfidence(fieldMeta);
    fields.push({
      name: 'Emergency Fund',
      value: getEmergencyFundLabel(profile.default_emergency_fund_status as EmergencyFundStatus),
      confidence,
      source: fieldMeta?.source || 'explicit',
      lastConfirmed: fieldMeta?.last_confirmed,
    });
  }

  return fields;
}

/**
 * Build context fields from session foundational context
 */
function buildSessionContextFields(
  hydratedContext: HydratedFoundationalContext | null,
  plainContext: FoundationalContext | null
): ContextField[] {
  const fields: ContextField[] = [];
  const context = hydratedContext || {};

  // Check each field for session-explicit values
  if (hydratedContext?.financialPhilosophy?.source === 'session_explicit') {
    fields.push({
      name: 'Financial Philosophy',
      value: getPhilosophyLabel(hydratedContext.financialPhilosophy.value),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  } else if (plainContext?.financialPhilosophy) {
    fields.push({
      name: 'Financial Philosophy',
      value: getPhilosophyLabel(plainContext.financialPhilosophy),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  }

  if (hydratedContext?.riskTolerance?.source === 'session_explicit') {
    fields.push({
      name: 'Risk Tolerance',
      value: getRiskLabel(hydratedContext.riskTolerance.value),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  } else if (plainContext?.riskTolerance) {
    fields.push({
      name: 'Risk Tolerance',
      value: getRiskLabel(plainContext.riskTolerance),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  }

  if (hydratedContext?.primaryGoal?.source === 'session_explicit') {
    fields.push({
      name: 'Primary Goal',
      value: hydratedContext.primaryGoal.value || 'not specified',
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  } else if (plainContext?.primaryGoal) {
    fields.push({
      name: 'Primary Goal',
      value: plainContext.primaryGoal,
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  }

  if (hydratedContext?.goalTimeline?.source === 'session_explicit') {
    fields.push({
      name: 'Goal Timeline',
      value: getTimelineLabel(hydratedContext.goalTimeline.value),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  } else if (plainContext?.goalTimeline) {
    fields.push({
      name: 'Goal Timeline',
      value: getTimelineLabel(plainContext.goalTimeline),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  }

  if (hydratedContext?.lifeStage?.source === 'session_explicit') {
    fields.push({
      name: 'Life Stage',
      value: getLifeStageLabel(hydratedContext.lifeStage.value),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  } else if (plainContext?.lifeStage) {
    fields.push({
      name: 'Life Stage',
      value: getLifeStageLabel(plainContext.lifeStage),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  }

  if (hydratedContext?.hasEmergencyFund?.source === 'session_explicit') {
    fields.push({
      name: 'Emergency Fund',
      value: getEmergencyFundLabel(hydratedContext.hasEmergencyFund.value),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  } else if (plainContext?.hasEmergencyFund) {
    fields.push({
      name: 'Emergency Fund',
      value: getEmergencyFundLabel(plainContext.hasEmergencyFund),
      confidence: 'high',
      source: 'session_explicit',
      annotation: 'set this session',
    });
  }

  return fields;
}

/**
 * Format a context field for prompt inclusion
 */
function formatContextField(field: ContextField): string {
  let line = `- ${field.name}: ${field.value}`;

  if (field.annotation) {
    line += ` (${field.annotation})`;
  } else if (field.lastConfirmed) {
    line += ` (set ${formatRelativeDate(field.lastConfirmed)})`;
  }

  return line;
}

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * Build layered context sections for AI prompts
 *
 * This function constructs distinct prompt sections with confidence annotations,
 * enabling the AI to reason appropriately over different types of context.
 *
 * @param sessionContext - Hydrated foundational context from the current session
 * @param plainFoundationalContext - Plain foundational context (non-hydrated)
 * @param accountProfile - User's account profile (null for anonymous users)
 * @param budget - The unified budget model
 * @param userQuery - The user's query
 */
export function buildLayeredContextSection(
  sessionContext: HydratedFoundationalContext | null,
  plainFoundationalContext: FoundationalContext | null,
  accountProfile: UserProfile | null,
  budget: UnifiedBudgetModel,
  userQuery?: string
): LayeredContextOutput {
  // Build account context fields
  const accountFields = accountProfile
    ? buildAccountContextFields(accountProfile, accountProfile.profile_metadata)
    : [];

  // Separate by confidence
  const highConfidenceFields = accountFields.filter(f => f.confidence === 'high');
  const mediumConfidenceFields = accountFields.filter(f => f.confidence === 'medium');

  // Build session context fields (session-explicit values override account)
  const sessionFields = buildSessionContextFields(sessionContext, plainFoundationalContext);

  // Remove account fields that have session overrides
  const sessionFieldNames = new Set(sessionFields.map(f => f.name));
  const filteredHighConfidence = highConfidenceFields.filter(f => !sessionFieldNames.has(f.name));
  const filteredMediumConfidence = mediumConfidenceFields.filter(f => !sessionFieldNames.has(f.name));

  // Detect tensions
  const tensions = detectTensions(accountProfile, plainFoundationalContext, budget);

  // Extract observed patterns
  const patterns = extractObservedPatterns(budget);

  // Build sections
  let highConfidenceSection = '';
  if (filteredHighConfidence.length > 0) {
    highConfidenceSection = `<user_profile source="account" confidence="high">
The user has established the following preferences in their account:
${filteredHighConfidence.map(formatContextField).join('\n')}

These preferences are well-established. Act on them unless the user's query suggests otherwise.
</user_profile>`;
  }

  let mediumConfidenceSection = '';
  if (filteredMediumConfidence.length > 0) {
    mediumConfidenceSection = `<user_profile source="account" confidence="medium">
Stated but not recently confirmed:
${filteredMediumConfidence.map(formatContextField).join('\n')}

Use to inform questions and suggestions, but remain open to correction.
</user_profile>`;
  }

  let sessionContextSection = '';
  if (sessionFields.length > 0 || userQuery) {
    const lines: string[] = [];
    if (sessionFields.length > 0) {
      lines.push('This session, the user has confirmed:');
      lines.push(...sessionFields.map(formatContextField));
    }
    if (userQuery) {
      lines.push(`- Query: "${userQuery}"`);
    }
    sessionContextSection = `<session_context>
${lines.join('\n')}
</session_context>`;
  }

  let observedPatternsSection = '';
  if (patterns.savingsRate > 0 || patterns.hasHighInterestDebt || patterns.debtToIncomeRatio > 0) {
    const patternLines: string[] = [];
    if (patterns.savingsRate > 0) {
      patternLines.push(`- Savings Rate: ${(patterns.savingsRate * 100).toFixed(1)}% of income`);
    }
    if (patterns.hasHighInterestDebt) {
      patternLines.push('- Has high-interest debt (>15% APR)');
    }
    if (patterns.debtToIncomeRatio > 0.1) {
      patternLines.push(`- Debt-to-Income Ratio: ${(patterns.debtToIncomeRatio * 100).toFixed(0)}%`);
    }
    if (patterns.primaryExpenseCategories.length > 0) {
      patternLines.push(`- Top expense categories: ${patterns.primaryExpenseCategories.join(', ')}`);
    }

    observedPatternsSection = `<observed_patterns confidence="inferred">
Patterns observed from budget data (use to inform questions, not to assume preferences):
${patternLines.join('\n')}
</observed_patterns>`;
  }

  let tensionsSection = '';
  if (tensions.length > 0) {
    const tensionLines = tensions.map(t => `- ${t.description}`);
    tensionsSection = `<tensions>
Potential discrepancies between stated preferences and budget patterns:
${tensionLines.join('\n')}

Surface these constructively if relevant to the user's query.
</tensions>`;
  }

  // Build guidance section
  const guidancePoints: string[] = [];

  if (filteredHighConfidence.length > 0 || sessionFields.length > 0) {
    guidancePoints.push('User has established preferences. Focus on actionable strategies rather than re-establishing basics.');
  }

  if (filteredMediumConfidence.length > 0) {
    guidancePoints.push('Some preferences are stale. You may gently verify if they still apply when relevant.');
  }

  if (tensions.length > 0) {
    guidancePoints.push('Tensions detected. Address discrepancies constructively if relevant to the query.');
  }

  if (accountFields.length === 0 && sessionFields.length === 0) {
    guidancePoints.push('No profile context available. Ask targeted questions to understand the user\'s situation.');
  }

  let guidanceSection = '';
  if (guidancePoints.length > 0) {
    guidanceSection = `<guidance>
${guidancePoints.map(p => `- ${p}`).join('\n')}
</guidance>`;
  }

  return {
    highConfidenceSection,
    mediumConfidenceSection,
    sessionContextSection,
    observedPatternsSection,
    tensionsSection,
    guidanceSection,
    hasAccountContext: accountFields.length > 0,
    tensionCount: tensions.length,
  };
}

/**
 * Build the complete layered context string for a prompt
 */
export function buildLayeredContextString(
  sessionContext: HydratedFoundationalContext | null,
  plainFoundationalContext: FoundationalContext | null,
  accountProfile: UserProfile | null,
  budget: UnifiedBudgetModel,
  userQuery?: string
): string {
  const sections = buildLayeredContextSection(
    sessionContext,
    plainFoundationalContext,
    accountProfile,
    budget,
    userQuery
  );

  const parts: string[] = [];

  if (sections.highConfidenceSection) {
    parts.push(sections.highConfidenceSection);
  }

  if (sections.mediumConfidenceSection) {
    parts.push(sections.mediumConfidenceSection);
  }

  if (sections.sessionContextSection) {
    parts.push(sections.sessionContextSection);
  }

  if (sections.observedPatternsSection) {
    parts.push(sections.observedPatternsSection);
  }

  if (sections.tensionsSection) {
    parts.push(sections.tensionsSection);
  }

  if (sections.guidanceSection) {
    parts.push(sections.guidanceSection);
  }

  return parts.join('\n\n');
}
