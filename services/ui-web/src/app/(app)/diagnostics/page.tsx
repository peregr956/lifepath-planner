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
  providerStatus: {
    status: 'checking' | 'success' | 'error' | 'not_checked';
    message?: string;
    clarificationProvider?: string;
    suggestionProvider?: string;
    aiEnabled?: boolean;
  };
  misconfiguration: {
    detected: boolean;
    type?: 'external_url_on_vercel' | 'localhost_in_production';
    externalUrl?: string;
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
    providerStatus: { status: 'not_checked' },
    misconfiguration: { detected: false },
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

    // Detect misconfiguration: external URL being used on Vercel deployment
    const currentApiBase = getActiveApiBase();
    const isVercelDeployment = 
      window.location.hostname.includes('.vercel.app') ||
      window.location.hostname.includes('.vercel.sh');
    const isExternalUrl = currentApiBase && 
      currentApiBase !== '/api' && 
      (currentApiBase.startsWith('http://') || currentApiBase.startsWith('https://'));
    const isLocalhostUrl = currentApiBase && 
      (currentApiBase.includes('localhost') || currentApiBase.includes('127.0.0.1'));

    let misconfiguration: DiagnosticInfo['misconfiguration'] = { detected: false };
    
    if (isVercelDeployment && isExternalUrl) {
      misconfiguration = {
        detected: true,
        type: 'external_url_on_vercel',
        externalUrl: currentApiBase,
      };
    } else if (isVercelDeployment && isLocalhostUrl) {
      misconfiguration = {
        detected: true,
        type: 'localhost_in_production',
        externalUrl: currentApiBase,
      };
    }

    setDiagnostics((prev) => ({
      ...prev,
      envVars,
      apiBase: currentApiBase,
      candidates: getApiBaseCandidates(),
      misconfiguration,
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

    // Test API health and CORS, then check provider status
    const runDiagnostics = async () => {
      await testApiHealthAndCors();
      
      // Check provider status (note: provider metadata is only available in responses that require a budget_id)
      setDiagnostics((prev) => ({
        ...prev,
        providerStatus: {
          status: 'success',
          message:
            'Provider status is determined by Vercel environment variables. Check Vercel logs or API responses to verify.',
          clarificationProvider: 'Check Vercel logs',
          suggestionProvider: 'Check Vercel logs',
          aiEnabled: undefined,
        },
      }));
    };

    runDiagnostics();
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

      {/* Misconfiguration Warning */}
      {diagnostics.misconfiguration.detected && (
        <div className="card border-red-500/50 bg-red-500/20">
          <h3 className="text-xl font-semibold text-red-300 mb-3">
            Configuration Issue Detected
          </h3>
          {diagnostics.misconfiguration.type === 'external_url_on_vercel' && (
            <div className="space-y-3 text-sm">
              <p className="text-white">
                Your Vercel deployment is configured to use an external API URL instead of
                same-origin API routes. This is likely causing API calls to fail.
              </p>
              <div className="font-mono text-xs bg-black/30 p-2 rounded break-all">
                <span className="text-red-400">Current API URL:</span>{' '}
                <span className="text-white">{diagnostics.misconfiguration.externalUrl}</span>
              </div>
              <div className="mt-4">
                <p className="text-amber-300 font-semibold mb-2">To fix this issue:</p>
                <ol className="list-decimal list-inside space-y-2 text-white/90">
                  <li>Go to <strong>Vercel Dashboard</strong> → Your Project → <strong>Settings</strong> → <strong>Environment Variables</strong></li>
                  <li>Find and <strong>delete</strong> the <code className="bg-black/30 px-1 rounded">NEXT_PUBLIC_LIFEPATH_API_BASE_URL</code> variable</li>
                  <li><strong>Redeploy</strong> your application (this is required because NEXT_PUBLIC_* variables are embedded at build time)</li>
                </ol>
              </div>
              <p className="text-white/70 mt-3">
                The app will automatically use same-origin API routes (<code className="bg-black/30 px-1 rounded">/api/*</code>) 
                which is the correct configuration for Vercel deployments.
              </p>
            </div>
          )}
          {diagnostics.misconfiguration.type === 'localhost_in_production' && (
            <div className="space-y-3 text-sm">
              <p className="text-white">
                Your production deployment is configured to use a localhost API URL, which will not work.
              </p>
              <div className="font-mono text-xs bg-black/30 p-2 rounded break-all">
                <span className="text-red-400">Current API URL:</span>{' '}
                <span className="text-white">{diagnostics.misconfiguration.externalUrl}</span>
              </div>
              <div className="mt-4">
                <p className="text-amber-300 font-semibold mb-2">To fix this issue:</p>
                <ol className="list-decimal list-inside space-y-2 text-white/90">
                  <li>Go to <strong>Vercel Dashboard</strong> → Your Project → <strong>Settings</strong> → <strong>Environment Variables</strong></li>
                  <li>Find and <strong>delete</strong> any API base URL variables pointing to localhost</li>
                  <li><strong>Redeploy</strong> your application</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}

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
                  <li>API routes are not working (check Vercel logs)</li>
                  <li>Incorrect API base URL configured</li>
                  <li>Network connectivity issues</li>
                  <li>CORS blocking the request (if using external API)</li>
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
                {diagnostics.apiBase.startsWith('/api') ? (
                  <span>Using same-origin API routes - CORS should not be an issue.</span>
                ) : (
                  <span>
                    For external APIs, ensure CORS is configured on the backend to include:
                    <div className="font-mono text-emerald-400 mt-1">
                      {diagnostics.environment}
                    </div>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Provider Status */}
      <div className="card">
        <h3 className="text-xl font-semibold text-white mb-4">Backend Provider Status</h3>
        <div className="space-y-2">
          {diagnostics.providerStatus.status === 'not_checked' && (
            <div className="text-white/70">Provider status check not started</div>
          )}
          {diagnostics.providerStatus.status === 'checking' && (
            <div className="text-white/70">Checking provider configuration...</div>
          )}
          {diagnostics.providerStatus.status === 'success' && (
            <div>
              <div className="text-sm text-white/70 mb-3">
                {diagnostics.providerStatus.message}
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-white/50">To verify OpenAI is enabled:</span>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-white/80 ml-2">
                  <li>
                    <strong className="text-white">Check Diagnostics Endpoint:</strong> Visit{' '}
                    <a href="/api/diagnostics/env" className="text-emerald-400 underline" target="_blank">/api/diagnostics/env</a>
                    {' '}to see the current configuration.
                  </li>
                  <li>
                    <strong className="text-white">Check API Responses:</strong> When you use the
                    app, the API returns `provider_metadata` in responses. Look for:
                    <pre className="bg-white/5 p-2 rounded mt-1 text-xs overflow-auto">
                      {JSON.stringify(
                        {
                          provider_metadata: {
                            clarification_provider: 'openai',
                            suggestion_provider: 'openai',
                            ai_enabled: true,
                          },
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </li>
                </ol>
                <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded">
                  <div className="text-amber-300 font-semibold mb-1">Required Vercel Environment Variables:</div>
                  <ul className="text-xs text-white/80 space-y-1 font-mono">
                    <li>OPENAI_API_KEY=sk-...</li>
                    <li>OPENAI_MODEL=gpt-4o-mini (optional, defaults to gpt-4o-mini)</li>
                    <li>OPENAI_API_BASE=https://api.openai.com/v1 (optional)</li>
                    <li>POSTGRES_URL (optional, for persistent storage)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          {diagnostics.providerStatus.status === 'error' && (
            <div className="text-red-400">✗ {diagnostics.providerStatus.message}</div>
          )}
        </div>
      </div>

      {/* Architecture Info */}
      <div className="card border-emerald-500/30 bg-emerald-500/10">
        <h3 className="text-xl font-semibold text-emerald-300 mb-4">Vercel Serverless Architecture</h3>
        <div className="space-y-3 text-sm text-white/80">
          <p>
            This app uses Vercel Serverless Functions for the backend API. All API endpoints
            are served from the same origin, eliminating CORS issues.
          </p>
          <div className="mt-3">
            <strong className="text-white">API Endpoints:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1 font-mono text-xs">
              <li>/api/health - Health check</li>
              <li>/api/upload-budget - File upload and parsing</li>
              <li>/api/user-query - User query submission</li>
              <li>/api/clarification-questions - Generate questions</li>
              <li>/api/submit-answers - Submit answers</li>
              <li>/api/summary-and-suggestions - Get summary and AI suggestions</li>
              <li>/api/diagnostics/env - Environment diagnostics</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="card border-amber-500/30 bg-amber-500/10">
        <h3 className="text-xl font-semibold text-amber-300 mb-4">Troubleshooting Steps</h3>
        <ol className="space-y-3 text-sm text-white/80">
          <li>
            <strong className="text-white">1. Check API Health:</strong> If the health check
            fails, there may be an issue with the serverless function. Check the{' '}
            <a href="/api/health" className="text-emerald-400 underline" target="_blank">/api/health</a>
            {' '}endpoint directly.
          </li>
          <li>
            <strong className="text-white">2. Verify OpenAI Configuration:</strong> If AI features
            aren&apos;t working, check that OPENAI_API_KEY is set in Vercel Environment Variables.
            The app falls back to deterministic suggestions when OpenAI is not configured.
          </li>
          <li>
            <strong className="text-white">3. Check Diagnostics:</strong> Visit{' '}
            <a href="/api/diagnostics/env" className="text-emerald-400 underline" target="_blank">/api/diagnostics/env</a>
            {' '}to see the server-side configuration.
          </li>
          <li>
            <strong className="text-white">4. Database:</strong> For persistent storage, set up
            Vercel Postgres and add POSTGRES_URL to your environment variables. Without it,
            the app uses in-memory storage (data is lost on function cold starts).
          </li>
        </ol>
      </div>
    </div>
  );
}

