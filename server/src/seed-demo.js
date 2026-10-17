/**
 * Demo data seeder — populates the dashboard/reports with realistic sample data.
 * Idempotent: every section is guarded, so re-running never duplicates.
 *   Rate history (<10 rows) -> ~90 daily 24K snapshots + 2 manual overrides + fresh current rate
 *   Available products (<160) -> additional jewellry pieces across categories
 *   Customers (<8) -> extra customer records
 *   Finalized sales (none) -> ~95 finalized bills over the last ~4 months with payments
 *
 * Run:  npm run seed:demo     (from server/)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const bcrypt = require('bcryptjs');
const { get, all, run, initDb, closeDb, uid } = require('./db');
const { priceLine } = require('./services/pricing');
const { normalizePhone } = require('./services/phone');

const PURITY_FACTORS = { '24K': 1.0, '22K': 0.916, '18K': 0.75, '14K': 0.585 };

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

/* ── 1. Gold-rate history ───────────────────────────────────────────── */
async function seedRates(ownerId) {
  const count = (await get('SELECT COUNT(*) n FROM gold_rates')).n;
  const byDay = new Map(); // YYYY-MM-DD -> rate
  const byDayId = new Map(); // YYYY-MM-DD -> snapshot id
  if (count < 10) {
    let rate = 9080;
    const DAYS = 90;
    for (let i = DAYS; i >= 1; i--) {
      rate += (Math.random() * 120 - 50) + 3;                       // gentle upward drift
      if (Math.random() < 0.09) rate += Math.random() * 160 - 60;   // occasional market jump
      rate = Math.min(10250, Math.max(9050, rate));
      const rate24 = Math.round(rate * 100) / 100;
      const when = new Date(Date.now() - i * 86400000);
      when.setUTCHours(4, 30, 0, 0);                                 // 10:00 IST
      const id = uid('rate');
      await run(`INSERT INTO gold_rates (id, source, purity_basis, rate_per_g_inr, rate_24k_per_g_inr, currency, unit, observed_at, approved)
        VALUES (?,'pilot-feed','24K',?,?, 'INR','gram',?,1)`, id, rate24, rate24, when.toISOString());
      byDay.set(when.toISOString().slice(0, 10), rate24);
      byDayId.set(when.toISOString().slice(0, 10), id);
    }
    // Owner-approved manual overrides near the end of the window
    const overrides = [[2, 80, 'OVR-2026-041'], [1, 40, 'OVR-2026-042']];
    for (const [daysAgo, bump, ref] of overrides) {
      const v = Math.round(rate + bump * 10) / 10;
      const when = new Date(Date.now() - daysAgo * 86400000 + 6 * 3600000);
      when.setUTCHours(7, 15, 0, 0);
      const id = uid('rate');
      await run(`INSERT INTO gold_rates (id, source, purity_basis, rate_per_g_inr, rate_24k_per_g_inr, currency, unit, observed_at, approved, override_reason, created_by)
        VALUES (?,'manual','24K',?,?,'INR','gram',?,1,?,?)`, id, v, v, when.toISOString(), `Owner approval ${ref}`, ownerId);
      byDay.set(when.toISOString().slice(0, 10), v);
      byDayId.set(when.toISOString().slice(0, 10), id);
    }
    console.log(`[seed-demo] inserted ${DAYS} daily rate snapshots + 2 manual overrides`);
  } else {
    const rows = await all(`SELECT to_char(observed_at, 'YYYY-MM-DD') d, rate_24k_per_g_inr r, id FROM gold_rates ORDER BY observed_at ASC`);
    for (const row of rows) { byDay.set(row.d, Number(row.r)); byDayId.set(row.d, row.id); }
    console.log(`[seed-demo] gold_rates already has ${count} rows — keeping existing history`);
  }
  // Fresh current snapshot so rate freshness is never stale after a demo run
  const last = byDay.size ? Math.max(...byDay.values()) : 9820;
  const fresh24 = Math.round((last + Math.random() * 60 - 20) * 100) / 100;
  await run(`INSERT INTO gold_rates (id, source, purity_basis, rate_per_g_inr, rate_24k_per_g_inr, currency, unit, observed_at, approved)
    VALUES (?,'pilot-feed','24K',?,?,'INR','gram',now(),1)`, uid('rate'), fresh24, fresh24);
  const todayKey = new Date().toISOString().slice(0, 10);
  byDay.set(todayKey, fresh24);
  // map ids may miss today's key; resolve later via nearest-below lookup
  return { byDay, byDayId, todayKey };
}

