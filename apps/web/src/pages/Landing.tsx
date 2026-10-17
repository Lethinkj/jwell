import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../lib/api';
import PublicHeader from '../components/landing/PublicHeader';
import ProductRail from '../components/landing/ProductRail';
import ProductCard from '../components/landing/ProductCard';
import { estimatePrice } from '../components/landing/estimate';
import { categoryImage, HERO_IMAGE, EDITORIAL_IMAGE, onImgError } from '../lib/images';
import { LandIcon } from '../components/landing/landingIcons';
import './landing.css';

const STORE = { name: 'Shree Gold Palace', address: 'MG Road, Bengaluru', phone: '+91 80000 00000', hours: '10:30–20:30' };
const catHref = (c: any) => `/shop?cat=${encodeURIComponent(c.slug)}`;

function SectionHead({ eyebrow, title, sub, right }: { eyebrow?: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="lp-sec-head">
      {eyebrow && <span className="lp-eyebrow">{eyebrow}</span>}
      <h2 className="lp-title">{title}</h2>
      {sub && <p className="lp-sub">{sub}</p>}
      {right}
    </div>
  );
}

export default function Landing() {
  const { data, isLoading } = useQuery({ queryKey: ['pub-products', 'landing'], queryFn: () => api.get('/public/products?limit=48') });
  const rateQ = useQuery({ queryKey: ['pub-rate'], queryFn: () => api.get('/public/rates'), refetchInterval: 60000 });

  const products: any[] = data?.data || [];
  const categories: any[] = data?.categories || [];
  const rate = rateQ.data?.data || null;
  const rate24: number | null = rate?.rate_24k_per_g_inr ?? null;

  const withImg = (list: any[]) => list.filter((p) => p.image_url);
  const heroImg = withImg(products)[0]?.image_url || HERO_IMAGE;
  // Prefer a real in-stock photo for a category; otherwise use licensed
  // jewellery imagery so no tile is ever left empty.
  const catImage = (c: any) => products.find((p) => p.category_slug === c.slug && p.image_url)?.image_url || categoryImage(c);

  const trending = products.slice(0, 10);
  const newArrivals = products.slice(0, 12);
  const underBudget = rate24 ? products.filter((p) => { const e = estimatePrice(p, rate24); return e != null && e < 25000; }).slice(0, 8) : [];
  const priced = rate24 ? products.map((p) => ({ p, e: estimatePrice(p, rate24) })).filter((x) => x.e != null) as { p: any; e: number }[] : [];
  const valuePicks = [...priced].sort((a, b) => a.e - b.e).slice(0, 4).map((x) => x.p);
  const budgetPicks = underBudget.length ? underBudget : valuePicks;
  const budgetTitle = underBudget.length ? 'Best picks under ₹25,000' : 'Best value picks';
  // De-duplicate by name (some shops carry repeated labels) and cap so the
  // category row matches the reference's single tidy band.
  const seenCat = new Set<string>();
  const displayCats = categories.filter((c) => { if (seenCat.has(c.name)) return false; seenCat.add(c.name); return true; }).slice(0, 12);
  const presentCats = displayCats.slice(0, 3);
  const mosaicCats = displayCats.slice(3, 8);

  const loadingRail = <div className="lp-grid">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 300, borderRadius: 14 }} />)}</div>;

  return (
    <div className="lp-landing">
      <PublicHeader categories={displayCats} rate={rate} phone={STORE.phone} />

      {/* Hero campaign banner */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-text">
            <span className="lp-eyebrow"><LandIcon name="sparkle" size={15} /> Heirlooms, crafted in gold</span>
            <h1>Timeless gold,<br />made to be treasured.</h1>
            <p className="lp-hero-sub">
              Temple, bridal and everyday collections — every piece weighed, hallmarked and
              priced against the day's approved gold rate.
            </p>
            <div className="lp-hero-cta">
              <Link className="btn gold" to="/shop" style={{ textDecoration: 'none' }}>Shop collections</Link>
              <a className="btn ghost" href={`tel:${STORE.phone.replace(/[^+\d]/g, '')}`} style={{ textDecoration: 'none' }}>Visit the store</a>
            </div>
          </div>
          <div className="lp-hero-media">
            <img src={heroImg} alt="Featured gold jewellery" onError={(e) => onImgError(e, 'hero')} />
            <span className="lp-hero-tag">{rate24 ? `Live 24K rate ${inr(rate24)}/g` : 'Live gold rate updating…'}</span>
          </div>
        </div>
      </section>

      {/* Trust strip (existing business facts only) */}
      <div className="lp-strip">
        <div className="lp-wrap lp-strip-in">
          <div className="lp-strip-item"><LandIcon name="sparkle" size={18} /> BIS Hallmarked</div>
          <div className="lp-strip-item"><LandIcon name="scale" size={18} /> Net-weight &amp; day's-rate pricing</div>
          <div className="lp-strip-item"><LandIcon name="calculator" size={18} /> Transparent price estimate</div>
          <div className="lp-strip-item"><LandIcon name="pin" size={18} /> In-store verified billing</div>
        </div>
      </div>

      {/* Discover by category */}
      {displayCats.length > 0 && (
        <section className="lp-section">
          <div className="lp-wrap">
            <SectionHead eyebrow="Shop by category" title="Discover items by category" sub="Explore the collections on display at our store." />
            <div className="lp-cats">
              {displayCats.map((c) => {
                const img = catImage(c);
                return (
                  <Link key={c.id} to={catHref(c)} className="lp-cat">
                    <span className="lp-cat-media">
                      <img src={img} alt={c.name} loading="lazy" onError={(e) => onImgError(e, c.slug)} />
                    </span>
                    <span className="lp-cat-name">{c.name}</span>
                    <span className="lp-cat-cta">Shop now</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Editorial banner */}
      <section
        className="lp-editorial"
        style={{
          backgroundImage: `linear-gradient(120deg, rgba(71,16,29,.88), rgba(99,22,40,.82)), url(${EDITORIAL_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="lp-wrap">
          <span className="lp-eyebrow"><LandIcon name="sparkle" size={15} /> Minimal, yet striking</span>
          <h2 className="lp-title">Crafted to be treasured</h2>
          <p className="lp-sub">Signature designs finished by hand — chosen for the moments worth remembering.</p>
          <Link className="btn gold" to="/shop" style={{ textDecoration: 'none' }}>Explore the collection</Link>
        </div>
      </section>

      {/* Trending now */}
      <section className="lp-section">
        <div className="lp-wrap">
          <SectionHead eyebrow="Trending now" title="What's catching the light" sub="Popular pieces from across our counters." right={<div style={{ marginTop: 10 }}><Link className="lp-sec-link" to="/shop">View all →</Link></div>} />
          {isLoading ? loadingRail : trending.length ? <ProductRail products={trending} rate24={rate24} /> : <div className="lp-empty">New pieces are on their way.</div>}
        </div>
      </section>

      {/* Find the perfect present */}
      {presentCats.length > 0 && (
        <section className="lp-section tight" style={{ background: 'var(--color-card)' }}>
          <div className="lp-wrap">
            <SectionHead eyebrow="Find the perfect present" title="A piece for every reason to give" />
            <div className="lp-occasions">
              {presentCats.map((c, i) => (
                <Link key={c.id} to={catHref(c)} className="lp-collect" style={{ minHeight: 210 }}>
                  <img src={catImage(c)} alt={c.name} loading="lazy" onError={(e) => onImgError(e, c.slug)} />
                  <span className="lp-collect-body">
                    <h3 className="lp-collect-name">{c.name}</h3>
                    <span className="lp-collect-cta">{['Everyday elegance', 'Gifting favourites', 'Bridal & festive'][i] || 'Curated pieces'} <LandIcon name="arrowRight" size={14} /></span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Best picks (budget band, or best-value fallback) */}
      {budgetPicks.length > 0 && (
        <section className="lp-section">
          <div className="lp-wrap">
            <SectionHead eyebrow={budgetTitle} title="Effortless luxury, accessible always" sub="Live estimates from today's gold rate — final price on verified weight at the store." />
            <div className="lp-grid">
              {budgetPicks.map((p) => <ProductCard key={p.id} p={p} rate24={rate24} />)}
            </div>
          </div>
        </section>
      )}

      {/* Curated collections mosaic */}
      {mosaicCats.length > 0 && (
        <section className="lp-section tight">
          <div className="lp-wrap">
            <SectionHead eyebrow="Curated for you" title="Hand-picked collections" />
            <div className="lp-mosaic">
              {mosaicCats.map((c, i) => (
                <Link key={c.id} to={catHref(c)} className={`lp-collect${i === 0 ? ' tall' : ''}`}>
                  <img src={catImage(c)} alt={c.name} loading="lazy" onError={(e) => onImgError(e, c.slug)} />
                  <span className="lp-collect-body">
                    <h3 className="lp-collect-name">{c.name}</h3>
                    <span className="lp-collect-cta">Shop collection <LandIcon name="arrowRight" size={14} /></span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* New arrivals */}
      {newArrivals.length > 0 && (
        <section className="lp-section">
          <div className="lp-wrap">
            <SectionHead eyebrow="New arrivals" title="Just added to the counter" right={<div style={{ marginTop: 10 }}><Link className="lp-sec-link" to="/shop">See everything →</Link></div>} />
            <div className="lp-grid">
              {newArrivals.map((p) => <ProductCard key={p.id} p={p} rate24={rate24} />)}
            </div>
          </div>
        </section>
      )}

      {/* Pricing transparency + store */}
      <section className="lp-section tight" id="lp-rate">
        <div className="lp-wrap lp-split">
          <div className="lp-panel">
            <h3>How we price</h3>
            <p>Every website estimate is built the same way the invoice is — from weight measured on our own scales and the day's approved rate.</p>
            <div className="lp-price-rows">
              <div className="lp-price-row"><span>Gold value (net weight × day's rate × purity)</span><span>{rate24 ? inr(rate24) + '/g 24K' : '—'}</span></div>
              <div className="lp-price-row"><span>Making charge</span><span>As per piece</span></div>
              <div className="lp-price-row"><span>Stone / wastage</span><span>As declared</span></div>
              <div className="lp-price-row"><span>GST</span><span>At billing</span></div>
            </div>
            <p style={{ marginTop: 12, fontSize: 13 }}>Website prices are <em>estimates</em> — the final invoice is computed in-store from verified weights.</p>
          </div>
          <div className="lp-panel lp-store" id="lp-store">
            <h3>Visit our store</h3>
            <p>Walk in to see the full collection, weigh your piece and get an exact quote.</p>
            <div className="lp-store-line"><LandIcon name="pin" size={18} /> {STORE.address}</div>
            <div className="lp-store-line"><LandIcon name="phone" size={18} /> {STORE.phone}</div>
            <div className="lp-store-line"><LandIcon name="sparkle" size={18} /> Open daily {STORE.hours}</div>
            <a className="btn gold" href={`tel:${STORE.phone.replace(/[^+\d]/g, '')}`} style={{ textDecoration: 'none' }}>Call the store</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div>
              <div className="lp-footer-brand"><img src="/logo.png" alt="" /> {STORE.name}</div>
              <p className="lp-footer-note">
                {STORE.address} • {STORE.phone} • Open daily {STORE.hours}.<br />
                Prices shown are estimates based on the live gold rate. Marketing messages are sent only with your consent — opt out anytime.
              </p>
            </div>
            <div>
              <h4>Collections</h4>
              {displayCats.slice(0, 6).map((c) => <Link key={c.id} to={catHref(c)}>{c.name}</Link>)}
              {!displayCats.length && <Link to="/shop">All collections</Link>}
            </div>
            <div>
              <h4>Store</h4>
              <Link to="/shop">Browse catalogue</Link>
              <Link to="/login">Staff sign in</Link>
              <a href="#lp-rate">How we price</a>
              <a href="#lp-store">Visit us</a>
            </div>
          </div>
          <div className="lp-footer-bottom">© {new Date().getFullYear()} {STORE.name}. Prices are estimates — final billing in-store.</div>
        </div>
      </footer>
    </div>
  );
}
