'use strict';

const express = require('express');
const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const { rateLimit, clientIp } = require('../middleware/rateLimit');
const { verifyCsrf } = require('../middleware/csrf');
const { AuthError } = require('../../domain/users/UserService');

function buildAuthRouter({ userService, sessionService, limiter }) {
  const router = express.Router();

  const loginRateLimit = rateLimit(limiter, {
    keyFn: (req) => `login:ip:${clientIp(req)}`,
    limit: 20,
    windowSeconds: 15 * 60,
  });

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/panel');
    res.render('login', { error: null });
  });

  router.post('/login', loginRateLimit, async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).render('login', { error: 'E-posta ve parola zorunludur.' });
      }

      const user = await userService.authenticate(String(email).trim(), String(password), clientIp(req));
      const session = await sessionService.create(user.id, {
        ip: clientIp(req),
        userAgent: req.headers['user-agent'] || null,
      });
      setSessionCookie(res, session.id);
      res.redirect('/panel');
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(401).render('login', { error: err.message });
      }
      next(err);
    }
  });

  router.post('/logout', verifyCsrf, async (req, res, next) => {
    try {
      if (req.sessionId) await sessionService.destroy(req.sessionId);
      clearSessionCookie(res);
      res.redirect('/login');
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAuthRouter };
