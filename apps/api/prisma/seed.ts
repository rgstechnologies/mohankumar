import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AccountingService } from '../src/accounting/accounting.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Provisions the one business this install serves: a single company with the
 * standard Indian chart of accounts, and the single owner login.
 *
 * This replaces the public sign-up flow. There is no route that creates a user
 * or a company — an account exists only because an operator ran this script.
 *
 * Safe to re-run: it never overwrites an existing company, and re-seeding only
 * resets the owner's password if you explicitly pass SEED_FORCE_PASSWORD=true.
 */
async function main() {
  const prisma = new PrismaClient();

  const companyName = process.env.SEED_COMPANY_NAME?.trim();
  const email = process.env.SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_PASSWORD;

  if (!companyName || !email || !password) {
    throw new Error(
      'Set SEED_COMPANY_NAME, SEED_EMAIL and SEED_PASSWORD in .env before seeding.',
    );
  }
  if (password.length < 12) {
    throw new Error(
      'SEED_PASSWORD must be at least 12 characters — this is the only login to the books.',
    );
  }
  if (password === 'change-me-now') {
    throw new Error('Change SEED_PASSWORD in .env before seeding.');
  }

  // --- the single owner login ---
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: process.env.SEED_OWNER_NAME?.trim() || 'Owner',
        email,
        phone: process.env.SEED_PHONE?.trim() || null,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    console.log(`✔ created login ${email}`);
  } else if (process.env.SEED_FORCE_PASSWORD === 'true') {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`✔ reset password for ${email}`);
  } else {
    console.log(`• login ${email} already exists (left untouched)`);
  }

  // --- the single company + its chart of accounts ---
  const existing = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) {
    console.log(`• company "${existing.name}" already exists — nothing to do`);
    await prisma.$disconnect();
    return;
  }

  // Reuse the app's own chart-of-accounts seeder so the books are identical to
  // what the API would have created — no second, drifting copy of that logic.
  // seedDefaults only ever touches the transaction it is handed, so the service
  // needs no injected Prisma of its own.
  const accounting = new AccountingService(prisma as unknown as PrismaService);

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        name: companyName,
        gstin: process.env.SEED_GSTIN?.trim() || null,
        stateCode: process.env.SEED_GSTIN?.trim()?.slice(0, 2) || null,
        members: { create: { userId: user!.id, role: Role.OWNER } },
      },
    });
    await accounting.seedDefaults(tx, created.id);
    return created;
  }, {
    timeout: 120000
  });

  console.log(`✔ created company "${company.name}" with the default chart of accounts`);
  console.log('\nThe first financial year is the one today falls in; later years');
  console.log('appear on the login screen automatically as the calendar rolls over.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
