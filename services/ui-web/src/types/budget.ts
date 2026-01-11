export type IncomeEntry = {
  id: string;
  name: string;
  monthlyAmount: number;
  type: 'earned' | 'passive' | 'transfer';
  stability: 'stable' | 'variable' | 'seasonal';
};

export type ExpenseEntry = {
  id: string;
  category: string;
  monthlyAmount: number;
  essential?: boolean | null;
  notes?: string | null;
};

export type RateChange = {
  date: string;
  newRate: number;
};

export type DebtEntry = {
  id: string;
  name: string;
  balance: number;
  interestRate: number;
  minPayment: number;
  priority: 'high' | 'medium' | 'low';
  approximate: boolean;
  rateChanges?: RateChange[] | null;
};

export type BudgetPreferences = {
  optimizationFocus: 'debt' | 'savings' | 'balanced';
  protectEssentials: boolean;
  maxDesiredChangePerCategory: number;
};

export type BudgetSummary = {
  totalIncome: number;
  totalExpenses: number;
  surplus: number;
};

export type UnifiedBudgetModel = {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  debts: DebtEntry[];
  preferences: BudgetPreferences;
  summary: BudgetSummary;
};

export type UploadSummaryPreview = {
  detectedIncomeLines: number;
  detectedExpenseLines: number;
};

export type UploadBudgetResponse = {
  budgetId: string;
  status: string;
  detectedFormat?: string | null;
  detectedFormatHints?: Record<string, unknown> | null;
  summaryPreview?: UploadSummaryPreview | null;
};

export type ClarificationComponentType = 'number_input' | 'dropdown' | 'toggle' | 'slider' | 'text_input';

type BaseComponentDescriptor = {
  fieldId: string;
  label: string;
  description?: string;
  binding?: string;
};

export type NumberComponentConstraints = {
  minimum?: number;
  maximum?: number;
  unit?: string;
  step?: number;
  default?: number;
};

export type DropdownComponentConstraints = {
  default?: string;
};

export type ToggleComponentConstraints = {
  default?: boolean;
};

export type SliderComponentConstraints = NumberComponentConstraints;

export type TextInputComponentConstraints = {
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  default?: string;
};

export type ClarificationNumberInputDescriptor = BaseComponentDescriptor & {
  component: 'number_input';
  constraints?: NumberComponentConstraints;
};

export type ClarificationDropdownDescriptor = BaseComponentDescriptor & {
  component: 'dropdown';
  options: string[];
  constraints?: DropdownComponentConstraints;
};

export type ClarificationToggleDescriptor = BaseComponentDescriptor & {
  component: 'toggle';
  constraints?: ToggleComponentConstraints;
};

export type ClarificationSliderDescriptor = BaseComponentDescriptor & {
  component: 'slider';
  constraints?: SliderComponentConstraints;
};

export type ClarificationTextInputDescriptor = BaseComponentDescriptor & {
  component: 'text_input';
  constraints?: TextInputComponentConstraints;
};

export type ClarificationComponentDescriptor =
  | ClarificationNumberInputDescriptor
  | ClarificationDropdownDescriptor
  | ClarificationToggleDescriptor
  | ClarificationSliderDescriptor
  | ClarificationTextInputDescriptor;

export type ClarificationQuestion = {
  id: string;
  prompt: string;
  description?: string;
  components: ClarificationComponentDescriptor[];
};

// Analysis from AI clarification (initial budget analysis before asking questions)
export type ClarificationAnalysis = {
  normalizedBudgetSummary: string;
  netPosition: string;
  criticalObservations: string[];
  reasoning: string;
};

// Question group for organized questions with section headers
export type QuestionGroup = {
  groupId: string;
  groupTitle: string;
  questions: ClarificationQuestion[];
};

export type ClarificationAnswerValue = string | number | boolean;
export type ClarificationAnswers = Record<string, ClarificationAnswerValue>;

