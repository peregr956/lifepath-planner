/**
 * AI integration for clarification questions and suggestions
 * 
 * Uses OpenAI or Vercel AI Gateway for generating contextual questions
 * and personalized budget optimization suggestions.
 * 
 * Phase 8.5.2: Prompt Engineering with AI Generalizability
 * 
 * Design Philosophy (aligned with Phase 8.5.1):
 * - The AI is more intelligent than hardcoded program rules
 * - Prompts provide objective, role, context, and output format
 * - Prompts do NOT prescribe behavioral rules or "do not" constraints
 * - AI determines relevance, priorities, and appropriate responses
 * 
 * Structure:
 * - System prompts define objective/role/output format only
 * - User prompts provide delimited data sections
 * - <user_profile> section prepared for Phase 8.5.3 foundational context
 */

import OpenAI from 'openai';
import type { UnifiedBudgetModel, QuestionSpec, Suggestion, QuestionGroup, ClarificationAnalysis, ClarificationResult, ExtendedSuggestion, ExecutiveSummaryResult, SuggestionAssumptionResult, ProjectedOutcomeResult, ExtendedSuggestionResult } from './budgetModel';
import type { FoundationalContext, HydratedFoundationalContext } from '@/types/budget';
import type { UserProfile } from '@/lib/db';
import { ESSENTIAL_PREFIX, SUPPORTED_SIMPLE_FIELD_IDS, parseDebtFieldId } from './normalization';
import { loadProviderSettings, isAIGatewayEnabled } from './providerSettings';
import { analyzeQuery, getIntentDescription, type QueryAnalysis } from './queryAnalyzer';
import { buildLayeredContextString } from './aiContextBuilder';

// Load default provider settings
// Auto-detect OpenAI when API key is available, otherwise fall back to deterministic
const providerSettings = loadProviderSettings({
  providerEnv: 'CLARIFICATION_PROVIDER', // Using clarification as default focus
  timeoutEnv: 'AI_TIMEOUT_SECONDS',
  temperatureEnv: 'AI_TEMPERATURE',
  maxTokensEnv: 'AI_MAX_TOKENS',
  defaultProvider: process.env.OPENAI_API_KEY ? 'openai' : 'deterministic',
  defaultTimeout: 30,
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
});

// Question component schema (shared between flat questions and grouped questions)
const QUESTION_COMPONENT_SCHEMA = {
  type: 'object' as const,
  properties: {
    component: { type: 'string' as const, enum: ['toggle', 'dropdown', 'number_input', 'slider', 'text_input'] },
    field_id: { type: 'string' as const },
    label: { type: 'string' as const },
    binding: { type: 'string' as const },
    options: { type: 'array' as const, items: { type: 'string' as const } },
    min: { type: 'number' as const },
    max: { type: 'number' as const },
    unit: { type: 'string' as const },
  },
  required: ['component', 'field_id', 'label'],
};

// Individual question schema
const QUESTION_ITEM_SCHEMA = {
  type: 'object' as const,
  properties: {
    question_id: { type: 'string' as const },
    prompt: { type: 'string' as const },
    components: {
      type: 'array' as const,
      items: QUESTION_COMPONENT_SCHEMA,
    },
  },
  required: ['question_id', 'prompt', 'components'],
};

// Question schema for OpenAI function calling
// Updated to support analysis phase and grouped questions (matching Python version)
const QUESTION_SPEC_SCHEMA = {
  type: 'object' as const,
  properties: {
    // Analysis phase - initial budget analysis before asking questions
    analysis: {
      type: 'object' as const,
      properties: {
        normalized_budget_summary: {
          type: 'string' as const,
          description: 'A clear, readable summary of the normalized budget with grouped categories and totals.',
        },
        net_position: {
          type: 'string' as const,
          description: 'The calculated net monthly position (surplus or deficit) with the dollar amount.',
        },
        critical_observations: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Key observations about the budget, especially any inconsistencies.',
        },
        reasoning: {
          type: 'string' as const,
          description: 'Explanation of what the numbers suggest and what needs clarification before giving advice.',
        },
      },
      required: ['normalized_budget_summary', 'net_position', 'critical_observations', 'reasoning'],
    },
    // Grouped questions with section headers
    question_groups: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          group_id: {
            type: 'string' as const,
            description: 'Section identifier (e.g., "A", "B", "C").',
          },
          group_title: {
            type: 'string' as const,
            description: 'Title explaining the purpose of this group.',
          },
          questions: {
            type: 'array' as const,
            items: QUESTION_ITEM_SCHEMA,
            description: 'Questions in this group.',
          },
        },
        required: ['group_id', 'group_title', 'questions'],
      },
      description: 'Logically grouped questions with section headers.',
    },
    // Next steps explanation
    next_steps: {
      type: 'string' as const,
      description: 'Brief explanation of what happens after these questions are answered.',
    },
    // Legacy flat questions array for backward compatibility
    questions: {
      type: 'array' as const,
      items: QUESTION_ITEM_SCHEMA,
      description: 'Flat list of questions (legacy format, prefer question_groups).',
    },
  },
  required: ['analysis', 'question_groups', 'next_steps'],
};

