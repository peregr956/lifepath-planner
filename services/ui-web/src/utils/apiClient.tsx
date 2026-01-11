/** @file Centralized API client, env-aware base resolver, and React context for sharing backend state. */

'use client';

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { z } from 'zod';
import type {
  BudgetPreferences,
  BudgetSummary,
  BudgetSuggestion,
  ClarificationAnalysis,
  ClarificationAnswers,
  ClarificationComponentDescriptor,
  ClarificationDropdownDescriptor,
  ClarificationNumberInputDescriptor,
  ClarificationQuestion,
  ClarificationSliderDescriptor,
  ClarificationTextInputDescriptor,
  ClarificationToggleDescriptor,
  DebtEntry,
  ExpenseEntry,
  IncomeEntry,
  ProviderMetadata,
  QuestionGroup,
  RateChange,
  SubmitAnswersResponse,
  SummaryAndSuggestionsResponse,
  UnifiedBudgetModel,
  UploadBudgetResponse,
  ClarificationQuestionsResponse,
  UserQueryResponse,
  // Phase 9.5: Extended types
  ExtendedBudgetSuggestion,
  ExecutiveSummary,
  SuggestionAssumption,
  ProjectedOutcome,
} from '@/types';

// Default to same-origin API routes (Vercel serverless functions)
// This eliminates CORS issues since API is on the same origin
const SAME_ORIGIN_API_BASE = '/api';

const DEFAULT_HOST_PORTS: Array<[string, number]> = [
  ['localhost', 8000],
  ['127.0.0.1', 8000],
  ['localhost', 8080],
  ['127.0.0.1', 8080],
  ['host.docker.internal', 8000],
  ['host.docker.internal', 8080],
  ['api-gateway', 8000],
  ['api-gateway', 8080],
];

const DEFAULT_API_BASE_CANDIDATES = Array.from(
  new Set(DEFAULT_HOST_PORTS.map(([host, port]) => `http://${host}:${port}`)),
);

const ENV_API_BASE_KEYS = [
  'NEXT_PUBLIC_LIFEPATH_API_BASE_URL',
  'LIFEPATH_API_BASE_URL',
  'NEXT_PUBLIC_API_BASE_URL',
  'API_BASE_URL',
  'NEXT_PUBLIC_GATEWAY_BASE_URL',
  'GATEWAY_BASE_URL',
] as const;

const ENV_API_CANDIDATE_KEYS = [
  'NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES',
  'LIFEPATH_API_BASE_CANDIDATES',
  'NEXT_PUBLIC_API_BASE_CANDIDATES',
  'API_BASE_CANDIDATES',
] as const;

const API_REQUEST_TIMEOUT = 30_000;

type QueryParams = Record<string, string | number | boolean | undefined>;
type RequestOptions = RequestInit & { query?: QueryParams };

type ApiBaseSnapshot = {
  active: string;
  candidates: string[];
};

type EnvSource = Record<string, string | undefined>;

const listeners = new Set<() => void>();

function getEnvSource(): EnvSource {
  // In Next.js, NEXT_PUBLIC_* variables are embedded at build time
  // They should be available directly on process.env in client components
  if (typeof process !== 'undefined' && process?.env) {
    return process.env as EnvSource;
  }
  // Fallback for edge cases
  const globalProcess = (globalThis as typeof globalThis & { process?: { env?: EnvSource } })
    .process;
  return (globalProcess?.env ?? {}) as EnvSource;
}

