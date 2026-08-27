'use strict';

/**
 * Tiklama olaylari icin genel amacli, yaniti bekletmeyen kuyruk sozlesmesi.
 * `push` cagirani asla bekletmemelidir - redirect akisinin yaniti gonderildikten
 * SONRA cagrilir (bkz. Bolum 8.1).
 */
class EventSink {
  // eslint-disable-next-line no-unused-vars
  async push(event) {
    throw new Error('EventSink.push uygulanmadi');
  }

  /**
   * Bir tuketici kaydeder; uygulama periyodik olarak biriken olaylari
   * toplu halde bu callback'e verir. Callback `async (events: object[]) => void`.
   */
  // eslint-disable-next-line no-unused-vars
  registerConsumer(handler) {
    throw new Error('EventSink.registerConsumer uygulanmadi');
  }

  async stop() {}
}

module.exports = EventSink;
