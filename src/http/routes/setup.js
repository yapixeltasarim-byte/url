'use strict';

const express = require('express');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Terminal/SSH erisimi olmayan paylasimli hosting ortamlari icin tek seferlik
 * kurulum ucu: migrate deploy calistirir + ilk admin hesabini olusturur.
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
      log.push('== npx prisma migrate deploy ==');
      const projectRoot = path.join(__dirname, '..', '..', '..');
      const output = execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 60_000,
      });
      log.push(output);

      log.push('== ilk admin hesabi ==');
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
      log.push(`HATA: ${err.message}`);
      if (err.stdout) log.push(`stdout:\n${err.stdout}`);
      if (err.stderr) log.push(`stderr:\n${err.stderr}`);
      res.status(500).type('text/plain').send(log.join('\n'));
    }
  });

  return router;
}

module.exports = { buildSetupRouter };
