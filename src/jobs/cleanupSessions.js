'use strict';

require('../config/env');
const { getDb, closeDb } = require('../infra/db/sqlite');
const { nowIso } = require('../infra/db/rows');

async function main() {
  const db = getDb();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
  // eslint-disable-next-line no-console
  console.log(`[cleanupSessions] ${result.changes} suresi gecmis oturum silindi.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[cleanupSessions] basarisiz:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
