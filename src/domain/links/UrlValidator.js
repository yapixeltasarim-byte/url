'use strict';

class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Bolum 5.1'deki dogrulama zincirinin tamami. Herhangi bir adim
 * basarisiz olursa istek reddedilir - bu sistemin en hassas noktasidir.
 */
class UrlValidator {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async validate(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
      throw new ValidationError('required', 'Hedef URL zorunludur.');
    }

    // Ham metinde @ varsa dogrudan reddedilir - https://sirket.com@kotu.site tuzagi.
    if (rawUrl.includes('@')) {
      throw new ValidationError('at_symbol', 'URL icinde @ isareti bulunamaz.');
    }

    let url;
    try {
      // Node'un yerlesik URL sinifi punycode donusumunu kendiliginden yapar;
      // hostname zaten donusturulmus degeri verir - elle donusum yazilmaz.
      url = new URL(rawUrl.trim());
    } catch {
      throw new ValidationError('invalid_url', 'Gecerli bir URL degil.');
    }

    // http, javascript:, data:, file: burada elenir - yalnizca https gecer.
    if (url.protocol !== 'https:') {
      throw new ValidationError('protocol', 'Yalnizca https protokolu kabul edilir.');
    }
    if (url.port) {
      throw new ValidationError('port', 'Port belirtilen URL kabul edilmez.');
    }
    if (url.username || url.password) {
      throw new ValidationError('credentials', 'Kimlik bilgisi (kullanici:parola@) iceren URL kabul edilmez.');
    }

    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const allowed = await this.isHostAllowed(host);
    if (!allowed) {
      throw new ValidationError('not_allowed', `${host} hedef domain izin listesinde degil.`);
    }

    return url.toString();
  }

  async isHostAllowed(host) {
    const domains = await this.prisma.allowedDomain.findMany({ where: { isActive: true } });
    return domains.some(({ pattern }) => matchesPattern(host, pattern));
  }
}

/**
 * Sik yapilan hata: hostname.endsWith(pattern) ile eslestirmek "sirket.com"
 * desenini "kotusirket.com" icin de gecirir. Dogru yontem: tam esitlik
 * VEYA alt alan adi icin host.endsWith("." + pattern) (bkz. Bolum 5.1).
 */
function matchesPattern(host, pattern) {
  const base = pattern.replace(/^\*\./, '').toLowerCase();
  return host === base || host.endsWith(`.${base}`);
}

module.exports = { UrlValidator, ValidationError, matchesPattern };
