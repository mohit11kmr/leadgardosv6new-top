# LeadGuard OS V6

Production foundation for website diagnostics, lead leakage detection, and revenue intelligence. React/Vite, Express, Prisma/PostgreSQL, Redis/BullMQ, and no Firebase.

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate -- --name foundation
npm run db:seed
npm run dev
```

Web: http://localhost:5173. API: http://localhost:4000/health. Compose publishes PostgreSQL on 15432 and Redis on 16380 to avoid common host-port collisions.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
