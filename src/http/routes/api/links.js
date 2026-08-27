'use strict';

const express = require('express');
const { requirePermission } = require('../../middleware/permissions');
const { ValidationError } = require('../../../domain/links/UrlValidator');
const { clientIp } = require('../../middleware/rateLimit');
const { can } = require('../../../domain/users/permissions');
const env = require('../../../config/env');

function buildLinksApiRouter({ linkService }) {
  const router = express.Router();

  const loadOwner = (req) => linkService.ownerOf(req.params.id);

  router.get('/', requirePermission('link.list.own'), async (req, res, next) => {
    try {
      const links = can(req.user, 'link.list.all')
        ? await linkService.listAll()
        : await linkService.listOwn(req.user.id);
      res.json({ links });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requirePermission('link.create'), async (req, res, next) => {
    try {
      const { targetUrl, title, campaign, expiresAt, customAlias } = req.body || {};
      const link = await linkService.create({
        targetUrl, title, campaign, expiresAt, customAlias,
        createdBy: req.user.id,
        ip: clientIp(req),
      });
      res.status(201).json({
        link,
        shortUrl: `${env.appBaseUrl}/${link.code}`,
      });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.code, message: err.message });
      if (err.code === 'invalid_alias' || err.code === 'reserved_alias') {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      if (err.code === 'alias_taken') return res.status(409).json({ error: err.code, message: err.message });
      next(err);
    }
  });

  router.patch('/:id', requirePermission('link.edit.own', { owner: loadOwner }), async (req, res, next) => {
    try {
      const { title, campaign, targetUrl, expiresAt } = req.body || {};
      const link = await linkService.edit(req.params.id, { title, campaign, targetUrl, expiresAt }, req.user.id, clientIp(req));
      res.json({ link });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.code, message: err.message });
      next(err);
    }
  });

  router.patch('/:id/disable', requirePermission('link.disable', { owner: loadOwner }), async (req, res, next) => {
    try {
      const link = await linkService.disable(req.params.id, req.user.id, clientIp(req));
      res.json({ link });
    } catch (err) {
      next(err);
    }
  });

  // Yanlislikla pasife alinan bir baglanti geri alinabilir - ayni yetki kurali (sahip veya link.disable) gecerlidir.
  router.patch('/:id/enable', requirePermission('link.disable', { owner: loadOwner }), async (req, res, next) => {
    try {
      const link = await linkService.enable(req.params.id, req.user.id, clientIp(req));
      res.json({ link });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildLinksApiRouter };
