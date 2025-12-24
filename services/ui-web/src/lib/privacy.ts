/**
 * Shared privacy utilities (hashing, redaction).
 * 
 * Ported from services/shared/observability/privacy.py
 */

import { createHash } from 'crypto';

export const REDACTED = '[REDACTED]';

/**
 * Return a stable SHA-256 hash for the provided payload without leaking contents.
 */
export function hashPayload(value: any): string {
  if (value === null || value === undefined) {
    return createHash('sha256').update('null').digest('hex');
  }

  let normalized: string | Buffer;
  if (Buffer.isBuffer(value)) {
    normalized = value;
  } else if (typeof value === 'string') {
    normalized = value;
  } else {
    try {
      normalized = JSON.stringify(value, Object.keys(value).sort());
    } catch (error) {
      normalized = String(value);
    }
  }

  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Produce a shallow copy that preserves only the whitelisted keys and redacts the rest.
 */
export function redactFields(
  payload: Record<string, any>,
  allowedKeys: string[] | Set<string>
): Record<string, any> {
  const whitelist = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys);
  const redacted: Record<string, any> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (whitelist.has(key)) {
      redacted[key] = value;
    } else {
      redacted[key] = REDACTED;
    }
  }

  return redacted;
}

