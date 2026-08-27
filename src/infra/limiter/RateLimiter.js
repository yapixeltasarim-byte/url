'use strict';

/**
 * Sabit pencereli oran sinirlayici sozlesmesi. `hit` her cagrida sayaci
 * bir artirir ve o anki durumu doner - karar verme (429 donme, kilitleme
 * vb.) cagiran tarafa aittir.
 */
class RateLimiter {
  /**
   * @returns {Promise<{allowed: boolean, remaining: number, resetSeconds: number}>}
   */
  // eslint-disable-next-line no-unused-vars
  async hit(key, { limit, windowSeconds }) {
    throw new Error('RateLimiter.hit uygulanmadi');
  }

  // eslint-disable-next-line no-unused-vars
  async reset(key) {
    throw new Error('RateLimiter.reset uygulanmadi');
  }
}

module.exports = RateLimiter;
