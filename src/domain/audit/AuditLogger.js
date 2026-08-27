'use strict';

/**
 * Kim, ne zaman, hangi IP'den, hangi kaydi olusturdu/degistirdi/sildi.
 * Uygulama uzerinden silinemez; yalnizca INSERT yapilir (bkz. Bolum 4.7).
 */
class AuditLogger {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async log({ userId = null, action, entity, entityId = null, ip = null, detail = null }) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId: entityId != null ? String(entityId) : null,
        ip,
        detailJson: detail != null ? JSON.stringify(detail) : null,
      },
    });
  }

  async list({ limit = 200 } = {}) {
    return this.prisma.auditLog.findMany({
      orderBy: { ts: 'desc' },
      take: limit,
      include: { user: { select: { email: true } } },
    });
  }
}

module.exports = AuditLogger;
