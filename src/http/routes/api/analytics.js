'use strict';

const express = require('express');
const { requirePermission } = require('../../middleware/permissions');
const { toCsv } = require('../../../domain/analytics/AnalyticsService');

function buildAnalyticsApiRouter({ analyticsService, auditLogger }) {
  const router = express.Router();

  router.get('/overview', requirePermission('analytics.view'), async (req, res, next) => {
    try {
      const days = Math.min(Number(req.query.days) || 30, 365);
      res.json(await analyticsService.overview({ days }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/export.csv', requirePermission('analytics.export'), async (req, res, next) => {
    try {
      const rows = await analyticsService.exportCsvRows({ days: 90 });
      await auditLogger.log({ userId: req.user.id, action: 'analytics.export', entity: 'click_daily', ip: req.ip });
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="analitik-disa-aktarim.csv"');
      res.send(toCsv(rows));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAnalyticsApiRouter };
