import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env from current directory or root directory
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // SSRF escape hatch: only honored outside production (see url-security).
    ALLOW_LOCAL_FIXTURES: z
      .string()
      .optional()
      .refine((v) => v === undefined || v === 'true', {
        message: 'ALLOW_LOCAL_FIXTURES must be "true" or unset',
      }),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    REFRESH_TOKEN_SECRET: z.string().min(32),
    // 64-char hex (32-byte) key used to encrypt webhook HMAC secrets at rest.
    WEBHOOK_SECRET_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'WEBHOOK_SECRET_ENCRYPTION_KEY must be a 64-character hex string'),
    APP_URL: z.string().url(),
    API_URL: z.string().url(),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    // Optional Domain= attribute for the refresh-token cookie, for sharing it
    // across subdomains (e.g. "leadguard.io" so app.leadguard.io and
    // api.leadguard.io both see it). Omitted by default (host-only cookie).
    COOKIE_DOMAIN: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
    MAX_PAGES_PER_AUDIT: z.coerce.number().int().positive().max(100).default(10),
    MAX_CRAWL_DEPTH: z.coerce.number().int().min(0).max(5).default(2),
    DEFAULT_MONTHLY_VISITORS: z.coerce.number().nonnegative().default(0),
    DEFAULT_CONVERSION_RATE: z.coerce.number().nonnegative().max(100).default(0),
    DEFAULT_AVERAGE_LEAD_VALUE: z.coerce.number().nonnegative().default(0),
    // Phase 5.1 Payment & Billing Configurations
    PAYMENT_PROVIDER_MODE: z.enum(['MOCK', 'TEST', 'LIVE']).default('MOCK'),
    RAZORPAY_KEY_ID: z.string().min(1),
    RAZORPAY_KEY_SECRET: z.string().min(1),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    // Monitoring Configurations
    MONITOR_CRAWL_CONCURRENCY: z.coerce.number().int().positive().max(10).default(3),
    MONITOR_MANUAL_RUN_RATE_LIMIT: z.coerce.number().positive().default(10),
    MONITOR_SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    MONITOR_RETENTION_INTERVAL_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
    MONITOR_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    // Rate Limiting Configurations
    AUTH_RATE_LIMIT: z.coerce.number().positive().default(20),
    AUDIT_RATE_LIMIT: z.coerce.number().positive().default(30),
    API_RATE_LIMIT: z.coerce.number().positive().default(150),
    WEBHOOK_RATE_LIMIT: z.coerce.number().positive().default(100),
    // Guest Scan Configuration
    SYSTEM_GUEST_ORGANIZATION_ID: z.string().uuid().optional(),
    SYSTEM_GUEST_ORGANIZATION_NAME: z.string().default('LeadGuard Guest Scans'),
    // Trust Proxy Configuration
    TRUST_PROXY: z.coerce.boolean().default(false),
    // Phase 2: First-Customer Pilot Mode
    FIRST_CUSTOMER_MODE: z.coerce.boolean().default(false),
    // Headless-browser (JS-rendered) rescan of the homepage, merged into the
    // static-fetch signals so tracking tags / forms only injected by
    // client-side JS aren't reported as false-positive "missing" findings.
    // Disabled in tests (see vitest.config.ts / global-setup.ts) since test
    // fixtures aren't real servers a headless browser can navigate to.
    ENABLE_JS_RENDERED_RESCAN: z.coerce.boolean().default(true),
    // Email Dispatcher
    EMAIL_PROVIDER: z.enum(['MOCK', 'SMTP']).default('MOCK'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default('LeadGuard Intelligence <alerts@leadguard.io>'),
    // AI Provider Integration (pitch generation)
    AI_PROVIDER: z.enum(['MOCK', 'GEMINI']).default('MOCK'),
    GEMINI_API_KEY: z.string().optional(),
    // Report & Asset Storage
    REPORT_STORAGE: z.enum(['LOCAL', 'S3']).default('LOCAL'),
    S3_BUCKET: z.string().default('leadguard-reports'),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // Fail fast at boot on cross-field misconfiguration instead of degrading
    // silently at runtime (the audit finding this closes: REPORT_STORAGE=S3
    // used to fall back to local disk with no credentials and no error).
    if (env.EMAIL_PROVIDER === 'SMTP' && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SMTP_HOST, SMTP_USER, and SMTP_PASS are required when EMAIL_PROVIDER=SMTP',
        path: ['EMAIL_PROVIDER'],
      });
    }
    if (env.AI_PROVIDER === 'GEMINI' && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GEMINI_API_KEY is required when AI_PROVIDER=GEMINI',
        path: ['AI_PROVIDER'],
      });
    }
    if (env.REPORT_STORAGE === 'S3' && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when REPORT_STORAGE=S3',
        path: ['REPORT_STORAGE'],
      });
    }
  })
  .parse(process.env);
