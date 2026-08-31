import { PrismaClient } from '@prisma/client';

// C12 audit fix: never silently connect to a localhost fallback in production.
const databaseUrl =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('DATABASE_URL is required in production');
      })()
    : 'postgresql://leadguard:leadguard@localhost:15432/leadguard');

export const db = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

export * from '@prisma/client';