// Phase 9.5: Extended suggestion schema with executive summary and priority ordering
const SUGGESTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    // Phase 9.5: Executive summary that directly answers the user's question
    executive_summary: {
      type: 'object' as const,
      properties: {
        answer: {
          type: 'string' as const,
          description: 'A direct 2-3 sentence answer to the user question, referencing specific dollar amounts from their budget.',
        },
        key_metrics: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              label: { type: 'string' as const },
              value: { type: 'string' as const },
              highlight: { type: 'boolean' as const },
            },
            required: ['label', 'value'],
          },
          description: 'Up to 4 key numbers/metrics that support the answer.',
        },
        confidence_level: {
          type: 'string' as const,
          enum: ['high', 'medium', 'low'],
          description: 'high = based on explicit user data, medium = some values estimated, low = limited information.',
        },
        confidence_explanation: {
          type: 'string' as const,
          description: 'Brief explanation of what data supports or limits confidence.',
        },
        methodology: {
          type: 'string' as const,
          description: 'How the calculations were performed (shown in expandable section).',
        },
      },
      required: ['answer', 'confidence_level', 'confidence_explanation'],
    },
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
          // Phase 9.5: Additional fields for enhanced suggestions
          priority: {
            type: 'number' as const,
            description: 'Priority order (1 = highest priority action to take first).',
          },
          category: {
            type: 'string' as const,
            enum: ['debt', 'savings', 'spending', 'income', 'general'],
            description: 'Category for grouping suggestions.',
          },
          key_insight: {
            type: 'string' as const,
            description: 'One sentence key takeaway for this suggestion.',
          },
          assumptions: {
            type: 'array' as const,
            items: { type: 'string' as const },
            description: 'Key assumptions made for this suggestion.',
          },
        },
        required: ['id', 'title', 'description', 'expected_monthly_impact', 'rationale', 'tradeoffs', 'priority', 'category'],
      },
    },
    // Phase 9.5: Global assumptions across all suggestions
    global_assumptions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          assumption: { type: 'string' as const },
          source: {
            type: 'string' as const,
            enum: ['explicit', 'inferred'],
          },
        },
        required: ['id', 'assumption', 'source'],
      },
      description: 'Assumptions that apply across multiple suggestions.',
    },
    // Phase 9.5: Projected outcomes if all suggestions are followed
    projected_outcomes: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          label: { type: 'string' as const },
          current_value: { type: 'number' as const },
          projected_value: { type: 'number' as const },
          percent_change: { type: 'number' as const },
          timeline_change: {
            type: 'object' as const,
            properties: {
              before: { type: 'string' as const },
              after: { type: 'string' as const },
            },
          },
        },
        required: ['label', 'current_value', 'projected_value', 'percent_change'],
      },
      description: 'Projected outcomes comparing before/after if suggestions are followed.',
    },
  },
  required: ['executive_summary', 'suggestions'],
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
  return providerSettings.openai?.model || 'gpt-4o';
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
export function getProviderMetadata(usedDeterministic: boolean = false): {
  clarification_provider: string;
  suggestion_provider: string;
  ai_enabled: boolean;
  ai_gateway_enabled: boolean;
  model: string;
  used_deterministic: boolean;
} {
  const aiEnabled = isAIEnabled();
  const aiGatewayEnabled = isAIGatewayEnabled();
  const provider = aiEnabled && !usedDeterministic ? 'openai' : 'deterministic';
  
  return {
    clarification_provider: provider,
    suggestion_provider: provider,
    ai_enabled: aiEnabled,
    ai_gateway_enabled: aiGatewayEnabled,
    model: getModel(),
    used_deterministic: usedDeterministic,
  };
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for AI calls
 * Phase 8.5: Ensure AI is always used when possible with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000
): Promise<{ result: T; usedRetry: boolean } | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, usedRetry: attempt > 0 };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      if (isLastAttempt) {
        console.error(`[AI] All ${maxRetries + 1} attempts failed:`, error);
        return null;
      }
      
      console.warn(`[AI] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`, error);
      await sleep(delayMs);
      // Exponential backoff
      delayMs *= 2;
    }
  }
  return null;
}

// System prompts - Phase 8.5.2: Refactored for AI generalizability

/**
 * CLARIFICATION_SYSTEM_PROMPT
 * 
 * Refactored to trust AI intelligence rather than prescribe behavior.
 * Provides objective, role, context, and output format only.
 */
const CLARIFICATION_SYSTEM_PROMPT = `Objective: Generate clarification questions that gather the context needed to answer this user's budget question.

Role: You are a financial planning assistant helping someone understand and optimize their budget.

Context: The user has uploaded budget data and asked a question. Their data arrives in delimited sections: <user_query>, <user_profile>, <budget_data>, and <available_fields>. Use whatever profile context is available to avoid redundant questions.

Output: Return JSON matching the provided function schema with your budget analysis, grouped questions, and next steps. Reference field_ids from <available_fields> for question components.

Success: Fewer, more targeted questions are better than comprehensive coverage.`;

/**
 * SUGGESTION_SYSTEM_PROMPT
 * 
 * Phase 9.5: Updated to generate executive summary + prioritized suggestions.
 * The executive summary directly answers the user's question first.
 */
