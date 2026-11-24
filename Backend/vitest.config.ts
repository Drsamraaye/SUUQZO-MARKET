import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Integration tests hit live Supabase — allow up to 30s per test and 20s for hooks
    testTimeout: 90000,
    hookTimeout: 90000,
    fileParallelism: false,
  },
});
