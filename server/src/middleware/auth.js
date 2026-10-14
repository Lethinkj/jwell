const jwt = require('jsonwebtoken');
const { get, run, uid } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-please-32chars';

function sign(user) {
  return jwt.sign({ sub: user.user_id, role: user.role, shop_id: user.shop_id, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
}

async function auth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : (req.query.token || null);
    if (!token) return res.status(401).json({ error: 'unauthenticated', message: 'Missing bearer token' });
    const payload = jwt.verify(token, JWT_SECRET);
    const row = await get('SELECT * FROM profiles WHERE user_id = ? AND active = 1', payload.sub);
    if (!row) return res.status(401).json({ error: 'unauthenticated', message: 'User disabled' });
    req.user = { user_id: row.user_id, role: row.role, shop_id: row.shop_id, email: row.email, display_name: row.display_name };
    next();
  } catch {
    return res.status(401).json({ error: 'unauthenticated', message: 'Invalid token' });
  }
}

/** Role hierarchy: owner > manager > inventory/billing. */
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (req.user.role === 'owner') return next();
    if (roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'forbidden', message: `Requires role: ${roles.join('/')}` });
  };
}

async function audit(actorId, action, entityType, entityId, summary, reason = null) {
  try {
    await run(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, summary, reason)
      VALUES (?,?,?,?,?,?,?)`, uid('aud'), actorId, action, entityType, entityId, summary, reason);
  } catch { /* audit must never break the caller */ }
}

module.exports = { sign, auth, requireRoles, audit, JWT_SECRET };
