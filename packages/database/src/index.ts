import { PrismaClient } from '@prisma/client';

const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://leadguard:leadguard@localhost:15432/leadguard';

export const db = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

export * from '@prisma/client';
