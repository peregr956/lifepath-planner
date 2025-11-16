'use client';

import { useState } from 'react';
import { uploadBudgetFile } from '@/utils/apiClient';

type Props = {
  onUploaded?: (message: string) => void;
};

export function UploadBudget({ onUploaded }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('uploading');
    setFeedback(null);
    const { message } = await uploadBudgetFile(file);
    setFeedback(message);
    onUploaded?.(message);
    setStatus('idle');
    event.target.value = '';
  }

  return (
    <div className="card flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold text-white">Upload a budget</h2>
        <p className="text-sm text-white/70">
          Supports CSV, XLSX, or JSON exports from the budgeting service.
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
      {feedback && <p className="text-xs text-emerald-200">{feedback}</p>}
    </div>
  );
}
