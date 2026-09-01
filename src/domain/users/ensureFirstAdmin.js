'use strict';

const { nowIso } = require('../../infra/db/rows');

/**
 * SSH/cron olmayan hostingde `npm run seed` calismaz.
 * Kullanici tablosu BOSsa ve SEED_ADMIN_* tanimliysa ilk admini olusturur.
 * Mevcut hesaplara dokunmaz (parola ezilmez).
 */
async function ensureFirstAdmin(db, env, passwordService, auditLogger) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return { created: false, reason: 'users_exist' };

  const email = (env.seedAdminEmail || '').trim().toLowerCase();
  const password = env.seedAdminPassword;
  if (!email || !password) return { created: false, reason: 'no_seed' };
  if (String(password).length < 12) return { created: false, reason: 'weak_password' };

  const passwordHash = await passwordService.hash(password);
  const ts = nowIso();
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, 'admin', 1, ?, ?)
  `).run(email, passwordHash, ts, ts);

  if (auditLogger) {
    await auditLogger.log({
      userId: result.lastInsertRowid,
      action: 'user.create',
      entity: 'user',
      entityId: result.lastInsertRowid,
      detail: { via: 'startup-seed' },
    });
  }

  return { created: true, email, id: Number(result.lastInsertRowid) };
}

module.exports = { ensureFirstAdmin };
