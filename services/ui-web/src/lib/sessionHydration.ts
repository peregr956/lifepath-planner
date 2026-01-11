/**
 * Phase 9.1.2: Session Hydration Utilities
 * 
 * This module provides functions to hydrate session foundational context
 * from user account profile, supporting:
 * - Precedence: session-explicit > account-stored
 * - Source tracking for UI indicators
 * - Merge operations for partial updates
 */

import type {
  FoundationalContext,
  HydratedFoundationalContext,
  HydratedValue,
  FinancialPhilosophy,
  RiskTolerance,
  GoalTimeline,
  LifeStage,
  EmergencyFundStatus,
  SessionValueSource,
  FOUNDATIONAL_CONTEXT_FIELDS,
} from '@/types/budget';

/**
 * API response shape from /api/user/profile
 * Uses snake_case to match database column naming
 */
export interface ApiUserProfile {
  default_financial_philosophy: string | null;
  default_optimization_focus: string | null;
  default_risk_tolerance: string | null;
  onboarding_completed: boolean;
  default_primary_goal: string | null;
  default_goal_timeline: string | null;
  default_life_stage: string | null;
  default_emergency_fund_status: string | null;
  profile_metadata: Record<string, unknown> | null;
}

/**
 * Create a HydratedValue from a value and source
 */
function createHydratedValue<T>(value: T, source: SessionValueSource): HydratedValue<T> {
  return { value, source };
}

/**
 * Hydrate foundational context from an account profile (API response)
 * 
 * Maps account profile fields to session context with source='account'
 * Only includes fields that have non-null values in the profile.
 * 
 * @param apiProfile - The profile from /api/user/profile
 * @returns HydratedFoundationalContext with account-sourced values
 */
export function hydrateFromAccountProfile(
  apiProfile: ApiUserProfile | null | undefined
): HydratedFoundationalContext {
  if (!apiProfile) return {};

  const hydrated: HydratedFoundationalContext = {};

  // Map API response fields to foundational context fields
  if (apiProfile.default_financial_philosophy) {
    hydrated.financialPhilosophy = createHydratedValue(
      apiProfile.default_financial_philosophy as FinancialPhilosophy,
      'account'
    );
  }

  if (apiProfile.default_risk_tolerance) {
    hydrated.riskTolerance = createHydratedValue(
      apiProfile.default_risk_tolerance as RiskTolerance,
      'account'
    );
  }

  if (apiProfile.default_primary_goal) {
    hydrated.primaryGoal = createHydratedValue(
      apiProfile.default_primary_goal,
      'account'
    );
  }

  if (apiProfile.default_goal_timeline) {
    hydrated.goalTimeline = createHydratedValue(
      apiProfile.default_goal_timeline as GoalTimeline,
      'account'
    );
  }

  if (apiProfile.default_life_stage) {
    hydrated.lifeStage = createHydratedValue(
      apiProfile.default_life_stage as LifeStage,
      'account'
    );
  }

  if (apiProfile.default_emergency_fund_status) {
    hydrated.hasEmergencyFund = createHydratedValue(
      apiProfile.default_emergency_fund_status as EmergencyFundStatus,
      'account'
    );
  }

  return hydrated;
}

/**
 * Create session-explicit hydrated value from a plain value
 * 
 * @param value - The value set by the user this session
 * @returns HydratedValue with source='session_explicit'
 */
export function createSessionExplicitValue<T>(value: T): HydratedValue<T> {
  return createHydratedValue(value, 'session_explicit');
}

/**
 * Merge session-explicit values over hydrated values
 * 
 * Session-explicit values take precedence over account-hydrated values.
 * Used when user explicitly changes a value in the current session.
 * 
 * @param current - Current hydrated context (may have account values)
 * @param updates - Partial foundational context with new values (session-explicit)
 * @returns Updated HydratedFoundationalContext
 */
