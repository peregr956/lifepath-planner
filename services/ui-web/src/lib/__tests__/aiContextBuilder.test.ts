/**
 * Tests for Phase 9.1.4: AI Context Builder
 *
 * Verifies that the layered context builder correctly:
 * - Separates high/medium confidence fields
 * - Detects tensions between profile and budget
 * - Generates appropriate guidance sections
 * - Handles various profile states (empty, partial, complete)
 */

import { describe, it, expect } from 'vitest';
import {
  buildLayeredContextSection,
  buildLayeredContextString,
  detectTensions,
  extractObservedPatterns,
  type TensionSignal,
} from '../aiContextBuilder';
import type { UserProfile, ProfileMetadata, FieldMetadata } from '@/lib/db';
import type { UnifiedBudgetModel } from '@/lib/budgetModel';
import type { FoundationalContext, HydratedFoundationalContext } from '@/types/budget';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockBudget = (overrides: Partial<UnifiedBudgetModel> = {}): UnifiedBudgetModel => ({
  income: [
    { id: 'income-1', name: 'Salary', monthly_amount: 5000, type: 'earned', stability: 'stable' },
  ],
  expenses: [
    { id: 'exp-1', category: 'Rent', monthly_amount: 1500, essential: true, notes: null },
    { id: 'exp-2', category: 'Groceries', monthly_amount: 500, essential: true, notes: null },
    { id: 'exp-3', category: 'Entertainment', monthly_amount: 300, essential: false, notes: null },
  ],
  debts: [
    { id: 'debt-1', name: 'Credit Card', balance: 5000, interest_rate: 19.99, min_payment: 150, priority: 'high', approximate: false, rate_changes: null },
  ],
  preferences: {
    optimization_focus: 'balanced',
    protect_essentials: true,
    max_desired_change_per_category: 0.2,
  },
  summary: {
    total_income: 5000,
    total_expenses: 2300,
    surplus: 2550, // After debt payment
  },
  ...overrides,
});

const createMockAccountProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'profile-1',
  user_id: 'user-1',
  default_financial_philosophy: 'fire',
  default_optimization_focus: 'savings',
  default_risk_tolerance: 'aggressive',
  onboarding_completed: true,
  default_primary_goal: 'Early retirement',
  default_goal_timeline: 'long_term',
  default_life_stage: 'mid_career',
  default_emergency_fund_status: 'adequate',
  profile_metadata: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-06-01'),
  ...overrides,
});

const createHighConfidenceMetadata = (): ProfileMetadata => ({
  financial_philosophy: {
    source: 'explicit',
    last_confirmed: new Date().toISOString(),
    confidence: 'high',
  },
  risk_tolerance: {
    source: 'explicit',
    last_confirmed: new Date().toISOString(),
    confidence: 'high',
  },
  primary_goal: {
    source: 'onboarding',
    last_confirmed: new Date().toISOString(),
    confidence: 'high',
  },
  goal_timeline: {
    source: 'onboarding',
    last_confirmed: new Date().toISOString(),
    confidence: 'high',
  },
});

const createMixedConfidenceMetadata = (): ProfileMetadata => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 8);

  return {
    financial_philosophy: {
      source: 'explicit',
      last_confirmed: new Date().toISOString(),
      confidence: 'high',
    },
    risk_tolerance: {
      source: 'onboarding',
      last_confirmed: sixMonthsAgo.toISOString(), // Stale
      confidence: 'high', // Will be downgraded to medium
    },
    life_stage: {
      source: 'inferred',
      last_confirmed: sixMonthsAgo.toISOString(),
      confidence: 'low',
    },
  };
};

// ============================================================================
// detectTensions Tests
// ============================================================================

