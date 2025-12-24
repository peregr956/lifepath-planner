/**
 * Shared helpers for configuring pluggable AI providers.
 * 
 * Ported from services/shared/provider_settings.py
 */

export const SUPPORTED_PROVIDERS = new Set(['deterministic', 'mock', 'openai']);
export const REQUIRED_OPENAI_ENV_VARS = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_API_BASE'];

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  apiBase: string;
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

  return {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    model: (process.env.OPENAI_MODEL || '').trim(),
    apiBase: (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').trim(),
  };
}