const SUGGESTION_SYSTEM_PROMPT = `Objective: Answer the user's financial question directly, then provide prioritized actionable suggestions.

Role: You are a personal finance advisor. Your response should feel like a direct answer to their question, not just a data dump.

Context: The user's data arrives in delimited sections: <user_query>, <user_profile>, and <budget_data>. Their profile reflects stated preferences—use it to align your response with their goals.

Output Structure:
1. **executive_summary**: A direct 2-3 sentence answer to their specific question. Include key metrics that support your answer. State your confidence level honestly.
2. **suggestions**: Prioritized list (priority 1 = do this first). Each with category, impact calculated from their numbers, rationale, tradeoffs, and assumptions.
3. **global_assumptions**: Any assumptions that span multiple suggestions.
4. **projected_outcomes**: What improves if they follow your suggestions (current vs projected values).

Confidence Guidelines:
- "high": Based on explicit numbers they provided (income, expenses, debt rates)
- "medium": Some values were estimated or assumed (typical rates, average costs)
- "low": Limited information, significant uncertainty

Success Criteria:
- User can state what you recommend in one sentence after reading the executive summary
- Each suggestion has a specific dollar impact from their budget
- Priority order reflects urgency and impact
- Assumptions are transparent`;

/**
 * Build available field IDs section for the prompt
 * These are the fields that can be used in question components
 */
function buildValidFieldIds(model: UnifiedBudgetModel): string {
  const lines = ['## Available Field IDs'];

  // Expense essentials
  if (model.expenses.length > 0) {
    lines.push('\n### Expense Essentials (essential_ prefix):');
    for (const exp of model.expenses) {
      if (exp.essential === null) {
        lines.push(`  - essential_${exp.id}  (${exp.category})`);
      }
    }
  }

  // Preferences
  lines.push('\n### Preferences:');
  lines.push('  - optimization_focus');
  lines.push('  - primary_income_type');
  lines.push('  - primary_income_stability');

  // Profile fields
  lines.push('\n### Profile:');
  lines.push('  - financial_philosophy');
  lines.push('  - risk_tolerance');
  lines.push('  - goal_timeline');

  // Debts
  if (model.debts.length > 0) {
    lines.push('\n### Debt Fields:');
    for (const debt of model.debts) {
      lines.push(`  - ${debt.id}_balance`);
      lines.push(`  - ${debt.id}_interest_rate`);
      lines.push(`  - ${debt.id}_min_payment`);
      lines.push(`  - ${debt.id}_priority`);
    }
  }

  return lines.join('\n');
}

/**
 * Build a section describing the analyzed user query for the AI prompt.
 * 
 * Phase 8.5.1: Refactored to provide raw signals only.
 * No longer includes prescriptive "suggested profile questions" -
 * AI determines what's relevant from the raw signals.
 */
function buildQueryAnalysisSection(userQuery: string): string {
  if (!userQuery || !userQuery.trim()) {
    return '';
  }

  const analysis = analyzeQuery(userQuery);

  const lines: string[] = ['## Query Analysis (Raw signals from user query)'];
  lines.push(`- Detected intent: ${analysis.primaryIntent} (${getIntentDescription(analysis.primaryIntent)})`);

  if (analysis.secondaryIntents.length > 0) {
    lines.push(`- Secondary intents: ${analysis.secondaryIntents.join(', ')}`);
  }

  if (analysis.mentionedGoals.length > 0) {
    lines.push(`- Mentioned goals: ${analysis.mentionedGoals.join(', ')}`);
  }

  if (analysis.mentionedConcerns.length > 0) {
    lines.push(`- Concerns: ${analysis.mentionedConcerns.join(', ')}`);
  }

  if (analysis.timeframe !== 'unspecified') {
    lines.push(`- Timeframe mentioned: ${analysis.timeframe}`);
  }

  // Phase 8.5.1: Removed prescriptive "Suggested profile questions" line
  // AI should determine what's relevant based on the raw signals above

  return lines.join('\n');
}

/**
 * Internal foundational context format for AI prompts (snake_case for prompt readability)
 * Maps from the camelCase FoundationalContext type imported from @/types/budget
 */
interface InternalFoundationalContext {
  financial_philosophy?: string;
  risk_tolerance?: string;
  primary_goal?: string;
  goal_timeline?: string;
  life_stage?: string;
  has_emergency_fund?: boolean;
}

/**
 * Build user prompt for clarification questions
 * 
 * Phase 9.1.4: Restructured with layered context sections including:
 * - <user_query>: The user's question
 * - <user_profile source="account" confidence="high/medium">: Established preferences
 * - <session_context>: Values set this session
 * - <observed_patterns>: Patterns from budget data
 * - <tensions>: Discrepancies to surface
 * - <guidance>: Behavior calibration
 * - <budget_data>: Financial data
 * - <available_fields>: Valid field IDs
 * 
 * @param model - The unified budget model
 * @param userQuery - The user's question
 * @param foundationalContext - Optional foundational context from Phase 8.5.3
 * @param hydratedContext - Optional hydrated context with source tracking (Phase 9.1.2)
 * @param accountProfile - Optional account profile with metadata (Phase 9.1.4)
 */
