const express = require('express');
const { get, all, run, withTransaction, nowFn, uid } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');
const { currentRate, rateFreshness } = require('../services/rates');
const { priceLine } = require('../services/pricing');
const { validateOffer } = require('./ops');

const router = express.Router();
router.use(auth);

async function nextInvoiceNo(tx) {
  const y = new Date().getFullYear();
  const n = (await tx.get(`SELECT COUNT(*) n FROM sales WHERE invoice_no LIKE ?`, `INV-${y}-%`)).n + 1;
  return `INV-${y}-${String(n).padStart(5, '0')}`;
}

async function getOrCreateCustomer(shopId, inline) {
  if (!inline) return null;
  const { normalizePhone } = require('../services/phone');
  const norm = normalizePhone(inline.phone);
  const dup = await get('SELECT * FROM customers WHERE shop_id=? AND (normalized_phone = ? OR phone = ?)', shopId, norm, inline.phone);
  if (dup) return dup;
  const id = uid('cus');
  const code = `C${String((await get('SELECT COUNT(*) n FROM customers WHERE shop_id=?', shopId)).n + 1).padStart(5, '0')}`;
  await run(`INSERT INTO customers (id, shop_id, customer_code, name, phone, normalized_phone, email, address_line1, city, state, postal_code, birthday, anniversary, notes, preferred_channel, marketing_consent)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, shopId, code, inline.name, inline.phone, norm, inline.email || null,
    inline.address_line1 || null, inline.city || null, inline.state || null, inline.postal_code || null,
    inline.birthday || null, inline.anniversary || null, inline.notes || null, inline.preferred_channel || 'both',
    inline.marketing_consent ? 1 : 0);
  if (inline.marketing_consent) {
    await run('INSERT INTO consent_events (id, customer_id, channel, purpose, status, source) VALUES (?,?,?,?,?,?)',
      uid('con'), id, inline.preferred_channel || 'both', 'marketing', 'granted', 'billing-inline');
  }
  return get('SELECT * FROM customers WHERE id=?', id);
}

// Draft = reserves stock so two staff cannot sell the same unique piece (§5.5 atomicity)
router.post('/sales/draft', requireRoles('admin', 'billing'), async (req, res) => {
  const { customer_id, customer_inline, lines = [] } = req.body || {};
  if (!lines.length) return res.status(400).json({ error: 'bad_request', message: 'lines required' });
  let customer = customer_id ? await get('SELECT * FROM customers WHERE id=?', customer_id) : null;
  if (customer_inline) customer = await getOrCreateCustomer(req.user.shop_id, customer_inline);
  const id = uid('sal');
  try {
    await withTransaction(async (tx) => {
      await tx.run(`INSERT INTO sales (id, shop_id, invoice_no, customer_id, sold_at, subtotal_inr, total_inr, status, created_by)
        VALUES (?,?,?,?,${nowFn()},0,0,'draft',?)`, id, req.user.shop_id, `DRAFT-${id.slice(-6)}`, customer ? customer.id : null, req.user.user_id);
      for (const l of lines) {
        let prod = l.product_id ? await tx.get('SELECT * FROM products WHERE id=?', l.product_id) : null;
        if (!prod && l.sku) {
          prod = await tx.get('SELECT * FROM products WHERE sku=? AND shop_id=?', l.sku, req.user.shop_id);
          if (prod) l.product_id = prod.id;
        }
        if (!prod && l.manual_item) {
          const prdId = uid('prd');
          const cat = await tx.get('SELECT id FROM categories WHERE shop_id=? LIMIT 1', req.user.shop_id);
          const m = l.manual_item;
          const sku = (m.sku || `MAN-${Date.now().toString().slice(-6)}`).trim();
          await tx.run(`INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, stone_weight_g,
            net_gold_weight_g, making_charge_type, making_charge_value, stone_value_inr, wastage_charge_inr, other_charges_inr,
            acquisition_cost_inr, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            prdId, req.user.shop_id, cat ? cat.id : null, sku, m.name || 'Custom Jewellery', m.purity || '22K',
            Number(m.gross_weight_g) || Number(m.net_gold_weight_g) || 1, Number(m.stone_weight_g) || 0,
            Number(m.net_gold_weight_g) || 1, m.making_charge_type || 'percentage', Number(m.making_charge_value) || 10,
            Number(m.stone_value_inr) || 0, Number(m.wastage_charge_inr) || 0, Number(m.other_charges_inr) || 0, 0, 'reserved');
          await tx.run(`INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value) VALUES (?,?,?,?)`,
            uid('bc'), prdId, req.user.shop_id, sku);
          prod = await tx.get('SELECT * FROM products WHERE id=?', prdId);
          l.product_id = prdId;
        }
        if (!prod) throw new Error(`product ${l.product_id || l.sku || ''} not found`);
        if (prod.status !== 'reserved') {
          if (prod.status !== 'available') throw new Error(`${prod.sku} is ${prod.status} — cannot bill`);
          await tx.run(`UPDATE products SET status='reserved' WHERE id=? AND status='available'`, l.product_id);
          const chk = await tx.get('SELECT status FROM products WHERE id=?', l.product_id);
          if (chk.status !== 'reserved') throw new Error(`${prod.sku} was just taken by another sale`);
        }
        await tx.run(`INSERT INTO sale_items (id, sale_id, product_id, sku, name, purity, net_gold_weight_g, rate_24k_per_g_inr, gold_value_inr, making_charge_inr, line_total_inr)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, uid('sit'), id, prod.id, prod.sku, prod.name, prod.purity, prod.net_gold_weight_g, 0, 0, 0, 0);
        await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, reference_type, reference_id, reason, actor_id)
          VALUES (?,?,?,?,?,?,?,?)`, uid('stm'), prod.id, 'reserve', 0, 'sale', id, 'draft reservation', req.user.user_id);
      }
    });
  } catch (e) { return res.status(409).json({ error: 'reserve_failed', message: e.message }); }
  audit(req.user.user_id, 'sale.draft', 'sale', id, `${lines.length} lines reserved`);
  res.status(201).json({ data: await get('SELECT * FROM sales WHERE id=?', id) });
});

