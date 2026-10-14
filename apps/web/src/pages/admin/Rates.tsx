import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, inr } from '../../lib/api';

export default function Rates() {
  const cur = useQuery({ queryKey: ['rate-cur'], queryFn: () => api.get('/gold-rates/current'), refetchInterval: 30000 });
  const hist = useQuery({ queryKey: ['rate-hist'], queryFn: () => api.get('/gold-rates') });
  const [rate, setRate] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const act = async (path: string, body?: any) => {
    setMsg('');
    try { const r = await api.post(path, body); setMsg(`Saved ${r.data.rate_24k_per_g_inr}/g 24K (${r.data.source}). History unchanged — snapshots only.`); cur.refetch(); hist.refetch(); }
    catch (e: any) { setMsg(e.message); }
  };
  const r = cur.data?.data;
  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Gold-rate administration</h1>
      <p style={{ color: 'var(--color-muted)' }}>Versioned snapshots. Updates move current estimates — historical invoices never reprice. Stale rates warn at billing.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <div className="card">
          <small style={{ color: 'var(--color-muted)' }}>CURRENT APPROVED RATE</small>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{r ? `${inr(r.rate_24k_per_g_inr)}/g 24K` : '—'}</div>
          <small style={{ color: 'var(--color-muted)' }}>{r ? `${r.source} • observed ${new Date(r.observed_at).toLocaleString()} • freshness: ${cur.data?.freshness?.status} (${cur.data?.freshness?.ageMinutes} min)` : 'No rate yet — refresh or override.'}</small>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn ghost" onClick={() => act('/gold-rates/refresh')}>↻ Refresh from provider</button>
          </div>
          <hr style={{ borderColor: 'var(--color-border)', margin: '16px 0' }} />
          <strong>Manual override (audited)</strong>
          <label className="lbl">Rate ₹/g (24K)</label><input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 9850" />
          <label className="lbl">Reason (required)</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Owner approval ref…" />
          <button className="btn gold" style={{ marginTop: 10 }} onClick={() => act('/gold-rates/override', { rate_per_g_inr: Number(rate), purity_basis: '24K', reason })}>Approve override</button>
        </div>
        <div className="card"><strong>History (latest 60)</strong>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Observed</th><th>Source</th><th>24K ₹/g</th></tr></thead><tbody>
            {(hist.data?.data || []).map((h: any) => <tr key={h.id}><td>{new Date(h.observed_at).toLocaleString()}</td><td>{h.source}{h.override_reason ? ` (${h.override_reason})` : ''}</td><td>{inr(h.rate_24k_per_g_inr)}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </div>
  );
}
