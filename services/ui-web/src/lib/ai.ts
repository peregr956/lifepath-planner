/**
 * AI integration for clarification questions and suggestions
 * 
 * Uses OpenAI or Vercel AI Gateway for generating contextual questions
 * and personalized budget optimization suggestions.
 */

import OpenAI from 'openai';
import type { UnifiedBudgetModel, QuestionSpec, Suggestion, QuestionGroup, ClarificationAnalysis, ClarificationResult } from './budgetModel';
import { ESSENTIAL_PREFIX, SUPPORTED_SIMPLE_FIELD_IDS, parseDebtFieldId } from './normalization';
import { loadProviderSettings, isAIGatewayEnabled } from './providerSettings';
import { analyzeQuery, getIntentDescription, type QueryAnalysis } from './queryAnalyzer';

// Load default provider settings
const providerSettings = loadProviderSettings({
  providerEnv: 'CLARIFICATION_PROVIDER', // Using clarification as default focus
  timeoutEnv: 'AI_TIMEOUT_SECONDS',
  temperatureEnv: 'AI_TEMPERATURE',
  maxTokensEnv: 'AI_MAX_TOKENS',
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

// System prompts
const CLARIFICATION_SYSTEM_PROMPT = `You are a financial planning assistant that generates clarification questions to help understand a user's budget and answer their specific question.

CRITICAL: The user has provided a specific question or concern. Your role is to:
1. Generate ONLY the questions needed to answer their specific query
2. Skip questions that aren't relevant to what they're asking about
3. Ask about financial philosophy and risk tolerance ONLY when relevant to their query

## QUESTION GENERATION RULES:
- Ask 4-7 concise, actionable questions maximum (fewer is better if that answers their query)
- Prioritize questions that directly help answer the user's specific question
- Use specific UI components: toggle (yes/no), dropdown (choices), number_input (amounts/rates), slider (ranges)
- Field IDs MUST follow exact naming conventions provided in the valid field IDs section
- Each question_id must be unique

## LINE ITEM SPECIFICITY (CRITICAL):
- Reference specific budget line items by their ID (e.g., "expense-1", "expense-2")
- Do NOT ask about broad categories like "Entertainment" - ask about specific line items
- If multiple items seem related (e.g., "Entertainment" and "Entertainment Subscriptions"), ask ONE consolidated question
- For essential/flexible classification, group ALL items into a single question with toggles for each item
- Example: "Which of these expenses are essential to you?" with toggles for each specific line item

## AVOID DUPLICATE QUESTIONS:
- Do NOT generate multiple questions about the same concept (e.g., two questions about essential expenses)
- Consolidate related questions into a single comprehensive question
- If asking about debt details, ask about ALL debts in ONE question, not separate questions per debt

Return structured JSON matching the provided function schema exactly.`;

// Phase 8.5.1: Refactored to remove prescriptive goal-specific guidance
// AI determines what's relevant based on user's full context
const SUGGESTION_SYSTEM_PROMPT = `You are a personal finance advisor generating actionable budget optimization suggestions.

## CRITICAL PRIORITY: USER'S QUESTION COMES FIRST
The user has asked a specific question. Your suggestions MUST directly address their exact question.
Analyze their budget data and query to understand what they're trying to achieve.

## YOUR ROLE
- Interpret the user's needs from their query and budget context
- Provide personalized suggestions based on their specific situation
- Only recommend what's relevant to their stated goals and concerns
- Do NOT assume they need advice on topics they haven't asked about

## SUGGESTION QUALITY REQUIREMENTS
- Every suggestion MUST relate to what the user is asking about
- Include specific dollar amounts calculated from their budget data
- Explain HOW to implement each suggestion, not just WHAT to do
- Provide timelines when the user has mentioned goals
- Reference their actual budget categories and amounts

## STRUCTURE YOUR SUGGESTIONS
1. FIRST 1-2 suggestions: Directly answer their question with specific action steps
2. REMAINING suggestions: Other relevant optimizations based on their budget (only if helpful)

## DO NOT
- Assume the user needs advice on topics they haven't mentioned (e.g., emergency funds, retirement)
- Lead with generic advice that doesn't relate to their question
- Provide suggestions that don't connect to their stated goals
- Be vague about dollar amounts when you have their budget data
- Prescribe financial philosophies or frameworks they haven't asked about

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
 * Build user prompt for clarification questions
 */
function buildClarificationPrompt(model: UnifiedBudgetModel, userQuery: string): string {
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
  const queryAnalysisBlock = queryAnalysisSection
    ? `\n${queryAnalysisSection}\n`
    : '';

  return `## USER'S QUESTION (This is what they need help with)
"${userQuery || 'Help me understand and optimize my budget'}"

Generate ONLY the clarification questions needed to answer their specific question above.
${queryAnalysisBlock}
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

// Phase 8.5.1: Removed detectGoalType() and buildGoalContext() functions
// AI should determine user goals from full context rather than keyword matching

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

  // Phase 8.5.1: Removed goal detection and prescriptive context building
  // AI should interpret user needs from full context

  return `## USER'S QUESTION (Generate suggestions that answer this)
"${userQuery || 'Help me optimize my budget and improve my financial situation'}"

${profileSection}

Generate suggestions that directly address their question above. Analyze their budget data to understand their situation and provide relevant, personalized recommendations.

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
 * Generate clarification questions using AI with full analysis and grouping
 */
export async function generateClarificationQuestionsWithAnalysis(
  model: UnifiedBudgetModel,
  userQuery?: string,
  maxQuestions: number = 5
): Promise<ClarificationResult> {
  const client = getOpenAIClient();
  
  if (!client) {
    // Fall back to deterministic questions
    return {
      questions: generateDeterministicQuestions(model, maxQuestions),
    };
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
            description: 'Generate structured clarification questions for the budget model with analysis.',
            parameters: QUESTION_SPEC_SCHEMA,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_clarification_questions' } },
      temperature: 0.6,  // Higher for more natural, conversational responses
      max_tokens: 3072,  // Increased for analysis + grouped questions
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
 * Generate suggestions using AI
 * Phase 8.5: Added retry logic to ensure AI is always used when possible
 */
export async function generateSuggestions(
  model: UnifiedBudgetModel,
  userQuery?: string,
  userProfile?: Record<string, unknown>
): Promise<{ suggestions: Suggestion[]; usedDeterministic: boolean }> {
  const client = getOpenAIClient();

  if (!client) {
    // Fall back to deterministic suggestions
    console.log('[AI] No AI client available, using deterministic suggestions');
    return {
      suggestions: generateDeterministicSuggestions(model),
      usedDeterministic: true,
    };
  }

  // Use retry wrapper to ensure AI is used when possible
  const retryResult = await withRetry(async () => {
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
      temperature: 0.7,
      max_tokens: 4096,
    });

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      throw new Error('No tool calls in AI response');
    }

    const parsed = JSON.parse(toolCalls[0].function.arguments);
    return (parsed.suggestions || []) as Suggestion[];
  });

  if (retryResult) {
    return {
      suggestions: retryResult.result,
      usedDeterministic: false,
    };
  }

  // All retries failed, use deterministic fallback
  console.warn('[AI] All AI attempts failed, using deterministic suggestions');
  return {
    suggestions: generateDeterministicSuggestions(model),
    usedDeterministic: true,
  };
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


