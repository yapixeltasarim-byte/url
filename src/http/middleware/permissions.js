'use strict';

const { can, isOwnScoped, hasBlanketAccess } = require('../../domain/users/permissions');

function deny(req, res) {
  if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: 'forbidden' });
  return res.status(403).render('error', { message: 'Bu işlem için yetkiniz yok.' });
}

function unauthorized(req, res) {
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login');
}

/**
 * Merkezi yetki ara katmani (bkz. Bolum 4.5 / 6.2). Uc nokta yalnizca
 * gereken izni bildirir; kontrolu burasi yapar - kontrolor yetki kontrolu YAPMAZ.
 *
 * - '.own' ile biten izinler: sahiplik HER ZAMAN dogrulanir (admin/'*' haric).
 * - Diger izinler: rol bazli genis yetki yeterlidir; yoksa `owner` verilmisse
 *   kaynagin sahibi olmak da yeterlidir (orn. bir editor kendi baglantisini
 *   pasife alabilir, ama baskasininkini alamaz).
 */
function requirePermission(permission, { owner } = {}) {
  return async (req, res, next) => {
    if (!req.user) return unauthorized(req, res);

    try {
      if (isOwnScoped(permission)) {
        if (!can(req.user, permission)) return deny(req, res);
        if (hasBlanketAccess(req.user)) return next();
        if (!owner) return next();
        const ownerId = await owner(req);
        if (ownerId === req.user.id) return next();
        return deny(req, res);
      }

      if (can(req.user, permission)) return next();
      if (owner) {
        const ownerId = await owner(req);
        if (ownerId != null && ownerId === req.user.id) return next();
      }
      return deny(req, res);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePermission };
