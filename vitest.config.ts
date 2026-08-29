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
    env: {
      NODE_ENV: 'test',
      ALLOW_LOCAL_FIXTURES: 'true',
      DATABASE_URL: 'postgresql://leadguard:leadguard@localhost:15432/leadguard',
      REDIS_URL: 'redis://localhost:16380',
      JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      REFRESH_TOKEN_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      APP_URL: 'http://localhost:5173',
      API_URL: 'http://localhost:4000',
      // Razorpay TEST-mode placeholders so the config schema loads in tests.
      // These are test-only fixtures and are never used in production code paths.
      PAYMENT_PROVIDER_MODE: 'TEST',
      RAZORPAY_KEY_ID: 'rzp_test_placeholder_key_id',
      RAZORPAY_KEY_SECRET: 'placeholder_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'placeholder_webhook_secret',
    },
  },
});
