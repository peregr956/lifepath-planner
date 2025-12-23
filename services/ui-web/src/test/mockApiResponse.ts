/**
 * Test utilities for mocking fetch responses.
 */

type MockResponseOptions = {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  delay?: number;
};

/**
 * Creates a mock Response object with JSON body.
 */
export function createMockResponse<T>(
  body: T,
  options: MockResponseOptions = {},
): Response {
  const { status = 200, statusText = 'OK', headers = {} } = options;

  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    ...headers,
  });

  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: responseHeaders,
  });
}

/**
 * Creates a mock Response for an error.
 */
export function createMockErrorResponse(
  error: string,
  status: number,
  details?: string,
): Response {
  const body = details ? { error, details } : { error };
  return createMockResponse(body, { status, statusText: error });
}

/**
 * Creates a mock Response with 204 No Content.
 */
export function createEmptyResponse(): Response {
  return new Response(null, { status: 204, statusText: 'No Content' });
}

/**
 * Creates a mock fetch function that returns predetermined responses.
 */
export function createMockFetch(
  responses: Map<string, Response | (() => Response)>,
  fallback?: Response | (() => Response),
): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    for (const [pattern, response] of responses.entries()) {
      if (url.includes(pattern)) {
        return typeof response === 'function' ? response() : response.clone();
      }
    }

    if (fallback) {
      return typeof fallback === 'function' ? fallback() : fallback.clone();
    }

    throw new TypeError(`Network error: no mock configured for ${url}`);
  };
}

/**
 * Creates a mock fetch that simulates network errors.
 */
export function createNetworkErrorFetch(): typeof fetch {
  return async (): Promise<Response> => {
    throw new TypeError('Failed to fetch');
  };
}

/**
 * Creates a mock fetch that times out.
 */
export function createTimeoutFetch(delayMs: number = 35000): typeof fetch {
  return async (): Promise<Response> => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    throw new DOMException('The operation was aborted', 'AbortError');
  };
}

/**
 * Standard mock API responses matching backend contract.
 */
export const mockResponses = {
  uploadBudget: {
    budget_id: 'test-budget-123',
    status: 'uploaded',
    detected_format: 'csv',
    detected_format_hints: null,
    summary_preview: {
      detected_income_lines: 3,
      detected_expense_lines: 10,
    },
  },

  userQuery: {
    budget_id: 'test-budget-123',
    query: 'How can I save more money?',
    status: 'accepted',
  },

  clarificationQuestions: {
    budget_id: 'test-budget-123',
    needs_clarification: true,
    questions: [
      {
        question_id: 'q1',
        prompt: 'What is your monthly rent?',
        components: [
          {
            field_id: 'rent',
            component: 'number_input',
            label: 'Monthly Rent',
            constraints: { minimum: 0 },
          },
        ],
      },
    ],
    partial_model: null,
  },

  clarificationQuestionsNone: {
    budget_id: 'test-budget-123',
    needs_clarification: false,
    questions: [],
    partial_model: null,
  },

  submitAnswers: {
    budget_id: 'test-budget-123',
    status: 'ready_for_summary',
    ready_for_summary: true,
  },

  summaryAndSuggestions: {
    budget_id: 'test-budget-123',
    summary: {
      total_income: 5000,
      total_expenses: 4000,
      surplus: 1000,
    },
    category_shares: {
      housing: 0.35,
      food: 0.15,
      transportation: 0.1,
      utilities: 0.05,
      entertainment: 0.1,
      savings: 0.2,
      other: 0.05,
    },
    suggestions: [
      {
        id: 'sug-1',
        title: 'Reduce dining out',
        description: 'Consider cooking more meals at home',
        expected_monthly_impact: 150,
        rationale: 'Restaurant meals cost 3x more than home cooking',
        tradeoffs: 'Requires more time for meal prep',
      },
    ],
    provider_metadata: {
      clarification_provider: 'deterministic',
      suggestion_provider: 'deterministic',
      ai_enabled: false,
    },
    user_query: 'How can I save more money?',
  },

  healthCheck: {
    status: 'ok',
    service: 'api-gateway',
  },
};

