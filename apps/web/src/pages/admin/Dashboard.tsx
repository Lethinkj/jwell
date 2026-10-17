import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, inr } from '../../lib/api';
import { Icon, ICONS } from '../../components/icons';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const PRESETS = [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['3m', '3 months'], ['6m', '6 months'], ['1y', '1 year']];

export default function Dashboard() {
  const [preset, setPreset] = useState('today');
  const { data, isLoading, isError } = useQuery({ queryKey: ['rep-sales', preset], queryFn: () => api.get(`/reports/sales?preset=${preset}`) });
  const r = data?.data;
  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: '0 0 4px' }}>Overview</h1>
      <p style={{ color: 'var(--color-muted)', marginTop: 0 }}>Every KPI computed from committed records — same filters, same timezone.</p>
      <div className="filters" style={{ maxWidth: 560 }}>{PRESETS.map(([v, l]) => <button key={v} className={`btn${preset === v ? ' gold' : ' ghost'}`} onClick={() => setPreset(v)}>{l}</button>)}</div>
      {isLoading ? <div className="grid kpi">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 90 }} />)}</div>
        : isError ? <div className="err-box">Could not load reports. Is the API running on :4000?</div>
        : <>
          <div className="grid kpi">
            {([
              { label: 'Revenue', value: inr(r.revenue), icon: ICONS.wallet, tint: '#D6B45C' },
              { label: 'Bills', value: r.bill_count, icon: ICONS.receipt, tint: '#631628' },
              { label: 'Avg bill', value: inr(r.avg_bill), icon: ICONS.calculator, tint: '#26734D' },
              { label: 'Items sold', value: r.items_sold, icon: ICONS.gem, tint: '#B89A52' },
              { label: 'Gold sold', value: `${Number(r.gold_weight_g).toFixed(2)} g`, icon: ICONS.scale, tint: '#5B6B8C' },
              { label: 'Gross profit est.', value: r.gross_profit_estimate == null ? 'restricted' : inr(r.gross_profit_estimate), icon: ICONS.trending, tint: '#946200' },
            ] as const).map((k) => (
              <div key={k.label} className="card kpi-card" style={{ '--tint': k.tint, '--tint-border': `${k.tint}59` } as React.CSSProperties}>
                <div className="kpi-head">
                  <span className="kpi-ico" style={{ background: `${k.tint}14`, color: k.tint }}><Icon paths={k.icon} size={16} /></span>
                  <small>{k.label}</small>
                </div>
                <div className="kpi-value">{k.value}</div>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginTop: 16 }}>
            <div className="card"><strong>Revenue trend</strong><div style={{ height: 220 }}><ResponsiveContainer><LineChart data={r.byDay}><XAxis dataKey="d" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line dataKey="revenue" stroke="#B89A52" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></div>
            <div className="card"><strong>Payment mix</strong><div style={{ height: 220 }}><ResponsiveContainer><BarChart data={r.byPay}><XAxis dataKey="method" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="total" fill="#D6B45C" radius={6} /></BarChart></ResponsiveContainer></div></div>
          </div>
          <div className="card" style={{ marginTop: 16 }}><strong>Category sales</strong>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Category</th><th>Pieces</th><th>Revenue</th></tr></thead>
              <tbody>{(r.byCat || []).map((c: any) => <tr key={c.category}><td>{c.category || '—'}</td><td>{c.pieces}</td><td>{inr(c.revenue)}</td></tr>)}</tbody></table></div>
          </div>
        </>}
    </div>
  );
}
