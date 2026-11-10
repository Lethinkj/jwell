import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Modal from './Modal';
import { Icon, ICONS } from './icons';

const EMPTY = {
  name: '', sku: '', design_code: '', category_id: '', purity: '22K',
  gross_weight_g: '', stone_weight_g: '0', net_gold_weight_g: '',
  making_charge_type: 'percentage', making_charge_value: '12',
  stone_value_inr: '0', wastage_charge_inr: '0', other_charges_inr: '0',
  acquisition_cost_inr: '', image_url: '', status: 'available', barcode: '',
};

/**
 * Add / edit a single piece. Always rendered as a popup so the inventory list
 * keeps its scroll position and filters behind it.
 */
export default function ProductFormModal({
  productId,
  onClose,
  onSaved,
}: {
  productId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editId = productId || '';
  const [form, setForm] = useState<any>({ ...EMPTY });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const cats = useQuery({ queryKey: ['cats'], queryFn: () => api.get('/categories') });
  const existing = useQuery({
    queryKey: ['product', editId], queryFn: () => api.get(`/products/${editId}`), enabled: !!editId,
  });

  useEffect(() => {
    const d = existing.data?.data;
    if (d) setForm({
      name: d.name || '', sku: d.sku || '', design_code: d.design_code || '',
      category_id: d.category_id || '', purity: d.purity || '22K',
      gross_weight_g: String(d.gross_weight_g ?? ''), stone_weight_g: String(d.stone_weight_g ?? 0),
      net_gold_weight_g: String(d.net_gold_weight_g ?? ''),
      making_charge_type: d.making_charge_type || 'percentage',
      making_charge_value: String(d.making_charge_value ?? 12),
      stone_value_inr: String(d.stone_value_inr ?? 0),
      wastage_charge_inr: String(d.wastage_charge_inr ?? 0),
      other_charges_inr: String(d.other_charges_inr ?? 0),
      acquisition_cost_inr: String(d.acquisition_cost_inr ?? ''),
      image_url: d.image_url || '', status: d.status || 'available', barcode: '',
    });
  }, [existing.data]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const num = (v: any, fb = 0) => (v === '' || v == null ? fb : Number(v));

  const gross = num(form.gross_weight_g, NaN);
  const net = num(form.net_gold_weight_g, NaN);
  const weightErr = !isNaN(gross) && !isNaN(net) && net > gross ? 'Net gold weight cannot exceed gross weight.' : '';
  const requiredMissing = !form.name || !form.sku || !form.category_id || form.net_gold_weight_g === '' || form.acquisition_cost_inr === '';

  const save = async () => {
    setMsg('');
    if (requiredMissing) { setMsg('Name, SKU, category, net gold weight and acquisition cost are required.'); return; }
    if (weightErr) { setMsg(weightErr); return; }
    setSaving(true);
    const payload = {
      ...form,
      gross_weight_g: num(form.gross_weight_g, num(form.net_gold_weight_g)),
      stone_weight_g: num(form.stone_weight_g), net_gold_weight_g: num(form.net_gold_weight_g),
      making_charge_value: num(form.making_charge_value),
      stone_value_inr: num(form.stone_value_inr), wastage_charge_inr: num(form.wastage_charge_inr),
      other_charges_inr: num(form.other_charges_inr), acquisition_cost_inr: num(form.acquisition_cost_inr),
      barcode: form.barcode || undefined,
    };
    try {
      if (editId) await api.patch(`/products/${editId}`, payload);
      else await api.post('/products', payload);
      onSaved();
      onClose();
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  const F = (k: string, label: string, ph = '') => (
    <div><label className="lbl">{label}</label><input value={form[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></div>
  );

  return (
    <Modal
      title={editId ? 'Edit piece' : 'Add piece'}
      subtitle={editId
        ? 'Update quality, weights, charges or status. Sold pieces are immutable.'
        : 'A unique barcode is generated automatically (or enter a custom one). Stock intake movement is recorded.'}
      icon={<Icon paths={ICONS.inventory} size={19} />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <span className="modal-hint">
            {editId ? 'Changes are audited.' : 'Each piece gets its own barcode and intake movement.'}
          </span>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn gold" onClick={save} disabled={saving || requiredMissing || !!weightErr}>
            {saving ? 'Saving…' : editId ? 'Update piece' : 'Save piece'}
          </button>
        </>
      }
    >
      {msg && <div className="err-box" style={{ marginBottom: 12 }}>{msg}</div>}
      {existing.isLoading && editId && <div className="empty" style={{ padding: 24 }}>Loading piece…</div>}

      <div className="modal-grid">
        <fieldset className="form-block">
          <legend>Identity</legend>
          {F('name', 'Name *', 'Classic Temple Ring')}
          {F('sku', 'SKU (unique) *', 'RNG-1001')}
          {F('design_code', 'Design code')}
          <label className="lbl">Category *</label>
          <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">— select —</option>
            {(cats.data?.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.sku_prefix})</option>)}
          </select>
          <label className="lbl">Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="available">available</option><option value="reserved">reserved</option>
            <option value="sold">sold</option><option value="damaged">damaged</option>
          </select>
          {F('barcode', 'Custom barcode (optional)', 'defaults to SKU')}
          {F('image_url', 'Image URL')}
        </fieldset>

        <fieldset className="form-block">
          <legend>Quality — purity &amp; weights</legend>
          <label className="lbl">Purity</label>
          <select value={form.purity} onChange={(e) => set('purity', e.target.value)}>
            <option>24K</option><option>22K</option><option>18K</option><option>14K</option>
          </select>
          {F('gross_weight_g', 'Gross weight (g) *')}
          {F('stone_weight_g', 'Stone weight (g)')}
          {F('net_gold_weight_g', 'Net gold weight (g) *')}
          {weightErr && <div className="err-box">{weightErr}</div>}
          <small className="modal-hint">Net = gross − stone + wastage adjustments. Must be ≤ gross.</small>
        </fieldset>

        <fieldset className="form-block">
          <legend>Pricing inputs</legend>
          <label className="lbl">Making charge type</label>
          <select value={form.making_charge_type} onChange={(e) => set('making_charge_type', e.target.value)}>
            <option value="percentage">making %</option><option value="per_gram">making ₹/g</option><option value="fixed">making flat ₹</option>
          </select>
          {F('making_charge_value', 'Making charge value')}
          {F('stone_value_inr', 'Stone value (₹)')}
          {F('wastage_charge_inr', 'Wastage charge (₹)')}
          {F('other_charges_inr', 'Other charges (₹)')}
          {F('acquisition_cost_inr', 'Acquisition cost (₹) *')}
        </fieldset>
      </div>
    </Modal>
  );
}
