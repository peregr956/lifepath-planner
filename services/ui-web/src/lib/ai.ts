/**
 * AI integration for clarification questions and suggestions
 * 
 * Uses OpenAI or Vercel AI Gateway for generating contextual questions
 * and personalized budget optimization suggestions.
 */

import OpenAI from 'openai';
import type { UnifiedBudgetModel, QuestionSpec, Suggestion } from './budgetModel';
import { ESSENTIAL_PREFIX, SUPPORTED_SIMPLE_FIELD_IDS, parseDebtFieldId } from './normalization';

// Question schema for OpenAI function calling
const QUESTION_SPEC_SCHEMA = {
  type: 'object' as const,
  properties: {
    questions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          question_id: { type: 'string' as const },
          prompt: { type: 'string' as const },
          components: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                component: { type: 'string' as const, enum: ['toggle', 'dropdown', 'number_input', 'slider'] },
                field_id: { type: 'string' as const },
                label: { type: 'string' as const },
                binding: { type: 'string' as const },
                options: { type: 'array' as const, items: { type: 'string' as const } },
                min: { type: 'number' as const },
                max: { type: 'number' as const },
                unit: { type: 'string' as const },
              },
              required: ['component', 'field_id', 'label', 'binding'],
            },
          },
        },
        required: ['question_id', 'prompt', 'components'],
      },
    },
  },
  required: ['questions'],
};

// Suggestion schema for OpenAI function calling
const SUGGESTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    suggestions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          title: { type: 'string' as const },
          description: { type: 'string' as const },
          expected_monthly_impact: { type: 'number' as const },
          rationale: { type: 'string' as const },
          tradeoffs: { type: 'string' as const },
        },
        required: ['id', 'title', 'description', 'expected_monthly_impact', 'rationale', 'tradeoffs'],
      },
    },
  },
  required: ['suggestions'],
};

/**
 * Get OpenAI client configuration
 */
