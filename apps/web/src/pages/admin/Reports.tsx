import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, inr } from '../../lib/api';
import { Icon, ICONS } from '../../components/icons';

const GOLD = '#D6B45C';
const GOLD_DEEP = '#B89A52';
const PIE_COLORS = ['#D6B45C', '#631628', '#5B6B8C', '#26734D', '#946200', '#B89A52'];
const PRESETS: Array<[string, string]> = [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['3m', '3 months'], ['6m', '6 months'], ['1y', '1 year']];

export default function Reports() {
  const [preset, setPreset] = useState('month');
  const sales = useQuery({ queryKey: ['r-sales', preset], queryFn: () => api.get(`/reports/sales?preset=${preset}`) });
  const inv = useQuery({ queryKey: ['r-inv'], queryFn: () => api.get('/reports/inventory') });
  const cus = useQuery({ queryKey: ['r-cus', preset], queryFn: () => api.get(`/reports/customers?preset=${preset}`) });
  const csv = () => {
    const rows = sales.data?.data?.byDay || [];
    const text = 'date,bills,revenue\n' + rows.map((r: any) => `${r.d},${r.bills},${r.revenue}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `sales-${preset}.csv`;
    a.click();
  };
  const s = sales.data?.data;
  const c = cus.data?.data;
  const trend: any[] = (s?.byDay || []).map((row: any) => ({
    x: new Date(row.d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    revenue: Number(row.revenue), bills: Number(row.bills),
  }));
  const byCat: any[] = (s?.byCat || []).map((row: any) => ({ x: row.category || '—', revenue: Number(row.revenue) }));
  const byPay: any[] = (s?.byPay || []).map((row: any) => ({ name: row.method, value: Number(row.total) }));
  const repeatPct = c ? Math.round((Number(c.repeat_rate) || 0) * 100) : 0;
  const kpis = [
    { label: 'Revenue', value: s ? inr(s.revenue) : null, icon: ICONS.wallet, tint: GOLD },
    { label: 'Bills', value: s ? s.bill_count : null, icon: ICONS.receipt, tint: '#631628' },
    { label: 'Avg bill', value: s ? inr(s.avg_bill) : null, icon: ICONS.calculator, tint: '#26734D' },
    { label: 'Items sold', value: s ? s.items_sold : null, icon: ICONS.gem, tint: '#B89A52' },
    { label: 'Gold sold', value: s ? `${Number(s.gold_weight_g).toFixed(2)} g` : null, icon: ICONS.scale, tint: '#5B6B8C' },
    { label: 'Gross profit est.', value: s ? (s.gross_profit_estimate == null ? 'restricted' : inr(s.gross_profit_estimate)) : null, icon: ICONS.trending, tint: '#946200' },
  ];
  const tooltipStyle = { borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13 } as const;
  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Reports &amp; Analytics</h1>
        <button className="btn ghost" style={{ padding: '6px 14px' }} onClick={csv}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon paths={ICONS.receipt} size={14} />Export CSV</span></button>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>Today / Week / Month / 3M / 6M / 1Y share one definition with the dashboard.</p>
      <div className="filters" style={{ maxWidth: 560 }}>{PRESETS.map(([v, l]) => <button key={v} className={`btn${preset === v ? ' gold' : ' ghost'}`} onClick={() => setPreset(v)}>{l}</button>)}</div>
      <div className="grid kpi" style={{ marginTop: 4 }}>
        {sales.isLoading
          ? [1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton" style={{ height: 90 }} />)
          : kpis.map((k) => (
            <div key={k.label} className="card kpi-card" style={{ '--tint': k.tint, '--tint-border': `${k.tint}59` } as React.CSSProperties}>
              <div className="kpi-head">
                <span className="kpi-ico" style={{ background: `${k.tint}14`, color: k.tint }}><Icon paths={k.icon} size={16} /></span>
                <small>{k.label}</small>
              </div>
              <div className="kpi-value">{k.value ?? '—'}</div>
            </div>
          ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16 }}>
        <div className="card">
          <strong>Revenue trend</strong>
          <div style={{ height: 230, marginTop: 8 }}>
            {trend.length ? (
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD6" vertical={false} />
                  <XAxis dataKey="x" fontSize={11} tickMargin={6} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `₹${Number(v).toLocaleString('en-IN')}`} width={70} />
                  <Tooltip formatter={(v: any, key: any) => (key === 'revenue' ? inr(Number(v)) : v)} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="revenue" stroke={GOLD_DEEP} strokeWidth={2} fill="url(#goldFill)" dot={false} activeDot={{ r: 4.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="empty">No sales in this period</div>}
          </div>
        </div>
        <div className="card">
          <strong>Payment mix</strong>
          <div style={{ height: 230, marginTop: 8 }}>
            {byPay.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byPay} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                    {byPay.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => inr(Number(v))} contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="empty">No payments in this period</div>}
          </div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16 }}>
        <div className="card">
          <strong>Category sales</strong>
          <div style={{ height: 230, marginTop: 8 }}>
            {byCat.length ? (
              <ResponsiveContainer>
                <BarChart data={byCat} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD6" vertical={false} />
                  <XAxis dataKey="x" fontSize={11} tickMargin={6} interval={0} height={46} angle={-18} textAnchor="end" />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `₹${Number(v).toLocaleString('en-IN')}`} width={70} />
                  <Tooltip formatter={(v: any) => inr(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: 'rgba(214,180,92,.08)' }} />
                  <Bar dataKey="revenue" fill={GOLD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="empty">No category sales in this period</div>}
          </div>
        </div>
        <div className="card">
          <strong>Customer insights</strong>
          {c ? (
            <>
              <div className="grid kpi" style={{ marginTop: 10 }}>
                {[
                  { label: 'Total customers', value: c.total, tint: '#5B6B8C' },
                  { label: 'New (period)', value: c.new_customers, tint: GOLD },
                  { label: 'Repeat buyers', value: c.repeat_customers, tint: '#26734D' },
                ].map((k) => (
                  <div key={k.label} className="card kpi-card" style={{ '--tint': k.tint, '--tint-border': `${k.tint}59` } as React.CSSProperties}>
                    <div className="kpi-head"><span className="kpi-ico" style={{ background: `${k.tint}14`, color: k.tint }}><Icon paths={ICONS.customers} size={15} /></span><small>{k.label}</small></div>
                    <div style={{ fontSize: 19, fontWeight: 700 }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <label className="lbl">Repeat purchase rate — {repeatPct}%</label>
              <div style={{ height: 8, background: '#E8DDD6', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${repeatPct}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DEEP})`, borderRadius: 999, transition: 'width var(--motion-standard)' }} />
              </div>
            </>
          ) : <div className="empty">Loading customer metrics…</div>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16 }}>
        <div className="card">
          <strong>Inventory valuation (acquisition, not market)</strong>
          <div className="tbl-wrap" style={{ marginTop: 8 }}>
            <table className="tbl"><thead><tr><th>Category</th><th>Pcs</th><th>Wt g</th><th>Acq ₹</th></tr></thead><tbody>
              {(inv.data?.data?.byCat || []).map((row: any) => <tr key={row.category}><td>{row.category}</td><td>{row.pieces}</td><td>{Number(row.weight_g).toFixed(1)}</td><td>{inr(row.acq_inr)}</td></tr>)}
            </tbody></table>
          </div>
          <div style={{ marginTop: 10 }}>
            <small style={{ color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Low stock</small>
            {((inv.data?.data?.low_stock || []).length ? (inv.data?.data?.low_stock || []).map((l: any) => <span key={l.category} className="chip">{l.category}</span>) : <small style={{ color: 'var(--color-muted)' }}>none</small>)}
          </div>
        </div>
      </div>
    </div>
  );
}
