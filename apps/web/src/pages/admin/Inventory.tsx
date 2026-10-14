import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../../lib/api';

const PURITIES = ['', '24K', '22K', '18K', '14K'];
const STATUSES = [['available', 'Available'], ['all', 'All statuses'], ['sold', 'Sold'], ['reserved', 'Reserved'], ['damaged', 'Damaged']];

export default function Inventory() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [purity, setPurity] = useState('');
  const [status, setStatus] = useState('available');
  const [minW, setMinW] = useState('');
  const [maxW, setMaxW] = useState('');

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

  const totPieces = list.data?.total ?? rows.length;
  const totGold = rows.reduce((s, p) => s + (Number(p.net_gold_weight_g) || 0), 0);
  const totAcq = rows.reduce((s, p) => s + (Number(p.acquisition_cost_inr) || 0), 0);

  const reset = () => { setQ(''); setCategoryId(''); setPurity(''); setStatus('available'); setMinW(''); setMaxW(''); };

  return (
    <div className="page">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', margin: 0, flex: 1 }}>Inventory</h1>
        <Link className="btn gold" to="/admin/inventory/new">+ Add piece</Link>
        <Link className="btn ghost" to="/admin/inventory/report">Purchase report</Link>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>Every piece in the shop — search, filter, and watch low-stock categories (under 5 pieces).</p>

      {lowCats.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--color-warn, #c77)', marginBottom: 12 }}>
          <strong>⚠ Low stock:</strong> {lowCats.join(', ')} — under 5 pieces available. Restock soon.
        </div>
      )}

      <div className="grid kpi">
        {[['Pieces (filter)', totPieces], ['Net gold (filter)', `${totGold.toFixed(2)} g`], ['Acquisition value', inr(totAcq)], ['Low-stock categories', lowCats.length || 'none']].map(([k, v]) => (
          <div key={k} className="card"><small style={{ color: 'var(--color-muted)' }}>{k}</small><div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div></div>))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Search & filters</strong>
        <div className="filters" style={{ marginTop: 8 }}>
          <input placeholder="Search SKU / name / design…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
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
          <button className="btn ghost" onClick={reset}>Clear</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Stock {list.data ? `(${list.data.total} found)` : ''}</strong>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>SKU</th><th>Item</th><th>Purity</th><th>Net g</th><th>Status</th><th>Acq.</th><th></th></tr></thead>
          <tbody>{rows.map((p: any) => (
            <tr key={p.id}>
              <td>{p.sku}</td>
              <td>{p.name}<br /><small style={{ color: 'var(--color-muted)' }}>{p.category_name || '—'}{p.design_code ? ` • ${p.design_code}` : ''}</small></td>
              <td>{p.purity}</td>
              <td>{p.net_gold_weight_g}</td>
              <td><span className={`badge ${p.status === 'available' ? 'ok' : p.status === 'sold' ? 'err' : 'warn'}`}>{p.status}</span>
                {isLow(p) && p.status === 'available' && <span className="badge warn" style={{ marginLeft: 4 }}>low stock</span>}</td>
              <td>{inr(p.acquisition_cost_inr)}</td>
              <td><Link to={`/admin/inventory/new?id=${p.id}`}>Edit</Link></td>
            </tr>))}
          </tbody></table></div>
      </div>
    </div>
  );
}