// In Next.js, NEXT_PUBLIC_* variables are replaced at build time with their literal values.
// We must access them directly, not through dynamic key access.
function firstDefined(keys: readonly string[]): string | undefined {
  // Access process.env directly - Next.js will have replaced NEXT_PUBLIC_* vars at build time
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }
  
  // Check each key directly - Next.js only replaces direct property access
  for (const key of keys) {
    let value: string | undefined;
    
    // Direct property access for Next.js build-time replacement
    switch (key) {
      case 'NEXT_PUBLIC_LIFEPATH_API_BASE_URL':
        value = process.env.NEXT_PUBLIC_LIFEPATH_API_BASE_URL;
        break;
      case 'LIFEPATH_API_BASE_URL':
        value = process.env.LIFEPATH_API_BASE_URL;
        break;
      case 'NEXT_PUBLIC_API_BASE_URL':
        value = process.env.NEXT_PUBLIC_API_BASE_URL;
        break;
      case 'API_BASE_URL':
        value = process.env.API_BASE_URL;
        break;
      case 'NEXT_PUBLIC_GATEWAY_BASE_URL':
        value = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL;
        break;
      case 'GATEWAY_BASE_URL':
        value = process.env.GATEWAY_BASE_URL;
        break;
      case 'NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES':
        value = process.env.NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES;
        break;
      case 'LIFEPATH_API_BASE_CANDIDATES':
        value = process.env.LIFEPATH_API_BASE_CANDIDATES;
        break;
      case 'NEXT_PUBLIC_API_BASE_CANDIDATES':
        value = process.env.NEXT_PUBLIC_API_BASE_CANDIDATES;
        break;
      case 'API_BASE_CANDIDATES':
        value = process.env.API_BASE_CANDIDATES;
        break;
      default:
        // Fallback to dynamic access for non-NEXT_PUBLIC vars (won't work in browser but won't break)
        value = (process.env as Record<string, string | undefined>)[key];
    }
    
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeBaseUrl(input?: string | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function coerceCandidateValues(value?: string | null): string[] {
  if (!value) return [];
  const parts = value
    .split(/[, \n\r\t]+/)
    .map((part) => normalizeBaseUrl(part))
    .filter(Boolean) as string[];
  return dedupe(parts);
}

function isLocalhostEnvironment(): boolean {
  if (typeof window === 'undefined') {
    // Server-side: assume localhost for SSR
    return true;
  }
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.') ||
    hostname.endsWith('.local')
  );
}

function resolveInitialCandidates(): string[] {
  const manualBase = normalizeBaseUrl(firstDefined(ENV_API_BASE_KEYS));
  const candidateBlob = firstDefined(ENV_API_CANDIDATE_KEYS);
  const envCandidates = coerceCandidateValues(candidateBlob);

  // Debug logging in development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const foundValue = firstDefined(ENV_API_BASE_KEYS);
    console.log('[API Client] Environment check:', {
      'NEXT_PUBLIC_LIFEPATH_API_BASE_URL': process.env.NEXT_PUBLIC_LIFEPATH_API_BASE_URL,
      'Found value': foundValue,
      'Normalized base': manualBase,
      'All env keys checked': ENV_API_BASE_KEYS,
    });
  }

  const combined: string[] = [];
  
  // If an external API URL is explicitly set, use it first
  if (manualBase) {
    combined.push(manualBase);
  }
  combined.push(...envCandidates);
  
  // Default to same-origin API routes (Vercel serverless functions)
  // This is the primary approach for the Vercel deployment - no CORS needed!
  combined.push(SAME_ORIGIN_API_BASE);
  
  // Only include localhost candidates if we're actually in a localhost environment
  const isLocalhost = isLocalhostEnvironment();
  if (isLocalhost) {
    combined.push(...DEFAULT_API_BASE_CANDIDATES);
  }

  const resolved = dedupe(combined);
  
  // Log what we're using
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[API Client] Using API base:', resolved[0], {
      'All candidates': resolved,
      'Using same-origin': resolved[0] === SAME_ORIGIN_API_BASE,
    });
  }
  
  return resolved.length ? resolved : [SAME_ORIGIN_API_BASE];
}

const initialCandidates = resolveInitialCandidates();

// Log the resolved API base for debugging (only in development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('[API Client] Initial API base candidates:', initialCandidates);
  console.log('[API Client] Active API base:', initialCandidates[0]);
  // Check if NEXT_PUBLIC_ vars are accessible
  const envCheck = {
    NEXT_PUBLIC_LIFEPATH_API_BASE_URL: process.env.NEXT_PUBLIC_LIFEPATH_API_BASE_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_GATEWAY_BASE_URL: process.env.NEXT_PUBLIC_GATEWAY_BASE_URL,
  };
  console.log('[API Client] Environment variables check:', envCheck);
}

let apiBaseStore: ApiBaseSnapshot = {
  active: initialCandidates[0] || '',
  candidates: initialCandidates,
};

// Log API configuration in production
if (typeof window !== 'undefined' && initialCandidates.length > 0) {
  const activeBase = initialCandidates[0];
  const isLocalhost = isLocalhostEnvironment();
  
  // Detect if we're running on Vercel
  const isVercelDeployment = typeof window !== 'undefined' && (
    window.location.hostname.includes('.vercel.app') ||
    window.location.hostname.includes('.vercel.sh')
  );
  
  // Check if using an external URL (not same-origin)
  const isExternalUrl = activeBase && 
    activeBase !== SAME_ORIGIN_API_BASE && 
    activeBase !== '/api' &&
    (activeBase.startsWith('http://') || activeBase.startsWith('https://'));
  
  // Warn if using an external URL on Vercel - this is likely a misconfiguration
  if (isVercelDeployment && isExternalUrl) {
    console.error(
      '[API Client] MISCONFIGURATION DETECTED: Using external API URL on Vercel!',
      '\n\nYour Vercel deployment has NEXT_PUBLIC_LIFEPATH_API_BASE_URL set to an external URL.',
      '\nThis is incorrect for Vercel deployments which should use same-origin API routes (/api/*).',
      '\n\nTo fix:',
      '\n1. Go to Vercel Dashboard → Project Settings → Environment Variables',
      '\n2. DELETE the NEXT_PUBLIC_LIFEPATH_API_BASE_URL variable',
      '\n3. Redeploy your application',
      '\n\nSee /diagnostics for more details.',
      { activeBase, candidates: initialCandidates, hostname: window.location.hostname }
    );
  }
  
  // Warn if using localhost in production
  if (!isLocalhost && activeBase && (activeBase.includes('localhost') || activeBase.includes('127.0.0.1'))) {
    console.warn(
      '[API Client] WARNING: Using localhost API URL in production!',
      'This will not work. Please set NEXT_PUBLIC_LIFEPATH_API_BASE_URL in Vercel and redeploy.',
      { activeBase, candidates: initialCandidates }
    );
  }
  
  // Log when using same-origin API (Vercel serverless)
  if (activeBase === SAME_ORIGIN_API_BASE) {
    console.log('[API Client] Using same-origin API routes (no CORS required)');
  }
}

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ApiBaseSnapshot {
  return apiBaseStore;
}

