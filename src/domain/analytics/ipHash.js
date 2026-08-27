'use strict';

const crypto = require('crypto');

/**
 * Ham IP kisisel veridir ve kalici olarak saklanmaz (KVKK, bkz. Bolum 4.8).
 * Tuzlanmis hash tekil ziyaretci sayimini mumkun kilar ama geri donusturulemez.
 * Tuz (IP_HASH_SALT) duzenli araliklarla dondurulmelidir.
 */
function hashIp(ip, salt) {
  if (!ip) return null;
  return crypto.createHmac('sha256', salt).update(ip).digest('hex');
}

module.exports = { hashIp };
