/**
 * AI integration for clarification questions and suggestions
 * 
 * Uses OpenAI or Vercel AI Gateway for generating contextual questions
 * and personalized budget optimization suggestions.
 */

import OpenAI from 'openai';
import type { UnifiedBudgetModel, QuestionSpec, Suggestion } from './budgetModel';
import { ESSENTIAL_PREFIX, SUPPORTED_SIMPLE_FIELD_IDS, parseDebtFieldId } from './normalization';
import { loadProviderSettings, isAIGatewayEnabled } from './providerSettings';

// Load default provider settings
const providerSettings = loadProviderSettings({
  providerEnv: 'CLARIFICATION_PROVIDER', // Using clarification as default focus
  timeoutEnv: 'AI_TIMEOUT_SECONDS',
  temperatureEnv: 'AI_TEMPERATURE',
  maxTokensEnv: 'AI_MAX_TOKENS',
});

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
  if (providerSettings.providerName !== 'openai' || !providerSettings.openai) {
    return null;
  }

  return new OpenAI({
    apiKey: providerSettings.openai.apiKey,
    baseURL: providerSettings.openai.apiBase,
  });
}

/**
 * Get OpenAI model name
 */
function getModel(): string {
  return providerSettings.openai?.model || 'gpt-4o-mini';
}

/**
 * Check if AI is enabled
 */
export function isAIEnabled(): boolean {
  return providerSettings.providerName === 'openai' && !!providerSettings.openai?.apiKey;
}

/**
 * Get provider metadata for API responses
 */
