const express = require('express');
const { get, all, run, nowFn, dayExpr, uid } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');
const { normalizePhone, isValidPhone } = require('../services/phone');
const campaignSvc = require('../services/campaigns');

const router = express.Router();
router.use(auth);

// ---- Customers (§5.4): normalized phone is the search key, customer_id the permanent ID ----
async function customerSummary(c) {
  const s = await get(`SELECT COUNT(*) n, COALESCE(SUM(total_inr),0) t, MAX(sold_at) last_at FROM sales
    WHERE customer_id = ? AND status = 'finalized'`, c.id);
  return { bill_count: s.n, total_spent_inr: s.t, last_purchase_at: s.last_at };
}

// Phone-first lookup: returns all matching profiles (shared numbers resolved by staff, never auto-merged)
router.get('/customers/phone/:phone', async (req, res) => {
  const norm = normalizePhone(req.params.phone);
  if (!norm) return res.status(400).json({ error: 'bad_request', message: 'valid phone number required' });
  const matches = await all('SELECT * FROM customers WHERE shop_id = ? AND (normalized_phone = ? OR phone = ?)',
    req.user.shop_id, norm, req.params.phone);
  const data = [];
  for (const m of matches) {
    const purchases = await all(`SELECT s.* FROM sales s WHERE s.customer_id = ? AND s.status = 'finalized' ORDER BY s.sold_at DESC LIMIT 20`, m.id);
    data.push({ ...m, summary: await customerSummary(m), purchases });
  }
  res.json({ data, normalized: norm });
});

