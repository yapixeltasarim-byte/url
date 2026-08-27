'use strict';

require('../config/env');
const env = require('../config/env');
const prisma = require('../infra/db/prisma');

/**
 * Ham tiklama kayitlari CLICK_RETENTION_DAYS sonra silinir (bkz. Bolum 4.8 - KVKK).
 * click_daily zaten ozetlenmis oldugu icin analitik ekranlari etkilenmez.
 */
async function main() {
  const cutoff = new Date(Date.now() - env.clickRetentionDays * 24 * 3600_000);
  const result = await prisma.clickEvent.deleteMany({ where: { ts: { lt: cutoff } } });
  // eslint-disable-next-line no-console
  console.log(`[archiveClicks] ${result.count} kayit (${env.clickRetentionDays} gunden eski) silindi.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[archiveClicks] basarisiz:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
