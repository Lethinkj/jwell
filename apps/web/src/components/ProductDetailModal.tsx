import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, inr } from '../lib/api';
import { pieceImage, onImgError } from '../lib/images';
import { useAuth } from '../hooks/auth';
import Modal from './Modal';
import InvoiceModal from './InvoiceModal';
import { Icon, ICONS } from './icons';

interface Props {
  productId: string;
  onClose: () => void;
  /** When provided, the popup gains an "Add to bill" action (POS search flow). */
  onAddToBill?: (product: any) => void | Promise<void>;
  addDisabled?: boolean;
  addLabel?: string;
}

const statusBadge = (s: string) => (s === 'available' ? 'ok' : s === 'sold' ? 'err' : 'warn');

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pd-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function daysBetween(from?: string | null) {
  if (!from) return null;
  const ms = Date.now() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(0, Math.floor(ms / 86400000));
}

/**
 * Complete piece record in a popup: identity, weights, pricing inputs,
 * barcodes, full sale history with the buying customer, and stock movements.
 */
export default function ProductDetailModal({ productId, onClose, onAddToBill, addDisabled, addLabel }: Props) {
  const { user } = useAuth();
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const q = useQuery({ queryKey: ['product', productId], queryFn: () => api.get(`/products/${productId}`) });
  const p = q.data?.data;
  const img = p ? pieceImage({ image_url: p.image_url, category_slug: p.category_slug }) : '';

  const sales: any[] = p?.sales || [];
  const last = sales[0];
  const barcodes: any[] = p?.barcodes || [];
  const inStockDays = daysBetween(p?.created_at);
  const lastSaleValue = last ? Number(last.line_total_inr) || 0 : null;
  const acquisition = p ? Number(p.acquisition_cost_inr) || 0 : 0;
  const margin = lastSaleValue != null ? lastSaleValue - acquisition : null;

  const add = async () => {
    if (!p || !onAddToBill) return;
    setAdding(true);
    try {
      await onAddToBill(p);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      title={p?.name || 'Piece details'}
      subtitle={p ? `${p.sku} • ${p.category_name || '—'} • ${p.purity}${p.design_code ? ` • Design ${p.design_code}` : ''}` : 'Loading the complete piece record…'}
      icon={<Icon paths={ICONS.gem} size={19} />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          {onAddToBill && (
            <button type="button" className="btn gold" onClick={add} disabled={adding || addDisabled || p?.status !== 'available'}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Icon paths={ICONS.billing} size={15} />
                {adding ? 'Adding…' : addLabel || '+ Add to bill'}
              </span>
            </button>
          )}
          {user?.role === 'admin' && p && (
            <Link className="btn ghost" to={`/admin/inventory/new?id=${p.id}`}>Edit piece</Link>
          )}
          {p && <Link className="btn ghost" to={`/admin/inventory/${p.id}`}>Open full page</Link>}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </>
      }
    >
      {q.isLoading && <div className="empty">Loading piece…</div>}
      {q.isError && <div className="err-box">Could not load this piece.</div>}

      {p && (
        <>
          <div className="pd-top">
            <div className="pd-image-wrap">
              <img src={img} alt={p.name} onError={(e) => onImgError(e, p.sku)} className="pd-image" />
              <span className={`badge ${statusBadge(p.status)}`} style={{ position: 'absolute', top: 10, right: 10 }}>{p.status}</span>
              {p.status === 'available' && <span className="pd-image-note">In stock{inStockDays != null ? ` · ${inStockDays} day${inStockDays === 1 ? '' : 's'}` : ''}</span>}
            </div>

            <div style={{ minWidth: 0 }}>
              <div className="modal-kpis">
                <div className="modal-kpi">
                  <small>Acquisition cost</small>
                  <strong>{inr(acquisition)}</strong>
                </div>
                <div className="modal-kpi">
                  <small>Last sale</small>
                  <strong>{lastSaleValue != null ? inr(lastSaleValue) : 'Not sold'}</strong>
                </div>
                <div className="modal-kpi">
                  <small>Margin on last sale</small>
                  <strong className={margin == null ? '' : margin >= 0 ? 'delta-up' : 'delta-down'}>
                    {margin == null ? '—' : inr(margin)}
                  </strong>
                </div>
                <div className="modal-kpi">
                  <small>Sold count</small>
                  <strong>{sales.filter((s) => s.sale_status === 'finalized').length}</strong>
                </div>
              </div>

              {last ? (
                <div className="pd-last-sale">
                  <div className="pd-last-head">
                    <span className="pd-last-eyebrow">Last sale · buying customer</span>
                    <span className={`badge ${last.sale_status === 'finalized' ? 'ok' : 'warn'}`}>{last.sale_status}</span>
                  </div>
                  <div className="pd-buyer">
                    <div className="pd-buyer-avatar">{(last.customer_name || 'W').charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <strong>{last.customer_name || 'Walk-in customer'}</strong>
                      <div className="pd-buyer-meta">
                        {last.customer_phone || 'No phone'}
                        {last.customer_email ? ` • ${last.customer_email}` : ''}
                        {last.customer_code ? ` • ${last.customer_code}` : ''}
                        {(last.customer_city || last.customer_address_line1) ? ` • ${[last.customer_address_line1, last.customer_city].filter(Boolean).join(', ')}` : ''}
                      </div>
                    </div>
                    <div className="pd-buyer-amount">
                      <strong>{inr(last.line_total_inr)}</strong>
                      <small>this piece</small>
                    </div>
                  </div>
                  <div className="pd-last-meta">
                    <span><strong>{last.invoice_no}</strong> · bill {inr(last.total_inr)}</span>
                    <span>{(last.sold_at || last.created_at)?.slice(0, 10)}</span>
                    {last.payment_methods ? <span>Paid via {last.payment_methods}</span> : null}
                    {last.offer_code ? <span>Offer {last.offer_code}</span> : null}
                  </div>
                  {last.sale_status === 'finalized' && (
                    <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setInvoiceSaleId(last.id)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon paths={ICONS.receipt} size={14} />View invoice</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="modal-note" style={{ marginTop: 12 }}>
                  This piece has not been sold yet. It is currently <strong>{p.status}</strong>.
                </div>
              )}
            </div>
          </div>

          <div className="pd-cols">
            <div className="pd-panel">
              <p className="modal-section-title">Quality &amp; weights</p>
              <Field label="Purity" value={p.purity} />
              <Field label="Gross weight" value={`${Number(p.gross_weight_g || 0)} g`} />
              <Field label="Stone weight" value={`${Number(p.stone_weight_g || 0)} g`} />
              <Field label="Net gold weight" value={`${Number(p.net_gold_weight_g || 0)} g`} />
              <Field label="Acquired" value={p.created_at?.slice(0, 10) || '—'} />
              <Field label="Status" value={p.status} />
            </div>

            <div className="pd-panel">
              <p className="modal-section-title">Pricing inputs</p>
              <Field label="Making charge" value={`${p.making_charge_type} · ${p.making_charge_value}`} />
              <Field label="Stone value" value={inr(p.stone_value_inr)} />
              <Field label="Wastage" value={inr(p.wastage_charge_inr)} />
              <Field label="Other charges" value={inr(p.other_charges_inr)} />
              <Field label="Acquisition cost" value={inr(p.acquisition_cost_inr)} />
            </div>

            <div className="pd-panel">
              <p className="modal-section-title">Barcodes</p>
              {barcodes.length === 0 ? <span className="modal-hint">No barcodes assigned.</span> : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {barcodes.map((b: any) => (
                    <span key={b.id} className="chip" style={{ opacity: b.active ? 1 : 0.45 }}>
                      {b.barcode_value}{!b.active ? ' (inactive)' : ''}
                    </span>
                  ))}
                </div>
              )}
              <p className="modal-section-title" style={{ marginTop: 14 }}>Stock movements</p>
              {(p.movements || []).length === 0 ? <span className="modal-hint">No movements recorded.</span> : (
                <div className="pd-movements">
                  {p.movements.map((m: any) => (
                    <div key={m.id}>
                      <span>{m.movement_type}{m.reason ? ` — ${m.reason}` : ''}</span>
                      <span>{m.created_at?.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <p className="modal-section-title">Full sale history ({sales.length})</p>
            {sales.length === 0 ? (
              <div className="modal-note">Not sold yet.</div>
            ) : (
              <div className="pd-sales">
                {sales.map((s: any) => (
                  <div key={s.sale_item_id} className="pd-sale-row">
                    <div style={{ minWidth: 0 }}>
                      <strong>{s.invoice_no}</strong>
                      <span className={`badge ${s.sale_status === 'finalized' ? 'ok' : 'warn'}`} style={{ marginLeft: 8 }}>{s.sale_status}</span>
                      <div className="pd-sale-sub">
                        {(s.sold_at || s.created_at)?.slice(0, 10)} • {s.customer_name ? `${s.customer_name} (${s.customer_phone || '—'})` : 'Walk-in customer'}
                        {s.payment_methods ? ` • ${s.payment_methods}` : ''}
                      </div>
                    </div>
                    <div className="pd-sale-right">
                      <div>
                        <strong>{inr(s.line_total_inr)}</strong>
                        <small>piece · bill {inr(s.total_inr)}</small>
                      </div>
                      {s.sale_status === 'finalized' && (
                        <button type="button" className="btn ghost xs" onClick={() => setInvoiceSaleId(s.id)} title="View invoice">View</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {invoiceSaleId && <InvoiceModal saleId={invoiceSaleId} onClose={() => setInvoiceSaleId(null)} />}
    </Modal>
  );
}
