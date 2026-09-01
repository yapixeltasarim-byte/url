'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeAppServices, seedAdmin } = require('./helpers');
const { ValidationError } = require('../src/domain/links/UrlValidator');

describe('LinkService + DomainService', () => {
  let db;
  let services;
  let admin;

  beforeEach(async () => {
    db = makeDb();
    services = await makeAppServices(db);
    admin = await seedAdmin(db, services.passwordService);
    await services.domainService.create({
      pattern: 'example.com',
      note: 'test',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
  });

  afterEach(() => db.close());

  it('izinli https hedefi kisaltir ve cache uzerinden cozer', async () => {
    const link = await services.linkService.create({
      targetUrl: 'https://www.example.com/path',
      title: 'Ornek',
      campaign: 'kampanya',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
    assert.equal(link.isActive, true);
    assert.equal(link.targetUrl, 'https://www.example.com/path');
    assert.ok(link.createdAt instanceof Date);
    assert.match(link.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{8}$/);

    const resolved = await services.linkService.resolveForRedirect(link.code);
    assert.equal(resolved.targetUrl, link.targetUrl);
    assert.equal(resolved.isActive, true);
  });

  it('izin listesinde olmayan hostu reddeder', async () => {
    await assert.rejects(
      () => services.linkService.create({
        targetUrl: 'https://evil.test/x',
        createdBy: admin.id,
        ip: '127.0.0.1',
      }),
      (err) => err instanceof ValidationError && err.code === 'not_allowed',
    );
  });

  it('ozel kodu rezerve eder ve cakismayi yakalar', async () => {
    await services.linkService.create({
      targetUrl: 'https://example.com/a',
      customAlias: 'kampanya-1',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
    await assert.rejects(
      () => services.linkService.create({
        targetUrl: 'https://example.com/b',
        customAlias: 'kampanya-1',
        createdBy: admin.id,
        ip: '127.0.0.1',
      }),
      (err) => err.code === 'alias_taken',
    );
  });

  it('pasife alinca onbellekten duser, aktife alinca geri gelir', async () => {
    const link = await services.linkService.create({
      targetUrl: 'https://example.com/x',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
    const disabled = await services.linkService.disable(link.id, admin.id, '127.0.0.1');
    assert.equal(disabled.isActive, false);
    const enabled = await services.linkService.enable(link.id, admin.id, '127.0.0.1');
    assert.equal(enabled.isActive, true);
  });

  it('listAll olusturan e-postasini doldurur', async () => {
    await services.linkService.create({
      targetUrl: 'https://example.com/x',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
    const all = await services.linkService.listAll();
    assert.equal(all[0].creator.email, admin.email);
  });
});
