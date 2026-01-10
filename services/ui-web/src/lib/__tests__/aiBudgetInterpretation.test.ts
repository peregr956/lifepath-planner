/**
 * Tests for AI-First Budget Interpretation (Phase 8.5.4)
 * 
 * Verifies that:
 * 1. Description column is used when more specific than category
 * 2. Duplicate categories result in unique labels
 * 3. Enhanced deterministic fallback works correctly
 */

import { describe, it, expect } from 'vitest';
import { 
  selectBestLabel, 
  enhancedDeterministicInterpretation 
} from '../aiBudgetInterpretation';
import type { DraftBudgetModel, RawBudgetLine } from '../parsers';

describe('selectBestLabel', () => {
  it('should prefer description over generic category', () => {
    const line: RawBudgetLine = {
      source_row_index: 1,
      date: null,
      category_label: 'Personal',
      description: 'Gym Membership',
      amount: -50,
      metadata: {},
    };
    
    expect(selectBestLabel(line)).toBe('Gym Membership');
  });

  it('should use category when description is empty', () => {
    const line: RawBudgetLine = {
      source_row_index: 1,
      date: null,
      category_label: 'Groceries',
      description: null,
      amount: -200,
      metadata: {},
    };
    
    expect(selectBestLabel(line)).toBe('Groceries');
  });

  it('should use description when category is empty', () => {
    const line: RawBudgetLine = {
      source_row_index: 1,
      date: null,
      category_label: '',
      description: 'Weekly groceries',
      amount: -150,
      metadata: {},
    };
    
    expect(selectBestLabel(line)).toBe('Weekly groceries');
  });

  it('should prefer description when it is longer/more specific', () => {
    const line: RawBudgetLine = {
      source_row_index: 1,
      date: null,
      category_label: 'Bills',
      description: 'Electric Utility Bill',
      amount: -120,
      metadata: {},
    };
    
    expect(selectBestLabel(line)).toBe('Electric Utility Bill');
  });

  it('should use description for generic categories', () => {
    const genericCategories = ['personal', 'other', 'misc', 'general'];
    
    for (const cat of genericCategories) {
      const line: RawBudgetLine = {
        source_row_index: 1,
        date: null,
        category_label: cat,
        description: 'Netflix Subscription',
        amount: -15,
        metadata: {},
      };
      
      expect(selectBestLabel(line)).toBe('Netflix Subscription');
    }
  });

  it('should return category when both are the same', () => {
    const line: RawBudgetLine = {
      source_row_index: 1,
      date: null,
      category_label: 'Rent',
      description: 'Rent',
      amount: -1500,
      metadata: {},
    };
    
    expect(selectBestLabel(line)).toBe('Rent');
  });

  it('should return Unknown when both are empty', () => {
    const line: RawBudgetLine = {
      source_row_index: 1,
      date: null,
      category_label: '',
      description: '',
      amount: -50,
      metadata: {},
    };
    
    expect(selectBestLabel(line)).toBe('Unknown');
  });
});