/* ── 2. Additional jewellery pieces ─────────────────────────────────── */
async function seedProducts(shopId) {
  const available = await all(`SELECT p.*, c.slug AS cat_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.shop_id = ? AND p.status = 'available'`, shopId);
  const TARGET = 160;
  if (available.length >= TARGET) {
    console.log(`[seed-demo] ${available.length} available products already present`);
    return available;
  }
  if (!(await get('SELECT COUNT(*) n FROM categories')).n) {
    const cats = [['Rings', 'rings', 'RNG'], ['Necklaces', 'necklaces', 'NCK'], ['Bangles', 'bangles', 'BNG'], ['Chains', 'chains', 'CHN'],
      ['Earrings', 'earrings', 'ERG'], ['Bracelets', 'bracelets', 'BRC'], ['Pendants', 'pendants', 'PND'], ['Coins', 'coins', 'CON']];
    for (const [name, slug, pre] of cats) {
      await run('INSERT INTO categories (id, shop_id, name, slug, sku_prefix) VALUES (?,?,?,?,?)', uid('cat'), shopId, name, slug, pre);
    }
  }
  const cats = await all('SELECT id, slug, sku_prefix FROM categories WHERE shop_id=?', shopId);
  const lastRate = await get('SELECT rate_24k_per_g_inr FROM gold_rates ORDER BY observed_at DESC LIMIT 1');
  const rate24 = lastRate ? Number(lastRate.rate_24k_per_g_inr) : 9800;
  const NAMES = {
    rings: ['Temple Band', 'Solitaire Ring', 'Antique Signet', 'Gemstone Ring'],
    necklaces: ['Kundan Choker', 'Rani Haar', 'Antique Mango Mala', 'Temple Necklace'],
    bangles: ['Filigree Kada', 'Nakshi Bangle', 'Temple Kada', 'Meenakari Bangle'],
    chains: ['Rope Chain', 'Box Chain', 'Figaro Chain', 'Spiral Chain'],
    earrings: ['Chandbali Drops', 'Classic Jhumka', 'Gold Studs', 'Sui Dhanga Drops'],
    bracelets: ['Charm Bracelet', 'Antique Bracelet', 'Chain Bracelet'],
    pendants: ['Lakshmi Pendant', 'Ganesha Pendant', 'Om Pendant', 'Ruby Pendant'],
    coins: ['24K Gold Coin 2g', '24K Gold Coin 5g', '24K Gold Coin 10g'],
  };
  let seq = Date.now() % 100000;
  while (available.length < TARGET) {
    const cat = cats[seq % cats.length];
    const slugs = Object.keys(NAMES);
    const slug = cat.slug || slugs[Math.abs(seq) % slugs.length];
    const names = NAMES[slug] || NAMES.bangles;
    const isCoin = slug === 'coins';
    const purity = isCoin ? '24K' : (['22K', '22K', '22K', '18K', '24K'])[Math.abs(seq) % 5];
    const net = isCoin ? [2, 5, 10][Math.abs(seq) % 3] : +(2 + Math.random() * 26).toFixed(1);
    const gross = +(net * (1.02 + Math.random() * 0.06)).toFixed(1);
    const stone = !isCoin && Math.random() < 0.3 ? Math.round(3000 + Math.random() * 17000) : 0;
    const making = isCoin ? ['fixed', 800 + Math.round(Math.random() * 400)]
      : [['percentage', 8 + Math.round(Math.random() * 10)], ['per_gram', 250 + Math.round(Math.random() * 350)], ['fixed', 1500 + Math.round(Math.random() * 4000)]][Math.abs(seq) % 3];
    const acq = Math.round(net * rate24 * (PURITY_FACTORS[purity] || 1) * (0.88 + Math.random() * 0.06));
    const id = uid('prd');
    const sku = `${cat.sku_prefix || 'DEM'}-D${seq}`;
    const name = `${names[Math.abs(seq) % names.length]}`;
    const dup = await get('SELECT 1 FROM products WHERE sku=? AND shop_id=?', sku, shopId);
    if (dup) { seq++; continue; }
    await run(`INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, stone_weight_g, net_gold_weight_g,
        making_charge_type, making_charge_value, stone_value_inr, wastage_charge_inr, other_charges_inr, acquisition_cost_inr, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'available')`,
      id, shopId, cat.id, sku, name, purity, gross, isCoin ? 0 : +(Math.random() * 0.4).toFixed(2), net,
      making[0], making[1], stone, 0, 0, acq);
    await run('INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value) VALUES (?,?,?,?)', uid('bc'), id, shopId, sku);
    await run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, weight_delta_g, reason, actor_id)
      VALUES (?,?,?,?,?,?,?)`, uid('stm'), id, 'manual_adjust', 1, net, 'demo stock', null);
    available.push({ id, sku, name, purity, net_gold_weight_g: net, making_charge_type: making[0], making_charge_value: making[1], stone_value_inr: stone, wastage_charge_inr: 0, other_charges_inr: 0, cat_slug: slug });
    seq += 7;
  }
  console.log(`[seed-demo] catalogue grown to ${available.length} available pieces`);
  return available;
}

/* ── 3. Extra customers ─────────────────────────────────────────────── */
async function seedCustomers(shopId) {
  const count = (await get('SELECT COUNT(*) n FROM customers WHERE shop_id=?', shopId)).n;
  if (count >= 8) { console.log(`[seed-demo] ${count} customers already present`); return; }
  const MORE = [
    ['Rahul Mehta', '+91 99000 10001', null, '1992-07-19', null, 1],
    ['Divya Sharma', '+91 99000 10002', 'divya@example.com', null, '2020-08-15', 0],
    ['Arjun Pillai', '+91 99000 10003', null, '1985-03-08', null, 1],
    ['Sneha Kulkarni', '+91 99000 10004', 'sneha@example.com', '1994-11-30', null, 1],
    ['Vikram Singh', '+91 99000 10005', null, null, '2016-02-14', 0],
    ['Priya Menon', '+91 99000 10006', 'priya@example.com', null, null, 1],
    ['Rohit Gupta', '+91 99000 10007', null, null, null, 0],
    ['Ananya Rao', '+91 99000 10008', 'ananya@example.com', '1996-09-05', null, 1],
    ['Karthik Iyer', '+91 99000 10009', null, null, '2022-01-26', 0],
  ];
  let code = count;
  for (const [nm, ph, em, bdd, ann, consent] of MORE) {
    code++;
    await run(`INSERT INTO customers (id, shop_id, customer_code, name, phone, normalized_phone, email, birthday, anniversary, marketing_consent, total_spent_inr, purchase_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,0,0)`, uid('cus'), shopId, `C${String(code).padStart(5, '0')}`, nm, ph, normalizePhone(ph), em, bdd, ann, consent);
  }
  console.log(`[seed-demo] added ${MORE.length} customers`);
}

/* ── 4. Finalsized sales + payments ─────────────────────────────────── */
async function seedSales(shopId, adminId, billingId, rateInfo, productPool) {
  const done = (await get(`SELECT COUNT(*) n FROM sales WHERE shop_id = ? AND status = 'finalized'`, shopId)).n;
  const TARGET_BILLS = 95;
  if (done.n >= TARGET_BILLS) { console.log(`[seed-demo] ${done.n} finalized sales already present — skipping bill history`); return; }
  if (done.n) console.log(`[seed-demo] topping up — ${done.n} bills exist, generating up to ${TARGET_BILLS}`);
  const customers = await all('SELECT id FROM customers WHERE shop_id=?', shopId);
  if (!customers.length || !productPool.length) { console.log('[seed-demo] no customers/products to bill — skipped'); return; }
  const rateDays = [...rateInfo.byDay.entries()].sort(); // [['YYYY-MM-DD', rate], ...] ascending
  const nearestRate = (key) => {
    let r = null, id = null;
    for (const [d, v] of rateDays) { if (d <= key) { r = v; id = rateInfo.byDayId.get(d) || null; } else break; }
    if (r == null && rateDays.length) { // dates older than the earliest snapshot — fall back to the oldest known rate
      const [d, v] = rateDays[0];
      r = v; id = rateInfo.byDayId.get(d) || null;
    }
    return { rate: r, snapshotId: id };
  };
  const METHODS = ['upi', 'upi', 'upi', 'cash', 'cash', 'card', 'card', 'bank_transfer'];
  const counters = {}; // year -> highest invoice seq used
  const custAgg = new Map(); // customer id -> {spent, count, last}
  let created = 0, revenue = 0, soldWeights = 0;
  for (let i = 0; i < TARGET_BILLS && productPool.length; i++) {
    const daysAgo = Math.floor(Math.pow(Math.random(), 1.7) * 120); // biased toward recent weeks
    const when = new Date(Date.now() - daysAgo * 86400000);
    when.setUTCHours(10 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), 0, 0);
    const dayKey = when.toISOString().slice(0, 10);
    const { rate, snapshotId } = nearestRate(dayKey);
    if (!rate) continue;
    const year = when.getFullYear();
    counters[year] = counters[year] ?? Number((await get(`SELECT COUNT(*) n FROM sales WHERE invoice_no LIKE ?`, `INV-${year}-%`)).n);
    const invNo = `INV-${year}-${String(++counters[year]).padStart(5, '0')}`;
    const cust = Math.random() < 0.72 ? customers[Math.floor(Math.random() * customers.length)] : null;
    const createdBy = i % 3 === 0 ? adminId : billingId;

    const lines = [];
    const lineCount = Math.random() < 0.35 ? 2 : 1;
    for (let li = 0; li < lineCount && productPool.length; li++) {
      const idx = Math.floor(Math.random() * productPool.length);
      const prod = productPool.splice(idx, 1)[0];
      const calc = priceLine({ product: prod, rate24kPerG: rate });
      lines.push({ prod, calc });
    }
    if (!lines.length) break;
    let subtotal = 0, tax = 0, total = 0;
    for (const { calc } of lines) { subtotal += calc.subtotal_inr; tax += calc.tax_inr; total += calc.line_total_inr; }
    subtotal = Math.round(subtotal * 100) / 100; tax = Math.round(tax * 100) / 100; total = Math.round(total * 100) / 100;

    const saleId = uid('sal');
    await run(`INSERT INTO sales (id, shop_id, invoice_no, customer_id, sold_at, rate_snapshot_id, rate_24k_per_g_inr,
        subtotal_inr, discount_inr, tax_inr, total_inr, status, created_by, created_at)
        VALUES (?,?,?,?,?,NULL,?,0,?,?,?,'finalized',?,?)`,
      saleId, shopId, invNo, cust ? cust.id : null, when.toISOString(), rate, subtotal, tax, total, createdBy, when.toISOString());
    for (const { prod, calc } of lines) {
      await run(`INSERT INTO sale_items (id, sale_id, product_id, sku, name, purity, net_gold_weight_g, rate_24k_per_g_inr, gold_value_inr, making_charge_inr,
          stone_value_inr, wastage_charge_inr, other_charges_inr, discount_inr, tax_inr, line_total_inr)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
        uid('sit'), saleId, prod.id, prod.sku, prod.name, prod.purity, prod.net_gold_weight_g, rate,
        calc.gold_value_inr, calc.making_charge_inr, calc.stone_value_inr, calc.wastage_charge_inr, calc.other_charges_inr, calc.tax_inr, calc.line_total_inr);
      await run(`UPDATE products SET status='sold' WHERE id=?`, prod.id);
      await run(`INSERT INTO stock_movements (id, product_id, movement_type, qty_delta, weight_delta_g, reference_type, reference_id, reason, actor_id)
        VALUES (?,?,?,?,?,?,?,?,?)`, uid('stm'), prod.id, 'sale', -1, -prod.net_gold_weight_g, 'sale', saleId, 'demo finalized sale', createdBy);
    }
    // payments — mostly single, sometimes split across two methods
    if (Math.random() < 0.2 && total > 20000) {
      const first = Math.round(total * 0.6 * 100) / 100;
      const m1 = METHODS[Math.floor(Math.random() * METHODS.length)];
      let m2 = METHODS[Math.floor(Math.random() * METHODS.length)];
      if (m2 === m1) m2 = 'cash';
      await run('INSERT INTO payments (id, sale_id, method, amount_inr, reference, paid_at) VALUES (?,?,?,?,?,?)', uid('pay'), saleId, m1, first, `demo ${m1}`, when.toISOString());
      await run('INSERT INTO payments (id, sale_id, method, amount_inr, reference, paid_at) VALUES (?,?,?,?,?,?)', uid('pay'), saleId, m2, Math.round((total - first) * 100) / 100, `demo ${m2}`, when.toISOString());
    } else {
      const m = METHODS[Math.floor(Math.random() * METHODS.length)];
      await run('INSERT INTO payments (id, sale_id, method, amount_inr, reference, paid_at) VALUES (?,?,?,?,?,?)', uid('pay'), saleId, m, total, `demo ${m}`, when.toISOString());
    }
    if (cust) {
      const agg = custAgg.get(cust.id) || { spent: 0, count: 0, last: when.toISOString() };
      agg.spent += total; agg.count += 1;
      if (when.toISOString() > agg.last) agg.last = when.toISOString();
      custAgg.set(cust.id, agg);
    }
    created++; revenue += total; soldWeights += lines.reduce((s, l) => s + l.prod.net_gold_weight_g, 0);
  }
  for (const [cid, agg] of custAgg) {
    await run(`UPDATE customers SET total_spent_inr = total_spent_inr + ?, purchase_count = purchase_count + ?, last_purchase_at = ? WHERE id=?`,
      Math.round(agg.spent * 100) / 100, agg.count, agg.last, cid);
  }
  console.log(`[seed-demo] ${created} finalized bills over the last 4 months • revenue ${Math.round(revenue).toLocaleString('en-IN')} • ${soldWeights.toFixed(1)}g gold sold`);
}

async function main() {
  await initDb();
  const shop = await ensureShop();
  const admin = await ensureUser(shop, 'admin@shop.local', 'admin', 'Shop Admin', 'Admin@123', { is_primary: true });
  const billing = await ensureUser(shop, 'billing@shop.local', 'billing', 'Billing Staff', 'Billing@123');

  const rateInfo = await seedRates(admin.user_id);
  const pool = await seedProducts(shop.id);
  await seedCustomers(shop.id);
  await seedSales(shop.id, admin.user_id, billing.user_id, rateInfo, pool);

  const rev = await get(`SELECT COUNT(*) c, COALESCE(SUM(total_inr),0) s FROM sales WHERE shop_id=? AND status='finalized'`, shop.id);
  console.log(`[seed-demo] done — ${rev.c} finalized bills, ${Math.round(Number(rev.s)).toLocaleString('en-IN')} total revenue. Logins: admin@shop.local/Admin@123, billing@shop.local/Billing@123`);
  await closeDb();
}

main().catch((e) => { console.error('[seed-demo] failed:', e.message); process.exit(1); });
