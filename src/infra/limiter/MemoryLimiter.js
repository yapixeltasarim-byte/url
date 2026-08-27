'use strict';

const RateLimiter = require('./RateLimiter');

/**
 * Tek surec icin sabit pencereli sayac. Cok sunuculu uretimde IP basina
 * farkli sunuculara dusen istekler ayri sayilir - bu yuzden uretimde
 * RedisLimiter kullanilir.
 */
class MemoryLimiter extends RateLimiter {
  constructor() {
    super();
    this.counters = new Map();
    // Bellek sizintisini onlemek icin suresi gecmis girdileri periyodik temizle.
    this.sweepTimer = setInterval(() => this._sweep(), 60_000);
    this.sweepTimer.unref?.();
  }

  async hit(key, { limit, windowSeconds }) {
    const now = Date.now();
    let entry = this.counters.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.counters.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      resetSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  async reset(key) {
    this.counters.delete(key);
  }

  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this.counters) {
      if (entry.resetAt <= now) this.counters.delete(key);
    }
  }
}

module.exports = MemoryLimiter;
