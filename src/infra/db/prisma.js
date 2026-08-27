'use strict';

const { PrismaClient } = require('@prisma/client');

// Tek bir PrismaClient ornegi - `node --watch` yeniden yuklemelerinde
// baglanti havuzunun cogalmasini onlemek icin global'e sabitlenir.
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
