/**
 * Query analyzer module for extracting intent, goals, concerns, and timeframe from user queries.
 * 
 * Ported from services/clarification-service/src/query_analyzer.py
 * 
 * This module provides keyword-based analysis for understanding what the user
 * wants help with from their budget.
 */

// Intent categories that drive question generation and suggestion prioritization
export type QueryIntent =
  | 'debt_payoff'
  | 'savings'
  | 'spending_optimization'
  | 'investment'
  | 'retirement'
  | 'emergency_fund'
  | 'major_purchase'
  | 'debt_vs_savings'
  | 'general_advice';

// Timeframe categories
export type Timeframe = 'immediate' | 'short_term' | 'medium_term' | 'long_term' | 'unspecified';

// Concern categories
export type ConcernType =
  | 'job_security'
  | 'debt_burden'
  | 'retirement_readiness'
  | 'healthcare_costs'
  | 'family_obligations';

/**
 * Structured representation of a user's query analysis
 */
export interface QueryAnalysis {
  rawQuery: string;
  primaryIntent: QueryIntent;
  secondaryIntents: QueryIntent[];
  mentionedGoals: string[];
  mentionedConcerns: ConcernType[];
  timeframe: Timeframe;
  confidence: number; // 0.0 to 1.0

  // Flags for what profile questions might be relevant
  needsRiskTolerance: boolean;
  needsFinancialPhilosophy: boolean;
  needsGoalClarification: boolean;
  needsTimelineClarification: boolean;
}

// Keyword patterns for intent detection
const INTENT_KEYWORDS: Record<QueryIntent, Set<string>> = {
  debt_payoff: new Set([
    'debt',
    'loan',
    'credit card',
    'pay off',
    'payoff',
    'interest rate',
    'balance',
    'owe',
    'owing',
    'paying down',
    'debt free',
    'minimum payment',
    'student loan',
    'car loan',
    'mortgage',
    'personal loan',
    'credit',
  ]),
  savings: new Set([
    'save',
    'saving',
    'savings',
    'emergency fund',
    'nest egg',
    'put away',
    'set aside',
    'rainy day',
    'savings account',
    'high yield',
    'hysa',
  ]),
  spending_optimization: new Set([
    'spending',
    'spend',
    'cut back',
    'reduce',
    'trim',
    'budget',
    'too much',
    'overspending',
    'expenses',
    'cut costs',
    'waste',
    'where am i spending',
    'spending habits',
    'track spending',
  ]),
  investment: new Set([
    'invest',
    'investing',
    'investment',
    'stocks',
    'bonds',
    'etf',
    'index fund',
    'brokerage',
    'portfolio',
    'returns',
    'growth',
    'compound',
    'market',
    '401k',
    'ira',
    'roth',
  ]),
  retirement: new Set([
    'retirement',
    'retire',
    'retiring',
    'pension',
    'social security',
    'fire',
    'financial independence',
    'early retirement',
    '401k',
    'ira',
    'roth ira',
    'traditional ira',
    'retirement account',
  ]),
  emergency_fund: new Set([
    'emergency fund',
    'emergency savings',
    'rainy day fund',
    '3 months',
    '6 months',
    'cushion',
    'safety net',
    'unexpected expenses',
  ]),
  major_purchase: new Set([
    'house',
    'home',
    'down payment',
    'car',
    'vehicle',
    'wedding',
    'vacation',
    'travel',
    'education',
    'tuition',
    'buy',
    'purchase',
    'afford',
    'save for',
    'saving for',
  ]),
  debt_vs_savings: new Set([
    'debt or save',
    'save or pay',
    'pay off or save',
    'debt vs savings',
    'should i pay',
    'should i save',
    'prioritize',
  ]),
  general_advice: new Set([
    'help',
    'advice',
    'tips',
    'suggestions',
    'recommend',
    'what should i',
    'how should i',
    'best way',
    'optimize',
    'improve',
  ]),
};

// Keywords that suggest specific concerns
const CONCERN_KEYWORDS: Record<ConcernType, Set<string>> = {
  job_security: new Set([
    'job security',
    'layoff',
    'laid off',
    'unemployment',
    'job loss',
    'stable job',
    'unstable income',
    'variable income',
    'freelance',
    'contract work',
    'gig economy',
  ]),
  debt_burden: new Set([
    'debt burden',
    'overwhelmed',
    'drowning in debt',
    "can't keep up",
    'high interest',
    'multiple debts',
    'debt stress',
    'collection',
  ]),
  retirement_readiness: new Set([
    'behind on retirement',
    'not saving enough',
    'catch up',
    'will i have enough',
    'retirement ready',
    'retire on time',
  ]),
  healthcare_costs: new Set([
    'healthcare',
    'medical',
    'health insurance',
    'hsa',
    'deductible',
    'medical bills',
    'health costs',
  ]),
  family_obligations: new Set([
    'kids',
    'children',
    'college fund',
    '529',
    'childcare',
    'family',
    'parents',
    'elder care',
    'support',
  ]),
};

// Keywords that suggest timeframes
const TIMEFRAME_KEYWORDS: Record<Timeframe, Set<string>> = {
  immediate: new Set([
    'now',
    'right now',
    'immediately',
    'this month',
    'today',
    'urgent',
    'asap',
    'quickly',
  ]),
  short_term: new Set([
    'soon',
    'this year',
    'next year',
    '1 year',
    'one year',
    '12 months',
    '6 months',
    'few months',
  ]),
  medium_term: new Set([
    '2 years',
    '3 years',
    '5 years',
    'couple years',
    'few years',
    'in a few years',
    'next few years',
  ]),
  long_term: new Set([
    '10 years',
    '20 years',
    'long term',
    'eventually',
    'someday',
    'retirement',
    'when i retire',
    'down the road',
    'future',
  ]),
  unspecified: new Set([]),
};

