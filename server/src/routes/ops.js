const express = require('express');
const { get, all, run, withTransaction, uid } = require('../db');
const { auth, requireRoles, audit } = require('../middleware/auth');
const { currentRate, rateFreshness, storeRate, fetchProviderRate } = require('../services/rates');
const { priceLine } = require('../services/pricing');

const router = express.Router();
router.use(auth);

// ---- Gold rates (§5.6) — logic untouched, only awaited ----
router.get('/gold-rates/current', async (req, res) => {
  const rate = await currentRate();
  if (!rate) return res.json({ data: null, freshness: { status: 'missing' } });
  res.json({ data: rate, freshness: rateFreshness(rate) });
});
router.get('/gold-rates', requireRoles('admin'), async (req, res) => {
  const rows = await all('SELECT * FROM gold_rates ORDER BY observed_at DESC LIMIT 60');
  res.json({ data: rows });
});
router.post('/gold-rates/refresh', requireRoles('admin'), async (req, res) => {
  try {
    const r = await fetchProviderRate();
    const saved = await storeRate({ ...r, created_by: req.user.user_id });
    audit(req.user.user_id, 'rate.refresh', 'gold_rate', saved.id, `${saved.rate_24k_per_g_inr}/g 24K from ${saved.source}`);
    res.json({ data: saved });
  } catch (e) {
    res.status(502).json({ error: 'provider_failed', message: String(e.message), fallback: await currentRate() });
  }
});
router.post('/gold-rates/override', requireRoles('admin'), async (req, res) => {
  const { rate_per_g_inr, purity_basis = '24K', reason } = req.body || {};
  if (!rate_per_g_inr || rate_per_g_inr <= 0) return res.status(400).json({ error: 'bad_request', message: 'positive rate_per_g_inr required' });
  if (!reason) return res.status(400).json({ error: 'bad_request', message: 'override reason required (audit)' });
  const saved = await storeRate({ source: 'manual-override', purity_basis, rate_per_g_inr: Number(rate_per_g_inr), created_by: req.user.user_id, override_reason: reason });
  audit(req.user.user_id, 'rate.override', 'gold_rate', saved.id, `${rate_per_g_inr}/g ${purity_basis}: ${reason}`, reason);
  res.status(201).json({ data: saved });
});

// ---- Pricing estimate (never final) (§7) — same formula, same snapshots ----
router.post('/pricing/estimate', async (req, res) => {
  const { product_id, discount_inr = 0, tax_rate_pct = 3, offer_code } = req.body || {};
  const product = await get('SELECT * FROM products WHERE id=?', product_id);
  if (!product) return res.status(404).json({ error: 'not_found', message: 'product not found' });
  const rate = await currentRate();
  if (!rate) return res.status(409).json({ error: 'no_rate', message: 'No approved gold rate yet' });
  let discount = Number(discount_inr) || 0;
  if (offer_code) {
    const offer = await validateOffer(offer_code, product, 0, req.user.shop_id);
    if (!offer.ok) return res.status(422).json({ error: 'invalid_offer', message: offer.message });
    discount = Math.max(discount, offer.discountPreviewInr || 0);
  }
  const calc = priceLine({ product, rate24kPerG: rate.rate_24k_per_g_inr, discountInr: discount, taxRatePct: tax_rate_pct });
  res.json({ data: { ...calc, rate_snapshot: rate, estimate: true, note: 'Estimate only — final price recalculated at sale finalization (§7).' } });
});

