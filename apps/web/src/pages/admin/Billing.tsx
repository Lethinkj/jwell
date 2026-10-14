import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../../lib/api';
import ScannerModal from '../../components/ScannerModal';

// Billing: HID scanner + camera + manual entry side by side; phone-first customer;
// scoped invoice history (own bills unless admin). Server revalidates everything at finalize.
export default function Billing() {
  const [barcode, setBarcode] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [phoneMatches, setPhoneMatches] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState('');
  const [bill, setBill] = useState<any>(null);
  const [payMethod, setPayMethod] = useState('upi');
  const [scanning, setScanning] = useState(false);
  const history = useQuery({ queryKey: ['my-bills'], queryFn: () => api.get('/sales?limit=20') });

  const addCode = async (code: string) => {
    setMsg('');
    const value = code.trim();
    if (!value) return;
    try {
      const r = await api.get(`/products/barcode/${encodeURIComponent(value)}`);
      if (lines.find((l) => l.product_id === r.data.id)) { setMsg('Already on this bill — duplicate scan suppressed. Remove the line to re-add intentionally.'); return; }
      const est = await api.post('/pricing/estimate', { product_id: r.data.id });
      setLines((prev) => [...prev, { product_id: r.data.id, sku: r.data.sku, name: r.data.name, est: est.data }]);
      setBarcode('');
      setMsg(`Added ${r.data.sku} — estimate ${inr(est.data.line_total_inr)} (final total set by server).`);
    } catch (e: any) { setMsg(e.message); }
  };

  const lookupPhone = async () => {
    setMsg(''); setCustomer(null); setPhoneMatches([]);
    if (!phone.trim()) return;
    try {
      const r = await api.get(`/customers/phone/${encodeURIComponent(phone.trim())}`);
      if (!r.data.length) { setMsg('No customer on this number — enter a name below to register, or bill as walk-in.'); return; }
      if (r.data.length === 1) { setCustomer(r.data[0]); setMsg(`Loaded ${r.data[0].name} — ${r.data[0].summary.bill_count} bills, ${inr(r.data[0].summary.total_spent_inr)} total.`); }
      else { setPhoneMatches(r.data); setMsg('Shared number — pick the right profile.'); }
    } catch (e: any) { setMsg(e.message); }
  };

  const registerCustomer = async () => {
    setMsg('');
    try {
      const r = await api.post('/customers', { name: newName || `Walk-in ${phone}`, phone });
      setCustomer(r.data); setPhoneMatches([]); setMsg(`Registered ${r.data.name} (${r.data.customer_code}).`);
    } catch (e: any) { setMsg(e.message); }
  };

  const total = lines.reduce((s, l) => s + (l.est?.line_total_inr || 0), 0);

  const finalize = async () => {
    setMsg('');
    try {
      const draft = await api.post('/sales/draft', {
        customer_id: customer?.id,
        customer_inline: !customer && phone ? { name: newName || 'Walk-in ' + phone, phone } : undefined,
        lines: lines.map((l) => ({ product_id: l.product_id })),
      });
      const done = await api.post(`/sales/${draft.data.id}/finalize`, {
        lines: lines.map((l) => ({ product_id: l.product_id })),
        payments: [{ method: payMethod, amount_inr: Math.round(total * 100) / 100 }],
      });
      setBill(done.data);
      setLines([]); setCustomer(null); setPhone(''); setNewName('');
      history.refetch();
      setMsg(`Billed ${done.data.invoice_no} — stock reduced exactly once.`);
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>New Bill</h1>
      <p style={{ color: 'var(--color-muted)' }}>HID scanner, camera, or manual entry — all resolve through the same backend lookup. Sold/unknown codes are blocked.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <div className="card">
          <strong>1. Customer (phone first)</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookupPhone()} placeholder="Customer phone number" inputMode="tel" />
            <button className="btn" onClick={lookupPhone}>Find</button>
          </div>
          {customer && <div className="chip" style={{ marginTop: 8 }}>{customer.name} • {customer.customer_code} • {customer.summary.bill_count} bills • last: {customer.summary.last_purchase_at?.slice(0, 10) || '—'} <button className="btn ghost" onClick={() => setCustomer(null)}>✕</button></div>}
          {phoneMatches.length > 0 && (
            <div style={{ marginTop: 8 }}>{phoneMatches.map((m: any) => (
              <div key={m.id}><button className="btn ghost" onClick={() => { setCustomer(m); setPhoneMatches([]); }}>{m.name} ({m.customer_code}) — {m.summary.bill_count} bills</button></div>))}</div>)}
          {!customer && phone && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New customer name" />
              <button className="btn ghost" onClick={registerCustomer}>Register</button>
            </div>)}
          <hr style={{ borderColor: 'var(--color-border)', margin: '14px 0' }} />
          <strong>2. Add products</strong>
          <label className="lbl">Barcode / SKU</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCode(barcode)} placeholder="Scan or type, press Enter" />
            <button className="btn gold" onClick={() => addCode(barcode)}>Add</button>
          </div>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setScanning(true)}>⛶ Scan with camera</button>
          <label className="lbl">Payment</label>
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select>
          <h2>Total: {inr(total)}</h2>
          <button className="btn" disabled={!lines.length} onClick={finalize}>Finalize sale (atomic)</button>
        </div>
        <div className="card">
          <strong>Lines ({lines.length})</strong>
          {lines.length === 0 ? <div className="empty">Scan a piece to begin.</div> :
            <table className="tbl"><thead><tr><th>SKU</th><th>Item</th><th>Estimate</th><th></th></tr></thead><tbody>
              {lines.map((l) => <tr key={l.product_id}><td>{l.sku}</td><td>{l.name}</td><td>{inr(l.est.line_total_inr)}<br /><small style={{ color: 'var(--color-muted)' }}>gold {inr(l.est.gold_value_inr)} + making {inr(l.est.making_charge_inr)}</small></td>
                <td><button className="btn ghost" onClick={() => setLines(lines.filter((x) => x.product_id !== l.product_id))}>✕</button></td></tr>)}
            </tbody></table>}
          {bill && <div style={{ marginTop: 12 }}><strong>Receipt {bill.invoice_no}</strong><pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{JSON.stringify({ total: bill.total_inr, lines: bill.lines?.length, payments: bill.payments }, null, 2)}</pre>
            <button className="btn ghost" onClick={() => window.print()}>Print receipt</button></div>}
          <hr style={{ borderColor: 'var(--color-border)', margin: '14px 0' }} />
          <strong>Invoice history (my bills)</strong>
          <table className="tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Total</th></tr></thead><tbody>
            {(history.data?.data || []).map((s: any) => <tr key={s.id}><td>{s.invoice_no}</td><td>{s.sold_at?.slice(0, 10)}</td><td>{inr(s.total_inr)}</td></tr>)}
          </tbody></table>
        </div>
      </div>
      {scanning && <ScannerModal onDetect={(v) => addCode(v)} onClose={() => setScanning(false)} />}
    </div>
  );
}
