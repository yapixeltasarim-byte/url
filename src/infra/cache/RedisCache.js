'use strict';

const CacheStore = require('./CacheStore');

/**
 * Uretim uygulamasi (Faz 4). Cok sunuculu ortamda `del` cagrisi tum
 * sunucularda tek seferde etkili olur - bu yuzden pasife alma akisinda
 * (Bolum 8.3) onbellek silme zorunludur.
 */
class RedisCache extends CacheStore {
  constructor(redisClient, { keyPrefix = 'link:' } = {}) {
    super();
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
  }

  async get(key) {
    const raw = await this.redis.get(this.keyPrefix + key);
    return raw ? JSON.parse(raw) : null;
  }

  async set(key, value, ttlSeconds) {
    const raw = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.set(this.keyPrefix + key, raw, 'EX', ttlSeconds);
    } else {
      await this.redis.set(this.keyPrefix + key, raw);
    }
  }

  async del(key) {
    await this.redis.del(this.keyPrefix + key);
  }
}

module.exports = RedisCache;