// Finalize — transactional, immutable snapshot (§4/§5.5). Pricing formula unchanged.
router.post('/sales/:id/finalize', requireRoles('admin', 'billing'), async (req, res) => {
  const sale = await get('SELECT * FROM sales WHERE id=?', req.params.id);
  if (!sale) return res.status(404).json({ error: 'not_found' });
  if (sale.status === 'finalized') return res.status(409).json({ error: 'already_finalized' });
  const { payments = [], tax_rate_pct = 3, discount_inr: overall_discount_inr, custom_final_price_inr } = req.body || {};
  if (!payments.length) return res.status(400).json({ error: 'bad_request', message: 'payments required' });
  const rate = await currentRate();
  if (!rate) return res.status(409).json({ error: 'no_rate' });
  const fresh = rateFreshness(rate);
  if (fresh.status === 'stale' && String(process.env.BILLING_BLOCK_ON_STALE || 'false') === 'true')
    return res.status(409).json({ error: 'stale_rate', message: `Rate is ${fresh.ageMinutes} min old — owner must approve`, freshness: fresh });
  const items = await all('SELECT * FROM sale_items WHERE sale_id=?', sale.id);
  if (!items.length) return res.status(400).json({ error: 'bad_request', message: 'draft has no lines' });
  const paid = payments.reduce((s, p) => s + Number(p.amount_inr), 0);
  try {
    await withTransaction(async (tx) => {
      let subtotal = 0, discount = 0, tax = 0, total = 0;
      for (const item of items) {
        const prod = await tx.get('SELECT * FROM products WHERE id=?', item.product_id);
        if (!prod || prod.status !== 'reserved') throw new Error(`${item.sku} is no longer reserved`);
        const reqLine = (req.body.lines || []).find(l => l.product_id === item.product_id) || {};
        let disc = Number(reqLine.discount_inr) || 0;
        if (reqLine.offer_code) {
          const v = await validateOffer(reqLine.offer_code, prod, 0, req.user.shop_id);
          if (!v.ok) throw new Error(`Offer ${reqLine.offer_code}: ${v.message}`);
        }
        const calc = priceLine({ product: prod, rate24kPerG: rate.rate_24k_per_g_inr, discountInr: disc, taxRatePct: tax_rate_pct });
        subtotal += calc.subtotal_inr; discount += calc.discount_inr; tax += calc.tax_inr; total += calc.line_total_inr;
        await tx.run(`UPDATE sale_items SET purity=?, net_gold_weight_g=?, rate_24k_per_g_inr=?, gold_value_inr=?, making_charge_inr=?,
          stone_value_inr=?, wastage_charge_inr=?, other_charges_inr=?, discount_inr=?, tax_inr=?, line_total_inr=?, offer_code=?
          WHERE id=?`, prod.purity, prod.net_gold_weight_g, rate.rate_24k_per_g_inr, calc.gold_value_inr, calc.making_charge_inr,
          calc.stone_value_inr, calc.wastage_charge_inr, calc.other_charges_inr, calc.discount_inr, calc.tax_inr,
          calc.line_total_inr, reqLine.offer_code || null, item.id);
        await tx.run(`UPDATE products SET status='sold' WHERE id=?`, prod.id);
        await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, weight_delta_g, reference_type, reference_id, reason, actor_id)
          VALUES (?,?,?,?,?,?,?,?,?)`, uid('stm'), prod.id, 'sale', -1, -prod.net_gold_weight_g, 'sale', sale.id, 'finalized sale', req.user.user_id);
        if (reqLine.offer_code) await tx.run('UPDATE offers SET redeemed = redeemed + 1 WHERE code=?', reqLine.offer_code);
      }

      let finalTotal = total;
      let totalDiscount = discount;
      if (custom_final_price_inr !== undefined && custom_final_price_inr !== null && !isNaN(Number(custom_final_price_inr))) {
        finalTotal = Math.max(0, Math.round(Number(custom_final_price_inr) * 100) / 100);
        totalDiscount = Math.max(0, Math.round(((subtotal + tax) - finalTotal) * 100) / 100);
      } else if (overall_discount_inr !== undefined && overall_discount_inr !== null && !isNaN(Number(overall_discount_inr))) {
        const extraDisc = Math.max(0, Number(overall_discount_inr));
        totalDiscount = discount + extraDisc;
        finalTotal = Math.max(0, Math.round((total - extraDisc) * 100) / 100);
      }

      if (Math.abs(paid - finalTotal) > 1) throw new Error(`Payments ₹${paid} do not match total ₹${finalTotal.toFixed(2)}`);
      const inv = await nextInvoiceNo(tx);
      await tx.run(`UPDATE sales SET invoice_no=?, subtotal_inr=?, discount_inr=?, tax_inr=?, total_inr=?, status='finalized',
        sold_at=${nowFn()}, rate_snapshot_id=?, rate_24k_per_g_inr=? WHERE id=?`,
        inv, subtotal, totalDiscount, tax, finalTotal, rate.id, rate.rate_24k_per_g_inr, sale.id);
      for (const p of payments) {
        await tx.run('INSERT INTO payments (id, sale_id, method, amount_inr, reference) VALUES (?,?,?,?,?)',
          uid('pay'), sale.id, p.method, p.amount_inr, p.reference || null);
      }
      if (sale.customer_id) {
        await tx.run(`UPDATE customers SET total_spent_inr = total_spent_inr + ?, purchase_count = purchase_count + 1, last_purchase_at = ${nowFn()} WHERE id=?`,
          finalTotal, sale.customer_id);
      }
    });
  } catch (e) { return res.status(409).json({ error: 'finalize_failed', message: e.message }); }
  const done = await get('SELECT * FROM sales WHERE id=?', sale.id);
  audit(req.user.user_id, 'sale.finalize', 'sale', sale.id, `${done.invoice_no} ₹${done.total_inr}${fresh.status === 'stale' ? ' (STALE RATE acknowledged)' : ''}`);
  // Thank-you email (fire-and-forget — email problems must never fail a sale).
  if (sale.customer_id) {
    const cust = await get('SELECT * FROM customers WHERE id=?', sale.customer_id);
    if (cust && cust.email) {
      const { sendPurchaseThankYou } = require('../services/email');
      sendPurchaseThankYou(req.user.shop_id, done, cust).catch(() => { /* logged inside */ });
    }
  }
  res.json({ data: { ...done, lines: await all('SELECT * FROM sale_items WHERE sale_id=?', sale.id), payments: await all('SELECT * FROM payments WHERE sale_id=?', sale.id), rate_snapshot: rate, rate_warning: fresh.status === 'stale' ? `Rate ${fresh.ageMinutes} min old` : null } });
});

router.get('/sales', async (req, res) => {
  const { from, to, q, page = 1, limit = 20 } = req.query;
  const conds = ['s.shop_id = ?']; const args = [req.user.shop_id];
  if (req.user.role === 'billing') { conds.push('s.created_by = ?'); args.push(req.user.user_id); }
  if (from) { conds.push('s.sold_at >= ?'); args.push(from); }
  if (to) { conds.push('s.sold_at <= ?'); args.push(to); }
  if (q) { conds.push('(s.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const off = (Number(page) - 1) * Number(limit);
  const rows = await all(`SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.customer_code FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
    WHERE ${conds.join(' AND ')} ORDER BY s.sold_at DESC LIMIT ? OFFSET ?`, ...args, Number(limit), off);
  res.json({ data: rows });
});
router.get('/sales/:id', async (req, res) => {
  const sale = await get(`SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.customer_code,
    c.birthday AS customer_birthday, c.anniversary AS customer_anniversary,
    c.address_line1 AS customer_address_line1, c.city AS customer_city, c.state AS customer_state, c.postal_code AS customer_postal_code,
    sh.name AS shop_name, sh.settings AS shop_settings, sh.currency AS shop_currency
    FROM sales s
    LEFT JOIN customers c ON c.id=s.customer_id
    LEFT JOIN shops sh ON sh.id=s.shop_id
    WHERE s.id=? AND s.shop_id=?`, req.params.id, req.user.shop_id);
  if (!sale) return res.status(404).json({ error: 'not_found' });
  res.json({ data: { ...sale, lines: await all('SELECT * FROM sale_items WHERE sale_id=?', sale.id), payments: await all('SELECT * FROM payments WHERE sale_id=?', sale.id) } });
});

// Void / return / refund — auditable, never rewrites history (§4)
router.post('/sales/:id/void', requireRoles('admin'), async (req, res) => {
  const sale = await get('SELECT * FROM sales WHERE id=?', req.params.id);
  if (!sale) return res.status(404).json({ error: 'not_found' });
  if (sale.status !== 'finalized') return res.status(409).json({ error: 'conflict', message: 'only finalized sales can be voided' });
  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'bad_request', message: 'void reason required' });
  await withTransaction(async (tx) => {
    await tx.run(`UPDATE sales SET status='voided' WHERE id=?`, sale.id);
    const items = await tx.all('SELECT * FROM sale_items WHERE sale_id=?', sale.id);
    for (const it of items) {
      await tx.run(`UPDATE products SET status='available' WHERE id=?`, it.product_id);
      await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, reference_type, reference_id, reason, actor_id)
        VALUES (?,?,?,?,?,?,?,?)`, uid('stm'), it.product_id, 'return', 1, 'sale', sale.id, `void: ${reason}`, req.user.user_id);
      await tx.run('INSERT INTO returns_refunds (id, sale_id, sale_item_id, reason, refund_amount_inr, restock, created_by) VALUES (?,?,?,?,?,?,?)',
        uid('ret'), sale.id, it.id, reason, it.line_total_inr, 1, req.user.user_id);
    }
  });
  audit(req.user.user_id, 'sale.void', 'sale', sale.id, reason, reason);
  res.json({ data: await get('SELECT * FROM sales WHERE id=?', sale.id) });
});

module.exports = router;
