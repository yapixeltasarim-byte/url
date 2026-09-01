'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeAppServices, seedAdmin } = require('./helpers');
const { toCsv } = require('../src/domain/analytics/AnalyticsService');

describe('ClickRecorder + RollupJob + AnalyticsService', () => {
  let db;
  let services;
  let admin;
  let link;

  beforeEach(async () => {
    db = makeDb();
    services = await makeAppServices(db);
    admin = await seedAdmin(db, services.passwordService);
    await services.domainService.create({
      pattern: 'example.com',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
    link = await services.linkService.create({
      targetUrl: 'https://example.com/kampanya',
      campaign: 'bahar',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
  });

  afterEach(() => db.close());

  it('tiklamalari yazar, rollup ozetler, analitik click_daily okur', async () => {
    const req = {
      ip: '203.0.113.10',
      headers: { 'user-agent': 'Mozilla/5.0', 'cf-ipcountry': 'TR' },
    };
    const events = [
      services.clickRecorder.buildEvent(req, link.id),
      services.clickRecorder.buildEvent(req, link.id),
      services.clickRecorder.buildEvent({
        ip: '203.0.113.11',
        headers: { 'user-agent': 'Googlebot', 'cf-ipcountry': 'US' },
      }, link.id),
    ];
    await services.clickRecorder.persist(events);

    const result = await services.rollupJob.runForDate(new Date());
    assert.equal(result.eventsRead, 3);
    assert.ok(result.linksProcessed >= 1);

    const overview = await services.analyticsService.overview({ days: 30 });
    assert.equal(overview.totalClicks, 2);
    assert.equal(overview.totalBotClicks, 1);
    assert.equal(overview.byCountry[0].country, 'TR');
    assert.equal(overview.byCampaign[0].campaign, 'bahar');

    const forLink = await services.analyticsService.overviewForLink(link.id, { days: 30 });
    assert.equal(forLink.totalClicks, 2);
    assert.ok(forLink.firstClickAt instanceof Date);

    const csvRows = await services.analyticsService.exportCsvRows({ days: 90 });
    const csv = toCsv(csvRows);
    assert.match(csv, /date,code,title,campaign,country,is_bot,count/);
    assert.match(csv, /bahar/);
  });

  it('ayni gun tekrar rollup mutlak sayim yazar', async () => {
    await services.clickRecorder.persist([
      services.clickRecorder.buildEvent({
        ip: '203.0.113.10',
        headers: { 'user-agent': 'Mozilla/5.0', 'cf-ipcountry': 'TR' },
      }, link.id),
    ]);
    await services.rollupJob.runForDate(new Date());
    await services.rollupJob.runForDate(new Date());
    const rows = db.prepare('SELECT count FROM click_daily WHERE link_id = ?').all(link.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 1);
  });
});
