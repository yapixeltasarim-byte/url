'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../src/infra/db/sqlite');
const { nowIso } = require('../src/infra/db/rows');

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('[seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD .env icinde tanimli degil.');
    process.exitCode = 1;
    return;
  }
  const db = openDatabase(process.env.DATABASE_URL);
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      console.log(`[seed] ${email} zaten mevcut, atlaniyor. Ilk giristen sonra parolayi panelden degistirin.`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const ts = nowIso();
    db.prepare(`
      INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, 'admin', 1, ?, ?)
    `).run(email, passwordHash, ts, ts);

    console.log(`[seed] Ilk admin hesabi olusturuldu: ${email}`);
    console.log('[seed] Guvenlik: bu parolayi ilk giristen hemen sonra degistirin (bkz. 12.2 Uretime Gecis Kontrol Listesi).');
  } finally {
    db.close();
  }
}

main()
  .catch((err) => {
    console.error('[seed] basarisiz:', err);
    process.exitCode = 1;
  });
