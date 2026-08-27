'use strict';

/**
 * Katmanli oran sinirlayici (bkz. Bolum 4.3 / 4.4 / 4.6): giris, API,
 * yonlendirme ve 404 uc noktalarinda ayri ayri kullanilir. Anahtar
 * fonksiyonu (keyFn) sayacin neye gore tutuldugunu belirler - genelde IP,
 * bazen IP+hesap birlikte.
 */
function rateLimit(limiter, { keyFn, limit, windowSeconds }) {
  return async (req, res, next) => {
    try {
      const key = keyFn(req);
      const result = await limiter.hit(key, { limit, windowSeconds });
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.resetSeconds));
        if (req.originalUrl.startsWith('/api/')) {
          return res.status(429).json({ error: 'rate_limited', retryAfter: result.resetSeconds });
        }
        return res.status(429).type('text/plain').send('Cok fazla istek. Lutfen biraz sonra tekrar deneyin.');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

function clientIp(req) {
  // Cloudflare/ters proxy arkasinda 'trust proxy' ayari req.ip'yi dogru doldurur (bkz. security.js).
  return req.ip;
}

module.exports = { rateLimit, clientIp };
