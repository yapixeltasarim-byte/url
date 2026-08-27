'use strict';

/**
 * Uygulama kodunun bildigi tek onbellek sozlesmesi.
 * domain/ katmani bu siniftan turetilmis somut bir uygulamayi degil,
 * yalnizca bu arayuzu bilir (bkz. Bolum 2.1).
 */
class CacheStore {
  // eslint-disable-next-line no-unused-vars
  async get(key) {
    throw new Error('CacheStore.get uygulanmadi');
  }

  // eslint-disable-next-line no-unused-vars
  async set(key, value, ttlSeconds) {
    throw new Error('CacheStore.set uygulanmadi');
  }

  // eslint-disable-next-line no-unused-vars
  async del(key) {
    throw new Error('CacheStore.del uygulanmadi');
  }
}

module.exports = CacheStore;
