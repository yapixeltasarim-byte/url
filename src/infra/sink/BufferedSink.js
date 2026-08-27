'use strict';

const EventSink = require('./EventSink');

/**
 * Demo/tek-surec uygulamasi: olaylari RAM'de tamponlar, periyodik olarak
 * kayitli tuketiciye toplu halde teslim eder. Surec habersiz kapanirsa
 * tampondaki olaylar kaybolur - bu yuzden demo sunumunda aralik kisa tutulur
 * (bkz. Bolum 3.2).
 */
class BufferedSink extends EventSink {
  constructor({ flushIntervalMs = 5000 } = {}) {
    super();
    this.buffer = [];
    this.handler = null;
    this.flushIntervalMs = flushIntervalMs;
    this.timer = null;
    this.flushing = false;
  }

  async push(event) {
    this.buffer.push(event);
  }

  registerConsumer(handler) {
    this.handler = handler;
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
      this.timer.unref?.();
    }
  }

  async flush() {
    if (this.flushing || this.buffer.length === 0 || !this.handler) return;
    this.flushing = true;
    const batch = this.buffer;
    this.buffer = [];
    try {
      await this.handler(batch);
    } catch (err) {
      // Kayit basarisiz olsa bile yonlendirme etkilenmemeli; olaylari geri koyup tekrar dene.
      this.buffer = batch.concat(this.buffer);
      // eslint-disable-next-line no-console
      console.error('[BufferedSink] flush basarisiz, olaylar geri kondu:', err.message);
    } finally {
      this.flushing = false;
    }
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}

module.exports = BufferedSink;
