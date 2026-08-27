'use strict';

const crypto = require('crypto');
const env = require('../../config/env');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Durum bilgisiz (stateless) CSRF token: oturum kimliginin HMAC'i.
 * Ayri bir depolama gerektirmez, yalnizca gecerli bir oturuma sahip
 * istemci uretebilir (bkz. Bolum 4.6 - sameSite: strict + form token).
 */
function tokenFor(sessionId) {
  return crypto.createHmac('sha256', env.csrfSecret).update(sessionId).digest('hex');
}

function attachCsrfToken(req, res, next) {
  res.locals.csrfToken = req.sessionId ? tokenFor(req.sessionId) : null;
  next();
}

function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.sessionId) return res.status(403).json({ error: 'csrf_failed' });

  const provided = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  const expected = tokenFor(req.sessionId);

  const providedBuf = Buffer.from(String(provided || ''));
  const expectedBuf = Buffer.from(expected);
  const valid = providedBuf.length === expectedBuf.length
    && crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!valid) {
    if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: 'csrf_failed' });
    return res.status(403).render('error', { message: 'Islem dogrulanamadi, sayfayi yenileyip tekrar deneyin.' });
  }
  next();
}

module.exports = { attachCsrfToken, verifyCsrf, tokenFor };
