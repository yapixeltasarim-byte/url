'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Bazi izole hosting ortamlarinda alt surec baslatmak (child_process) basarisiz
 * olabiliyor (EAGAIN, ENOENT). Bu yuzden migration SQL dosyalari CLI/alt surec
 * hic kullanilmadan, ayni surecte, dogrudan Prisma client uzerinden calistirilir.
 * _prisma_migrations tablosu da Prisma'nin kendi formatiyla doldurulur; boylece
 * ileride gercek `prisma migrate deploy` calistirilirsa cakisma olmaz.
 */
async function applyPendingMigrations(prisma, log) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  const migrationsDir = path.join(__dirname, '..', '..', '..', 'prisma', 'migrations');
  const folders = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const folder of folders) {
    const sqlPath = path.join(migrationsDir, folder, 'migration.sql');
    if (!fs.existsSync(sqlPath)) continue;

    // eslint-disable-next-line no-await-in-loop
    const already = await prisma.$queryRawUnsafe(
      'SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ?', folder,
    );
    if (already.length > 0) {
      log.push(`${folder}: zaten uygulanmis, atlandi.`);
      // eslint-disable-next-line no-continue
      continue;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    // Once yorum SATIRLARI cikarilir, sonra ';' ile bolunur - aksi halde
    // "-- CreateTable" yorumuyla baslayan blok, icindeki gercek CREATE TABLE
    // ifadesiyle birlikte yorum sanilip tamamen atlanir.
    const cleanedSql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = cleanedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(statement);
    }

    const id = crypto.randomUUID();
    // eslint-disable-next-line no-await-in-loop
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
       (id, checksum, finished_at, migration_name, applied_steps_count, started_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)`,
      id, checksum, folder, statements.length,
    );
    log.push(`${folder}: uygulandi (${statements.length} ifade).`);
  }
}

/**
 * Terminal/SSH erisimi olmayan paylasimli hosting ortamlari icin tek seferlik
 * kurulum ucu: bekleyen migration'lari uygular + ilk admin hesabini olusturur.
 * SETUP_TOKEN ortam degiskeni tanimli degilse bu uc nokta tamamen kapalidir.
 * Kullanildiktan sonra SETUP_TOKEN'i ortam degiskenlerinden kaldirmak guvenlidir.
 */
function buildSetupRouter({ env, prisma, passwordService, auditLogger }) {
  const router = express.Router();

  router.get('/setup/bootstrap', async (req, res) => {
    if (!env.setupToken || req.query.token !== env.setupToken) {
      return res.status(404).send('Not found');
    }

    const log = [];
    try {
      log.push('== migration ==');
      await applyPendingMigrations(prisma, log);

      log.push('\n== ilk admin hesabi ==');
      if (!env.seedAdminEmail || !env.seedAdminPassword) {
        log.push('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD tanimli degil, admin olusturulmadi.');
      } else {
        const email = env.seedAdminEmail.toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          log.push(`${email} zaten mevcut, atlanildi.`);
        } else {
          const passwordHash = await passwordService.hash(env.seedAdminPassword);
          const admin = await prisma.user.create({
            data: { email, passwordHash, role: 'admin', isActive: true },
          });
          await auditLogger.log({
            userId: admin.id, action: 'user.create', entity: 'user', entityId: admin.id,
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
      return res.status(400).type('text/plain').send('email ve password query parametreleri zorunlu.');
    }

    const log = [];
    try {
      const email = String(rawEmail).toLowerCase();

      log.push('adim: passwordService.hash (argon2)');
      const passwordHash = await passwordService.hash(String(password));
      log.push('-> basarili');

      log.push('adim: prisma.user.findUnique');
      const existing = await prisma.user.findUnique({ where: { email } });
      log.push(`-> basarili (${existing ? 'mevcut kayit bulundu' : 'kayit yok'})`);

      let user;
      if (existing) {
        log.push('adim: prisma.user.update');
        user = await prisma.user.update({ where: { email }, data: { passwordHash, role: 'admin', isActive: true } });
      } else {
        log.push('adim: prisma.user.create');
        user = await prisma.user.create({ data: { email, passwordHash, role: 'admin', isActive: true } });
      }
      log.push('-> basarili');

      log.push('adim: auditLogger.log');
      await auditLogger.log({
        userId: user.id, action: existing ? 'user.password_change' : 'user.create', entity: 'user', entityId: user.id,
        detail: { via: 'setup-create-admin' },
      });
      log.push('-> basarili');

      res.type('text/plain').send(`TAMAMLANDI: ${email} artik admin (parola politikasi bu araçta atlanmistir).`);
    } catch (err) {
      log.push(`HATA -> name: ${err.name}, code: ${err.code}, message: ${err.message}`);
      log.push(`stack:\n${err.stack}`);
      res.status(500).type('text/plain').send(log.join('\n'));
    }
  });

  return router;
}

module.exports = { buildSetupRouter };
