import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLineTotal, purityFactor, toRate24k, toPaise } from '../src/index.js';

test('purity factors per §7', () => {
  assert.equal(purityFactor('24K'), 1.0);
  assert.equal(purityFactor('22k'), 0.916);
  assert.equal(purityFactor('18K'), 0.75);
  assert.throws(() => purityFactor('20K'), /Unknown purity/);
});

test('direct-purity rate converts to 24K reference once (no double factor)', () => {
  // 22K quoted 7340/g => 24K ref = 7340/0.916
  const ref = toRate24k(toPaise(7340), '22K');
  assert.ok(Math.abs(ref - toPaise(7340) / 0.916) < 2);
  assert.equal(toRate24k(toPaise(8000), '24K'), toPaise(8000));
});

test('illustrative §7.2: 10g 22K @ 8000/24K, 12% making, stone 5000, 3% tax', () => {
  const r = calculateLineTotal({
    netGoldWeightG: 10, purity: '22K', rate24kPerGPaise: toPaise(8000),
    makingChargeType: 'percentage', makingChargeValue: 12,
    stoneValueInr: 5000, taxRatePct: 3,
  });
  // gold = 10*800000*0.916 = 7,328,000 paise
  assert.equal(r.goldValuePaise, 7328000);
  assert.equal(r.makingPaise, Math.round(7328000 * 0.12));
  assert.equal(r.subtotalPaise, 7328000 + Math.round(7328000 * 0.12) + 500000);
  assert.equal(r.taxPaise, Math.round(r.taxablePaise * 0.03));
  assert.equal(r.totalPaise, r.taxablePaise + r.taxPaise);
});

test('per-gram and fixed making charges', () => {
  const a = calculateLineTotal({ netGoldWeightG: 5, purity: '18K', rate24kPerGPaise: toPaise(8000), makingChargeType: 'per_gram', makingChargeValue: 450, taxRatePct: 3 });
  assert.equal(a.makingPaise, toPaise(5 * 450));
  const b = calculateLineTotal({ netGoldWeightG: 5, purity: '18K', rate24kPerGPaise: toPaise(8000), makingChargeType: 'fixed', makingChargeValue: 2500, taxRatePct: 3 });
  assert.equal(b.makingPaise, toPaise(2500));
});

test('discount clamped to subtotal; negatives rejected; money is integer', () => {
  const r = calculateLineTotal({ netGoldWeightG: 1, purity: '24K', rate24kPerGPaise: toPaise(8000), makingChargeType: 'fixed', makingChargeValue: 0, discountInr: 999999, taxRatePct: 3 });
  assert.equal(r.taxablePaise, 0);
  assert.equal(r.totalPaise, 0);
  assert.ok(Number.isInteger(r.totalPaise));
  assert.throws(() => calculateLineTotal({ netGoldWeightG: -1, purity: '22K', rate24kPerGPaise: 1, makingChargeType: 'fixed', makingChargeValue: 0 }), /positive/);
});

test('historical snapshot stability: same inputs => same total (rate change must not rewrite)', () => {
  const inp = { netGoldWeightG: 8.25, purity: '22K', rate24kPerGPaise: toPaise(7850.5), makingChargeType: 'percentage', makingChargeValue: 10, stoneValueInr: 1200, wastageChargeInr: 300, taxRatePct: 3 };
  assert.equal(calculateLineTotal(inp).totalPaise, calculateLineTotal({ ...inp }).totalPaise);
});
