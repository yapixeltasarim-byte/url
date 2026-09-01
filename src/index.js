'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const BOOT_LOG_CANDIDATES = [
  path.join(__dirname, '..', 'data', 'boot.log'),
  path.join(process.cwd(), 'boot.log'),
];
const PID_FILE = path.join(__dirname, '..', 'data', 'app.pid');

function logBoot(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  // eslint-disable-next-line no-console
  console.error(line.trim());
  for (const file of BOOT_LOG_CANDIDATES) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, line);
      return;
    } catch {
      // sonraki yazilabilir yolu dene
    }
  }
}

function createDiagnosticApp(err) {
  const app = express();
  const text = [
    'Uygulama baslamadi.',
    '',
    err && err.message ? err.message : String(err),
    '',
    'Hostinger kontrol listesi:',
    '- Web Apps > Environment: NODE_ENV, APP_BASE_URL, CACHE_DRIVER, DATABASE_URL,',
    '  SESSION_SECRET, CSRF_SECRET, IP_HASH_SALT (git .env tasimaz)',
    '- DATABASE_URL ornek: file:./data/app.db (yazilabilir dizin)',
    '- SESSION_SECRET ve CSRF_SECRET farkli ve en az 32 karakter',
    '- Ayrinti: data/boot.log veya uygulama kokunde boot.log',
  ].join('\n');
  app.use((req, res) => {
    res.status(500).type('text/plain; charset=utf-8').send(text);
  });
  return app;
}

async function buildApp() {
  const { getContainer } = require('./config/container');
  const { closeDb } = require('./infra/db/sqlite');

  const { securityHeaders } = require('./http/middleware/security');
  const { attachUser } = require('./http/middleware/auth');
  const { attachCsrfToken, verifyCsrf } = require('./http/middleware/csrf');

  const AuditLogger = require('./domain/audit/AuditLogger');
  const PasswordService = require('./domain/users/PasswordService');
  const { UserService } = require('./domain/users/UserService');
  const SessionService = require('./domain/users/SessionService');
  const { UrlValidator } = require('./domain/links/UrlValidator');
  const { CodeGenerator } = require('./domain/links/CodeGenerator');
  const { LinkService } = require('./domain/links/LinkService');
  const DomainService = require('./domain/links/DomainService');
  const ClickRecorder = require('./domain/analytics/ClickRecorder');
  const { AnalyticsService } = require('./domain/analytics/AnalyticsService');
  const RollupJob = require('./domain/analytics/RollupJob');

  const { buildSetupRouter } = require('./http/routes/setup');
  const { buildAuthRouter } = require('./http/routes/auth');
  const { buildRedirectRouter } = require('./http/routes/redirect');
  const { buildPanelRouter } = require('./http/routes/panel');
  const { buildLinksApiRouter } = require('./http/routes/api/links');
  const { buildUsersApiRouter } = require('./http/routes/api/users');
  const { buildDomainsApiRouter } = require('./http/routes/api/domains');
  const { buildAnalyticsApiRouter } = require('./http/routes/api/analytics');

  const { env, db, cache, sink, limiter } = getContainer();

  const auditLogger = new AuditLogger(db);
  const passwordService = new PasswordService();
  const { ensureFirstAdmin } = require('./domain/users/ensureFirstAdmin');
  const seed = await ensureFirstAdmin(db, env, passwordService, auditLogger);
  if (seed.created) {
    // eslint-disable-next-line no-console
    console.log(`[seed] ilk admin olusturuldu: ${seed.email}`);
  } else if (seed.reason === 'no_seed') {
    // eslint-disable-next-line no-console
    console.error('[seed] users bos; SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD tanimli degil.');
  }
  const userService = new UserService(db, passwordService, auditLogger);
  const sessionService = new SessionService(db);
  const urlValidator = new UrlValidator(db);
  const codeGenerator = new CodeGenerator();
  const linkService = new LinkService({ db, cache, urlValidator, codeGenerator, auditLogger });
  const domainService = new DomainService(db, auditLogger);
  const clickRecorder = new ClickRecorder(db, env.ipHashSalt);
  const analyticsService = new AnalyticsService(db);

  sink.registerConsumer((events) => clickRecorder.persist(events));

  const rollupJob = new RollupJob(db);
  async function runRollupSafely() {
    try {
      await rollupJob.runForTodayAndYesterday();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[rollup] basarisiz:', err.message);
    }
  }
  const rollupInterval = setInterval(runRollupSafely, 15 * 60_000);
  rollupInterval.unref?.();

  const app = express();

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'http', 'views'));
  app.locals.appBaseUrl = env.appBaseUrl;
  app.locals.assetVersion = Date.now();

  app.use(securityHeaders());
  app.use('/public', express.static(path.join(__dirname, '..', 'public'), {
    maxAge: env.isProduction ? '1h' : 0,
    etag: true,
  }));

  app.use('/', buildSetupRouter({ env, db, passwordService, auditLogger, rollupJob }));

  app.use(express.json({ limit: '20kb' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  app.use(attachUser(sessionService));
  app.use(attachCsrfToken);

  app.use('/', buildAuthRouter({ userService, sessionService, limiter }));
  app.use('/', buildPanelRouter({ linkService, analyticsService, userService, domainService, auditLogger }));

  app.use('/api', verifyCsrf);
  app.use('/api/links', buildLinksApiRouter({ linkService }));
  app.use('/api/users', buildUsersApiRouter({ userService }));
  app.use('/api/domains', buildDomainsApiRouter({ domainService }));
  app.use('/api/analytics', buildAnalyticsApiRouter({ analyticsService, auditLogger }));

  app.get('/', (req, res) => res.redirect(req.user ? '/panel' : '/login'));
  app.use('/', buildRedirectRouter({ linkService, sink, clickRecorder, limiter }));

  app.use((req, res) => {
    res.status(404).render('not-found');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    const message = env.isProduction ? 'İşlem tamamlanamadı.' : err.message;
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'internal_error', message });
    }
    res.status(500).render('error', { message });
  });

  return {
    app,
    env,
    onListening: runRollupSafely,
    async shutdown() {
      clearInterval(rollupInterval);
      await sink.stop();
      closeDb();
    },
  };
}

