import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, inr } from '../../lib/api';
import InvoiceModal from '../../components/InvoiceModal';
import Modal from '../../components/Modal';
import { Icon, ICONS } from '../../components/icons';
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
      {errors?.[k] && <div className="modal-error">{errors[k]}</div>}
    </div>
  );
  return (
    <div className="modal-grid">
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

/* ── New customer popup ────────────────────────────────────────── */
function NewCustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (missingFields(form).length) {
      setErrors(Object.fromEntries(missingFields(form).map((k) => [k, 'Required'])));
      setMsg(missingMsg(form));
      return;
    }
    try {
      setSaving(true);
      await api.post('/customers', form);
      onSaved();
      onClose();
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title="New customer"
      subtitle="Register a customer profile. Name, phone and a full address are mandatory."
      icon={<Icon paths={ICONS.customers} size={19} />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="modal-hint">Marketing consent defaults to opted in.</span>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn gold" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save customer'}
          </button>
        </>
      }
    >
      {msg && <div className="err-box" style={{ marginBottom: 12 }}>{msg}</div>}
      <CustomerFields value={form} onChange={setForm} errors={errors} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={form.marketing_consent}
          onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })}
        />
        <span>Marketing consent (WhatsApp &amp; SMS campaigns)</span>
      </label>
    </Modal>
  );
}

