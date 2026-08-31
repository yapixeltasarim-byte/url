'use strict';

const UAParser = require('ua-parser-js');
const { isBotUserAgent } = require('./BotDetector');
const { hashIp } = require('./ipHash');

/**
 * GERI ALINDI: geoip-lite'in veri dosyasi 111MB, yuklendiginde ~105MB RAM
 * ekliyor. Bu hesabin zaten kisitli kaynaklariyla (bkz. "islem sayisi limiti"
 * ve 504 sorunlari) bir araya gelince uygulamanin hic baslamamasina (504)
 * yol acti. Ulke bilgisi icin once daha hafif bir alternatif (kucuk/yalnizca
 * ulke duzeyinde bir veritabani ya da Cloudflare) degerlendirilmeli.
 */
function resolveCountry(req) {
  // Uretimde Cloudflare bu basligi otomatik ekler; kullanilmiyorsa bos kalir.
  return req.headers['cf-ipcountry'] || null;
}

class ClickRecorder {
  constructor(prisma, ipHashSalt) {
    this.prisma = prisma;
    this.ipHashSalt = ipHashSalt;
  }

  /**
   * Yanit gonderildikten SONRA cagrilir, hicbir sey beklemez (bkz. Bolum 8.1).
   * Ham IP burada hemen hash'lenir - tampona (sink) asla ham IP girmez.
   */
  buildEvent(req, linkId) {
    const ua = req.headers['user-agent'] || '';
    const parsed = new UAParser(ua).getResult();
    return {
      linkId,
      ts: new Date().toISOString(),
      ipHash: hashIp(req.ip, this.ipHashSalt),
      country: resolveCountry(req),
      city: null,
      device: parsed.device.type || 'desktop',
      os: parsed.os.name || null,
      browser: parsed.browser.name || null,
      isBot: isBotUserAgent(ua),
    };
  }

  /** BufferedSink/RedisStreamSink tuketicisi tarafindan periyodik cagrilir. */
  async persist(events) {
    if (events.length === 0) return;
    await this.prisma.$transaction(events.map((e) => this.prisma.clickEvent.create({
      data: {
        linkId: e.linkId,
        ts: new Date(e.ts),
        ipHash: e.ipHash,
        country: e.country,
        city: e.city,
        device: e.device,
        os: e.os,
        browser: e.browser,
        isBot: e.isBot,
      },
    })));
  }
}

module.exports = ClickRecorder;