export type ClarificationQuestionsResponse = {
  budgetId: string;
  needsClarification: boolean;
  questions: ClarificationQuestion[];
  partialModel: UnifiedBudgetModel | null;
  // New fields for enhanced clarification response
  analysis?: ClarificationAnalysis | null;
  questionGroups?: QuestionGroup[] | null;
  nextSteps?: string | null;
};

export type SubmitAnswersResponse = {
  budgetId: string;
  status: string;
  readyForSummary?: boolean;
};

export type BudgetSuggestion = {
  id: string;
  title: string;
  description: string;
  expectedMonthlyImpact: number;
  rationale: string;
  tradeoffs: string;
};

export type ProviderMetadata = {
  clarificationProvider: string;
  suggestionProvider: string;
  aiEnabled: boolean;
  usedDeterministic?: boolean;  // true if fallback was used due to AI unavailability or failure
};

export type ClarificationQuestionsResponseWithMeta = ClarificationQuestionsResponse & {
  providerMetadata?: ProviderMetadata;
};

export type SummaryAndSuggestionsResponse = {
  budgetId: string;
  summary: BudgetSummary;
  categoryShares: Record<string, number>;
  suggestions: BudgetSuggestion[];
  providerMetadata?: ProviderMetadata;
  userQuery?: string | null;
  // Phase 9.5: Extended response fields
  executiveSummary?: ExecutiveSummary | null;
  extendedSuggestions?: ExtendedBudgetSuggestion[];
  assumptions?: SuggestionAssumption[];
  projectedOutcomes?: ProjectedOutcome[];
};

// User profile types for adaptive personalization
export type FinancialPhilosophy = 
  | 'r_personalfinance'  // Reddit r/personalfinance flowchart
  | 'money_guy'          // Money Guy Show FOO (Financial Order of Operations)
  | 'dave_ramsey'        // Dave Ramsey Baby Steps
  | 'bogleheads'         // Bogleheads investment philosophy
  | 'fire'               // Financial Independence, Retire Early
  | 'neutral'            // No specific framework
  | 'custom';            // User's own approach

export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type GoalTimeline = 'immediate' | 'short_term' | 'medium_term' | 'long_term';

// Phase 8.5.3: Life stage for contextualizing advice
export type LifeStage = 
  | 'early_career'       // Just starting out (20s, early 30s)
  | 'mid_career'         // Established career, building wealth
  | 'family_building'    // Starting/raising family, major expenses
  | 'peak_earning'       // Highest earning years, catch-up savings
  | 'pre_retirement'     // 5-10 years before retirement
  | 'retired';           // Already retired

// Phase 8.5.3: Emergency fund status
export type EmergencyFundStatus = 
  | 'none'               // No emergency fund
  | 'partial'            // Some savings, but less than target
  | 'adequate'           // 3-6 months expenses saved
  | 'robust';            // More than 6 months expenses

/**
 * Phase 8.5.3: Foundational Context
 * 
 * High-value context questions asked early in the flow to inform
 * all subsequent AI interactions. These establish the user's
 * financial worldview before budget-specific questions.
 */
export type FoundationalContext = {
  financialPhilosophy?: FinancialPhilosophy | null;
  riskTolerance?: RiskTolerance | null;
  primaryGoal?: string | null;
  goalTimeline?: GoalTimeline | null;
  lifeStage?: LifeStage | null;
  hasEmergencyFund?: EmergencyFundStatus | null;
};

/**
 * Calculate completion percentage for foundational context
 */
export function getFoundationalCompletionPercent(context: FoundationalContext | null | undefined): number {
  if (!context) return 0;
  const fields: (keyof FoundationalContext)[] = [
    'financialPhilosophy',
    'riskTolerance',
    'primaryGoal',
    'goalTimeline',
    'lifeStage',
    'hasEmergencyFund',
  ];
  const answered = fields.filter(f => context[f] !== null && context[f] !== undefined).length;
  return Math.round((answered / fields.length) * 100);
}

// ============================================================================
// Phase 9.1.2: Session Hydration Types
// ============================================================================

/**
 * Source of a session context value
 * Used to track whether a value came from account profile or was set explicitly this session
 */
export type SessionValueSource = 'account' | 'session_explicit';

