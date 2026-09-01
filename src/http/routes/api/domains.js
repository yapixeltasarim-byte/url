'use strict';

const express = require('express');
const { requirePermission } = require('../../middleware/permissions');
const { clientIp } = require('../../middleware/rateLimit');

function buildDomainsApiRouter({ domainService }) {
  const router = express.Router();

  router.get('/', requirePermission('domain.manage'), async (req, res, next) => {
    try {
      res.json({ domains: await domainService.list() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requirePermission('domain.manage'), async (req, res, next) => {
    try {
      const { pattern, note } = req.body || {};
      const domain = await domainService.create({ pattern, note, createdBy: req.user.id, ip: clientIp(req) });
      res.status(201).json({ domain });
    } catch (err) {
      if (err.code === 'invalid_pattern') return res.status(400).json({ error: err.code, message: err.message });
      if (String(err.code || '').startsWith('SQLITE_CONSTRAINT_UNIQUE')) {
        return res.status(409).json({ error: 'duplicate_pattern', message: 'Bu desen zaten kayıtlı.' });
      }
      next(err);
    }
  });

  router.patch('/:id/active', requirePermission('domain.manage'), async (req, res, next) => {
    try {
      const { isActive } = req.body || {};
      const domain = await domainService.setActive(Number(req.params.id), Boolean(isActive), req.user.id, clientIp(req));
      res.json({ domain });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildDomainsApiRouter };
