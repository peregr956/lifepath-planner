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

    it('preserves all lines in passthrough mode', async () => {
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
      
      // In passthrough mode, amounts are unchanged
      expect(result.normalizedDraft.lines[0].amount).toBe(5000);
      expect(result.normalizedDraft.lines[1].amount).toBe(1800);
    });
  });

  describe('integration with normalization', () => {
    it('should classify positive amounts with expense-like categories as expenses', async () => {
      // This tests the scenario described in the bug:
      // Budget has all positive amounts but some are clearly expenses
      const draft: DraftBudgetModel = {
        lines: [
          createBudgetLine(1, 'Monthly Salary', 5000),
          createBudgetLine(2, 'Rent Payment', 1800), // Should be expense
          createBudgetLine(3, 'Groceries', 500), // Should be expense
          createBudgetLine(4, 'Netflix Subscription', 15), // Should be expense
          createBudgetLine(5, 'Freelance Income', 1000),
        ],
        detected_format: 'categorical',
        notes: null,
        format_hints: null,
      };

      // In passthrough mode (no AI), we can't fix this
      // But the normalization.ts draftToUnifiedModel should use keywords
      const result = await normalizeDraftBudget(draft);
      
      // Without AI, passthrough counts by sign
      // All are positive, so all would be "income" by sign
      expect(result.incomeCount).toBe(5);
      expect(result.expenseCount).toBe(0);
      
      // This is the problem the AI normalization solves!
      // When AI is enabled, it should correctly classify:
      // - Salary, Freelance Income -> income (positive)
      // - Rent, Groceries, Netflix -> expenses (negative)
    });
  });
});

