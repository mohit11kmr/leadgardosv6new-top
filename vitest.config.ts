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
    globalSetup: ['./tests/global-setup.ts'],
    // Integration tests share a Postgres DB, Redis, and in-memory singletons.
    // Run each test file sequentially to prevent cross-file state interference.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      ALLOW_LOCAL_FIXTURES: 'true',
      DATABASE_URL: 'postgresql://leadguard:leadguard@localhost:15432/leadguard',
      REDIS_URL: 'redis://localhost:16380',
      JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      REFRESH_TOKEN_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      APP_URL: 'http://localhost:5173',
      API_URL: 'http://localhost:4000',
      // Razorpay runs in MOCK mode by default so the full integration suite is
      // deterministic and free of external network/credential dependencies.
      // The real-sandbox test (live-razorpay.test.ts) opts into TEST mode only
      // when genuine (non-placeholder) credentials are present.
      PAYMENT_PROVIDER_MODE: 'MOCK',
      RAZORPAY_KEY_ID: 'rzp_test_placeholder_key_id',
      RAZORPAY_KEY_SECRET: 'placeholder_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'placeholder_webhook_secret',
    },
  },
});
