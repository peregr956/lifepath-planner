'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import type { UploadSummaryPreview } from '@/types';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { uploadBudget } from '@/utils/apiClient';

type UploadFormValues = {
  file: FileList | null;
};

export default function UploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { saveSession, session } = useBudgetSession();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<UploadFormValues>({
    defaultValues: {
      file: null,
    },
  });

  const mutation = useMutation({
    mutationFn: async (file: File) => uploadBudget(file),
    onSuccess: (response) => {
      saveSession({
        budgetId: response.budgetId,
        detectedFormat: response.detectedFormat ?? undefined,
        summaryPreview: response.summaryPreview ?? undefined,
        clarified: false,
      });
      queryClient.invalidateQueries({ queryKey: ['clarification-questions', response.budgetId] });
      queryClient.invalidateQueries({ queryKey: ['summary-and-suggestions', response.budgetId] });
      router.push('/clarify');
    },
  });

  const selectedFile = watch('file')?.item(0) ?? null;

  const onSubmit = handleSubmit(async (values) => {
    const file = values.file?.item(0);
    if (!file) {
      return;
    }
    await mutation.mutateAsync(file);
    reset();
  });

  const fileField = register('file', {
    validate: (value) => (value && value.length > 0) || 'Select a budget file to continue.',
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={onSubmit} className="card flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Upload your budget export</h2>
          <p className="mt-1 text-sm text-white/70">
            Budgets route through the ApiClient gateway so ingestion, clarification, and optimization
            services can stay in sync.
          </p>
        </div>

        <label
          htmlFor="budget-upload"
          className="inline-flex cursor-pointer flex-col rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-center transition hover:border-indigo-300"
        >
          <span className="text-sm font-semibold text-white">
            {selectedFile ? selectedFile.name : 'Drag & drop or click to choose a file'}
          </span>
          <span className="mt-1 text-xs text-white/60">Supports CSV, XLSX, XLS, or JSON exports.</span>
          <input
            id="budget-upload"
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            className="hidden"
            name={fileField.name}
            ref={fileField.ref}
            onBlur={fileField.onBlur}
            onChange={(event) => {
              const files = event.target.files;
              fileField.onChange(files);
            }}
            disabled={mutation.isPending}
          />
        </label>

        {errors.file && (
          <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-100">{errors.file.message}</p>
        )}

        {mutation.error && (
          <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-100">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Upload failed. Ensure the API gateway is reachable.'}
          </p>
        )}

        <div className="flex flex-col gap-2 text-xs text-white/60">
          <p>
            Files are uploaded via the ApiClient wrapper so environment-specific base URLs and request
            timeouts stay consistent with the rest of the repo.
          </p>
          <p>
            We keep the lightweight metadata (budget id, detected format, preview counts) in both the URL
            params and localStorage for resumable sessions.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/30"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Uploading…' : 'Continue to clarifications'}
          </button>
        </div>
      </form>

      <aside className="card flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Latest upload metadata</h2>
          <p className="text-sm text-white/70">
            Mirrors the Streamlit UI&apos;s upload summary so teams can cross-check parsing results.
          </p>
        </div>
        <MetadataList
          budgetId={session?.budgetId ?? null}
          detectedFormat={session?.detectedFormat ?? null}
          preview={session?.summaryPreview ?? null}
        />
      </aside>
    </div>
  );
}

function MetadataList({
  budgetId,
  detectedFormat,
  preview,
}: {
  budgetId: string | null;
  detectedFormat: string | null | undefined;
  preview: UploadSummaryPreview | null | undefined;
}) {
  if (!budgetId) {
    return (
      <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
        Upload a file to see the detected format plus the summary preview counts reported by the ingestion
        service.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white">
      <p>
        <span className="text-white/60">Budget ID:</span>{' '}
        <span className="font-semibold text-white">{budgetId}</span>
      </p>
      <p className="mt-2">
        <span className="text-white/60">Detected format:</span>{' '}
        <span className="font-semibold text-white">{detectedFormat ?? 'pending'}</span>
      </p>
      {preview ? (
        <p className="mt-2 text-white/80">
          {preview.detectedIncomeLines} income lines · {preview.detectedExpenseLines} expense lines
        </p>
      ) : (
        <p className="mt-2 text-white/60">Waiting for preview counts from ingestion.</p>
      )}
    </div>
  );
}
