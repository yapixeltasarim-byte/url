'use strict';

/**
 * click_events (ham) -> click_daily (onceden hesaplanmis ozet).
 * Analitik ekranlari asla ham tabloyu saymaz; bu ayrim sonradan eklenmesi
 * zor oldugu icin bastan boyle kurgulanir (bkz. Bolum 7.1).
 */
class RollupJob {
  constructor(prisma) {
    this.prisma = prisma;
  }

  static startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  /** Varsayilan: dunku (UTC) gunu ozetler - gece calisan cron bunu cagirir. */
  async runForDate(date = new Date(Date.now() - 24 * 3600_000)) {
    const dayStart = RollupJob.startOfUtcDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);

    const events = await this.prisma.clickEvent.findMany({
      where: { ts: { gte: dayStart, lt: dayEnd } },
      select: { linkId: true, country: true, isBot: true },
    });

    const buckets = new Map();
    for (const e of events) {
      const country = e.country || 'unknown';
      const key = `${e.linkId}|${country}|${e.isBot}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    for (const [key, count] of buckets) {
      const [linkIdStr, country, isBotStr] = key.split('|');
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.clickDaily.upsert({
        where: {
          linkId_date_country_isBot: {
            linkId: Number(linkIdStr), date: dayStart, country, isBot: isBotStr === 'true',
          },
        },
        create: {
          linkId: Number(linkIdStr), date: dayStart, country, isBot: isBotStr === 'true', count,
        },
        update: { count },
      });
    }

    return { date: dayStart, linksProcessed: buckets.size, eventsRead: events.length };
  }
}

module.exports = RollupJob;