export function getActiveApiBase(): string {
  return apiBaseStore.active;
}

export function getApiBaseCandidates(): string[] {
  return [...apiBaseStore.candidates];
}

export function setActiveApiBase(candidate: string): string {
  const normalized = normalizeBaseUrl(candidate);
  if (!normalized) {
    return apiBaseStore.active;
  }

  if (normalized !== apiBaseStore.active) {
    apiBaseStore = {
      ...apiBaseStore,
      active: normalized,
      candidates: dedupe([normalized, ...apiBaseStore.candidates]),
    };
    emitChange();
  }
  return apiBaseStore.active;
}

export function setApiBaseCandidates(candidates: string[]): string[] {
  const normalized = dedupe(
    candidates
      .map((candidate) => normalizeBaseUrl(candidate))
      .filter((candidate): candidate is string => Boolean(candidate)),
  );
  const next = normalized.length ? normalized : resolveInitialCandidates();
  apiBaseStore = {
    active: next[0],
    candidates: next,
  };
  emitChange();
  return apiBaseStore.candidates;
}

export function addApiBaseCandidate(candidate: string): string {
  const normalized = normalizeBaseUrl(candidate);
  if (!normalized) {
    return apiBaseStore.active;
  }

  apiBaseStore = {
    active: normalized,
    candidates: dedupe([normalized, ...apiBaseStore.candidates]),
  };
  emitChange();
  return apiBaseStore.active;
}

export function refreshApiBaseCandidates(): string[] {
  const resolved = resolveInitialCandidates();
  setApiBaseCandidates(resolved);
  return resolved;
}

type ApiBaseContextValue = {
  activeApiBase: string;
  candidates: string[];
  setActiveApiBase: (base: string) => void;
  addCandidate: (base: string) => void;
  refreshCandidates: () => void;
};

const ApiBaseContext = createContext<ApiBaseContextValue | undefined>(undefined);

export function ApiBaseProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = useMemo<ApiBaseContextValue>(
    () => ({
      activeApiBase: snapshot.active,
      candidates: snapshot.candidates,
      setActiveApiBase: (base) => {
        setActiveApiBase(base);
      },
      addCandidate: (base) => {
        addApiBaseCandidate(base);
      },
      refreshCandidates: () => {
        refreshApiBaseCandidates();
      },
    }),
    [snapshot],
  );

  return <ApiBaseContext.Provider value={value}>{children}</ApiBaseContext.Provider>;
}

export function useApiBase(): ApiBaseContextValue {
  const context = useContext(ApiBaseContext);
  if (!context) {
    throw new Error('useApiBase must be used within an ApiBaseProvider');
  }
  return context;
}

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export type ApiClientOptions = {
  timeoutMs?: number;
  getBaseUrl?: () => string;
};

export class ApiClient {
  private readonly timeoutMs: number;
  private readonly getBaseUrl: () => string;

  constructor(options: ApiClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? API_REQUEST_TIMEOUT;
    this.getBaseUrl = options.getBaseUrl ?? getActiveApiBase;
  }

