'use strict';

const { mapUser, nowIso, toIso, asIntBool, notFound } = require('../../infra/db/rows');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'invalid_credentials' | 'locked' | 'inactive'
  }
}

class LastAdminError extends Error {}

class UserService {
  constructor(db, passwordService, auditLogger) {
    this.db = db;
    this.passwordService = passwordService;
    this.auditLogger = auditLogger;
  }

  _getById(id) {
    return mapUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }

  _getByEmail(email) {
    return mapUser(this.db.prepare('SELECT * FROM users WHERE email = ?').get(email));
  }

  /** Hesap bazli kaba-kuvvet kilidi. IP bazli sinir ayrica http/middleware/rateLimit.js icinde uygulanir. */
  async authenticate(email, password, ip) {
    const user = this._getByEmail(email.toLowerCase());

    if (!user) {
      // Kullanici yok/var farkini disari sizdirma - ayni hata mesaji donulur.
      throw new AuthError('invalid_credentials', 'E-posta veya parola hatalı.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthError('locked', `Hesap geçici olarak kilitli. ${user.lockedUntil.toISOString()} sonrası tekrar deneyin.`);
    }
    if (!user.isActive) {
      throw new AuthError('inactive', 'Hesap pasif durumda.');
    }

    const valid = await this.passwordService.verify(user.passwordHash, password);
    if (!valid) {
      const failedAttempts = user.failedAttempts + 1;
      const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000)
        : null;
      this.db.prepare(`
        UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?
      `).run(failedAttempts, toIso(lockedUntil), nowIso(), user.id);
      await this.auditLogger.log({
        userId: user.id, action: 'login.failed', entity: 'user', entityId: user.id, ip,
      });
      throw new AuthError('invalid_credentials', 'E-posta veya parola hatalı.');
    }

    this.db.prepare(`
      UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?
    `).run(nowIso(), user.id);
    await this.auditLogger.log({
      userId: user.id, action: 'login.success', entity: 'user', entityId: user.id, ip,
    });
    return user;
  }

  async createUser({ email, password, role, createdBy, ip }) {
    const policyErrors = this.passwordService.validatePolicy(password);
    if (policyErrors.length > 0) {
      const err = new Error(policyErrors.join(' '));
      err.code = 'weak_password';
      throw err;
    }
    const passwordHash = await this.passwordService.hash(password);
    const ts = nowIso();
    const result = this.db.prepare(`
      INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(email.toLowerCase(), passwordHash, role, ts, ts);
    const user = this._getById(result.lastInsertRowid);
    await this.auditLogger.log({
      userId: createdBy, action: 'user.create', entity: 'user', entityId: user.id, ip,
      detail: { email: user.email, role },
    });
    return user;
  }

  /** Kullanicilar hic silinmez, yalnizca pasife alinir (bkz. Bolum 6.2). */
  async setActive(userId, isActive, actingUserId, ip) {
    if (!isActive) await this._assertNotLastActiveAdmin(userId);

    this.db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(asIntBool(isActive), nowIso(), userId);
    const user = this._getById(userId);
    if (!user) notFound('Kullanıcı');
    if (!isActive) await this._revokeSessions(userId);

    await this.auditLogger.log({
      userId: actingUserId, action: isActive ? 'user.enable' : 'user.disable',
      entity: 'user', entityId: userId, ip,
    });
    return user;
  }

  async changeRole(userId, newRole, actingUserId, ip) {
    const target = this._getById(userId);
    if (!target) notFound('Kullanıcı');
    if (target.role === 'admin' && newRole !== 'admin') {
      await this._assertNotLastActiveAdmin(userId);
    }

    this.db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
      .run(newRole, nowIso(), userId);
    const user = this._getById(userId);
    // Rol degisikligi aninda etkili olmali - aktif oturumlar yenilenir (bkz. Bolum 6.2).
    await this._revokeSessions(userId);

    await this.auditLogger.log({
      userId: actingUserId, action: 'user.role_change', entity: 'user', entityId: userId, ip,
      detail: { from: target.role, to: newRole },
    });
    return user;
  }

  /** Kullanicinin kendi parolasini degistirmesi - tum oturumlari iptal eder (bkz. Bolum 4.4). */
  async changeOwnPassword(userId, currentPassword, newPassword) {
    const user = this._getById(userId);
    if (!user) notFound('Kullanıcı');
    const valid = await this.passwordService.verify(user.passwordHash, currentPassword || '');
    if (!valid) return { success: false, code: 'invalid_current', message: 'Mevcut parola hatalı.' };

    const policyErrors = this.passwordService.validatePolicy(newPassword);
    if (policyErrors.length > 0) return { success: false, code: 'weak_password', message: policyErrors.join(' ') };

    const passwordHash = await this.passwordService.hash(newPassword);
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, nowIso(), userId);
    await this._revokeSessions(userId);
    await this.auditLogger.log({ userId, action: 'user.password_change', entity: 'user', entityId: userId });
    return { success: true };
  }

  async listUsers() {
    return this.db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(mapUser);
  }

  async _assertNotLastActiveAdmin(userId) {
    const row = this.db.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1",
    ).get();
    const target = this._getById(userId);
    if (target?.role === 'admin' && target.isActive && row.n <= 1) {
      throw new LastAdminError('Sistemde en az bir aktif admin bulunmalıdır; son admin pasife alınamaz.');
    }
  }

  async _revokeSessions(userId) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

module.exports = { UserService, AuthError, LastAdminError };
