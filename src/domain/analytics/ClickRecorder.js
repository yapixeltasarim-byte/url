'use strict';

const UAParser = require('ua-parser-js');
const { isBotUserAgent } = require('./BotDetector');
const { hashIp } = require('./ipHash');
const { toIso, asIntBool } = require('../../infra/db/rows');

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
  constructor(db, ipHashSalt) {
    this.db = db;
    this.ipHashSalt = ipHashSalt;
    this._insert = db.prepare(`
      INSERT INTO click_events (link_id, ts, ip_hash, country, city, device, os, browser, is_bot)
      VALUES (@linkId, @ts, @ipHash, @country, @city, @device, @os, @browser, @isBot)
    `);
    this._persistMany = db.transaction((events) => {
      for (const event of events) {
        this._insert.run({
          linkId: event.linkId,
          ts: toIso(event.ts) || new Date().toISOString(),
          ipHash: event.ipHash,
          country: event.country,
          city: event.city,
          device: event.device,
          os: event.os,
          browser: event.browser,
          isBot: asIntBool(event.isBot),
        });
      }
    });
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
    this._persistMany(events);
  }
}

module.exports = ClickRecorder;
