import { describe, it, expect, vi } from 'vitest';
import { enrichBudgetModel } from '../aiEnrichment';
import { UnifiedBudgetModel } from '../budgetModel';

vi.mock('openai', () => {
  const OpenAI = vi.fn().mockImplementation(function (this: any) {
    this.chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  name: 'enrich_budget',
                  arguments: JSON.stringify({
                    income_enrichments: [
                      { id: 'inc-1', type: 'passive', stability: 'stable' }
                    ],
                    expense_enrichments: [
                      { id: 'exp-1', essential: true }
                    ],
                    debt_detections: [
                      { expense_id: 'exp-2', is_debt: true, debt_name: 'Visa Card' }
                    ]
                  })
                }
              }]
            }
          }]
        })
      }
    };
  });
  return { 
    default: OpenAI,
    OpenAI: OpenAI 
  };
});

vi.mock('../providerSettings', () => ({
  loadProviderSettings: vi.fn().mockReturnValue({
    providerName: 'openai',
    openai: { apiKey: 'test', model: 'gpt-4o-mini', apiBase: 'https://api.openai.com/v1' }
  })
}));

describe('enrichBudgetModel', () => {
  const mockModel: UnifiedBudgetModel = {
    income: [{ id: 'inc-1', name: 'Salary', monthly_amount: 5000, type: 'earned', stability: 'stable' }],
    expenses: [
      { id: 'exp-1', category: 'Rent', monthly_amount: -2000, essential: null, notes: null },
      { id: 'exp-2', category: 'Visa Card', monthly_amount: -500, essential: null, notes: null }
    ],
    debts: [],
    preferences: { optimization_focus: 'balanced', protect_essentials: true, max_desired_change_per_category: 0.25 },
    summary: { total_income: 5000, total_expenses: 2500, surplus: 2500 }
  };

  it('applies enrichments correctly', async () => {
    const enriched = await enrichBudgetModel(mockModel);

    // Income type should be updated from 'earned' to 'passive' (per mock)
    expect(enriched.income[0].type).toBe('passive');
    
    // Rent should be marked essential
    expect(enriched.expenses.find(e => e.id === 'exp-1')?.essential).toBe(true);
    
    // Visa Card should be detected as debt and removed from expenses
    expect(enriched.debts.length).toBe(1);
    expect(enriched.debts[0].name).toBe('Visa Card');
    expect(enriched.debts[0].min_payment).toBe(500);
    
    // exp-2 should no longer be in expenses
    expect(enriched.expenses.find(e => e.id === 'exp-2')).toBeUndefined();
    expect(enriched.expenses.length).toBe(1);
  });
});

