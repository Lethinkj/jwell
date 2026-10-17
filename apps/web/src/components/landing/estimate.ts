/* Estimate helper for the public landing page only. Mirrors the transparent
   pricing already shown on the public product page: gold value (net weight ×
   day's 24K rate × purity factor) + declared stone value. This is an estimate,
   never a final invoice price. */
const PURITY_FACTOR: Record<string, number> = { '24K': 1, '22K': 0.916, '18K': 0.75, '14K': 0.585 };

export function estimatePrice(p: any, rate24: number | null | undefined): number | null {
  if (!p || !rate24) return null;
  const factor = PURITY_FACTOR[p.purity] ?? 1;
  const gold = Number(p.net_gold_weight_g || 0) * Number(rate24) * factor;
  const stone = Number(p.stone_value_inr || 0);
  const total = gold + stone;
  return total > 0 ? Math.round(total) : null;
}
