import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { BudgetSessionProvider } from '@/hooks/useBudgetSession';
import { FlowShell } from './FlowShell';

function SessionProviderFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-white/60">Loading...</div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<SessionProviderFallback />}>
      <BudgetSessionProvider>
        <FlowShell>{children}</FlowShell>
      </BudgetSessionProvider>
    </Suspense>
  );
}