function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
  
  if (!apiKey) {
    console.warn('[AI] OpenAI API key not configured');
    return null;
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

/**
 * Get OpenAI model name
 */
function getModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

/**
 * Check if AI is enabled
 */
export function isAIEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Get provider metadata for API responses
 */
export function getProviderMetadata(): {
  clarification_provider: string;
  suggestion_provider: string;
  ai_enabled: boolean;
} {
  const aiEnabled = isAIEnabled();
  const provider = aiEnabled ? 'openai' : 'deterministic';
  
  return {
    clarification_provider: provider,
    suggestion_provider: provider,
    ai_enabled: aiEnabled,
  };
}

// System prompts
const CLARIFICATION_SYSTEM_PROMPT = `You are a financial planning assistant that generates clarification questions to help understand a user's budget and answer their specific question.

CRITICAL: The user has provided a specific question or concern. Your role is to:
1. Generate ONLY the questions needed to answer their specific query
2. Skip questions that aren't relevant to what they're asking about
3. Ask about financial philosophy and risk tolerance ONLY when relevant to their query

Important guidelines:
- Ask 4-7 concise, actionable questions maximum (fewer is better if that answers their query)
- Prioritize questions that directly help answer the user's specific question
- Use specific UI components: toggle (yes/no), dropdown (choices), number_input (amounts/rates), slider (ranges)
- Field IDs MUST follow exact naming conventions provided in the valid field IDs section
- Each question_id must be unique

Return structured JSON matching the provided function schema exactly.`;

const SUGGESTION_SYSTEM_PROMPT = `You are a personal finance advisor generating actionable budget optimization suggestions.

CRITICAL: The user has asked a specific question. Your suggestions MUST directly address their question.
Prioritize suggestions that answer what they asked about. Reference their question in your rationale.

Your role is to analyze the user's budget and provide 3-6 specific, realistic recommendations. Focus on:
1. Directly answering the user's question first
2. High-interest debt payoff strategies (if relevant to their question)
3. Flexible expense reduction opportunities (if relevant)
4. Savings and investment allocation (if relevant)
5. Emergency fund adequacy (if relevant)

Important guidelines:
- Start by addressing the user's specific question or concern
- Be specific with dollar amounts when possible
- Explain tradeoffs honestly
- Focus on sustainable changes, not extreme cuts

CRITICAL: Suggestions should be educational and thought-provoking. Never guarantee outcomes or provide specific investment advice. Frame recommendations as ideas to consider.

Return structured JSON matching the provided function schema exactly.`;

/**
 * Build valid field IDs section for the prompt
 */
function buildValidFieldIds(model: UnifiedBudgetModel): string {
  const lines = ['## VALID FIELD_IDS (use ONLY these exact field_ids):'];

  // Expense essentials
  if (model.expenses.length > 0) {
    lines.push('\n### Expense Essentials (use "essential_" prefix):');
    for (const exp of model.expenses) {
      if (exp.essential === null) {
        lines.push(`  - essential_${exp.id}  (for ${exp.category})`);
      }
    }
  }

  // Preferences
  lines.push('\n### Preferences:');
  lines.push('  - optimization_focus');
  lines.push('  - primary_income_type');
  lines.push('  - primary_income_stability');

  // Profile fields
  lines.push('\n### Profile (ask only when relevant to user\'s query):');
  lines.push('  - financial_philosophy  (r_personalfinance, money_guy, neutral)');
  lines.push('  - risk_tolerance  (conservative, moderate, aggressive)');
  lines.push('  - goal_timeline  (immediate, short_term, medium_term, long_term)');

  // Debts
  if (model.debts.length > 0) {
    lines.push('\n### Debt Fields (use "{debt_id}_" prefix):');
    for (const debt of model.debts) {
      lines.push(`  - ${debt.id}_balance`);
      lines.push(`  - ${debt.id}_interest_rate`);
      lines.push(`  - ${debt.id}_min_payment`);
      lines.push(`  - ${debt.id}_priority`);
    }
  }

  lines.push('\n⚠️ CRITICAL: Only use field_ids listed above. Do NOT invent new field_ids.');
  return lines.join('\n');
}

/**
 * Build user prompt for clarification questions
 */
function buildClarificationPrompt(model: UnifiedBudgetModel, userQuery: string): string {
  const incomeSection = model.income.length > 0
    ? model.income.map(inc => `- ${inc.name}: $${inc.monthly_amount.toLocaleString()}/mo (${inc.type}, ${inc.stability})`).join('\n')
    : 'No income sources detected.';

  const expenseSection = model.expenses.length > 0
    ? model.expenses.map(exp => {
        const essentialStr = exp.essential === true ? 'essential' : exp.essential === false ? 'flexible' : 'unknown';
        return `- ${exp.category} [ID: ${exp.id}]: $${Math.abs(exp.monthly_amount).toLocaleString()}/mo (essential=${essentialStr})`;
      }).join('\n')
    : 'No expenses detected.';

  const debtSection = model.debts.length > 0
    ? model.debts.map(debt => 
        `- ${debt.name} [ID: ${debt.id}]: balance=$${debt.balance.toLocaleString()}, rate=${debt.interest_rate}%, min=$${debt.min_payment.toLocaleString()}`
      ).join('\n')
    : 'No debts detected.';

  const validFieldIds = buildValidFieldIds(model);

  return `## USER'S QUESTION (This is what they need help with)
"${userQuery || 'Help me understand and optimize my budget'}"

Generate ONLY the clarification questions needed to answer their specific question above.

## Budget Summary
- Total Monthly Income: $${model.summary.total_income.toLocaleString()}
- Total Monthly Expenses: $${model.summary.total_expenses.toLocaleString()}
- Monthly Surplus: $${model.summary.surplus.toLocaleString()}

## Income Sources (${model.income.length})
${incomeSection}

## Expense Categories (${model.expenses.length})
${expenseSection}

## Debts (${model.debts.length})
${debtSection}

## Current Preferences
- Optimization Focus: ${model.preferences.optimization_focus}
- Protect Essentials: ${model.preferences.protect_essentials}

${validFieldIds}

REMEMBER: Only ask questions that help answer: "${userQuery || 'Help me understand and optimize my budget'}"`;
}

/**
 * Build user prompt for suggestions
 */
function buildSuggestionPrompt(
  model: UnifiedBudgetModel,
  userQuery: string,
  userProfile?: Record<string, unknown>
): string {
  const surplusRatio = model.summary.total_income > 0 
    ? model.summary.surplus / model.summary.total_income 
    : 0;

  const incomeSection = model.income.length > 0
    ? model.income.map(inc => `- ${inc.name}: $${inc.monthly_amount.toLocaleString()}/mo (${inc.type}, ${inc.stability})`).join('\n')
    : 'No income sources detected.';

  const essentialExpenses = model.expenses.filter(e => e.essential);
  const flexibleExpenses = model.expenses.filter(e => !e.essential);

  let expenseSection = 'Essential:\n';
  expenseSection += essentialExpenses.map(exp => `  - ${exp.category}: $${Math.abs(exp.monthly_amount).toLocaleString()}/mo`).join('\n');
  expenseSection += '\nFlexible:\n';
  expenseSection += flexibleExpenses.map(exp => `  - ${exp.category}: $${Math.abs(exp.monthly_amount).toLocaleString()}/mo`).join('\n');

  const debtSection = model.debts.length > 0
    ? model.debts.map(debt => {
        const priorityTag = debt.priority === 'high' ? '[HIGH priority]' : '';
        return `- ${debt.name}: $${debt.balance.toLocaleString()} balance at ${debt.interest_rate}% APR, min $${debt.min_payment.toLocaleString()} ${priorityTag}`;
      }).join('\n')
    : 'No debts detected. Great position for savings focus!';

  const totalDebtPayments = model.debts.reduce((sum, d) => sum + d.min_payment, 0);

  let profileSection = '';
  if (userProfile && Object.keys(userProfile).length > 0) {
    profileSection = '## User Profile (Personalize based on this)\n';
    if (userProfile.financial_philosophy) {
      profileSection += `- Financial Philosophy: ${userProfile.financial_philosophy}\n`;
    }
    if (userProfile.risk_tolerance) {
      profileSection += `- Risk Tolerance: ${userProfile.risk_tolerance}\n`;
    }
    if (userProfile.primary_goal) {
      profileSection += `- Primary Goal: ${userProfile.primary_goal}\n`;
    }
  }

  return `## USER'S QUESTION (Generate suggestions that answer this)
"${userQuery || 'Help me optimize my budget and improve my financial situation'}"

${profileSection}

Generate suggestions that directly address their question above.

## Financial Summary
- Total Monthly Income: $${model.summary.total_income.toLocaleString()}
- Total Monthly Expenses: $${model.summary.total_expenses.toLocaleString()}
- Monthly Surplus: $${model.summary.surplus.toLocaleString()}
- Surplus Ratio: ${(surplusRatio * 100).toFixed(1)}% of income

## Income Breakdown (${model.income.length} sources)
${incomeSection}

## Expense Breakdown (${model.expenses.length} categories)
${expenseSection}

## Debt Profile (${model.debts.length} accounts)
${debtSection}
Total Monthly Debt Service: $${totalDebtPayments.toLocaleString()}

## User Preferences
- Primary Optimization Focus: ${model.preferences.optimization_focus}
- Protect Essential Expenses: ${model.preferences.protect_essentials}
- Maximum Category Adjustment: ${(model.preferences.max_desired_change_per_category * 100).toFixed(0)}%

Generate 3-6 prioritized suggestions that answer: "${userQuery || 'Help me optimize my budget'}"`;
}

/**
 * Validate generated question field IDs against the model
 */
function validateQuestionFieldIds(
  questions: QuestionSpec[],
  model: UnifiedBudgetModel
): QuestionSpec[] {
  const expenseIds = new Set(model.expenses.map(e => e.id));
  const debtIds = new Set(model.debts.map(d => d.id));

  return questions.map(question => {
    const validComponents = question.components.filter(comp => {
      const fieldId = comp.field_id;

      // Check expense essentials
      if (fieldId.startsWith(ESSENTIAL_PREFIX)) {
        const expenseId = fieldId.slice(ESSENTIAL_PREFIX.length);
        return expenseIds.has(expenseId);
      }

      // Check simple field IDs
      if (SUPPORTED_SIMPLE_FIELD_IDS.has(fieldId)) {
        return true;
      }

      // Check debt fields
      const debtTarget = parseDebtFieldId(fieldId);
      if (debtTarget) {
        const [debtId] = debtTarget;
        return debtIds.has(debtId);
      }

      return false;
    });

    return {
      ...question,
      components: validComponents,
    };
  }).filter(q => q.components.length > 0);
}

/**
 * Generate clarification questions using AI
 */
export async function generateClarificationQuestions(
  model: UnifiedBudgetModel,
  userQuery?: string,
  maxQuestions: number = 5
): Promise<QuestionSpec[]> {
  const client = getOpenAIClient();
  
  if (!client) {
    // Fall back to deterministic questions
    return generateDeterministicQuestions(model, maxQuestions);
  }

  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: CLARIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: buildClarificationPrompt(model, userQuery || '') },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_clarification_questions',
            description: 'Generate structured clarification questions for the budget model.',
            parameters: QUESTION_SPEC_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_clarification_questions' } },
      temperature: 0.2,
      max_tokens: 1024,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.warn('[AI] No tool calls in response, falling back to deterministic');
      return generateDeterministicQuestions(model, maxQuestions);
    }

    const parsed = JSON.parse(toolCalls[0].function.arguments);
    const questions = (parsed.questions || []).slice(0, maxQuestions) as QuestionSpec[];
    
    // Validate field IDs
    return validateQuestionFieldIds(questions, model);
  } catch (error) {
    console.error('[AI] Error generating clarification questions:', error);
    return generateDeterministicQuestions(model, maxQuestions);
  }
}

