/**
 * Global test isolation & bootstrap:
 * 1. Sets the configuration env (mirroring vitest test.env) so workspace
 *    modules (config / billingService) can be loaded safely.
 * 2. Truncates all tables so integration tests are deterministic and never
 *    read leftover rows from a previous run (accumulated AuditRun/Pitch rows
 *    used to break count- and version-based assertions).
 * 3. Seeds the commercial plans so tests that assume pre-seeded plans (e.g.
 *    security-idor) always find them.
 */
export default async function globalSetup() {
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??= 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
  process.env.REDIS_URL ??= 'redis://localhost:16380';
  process.env.JWT_SECRET ??= 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  process.env.REFRESH_TOKEN_SECRET ??= 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  process.env.APP_URL ??= 'http://localhost:5173';
  process.env.API_URL ??= 'http://localhost:4000';
  process.env.PAYMENT_PROVIDER_MODE ??= 'MOCK';
  process.env.RAZORPAY_KEY_ID ??= 'rzp_test_placeholder_key_id';
  process.env.RAZORPAY_KEY_SECRET ??= 'placeholder_key_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET ??= 'placeholder_webhook_secret';

  const { db } = await import('@leadguard/database');
  const { billingService } = await import('../apps/api/src/services/billingService.js');

  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );

  for (const t of tables) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE "${t.tablename}" RESTART IDENTITY CASCADE`);
  }

  await billingService.ensurePlansSeeded();
  await db.$disconnect();
}