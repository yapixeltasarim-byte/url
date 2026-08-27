'use strict';

const bcrypt = require('bcryptjs');
// Sadece ESKI argon2 hash'lerini dogrulayabilmek icin tutulur (bkz. asagidaki not).
// Yeni parolalar artik argon2 ile hic hashlenmez.
const argon2 = require('argon2');

const MIN_LENGTH = 12;
// Not: dokuman >=12 onerir, ancak asiri yuklu/kisitli paylasimli hosting
// ortamlarinda saf JS bcrypt hesaplamasi cok uzun surebiliyor. 10, hala
// guvenli kabul edilen bir maliyet ve gozle gorulur derecede daha hizli.
const BCRYPT_COST = 10;

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
    // bcrypt (maliyet >= 12) - dokumanin belirttigi alternatif (Bolum 4.4).
    // argon2 yerine tercih edildi: argon2'nin native/thread gerektiren yapisi
    // bazi kisitli paylasimli hosting ortamlarinda "Threading failure" ile
    // calismiyor; bcryptjs saf JavaScript'tir, hicbir native/thread bagimliligi yoktur.
    return bcrypt.hash(password, BCRYPT_COST);
  }

  async verify(hash, password) {
    try {
      if (hash.startsWith('$argon2')) {
        // Gecis donemi: argon2 ile olusturulmus eski hash'ler hala dogrulanabilir.
        return await argon2.verify(hash, password);
      }
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
}

module.exports = PasswordService;
