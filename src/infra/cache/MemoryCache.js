'use strict';

const { LRUCache } = require('lru-cache');
const CacheStore = require('./CacheStore');

/**
 * Demo/tek-surec uygulamasi. TTL her `set` cagrisinda ayri ayri verilir
 * cunku write-through akisi (Bolum 2.3) sabit 60sn kullanir ama arayuz
 * genel kalsin diye parametrik birakildi.
 */
class MemoryCache extends CacheStore {
  constructor({ max = 10000 } = {}) {
    super();
    this.store = new LRUCache({ max, ttl: 0 });
  }

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key, value, ttlSeconds) {
    const ttl = ttlSeconds ? ttlSeconds * 1000 : undefined;
    this.store.set(key, value, ttl ? { ttl } : undefined);
  }

  async del(key) {
    this.store.delete(key);
  }
}

module.exports = MemoryCache;
