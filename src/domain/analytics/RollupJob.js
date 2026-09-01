'use strict';

const { toIso, asBool } = require('../../infra/db/rows');

/**
 * click_events (ham) -> click_daily (onceden hesaplanmis ozet).
 * Analitik ekranlari asla ham tabloyu saymaz; bu ayrim sonradan eklenmesi
 * zor oldugu icin bastan boyle kurgulanir (bkz. Bolum 7.1).
 */
class RollupJob {
  constructor(db) {
    this.db = db;
    this._upsert = db.prepare(`
      INSERT INTO click_daily (link_id, date, country, is_bot, count)
      VALUES (@linkId, @date, @country, @isBot, @count)
      ON CONFLICT(link_id, date, country, is_bot)
      DO UPDATE SET count = excluded.count
    `);
  }

  static startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  /** Varsayilan: dunku (UTC) gunu ozetler - gece calisan cron bunu cagirir. */
  async runForDate(date = new Date(Date.now() - 24 * 3600_000)) {
    const dayStart = RollupJob.startOfUtcDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
    const dayStartIso = toIso(dayStart);
    const dayEndIso = toIso(dayEnd);

    const events = this.db.prepare(`
      SELECT link_id, country, is_bot
      FROM click_events
      WHERE ts >= ? AND ts < ?
    `).all(dayStartIso, dayEndIso);

    const buckets = new Map();
    for (const event of events) {
      const country = event.country || 'unknown';
      const isBot = asBool(event.is_bot);
      const key = `${event.link_id}|${country}|${isBot}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    const write = this.db.transaction(() => {
      for (const [key, count] of buckets) {
        const [linkIdStr, country, isBotStr] = key.split('|');
        this._upsert.run({
          linkId: Number(linkIdStr),
          date: dayStartIso,
          country,
          isBot: isBotStr === 'true' ? 1 : 0,
          count,
        });
      }
    });
    write();

    return { date: dayStart, linksProcessed: buckets.size, eventsRead: events.length };
  }

  /**
   * Bugunu ve dunu ozetler. Bugun icin sayim her cagrida SIFIRDAN yeniden
   * hesaplanir (upsert'teki update:{count} artan degil, mutlak degerdir),
   * bu yuzden gun icinde tekrar tekrar cagirmak tamamen guvenlidir.
   */
  async runForTodayAndYesterday() {
    const today = await this.runForDate(new Date());
    const yesterday = await this.runForDate(new Date(Date.now() - 24 * 3600_000));
    return { today, yesterday };
  }
}

module.exports = RollupJob;
