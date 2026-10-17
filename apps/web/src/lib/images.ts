// Jewellery fallback photos per category (Unsplash + Pexels CDNs, both free for
// commercial use). Real piece photos (image_url) always win; these only fill in
// until a photo is uploaded.
// If any CDN URL breaks, callers fall back to a picsum seed via onImgError.
const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=60`;
const P = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=900`;

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

/* ── Public storefront helpers ───────────────────────────────────────────────
   The landing/catalogue pages show many pieces from the same category, so a
   single photo per category looks repetitive. These helpers give each piece a
   varied, category-appropriate photo (deterministically, from the SKU) while
   leaving the admin panel's one-photo `pieceImage` behaviour untouched. */

const CATEGORY_GALLERY: Record<string, string[]> = {
  rings: [U('photo-1605100804763-247f67b3557e'), P(2732096), P(2849742), P(4155254)],
  necklaces: [U('photo-1602173574767-37ac01994b2a'), P(20838859), P(12194263), P(7514818)],
  bangles: [U('photo-1611591437281-460bfbe1220a'), P(37485307), P(36738994), P(11495747)],
  bracelets: [U('photo-1611652022419-a9419f74343d'), P(14509640), P(10341191)],
  earrings: [U('photo-1573408301185-9146fe634ad0'), P(6924156), P(36587165), P(10082804)],
  chains: [U('photo-1599643478518-a784e5dc4c8f'), P(7679824), P(12155925), P(1363191)],
  pendants: [U('photo-1599643477877-530eb83abc8e'), P(10217938), P(13292938)],
  coins: [U('photo-1610375461246-83df859d849d'), P(18501298), P(6764554), P(12198523)],
};

const STORE_POOL = [DEFAULT_JEWEL_IMAGE, ...Object.values(CATEGORY_GALLERY).flat()];

export const HERO_IMAGE = U('photo-1602173574767-37ac01994b2a');
export const EDITORIAL_IMAGE = U('photo-1515562141207-7a88fb7ce338');

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Varied storefront image for a product: real photo, else a category photo picked from the SKU. */
export function storefrontImage(p: { image_url?: string | null; category_slug?: string | null; category_name?: string | null; sku?: string | null; id?: string | null; name?: string | null }): string {
  if (p.image_url) return p.image_url;
  const seed = String(p.sku ?? p.id ?? p.name ?? 'gold');
  const gallery = galleryFor(p.category_slug || p.category_name || '');
  return gallery[hash(seed) % gallery.length];
}

/** Resolve a category to its photo gallery using either the slug or the display name. */
function galleryFor(category: string): string[] {
  const c = (category || '').toLowerCase();
  if (CATEGORY_GALLERY[c]) return CATEGORY_GALLERY[c];
  for (const key of Object.keys(CATEGORY_GALLERY)) {
    if (c && c.includes(key.replace(/s$/, ''))) return CATEGORY_GALLERY[key];
  }
  return STORE_POOL;
}

/** Representative photo for a category tile/circle (accepts the API's {name, slug}). */
export function categoryImage(c: { name?: string | null; slug?: string | null }): string {
  return galleryFor(c.slug || c.name || '')[0];
}
