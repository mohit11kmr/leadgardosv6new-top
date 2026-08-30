-- Sync SubscriptionStatus enum with schema.prisma.
-- Resolves schema drift: the schema defines CREATED and FAILED states but the
-- DB enum (created by an earlier migration) was missing them.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'FAILED';
