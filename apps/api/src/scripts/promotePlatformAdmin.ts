import { db } from '@leadguard/database';

const email = process.argv[2];

if (!email) {
  console.error('Usage: npm run promote-admin -- <email>');
  process.exit(1);
}

const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

await db.user.update({ where: { id: user.id }, data: { platformAdmin: true } });
console.log(`Promoted ${user.email} to platform administrator.`);
await db.$disconnect();