/**
 * A value with its source tracked for hydration
 * Enables precedence: session_explicit > account
 */
export type HydratedValue<T> = {
  value: T;
  source: SessionValueSource;
};

/**
 * Foundational context with source tracking for each field
 * Used to show "using your saved preference" indicators and enable easy override
 */
export type HydratedFoundationalContext = {
  financialPhilosophy?: HydratedValue<FinancialPhilosophy | null>;
  riskTolerance?: HydratedValue<RiskTolerance | null>;
  primaryGoal?: HydratedValue<string | null>;
  goalTimeline?: HydratedValue<GoalTimeline | null>;
  lifeStage?: HydratedValue<LifeStage | null>;
  hasEmergencyFund?: HydratedValue<EmergencyFundStatus | null>;
};

/**
 * The fields that make up foundational context
 */
export const FOUNDATIONAL_CONTEXT_FIELDS: (keyof FoundationalContext)[] = [
  'financialPhilosophy',
  'riskTolerance',
  'primaryGoal',
  'goalTimeline',
  'lifeStage',
  'hasEmergencyFund',
];

/**
 * Extract plain values from hydrated context (strips source metadata)
 */
export function getPlainFoundationalContext(
  hydrated: HydratedFoundationalContext | null | undefined
): FoundationalContext {
  if (!hydrated) return {};
  return {
    financialPhilosophy: hydrated.financialPhilosophy?.value ?? null,
    riskTolerance: hydrated.riskTolerance?.value ?? null,
    primaryGoal: hydrated.primaryGoal?.value ?? null,
    goalTimeline: hydrated.goalTimeline?.value ?? null,
    lifeStage: hydrated.lifeStage?.value ?? null,
    hasEmergencyFund: hydrated.hasEmergencyFund?.value ?? null,
  };
}

/**
 * Check if a field value came from account profile (hydrated)
 */
export function isFieldFromAccount<K extends keyof HydratedFoundationalContext>(
  hydrated: HydratedFoundationalContext | null | undefined,
  field: K
): boolean {
  if (!hydrated || !hydrated[field]) return false;
  return hydrated[field]?.source === 'account';
}

/**
 * Calculate completion percentage for hydrated foundational context
 */
export function getHydratedCompletionPercent(
  hydrated: HydratedFoundationalContext | null | undefined
): number {
  if (!hydrated) return 0;
  const answered = FOUNDATIONAL_CONTEXT_FIELDS.filter(f => {
    const field = hydrated[f];
    return field?.value !== null && field?.value !== undefined;
  }).length;
  return Math.round((answered / FOUNDATIONAL_CONTEXT_FIELDS.length) * 100);
}

// ============================================================================
// Phase 9.1.1: Account Profile Metadata Types
// ============================================================================

/**
 * Confidence level for account profile fields
 * Used by AI to calibrate inference behavior (Phase 9.1.4)
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Source of a profile field value
 * Enables distinction between explicit user input and system inference
 */
export type ContextSource = 
  | 'explicit'           // User set directly in profile settings
  | 'onboarding'         // User provided during initial onboarding
  | 'session_promoted'   // Value from a session that user approved for profile
  | 'inferred';          // System inferred from behavior patterns

/**
 * Metadata for a single profile field tracking its source and confidence
 * Enables confidence-based inference in AI prompts
 */
export type FieldMetadata = {
  source: ContextSource;
  last_confirmed: string; // ISO timestamp
  confidence: ConfidenceLevel;
};

/**
 * Per-field metadata for the user account profile
 * Stored as JSONB in the user_profiles table
 */
export type ProfileMetadata = {
  financial_philosophy?: FieldMetadata;
  optimization_focus?: FieldMetadata;
  risk_tolerance?: FieldMetadata;
  primary_goal?: FieldMetadata;
  goal_timeline?: FieldMetadata;
  life_stage?: FieldMetadata;
  emergency_fund_status?: FieldMetadata;
};

/**
 * Account-level user profile (persisted in database)
 * Extended from Phase 9 to include all foundational fields
 * 
 * Note: This mirrors the db.ts UserProfile interface but uses
 * frontend-friendly naming for type reuse in components.
 */
