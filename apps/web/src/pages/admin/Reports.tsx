import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, inr } from '../../lib/api';

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
  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Reports</h1>
      <p style={{ color: 'var(--color-muted)' }}>Today / Week / Month / 3M / 6M / 1Y share one definition with the dashboard. <button className="btn ghost" onClick={csv}>Export CSV</button></p>
      <div className="filters" style={{ maxWidth: 560 }}>{['today', 'week', 'month', '3m', '6m', '1y'].map((p) => <button key={p} className={`btn${preset === p ? ' gold' : ' ghost'}`} onClick={() => setPreset(p)}>{p}</button>)}</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <div className="card"><strong>Sales</strong>{sales.data ? <pre style={{ fontSize: 13 }}>{JSON.stringify({ revenue: inr(sales.data.data.revenue), bills: sales.data.data.bill_count, avg: inr(sales.data.data.avg_bill), items: sales.data.data.items_sold, gold_g: sales.data.data.gold_weight_g }, null, 2)}</pre> : 'Loading…'}</div>
        <div className="card"><strong>Inventory valuation (acquisition, not market)</strong>
          <table className="tbl"><thead><tr><th>Category</th><th>Pcs</th><th>Wt g</th><th>Acq ₹</th></tr></thead><tbody>
            {(inv.data?.data?.byCat || []).map((r: any) => <tr key={r.category}><td>{r.category}</td><td>{r.pieces}</td><td>{Number(r.weight_g).toFixed(1)}</td><td>{inr(r.acq_inr)}</td></tr>)}
          </tbody></table>
          <small style={{ color: 'var(--color-muted)' }}>Low stock: {(inv.data?.data?.low_stock || []).map((l: any) => l.category).join(', ') || 'none'}</small></div>
        <div className="card"><strong>Customers</strong>{cus.data ? <pre style={{ fontSize: 13 }}>{JSON.stringify(cus.data.data, null, 2)}</pre> : 'Loading…'}</div>
      </div>
    </div>
  );
}
