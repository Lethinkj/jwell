const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const bcrypt = require('bcryptjs');
const { get, all, run, initDb, closeDb, uid } = require('./db');
const { storeRate } = require('./services/rates');
const { normalizePhone } = require('./services/phone');

async function ensureShop() {
  let shop = await get('SELECT * FROM shops LIMIT 1');
  if (!shop) {
    const id = uid('shop');
    await run(`INSERT INTO shops (id, name, timezone, currency) VALUES (?,?,?,?)`,
      id, 'Shree Gold Palace', 'Asia/Kolkata', 'INR');
    await run(`INSERT INTO branches (id, shop_id, name, address) VALUES (?,?,?,?)`,
      uid('br'), id, 'Main Store', 'MG Road, Bengaluru');
    shop = await get('SELECT * FROM shops WHERE id=?', id);
  }
  return shop;
}

async function ensureUser(shop, email, role, name, pass, extra = {}) {
  const ex = await get('SELECT * FROM profiles WHERE email=?', email);
  if (ex) return ex;
  const id = uid('usr');
  await run(`INSERT INTO profiles (user_id, shop_id, role, display_name, email, phone, password_hash, active, is_primary) VALUES (?,?,?,?,?,?,?,?,?)`,
    id, shop.id, role, name, email, extra.phone || null, bcrypt.hashSync(pass, 10), 1, extra.is_primary ? 1 : 0);
  return get('SELECT * FROM profiles WHERE user_id=?', id);
}