describe('detectTensions', () => {
  it('should detect FIRE philosophy with low savings rate', () => {
    const profile = createMockAccountProfile({
      default_financial_philosophy: 'fire',
      default_risk_tolerance: 'moderate', // Use moderate to avoid aggressive saver tension
    });
    const budget = createMockBudget({
      summary: {
        total_income: 5000,
        total_expenses: 4800,
        surplus: 200, // Only 4% savings rate
      },
    });

    const tensions = detectTensions(profile, null, budget);

    // Should detect FIRE philosophy mismatch
    const fireTension = tensions.find(t => t.type === 'philosophy_mismatch');
    expect(fireTension).toBeDefined();
    expect(fireTension!.severity).toBe('high');
    expect(fireTension!.description).toContain('FIRE philosophy');
  });

  it('should detect Dave Ramsey approach without debt focus', () => {
    const profile = createMockAccountProfile({
      default_financial_philosophy: 'dave_ramsey',
    });
    const budget = createMockBudget({
      preferences: {
        optimization_focus: 'savings',
        protect_essentials: true,
        max_desired_change_per_category: 0.2,
      },
    });

    const tensions = detectTensions(profile, null, budget);

    expect(tensions.some(t => t.type === 'debt_priority')).toBe(true);
  });

  it('should detect aggressive risk tolerance with low savings', () => {
    const profile = createMockAccountProfile({
      default_risk_tolerance: 'aggressive',
    });
    const budget = createMockBudget({
      summary: {
        total_income: 5000,
        total_expenses: 4900,
        surplus: 100, // Only 2% savings rate
      },
    });

    const tensions = detectTensions(profile, null, budget);

    expect(tensions.some(t => t.type === 'savings_rate')).toBe(true);
  });

  it('should detect conservative risk tolerance with high-interest debt', () => {
    const profile = createMockAccountProfile({
      default_risk_tolerance: 'conservative',
    });
    const budget = createMockBudget({
      debts: [
        { id: 'debt-1', name: 'Credit Card', balance: 10000, interest_rate: 24.99, min_payment: 300, priority: 'high', approximate: false, rate_changes: null },
      ],
    });

    const tensions = detectTensions(profile, null, budget);

    expect(tensions.some(t => t.type === 'risk_behavior')).toBe(true);
  });

  it('should detect adequate emergency fund with budget deficit', () => {
    const profile = createMockAccountProfile({
      default_emergency_fund_status: 'adequate',
    });
    const budget = createMockBudget({
      summary: {
        total_income: 5000,
        total_expenses: 5500,
        surplus: -500, // Deficit
      },
    });

    const tensions = detectTensions(profile, null, budget);

    expect(tensions.some(t => t.type === 'emergency_fund')).toBe(true);
  });

  it('should return no tensions for aligned profile and budget', () => {
    const profile = createMockAccountProfile({
      default_financial_philosophy: 'neutral',
      default_risk_tolerance: 'moderate',
    });
    const budget = createMockBudget({
      debts: [], // No debt
      summary: {
        total_income: 5000,
        total_expenses: 3000,
        surplus: 2000, // 40% savings rate
      },
    });

    const tensions = detectTensions(profile, null, budget);

    expect(tensions).toHaveLength(0);
  });

  it('should use foundational context when account profile is null', () => {
    const foundationalContext: FoundationalContext = {
      financialPhilosophy: 'fire',
      riskTolerance: 'aggressive',
    };
    const budget = createMockBudget({
      summary: {
        total_income: 5000,
        total_expenses: 4800,
        surplus: 200, // Low savings rate
      },
    });

    const tensions = detectTensions(null, foundationalContext, budget);

    expect(tensions.some(t => t.type === 'philosophy_mismatch')).toBe(true);
  });
});

// ============================================================================
// extractObservedPatterns Tests
// ============================================================================

describe('extractObservedPatterns', () => {
  it('should calculate correct savings rate', () => {
    const budget = createMockBudget({
      summary: {
        total_income: 5000,
        total_expenses: 3000,
        surplus: 2000,
      },
    });

    const patterns = extractObservedPatterns(budget);

    expect(patterns.savingsRate).toBeCloseTo(0.4, 2); // 40%
  });

  it('should detect high-interest debt', () => {
    const budget = createMockBudget({
      debts: [
        { id: 'debt-1', name: 'Credit Card', balance: 5000, interest_rate: 22, min_payment: 150, priority: 'high', approximate: false, rate_changes: null },
      ],
    });

    const patterns = extractObservedPatterns(budget);

    expect(patterns.hasHighInterestDebt).toBe(true);
  });

  it('should not flag low-interest debt as high-interest', () => {
    const budget = createMockBudget({
      debts: [
        { id: 'debt-1', name: 'Mortgage', balance: 200000, interest_rate: 4.5, min_payment: 1200, priority: 'medium', approximate: false, rate_changes: null },
      ],
    });

    const patterns = extractObservedPatterns(budget);

    expect(patterns.hasHighInterestDebt).toBe(false);
  });

  it('should identify top expense categories', () => {
    const budget = createMockBudget({
      expenses: [
        { id: 'exp-1', category: 'Rent', monthly_amount: 1500, essential: true, notes: null },
        { id: 'exp-2', category: 'Car Payment', monthly_amount: 400, essential: true, notes: null },
        { id: 'exp-3', category: 'Groceries', monthly_amount: 300, essential: true, notes: null },
        { id: 'exp-4', category: 'Entertainment', monthly_amount: 100, essential: false, notes: null },
      ],
    });

    const patterns = extractObservedPatterns(budget);

    expect(patterns.primaryExpenseCategories).toHaveLength(3);
    expect(patterns.primaryExpenseCategories[0]).toBe('Rent');
  });
});

// ============================================================================
// buildLayeredContextSection Tests
// ============================================================================

