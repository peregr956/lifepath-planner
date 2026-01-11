'use client';

import { useEffect, useState } from 'react';
import { useApiBase } from '@/utils/apiClient';
import { getActiveApiBase, getApiBaseCandidates } from '@/utils/apiClient';

type AIStatusResponse = {
  status: 'ok' | 'issues_found';
  issues: string[];
  required_variables: Record<string, { key: string; is_set: boolean; value?: string }>;
  optional_variables: Record<string, { key: string; is_set: boolean; value?: string }>;
  provider_metadata: {
    clarification_provider: string;
    suggestion_provider: string;
    ai_enabled: boolean;
    ai_gateway_enabled: boolean;
    model: string;
    used_deterministic: boolean;
  };
  runtime: string;
  architecture: string;
};

type DiagnosticInfo = {
  environment: string;
  apiBase: string;
  candidates: string[];
  apiHealth: {
    status: 'checking' | 'success' | 'error';
    message?: string;
    response?: unknown;
  };
  corsTest: {
    status: 'checking' | 'success' | 'error';
    message?: string;
  };
  aiStatus: {
    status: 'checking' | 'success' | 'error';
    message?: string;
    data?: AIStatusResponse;
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
    apiHealth: { status: 'checking' },
    corsTest: { status: 'checking' },
    aiStatus: { status: 'checking' },
    misconfiguration: { detected: false },
  });

  useEffect(() => {
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

    // Check AI status from the diagnostics endpoint
    const checkAIStatus = async () => {
      const baseUrl = getActiveApiBase();
      
      try {
        const response = await fetch(`${baseUrl}/diagnostics/env`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const data: AIStatusResponse = await response.json();
          setDiagnostics((prev) => ({
            ...prev,
            aiStatus: {
              status: 'success',
              data,
            },
          }));
        } else {
          setDiagnostics((prev) => ({
            ...prev,
            aiStatus: {
              status: 'error',
              message: `Failed to fetch AI status: ${response.status} ${response.statusText}`,
            },
          }));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setDiagnostics((prev) => ({
          ...prev,
          aiStatus: {
            status: 'error',
            message: `Failed to check AI status: ${errorMessage}`,
          },
        }));
      }
    };

    // Run all diagnostics
    const runDiagnostics = async () => {
      await Promise.all([testApiHealthAndCors(), checkAIStatus()]);
    };

    runDiagnostics();
  }, [activeApiBase, candidates]);

  const aiData = diagnostics.aiStatus.data;
  const aiEnabled = aiData?.provider_metadata?.ai_enabled ?? false;

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

      {/* AI Status - Primary section */}
      <div className={`card ${aiEnabled ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-amber-500/50 bg-amber-500/10'}`}>
        <h3 className={`text-xl font-semibold mb-4 ${aiEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
          AI Status
        </h3>
        <div className="space-y-3">
          {diagnostics.aiStatus.status === 'checking' && (
            <div className="text-white/70">Checking AI configuration...</div>
          )}
          {diagnostics.aiStatus.status === 'error' && (
            <div>
              <div className="text-red-400 mb-2">Unable to check AI status: {diagnostics.aiStatus.message}</div>
            </div>
          )}
          {diagnostics.aiStatus.status === 'success' && aiData && (
            <div className="space-y-4">
              {/* Main status indicator */}
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${aiEnabled ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={`font-medium ${aiEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {aiEnabled ? 'AI is enabled and working' : 'AI is disabled (using deterministic fallback)'}
                </span>
              </div>

              {/* Provider details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white/50 mb-1">Clarification Provider:</div>
                  <div className={`font-mono ${aiData.provider_metadata.clarification_provider === 'openai' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {aiData.provider_metadata.clarification_provider}
                  </div>
                </div>
                <div>
                  <div className="text-white/50 mb-1">Suggestion Provider:</div>
                  <div className={`font-mono ${aiData.provider_metadata.suggestion_provider === 'openai' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {aiData.provider_metadata.suggestion_provider}
                  </div>
                </div>
                <div>
                  <div className="text-white/50 mb-1">Model:</div>
                  <div className="font-mono text-white">
                    {aiData.provider_metadata.model}
                  </div>
                </div>
                <div>
                  <div className="text-white/50 mb-1">AI Gateway:</div>
                  <div className={`font-mono ${aiData.provider_metadata.ai_gateway_enabled ? 'text-emerald-400' : 'text-white/60'}`}>
                    {aiData.provider_metadata.ai_gateway_enabled ? 'Enabled' : 'Not enabled'}
                  </div>
                </div>
              </div>

              {/* Issues */}
              {aiData.issues && aiData.issues.length > 0 && (
                <div className="mt-3 p-3 bg-black/30 rounded">
                  <div className="text-amber-300 font-semibold mb-2">Configuration Notes:</div>
                  <ul className="space-y-1 text-sm text-white/80">
                    {aiData.issues.map((issue, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-400">•</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key variables status */}
              <div className="mt-3">
                <div className="text-white/50 text-sm mb-2">Key Environment Variables:</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className={aiData.required_variables?.OPENAI_API_KEY?.is_set ? 'text-emerald-400' : 'text-red-400'}>
                      {aiData.required_variables?.OPENAI_API_KEY?.is_set ? '✓' : '✗'}
                    </span>
                    <span className="text-white/70">OPENAI_API_KEY</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={aiData.required_variables?.OPENAI_MODEL?.is_set ? 'text-emerald-400' : 'text-white/50'}>
                      {aiData.required_variables?.OPENAI_MODEL?.is_set ? '✓' : '○'}
                    </span>
                    <span className="text-white/70">OPENAI_MODEL</span>
                    {!aiData.required_variables?.OPENAI_MODEL?.is_set && (
                      <span className="text-white/40">(defaults to gpt-4o)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={aiData.required_variables?.POSTGRES_URL?.is_set ? 'text-emerald-400' : 'text-white/50'}>
                      {aiData.required_variables?.POSTGRES_URL?.is_set ? '✓' : '○'}
                    </span>
                    <span className="text-white/70">POSTGRES_URL</span>
                    {!aiData.required_variables?.POSTGRES_URL?.is_set && (
                      <span className="text-white/40">(using in-memory)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Help for disabled AI */}
              {!aiEnabled && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
                  <div className="text-amber-300 font-semibold mb-2">To enable AI features:</div>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-white/80">
                    <li>Go to <strong className="text-white">Vercel Dashboard</strong> → Your Project → <strong className="text-white">Settings</strong> → <strong className="text-white">Environment Variables</strong></li>
                    <li>Add <code className="bg-black/30 px-1 rounded">OPENAI_API_KEY</code> with your OpenAI API key</li>
                    <li><strong className="text-white">Redeploy</strong> your application</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
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
