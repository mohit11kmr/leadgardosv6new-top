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
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    REFRESH_TOKEN_SECRET: z.string().min(32),
    APP_URL: z.string().url(),
    API_URL: z.string().url(),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    PORT: z.coerce.number().int().positive().default(4000),
    MAX_PAGES_PER_AUDIT: z.coerce.number().int().positive().max(100).default(10),
    MAX_CRAWL_DEPTH: z.coerce.number().int().min(0).max(5).default(2),
    DEFAULT_MONTHLY_VISITORS: z.coerce.number().nonnegative().default(0),
    DEFAULT_CONVERSION_RATE: z.coerce.number().nonnegative().max(100).default(0),
    DEFAULT_AVERAGE_LEAD_VALUE: z.coerce.number().nonnegative().default(0),
    // Phase 5.1 Payment & Billing Configurations
    PAYMENT_PROVIDER_MODE: z.enum(['MOCK', 'TEST', 'LIVE']).default('MOCK'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    // Monitoring Configurations
    MONITOR_CRAWL_CONCURRENCY: z.coerce.number().int().positive().max(10).default(3),
    MONITOR_MANUAL_RUN_RATE_LIMIT: z.coerce.number().positive().default(10),
    // Rate Limiting Configurations
    AUTH_RATE_LIMIT: z.coerce.number().positive().default(20),
    AUDIT_RATE_LIMIT: z.coerce.number().positive().default(30),
    API_RATE_LIMIT: z.coerce.number().positive().default(150),
    WEBHOOK_RATE_LIMIT: z.coerce.number().positive().default(100),
    // Guest Scan Configuration
    SYSTEM_GUEST_ORGANIZATION_ID: z.string().uuid().optional(),
    SYSTEM_GUEST_ORGANIZATION_NAME: z.string().default('LeadGuard Guest Scans'),
  })
  .parse(process.env);
