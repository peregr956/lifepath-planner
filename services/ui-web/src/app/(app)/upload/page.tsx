'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBudgetSession } from '@/hooks/useBudgetSession';
import { uploadBudget } from '@/utils/apiClient';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, PenLine, ArrowRight } from 'lucide-react';

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
    <div className="mx-auto max-w-2xl animate-fade-in">
      {/* Entry Point Choice */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Get Started</h1>
        <p className="mt-2 text-muted-foreground">
          Choose how you&apos;d like to set up your financial plan
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Option 1: Build from Scratch */}
        <Link href={"/build" as any} className="group">
          <Card className="h-full transition-all hover:border-primary hover:shadow-md">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <PenLine className="h-6 w-6" />
              </div>
              <CardTitle className="flex items-center justify-between">
                Build from Scratch
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardTitle>
              <CardDescription>
                Don&apos;t have a budget yet? We&apos;ll guide you through creating one step by step.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Enter your income and expenses</li>
                <li>• Add debts and savings goals</li>
                <li>• Get instant financial insights</li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        {/* Option 2: Upload Existing */}
        <Card className="h-full">
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Upload Existing Budget</CardTitle>
            <CardDescription>
              Already tracking your finances? Upload your spreadsheet and we&apos;ll analyze it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              {/* Drop zone */}
              {!selectedFile ? (
                <label
                  htmlFor="budget-upload"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    'group relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-all duration-200',
                    isDragging
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50',
                    mutation.isPending && 'pointer-events-none opacity-50'
                  )}
                >
                  <FileSpreadsheet
                    className={cn(
                      'mb-2 h-8 w-8 transition-colors',
                      isDragging ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {isDragging ? 'Drop here' : 'Drop file or click to browse'}
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    CSV, XLS, XLSX
                  </span>
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
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    {getFileIcon(selectedFile.name)}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                    {!mutation.isPending && !mutation.isSuccess && (
                      <button
                        type="button"
                        onClick={clearFile}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Remove file</span>
                      </button>
                    )}
                    {mutation.isSuccess && <CheckCircle2 className="h-5 w-5 text-success" />}
                  </div>

                  {/* Upload progress */}
                  {mutation.isPending && (
                    <div className="mt-3">
                      <Progress value={uploadProgress} className="h-1.5" />
                      <p className="mt-1.5 text-center text-xs text-muted-foreground">
                        Analyzing...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Validation error */}
              {errors.file && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <p>{errors.file.message}</p>
                </div>
              )}

              {/* API error */}
              {mutation.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="text-xs font-medium text-destructive">Upload failed</p>
                      <p className="mt-0.5 text-xs text-destructive/80">
                        {mutation.error instanceof Error
                          ? mutation.error.message
                              .replace(/gateway/gi, 'server')
                              .replace(/ApiClient/gi, '')
                          : 'Please try again.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit button */}
              {selectedFile && (
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  loading={mutation.isPending}
                  className="w-full"
                >
                  {mutation.isPending ? 'Processing...' : 'Analyze Budget'}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
