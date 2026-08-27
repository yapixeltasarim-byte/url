'use strict';

const path = require('path');
const express = require('express');
const { getContainer } = require('./config/container');

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

const { buildAuthRouter } = require('./http/routes/auth');
const { buildRedirectRouter } = require('./http/routes/redirect');
const { buildPanelRouter } = require('./http/routes/panel');
const { buildLinksApiRouter } = require('./http/routes/api/links');
const { buildUsersApiRouter } = require('./http/routes/api/users');
const { buildDomainsApiRouter } = require('./http/routes/api/domains');
const { buildAnalyticsApiRouter } = require('./http/routes/api/analytics');

const { env, prisma, cache, sink, limiter } = getContainer();

// --- Servisler (domain/) - req/res bilmezler ---
const auditLogger = new AuditLogger(prisma);
const passwordService = new PasswordService();
const userService = new UserService(prisma, passwordService, auditLogger);
const sessionService = new SessionService(prisma);
const urlValidator = new UrlValidator(prisma);
const codeGenerator = new CodeGenerator();
const linkService = new LinkService({ prisma, cache, urlValidator, codeGenerator, auditLogger });
const domainService = new DomainService(prisma, auditLogger);
const clickRecorder = new ClickRecorder(prisma, env.ipHashSalt);
const analyticsService = new AnalyticsService(prisma);

// EventSink tuketicisi: tampondaki tiklama olaylarini periyodik olarak veritabanina yazar.
sink.registerConsumer((events) => clickRecorder.persist(events));

const app = express();

// Cloudflare/ters proxy arkasinda gercek istemci IP'sini almak icin (bkz. Bolum 3.1 Faz 4).
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'http', 'views'));
app.locals.appBaseUrl = env.appBaseUrl;
// Statik dosya linklerine eklenir (?v=...) - surec her yeniden basladiginda degisir,
// boylece tarayici onbellegi CSS/JS guncellemelerini asla gizlemez.
app.locals.assetVersion = env.isProduction ? require('../package.json').version : Date.now();

app.use(securityHeaders());
// Gelistirmede agresif tarayici onbellegi CSS/JS degisikliklerini gizler;
// uretimde dosya adina hash eklenmeden maxAge kullanilmamali.
app.use('/public', express.static(path.join(__dirname, '..', 'public'), {
  maxAge: env.isProduction ? '1h' : 0,
  etag: true,
}));

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use(attachUser(sessionService));
app.use(attachCsrfToken);

// --- Kimlik dogrulama (login CSRF-siz, oturum oncesi; logout kendi icinde korur) ---
app.use('/', buildAuthRouter({ userService, sessionService, limiter }));

// --- Panel (sunucu tarafi sablonlar) ---
app.use('/', buildPanelRouter({ linkService, analyticsService, userService, domainService, auditLogger }));

// --- JSON API (mutasyonlar CSRF ile korunur - bkz. Bolum 4.6) ---
app.use('/api', verifyCsrf);
app.use('/api/links', buildLinksApiRouter({ linkService }));
app.use('/api/users', buildUsersApiRouter({ userService }));
app.use('/api/domains', buildDomainsApiRouter({ domainService }));
app.use('/api/analytics', buildAnalyticsApiRouter({ analyticsService, auditLogger }));

app.get('/', (req, res) => res.redirect(req.user ? '/panel' : '/login'));

// --- Yonlendirme uc noktasi - EN SONA mount edilir, digerlerini golgelemesin ---
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

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[index] ${env.nodeEnv} ortaminda dinleniyor: ${env.appBaseUrl} (port ${env.port})`);
});

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[index] ${signal} alindi, kapatiliyor...`);
  server.close();
  await sink.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