  async uploadBudget(file: File): Promise<UploadBudgetResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.request<RawUploadBudgetResponse>('/upload-budget', {
      method: 'POST',
      body: formData,
    });
    return normalizeUploadBudgetResponse(response);
  }

  async submitUserQuery(budgetId: string, query: string): Promise<UserQueryResponse> {
    if (!budgetId) {
      throw new Error('budgetId is required to submit a user query.');
    }
    if (!query.trim()) {
      throw new Error('Query cannot be empty.');
    }
    const response = await this.request<RawUserQueryResponse>('/user-query', {
      method: 'POST',
      body: JSON.stringify({
        budget_id: budgetId,
        query: query.trim(),
      }),
    });
    return normalizeUserQueryResponse(response);
  }

  async fetchClarificationQuestions(
    budgetId: string,
    userQuery?: string,
  ): Promise<ClarificationQuestionsResponse> {
    if (!budgetId) {
      throw new Error('budgetId is required to fetch clarification questions.');
    }
    const query: QueryParams = { budget_id: budgetId };
    if (userQuery) {
      query.user_query = userQuery;
    }
    const response = await this.request<RawClarificationQuestionsResponse>(
      '/clarification-questions',
      {
        method: 'GET',
        query,
      },
    );
    return normalizeClarificationQuestionsResponse(response);
  }

  async submitClarificationAnswers(
    budgetId: string,
    answers: ClarificationAnswers,
  ): Promise<SubmitAnswersResponse> {
    if (!budgetId) {
      throw new Error('budgetId is required to submit clarification answers.');
    }
    const response = await this.request<RawSubmitAnswersResponse>('/submit-answers', {
      method: 'POST',
      body: JSON.stringify({
        budget_id: budgetId,
        answers,
      }),
    });
    return normalizeSubmitAnswersResponse(response);
  }

  async fetchSummaryAndSuggestions(budgetId: string): Promise<SummaryAndSuggestionsResponse> {
    if (!budgetId) {
      throw new Error('budgetId is required to fetch the summary and suggestions.');
    }
    const response = await this.request<RawSummaryAndSuggestionsResponse>(
      '/summary-and-suggestions',
      {
        method: 'GET',
        query: { budget_id: budgetId },
      },
    );
    return normalizeSummaryAndSuggestionsResponse(response);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { query, headers, body, ...rest } = options;
    const activeBaseUrl = this.getBaseUrl();
    
    // Check if API base URL is configured (allow same-origin API)
    if (!activeBaseUrl || activeBaseUrl.trim() === '') {
      // Default to same-origin API if not configured
      console.warn('[API Client] No API base URL configured, using same-origin API routes');
    }
    
    const url = this.buildUrl(path, query, activeBaseUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const finalBody =
      body && !(body instanceof FormData) && typeof body !== 'string'
        ? JSON.stringify(body)
        : (body ?? undefined);
    const finalHeaders = this.buildHeaders(headers, finalBody);

    // Log request details in development
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('[API Client] Making request:', { method: options.method || 'GET', url, path });
    }

    try {
      const response = await fetch(url, {
        ...rest,
        body: finalBody,
        headers: finalHeaders,
        signal: controller.signal,
      });
      const payload = await this.parsePayload(response);
      if (!response.ok) {
        const errorMessage = this.describeError(response, payload);
        // Log error details in development
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.error('[API Client] Request failed:', {
            status: response.status,
            statusText: response.statusText,
            url,
            errorMessage,
            payload,
          });
        }
        // For 400 errors with validation details, include the full payload
        if (
          response.status === 400 &&
          payload &&
          typeof payload === 'object' &&
          'invalid_fields' in payload
        ) {
          throw new ApiError(errorMessage, response.status, payload);
        }
        throw new ApiError(errorMessage, response.status, payload);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError('Request timed out while contacting the API gateway.', 408);
      }
      if (error instanceof TypeError) {
        // Check if this is likely a CORS error
        const isLikelyCors = error.message.includes('Failed to fetch') || 
                            error.message.includes('NetworkError') ||
                            error.message.includes('CORS');
        
        // Enhanced error message for network errors
        let enhancedMessage = `Unable to reach the API gateway at ${activeBaseUrl}. `;
        if (isLikelyCors) {
          enhancedMessage += `This appears to be a CORS (Cross-Origin Resource Sharing) error. ` +
            `Ensure the backend has GATEWAY_CORS_ORIGINS configured to include this origin: ${window.location.origin}. `;
        } else {
          const isLocalhost = activeBaseUrl.includes('localhost') || activeBaseUrl.includes('127.0.0.1');
          if (isLocalhost) {
            enhancedMessage += `Ensure the server is running and reachable from this browser. `;
          } else {
            enhancedMessage += `Please check that NEXT_PUBLIC_LIFEPATH_API_BASE_URL is correctly configured in your Vercel project settings. `;
          }
          enhancedMessage += `This could also be due to: (1) CORS configuration on the backend, (2) Network connectivity issues, ` +
            `or (3) The API gateway is not running. `;
        }
        enhancedMessage += `Check the browser console and network tab for more details.`;
        
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.error('[API Client] Network error:', {
            error,
            activeBaseUrl,
            url,
            currentOrigin: window.location.origin,
            isLikelyCors,
            message: enhancedMessage,
          });
        }
        throw new ApiError(enhancedMessage, 503);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildUrl(path: string, query?: QueryParams, baseUrl?: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const resolvedBase = baseUrl ?? this.getBaseUrl();
    
    // For same-origin API routes, build a relative URL
    if (resolvedBase === SAME_ORIGIN_API_BASE || resolvedBase === '/api') {
      let url = `${resolvedBase}${normalizedPath}`;
      if (query) {
        const params = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.set(key, String(value));
          }
        });
        const queryString = params.toString();
        if (queryString) {
          url += `?${queryString}`;
        }
      }
      return url;
    }
    
    // For external APIs, use the full URL
    const url = new URL(normalizedPath, resolvedBase);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        url.searchParams.set(key, String(value));
      });
    }
    return url.toString();
  }

  private buildHeaders(headers: HeadersInit | undefined, body?: BodyInit): Headers {
    const finalHeaders = new Headers(headers ?? {});
    if (!finalHeaders.has('Accept')) {
      finalHeaders.set('Accept', 'application/json');
    }
    if (body && !(body instanceof FormData) && !finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json');
    }
    return finalHeaders;
  }

  private async parsePayload(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return undefined;
    }
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private describeError(response: Response, payload: unknown): string {
    if (payload && typeof payload === 'object' && 'error' in (payload as Record<string, unknown>)) {
      const errorPayload = payload as Record<string, unknown>;
      const code = errorPayload.error;
      const details = typeof errorPayload.details === 'string' ? errorPayload.details : undefined;
      if (typeof code === 'string') {
        return details ? `${code}: ${details}` : code;
      }
    }
    return `Request failed with status ${response.status}`;
  }
}