function buildClarificationPrompt(
  model: UnifiedBudgetModel,
  userQuery: string,
  foundationalContext?: InternalFoundationalContext,
  hydratedContext?: HydratedFoundationalContext | null,
  accountProfile?: UserProfile | null
): string {
  const incomeSection = model.income.length > 0
    ? model.income.map(inc => `- ${inc.name}: $${inc.monthly_amount.toLocaleString()}/mo (${inc.type}, ${inc.stability})`).join('\n')
    : 'No income sources detected.';

  const expenseSection = model.expenses.length > 0
    ? model.expenses.map(exp => {
        const essentialStr = exp.essential === true ? 'essential' : exp.essential === false ? 'flexible' : 'unknown';
        return `- ${exp.category} [ID: ${exp.id}]: $${exp.monthly_amount.toLocaleString()}/mo (essential=${essentialStr})`;
      }).join('\n')
    : 'No expenses detected.';

  const debtSection = model.debts.length > 0
    ? model.debts.map(debt => 
        `- ${debt.name} [ID: ${debt.id}]: balance=$${debt.balance.toLocaleString()}, rate=${debt.interest_rate}%, min=$${debt.min_payment.toLocaleString()}`
      ).join('\n')
    : 'No debts detected.';

  const validFieldIds = buildValidFieldIds(model);
  
  // Build query analysis section for better context
  const queryAnalysisSection = buildQueryAnalysisSection(userQuery);

  // Phase 9.1.4: Build layered context with confidence signals
  // Convert InternalFoundationalContext to FoundationalContext for the builder
  const plainContext: FoundationalContext | null = foundationalContext ? {
    financialPhilosophy: foundationalContext.financial_philosophy as FoundationalContext['financialPhilosophy'],
    riskTolerance: foundationalContext.risk_tolerance as FoundationalContext['riskTolerance'],
    primaryGoal: foundationalContext.primary_goal,
    goalTimeline: foundationalContext.goal_timeline as FoundationalContext['goalTimeline'],
    lifeStage: foundationalContext.life_stage as FoundationalContext['lifeStage'],
    hasEmergencyFund: foundationalContext.has_emergency_fund === true ? 'adequate' : 
                      foundationalContext.has_emergency_fund === false ? 'none' : null,
  } : null;

  const layeredContextString = buildLayeredContextString(
    hydratedContext || null,
    plainContext,
    accountProfile || null,
    model,
    userQuery
  );

  return `<user_query>
${userQuery || 'Help me understand and optimize my budget'}
</user_query>

${layeredContextString}

${queryAnalysisSection ? `<query_analysis>\n${queryAnalysisSection}\n</query_analysis>\n` : ''}
<budget_data>
## Summary
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
</budget_data>

<available_fields>
${validFieldIds}
</available_fields>`;
}

// Phase 8.5.1: Removed detectGoalType() and buildGoalContext() functions
// AI should determine user goals from full context rather than keyword matching

/**
 * Build user prompt for suggestions
 * 
 * Phase 9.1.4: Restructured with layered context sections including:
 * - <user_query>: The user's question
 * - <user_profile source="account" confidence="high/medium">: Established preferences
 * - <session_context>: Values set this session
 * - <observed_patterns>: Patterns from budget data
 * - <tensions>: Discrepancies to surface
 * - <guidance>: Behavior calibration
 * - <budget_data>: Complete financial breakdown
 * 
 * @param model - The unified budget model
 * @param userQuery - The user's question
 * @param userProfile - User profile including foundational context
 * @param hydratedContext - Optional hydrated context with source tracking (Phase 9.1.2)
 * @param accountProfile - Optional account profile with metadata (Phase 9.1.4)
 */
