import { useState, useEffect } from 'react';
import { api, inr } from '../lib/api';
import { downloadInvoicePdf, SaleInvoiceData } from '../lib/invoicePdf';

interface Props {
  saleId?: string;
  initialSale?: any;
  onClose: () => void;
}

export default function InvoiceModal({ saleId, initialSale, onClose }: Props) {
  const [sale, setSale] = useState<SaleInvoiceData | null>(initialSale || null);
  const [loading, setLoading] = useState<boolean>(!initialSale && !!saleId);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!sale && saleId) {
      setLoading(true);
      api.get(`/sales/${saleId}`)
        .then((res) => {
          setSale(res.data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load invoice details');
          setLoading(false);
        });
    }
  }, [saleId]);

  const handleDownload = () => {
    if (sale) {
      downloadInvoicePdf(sale);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(71, 16, 29, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 820,
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: '#fff',
          borderRadius: 14,
          padding: 24,
          boxShadow: '0 20px 45px rgba(71,16,29,0.35)',
          position: 'relative',
        }}
      >
        {/* Modal Action Bar (Hidden in Print) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-espresso)' }}>Tax Invoice</span>
            {sale && <span className="badge ok">Finalized &amp; Paid</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn gold" onClick={handleDownload} disabled={!sale}>
              📥 Download Invoice PDF
            </button>
            <button className="btn ghost" onClick={handlePrint} disabled={!sale}>
              🖨️ Print
            </button>
            <button className="btn ghost" onClick={onClose}>
              ✕ Close
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-muted)' }}>
            Loading invoice details...
          </div>
        )}

        {error && (
          <div className="err-box" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {sale && (
          <div className="invoice-container" style={{ color: 'var(--color-espresso)' }}>
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '2px solid var(--color-gold)',
                paddingBottom: 14,
                marginBottom: 16,
              }}
            >
              <div>
                <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', color: 'var(--color-gold-deep)', letterSpacing: 0.5 }}>
                  {sale.shop_name || 'AURUM LUXE JEWELLERS'}
                </h2>
                <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>Certified BIS Hallmarked 916 Gold &amp; Fine Jewellery</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>GSTIN: 29ABCDE1234F1Z5 • BIS Lic: HM-916024</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5, color: 'var(--color-gold-deep)' }}>TAX INVOICE</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{sale.invoice_no}</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                  Date: {new Date(sale.sold_at || sale.created_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Bill To & Snapshot Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
                background: '#EFE5E5',
                padding: 14,
                borderRadius: 8,
                marginBottom: 18,
                fontSize: 13,
              }}
            >
              <div>
                <strong style={{ display: 'block', color: 'var(--color-gold-deep)', marginBottom: 4 }}>CUSTOMER DETAILS</strong>
                <div><strong>Name:</strong> {sale.customer_name || 'Walk-in Customer'}</div>
                <div><strong>Phone:</strong> {sale.customer_phone || '—'}</div>
                {sale.customer_email && <div><strong>Email:</strong> {sale.customer_email}</div>}
                {sale.customer_code && <div><strong>Customer ID:</strong> {sale.customer_code}</div>}
                {(sale.customer_city || sale.customer_address_line1) && (
                  <div>
                    <strong>Address:</strong> {[sale.customer_address_line1, sale.customer_city, sale.customer_state].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>

              <div>
                <strong style={{ display: 'block', color: 'var(--color-gold-deep)', marginBottom: 4 }}>INVOICE SUMMARY</strong>
                <div><strong>Payment Status:</strong> <span className="badge ok">Captured / Paid</span></div>
                <div><strong>Gold Rate (24K Snapshot):</strong> {sale.rate_24k_per_g_inr ? inr(sale.rate_24k_per_g_inr) + ' /g' : 'Standard'}</div>
                <div>
                  <strong>Payment Mode:</strong>{' '}
                  {(sale.payments && sale.payments.length > 0)
                    ? sale.payments.map((p) => p.method.toUpperCase()).join(', ')
                    : 'Standard'}
                </div>
              </div>
            </div>

            {/* Lines Table */}
            <div style={{ overflowX: 'auto', marginBottom: 18 }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead>
                  <tr style={{ background: '#F4ECE3' }}>
                    <th style={{ width: 36 }}>#</th>
                    <th>Item Description</th>
                    <th>Purity</th>
                    <th>Net Wt (g)</th>
                    <th>Gold Value</th>
                    <th>Making Charges</th>
                    <th style={{ textAlign: 'right' }}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(sale.lines || []).map((l, idx) => (
                    <tr key={l.id || idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{l.name}</strong>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>SKU: {l.sku}</div>
                      </td>
                      <td><span className="chip" style={{ margin: 0, padding: '2px 8px', fontSize: 11 }}>{l.purity}</span></td>
                      <td>{Number(l.net_gold_weight_g || 0).toFixed(3)}g</td>
                      <td>{inr(l.gold_value_inr || 0)}</td>
                      <td>{inr(l.making_charge_inr || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{inr(l.line_total_inr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary & Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
              <div style={{ width: '100%', maxWidth: 320, background: '#EFE5E5', padding: 14, borderRadius: 8, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Items Subtotal:</span>
                  <span>{inr(sale.subtotal_inr)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: sale.discount_inr > 0 ? 'var(--color-error)' : 'inherit' }}>
                  <span>Discounts Applied:</span>
                  <span>{sale.discount_inr > 0 ? `-${inr(sale.discount_inr)}` : inr(0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>GST (3%):</span>
                  <span>{inr(sale.tax_inr)}</span>
                </div>
                <hr style={{ borderColor: 'var(--color-border)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 18, fontWeight: 700, color: 'var(--color-gold-deep)' }}>
                  <span>Final Total:</span>
                  <span>{inr(sale.total_inr)}</span>
                </div>
              </div>
            </div>

            {/* Footer / BIS Hallmarking */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, fontSize: 12, color: 'var(--color-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <strong>Guarantee &amp; Purity Certification:</strong>
                <div>• All gold jewellery is BIS hallmarked for verified fineness and purity.</div>
                <div>• Certified weight documented at the time of purchase.</div>
                <div>• Retain this invoice for exchange/buyback per store policies.</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 160 }}>
                <div style={{ height: 36, borderBottom: '1px solid var(--color-espresso)', marginBottom: 4 }} />
                <div>Authorized Signatory</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
