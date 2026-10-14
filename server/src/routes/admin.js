const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { get, all, run, uid } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();
router.use(auth);
router.use(requireRoles('admin'));

const SAFE_PROFILE_COLS = 'user_id, shop_id, role, display_name, email, phone, active, is_primary, last_login_at';

// ---- Staff management (billing accounts only; exactly one primary admin) ----
router.get('/staff', async (req, res) => {
  const rows = await all(`SELECT ${SAFE_PROFILE_COLS} FROM profiles WHERE shop_id = ? ORDER BY role, display_name`, req.user.shop_id);
  res.json({ data: rows });
});

router.post('/staff', async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'bad_request', message: 'name, email, password required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'bad_request', message: 'password must be at least 8 characters' });
  const em = String(email).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return res.status(400).json({ error: 'bad_request', message: 'valid email required' });
  const dup = await get('SELECT user_id FROM profiles WHERE email = ?', em);
  if (dup) return res.status(409).json({ error: 'conflict', message: 'Login email already in use' });
  const id = uid('usr');
  await run(`INSERT INTO profiles (user_id, shop_id, role, display_name, email, phone, password_hash, active, is_primary)
    VALUES (?,?,?,?,?,?,?,1,0)`, id, req.user.shop_id, 'billing', name, em, phone || null, bcrypt.hashSync(String(password), 10));
  audit(req.user.user_id, 'staff.create', 'profile', id, `billing account ${em} (${name})`);
  res.status(201).json({ data: await get(`SELECT ${SAFE_PROFILE_COLS} FROM profiles WHERE user_id = ?`, id) });
});

router.patch('/staff/:id', async (req, res) => {
  const cur = await get('SELECT * FROM profiles WHERE user_id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const { name, phone, active } = req.body || {};
  if (cur.role === 'admin' && cur.is_primary) {
    if (active === false || active === 0) return res.status(409).json({ error: 'conflict', message: 'Cannot deactivate the primary admin account' });
  }
  if (cur.user_id === req.user.user_id && (active === false || active === 0)) {
    return res.status(409).json({ error: 'conflict', message: 'You cannot deactivate your own account' });
  }
  if (req.body.role && req.body.role !== cur.role) {
    return res.status(403).json({ error: 'forbidden', message: 'Role changes are not permitted (single-admin model)' });
  }
  const sets = []; const args = [];
  if (name !== undefined) { sets.push('display_name = ?'); args.push(name); }
  if (phone !== undefined) { sets.push('phone = ?'); args.push(phone || null); }
  if (active !== undefined) { sets.push('active = ?'); args.push(active ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: 'bad_request', message: 'nothing to update' });
  args.push(cur.user_id);
  await run(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = ?`, ...args);
  audit(req.user.user_id, 'staff.update', 'profile', cur.user_id, `updated ${cur.email}${active === false ? ' (deactivated)' : active === true ? ' (activated)' : ''}`);
  res.json({ data: await get(`SELECT ${SAFE_PROFILE_COLS} FROM profiles WHERE user_id = ?`, cur.user_id) });
});

// Admin-initiated password reset: sets a fresh secret, returns it ONCE (never stored/displayed again).
router.post('/staff/:id/reset-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const cur = await get('SELECT * FROM profiles WHERE user_id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  let next = req.body && req.body.newPassword ? String(req.body.newPassword) : crypto.randomBytes(9).toString('base64url');
  if (next.length < 8) return res.status(400).json({ error: 'bad_request', message: 'password must be at least 8 characters' });
  await run('UPDATE profiles SET password_hash = ? WHERE user_id = ?', bcrypt.hashSync(next, 10), cur.user_id);
  audit(req.user.user_id, 'staff.reset_password', 'profile', cur.user_id, `password reset for ${cur.email}`);
  res.json({ data: { user_id: cur.user_id, email: cur.email, temporaryPassword: next, note: 'Share once over a trusted channel; it cannot be retrieved again.' } });
});

router.get('/staff/:id/activity', async (req, res) => {
  const cur = await get('SELECT user_id FROM profiles WHERE user_id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const rows = await all('SELECT id, action, entity_type, entity_id, summary, created_at FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC LIMIT 100', cur.user_id);
  res.json({ data: rows });
});

// ---- Shop settings (details, invoice, barcode/label, app) ----
const SETTING_DEFAULTS = {
  shop_name: 'Shree Gold Palace',
  shop_address: 'MG Road, Bengaluru',
  shop_phone: '+91 80000 00000',
  invoice_prefix: 'INV',
  invoice_footer: 'BIS hallmarked jewellery. Prices include GST as shown.',
  label_width_mm: '50',
  label_height_mm: '30',
  label_margin_mm: '2',
  label_show_price: 'yes',
};

async function getSettings(shopId) {
  const rows = await all('SELECT key, value FROM shop_settings WHERE shop_id = ?', shopId);
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

router.get('/settings', async (req, res) => {
  res.json({ data: await getSettings(req.user.shop_id) });
});

router.put('/settings', async (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(SETTING_DEFAULTS);
  const updates = keys.filter((k) => body[k] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'bad_request', message: 'no known settings provided' });
  if (body.label_show_price !== undefined && !['yes', 'no'].includes(String(body.label_show_price))) {
    return res.status(400).json({ error: 'bad_request', message: 'label_show_price must be yes/no' });
  }
  for (const k of updates) {
    const exists = await get('SELECT 1 FROM shop_settings WHERE shop_id = ? AND key = ?', req.user.shop_id, k);
    if (exists) await run('UPDATE shop_settings SET value = ? WHERE shop_id = ? AND key = ?', String(body[k]), req.user.shop_id, k);
    else await run('INSERT INTO shop_settings (shop_id, key, value) VALUES (?,?,?)', req.user.shop_id, k, String(body[k]));
  }
  audit(req.user.user_id, 'settings.update', 'shop', req.user.shop_id, `updated: ${updates.join(', ')}`);
  res.json({ data: await getSettings(req.user.shop_id) });
});

module.exports = router;
module.exports.getSettings = getSettings;
module.exports.SETTING_DEFAULTS = SETTING_DEFAULTS;
