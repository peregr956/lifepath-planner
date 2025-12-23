/**
 * Test utilities for managing environment variables in tests.
 * Provides helpers to set, reset, and restore environment variables.
 */

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  'NEXT_PUBLIC_LIFEPATH_API_BASE_URL',
  'LIFEPATH_API_BASE_URL',
  'NEXT_PUBLIC_API_BASE_URL',
  'API_BASE_URL',
  'NEXT_PUBLIC_GATEWAY_BASE_URL',
  'GATEWAY_BASE_URL',
  'NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES',
  'LIFEPATH_API_BASE_CANDIDATES',
  'NEXT_PUBLIC_API_BASE_CANDIDATES',
  'API_BASE_CANDIDATES',
] as const;

/**
 * Captures the current state of all API-related environment variables.
 */
export function captureEnvSnapshot(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

/**
 * Restores environment variables to a previously captured snapshot.
 */
export function restoreEnvSnapshot(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

/**
 * Clears all API-related environment variables.
 */
export function clearEnvVars(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

/**
 * Sets environment variables from an object.
 */
export function setEnvVars(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value;
  }
}

/**
 * Creates a test context that manages environment variables.
 * Automatically captures state before tests and restores after.
 */
export function createEnvTestContext() {
  let snapshot: EnvSnapshot;

  return {
    beforeEach() {
      snapshot = captureEnvSnapshot();
      clearEnvVars();
    },
    afterEach() {
      restoreEnvSnapshot(snapshot);
    },
    setEnv(vars: Record<string, string>) {
      setEnvVars(vars);
    },
    clearEnv() {
      clearEnvVars();
    },
  };
}

