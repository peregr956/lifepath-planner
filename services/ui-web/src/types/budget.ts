export type ClarificationFieldType = 'text' | 'number' | 'select' | 'textarea';

export type ClarificationQuestion = {
  id: string;
  prompt: string;
  description?: string;
  type: ClarificationFieldType;
  options?: string[];
  required?: boolean;
};

export type ClarificationAnswer = {
  questionId: string;
  value: string;
};

export type BudgetSuggestion = {
  id: string;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
};

export type BudgetCategory = {
  name: string;
  allocated: number;
  spent: number;
};

export type BudgetSummary = {
  categories: BudgetCategory[];
  generatedAt: string;
};
