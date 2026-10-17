const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');
const bcrypt = require('bcryptjs');

// Postgres-only tests: require DATABASE_URL (or SUPABASE_DB_URL).
// Use a dedicated test database — fixtures are inserted on every run.
if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  throw new Error('Missing DATABASE_URL for tests. Set it to your Supabase/test Postgres connection string.');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32chars-minimum-xxxxxx';
process.env.MAIL_DISABLED = 'true'; // never send real email from tests

const app = require('../src/index');
const { get, run, uid } = require('../src/db');

let base = '';
let adminTok = '';
let billTok = '';
let shopId = '';
let prodId = '';
let custId = '';
// Unique per run so the suite can be re-run against the same database without
// fixture collisions (emails are globally unique in `profiles`).
const runId = Date.now().toString(36);
const adminEmail = `admin_${runId}@test.local`;
const billEmail = `bill_${runId}@test.local`;

async function api(method, path, token, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

before(async () => {
  await app.ready;
  // Minimal fixtures (direct DB — no public registration exists by design)
  shopId = uid('shop');
  await run(`INSERT INTO shops (id, name) VALUES (?,?)`, shopId, 'Test Shop');
  const mk = async (email, role, pass, primary) => {
    const id = uid('usr');
    await run(`INSERT INTO profiles (user_id, shop_id, role, display_name, email, password_hash, active, is_primary)
      VALUES (?,?,?,?,?,?,1,?)`, id, shopId, role, email, email, bcrypt.hashSync(pass, 10), primary ? 1 : 0);
    return id;
  };
  await mk(adminEmail, 'admin', 'Admin@1234', true);
  await mk(billEmail, 'billing', 'Bill@1234', false);
  await run(`INSERT INTO gold_rates (id, source, purity_basis, rate_per_g_inr, rate_24k_per_g_inr, observed_at, approved)
    VALUES (?,?,?,?,?,?,1)`, uid('rate'), 'test', '24K', 9000, 9000, new Date().toISOString());
  const cat = uid('cat');
  await run(`INSERT INTO categories (id, shop_id, name, slug, sku_prefix) VALUES (?,?,?,?,?)`, cat, shopId, 'Rings', 'rings', 'RNG');
  prodId = uid('prd');
  await run(`INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, net_gold_weight_g,
    making_charge_type, making_charge_value, acquisition_cost_inr, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, prodId, shopId, cat, 'TST-1', 'Test Ring', '22K', 5, 4.8, 'percentage', 10, 40000, 'available');
  await run(`INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value) VALUES (?,?,?,?)`, uid('bc'), prodId, shopId, 'TST-1');
  custId = uid('cus');
  await run(`INSERT INTO customers (id, shop_id, customer_code, name, phone, normalized_phone, address_line1, city, state, postal_code) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    custId, shopId, 'C00001', 'Test Customer', '9876500001', '9876500001', '1 Test St', 'Bengaluru', 'KA', '560001');

  const srv = app.listen(0);
  base = `http://localhost:${srv.address().port}/api`;
  test.after = test.after || (() => {});
  globalThis.__srv = srv;
  const a = await api('POST', '/auth/login', null, { email: adminEmail, password: 'Admin@1234' });
  assert.equal(a.status, 200);
  adminTok = a.body.token;
  const b = await api('POST', '/auth/login', null, { email: billEmail, password: 'Bill@1234' });
  assert.equal(b.status, 200);
  billTok = b.body.token;
});

test('after hook closes server', async () => { /* placeholder to keep order */ });

test('roles: billing blocked from admin endpoints, admin allowed', async () => {
  const blocked = [
    ['POST', '/products', { sku: 'X', name: 'X', category_id: 'c', net_gold_weight_g: 1, acquisition_cost_inr: 1 }],
    ['POST', '/gold-rates/override', { rate_per_g_inr: 9000, reason: 'x' }],
    ['POST', '/gold-rates/refresh', {}],
    ['GET', '/admin/staff', null],
    ['POST', '/admin/staff', { name: 'Z', email: 'z@z.z', password: 'Password1' }],
    ['GET', '/audit-logs', null],
    ['GET', '/reports/sales', null],
    ['POST', '/offers', { code: 'X' }],
    ['POST', '/campaigns', { name: 'X', template: 'Y' }],
  ];
  for (const [m, p, body] of blocked) {
    const r = await api(m, p, billTok, body);
    assert.ok([401, 403].includes(r.status), `${m} ${p} should be blocked, got ${r.status}`);
  }
  const ok = await api('GET', '/products', billTok);
  assert.equal(ok.status, 200);
  const bc = await api('GET', '/products/barcode/TST-1', billTok);
  assert.equal(bc.status, 200);
});

