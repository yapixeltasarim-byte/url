'use strict';

const crypto = require('crypto');
const { mapSession, mapUser, nowIso, toIso } = require('../../infra/db/rows');

const IDLE_MINUTES = 30;
const ABSOLUTE_HOURS = 8;

/**
 * Veritabani tablosu ile oturum yonetimi (demo). Uretimde Redis + veritabani
 * birlikte kullanilir (bkz. Bolum 3.1) ama sozlesme ayni kalir.
 * Kurallar (Bolum 4.4): 8 saat mutlak, 30 dakika hareketsizlik.
 */
class SessionService {
  constructor(db) {
    this.db = db;
  }

  async create(userId, { ip, userAgent }) {
    const id = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, ip, user_agent, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      ip || null,
      userAgent || null,
      nowIso(),
      toIso(new Date(now.getTime() + IDLE_MINUTES * 60_000)),
    );
    return mapSession(this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id));
  }

  /** Gecerliyse oturumu (hareketsizlik penceresini kaydirarak) doner, degilse null. */
  async validateAndRefresh(sessionId) {
    if (!sessionId) return null;
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!row) return null;

    const user = mapUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id));
    const session = mapSession(row, user);
    if (!user) return null;

    const now = new Date();
    const absoluteDeadline = new Date(session.createdAt.getTime() + ABSOLUTE_HOURS * 3600_000);
    if (now > session.expiresAt || now > absoluteDeadline) {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      return null;
    }
    if (!session.user.isActive) {
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      return null;
    }

    const newExpiry = new Date(Math.min(
      now.getTime() + IDLE_MINUTES * 60_000,
      absoluteDeadline.getTime(),
    ));
    this.db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(toIso(newExpiry), sessionId);
    session.expiresAt = newExpiry;
    return session;
  }

  async destroy(sessionId) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  async destroyAllForUser(userId) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

module.exports = SessionService;
