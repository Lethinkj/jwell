const express = require('express');
const bcrypt = require('bcryptjs');
const { get, nowFn } = require('../db');
const { sign, auth, audit } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { run } = require('../db');

const router = express.Router();

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'bad_request', message: 'email + password required' });
  const row = await get('SELECT * FROM profiles WHERE email = ? AND active = 1', String(email).toLowerCase());
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' });
  }
  await run(`UPDATE profiles SET last_login_at = ${nowFn()} WHERE user_id = ?`, row.user_id);
  const token = sign(row);
  audit(row.user_id, 'auth.login', 'profile', row.user_id, `login ${row.email}`);
  res.json({ token, user: { user_id: row.user_id, email: row.email, role: row.role, display_name: row.display_name, shop_id: row.shop_id } });
});

router.get('/me', auth, (req, res) => res.json({ user: req.user }));
router.post('/logout', auth, (req, res) => {
  audit(req.user.user_id, 'auth.logout', 'profile', req.user.user_id, 'logout');
  res.json({ ok: true });
});

module.exports = router;