describe('enhancedDeterministicInterpretation', () => {
  it('should produce unique labels for duplicate categories', () => {
    const draft: DraftBudgetModel = {
      lines: [
        {
          source_row_index: 1,
          date: null,
          category_label: 'Personal',
          description: 'Gym Membership',
          amount: -50,
          metadata: {},
        },
        {
          source_row_index: 2,
          date: null,
          category_label: 'Personal',
          description: 'Netflix',
          amount: -15,
          metadata: {},
        },
        {
          source_row_index: 3,
          date: null,
          category_label: 'Personal',
          description: 'Haircut',
          amount: -30,
          metadata: {},
        },
      ],
      detected_format: 'categorical',
      notes: null,
      format_hints: null,
    };

    const result = enhancedDeterministicInterpretation(draft);
    
    // Should have 3 expenses
    expect(result.model.expenses.length).toBe(3);
    
    // All labels should be unique
    const labels = result.model.expenses.map(e => e.category);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(3);
    
    // Labels should be the descriptions, not "Personal"
    expect(labels).toContain('Gym Membership');
    expect(labels).toContain('Netflix');
    expect(labels).toContain('Haircut');
    
    // Should not contain duplicate "Personal" labels
    expect(labels.filter(l => l === 'Personal').length).toBe(0);
  });

  it('should handle duplicate categories without descriptions', () => {
    const draft: DraftBudgetModel = {
      lines: [
        {
          source_row_index: 1,
          date: null,
          category_label: 'Utilities',
          description: null,
          amount: -100,
          metadata: {},
        },
        {
          source_row_index: 2,
          date: null,
          category_label: 'Utilities',
          description: null,
          amount: -80,
          metadata: {},
        },
      ],
      detected_format: 'categorical',
      notes: null,
      format_hints: null,
    };

    const result = enhancedDeterministicInterpretation(draft);
    
    // Should have 2 expenses
    expect(result.model.expenses.length).toBe(2);
    
    // Labels should be unique (appended with #2 for the second one)
    const labels = result.model.expenses.map(e => e.category);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(2);
  });

  it('should correctly classify income vs expenses', () => {
    const draft: DraftBudgetModel = {
      lines: [
        {
          source_row_index: 1,
          date: null,
          category_label: 'Salary',
          description: 'Monthly Paycheck',
          amount: 5000,
          metadata: {},
        },
        {
          source_row_index: 2,
          date: null,
          category_label: 'Rent',
          description: 'Apartment Rent',
          amount: -1500,
          metadata: {},
        },
        {
          source_row_index: 3,
          date: null,
          category_label: 'Student Loan',
          description: 'Student Loan Payment',
          amount: -300,
          metadata: {},
        },
      ],
      detected_format: 'categorical',
      notes: null,
      format_hints: null,
    };

    const result = enhancedDeterministicInterpretation(draft);
    
    // Should have 1 income (salary)
    expect(result.model.income.length).toBe(1);
    expect(result.model.income[0].name).toBe('Monthly Paycheck');
    
    // Should have 1 expense (rent)
    expect(result.model.expenses.length).toBe(1);
    expect(result.model.expenses[0].category).toBe('Apartment Rent');
    
    // Should have 1 debt (student loan)
    expect(result.model.debts.length).toBe(1);
    expect(result.model.debts[0].name).toBe('Student Loan Payment');
  });

  it('should mark usedAI as false for deterministic interpretation', () => {
    const draft: DraftBudgetModel = {
      lines: [
        {
          source_row_index: 1,
          date: null,
          category_label: 'Groceries',
          description: 'Weekly groceries',
          amount: -200,
          metadata: {},
        },
      ],
      detected_format: 'categorical',
      notes: null,
      format_hints: null,
    };

    const result = enhancedDeterministicInterpretation(draft);
    
    expect(result.usedAI).toBe(false);
    expect(result.notes).toContain('deterministic');
  });

  it('should compute summary correctly', () => {
    const draft: DraftBudgetModel = {
      lines: [
        {
          source_row_index: 1,
          date: null,
          category_label: 'Income',
          description: 'Salary',
          amount: 5000,
          metadata: {},
        },
        {
          source_row_index: 2,
          date: null,
          category_label: 'Rent',
          description: null,
          amount: -1500,
          metadata: {},
        },
        {
          source_row_index: 3,
          date: null,
          category_label: 'Groceries',
          description: null,
          amount: -500,
          metadata: {},
        },
      ],
      detected_format: 'categorical',
      notes: null,
      format_hints: null,
    };

    const result = enhancedDeterministicInterpretation(draft);
    
    expect(result.model.summary.total_income).toBe(5000);
    expect(result.model.summary.total_expenses).toBe(2000); // 1500 + 500
    expect(result.model.summary.surplus).toBe(3000); // 5000 - 2000
  });

  it('should mark essential expenses correctly', () => {
    const draft: DraftBudgetModel = {
      lines: [
        {
          source_row_index: 1,
          date: null,
          category_label: 'Housing',
          description: 'Rent Payment',
          amount: -1500,
          metadata: {},
        },
        {
          source_row_index: 2,
          date: null,
          category_label: 'Entertainment',
          description: 'Movie Tickets',
          amount: -30,
          metadata: {},
        },
      ],
      detected_format: 'categorical',
      notes: null,
      format_hints: null,
    };

    const result = enhancedDeterministicInterpretation(draft);
    
    // Rent should be marked as essential (housing keyword)
    const rentExpense = result.model.expenses.find(e => e.category.includes('Rent'));
    expect(rentExpense?.essential).toBe(true);
    
    // Entertainment should be null (unknown, needs clarification)
    const movieExpense = result.model.expenses.find(e => e.category.includes('Movie'));
    expect(movieExpense?.essential).toBeNull();
  });
});
