'use client';

import { useState, useEffect, useCallback } from 'react';
import type { UploadSummaryPreview } from '@/types';
import { useApiBase } from '@/utils/apiClient';

const isDev = process.env.NODE_ENV === 'development';

type SessionData = {
  budgetId?: string;
  detectedFormat?: string;
  summaryPreview?: UploadSummaryPreview;
  clarified?: boolean;
  readyForSummary?: boolean;
  userQuery?: string;
};

type Props = {
  session: SessionData | null;
  onClearSession?: () => void;
};

export function DeveloperPanel({ session, onClearSession }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { activeApiBase, candidates, setActiveApiBase, addCandidate } = useApiBase();
  const [customUrl, setCustomUrl] = useState('');

  // Toggle panel with Ctrl+Shift+D
  useEffect(() => {
    if (!isDev) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddUrl = useCallback(() => {
    if (customUrl.trim()) {
      addCandidate(customUrl.trim());
      setCustomUrl('');
    }
  }, [customUrl, addCandidate]);

  // Don't render anything in production
  if (!isDev) return null;

  // Show minimal trigger when closed
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 opacity-50 transition hover:opacity-100"
        title="Open Developer Panel (Ctrl+Shift+D)"
      >
        DEV
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 rounded-xl border border-amber-500/30 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-300">Developer Panel</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-amber-300/70 hover:text-amber-300"
        >
          Close (Ctrl+Shift+D)
        </button>
      </div>

      <div className="space-y-4 text-xs">
        {/* Session Info */}
        <div>
          <p className="mb-2 font-medium uppercase tracking-wide text-white/60">Session</p>
          {session?.budgetId ? (
            <div className="space-y-1 font-mono text-white/80">
              <p>
                <span className="text-white/50">Budget ID:</span> {session.budgetId}
              </p>
              <p>
                <span className="text-white/50">Format:</span> {session.detectedFormat ?? 'Unknown'}
              </p>
              <p>
                <span className="text-white/50">Clarified:</span> {session.clarified ? 'Yes' : 'No'}
              </p>
              <p>
                <span className="text-white/50">Ready for Summary:</span>{' '}
                {session.readyForSummary ? 'Yes' : 'No'}
              </p>
              {session.summaryPreview && (
                <p>
                  <span className="text-white/50">Preview:</span>{' '}
                  {session.summaryPreview.detectedIncomeLines} income,{' '}
                  {session.summaryPreview.detectedExpenseLines} expenses
                </p>
              )}
              {session.userQuery && (
                <p>
                  <span className="text-white/50">Query:</span> {session.userQuery}
                </p>
              )}
            </div>
          ) : (
            <p className="text-white/50">No active session</p>
          )}
          {onClearSession && session?.budgetId && (
            <button
              type="button"
              onClick={onClearSession}
              className="mt-2 text-red-400 hover:text-red-300"
            >
              Clear Session
            </button>
          )}
        </div>

        {/* API Gateway */}
        <div>
          <p className="mb-2 font-medium uppercase tracking-wide text-white/60">API Gateway</p>
          <p className="mb-2 font-mono text-emerald-400">{activeApiBase}</p>

          <div className="space-y-1">
            <p className="text-white/50">Available endpoints:</p>
            {candidates.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => setActiveApiBase(url)}
                className={`block w-full rounded px-2 py-1 text-left font-mono transition ${
                  url === activeApiBase
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                {url}
              </button>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Add custom URL..."
              className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-white placeholder:text-white/30"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              disabled={!customUrl.trim()}
              className="rounded bg-indigo-500/30 px-2 py-1 text-indigo-300 hover:bg-indigo-500/50 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <p className="mb-2 font-medium uppercase tracking-wide text-white/60">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.localStorage.clear()}
              className="rounded bg-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/30"
            >
              Clear localStorage
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded bg-white/10 px-2 py-1 text-white/70 hover:bg-white/20"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


