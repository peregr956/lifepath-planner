/**
 * Unit tests for API client environment variable resolution.
 * Tests the logic for resolving API base URLs from environment variables.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEnvTestContext } from '@/test/testEnv';

// We need to test module-level initialization, so we use dynamic imports
// to re-import the module with different environment variable states.

const envContext = createEnvTestContext();

describe('API Base URL Resolution', () => {
  beforeEach(() => {
    envContext.beforeEach();
    vi.resetModules();
  });

  afterEach(() => {
    envContext.afterEach();
  });

  describe('Environment Variable Priority', () => {
    it('uses NEXT_PUBLIC_LIFEPATH_API_BASE_URL when set', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://api.example.com',
      });

      const { getActiveApiBase, getApiBaseCandidates } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://api.example.com');
      expect(getApiBaseCandidates()[0]).toBe('https://api.example.com');
    });

    it('falls back to LIFEPATH_API_BASE_URL when NEXT_PUBLIC version is not set', async () => {
      envContext.setEnv({
        LIFEPATH_API_BASE_URL: 'https://fallback1.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://fallback1.example.com');
    });

    it('falls back to NEXT_PUBLIC_API_BASE_URL as third priority', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_API_BASE_URL: 'https://fallback2.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://fallback2.example.com');
    });

    it('falls back to API_BASE_URL as fourth priority', async () => {
      envContext.setEnv({
        API_BASE_URL: 'https://fallback3.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://fallback3.example.com');
    });

    it('falls back to NEXT_PUBLIC_GATEWAY_BASE_URL as fifth priority', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_GATEWAY_BASE_URL: 'https://gateway1.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://gateway1.example.com');
    });

    it('falls back to GATEWAY_BASE_URL as sixth priority', async () => {
      envContext.setEnv({
        GATEWAY_BASE_URL: 'https://gateway2.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://gateway2.example.com');
    });

    it('respects priority order when multiple env vars are set', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://highest-priority.com',
        LIFEPATH_API_BASE_URL: 'https://lower-priority.com',
        API_BASE_URL: 'https://lowest-priority.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://highest-priority.com');
    });

    it('uses default localhost fallbacks when no env vars are set', async () => {
      // No env vars set
      const { getActiveApiBase, getApiBaseCandidates } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('http://localhost:8000');
      expect(getApiBaseCandidates()).toContain('http://localhost:8000');
      expect(getApiBaseCandidates()).toContain('http://127.0.0.1:8000');
    });
  });

  describe('URL Normalization', () => {
    it('removes trailing slashes from URLs', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://api.example.com/',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://api.example.com');
    });

    it('removes multiple trailing slashes', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://api.example.com///',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://api.example.com');
    });

    it('adds http:// protocol if missing', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'api.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('http://api.example.com');
    });

    it('preserves https:// protocol', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://secure.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://secure.example.com');
    });

    it('trims whitespace from URLs', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: '  https://api.example.com  ',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://api.example.com');
    });

    it('ignores empty string env vars', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: '',
        LIFEPATH_API_BASE_URL: 'https://fallback.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://fallback.example.com');
    });

    it('ignores whitespace-only env vars', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: '   ',
        LIFEPATH_API_BASE_URL: 'https://fallback.example.com',
      });

      const { getActiveApiBase } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://fallback.example.com');
    });
  });

  describe('Candidate URL Parsing', () => {
    it('parses comma-separated candidates', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES:
          'https://api1.example.com,https://api2.example.com,https://api3.example.com',
      });

      const { getApiBaseCandidates } = await import('@/utils/apiClient');

      const candidates = getApiBaseCandidates();
      expect(candidates).toContain('https://api1.example.com');
      expect(candidates).toContain('https://api2.example.com');
      expect(candidates).toContain('https://api3.example.com');
    });

    it('parses space-separated candidates', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES:
          'https://api1.example.com https://api2.example.com',
      });

      const { getApiBaseCandidates } = await import('@/utils/apiClient');

      const candidates = getApiBaseCandidates();
      expect(candidates).toContain('https://api1.example.com');
      expect(candidates).toContain('https://api2.example.com');
    });

    it('parses newline-separated candidates', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES:
          'https://api1.example.com\nhttps://api2.example.com',
      });

      const { getApiBaseCandidates } = await import('@/utils/apiClient');

      const candidates = getApiBaseCandidates();
      expect(candidates).toContain('https://api1.example.com');
      expect(candidates).toContain('https://api2.example.com');
    });

    it('deduplicates candidate URLs', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES:
          'https://api.example.com,https://api.example.com,https://api.example.com',
      });

      const { getApiBaseCandidates } = await import('@/utils/apiClient');

      const candidates = getApiBaseCandidates();
      const exampleCount = candidates.filter((c) => c === 'https://api.example.com').length;
      expect(exampleCount).toBe(1);
    });

    it('prioritizes explicit base URL over candidates', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://primary.example.com',
        NEXT_PUBLIC_LIFEPATH_API_BASE_CANDIDATES:
          'https://candidate1.example.com,https://candidate2.example.com',
      });

      const { getActiveApiBase, getApiBaseCandidates } = await import('@/utils/apiClient');

      expect(getActiveApiBase()).toBe('https://primary.example.com');
      expect(getApiBaseCandidates()[0]).toBe('https://primary.example.com');
    });
  });

  describe('setActiveApiBase', () => {
    it('updates the active API base', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://initial.example.com',
      });

      const { setActiveApiBase, getActiveApiBase } = await import('@/utils/apiClient');

      setActiveApiBase('https://new.example.com');

      expect(getActiveApiBase()).toBe('https://new.example.com');
    });

    it('adds new URL to candidates list', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://initial.example.com',
      });

      const { setActiveApiBase, getApiBaseCandidates } = await import('@/utils/apiClient');

      setActiveApiBase('https://new.example.com');

      expect(getApiBaseCandidates()).toContain('https://new.example.com');
    });

    it('normalizes the URL before setting', async () => {
      const { setActiveApiBase, getActiveApiBase } = await import('@/utils/apiClient');

      setActiveApiBase('https://trailing.example.com/');

      expect(getActiveApiBase()).toBe('https://trailing.example.com');
    });

    it('returns current value for invalid URL', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://valid.example.com',
      });

      const { setActiveApiBase, getActiveApiBase } = await import('@/utils/apiClient');

      const result = setActiveApiBase('');

      expect(result).toBe('https://valid.example.com');
      expect(getActiveApiBase()).toBe('https://valid.example.com');
    });
  });

  describe('setApiBaseCandidates', () => {
    it('replaces the candidates list', async () => {
      const { setApiBaseCandidates, getApiBaseCandidates } = await import('@/utils/apiClient');

      setApiBaseCandidates([
        'https://new1.example.com',
        'https://new2.example.com',
      ]);

      const candidates = getApiBaseCandidates();
      expect(candidates[0]).toBe('https://new1.example.com');
      expect(candidates[1]).toBe('https://new2.example.com');
    });

    it('sets active to first candidate', async () => {
      const { setApiBaseCandidates, getActiveApiBase } = await import('@/utils/apiClient');

      setApiBaseCandidates([
        'https://first.example.com',
        'https://second.example.com',
      ]);

      expect(getActiveApiBase()).toBe('https://first.example.com');
    });

    it('normalizes all candidate URLs', async () => {
      const { setApiBaseCandidates, getApiBaseCandidates } = await import('@/utils/apiClient');

      setApiBaseCandidates([
        'https://trailing.example.com/',
        'no-protocol.example.com',
      ]);

      const candidates = getApiBaseCandidates();
      expect(candidates).toContain('https://trailing.example.com');
      expect(candidates).toContain('http://no-protocol.example.com');
    });

    it('resets to defaults if empty array provided', async () => {
      const { setApiBaseCandidates, getApiBaseCandidates } = await import('@/utils/apiClient');

      setApiBaseCandidates([]);

      const candidates = getApiBaseCandidates();
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates).toContain('http://localhost:8000');
    });
  });

  describe('addApiBaseCandidate', () => {
    it('adds new candidate and sets it as active', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://initial.example.com',
      });

      const { addApiBaseCandidate, getActiveApiBase, getApiBaseCandidates } = await import(
        '@/utils/apiClient'
      );

      addApiBaseCandidate('https://added.example.com');

      expect(getActiveApiBase()).toBe('https://added.example.com');
      expect(getApiBaseCandidates()).toContain('https://added.example.com');
    });

    it('prepends to candidates list', async () => {
      envContext.setEnv({
        NEXT_PUBLIC_LIFEPATH_API_BASE_URL: 'https://initial.example.com',
      });

      const { addApiBaseCandidate, getApiBaseCandidates } = await import('@/utils/apiClient');

      addApiBaseCandidate('https://added.example.com');

      expect(getApiBaseCandidates()[0]).toBe('https://added.example.com');
    });
  });

  describe('refreshApiBaseCandidates', () => {
    it('reloads candidates from environment', async () => {
      const { setApiBaseCandidates, refreshApiBaseCandidates, getApiBaseCandidates } = await import(
        '@/utils/apiClient'
      );

      // First set custom candidates
      setApiBaseCandidates(['https://custom.example.com']);
      expect(getApiBaseCandidates()[0]).toBe('https://custom.example.com');

      // Refresh should reload from env (which is empty, so defaults)
      refreshApiBaseCandidates();

      expect(getApiBaseCandidates()).toContain('http://localhost:8000');
    });
  });
});

