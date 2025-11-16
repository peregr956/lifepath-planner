import type {
  BudgetSummary,
  BudgetSuggestion,
  ClarificationAnswer,
  ClarificationQuestion,
} from '@/types';

const demoQuestions: ClarificationQuestion[] = [
  {
    id: 'q1',
    prompt: 'Which departments require more context?',
    description: 'Pick the areas where the uploaded budget had missing metadata.',
    type: 'select',
    options: ['Research', 'Operations', 'People', 'Marketing'],
  },
  {
    id: 'q2',
    prompt: 'How confident are you in this forecast?',
    type: 'number',
    description: 'Provide a percentage confidence score for this budget cycle.',
  },
  {
    id: 'q3',
    prompt: 'Anything else we should know?',
    type: 'textarea',
  },
];

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchClarificationQuestions(): Promise<ClarificationQuestion[]> {
  await delay();
  return demoQuestions;
}

export async function uploadBudgetFile(file: File): Promise<{ message: string }> {
  await delay();
  return { message: `Ingested ${file.name} – parsing will complete in a few seconds.` };
}

export async function submitClarificationAnswers(
  answers: ClarificationAnswer[]
): Promise<BudgetSuggestion[]> {
  await delay();
  return answers.length
    ? [
        {
          id: 's1',
          title: 'Rebalance R&D runway',
          description: 'Shift 8% from marketing into research to unlock higher RoI on experiments.',
          impact: 'high',
        },
        {
          id: 's2',
          title: 'Cap travel budgets',
          description: 'Introduce quarterly guardrails for travel to keep burn flat.',
          impact: 'medium',
        },
      ]
    : [];
}

export async function fetchBudgetSummary(): Promise<BudgetSummary> {
  await delay();
  return {
    generatedAt: new Date().toISOString(),
    categories: [
      { name: 'Research', allocated: 2_000_000, spent: 1_200_000 },
      { name: 'Operations', allocated: 1_200_000, spent: 1_050_000 },
      { name: 'People', allocated: 3_000, spent: 2_700 },
      { name: 'Marketing', allocated: 800_000, spent: 920_000 },
    ],
  };
}
