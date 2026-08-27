'use strict';

const express = require('express');
const QRCode = require('qrcode');
const { requirePermission } = require('../middleware/permissions');
const { can } = require('../../domain/users/permissions');
const env = require('../../config/env');

function buildPanelRouter({ linkService, analyticsService, userService, domainService, auditLogger }) {
  const router = express.Router();
  const loadOwner = (req) => linkService.ownerOf(req.params.id);

  router.get('/panel', requirePermission('link.list.own'), async (req, res, next) => {
    try {
      const links = can(req.user, 'link.list.all')
        ? await linkService.listAll()
        : await linkService.listOwn(req.user.id);
      res.render('links-list', { title: 'Bağlantılarım', user: req.user, links });
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/links/new', requirePermission('link.create'), (req, res) => {
    res.render('link-form', { title: 'Yeni Bağlantı', user: req.user, mode: 'create', link: null });
  });

  router.get('/panel/links/:id/edit', requirePermission('link.edit.own', { owner: loadOwner }), async (req, res, next) => {
    try {
      const link = await linkService.getById(req.params.id);
      if (!link) return res.status(404).render('error', { message: 'Bağlantı bulunamadı.' });
      res.render('link-form', { title: 'Bağlantıyı Düzenle', user: req.user, mode: 'edit', link });
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/links/:id/analytics', requirePermission('analytics.view', { owner: loadOwner }), async (req, res, next) => {
    try {
      const link = await linkService.getById(req.params.id);
      if (!link) return res.status(404).render('error', { message: 'Bağlantı bulunamadı.' });
      const overview = await analyticsService.overviewForLink(link.id, { days: 30 });
      res.render('link-analytics', { title: 'Bağlantı Analitiği', user: req.user, link, overview });
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/links/:id/qr', requirePermission('link.list.all', { owner: loadOwner }), async (req, res, next) => {
    try {
      const link = await linkService.getById(req.params.id);
      if (!link) return res.status(404).render('error', { message: 'Bağlantı bulunamadı.' });
      res.render('link-qr', { title: 'QR Kodu', user: req.user, link });
    } catch (err) {
      next(err);
    }
  });

  // errorCorrectionLevel 'H' (%30) - ortasina logo bindirilse bile QR okunabilir kalir.
  router.get('/panel/links/:id/qr.png', requirePermission('link.list.all', { owner: loadOwner }), async (req, res, next) => {
    try {
      const link = await linkService.getById(req.params.id);
      if (!link) return res.status(404).end();
      const shortUrl = `${env.appBaseUrl}/${link.code}`;
      const buffer = await QRCode.toBuffer(shortUrl, { errorCorrectionLevel: 'H', width: 480, margin: 1 });
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'private, max-age=60');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/analytics', requirePermission('analytics.view'), async (req, res, next) => {
    try {
      const overview = await analyticsService.overview({ days: 30 });
      res.render('analytics', {
        title: 'Analitik', user: req.user, overview,
        canExport: can(req.user, 'analytics.export'),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/admin/users', requirePermission('user.manage'), async (req, res, next) => {
    try {
      const users = await userService.listUsers();
      res.render('admin-users', { title: 'Kullanıcılar', user: req.user, users });
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/admin/domains', requirePermission('domain.manage'), async (req, res, next) => {
    try {
      const domains = await domainService.list();
      res.render('admin-domains', { title: 'İzin Listesi', user: req.user, domains });
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/admin/audit', requirePermission('audit.view'), async (req, res, next) => {
    try {
      const entries = await auditLogger.list({ limit: 200 });
      res.render('admin-audit', { title: 'Denetim Kaydı', user: req.user, entries });
    } catch (err) {
      next(err);
    }
  });

  router.get('/panel/account', (req, res) => {
    if (!req.user) return res.redirect('/login');
    res.render('account', { title: 'Hesabım', user: req.user });
  });

  return router;
}

module.exports = { buildPanelRouter };
