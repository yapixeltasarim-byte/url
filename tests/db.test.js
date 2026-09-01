'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { openDatabase, resolveFilePath } = require('../src/infra/db/sqlite');
const { applyMigrations } = require('../src/infra/db/migrate');

describe('sqlite + migrate', () => {
  it('bos veritabanina 001_init uygular', () => {
    const db = openDatabase(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all().map((r) => r.name);
    assert.ok(tables.includes('users'));
    assert.ok(tables.includes('links'));
    assert.ok(tables.includes('click_events'));
    assert.ok(tables.includes('click_daily'));
    assert.ok(tables.includes('sessions'));
    assert.ok(tables.includes('_migrations'));
    const applied = db.prepare('SELECT id FROM _migrations').all();
    assert.deepEqual(applied.map((r) => r.id), ['001_init']);
    db.close();
  });

  it('mevcut Prisma semasini yeniden CREATE TABLE etmez', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor',
        is_active INTEGER NOT NULL DEFAULT 1,
        totp_secret TEXT,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const log = [];
    applyMigrations(db, log);
    assert.ok(log.some((line) => line.includes('mevcut sema')));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    db.close();
  });

  it('ikinci acilista migration atlanir', () => {
    const db = openDatabase(':memory:');
    const log = [];
    applyMigrations(db, log);
    assert.ok(log.every((line) => line.includes('atlandi')));
    db.close();
  });

  it('file: onekini proje kokune gore cozer', () => {
    const resolved = resolveFilePath('file:./data/dev.db');
    assert.equal(resolved, path.resolve(__dirname, '..', 'data', 'dev.db'));
  });

  it('dosya tabanli sqlite WAL ile acilir, kapanir, tekrar acilir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'url-sqlite-'));
    const file = path.join(dir, 'app.db');
    const db1 = openDatabase(file);
    db1.prepare(`
      INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
      VALUES ('a@example.com', 'x', 'admin', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run();
    db1.close();

    const db2 = openDatabase(file);
    const row = db2.prepare('SELECT email FROM users').get();
    assert.equal(row.email, 'a@example.com');
    db2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
