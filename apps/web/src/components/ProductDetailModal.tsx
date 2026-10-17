import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, inr } from '../lib/api';
import { pieceImage, onImgError } from '../lib/images';
import { useAuth } from '../hooks/auth';
import InvoiceModal from './InvoiceModal';

interface Props {
  productId: string;
  onClose: () => void;
}

const statusBadge = (s: string) => (s === 'available' ? 'ok' : s === 'sold' ? 'err' : 'warn');

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
      <span style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function ProductDetailModal({ productId, onClose }: Props) {
  const { user } = useAuth();
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['product', productId], queryFn: () => api.get(`/products/${productId}`) });
  const p = q.data?.data;
  const img = p ? pieceImage({ image_url: p.image_url, category_slug: p.category_slug }) : '';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(59, 48, 43, 0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 990,
        padding: 16, backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card"
        style={{
          width: '100%', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto',
          backgroundColor: '#fff', borderRadius: 14, padding: 20,
          boxShadow: '0 20px 45px rgba(59,48,43,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-espresso)' }}>
            Piece details
          </h2>
          <button className="btn ghost" onClick={onClose}>✕ Close</button>
        </div>

        {q.isLoading && <div className="empty">Loading piece…</div>}
        {q.isError && <div className="err-box">Could not load this piece.</div>}

        {p && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
            {/* Left — image + status */}
            <div>
              <div style={{ position: 'relative' }}>
                <img src={img} alt={p.name} onError={(e) => onImgError(e, p.sku)}
                  style={{ width: '100%', borderRadius: 12, border: '1px solid var(--color-border)' }} />
                <span className={`badge ${statusBadge(p.status)}`} style={{ position: 'absolute', top: 10, right: 10 }}>{p.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {user?.role === 'admin' && (
                  <Link className="btn gold" to={`/admin/inventory/new?id=${p.id}`}>Edit piece</Link>
                )}
                <button className="btn ghost" onClick={onClose}>← Back to stock</button>
              </div>
            </div>

            {/* Right — details */}
            <div>
              <h3 style={{ margin: '0 0 2px', fontSize: 20, color: 'var(--color-espresso)' }}>{p.name}</h3>
              <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>
                {p.sku} • {p.category_name || '—'} • {p.purity}
                {p.design_code ? ` • Design ${p.design_code}` : ''}
              </div>

              <div className="card" style={{ marginBottom: 12 }}>
                <strong>Quality &amp; weights</strong>
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  <Field label="Purity" value={p.purity} />
                  <Field label="Gross weight" value={`${Number(p.gross_weight_g || 0)} g`} />
                  <Field label="Stone weight" value={`${Number(p.stone_weight_g || 0)} g`} />
                  <Field label="Net gold weight" value={`${Number(p.net_gold_weight_g || 0)} g`} />
                </div>
              </div>

              <div className="card" style={{ marginBottom: 12 }}>
                <strong>Pricing inputs</strong>
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  <Field label="Making charge" value={`${p.making_charge_type} · ${p.making_charge_value}`} />
                  <Field label="Stone value" value={inr(p.stone_value_inr)} />
                  <Field label="Wastage" value={inr(p.wastage_charge_inr)} />
                  <Field label="Other charges" value={inr(p.other_charges_inr)} />
                  <Field label="Acquisition cost" value={inr(p.acquisition_cost_inr)} />
                </div>
              </div>

              <div className="card" style={{ marginBottom: 12 }}>
                <strong>Barcodes</strong>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(p.barcodes || []).length === 0 ? <span style={{ color: 'var(--color-muted)' }}>None</span>
                    : p.barcodes.map((b: any) => (
                      <span key={b.id} className="chip" style={{ opacity: b.active ? 1 : 0.45 }}>
                        {b.barcode_value}{!b.active ? ' (inactive)' : ''}
                      </span>
                    ))}
                </div>
              </div>

              {/* Sale history */}
              <div className="card" style={{ marginBottom: 12 }}>
                <strong>Sale</strong>
                {(!p.sales || p.sales.length === 0) ? (
                  <div style={{ marginTop: 6, color: 'var(--color-muted)' }}>Not sold yet.</div>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {p.sales.map((s: any) => (
                      <div key={s.sale_item_id} style={{
                        border: '1px solid var(--color-border)', borderRadius: 8, padding: 10, background: '#FAF6F1',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div>
                            <strong>{s.invoice_no}</strong>
                            <span className={`badge ${s.sale_status === 'finalized' ? 'ok' : 'warn'}`} style={{ marginLeft: 8 }}>{s.sale_status}</span>
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--color-gold-deep)' }}>{inr(s.total_inr)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                          {(s.sold_at || s.created_at)?.slice(0, 10)} • {s.customer_name ? `${s.customer_name} (${s.customer_phone || '—'})` : 'Walk-in customer'}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>This piece: <strong>{inr(s.line_total_inr)}</strong></div>
                        {s.sale_status === 'finalized' && (
                          <button className="btn ghost" style={{ marginTop: 8, padding: '4px 10px', fontSize: 12 }}
                            onClick={() => setInvoiceSaleId(s.id)}>
                            👁️ View invoice
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Movement history */}
              {(p.movements || []).length > 0 && (
                <div className="card">
                  <strong>Stock movements</strong>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {p.movements.map((m: any) => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0' }}>
                        <span style={{ color: 'var(--color-muted)' }}>{m.movement_type}{m.reason ? ` — ${m.reason}` : ''}</span>
                        <span>{m.created_at?.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {invoiceSaleId && <InvoiceModal saleId={invoiceSaleId} onClose={() => setInvoiceSaleId(null)} />}
    </div>
  );
}
