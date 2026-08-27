'use strict';

const express = require('express');
const { requirePermission } = require('../../middleware/permissions');
const { clientIp } = require('../../middleware/rateLimit');
const { LastAdminError } = require('../../../domain/users/UserService');

const ROLES = ['editor', 'manager', 'admin'];

function buildUsersApiRouter({ userService }) {
  const router = express.Router();

  router.get('/', requirePermission('user.manage'), async (req, res, next) => {
    try {
      const users = await userService.listUsers();
      res.json({ users: users.map(({ passwordHash, totpSecret, ...safe }) => safe) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requirePermission('user.manage'), async (req, res, next) => {
    try {
      const { email, password, role } = req.body || {};
      if (!email || !password || !ROLES.includes(role)) {
        return res.status(400).json({ error: 'invalid_input', message: 'E-posta, parola ve gecerli bir rol zorunludur.' });
      }
      const user = await userService.createUser({ email, password, role, createdBy: req.user.id, ip: clientIp(req) });
      const { passwordHash, totpSecret, ...safe } = user;
      res.status(201).json({ user: safe });
    } catch (err) {
      if (err.code === 'weak_password') return res.status(400).json({ error: err.code, message: err.message });
      if (err.code === 'P2002') return res.status(409).json({ error: 'email_taken', message: 'Bu e-posta zaten kayitli.' });
      next(err);
    }
  });

  router.patch('/:id/role', requirePermission('user.role.assign'), async (req, res, next) => {
    try {
      const { role } = req.body || {};
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });
      const user = await userService.changeRole(Number(req.params.id), role, req.user.id, clientIp(req));
      const { passwordHash, totpSecret, ...safe } = user;
      res.json({ user: safe });
    } catch (err) {
      if (err instanceof LastAdminError) return res.status(409).json({ error: 'last_admin', message: err.message });
      next(err);
    }
  });

  router.patch('/:id/active', requirePermission('user.manage'), async (req, res, next) => {
    try {
      const { isActive } = req.body || {};
      const user = await userService.setActive(Number(req.params.id), Boolean(isActive), req.user.id, clientIp(req));
      const { passwordHash, totpSecret, ...safe } = user;
      res.json({ user: safe });
    } catch (err) {
      if (err instanceof LastAdminError) return res.status(409).json({ error: 'last_admin', message: err.message });
      next(err);
    }
  });

  router.patch('/me/password', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'unauthorized' });
      const { currentPassword, newPassword } = req.body || {};
      const ok = await userService.changeOwnPassword(req.user.id, currentPassword, newPassword);
      if (!ok.success) return res.status(400).json({ error: ok.code, message: ok.message });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildUsersApiRouter };
