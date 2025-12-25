/**
 * Tests for AI budget normalization
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { normalizeDraftBudget, isNormalizationAIEnabled } from '../aiNormalization';
import type { DraftBudgetModel, RawBudgetLine } from '../parsers';

// Mock the OpenAI module
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

// Create a sample budget line
function createBudgetLine(
  index: number,
  category: string,
  amount: number,
  description?: string
): RawBudgetLine {
  return {
    source_row_index: index,
    date: null,
    category_label: category,
    description: description || null,
    amount,
    metadata: {},
  };
}

describe('aiNormalization', () => {
  describe('isNormalizationAIEnabled', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('returns false when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      // Re-import to get fresh evaluation
      const mod = await import('../aiNormalization');
      expect(mod.isNormalizationAIEnabled()).toBe(false);
    });
  });

  describe('normalizeDraftBudget', () => {
    it('returns empty result for empty budget', async () => {
      const emptyDraft: DraftBudgetModel = {
        lines: [],
        detected_format: 'categorical',
        notes: null,
        format_hints: null,
      };

      const result = await normalizeDraftBudget(emptyDraft);

      expect(result.normalizedDraft.lines).toHaveLength(0);
      expect(result.incomeCount).toBe(0);
      expect(result.expenseCount).toBe(0);
      expect(result.providerUsed).toBe('none');
    });

    it('uses passthrough when AI is not enabled', async () => {
      const draft: DraftBudgetModel = {
        lines: [
          createBudgetLine(1, 'Salary', 5000),
          createBudgetLine(2, 'Rent', -1800),
          createBudgetLine(3, 'Groceries', -500),
        ],
        detected_format: 'categorical',
        notes: null,
        format_hints: null,
      };

      const result = await normalizeDraftBudget(draft);

      // Without AI, should use passthrough which counts by sign
      expect(result.providerUsed).toBe('deterministic');
      expect(result.incomeCount).toBe(1); // positive amount
      expect(result.expenseCount).toBe(2); // negative amounts
    });

    it('applies heuristic normalization for all-positive budgets', async () => {
      const draft: DraftBudgetModel = {
        lines: [
          createBudgetLine(1, 'Salary', 5000),
          createBudgetLine(2, 'Rent', 1800), // All positive - common in budget exports
          createBudgetLine(3, 'Groceries', 500),
          createBudgetLine(4, 'Utilities', 200),
        ],
        detected_format: 'categorical',
        notes: null,
        format_hints: null,
      };

      const result = await normalizeDraftBudget(draft);

      // All lines should be preserved
      expect(result.normalizedDraft.lines).toHaveLength(4);
      
      // With heuristic normalization for all-positive budgets:
      // - Salary stays positive (income keyword)
      // - Rent, Groceries, Utilities become negative (expense keywords)
      expect(result.normalizedDraft.lines[0].amount).toBe(5000); // Income stays positive
      expect(result.normalizedDraft.lines[1].amount).toBe(-1800); // Rent becomes negative
      expect(result.normalizedDraft.lines[2].amount).toBe(-500); // Groceries becomes negative
      expect(result.normalizedDraft.lines[3].amount).toBe(-200); // Utilities becomes negative
      
      // Should correctly classify
      expect(result.incomeCount).toBe(1);
      expect(result.expenseCount).toBe(3);
      expect(result.providerUsed).toBe('deterministic_heuristic');
    });
  });

  describe('integration with normalization', () => {
    it('should classify positive amounts with expense-like categories as expenses using heuristics', async () => {
      // This tests the scenario described in the bug:
      // Budget has all positive amounts but some are clearly expenses
      const draft: DraftBudgetModel = {
        lines: [
          createBudgetLine(1, 'Monthly Salary', 5000),
          createBudgetLine(2, 'Rent Payment', 1800), // Should be expense
          createBudgetLine(3, 'Groceries', 500), // Should be expense
          createBudgetLine(4, 'Subscription', 15), // Should be expense (unknown defaults to expense)
          createBudgetLine(5, 'Freelance Income', 1000),
        ],
        detected_format: 'categorical',
        notes: null,
        format_hints: null,
      };

      // With heuristic normalization, should correctly classify using keywords
      const result = await normalizeDraftBudget(draft);
      
      // Heuristic normalization correctly classifies:
      // - Salary, Freelance Income -> income (positive) - matches "salary" and "income" keywords
      // - Rent, Groceries -> expenses (negative) - matches "rent" and "groceries" keywords
      // - Subscription -> expense (negative) - matches "subscription" keyword
      expect(result.incomeCount).toBe(2);
      expect(result.expenseCount).toBe(3);
      
      // Verify amounts are correctly signed
      const lines = result.normalizedDraft.lines;
      expect(lines.find(l => l.category_label === 'Monthly Salary')?.amount).toBe(5000);
      expect(lines.find(l => l.category_label === 'Rent Payment')?.amount).toBe(-1800);
      expect(lines.find(l => l.category_label === 'Groceries')?.amount).toBe(-500);
      expect(lines.find(l => l.category_label === 'Freelance Income')?.amount).toBe(1000);
    });
  });
});

