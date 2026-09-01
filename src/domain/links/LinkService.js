'use strict';

const { ValidationError } = require('./UrlValidator');
const { mapLink, nowIso, toIso, notFound } = require('../../infra/db/rows');

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
  constructor({ db, cache, urlValidator, codeGenerator, auditLogger }) {
    this.db = db;
    this.cache = cache;
    this.urlValidator = urlValidator;
    this.codeGenerator = codeGenerator;
    this.auditLogger = auditLogger;
  }

  _getById(id) {
    return mapLink(this.db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id)));
  }

  _getByCode(code) {
    return mapLink(this.db.prepare('SELECT * FROM links WHERE code = ?').get(code));
  }

  async create({ targetUrl, title, campaign, expiresAt, customAlias, createdBy, ip }) {
    const validTargetUrl = await this.urlValidator.validate(targetUrl);

    const code = customAlias
      ? await this._reserveCustomAlias(customAlias)
      : await this.codeGenerator.generateUnique(
        async (candidate) => RESERVED_CODES.has(candidate.toLowerCase())
          || Boolean(this.db.prepare('SELECT 1 FROM links WHERE code = ?').get(candidate)),
      );

    const ts = nowIso();
    const result = this.db.prepare(`
      INSERT INTO links (code, target_url, title, campaign, expires_at, created_by, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      code,
      validTargetUrl,
      title || null,
      campaign || null,
      expiresAt ? toIso(new Date(expiresAt)) : null,
      createdBy,
      ts,
      ts,
    );
    const link = this._getById(result.lastInsertRowid);

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

    const link = this._getByCode(code);
    if (!link) return null;

    const value = toCacheValue(link);
    await this.cache.set(code, value, CACHE_TTL_SECONDS);
    return value;
  }

  async getById(id) {
    return this._getById(id);
  }

  async listOwn(userId) {
    return this.db.prepare(
      'SELECT * FROM links WHERE created_by = ? ORDER BY created_at DESC',
    ).all(userId).map(mapLink);
  }

  async listAll() {
    return this.db.prepare(`
      SELECT l.*, u.email AS creator_email
      FROM links l
      LEFT JOIN users u ON u.id = l.created_by
      ORDER BY l.created_at DESC
    `).all().map(mapLink);
  }

  async edit(id, { title, campaign, targetUrl, expiresAt }, actingUserId, ip) {
    const existing = this._getById(id);
    if (!existing) notFound('Bağlantı');

    const data = {};
    if (title !== undefined) data.title = title || null;
    if (campaign !== undefined) data.campaign = campaign || null;
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    let targetChanged = false;
    if (targetUrl !== undefined && targetUrl !== existing.targetUrl) {
      data.targetUrl = await this.urlValidator.validate(targetUrl);
      targetChanged = true;
    }

    const sets = ['updated_at = @updatedAt'];
    const params = { id: existing.id, updatedAt: nowIso() };
    if (data.title !== undefined) { sets.push('title = @title'); params.title = data.title; }
    if (data.campaign !== undefined) { sets.push('campaign = @campaign'); params.campaign = data.campaign; }
    if (data.expiresAt !== undefined) { sets.push('expires_at = @expiresAt'); params.expiresAt = toIso(data.expiresAt); }
    if (data.targetUrl !== undefined) { sets.push('target_url = @targetUrl'); params.targetUrl = data.targetUrl; }

    this.db.prepare(`UPDATE links SET ${sets.join(', ')} WHERE id = @id`).run(params);
    const link = this._getById(existing.id);

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
    const existing = this._getById(id);
    if (!existing) notFound('Bağlantı');
    this.db.prepare('UPDATE links SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    const link = this._getById(existing.id);

    // ZORUNLU: onbellek silinmezse baglanti TTL suresi boyunca calismaya devam eder (bkz. Bolum 8.3).
    await this.cache.del(link.code);

    await this.auditLogger.log({
      userId: actingUserId, action: 'link.disable', entity: 'link', entityId: link.id, ip,
    });

    return link;
  }

  /** Yanlislikla pasife alinan bir baglanti geri alinabilir (bkz. Bolum 7.2). */
  async enable(id, actingUserId, ip) {
    const existing = this._getById(id);
    if (!existing) notFound('Bağlantı');
    this.db.prepare('UPDATE links SET is_active = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    const link = this._getById(existing.id);

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
    const existing = this._getByCode(alias);
    if (existing) {
      const err = new Error('Bu kısa kod zaten kullanılıyor.');
      err.code = 'alias_taken';
      throw err;
    }
    return alias;
  }

  async ownerOf(id) {
    const row = this.db.prepare('SELECT created_by FROM links WHERE id = ?').get(Number(id));
    return row ? row.created_by : null;
  }
}

module.exports = { LinkService, ValidationError };
