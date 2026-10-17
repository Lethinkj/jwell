import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, inr } from '../../lib/api';
import InvoiceModal from '../../components/InvoiceModal';
import { downloadInvoicePdf } from '../../lib/invoicePdf';

const EMPTY_FORM = {
  name: '', phone: '', email: '', address_line1: '', city: '', state: '', postal_code: '',
  birthday: '', anniversary: '', marketing_consent: true,
};
const REQUIRED = ['name', 'phone', 'address_line1', 'city', 'state', 'postal_code'];
const FIELD_LABELS: Record<string, string> = {
  name: 'Full name', phone: 'Phone', email: 'Email', address_line1: 'Street address',
  city: 'City', state: 'State', postal_code: 'PIN code', birthday: 'Birthday', anniversary: 'Anniversary',
};
const missingFields = (f: any) => REQUIRED.filter((k) => !String(f[k] ?? '').trim());

function CustomerFields({ value, onChange, errors }: { value: any; onChange: (v: any) => void; errors?: Record<string, string> }) {
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  const field = (k: string, opts: { type?: string; placeholder?: string; span?: boolean } = {}) => (
    <div key={k} style={opts.span ? { gridColumn: '1 / -1' } : undefined}>
      <label className="lbl">{FIELD_LABELS[k]}{REQUIRED.includes(k) ? ' *' : ''}</label>
      <input
        type={opts.type || 'text'}
        value={value[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        placeholder={opts.placeholder}
      />
      {errors?.[k] && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors[k]}</div>}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
      {field('name', { placeholder: 'e.g. Radhika Sethi' })}
      {field('phone', { type: 'tel', placeholder: '10-digit mobile' })}
      {field('email', { type: 'email', placeholder: 'name@example.com' })}
      {field('address_line1', { placeholder: 'House / street / locality', span: true })}
      {field('city', { placeholder: 'e.g. Bengaluru' })}
      {field('state', { placeholder: 'e.g. Karnataka' })}
      {field('postal_code', { placeholder: 'e.g. 560001' })}
      {field('birthday', { type: 'date' })}
      {field('anniversary', { type: 'date' })}
    </div>
  );
}

export default function Customers() {
  const [q, setQ] = useState('');
  const [minSpent, setMinSpent] = useState('');
  const [recency, setRecency] = useState(''); // last_days= | lapsed_days= | repeat | custom range below
  const [lastFrom, setLastFrom] = useState('');
  const [lastTo, setLastTo] = useState('');
  const [sel, setSel] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState<any>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const extra = recency === 'repeat' ? '&repeat=1'
    : recency.startsWith('last:') ? `&last_days=${recency.slice(5)}`
    : recency.startsWith('lapsed:') ? `&lapsed_days=${recency.slice(7)}`
    : recency === 'custom' && (lastFrom || lastTo) ? `&last_from=${lastFrom}&last_to=${lastTo}` : '';
  const list = useQuery({ queryKey: ['cus', q, minSpent, recency, lastFrom, lastTo], queryFn: () => api.get(`/customers?q=${encodeURIComponent(q)}&min_spent=${minSpent || 0}${extra}`) });
  const detail = useQuery({ queryKey: ['cus-d', sel?.id], queryFn: () => (sel ? api.get(`/customers/${sel.id}`) : null), enabled: !!sel });

  const create = async () => {
    const missing = missingFields(form);
    if (missing.length) {
      setFormErrors(Object.fromEntries(missing.map((k) => [k, 'Required'])));
      setMsg(`Please fill the required fields: ${missing.map((k) => FIELD_LABELS[k]).join(', ')}.`);
      return;
    }
    try {
      await api.post('/customers', form);
      setMsg('Customer saved.'); setForm(EMPTY_FORM); setFormErrors({}); list.refetch();
    } catch (e: any) { setMsg(e.message); }
  };

  const startEdit = () => {
    const d = detail.data?.data || {};
    setEditForm({
      name: d.name ?? '', phone: d.phone ?? '', email: d.email ?? '',
      address_line1: d.address_line1 ?? '', city: d.city ?? '', state: d.state ?? '', postal_code: d.postal_code ?? '',
      birthday: d.birthday ?? '', anniversary: d.anniversary ?? '',
    });
    setEditErrors({}); setMsg('');
  };

  const saveEdit = async () => {
    const missing = missingFields(editForm || {});
    if (missing.length) {
      setEditErrors(Object.fromEntries(missing.map((k) => [k, 'Required'])));
      setMsg(`Please fill the required fields: ${missing.map((k) => FIELD_LABELS[k]).join(', ')}.`);
      return;
    }
    try {
      setSavingEdit(true);
      await api.patch(`/customers/${sel.id}`, editForm);
      setEditForm(null); setMsg('Customer updated.'); detail.refetch(); list.refetch();
    } catch (e: any) { setMsg(e.message); }
    finally { setSavingEdit(false); }
  };

  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Customers &amp; CRM</h1>
      <p style={{ color: 'var(--color-muted)' }}>Combined filters: name/phone/ID, occasion, category, spend, dates. Duplicates flagged, never silently merged.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <div className="card">
          <strong>Add customer</strong>
          <p style={{ color: 'var(--color-muted)', fontSize: 12, margin: '4px 0 8px' }}>Name, phone and full address are mandatory.</p>
          <CustomerFields value={form} onChange={setForm} errors={formErrors} />
          <label style={{ display: 'flex', gap: 8, marginTop: 10 }}><input type="checkbox" style={{ width: 'auto' }} checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} /> Marketing consent (channel: both)</label>
          <button className="btn gold" style={{ marginTop: 10 }} onClick={create}>Save</button>
          <hr style={{ borderColor: 'var(--color-border)', margin: '16px 0' }} />
          <strong>Search &amp; filter</strong>
          <div className="filters"><input placeholder="Name / phone / ID" value={q} onChange={(e) => setQ(e.target.value)} /><input placeholder="Min spend ₹" value={minSpent} onChange={(e) => setMinSpent(e.target.value)} /></div>
          <label className="lbl">Last purchase</label>
          <select value={recency} onChange={(e) => setRecency(e.target.value)}>
            <option value="">Any time</option>
            <option value="last:30">Last purchased ≤ 30 days ago</option>
            <option value="last:60">Last purchased ≤ 60 days ago</option>
            <option value="last:90">Last purchased ≤ 90 days ago</option>
            <option value="last:180">Last purchased ≤ 180 days ago</option>
            <option value="lapsed:90">Not purchased in 90 days</option>
            <option value="lapsed:180">Not purchased in 180 days</option>
            <option value="repeat">Repeat customers (2+ finalized bills)</option>
            <option value="custom">Custom date range…</option>
          </select>
          {recency === 'custom' && (
            <div className="filters"><input type="date" value={lastFrom} onChange={(e) => setLastFrom(e.target.value)} /><input type="date" value={lastTo} onChange={(e) => setLastTo(e.target.value)} /></div>)}
          <p style={{ color: 'var(--color-muted)', fontSize: 12 }}>Recency uses finalized bills only — drafts and voids excluded.</p>
          {(list.data?.data || []).map((c: any) => (
            <div key={c.id} onClick={() => { setSel(c); setEditForm(null); setEditErrors({}); }} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
              <strong>{c.name}</strong> <small style={{ color: 'var(--color-muted)' }}>{c.customer_code} • {c.phone}</small><br />
              <small>{c.purchase_count} purchases • {inr(c.total_spent_inr)}{c.marketing_consent ? ' • consented' : ' • no-consent'}</small>
            </div>))}
        </div>
        <div className="card">
          {!sel ? <div className="empty">Select a customer for profile, purchases, occasions, consent history.</div> : !detail.data ? 'Loading…' : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <h3 style={{ marginTop: 0 }}>{detail.data.data.name} <small style={{ color: 'var(--color-muted)' }}>{detail.data.data.customer_code}</small></h3>
                {!editForm && <button className="btn ghost" onClick={startEdit}>✏️ Edit</button>}
              </div>
              {editForm ? (
                <div style={{ margin: '8px 0 16px' }}>
                  <strong>Edit customer</strong>
                  <p style={{ color: 'var(--color-muted)', fontSize: 12, margin: '4px 0 8px' }}>Name, phone and full address are mandatory.</p>
                  <CustomerFields value={editForm} onChange={setEditForm} errors={editErrors} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn gold" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
                    <button className="btn ghost" onClick={() => { setEditForm(null); setEditErrors({}); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p>{detail.data.data.phone} • {detail.data.data.email || 'no email'} • {detail.data.data.birthday ? `🎂 ${detail.data.data.birthday}` : ''} {detail.data.data.anniversary ? `💍 ${detail.data.data.anniversary}` : ''}</p>
                  <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                    📍 {[detail.data.data.address_line1, detail.data.data.city, detail.data.data.state, detail.data.data.postal_code].filter(Boolean).join(', ') || 'No address on record'}
                  </p>
                </>
              )}
              <strong>Purchases ({detail.data.data.purchases.length})</strong>
              <div style={{ overflowX: 'auto', margin: '8px 0 16px' }}>
                <table className="tbl" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.data.purchases.map((s: any) => (
                      <tr key={s.id}>
                        <td><strong>{s.invoice_no}</strong></td>
                        <td>{s.sold_at?.slice(0, 10)}</td>
                        <td style={{ fontWeight: 600 }}>{inr(s.total_inr)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              className="btn ghost"
                              onClick={() => setPreviewSaleId(s.id)}
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              title="View bill"
                            >
                              👁️ View
                            </button>
                            <button
                              className="btn ghost"
                              onClick={async () => {
                                try {
                                  setDownloadingSaleId(s.id);
                                  const res = await api.get(`/sales/${s.id}`);
                                  downloadInvoicePdf(res.data);
                                } catch (e: any) {
                                  alert(`Download failed: ${e.message}`);
                                } finally {
                                  setDownloadingSaleId(null);
                                }
                              }}
                              disabled={downloadingSaleId === s.id}
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              title="Download PDF"
                            >
                              {downloadingSaleId === s.id ? '...' : '📥 PDF'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <strong>Consent history</strong>
              <ul>{detail.data.data.consent.map((c: any) => <li key={c.id}><small>{c.created_at?.slice(0, 10)} — {c.status} ({c.source})</small></li>)}</ul>
            </div>)}
        </div>
      </div>
      {previewSaleId && (
        <InvoiceModal
          saleId={previewSaleId}
          onClose={() => setPreviewSaleId(null)}
        />
      )}
    </div>
  );
}
