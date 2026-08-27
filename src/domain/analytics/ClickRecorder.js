'use strict';

const UAParser = require('ua-parser-js');
const { isBotUserAgent } = require('./BotDetector');
const { hashIp } = require('./ipHash');

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
      // Uretimde Cloudflare bu basligi otomatik ekler; demo/yerel ortamda bos kalir.
      country: req.headers['cf-ipcountry'] || null,
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
