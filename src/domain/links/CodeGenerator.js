'use strict';

const crypto = require('crypto');

// 0/O ve 1/l/I karisan karakterler cikarildi (bkz. Bolum 4.3).
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 5;

function randomIndex(max) {
  // crypto.randomBytes kullanilir, Math.random ASLA kullanilmaz (tahmin edilebilir cikti uretir).
  // Reddetme orneklemesi modulo yanliligini onler.
  const limit = Math.floor(256 / max) * max;
  let byte;
  do {
    byte = crypto.randomBytes(1)[0];
  } while (byte >= limit);
  return byte % max;
}

function generateCode(length = CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomIndex(ALPHABET.length)];
  }
  return code;
}

class CodeGenerator {
  /**
   * @param {(code: string) => Promise<boolean>} exists - kod veritabaninda kullaniliyor mu
   * @returns {Promise<string>}
   */
  async generateUnique(exists) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const code = generateCode();
      // eslint-disable-next-line no-await-in-loop
      if (!(await exists(code))) return code;
    }
    throw new Error('Benzersiz kısa kod üretilemedi (5 deneme başarısız).');
  }
}

module.exports = { CodeGenerator, generateCode, ALPHABET };
