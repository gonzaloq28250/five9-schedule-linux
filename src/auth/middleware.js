const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'five9-schedule-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

function generateToken(user, roles) {
  return jwt.sign(
    { sub: user.id, username: user.username, roles },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token de autenticación requerido.' });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({ success: false, error: 'Sin permisos.' });
    }
    const hasRole = roles.some(role => req.user.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ success: false, error: `Se requiere rol: ${roles.join(' o ')}.` });
    }
    next();
  };
}

module.exports = { generateToken, verifyToken, authMiddleware, requireRole, JWT_SECRET };
