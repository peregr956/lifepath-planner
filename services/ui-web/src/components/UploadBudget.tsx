'use client';

import { useState } from 'react';
import type { UploadBudgetResponse } from '@/types';
import { uploadBudget } from '@/utils/apiClient';

type Props = {
  onUploaded?: (response: UploadBudgetResponse) => void;
};

export function UploadBudget({ onUploaded }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading'>('idle');
  const [result, setResult] = useState<UploadBudgetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('uploading');
    setError(null);
    setResult(null);
    try {
      const response = await uploadBudget(file);
      setResult(response);
      onUploaded?.(response);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Upload failed. Ensure the API gateway is reachable.'
      );
    } finally {
      setStatus('idle');
      event.target.value = '';
    }
  }

  return (
    <div className="card flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Upload a budget</h2>
        <p className="text-sm text-white/70">
          Supports CSV or XLSX exports. Files route through the ingestion service for parsing.
        </p>
      </div>
      <label className="inline-flex cursor-pointer flex-col rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-center transition hover:border-indigo-300">
        <span className="text-sm font-semibold text-white">
          {status === 'uploading' ? 'Uploading…' : 'Choose a file'}
        </span>
        <span className="mt-1 text-xs text-white/60">
          Drag & drop or click to browse your local files.
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          className="hidden"
          onChange={handleChange}
          disabled={status === 'uploading'}
        />
      </label>
      {error && <p className="rounded bg-red-500/20 px-3 py-2 text-xs text-red-100">{error}</p>}
      {result && (
        <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/80">
          <p>
            <span className="font-semibold text-white">Budget ID:</span> {result.budgetId}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-white">Status:</span> {result.status}
          </p>
          {result.detectedFormat && (
            <p className="mt-1">
              <span className="font-semibold text-white">Detected format:</span>{' '}
              {result.detectedFormat}
            </p>
          )}
          {result.summaryPreview && (
            <p className="mt-1 text-white/70">
              {result.summaryPreview.detectedIncomeLines} income lines ·{' '}
              {result.summaryPreview.detectedExpenseLines} expense lines
            </p>
          )}
        </div>
      )}
    </div>
  );
}
