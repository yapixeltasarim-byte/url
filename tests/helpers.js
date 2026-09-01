'use strict';

const { openDatabase } = require('../src/infra/db/sqlite');
const { nowIso } = require('../src/infra/db/rows');
const PasswordService = require('../src/domain/users/PasswordService');
const AuditLogger = require('../src/domain/audit/AuditLogger');
const { UserService } = require('../src/domain/users/UserService');
const SessionService = require('../src/domain/users/SessionService');
const DomainService = require('../src/domain/links/DomainService');
const { UrlValidator } = require('../src/domain/links/UrlValidator');
const { CodeGenerator } = require('../src/domain/links/CodeGenerator');
const { LinkService } = require('../src/domain/links/LinkService');
const ClickRecorder = require('../src/domain/analytics/ClickRecorder');
const RollupJob = require('../src/domain/analytics/RollupJob');
const { AnalyticsService } = require('../src/domain/analytics/AnalyticsService');

class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key, value) {
    this.store.set(key, value);
  }

  async del(key) {
    this.store.delete(key);
  }
}

function makeDb() {
  return openDatabase(':memory:');
}

async function makeAppServices(db) {
  const passwordService = new PasswordService();
  const auditLogger = new AuditLogger(db);
  const userService = new UserService(db, passwordService, auditLogger);
  const sessionService = new SessionService(db);
  const domainService = new DomainService(db, auditLogger);
  const urlValidator = new UrlValidator(db);
  const linkService = new LinkService({
    db,
    cache: new MemoryCache(),
    urlValidator,
    codeGenerator: new CodeGenerator(),
    auditLogger,
  });
  const clickRecorder = new ClickRecorder(db, 'test-ip-hash-salt-at-least-32-chars!!');
  const rollupJob = new RollupJob(db);
  const analyticsService = new AnalyticsService(db);
  return {
    passwordService,
    auditLogger,
    userService,
    sessionService,
    domainService,
    urlValidator,
    linkService,
    clickRecorder,
    rollupJob,
    analyticsService,
  };
}

async function seedAdmin(db, passwordService, {
  email = 'admin@example.com',
  password = 'DegistirBu123!',
} = {}) {
  const passwordHash = await passwordService.hash(password);
  const ts = nowIso();
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, 'admin', 1, ?, ?)
  `).run(email, passwordHash, ts, ts);
  return { id: Number(result.lastInsertRowid), email, password };
}

module.exports = { makeDb, makeAppServices, seedAdmin, MemoryCache };
