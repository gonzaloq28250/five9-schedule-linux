const express = require('express');
const { authMiddleware, requireRole } = require('../auth/middleware');
const { listUsers, createUser, updateUser, resetPassword, deleteUser, VALID_ROLES } = require('../auth/service');
const { db } = require('../db');

function createAdminRouter() {
  const router = express.Router();

  router.use(authMiddleware);
  router.use(requireRole('admin'));

  router.get('/api/admin/users', async (req, res, next) => {
    try {
      const users = await listUsers();
      res.json({ success: true, users });
    } catch (e) { next(e); }
  });

  router.post('/api/admin/users', async (req, res, next) => {
    try {
      const { username, email, password, displayName, roles } = req.body;
      const user = await createUser({ username, email, password, displayName, roles });

      await db('audit_logs').insert({
        user_id: req.user.sub,
        action: 'user_create',
        entity_type: 'user',
        entity_id: user.id,
        details: JSON.stringify({ username: user.username, roles }),
        ip_address: req.ip || ''
      });

      res.json({ success: true, user });
    } catch (e) { next(e); }
  });

  router.put('/api/admin/users/:id', async (req, res, next) => {
    try {
      const { email, displayName, isActive, roles } = req.body;
      const user = await updateUser(req.params.id, { email, displayName, isActive, roles });

      await db('audit_logs').insert({
        user_id: req.user.sub,
        action: 'user_update',
        entity_type: 'user',
        entity_id: req.params.id,
        details: JSON.stringify({ email, displayName, isActive, roles }),
        ip_address: req.ip || ''
      });

      res.json({ success: true, user });
    } catch (e) { next(e); }
  });

  router.post('/api/admin/users/:id/reset-password', async (req, res, next) => {
    try {
      const { password } = req.body;
      await resetPassword(req.params.id, password);

      await db('audit_logs').insert({
        user_id: req.user.sub,
        action: 'password_reset',
        entity_type: 'user',
        entity_id: req.params.id,
        details: '{}',
        ip_address: req.ip || ''
      });

      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.delete('/api/admin/users/:id', async (req, res, next) => {
    try {
      if (req.params.id === req.user.sub) {
        return res.status(400).json({ success: false, error: 'No puedes eliminarte a ti mismo.' });
      }
      await deleteUser(req.params.id);

      await db('audit_logs').insert({
        user_id: req.user.sub,
        action: 'user_delete',
        entity_type: 'user',
        entity_id: req.params.id,
        details: '{}',
        ip_address: req.ip || ''
      });

      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.get('/api/admin/audit', async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const logs = await db('audit_logs')
        .select('audit_logs.*', 'users.username')
        .leftJoin('users', 'audit_logs.user_id', 'users.id')
        .orderBy('audit_logs.created_at', 'desc')
        .limit(limit);
      res.json({ success: true, logs });
    } catch (e) { next(e); }
  });

  router.get('/api/admin/roles', (req, res) => {
    res.json({ success: true, roles: VALID_ROLES });
  });

  return router;
}

module.exports = createAdminRouter;
