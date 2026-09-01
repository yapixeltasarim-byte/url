'use strict';

require('../config/env');
const { getDb, closeDb } = require('../infra/db/sqlite');
const RollupJob = require('../domain/analytics/RollupJob');

async function main() {
  const db = getDb();
  const job = new RollupJob(db);
  const result = await job.runForDate();
  // eslint-disable-next-line no-console
  console.log('[dailyRollup]', result);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[dailyRollup] basarisiz:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