function buildSuggestionPrompt(
  model: UnifiedBudgetModel,
  userQuery: string,
  userProfile?: Record<string, unknown>,
  hydratedContext?: HydratedFoundationalContext | null,
  accountProfile?: UserProfile | null
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
  expenseSection += essentialExpenses.map(exp => `  - ${exp.category}: $${exp.monthly_amount.toLocaleString()}/mo`).join('\n');
  expenseSection += '\nFlexible:\n';
  expenseSection += flexibleExpenses.map(exp => `  - ${exp.category}: $${exp.monthly_amount.toLocaleString()}/mo`).join('\n');

  const debtSection = model.debts.length > 0
    ? model.debts.map(debt => {
        const priorityTag = debt.priority === 'high' ? '[HIGH priority]' : '';
        return `- ${debt.name}: $${debt.balance.toLocaleString()} balance at ${debt.interest_rate}% APR, min $${debt.min_payment.toLocaleString()} ${priorityTag}`;
      }).join('\n')
    : 'No debts detected. Great position for savings focus!';

  const totalDebtPayments = model.debts.reduce((sum, d) => sum + d.min_payment, 0);

  // Phase 9.1.4: Build layered context with confidence signals
  // Convert userProfile to FoundationalContext for the builder
  const plainContext: FoundationalContext | null = userProfile ? {
    financialPhilosophy: userProfile.financial_philosophy as FoundationalContext['financialPhilosophy'],
    riskTolerance: userProfile.risk_tolerance as FoundationalContext['riskTolerance'],
    primaryGoal: userProfile.primary_goal as string | null,
    goalTimeline: userProfile.goal_timeline as FoundationalContext['goalTimeline'],
    lifeStage: userProfile.life_stage as FoundationalContext['lifeStage'],
    hasEmergencyFund: userProfile.has_emergency_fund as FoundationalContext['hasEmergencyFund'],
  } : null;

  const layeredContextString = buildLayeredContextString(
    hydratedContext || null,
    plainContext,
    accountProfile || null,
    model,
    userQuery
  );

  return `<user_query>
${userQuery || 'Help me optimize my budget and improve my financial situation'}
</user_query>

${layeredContextString}

<budget_data>
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
</budget_data>`;
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
 * Extract the semantic concept from a question for deduplication.
 * Groups questions by their underlying purpose rather than exact ID.
 */
function extractSemanticConcept(question: QuestionSpec): string {
  const questionId = question.question_id.toLowerCase();
  
  // Essential/flexible classification questions
  if (questionId.includes('essential') || questionId.includes('flexible')) {
    return 'essential_classification';
  }
  
  // Financial philosophy questions
  if (questionId.includes('philosophy') || questionId.includes('approach')) {
    return 'financial_philosophy';
  }
  
  // Risk tolerance questions
  if (questionId.includes('risk')) {
    return 'risk_tolerance';
  }
  
  // Goal/timeline questions
  if (questionId.includes('goal') || questionId.includes('timeline') || questionId.includes('timeframe')) {
    return 'goal_timeline';
  }
  
  // Optimization focus questions
  if (questionId.includes('optimization') || questionId.includes('focus') || questionId.includes('priority')) {
    return 'optimization_focus';
  }
  
  // Debt-related questions - group by the concept, not individual debts
  if (questionId.includes('debt')) {
    return 'debt_details';
  }
  
  // Income stability questions
  if (questionId.includes('income') && (questionId.includes('stability') || questionId.includes('stable'))) {
    return 'income_stability';
  }
  
  // Default: use the question ID itself
  return questionId;
}

/**
 * Deduplicate questions based on their semantic concept.
 * Prevents asking multiple questions about the same topic (e.g., two "essential expense" questions).
 */
function deduplicateQuestions(questions: QuestionSpec[]): QuestionSpec[] {
  const seenConcepts = new Map<string, QuestionSpec>();
  
  for (const question of questions) {
    const concept = extractSemanticConcept(question);
    
    if (!seenConcepts.has(concept)) {
      seenConcepts.set(concept, question);
    } else {
      // Merge components from duplicate questions into the first one
      const existing = seenConcepts.get(concept)!;
      const existingFieldIds = new Set(existing.components.map(c => c.field_id));
      
      // Add any new components that don't already exist
      for (const comp of question.components) {
        if (!existingFieldIds.has(comp.field_id)) {
          existing.components.push(comp);
          existingFieldIds.add(comp.field_id);
        }
      }
      
      console.log(`[AI] Merged duplicate question concept: ${concept}`);
    }
  }
  
  return Array.from(seenConcepts.values());
}

/**
 * Parse questions from the AI response, supporting both grouped and flat formats.
 * Similar to Python _parse_questions() method.
 */
function parseQuestionsFromResponse(
  parsed: Record<string, unknown>,
  maxQuestions: number,
  model: UnifiedBudgetModel
): { questions: QuestionSpec[]; questionGroups?: QuestionGroup[]; analysis?: ClarificationAnalysis; nextSteps?: string } {
  const result: {
    questions: QuestionSpec[];
    questionGroups?: QuestionGroup[];
    analysis?: ClarificationAnalysis;
    nextSteps?: string;
  } = { questions: [] };

  // Extract analysis if present
  const rawAnalysis = parsed.analysis as Record<string, unknown> | undefined;
  if (rawAnalysis) {
    result.analysis = {
      normalized_budget_summary: String(rawAnalysis.normalized_budget_summary || ''),
      net_position: String(rawAnalysis.net_position || ''),
      critical_observations: Array.isArray(rawAnalysis.critical_observations)
        ? rawAnalysis.critical_observations.map(String)
        : [],
      reasoning: String(rawAnalysis.reasoning || ''),
    };

    console.log('[AI] Budget analysis:', {
      net_position: result.analysis.net_position,
      critical_observations_count: result.analysis.critical_observations.length,
    });
  }

  // Extract next_steps if present
  if (typeof parsed.next_steps === 'string') {
    result.nextSteps = parsed.next_steps;
  }

  // Extract questions from groups (new format) or flat array (legacy format)
  let questionGroups = parsed.question_groups as Array<Record<string, unknown>> | undefined;

  // Fall back to legacy flat format if no groups
  if (!questionGroups || !Array.isArray(questionGroups) || questionGroups.length === 0) {
    const flatQuestions = parsed.questions as QuestionSpec[] | undefined;
    if (flatQuestions && Array.isArray(flatQuestions)) {
      // Wrap in a single group for consistency
      questionGroups = [{
        group_id: 'A',
        group_title: 'Clarification Questions',
        questions: flatQuestions,
      }];
    }
  }

  if (questionGroups && Array.isArray(questionGroups)) {
    const parsedGroups: QuestionGroup[] = [];
    const allQuestions: QuestionSpec[] = [];

    for (const group of questionGroups) {
      const groupQuestions = (group.questions as QuestionSpec[]) || [];
      const validatedQuestions = validateQuestionFieldIds(groupQuestions, model);

      if (validatedQuestions.length > 0) {
        parsedGroups.push({
          group_id: String(group.group_id || ''),
          group_title: String(group.group_title || ''),
          questions: validatedQuestions,
        });
        allQuestions.push(...validatedQuestions);
      }
    }

    // Deduplicate questions based on semantic concept
    const deduplicatedQuestions = deduplicateQuestions(allQuestions);

    result.questionGroups = parsedGroups;
    result.questions = deduplicatedQuestions.slice(0, maxQuestions);
  }

  return result;
}

/**
 * Generate clarification questions using AI
 */
export async function generateClarificationQuestions(
  model: UnifiedBudgetModel,
  userQuery?: string,
  maxQuestions: number = 5
): Promise<QuestionSpec[]> {
  const result = await generateClarificationQuestionsWithAnalysis(model, userQuery, maxQuestions);
  return result.questions;
}

/**
 * Phase 9.1.4: Generate clarification questions with layered context
 * 
 * This is the primary entry point for clarification question generation.
 * It accepts foundational context, hydrated context, and account profile
 * to build confidence-aware prompts.
 * 
 * @param model - The unified budget model
 * @param userQuery - The user's question
 * @param foundationalContext - Plain foundational context (Phase 8.5.3)
 * @param maxQuestions - Maximum number of questions to generate
 * @param hydratedContext - Hydrated context with source tracking (Phase 9.1.2)
 * @param accountProfile - Account profile with metadata (Phase 9.1.4)
 */
export async function generateClarificationQuestionsWithContext(
  model: UnifiedBudgetModel,
  userQuery?: string,
  foundationalContext?: FoundationalContext | null,
  maxQuestions: number = 5,
  hydratedContext?: HydratedFoundationalContext | null,
  accountProfile?: UserProfile | null
): Promise<ClarificationResult> {
  const client = getOpenAIClient();
  
  if (!client) {
    // Fall back to deterministic questions
    return {
      questions: generateDeterministicQuestions(model, maxQuestions),
    };
  }

  // Convert FoundationalContext (camelCase) to internal format (snake_case for prompts)
  const internalContext: InternalFoundationalContext | undefined = foundationalContext ? {
    financial_philosophy: foundationalContext.financialPhilosophy ?? undefined,
    risk_tolerance: foundationalContext.riskTolerance ?? undefined,
    primary_goal: foundationalContext.primaryGoal ?? undefined,
    goal_timeline: foundationalContext.goalTimeline ?? undefined,
    life_stage: foundationalContext.lifeStage ?? undefined,
    has_emergency_fund: foundationalContext.hasEmergencyFund === 'adequate' || foundationalContext.hasEmergencyFund === 'robust' ? true : 
                        foundationalContext.hasEmergencyFund === 'none' ? false : undefined,
  } : undefined;

  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: CLARIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: buildClarificationPrompt(model, userQuery || '', internalContext, hydratedContext, accountProfile) },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_clarification_questions',
            description: 'Generate structured clarification questions for the budget model with analysis.',
            parameters: QUESTION_SPEC_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_clarification_questions' } },
      temperature: 0.6,
      max_tokens: 3072,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      console.warn('[AI] No tool calls in response, falling back to deterministic');
      return {
        questions: generateDeterministicQuestions(model, maxQuestions),
      };
    }

    const parsed = JSON.parse(toolCalls[0].function.arguments);
    const result = parseQuestionsFromResponse(parsed, maxQuestions, model);
    
    return {
      questions: result.questions,
      question_groups: result.questionGroups,
      analysis: result.analysis,
      next_steps: result.nextSteps,
    };
  } catch (error) {
    console.error('[AI] Error generating clarification questions:', error);
    return {
      questions: generateDeterministicQuestions(model, maxQuestions),
    };
  }
}

