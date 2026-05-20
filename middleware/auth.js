const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'cookapp-dev-secret';

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try {
    const { userId } = jwt.verify(h.slice(7), SECRET);
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(userId) {
  return jwt.sign({ userId }, SECRET, { expiresIn: '90d' });
}

module.exports = { requireAuth, signToken };
