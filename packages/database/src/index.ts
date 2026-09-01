import { PrismaClient, type Prisma } from '@prisma/client';

// The type of the `tx` argument inside db.$transaction(async (tx) => {...}) —
// shared so services can accept "either the default client or a transaction
// client" and let callers choose whether a write needs to be atomic with
// other writes.
export type PrismaTransactionClient = Prisma.TransactionClient;

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
