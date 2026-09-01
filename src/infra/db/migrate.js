'use strict';

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'db', 'migrations');

function tableExists(db, name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function appliedIds(db) {
  return new Set(db.prepare('SELECT id FROM _migrations').all().map((row) => row.id));
}

/**
 * SQL dosyalarini sirayla, ayni surecte uygular. CLI/alt surec yok.
 * Prisma doneminden kalan bir `users` tablosu varsa 001_init atlanir
 * (mevcut Hostinger/SQLite dosyasiyla kesintisiz gecis).
 */
function applyMigrations(db, log = []) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = appliedIds(db);

  if (!applied.has('001_init') && tableExists(db, 'users')) {
    db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(
      '001_init',
      new Date().toISOString(),
    );
    applied.add('001_init');
    log.push('001_init: mevcut sema tespit edildi, uygulandi olarak isaretlendi.');
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const insert = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    if (applied.has(id)) {
      log.push(`${id}: zaten uygulanmis, atlandi.`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      insert.run(id, new Date().toISOString());
    });
    apply();
    log.push(`${id}: uygulandi.`);
  }

  return log;
}

module.exports = { applyMigrations };
