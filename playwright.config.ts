import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev --workspace @leadguard/api',
      url: 'http://localhost:4000/health',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        ALLOW_LOCAL_FIXTURES: 'true',
        DATABASE_URL: 'postgresql://leadguard:leadguard@localhost:15432/leadguard',
        REDIS_URL: 'redis://localhost:16380',
        JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        REFRESH_TOKEN_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        APP_URL: 'http://localhost:5173',
        API_URL: 'http://localhost:4000',
      },
    },
    {
      command: 'npm run dev --workspace @leadguard/web',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
    },
  ],
});
