import type { ReactNode } from 'react';
import { BudgetSessionProvider } from '@/hooks/useBudgetSession';
import { FlowShell } from './FlowShell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <BudgetSessionProvider>
      <FlowShell>{children}</FlowShell>
    </BudgetSessionProvider>
  );
}
