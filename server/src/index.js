const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('express-async-errors'); // forward async route throws to the error middleware (else one bad query kills the process)
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { get, all, initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

// Schema is ensured via app.ready (awaited on boot and in tests).
app.ready = initDb();

// Public (unauthenticated) catalogue — costs/notes never exposed (§5.1)
app.get('/api/public/rates', async (req, res, next) => {
  try {
    const { currentRate, rateFreshness } = require('./services/rates');
    const rate = await currentRate();
    res.json({ data: rate ? { rate_24k_per_g_inr: rate.rate_24k_per_g_inr, observed_at: rate.observed_at, source: rate.source } : null, freshness: rate ? rateFreshness(rate) : { status: 'missing' } });
  } catch (e) { next(e); }
});
app.get('/api/public/products', async (req, res, next) => {
  try {
    const shop = await get('SELECT id FROM shops LIMIT 1');
    if (!shop) return res.json({ data: [] });
    const { q, category_id, purity, page = 1, limit = 24 } = req.query;
    const conds = [`p.status='available'`]; const args = [];
    if (q) { conds.push('(p.name LIKE ? OR p.sku LIKE ? OR p.design_code LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (category_id) { conds.push('p.category_id=?'); args.push(category_id); }
    if (purity) { conds.push('p.purity=?'); args.push(purity); }
    const rows = await all(`SELECT p.id, p.sku, p.design_code, p.name, p.purity, p.gross_weight_g, p.net_gold_weight_g,
      p.making_charge_type, p.making_charge_value, p.stone_value_inr, p.image_url, c.name AS category_name, c.slug AS category_slug
      FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${conds.join(' AND ')}
      ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, ...args, Number(limit), (Number(page) - 1) * Number(limit));
    const cats = await all('SELECT id, name, slug FROM categories WHERE active=1');
    res.json({ data: rows, categories: cats });
  } catch (e) { next(e); }
});
app.get('/api/public/products/:id', async (req, res, next) => {
  try {
    const row = await get(`SELECT p.id, p.sku, p.design_code, p.name, p.purity, p.gross_weight_g, p.net_gold_weight_g,
      p.making_charge_type, p.making_charge_value, p.stone_value_inr, p.wastage_charge_inr, p.other_charges_inr, p.image_url,
      c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.id=? AND p.status='available'`, req.params.id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json({ data: row });
  } catch (e) { next(e); }
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: 'supabase-postgres', time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/catalog'));
app.use('/api', require('./routes/ops'));
app.use('/api', require('./routes/sales'));
app.use('/api', require('./routes/crm'));

app.get('/api/version', (req, res) => res.json({ ok: true }));

// Consistent error shape (§9)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Unexpected error', correlationId: Date.now().toString(36) });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.ready.then(() => {
    const srv = app.listen(PORT, () => console.log(`[server] Gold Shop API on http://localhost:${PORT} (db: Supabase Postgres)`));
    srv.on('error', (e) => {
      if (e && e.code === 'EADDRINUSE') {
        console.error(`[server] Port ${PORT} is already in use — kill the old process first:  lsof -ti:${PORT} | xargs kill -9`);
        process.exit(1);
      }
      throw e;
    });
  }).catch((e) => { console.error('[server] DB init failed:', e.message); process.exit(1); });
}
module.exports = app;