/**
 * Generate clarification questions using AI with full analysis and grouping
 * @deprecated Use generateClarificationQuestionsWithContext instead
 */
export async function generateClarificationQuestionsWithAnalysis(
  model: UnifiedBudgetModel,
  userQuery?: string,
  maxQuestions: number = 5
): Promise<ClarificationResult> {
  return generateClarificationQuestionsWithContext(model, userQuery, null, maxQuestions);
}

/**
 * Phase 9.1.4: Generate suggestions with layered context
 * 
 * This is the primary entry point for suggestion generation.
 * It accepts foundational context, hydrated context, and account profile
 * to build confidence-aware prompts.
 * 
 * @param model - The unified budget model
 * @param userQuery - The user's question
 * @param foundationalContext - Plain foundational context (Phase 8.5.3)
 * @param userProfile - Session user profile data
 * @param hydratedContext - Hydrated context with source tracking (Phase 9.1.2)
 * @param accountProfile - Account profile with metadata (Phase 9.1.4)
 */
export async function generateSuggestionsWithContext(
  model: UnifiedBudgetModel,
  userQuery?: string,
  foundationalContext?: FoundationalContext | null,
  userProfile?: Record<string, unknown>,
  hydratedContext?: HydratedFoundationalContext | null,
  accountProfile?: UserProfile | null
): Promise<ExtendedSuggestionResult> {
  const client = getOpenAIClient();

  if (!client) {
    // Fall back to deterministic suggestions
    console.log('[AI] No AI client available, using deterministic suggestions');
    const deterministicSuggestions = generateDeterministicSuggestions(model);
    return {
      suggestions: deterministicSuggestions,
      extended_suggestions: deterministicSuggestions.map((s, i) => ({
        ...s,
        priority: i + 1,
        category: 'general' as const,
      })),
      executive_summary: generateDeterministicExecutiveSummary(model, userQuery),
      usedDeterministic: true,
    };
  }

  // Merge foundational context into user profile for prompt building
  const enrichedProfile: Record<string, unknown> = {
    ...userProfile,
  };
  
  if (foundationalContext) {
    enrichedProfile.financial_philosophy = foundationalContext.financialPhilosophy;
    enrichedProfile.risk_tolerance = foundationalContext.riskTolerance;
    enrichedProfile.primary_goal = foundationalContext.primaryGoal;
    enrichedProfile.goal_timeline = foundationalContext.goalTimeline;
    enrichedProfile.life_stage = foundationalContext.lifeStage;
    enrichedProfile.has_emergency_fund = foundationalContext.hasEmergencyFund;
  }

  // Use retry wrapper to ensure AI is used when possible
  const retryResult = await withRetry(async () => {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
        { role: 'user', content: buildSuggestionPrompt(model, userQuery || '', enrichedProfile, hydratedContext, accountProfile) },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_optimization_suggestions',
            description: 'Generate structured budget optimization suggestions with executive summary.',
            parameters: SUGGESTION_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_optimization_suggestions' } },
      temperature: 0.7,
      max_tokens: 4096,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      throw new Error('No tool calls in AI response');
    }

    const parsed = JSON.parse(toolCalls[0].function.arguments);
    return parsed;
  });

  if (retryResult) {
    const parsed = retryResult.result;
    
    // Extract suggestions (both legacy and extended)
    const suggestions: Suggestion[] = (parsed.suggestions || []).map((s: ExtendedSuggestion) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      expected_monthly_impact: s.expected_monthly_impact,
      rationale: s.rationale,
      tradeoffs: s.tradeoffs,
    }));
    
    const extendedSuggestions: ExtendedSuggestion[] = (parsed.suggestions || []).map((s: ExtendedSuggestion, i: number) => ({
      ...s,
      priority: s.priority || i + 1,
      category: s.category || 'general',
    }));
    
    return {
      suggestions,
      extended_suggestions: extendedSuggestions,
      executive_summary: parsed.executive_summary as ExecutiveSummaryResult | undefined,
      global_assumptions: parsed.global_assumptions as SuggestionAssumptionResult[] | undefined,
      projected_outcomes: parsed.projected_outcomes as ProjectedOutcomeResult[] | undefined,
      usedDeterministic: false,
    };
  }

  // All retries failed, use deterministic fallback
  console.warn('[AI] All AI attempts failed, using deterministic suggestions');
  const deterministicSuggestions = generateDeterministicSuggestions(model);
  return {
    suggestions: deterministicSuggestions,
    extended_suggestions: deterministicSuggestions.map((s, i) => ({
      ...s,
      priority: i + 1,
      category: 'general' as const,
    })),
    executive_summary: generateDeterministicExecutiveSummary(model, userQuery),
    usedDeterministic: true,
  };
}

