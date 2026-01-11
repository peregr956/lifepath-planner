'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { uploadBudget } from '@/utils/apiClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from 'lucide-react';

type UploadFormValues = {
  file: File | null;
};

function getFileIcon(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'csv':
      return <FileSpreadsheet className="h-8 w-8 text-success" />;
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="h-8 w-8 text-success" />;
    default:
      return <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function UploadPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { saveSession, session, hydrated } = useBudgetSession();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Track when we should navigate after successful upload
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const navigationAttemptedRef = useRef(false);

  const {
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

  // Navigate to clarify once session is hydrated with the new budgetId
  useEffect(() => {
    if (!pendingNavigation || !hydrated || navigationAttemptedRef.current) return;
    
    // Check if session has the budgetId we're waiting for
    if (session?.budgetId === pendingNavigation) {
      navigationAttemptedRef.current = true;
      router.push('/clarify');
    }
  }, [pendingNavigation, session?.budgetId, hydrated, router]);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      // Simulate progress for better UX
      setUploadProgress(10);
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      try {
        const result = await uploadBudget(file);
        clearInterval(progressInterval);
        setUploadProgress(100);
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        setUploadProgress(0);
        throw error;
      }
    },
    onSuccess: async (response) => {
      // Save session first
      saveSession({
        budgetId: response.budgetId,
        detectedFormat: response.detectedFormat ?? undefined,
        summaryPreview: response.summaryPreview ?? undefined,
        clarified: false,
      });
      
      // Invalidate queries for the new budget
      await queryClient.invalidateQueries({ queryKey: ['clarification-questions', response.budgetId] });
      await queryClient.invalidateQueries({ queryKey: ['summary-and-suggestions', response.budgetId] });

      // Set pending navigation - the useEffect will handle actual navigation
      // once the session is confirmed to be updated
      setPendingNavigation(response.budgetId);
      
      // Also try immediate navigation as a fallback
      router.push('/clarify');
    },
    onError: () => {
      setUploadProgress(0);
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        const validTypes = [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        const validExtensions = ['.csv', '.xls', '.xlsx'];
        const hasValidExtension = validExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext)
        );

        if (validTypes.includes(file.type) || hasValidExtension) {
          setValue('file', file, { shouldDirty: true, shouldValidate: true });
        }
      }
    },
    [setValue]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.item(0) ?? null;
      setValue('file', file, { shouldDirty: true, shouldValidate: true });
    },
    [setValue]
  );

  const clearFile = useCallback(() => {
    setValue('file', null, { shouldDirty: true, shouldValidate: true });
    setUploadProgress(0);
  }, [setValue]);

  return (
    <div className="mx-auto max-w-xl animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Upload your budget</CardTitle>
          <CardDescription>
            Share the spreadsheet you already use to track your finances. We&apos;ll analyze it and
            help you make better decisions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            {/* Drop zone */}
            {!selectedFile ? (
              <label
                htmlFor="budget-upload"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200',
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50',
                  mutation.isPending && 'pointer-events-none opacity-50'
                )}
              >
                <div
                  className={cn(
                    'mb-4 rounded-full p-4 transition-colors',
                    isDragging ? 'bg-primary/20' : 'bg-muted group-hover:bg-primary/10'
                  )}
                >
                  <Upload
                    className={cn(
                      'h-8 w-8 transition-colors',
                      isDragging ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
                    )}
                  />
                </div>
                <span className="text-base font-semibold text-foreground">
                  {isDragging ? 'Drop your file here' : 'Drag & drop or click to choose a file'}
                </span>
                <span className="mt-2 text-sm text-muted-foreground">
                  We support CSV and Excel files from most budgeting tools
                </span>
                <div className="mt-4 flex gap-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    .csv
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    .xlsx
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    .xls
                  </span>
                </div>
                <input
                  id="budget-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={mutation.isPending}
                />
              </label>
            ) : (
              /* Selected file display */
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-4">
                  {getFileIcon(selectedFile.name)}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  {!mutation.isPending && !mutation.isSuccess && (
                    <button
                      type="button"
                      onClick={clearFile}
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove file</span>
                    </button>
                  )}
                  {mutation.isSuccess && <CheckCircle2 className="h-6 w-6 text-success" />}
                </div>

                {/* Upload progress */}
                {mutation.isPending && (
                  <div className="mt-4">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                      Analyzing your budget...
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Validation error */}
            {errors.file && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{errors.file.message}</p>
              </div>
            )}

            {/* API error */}
            {mutation.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive">Upload failed</p>
                    <p className="mt-1 text-sm text-destructive/80">
                      {mutation.error instanceof Error
                        ? mutation.error.message
                            .replace(/gateway/gi, 'server')
                            .replace(/ApiClient/gi, '')
                        : 'Please check your connection and try again.'}
                    </p>
                    {mutation.error instanceof Error &&
                      (mutation.error.message.includes('Unable to reach') ||
                        mutation.error.message.includes('localhost') ||
                        mutation.error.message.includes('127.0.0.1')) && (
                        <p className="mt-2 text-xs text-destructive/70">
                          Tip: Make sure the API is working correctly. Check Vercel logs for any
                          server-side errors. In local development, ensure the server is running.
                        </p>
                      )}
                  </div>
                </div>
              </div>
            )}

            {/* Submit button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                size="lg"
                disabled={mutation.isPending || !selectedFile}
                loading={mutation.isPending}
              >
                {mutation.isPending ? 'Processing...' : 'Continue'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
