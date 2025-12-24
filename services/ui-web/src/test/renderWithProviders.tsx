/**
 * Test utility for rendering components with all required providers.
 */

import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { ApiBaseProvider } from '@/utils/apiClient';

type WrapperProps = {
  children: ReactNode;
};

/**
 * Creates a fresh QueryClient configured for testing.
 */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Creates a wrapper component with all providers.
 */
function createWrapper(queryClient?: QueryClient) {
  const client = queryClient ?? createTestQueryClient();

  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={client}>
        <ApiBaseProvider>{children}</ApiBaseProvider>
      </QueryClientProvider>
    );
  };
}

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  queryClient?: QueryClient;
};

/**
 * Renders a component with all providers for testing.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {},
) {
  const { queryClient, ...renderOptions } = options;
  const Wrapper = createWrapper(queryClient);

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient: queryClient ?? createTestQueryClient(),
  };
}

/**
 * Creates a test query client for use in tests.
 */
export { createTestQueryClient };

