/**
 * Shared helpers for configuring pluggable AI providers.
 * 
 * Supports both direct OpenAI API and Vercel AI Gateway.
 * 
 * Ported from services/shared/provider_settings.py
 */

export const SUPPORTED_PROVIDERS = new Set(['deterministic', 'mock', 'openai']);

// Required env vars for OpenAI provider (OPENAI_API_BASE is optional with good defaults)
export const REQUIRED_OPENAI_ENV_VARS = ['OPENAI_API_KEY'];

// Default API base URLs
export const DEFAULT_OPENAI_API_BASE = 'https://api.openai.com/v1';
export const VERCEL_AI_GATEWAY_URL = 'https://gateway.ai.vercel.sh/v1';

// Default model
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  apiBase: string;
  isAIGateway: boolean;
}

/**
 * Check if Vercel AI Gateway is enabled
 */
export function isAIGatewayEnabled(): boolean {
  return process.env.VERCEL_AI_GATEWAY_ENABLED === 'true';
}

/**
 * Get the appropriate API base URL
 * - If OPENAI_API_BASE is explicitly set, use that
 * - If VERCEL_AI_GATEWAY_ENABLED is true, use the AI Gateway URL
 * - Otherwise, use the default OpenAI API URL
 */
export function getApiBase(): string {
  const explicitBase = process.env.OPENAI_API_BASE?.trim();
  if (explicitBase) {
    return explicitBase;
  }
  
  if (isAIGatewayEnabled()) {
    return VERCEL_AI_GATEWAY_URL;
  }
  
  return DEFAULT_OPENAI_API_BASE;
}

export interface ProviderSettings {
  providerName: string;
  timeoutSeconds: number;
  temperature: number;
  maxOutputTokens: number;
  openai?: OpenAIConfig;
}

export class ProviderSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderSettingsError';
  }
}

/**
 * Construct ProviderSettings for a service-specific provider stack.
 */
export function loadProviderSettings(options: {
  providerEnv: string;
  timeoutEnv: string;
  temperatureEnv: string;
  maxTokensEnv: string;
  defaultProvider?: string;
  defaultTimeout?: number;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}): ProviderSettings {
  const {
    providerEnv,
    timeoutEnv,
    temperatureEnv,
    maxTokensEnv,
    defaultProvider = 'deterministic',
    defaultTimeout = 10.0,
    defaultTemperature = 0.2,
    defaultMaxTokens = 512,
  } = options;

  const providerName = normalizeProvider(process.env[providerEnv] || defaultProvider);
  const timeoutSeconds = parseFloatEnv(process.env[timeoutEnv], defaultTimeout, timeoutEnv);
  const temperature = parseFloatEnv(process.env[temperatureEnv], defaultTemperature, temperatureEnv);
  const maxOutputTokens = parseIntEnv(process.env[maxTokensEnv], defaultMaxTokens, maxTokensEnv);

  let openai: OpenAIConfig | undefined;
  if (providerName === 'openai') {
    openai = buildOpenAIConfig(providerEnv);
  }

  return {
    providerName,
    timeoutSeconds,
    temperature,
    maxOutputTokens,
    openai,
  };
}

function normalizeProvider(rawValue: string | undefined): string {
  const candidate = (rawValue || '').trim().toLowerCase() || 'deterministic';
  if (!SUPPORTED_PROVIDERS.has(candidate)) {
    throw new ProviderSettingsError(`Unsupported provider '${candidate}'`);
  }
  return candidate;
}

function parseFloatEnv(rawValue: string | undefined, defaultValue: number, envKey: string): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue;
  }
  const value = parseFloat(rawValue);
  if (isNaN(value)) {
    throw new ProviderSettingsError(`${envKey} must be numeric (received '${rawValue}')`);
  }
  return value;
}

function parseIntEnv(rawValue: string | undefined, defaultValue: number, envKey: string): number {
  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue;
  }
  const value = parseInt(rawValue, 10);
  if (isNaN(value)) {
    throw new ProviderSettingsError(`${envKey} must be an integer (received '${rawValue}')`);
  }
  return value;
}

function buildOpenAIConfig(providerEnv: string): OpenAIConfig {
  const missing = REQUIRED_OPENAI_ENV_VARS.filter(envKey => !process.env[envKey]);
  if (missing.length > 0) {
    throw new ProviderSettingsError(
      `${providerEnv}=openai requires the following env vars: ${missing.join(', ')}`
    );
  }

  const apiBase = getApiBase();
  const isGateway = isAIGatewayEnabled() || apiBase.includes('gateway');

  return {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    model: (process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim(),
    apiBase,
    isAIGateway: isGateway,
  };
}

/**
 * Try to build OpenAI config without throwing errors.
 * Returns undefined if required env vars are missing.
 * This is useful for optional AI features that should gracefully degrade.
 */
export function tryBuildOpenAIConfig(): OpenAIConfig | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  const apiBase = getApiBase();
  const isGateway = isAIGatewayEnabled() || apiBase.includes('gateway');

  return {
    apiKey,
    model: (process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim(),
    apiBase,
    isAIGateway: isGateway,
  };
}

