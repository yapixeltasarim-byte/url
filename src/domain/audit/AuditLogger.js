'use strict';

const { mapAudit } = require('../../infra/db/rows');

/**
 * Kim, ne zaman, hangi IP'den, hangi kaydi olusturdu/degistirdi/sildi.
 * Uygulama uzerinden silinemez; yalnizca INSERT yapilir (bkz. Bolum 4.7).
 */
class AuditLogger {
  constructor(db) {
    this.db = db;
  }

  async log({ userId = null, action, entity, entityId = null, ip = null, detail = null }) {
    this.db.prepare(`
      INSERT INTO audit_log (user_id, action, entity, entity_id, ip, detail_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      action,
      entity,
      entityId != null ? String(entityId) : null,
      ip,
      detail != null ? JSON.stringify(detail) : null,
    );
  }

  async list({ limit = 200 } = {}) {
    return this.db.prepare(`
      SELECT a.*, u.email AS user_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.ts DESC
      LIMIT ?
    `).all(limit).map(mapAudit);
  }
}

module.exports = AuditLogger;
