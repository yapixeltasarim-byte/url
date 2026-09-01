'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeAppServices, seedAdmin } = require('./helpers');
const { LastAdminError, AuthError } = require('../src/domain/users/UserService');

describe('UserService + SessionService', () => {
  let db;
  let services;
  let admin;

  beforeEach(async () => {
    db = makeDb();
    services = await makeAppServices(db);
    admin = await seedAdmin(db, services.passwordService);
  });

  afterEach(() => db.close());

  it('dogru parola ile giris yapar', async () => {
    const user = await services.userService.authenticate(admin.email, admin.password, '127.0.0.1');
    assert.equal(user.email, admin.email);
    assert.equal(user.isActive, true);
    assert.ok(user.createdAt instanceof Date);
  });

  it('yanlis parolada kilit sayacini artirir', async () => {
    await assert.rejects(
      () => services.userService.authenticate(admin.email, 'yanlis-parola-12', '127.0.0.1'),
      (err) => err instanceof AuthError && err.code === 'invalid_credentials',
    );
    const row = db.prepare('SELECT failed_attempts FROM users WHERE id = ?').get(admin.id);
    assert.equal(row.failed_attempts, 1);
  });

  it('ayni e-postayi ikinci kez reddeder', async () => {
    await services.userService.createUser({
      email: 'editor@example.com',
      password: 'EditorParola12',
      role: 'editor',
      createdBy: admin.id,
      ip: '127.0.0.1',
    });
    await assert.rejects(
      () => services.userService.createUser({
        email: 'editor@example.com',
        password: 'EditorParola12',
        role: 'editor',
        createdBy: admin.id,
        ip: '127.0.0.1',
      }),
      (err) => String(err.code).startsWith('SQLITE_CONSTRAINT_UNIQUE'),
    );
  });

  it('son aktif admini pasife almaz', async () => {
    await assert.rejects(
      () => services.userService.setActive(admin.id, false, admin.id, '127.0.0.1'),
      LastAdminError,
    );
  });

  it('oturum olusturur ve yeniler', async () => {
    const session = await services.sessionService.create(admin.id, { ip: '127.0.0.1', userAgent: 'test' });
    assert.ok(session.id);
    const refreshed = await services.sessionService.validateAndRefresh(session.id);
    assert.equal(refreshed.user.email, admin.email);
    assert.equal(refreshed.user.isActive, true);
    assert.ok(refreshed.expiresAt instanceof Date);
  });

  it('suresi dolmus oturumu siler', async () => {
    const session = await services.sessionService.create(admin.id, { ip: '127.0.0.1', userAgent: 'test' });
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(session.id);
    const refreshed = await services.sessionService.validateAndRefresh(session.id);
    assert.equal(refreshed, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  });
});