export type AccountProfile = {
  id: string;
  userId: string;
  // Original Phase 9 fields
  defaultFinancialPhilosophy: FinancialPhilosophy | null;
  defaultOptimizationFocus: 'debt' | 'savings' | 'balanced' | null;
  defaultRiskTolerance: RiskTolerance | null;
  onboardingCompleted: boolean;
  // Phase 9.1.1: Extended foundational fields
  defaultPrimaryGoal: string | null;
  defaultGoalTimeline: GoalTimeline | null;
  defaultLifeStage: LifeStage | null;
  defaultEmergencyFundStatus: EmergencyFundStatus | null;
  // Phase 9.1.1: Confidence metadata
  profileMetadata: ProfileMetadata | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserProfile = {
  userQuery?: string | null;
  financialPhilosophy?: FinancialPhilosophy | null;
  philosophyNotes?: string | null;
  riskTolerance?: RiskTolerance | null;
  riskConcerns?: string[] | null;
  primaryGoal?: string | null;
  goalTimeline?: GoalTimeline | null;
  financialConcerns?: string[] | null;
  lifeStageContext?: string | null;
  // Phase 8.5.3: Additional foundational fields
  lifeStage?: LifeStage | null;
  hasEmergencyFund?: EmergencyFundStatus | null;
};

export type UserQueryRequest = {
  budgetId: string;
  query: string;
};

export type UserQueryResponse = {
  budgetId: string;
  query: string;
  status: string;
};

// ============================================================================
// Phase 9.5: Summary Page Redesign Types
// ============================================================================

// Note: ConfidenceLevel is already defined in Phase 9.1.1 above

/**
 * Executive summary synthesizing the AI's response to the user's question
 */
export type ExecutiveSummary = {
  /** Direct answer to the user's question (2-3 sentences) */
  answer: string;
  /** Key numbers/metrics highlighted in the summary */
  keyMetrics?: {
    label: string;
    value: string;
    highlight?: boolean;
  }[];
  /** Confidence level for this summary */
  confidenceLevel: ConfidenceLevel;
  /** Explanation for the confidence level */
  confidenceExplanation: string;
  /** Methodology explanation (shown in expandable section) */
  methodology?: string;
};

/**
 * Assumptions made by the AI in generating suggestions
 */
export type SuggestionAssumption = {
  id: string;
  assumption: string;
  /** Whether this assumption is based on explicit user data or inference */
  source: 'explicit' | 'inferred';
};

/**
 * Extended suggestion with priority and assumptions
 */
export type ExtendedBudgetSuggestion = BudgetSuggestion & {
  /** Priority order (1 = highest) */
  priority: number;
  /** Category for grouping (debt, savings, spending, income) */
  category: 'debt' | 'savings' | 'spending' | 'income' | 'general';
  /** Assumptions specific to this suggestion */
  assumptions?: string[];
  /** Short key insight (one sentence) */
  keyInsight?: string;
};

/**
 * Projected outcomes if user follows recommendations
 */
export type ProjectedOutcome = {
  /** Current value before implementing suggestions */
  currentValue: number;
  /** Projected value after implementing suggestions */
  projectedValue: number;
  /** Label for this outcome (e.g., "Monthly Surplus") */
  label: string;
  /** Percentage change */
  percentChange: number;
  /** Timeline outcome (e.g., "14 months → 6 months") */
  timelineChange?: {
    before: string;
    after: string;
  };
};

/**
 * Extended response from summary-and-suggestions API
 */
export type ExtendedSummaryResponse = SummaryAndSuggestionsResponse & {
  /** AI-generated executive summary answering the user's question */
  executiveSummary?: ExecutiveSummary | null;
  /** Extended suggestions with priority ordering */
  extendedSuggestions?: ExtendedBudgetSuggestion[];
  /** Global assumptions across all suggestions */
  assumptions?: SuggestionAssumption[];
  /** Projected outcomes if suggestions are followed */
  projectedOutcomes?: ProjectedOutcome[];
};
