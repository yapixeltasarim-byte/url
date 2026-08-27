'use strict';

require('../config/env');
const prisma = require('../infra/db/prisma');

async function main() {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  // eslint-disable-next-line no-console
  console.log(`[cleanupSessions] ${result.count} suresi gecmis oturum silindi.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[cleanupSessions] basarisiz:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