export const apiClient = new ApiClient();

export const uploadBudget = (file: File) => apiClient.uploadBudget(file);
export const submitUserQuery = (budgetId: string, query: string) =>
  apiClient.submitUserQuery(budgetId, query);
export const fetchClarificationQuestions = (budgetId: string, userQuery?: string) =>
  apiClient.fetchClarificationQuestions(budgetId, userQuery);
export const submitClarificationAnswers = (budgetId: string, answers: ClarificationAnswers) =>
  apiClient.submitClarificationAnswers(budgetId, answers);
export const fetchSummaryAndSuggestions = (budgetId: string) =>
  apiClient.fetchSummaryAndSuggestions(budgetId);

type RawUploadBudgetResponse = {
  budget_id: string;
  status: string;
  detected_format?: string | null;
  detected_format_hints?: Record<string, unknown> | null;
  summary_preview?: {
    detected_income_lines?: number | null;
    detected_expense_lines?: number | null;
  } | null;
};

// Raw analysis from AI clarification
type RawClarificationAnalysis = {
  normalized_budget_summary: string;
  net_position: string;
  critical_observations: string[];
  reasoning: string;
};

// Raw question group with nested questions
type RawQuestionGroup = {
  group_id: string;
  group_title: string;
  questions: unknown;
};

type RawClarificationQuestionsResponse = {
  budget_id: string;
  needs_clarification: boolean;
  questions?: unknown;
  partial_model?: RawUnifiedBudgetModel | null;
  // New fields for enhanced clarification response
  analysis?: RawClarificationAnalysis | null;
  question_groups?: RawQuestionGroup[] | null;
  next_steps?: string | null;
};

type RawSubmitAnswersResponse = {
  budget_id: string;
  status: string;
  ready_for_summary?: boolean;
};

type RawUserQueryResponse = {
  budget_id: string;
  query: string;
  status: string;
};

type RawProviderMetadata = {
  clarification_provider: string;
  suggestion_provider: string;
  ai_enabled: boolean;
  used_deterministic?: boolean;
};

// Phase 9.5: Extended suggestion types
type RawExtendedSuggestion = RawBudgetSuggestion & {
  priority?: number;
  category?: 'debt' | 'savings' | 'spending' | 'income' | 'general';
  key_insight?: string;
  assumptions?: string[];
};

type RawExecutiveSummary = {
  answer: string;
  key_metrics?: {
    label: string;
    value: string;
    highlight?: boolean;
  }[];
  confidence_level: 'high' | 'medium' | 'low';
  confidence_explanation: string;
  methodology?: string;
};

type RawSuggestionAssumption = {
  id: string;
  assumption: string;
  source: 'explicit' | 'inferred';
};

type RawProjectedOutcome = {
  label: string;
  current_value: number;
  projected_value: number;
  percent_change: number;
  timeline_change?: {
    before: string;
    after: string;
  };
};

type RawSummaryAndSuggestionsResponse = {
  budget_id: string;
  summary?: RawBudgetSummary | null;
  category_shares?: Record<string, number> | null;
  suggestions?: RawBudgetSuggestion[] | null;
  provider_metadata?: RawProviderMetadata | null;
  user_query?: string | null;
  // Phase 9.5: Extended response fields
  extended_suggestions?: RawExtendedSuggestion[] | null;
  executive_summary?: RawExecutiveSummary | null;
  global_assumptions?: RawSuggestionAssumption[] | null;
  projected_outcomes?: RawProjectedOutcome[] | null;
};

type RawIncomeEntry = {
  id: string;
  name: string;
  monthly_amount: number;
  type: IncomeEntry['type'];
  stability: IncomeEntry['stability'];
};

type RawExpenseEntry = {
  id: string;
  category: string;
  monthly_amount: number;
  essential?: boolean | null;
  notes?: string | null;
};

type RawRateChange = {
  date: string;
  new_rate: number;
};

type RawDebtEntry = {
  id: string;
  name: string;
  balance: number;
  interest_rate: number;
  min_payment: number;
  priority: DebtEntry['priority'];
  approximate: boolean;
  rate_changes?: RawRateChange[] | null;
};

type RawPreferences = {
  optimization_focus: BudgetPreferences['optimizationFocus'];
  protect_essentials: boolean;
  max_desired_change_per_category: number;
};

type RawBudgetSummary = {
  total_income: number;
  total_expenses: number;
  surplus: number;
};

type RawUnifiedBudgetModel = {
  income?: RawIncomeEntry[];
  expenses?: RawExpenseEntry[];
  debts?: RawDebtEntry[];
  preferences?: RawPreferences;
  summary?: RawBudgetSummary;
};

type RawBudgetSuggestion = {
  id: string;
  title: string;
  description: string;
  expected_monthly_impact: number;
  rationale: string;
  tradeoffs: string;
};

const ConstraintSchema = z
  .object({
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    unit: z.string().optional(),
    step: z.number().optional(),
    default: z.union([z.number(), z.string(), z.boolean()]).optional(),
  })
  .partial();

