'use strict';

const fs = require('fs');
const path = require('path');

// CloudLinux nproc thread sayar. better-sqlite3 senkron oldugu icin
// libuv havuzunu kucuk tutmak yeter; Prisma query engine gibi carpan yoktur.
if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '2';

let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  const wrapped = new Error(
    `better-sqlite3 native modulu yuklenemedi: ${err.message}. Sunucuda uygulama kokunde npm install (install script acik) calismali; Mac node_modules Linux'ta calismaz.`,
  );
  wrapped.code = 'SQLITE_NATIVE';
  throw wrapped;
}

const { applyMigrations } = require('./migrate');

const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');

/**
 * DATABASE_URL hem `file:./data/dev.db` (eski Prisma bicimi) hem duz yol kabul eder.
 * Relatif yollar proje kokune gore cozulur.
 */
function resolveFilePath(databaseUrl) {
  if (!databaseUrl || databaseUrl === ':memory:') return ':memory:';
  let file = String(databaseUrl).trim();
  if (file.startsWith('file:')) file = file.slice('file:'.length);
  if (path.isAbsolute(file)) return file;
  return path.resolve(PROJECT_ROOT, file);
}

function configurePragmas(db) {
  // Tek Node surecinde better-sqlite3 senkron ve tek baglantilidir.
  // WAL, Hostinger gibi paylasimli diskte okuyucularin yazari beklemesini azaltir;
  // desteklenmezse DELETE journal'a dusulur.
  try {
    db.pragma('journal_mode = WAL');
  } catch {
    db.pragma('journal_mode = DELETE');
  }
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
}

function openDatabase(databaseUrl) {
  const filePath = resolveFilePath(databaseUrl);
  try {
    if (filePath !== ':memory:') {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const db = new Database(filePath);
    configurePragmas(db);
    applyMigrations(db);
    return db;
  } catch (err) {
    throw new Error(`SQLite acilamadi (${filePath}): ${err.message}`);
  }
}

const globalForSqlite = globalThis;

function getDb(databaseUrl) {
  if (!globalForSqlite.__sqlite) {
    globalForSqlite.__sqlite = openDatabase(databaseUrl || process.env.DATABASE_URL);
  }
  return globalForSqlite.__sqlite;
}

function closeDb() {
  if (globalForSqlite.__sqlite) {
    globalForSqlite.__sqlite.close();
    globalForSqlite.__sqlite = null;
  }
}

module.exports = { openDatabase, resolveFilePath, getDb, closeDb };