export function getProviderMetadata(): {
  clarification_provider: string;
  suggestion_provider: string;
  ai_enabled: boolean;
  ai_gateway_enabled: boolean;
  model: string;
} {
  const aiEnabled = isAIEnabled();
  const aiGatewayEnabled = isAIGatewayEnabled();
  const provider = aiEnabled ? 'openai' : 'deterministic';
  
  return {
    clarification_provider: provider,
    suggestion_provider: provider,
    ai_enabled: aiEnabled,
    ai_gateway_enabled: aiGatewayEnabled,
    model: getModel(),
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

## CRITICAL PRIORITY: USER'S QUESTION COMES FIRST
The user has asked a specific question. Your FIRST 1-2 suggestions MUST directly and specifically address their exact question.
DO NOT start with generic advice (like "build emergency fund" or "cut expenses") unless that directly answers their question.

## GOAL-SPECIFIC GUIDANCE
When the user asks about specific goals, provide targeted advice:

### Down Payment / House Savings:
- Calculate monthly savings needed: (target amount - current savings) / months to goal
- Recommend high-yield savings accounts or money market accounts (NOT investment accounts)
- Suggest dedicated "house fund" separate from other savings
- Discuss the 20% down payment benchmark vs PMI tradeoffs
- Consider closing cost reserves (2-5% of home price)

### Debt Payoff:
- Compare avalanche (highest rate first) vs snowball (smallest balance first)
- Calculate payoff timeline with extra payments
- Discuss balance transfer options for high-rate credit cards

### Retirement Savings:
- Start with employer 401k match (free money)
- Discuss Roth vs Traditional based on current vs expected future tax bracket
- Target 15-20% of gross income as a long-term goal

### Emergency Fund:
- Target 3-6 months of essential expenses
- Recommend high-yield savings account
- Calculate specific dollar target based on their expenses

## STRUCTURE YOUR SUGGESTIONS
1. FIRST suggestion: Directly answers their question with specific action steps
2. SECOND suggestion: Related action that supports their goal
3. REMAINING suggestions: Other relevant optimizations (only if helpful)

## SUGGESTION QUALITY REQUIREMENTS
- Every rationale MUST explicitly reference their question (e.g., "To save for your down payment...")
- Include specific dollar amounts calculated from their budget
- Provide timelines when goals are mentioned
- Explain HOW to implement each suggestion, not just WHAT to do

## DO NOT
- Lead with generic advice like "build emergency fund" unless they asked about it
- Suggest cutting $8 from entertainment when they're asking about saving $50k for a house
- Provide suggestions that don't relate to their question
- Be vague about dollar amounts or timelines

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
 * Detect the primary financial goal from the user's query
 */
type GoalType = 'down_payment' | 'retirement' | 'debt_payoff' | 'emergency_fund' | 'savings' | null;

function detectGoalType(userQuery: string): GoalType {
  const queryLower = userQuery.toLowerCase();
  
  // Down payment / house related
  if (['down payment', 'house', 'home', 'buy a home', 'buy a house', 'mortgage', 'first home', 'homeowner', 'property']
      .some(keyword => queryLower.includes(keyword))) {
    return 'down_payment';
  }
  
  // Retirement related
  if (['retirement', 'retire', '401k', 'ira', 'roth', 'pension', 'social security', 'retire early', 'fire']
      .some(keyword => queryLower.includes(keyword))) {
    return 'retirement';
  }
  
  // Debt payoff related
  if (['debt', 'pay off', 'payoff', 'credit card', 'student loan', 'loan', 'debt free', 'eliminate debt', 'pay down']
      .some(keyword => queryLower.includes(keyword))) {
    return 'debt_payoff';
  }
  
  // Emergency fund related
  if (['emergency fund', 'emergency savings', 'rainy day', 'safety net', 'buffer', 'unexpected expenses']
      .some(keyword => queryLower.includes(keyword))) {
    return 'emergency_fund';
  }
  
  // Savings related (generic)
  if (['save', 'saving', 'savings', 'save money', 'save more']
      .some(keyword => queryLower.includes(keyword))) {
    return 'savings';
  }
  
  return null;
}

/**
 * Build goal-specific context section for the prompt
 */
function buildGoalContext(goalType: GoalType, model: UnifiedBudgetModel): string {
  if (!goalType) return '';
  
  const surplus = model.summary.surplus;
  const essentialExpenses = model.expenses.filter(e => e.essential).reduce((sum, e) => sum + Math.abs(e.monthly_amount), 0);
  const flexibleExpenses = model.expenses.filter(e => !e.essential).reduce((sum, e) => sum + Math.abs(e.monthly_amount), 0);
  
  const lines: string[] = ['\n## GOAL-SPECIFIC CONTEXT (Use this to provide targeted advice)'];
  
  switch (goalType) {
    case 'down_payment':
      lines.push('The user is asking about saving for a home purchase.');
      lines.push(`- Current monthly surplus available: $${surplus.toLocaleString()}`);
      lines.push(`- If they saved entire surplus: $${(surplus * 12).toLocaleString()}/year, $${(surplus * 24).toLocaleString()} in 2 years`);
      lines.push('- Recommend: High-yield savings account (4-5% APY currently)');
      lines.push('- Typical down payment: 20% to avoid PMI, or 3-5% with FHA/conventional');
      lines.push("- Don't forget closing costs: 2-5% of home price");
      break;
    
    case 'retirement':
      lines.push('The user is asking about retirement savings.');
      const income = model.summary.total_income;
      const recommended15 = income * 0.15;
      lines.push(`- Current monthly income: $${income.toLocaleString()}`);
      lines.push(`- 15% of income (recommended target): $${recommended15.toLocaleString()}/month`);
      lines.push('- 2024 401k limit: $23,000 ($30,500 if 50+)');
      lines.push('- 2024 IRA limit: $7,000 ($8,000 if 50+)');
      break;
    
    case 'debt_payoff':
      lines.push('The user is asking about paying off debt.');
      if (model.debts.length > 0) {
        const totalDebt = model.debts.reduce((sum, d) => sum + d.balance, 0);
        const totalMinPayments = model.debts.reduce((sum, d) => sum + d.min_payment, 0);
        const highestRate = Math.max(...model.debts.map(d => d.interest_rate));
        lines.push(`- Total debt: $${totalDebt.toLocaleString()}`);
        lines.push(`- Total minimum payments: $${totalMinPayments.toLocaleString()}/month`);
        lines.push(`- Highest interest rate: ${highestRate}%`);
        lines.push(`- Extra available after minimums: $${surplus.toLocaleString()}/month`);
      } else {
        lines.push('- No debts detected in their budget');
      }
      break;
    
    case 'emergency_fund':
      lines.push('The user is asking about building an emergency fund.');
      lines.push(`- Monthly essential expenses: $${essentialExpenses.toLocaleString()}`);
      lines.push(`- 3-month target: $${(essentialExpenses * 3).toLocaleString()}`);
      lines.push(`- 6-month target: $${(essentialExpenses * 6).toLocaleString()}`);
      if (surplus > 0) {
        const monthsTo3mo = (essentialExpenses * 3) / surplus;
        lines.push(`- Time to reach 3-month fund at current surplus: ${monthsTo3mo.toFixed(1)} months`);
      }
      break;
    
    case 'savings':
      lines.push('The user is asking about saving money.');
      lines.push(`- Current monthly surplus: $${surplus.toLocaleString()}`);
      lines.push(`- Total flexible expenses: $${flexibleExpenses.toLocaleString()}/month`);
      lines.push('- Areas to review: Subscriptions, dining out, entertainment');
      break;
  }
  
  return lines.join('\n');
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

  // Detect goal type and build goal-specific context
  const goalType = detectGoalType(userQuery);
  const goalContext = buildGoalContext(goalType, model);

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

Generate 3-6 prioritized suggestions that answer: "${userQuery || 'Help me optimize my budget'}"
${goalContext}`;
}

/**
 * Map a field ID to a valid format, attempting to fix common variations.
 * This is more permissive than strict validation - it tries to map
 * semantic field IDs to the expected format.
 */
function mapFieldId(fieldId: string, model: UnifiedBudgetModel): string | null {
  // If it's already a supported simple field ID, use it
  if (SUPPORTED_SIMPLE_FIELD_IDS.has(fieldId)) {
    return fieldId;
  }

  // Build lookup maps
  const expenseByCategory: Record<string, string> = {};
  const expenseIds = new Set<string>();
  for (const exp of model.expenses) {
    expenseByCategory[exp.category.toLowerCase().replace(/ /g, '_')] = exp.id;
    expenseIds.add(exp.id);
  }

  const debtByName: Record<string, string> = {};
  const debtIds = new Set<string>();
  for (const debt of model.debts) {
    debtByName[debt.name.toLowerCase().replace(/ /g, '_')] = debt.id;
    debtIds.add(debt.id);
  }

  const fieldLower = fieldId.toLowerCase();

  // Handle essential_* pattern
  if (fieldLower.startsWith(ESSENTIAL_PREFIX.toLowerCase())) {
    const suffix = fieldId.slice(ESSENTIAL_PREFIX.length);
    const suffixLower = suffix.toLowerCase().replace(/ /g, '_');

    // Check if suffix is already a valid expense ID
    if (expenseIds.has(suffix)) {
      return `${ESSENTIAL_PREFIX}${suffix}`;
    }

    // Try to match by category name
    if (expenseByCategory[suffixLower]) {
      return `${ESSENTIAL_PREFIX}${expenseByCategory[suffixLower]}`;
    }

    // Fuzzy match
    for (const [catName, expId] of Object.entries(expenseByCategory)) {
      if (suffixLower.includes(catName) || catName.includes(suffixLower)) {
        return `${ESSENTIAL_PREFIX}${expId}`;
      }
    }
  }

  // Check if it's already a valid expense essential
  if (fieldId.startsWith(ESSENTIAL_PREFIX)) {
    const expenseId = fieldId.slice(ESSENTIAL_PREFIX.length);
    if (expenseIds.has(expenseId)) {
      return fieldId;
    }
  }

  // Handle debt field patterns like "credit_card_interest_rate"
  const debtFields = ['balance', 'interest_rate', 'min_payment', 'priority', 'approximate'];
  for (const debtField of debtFields) {
    if (fieldLower.endsWith(`_${debtField}`)) {
      const prefix = fieldId.slice(0, -(debtField.length + 1));
      const prefixLower = prefix.toLowerCase().replace(/ /g, '_');

      // Check if prefix is already a valid debt ID
      if (debtIds.has(prefix)) {
        return `${prefix}_${debtField}`;
      }

      // Try to match by debt name
      if (debtByName[prefixLower]) {
        return `${debtByName[prefixLower]}_${debtField}`;
      }

      // Fuzzy match
      for (const [debtName, debtId] of Object.entries(debtByName)) {
        if (prefixLower.includes(debtName) || debtName.includes(prefixLower)) {
          return `${debtId}_${debtField}`;
        }
      }
    }
  }

  // Check debt fields with existing validation
  const debtTarget = parseDebtFieldId(fieldId);
  if (debtTarget) {
    const [debtId] = debtTarget;
    if (debtIds.has(debtId)) {
      return fieldId;
    }
  }

  // If we can't map it, return it anyway - it might be a new field type
  // that will be handled by the answer processing
  console.log(`[AI] Field ID unmapped, allowing through: ${fieldId}`);
  return fieldId;
}

/**
 * Validate and map generated question field IDs against the model.
 * More permissive than before - tries to map field IDs rather than reject them.
 */
function validateQuestionFieldIds(
  questions: QuestionSpec[],
  model: UnifiedBudgetModel
): QuestionSpec[] {
  return questions.map(question => {
    const mappedComponents = question.components.map(comp => {
      const mappedFieldId = mapFieldId(comp.field_id, model);
      if (mappedFieldId) {
        return {
          ...comp,
          field_id: mappedFieldId,
          // Add binding if missing
          binding: comp.binding || `answers.${mappedFieldId}`,
        };
      }
      return null;
    }).filter((comp): comp is NonNullable<typeof comp> => comp !== null);

    return {
      ...question,
      components: mappedComponents,
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
      temperature: 0.6,  // Higher for more natural, conversational responses
      max_tokens: 2048,  // Increased for analysis + grouped questions
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
      temperature: 0.7,  // Higher for more creative, personalized responses
      max_tokens: 4096,  // Increased for analysis + detailed suggestions
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

