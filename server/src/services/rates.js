// Rate provider adapter (§5.6 / §6). Production: swap fetchProviderRate()
// with the shop-approved benchmark provider; normalization + audit stay identical.
// Pricing math itself is untouched — see packages/pricing.
const { get, run, uid } = require('../db');

const PURITY_FACTORS = { '24K': 1.0, '22K': 0.916, '18K': 0.75, '14K': 0.585 };

async function fetchProviderRate() {
  // Mock provider: random-walk around last approved rate so pilot/demo works offline.
  // Replace with HTTPS call to the approved provider (unit/currency/purity documented).
  const last = await get(`SELECT * FROM gold_rates ORDER BY observed_at DESC LIMIT 1`);
  const base = last ? last.rate_24k_per_g_inr : 9800;
  const drift = (Math.random() - 0.5) * 40;
  const rate24k = Math.round((base + drift) * 100) / 100;
  return { source: 'pilot-feed', purity_basis: '24K', rate_per_g_inr: rate24k, rate_24k_per_g_inr: rate24k, currency: 'INR', unit: 'gram', observed_at: new Date().toISOString() };
}

function normalizeTo24k(ratePerG, basis) {
  const f = PURITY_FACTORS[String(basis || '24K').toUpperCase()];
  if (!f) throw new Error(`Unknown purity basis ${basis}`);
  return Math.round((ratePerG / f) * 100) / 100;
}

async function currentRate() {
  return (await get(`SELECT * FROM gold_rates WHERE approved = 1 ORDER BY observed_at DESC LIMIT 1`)) || null;
}

function rateFreshness(rate) {
  if (!rate) return { status: 'missing', ageMinutes: Infinity };
  const ageMin = (Date.now() - new Date(rate.observed_at).getTime()) / 60000;
  const staleAfter = Number(process.env.RATE_STALE_MINUTES || 120);
  return { status: ageMin > staleAfter ? 'stale' : 'fresh', ageMinutes: Math.round(ageMin) };
}

async function storeRate({ source, purity_basis, rate_per_g_inr, observed_at, created_by, approved = 1, override_reason = null }) {
  const rate24k = purity_basis === '24K' ? rate_per_g_inr : normalizeTo24k(rate_per_g_inr, purity_basis);
  const id = uid('rate');
  await run(`INSERT INTO gold_rates (id, source, purity_basis, rate_per_g_inr, rate_24k_per_g_inr, currency, unit, observed_at, approved, override_reason, created_by)
    VALUES (?,?,?,?,?,'INR','gram',?,?,?,?)`, id, source, purity_basis, rate_per_g_inr, rate24k, observed_at || new Date().toISOString(), approved, override_reason, created_by || null);
  return get('SELECT * FROM gold_rates WHERE id = ?', id);
}

module.exports = { fetchProviderRate, normalizeTo24k, currentRate, rateFreshness, storeRate, PURITY_FACTORS };
