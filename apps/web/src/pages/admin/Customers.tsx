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
const missingMsg = (f: any) => `Please fill the required fields: ${missingFields(f).map((k) => FIELD_LABELS[k]).join(', ')}.`;

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

/* ── New customer form ─────────────────────────────────────────── */
function NewCustomer() {
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (missingFields(form).length) {
      setErrors(Object.fromEntries(missingFields(form).map((k) => [k, 'Required'])));
      setMsg(missingMsg(form));
      return;
    }
    try {
      await api.post('/customers', form);
      setMsg('Customer saved.'); setForm(EMPTY_FORM); setErrors({});
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>New Customer</h1>
      <p style={{ color: 'var(--color-muted)' }}>Register a new customer profile. Name, phone and a full address are mandatory.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="card" style={{ maxWidth: 820 }}>
        <CustomerFields value={form} onChange={setForm} errors={errors} />
        <label style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />
          Marketing consent (channel: both)
        </label>
        <button className="btn gold" style={{ marginTop: 14 }} onClick={save}>Save customer</button>
      </div>
    </div>
  );
}

/* ── Customer detail + edit modal ──────────────────────────────── */
function CustomerDetailModal({ customerId, onClose, onChanged }: { customerId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useQuery({ queryKey: ['cus-d', customerId], queryFn: () => api.get(`/customers/${customerId}`) });
  const [editForm, setEditForm] = useState<any>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null);
  const d = detail.data?.data;

  const startEdit = () => {
    setEditForm({
      name: d.name ?? '', phone: d.phone ?? '', email: d.email ?? '',
      address_line1: d.address_line1 ?? '', city: d.city ?? '', state: d.state ?? '', postal_code: d.postal_code ?? '',
      birthday: d.birthday ?? '', anniversary: d.anniversary ?? '',
    });
    setEditErrors({}); setMsg('');
  };
  const saveEdit = async () => {
    if (missingFields(editForm || {}).length) {
      setEditErrors(Object.fromEntries(missingFields(editForm || {}).map((k) => [k, 'Required'])));
      setMsg(missingMsg(editForm || {}));
      return;
    }
    try {
      setSaving(true);
      await api.patch(`/customers/${customerId}`, editForm);
      setEditForm(null); setMsg('Customer updated.'); detail.refetch(); onChanged();
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(71,16,29,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ background: '#FFFFFF', maxWidth: 780, width: '100%', maxHeight: '90vh', overflowY: 'auto', borderTop: '4px solid var(--color-gold-deep)' }}
      >
        {msg && <div style={{ marginBottom: 10, fontSize: 13 }}>{msg}</div>}
        {!d ? <div className="empty" style={{ padding: 40 }}>Loading…</div> : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <h3 style={{ marginTop: 0 }}>{d.name} <small style={{ color: 'var(--color-muted)' }}>{d.customer_code}</small></h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {!editForm && <button className="btn ghost" onClick={startEdit}>✏️ Edit</button>}
                <button className="btn ghost" onClick={onClose}>✕</button>
              </div>
            </div>
            {editForm ? (
              <div style={{ margin: '8px 0 16px' }}>
                <strong>Edit customer</strong>
                <p style={{ color: 'var(--color-muted)', fontSize: 12, margin: '4px 0 8px' }}>Name, phone and full address are mandatory.</p>
                <CustomerFields value={editForm} onChange={setEditForm} errors={editErrors} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn gold" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
                  <button className="btn ghost" onClick={() => { setEditForm(null); setEditErrors({}); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <p>{d.phone} • {d.email || 'no email'} • {d.birthday ? `🎂 ${d.birthday}` : ''} {d.anniversary ? `💍 ${d.anniversary}` : ''}</p>
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  📍 {[d.address_line1, d.city, d.state, d.postal_code].filter(Boolean).join(', ') || 'No address on record'}
                </p>
              </>
            )}
            <strong>Purchases ({d.purchases.length})</strong>
            <div style={{ overflowX: 'auto', margin: '8px 0 16px' }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {d.purchases.map((s: any) => (
                    <tr key={s.id}>
                      <td><strong>{s.invoice_no}</strong></td>
                      <td>{s.sold_at?.slice(0, 10)}</td>
                      <td style={{ fontWeight: 600, textAlign: 'right' }}>{inr(s.total_inr)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn ghost" onClick={() => setPreviewSaleId(s.id)} style={{ padding: '2px 8px', fontSize: 11 }} title="View bill">👁️ View</button>
                          <button
                            className="btn ghost"
                            onClick={async () => {
                              try {
                                setDownloadingSaleId(s.id);
                                const res = await api.get(`/sales/${s.id}`);
                                downloadInvoicePdf(res.data);
                              } catch (e: any) {
                                alert(`Download failed: ${e.message}`);
                              } finally { setDownloadingSaleId(null); }
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
                  {!d.purchases.length && <tr><td colSpan={4} style={{ color: 'var(--color-muted)' }}>No purchases yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <strong>Consent history</strong>
            <ul>{d.consent.map((c: any) => <li key={c.id}><small>{c.created_at?.slice(0, 10)} — {c.status} ({c.source})</small></li>)}</ul>
          </div>
        )}
      </div>
      {previewSaleId && <InvoiceModal saleId={previewSaleId} onClose={() => setPreviewSaleId(null)} />}
    </div>
  );
}

/* ── All customers (table view) ────────────────────────────────── */
function CustomerList() {
  const [q, setQ] = useState('');
  const [minSpent, setMinSpent] = useState('');
  const [recency, setRecency] = useState('');
  const [lastFrom, setLastFrom] = useState('');
  const [lastTo, setLastTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selId, setSelId] = useState<string | null>(null);
  const extra = recency === 'repeat' ? '&repeat=1'
    : recency.startsWith('last:') ? `&last_days=${recency.slice(5)}`
    : recency.startsWith('lapsed:') ? `&lapsed_days=${recency.slice(7)}`
    : recency === 'custom' && (lastFrom || lastTo) ? `&last_from=${lastFrom}&last_to=${lastTo}` : '';
  const query = useQuery({
    queryKey: ['cus', q, minSpent, recency, lastFrom, lastTo, page, limit],
    queryFn: () => api.get(`/customers?q=${encodeURIComponent(q)}&min_spent=${minSpent || 0}${extra}&page=${page}&limit=${limit}`),
  });
  const rows = query.data?.data || [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageNumbers: (number | '...')[] = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  })();
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>All Customers</h1>
          <p style={{ color: 'var(--color-muted)', margin: '4px 0 0' }}>Every registered customer. Search and filter by name/phone/ID, spend and last purchase.</p>
        </div>
        <button className="btn ghost" onClick={() => query.refetch()} style={{ fontSize: 13 }}>↻ Refresh</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="filters" style={{ marginBottom: 16 }}>
          <input placeholder="Name / phone / ID / email" value={q} onChange={(e) => resetPage(setQ)(e.target.value)} style={{ minWidth: 240 }} />
          <input placeholder="Min spend ₹" value={minSpent} onChange={(e) => resetPage(setMinSpent)(e.target.value)} />
          <select value={recency} onChange={(e) => resetPage(setRecency)(e.target.value)}>
            <option value="">Last purchase: any time</option>
            <option value="last:30">Purchased ≤ 30 days ago</option>
            <option value="last:60">Purchased ≤ 60 days ago</option>
            <option value="last:90">Purchased ≤ 90 days ago</option>
            <option value="last:180">Purchased ≤ 180 days ago</option>
            <option value="lapsed:90">Not purchased in 90 days</option>
            <option value="lapsed:180">Not purchased in 180 days</option>
            <option value="repeat">Repeat customers (2+ bills)</option>
            <option value="custom">Custom date range…</option>
          </select>
          {recency === 'custom' && (
            <>
              <input type="date" value={lastFrom} onChange={(e) => resetPage(setLastFrom)(e.target.value)} title="From" />
              <input type="date" value={lastTo} onChange={(e) => resetPage(setLastTo)(e.target.value)} title="To" />
            </>
          )}
          {(q || minSpent || recency) && (
            <button className="btn ghost" style={{ minWidth: 80, fontSize: 12 }} onClick={() => { setQ(''); setMinSpent(''); setRecency(''); setLastFrom(''); setLastTo(''); setPage(1); }}>Clear</button>
          )}
        </div>

        {query.isLoading ? (
          <div className="empty" style={{ padding: 40 }}>Loading customers…</div>
        ) : !rows.length ? (
          <div className="empty" style={{ padding: 40 }}>No customers found.</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 10 }}>
            <table className="tbl" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr style={{ background: '#FFFFFF' }}>
                  <th style={{ width: 56 }}>S.No</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>City</th>
                  <th style={{ textAlign: 'right' }}>Purchases</th>
                  <th style={{ textAlign: 'right' }}>Total Spent</th>
                  <th>Consent</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any, i: number) => (
                  <tr key={c.id}>
                    <td style={{ color: 'var(--color-muted)' }}>{(page - 1) * limit + i + 1}</td>
                    <td><small style={{ color: 'var(--color-muted)' }}>{c.customer_code}</small></td>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.phone}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.city || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{c.purchase_count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-gold-deep)', whiteSpace: 'nowrap' }}>{inr(c.total_spent_inr)}</td>
                    <td>{c.marketing_consent ? <span className="badge ok">Opted in</span> : <span className="badge warn">No</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn ghost" onClick={() => setSelId(c.id)} style={{ padding: '4px 12px', fontSize: 12 }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!query.isLoading && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-muted)' }}>
              <span>Show</span>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} style={{ width: 'auto', padding: '6px 10px' }}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>per page</span>
              {total > 0 && <span style={{ marginLeft: 6 }}>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} customers</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 12px', fontSize: 13 }}>‹ Prev</button>
              {pageNumbers.map((p, idx) => (
                p === '...' ? (
                  <span key={`gap-${idx}`} style={{ padding: '0 4px', color: 'var(--color-muted)' }}>…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p)} className={p === page ? 'btn gold' : 'btn ghost'} style={{ padding: '6px 11px', fontSize: 13, minWidth: 34 }}>{p}</button>
                )
              ))}
              <button className="btn ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 12px', fontSize: 13 }}>Next ›</button>
            </div>
          </div>
        )}
      </div>

      {selId && <CustomerDetailModal customerId={selId} onClose={() => setSelId(null)} onChanged={() => query.refetch()} />}
    </div>
  );
}

export default function Customers({ mode = 'view' }: { mode?: 'new' | 'view' }) {
  return <div className="page">{mode === 'new' ? <NewCustomer /> : <CustomerList />}</div>;
}