// Goal extraction patterns
const GOAL_PATTERNS: RegExp[] = [
  /save (?:for |up for )?(?:\$?[\d,]+k?\s+)?(?:for )?(.+?)(?:\?|$|\.)/i,
  /buy (?:a )?(.+?)(?:\?|$|\.)/i,
  /pay (?:off|down) (?:my )?(.+?)(?:\?|$|\.)/i,
  /afford (?:a |an )?(.+?)(?:\?|$|\.)/i,
  /saving for (?:a |an )?(.+?)(?:\?|$|\.)/i,
];

/**
 * Analyze a user's natural language query to extract intent, goals, and concerns.
 */
export function analyzeQuery(query: string): QueryAnalysis {
  if (!query || !query.trim()) {
    return {
      rawQuery: query || '',
      primaryIntent: 'general_advice',
      secondaryIntents: [],
      mentionedGoals: [],
      mentionedConcerns: [],
      timeframe: 'unspecified',
      confidence: 0.0,
      needsRiskTolerance: false,
      needsFinancialPhilosophy: false,
      needsGoalClarification: false,
      needsTimelineClarification: false,
    };
  }

  const queryLower = query.toLowerCase().trim();

  // Detect intents
  const intentScores: Map<QueryIntent, number> = new Map();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [QueryIntent, Set<string>][]) {
    let score = 0;
    for (const kw of keywords) {
      if (queryLower.includes(kw)) {
        score++;
      }
    }
    if (score > 0) {
      intentScores.set(intent, score);
    }
  }

  // Determine primary and secondary intents
  const sortedIntents = Array.from(intentScores.entries()).sort((a, b) => b[1] - a[1]);

  let primaryIntent: QueryIntent;
  let secondaryIntents: QueryIntent[];
  let confidence: number;

  if (sortedIntents.length > 0) {
    primaryIntent = sortedIntents[0][0];
    secondaryIntents = sortedIntents.slice(1, 3).map(([intent]) => intent);
    const maxScore = sortedIntents[0][1];
    confidence = Math.min(1.0, maxScore / 3.0); // Normalize to 0-1
  } else {
    primaryIntent = 'general_advice';
    secondaryIntents = [];
    confidence = 0.2;
  }

  // Detect concerns
  const mentionedConcerns: ConcernType[] = [];
  for (const [concern, keywords] of Object.entries(CONCERN_KEYWORDS) as [ConcernType, Set<string>][]) {
    for (const kw of keywords) {
      if (queryLower.includes(kw)) {
        mentionedConcerns.push(concern);
        break;
      }
    }
  }

  // Detect timeframe
  let timeframe: Timeframe = 'unspecified';
  for (const [tf, keywords] of Object.entries(TIMEFRAME_KEYWORDS) as [Timeframe, Set<string>][]) {
    if (tf === 'unspecified') continue;
    for (const kw of keywords) {
      if (queryLower.includes(kw)) {
        timeframe = tf;
        break;
      }
    }
    if (timeframe !== 'unspecified') break;
  }

  // Extract mentioned goals
  const mentionedGoals: string[] = [];
  for (const pattern of GOAL_PATTERNS) {
    const matches = queryLower.match(pattern);
    if (matches && matches[1]) {
      const goal = matches[1].trim();
      if (goal && !mentionedGoals.includes(goal)) {
        mentionedGoals.push(goal);
      }
    }
  }

  // Determine which profile questions are needed based on intent
  const investmentRelated = new Set<QueryIntent>(['investment', 'savings', 'retirement', 'debt_vs_savings']);
  const needsRiskTolerance =
    investmentRelated.has(primaryIntent) ||
    secondaryIntents.some((intent) => intent === 'investment' || intent === 'retirement');

  const philosophyRelated = new Set<QueryIntent>(['debt_vs_savings', 'debt_payoff', 'savings', 'retirement']);
  const needsFinancialPhilosophy = philosophyRelated.has(primaryIntent) || secondaryIntents.length > 0;

  const needsGoalClarification =
    (primaryIntent === 'major_purchase' || primaryIntent === 'savings') && mentionedGoals.length === 0;

  const timelineRelated = new Set<QueryIntent>(['savings', 'major_purchase', 'debt_payoff', 'retirement']);
  const needsTimelineClarification = timeframe === 'unspecified' && timelineRelated.has(primaryIntent);

  return {
    rawQuery: query,
    primaryIntent,
    secondaryIntents,
    mentionedGoals,
    mentionedConcerns,
    timeframe,
    confidence,
    needsRiskTolerance,
    needsFinancialPhilosophy,
    needsGoalClarification,
    needsTimelineClarification,
  };
}

/**
 * Get a human-readable description of an intent.
 */
export function getIntentDescription(intent: QueryIntent): string {
  const descriptions: Record<QueryIntent, string> = {
    debt_payoff: 'paying off debt',
    savings: 'building savings',
    spending_optimization: 'optimizing spending',
    investment: 'investing and growing wealth',
    retirement: 'retirement planning',
    emergency_fund: 'building an emergency fund',
    major_purchase: 'saving for a major purchase',
    debt_vs_savings: 'balancing debt payoff and savings',
    general_advice: 'general financial guidance',
  };
  return descriptions[intent] || 'financial planning';
}


