import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import ProductCard from '../components/landing/ProductCard';
import { LandIcon } from '../components/landing/landingIcons';
import './landing.css';

export default function Catalogue() {
  const [sp, setSp] = useSearchParams();
  const cat = sp.get('cat') || '';
  const purity = sp.get('purity') || '';
  const qParam = sp.get('q') || '';

  const [q, setQ] = useState(qParam);
  const [dq, setDq] = useState(qParam);
  useEffect(() => { setQ(qParam); setDq(qParam); }, [qParam]);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);

  const rateQ = useQuery({ queryKey: ['pub-rate'], queryFn: () => api.get('/public/rates'), refetchInterval: 60000 });
  const rate24: number | null = rateQ.data?.data?.rate_24k_per_g_inr ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['pub-cat', dq, purity],
    queryFn: () => api.get(`/public/products?q=${encodeURIComponent(dq)}&purity=${encodeURIComponent(purity)}`),
  });

  const seen = new Set<string>();
  const cats: any[] = (data?.categories || []).filter((c: any) => { if (seen.has(c.slug)) return false; seen.add(c.slug); return true; });
  const items: any[] = (data?.data || []).filter((p: any) => !cat || p.category_slug === cat);
  const activeCat = cats.find((c) => c.slug === cat);

  const setParam = (key: string, value: string) => setSp((prev) => {
    const next = new URLSearchParams(prev);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });

  const hasFilters = Boolean(q || purity || cat);
  const clearAll = () => { setQ(''); setDq(''); setSp({}, { replace: true }); };

  return (
    <div className="lp-landing">
      <section className="lp-hero-sm">
        <div className="lp-wrap">
          <nav className="lp-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link><span>›</span><span>Collections</span>
            {activeCat && <><span>›</span><span>{activeCat.name}</span></>}
          </nav>
          <h1>{activeCat ? activeCat.name : 'All Collections'}</h1>
          <p>Explore every piece on our counters — hallmarked, weighed and priced against today&apos;s gold rate.</p>
        </div>
      </section>

      <div className="lp-wrap" style={{ paddingTop: 26, paddingBottom: 56 }}>
        <div className="lp-toolbar">
          <label className="lp-field lp-search-field">
            <LandIcon name="search" size={17} />
            <input placeholder="Search design, SKU…" aria-label="Search jewellery" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="lp-field">
            <select value={purity} onChange={(e) => setParam('purity', e.target.value)} aria-label="Filter by purity">
              <option value="">All purities</option><option>24K</option><option>22K</option><option>18K</option><option>14K</option>
            </select>
          </label>
          <label className="lp-field">
            <select value={cat} onChange={(e) => setParam('cat', e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
        </div>

        {hasFilters && (
          <div className="lp-chips">
            {q && <span className="lp-chip">“{q}”</span>}
            {purity && <span className="lp-chip">{purity}</span>}
            {activeCat && <span className="lp-chip">{activeCat.name}</span>}
            <button type="button" className="lp-clear" onClick={clearAll}>Clear all</button>
          </div>
        )}

        <p className="lp-count">
          {isLoading ? 'Loading pieces…' : `${items.length} piece${items.length === 1 ? '' : 's'}${activeCat ? ` in ${activeCat.name}` : ''}`}
        </p>

        {isLoading ? (
          <div className="lp-grid">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton" style={{ height: 300, borderRadius: 14 }} />)}</div>
        ) : items.length === 0 ? (
          <div className="lp-empty">
            <p>No pieces match your filters.</p>
            <button type="button" className="btn gold" onClick={clearAll}>Clear filters</button>
          </div>
        ) : (
          <div className="lp-grid">
            {items.map((p: any) => <ProductCard key={p.id} p={p} rate24={rate24} />)}
          </div>
        )}
      </div>
    </div>
  );
}
