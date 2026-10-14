import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';

export default function Catalogue() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [purity, setPurity] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['pub-cat', q, purity, sp.get('cat')], queryFn: () => api.get(`/public/products?q=${encodeURIComponent(q)}&purity=${purity}`) });
  const cats: any[] = data?.categories || [];
  const items: any[] = (data?.data || []).filter((p: any) => !sp.get('cat') || p.category_slug === sp.get('cat'));
  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>Collections</h1>
      <div className="filters">
        <input placeholder="Search design, SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={purity} onChange={(e) => setPurity(e.target.value)}><option value="">All purities</option><option>24K</option><option>22K</option><option>18K</option><option>14K</option></select>
        <select value={sp.get('cat') || ''} onChange={(e) => setSp(e.target.value ? { cat: e.target.value } : {})}>
          <option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      {(q || purity || sp.get('cat')) && <div>{[q && `“${q}”`, purity, sp.get('cat')].filter(Boolean).map((c) => <span key={c} className="chip">{c}</span>)}<button className="btn ghost" onClick={() => { setQ(''); setPurity(''); setSp({}); }}>Clear all</button></div>}
      {isLoading ? <div className="grid catalog">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 260 }} />)}</div>
        : items.length === 0 ? <div className="empty">No pieces match — try clearing filters.</div>
        : <div className="grid catalog">{items.map((p: any) => (
          <Link key={p.id} to={`/shop/${p.id}`} className="tile" style={{ textDecoration: 'none', color: 'inherit' }}>
            <img src={p.image_url || `https://picsum.photos/seed/${p.sku}/600/600`} alt={p.name} loading="lazy" />
            <div className="pad"><strong>{p.name}</strong><br /><small style={{ color: 'var(--color-muted)' }}>{p.category_name} • {p.purity} • {p.net_gold_weight_g} g</small></div>
          </Link>))}</div>}
    </div>
  );
}
