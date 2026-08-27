'use strict';

const RateLimiter = require('./RateLimiter');

/**
 * Uretim uygulamasi (Faz 4). INCR + EXPIRE ile sabit pencere; ilk vurusta
 * pencereyi kilitler. Cok sunuculu ortamda tum sunucularda tutarli sayim
 * saglar.
 */
class RedisLimiter extends RateLimiter {
  constructor(redisClient, { keyPrefix = 'rl:' } = {}) {
    super();
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
  }

  async hit(key, { limit, windowSeconds }) {
    const fullKey = this.keyPrefix + key;
    const count = await this.redis.incr(fullKey);
    if (count === 1) {
      await this.redis.expire(fullKey, windowSeconds);
    }
    const ttl = await this.redis.ttl(fullKey);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  async reset(key) {
    await this.redis.del(this.keyPrefix + key);
  }
}

module.exports = RedisLimiter;
