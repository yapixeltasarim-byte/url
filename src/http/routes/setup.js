'use strict';

const express = require('express');
const { applyMigrations } = require('../../infra/db/migrate');
const { mapUser, nowIso } = require('../../infra/db/rows');

/**
 * Terminal/SSH erisimi olmayan paylasimli hosting ortamlari icin tek seferlik
 * kurulum ucu: bekleyen migration'lari uygular + ilk admin hesabini olusturur.
 * SETUP_TOKEN ortam degiskeni tanimli degilse bu uc nokta tamamen kapalidir.
 * Kullanildiktan sonra SETUP_TOKEN'i ortam degiskenlerinden kaldirmak guvenlidir.
 *
 * Migration'lar surec acilisinda da uygulanir (bkz. src/infra/db/sqlite.js);
 * bu uc nokta ayni isi tekrar cagirir - dosyalar idempotenttir.
 */
function buildSetupRouter({ env, db, passwordService, auditLogger, rollupJob }) {
  const router = express.Router();

  router.get('/setup/bootstrap', async (req, res) => {
    if (!env.setupToken || req.query.token !== env.setupToken) {
      return res.status(404).send('Not found');
    }

    const log = [];
    try {
      log.push('== migration ==');
      applyMigrations(db, log);

      log.push('\n== ilk admin hesabi ==');
      if (!env.seedAdminEmail || !env.seedAdminPassword) {
        log.push('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD tanımlı değil, admin oluşturulmadı.');
      } else {
        const email = env.seedAdminEmail.toLowerCase();
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
          log.push(`${email} zaten mevcut, atlanildi.`);
        } else {
          const passwordHash = await passwordService.hash(env.seedAdminPassword);
          const ts = nowIso();
          const result = db.prepare(`
            INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
            VALUES (?, ?, 'admin', 1, ?, ?)
          `).run(email, passwordHash, ts, ts);
          await auditLogger.log({
            userId: result.lastInsertRowid, action: 'user.create', entity: 'user', entityId: result.lastInsertRowid,
            detail: { via: 'setup-bootstrap' },
          });
          log.push(`Admin olusturuldu: ${email}`);
        }
      }

      log.push('\nTAMAMLANDI. Simdi /login uzerinden giris yapabilirsin. Guvenlik icin SETUP_TOKEN ortam degiskenini kaldirip uygulamayi yeniden baslat.');
      res.type('text/plain').send(log.join('\n'));
    } catch (err) {
      log.push(`\nHATA: ${err.message}`);
      res.status(500).type('text/plain').send(log.join('\n'));
    }
  });

  // Bakim amacli: istenen e-posta/parola ile (politika kontrolu ATLANARAK) bir
  // admin hesabi olusturur/gunceller. Yalnizca SETUP_TOKEN bilen kisi kullanabilir.
  router.get('/setup/create-admin', async (req, res) => {
    if (!env.setupToken || req.query.token !== env.setupToken) {
      return res.status(404).send('Not found');
    }
    const { email: rawEmail, password } = req.query;
    if (!rawEmail || !password) {
      return res.status(400).type('text/plain').send('email ve password query parametreleri zorunludur.');
    }

    const t0 = Date.now();
    // eslint-disable-next-line no-console
    const trace = (msg) => console.log(`[setup/create-admin] +${Date.now() - t0}ms ${msg}`);
    trace('istek basladi');

    const log = [];
    try {
      const email = String(rawEmail).toLowerCase();

      trace('passwordService.hash basliyor');
      const passwordHash = await passwordService.hash(String(password));
      trace('passwordService.hash bitti');
      log.push(`passwordService.hash: ${Date.now() - t0}ms`);

      trace('users.findUnique basliyor');
      const existing = mapUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email));
      trace('users.findUnique bitti');
      log.push(`users.findUnique: ${Date.now() - t0}ms (${existing ? 'mevcut' : 'yeni'})`);

      let userId;
      const ts = nowIso();
      if (existing) {
        trace('users.update basliyor');
        db.prepare(`
          UPDATE users SET password_hash = ?, role = 'admin', is_active = 1, updated_at = ? WHERE email = ?
        `).run(passwordHash, ts, email);
        userId = existing.id;
        trace('users.update bitti');
      } else {
        trace('users.create basliyor');
        const result = db.prepare(`
          INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
          VALUES (?, ?, 'admin', 1, ?, ?)
        `).run(email, passwordHash, ts, ts);
        userId = result.lastInsertRowid;
        trace('users.create bitti');
      }
      log.push(`kullanici islemi: ${Date.now() - t0}ms`);

      trace('auditLogger.log basliyor');
      await auditLogger.log({
        userId, action: existing ? 'user.password_change' : 'user.create', entity: 'user', entityId: userId,
        detail: { via: 'setup-create-admin' },
      });
      trace('auditLogger.log bitti');
      log.push(`auditLogger.log: ${Date.now() - t0}ms`);

      trace('TAMAMLANDI, yanit gonderiliyor');
      res.type('text/plain').send(`TAMAMLANDI (${Date.now() - t0}ms): ${email} artik admin.\n\n${log.join('\n')}`);
    } catch (err) {
      trace(`HATA: ${err.message}`);
      log.push(`HATA -> name: ${err.name}, code: ${err.code}, message: ${err.message}`);
      res.status(500).type('text/plain').send(log.join('\n'));
    }
  });

  // Bakim amacli: click_events -> click_daily ozetlemesini hemen tetikler.
  // Uygulama zaten bunu 15 dakikada bir kendiliginden yapar (bkz. src/index.js);
  // bu uc nokta yalnizca beklemeden hemen dogrulamak icindir.
  router.get('/setup/run-rollup', async (req, res) => {
    if (!env.setupToken || req.query.token !== env.setupToken) {
      return res.status(404).send('Not found');
    }
    try {
      const result = await rollupJob.runForTodayAndYesterday();
      res.type('text/plain').send(`TAMAMLANDI\n${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      res.status(500).type('text/plain').send(`HATA: ${err.message}`);
    }
  });

  return router;
}

module.exports = { buildSetupRouter };
