'use strict';

const { ValidationError } = require('./UrlValidator');

const CACHE_TTL_SECONDS = 60;

// Bu kok segmentler http/index.js icinde sabit rotalara ayrildi; yonlendirme
// rotasi (GET /:code) en sona mont edildigi icin bu degerlerle CAKISAN bir
// kod asla erisilebilir olmaz - bu yuzden uretimde reddedilir/yeniden uretilir.
const RESERVED_CODES = new Set(['login', 'logout', 'panel', 'api', 'public']);

// Ozel takma ad (custom alias) - Faz 5'ten one cekildi. Yalnizca URL-guvenli
// karakterlere izin verilir; uzunluk sinirlari kod tahmini riskini sinirli tutar.
const ALIAS_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

function toCacheValue(link) {
  return {
    id: link.id,
    targetUrl: link.targetUrl,
    isActive: link.isActive,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
  };
}

class LinkService {
  constructor({ prisma, cache, urlValidator, codeGenerator, auditLogger }) {
    this.prisma = prisma;
    this.cache = cache;
    this.urlValidator = urlValidator;
    this.codeGenerator = codeGenerator;
    this.auditLogger = auditLogger;
  }

  async create({ targetUrl, title, campaign, expiresAt, customAlias, createdBy, ip }) {
    const validTargetUrl = await this.urlValidator.validate(targetUrl);

    const code = customAlias
      ? await this._reserveCustomAlias(customAlias)
      : await this.codeGenerator.generateUnique(
        async (candidate) => RESERVED_CODES.has(candidate.toLowerCase())
          || Boolean(await this.prisma.link.findUnique({ where: { code: candidate } })),
      );

    const link = await this.prisma.link.create({
      data: {
        code,
        targetUrl: validTargetUrl,
        title: title || null,
        campaign: campaign || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy,
      },
    });

    // Write-through: olusturuldugu anda hem veritabanina hem onbellege yazilir (bkz. Bolum 2.3).
    await this.cache.set(link.code, toCacheValue(link), CACHE_TTL_SECONDS);

    await this.auditLogger.log({
      userId: createdBy, action: 'link.create', entity: 'link', entityId: link.id, ip,
      detail: { code: link.code, targetUrl: link.targetUrl, campaign: link.campaign },
    });

    return link;
  }

  /** Yonlendirme akisi icin: once onbellek, ardindan DB (bkz. Bolum 8.1). */
  async resolveForRedirect(code) {
    const cached = await this.cache.get(code);
    if (cached) return cached;

    const link = await this.prisma.link.findUnique({ where: { code } });
    if (!link) return null;

    const value = toCacheValue(link);
    await this.cache.set(code, value, CACHE_TTL_SECONDS);
    return value;
  }

  async getById(id) {
    return this.prisma.link.findUnique({ where: { id: Number(id) } });
  }

  async listOwn(userId) {
    return this.prisma.link.findMany({ where: { createdBy: userId }, orderBy: { createdAt: 'desc' } });
  }

  async listAll() {
    return this.prisma.link.findMany({
      orderBy: { createdAt: 'desc' },
      include: { creator: { select: { email: true } } },
    });
  }

  async edit(id, { title, campaign, targetUrl, expiresAt }, actingUserId, ip) {
    const existing = await this.prisma.link.findUniqueOrThrow({ where: { id: Number(id) } });

    const data = {};
    if (title !== undefined) data.title = title || null;
    if (campaign !== undefined) data.campaign = campaign || null;
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    let targetChanged = false;
    if (targetUrl !== undefined && targetUrl !== existing.targetUrl) {
      data.targetUrl = await this.urlValidator.validate(targetUrl);
      targetChanged = true;
    }

    const link = await this.prisma.link.update({ where: { id: existing.id }, data });

    // Onbellekte etkin bir kayit varsa yeni degerlerle yeniden yazilir (write-through).
    await this.cache.set(link.code, toCacheValue(link), CACHE_TTL_SECONDS);

    await this.auditLogger.log({
      userId: actingUserId, action: 'link.edit', entity: 'link', entityId: link.id, ip,
      detail: targetChanged
        ? { targetUrl: { before: existing.targetUrl, after: link.targetUrl } }
        : { fields: Object.keys(data) },
    });

    return link;
  }

  async disable(id, actingUserId, ip) {
    const existing = await this.prisma.link.findUniqueOrThrow({ where: { id: Number(id) } });
    const link = await this.prisma.link.update({ where: { id: existing.id }, data: { isActive: false } });

    // ZORUNLU: onbellek silinmezse baglanti TTL suresi boyunca calismaya devam eder (bkz. Bolum 8.3).
    await this.cache.del(link.code);

    await this.auditLogger.log({
      userId: actingUserId, action: 'link.disable', entity: 'link', entityId: link.id, ip,
    });

    return link;
  }

  /** Yanlislikla pasife alinan bir baglanti geri alinabilir (bkz. Bolum 7.2). */
  async enable(id, actingUserId, ip) {
    const existing = await this.prisma.link.findUniqueOrThrow({ where: { id: Number(id) } });
    const link = await this.prisma.link.update({ where: { id: existing.id }, data: { isActive: true } });

    // Write-through: tekrar aktif oldugu icin onbellege yeniden yazilir.
    await this.cache.set(link.code, toCacheValue(link), CACHE_TTL_SECONDS);

    await this.auditLogger.log({
      userId: actingUserId, action: 'link.enable', entity: 'link', entityId: link.id, ip,
    });

    return link;
  }

  async _reserveCustomAlias(rawAlias) {
    const alias = String(rawAlias).trim();
    if (!ALIAS_PATTERN.test(alias)) {
      const err = new Error('Özel kısa kod 3-32 karakter olmalı; yalnızca harf, rakam, tire ve alt çizgi içerebilir.');
      err.code = 'invalid_alias';
      throw err;
    }
    if (RESERVED_CODES.has(alias.toLowerCase())) {
      const err = new Error('Bu kısa kod sistem tarafından ayrılmış, başka bir tane seçin.');
      err.code = 'reserved_alias';
      throw err;
    }
    const existing = await this.prisma.link.findUnique({ where: { code: alias } });
    if (existing) {
      const err = new Error('Bu kısa kod zaten kullanılıyor.');
      err.code = 'alias_taken';
      throw err;
    }
    return alias;
  }

  async ownerOf(id) {
    const link = await this.prisma.link.findUnique({ where: { id: Number(id) }, select: { createdBy: true } });
    return link ? link.createdBy : null;
  }
}

module.exports = { LinkService, ValidationError };
