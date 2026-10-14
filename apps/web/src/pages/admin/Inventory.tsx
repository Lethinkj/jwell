import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, inr } from '../../lib/api';

export default function Inventory() {
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const list = useQuery({ queryKey: ['inv', q], queryFn: () => api.get(`/products?q=${encodeURIComponent(q)}&status=all&limit=50`) });
  const cats = useQuery({ queryKey: ['cats'], queryFn: () => api.get('/categories') });
  const [form, setForm] = useState<any>({ name: '', sku: '', category_id: '', purity: '22K', gross_weight_g: '', net_gold_weight_g: '', making_charge_type: 'percentage', making_charge_value: 12, acquisition_cost_inr: '' });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const create = async () => {
    setMsg('');
    try {
      await api.post('/products', { ...form, gross_weight_g: Number(form.gross_weight_g), net_gold_weight_g: Number(form.net_gold_weight_g), making_charge_value: Number(form.making_charge_value), acquisition_cost_inr: Number(form.acquisition_cost_inr) });
      setMsg('Piece created with unique barcode.');
      list.refetch();
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Inventory</h1>
      <p style={{ color: 'var(--color-muted)' }}>Item-level stock: SKU, purity, weights, acquisition cost, barcode, movements.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <div className="card">
          <strong>Add piece</strong>
          {[['name', 'Name'], ['sku', 'SKU (unique)'], ['gross_weight_g', 'Gross wt g'], ['net_gold_weight_g', 'Net gold wt g'], ['acquisition_cost_inr', 'Acquisition cost ₹']].map(([k, l]) => (
            <div key={k}><label className="lbl">{l}</label><input value={form[k]} onChange={(e) => set(k, e.target.value)} /></div>))}
          <label className="lbl">Category</label>
          <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">—</option>{(cats.data?.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.sku_prefix})</option>)}
          </select>
          <div className="filters"><select value={form.purity} onChange={(e) => set('purity', e.target.value)}><option>24K</option><option>22K</option><option>18K</option><option>14K</option></select>
            <select value={form.making_charge_type} onChange={(e) => set('making_charge_type', e.target.value)}><option value="percentage">making %</option><option value="per_gram">making ₹/g</option><option value="fixed">making flat ₹</option></select>
            <input value={form.making_charge_value} onChange={(e) => set('making_charge_value', e.target.value)} /></div>
          <button className="btn gold" onClick={create}>Save piece</button>
        </div>
        <div className="card">
          <strong>Stock</strong>
          <input placeholder="Search SKU / name / design…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '8px 0' }} />
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>SKU</th><th>Item</th><th>Net g</th><th>Status</th><th>Acq.</th></tr></thead>
            <tbody>{(list.data?.data || []).map((p: any) => (
              <tr key={p.id}><td>{p.sku}</td><td>{p.name}<br /><small style={{ color: 'var(--color-muted)' }}>{p.purity} • {p.category_name}</small></td><td>{p.net_gold_weight_g}</td>
                <td><span className={`badge ${p.status === 'available' ? 'ok' : p.status === 'sold' ? 'err' : 'warn'}`}>{p.status}</span></td><td>{inr(p.acquisition_cost_inr)}</td></tr>))}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
