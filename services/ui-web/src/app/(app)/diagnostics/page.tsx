'use client';

import { useEffect, useState } from 'react';
import { useApiBase } from '@/utils/apiClient';
import { getActiveApiBase, getApiBaseCandidates } from '@/utils/apiClient';

type DiagnosticInfo = {
  environment: string;
  apiBase: string;
  candidates: string[];
  envVars: Record<string, string | undefined>;
  apiHealth: {
    status: 'checking' | 'success' | 'error';
    message?: string;
    response?: unknown;
  };
  corsTest: {
    status: 'checking' | 'success' | 'error';
    message?: string;
  };
};

export default function DiagnosticsPage() {
  const { activeApiBase, candidates } = useApiBase();
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo>({
    environment: typeof window !== 'undefined' ? window.location.origin : 'unknown',
    apiBase: activeApiBase,
    candidates,
    envVars: {},
    apiHealth: { status: 'checking' },
    corsTest: { status: 'checking' },
  });

  useEffect(() => {
    // Check environment variables (what's actually available in the browser)
    const envVars: Record<string, string | undefined> = {};
    const envKeys = [
      'NEXT_PUBLIC_LIFEPATH_API_BASE_URL',
      'LIFEPATH_API_BASE_URL',
      'NEXT_PUBLIC_API_BASE_URL',
      'API_BASE_URL',
      'NEXT_PUBLIC_GATEWAY_BASE_URL',
      'GATEWAY_BASE_URL',
    ];

    envKeys.forEach((key) => {
      // In Next.js, NEXT_PUBLIC_ vars are embedded at build time
      // Access them directly
      if (typeof process !== 'undefined' && process.env) {
        envVars[key] = process.env[key];
      }
    });

    setDiagnostics((prev) => ({
      ...prev,
      envVars,
      apiBase: getActiveApiBase(),
      candidates: getApiBaseCandidates(),
    }));

    // Test API Gateway health endpoint
    const testApiHealth = async () => {
      const baseUrl = getActiveApiBase();
      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setDiagnostics((prev) => ({
            ...prev,
            apiHealth: {
              status: 'success',
              message: 'API Gateway is reachable and healthy',
              response: data,
            },
          }));
        } else {
          setDiagnostics((prev) => ({
            ...prev,
            apiHealth: {
              status: 'error',
              message: `API Gateway returned status ${response.status}: ${response.statusText}`,
            },
          }));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setDiagnostics((prev) => ({
          ...prev,
          apiHealth: {
            status: 'error',
            message: `Failed to reach API Gateway: ${errorMessage}`,
          },
        }));
      }
    };

    // Test CORS
    const testCors = async () => {
      const baseUrl = getActiveApiBase();
      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: 'OPTIONS',
          headers: {
            Origin: window.location.origin,
            'Access-Control-Request-Method': 'GET',
          },
        });

        const corsHeader = response.headers.get('access-control-allow-origin');
        if (corsHeader) {
          setDiagnostics((prev) => ({
            ...prev,
            corsTest: {
              status: 'success',
              message: `CORS is configured. Allowed origin: ${corsHeader}`,
            },
          }));
        } else {
          setDiagnostics((prev) => ({
            ...prev,
            corsTest: {
              status: 'error',
              message: 'CORS headers not found. Backend may not be configured for this origin.',
            },
          }));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setDiagnostics((prev) => ({
          ...prev,
          corsTest: {
            status: 'error',
            message: `CORS test failed: ${errorMessage}`,
          },
        }));
      }
    };

    testApiHealth();
    testCors();
  }, [activeApiBase, candidates]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="card">
        <h2 className="text-2xl font-semibold text-white">Configuration Diagnostics</h2>
        <p className="mt-2 text-sm text-white/70">
          This page shows what the application can see at runtime. Use this to debug
          environment variable and API connectivity issues.
        </p>
      </div>

      {/* Environment Info */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">Environment</h3>
        <div className="space-y-2 font-mono text-sm">
          <div>
            <span className="text-white/50">Current Origin:</span>{' '}
            <span className="text-white">{diagnostics.environment}</span>
          </div>
          <div>
            <span className="text-white/50">Node Environment:</span>{' '}
            <span className="text-white">
              {typeof process !== 'undefined' ? process.env.NODE_ENV : 'unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* API Base URL */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">API Configuration</h3>
        <div className="space-y-3">
          <div>
            <div className="text-sm text-white/50 mb-1">Active API Base URL:</div>
            <div className="font-mono text-sm text-emerald-400 break-all">
              {diagnostics.apiBase}
            </div>
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">All Candidate URLs:</div>
            <ul className="space-y-1">
              {diagnostics.candidates.map((url, idx) => (
                <li
                  key={idx}
                  className={`font-mono text-xs ${
                    url === diagnostics.apiBase
                      ? 'text-emerald-400'
                      : 'text-white/60'
                  }`}
                >
                  {url === diagnostics.apiBase && '→ '}
                  {url}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Environment Variables */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">Environment Variables</h3>
        <div className="space-y-2">
          <p className="text-sm text-white/70 mb-3">
            These are the environment variables accessible in the browser. NEXT_PUBLIC_*
            variables are embedded at build time.
          </p>
          <div className="space-y-2 font-mono text-sm">
            {Object.entries(diagnostics.envVars).map(([key, value]) => (
              <div key={key} className="flex gap-4">
                <span className="text-white/50 min-w-[200px]">{key}:</span>
                <span className={value ? 'text-emerald-400' : 'text-red-400'}>
                  {value || '(not set)'}
                </span>
              </div>
            ))}
          </div>
          {Object.keys(diagnostics.envVars).length === 0 && (
            <p className="text-sm text-red-400">
              No environment variables detected. This may indicate they were not set at build
              time.
            </p>
          )}
        </div>
      </div>

      {/* API Health Check */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">API Gateway Health</h3>
        <div className="space-y-2">
          {diagnostics.apiHealth.status === 'checking' && (
            <div className="text-white/70">Checking API Gateway...</div>
          )}
          {diagnostics.apiHealth.status === 'success' && (
            <div>
              <div className="text-emerald-400 mb-2">✓ {diagnostics.apiHealth.message}</div>
              {diagnostics.apiHealth.response && (
                <pre className="text-xs bg-white/5 p-2 rounded overflow-auto">
                  {JSON.stringify(diagnostics.apiHealth.response, null, 2)}
                </pre>
              )}
            </div>
          )}
          {diagnostics.apiHealth.status === 'error' && (
            <div>
              <div className="text-red-400 mb-2">✗ {diagnostics.apiHealth.message}</div>
              <div className="text-sm text-white/70 mt-2">
                Possible causes:
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>API Gateway is not running</li>
                  <li>Incorrect API base URL configured</li>
                  <li>Network connectivity issues</li>
                  <li>CORS blocking the request</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CORS Test */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">CORS Configuration</h3>
        <div className="space-y-2">
          {diagnostics.corsTest.status === 'checking' && (
            <div className="text-white/70">Testing CORS configuration...</div>
          )}
          {diagnostics.corsTest.status === 'success' && (
            <div className="text-emerald-400">✓ {diagnostics.corsTest.message}</div>
          )}
          {diagnostics.corsTest.status === 'error' && (
            <div>
              <div className="text-red-400 mb-2">✗ {diagnostics.corsTest.message}</div>
              <div className="text-sm text-white/70 mt-2">
                To fix this, set GATEWAY_CORS_ORIGINS on your Railway backend to include:
                <div className="font-mono text-emerald-400 mt-1">
                  {diagnostics.environment}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div className="card border-amber-500/30 bg-amber-500/10">
        <h3 className="text-xl font-semibold text-amber-300 mb-4">Troubleshooting Steps</h3>
        <ol className="space-y-3 text-sm text-white/80">
          <li>
            <strong className="text-white">1. Check Environment Variables:</strong> If
            NEXT_PUBLIC_LIFEPATH_API_BASE_URL shows as "(not set)", it means the variable was
            not available at build time. Set it in Vercel and trigger a new deployment.
          </li>
          <li>
            <strong className="text-white">2. Verify API Gateway URL:</strong> The active API
            base URL should match your Railway deployment URL. Check Railway dashboard →
            Settings → Networking.
          </li>
          <li>
            <strong className="text-white">3. Test API Gateway:</strong> If the health check
            fails, verify the API Gateway is running and accessible. Try accessing{' '}
            <code className="bg-white/10 px-1 rounded">
              {diagnostics.apiBase}/health
            </code>{' '}
            directly in your browser.
          </li>
          <li>
            <strong className="text-white">4. Fix CORS:</strong> If CORS test fails, add your
            Vercel URL to GATEWAY_CORS_ORIGINS on Railway and restart the service.
          </li>
        </ol>
      </div>
    </div>
  );
}