/* ── Edit customer popup (nested above the detail popup) ───────── */
function EditCustomerModal({ customer, onClose, onSaved }: { customer: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    name: customer.name ?? '', phone: customer.phone ?? '', email: customer.email ?? '',
    address_line1: customer.address_line1 ?? '', city: customer.city ?? '', state: customer.state ?? '',
    postal_code: customer.postal_code ?? '', birthday: customer.birthday ?? '', anniversary: customer.anniversary ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (missingFields(form).length) {
      setErrors(Object.fromEntries(missingFields(form).map((k) => [k, 'Required'])));
      setMsg(missingMsg(form));
      return;
    }
    try {
      setSaving(true);
      await api.patch(`/customers/${customer.id}`, form);
      onSaved();
      onClose();
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title="Edit customer"
      subtitle="Name, phone and a full address are mandatory."
      icon={<Icon paths={ICONS.customers} size={19} />}
      onClose={onClose}
      size="lg"
      zIndex={1100}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn gold" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      {msg && <div className="err-box" style={{ marginBottom: 12 }}>{msg}</div>}
      <CustomerFields value={form} onChange={setForm} errors={errors} />
    </Modal>
  );
}

/* ── Customer detail popup ─────────────────────────────────────── */
function CustomerDetailModal({ customerId, onClose, onChanged }: { customerId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useQuery({ queryKey: ['cus-d', customerId], queryFn: () => api.get(`/customers/${customerId}`) });
  const [editing, setEditing] = useState(false);
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null);
  const d = detail.data?.data;

  return (
    <>
      <Modal
        title={d ? d.name : 'Customer'}
        subtitle={d ? `${d.customer_code} • ${d.phone}${d.email ? ` • ${d.email}` : ''}` : 'Loading customer record…'}
        icon={<Icon paths={ICONS.customers} size={19} />}
        onClose={onClose}
        size="xl"
        zIndex={1000}
        footer={
          <>
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={onClose}>Close</button>
            {d && <button type="button" className="btn gold" onClick={() => setEditing(true)}>Edit customer</button>}
          </>
        }
      >
        {!d ? <div className="empty" style={{ padding: 40 }}>Loading…</div> : (
          <>
            <div className="modal-kpis">
              <div className="modal-kpi"><small>Total spent</small><strong>{inr(d.total_spent_inr)}</strong></div>
              <div className="modal-kpi"><small>Purchases</small><strong>{d.purchase_count ?? d.purchases.length}</strong></div>
              <div className="modal-kpi"><small>Last purchase</small><strong>{d.purchases[0]?.sold_at?.slice(0, 10) || 'None'}</strong></div>
              <div className="modal-kpi"><small>Consent</small><strong>{d.marketing_consent ? 'Opted in' : 'No'}</strong></div>
            </div>

            <div className="modal-grid" style={{ marginBottom: 16 }}>
              <div>
                <p className="modal-section-title">Contact</p>
                <div className="pd-field"><span>Phone</span><strong>{d.phone || '—'}</strong></div>
                <div className="pd-field"><span>Email</span><strong>{d.email || '—'}</strong></div>
                <div className="pd-field"><span>Birthday</span><strong>{d.birthday || '—'}</strong></div>
                <div className="pd-field"><span>Anniversary</span><strong>{d.anniversary || '—'}</strong></div>
              </div>
              <div>
                <p className="modal-section-title">Address</p>
                <div className="pd-field" style={{ alignItems: 'flex-start' }}>
                  <span>Ship to</span>
                  <strong style={{ textAlign: 'right' }}>
                    {[d.address_line1, d.city, d.state, d.postal_code].filter(Boolean).join(', ') || 'No address on record'}
                  </strong>
                </div>
              </div>
            </div>

            <p className="modal-section-title">Purchases ({d.purchases.length})</p>
            <div className="tbl-wrap">
              <table className="tbl">
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
                          <button type="button" className="btn ghost xs" onClick={() => setPreviewSaleId(s.id)} title="View bill">View</button>
                          <button
                            type="button"
                            className="btn ghost xs"
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
                            title="Download PDF"
                          >
                            {downloadingSaleId === s.id ? '…' : 'PDF'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!d.purchases.length && <tr><td colSpan={4} style={{ color: 'var(--color-muted)' }}>No purchases yet.</td></tr>}
                </tbody>
              </table>
            </div>

            <p className="modal-section-title" style={{ marginTop: 16 }}>Consent history</p>
            <ul className="modal-list">
              {d.consent.map((c: any) => <li key={c.id}><small>{c.created_at?.slice(0, 10)} — {c.status} ({c.source})</small></li>)}
              {!d.consent.length && <li><small style={{ color: 'var(--color-muted)' }}>No consent changes recorded.</small></li>}
            </ul>
          </>
        )}
      </Modal>

      {editing && d && (
        <EditCustomerModal
          customer={{ ...d, id: customerId }}
          onClose={() => setEditing(false)}
          onSaved={() => { detail.refetch(); onChanged(); }}
        />
      )}

      {previewSaleId && <InvoiceModal saleId={previewSaleId} onClose={() => setPreviewSaleId(null)} />}
    </>
  );
}

/* ── All customers (table view) ────────────────────────────────── */
const EMPTY_FILTERS = { q: '', minSpent: '', recency: '', lastFrom: '', lastTo: '' };

function CustomerList({ startNew, onNewClosed }: { startNew: boolean; onNewClosed: () => void }) {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [newOpen, setNewOpen] = useState(startNew);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selId, setSelId] = useState<string | null>(null);
  const extra = applied.recency === 'repeat' ? '&repeat=1'
    : applied.recency.startsWith('last:') ? `&last_days=${applied.recency.slice(5)}`
    : applied.recency.startsWith('lapsed:') ? `&lapsed_days=${applied.recency.slice(7)}`
    : applied.recency === 'custom' && (applied.lastFrom || applied.lastTo)
      ? `&last_from=${applied.lastFrom}&last_to=${applied.lastTo}` : '';
  const query = useQuery({
    queryKey: ['cus', applied, page, limit],
    queryFn: () => api.get(`/customers?q=${encodeURIComponent(applied.q)}&min_spent=${applied.minSpent || 0}${extra}&page=${page}&limit=${limit}`),
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
  const hasFilters = !!(applied.q || applied.minSpent || applied.recency);
  const closeNew = () => {
    setNewOpen(false);
    if (startNew) onNewClosed();
  };

  const search = () => {
    setApplied({ ...draft });
    setPage(1);
  };
  const clearAll = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>All Customers</h1>
          <p style={{ color: 'var(--color-muted)', margin: '4px 0 0' }}>Every registered customer. Search and filter by name/phone/ID, spend and last purchase.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost" onClick={() => query.refetch()} style={{ fontSize: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon paths={ICONS.refresh} size={14} />Refresh</span>
          </button>
          <button type="button" className="btn gold" onClick={() => setNewOpen(true)}>+ New customer</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="filters" style={{ marginBottom: 16 }}>
          <input
            placeholder="Name / phone / ID / email"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
            style={{ minWidth: 240 }}
          />
          <input
            placeholder="Min spend ₹"
            value={draft.minSpent}
            onChange={(e) => setDraft({ ...draft, minSpent: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          />
          <select value={draft.recency} onChange={(e) => setDraft({ ...draft, recency: e.target.value })}>
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
          {draft.recency === 'custom' && (
            <>
              <input type="date" value={draft.lastFrom} onChange={(e) => setDraft({ ...draft, lastFrom: e.target.value })} title="From" />
              <input type="date" value={draft.lastTo} onChange={(e) => setDraft({ ...draft, lastTo: e.target.value })} title="To" />
            </>
          )}
          <button type="button" className="btn gold" onClick={search}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon paths={ICONS.search} size={15} />Search</span>
          </button>
          {hasFilters && (
            <button type="button" className="btn ghost" style={{ minWidth: 80, fontSize: 12 }} onClick={clearAll}>Clear</button>
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
                <tr style={{ background: 'var(--color-surface)' }}>
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
                  <tr key={c.id} className="row-clickable" onClick={() => setSelId(c.id)}>
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
                      <button
                        type="button"
                        className="btn ghost xs"
                        onClick={(e) => { e.stopPropagation(); setSelId(c.id); }}
                      >
                        View
                      </button>
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
              <button type="button" className="btn ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 12px', fontSize: 13 }}>‹ Prev</button>
              {pageNumbers.map((p, idx) => (
                p === '...' ? (
                  <span key={`gap-${idx}`} style={{ padding: '0 4px', color: 'var(--color-muted)' }}>…</span>
                ) : (
                  <button type="button" key={p} onClick={() => setPage(p)} className={p === page ? 'btn gold' : 'btn ghost'} style={{ padding: '6px 11px', fontSize: 13, minWidth: 34 }}>{p}</button>
                )
              ))}
              <button type="button" className="btn ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 12px', fontSize: 13 }}>Next ›</button>
            </div>
          </div>
        )}
      </div>

      {newOpen && <NewCustomerModal onClose={closeNew} onSaved={() => { query.refetch(); }} />}
      {selId && <CustomerDetailModal customerId={selId} onClose={() => setSelId(null)} onChanged={() => query.refetch()} />}
    </div>
  );
}

export default function Customers({ mode = 'view' }: { mode?: 'new' | 'view' }) {
  const navigate = useNavigate();
  return (
    <div className="page">
      <CustomerList startNew={mode === 'new'} onNewClosed={() => navigate('/admin/customers')} />
    </div>
  );
}