describe('buildLayeredContextSection', () => {
  it('should generate high-confidence section for explicit profile settings', () => {
    const profile = createMockAccountProfile({
      profile_metadata: createHighConfidenceMetadata(),
    });
    const budget = createMockBudget();

    const result = buildLayeredContextSection(null, null, profile, budget);

    expect(result.highConfidenceSection).toContain('confidence="high"');
    expect(result.highConfidenceSection).toContain('FIRE movement');
    expect(result.hasAccountContext).toBe(true);
  });

  it('should generate medium-confidence section for stale profile data', () => {
    const profile = createMockAccountProfile({
      profile_metadata: createMixedConfidenceMetadata(),
    });
    const budget = createMockBudget();

    const result = buildLayeredContextSection(null, null, profile, budget);

    // Risk tolerance should be downgraded to medium due to staleness
    expect(result.mediumConfidenceSection).toContain('confidence="medium"');
  });

  it('should include session context when provided', () => {
    const hydratedContext: HydratedFoundationalContext = {
      primaryGoal: { value: 'Buy a house', source: 'session_explicit' },
      goalTimeline: { value: 'medium_term', source: 'session_explicit' },
    };
    const budget = createMockBudget();

    const result = buildLayeredContextSection(hydratedContext, null, null, budget, 'How can I save for a down payment?');

    expect(result.sessionContextSection).toContain('session_context');
    expect(result.sessionContextSection).toContain('Buy a house');
    expect(result.sessionContextSection).toContain('save for a down payment');
  });

  it('should include tensions section when discrepancies detected', () => {
    const profile = createMockAccountProfile({
      default_financial_philosophy: 'fire',
    });
    const budget = createMockBudget({
      summary: {
        total_income: 5000,
        total_expenses: 4800,
        surplus: 200, // Low savings rate
      },
    });

    const result = buildLayeredContextSection(null, null, profile, budget);

    expect(result.tensionsSection).toContain('tensions');
    expect(result.tensionCount).toBeGreaterThan(0);
  });

  it('should generate guidance section based on context', () => {
    const profile = createMockAccountProfile({
      profile_metadata: createHighConfidenceMetadata(),
    });
    const budget = createMockBudget();

    const result = buildLayeredContextSection(null, null, profile, budget);

    expect(result.guidanceSection).toContain('guidance');
    expect(result.guidanceSection).toContain('established preferences');
  });

  it('should handle empty profile gracefully', () => {
    const budget = createMockBudget();

    const result = buildLayeredContextSection(null, null, null, budget);

    expect(result.highConfidenceSection).toBe('');
    expect(result.mediumConfidenceSection).toBe('');
    expect(result.hasAccountContext).toBe(false);
    expect(result.guidanceSection).toContain('No profile context available');
  });

  it('should prioritize session-explicit values over account values', () => {
    const profile = createMockAccountProfile({
      default_risk_tolerance: 'aggressive',
    });
    const hydratedContext: HydratedFoundationalContext = {
      riskTolerance: { value: 'conservative', source: 'session_explicit' },
    };
    const budget = createMockBudget();

    const result = buildLayeredContextSection(hydratedContext, null, profile, budget);

    // Session value should appear in session context, not account context
    expect(result.sessionContextSection).toContain('Conservative');
    // Account risk tolerance should not appear in high confidence since it's overridden
    expect(result.highConfidenceSection).not.toContain('Aggressive');
  });

  it('should include observed patterns section', () => {
    const budget = createMockBudget({
      debts: [
        { id: 'debt-1', name: 'Credit Card', balance: 5000, interest_rate: 22, min_payment: 150, priority: 'high', approximate: false, rate_changes: null },
      ],
    });

    const result = buildLayeredContextSection(null, null, null, budget);

    expect(result.observedPatternsSection).toContain('observed_patterns');
    expect(result.observedPatternsSection).toContain('high-interest debt');
  });
});

// ============================================================================
// buildLayeredContextString Tests
// ============================================================================

describe('buildLayeredContextString', () => {
  it('should combine all sections into a coherent string', () => {
    const profile = createMockAccountProfile({
      profile_metadata: createHighConfidenceMetadata(),
    });
    const hydratedContext: HydratedFoundationalContext = {
      primaryGoal: { value: 'Debt payoff', source: 'session_explicit' },
    };
    const budget = createMockBudget();

    const result = buildLayeredContextString(
      hydratedContext,
      null,
      profile,
      budget,
      'How can I pay off my credit card faster?'
    );

    // Should contain key sections
    expect(result).toContain('user_profile');
    expect(result).toContain('session_context');
    expect(result).toContain('guidance');
  });

  it('should handle anonymous user with only foundational context', () => {
    const foundationalContext: FoundationalContext = {
      financialPhilosophy: 'r_personalfinance',
      riskTolerance: 'moderate',
    };
    const budget = createMockBudget();

    const result = buildLayeredContextString(null, foundationalContext, null, budget);

    // Should still generate useful context
    expect(result.length).toBeGreaterThan(0);
  });

  it('should be empty-safe when no context is available', () => {
    const budget = createMockBudget({
      debts: [],
      summary: {
        total_income: 5000,
        total_expenses: 5000,
        surplus: 0,
      },
    });

    // This should not throw
    const result = buildLayeredContextString(null, null, null, budget);

    expect(typeof result).toBe('string');
  });
});