function writePidFile() {
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, `${process.pid}\n`, 'utf8');
  } catch (err) {
    logBoot(`pid dosyasi yazilamadi: ${err.message}`);
  }
}

function removePidFile() {
  try {
    const recorded = fs.readFileSync(PID_FILE, 'utf8').trim();
    if (recorded === String(process.pid)) fs.unlinkSync(PID_FILE);
  } catch {
    // yoksa sessiz
  }
}

let runtime = null;
let app;
let server;

function onListening() {
  writePidFile();
  const boundPort = Number(process.env.PORT) || (runtime && runtime.env && runtime.env.port) || 3000;
  // eslint-disable-next-line no-console
  console.log(`[index] dinleniyor (port ${boundPort})`);
  if (runtime && runtime.onListening) runtime.onListening();
}

function bind(appToBind) {
  const port = Number(process.env.PORT) || 3000;
  if (typeof PhusionPassenger !== 'undefined') {
    // eslint-disable-next-line no-undef
    PhusionPassenger.configure({ autoInstall: false });
    return appToBind.listen('passenger', onListening);
  }
  return appToBind.listen(port, onListening);
}

async function main() {
  try {
    runtime = await buildApp();
    app = runtime.app;
  } catch (err) {
    logBoot(err.stack || err.message);
    app = createDiagnosticApp(err);
  }
  server = bind(app);
  module.exports = app;
}

main().catch((err) => {
  logBoot(err.stack || String(err));
  process.exit(1);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[index] ${signal} alındı, kapatılıyor...`);
  removePidFile();
  server.close();
  if (runtime && runtime.shutdown) await runtime.shutdown();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logBoot(`uncaughtException ${err.stack || err.message}`);
});
process.on('unhandledRejection', (err) => {
  logBoot(`unhandledRejection ${err && (err.stack || err.message) || err}`);
});
