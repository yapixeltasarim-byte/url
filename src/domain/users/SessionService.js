'use strict';

const crypto = require('crypto');

const IDLE_MINUTES = 30;
const ABSOLUTE_HOURS = 8;

/**
 * Veritabani tablosu ile oturum yonetimi (demo). Uretimde Redis + veritabani
 * birlikte kullanilir (bkz. Bolum 3.1) ama sozlesme ayni kalir.
 * Kurallar (Bolum 4.4): 8 saat mutlak, 30 dakika hareketsizlik.
 */
class SessionService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async create(userId, { ip, userAgent }) {
    const id = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        id,
        userId,
        ip,
        userAgent,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDLE_MINUTES * 60_000),
      },
    });
    return session;
  }

  /** Gecerliyse oturumu (hareketsizlik penceresini kaydirarak) doner, degilse null. */
  async validateAndRefresh(sessionId) {
    if (!sessionId) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session) return null;

    const now = new Date();
    const absoluteDeadline = new Date(session.createdAt.getTime() + ABSOLUTE_HOURS * 3600_000);
    if (now > session.expiresAt || now > absoluteDeadline) {
      await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
      return null;
    }
    if (!session.user.isActive) {
      await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
      return null;
    }

    const newExpiry = new Date(Math.min(
      now.getTime() + IDLE_MINUTES * 60_000,
      absoluteDeadline.getTime(),
    ));
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: newExpiry },
    });
    return session;
  }

  async destroy(sessionId) {
    await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }

  async destroyAllForUser(userId) {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}

module.exports = SessionService;