/**
 * Generate suggestions using AI
 */
export async function generateSuggestions(
  model: UnifiedBudgetModel,
  userQuery?: string,
  userProfile?: Record<string, unknown>
): Promise<Suggestion[]> {
  const client = getOpenAIClient();

  if (!client) {
    // Fall back to deterministic suggestions
    return generateDeterministicSuggestions(model);
  }

  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
        { role: 'user', content: buildSuggestionPrompt(model, userQuery || '', userProfile) },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_optimization_suggestions',
            description: 'Generate structured budget optimization suggestions.',
            parameters: SUGGESTION_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_optimization_suggestions' } },
      temperature: 0.3,
      max_tokens: 1024,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.warn('[AI] No tool calls in response, falling back to deterministic');
      return generateDeterministicSuggestions(model);
    }

    const parsed = JSON.parse(toolCalls[0].function.arguments);
    return (parsed.suggestions || []) as Suggestion[];
  } catch (error) {
    console.error('[AI] Error generating suggestions:', error);
    return generateDeterministicSuggestions(model);
  }
}

/**
 * Generate deterministic clarification questions (fallback)
 */
function generateDeterministicQuestions(model: UnifiedBudgetModel, maxQuestions: number): QuestionSpec[] {
  const questions: QuestionSpec[] = [];

  // Ask about essential/flexible for expenses with null values
  const unclarifiedExpenses = model.expenses.filter(e => e.essential === null);
  if (unclarifiedExpenses.length > 0) {
    questions.push({
      question_id: 'essential_expenses',
      prompt: 'Which of these expenses are essential (must pay) vs flexible (can reduce)?',
      components: unclarifiedExpenses.slice(0, 5).map(exp => ({
        component: 'toggle' as const,
        field_id: `essential_${exp.id}`,
        label: exp.category,
        binding: `expenses.${exp.id}.essential`,
      })),
    });
  }

  // Ask about optimization focus
  questions.push({
    question_id: 'optimization_focus',
    prompt: 'What should we prioritize for your budget optimization?',
    components: [{
      component: 'dropdown' as const,
      field_id: 'optimization_focus',
      label: 'Optimization Focus',
      binding: 'preferences.optimization_focus',
      options: ['debt', 'savings', 'balanced'],
    }],
  });

  // Ask about debts if any exist with approximate values
  const approximateDebts = model.debts.filter(d => d.approximate);
  if (approximateDebts.length > 0) {
    for (const debt of approximateDebts.slice(0, 2)) {
      questions.push({
        question_id: `debt_details_${debt.id}`,
        prompt: `What are the details for your ${debt.name}?`,
        components: [
          {
            component: 'number_input' as const,
            field_id: `${debt.id}_balance`,
            label: 'Current Balance',
            binding: `debts.${debt.id}.balance`,
            unit: 'USD',
          },
          {
            component: 'number_input' as const,
            field_id: `${debt.id}_interest_rate`,
            label: 'Interest Rate',
            binding: `debts.${debt.id}.interest_rate`,
            unit: '%',
            min: 0,
            max: 100,
          },
        ],
      });
    }
  }

  return questions.slice(0, maxQuestions);
}

