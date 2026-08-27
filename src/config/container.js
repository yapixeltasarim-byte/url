'use strict';

const env = require('./env');
const prisma = require('../infra/db/prisma');

const MemoryCache = require('../infra/cache/MemoryCache');
const BufferedSink = require('../infra/sink/BufferedSink');
const MemoryLimiter = require('../infra/limiter/MemoryLimiter');

/**
 * Secim mekanizmasi: CACHE_DRIVER=memory|redis degerine gore ilgili
 * uygulamalar yuklenir. Uygulamanin geri kalani yalnizca asagidaki
 * `cache` / `sink` / `limiter` nesnelerini bilir; hangi sinif oldugunu
 * asla bilmez (bkz. Bolum 2.1). Gecis gunu degisen tek satir CACHE_DRIVER'dir.
 */
let container = null;

function buildContainer() {
  let cache;
  let sink;
  let limiter;

  if (env.cacheDriver === 'redis') {
    // ioredis yalnizca gercekten gerekince yuklenir - demo kurulumunda hic dokunulmaz.
    const Redis = require('ioredis');
    const RedisCache = require('../infra/cache/RedisCache');
    const RedisStreamSink = require('../infra/sink/RedisStreamSink');
    const RedisLimiter = require('../infra/limiter/RedisLimiter');

    const redisClient = new Redis(env.redisUrl);
    cache = new RedisCache(redisClient);
    sink = new RedisStreamSink(redisClient.duplicate());
    limiter = new RedisLimiter(redisClient);
  } else {
    cache = new MemoryCache({ max: 10000 });
    sink = new BufferedSink({ flushIntervalMs: env.sinkFlushIntervalMs });
    limiter = new MemoryLimiter();
  }

  return { env, prisma, cache, sink, limiter };
}

/** Uygulama boyunca tek bir container ornegi kullanilir. */
function getContainer() {
  if (!container) container = buildContainer();
  return container;
}

module.exports = { getContainer };
