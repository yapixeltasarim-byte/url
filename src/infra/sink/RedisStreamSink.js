'use strict';

const EventSink = require('./EventSink');

/**
 * Uretim uygulamasi (Faz 4). Redis Stream'e yazar; ayni sureç veya ayri bir
 * worker XREAD ile tuketebilir. At-least-once teslim garantisi verir -
 * tuketici idempotent olmalidir (ayni click_event'in iki kez yazilmasi
 * analitikte kucuk bir sapma yaratir, kritik degildir).
 */
class RedisStreamSink extends EventSink {
  constructor(redisClient, { streamKey = 'click-events', blockMs = 5000, batchSize = 200 } = {}) {
    super();
    this.redis = redisClient;
    this.streamKey = streamKey;
    this.blockMs = blockMs;
    this.batchSize = batchSize;
    this.lastId = '$';
    this.running = false;
  }

  async push(event) {
    await this.redis.xadd(this.streamKey, '*', 'data', JSON.stringify(event));
  }

  registerConsumer(handler) {
    this.running = true;
    this._loop(handler).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[RedisStreamSink] tuketici dongusu durdu:', err.message);
    });
  }

  async _loop(handler) {
    while (this.running) {
      const res = await this.redis.xread(
        'BLOCK', this.blockMs, 'COUNT', this.batchSize,
        'STREAMS', this.streamKey, this.lastId,
      );
      if (!res) continue;
      const [, entries] = res[0];
      const batch = entries.map(([, fields]) => JSON.parse(fields[1]));
      this.lastId = entries[entries.length - 1][0];
      if (batch.length > 0) await handler(batch);
    }
  }

  async stop() {
    this.running = false;
  }
}

module.exports = RedisStreamSink;
