'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { uploadBudget } from '@/utils/apiClient';

type UploadFormValues = {
  file: File | null;
};

export default function UploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { saveSession } = useBudgetSession();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
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

  const selectedFile = watch('file');

  const onSubmit = handleSubmit(async (values) => {
    const file = values.file;
    if (!file) {
      return;
    }
    await mutation.mutateAsync(file);
    reset();
  });

  const fileField = register('file', {
    validate: (value) => Boolean(value) || 'Select a budget file to continue.',
  });

  return (
    <div className="mx-auto max-w-xl">
      <form onSubmit={onSubmit} className="card flex flex-col gap-5">
        <div>
          <h2 className="text-2xl font-semibold text-white">Upload your budget</h2>
          <p className="mt-1 text-sm text-white/70">
            Share the spreadsheet you already use to track your finances. We&apos;ll analyze it and
            help you make better decisions.
          </p>
        </div>

        <label
          htmlFor="budget-upload"
          className="inline-flex cursor-pointer flex-col rounded-xl border border-dashed border-white/20 bg-white/5 px-6 py-8 text-center transition hover:border-indigo-300 hover:bg-white/10"
        >
          <span className="text-base font-semibold text-white">
            {selectedFile ? selectedFile.name : 'Drag & drop or click to choose a file'}
          </span>
          <span className="mt-2 text-sm text-white/60">
            We support CSV and Excel files from most budgeting tools
          </span>
          <input
            id="budget-upload"
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            className="hidden"
            name={fileField.name}
            ref={fileField.ref}
            onBlur={fileField.onBlur}
            onChange={(event) => {
              const file = event.target.files?.item(0) ?? null;
              setValue('file', file, { shouldDirty: true, shouldValidate: true });
            }}
            disabled={mutation.isPending}
          />
        </label>

        {errors.file && (
          <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-100">
            {errors.file.message}
          </p>
        )}

        {mutation.error && (
          <p className="rounded bg-red-500/20 px-3 py-2 text-sm text-red-100">
            {mutation.error instanceof Error
              ? mutation.error.message.replace(/gateway/gi, 'server').replace(/ApiClient/gi, '')
              : 'Upload failed. Please check your connection and try again.'}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-white/30"
            disabled={mutation.isPending || !selectedFile}
          >
            {mutation.isPending ? 'Processing…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
