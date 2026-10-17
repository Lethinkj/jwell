const express = require('express');
const { get, all, run, nowFn, uid } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ---- Categories ----
router.get('/categories', async (req, res) => {
  const rows = await all('SELECT * FROM categories WHERE shop_id = ? ORDER BY name', req.user.shop_id);
  res.json({ data: rows });
});
router.post('/categories', requireRoles('admin'), async (req, res) => {
  const { name, sku_prefix } = req.body || {};
  if (!name) return res.status(400).json({ error: 'bad_request', message: 'name required' });
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = uid('cat');
  try {
    await run(`INSERT INTO categories (id, shop_id, name, slug, sku_prefix) VALUES (?,?,?,?,?)`,
      id, req.user.shop_id, name, slug, (sku_prefix || name.slice(0, 3)).toUpperCase());
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'conflict', message: 'Category slug/prefix already exists' });
    throw e;
  }
  audit(req.user.user_id, 'category.create', 'category', id, name);
  res.status(201).json({ data: await get('SELECT * FROM categories WHERE id=?', id) });
});
router.patch('/categories/:id', requireRoles('admin'), async (req, res) => {
  const { name, active } = req.body || {};
  const cur = await get('SELECT * FROM categories WHERE id=?', req.params.id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  await run('UPDATE categories SET name = COALESCE(?, name), active = COALESCE(?, active)', name ?? null, active ?? null);
  res.json({ data: await get('SELECT * FROM categories WHERE id=?', req.params.id) });
});

// ---- Products ----
router.get('/products', async (req, res) => {
  const { q, category_id, purity, status = 'available', min_weight, max_weight, page = 1, limit = 20 } = req.query;
  const conds = ['p.shop_id = ?']; const args = [req.user.shop_id];
  if (category_id) { conds.push('p.category_id = ?'); args.push(category_id); }
  if (purity) { conds.push('p.purity = ?'); args.push(purity); }
  if (status !== 'all') { conds.push('p.status = ?'); args.push(status); }
  if (min_weight) { conds.push('p.net_gold_weight_g >= ?'); args.push(Number(min_weight)); }
  if (max_weight) { conds.push('p.net_gold_weight_g <= ?'); args.push(Number(max_weight)); }
  if (q) { conds.push('(p.sku LIKE ? OR p.name LIKE ? OR p.design_code LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const off = (Number(page) - 1) * Number(limit);
  const rows = await all(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${conds.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, ...args, Number(limit), off);
  const total = (await get(`SELECT COUNT(*) n FROM products p WHERE ${conds.join(' AND ')}`, ...args)).n;
  res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
});

router.post('/products', requireRoles('admin'), async (req, res) => {
  const b = req.body || {};
  if (!b.sku || !b.name || !b.category_id || !b.net_gold_weight_g || b.acquisition_cost_inr == null)
    return res.status(400).json({ error: 'bad_request', message: 'sku, name, category_id, net_gold_weight_g, acquisition_cost_inr required' });
  if (Number(b.net_gold_weight_g) > Number(b.gross_weight_g || b.net_gold_weight_g))
    return res.status(422).json({ error: 'invalid_weights', message: 'net_gold_weight_g cannot exceed gross_weight_g' });
  const id = uid('prd');
  try {
    await run(`INSERT INTO products (id, shop_id, category_id, sku, design_code, name, purity, gross_weight_g, stone_weight_g, net_gold_weight_g,
      making_charge_type, making_charge_value, stone_value_inr, wastage_charge_inr, other_charges_inr, acquisition_cost_inr, image_url, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, req.user.shop_id, b.category_id, b.sku, b.design_code || null, b.name,
      b.purity || '22K', b.gross_weight_g ?? b.net_gold_weight_g, b.stone_weight_g || 0, b.net_gold_weight_g,
      b.making_charge_type || 'percentage', b.making_charge_value ?? 10, b.stone_value_inr || 0,
      b.wastage_charge_inr || 0, b.other_charges_inr || 0, b.acquisition_cost_inr, b.image_url || null, b.status || 'available');
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'conflict', message: 'SKU already exists in this shop' });
    throw e;
  }
  const barcode = b.barcode || b.sku;
  await run(`INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value, barcode_type) VALUES (?,?,?,?,?)`,
    uid('bc'), id, req.user.shop_id, barcode, 'CODE128');
  await run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, weight_delta_g, reference_type, reference_id, reason, actor_id)
    VALUES (?,?,?,?,?,?,?,?,?)`, uid('stm'), id, 'manual_adjust', 1, b.net_gold_weight_g, 'product_create', id, 'initial stock', req.user.user_id);
  audit(req.user.user_id, 'product.create', 'product', id, `${b.sku} ${b.name}`);
  res.status(201).json({ data: await get('SELECT * FROM products WHERE id=?', id) });
});

router.get('/products/barcode/:value', async (req, res) => {
  const bc = await get(`SELECT pb.*, p.*, c.name AS category_name FROM product_barcodes pb
    JOIN products p ON p.id = pb.product_id LEFT JOIN categories c ON c.id = p.category_id
    WHERE pb.barcode_value = ? AND pb.active = 1`, req.params.value);
  if (!bc) return res.status(404).json({ error: 'not_found', message: 'No product for this barcode' });
  if (bc.status !== 'available') return res.status(409).json({ error: 'not_available', message: `Item is ${bc.status}`, data: bc });
  res.json({ data: bc });
});

// ---- Barcode management (admin only; Code 128 values, DB is the identifier) ----
router.post('/products/:id/barcode', requireRoles('admin'), async (req, res) => {
  const prod = await get('SELECT * FROM products WHERE id = ? AND shop_id = ?', req.params.id, req.user.shop_id);
  if (!prod) return res.status(404).json({ error: 'not_found' });
  const { barcode_value, confirm = false } = req.body || {};
  const existing = await all('SELECT * FROM product_barcodes WHERE product_id = ? AND active = 1', prod.id);
  const value = (barcode_value || prod.sku).trim();
  if (!value) return res.status(400).json({ error: 'bad_request', message: 'barcode value required' });
  const holder = await get('SELECT * FROM product_barcodes WHERE barcode_value = ? AND active = 1', value);
  if (holder && holder.product_id !== prod.id) {
    if (!confirm) {
      return res.status(409).json({ error: 'barcode_taken', message: `Barcode is assigned to ${holder.product_id}. Resend with confirm:true to reassign (audited).`, holder: { product_id: holder.product_id } });
    }
    await run('UPDATE product_barcodes SET active = 0 WHERE id = ?', holder.id);
    audit(req.user.user_id, 'barcode.reassign', 'product', holder.product_id, `barcode ${value} released for reassignment to ${prod.sku}`);
  }
  if (existing.length && !confirm && (!holder || holder.product_id === prod.id) && existing.some((b) => b.barcode_value !== value)) {
    return res.status(409).json({ error: 'confirm_required', message: 'Product already has an active barcode. Resend with confirm:true to replace it (audited).', existing });
  }
  await run('UPDATE product_barcodes SET active = 0 WHERE product_id = ? AND active = 1', prod.id);
  const id = uid('bc');
  await run('INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value, barcode_type, active) VALUES (?,?,?,?,?,1)',
    id, prod.id, req.user.shop_id, value, 'CODE128');
  audit(req.user.user_id, 'barcode.assign', 'product', prod.id, `barcode ${value} assigned to ${prod.sku}`);
  res.status(201).json({ data: await get('SELECT * FROM product_barcodes WHERE id = ?', id) });
});

// Label data for printing: product + active barcode + shop settings.
// Price included only when admin enabled label_show_price (server-computed via frozen engine).
router.get('/products/:id/label', async (req, res) => {
  const prod = await get(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ? AND p.shop_id = ?`, req.params.id, req.user.shop_id);
  if (!prod) return res.status(404).json({ error: 'not_found' });
  const barcode = await get('SELECT * FROM product_barcodes WHERE product_id = ? AND active = 1', prod.id);
  if (!barcode) return res.status(404).json({ error: 'no_barcode', message: 'No active barcode — generate one first' });
  const { getSettings } = require('./admin');
  const settings = await getSettings(req.user.shop_id);
  let price_estimate_inr = null;
  if (settings.label_show_price === 'yes') {
    try {
      const { currentRate } = require('../services/rates');
      const { priceLine } = require('../services/pricing');
      const rate = await currentRate();
      if (rate) price_estimate_inr = priceLine({ product: prod, rate24kPerG: rate.rate_24k_per_g_inr, discountInr: 0, taxRatePct: 3 }).line_total_inr;
    } catch { /* label prints without price */ }
  }
  res.json({ data: {
    shop_name: settings.shop_name,
    sku: prod.sku, name: prod.name, purity: prod.purity,
    gross_weight_g: prod.gross_weight_g, net_gold_weight_g: prod.net_gold_weight_g,
    category_name: prod.category_name, barcode_value: barcode.barcode_value, barcode_type: barcode.barcode_type,
    price_estimate_inr,
    label: { width_mm: settings.label_width_mm, height_mm: settings.label_height_mm, margin_mm: settings.label_margin_mm },
  } });
});

router.get('/products/:id', async (req, res) => {  const row = await get(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const barcodes = await all('SELECT * FROM product_barcodes WHERE product_id=?', req.params.id);
  const movements = await all('SELECT * FROM stock_movements WHERE product_id=? ORDER BY created_at DESC LIMIT 50', req.params.id);
  // Sale history for this unique piece — full invoice on demand via GET /sales/:id.
  const sales = await all(`SELECT s.id, s.invoice_no, s.status AS sale_status, s.sold_at, s.created_at,
      s.total_inr, si.id AS sale_item_id, si.line_total_inr, si.purity AS sold_purity,
      si.net_gold_weight_g AS sold_net_gold_weight_g, si.rate_24k_per_g_inr AS sold_rate_24k_per_g_inr,
      si.gold_value_inr, si.making_charge_inr, si.stone_value_inr, si.wastage_charge_inr, si.other_charges_inr,
      si.discount_inr, si.tax_inr, si.offer_code,
      c.name AS customer_name, c.phone AS customer_phone, c.customer_code
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE si.product_id = ? ORDER BY s.sold_at DESC LIMIT 20`, req.params.id);
  res.json({ data: { ...row, barcodes, movements, sales } });
});

router.patch('/products/:id', requireRoles('admin'), async (req, res) => {
  const cur = await get('SELECT * FROM products WHERE id=?', req.params.id);
  if (!cur) return res.status(404).json({ error: 'not_found' });
  if (cur.status === 'sold') return res.status(409).json({ error: 'conflict', message: 'Sold pieces are immutable; use returns flow' });
  const b = req.body || {};
  const allowed = ['name', 'design_code', 'purity', 'gross_weight_g', 'stone_weight_g', 'net_gold_weight_g', 'making_charge_type', 'making_charge_value', 'stone_value_inr', 'wastage_charge_inr', 'other_charges_inr', 'acquisition_cost_inr', 'image_url', 'status', 'category_id'];
  const sets = []; const args = [];
  for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(b[k]); }
  if (!sets.length) return res.status(400).json({ error: 'bad_request', message: 'nothing to update' });
  args.push(req.params.id);
  await run(`UPDATE products SET ${sets.join(', ')}, updated_at = ${nowFn()} WHERE id = ?`, ...args);
  if (b.status && b.status !== cur.status) {
    await run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, reason, actor_id) VALUES (?,?,?,?,?,?)`,
      uid('stm'), req.params.id, 'manual_adjust', 0, `status ${cur.status} -> ${b.status}`, req.user.user_id);
  }
  audit(req.user.user_id, 'product.update', 'product', req.params.id, JSON.stringify(b).slice(0, 300));
  res.json({ data: await get('SELECT * FROM products WHERE id=?', req.params.id) });
});

module.exports = router;
