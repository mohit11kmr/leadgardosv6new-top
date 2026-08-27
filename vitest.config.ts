import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
      'packages/**/src/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