/**
 * Generate deterministic suggestions (fallback)
 */
function generateDeterministicSuggestions(model: UnifiedBudgetModel): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const surplus = model.summary.surplus;

  // Suggestion for high-interest debt
  const highInterestDebt = model.debts.filter(d => d.interest_rate > 15);
  if (highInterestDebt.length > 0) {
    const topDebt = highInterestDebt.sort((a, b) => b.interest_rate - a.interest_rate)[0];
    suggestions.push({
      id: `debt-${topDebt.id}`,
      title: `Prioritize ${topDebt.name} Payment`,
      description: `Your ${topDebt.name} has a ${topDebt.interest_rate}% interest rate. Paying this down first saves the most money long-term.`,
      expected_monthly_impact: topDebt.balance * (topDebt.interest_rate / 100 / 12),
      rationale: 'High-interest debt compounds quickly. Every extra dollar paid reduces future interest.',
      tradeoffs: 'Money used for debt payoff cannot be invested or saved elsewhere.',
    });
  }

  // Suggestion for emergency fund if surplus is positive
  if (surplus > 0) {
    suggestions.push({
      id: 'emergency-fund',
      title: 'Build Emergency Fund',
      description: `With your $${surplus.toLocaleString()} monthly surplus, consider building a 3-6 month emergency fund.`,
      expected_monthly_impact: 0,
      rationale: 'An emergency fund prevents going into debt when unexpected expenses arise.',
      tradeoffs: 'Money in savings earns less than paying down debt or investing.',
    });
  }

  // Suggestion for flexible expense reduction
  const flexibleExpenses = model.expenses.filter(e => !e.essential);
  const totalFlexible = flexibleExpenses.reduce((sum, e) => sum + Math.abs(e.monthly_amount), 0);
  if (totalFlexible > 0) {
    suggestions.push({
      id: 'reduce-flexible',
      title: 'Review Flexible Spending',
      description: `You have $${totalFlexible.toLocaleString()}/month in flexible expenses. Consider if there are areas to reduce.`,
      expected_monthly_impact: totalFlexible * 0.1,
      rationale: 'Small reductions across multiple categories add up over time.',
      tradeoffs: 'Reducing spending may impact quality of life or convenience.',
    });
  }

  return suggestions;
}

