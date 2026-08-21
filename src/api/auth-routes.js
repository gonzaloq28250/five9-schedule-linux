const express = require('express');
const { db } = require('../db');
const { validatePassword, getUserById } = require('../auth/service');
const { generateToken, authMiddleware } = require('../auth/middleware');

function createAuthRouter() {
  const router = express.Router();

  router.post('/api/auth/login', async (req, res, next) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username y password son obligatorios.' });
      }

      const user = await validatePassword(username, password);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Credenciales inválidas o usuario deshabilitado.' });
      }

      const token = generateToken(user, user.roles);

      await db('user_sessions').insert({
        user_id: user.id,
        token_hash: require('crypto').createHash('sha256').update(token).digest('hex'),
        ip_address: req.ip || '',
        user_agent: (req.headers['user-agent'] || '').substring(0, 500),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      res.json({
        success: true,
        token,
        user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, roles: user.roles }
      });
    } catch (e) { next(e); }
  });

  router.post('/api/auth/logout', authMiddleware, async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const tokenHash = require('crypto').createHash('sha256').update(authHeader.slice(7)).digest('hex');
        await db('user_sessions').where('token_hash', tokenHash).del();
      }
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.get('/api/auth/me', authMiddleware, async (req, res, next) => {
    try {
      const user = await getUserById(req.user.sub);
      if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
      res.json({ success: true, user });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = createAuthRouter;
