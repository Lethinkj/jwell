import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';

export default function Campaigns() {
  const offers = useQuery({ queryKey: ['offers'], queryFn: () => api.get('/offers') });
  const camps = useQuery({ queryKey: ['camps'], queryFn: () => api.get('/campaigns') });
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ name: '', template: 'Sparkle this Diwali ✨ Flat ₹1000 off above ₹50,000. Code FEST10. — Shree Gold Palace', channel: 'whatsapp', mode: 'manual', offer_code: 'FEST10' });
  const create = async () => {
    try {
      const r = await api.post('/campaigns', { ...form, audience: {} });
      setMsg(`Queued to ${r.data.queued} opted-in recipients. Manual mode needs approval before send.`);
      camps.refetch();
    } catch (e: any) { setMsg(e.message); }
  };
  const step = async (id: string, action: string) => {
    try { const r = await api.post(`/campaigns/${id}/${action}`); setMsg(JSON.stringify(r.data)); camps.refetch(); }
    catch (e: any) { setMsg(e.message); }
  };
  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Offers &amp; campaign center</h1>
      <p style={{ color: 'var(--color-muted)' }}>Consent-checked, idempotent, approved before delivery. Opt-out suppresses instantly.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <div className="card"><strong>Offers</strong>
          <table className="tbl"><thead><tr><th>Code</th><th>Rule</th><th>Validity</th></tr></thead><tbody>
            {(offers.data?.data || []).map((o: any) => <tr key={o.id}><td>{o.code}</td><td>{o.discount_type} {o.discount_value} (min {o.min_purchase_inr})</td><td><small>{o.valid_from?.slice(0, 10)} → {o.valid_to?.slice(0, 10)}</small></td></tr>)}
          </tbody></table>
          <hr style={{ borderColor: 'var(--color-border)', margin: '14px 0' }} />
          <strong>New campaign</strong>
          <label className="lbl">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diwali 2026 blast" />
          <label className="lbl">Template</label><textarea rows={3} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} />
          <div className="filters">
            <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="both">Both</option></select>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><option value="manual">Manual + approval</option><option value="automatic">Automatic</option></select>
            <input value={form.offer_code} onChange={(e) => setForm({ ...form, offer_code: e.target.value })} placeholder="Offer code" />
          </div>
          <button className="btn gold" onClick={create}>Queue campaign</button>
        </div>
        <div className="card"><strong>Campaigns</strong>
          {(camps.data?.data || []).map((c: any) => (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
              <strong>{c.name}</strong> <span className={`badge ${c.approval_status === 'approved' ? 'ok' : 'warn'}`}>{c.approval_status}</span><br />
              <small style={{ color: 'var(--color-muted)' }}>{c.channel} • {c.mode} • {c.offer_code || 'no offer'}</small>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="btn ghost" onClick={() => step(c.id, 'approve')}>Approve</button>
                <button className="btn" onClick={() => step(c.id, 'send')}>Send now</button>
              </div>
            </div>))}
          {!(camps.data?.data || []).length && <div className="empty">No campaigns yet.</div>}
        </div>
      </div>
    </div>
  );
}
