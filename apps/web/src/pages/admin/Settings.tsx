import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';

export default function Settings() {
  const { data, refetch } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings') });
  const [form, setForm] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const cur = form || data?.data || {};
  const set = (k: string, v: string) => setForm({ ...cur, [k]: v });
  const savePut = async () => {
    setMsg('');
    try {
      await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('gs_token') || ''}` },
        body: JSON.stringify(form || {}),
      }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message || 'save failed'); });
      setMsg('Settings saved.'); setForm(null); refetch();
    } catch (e: any) { setMsg(e.message); }
  };
  const fields: [string, string][] = [
    ['shop_name', 'Shop name'], ['shop_address', 'Shop address'], ['shop_phone', 'Shop phone'],
    ['invoice_prefix', 'Invoice prefix'], ['invoice_footer', 'Invoice footer text'],
    ['label_width_mm', 'Label width (mm)'], ['label_height_mm', 'Label height (mm)'],
    ['label_margin_mm', 'Label margin (mm)'],
  ];
  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Settings</h1>
      <p style={{ color: 'var(--color-muted)' }}>Shop details, invoice text, and barcode label layout. Changes are audited.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="card" style={{ maxWidth: 560 }}>
        {fields.map(([k, l]) => (
          <div key={k}><label className="lbl">{l}</label><input value={cur[k] || ''} onChange={(e) => set(k, e.target.value)} /></div>))}
        <label className="lbl">Show selling price on labels</label>
        <select value={cur.label_show_price || 'yes'} onChange={(e) => set('label_show_price', e.target.value)}>
          <option value="yes">Yes (server-computed estimate)</option>
          <option value="no">No</option>
        </select>
        <button className="btn gold" style={{ marginTop: 14 }} onClick={savePut}>Save settings</button>
      </div>
    </div>
  );
}
