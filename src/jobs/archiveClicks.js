'use strict';

require('../config/env');
const env = require('../config/env');
const { getDb, closeDb } = require('../infra/db/sqlite');
const { toIso } = require('../infra/db/rows');

/**
 * Ham tiklama kayitlari CLICK_RETENTION_DAYS sonra silinir (bkz. Bolum 4.8 - KVKK).
 * click_daily zaten ozetlenmis oldugu icin analitik ekranlari etkilenmez.
 */
async function main() {
  const db = getDb();
  const cutoff = toIso(new Date(Date.now() - env.clickRetentionDays * 24 * 3600_000));
  const result = db.prepare('DELETE FROM click_events WHERE ts < ?').run(cutoff);
  // eslint-disable-next-line no-console
  console.log(`[archiveClicks] ${result.changes} kayit (${env.clickRetentionDays} gunden eski) silindi.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[archiveClicks] basarisiz:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
