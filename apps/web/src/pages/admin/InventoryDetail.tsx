import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { api, inr } from '../../lib/api';
import { barcodeDataUrl, barcodeFilename, downloadBarcode } from '../../lib/barcode';
import { pieceImage, onImgError } from '../../lib/images';
import { useAuth } from '../../hooks/auth';
import InvoiceModal from '../../components/InvoiceModal';

const statusBadge = (s: string) => (s === 'available' ? 'ok' : s === 'sold' ? 'err' : 'warn');

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pd-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function InventoryDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [invoiceSaleId, setInvoiceSaleId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.get(`/products/${id}`) });
  const p = q.data?.data;
  const img = p ? pieceImage({ image_url: p.image_url, category_slug: p.category_slug }) : '';
  const sales: any[] = p?.sales || [];
  const last = sales[0];
  const barcodes: any[] = p?.barcodes || [];
  const activeBarcode = barcodes.find((b) => b.active);
  const barcodePreview = useMemo(
    () => (activeBarcode ? barcodeDataUrl(activeBarcode.barcode_value, { scale: 3, height: 14, includetext: true }) : null),
    [activeBarcode?.barcode_value]);

  // Recharts data — value composition of each sale of this piece.
  const breakdown = last ? [
    { name: 'Gold', value: Number(last.gold_value_inr) || 0 },
    { name: 'Making', value: Number(last.making_charge_inr) || 0 },
    { name: 'Stone', value: Number(last.stone_value_inr) || 0 },
    { name: 'Wastage', value: Number(last.wastage_charge_inr) || 0 },
    { name: 'Other', value: Number(last.other_charges_inr) || 0 },
    { name: 'Discount', value: -(Number(last.discount_inr) || 0) },
    { name: 'Tax', value: Number(last.tax_inr) || 0 },
    { name: 'Total', value: Number(last.line_total_inr) || 0 },
  ] : [];
  const trend = [...sales].reverse().map((s: any) => ({
    d: (s.sold_at || s.created_at)?.slice(0, 10),
    total: Number(s.line_total_inr) || 0,
    invoice: s.invoice_no,
  }));

  return (
    <div className="page">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', margin: 0, flex: 1 }}>{p?.name || 'Piece'}</h1>
        {user?.role === 'admin' && p && <Link className="btn gold" to={`/admin/inventory/new?id=${p.id}`}>Edit piece</Link>}
        <Link className="btn ghost" to="/admin/inventory">← Inventory</Link>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>
        {p ? `${p.sku} • ${p.category_name || '—'} • ${p.purity}${p.design_code ? ` • Design ${p.design_code}` : ''}` : ''}
        {q.isLoading && ' Loading…'}
      </p>
      {q.isError && <div className="err-box">Could not load this piece.</div>}

      {p && (
        <div className="pd-page-top">
          <div className="pd-page-media">
            <img src={img} alt={p.name} onError={(e) => onImgError(e, p.sku)} className="pd-page-image" />
            <span className={`badge ${statusBadge(p.status)}`} style={{ position: 'absolute', top: 8, right: 8 }}>{p.status}</span>
          </div>

          <div style={{ minWidth: 0 }}>
            <div className="modal-kpis">
              <div className="modal-kpi">
                <small>Net gold</small>
                <strong>{Number(p.net_gold_weight_g || 0)} g</strong>
              </div>
              <div className="modal-kpi">
                <small>Acquisition</small>
                <strong>{inr(p.acquisition_cost_inr)}</strong>
              </div>
              <div className="modal-kpi">
                <small>Last sale</small>
                <strong>{last ? inr(last.line_total_inr) : 'Not sold'}</strong>
              </div>
              <div className="modal-kpi">
                <small>Gross weight</small>
                <strong>{Number(p.gross_weight_g || 0)} g</strong>
              </div>
            </div>

            {last ? (
              <div className="pd-last-sale" style={{ marginTop: 0, marginBottom: 12 }}>
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
                      {last.customer_city ? ` • ${last.customer_city}` : ''}
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
                  {last.sale_status === 'finalized' && (
                    <button type="button" className="btn ghost xs" onClick={() => setInvoiceSaleId(last.id)}>View invoice</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="modal-note" style={{ marginBottom: 12 }}>
                This piece has not been sold yet. It is currently <strong>{p.status}</strong>.
              </div>
            )}

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div className="pd-panel">
                <p className="modal-section-title">Quality &amp; weights</p>
                <Field label="Status" value={p.status} />
                <Field label="Purity" value={p.purity} />
                <Field label="Gross weight" value={`${Number(p.gross_weight_g || 0)} g`} />
                <Field label="Stone weight" value={`${Number(p.stone_weight_g || 0)} g`} />
                <Field label="Net gold weight" value={`${Number(p.net_gold_weight_g || 0)} g`} />
                <Field label="Acquired" value={p.created_at?.slice(0, 10) || '—'} />
              </div>
              <div className="pd-panel">
                <p className="modal-section-title">Pricing inputs</p>
                <Field label="Making charge" value={`${p.making_charge_type} · ${p.making_charge_value}`} />
                <Field label="Stone value" value={inr(p.stone_value_inr)} />
                <Field label="Wastage" value={inr(p.wastage_charge_inr)} />
                <Field label="Other charges" value={inr(p.other_charges_inr)} />
                <Field label="Acquisition cost" value={inr(p.acquisition_cost_inr)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {p && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <strong>Sale</strong>
            {sales.length === 0 ? (
              <div style={{ marginTop: 6, color: 'var(--color-muted)' }}>Not sold yet.</div>
            ) : (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sales.map((s: any) => (
                  <div key={s.sale_item_id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <strong>{s.invoice_no}</strong>
                        <span className={`badge ${s.sale_status === 'finalized' ? 'ok' : 'warn'}`} style={{ marginLeft: 8 }}>{s.sale_status}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--color-gold-deep)' }}>{inr(s.line_total_inr)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                      {(s.sold_at || s.created_at)?.slice(0, 10)} • {s.customer_name ? `${s.customer_name} (${s.customer_phone || '—'})` : 'Walk-in customer'}
                      {s.payment_methods ? ` • ${s.payment_methods}` : ''}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      This piece: <strong>{inr(s.line_total_inr)}</strong> • {s.sold_purity} • {Number(s.sold_net_gold_weight_g)} g
                      {s.sold_rate_24k_per_g_inr ? ` • rate ${inr(s.sold_rate_24k_per_g_inr)}/g` : ''}
                      {s.offer_code ? ` • offer ${s.offer_code}` : ''}
                    </div>
                    {s.sale_status === 'finalized' && (
                      <button className="btn ghost" style={{ marginTop: 8, padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setInvoiceSaleId(s.id)}>
                        View invoice
                      </button>
                    )}
                  </div>
                ))}

                {last?.sale_status === 'finalized' ? (
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <strong>Sale value composition</strong>
                    <div style={{ height: 240, marginTop: 8 }}>
                      <ResponsiveContainer><BarChart data={breakdown}>
                        <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />
                        <Tooltip formatter={(v: number) => inr(v)} />
                        <Bar dataKey="value" fill="#D6B45C" radius={6} />
                      </BarChart></ResponsiveContainer>
                    </div>
                    <small style={{ color: 'var(--color-muted)' }}>
                      Invoice {last.invoice_no} — final {inr(last.line_total_inr)} vs acquisition {inr(p.acquisition_cost_inr)}.
                    </small>
                  </div>
                ) : null}
                {trend.length > 1 ? (
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <strong>Sales trend (this piece)</strong>
                    <div style={{ height: 200, marginTop: 8 }}>
                      <ResponsiveContainer><LineChart data={trend}>
                        <XAxis dataKey="d" fontSize={11} /><YAxis fontSize={11} />
                        <Tooltip formatter={(v: number) => inr(v)} />
                        <Line dataKey="total" stroke="#B89A52" strokeWidth={2} dot />
                      </LineChart></ResponsiveContainer>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginTop: 16 }}>
            <div className="card">
              <strong>Barcode</strong>
              {barcodes.length === 0 ? (
                <div style={{ marginTop: 6, color: 'var(--color-muted)' }}>No barcode assigned.</div>
              ) : activeBarcode ? (
                <div style={{ marginTop: 8 }}>
                  {barcodePreview && (
                    <img src={barcodePreview} alt={activeBarcode.barcode_value}
                      style={{ maxWidth: '100%', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)' }} />
                  )}
                  <div style={{ marginTop: 4, letterSpacing: 1, fontWeight: 600 }}>{activeBarcode.barcode_value}</div>
                  <button className="btn gold" style={{ marginTop: 8 }}
                    onClick={() => downloadBarcode(activeBarcode.barcode_value, barcodeFilename(p.sku))}>
                    Download barcode (PNG)
                  </button>
                  {barcodes.length > 1 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>All barcodes</div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {barcodes.map((b: any) => (
                          <span key={b.id} className="chip" style={{ opacity: b.active ? 1 : 0.45 }}>
                            {b.barcode_value}{!b.active ? ' (inactive)' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 6, color: 'var(--color-muted)' }}>No active barcode.</div>
              )}
            </div>

            <div className="card">
              <strong>Stock movements</strong>
              {(p.movements || []).length === 0 ? (
                <div style={{ marginTop: 6, color: 'var(--color-muted)' }}>No movements recorded.</div>
              ) : (
                <div className="tbl-wrap"><table className="tbl" style={{ marginTop: 8 }}>
                  <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Weight Δ</th><th>Reason</th></tr></thead>
                  <tbody>{p.movements.map((m: any) => (
                    <tr key={m.id}>
                      <td>{m.created_at?.slice(0, 10)}</td>
                      <td>{m.movement_type}</td>
                      <td>{m.qty_delta}</td>
                      <td>{Number(m.weight_delta_g || 0)} g</td>
                      <td style={{ color: 'var(--color-muted)' }}>{m.reason || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
          </div>
        </>
      )}

      {invoiceSaleId && <InvoiceModal saleId={invoiceSaleId} onClose={() => setInvoiceSaleId(null)} />}
    </div>
  );
}