const BaseComponentSchema = z.object({
  field_id: z.string().min(1),
  component: z.enum(['number_input', 'dropdown', 'toggle', 'slider', 'text_input']),
  label: z.string().min(1),
  constraints: ConstraintSchema.optional(),
  options: z.array(z.string().min(1)).optional(),
  binding: z.string().optional(),
  description: z.string().optional(),
});

const NumberInputComponentSchema = BaseComponentSchema.extend({
  component: z.literal('number_input'),
});

const DropdownComponentSchema = BaseComponentSchema.extend({
  component: z.literal('dropdown'),
  options: z.array(z.string().min(1)).min(1),
});

const ToggleComponentSchema = BaseComponentSchema.extend({
  component: z.literal('toggle'),
});

const SliderComponentSchema = BaseComponentSchema.extend({
  component: z.literal('slider'),
});

const TextInputComponentSchema = BaseComponentSchema.extend({
  component: z.literal('text_input'),
});

const ClarificationComponentSchema = z.discriminatedUnion('component', [
  NumberInputComponentSchema,
  DropdownComponentSchema,
  ToggleComponentSchema,
  SliderComponentSchema,
  TextInputComponentSchema,
]);

const ClarificationQuestionSchema = z.object({
  question_id: z.string().min(1),
  prompt: z.string().min(1),
  description: z.string().optional(),
  components: z.array(ClarificationComponentSchema).min(1),
});

type RawNumberComponent = z.infer<typeof NumberInputComponentSchema>;
type RawDropdownComponent = z.infer<typeof DropdownComponentSchema>;
type RawToggleComponent = z.infer<typeof ToggleComponentSchema>;
type RawSliderComponent = z.infer<typeof SliderComponentSchema>;
type RawTextInputComponent = z.infer<typeof TextInputComponentSchema>;
type RawClarificationComponent =
  | RawNumberComponent
  | RawDropdownComponent
  | RawToggleComponent
  | RawSliderComponent
  | RawTextInputComponent;
type RawClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

function normalizeUploadBudgetResponse(raw: RawUploadBudgetResponse): UploadBudgetResponse {
  return {
    budgetId: raw.budget_id,
    status: raw.status,
    detectedFormat: raw.detected_format ?? null,
    detectedFormatHints: raw.detected_format_hints ?? null,
    summaryPreview: raw.summary_preview
      ? {
          detectedIncomeLines: raw.summary_preview.detected_income_lines ?? 0,
          detectedExpenseLines: raw.summary_preview.detected_expense_lines ?? 0,
        }
      : null,
  };
}

function normalizeClarificationAnalysis(
  raw: RawClarificationAnalysis | null | undefined,
): ClarificationAnalysis | null {
  if (!raw) return null;
  return {
    normalizedBudgetSummary: raw.normalized_budget_summary ?? '',
    netPosition: raw.net_position ?? '',
    criticalObservations: Array.isArray(raw.critical_observations)
      ? raw.critical_observations
      : [],
    reasoning: raw.reasoning ?? '',
  };
}

function normalizeQuestionGroups(
  rawGroups: RawQuestionGroup[] | null | undefined,
): QuestionGroup[] | null {
  if (!rawGroups || !Array.isArray(rawGroups) || rawGroups.length === 0) {
    return null;
  }

  return rawGroups.map((group) => ({
    groupId: group.group_id ?? '',
    groupTitle: group.group_title ?? '',
    questions: parseClarificationQuestions(group.questions),
  }));
}

function normalizeClarificationQuestionsResponse(
  raw: RawClarificationQuestionsResponse,
): ClarificationQuestionsResponse {
  // Parse questions from flat array or extract from groups
  let questions = parseClarificationQuestions(raw.questions);
  const questionGroups = normalizeQuestionGroups(raw.question_groups);

  // If no flat questions but we have groups, flatten them
  if (questions.length === 0 && questionGroups && questionGroups.length > 0) {
    questions = questionGroups.flatMap((group) => group.questions);
  }

  return {
    budgetId: raw.budget_id,
    needsClarification: Boolean(raw.needs_clarification),
    questions,
    partialModel: raw.partial_model ? normalizeUnifiedBudgetModel(raw.partial_model) : null,
    analysis: normalizeClarificationAnalysis(raw.analysis),
    questionGroups,
    nextSteps: raw.next_steps ?? null,
  };
}

function normalizeSubmitAnswersResponse(raw: RawSubmitAnswersResponse): SubmitAnswersResponse {
  return {
    budgetId: raw.budget_id,
    status: raw.status,
    readyForSummary: raw.ready_for_summary ?? raw.status === 'ready_for_summary',
  };
}

function normalizeUserQueryResponse(raw: RawUserQueryResponse): UserQueryResponse {
  return {
    budgetId: raw.budget_id,
    query: raw.query,
    status: raw.status,
  };
}

