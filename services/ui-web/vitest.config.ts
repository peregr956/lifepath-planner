import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    pool: 'threads',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1,
      },
    },
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
