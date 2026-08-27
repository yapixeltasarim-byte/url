'use strict';

const helmet = require('helmet');

/**
 * Guvenlik basliklari (bkz. Bolum 4.6 / 12.2). CSP kasitli olarak sikidir:
 * hicbir inline script/style izni yok, tum stiller public/styles.css uzerinden gelir.
 */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    // Uretimde Cloudflare zaten HTTPS zorunlu kilar; HSTS'i biz de acikca isaretleriz.
    hsts: { maxAge: 15552000, includeSubDomains: true },
  });
}

module.exports = { securityHeaders };
