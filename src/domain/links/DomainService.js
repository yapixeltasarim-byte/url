'use strict';

const { mapDomain, notFound, asIntBool } = require('../../infra/db/rows');

/**
 * allowed_domains yonetimi - sistemin en hassas tablosu (bkz. Bolum 5).
 * Yalnizca admin erisir, her degisiklik denetim kaydina yazilir,
 * silme yerine pasife alma tercih edilir.
 */
class DomainService {
  constructor(db, auditLogger) {
    this.db = db;
    this.auditLogger = auditLogger;
  }

  async list() {
    return this.db.prepare('SELECT * FROM allowed_domains ORDER BY created_at DESC').all().map(mapDomain);
  }

  async create({ pattern, note, createdBy, ip }) {
    const normalized = String(pattern || '').trim().toLowerCase();
    if (!normalized) {
      const err = new Error('Desen zorunludur.');
      err.code = 'invalid_pattern';
      throw err;
    }
    const result = this.db.prepare(`
      INSERT INTO allowed_domains (pattern, note, is_active, created_by)
      VALUES (?, ?, 1, ?)
    `).run(normalized, note || null, createdBy);
    const domain = mapDomain(
      this.db.prepare('SELECT * FROM allowed_domains WHERE id = ?').get(result.lastInsertRowid),
    );
    await this.auditLogger.log({
      userId: createdBy, action: 'domain.create', entity: 'allowed_domain', entityId: domain.id, ip,
      detail: { pattern: normalized },
    });
    return domain;
  }

  async setActive(id, isActive, actingUserId, ip) {
    const info = this.db.prepare('UPDATE allowed_domains SET is_active = ? WHERE id = ?')
      .run(asIntBool(isActive), Number(id));
    if (info.changes === 0) notFound('Alan adı');
    const domain = mapDomain(
      this.db.prepare('SELECT * FROM allowed_domains WHERE id = ?').get(Number(id)),
    );
    await this.auditLogger.log({
      userId: actingUserId, action: isActive ? 'domain.enable' : 'domain.disable',
      entity: 'allowed_domain', entityId: domain.id, ip,
    });
    return domain;
  }
}

module.exports = DomainService;
