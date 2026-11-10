import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, inr } from '../../lib/api';
import { pieceImage, onImgError } from '../../lib/images';
import { Icon, ICONS } from '../../components/icons';
import ProductDetailModal from '../../components/ProductDetailModal';
import ProductFormModal from '../../components/ProductFormModal';

const PURITIES = ['', '24K', '22K', '18K', '14K'];
const STATUSES = [['available', 'Available'], ['all', 'All statuses'], ['sold', 'Sold'], ['reserved', 'Reserved'], ['damaged', 'Damaged']];

export default function Inventory({ startNew = false }: { startNew?: boolean }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const editId = sp.get('id') || '';
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [purity, setPurity] = useState('');
  const [status, setStatus] = useState('available');
  const [minW, setMinW] = useState('');
  const [maxW, setMaxW] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(startNew || !!editId);

  const closeForm = () => {
    setFormOpen(false);
    if (startNew || editId) nav('/admin/inventory', { replace: true });
  };

  const params = new URLSearchParams({ q, status, limit: '50' });
  if (categoryId) params.set('category_id', categoryId);
  if (purity) params.set('purity', purity);
  if (minW) params.set('min_weight', minW);
  if (maxW) params.set('max_weight', maxW);

  const list = useQuery({ queryKey: ['inv', params.toString()], queryFn: () => api.get(`/products?${params}`) });
  const cats = useQuery({ queryKey: ['cats'], queryFn: () => api.get('/categories') });
  const valuation = useQuery({ queryKey: ['r-inv'], queryFn: () => api.get('/reports/inventory') });

  const rows: any[] = list.data?.data || [];
  const lowCats: string[] = (valuation.data?.data?.low_stock || []).map((l: any) => l.category);
  const isLow = (p: any) => lowCats.includes(p.category_name);
  const catSlug: Record<string, string> = {};
  for (const c of cats.data?.data || []) catSlug[c.id] = c.slug;
  const imgOf = (p: any) => pieceImage({ image_url: p.image_url, category_slug: catSlug[p.category_id] });

  const totPieces = list.data?.total ?? rows.length;
  const totGold = rows.reduce((s, p) => s + (Number(p.net_gold_weight_g) || 0), 0);
  const totAcq = rows.reduce((s, p) => s + (Number(p.acquisition_cost_inr) || 0), 0);

  const runSearch = () => setQ(qInput.trim());
  const reset = () => { setQInput(''); setQ(''); setCategoryId(''); setPurity(''); setStatus('available'); setMinW(''); setMaxW(''); };

  return (
    <div className="page">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', margin: 0, flex: 1 }}>Inventory</h1>
        <button type="button" className="btn gold" onClick={() => setFormOpen(true)}>+ Add piece</button>
        <Link className="btn ghost" to="/admin/inventory/report">Purchase report</Link>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>Every piece in the shop — search, filter, and watch low-stock categories (under 5 pieces). Click any piece for its full record, last sale and buying customer.</p>

      {lowCats.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-warn, #c77)', marginBottom: 12 }}>
          <strong>⚠ Low stock:</strong> {lowCats.join(', ')} — under 5 pieces available. Restock soon.
        </div>
      )}

      <div className="grid kpi">
        {[['Pieces (filter)', totPieces], ['Net gold (filter)', `${totGold.toFixed(2)} g`], ['Acquisition value', inr(totAcq)], ['Low-stock categories', lowCats.length || 'none']].map(([k, v]) => (
          <div key={k} className="card"><small style={{ color: 'var(--color-muted)' }}>{k}</small><div className="kpi-value">{v}</div></div>))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Search &amp; filters</strong>
        <div className="filters" style={{ marginTop: 8 }}>
          <input
            placeholder="Search SKU / name / design…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
            }}
            style={{ minWidth: 200 }}
          />
          <button type="button" className="btn gold" onClick={runSearch} style={{ flex: '0 0 auto', minWidth: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon paths={ICONS.search} size={15} />Search
            </span>
          </button>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>{(cats.data?.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={purity} onChange={(e) => setPurity(e.target.value)}>
            {PURITIES.map((p) => <option key={p} value={p}>{p || 'All purities'}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="Min g" value={minW} onChange={(e) => setMinW(e.target.value)} style={{ width: 80 }} />
          <input placeholder="Max g" value={maxW} onChange={(e) => setMaxW(e.target.value)} style={{ width: 80 }} />
          <button type="button" className="btn ghost" onClick={reset}>Clear</button>
        </div>
        <small className="modal-hint">Search applies when you press the Search button or Enter. Filters apply immediately.</small>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Stock {list.data ? `(${list.data.total} found)` : ''}</strong>
        {list.isLoading ? <div className="empty">Loading stock…</div>
        : rows.length === 0 ? <div className="empty">No pieces match — try clearing filters.</div>
        : <div className="grid catalog" style={{ marginTop: 12 }}>{rows.map((p: any) => (
          <button
            key={p.id}
            type="button"
            className="tile"
            onClick={() => setDetailId(p.id)}
            title="Open the full piece record"
          >
            <div style={{ position: 'relative' }}>
              <img src={imgOf(p)} alt={p.name} loading="lazy" onError={(e) => onImgError(e, p.sku)} />
              {isLow(p) && p.status === 'available' && (
                <span className="badge warn" style={{ position: 'absolute', top: 8, left: 8 }}>⚠ low stock</span>)}
              <span className={`badge ${p.status === 'available' ? 'ok' : p.status === 'sold' ? 'err' : 'warn'}`}
                style={{ position: 'absolute', top: 8, right: 8 }}>{p.status}</span>
            </div>
            <div className="pad">
              <strong>{p.name}</strong><br />
              <small style={{ color: 'var(--color-muted)' }}>{p.sku} • {p.category_name || '—'} • {p.purity} • {p.net_gold_weight_g} g</small>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontWeight: 700 }}>{inr(p.acquisition_cost_inr)}</span>
                <small style={{ color: 'var(--color-gold-deep)', fontWeight: 600 }}>View details →</small>
              </div>
            </div>
          </button>))}</div>}
      </div>

      {detailId && <ProductDetailModal productId={detailId} onClose={() => setDetailId(null)} />}
      {formOpen && (
        <ProductFormModal
          productId={editId || undefined}
          onClose={closeForm}
          onSaved={() => list.refetch()}
        />
      )}
    </div>
  );
}
