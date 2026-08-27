'use strict';

/**
 * allowed_domains yonetimi - sistemin en hassas tablosu (bkz. Bolum 5).
 * Yalnizca admin erisir, her degisiklik denetim kaydina yazilir,
 * silme yerine pasife alma tercih edilir.
 */
class DomainService {
  constructor(prisma, auditLogger) {
    this.prisma = prisma;
    this.auditLogger = auditLogger;
  }

  async list() {
    return this.prisma.allowedDomain.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create({ pattern, note, createdBy, ip }) {
    const normalized = String(pattern || '').trim().toLowerCase();
    if (!normalized) {
      const err = new Error('Desen zorunludur.');
      err.code = 'invalid_pattern';
      throw err;
    }
    const domain = await this.prisma.allowedDomain.create({
      data: { pattern: normalized, note: note || null, createdBy },
    });
    await this.auditLogger.log({
      userId: createdBy, action: 'domain.create', entity: 'allowed_domain', entityId: domain.id, ip,
      detail: { pattern: normalized },
    });
    return domain;
  }

  async setActive(id, isActive, actingUserId, ip) {
    const domain = await this.prisma.allowedDomain.update({
      where: { id: Number(id) },
      data: { isActive },
    });
    await this.auditLogger.log({
      userId: actingUserId, action: isActive ? 'domain.enable' : 'domain.disable',
      entity: 'allowed_domain', entityId: domain.id, ip,
    });
    return domain;
  }
}

module.exports = DomainService;
