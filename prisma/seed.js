'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('[seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD .env icinde tanimli degil.');
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    console.error('[seed] SEED_ADMIN_PASSWORD en az 12 karakter olmali.');
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] ${email} zaten mevcut, atlaniyor. Ilk giristen sonra parolayi panelden degistirin.`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await prisma.user.create({
    data: { email, passwordHash, role: 'admin', isActive: true },
  });

  console.log(`[seed] Ilk admin hesabi olusturuldu: ${admin.email}`);
  console.log('[seed] Guvenlik: bu parolayi ilk giristen hemen sonra degistirin (bkz. 12.2 Uretime Gecis Kontrol Listesi).');
}

main()
  .catch((err) => {
    console.error('[seed] basarisiz:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