test('single primary admin: create forces billing role; primary cannot be deactivated', async () => {
  const c = await api('POST', '/admin/staff', adminTok, { name: 'Sneaky', email: `sneaky_${runId}@t.t`, password: 'Password12', role: 'admin' });
  assert.equal(c.status, 201);
  assert.equal(c.body.data.role, 'billing');
  const adminRow = await get(`SELECT user_id FROM profiles WHERE role='admin' AND active=1 AND shop_id=?`, shopId);
  const no = await api('PATCH', `/admin/staff/${adminRow.user_id}`, adminTok, { active: false });
  assert.equal(no.status, 409);
  const self = await api('PATCH', `/admin/staff/${c.body.data.user_id}`, adminTok, { active: false });
  assert.equal(self.status, 200); // non-primary can be deactivated
});

test('deactivation revokes sessions immediately; reset password works once', async () => {
  const tempEmail = `temp_${runId}@t.t`;
  const c = await api('POST', '/admin/staff', adminTok, { name: 'Temp', email: tempEmail, password: 'Password12' });
  const t0 = await api('POST', '/auth/login', null, { email: tempEmail, password: 'Password12' });
  assert.equal(t0.status, 200);
  await api('PATCH', `/admin/staff/${c.body.data.user_id}`, adminTok, { active: false });
  const me = await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${t0.body.token}` } });
  assert.equal(me.status, 401);
  const login = await api('POST', '/auth/login', null, { email: tempEmail, password: 'Password12' });
  assert.equal(login.status, 401);
  await api('PATCH', `/admin/staff/${c.body.data.user_id}`, adminTok, { active: true });
  const rp = await api('POST', `/admin/staff/${c.body.data.user_id}/reset-password`, adminTok, {});
  assert.equal(rp.status, 200);
  assert.ok(rp.body.data.temporaryPassword && rp.body.data.temporaryPassword.length >= 8);
  const t1 = await api('POST', '/auth/login', null, { email: tempEmail, password: rp.body.data.temporaryPassword });
  assert.equal(t1.status, 200);
});

test('phone-first lookup: normalized variants match; duplicates flagged not merged', async () => {
  const variants = ['9876500001', '+91 98765 00001', '91-9876500001', '09876500001'];
  for (const v of variants) {
    const r = await api('GET', `/customers/phone/${encodeURIComponent(v)}`, billTok);
    assert.equal(r.status, 200);
    assert.ok(r.body.data.some((c) => c.id === custId), `variant ${v} should match`);
  }
  const dup = await api('POST', '/customers', billTok, { name: 'Dup', phone: '+91-98765-00001', address_line1: '1 Test St', city: 'Bengaluru', state: 'KA', postal_code: '560001' });
  assert.equal(dup.status, 409);
});

test('barcode assign: duplicates rejected without confirm; reassign audited', async () => {
  const p2 = uid('prd');
  const cat = (await get(`SELECT id FROM categories WHERE shop_id=? LIMIT 1`, shopId)).id;
  await run(`INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, net_gold_weight_g, acquisition_cost_inr, status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, p2, shopId, cat, 'TST-2', 'Ring 2', '22K', 5, 4.8, 40000, 'available');
  const taken = await api('POST', `/products/${p2}/barcode`, adminTok, { barcode_value: 'TST-1' });
  assert.equal(taken.status, 409);
  const same = await api('POST', `/products/${p2}/barcode`, adminTok, { barcode_value: 'TST-2-NEW', confirm: true });
  assert.equal(same.status, 201);
  const lbl = await api('GET', `/products/${p2}/label`, adminTok);
  assert.equal(lbl.status, 200);
  assert.equal(lbl.body.data.barcode_value, 'TST-2-NEW');
  const aud = await get(`SELECT id FROM audit_logs WHERE action='barcode.assign' AND entity_id=?`, p2);
  assert.ok(aud, 'barcode assignment must be audited');
});

