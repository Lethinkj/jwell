// Jewellery fallback photos per category (Unsplash CDN). Real piece photos
// (image_url) always win; these only fill in until a photo is uploaded.
// If any CDN URL breaks, callers fall back to a picsum seed via onImgError.
const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=60`;

const CATEGORY_IMAGES: Record<string, string> = {
  rings: U('photo-1605100804763-247f67b3557e'),
  necklaces: U('photo-1602173574767-37ac01994b2a'),
  bangles: U('photo-1611591437281-460bfbe1220a'),
  bracelets: U('photo-1611652022419-a9419f74343d'),
  earrings: U('photo-1573408301185-9146fe634ad0'),
  chains: U('photo-1599643478518-a784e5dc4c8f'),
  pendants: U('photo-1599643477877-530eb83abc8e'),
  coins: U('photo-1610375461246-83df859d849d'),
};

export const DEFAULT_JEWEL_IMAGE = U('photo-1515562141207-7a88fb7ce338');

/** Best image for a piece: uploaded photo → category jewellery photo → generic jewellery photo. */
export function pieceImage(p: { image_url?: string | null; category_slug?: string | null }): string {
  if (p.image_url) return p.image_url;
  const slug = (p.category_slug || '').toLowerCase();
  return CATEGORY_IMAGES[slug] || DEFAULT_JEWEL_IMAGE;
}

/** Last-resort fallback if the CDN image fails: deterministic picsum seed. Never loops. */
export function onImgError(e: React.SyntheticEvent<HTMLImageElement>, seed: string) {
  const el = e.currentTarget;
  if (el.dataset.fb) return;
  el.dataset.fb = '1';
  el.src = `https://picsum.photos/seed/${seed}/600/600`;
}
