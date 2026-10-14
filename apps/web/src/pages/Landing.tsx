import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../lib/api';

const jewel = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`;

export default function Landing() {
  const { data } = useQuery({ queryKey: ['pub-products'], queryFn: () => api.get('/public/products?limit=8') });
  const featured = data?.data || [];
  return (
    <div className="page">
      <section className="hero">
        <p className="badge ok" style={{ marginBottom: 12 }}>BIS Hallmarked • Transparent weight &amp; rate pricing</p>
        <h1>Heirlooms, crafted in gold.</h1>
        <p>Temple, bridal and everyday collections — every piece weighed, hallmarked and priced against the day's approved gold rate.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link className="btn gold" to="/shop" style={{ textDecoration: 'none' }}>Browse collections</Link>
          <a className="btn ghost" href="tel:+918000000000" style={{ textDecoration: 'none' }}>Visit store</a>
        </div>
      </section>
      <section style={{ padding: '8px 24px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 30 }}>Featured pieces</h2>
        <div className="grid catalog">
          {featured.map((p: any) => (
            <Link key={p.id} to={`/shop/${p.id}`} className="tile" style={{ textDecoration: 'none', color: 'inherit' }}>
              <img src={p.image_url || jewel(p.sku)} alt={p.name} loading="lazy" />
              <div className="pad"><strong>{p.name}</strong><br /><small style={{ color: 'var(--color-muted)' }}>{p.category_name} • {p.purity} • {p.net_gold_weight_g} g</small></div>
            </Link>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginTop: 28 }}>
          {[['Rings', 'rings'], ['Necklaces', 'necklaces'], ['Bangles', 'bangles'], ['Coins', 'coins']].map(([n, s]) => (
            <Link key={s} to={`/shop?cat=${s}`} className="card" style={{ textDecoration: 'none', background: 'var(--color-blush)' }}><strong>{n}</strong><br /><small>Shop {n.toLowerCase()} →</small></Link>
          ))}
        </div>
        <div className="card" style={{ marginTop: 24 }}>
          <strong>How we price</strong>
          <p style={{ color: 'var(--color-muted)' }}>Gold value (net weight × day's rate × purity) + making charge + stone/wastage + GST. Website prices are <em>estimates</em> — the final invoice is calculated in-store from verified weights (§7).</p>
          <p><strong>Store:</strong> MG Road, Bengaluru • 10:30–20:30 • +91 80000 00000</p>
        </div>
      </section>
      <footer style={{ borderTop: '1px solid var(--color-border)', padding: 20, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
        Prices are estimates. Marketing messages only with your consent — opt out anytime. {inr(0).slice(0, 1)} rates update from the approved benchmark.
      </footer>
    </div>
  );
}