/**
 * Phase 9.5: Generate a deterministic executive summary when AI is unavailable
 */
function generateDeterministicExecutiveSummary(
  model: UnifiedBudgetModel,
  userQuery?: string
): ExecutiveSummaryResult {
  const surplus = model.summary.surplus;
  const savingsRate = model.summary.total_income > 0 
    ? (surplus / model.summary.total_income) * 100 
    : 0;
  
  let answer: string;
  if (!userQuery || userQuery.trim() === '') {
    answer = `Based on your budget, you have a monthly surplus of $${surplus.toLocaleString()} (${savingsRate.toFixed(1)}% savings rate). The suggestions below highlight opportunities to improve your financial position.`;
  } else {
    answer = `Based on your budget data, you have $${surplus.toLocaleString()} in monthly surplus available. Review the prioritized suggestions below for specific actions that address your question.`;
  }

  return {
    answer,
    key_metrics: [
      { label: 'Monthly Income', value: `$${model.summary.total_income.toLocaleString()}` },
      { label: 'Monthly Expenses', value: `$${model.summary.total_expenses.toLocaleString()}` },
      { label: 'Monthly Surplus', value: `$${surplus.toLocaleString()}`, highlight: true },
      { label: 'Savings Rate', value: `${savingsRate.toFixed(1)}%` },
    ],
    confidence_level: 'medium',
    confidence_explanation: 'Based on basic budget analysis. AI-powered analysis unavailable.',
    methodology: 'Simple calculation of income minus expenses. For more detailed analysis, ensure AI services are configured.',
  };
}

/**
 * Generate suggestions using AI
 * @deprecated Use generateSuggestionsWithContext instead
 */
export async function generateSuggestions(
  model: UnifiedBudgetModel,
  userQuery?: string,
  userProfile?: Record<string, unknown>
): Promise<ExtendedSuggestionResult> {
  return generateSuggestionsWithContext(model, userQuery, null, userProfile);
}

/**
 * Generate deterministic clarification questions (fallback)
 * Expanded in Phase 8.5 to include financial philosophy, risk tolerance, and goal timeline.
 */
