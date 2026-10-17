const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');
const path = require('path');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  throw new Error('Missing DATABASE_URL for tests.');
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32chars-minimum-xxxxxx';
process.env.MAIL_DISABLED = 'true'; // never send real email from tests

const app = require('../src/index');
const { get, run, uid } = require('../src/db');

let srv;
let base = '';
let token = '';
let shopId = '';
let adminId = '';
let prodId = '';

async function req(method, p, body) {
  const r = await fetch(base + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

before(async () => {
  await app.ready;
  shopId = uid('shop');
  await run(`INSERT INTO shops (id, name) VALUES (?,?)`, shopId, 'Billing Test Boutique');

  adminId = uid('usr');
  const email = `admin_${Date.now()}@test.local`;
  await run(
    `INSERT INTO profiles (user_id, shop_id, role, display_name, email, password_hash, active, is_primary)
     VALUES (?,?,?,?,?,?,1,1)`,
    adminId, shopId, 'admin', 'Shop Admin', email, bcrypt.hashSync('Pass@1234', 10)
  );

  await run(
    `INSERT INTO gold_rates (id, source, purity_basis, rate_per_g_inr, rate_24k_per_g_inr, observed_at, approved)
     VALUES (?,?,?,?,?,?,1)`,
    uid('rate'), 'manual', '24K', 8000, 8000, new Date().toISOString()
  );

  const catId = uid('cat');
  await run(
    `INSERT INTO categories (id, shop_id, name, slug, sku_prefix) VALUES (?,?,?,?,?)`,
    catId, shopId, 'Necklaces', 'necklaces', 'NCK'
  );

  prodId = uid('prd');
  const sku = `NCK-${Date.now().toString().slice(-4)}`;
  await run(
    `INSERT INTO products (id, shop_id, category_id, sku, name, purity, gross_weight_g, net_gold_weight_g,
     making_charge_type, making_charge_value, acquisition_cost_inr, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    prodId, shopId, catId, sku, 'Royal Gold Necklace', '22K', 10, 10, 'percentage', 10, 70000, 'available'
  );
  await run(
    `INSERT INTO product_barcodes (id, product_id, shop_id, barcode_value) VALUES (?,?,?,?)`,
    uid('bc'), prodId, shopId, sku
  );

  srv = app.listen(0);
  base = `http://localhost:${srv.address().port}/api`;

  // Log in as admin
  const login = await req('POST', '/auth/login', { email, password: 'Pass@1234' });
  assert.equal(login.status, 200);
  token = login.data.token;
});

after(() => {
  if (srv) srv.close();
});

test('flow: phone search returns 0 matches -> not found -> register customer with name, phno, email, birthday, anniversary', async () => {
  const testPhone = `98765${Date.now().toString().slice(-5)}`;

  // 1. Phone search: should return 0 matches
  const search = await req('GET', `/customers/phone/${testPhone}`);
  assert.equal(search.status, 200);
  assert.equal(search.data.data.length, 0);

  // 2. Register new customer with full form
  const reg = await req('POST', '/customers', {
    name: 'Ananya Roy',
    phone: testPhone,
    email: 'ananya@example.com',
    address_line1: '12 MG Road',
    city: 'Bengaluru',
    state: 'KA',
    postal_code: '560001',
    birthday: '1995-04-12',
    anniversary: '2020-11-20',
    marketing_consent: true,
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.data.name, 'Ananya Roy');
  assert.equal(reg.data.data.email, 'ananya@example.com');
  assert.equal(reg.data.data.birthday, '1995-04-12');
  assert.equal(reg.data.data.anniversary, '2020-11-20');

  // 3. Phone search again: should now return the created customer and their purchases array
  const search2 = await req('GET', `/customers/phone/${testPhone}`);
  assert.equal(search2.status, 200);
  assert.equal(search2.data.data.length, 1);
  assert.equal(search2.data.data[0].id, reg.data.data.id);
  assert.ok(Array.isArray(search2.data.data[0].purchases));
});

test('flow: barcode estimate -> draft -> finalize with edited final price override', async () => {
  const testPhone = `99887${Date.now().toString().slice(-5)}`;

  // Create customer
  const custRes = await req('POST', '/customers', {
    name: 'Kavita Krishnan',
    phone: testPhone,
    email: 'kavita@example.com',
    address_line1: '45 Church Street',
    city: 'Bengaluru',
    state: 'KA',
    postal_code: '560001',
  });
  assert.equal(custRes.status, 201);
  const custId = custRes.data.data.id;

  // Pricing estimate for product
  const est = await req('POST', '/pricing/estimate', { product_id: prodId });
  assert.equal(est.status, 200);
  assert.ok(est.data.data.line_total_inr > 0);
  const originalLineTotal = est.data.data.line_total_inr;

  // Create Draft
  const draft = await req('POST', '/sales/draft', {
    customer_id: custId,
    lines: [{ product_id: prodId }],
  });
  assert.equal(draft.status, 201);
  const saleId = draft.data.data.id;

  // Cashier edits final price directly (e.g. rounds down or negotiates custom total)
  const editedFinalPrice = 75000;
  const finalize = await req('POST', `/sales/${saleId}/finalize`, {
    lines: [{ product_id: prodId }],
    custom_final_price_inr: editedFinalPrice,
    payments: [{ method: 'upi', amount_inr: editedFinalPrice }],
  });
  assert.equal(finalize.status, 200);
  assert.equal(finalize.data.data.total_inr, editedFinalPrice);
  assert.ok(finalize.data.data.discount_inr > 0, 'Discount must capture the price reduction');
  assert.equal(finalize.data.data.status, 'finalized');

  // Verify GET /sales/:id returns full invoice details for view & PDF download
  const invoice = await req('GET', `/sales/${saleId}`);
  assert.equal(invoice.status, 200);
  assert.equal(invoice.data.data.total_inr, editedFinalPrice);
  assert.equal(invoice.data.data.customer_name, 'Kavita Krishnan');
  assert.equal(invoice.data.data.customer_email, 'kavita@example.com');
  assert.equal(invoice.data.data.lines.length, 1);
  assert.equal(invoice.data.data.payments.length, 1);
  assert.equal(invoice.data.data.payments[0].amount_inr, editedFinalPrice);

  // Verify Customer lifetime spend was updated to the edited final price
  const custCheck = await req('GET', `/customers/${custId}`);
  assert.equal(custCheck.status, 200);
  assert.equal(custCheck.data.data.total_spent_inr, editedFinalPrice);
  assert.equal(custCheck.data.data.purchase_count, 1);
  assert.equal(custCheck.data.data.purchases.length, 1);
  assert.equal(custCheck.data.data.purchases[0].id, saleId);
});

test('flow: manual jewellery piece entry -> draft -> finalize with custom price and verify in sales history', async () => {
  const testPhone = `91234${Date.now().toString().slice(-5)}`;

  // 1. Register customer
  const custRes = await req('POST', '/customers', {
    name: 'Suresh Patel',
    phone: testPhone,
    email: 'suresh@example.com',
    address_line1: '9 Brigade Road',
    city: 'Bengaluru',
    state: 'KA',
    postal_code: '560001',
    birthday: '1988-06-15',
  });
  assert.equal(custRes.status, 201);
  const custId = custRes.data.data.id;

  // 2. Draft sale with manual item entry
  const manualSku = `MAN-${Date.now().toString().slice(-4)}`;
  const draft = await req('POST', '/sales/draft', {
    customer_id: custId,
    lines: [
      {
        sku: manualSku,
        manual_item: {
          name: 'Handcrafted Antique Kada',
          sku: manualSku,
          purity: '22K',
          gross_weight_g: 25.5,
          net_gold_weight_g: 25.0,
          making_charge_type: 'percentage',
          making_charge_value: 12,
          stone_value_inr: 500,
          wastage_charge_inr: 0,
          other_charges_inr: 0,
        },
      },
    ],
  });
  assert.equal(draft.status, 201);
  const saleId = draft.data.data.id;

  // 3. Finalize with custom agreed price
  const agreedPrice = 210000;
  const finalize = await req('POST', `/sales/${saleId}/finalize`, {
    custom_final_price_inr: agreedPrice,
    payments: [{ method: 'card', amount_inr: agreedPrice }],
  });
  assert.equal(finalize.status, 200);
  assert.equal(finalize.data.data.total_inr, agreedPrice);
  assert.equal(finalize.data.data.status, 'finalized');

  // 4. Check history listing contains customer phone and invoice
  const history = await req('GET', `/sales?q=${encodeURIComponent(testPhone)}`);
  assert.equal(history.status, 200);
  assert.equal(history.data.data.length, 1);
  assert.equal(history.data.data[0].id, saleId);
  assert.equal(history.data.data[0].customer_name, 'Suresh Patel');
  assert.equal(history.data.data[0].customer_phone, testPhone);
});

