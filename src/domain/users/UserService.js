'use strict';

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
  constructor(prisma, passwordService, auditLogger) {
    this.prisma = prisma;
    this.passwordService = passwordService;
    this.auditLogger = auditLogger;
  }

  /** Hesap bazli kaba-kuvvet kilidi. IP bazli sinir ayrica http/middleware/rateLimit.js icinde uygulanir. */
  async authenticate(email, password, ip) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) {
      // Kullanici yok/var farkini disari sizdirma - ayni hata mesaji donulur.
      throw new AuthError('invalid_credentials', 'E-posta veya parola hatali.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthError('locked', `Hesap gecici olarak kilitli. ${user.lockedUntil.toISOString()} sonrasi tekrar deneyin.`);
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
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts, lockedUntil },
      });
      await this.auditLogger.log({
        userId: user.id, action: 'login.failed', entity: 'user', entityId: user.id, ip,
      });
      throw new AuthError('invalid_credentials', 'E-posta veya parola hatali.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
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
    const user = await this.prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash, role },
    });
    await this.auditLogger.log({
      userId: createdBy, action: 'user.create', entity: 'user', entityId: user.id, ip,
      detail: { email: user.email, role },
    });
    return user;
  }

  /** Kullanicilar hic silinmez, yalnizca pasife alinir (bkz. Bolum 6.2). */
  async setActive(userId, isActive, actingUserId, ip) {
    if (!isActive) await this._assertNotLastActiveAdmin(userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });
    if (!isActive) await this._revokeSessions(userId);

    await this.auditLogger.log({
      userId: actingUserId, action: isActive ? 'user.enable' : 'user.disable',
      entity: 'user', entityId: userId, ip,
    });
    return user;
  }

  async changeRole(userId, newRole, actingUserId, ip) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (target.role === 'admin' && newRole !== 'admin') {
      await this._assertNotLastActiveAdmin(userId);
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data: { role: newRole } });
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
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await this.passwordService.verify(user.passwordHash, currentPassword || '');
    if (!valid) return { success: false, code: 'invalid_current', message: 'Mevcut parola hatali.' };

    const policyErrors = this.passwordService.validatePolicy(newPassword);
    if (policyErrors.length > 0) return { success: false, code: 'weak_password', message: policyErrors.join(' ') };

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this._revokeSessions(userId);
    await this.auditLogger.log({ userId, action: 'user.password_change', entity: 'user', entityId: userId });
    return { success: true };
  }

  async listUsers() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async _assertNotLastActiveAdmin(userId) {
    const activeAdmins = await this.prisma.user.count({ where: { role: 'admin', isActive: true } });
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (target?.role === 'admin' && target.isActive && activeAdmins <= 1) {
      throw new LastAdminError('Sistemde en az bir aktif admin bulunmalidir; son admin pasife alinamaz.');
    }
  }

  async _revokeSessions(userId) {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}

module.exports = { UserService, AuthError, LastAdminError };