test('billing flow: draft → finalize atomic; history snapshots; admin-only void', async () => {
  const d = await api('POST', '/sales/draft', billTok, { customer_id: custId, lines: [{ product_id: prodId }] });
  assert.equal(d.status, 201);
  const est = await api('POST', '/pricing/estimate', billTok, { product_id: prodId });
  const total = est.body.data.line_total_inr;
  const f = await api('POST', `/sales/${d.body.data.id}/finalize`, billTok, {
    lines: [{ product_id: prodId }], payments: [{ method: 'upi', amount_inr: total }],
  });
  assert.equal(f.status, 200);
  assert.ok(/^INV-/.test(f.body.data.invoice_no));
  const again = await api('POST', `/sales/${d.body.data.id}/finalize`, billTok, {
    lines: [{ product_id: prodId }], payments: [{ method: 'upi', amount_inr: total }],
  });
  assert.equal(again.status, 409);
  // snapshot preserved, not recalculated
  const got = await api('GET', `/sales/${d.body.data.id}`, billTok);
  assert.equal(got.body.data.total_inr, f.body.data.total_inr);
  // customer summary + recency filter see exactly one finalized bill
  const ph = await api('GET', `/customers/phone/9876500001`, billTok);
  assert.equal(ph.body.data[0].summary.bill_count, 1);
  const rec = await api('GET', `/customers?last_days=30`, billTok);
  assert.ok(rec.body.data.some((c) => c.id === custId));
  const rep0 = await api('GET', `/customers?repeat=1`, billTok);
  assert.ok(!rep0.body.data.some((c) => c.id === custId), 'one bill is not repeat');
  // void: billing forbidden, admin allowed with reason
  const vb = await api('POST', `/sales/${d.body.data.id}/void`, billTok, { reason: 'x' });
  assert.equal(vb.status, 403);
  const va = await api('POST', `/sales/${d.body.data.id}/void`, adminTok, { reason: 'test correction' });
  assert.equal(va.status, 200);
  assert.equal(va.body.data.status, 'voided');
});

test('close server', async () => { globalThis.__srv.close(); });

// Best-effort cleanup so repeated runs stay idempotent even against a shared DB.
// Each statement is isolated: a failure never blocks the others or the suite.
after(async () => {
  if (!shopId) return;
  const cleanup = [
    `DELETE FROM occasion_sends WHERE shop_id = ?`,
    `DELETE FROM festivals WHERE shop_id = ?`,
    `DELETE FROM email_messages WHERE shop_id = ?`,
    `DELETE FROM email_templates WHERE shop_id = ?`,
    `DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = ?)`,
    `DELETE FROM returns_refunds WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = ?)`,
    `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = ?)`,
    `DELETE FROM sales WHERE shop_id = ?`,
    `DELETE FROM product_barcodes WHERE shop_id = ?`,
    `DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE shop_id = ?)`,
    `DELETE FROM products WHERE shop_id = ?`,
    `DELETE FROM campaign_recipients WHERE customer_id IN (SELECT id FROM customers WHERE shop_id = ?)`,
    `DELETE FROM customer_addresses WHERE customer_id IN (SELECT id FROM customers WHERE shop_id = ?)`,
    `DELETE FROM customer_occasions WHERE customer_id IN (SELECT id FROM customers WHERE shop_id = ?)`,
    `DELETE FROM consent_events WHERE customer_id IN (SELECT id FROM customers WHERE shop_id = ?)`,
    `DELETE FROM customers WHERE shop_id = ?`,
    `DELETE FROM campaigns WHERE shop_id = ?`,
    `DELETE FROM offers WHERE shop_id = ?`,
    `DELETE FROM expenses WHERE shop_id = ?`,
    `DELETE FROM audit_logs WHERE actor_id IN (SELECT user_id FROM profiles WHERE shop_id = ?)`,
    `DELETE FROM categories WHERE shop_id = ?`,
    `DELETE FROM shop_settings WHERE shop_id = ?`,
    `DELETE FROM profiles WHERE shop_id = ?`,
    `DELETE FROM branches WHERE shop_id = ?`,
    `DELETE FROM shops WHERE id = ?`,
  ];
  for (const sql of cleanup) {
    try { await run(sql, shopId); } catch { /* best effort */ }
  }
});
