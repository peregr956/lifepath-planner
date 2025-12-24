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
    // IMPORTANT: Next.js only replaces NEXT_PUBLIC_* variables at build time
    // when using DIRECT property access (e.g., process.env.NEXT_PUBLIC_LIFEPATH_API_BASE_URL).
    // Dynamic access like process.env[key] does NOT work for NEXT_PUBLIC_* vars.
    const envVars: Record<string, string | undefined> = {
      'NEXT_PUBLIC_LIFEPATH_API_BASE_URL': process.env.NEXT_PUBLIC_LIFEPATH_API_BASE_URL,
      'LIFEPATH_API_BASE_URL': process.env.LIFEPATH_API_BASE_URL,
      'NEXT_PUBLIC_API_BASE_URL': process.env.NEXT_PUBLIC_API_BASE_URL,
      'API_BASE_URL': process.env.API_BASE_URL,
      'NEXT_PUBLIC_GATEWAY_BASE_URL': process.env.NEXT_PUBLIC_GATEWAY_BASE_URL,
      'GATEWAY_BASE_URL': process.env.GATEWAY_BASE_URL,
    };

    setDiagnostics((prev) => ({
      ...prev,
      envVars,
      apiBase: getActiveApiBase(),
      candidates: getApiBaseCandidates(),
    }));

    // Check if the API is cross-origin (different host than current page)
    const isCrossOrigin = (apiUrl: string): boolean => {
      try {
        const apiOrigin = new URL(apiUrl).origin;
        return apiOrigin !== window.location.origin;
      } catch {
        return true; // Assume cross-origin if we can't parse
      }
    };

    // Test API Gateway health endpoint and infer CORS status
    // If a cross-origin fetch succeeds, CORS is working (browsers block cross-origin requests without proper CORS)
    const testApiHealthAndCors = async () => {
      const baseUrl = getActiveApiBase();
      const crossOrigin = isCrossOrigin(baseUrl);

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
            // If health check succeeds on a cross-origin request, CORS is working
            corsTest: crossOrigin
              ? {
                  status: 'success',
                  message: 'CORS is working (cross-origin health check succeeded)',
                }
              : {
                  status: 'success',
                  message: 'Same-origin request (CORS not required)',
                },
          }));
        } else {
          setDiagnostics((prev) => ({
            ...prev,
            apiHealth: {
              status: 'error',
              message: `API Gateway returned status ${response.status}: ${response.statusText}`,
            },
            corsTest: {
              status: 'success',
              message: 'Request reached server (CORS allowed the request)',
            },
          }));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        
        // Check if this looks like a CORS error
        const isCorsError =
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('NetworkError') ||
          errorMessage.includes('CORS');

        setDiagnostics((prev) => ({
          ...prev,
          apiHealth: {
            status: 'error',
            message: `Failed to reach API Gateway: ${errorMessage}`,
          },
          corsTest: crossOrigin && isCorsError
            ? {
                status: 'error',
                message: 'CORS may be blocking requests. Ensure GATEWAY_CORS_ORIGINS includes this origin.',
              }
            : {
                status: 'error',
                message: `Could not verify CORS: ${errorMessage}`,
              },
        }));
      }
    };

    testApiHealthAndCors();
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
              {diagnostics.apiHealth.response != null && (
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
            NEXT_PUBLIC_LIFEPATH_API_BASE_URL shows as &quot;(not set)&quot;, it means the variable was
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
            <strong className="text-white">4. CORS:</strong> If the health check succeeds,
            CORS is working correctly. CORS status is inferred from whether cross-origin
            requests succeed. If both health and CORS fail, ensure GATEWAY_CORS_ORIGINS
            on Railway includes this origin and restart the service.
          </li>
        </ol>
      </div>
    </div>
  );
}

