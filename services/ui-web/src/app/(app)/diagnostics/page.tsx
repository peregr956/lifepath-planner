'use client';

import { useState, useEffect } from 'react';

interface ApiHealthDiagnostic {
  message: string;
  response?: unknown;
}

interface Diagnostics {
  apiHealth: ApiHealthDiagnostic;
}

export default function DiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  useEffect(() => {
    // Fetch diagnostics - placeholder implementation
    // This would typically fetch from an API
    setDiagnostics({
      apiHealth: {
        message: 'API is healthy',
        response: { status: 'ok' },
      },
    });
  }, []);

  if (!diagnostics) {
    return <div>Loading diagnostics...</div>;
  }

  return (
    <div>
      <div>
        <div className="text-emerald-400 mb-2">✓ {diagnostics.apiHealth.message}</div>
        {diagnostics.apiHealth.response != null && (
          <pre className="text-xs bg-white/5 p-2 rounded overflow-auto">
            {JSON.stringify(diagnostics.apiHealth.response, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
