'use strict';

const express = require('express');
const { rateLimit, clientIp } = require('../middleware/rateLimit');

/**
 * GET /:code - sistemin en sik calisan ve en performans kritik yolu.
 * Veritabanina dokunmaz (onbellek isabetinde), birlestirme yapmaz (bkz. Bolum 8.1).
 */
function buildRedirectRouter({ linkService, sink, clickRecorder, limiter }) {
  const router = express.Router();

  // Kod tahmini (enumeration) taramasini hizla engeller (bkz. Bolum 4.3).
  const redirectRateLimit = rateLimit(limiter, {
    keyFn: (req) => `redirect:ip:${clientIp(req)}`,
    limit: 120,
    windowSeconds: 60,
  });

  router.get('/:code', redirectRateLimit, async (req, res, next) => {
    try {
      const { code } = req.params;
      const value = await linkService.resolveForRedirect(code);

      if (!value || !value.isActive) {
        return res.status(404).render('not-found');
      }
      if (value.expiresAt && new Date(value.expiresAt).getTime() < Date.now()) {
        return res.status(410).render('expired');
      }

      // Uc zorunlu detay (bkz. Bolum 8.1):
      // 1) 302 kullanilir, 301 degil - kalici onbellekleme analitigi ve pasife almayi bozar.
      // 2) Cache-Control: no-store - aradaki vekil sunucular yonlendirmeyi onbellege almasin.
      // 3) Tiklama kaydi yaniti bekletmez.
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      res.redirect(302, value.targetUrl);

      const event = clickRecorder.buildEvent(req, value.id);
      sink.push(event).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[redirect] tiklama olayi kuyruklanamadi:', err.message);
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildRedirectRouter };
