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
  summaryPreview?: UploadSummaryPreview | null;
};

export type ClarificationComponentType = 'number_input' | 'dropdown' | 'toggle' | 'slider';

type BaseComponentDescriptor = {
  fieldId: string;
  label: string;
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

export type ClarificationComponentDescriptor =
  | ClarificationNumberInputDescriptor
  | ClarificationDropdownDescriptor
  | ClarificationToggleDescriptor
  | ClarificationSliderDescriptor;

export type ClarificationQuestion = {
  id: string;
  prompt: string;
  description?: string;
  components: ClarificationComponentDescriptor[];
};

export type ClarificationAnswerValue = string | number | boolean;
export type ClarificationAnswers = Record<string, ClarificationAnswerValue>;

export type ClarificationQuestionsResponse = {
  budgetId: string;
  needsClarification: boolean;
  questions: ClarificationQuestion[];
  partialModel: UnifiedBudgetModel | null;
};

export type SubmitAnswersResponse = {
  budgetId: string;
  status: string;
  readyForSummary: boolean;
};

export type BudgetSuggestion = {
  id: string;
  title: string;
  description: string;
  expectedMonthlyImpact: number;
  rationale: string;
  tradeoffs: string;
};

export type SummaryAndSuggestionsResponse = {
  budgetId: string;
  summary: BudgetSummary;
  categoryShares: Record<string, number>;
  suggestions: BudgetSuggestion[];
};
