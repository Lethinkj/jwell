// Pricing service — delegates pure math to @gold-shop/pricing (§7, stack rule:
// never duplicate calculation in clients). All money persisted in INR (2dp),
// computed from integer paise to avoid float drift.
const { calculateLineTotal, toPaise } = require('../../../packages/pricing/src/index.js');

function priceLine({ product, rate24kPerG, discountInr = 0, taxRatePct = 3 }) {
  const calc = calculateLineTotal({
    netGoldWeightG: product.net_gold_weight_g,
    purity: product.purity,
    rate24kPerGPaise: toPaise(rate24kPerG),
    makingChargeType: product.making_charge_type,
    makingChargeValue: product.making_charge_value,
    stoneValueInr: product.stone_value_inr || 0,
    wastageChargeInr: product.wastage_charge_inr || 0,
    otherChargesInr: product.other_charges_inr || 0,
    discountInr, taxRatePct,
  });
  const inr = (paise) => Math.round(paise) / 100;
  return {
    gold_value_inr: inr(calc.goldValuePaise),
    making_charge_inr: inr(calc.makingPaise),
    stone_value_inr: inr(calc.stonePaise),
    wastage_charge_inr: inr(calc.wastagePaise),
    other_charges_inr: inr(calc.otherPaise),
    subtotal_inr: inr(calc.subtotalPaise),
    discount_inr: inr(calc.discountPaise),
    taxable_inr: inr(calc.taxablePaise),
    tax_inr: inr(calc.taxPaise),
    line_total_inr: inr(calc.totalPaise),
    purity_factor: calc.purityFactor,
  };
}

module.exports = { priceLine };