function normalizeSummaryAndSuggestionsResponse(
  raw: RawSummaryAndSuggestionsResponse,
): SummaryAndSuggestionsResponse {
  return {
    budgetId: raw.budget_id,
    summary: normalizeBudgetSummary(raw.summary),
    categoryShares: raw.category_shares ?? {},
    suggestions: normalizeSuggestions(raw.suggestions),
    providerMetadata: raw.provider_metadata
      ? {
          clarificationProvider: raw.provider_metadata.clarification_provider,
          suggestionProvider: raw.provider_metadata.suggestion_provider,
          aiEnabled: raw.provider_metadata.ai_enabled,
          usedDeterministic: raw.provider_metadata.used_deterministic,
        }
      : undefined,
    userQuery: raw.user_query ?? null,
    // Phase 9.5: Extended response fields
    executiveSummary: raw.executive_summary
      ? {
          answer: raw.executive_summary.answer,
          keyMetrics: raw.executive_summary.key_metrics,
          confidenceLevel: raw.executive_summary.confidence_level,
          confidenceExplanation: raw.executive_summary.confidence_explanation,
          methodology: raw.executive_summary.methodology,
        }
      : undefined,
    extendedSuggestions: normalizeExtendedSuggestions(raw.extended_suggestions),
    assumptions: raw.global_assumptions?.map(a => ({
      id: a.id,
      assumption: a.assumption,
      source: a.source,
    })),
    projectedOutcomes: raw.projected_outcomes?.map(o => ({
      label: o.label,
      currentValue: o.current_value,
      projectedValue: o.projected_value,
      percentChange: o.percent_change,
      timelineChange: o.timeline_change,
    })),
  };
}

function normalizeExtendedSuggestions(
  rawSuggestions?: RawExtendedSuggestion[] | null
): ExtendedBudgetSuggestion[] | undefined {
  if (!rawSuggestions) return undefined;
  return rawSuggestions.map((suggestion, index) => ({
    id: suggestion.id,
    title: suggestion.title,
    description: suggestion.description,
    expectedMonthlyImpact: suggestion.expected_monthly_impact,
    rationale: suggestion.rationale,
    tradeoffs: suggestion.tradeoffs,
    priority: suggestion.priority ?? index + 1,
    category: suggestion.category ?? 'general',
    keyInsight: suggestion.key_insight,
    assumptions: suggestion.assumptions,
  }));
}

function normalizeSuggestions(rawSuggestions?: RawBudgetSuggestion[] | null): BudgetSuggestion[] {
  if (!rawSuggestions) return [];
  return rawSuggestions.map((suggestion) => ({
    id: suggestion.id,
    title: suggestion.title,
    description: suggestion.description,
    expectedMonthlyImpact: suggestion.expected_monthly_impact,
    rationale: suggestion.rationale,
    tradeoffs: suggestion.tradeoffs,
  }));
}

function normalizeUnifiedBudgetModel(raw: RawUnifiedBudgetModel): UnifiedBudgetModel {
  return {
    income: normalizeIncomeEntries(raw.income),
    expenses: normalizeExpenseEntries(raw.expenses),
    debts: normalizeDebtEntries(raw.debts),
    preferences: normalizePreferences(raw.preferences),
    summary: normalizeBudgetSummary(raw.summary),
  };
}

function normalizeIncomeEntries(entries?: RawIncomeEntry[] | null): IncomeEntry[] {
  if (!entries) return [];
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    monthlyAmount: Number(entry.monthly_amount ?? 0),
    type: entry.type,
    stability: entry.stability,
  }));
}

function normalizeExpenseEntries(entries?: RawExpenseEntry[] | null): ExpenseEntry[] {
  if (!entries) return [];
  return entries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    monthlyAmount: Number(entry.monthly_amount ?? 0),
    essential: entry.essential ?? null,
    notes: entry.notes ?? null,
  }));
}

function normalizeDebtEntries(entries?: RawDebtEntry[] | null): DebtEntry[] {
  if (!entries) return [];
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    balance: Number(entry.balance ?? 0),
    interestRate: Number(entry.interest_rate ?? 0),
    minPayment: Number(entry.min_payment ?? 0),
    priority: entry.priority,
    approximate: Boolean(entry.approximate),
    rateChanges: entry.rate_changes ? normalizeRateChanges(entry.rate_changes) : null,
  }));
}

function normalizeRateChanges(changes: RawRateChange[]): RateChange[] {
  return changes.map((change) => ({
    date: change.date,
    newRate: Number(change.new_rate ?? 0),
  }));
}

function normalizePreferences(preferences?: RawPreferences): BudgetPreferences {
  if (!preferences) {
    return {
      optimizationFocus: 'balanced',
      protectEssentials: true,
      maxDesiredChangePerCategory: 0.1,
    };
  }
  return {
    optimizationFocus: preferences.optimization_focus,
    protectEssentials: Boolean(preferences.protect_essentials),
    maxDesiredChangePerCategory: Number(preferences.max_desired_change_per_category ?? 0),
  };
}

function normalizeBudgetSummary(summary?: RawBudgetSummary | null): BudgetSummary {
  if (!summary) {
    return {
      totalIncome: 0,
      totalExpenses: 0,
      surplus: 0,
    };
  }
  return {
    totalIncome: Number(summary.total_income ?? 0),
    totalExpenses: Number(summary.total_expenses ?? 0),
    surplus: Number(summary.surplus ?? 0),
  };
}