// Same seed data as before — no pricing changes, only awaited for Postgres.
async function main() {
  await initDb();
  const shop = await ensureShop();
  // Two-role model: exactly one primary admin + billing staff.
  const admin = await ensureUser(shop, 'admin@shop.local', 'admin', 'Shop Admin', 'Admin@123');
  await ensureUser(shop, 'billing@shop.local', 'billing', 'Billing Staff', 'Billing@123');
  // Remove legacy demo profiles (owner/manager/inventory); transfer the primary
  // flag to admin@shop.local first so the shop keeps exactly one primary admin.
  // Only these three known demo emails are ever deleted — nothing else is touched.
  const legacy = ['owner@shop.local', 'manager@shop.local', 'inventory@shop.local'];
  for (const email of legacy) {
    const row = await get('SELECT * FROM profiles WHERE email = ?', email);
    if (!row) continue;
    if (row.is_primary) {
      await run('UPDATE profiles SET is_primary = 0 WHERE user_id = ?', row.user_id);
      await run('UPDATE profiles SET is_primary = 1 WHERE user_id = ?', admin.user_id);
    }
    await run('DELETE FROM profiles WHERE user_id = ?', row.user_id);
    console.log(`[seed] removed legacy profile ${email}`);
  }
  const hasPrimary = await get(`SELECT user_id FROM profiles WHERE shop_id = ? AND role = 'admin' AND active = 1 AND is_primary = 1`, shop.id);
  if (!hasPrimary) await run('UPDATE profiles SET is_primary = 1 WHERE user_id = ?', admin.user_id);
  const owner = admin;

  if (!(await get('SELECT COUNT(*) n FROM categories')).n) {
    const cats = [
      ['Rings', 'rings', 'RNG'], ['Necklaces', 'necklaces', 'NCK'],
      ['Bangles', 'bangles', 'BNG'], ['Chains', 'chains', 'CHN'],
      ['Earrings', 'earrings', 'ERG'], ['Bracelets', 'bracelets', 'BRC'],
      ['Pendants', 'pendants', 'PND'], ['Coins', 'coins', 'CON'],
    ];
    for (const [name, slug, pre] of cats) {
      await run('INSERT INTO categories (id, shop_id, name, slug, sku_prefix) VALUES (?,?,?,?,?)',
        uid('cat'), shop.id, name, slug, pre);
    }
  }
  if (!(await get('SELECT COUNT(*) n FROM gold_rates')).n) {
    await storeRate({ source: 'pilot-feed', purity_basis: '24K', rate_per_g_inr: 9820, created_by: owner.user_id });
  }
  if (!(await get('SELECT COUNT(*) n FROM products')).n) {
    const catId = async (slug) => (await get('SELECT id FROM categories WHERE slug=?', slug)).id;
    const demo = [
      { cat: 'rings', sku: 'RNG-1001', name: 'Classic Temple Ring', purity: '22K', gross: 6.4, net: 6.1, making: ['percentage', 12], acq: 52000 },
      { cat: 'necklaces', sku: 'NCK-2001', name: 'Kundan Bridal Necklace', purity: '22K', gross: 32.5, net: 28.0, making: ['percentage', 14], acq: 245000, stone: 18000 },
      { cat: 'bangles', sku: 'BNG-3001', name: 'Antique Filigree Bangle', purity: '22K', gross: 12.8, net: 12.5, making: ['per_gram', 450], acq: 108000 },
      { cat: 'earrings', sku: 'ERG-4001', name: 'Chandbali Earrings', purity: '18K', gross: 8.2, net: 7.1, making: ['fixed', 3500], acq: 62000, stone: 4500 },
      { cat: 'coins', sku: 'CON-5001', name: '24K Gold Coin 5g', purity: '24K', gross: 5.0, net: 5.0, making: ['fixed', 800], acq: 49000 },
      { cat: 'chains', sku: 'CHN-6001', name: 'Rope Chain 18in', purity: '22K', gross: 15.6, net: 15.4, making: ['percentage', 10], acq: 132000 },
    ];
    for (const d of demo) {
      const id = uid('prd');
      await run(`INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, net_gold_weight_g,
        making_charge_type, making_charge_value, stone_value_inr, acquisition_cost_inr, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, shop.id, await catId(d.cat), d.sku, d.name, d.purity, d.gross, d.net,
        d.making[0], d.making[1], d.stone || 0, d.acq, 'available');
      await run('INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value) VALUES (?,?,?,?)', uid('bc'), id, shop.id, d.sku);
      await run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, weight_delta_g, reason, actor_id)
        VALUES (?,?,?,?,?,?,?)`, uid('stm'), id, 'manual_adjust', 1, d.net, 'seed stock', owner.user_id);
    }
  }
  if (!(await get('SELECT COUNT(*) n FROM customers')).n) {
    const seed = [
      ['Asha Reddy', '9876500001', 'asha@example.com', '1990-05-14', null, 1, 185000, 3],
      ['Meera Iyer', '9876500002', 'meera@example.com', null, '2018-11-02', 1, 96000, 2],
      ['Kavya Nair', '9876500003', null, '1988-12-25', null, 0, 42000, 1],
    ];
    for (let i = 0; i < seed.length; i++) {
      const [nm, ph, em, bdd, ann, con, sp, c] = seed[i];
      const id = uid('cus');
      await run(`INSERT INTO customers (id, shop_id, customer_code, name, phone, normalized_phone, email, birthday, anniversary, marketing_consent, total_spent_inr, purchase_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, shop.id, `C${String(i + 1).padStart(5, '0')}`, nm, ph, normalizePhone(ph), em, bdd, ann, con, sp, c);
    }
    // Backfill normalization for pre-existing rows (shared numbers kept as-is — never auto-merged)
    const missing = await all('SELECT id, phone FROM customers WHERE normalized_phone IS NULL');
    for (const m of missing) await run('UPDATE customers SET normalized_phone = ? WHERE id = ?', normalizePhone(m.phone), m.id);
  }
  // Default shop settings (admin can change in Settings)
  const defaults = {
    shop_name: 'Shree Gold Palace', shop_address: 'MG Road, Bengaluru', shop_phone: '+91 80000 00000',
    invoice_prefix: 'INV', invoice_footer: 'BIS hallmarked jewellery. Prices include GST as shown.',
    label_width_mm: '50', label_height_mm: '30', label_margin_mm: '2', label_show_price: 'yes',
  };
  for (const [k, v] of Object.entries(defaults)) {
    const ex = await get('SELECT 1 FROM shop_settings WHERE shop_id = ? AND key = ?', shop.id, k);
    if (!ex) await run('INSERT INTO shop_settings (shop_id, key, value) VALUES (?,?,?)', shop.id, k, v);
  }
  if (!(await get('SELECT COUNT(*) n FROM offers')).n) {
    await run(`INSERT INTO offers (id, shop_id, code, description, discount_type, discount_value, min_purchase_inr, max_discount_inr, valid_from, valid_to)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, uid('off'), shop.id, 'FEST10', 'Festive flat ₹1000 off above ₹50,000', 'flat', 1000, 50000, 1000, '2026-01-01', '2027-01-01');
    await run(`INSERT INTO offers (id, shop_id, code, description, discount_type, discount_value, min_purchase_inr, max_discount_inr, valid_from, valid_to)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, uid('off'), shop.id, 'BDAY5', 'Birthday 5% off (capped ₹5,000)', 'percent', 5, 10000, 5000, '2026-01-01', '2027-12-31');
  }
  console.log('[seed] done. Logins: admin@shop.local/Admin@123, billing@shop.local/Billing@123');
  await closeDb();
}
main().catch((e) => { console.error('[seed] failed:', e.message); process.exit(1); });
