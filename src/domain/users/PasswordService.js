'use strict';

const bcrypt = require('bcryptjs');

// Saf JS bcrypt; native/thread yok. Maliyet 10 paylasimli hostingde makul surede biter.
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
    if (!password) {
      errors.push('Parola zorunludur.');
    }
    if (COMMON_PASSWORDS.has(password)) {
      errors.push('Bu parola bilinen sızıntı listelerinde yer alıyor, başka bir parola seçin.');
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
        // argon2 native modulu bu sunucuda "Threading failure" cikardigi ve
        // artik hicbir aktif hesap argon2 hash'i tasimadigi icin (hepsi
        // bcrypt'e cevrildi) modul projeden tamamen kaldirildi. Eski bir
        // hash rastlanirsa reddedilir - o hesap yeniden olusturulmalidir.
        return false;
      }
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
}

module.exports = PasswordService;