// ---- Customers (§5.4) ----
router.get('/customers', async (req, res) => {
  const { q, occasion, category, min_spent, max_spent, from, to, page = 1, limit = 20,
    last_days, lapsed_days, repeat, last_from, last_to } = req.query;
  const conds = ['c.shop_id = ?']; const args = [req.user.shop_id];
  if (q) {
    const norm = normalizePhone(q);
    conds.push('(c.name LIKE ? OR c.phone LIKE ? OR c.normalized_phone LIKE ? OR c.customer_code LIKE ? OR c.email LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${norm}%`, `%${q}%`, `%${q}%`);
  }
  if (min_spent) { conds.push('c.total_spent_inr >= ?'); args.push(Number(min_spent)); }
  if (max_spent) { conds.push('c.total_spent_inr <= ?'); args.push(Number(max_spent)); }
  if (from) { conds.push('c.created_at >= ?'); args.push(from); }
  if (to) { conds.push('c.created_at <= ?'); args.push(to); }
  if (occasion) { conds.push(`EXISTS (SELECT 1 FROM customer_occasions o WHERE o.customer_id=c.id AND o.occasion_type=?)`); args.push(occasion); }
  // Recency filters use finalized sales only (drafts/voids excluded)
  const dayMs = 864e5;
  if (last_days) {
    const cutoff = new Date(Date.now() - Number(last_days) * dayMs).toISOString();
    conds.push(`EXISTS (SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.status='finalized' AND s.sold_at >= ?)`);
    args.push(cutoff);
  }
  if (last_from || last_to) {
    conds.push(`EXISTS (SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.status='finalized'${last_from ? ' AND s.sold_at >= ?' : ''}${last_to ? ' AND s.sold_at <= ?' : ''})`);
    if (last_from) args.push(last_from);
    if (last_to) args.push(last_to);
  }
  if (lapsed_days) {
    const cutoff = new Date(Date.now() - Number(lapsed_days) * dayMs).toISOString();
    conds.push(`EXISTS (SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.status='finalized')`);
    conds.push(`NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.status='finalized' AND s.sold_at >= ?)`);
    args.push(cutoff);
  }
  if (repeat === '1' || repeat === 'true') {
    conds.push(`(SELECT COUNT(*) FROM sales s WHERE s.customer_id=c.id AND s.status='finalized') > 1`);
  }
  if (category) {
    conds.push(`EXISTS (SELECT 1 FROM sales s JOIN sale_items si ON si.sale_id=s.id JOIN products p ON p.id=si.product_id WHERE s.customer_id=c.id AND p.category_id=?)`);
    args.push(category);
  }
  const off = (Number(page) - 1) * Number(limit);
  const rows = await all(`SELECT c.* FROM customers c WHERE ${conds.join(' AND ')} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`, ...args, Number(limit), off);
  const total = (await get(`SELECT COUNT(*) n FROM customers c WHERE ${conds.join(' AND ')}`, ...args)).n;
  res.json({ data: rows, total, page: Number(page) });
});
// Customers must always have a name, phone and a complete postal address.
const CUSTOMER_REQUIRED = ['name', 'phone', 'address_line1', 'city', 'state', 'postal_code'];

router.post('/customers', async (req, res) => {
  const b = req.body || {};
  const missing = CUSTOMER_REQUIRED.filter((k) => !String(b[k] ?? '').trim());
  if (missing.length) return res.status(400).json({ error: 'bad_request', message: `Missing required fields: ${missing.join(', ')}`, fields: missing });
  if (!isValidPhone(b.phone)) return res.status(400).json({ error: 'bad_request', message: 'phone number looks invalid' });
  const norm = normalizePhone(b.phone);
  const existing = await all('SELECT * FROM customers WHERE shop_id = ? AND (normalized_phone = ? OR phone = ?)',
    req.user.shop_id, norm, b.phone);
  if (existing.length) return res.status(409).json({ error: 'duplicate', message: 'Phone already exists — pick the existing profile or resolve duplicates in admin. Records are never silently merged.', data: existing });
  const id = uid('cus');
  const code = `C${String((await get('SELECT COUNT(*) n FROM customers WHERE shop_id=?', req.user.shop_id)).n + 1).padStart(5, '0')}`;
  await run(`INSERT INTO customers (id, shop_id, customer_code, name, phone, normalized_phone, email, address_line1, city, state, postal_code, birthday, anniversary, notes, preferred_channel, marketing_consent)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, req.user.shop_id, code, b.name, b.phone, norm, b.email || null, b.address_line1 || null,
    b.city || null, b.state || null, b.postal_code || null, b.birthday || null, b.anniversary || null, b.notes || null,
    b.preferred_channel || 'both', b.marketing_consent ? 1 : 0);
  audit(req.user.user_id, 'customer.create', 'customer', id, `${code} ${b.name}`);
  res.status(201).json({ data: await get('SELECT * FROM customers WHERE id=?', id) });
});
router.get('/customers/:id', async (req, res) => {
  const c = await get('SELECT * FROM customers WHERE id=?', req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const purchases = await all(`SELECT s.* FROM sales s WHERE s.customer_id=? AND s.status='finalized' ORDER BY s.sold_at DESC LIMIT 50`, c.id);
  const occasions = await all('SELECT * FROM customer_occasions WHERE customer_id=?', c.id);
  const addresses = await all('SELECT * FROM customer_addresses WHERE customer_id=?', c.id);
  const consent = await all('SELECT * FROM consent_events WHERE customer_id=? ORDER BY created_at DESC', c.id);
  res.json({ data: { ...c, purchases, occasions, addresses, consent } });
});
router.patch('/customers/:id', async (req, res) => {
  const cur = await get('SELECT * FROM customers WHERE id=?', req.params.id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const allowed = ['name', 'phone', 'email', 'address_line1', 'city', 'state', 'postal_code', 'birthday', 'anniversary', 'notes', 'preferred_channel'];
  // Keep the mandatory fields present (the edited record must stay valid).
  const missing = CUSTOMER_REQUIRED.filter((k) => !String((b[k] !== undefined ? b[k] : cur[k]) ?? '').trim());
  if (missing.length) return res.status(400).json({ error: 'bad_request', message: `Missing required fields: ${missing.join(', ')}`, fields: missing });
  if (b.phone !== undefined && !isValidPhone(b.phone)) return res.status(400).json({ error: 'bad_request', message: 'phone number looks invalid' });
  if (b.phone !== undefined) {
    const norm = normalizePhone(b.phone);
    const dup = await all('SELECT id FROM customers WHERE shop_id = ? AND id <> ? AND (normalized_phone = ? OR phone = ?)',
      cur.shop_id, cur.id, norm, b.phone);
    if (dup.length) return res.status(409).json({ error: 'duplicate', message: 'Phone already exists on another profile', data: dup });
  }
  const sets = []; const args = [];
  for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(b[k]); }
  if (b.phone !== undefined) { sets.push('normalized_phone = ?'); args.push(normalizePhone(b.phone)); }
  if (b.marketing_consent !== undefined) {
    sets.push('marketing_consent = ?'); args.push(b.marketing_consent ? 1 : 0);
    await run('INSERT INTO consent_events (id, customer_id, channel, purpose, status, source) VALUES (?,?,?,?,?,?)',
      uid('con'), cur.id, cur.preferred_channel, 'marketing', b.marketing_consent ? 'granted' : 'revoked', 'crm-update');
  }
  if (sets.length) { args.push(cur.id); await run(`UPDATE customers SET ${sets.join(', ')} WHERE id=?`, ...args); }
  audit(req.user.user_id, 'customer.update', 'customer', cur.id, 'profile update');
  res.json({ data: await get('SELECT * FROM customers WHERE id=?', cur.id) });
});
router.post('/customers/:id/occasions', async (req, res) => {
  const { occasion_type, occasion_date, notes } = req.body || {};
  if (!occasion_type || !occasion_date) return res.status(400).json({ error: 'bad_request' });
  const id = uid('occ');
  await run('INSERT INTO customer_occasions (id, customer_id, occasion_type, occasion_date, notes) VALUES (?,?,?,?,?)',
    id, req.params.id, occasion_type, occasion_date, notes || null);
  res.status(201).json({ data: await get('SELECT * FROM customer_occasions WHERE id=?', id) });
});

// ---- Offers & Campaigns (§5.7, consent-safe, idempotent) ----
router.get('/offers', async (req, res) => {
  res.json({ data: await all('SELECT * FROM offers WHERE shop_id=? ORDER BY created_at DESC', req.user.shop_id) });
});
router.post('/offers', requireRoles('admin'), async (req, res) => {
  const b = req.body || {};
  if (!b.code) return res.status(400).json({ error: 'bad_request', message: 'code required' });
  const id = uid('off');
  try {
    await run(`INSERT INTO offers (id, shop_id, code, description, discount_type, discount_value, min_purchase_inr, max_discount_inr, eligible_categories, valid_from, valid_to, redemption_limit)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, req.user.shop_id, b.code, b.description || null, b.discount_type || 'flat',
      b.discount_value || 0, b.min_purchase_inr || 0, b.max_discount_inr || null,
      JSON.stringify(b.eligible_categories || []), b.valid_from || null, b.valid_to || null, b.redemption_limit || null);
  } catch { return res.status(409).json({ error: 'conflict', message: 'Offer code exists' }); }
  audit(req.user.user_id, 'offer.create', 'offer', id, b.code);
  res.status(201).json({ data: await get('SELECT * FROM offers WHERE id=?', id) });
});
router.get('/campaigns', requireRoles('admin'), async (req, res) => {
  res.json({ data: await all('SELECT * FROM campaigns WHERE shop_id=? ORDER BY created_at DESC', req.user.shop_id) });
});
router.post('/campaigns', requireRoles('admin'), async (req, res) => {
  const { name, channel = 'whatsapp', mode = 'manual', trigger_type, template, offer_code, schedule_at, audience = {} } = req.body || {};
  if (!name || !template) return res.status(400).json({ error: 'bad_request', message: 'name + template required' });
  const id = uid('cam');
  await run(`INSERT INTO campaigns (id, shop_id, name, channel, mode, trigger_type, template, offer_code, schedule_at, approval_status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, req.user.shop_id, name, channel, mode, trigger_type || null, template, offer_code || null, schedule_at || null, mode === 'manual' ? 'pending_approval' : 'approved', req.user.user_id);
  // Build recipient list: opted-in only, deduped by idempotency key (§6.3/§12 safety)
  const conds = ['shop_id = ? AND marketing_consent = 1']; const args = [req.user.shop_id];
  if (audience.min_spent) { conds.push('total_spent_inr >= ?'); args.push(Number(audience.min_spent)); }
  if (audience.occasion) { conds.push(`EXISTS (SELECT 1 FROM customer_occasions o WHERE o.customer_id=customers.id AND o.occasion_type=?)`); args.push(audience.occasion); }
  const targets = await all(`SELECT * FROM customers WHERE ${conds.join(' AND ')} LIMIT 500`, ...args);
  let queued = 0;
  for (const t of targets) {
    const key = `${id}:${t.id}`;
    try {
      await run(`INSERT INTO campaign_recipients (id, campaign_id, customer_id, status, idempotency_key) VALUES (?,?,?,?,?)`,
        uid('rcp'), id, t.id, 'queued', key);
      queued++;
    } catch { /* duplicate suppressed */ }
  }
  audit(req.user.user_id, 'campaign.create', 'campaign', id, `${name} → ${queued} opted-in recipients`);
  res.status(201).json({ data: { ...(await get('SELECT * FROM campaigns WHERE id=?', id)), queued } });
});
router.patch('/campaigns/:id', requireRoles('admin'), async (req, res) => {
  const cam = await get('SELECT * FROM campaigns WHERE id=? AND shop_id=?', req.params.id, req.user.shop_id);
  if (!cam) return res.status(404).json({ error: 'not_found' });
  if (cam.sent_at) return res.status(409).json({ error: 'already_sent', message: 'A sent campaign can no longer be edited' });
  const { name, channel, mode, trigger_type, template, offer_code, schedule_at } = req.body || {};
  const approval = mode === 'automatic' ? 'approved' : cam.approval_status;
  const pick = (v, cur) => (v === undefined ? cur : (v ?? null));
  await run(`UPDATE campaigns SET name=?, channel=?, mode=?, trigger_type=?, template=?, offer_code=?, schedule_at=?, approval_status=? WHERE id=? AND shop_id=?`,
    pick(name, cam.name), pick(channel, cam.channel), pick(mode, cam.mode), pick(trigger_type, cam.trigger_type),
    pick(template, cam.template), pick(offer_code, cam.offer_code), pick(schedule_at, cam.schedule_at),
    approval, cam.id, req.user.shop_id);
  audit(req.user.user_id, 'campaign.update', 'campaign', cam.id, String(name ?? cam.name));
  res.json({ data: await get('SELECT * FROM campaigns WHERE id=?', cam.id) });
});
router.post('/campaigns/:id/approve', requireRoles('admin'), async (req, res) => {
  await run(`UPDATE campaigns SET approval_status='approved' WHERE id=?`, req.params.id);
  audit(req.user.user_id, 'campaign.approve', 'campaign', req.params.id, 'approved');
  res.json({ data: await get('SELECT * FROM campaigns WHERE id=?', req.params.id) });
});
// Approved-but-unsent campaigns due to be sent — drives the login prompt.
router.get('/campaigns/reminders', requireRoles('admin'), async (req, res) => {
  res.json({ data: await campaignSvc.listReminders(req.user.shop_id) });
});
router.post('/campaigns/:id/send', requireRoles('admin'), async (req, res) => {
  try {
    res.json({ data: await campaignSvc.sendCampaign(req.params.id, { actorId: req.user.user_id }) });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.code || 'error', message: e.message });
  }
});
// Snooze the login prompt ("Remind later").
router.post('/campaigns/:id/remind', requireRoles('admin'), async (req, res) => {
  const hours = Number(req.body?.hours) || 24;
  const data = await campaignSvc.snoozeCampaign(req.params.id, req.user.shop_id, hours);
  if (!data) return res.status(404).json({ error: 'not_found' });
  audit(req.user.user_id, 'campaign.remind', 'campaign', req.params.id, `snoozed ${hours}h`);
  res.json({ data });
});
router.post('/webhooks/messaging-provider', async (req, res) => {
  // Verify signature in production; dedupe by provider_message_id (§9).
  const { provider_message_id, status } = req.body || {};
  if (provider_message_id) {
    await run(`UPDATE campaign_recipients SET status=?, delivered_at=CASE WHEN ?='delivered' THEN ${nowFn()} ELSE delivered_at END WHERE provider_message_id=?`,
      status || 'delivered', status || 'delivered', provider_message_id);
  }
  res.json({ ok: true });
});

// ---- Reports (§10 — single definitions, SQL-aggregated) ----
function range(req) {
  const { preset, from, to } = req.query;
  const now = new Date();
  let s, e = now.toISOString();
  const days = { today: 1, week: 7, month: 30, '3m': 90, '6m': 180, '1y': 365 }[preset];
  if (from && to) { s = from; e = to; }
  else if (days) { s = new Date(now.getTime() - days * 864e5).toISOString(); }
  else { s = new Date(now.getTime() - 30 * 864e5).toISOString(); }
  return { s, e };
}
router.get('/reports/sales', requireRoles('admin'), async (req, res) => {
  const { s, e } = range(req);
  const rows = await all(`SELECT * FROM sales WHERE shop_id=? AND sold_at>=? AND sold_at<=? AND status='finalized'`, req.user.shop_id, s, e);
  const revenue = rows.reduce((a, r) => a + r.total_inr, 0);
  const bills = rows.length;
  const custIds = new Set(rows.map(r => r.customer_id).filter(Boolean));
  const items = await get(`SELECT COUNT(*) n, COALESCE(SUM(si.net_gold_weight_g),0) w FROM sale_items si JOIN sales s ON s.id=si.sale_id
    WHERE s.shop_id=? AND s.sold_at>=? AND s.sold_at<=? AND s.status='finalized'`, req.user.shop_id, s, e);
  const byDay = await all(`SELECT ${dayExpr('sold_at')} d, COUNT(*) bills, SUM(total_inr) revenue FROM sales
    WHERE shop_id=? AND sold_at>=? AND sold_at<=? AND status='finalized' GROUP BY d ORDER BY d`, req.user.shop_id, s, e);
  const byCat = await all(`SELECT c.name category, COUNT(*) pieces, SUM(si.line_total_inr) revenue FROM sale_items si
    JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE s.shop_id=? AND s.sold_at>=? AND s.sold_at<=? AND s.status='finalized' GROUP BY c.name`, req.user.shop_id, s, e);
  const byPay = await all(`SELECT py.method, SUM(py.amount_inr) total FROM payments py JOIN sales s ON s.id=py.sale_id
    WHERE s.shop_id=? AND s.sold_at>=? AND s.sold_at<=? AND s.status='finalized' GROUP BY py.method`, req.user.shop_id, s, e);
  let cogs = 0;
  if (req.user.role === 'owner' || req.user.role === 'manager') {
    cogs = (await get(`SELECT COALESCE(SUM(p.acquisition_cost_inr),0) c FROM sale_items si JOIN sales s ON s.id=si.sale_id
      JOIN products p ON p.id=si.product_id WHERE s.shop_id=? AND s.sold_at>=? AND s.sold_at<=? AND s.status='finalized'`, req.user.shop_id, s, e)).c;
  }
  res.json({ data: {
    from: s, to: e, revenue, bill_count: bills, unique_customers: custIds.size,
    avg_bill: bills ? revenue / bills : 0, items_sold: items.n, gold_weight_g: items.w,
    gross_profit_estimate: req.user.role === 'inventory' || req.user.role === 'billing' ? null : revenue - cogs,
    byDay, byCat, byPay,
  } });
});
router.get('/reports/inventory', requireRoles('admin'), async (req, res) => {
  const byCat = await all(`SELECT c.name category, COUNT(*) pieces, SUM(p.net_gold_weight_g) weight_g, SUM(p.acquisition_cost_inr) acq_inr
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.shop_id=? AND p.status='available' GROUP BY c.name`, req.user.shop_id);
  const low = await all(`SELECT c.name category, COUNT(*) n FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.shop_id=? AND p.status='available' GROUP BY c.name HAVING COUNT(*) < 5`, req.user.shop_id);
  res.json({ data: { byCat, low_stock: low } });
});
router.get('/reports/customers', requireRoles('admin'), async (req, res) => {
  const { s, e } = range(req);
  const created = (await get(`SELECT COUNT(*) n FROM customers WHERE shop_id=? AND created_at>=? AND created_at<=?`, req.user.shop_id, s, e)).n;
  const repeat = (await get(`SELECT COUNT(*) n FROM customers WHERE shop_id=? AND purchase_count > 1`, req.user.shop_id)).n;
  const total = (await get(`SELECT COUNT(*) n FROM customers WHERE shop_id=?`, req.user.shop_id)).n;
  res.json({ data: { new_customers: created, repeat_customers: repeat, total, repeat_rate: total ? repeat / total : 0 } });
});
router.get('/audit-logs', requireRoles('admin'), async (req, res) => {
  res.json({ data: await all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200') });
});

module.exports = router;
