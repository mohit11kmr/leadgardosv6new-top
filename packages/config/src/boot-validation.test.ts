import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// Runs config loading in a fresh child process for each scenario (rather
// than mutating the shared test process's env, which config.ts reads once
// at import time) — this is the only reliable way to exercise "does the
// process actually fail to boot" without corrupting the rest of the suite's
// environment.
const distEntry = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'index.js'
);

const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://leadguard:leadguard@localhost:15432/leadguard',
  REDIS_URL: 'redis://localhost:16380',
  JWT_SECRET: 'a'.repeat(32),
  REFRESH_TOKEN_SECRET: 'b'.repeat(32),
  WEBHOOK_SECRET_ENCRYPTION_KEY: 'c'.repeat(64),
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:4000',
  RAZORPAY_KEY_ID: 'rzp_test_x',
  RAZORPAY_KEY_SECRET: 'x',
};

function bootsWith(overrides: Record<string, string>): { ok: boolean; stderr: string } {
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', `import('${distEntry.replace(/\\/g, '/')}')`], {
      env: { ...REQUIRED_ENV, ...overrides },
      // Run from a directory with no .env file — config.ts's dotenv.config()
      // calls fall back to reading .env files off disk for any var not
      // explicitly in `env` above, which would otherwise leak this repo's
      // real root .env into what's meant to be an isolated boot scenario.
      cwd: os.tmpdir(),
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 10_000,
    });
    return { ok: true, stderr: '' };
  } catch (err: any) {
    return { ok: false, stderr: (err.stderr ?? '').toString() };
  }
}

describe('config boot validation (fail fast on cross-field misconfiguration)', () => {
  it('boots cleanly with only the required vars set (everything else defaulted)', () => {
    const result = bootsWith({});
    expect(result.ok).toBe(true);
  }, 15_000);

  it('refuses to boot with EMAIL_PROVIDER=SMTP and no SMTP_HOST/SMTP_USER/SMTP_PASS', () => {
    const result = bootsWith({ EMAIL_PROVIDER: 'SMTP' });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('EMAIL_PROVIDER');
  }, 15_000);

  it('boots with EMAIL_PROVIDER=SMTP when SMTP_HOST/SMTP_USER/SMTP_PASS are all set', () => {
    const result = bootsWith({
      EMAIL_PROVIDER: 'SMTP',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
    });
    expect(result.ok).toBe(true);
  }, 15_000);

  it('refuses to boot with AI_PROVIDER=GEMINI and no GEMINI_API_KEY', () => {
    const result = bootsWith({ AI_PROVIDER: 'GEMINI' });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('AI_PROVIDER');
  }, 15_000);

  it('refuses to boot with REPORT_STORAGE=S3 and no S3 credentials (the audit finding this closes)', () => {
    const result = bootsWith({ REPORT_STORAGE: 'S3' });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('REPORT_STORAGE');
  }, 15_000);

  it('boots with REPORT_STORAGE=S3 when S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are set', () => {
    const result = bootsWith({
      REPORT_STORAGE: 'S3',
      S3_ACCESS_KEY_ID: 'AKIAFAKE',
      S3_SECRET_ACCESS_KEY: 'fake-secret',
    });
    expect(result.ok).toBe(true);
  }, 15_000);

  it('refuses to boot with a malformed WEBHOOK_SECRET_ENCRYPTION_KEY (not 64 hex chars)', () => {
    const result = bootsWith({ WEBHOOK_SECRET_ENCRYPTION_KEY: 'too-short' });
    expect(result.ok).toBe(false);
  }, 15_000);
});