function generateDeterministicQuestions(model: UnifiedBudgetModel, maxQuestions: number): QuestionSpec[] {
  const questions: QuestionSpec[] = [];

  // Ask about essential/flexible for expenses with null values
  const unclarifiedExpenses = model.expenses.filter(e => e.essential === null);
  if (unclarifiedExpenses.length > 0) {
    questions.push({
      question_id: 'essential_expenses',
      prompt: 'Which of these expenses are essential (must pay) vs flexible (can reduce)?',
      components: unclarifiedExpenses.slice(0, 8).map(exp => ({
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

  // Ask about financial philosophy (Phase 8.5: Expanded options)
  questions.push({
    question_id: 'financial_philosophy',
    prompt: 'Which budgeting or financial approach do you follow (if any)?',
    components: [{
      component: 'dropdown' as const,
      field_id: 'financial_philosophy',
      label: 'Financial Philosophy',
      binding: 'profile.financial_philosophy',
      options: [
        'neutral',           // No specific framework
        'r_personalfinance', // Reddit r/personalfinance flowchart
        'money_guy',         // Money Guy Show FOO
        'dave_ramsey',       // Dave Ramsey Baby Steps
        'bogleheads',        // Bogleheads
        'fire',              // FIRE movement
        'custom',            // I have my own approach
      ],
    }],
  });

  // Ask about risk tolerance (Phase 8.5)
  questions.push({
    question_id: 'risk_tolerance',
    prompt: 'How comfortable are you with financial risk?',
    components: [{
      component: 'dropdown' as const,
      field_id: 'risk_tolerance',
      label: 'Risk Tolerance',
      binding: 'profile.risk_tolerance',
      options: ['conservative', 'moderate', 'aggressive'],
    }],
  });

  // Ask about goal timeline (Phase 8.5)
  questions.push({
    question_id: 'goal_timeline',
    prompt: 'What is your primary financial goal timeframe?',
    components: [{
      component: 'dropdown' as const,
      field_id: 'goal_timeline',
      label: 'Goal Timeline',
      binding: 'profile.goal_timeline',
      options: ['immediate', 'short_term', 'medium_term', 'long_term'],
    }],
  });

  // Ask about debts if any exist with approximate values
  const approximateDebts = model.debts.filter(d => d.approximate);
  if (approximateDebts.length > 0) {
    // Consolidate all debt details into one question (Phase 8.5: avoid duplicates)
    const debtComponents: Array<{
      component: 'number_input';
      field_id: string;
      label: string;
      binding: string;
      unit?: string;
      min?: number;
      max?: number;
    }> = [];
    
    for (const debt of approximateDebts.slice(0, 3)) {
      debtComponents.push(
        {
          component: 'number_input' as const,
          field_id: `${debt.id}_balance`,
          label: `${debt.name} Balance`,
          binding: `debts.${debt.id}.balance`,
          unit: 'USD',
        },
        {
          component: 'number_input' as const,
          field_id: `${debt.id}_interest_rate`,
          label: `${debt.name} Interest Rate`,
          binding: `debts.${debt.id}.interest_rate`,
          unit: '%',
          min: 0,
          max: 100,
        }
      );
    }
    
    if (debtComponents.length > 0) {
      questions.push({
        question_id: 'debt_details',
        prompt: 'Please provide details about your debts:',
        components: debtComponents,
      });
    }
  }

  // Ask about income stability if we have income
  if (model.income.length > 0) {
    questions.push({
      question_id: 'income_stability',
      prompt: 'How stable is your primary income source?',
      components: [{
        component: 'dropdown' as const,
        field_id: 'primary_income_stability',
        label: 'Income Stability',
        binding: 'preferences.primary_income_stability',
        options: ['stable', 'variable', 'seasonal'],
      }],
    });
  }

  return questions.slice(0, maxQuestions);
}

/**
 * Generate deterministic suggestions (fallback)
 * 
 * Phase 8.5.1: Refactored to be truly minimal and non-prescriptive.
 * Only provides factual observations about the budget without assuming
 * what the user's goals or priorities should be.
 * 
 * This is a fallback for when AI is unavailable - it should NOT make
 * assumptions about what the user wants (emergency funds, specific
 * savings percentages, etc.).
 */
function generateDeterministicSuggestions(model: UnifiedBudgetModel): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const surplus = model.summary.surplus;

  // Factual observation: High-interest debt (>15% APR is objectively high)
  const highInterestDebt = model.debts.filter(d => d.interest_rate > 15);
  if (highInterestDebt.length > 0) {
    const topDebt = highInterestDebt.sort((a, b) => b.interest_rate - a.interest_rate)[0];
    const monthlyInterestCost = topDebt.balance * (topDebt.interest_rate / 100 / 12);
    suggestions.push({
      id: `debt-observation-${topDebt.id}`,
      title: `High-Interest Debt: ${topDebt.name}`,
      description: `You have a ${topDebt.name} with ${topDebt.interest_rate}% APR and $${topDebt.balance.toLocaleString()} balance. This costs approximately $${monthlyInterestCost.toFixed(0)}/month in interest.`,
      expected_monthly_impact: monthlyInterestCost,
      rationale: 'This is a factual observation about your current debt situation.',
      tradeoffs: 'How you prioritize this depends on your personal financial goals.',
    });
  }

  // Factual observation: Budget position (surplus or deficit)
  if (surplus !== 0) {
    const isDeficit = surplus < 0;
    suggestions.push({
      id: 'budget-position',
      title: isDeficit ? 'Budget Deficit' : 'Budget Surplus',
      description: isDeficit
        ? `Your expenses exceed income by $${Math.abs(surplus).toLocaleString()}/month. This is unsustainable long-term.`
        : `You have $${surplus.toLocaleString()}/month available after expenses. How you allocate this depends on your personal goals.`,
      expected_monthly_impact: Math.abs(surplus),
      rationale: 'This is a factual summary of your current budget position.',
      tradeoffs: 'For personalized advice on how to use your surplus (or address your deficit), please try again when AI is available.',
    });
  }

  // Note: We intentionally do NOT suggest:
  // - Emergency fund allocations (user may or may not need this)
  // - Specific spending reduction percentages (prescriptive)
  // - Financial philosophy frameworks (user should choose)
  // 
  // These are left to AI to determine based on user's actual query and context.

  return suggestions;
}


