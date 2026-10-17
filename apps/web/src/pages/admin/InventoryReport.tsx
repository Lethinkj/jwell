import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { api, inr } from '../../lib/api';

const PIE_COLORS = ['#D6B45C', '#B89A52', '#5C8A6A', '#7A6AAE', '#B0564A', '#4A86B0', '#999', '#555'];

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function InventoryReport() {
  const [months, setMonths] = useState(12);
  // Stock intake lives in products (seed + Add Product create pieces directly;
  // the purchases table only fills via explicit POST /purchases). Aggregate pieces by creation month.
  const stock = useQuery({ queryKey: ['inv-all'], queryFn: () => api.get('/products?status=all&limit=500') });
  const valuation = useQuery({ queryKey: ['r-inv'], queryFn: () => api.get('/reports/inventory') });

  const byMonth = useMemo(() => {
    const rows: any[] = stock.data?.data || [];
    const map = new Map<string, { m: string; spend: number; pieces: number }>();
    for (const p of rows) {
      if (!p.created_at) continue;
      const k = monthKey(p.created_at);
      const e = map.get(k) || { m: k, spend: 0, pieces: 0 };
      e.spend += Number(p.acquisition_cost_inr) || 0;
      e.pieces += 1;
      map.set(k, e);
    }
    const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-months).map(([, v]) => v);
    // Fill missing months in range so the trend reads correctly
    if (!sorted.length) return sorted;
    const out: typeof sorted = [];
    let [y, m] = sorted[0].m.split('-').map(Number);
    const last = sorted[sorted.length - 1].m;
    while (`${y}-${String(m).padStart(2, '0')}` <= last) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      out.push(sorted.find((r) => r.m === k) || { m: k, spend: 0, pieces: 0 });
      if (++m > 12) { m = 1; y++; }
    }
    return out.slice(-months);
  }, [stock.data, months]);

  const totalSpend = byMonth.reduce((s, r) => s + r.spend, 0);
  const totalPieces = byMonth.reduce((s, r) => s + r.pieces, 0);
  const byCat: any[] = valuation.data?.data?.byCat || [];
  const pie = byCat.map((c: any) => ({ name: c.category || '—', value: Number(c.pieces) || 0 })).sort((a, b) => b.value - a.value);
  const pieTotal = pie.reduce((s, p) => s + p.value, 0) || 1;

  return (
    <div className="page">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', margin: 0, flex: 1 }}>Purchase report</h1>
        <Link className="btn ghost" to="/admin/inventory">← Inventory</Link>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>How much stock we bought in, month by month — acquisition cost of pieces added to inventory.</p>

      <div className="filters" style={{ maxWidth: 420 }}>
        {[6, 12].map((m) => <button key={m} className={`btn${months === m ? ' gold' : ' ghost'}`} onClick={() => setMonths(m)}>Last {m} months</button>)}
      </div>

      <div className="grid kpi" style={{ marginTop: 12 }}>
        {[['Buying spend (period)', inr(totalSpend)], ['Pieces added', totalPieces], ['Avg cost / piece', totalPieces ? inr(totalSpend / totalPieces) : inr(0)]].map(([k, v]) => (
          <div key={k} className="card"><small style={{ color: 'var(--color-muted)' }}>{k}</small><div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div></div>))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16 }}>
        <div className="card"><strong>Monthly buying spend (₹)</strong><div style={{ height: 260 }}>
          <ResponsiveContainer><BarChart data={byMonth}>
            <XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v: number) => `₹${(v / 100000).toFixed(1)}L`} />
            <Tooltip formatter={(v: any) => inr(Number(v))} /><Bar dataKey="spend" fill="#D6B45C" radius={6} />
          </BarChart></ResponsiveContainer></div></div>
        <div className="card"><strong>Pieces added per month</strong><div style={{ height: 260 }}>
          <ResponsiveContainer><LineChart data={byMonth}>
            <XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} />
            <Tooltip /><Line dataKey="pieces" stroke="#B89A52" strokeWidth={2} dot={false} />
          </LineChart></ResponsiveContainer></div></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16 }}>
        <div className="card"><strong>Live stock mix by category (pieces)</strong><div style={{ height: 300 }}>
          <ResponsiveContainer><PieChart>
            <Pie data={pie} dataKey="value" nameKey="name" outerRadius={95} innerRadius={52} paddingAngle={2} strokeWidth={2}>
              {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any, name: any) => [`${v} pcs (${(((Number(v) || 0) / pieTotal) * 100).toFixed(1)}%)`, name]} />
            <Legend layout="horizontal" verticalAlign="bottom" formatter={(v: any) => { const f = pie.find((p) => p.name === v); return `${v} (${f ? f.value : 0})`; }} />
          </PieChart></ResponsiveContainer></div></div>
        <div className="card"><strong>Valuation by category (acquisition)</strong>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Category</th><th>Pcs</th><th>Wt g</th><th>Acq ₹</th></tr></thead><tbody>
            {byCat.map((r: any) => <tr key={r.category}><td>{r.category}</td><td>{r.pieces}</td><td>{Number(r.weight_g).toFixed(1)}</td><td>{inr(r.acq_inr)}</td></tr>)}
          </tbody></table></div>
          <small style={{ color: 'var(--color-muted)' }}>Low stock: {(valuation.data?.data?.low_stock || []).map((l: any) => l.category).join(', ') || 'none'}</small>
        </div>
      </div>
    </div>
  );
}
