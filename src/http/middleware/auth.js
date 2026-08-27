'use strict';

const cookie = require('cookie');
const env = require('../../config/env');

function setSessionCookie(res, sessionId) {
  res.append('Set-Cookie', cookie.serialize(env.cookieName, sessionId, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/',
  }));
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', cookie.serialize(env.cookieName, '', {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  }));
}

function readSessionId(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  return cookies[env.cookieName] || null;
}

/** Her istekte cerezdeki oturumu dogrular ve req.user / req.sessionId'yi doldurur. */
function attachUser(sessionService) {
  return async (req, res, next) => {
    req.user = null;
    req.sessionId = null;
    try {
      const sessionId = readSessionId(req);
      if (!sessionId) return next();

      const session = await sessionService.validateAndRefresh(sessionId);
      if (!session) {
        clearSessionCookie(res);
        return next();
      }
      req.user = {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        isActive: session.user.isActive,
      };
      req.sessionId = session.id;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login');
}

module.exports = { attachUser, requireAuth, setSessionCookie, clearSessionCookie, readSessionId };
