import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../lib/api';
import InvoiceModal from './InvoiceModal';
import { downloadInvoicePdf } from '../lib/invoicePdf';

interface Props {
  onSelectCustomer: (customer: any) => void;
  onClose: () => void;
}

export default function CustomerExplorerModal({ onSelectCustomer, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch customers list
  const customersQuery = useQuery({
    queryKey: ['explorer-customers', search],
    queryFn: () => api.get(`/customers?q=${encodeURIComponent(search)}&limit=50`),
  });

  // Fetch full details of the selected customer
  const customerDetailQuery = useQuery({
    queryKey: ['explorer-customer-detail', selectedCustomerId],
    queryFn: () => (selectedCustomerId ? api.get(`/customers/${selectedCustomerId}`) : null),
    enabled: !!selectedCustomerId,
  });

  const handleDownloadInvoice = async (sale: any) => {
    try {
      setDownloadingId(sale.id);
      // Fetch full sale with lines & payments if needed
      const res = await api.get(`/sales/${sale.id}`);
      downloadInvoicePdf(res.data);
    } catch (e: any) {
      alert(`Failed to download invoice: ${e.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const customers = customersQuery.data?.data || [];
  const activeDetail = customerDetailQuery.data?.data;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(71, 16, 29, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 990,
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
          maxWidth: 960,
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#fff',
          borderRadius: 14,
          padding: 20,
          boxShadow: '0 20px 45px rgba(71,16,29,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-espresso)' }}>
              All Customers &amp; Invoices
            </h2>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Search any customer to view profile, check all past bills, and download invoices.
            </div>
          </div>
          <button className="btn ghost" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* Search Input */}
        <div style={{ marginBottom: 14 }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer phone, name, email, or customer code..."
            style={{ width: '100%', fontSize: 14, padding: '10px 14px' }}
          />
        </div>

        {/* Two-panel Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(340px, 1.4fr)', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Left: Customer List */}
          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              overflowY: 'auto',
              background: '#EFE5E5',
              padding: 10,
            }}
          >
            {customersQuery.isLoading && <div className="empty">Loading customers...</div>}
            {!customersQuery.isLoading && customers.length === 0 && (
              <div className="empty">No customers found matching &quot;{search}&quot;.</div>
            )}
            {customers.map((c: any) => {
              const isSelected = selectedCustomerId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: 8,
                    background: isSelected ? '#F7E4E8' : '#fff',
                    border: isSelected ? '1px solid var(--color-rose)' : '1px solid var(--color-border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{c.name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                        📞 {c.phone} • <span className="chip" style={{ margin: 0, padding: '1px 6px', fontSize: 11 }}>{c.customer_code}</span>
                      </div>
                    </div>
                    <span className="badge ok" style={{ fontSize: 11 }}>
                      {c.purchase_count || 0} bills
                    </span>
                  </div>
                  {c.email && <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>✉️ {c.email}</div>}
                  <div style={{ fontSize: 12, color: 'var(--color-gold-deep)', fontWeight: 600, marginTop: 4 }}>
                    Total Spent: {inr(c.total_spent_inr || 0)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Selected Customer & Their Bills */}
          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              overflowY: 'auto',
              background: '#fff',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {!selectedCustomerId ? (
              <div className="empty" style={{ margin: 'auto' }}>
                Select a customer from the left list to view details and bills.
              </div>
            ) : customerDetailQuery.isLoading ? (
              <div className="empty" style={{ margin: 'auto' }}>
                Loading customer profile &amp; bills...
              </div>
            ) : !activeDetail ? (
              <div className="empty">Customer not found.</div>
            ) : (
              <div>
                {/* Customer Info Card */}
                <div
                  style={{
                    background: '#EFE5E5',
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px', fontSize: 18, color: 'var(--color-espresso)' }}>
                        {activeDetail.name}{' '}
                        <small style={{ color: 'var(--color-muted)', fontSize: 13 }}>({activeDetail.customer_code})</small>
                      </h3>
                      <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                        📞 {activeDetail.phone} {activeDetail.email ? `• ✉️ ${activeDetail.email}` : ''}
                      </div>
                      {(activeDetail.birthday || activeDetail.anniversary) && (
                        <div style={{ fontSize: 12, color: 'var(--color-gold-deep)', marginTop: 4 }}>
                          {activeDetail.birthday ? `🎂 Birthday: ${activeDetail.birthday} ` : ''}
                          {activeDetail.anniversary ? `💍 Anniversary: ${activeDetail.anniversary}` : ''}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn gold"
                      onClick={() => {
                        onSelectCustomer(activeDetail);
                        onClose();
                      }}
                      style={{ fontSize: 13, padding: '8px 14px' }}
                    >
                      ✓ Select for New Bill
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                    <div>
                      <strong>Total Purchases:</strong> {activeDetail.purchase_count || activeDetail.purchases?.length || 0}
                    </div>
                    <div>
                      <strong>Total Spent:</strong> {inr(activeDetail.total_spent_inr || 0)}
                    </div>
                  </div>
                </div>

                {/* Bills Table */}
                <h4 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--color-espresso)' }}>
                  Invoices &amp; Bills ({activeDetail.purchases?.length || 0})
                </h4>

                {(!activeDetail.purchases || activeDetail.purchases.length === 0) ? (
                  <div className="empty" style={{ padding: 24, background: '#EFE5E5', borderRadius: 8 }}>
                    No finalized bills recorded for this customer yet.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#EFE5E5' }}>
                          <th>Invoice No</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDetail.purchases.map((bill: any) => (
                          <tr key={bill.id}>
                            <td>
                              <strong>{bill.invoice_no}</strong>
                            </td>
                            <td>{bill.sold_at?.slice(0, 10) || bill.created_at?.slice(0, 10)}</td>
                            <td style={{ fontWeight: 600, color: 'var(--color-gold-deep)' }}>
                              {inr(bill.total_inr)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn ghost"
                                  onClick={() => setPreviewSaleId(bill.id)}
                                  style={{ padding: '4px 10px', fontSize: 12 }}
                                  title="View complete bill details"
                                >
                                  👁️ View
                                </button>
                                <button
                                  className="btn ghost"
                                  onClick={() => handleDownloadInvoice(bill)}
                                  disabled={downloadingId === bill.id}
                                  style={{ padding: '4px 10px', fontSize: 12 }}
                                  title="Download PDF invoice"
                                >
                                  {downloadingId === bill.id ? '...' : '📥 PDF'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Viewer Modal */}
      {previewSaleId && (
        <InvoiceModal
          saleId={previewSaleId}
          onClose={() => setPreviewSaleId(null)}
        />
      )}
    </div>
  );
}
