'use strict';

const { mapClickDaily, mapClickEvent, toIso } = require('../../infra/db/rows');

/**
 * Analitik ekranlari YALNIZCA click_daily tablosunu okur, ham tabloyu
 * asla saymaz (bkz. Bolum 7.1). Boylece milyonlarca tiklama birikse bile
 * grafikler aninda acilir.
 */
class AnalyticsService {
  constructor(db) {
    this.db = db;
  }

  async overview({ days = 30 } = {}) {
    const since = toIso(new Date(Date.now() - days * 24 * 3600_000));
    const rows = this.db.prepare(`
      SELECT d.*, l.campaign AS link_campaign, l.code AS link_code, l.title AS link_title
      FROM click_daily d
      LEFT JOIN links l ON l.id = d.link_id
      WHERE d.date >= ?
    `).all(since).map(mapClickDaily);

    const humanRows = rows.filter((r) => !r.isBot);

    const byDate = new Map();
    const byCountry = new Map();
    const byCampaign = new Map();

    for (const row of humanRows) {
      const dateKey = row.date.toISOString().slice(0, 10);
      byDate.set(dateKey, (byDate.get(dateKey) || 0) + row.count);
      byCountry.set(row.country, (byCountry.get(row.country) || 0) + row.count);
      const campaign = row.link.campaign || '(kampanya yok)';
      byCampaign.set(campaign, (byCampaign.get(campaign) || 0) + row.count);
    }

    const totalClicks = humanRows.reduce((sum, r) => sum + r.count, 0);
    const totalBotClicks = rows.filter((r) => r.isBot).reduce((sum, r) => sum + r.count, 0);

    return {
      totalClicks,
      totalBotClicks,
      timeSeries: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([country, count]) => ({ country, count })),
      byCampaign: [...byCampaign.entries()].sort((a, b) => b[1] - a[1]).map(([campaign, count]) => ({ campaign, count })),
    };
  }

  /**
   * Tek bir baglantiya ozel detay sayfasi. Toplam/zaman serisi/ulke
   * dagilimi onceden hesaplanmis click_daily'den gelir (Bolum 7.1).
   * Cihaz/isletim sistemi/tarayici kirilimi ise click_daily semasinda
   * bulunmadigi icin (bkz. Bolum 7 - click_daily yalnizca link_id, date,
   * country, is_bot, count tutar) bu TEK baglantiya sinirli, sinirli
   * hacimli bir ham tablo sorgusuyla hesaplanir - global ekranlar bunu YAPMAZ.
   */
  async overviewForLink(linkId, { days = 30 } = {}) {
    const since = toIso(new Date(Date.now() - days * 24 * 3600_000));

    const dailyRows = this.db.prepare(`
      SELECT * FROM click_daily WHERE link_id = ? AND date >= ?
    `).all(linkId, since).map(mapClickDaily);
    const humanDaily = dailyRows.filter((r) => !r.isBot);

    const byDate = new Map();
    const byCountry = new Map();
    for (const row of humanDaily) {
      const dateKey = row.date.toISOString().slice(0, 10);
      byDate.set(dateKey, (byDate.get(dateKey) || 0) + row.count);
      byCountry.set(row.country, (byCountry.get(row.country) || 0) + row.count);
    }
    const totalClicks = humanDaily.reduce((sum, r) => sum + r.count, 0);
    const totalBotClicks = dailyRows.filter((r) => r.isBot).reduce((sum, r) => sum + r.count, 0);

    const rawEvents = this.db.prepare(`
      SELECT ts, device, os, browser
      FROM click_events
      WHERE link_id = ? AND ts >= ? AND is_bot = 0
      ORDER BY ts ASC
    `).all(linkId, since).map(mapClickEvent);

    const tally = (field) => {
      const map = new Map();
      for (const e of rawEvents) {
        const key = e[field] || 'Bilinmiyor';
        map.set(key, (map.get(key) || 0) + 1);
      }
      return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
    };

    return {
      totalClicks,
      totalBotClicks,
      firstClickAt: rawEvents.length > 0 ? rawEvents[0].ts : null,
      timeSeries: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([country, count]) => ({ country, count })),
      byDevice: tally('device'),
      byOs: tally('os'),
      byBrowser: tally('browser'),
    };
  }

  async exportCsvRows({ days = 90 } = {}) {
    const since = toIso(new Date(Date.now() - days * 24 * 3600_000));
    return this.db.prepare(`
      SELECT d.*, l.code AS link_code, l.title AS link_title, l.campaign AS link_campaign
      FROM click_daily d
      LEFT JOIN links l ON l.id = d.link_id
      WHERE d.date >= ?
      ORDER BY d.date DESC
    `).all(since).map(mapClickDaily);
  }
}

function toCsv(rows) {
  const header = ['date', 'code', 'title', 'campaign', 'country', 'is_bot', 'count'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.date.toISOString().slice(0, 10), r.link.code, r.link.title, r.link.campaign,
      r.country, r.isBot, r.count,
    ].map(escape).join(','));
  }
  return lines.join('\n');
}

module.exports = { AnalyticsService, toCsv };
