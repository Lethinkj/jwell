/**
 * Gold Jewellery pricing engine — §7 of the requirements doc.
 * Pure functions only (no UI, no I/O, no Date.now inside calculation).
 * All money in INTEGER paise (minor units). Weights in grams (float ok, rounded at money step).
 *
 * Formula:
 *   gold_value = net_gold_weight_g * rate_24k_per_g_paise * purity_factor
 *   making   = % of gold_value | per-gram | fixed
 *   subtotal = gold + making + stone + wastage + other
 *   discount = server-validated offer (clamped)
 *   taxable  = subtotal - discount
 *   tax      = taxable * tax_rate (configurable, default 3% GST)
 *   total    = taxable + tax
 */

export const PURITY_FACTORS = {
  '24K': 1.0,
  '22K': 0.916,
  '18K': 0.75,
  '14K': 0.585,
};

export function purityFactor(purity) {
  const f = PURITY_FACTORS[String(purity).toUpperCase()];
  if (f == null) throw new Error(`Unknown purity: ${purity}. Use 24K/22K/18K/14K.`);
  return f;
}

/** Convert a per-gram rate quoted for a direct purity into 24K reference. */
export function toRate24k(ratePerGPaise, ratePurityBasis) {
  if (!Number.isFinite(ratePerGPaise) || ratePerGPaise <= 0) throw new Error('rate must be positive');
  const basis = String(ratePurityBasis || '24K').toUpperCase();
  if (basis === '24K') return Math.round(ratePerGPaise);
  return Math.round(ratePerGPaise / purityFactor(basis));
}

export function roundPaise(n) { return Math.round(n); }
export function toPaise(inr) { return Math.round(Number(inr) * 100); }
export function toInr(paise) { return (paise / 100).toFixed(2); }

export function calcMakingCharge({ makingChargeType, makingChargeValue, goldValuePaise, netGoldWeightG }) {
  const v = Number(makingChargeValue) || 0;
  if (v < 0) throw new Error('making charge cannot be negative');
  switch (makingChargeType) {
    case 'percentage': return roundPaise((goldValuePaise * v) / 100);
    case 'per_gram':
      if (!netGoldWeightG || netGoldWeightG <= 0) throw new Error('net weight required for per-gram making charge');
      return roundPaise(netGoldWeightG * toPaise(v));
    case 'fixed': return toPaise(v);
    default: throw new Error(`Unknown making_charge_type: ${makingChargeType}`);
  }
}

/**
 * Full invoice-line calculation. Returns every component + snapshots for audit.
 * @param {object} p
 * @param {number} p.netGoldWeightG
 * @param {string} p.purity '22K' etc.
 * @param {number} p.rate24kPerGPaise  — 24K reference rate, paise/gram
 * @param {string} p.makingChargeType 'percentage'|'per_gram'|'fixed'
 * @param {number} p.makingChargeValue
 * @param {number} [p.stoneValueInr=0]
 * @param {number} [p.wastageChargeInr=0]
 * @param {number} [p.otherChargesInr=0]
 * @param {number} [p.discountInr=0] — already validated against offer rules by caller
 * @param {number} [p.taxRatePct=3]
 */
export function calculateLineTotal(p) {
  const {
    netGoldWeightG, purity, rate24kPerGPaise,
    makingChargeType, makingChargeValue,
    stoneValueInr = 0, wastageChargeInr = 0, otherChargesInr = 0,
    discountInr = 0, taxRatePct = 3,
  } = p;
  if (!netGoldWeightG || netGoldWeightG <= 0) throw new Error('net_gold_weight_g must be positive');
  if (!rate24kPerGPaise || rate24kPerGPaise <= 0) throw new Error('rate must be positive');
  for (const [k, v] of Object.entries({ stoneValueInr, wastageChargeInr, otherChargesInr, discountInr })) {
    if (Number(v) < 0) throw new Error(`${k} cannot be negative`);
  }
  const factor = purityFactor(purity);
  const goldValuePaise = roundPaise(netGoldWeightG * rate24kPerGPaise * factor);
  const makingPaise = calcMakingCharge({ makingChargeType, makingChargeValue, goldValuePaise, netGoldWeightG });
  const stonePaise = toPaise(stoneValueInr);
  const wastagePaise = toPaise(wastageChargeInr);
  const otherPaise = toPaise(otherChargesInr);
  const subtotalPaise = goldValuePaise + makingPaise + stonePaise + wastagePaise + otherPaise;
  const discountPaise = Math.min(toPaise(discountInr), subtotalPaise);
  const taxablePaise = subtotalPaise - discountPaise;
  const taxPaise = roundPaise((taxablePaise * Number(taxRatePct || 0)) / 100);
  const totalPaise = taxablePaise + taxPaise;
  return {
    purityFactor: factor, goldValuePaise, makingPaise, stonePaise, wastagePaise,
    otherPaise, subtotalPaise, discountPaise, taxablePaise,
    taxPaise, taxRatePct: Number(taxRatePct || 0), totalPaise,
    // human-readable
    goldValueInr: toInr(goldValuePaise), totalInr: toInr(totalPaise),
  };
}

/** Sum finalized lines into invoice totals (net of nothing — caller nets returns separately). */
export function summarizeLines(lines) {
  const t = { subtotalPaise: 0, discountPaise: 0, taxPaise: 0, totalPaise: 0 };
  for (const l of lines) {
    t.subtotalPaise += l.subtotalPaise || 0;
    t.discountPaise += l.discountPaise || 0;
    t.taxPaise += l.taxPaise || 0;
    t.totalPaise += l.totalPaise || 0;
  }
  return t;
}