function parseClarificationQuestions(payload: unknown): ClarificationQuestion[] {
  const parsed = ClarificationQuestionSchema.array().safeParse(payload ?? []);
  if (!parsed.success) {
    throw new ApiError(
      'Invalid clarification question payload received from gateway.',
      502,
      parsed.error.flatten(),
    );
  }
  return parsed.data.map(normalizeClarificationQuestion);
}

function normalizeClarificationQuestion(raw: RawClarificationQuestion): ClarificationQuestion {
  return {
    id: raw.question_id,
    prompt: raw.prompt,
    description: raw.description,
    components: raw.components.map(normalizeClarificationComponent),
  };
}

function normalizeClarificationComponent(
  raw: RawClarificationComponent,
): ClarificationComponentDescriptor {
  switch (raw.component) {
    case 'number_input':
      return normalizeNumberComponent(raw);
    case 'dropdown':
      return normalizeDropdownComponent(raw);
    case 'toggle':
      return normalizeToggleComponent(raw);
    case 'slider':
      return normalizeSliderComponent(raw);
    case 'text_input':
      return normalizeTextInputComponent(raw);
    default:
      return assertNever(raw);
  }
}

function normalizeNumberComponent(raw: RawNumberComponent): ClarificationNumberInputDescriptor {
  return {
    component: 'number_input',
    fieldId: raw.field_id,
    label: raw.label,
    binding: raw.binding ?? undefined,
    constraints: extractNumberConstraints(raw.constraints),
  };
}

function normalizeDropdownComponent(raw: RawDropdownComponent): ClarificationDropdownDescriptor {
  return {
    component: 'dropdown',
    fieldId: raw.field_id,
    label: raw.label,
    binding: raw.binding ?? undefined,
    options: Array.isArray(raw.options) ? [...raw.options] : [],
    constraints: extractDropdownConstraints(raw.constraints),
  };
}

function normalizeToggleComponent(raw: RawToggleComponent): ClarificationToggleDescriptor {
  return {
    component: 'toggle',
    fieldId: raw.field_id,
    label: raw.label,
    binding: raw.binding ?? undefined,
    constraints: extractToggleConstraints(raw.constraints),
  };
}

function normalizeSliderComponent(raw: RawSliderComponent): ClarificationSliderDescriptor {
  return {
    component: 'slider',
    fieldId: raw.field_id,
    label: raw.label,
    binding: raw.binding ?? undefined,
    constraints: extractNumberConstraints(raw.constraints),
  };
}

function normalizeTextInputComponent(raw: RawTextInputComponent): ClarificationTextInputDescriptor {
  return {
    component: 'text_input',
    fieldId: raw.field_id,
    label: raw.label,
    binding: raw.binding ?? undefined,
    constraints: extractTextInputConstraints(raw.constraints),
  };
}

function extractTextInputConstraints(
  constraints?: Record<string, unknown>,
): ClarificationTextInputDescriptor['constraints'] {
  if (!constraints) return undefined;
  const normalized = {
    minLength: typeof constraints.minLength === 'number' ? constraints.minLength : undefined,
    maxLength: typeof constraints.maxLength === 'number' ? constraints.maxLength : undefined,
    placeholder: typeof constraints.placeholder === 'string' ? constraints.placeholder : undefined,
    default: typeof constraints.default === 'string' ? constraints.default : undefined,
  };
  return hasDefinedValue(normalized) ? normalized : undefined;
}

function extractNumberConstraints(
  constraints?: Record<string, unknown>,
): ClarificationNumberInputDescriptor['constraints'] {
  if (!constraints) return undefined;
  const normalized = {
    minimum: typeof constraints.minimum === 'number' ? constraints.minimum : undefined,
    maximum: typeof constraints.maximum === 'number' ? constraints.maximum : undefined,
    unit: typeof constraints.unit === 'string' ? constraints.unit : undefined,
    step: typeof constraints.step === 'number' ? constraints.step : undefined,
    default: typeof constraints.default === 'number' ? constraints.default : undefined,
  };
  return hasDefinedValue(normalized) ? normalized : undefined;
}

function extractDropdownConstraints(
  constraints?: Record<string, unknown>,
): ClarificationDropdownDescriptor['constraints'] {
  if (!constraints) return undefined;
  const normalized = {
    default: typeof constraints.default === 'string' ? constraints.default : undefined,
  };
  return hasDefinedValue(normalized) ? normalized : undefined;
}

function extractToggleConstraints(
  constraints?: Record<string, unknown>,
): ClarificationToggleDescriptor['constraints'] {
  if (!constraints) return undefined;
  const normalized = {
    default: typeof constraints.default === 'boolean' ? constraints.default : undefined,
  };
  return hasDefinedValue(normalized) ? normalized : undefined;
}

function hasDefinedValue(object: Record<string, unknown>): boolean {
  return Object.values(object).some((value) => value !== undefined);
}

function assertNever(value: never): never {
  throw new ApiError('Unsupported component descriptor received from the gateway.', 502, value);
}
