'use strict';

const argon2 = require('argon2');

const MIN_LENGTH = 12;

// Kucuk, yerlesik bir sizinti listesi ornegi. Uretimde Have I Been Pwned
// k-anonimlik API'si ile degistirilebilir (parolanin kendisi asla disariya
// gonderilmez, yalnizca SHA-1 hash'inin ilk 5 karakteri).
const COMMON_PASSWORDS = new Set([
  '123456789012', 'password1234', 'qwertyuiopas', 'letmein123456',
  'admin1234567', 'welcome123456', 'changeme12345', 'password123456',
]);

class PasswordService {
  /** @returns {string[]} bos dizi = gecerli, aksi halde hata mesajlari */
  validatePolicy(password) {
    const errors = [];
    if (!password || password.length < MIN_LENGTH) {
      errors.push(`Parola en az ${MIN_LENGTH} karakter olmali.`);
    }
    if (COMMON_PASSWORDS.has(password)) {
      errors.push('Bu parola bilinen sizinti listelerinde yer aliyor, baska bir parola secin.');
    }
    return errors;
  }

  async hash(password) {
    // argon2id: hem yan-kanal hem GPU/ASIC saldirilarina karsi dengeli - MD5/SHA ailesi kesinlikle kullanilmaz.
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}

module.exports = PasswordService;
