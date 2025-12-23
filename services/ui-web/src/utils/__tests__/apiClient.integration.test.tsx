/**
 * Integration tests for API client methods.
 * Tests API endpoints with mocked fetch responses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockResponse,
  createMockErrorResponse,
  createNetworkErrorFetch,
  mockResponses,
} from '@/test/mockApiResponse';
import { createEnvTestContext } from '@/test/testEnv';

const envContext = createEnvTestContext();

describe('ApiClient Integration', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    envContext.beforeEach();
    vi.resetModules();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    envContext.afterEach();
  });

  describe('uploadBudget', () => {
    it('uploads a file and returns normalized response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.uploadBudget),
      );

      const { uploadBudget } = await import('@/utils/apiClient');
      const file = new File(['income,expense\n1000,500'], 'budget.csv', {
        type: 'text/csv',
      });

      const result = await uploadBudget(file);

      expect(result).toEqual({
        budgetId: 'test-budget-123',
        status: 'uploaded',
        detectedFormat: 'csv',
        detectedFormatHints: null,
        summaryPreview: {
          detectedIncomeLines: 3,
          detectedExpenseLines: 10,
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/upload-budget');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('handles network errors gracefully', async () => {
      global.fetch = createNetworkErrorFetch();

      const { uploadBudget, ApiError } = await import('@/utils/apiClient');
      const file = new File(['test'], 'budget.csv');

      try {
        await uploadBudget(file);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).status).toBe(503);
        expect((error as InstanceType<typeof ApiError>).message).toContain('Unable to reach');
      }
    });

    it('handles server errors', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockErrorResponse('INTERNAL_ERROR', 500, 'Server crashed'),
      );

      const { uploadBudget, ApiError } = await import('@/utils/apiClient');
      const file = new File(['test'], 'budget.csv');

      try {
        await uploadBudget(file);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).status).toBe(500);
      }
    });
  });

  describe('submitUserQuery', () => {
    it('submits a query and returns normalized response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.userQuery),
      );

      const { submitUserQuery } = await import('@/utils/apiClient');

      const result = await submitUserQuery('test-budget-123', 'How can I save more money?');

      expect(result).toEqual({
        budgetId: 'test-budget-123',
        query: 'How can I save more money?',
        status: 'accepted',
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/user-query');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        budget_id: 'test-budget-123',
        query: 'How can I save more money?',
      });
    });

    it('throws error when budgetId is empty', async () => {
      const { submitUserQuery } = await import('@/utils/apiClient');

      await expect(submitUserQuery('', 'test query')).rejects.toThrow(
        'budgetId is required',
      );
    });

    it('throws error when query is empty', async () => {
      const { submitUserQuery } = await import('@/utils/apiClient');

      await expect(submitUserQuery('test-id', '')).rejects.toThrow(
        'Query cannot be empty',
      );
    });

    it('throws error when query is whitespace only', async () => {
      const { submitUserQuery } = await import('@/utils/apiClient');

      await expect(submitUserQuery('test-id', '   ')).rejects.toThrow(
        'Query cannot be empty',
      );
    });
  });

  describe('fetchClarificationQuestions', () => {
    it('fetches questions and returns normalized response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.clarificationQuestions),
      );

      const { fetchClarificationQuestions } = await import('@/utils/apiClient');

      const result = await fetchClarificationQuestions('test-budget-123');

      expect(result.budgetId).toBe('test-budget-123');
      expect(result.needsClarification).toBe(true);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toEqual({
        id: 'q1',
        prompt: 'What is your monthly rent?',
        description: undefined,
        components: [
          {
            component: 'number_input',
            fieldId: 'rent',
            label: 'Monthly Rent',
            binding: undefined,
            constraints: { minimum: 0 },
          },
        ],
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/clarification-questions');
      expect(url).toContain('budget_id=test-budget-123');
    });

    it('includes user_query parameter when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.clarificationQuestions),
      );

      const { fetchClarificationQuestions } = await import('@/utils/apiClient');

      await fetchClarificationQuestions('test-budget-123', 'How to save more?');

      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      // URL encoding can use either + or %20 for spaces
      expect(url).toContain('user_query=');
      expect(url).toMatch(/user_query=How(\+|%20)to(\+|%20)save(\+|%20)more%3F/);
    });

    it('handles no clarification needed response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.clarificationQuestionsNone),
      );

      const { fetchClarificationQuestions } = await import('@/utils/apiClient');

      const result = await fetchClarificationQuestions('test-budget-123');

      expect(result.needsClarification).toBe(false);
      expect(result.questions).toHaveLength(0);
    });

    it('throws error when budgetId is empty', async () => {
      const { fetchClarificationQuestions } = await import('@/utils/apiClient');

      await expect(fetchClarificationQuestions('')).rejects.toThrow(
        'budgetId is required',
      );
    });
  });

  describe('submitClarificationAnswers', () => {
    it('submits answers and returns normalized response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.submitAnswers),
      );

      const { submitClarificationAnswers } = await import('@/utils/apiClient');

      const result = await submitClarificationAnswers('test-budget-123', {
        rent: 1500,
        utilities: 200,
      });

      expect(result).toEqual({
        budgetId: 'test-budget-123',
        status: 'ready_for_summary',
        readyForSummary: true,
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/submit-answers');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        budget_id: 'test-budget-123',
        answers: { rent: 1500, utilities: 200 },
      });
    });

    it('throws error when budgetId is empty', async () => {
      const { submitClarificationAnswers } = await import('@/utils/apiClient');

      await expect(submitClarificationAnswers('', {})).rejects.toThrow(
        'budgetId is required',
      );
    });

    it('handles validation errors from server', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(
          {
            error: 'VALIDATION_ERROR',
            details: 'Invalid answer format',
            invalid_fields: ['rent'],
          },
          { status: 400 },
        ),
      );

      const { submitClarificationAnswers, ApiError } = await import('@/utils/apiClient');

      await expect(
        submitClarificationAnswers('test-budget-123', { rent: -100 }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe('fetchSummaryAndSuggestions', () => {
    it('fetches summary and returns normalized response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.summaryAndSuggestions),
      );

      const { fetchSummaryAndSuggestions } = await import('@/utils/apiClient');

      const result = await fetchSummaryAndSuggestions('test-budget-123');

      expect(result.budgetId).toBe('test-budget-123');
      expect(result.summary).toEqual({
        totalIncome: 5000,
        totalExpenses: 4000,
        surplus: 1000,
      });
      expect(result.categoryShares).toEqual({
        housing: 0.35,
        food: 0.15,
        transportation: 0.1,
        utilities: 0.05,
        entertainment: 0.1,
        savings: 0.2,
        other: 0.05,
      });
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]).toEqual({
        id: 'sug-1',
        title: 'Reduce dining out',
        description: 'Consider cooking more meals at home',
        expectedMonthlyImpact: 150,
        rationale: 'Restaurant meals cost 3x more than home cooking',
        tradeoffs: 'Requires more time for meal prep',
      });
      expect(result.providerMetadata).toEqual({
        clarificationProvider: 'deterministic',
        suggestionProvider: 'deterministic',
        aiEnabled: false,
      });
      expect(result.userQuery).toBe('How can I save more money?');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/summary-and-suggestions');
      expect(url).toContain('budget_id=test-budget-123');
    });

    it('throws error when budgetId is empty', async () => {
      const { fetchSummaryAndSuggestions } = await import('@/utils/apiClient');

      await expect(fetchSummaryAndSuggestions('')).rejects.toThrow(
        'budgetId is required',
      );
    });

    it('handles 404 budget not found', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockErrorResponse('NOT_FOUND', 404, 'Budget not found'),
      );

      const { fetchSummaryAndSuggestions, ApiError } = await import('@/utils/apiClient');

      try {
        await fetchSummaryAndSuggestions('nonexistent');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).status).toBe(404);
      }
    });
  });

  describe('Request Headers', () => {
    it('sets Accept header to application/json', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.clarificationQuestionsNone),
      );

      const { fetchClarificationQuestions } = await import('@/utils/apiClient');
      await fetchClarificationQuestions('test-budget-123');

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.headers.get('Accept')).toBe('application/json');
    });

    it('sets Content-Type for JSON bodies', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.submitAnswers),
      );

      const { submitClarificationAnswers } = await import('@/utils/apiClient');
      await submitClarificationAnswers('test-budget-123', { rent: 1000 });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.headers.get('Content-Type')).toBe('application/json');
    });

    it('does not set Content-Type for FormData', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.uploadBudget),
      );

      const { uploadBudget } = await import('@/utils/apiClient');
      const file = new File(['test'], 'budget.csv');
      await uploadBudget(file);

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      // Content-Type should NOT be set for FormData (browser sets it with boundary)
      expect(options.headers.has('Content-Type')).toBe(false);
    });
  });

  describe('Error Response Parsing', () => {
    it('extracts error message from response payload', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(
          { error: 'BUDGET_NOT_FOUND', details: 'The budget does not exist' },
          { status: 404 },
        ),
      );

      const { fetchSummaryAndSuggestions, ApiError } = await import('@/utils/apiClient');

      try {
        await fetchSummaryAndSuggestions('nonexistent');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).message).toContain('BUDGET_NOT_FOUND');
        expect((error as InstanceType<typeof ApiError>).message).toContain('The budget does not exist');
      }
    });

    it('provides generic message when response has no error field', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse({ message: 'Something went wrong' }, { status: 500 }),
      );

      const { fetchSummaryAndSuggestions, ApiError } = await import('@/utils/apiClient');

      try {
        await fetchSummaryAndSuggestions('test-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).message).toContain('status 500');
      }
    });
  });

  describe('Timeout Handling', () => {
    it('throws ApiError with 408 status on timeout', async () => {
      // Create a mock that simulates abort
      global.fetch = vi.fn().mockImplementation(() => {
        const error = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(error);
      });

      const { fetchSummaryAndSuggestions, ApiError } = await import('@/utils/apiClient');

      try {
        await fetchSummaryAndSuggestions('test-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as InstanceType<typeof ApiError>).status).toBe(408);
        expect((error as InstanceType<typeof ApiError>).message).toContain('timed out');
      }
    });
  });

  describe('URL Building', () => {
    it('constructs correct URL with base and path', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://api.example.com',
      });

      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.clarificationQuestionsNone),
      );

      const { fetchClarificationQuestions } = await import('@/utils/apiClient');
      await fetchClarificationQuestions('test-budget-123');

      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('https://api.example.com/clarification-questions?budget_id=test-budget-123');
    });

    it('handles paths without leading slash', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://api.example.com',
      });

      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.summaryAndSuggestions),
      );

      const { fetchSummaryAndSuggestions } = await import('@/utils/apiClient');
      await fetchSummaryAndSuggestions('test-id');

      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('https://api.example.com/summary-and-suggestions');
    });

    it('excludes undefined query parameters', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        createMockResponse(mockResponses.clarificationQuestionsNone),
      );

      const { fetchClarificationQuestions } = await import('@/utils/apiClient');
      // Call without userQuery
      await fetchClarificationQuestions('test-budget-123');

      const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).not.toContain('user_query');
    });
  });
});

