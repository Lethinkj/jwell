import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../../lib/api';
import ScannerModal from '../../components/ScannerModal';
import InvoiceModal from '../../components/InvoiceModal';
import CustomerExplorerModal from '../../components/CustomerExplorerModal';
import { downloadInvoicePdf } from '../../lib/invoicePdf';

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  birthday: string;
  anniversary: string;
  marketing_consent: boolean;
}

export default function Billing() {
  // Live Gold Rate Query
  const liveRateQuery = useQuery({
    queryKey: ['live-gold-rate'],
    queryFn: () => api.get('/gold-rates/current'),
    refetchInterval: 60000,
  });

  // Step 1: Customer Phone Search & Selection
  const [searchPhone, setSearchPhone] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [phoneMatches, setPhoneMatches] = useState<any[]>([]);
  const [isCustomerNotFound, setIsCustomerNotFound] = useState(false);
  const [showPastBills, setShowPastBills] = useState(false);

  // New Customer Form State (Name, Phone, Email mandatory; Birthday, Anniversary optional)
  const [customerForm, setCustomerForm] = useState<CustomerForm>({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    anniversary: '',
    marketing_consent: true,
  });
  const [customerFormErrors, setCustomerFormErrors] = useState<Record<string, string>>({});

  // Step 2: Barcode / Products
  const [barcode, setBarcode] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Discounts & Final Price Editing
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [discountInput, setDiscountInput] = useState<string>('');
  const [finalPriceInput, setFinalPriceInput] = useState<string>('');
  const [isFinalPriceManuallyEdited, setIsFinalPriceManuallyEdited] = useState(false);
  const [payMethod, setPayMethod] = useState<'upi' | 'cash' | 'card' | 'bank_transfer'>('upi');

  // Modals & History
  const [msg, setMsg] = useState<{ text: string; type?: 'info' | 'error' | 'success' } | null>(null);
  const [bill, setBill] = useState<any>(null);
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [showCustomerExplorer, setShowCustomerExplorer] = useState(false);
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Fetch recent bills
  const history = useQuery({
    queryKey: ['my-bills'],
    queryFn: () => api.get('/sales?limit=15'),
  });

  // Calculate Base Line Totals
  const totalNetGoldWeight = lines.reduce((s, l) => s + (l.net_gold_weight_g || 0), 0);
  const subtotalBeforeTax = lines.reduce((s, l) => s + (l.est?.subtotal_inr || 0), 0);
  const totalTax = lines.reduce((s, l) => s + (l.est?.tax_inr || 0), 0);
  const baseTotal = lines.reduce((s, l) => s + (l.est?.line_total_inr || 0), 0);

  // Calculate Discount Amount
  let calculatedDiscount = 0;
  const numDiscountInput = parseFloat(discountInput) || 0;
  if (discountType === 'percent') {
    calculatedDiscount = Math.round((baseTotal * (numDiscountInput / 100)) * 100) / 100;
  } else {
    calculatedDiscount = Math.round(numDiscountInput * 100) / 100;
  }
  calculatedDiscount = Math.min(baseTotal, Math.max(0, calculatedDiscount));

  // Default Reduced Price
  const calculatedReducedPrice = Math.max(0, Math.round((baseTotal - calculatedDiscount) * 100) / 100);

  // Update final price input when calculated price changes, unless manually modified
  useEffect(() => {
    if (!isFinalPriceManuallyEdited) {
      setFinalPriceInput(calculatedReducedPrice > 0 ? String(calculatedReducedPrice) : (lines.length > 0 ? '0' : ''));
    }
  }, [calculatedReducedPrice, isFinalPriceManuallyEdited, lines.length]);

  const effectiveFinalPrice = isFinalPriceManuallyEdited
    ? (parseFloat(finalPriceInput) || 0)
    : calculatedReducedPrice;

  const totalEffectiveDiscount = Math.max(0, Math.round((baseTotal - effectiveFinalPrice) * 100) / 100);

  // Auto-focus barcode input when customer is selected or added
  useEffect(() => {
    if (customer && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [customer]);

  // Search Customer by Phone
  const lookupPhone = async (overridePhone?: string) => {
    const p = (overridePhone !== undefined ? overridePhone : searchPhone).trim();
    if (!p) {
      setMsg({ text: 'Please enter a phone number to search.', type: 'error' });
      return;
    }
    setMsg(null);
    setCustomer(null);
    setPhoneMatches([]);
    setIsCustomerNotFound(false);
    setShowPastBills(false);

    try {
      const res = await api.get(`/customers/phone/${encodeURIComponent(p)}`);
      const data = res.data || [];
      if (!data.length) {
        setIsCustomerNotFound(true);
        setCustomerForm((prev) => ({
          ...prev,
          phone: p,
          name: '',
          email: '',
          birthday: '',
          anniversary: '',
        }));
        setCustomerFormErrors({});
        setMsg({ text: `Customer not found for phone "${p}". You can register them below.`, type: 'info' });
      } else if (data.length === 1) {
        selectCustomer(data[0]);
        setMsg({ text: `Found profile for ${data[0].name} (${data[0].customer_code}).`, type: 'success' });
      } else {
        setPhoneMatches(data);
        setMsg({ text: `Multiple customer profiles found on this phone number. Please choose the correct one.`, type: 'info' });
      }
    } catch (e: any) {
      setMsg({ text: e.message || 'Error searching customer.', type: 'error' });
    }
  };

  const selectCustomer = (cust: any) => {
    setCustomer(cust);
    setPhoneMatches([]);
    setIsCustomerNotFound(false);
    setSearchPhone(cust.phone || '');
  };

  const resetCustomerSelection = () => {
    setCustomer(null);
    setPhoneMatches([]);
    setIsCustomerNotFound(false);
    setSearchPhone('');
    setShowPastBills(false);
    setCustomerForm({
      name: '',
      phone: '',
      email: '',
      birthday: '',
      anniversary: '',
      marketing_consent: true,
    });
    setCustomerFormErrors({});
  };

  // Validate Customer Form (Name, Phone, Email mandatory; Birthday, Anniversary optional)
  const validateCustomerForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!customerForm.name.trim()) {
      errors.name = 'Full name is mandatory.';
    }
    if (!customerForm.phone.trim()) {
      errors.phone = 'Phone number is mandatory.';
    } else if (customerForm.phone.trim().replace(/\D/g, '').length < 10) {
      errors.phone = 'Enter a valid 10-digit phone number.';
    }
    if (!customerForm.email.trim()) {
      errors.email = 'Email address is mandatory.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    setCustomerFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Register Customer Only
  const handleSaveCustomerOnly = async () => {
    if (!validateCustomerForm()) {
      setMsg({ text: 'Please fill all mandatory fields (Full Name, Phone Number, Email).', type: 'error' });
      return;
    }
    setIsSavingCustomer(true);
    setMsg(null);
    try {
      const res = await api.post('/customers', {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        email: customerForm.email.trim(),
        birthday: customerForm.birthday || null,
        anniversary: customerForm.anniversary || null,
        marketing_consent: customerForm.marketing_consent,
      });
      selectCustomer(res.data);
      setMsg({ text: `Customer "${res.data.name}" registered successfully! Now scan pieces for today's bill.`, type: 'success' });
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to save customer.', type: 'error' });
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Add Product by Barcode / SKU
  const addBarcode = async (code: string) => {
    setMsg(null);
    const value = code.trim();
    if (!value) return;
    try {
      const r = await api.get(`/products/barcode/${encodeURIComponent(value)}`);
      const prod = r.data;
      if (lines.find((l) => l.product_id === prod.id)) {
        setMsg({ text: `"${prod.sku}" is already added to this bill.`, type: 'info' });
        return;
      }
      const est = await api.post('/pricing/estimate', { product_id: prod.id });
      setLines((prev) => [
        ...prev,
        {
          product_id: prod.id,
          sku: prod.sku,
          name: prod.name,
          purity: prod.purity,
          net_gold_weight_g: prod.net_gold_weight_g,
          gross_weight_g: prod.gross_weight_g,
          est: est.data,
        },
      ]);
      setBarcode('');
      setMsg({
        text: `Added ${prod.name} (${prod.sku}) — ${inr(est.data.line_total_inr)}`,
        type: 'success',
      });
    } catch (e: any) {
      setMsg({ text: e.message || 'Product not found or unavailable.', type: 'error' });
    }
  };

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.product_id !== productId));
  };

  // Finalize Sale & Save Bill
  const handleFinalizeBill = async () => {
    setMsg(null);

    // If new customer form is open and no customer selected yet:
    let activeCustomer = customer;
    if (!activeCustomer) {
      if (!isCustomerNotFound) {
        setMsg({ text: 'Please search and select a customer or fill the new customer form first.', type: 'error' });
        return;
      }
      if (!validateCustomerForm()) {
        setMsg({ text: 'Please fill in mandatory fields (Name, Phone, Email) before finalizing.', type: 'error' });
        return;
      }
      try {
        setIsFinalizing(true);
        const res = await api.post('/customers', {
          name: customerForm.name.trim(),
          phone: customerForm.phone.trim(),
          email: customerForm.email.trim(),
          birthday: customerForm.birthday || null,
          anniversary: customerForm.anniversary || null,
          marketing_consent: customerForm.marketing_consent,
        });
        activeCustomer = res.data;
        setCustomer(activeCustomer);
      } catch (e: any) {
        setMsg({ text: `Failed to create customer: ${e.message}`, type: 'error' });
        setIsFinalizing(false);
        return;
      }
    }

    if (!lines.length) {
      setMsg({ text: 'Please scan at least one piece to generate an invoice.', type: 'error' });
      setIsFinalizing(false);
      return;
    }

    const priceToCharge = Math.max(0, Math.round(effectiveFinalPrice * 100) / 100);

    try {
      setIsFinalizing(true);
      // 1. Create Draft Sale
      const draft = await api.post('/sales/draft', {
        customer_id: activeCustomer.id,
        lines: lines.map((l) => ({ product_id: l.product_id })),
      });

      // 2. Finalize Sale with Custom Final Price & Discounts
      const finalized = await api.post(`/sales/${draft.data.id}/finalize`, {
        lines: lines.map((l) => ({ product_id: l.product_id })),
        custom_final_price_inr: priceToCharge,
        discount_inr: totalEffectiveDiscount,
        payments: [{ method: payMethod, amount_inr: priceToCharge }],
      });

      setBill(finalized.data);
      history.refetch();
      setMsg({
        text: `Sale finalized! Invoice ${finalized.data.invoice_no} issued for ${inr(finalized.data.total_inr)}.`,
        type: 'success',
      });

      // Reset lines and inputs for next bill
      setLines([]);
      setDiscountInput('');
      setFinalPriceInput('');
      setIsFinalPriceManuallyEdited(false);
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to finalize sale.', type: 'error' });
    } finally {
      setIsFinalizing(false);
    }
  };

  const startNewBill = () => {
    setBill(null);
    setLines([]);
    setDiscountInput('');
    setFinalPriceInput('');
    setIsFinalPriceManuallyEdited(false);
    resetCustomerSelection();
    setMsg(null);
  };

  const handleDownloadInvoice = async (sale: any) => {
    try {
      setDownloadingSaleId(sale.id);
      const res = await api.get(`/sales/${sale.id}`);
      downloadInvoicePdf(res.data);
    } catch (e: any) {
      setMsg({ text: `Download failed: ${e.message}`, type: 'error' });
    } finally {
      setDownloadingSaleId(null);
    }
  };

  const rateData = liveRateQuery.data?.data;
  const rate24k = rateData?.rate_24k_per_g_inr || rateData?.rate_per_g_inr || 8000;

  return (
    <div className="page" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Banner: Rate Pill + Customer Directory Button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '14px 20px',
          background: 'linear-gradient(90deg, #FFFFFF, #FAF6F1)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          marginBottom: 20,
          boxShadow: '0 2px 6px rgba(59,48,43,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: 28, color: 'var(--color-espresso)' }}>
              Point of Sale &amp; Billing
            </h1>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Boutique counter sales &amp; instant invoicing
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn gold"
            onClick={() => setShowCustomerExplorer(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13 }}
          >
            👥 Check All Customers &amp; Invoices
          </button>
          {customer && (
            <button className="btn ghost" onClick={startNewBill} style={{ fontSize: 13 }}>
              ➕ New Customer / Bill
            </button>
          )}
        </div>
      </div>

      {/* Notification Banner */}
      {msg && (
        <div
          className="card"
          style={{
            marginBottom: 18,
            padding: '12px 18px',
            backgroundColor: msg.type === 'error' ? '#FDE7E5' : msg.type === 'success' ? '#E3F3EA' : '#FFF9F2',
            border: `1px solid ${msg.type === 'error' ? 'var(--color-error)' : msg.type === 'success' ? 'var(--color-success)' : 'var(--color-gold)'}`,
            color: msg.type === 'error' ? '#7A1F16' : msg.type === 'success' ? 'var(--color-success)' : 'var(--color-espresso)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span>{msg.type === 'error' ? '⚠️' : msg.type === 'success' ? '✓' : 'ℹ️'}</span>
            <span>{msg.text}</span>
          </div>
          <button className="btn ghost" onClick={() => setMsg(null)} style={{ padding: '2px 8px', fontSize: 12 }}>✕</button>
        </div>
      )}

      {/* Bill Finalized Celebration Banner */}
      {bill && (
        <div
          className="card"
          style={{
            marginBottom: 24,
            background: 'linear-gradient(135deg, #FFF9F2 0%, #FFFFFF 100%)',
            border: '2px solid var(--color-gold)',
            borderRadius: 14,
            padding: 24,
            boxShadow: '0 8px 24px rgba(196,154,82,0.15)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'var(--color-gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                  color: '#fff',
                }}
              >
                ✓
              </div>
              <div>
                <span className="badge ok" style={{ fontSize: 11, marginBottom: 4 }}>Sale Finalized &amp; Paid</span>
                <h2 style={{ margin: '2px 0 4px', fontFamily: 'var(--font-display)', color: 'var(--color-espresso)' }}>
                  Invoice {bill.invoice_no}
                </h2>
                <div style={{ fontSize: 14, color: 'var(--color-muted)' }}>
                  Final Amount Paid: <strong style={{ color: 'var(--color-gold-deep)', fontSize: 18 }}>{inr(bill.total_inr)}</strong>
                  {' • '}
                  Payment: {(bill.payments || []).map((p: any) => p.method.toUpperCase()).join(', ') || 'Captured'}
                  {' • '}
                  Customer: <strong>{bill.customer_name || 'Walk-in'}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => setPreviewSaleId(bill.id)}>
                👁️ View Tax Invoice
              </button>
              <button className="btn gold" onClick={() => handleDownloadInvoice(bill)}>
                📥 Download PDF Invoice
              </button>
              <button className="btn ghost" onClick={() => window.print()}>
                🖨️ Print
              </button>
              <button className="btn" onClick={startNewBill}>
                ➕ Start Next Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Billing Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 1fr)', gap: 24, alignItems: 'start' }}>
        {/* Left Column: POS Actions & Scanning */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* STEP 1: CUSTOMER IDENTIFICATION CARD */}
          <div className="card" style={{ borderTop: '4px solid var(--color-gold-deep)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>👤</span>
                <strong style={{ fontSize: 16 }}>1. Customer Identification</strong>
              </div>
              {customer && (
                <button className="btn ghost" onClick={resetCustomerSelection} style={{ fontSize: 12, padding: '4px 10px' }}>
                  Switch Customer
                </button>
              )}
            </div>

            {/* Customer Search Bar (Phone First) */}
            {!customer && (
              <div>
                <label className="lbl" style={{ marginTop: 0 }}>Customer Phone Number *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 12, top: 11, color: 'var(--color-muted)', fontSize: 15 }}>📞 +91</span>
                    <input
                      type="tel"
                      autoFocus
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && lookupPhone()}
                      placeholder="Enter 10-digit customer mobile number"
                      style={{ paddingLeft: 64, fontSize: 15 }}
                    />
                  </div>
                  <button className="btn gold" onClick={() => lookupPhone()} style={{ minWidth: 120 }}>
                    Find Customer
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => setShowCustomerExplorer(true)}
                    title="Browse all registered customers"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Directory
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 6 }}>
                  Enter customer phone number to search existing records or register a new customer profile.
                </div>
              </div>
            )}

            {/* Multiple Matching Profiles Picker */}
            {phoneMatches.length > 0 && !customer && (
              <div style={{ marginTop: 14, background: '#FAF6F1', border: '1px solid var(--color-border)', borderRadius: 10, padding: 14 }}>
                <strong style={{ fontSize: 13, color: 'var(--color-espresso)' }}>Multiple profiles share this number — select the customer:</strong>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {phoneMatches.map((m: any) => (
                    <div
                      key={m.id}
                      onClick={() => selectCustomer(m)}
                      style={{
                        padding: 10,
                        background: '#fff',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>{m.name}</strong> <small style={{ color: 'var(--color-muted)' }}>({m.customer_code})</small>
                        <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{m.email || 'No email registered'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="badge ok">{m.summary?.bill_count || 0} bills</span>
                        <div style={{ fontSize: 12, color: 'var(--color-gold-deep)', fontWeight: 600 }}>{inr(m.summary?.total_spent_inr || 0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Customer Profile Card */}
            {customer && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #FAF6F1 0%, #FFF9F2 100%)',
                  borderRadius: 12,
                  border: '1.5px solid var(--color-gold)',
                  padding: 16,
                  marginTop: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'var(--color-gold-deep)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 18,
                      }}
                    >
                      {customer.name?.charAt(0) || 'C'}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-espresso)' }}>
                          {customer.name}
                        </span>
                        <span className="chip" style={{ margin: 0, padding: '2px 8px', fontSize: 11, background: '#EAE2D8' }}>
                          {customer.customer_code}
                        </span>
                        {(customer.summary?.bill_count > 1 || customer.purchase_count > 1) && (
                          <span className="badge ok" style={{ fontSize: 11 }}>Repeat Customer</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>
                        📞 {customer.phone} {customer.email ? `• ✉️ ${customer.email}` : ''}
                      </div>
                    </div>
                  </div>

                  <span className="badge ok" style={{ padding: '4px 10px' }}>Active Profile</span>
                </div>

                {/* Occasions & Milestones */}
                {(customer.birthday || customer.anniversary) && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12 }}>
                    {customer.birthday && (
                      <span className="chip" style={{ background: '#FFF0F5' }}>
                        🎂 Birthday: <strong>{customer.birthday}</strong>
                      </span>
                    )}
                    {customer.anniversary && (
                      <span className="chip" style={{ background: '#FFF8E6' }}>
                        💍 Anniversary: <strong>{customer.anniversary}</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Lifetime Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                    marginTop: 12,
                    background: '#fff',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>TOTAL VISITS</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {customer.summary?.bill_count || customer.purchase_count || customer.purchases?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>LIFETIME SPEND</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-gold-deep)' }}>
                      {inr(customer.summary?.total_spent_inr || customer.total_spent_inr || 0)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>LAST VISIT</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {customer.summary?.last_purchase_at?.slice(0, 10) || 'Today'}
                    </div>
                  </div>
                </div>

                {/* Past Bills Drawer Trigger */}
                {customer.purchases && customer.purchases.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="btn ghost"
                      onClick={() => setShowPastBills(!showPastBills)}
                      style={{ width: '100%', fontSize: 12, padding: '6px 12px', display: 'flex', justifyContent: 'space-between' }}
                    >
                      <span>📜 View Past Invoices ({customer.purchases.length})</span>
                      <span>{showPastBills ? '▲ Hide' : '▼ Show'}</span>
                    </button>

                    {showPastBills && (
                      <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto', background: '#fff', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                        <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#FAF6F1' }}>
                              <th>Invoice</th>
                              <th>Date</th>
                              <th>Amount</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customer.purchases.map((p: any) => (
                              <tr key={p.id}>
                                <td><strong>{p.invoice_no}</strong></td>
                                <td>{p.sold_at?.slice(0, 10) || p.created_at?.slice(0, 10)}</td>
                                <td style={{ fontWeight: 600 }}>{inr(p.total_inr)}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                    <button
                                      className="btn ghost"
                                      onClick={() => setPreviewSaleId(p.id)}
                                      style={{ padding: '2px 8px', fontSize: 11 }}
                                    >
                                      👁️ View
                                    </button>
                                    <button
                                      className="btn ghost"
                                      onClick={() => handleDownloadInvoice(p)}
                                      disabled={downloadingSaleId === p.id}
                                      style={{ padding: '2px 8px', fontSize: 11 }}
                                    >
                                      {downloadingSaleId === p.id ? '...' : '📥 PDF'}
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
            )}

            {/* NOT FOUND: REGISTRATION FORM */}
            {isCustomerNotFound && !customer && (
              <div
                style={{
                  marginTop: 14,
                  background: 'linear-gradient(180deg, #FAF6F1 0%, #FFFFFF 100%)',
                  border: '1.5px solid var(--color-gold)',
                  borderRadius: 12,
                  padding: 18,
                  boxShadow: '0 4px 12px rgba(196,154,82,0.1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="badge warn">Not Found</span>
                    <strong style={{ fontSize: 15, color: 'var(--color-espresso)' }}>
                      Register New Customer Profile
                    </strong>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>* Mandatory fields</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  {/* Name */}
                  <div>
                    <label className="lbl">Full Customer Name *</label>
                    <input
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                      placeholder="e.g. Radhika Sethi"
                    />
                    {customerFormErrors.name && (
                      <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.name}</div>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="lbl">Mobile Phone Number *</label>
                    <input
                      type="tel"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      placeholder="10-digit mobile number"
                    />
                    {customerFormErrors.phone && (
                      <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.phone}</div>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="lbl">Email Address *</label>
                    <input
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                      placeholder="e.g. radhika@example.com"
                    />
                    {customerFormErrors.email && (
                      <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.email}</div>
                    )}
                  </div>

                  {/* Birthday (Optional) */}
                  <div>
                    <label className="lbl">Date of Birth (Optional)</label>
                    <input
                      type="date"
                      value={customerForm.birthday}
                      onChange={(e) => setCustomerForm({ ...customerForm, birthday: e.target.value })}
                    />
                  </div>

                  {/* Anniversary Date (Optional) */}
                  <div>
                    <label className="lbl">Anniversary Date (Optional)</label>
                    <input
                      type="date"
                      value={customerForm.anniversary}
                      onChange={(e) => setCustomerForm({ ...customerForm, anniversary: e.target.value })}
                    />
                  </div>

                  {/* Marketing Consent */}
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 26 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={customerForm.marketing_consent}
                        onChange={(e) => setCustomerForm({ ...customerForm, marketing_consent: e.target.checked })}
                      />
                      <span>Opt-in for WhatsApp &amp; SMS digital invoices</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 18, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                  <button
                    className="btn gold"
                    onClick={handleSaveCustomerOnly}
                    disabled={isSavingCustomer}
                    style={{ padding: '10px 18px', fontWeight: 600 }}
                  >
                    {isSavingCustomer ? 'Saving...' : '✓ Save Customer Profile Only'}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    OR simply scan pieces below — customer and bill will be saved together!
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: ADD JEWELLERY PIECES (BARCODE SCANNING & AUTO-FILL) */}
          <div className="card" style={{ borderTop: '4px solid var(--color-gold-deep)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🏷️</span>
                <strong style={{ fontSize: 16 }}>2. Add Jewellery Pieces</strong>
              </div>
              <span className="badge ok" style={{ fontSize: 12 }}>
                {lines.length} piece{lines.length === 1 ? '' : 's'} added • {totalNetGoldWeight.toFixed(3)}g net
              </span>
            </div>
            <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: '0 0 14px' }}>
              Scan the piece barcode tag or type the SKU code to automatically calculate net weight, live gold rate, and making charges.
            </p>

            {/* Barcode Input Console */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-muted)', fontSize: 16 }}>🔍</span>
                <input
                  ref={barcodeInputRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addBarcode(barcode)}
                  placeholder="Scan jewellery barcode tag or enter SKU (e.g. RNG-001) and press Enter"
                  style={{ paddingLeft: 38, fontSize: 14 }}
                />
              </div>
              <button className="btn gold" onClick={() => addBarcode(barcode)} style={{ minWidth: 110 }}>
                + Add Piece
              </button>
              <button className="btn ghost" onClick={() => setScanning(true)} title="Scan with camera" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📷</span>
                <span>Camera</span>
              </button>
            </div>

            {/* Pieces Table */}
            <div style={{ marginTop: 16 }}>
              {lines.length === 0 ? (
                <div
                  className="empty"
                  style={{
                    padding: '36px 16px',
                    border: '1.5px dashed var(--color-border)',
                    borderRadius: 10,
                    background: '#FAF6F1',
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 6 }}>💍</div>
                  <strong style={{ fontSize: 15, color: 'var(--color-espresso)' }}>No jewellery pieces added yet</strong>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
                    Ready to scan. Use a handheld barcode scanner, camera, or type the item code above.
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                  <table className="tbl" style={{ width: '100%', margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#FAF6F1' }}>
                        <th>Item &amp; SKU</th>
                        <th>Purity</th>
                        <th>Net Wt (g)</th>
                        <th>Gold Rate</th>
                        <th>Gold Value</th>
                        <th>Making Charges</th>
                        <th style={{ textAlign: 'right' }}>Line Total</th>
                        <th style={{ width: 44, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.product_id}>
                          <td>
                            <strong>{l.name}</strong>
                            <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>SKU: {l.sku}</div>
                          </td>
                          <td>
                            <span className="chip" style={{ margin: 0, padding: '2px 8px', fontSize: 11, background: '#FFF9F2', border: '1px solid var(--color-gold)' }}>
                              {l.purity}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{Number(l.net_gold_weight_g || 0).toFixed(3)}g</td>
                          <td>{inr(l.est?.rate_24k_per_g_inr || rate24k)}/g</td>
                          <td>{inr(l.est?.gold_value_inr || 0)}</td>
                          <td>{inr(l.est?.making_charge_inr || 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-espresso)' }}>
                            {inr(l.est?.line_total_inr || 0)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn ghost"
                              onClick={() => removeLine(l.product_id)}
                              style={{ padding: '3px 8px', color: 'var(--color-error)', borderRadius: 6 }}
                              title="Remove item"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#FAF6F1', fontWeight: 700, borderTop: '2px solid var(--color-border)' }}>
                        <td colSpan={2}>Total ({lines.length} pieces)</td>
                        <td>{totalNetGoldWeight.toFixed(3)}g</td>
                        <td>—</td>
                        <td>{inr(lines.reduce((s, l) => s + (l.est?.gold_value_inr || 0), 0))}</td>
                        <td>{inr(lines.reduce((s, l) => s + (l.est?.making_charge_inr || 0), 0))}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-gold-deep)', fontSize: 15 }}>
                          {inr(baseTotal)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Financial Breakdown, Discounts & Editable Final Price */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* STEP 3: FINANCIAL SUMMARY & EDITABLE PRICE */}
          <div className="card" style={{ borderTop: '4px solid var(--color-gold-deep)', position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>💳</span>
              <strong style={{ fontSize: 16 }}>3. Pricing &amp; Final Payment</strong>
            </div>

            {/* Bill Subtotal Breakdown */}
            <div style={{ background: '#FAF6F1', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: 'var(--color-muted)' }}>Gross Items Subtotal:</span>
                <span>{inr(subtotalBeforeTax)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: 'var(--color-muted)' }}>Applicable GST (3%):</span>
                <span>{inr(totalTax)}</span>
              </div>
              <hr style={{ borderColor: 'var(--color-border)', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 600, fontSize: 14 }}>
                <span>Base Price:</span>
                <span>{inr(baseTotal)}</span>
              </div>
            </div>

            {/* Discounts Section */}
            <div
              style={{
                background: '#FFF9F2',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 13, color: 'var(--color-espresso)' }}>
                  Discounts Applied? (How much?)
                </strong>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className={`btn ${discountType === 'flat' ? 'gold' : 'ghost'}`}
                    onClick={() => setDiscountType('flat')}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    Flat ₹
                  </button>
                  <button
                    className={`btn ${discountType === 'percent' ? 'gold' : 'ghost'}`}
                    onClick={() => setDiscountType('percent')}
                    style={{ padding: '2px 8px', fontSize: 11 }}
                  >
                    Percent %
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={discountInput}
                  onChange={(e) => {
                    setDiscountInput(e.target.value);
                    setIsFinalPriceManuallyEdited(false);
                  }}
                  placeholder={discountType === 'percent' ? 'e.g. 5%' : 'e.g. ₹1000'}
                  style={{ fontSize: 14 }}
                />
              </div>

              {/* Preset Quick Chips */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {discountType === 'flat' ? (
                  ['500', '1000', '2000', '5000'].map((amt) => (
                    <button
                      key={amt}
                      className="preset-chip"
                      onClick={() => {
                        setDiscountInput(amt);
                        setIsFinalPriceManuallyEdited(false);
                      }}
                    >
                      ₹{Number(amt).toLocaleString('en-IN')}
                    </button>
                  ))
                ) : (
                  ['1', '2', '3', '5'].map((pct) => (
                    <button
                      key={pct}
                      className="preset-chip"
                      onClick={() => {
                        setDiscountInput(pct);
                        setIsFinalPriceManuallyEdited(false);
                      }}
                    >
                      {pct}%
                    </button>
                  ))
                )}
                {discountInput && (
                  <button
                    className="preset-chip"
                    onClick={() => {
                      setDiscountInput('');
                      setIsFinalPriceManuallyEdited(false);
                    }}
                    style={{ color: 'var(--color-error)' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8, color: 'var(--color-muted)' }}>
                <span>Calculated Price after discount:</span>
                <strong style={{ color: 'var(--color-espresso)' }}>{inr(calculatedReducedPrice)}</strong>
              </div>
            </div>

            {/* HERO EDITABLE FINAL PRICE BOX */}
            <div
              style={{
                background: '#FAF6F1',
                border: isFinalPriceManuallyEdited ? '2px solid var(--color-rose)' : '2px solid var(--color-gold)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: '0 2px 8px rgba(196,154,82,0.12)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <strong style={{ fontSize: 14, color: 'var(--color-gold-deep)' }}>
                    FINAL AGREED PRICE (EDITABLE) *
                  </strong>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    Staff can adjust or round off the final price directly
                  </div>
                </div>
                {isFinalPriceManuallyEdited && (
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setIsFinalPriceManuallyEdited(false);
                      setFinalPriceInput(String(calculatedReducedPrice));
                    }}
                    style={{ padding: '3px 8px', fontSize: 11 }}
                  >
                    ↺ Reset
                  </button>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: 8,
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--color-gold-deep)',
                  }}
                >
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={finalPriceInput}
                  onChange={(e) => {
                    setFinalPriceInput(e.target.value);
                    setIsFinalPriceManuallyEdited(true);
                  }}
                  placeholder="Final Price"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    paddingLeft: 32,
                    color: 'var(--color-espresso)',
                    borderRadius: 8,
                  }}
                />
              </div>

              {isFinalPriceManuallyEdited && (
                <div style={{ marginTop: 8, padding: '6px 10px', background: '#FFF0F5', borderRadius: 6, fontSize: 12, color: 'var(--color-rose)', fontWeight: 500 }}>
                  ✏️ Price manually overridden. Total effective discount: <strong>{inr(totalEffectiveDiscount)}</strong>.
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div style={{ marginBottom: 18 }}>
              <label className="lbl" style={{ marginTop: 0 }}>Payment Method</label>
              <div className="pay-pill-grid">
                {[
                  { id: 'upi', label: 'UPI / QR', icon: '📱' },
                  { id: 'cash', label: 'Cash', icon: '💵' },
                  { id: 'card', label: 'Card / POS', icon: '💳' },
                  { id: 'bank_transfer', label: 'Bank Transfer', icon: '🏦' },
                ].map((m) => (
                  <div
                    key={m.id}
                    className={`pay-pill ${payMethod === m.id ? 'selected' : ''}`}
                    onClick={() => setPayMethod(m.id as any)}
                  >
                    <span style={{ fontSize: 16 }}>{m.icon}</span>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Final Action Button */}
            <button
              className="btn gold"
              onClick={handleFinalizeBill}
              disabled={isFinalizing || lines.length === 0}
              style={{
                width: '100%',
                padding: '14px 20px',
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 10,
                boxShadow: lines.length > 0 ? '0 4px 14px rgba(138,100,40,0.3)' : 'none',
              }}
            >
              {isFinalizing ? (
                'Finalizing & Generating Invoice...'
              ) : (
                <>
                  <span>💾 Finalize Sale &amp; Issue Invoice</span>
                  <span>({inr(effectiveFinalPrice)})</span>
                </>
              )}
            </button>
          </div>

          {/* Recent Invoices Feed */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>Recent Store Invoices</strong>
              <button className="btn ghost" onClick={() => history.refetch()} style={{ padding: '2px 8px', fontSize: 11 }}>
                ↻ Refresh
              </button>
            </div>

            {history.isLoading ? (
              <div className="empty" style={{ padding: 18 }}>Loading recent bills...</div>
            ) : !history.data?.data?.length ? (
              <div className="empty" style={{ padding: 18 }}>No finalized sales yet.</div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table className="tbl" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Total</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history.data.data || []).map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.invoice_no}</strong>
                          <div style={{ fontSize: 10, color: 'var(--color-muted)' }}>{s.sold_at?.slice(0, 10)}</div>
                        </td>
                        <td>{s.customer_name || 'Walk-in'}</td>
                        <td style={{ fontWeight: 600, color: 'var(--color-gold-deep)' }}>
                          {inr(s.total_inr)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn ghost"
                              onClick={() => setPreviewSaleId(s.id)}
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              title="View tax invoice"
                            >
                              👁️
                            </button>
                            <button
                              className="btn ghost"
                              onClick={() => handleDownloadInvoice(s)}
                              disabled={downloadingSaleId === s.id}
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              title="Download PDF"
                            >
                              📥
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
        </div>
      </div>

      {/* Camera Barcode Scanner Modal */}
      {scanning && (
        <ScannerModal
          onDetect={(val) => {
            addBarcode(val);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {/* Full Tax Invoice Preview & Print Modal */}
      {previewSaleId && (
        <InvoiceModal
          saleId={previewSaleId}
          onClose={() => setPreviewSaleId(null)}
        />
      )}

      {/* Customer Directory & Bill History Modal */}
      {showCustomerExplorer && (
        <CustomerExplorerModal
          onSelectCustomer={(c) => {
            selectCustomer(c);
            setMsg({ text: `Selected customer ${c.name} (${c.customer_code}).`, type: 'success' });
          }}
          onClose={() => setShowCustomerExplorer(false)}
        />
      )}
    </div>
  );
}
