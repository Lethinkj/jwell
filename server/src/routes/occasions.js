const express = require('express');
const { get, all, run, uid } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');
const { ensureFestivalDefaults } = require('../services/festivals');
const occasions = require('../services/occasions');
const { getSettings } = require('./admin');

const router = express.Router();
router.use(auth);
router.use(requireRoles('admin'));

// ---- Upcoming occasions (birthdays / anniversaries / festivals) ----
router.get('/occasions/upcoming', async (req, res) => {
  const days = req.query.days != null ? Number(req.query.days) : undefined;
  res.json({ data: await occasions.getUpcoming(req.user.shop_id, days) });
});

// ---- Send greetings now (default message or an inline override) ----
router.post('/occasions/send', async (req, res) => {
  const { kind, customer_ids, festival_id, subject, body, body_format, include_non_consent } = req.body || {};
  if (!['birthday', 'anniversary', 'festival'].includes(kind)) {
    return res.status(400).json({ error: 'bad_request', message: 'kind must be birthday|anniversary|festival' });
  }
  const r = await occasions.sendOccasions(req.user.shop_id, {
    kind, customerIds: customer_ids, festivalId: festival_id,
    subject, body, body_format, includeNonConsent: !!include_non_consent,
  });
  if (r.error === 'bad_kind') return res.status(400).json({ error: 'bad_request', message: 'invalid kind' });
  if (r.error === 'festival_not_found') return res.status(404).json({ error: 'not_found', message: 'festival not found' });
  audit(req.user.user_id, `occasion.send.${kind}`, 'shop', req.user.shop_id, `${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed (${r.recipients} recipients)`);
  res.json({ data: r });
});

// ---- Auto-send toggle/window (stored in shop_settings) ----
async function setSetting(shopId, key, value) {
  const exists = await get('SELECT 1 FROM shop_settings WHERE shop_id = ? AND key = ?', shopId, key);
  if (exists) await run('UPDATE shop_settings SET value = ? WHERE shop_id = ? AND key = ?', String(value), shopId, key);
  else await run('INSERT INTO shop_settings (shop_id, key, value) VALUES (?,?,?)', shopId, key, String(value));
}

router.get('/occasions/auto', async (req, res) => {
  const s = await getSettings(req.user.shop_id);
  res.json({ data: { enabled: String(s.occasion_autosend) === 'yes', window_days: Number(s.occasion_window_days) || 10 } });
});

router.put('/occasions/auto', async (req, res) => {
  const { enabled, window_days } = req.body || {};
  if (enabled !== undefined) {
    if (!['yes', 'no'].includes(enabled === true ? 'yes' : enabled === false ? 'no' : String(enabled))) {
      return res.status(400).json({ error: 'bad_request', message: 'enabled must be yes/no' });
    }
    await setSetting(req.user.shop_id, 'occasion_autosend', enabled === true ? 'yes' : enabled === false ? 'no' : String(enabled));
  }
  if (window_days !== undefined) {
    const n = Number(window_days);
    if (!Number.isInteger(n) || n < 1 || n > 60) return res.status(400).json({ error: 'bad_request', message: 'window_days must be 1..60' });
    await setSetting(req.user.shop_id, 'occasion_window_days', n);
  }
  audit(req.user.user_id, 'occasions.auto_update', 'shop', req.user.shop_id, `auto-send ${enabled ?? ''} window ${window_days ?? ''}`);
  const s = await getSettings(req.user.shop_id);
  res.json({ data: { enabled: String(s.occasion_autosend) === 'yes', window_days: Number(s.occasion_window_days) || 10 } });
});

// ---- Festivals CRUD (admin-managed, seeded on first access) ----
router.get('/festivals', async (req, res) => {
  await ensureFestivalDefaults(req.user.shop_id);
  const rows = await all('SELECT * FROM festivals WHERE shop_id = ? ORDER BY festival_date NULLS LAST, name', req.user.shop_id);
  res.json({ data: rows });
});

const cleanDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : null);

router.post('/festivals', async (req, res) => {
  const { name, festival_date, recurring, subject, body, body_format, enabled } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'bad_request', message: 'name required' });
  const dup = await get('SELECT id FROM festivals WHERE shop_id = ? AND name = ?', req.user.shop_id, String(name).trim());
  if (dup) return res.status(409).json({ error: 'conflict', message: 'A festival with this name already exists' });
  const id = uid('fes');
  await run(`INSERT INTO festivals (id, shop_id, name, festival_date, recurring, subject, body, body_format, enabled)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    id, req.user.shop_id, String(name).trim(), cleanDate(festival_date),
    recurring === undefined ? 1 : (recurring ? 1 : 0),
    subject != null ? String(subject) : '', body != null ? String(body) : '',
    body_format === 'text' ? 'text' : 'html', enabled === undefined ? 1 : (enabled ? 1 : 0));
  audit(req.user.user_id, 'festival.create', 'festival', id, String(name).trim());
  res.status(201).json({ data: await get('SELECT * FROM festivals WHERE id = ?', id) });
});

router.patch('/festivals/:id', async (req, res) => {
  const cur = await get('SELECT * FROM festivals WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const { name, festival_date, recurring, subject, body, body_format, enabled } = req.body || {};
  const sets = []; const args = [];
  if (name !== undefined) { sets.push('name = ?'); args.push(String(name).trim()); }
  if (festival_date !== undefined) { sets.push('festival_date = ?'); args.push(cleanDate(festival_date)); }
  if (recurring !== undefined) { sets.push('recurring = ?'); args.push(recurring ? 1 : 0); }
  if (subject !== undefined) { sets.push('subject = ?'); args.push(String(subject)); }
  if (body !== undefined) { sets.push('body = ?'); args.push(String(body)); }
  if (body_format !== undefined) { sets.push('body_format = ?'); args.push(body_format === 'text' ? 'text' : 'html'); }
  if (enabled !== undefined) { sets.push('enabled = ?'); args.push(enabled ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: 'bad_request', message: 'nothing to update' });
  sets.push('updated_at = now()'); args.push(req.params.id);
  await run(`UPDATE festivals SET ${sets.join(', ')} WHERE id = ?`, ...args);
  audit(req.user.user_id, 'festival.update', 'festival', req.params.id, `updated ${cur.name}`);
  res.json({ data: await get('SELECT * FROM festivals WHERE id = ?', req.params.id) });
});

router.delete('/festivals/:id', async (req, res) => {
  const cur = await get('SELECT * FROM festivals WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  await run('DELETE FROM festivals WHERE id = ?', req.params.id);
  audit(req.user.user_id, 'festival.delete', 'festival', req.params.id, `deleted ${cur.name}`);
  res.json({ data: { id: req.params.id } });
});

router.post('/festivals/:id/send', async (req, res) => {
  const { customer_ids, subject, body, body_format } = req.body || {};
  const r = await occasions.sendOccasions(req.user.shop_id, {
    kind: 'festival', festivalId: req.params.id, customerIds: customer_ids, subject, body, body_format,
  });
  if (r.error === 'festival_not_found') return res.status(404).json({ error: 'not_found' });
  audit(req.user.user_id, 'festival.send', 'festival', req.params.id, `${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed`);
  res.json({ data: r });
});

module.exports = router;
