import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import BarcodeLabel, { LabelData } from '../../components/BarcodeLabel';
import ScannerModal from '../../components/ScannerModal';

// Admin-only Barcode Generator: A) new product + barcode, B) labels for existing, + scanner test.
export default function Barcodes() {
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [labels, setLabels] = useState<{ data: LabelData; copies: number; key: string }[]>([]);
  const [copies, setCopies] = useState(1);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<any>({ name: '', sku: '', category_id: '', purity: '22K', gross_weight_g: '', net_gold_weight_g: '', stone_weight_g: 0, making_charge_type: 'percentage', making_charge_value: 12, stone_value_inr: 0, wastage_charge_inr: 0, other_charges_inr: 0, acquisition_cost_inr: '', quantity: 1 });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const cats = useQuery({ queryKey: ['cats'], queryFn: () => api.get('/categories') });

  const search = async () => {
    setMsg('');
    try {
      const r = await api.get(`/products?q=${encodeURIComponent(q)}&status=all&limit=20`);
      setFound(r.data);
      if (!r.data.length) setMsg('No products match.');
    } catch (e: any) { setMsg(e.message); }
  };

  const addLabel = async (productId: string, n: number) => {
    setMsg('');
    try {
      const r = await api.get(`/products/${productId}/label`);
      setLabels([...labels, { data: r.data, copies: n, key: `${productId}-${Date.now()}` }]);
    } catch (e: any) { setMsg(e.message); }
  };

  // Workflow A: create product(s) via existing API, then fetch labels. Quantity = individually tracked pieces.
  const createAndLabel = async () => {
    setMsg('');
    try {
      const qty = Math.max(1, Math.min(50, Number(form.quantity) || 1));
      for (let i = 0; i < qty; i++) {
        const sku = qty === 1 ? form.sku : `${form.sku}-${i + 1}`;
        const r = await api.post('/products', {
          ...form, sku,
          gross_weight_g: Number(form.gross_weight_g), net_gold_weight_g: Number(form.net_gold_weight_g),
          stone_weight_g: Number(form.stone_weight_g) || 0, making_charge_value: Number(form.making_charge_value),
          stone_value_inr: Number(form.stone_value_inr) || 0, wastage_charge_inr: Number(form.wastage_charge_inr) || 0,
          other_charges_inr: Number(form.other_charges_inr) || 0, acquisition_cost_inr: Number(form.acquisition_cost_inr),
        });
        const lbl = await api.get(`/products/${r.data.id}/label`);
        setLabels((prev) => [...prev, { data: lbl.data, copies: 1, key: `${r.data.id}-${Date.now()}` }]);
      }
      setMsg(`Saved ${qty} piece(s) — each with its own unique barcode. Labels queued below.`);
    } catch (e: any) { setMsg(e.message); }
  };

  const regenerate = async (productId: string, confirm: boolean) => {
    setMsg('');
    try {
      await api.post(`/products/${productId}/barcode`, { confirm });
      setMsg(confirm ? 'Barcode replaced (audited).' : 'Done.');
    } catch (e: any) { setMsg(e.message + (String(e.message).includes('confirm') ? ' — tick confirm to proceed.' : '')); }
  };

  const verifyScan = async (value: string) => {
    try {
      const r = await api.get(`/products/barcode/${encodeURIComponent(value)}`);
      setMsg(`✓ Scanner OK: ${value} → ${r.data.sku} ${r.data.name} (${r.data.status})`);
    } catch (e: any) { setMsg(`Scan result "${value}": ${e.message}`); }
  };

  return (
    <div className="page">
      <div className="no-print">
        <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Barcode Generator</h1>
        <p style={{ color: 'var(--color-muted)' }}>Code 128 labels from saved product IDs. The database value is the identifier — never the image alone.</p>
        {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={() => setTesting(true)}>⛶ Test scanner</button>
          <button className="btn ghost" onClick={() => window.print()} disabled={!labels.length}>🖨 Print all labels</button>
          <button className="btn ghost" onClick={() => setLabels([])} disabled={!labels.length}>Clear queue</button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
          <div className="card">
            <strong>A. New product + barcode</strong>
            {[['name', 'Jewellery name'], ['sku', 'SKU (unique; leave blank only if single piece — SKU required)'], ['gross_weight_g', 'Gross weight g'], ['net_gold_weight_g', 'Net gold weight g'], ['acquisition_cost_inr', 'Acquisition cost ₹'], ['quantity', 'Quantity (pieces, each gets own barcode)']].map(([k, l]) => (
              <div key={k}><label className="lbl">{l}</label><input value={form[k]} onChange={(e) => set(k, e.target.value)} /></div>))}
            <label className="lbl">Category</label>
            <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">—</option>{(cats.data?.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="filters">
              <select value={form.purity} onChange={(e) => set('purity', e.target.value)}><option>24K</option><option>22K</option><option>18K</option><option>14K</option></select>
              <select value={form.making_charge_type} onChange={(e) => set('making_charge_type', e.target.value)}><option value="percentage">making %</option><option value="per_gram">making ₹/g</option><option value="fixed">making flat ₹</option></select>
              <input value={form.making_charge_value} onChange={(e) => set('making_charge_value', e.target.value)} placeholder="making value" />
            </div>
            <div className="filters">
              <input value={form.stone_value_inr} onChange={(e) => set('stone_value_inr', e.target.value)} placeholder="stone ₹" />
              <input value={form.wastage_charge_inr} onChange={(e) => set('wastage_charge_inr', e.target.value)} placeholder="wastage ₹" />
              <input value={form.other_charges_inr} onChange={(e) => set('other_charges_inr', e.target.value)} placeholder="other ₹" />
            </div>
            <button className="btn gold" onClick={createAndLabel}>Save + generate barcode</button>
          </div>
          <div className="card">
            <strong>B. Labels for existing products</strong>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input placeholder="Search name / SKU / purity…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
              <button className="btn" onClick={search}>Search</button>
            </div>
            <label className="lbl">Copies per label</label>
            <input type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(Number(e.target.value) || 1)} style={{ maxWidth: 120 }} />
            {(found).map((p: any) => (
              <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}><strong>{p.sku}</strong> {p.name}<br /><small style={{ color: 'var(--color-muted)' }}>{p.purity} • {p.net_gold_weight_g} g • {p.status}</small></div>
                <button className="btn ghost" onClick={() => addLabel(p.id, copies)}>Label ×{copies}</button>
                <button className="btn ghost" title="Replace barcode (audited, needs confirm)" onClick={() => regenerate(p.id, window.confirm('Replace this product\'s active barcode? This is audited.'))}>Regenerate</button>
              </div>))}
          </div>
        </div>
      </div>
      {labels.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong className="no-print">Label queue ({labels.reduce((s, l) => s + l.copies, 0)} labels) — preview exactly as printed</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            {labels.flatMap((l) => Array.from({ length: l.copies }, (_, i) => <BarcodeLabel key={`${l.key}-${i}`} data={l.data} />))}
          </div>
        </div>
      )}
      {testing && <ScannerModal title="Scanner test — verifies against the database" onDetect={verifyScan} onClose={() => setTesting(false)} />}
    </div>
  );
}
