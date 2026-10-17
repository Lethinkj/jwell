import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api, inr } from '../../lib/api';
import { Icon, ICONS } from '../../components/icons';

const GOLD = '#D6B45C';
const GOLD_DEEP = '#B89A52';

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
  const rows: any[] = hist.data?.data || [];
  const series: Array<{ t: string; rate: number; source: string; manual: boolean }> = rows
    .map((h) => ({ t: h.observed_at, rate: Number(h.rate_24k_per_g_inr), source: h.source, manual: !!h.override_reason }))
    .reverse();
  const n = series.length;
  const last = n ? series[n - 1] : null;
  const prev = n > 1 ? series[n - 2] : null;
  const change = last && prev ? last.rate - prev.rate : null;
  const pct = change != null && prev ? (change / prev.rate) * 100 : null;
  const high = n ? Math.max(...series.map((s) => s.rate)) : null;
  const low = n ? Math.min(...series.map((s) => s.rate)) : null;
  const avg = n ? series.reduce((a, s) => a + s.rate, 0) / n : null;
  const curRate = r ? Number(r.rate_24k_per_g_inr) : (last ? last.rate : null);
  const freshness = cur.data?.freshness;
  const spanMs = n > 1 ? new Date(series[n - 1].t).getTime() - new Date(series[0].t).getTime() : 0;
  const fmtX = (iso: string) => {
    const d = new Date(iso);
    return spanMs > 1000 * 60 * 60 * 24 * 3
      ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const chartData = series.map((s) => ({ x: fmtX(s.t), rate: s.rate }));
  const changeTint = change == null ? '#746A63' : change >= 0 ? '#26734D' : '#B42318';
  const stats: Array<{ label: string; value: string; icon: string[]; tint: string; sub?: string }> = [
    { label: 'Current 24K', value: curRate != null ? `${inr(curRate)}/g` : '—', icon: ICONS.wallet, tint: GOLD, sub: freshness ? `freshness: ${freshness.status} • ${freshness.ageMinutes} min` : undefined },
    { label: 'vs previous', value: change == null ? '—' : `${change >= 0 ? '+' : '−'}${inr(Math.abs(change))}`, icon: change == null ? ICONS.rates : change >= 0 ? ICONS.arrowUp : ICONS.arrowDown, tint: changeTint, sub: pct != null ? `${Math.abs(pct).toFixed(2)}%` : undefined },
    { label: 'High', value: high != null ? `${inr(high)}/g` : '—', icon: ICONS.arrowUp, tint: '#946200', sub: `latest ${n} snapshots` },
    { label: 'Low', value: low != null ? `${inr(low)}/g` : '—', icon: ICONS.arrowDown, tint: '#5B6B8C' },
    { label: 'Average', value: avg != null ? `${inr(avg)}/g` : '—', icon: ICONS.trending, tint: GOLD_DEEP },
  ];
  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Gold-rate administration</h1>
      <p style={{ color: 'var(--color-muted)' }}>Versioned snapshots. Updates move current estimates — historical invoices never reprice. Stale rates warn at billing.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid kpi">
        {stats.map((k) => (
          <div key={k.label} className="card kpi-card" style={{ '--tint': k.tint, '--tint-border': `${k.tint}59` } as React.CSSProperties}>
            <div className="kpi-head">
              <span className="kpi-ico" style={{ background: `${k.tint}14`, color: k.tint }}><Icon paths={k.icon} size={16} /></span>
              <small>{k.label}</small>
            </div>
            <div className="kpi-value">{k.value}</div>
            {k.sub && <small style={{ color: 'var(--color-muted)', marginTop: -4 }}>{k.sub}</small>}
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <strong>24K rate trend</strong>
          <small style={{ color: 'var(--color-muted)' }}>{n ? `${n} snapshots • latest ${new Date(series[n - 1].t).toLocaleString()}` : 'no snapshots yet'}</small>
        </div>
        <div style={{ height: 260, marginTop: 10 }}>
          {n ? (
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD6" vertical={false} />
                <XAxis dataKey="x" fontSize={11} tickMargin={6} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} width={70} />
                <Tooltip formatter={(v: any) => [`${inr(Number(v))}/g`, '24K']} contentStyle={{ borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13 }} />
                {curRate != null && <ReferenceLine y={curRate} stroke={GOLD_DEEP} strokeDasharray="6 4" label={{ value: `Now ₹${curRate.toLocaleString('en-IN')}`, fontSize: 11, position: 'insideTopRight', fill: GOLD_DEEP }} />}
                <Area type="monotone" dataKey="rate" stroke={GOLD_DEEP} strokeWidth={2} fill="url(#goldFill)" dot={n <= 40 ? { r: 2.5 } : false} activeDot={{ r: 4.5 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty">No rate history yet — refresh from provider or add a snapshot</div>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginTop: 16 }}>
        <div className="card">
          <small style={{ color: 'var(--color-muted)' }}>CURRENT APPROVED RATE</small>
          <div style={{ fontSize: 32, fontWeight: 800 }}>{r ? `${inr(r.rate_24k_per_g_inr)}/g 24K` : '—'}</div>
          <small style={{ color: 'var(--color-muted)' }}>{r ? `${r.source} • observed ${new Date(r.observed_at).toLocaleString()} • freshness: ${freshness?.status} (${freshness?.ageMinutes} min)` : 'No rate yet — refresh or override.'}</small>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn ghost" onClick={() => act('/gold-rates/refresh')}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon paths={ICONS.refresh} size={15} />Refresh from provider</span></button>
          </div>
          <hr style={{ borderColor: 'var(--color-border)', margin: '16px 0' }} />
          <strong>Manual override (audited)</strong>
          <label className="lbl">Rate ₹/g (24K)</label><input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 9850" />
          <label className="lbl">Reason (required)</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Owner approval ref…" />
          <button className="btn gold" style={{ marginTop: 10 }} onClick={() => act('/gold-rates/override', { rate_per_g_inr: Number(rate), purity_basis: '24K', reason })}>Approve override</button>
        </div>
        <div className="card"><strong>History (latest 60)</strong>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Observed</th><th>Source</th><th>24K ₹/g</th></tr></thead><tbody>
            {(hist.data?.data || []).map((h: any) => <tr key={h.id}><td>{new Date(h.observed_at).toLocaleString()}</td><td>{h.source}{h.override_reason && <span className="badge warn" style={{ marginLeft: 6 }}>manual</span>}</td><td>{inr(h.rate_24k_per_g_inr)}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </div>
  );
}