async function validateOffer(code, product, subtotalInr, shopId) {
  const offer = await get(`SELECT * FROM offers WHERE code=? AND shop_id=? AND active=1`, code, shopId);
  if (!offer) return { ok: false, message: 'Offer not found' };
  const now = new Date().toISOString();
  if (offer.valid_from && now < offer.valid_from) return { ok: false, message: 'Offer not yet valid' };
  if (offer.valid_to && now > offer.valid_to) return { ok: false, message: 'Offer expired' };
  if (offer.redemption_limit && offer.redeemed >= offer.redemption_limit) return { ok: false, message: 'Offer redemption limit reached' };
  if (offer.min_purchase_inr && subtotalInr < offer.min_purchase_inr) return { ok: false, message: `Minimum purchase ₹${offer.min_purchase_inr}` };
  try {
    const cats = JSON.parse(offer.eligible_categories || '[]');
    if (cats.length && product && !cats.includes(product.category_id)) return { ok: false, message: 'Offer not eligible for this category' };
  } catch { /* treat as all */ }
  let discountPreviewInr = 0;
  if (offer.discount_type === 'percent') discountPreviewInr = Math.min((subtotalInr * offer.discount_value) / 100, offer.max_discount_inr || Infinity);
  else discountPreviewInr = Math.min(offer.discount_value, offer.max_discount_inr || offer.discount_value);
  return { ok: true, offer, discountPreviewInr };
}
router.validateOffer = validateOffer;

// ---- Suppliers & Purchases (§6.1) ----
router.get('/suppliers', async (req, res) => {
  res.json({ data: await all('SELECT * FROM suppliers WHERE shop_id=? ORDER BY name', req.user.shop_id) });
});
router.post('/suppliers', requireRoles('admin'), async (req, res) => {
  const { name, phone, email, address, payment_terms } = req.body || {};
  if (!name) return res.status(400).json({ error: 'bad_request', message: 'name required' });
  const id = uid('sup');
  await run('INSERT INTO suppliers (id, shop_id, name, phone, email, address, payment_terms) VALUES (?,?,?,?,?,?,?)',
    id, req.user.shop_id, name, phone || null, email || null, address || null, payment_terms || null);
  res.status(201).json({ data: await get('SELECT * FROM suppliers WHERE id=?', id) });
});
router.get('/purchases', requireRoles('admin'), async (req, res) => {
  const rows = await all(`SELECT pu.*, s.name AS supplier_name FROM purchases pu LEFT JOIN suppliers s ON s.id=pu.supplier_id
    WHERE pu.shop_id=? ORDER BY pu.created_at DESC LIMIT 100`, req.user.shop_id);
  res.json({ data: rows });
});
router.post('/purchases', requireRoles('admin'), async (req, res) => {
  const { supplier_id, supplier_invoice_no, purchased_at, items = [] } = req.body || {};
  if (!items.length) return res.status(400).json({ error: 'bad_request', message: 'at least one item required' });
  const id = uid('pur');
  const subtotal = items.reduce((s, it) => s + (Number(it.acquisition_cost_inr) || 0), 0);
  try {
    await withTransaction(async (tx) => {
      await tx.run(`INSERT INTO purchases (id, shop_id, supplier_id, supplier_invoice_no, purchased_at, subtotal_inr, created_by)
        VALUES (?,?,?,?,?,?,?)`, id, req.user.shop_id, supplier_id || null, supplier_invoice_no || null,
        purchased_at || new Date().toISOString(), subtotal, req.user.user_id);
      for (const it of items) {
        const prod = await tx.get('SELECT * FROM products WHERE id=?', it.product_id);
        if (!prod) throw new Error(`product ${it.product_id} not found`);
        await tx.run('INSERT INTO purchase_items (id, purchase_id, product_id, acquisition_cost_inr, weight_snapshot_g) VALUES (?,?,?,?,?)',
          uid('pit'), id, it.product_id, it.acquisition_cost_inr || prod.acquisition_cost_inr, prod.net_gold_weight_g);
        await tx.run(`UPDATE products SET status='available', acquisition_cost_inr=? WHERE id=?`,
          it.acquisition_cost_inr ?? prod.acquisition_cost_inr, it.product_id);
        await tx.run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, weight_delta_g, reference_type, reference_id, reason, actor_id)
          VALUES (?,?,?,?,?,?,?,?,?)`, uid('stm'), it.product_id, 'purchase', 1, prod.net_gold_weight_g, 'purchase', id, 'stock intake', req.user.user_id);
      }
    });
  } catch (e) { return res.status(422).json({ error: 'purchase_failed', message: e.message }); }
  audit(req.user.user_id, 'purchase.confirm', 'purchase', id, `intake ${items.length} pieces ₹${subtotal}`);
  res.status(201).json({ data: await get('SELECT * FROM purchases WHERE id=?', id) });
});

module.exports = router;