export function mergeSessionExplicit(
  current: HydratedFoundationalContext | null | undefined,
  updates: Partial<FoundationalContext>
): HydratedFoundationalContext {
  const result: HydratedFoundationalContext = { ...current };

  // Only update fields that are provided in updates
  if (updates.financialPhilosophy !== undefined) {
    result.financialPhilosophy = createSessionExplicitValue(updates.financialPhilosophy);
  }

  if (updates.riskTolerance !== undefined) {
    result.riskTolerance = createSessionExplicitValue(updates.riskTolerance);
  }

  if (updates.primaryGoal !== undefined) {
    result.primaryGoal = createSessionExplicitValue(updates.primaryGoal);
  }

  if (updates.goalTimeline !== undefined) {
    result.goalTimeline = createSessionExplicitValue(updates.goalTimeline);
  }

  if (updates.lifeStage !== undefined) {
    result.lifeStage = createSessionExplicitValue(updates.lifeStage);
  }

  if (updates.hasEmergencyFund !== undefined) {
    result.hasEmergencyFund = createSessionExplicitValue(updates.hasEmergencyFund);
  }

  return result;
}

/**
 * Convert legacy FoundationalContext to HydratedFoundationalContext
 * 
 * Used for backwards compatibility when loading session from localStorage
 * that was stored before hydration was implemented.
 * 
 * @param plain - Plain foundational context (legacy format)
 * @param defaultSource - Source to assign to all values (default: 'session_explicit')
 * @returns HydratedFoundationalContext
 */
export function fromPlainFoundationalContext(
  plain: FoundationalContext | null | undefined,
  defaultSource: SessionValueSource = 'session_explicit'
): HydratedFoundationalContext {
  if (!plain) return {};

  const hydrated: HydratedFoundationalContext = {};

  if (plain.financialPhilosophy !== undefined && plain.financialPhilosophy !== null) {
    hydrated.financialPhilosophy = createHydratedValue(plain.financialPhilosophy, defaultSource);
  }

  if (plain.riskTolerance !== undefined && plain.riskTolerance !== null) {
    hydrated.riskTolerance = createHydratedValue(plain.riskTolerance, defaultSource);
  }

  if (plain.primaryGoal !== undefined && plain.primaryGoal !== null) {
    hydrated.primaryGoal = createHydratedValue(plain.primaryGoal, defaultSource);
  }

  if (plain.goalTimeline !== undefined && plain.goalTimeline !== null) {
    hydrated.goalTimeline = createHydratedValue(plain.goalTimeline, defaultSource);
  }

  if (plain.lifeStage !== undefined && plain.lifeStage !== null) {
    hydrated.lifeStage = createHydratedValue(plain.lifeStage, defaultSource);
  }

  if (plain.hasEmergencyFund !== undefined && plain.hasEmergencyFund !== null) {
    hydrated.hasEmergencyFund = createHydratedValue(plain.hasEmergencyFund, defaultSource);
  }

  return hydrated;
}

/**
 * Check if any field in the hydrated context came from account profile
 */
export function hasAccountHydratedFields(
  hydrated: HydratedFoundationalContext | null | undefined
): boolean {
  if (!hydrated) return false;
  
  const fields: (keyof HydratedFoundationalContext)[] = [
    'financialPhilosophy',
    'riskTolerance',
    'primaryGoal',
    'goalTimeline',
    'lifeStage',
    'hasEmergencyFund',
  ];

  return fields.some(field => hydrated[field]?.source === 'account');
}

/**
 * Count how many fields are hydrated from account vs set explicitly
 */
export function countFieldsBySource(
  hydrated: HydratedFoundationalContext | null | undefined
): { account: number; sessionExplicit: number; total: number } {
  if (!hydrated) return { account: 0, sessionExplicit: 0, total: 0 };

  let account = 0;
  let sessionExplicit = 0;

  const fields: (keyof HydratedFoundationalContext)[] = [
    'financialPhilosophy',
    'riskTolerance',
    'primaryGoal',
    'goalTimeline',
    'lifeStage',
    'hasEmergencyFund',
  ];

  for (const field of fields) {
    const value = hydrated[field];
    if (value?.value !== null && value?.value !== undefined) {
      if (value.source === 'account') {
        account++;
      } else {
        sessionExplicit++;
      }
    }
  }

  return { account, sessionExplicit, total: account + sessionExplicit };
}
