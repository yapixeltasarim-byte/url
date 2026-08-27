'use strict';

require('../config/env');
const prisma = require('../infra/db/prisma');
const RollupJob = require('../domain/analytics/RollupJob');

async function main() {
  const job = new RollupJob(prisma);
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
  .finally(() => prisma.$disconnect());
