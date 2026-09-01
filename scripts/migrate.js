'use strict';

require('../src/config/env');
const { getDb, closeDb } = require('../src/infra/db/sqlite');

getDb();
// eslint-disable-next-line no-console
console.log('[migrate] bekleyen migration yok veya uygulandi.');
closeDb();
