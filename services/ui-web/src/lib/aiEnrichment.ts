/**
 * AI-based model enrichment for budget data.
 * 
 * Implements Phase 6 of the roadmap:
 * - AI-based income classification (earned, passive, transfer)
 * - AI-based essential expense detection
 * - AI-based debt detection from expense patterns
 * - AI-based income stability inference
 */

import OpenAI from 'openai';
import { UnifiedBudgetModel, Income, Expense, Debt, computeSummary } from './budgetModel';
import { loadProviderSettings } from './providerSettings';

const providerSettings = loadProviderSettings({
  providerEnv: 'CLARIFICATION_PROVIDER',
  timeoutEnv: 'AI_TIMEOUT_SECONDS',
  temperatureEnv: 'AI_TEMPERATURE',
  maxTokensEnv: 'AI_MAX_TOKENS',
});

function getOpenAIClient(): OpenAI | null {
  if (providerSettings.providerName !== 'openai' || !providerSettings.openai) {
    return null;
  }
  return new OpenAI({
    apiKey: providerSettings.openai.apiKey,
    baseURL: providerSettings.openai.apiBase,
  });
}

function getModel(): string {
  return providerSettings.openai?.model || 'gpt-4o-mini';
}

const ENRICHMENT_SCHEMA = {
  type: 'object' as const,
  properties: {
    income_enrichments: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          type: { type: 'string' as const, enum: ['earned', 'passive', 'transfer'] },
          stability: { type: 'string' as const, enum: ['stable', 'variable', 'seasonal'] },
        },
        required: ['id', 'type', 'stability'],
      },
    },
    expense_enrichments: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          essential: { type: 'boolean' as const },
        },
        required: ['id', 'essential'],
      },
    },
    debt_detections: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          expense_id: { type: 'string' as const },
          is_debt: { type: 'boolean' as const },
          debt_name: { type: 'string' as const },
        },
        required: ['expense_id', 'is_debt'],
      },
    },
  },
};

const ENRICHMENT_SYSTEM_PROMPT = `You are a financial expert that enriches raw budget data.
Analyze the provided budget sources and categories to improve classification.

Your tasks:
1. Income Classification: Identify if income is 'earned' (salary), 'passive' (dividends, rent), or 'transfer' (gifts, gov aid).
2. Income Stability: Determine if income is 'stable', 'variable' (freelance, bonus), or 'seasonal'.
3. Essential Expenses: Identify if an expense is 'essential' (housing, utilities, groceries, insurance) or discretionary.
4. Debt Detection: Identify if an expense item is actually a debt payment (e.g., "Credit Card Payment", "Student Loan", "Car Loan").

Respond with structured enrichments for the provided items.`;

/**
 * Enrich a unified budget model using AI
 */
export async function enrichBudgetModel(model: UnifiedBudgetModel): Promise<UnifiedBudgetModel> {
  const client = getOpenAIClient();
  if (!client) return model;

  try {
    const budgetData = {
      income: model.income.map(inc => ({ id: inc.id, name: inc.name, amount: inc.monthly_amount })),
      expenses: model.expenses.map(exp => ({ id: exp.id, category: exp.category, amount: exp.monthly_amount, notes: exp.notes })),
    };

    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: ENRICHMENT_SYSTEM_PROMPT },
        { role: 'user', content: `Enrich this budget data:\n${JSON.stringify(budgetData, null, 2)}` },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'enrich_budget',
            description: 'Provide enrichments and classifications for budget items',
            parameters: ENRICHMENT_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'enrich_budget' } },
      temperature: 0,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return model;

    const enrichments = JSON.parse(toolCalls[0].function.arguments);
    
    // Clone the model
    const enriched: UnifiedBudgetModel = JSON.parse(JSON.stringify(model));

    // Apply income enrichments
    if (enrichments.income_enrichments) {
      for (const incEnrich of enrichments.income_enrichments) {
        const inc = enriched.income.find(i => i.id === incEnrich.id);
        if (inc) {
          inc.type = incEnrich.type;
          inc.stability = incEnrich.stability;
        }
      }
    }

    // Apply expense enrichments
    if (enrichments.expense_enrichments) {
      for (const expEnrich of enrichments.expense_enrichments) {
        const exp = enriched.expenses.find(e => e.id === expEnrich.id);
        if (exp) {
          exp.essential = expEnrich.essential;
        }
      }
    }

    // Apply debt detections
    if (enrichments.debt_detections) {
      const detectedDebtIds = new Set<string>();
      for (const debtDet of enrichments.debt_detections) {
        if (debtDet.is_debt) {
          const expIndex = enriched.expenses.findIndex(e => e.id === debtDet.expense_id);
          if (expIndex !== -1) {
            const exp = enriched.expenses[expIndex];
            
            // Check if this debt already exists (avoid duplicates)
            const exists = enriched.debts.some(d => d.name === (debtDet.debt_name || exp.category));
            if (!exists) {
              // Note: Expenses are stored as POSITIVE values (matching Python convention)
              enriched.debts.push({
                id: `debt-detected-${exp.id}`,
                name: debtDet.debt_name || exp.category,
                balance: 0,
                interest_rate: 0,
                min_payment: exp.monthly_amount,
                priority: 'medium',
                approximate: true,
                rate_changes: null,
              });
              detectedDebtIds.add(exp.id);
            }
          }
        }
      }
      
      // Remove expenses that were moved to debts
      enriched.expenses = enriched.expenses.filter(e => !detectedDebtIds.has(e.id));
    }

    // Recompute summary as totals might have changed if expenses moved to debts
    enriched.summary = computeSummary(enriched);

    return enriched;
  } catch (error) {
    console.error('[AI] Enrichment failed:', error);
    return model;
  }
}

