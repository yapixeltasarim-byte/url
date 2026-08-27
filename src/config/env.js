'use strict';

require('dotenv').config();

// PORT kasitli olarak burada degil - cPanel/Plesk Node.js Selector (Passenger) surece
// PORT'u kendisi enjekte eder; bunu zorunlu sayip bos deger gorunce surec kapanirsa
// Passenger uygulamayi hic ayaga kaldiramaz ve 503 doner.
const REQUIRED = [
  'NODE_ENV',
  'APP_BASE_URL',
  'CACHE_DRIVER',
  'DATABASE_URL',
  'SESSION_SECRET',
  'CSRF_SECRET',
  'IP_HASH_SALT',
];

const MIN_SECRET_LENGTH = 32;

function fail(message) {
  // Eksik/zayif yapilandirmayla acilan bir uygulama, guvenlik varsayimlarini sessizce ihlal eder.
  // Bu yuzden .env eksikse veya zayifsa surec hic baslamaz.
  // eslint-disable-next-line no-console
  console.error(`[env] ${message}`);
  process.exit(1);
}

for (const key of REQUIRED) {
  if (!process.env[key] || String(process.env[key]).trim() === '') {
    fail(`Zorunlu ortam degiskeni eksik: ${key}. .env.example dosyasina bakin.`);
  }
}

const cacheDriver = process.env.CACHE_DRIVER;
if (!['memory', 'redis'].includes(cacheDriver)) {
  fail(`CACHE_DRIVER 'memory' veya 'redis' olmali, alinan: ${cacheDriver}`);
}
if (cacheDriver === 'redis' && !process.env.REDIS_URL) {
  fail('CACHE_DRIVER=redis iken REDIS_URL zorunludur.');
}

for (const key of ['SESSION_SECRET', 'CSRF_SECRET', 'IP_HASH_SALT']) {
  if (process.env[key].length < MIN_SECRET_LENGTH) {
    fail(`${key} en az ${MIN_SECRET_LENGTH} karakter olmali (guclu, rastgele bir deger uretin).`);
  }
}
if (process.env.SESSION_SECRET === process.env.CSRF_SECRET) {
  fail('SESSION_SECRET ve CSRF_SECRET ayni olamaz.');
}

const nodeEnv = process.env.NODE_ENV;
const isProduction = nodeEnv === 'production';
const cookieSecure = isProduction ? true : process.env.COOKIE_SECURE === 'true';

if (isProduction && !cookieSecure) {
  fail('Uretimde COOKIE_SECURE=false kabul edilmez; oturum cerezi HTTPS uzerinden korunmalidir.');
}

module.exports = {
  nodeEnv,
  isProduction,
  // Bos/eksikse 3000'e duser; cPanel/Plesk zaten kendi PORT degerini enjekte eder.
  port: Number(process.env.PORT) || 3000,
  appBaseUrl: process.env.APP_BASE_URL.replace(/\/+$/, ''),
  cacheDriver,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || null,
  sessionSecret: process.env.SESSION_SECRET,
  csrfSecret: process.env.CSRF_SECRET,
  ipHashSalt: process.env.IP_HASH_SALT,
  cookieSecure,
  cookieName: cookieSecure ? '__Host-session' : 'session_id',
  clickRetentionDays: Number(process.env.CLICK_RETENTION_DAYS || 90),
  sinkFlushIntervalMs: Number(process.env.SINK_FLUSH_INTERVAL_MS || 5000),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || null,
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || null,
};
