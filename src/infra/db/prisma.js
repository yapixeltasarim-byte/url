'use strict';

const { PrismaClient } = require('@prisma/client');

// SQLite zaten tek yazarli oldugu icin genis bir baglanti havuzunun hicbir
// faydasi yok; kisitli paylasimli hostingde ise Prisma'nin ic thread havuzu
// hesabin toplam surec/thread limitine (bkz. "islem sayisi limiti" hatalari)
// gereksiz yere katkida bulunuyordu. connection_limit=1 bunu minimuma indirir.
function withConnectionLimit(url) {
  if (!url || url.includes('connection_limit=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=1`;
}

// Tek bir PrismaClient ornegi - `node --watch` yeniden yuklemelerinde
// baglanti havuzunun cogalmasini onlemek icin global'e sabitlenir.
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || new PrismaClient({
  datasourceUrl: withConnectionLimit(process.env.DATABASE_URL),
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
