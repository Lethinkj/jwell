import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../../lib/api';
import ScannerModal from '../../components/ScannerModal';
import ManualPieceModal from '../../components/ManualPieceModal';
import InvoiceModal from '../../components/InvoiceModal';
import CustomerExplorerModal from '../../components/CustomerExplorerModal';
import { downloadInvoicePdf } from '../../lib/invoicePdf';

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  birthday: string;
  anniversary: string;
  marketing_consent: boolean;
}

const emptyCustomerForm: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address_line1: '',
  city: '',
  state: '',
  postal_code: '',
  birthday: '',
  anniversary: '',
  marketing_consent: true,
};

interface BillingProps {
  mode?: 'new' | 'history';
}

export default function Billing({ mode = 'new' }: BillingProps) {
  const navigate = useNavigate();

  // Mode: 'new' = Create New Bill, 'history' = Store Billing History
  const isHistory = mode === 'history';

  // Step-by-step Wizard State: 1 = Customer, 2 = Scan/Add Pieces, 3 = Pricing & Payment
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Customer Type Choice ('existing' vs 'new')
  const [customerType, setCustomerType] = useState<'existing' | 'new'>('existing');
  const [searchPhone, setSearchPhone] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [phoneMatches, setPhoneMatches] = useState<any[]>([]);
  const [isCustomerNotFound, setIsCustomerNotFound] = useState(false);
  const [showPastBills, setShowPastBills] = useState(false);

  // New Customer Form State (All mandatory except anniversary)
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm);
  const [customerFormErrors, setCustomerFormErrors] = useState<Record<string, string>>({});

  // Step 2: Barcode / Products / Manual Entry
  const [barcode, setBarcode] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showManualPieceModal, setShowManualPieceModal] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Gold Rate Query (for live estimates and manual piece fallback)
  const rateQuery = useQuery({
    queryKey: ['gold-rates-current'],
    queryFn: () => api.get('/gold-rates/current'),
  });
  const current24kRate = rateQuery.data?.data?.rate_24k_per_g_inr || 8000;

  // Step 3: Discounts & Final Price Editing
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [discountInput, setDiscountInput] = useState<string>('');
  const [finalPriceInput, setFinalPriceInput] = useState<string>('');
  const [isFinalPriceManuallyEdited, setIsFinalPriceManuallyEdited] = useState(false);
  const [payMethod, setPayMethod] = useState<'upi' | 'cash' | 'card' | 'bank_transfer'>('upi');

  // Modals & Invoices
  const [msg, setMsg] = useState<{ text: string; type?: 'info' | 'error' | 'success' } | null>(null);
  const [bill, setBill] = useState<any>(null);
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [showCustomerExplorer, setShowCustomerExplorer] = useState(false);
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Billing History Filters & Query
  const [historySearch, setHistorySearch] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(10);
  const historyQuery = useQuery({
    queryKey: ['billing-history', historySearch, historyFrom, historyTo, historyPage, historyLimit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (historySearch) params.set('q', historySearch);
      if (historyFrom) params.set('from', historyFrom);
      if (historyTo) params.set('to', historyTo);
      params.set('page', String(historyPage));
      params.set('limit', String(historyLimit));
      return api.get(`/sales?${params.toString()}`);
    },
  });
  const historyTotal = historyQuery.data?.total ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / historyLimit));
  const historyPageNumbers: (number | '...')[] = (() => {
    const total = historyTotalPages;
    const cur = historyPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    pages.push(total);
    return pages;
  })();

  // Calculate Base Line Totals
  const totalNetGoldWeight = lines.reduce((s, l) => s + (l.net_gold_weight_g || 0), 0);
  const subtotalBeforeTax = lines.reduce((s, l) => s + (l.est?.subtotal_inr || 0), 0);
  const totalTax = lines.reduce((s, l) => s + (l.est?.tax_inr || 0), 0);
  const baseTotal = lines.reduce((s, l) => s + (l.est?.line_total_inr || 0), 0);

  // Calculate Discount Amount (Discount is optional)
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

  // Auto-focus barcode input when on Step 2
  useEffect(() => {
    if (currentStep === 2 && !scanning && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [currentStep, scanning]);

  // Select Customer & Advance to Step 2 with auto-opened scanner
  const handleCustomerSelectedAndProceed = (cust: any) => {
    setCustomer(cust);
    setPhoneMatches([]);
    setIsCustomerNotFound(false);
    setSearchPhone(cust.phone || '');
    // Automatically transition to Step 2 and auto-open camera scanner
    setCurrentStep(2);
    setScanning(true);
    setMsg({
      text: `Customer ${cust.name} linked. Scanner opened automatically to scan jewellery tag.`,
      type: 'success',
    });
  };

  // Search Customer by Phone (Existing Customer)
  const lookupPhone = async (overridePhone?: string) => {
    const p = (overridePhone !== undefined ? overridePhone : searchPhone).trim();
    if (!p) {
      setMsg({ text: 'Please enter a phone number to search.', type: 'error' });
      return;
    }
    setMsg(null);
    setPhoneMatches([]);
    setIsCustomerNotFound(false);
    setShowPastBills(false);

    try {
      const res = await api.get(`/customers/phone/${encodeURIComponent(p)}`);
      const data = res.data || [];
      if (!data.length) {
        setIsCustomerNotFound(true);
        setCustomerForm({ ...emptyCustomerForm, phone: p });
        setCustomerFormErrors({});
        setMsg({ text: `No customer found for mobile "${p}". You can register them as a new customer.`, type: 'info' });
      } else if (data.length === 1) {
        handleCustomerSelectedAndProceed(data[0]);
      } else {
        setPhoneMatches(data);
        setMsg({ text: `Multiple customer profiles found on this phone number. Please choose the correct one.`, type: 'info' });
      }
    } catch (e: any) {
      setMsg({ text: e.message || 'Error searching customer.', type: 'error' });
    }
  };

  const resetCustomerSelection = () => {
    setCustomer(null);
    setPhoneMatches([]);
    setIsCustomerNotFound(false);
    setSearchPhone('');
    setShowPastBills(false);
    setCustomerForm(emptyCustomerForm);
    setCustomerFormErrors({});
    setCurrentStep(1);
  };

  // Validate Customer Form: All mandatory EXCEPT anniversary
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
    if (!customerForm.birthday) {
      errors.birthday = 'Date of birth is mandatory.';
    }
    if (!customerForm.address_line1.trim()) {
      errors.address_line1 = 'Street address is mandatory.';
    }
    if (!customerForm.city.trim()) {
      errors.city = 'City is mandatory.';
    }
    if (!customerForm.state.trim()) {
      errors.state = 'State is mandatory.';
    }
    if (!customerForm.postal_code.trim()) {
      errors.postal_code = 'PIN code is mandatory.';
    }
    // Anniversary is optional

    setCustomerFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Customer Profile & Advance to Step 2 with auto-opened scanner
  const handleSaveCustomerAndProceed = async () => {
    if (!validateCustomerForm()) {
      setMsg({ text: 'Please fill in all mandatory fields (Full Name, Phone Number, Email, Address, PIN code, Birthday).', type: 'error' });
      return;
    }
    setIsSavingCustomer(true);
    setMsg(null);
    try {
      const res = await api.post('/customers', {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim(),
        email: customerForm.email.trim(),
        address_line1: customerForm.address_line1.trim(),
        city: customerForm.city.trim(),
        state: customerForm.state.trim(),
        postal_code: customerForm.postal_code.trim(),
        birthday: customerForm.birthday || null,
        anniversary: customerForm.anniversary || null,
        marketing_consent: customerForm.marketing_consent,
      });
      handleCustomerSelectedAndProceed(res.data);
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to register customer.', type: 'error' });
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

    if (!customer) {
      setMsg({ text: 'Please search and select or register a customer first.', type: 'error' });
      setCurrentStep(1);
      return;
    }

    if (!lines.length) {
      setMsg({ text: 'Please scan or add at least one jewellery piece before finalizing.', type: 'error' });
      setCurrentStep(2);
      return;
    }

    const priceToCharge = Math.max(0, Math.round(effectiveFinalPrice * 100) / 100);

    try {
      setIsFinalizing(true);
      // 1. Create Draft Sale (handles both catalog products and manual items)
      const draft = await api.post('/sales/draft', {
        customer_id: customer.id,
        lines: lines.map((l) => ({
          product_id: l.product_id?.startsWith('man_') ? undefined : l.product_id,
          sku: l.sku,
          manual_item: l.manual_item || undefined,
        })),
      });

      // 2. Finalize Sale with Custom Final Price & Payments
      const finalized = await api.post(`/sales/${draft.data.id}/finalize`, {
        lines: lines.map((l) => ({ product_id: l.product_id })),
        custom_final_price_inr: priceToCharge,
        discount_inr: totalEffectiveDiscount,
        payments: [{ method: payMethod, amount_inr: priceToCharge }],
      });

      setBill(finalized.data);
      historyQuery.refetch();
      setMsg({
        text: `Sale finalized! Invoice ${finalized.data.invoice_no} issued for ${inr(finalized.data.total_inr)}.`,
        type: 'success',
      });
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
    setCustomerType('existing');
    setCurrentStep(1);
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

  return (
    <div className="page" style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* Top Header Bar: Clean Page Title & Context */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          padding: '16px 22px',
          background: '#FFFFFF',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(71,16,29,0.05)',
        }}
      >
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: 0, fontSize: 26, color: 'var(--color-espresso)' }}>
            {isHistory ? 'Billing History' : 'New Bill'}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>
            {isHistory
              ? 'Browse all past store invoices, search by customer mobile or invoice number, view details and download PDF invoices.'
              : 'Point of sale counter: customer search & registration, jewellery piece scanning, live rate pricing & tax invoice generation.'}
          </div>
        </div>

        {isHistory && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn ghost" onClick={() => historyQuery.refetch()} style={{ fontSize: 13 }}>
              ↻ Refresh
            </button>
          </div>
        )}
      </div>

      {/* Global Notification Banner */}
      {msg && (
        <div
          className="card"
          style={{
            marginBottom: 18,
            padding: '12px 18px',
            backgroundColor: msg.type === 'error' ? '#FDE7E5' : msg.type === 'success' ? '#E3F3EA' : '#FFFFFF',
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

      {/* ======================================================== */}
      {/* VIEW 1: CREATE NEW BILL (FOCUSED STEP-BY-STEP SCREENS)    */}
      {/* ======================================================== */}
      {!isHistory && (
        <div>
          {/* Bill Finalized Celebration Banner */}
          {bill ? (
            <div
              className="card"
              style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFFFF 100%)',
                border: '2px solid var(--color-gold)',
                borderRadius: 14,
                padding: 24,
                boxShadow: '0 8px 24px rgba(214,180,92,0.15)',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: '50%',
                      background: 'var(--color-gold)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
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
                      Customer: <strong>{bill.customer_name || customer?.name || 'Customer'}</strong>
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
                    🖨️ Print Receipt
                  </button>
                  <button className="btn" onClick={startNewBill}>
                    ➕ Create Another Bill
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* SCREEN 1: STEP 1 - CUSTOMER SELECTION & REGISTRATION */}
              {currentStep === 1 && (
                <div className="card" style={{ borderLeft: '4px solid var(--color-gold-deep)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <strong style={{ fontSize: 18, color: 'var(--color-espresso)' }}>
                        Step 1: Customer Details
                      </strong>
                      <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                        Search for an existing customer by phone number, or register a new customer profile.
                      </div>
                    </div>
                    {customer && (
                      <button className="btn ghost" onClick={resetCustomerSelection} style={{ fontSize: 12, padding: '4px 10px' }}>
                        Change Customer
                      </button>
                    )}
                  </div>

                  {/* Choose: Existing Customer vs New Customer Toggle */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div
                        onClick={() => {
                          setCustomerType('existing');
                          setIsCustomerNotFound(false);
                          setMsg(null);
                        }}
                        style={{
                          flex: 1,
                          padding: 14,
                          borderRadius: 10,
                          border: customerType === 'existing' ? '2px solid var(--color-gold-deep)' : '1px solid var(--color-border)',
                          background: customerType === 'existing' ? 'var(--color-blush)' : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 24 }}>🔍</span>
                        <div>
                          <strong style={{ fontSize: 14, color: 'var(--color-espresso)' }}>Existing Customer</strong>
                          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Search customer by mobile number</div>
                        </div>
                      </div>

                      <div
                        onClick={() => {
                          setCustomerType('new');
                          setIsCustomerNotFound(false);
                          setMsg(null);
                        }}
                        style={{
                          flex: 1,
                          padding: 14,
                          borderRadius: 10,
                          border: customerType === 'new' ? '2px solid var(--color-gold-deep)' : '1px solid var(--color-border)',
                          background: customerType === 'new' ? 'var(--color-blush)' : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 24 }}>👤</span>
                        <div>
                          <strong style={{ fontSize: 14, color: 'var(--color-espresso)' }}>New Customer</strong>
                          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>Register name, phone, email &amp; dates</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-view A: EXISTING CUSTOMER SEARCH */}
                  {customerType === 'existing' && !customer && (
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
                          Search
                        </button>
                        <button
                          className="btn ghost"
                          onClick={() => setShowCustomerExplorer(true)}
                          title="Browse all registered customers"
                        >
                          Directory
                        </button>
                      </div>

                      {isCustomerNotFound && (
                        <div style={{ marginTop: 14, padding: 14, background: '#FFF8E6', border: '1px solid var(--color-warning)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: 'var(--color-warning)' }}>
                            No customer profile found for mobile &quot;{searchPhone}&quot;. Would you like to register them as a new customer?
                          </span>
                          <button
                            className="btn gold"
                            onClick={() => {
                              setCustomerType('new');
                              setCustomerForm((prev) => ({ ...prev, phone: searchPhone }));
                            }}
                            style={{ padding: '6px 14px', fontSize: 12 }}
                          >
                            + Register New Customer
                          </button>
                        </div>
                      )}

                      {/* Multiple Phone Matches Picker */}
                      {phoneMatches.length > 0 && (
                        <div style={{ marginTop: 14, background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 10, padding: 14 }}>
                          <strong style={{ fontSize: 13, color: 'var(--color-espresso)' }}>Multiple profiles share this number — select the customer:</strong>
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {phoneMatches.map((m: any) => (
                              <div
                                key={m.id}
                                onClick={() => handleCustomerSelectedAndProceed(m)}
                                style={{
                                  padding: 12,
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
                    </div>
                  )}

                  {/* Sub-view B: NEW CUSTOMER REGISTRATION FORM */}
                  {customerType === 'new' && !customer && (
                    <div
                      style={{
                        background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 100%)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        padding: 18,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <strong style={{ fontSize: 15, color: 'var(--color-espresso)' }}>
                          New Customer Registration Form
                        </strong>
                        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>All fields are mandatory except Anniversary</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                        {/* Name */}
                        <div>
                          <label className="lbl">Full Customer Name *</label>
                          <input
                            autoFocus
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

                        {/* Street Address */}
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label className="lbl">Street Address *</label>
                          <input
                            value={customerForm.address_line1}
                            onChange={(e) => setCustomerForm({ ...customerForm, address_line1: e.target.value })}
                            placeholder="House / street / locality"
                          />
                          {customerFormErrors.address_line1 && (
                            <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.address_line1}</div>
                          )}
                        </div>

                        {/* City */}
                        <div>
                          <label className="lbl">City *</label>
                          <input
                            value={customerForm.city}
                            onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                            placeholder="e.g. Bengaluru"
                          />
                          {customerFormErrors.city && (
                            <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.city}</div>
                          )}
                        </div>

                        {/* State */}
                        <div>
                          <label className="lbl">State *</label>
                          <input
                            value={customerForm.state}
                            onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value })}
                            placeholder="e.g. Karnataka"
                          />
                          {customerFormErrors.state && (
                            <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.state}</div>
                          )}
                        </div>

                        {/* PIN code */}
                        <div>
                          <label className="lbl">PIN Code *</label>
                          <input
                            value={customerForm.postal_code}
                            onChange={(e) => setCustomerForm({ ...customerForm, postal_code: e.target.value })}
                            placeholder="e.g. 560001"
                          />
                          {customerFormErrors.postal_code && (
                            <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.postal_code}</div>
                          )}
                        </div>

                        {/* Birthday (Mandatory) */}
                        <div>
                          <label className="lbl">Date of Birth *</label>
                          <input
                            type="date"
                            value={customerForm.birthday}
                            onChange={(e) => setCustomerForm({ ...customerForm, birthday: e.target.value })}
                          />
                          {customerFormErrors.birthday && (
                            <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{customerFormErrors.birthday}</div>
                          )}
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
                          onClick={handleSaveCustomerAndProceed}
                          disabled={isSavingCustomer}
                          style={{ padding: '10px 22px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span>{isSavingCustomer ? 'Saving Profile...' : '✓ Save Customer & Open Scanner →'}</span>
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                          Saves customer profile and automatically opens the camera scanner to scan jewellery tags.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Selected Customer Profile Display in Step 1 */}
                  {customer && (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFFFF 100%)',
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
                              <span className="chip" style={{ margin: 0, padding: '2px 8px', fontSize: 11, background: '#E8DDD6' }}>
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

                        <button
                          className="btn gold"
                          onClick={() => {
                            setCurrentStep(2);
                            setScanning(true);
                          }}
                          style={{ padding: '8px 16px', fontWeight: 600 }}
                        >
                          Proceed to Scan Pieces →
                        </button>
                      </div>

                      {/* Occasions */}
                      {(customer.birthday || customer.anniversary) && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12 }}>
                          {customer.birthday && (
                            <span className="chip" style={{ background: '#F7E4E8' }}>
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

                      {/* Past Bills Drawer */}
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
                                  <tr style={{ background: '#FFFFFF' }}>
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
                </div>
              )}

              {/* SCREEN 2: STEP 2 - SCAN & ADD JEWELLERY PIECES */}
              {currentStep === 2 && (
                <div className="card" style={{ borderLeft: '4px solid var(--color-gold-deep)' }}>
                  {/* Customer Banner Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#FFFFFF',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginBottom: 16,
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>👤</span>
                      <div>
                        <strong style={{ fontSize: 14, color: 'var(--color-espresso)' }}>{customer?.name}</strong>
                        <span style={{ fontSize: 12, color: 'var(--color-muted)', marginLeft: 8 }}>
                          📞 {customer?.phone} • Code: {customer?.customer_code}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn ghost"
                      onClick={() => setCurrentStep(1)}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      ← Change Customer
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 18, color: 'var(--color-espresso)' }}>
                        Step 2: Scan Jewellery Pieces
                      </strong>
                      <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                        Scan tag barcode with camera, use barcode scanner, or click Manual Entry to add pieces.
                      </div>
                    </div>
                    <span className="badge ok" style={{ fontSize: 13, padding: '4px 12px' }}>
                      {lines.length} piece{lines.length === 1 ? '' : 's'} added • {totalNetGoldWeight.toFixed(3)}g net gold
                    </span>
                  </div>

                  {/* Actions Bar: SKU Input, Camera Scanner & Manual Entry */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                      <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-muted)', fontSize: 16 }}>🔍</span>
                      <input
                        ref={barcodeInputRef}
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addBarcode(barcode)}
                        placeholder="Scan barcode tag or type SKU (e.g. RNG-001) and press Enter"
                        style={{ paddingLeft: 38, fontSize: 14 }}
                      />
                    </div>
                    <button className="btn gold" onClick={() => addBarcode(barcode)} style={{ minWidth: 110 }}>
                      + Add Piece
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => setScanning(true)}
                      title="Scan with camera"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <span>📷</span>
                      <span>Open Camera Scanner</span>
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => setShowManualPieceModal(true)}
                      title="Add custom piece manually"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: 'var(--color-gold)' }}
                    >
                      <span>✍️</span>
                      <span>Manual Piece Entry</span>
                    </button>
                  </div>

                  {/* Pieces Table */}
                  <div style={{ marginTop: 8 }}>
                    {lines.length === 0 ? (
                      <div
                        className="empty"
                        style={{
                          padding: '48px 16px',
                          border: '1.5px dashed var(--color-border)',
                          borderRadius: 10,
                          background: '#FFFFFF',
                        }}
                      >
                        <div style={{ fontSize: 36, marginBottom: 8 }}>💍</div>
                        <strong style={{ fontSize: 16, color: 'var(--color-espresso)' }}>No jewellery pieces added yet</strong>
                        <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4, maxWidth: 440, margin: '6px auto 16px' }}>
                          Camera scanner opened automatically. You can also scan with a physical barcode gun, type SKU code above, or click Manual Entry.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                          <button className="btn gold" onClick={() => setScanning(true)}>
                            📷 Open Camera Scanner
                          </button>
                          <button className="btn ghost" onClick={() => setShowManualPieceModal(true)}>
                            ✍️ Manual Entry
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                        <table className="tbl" style={{ width: '100%', margin: 0 }}>
                          <thead>
                            <tr style={{ background: '#FFFFFF' }}>
                              <th>Item &amp; SKU</th>
                              <th>Purity</th>
                              <th>Net Wt (g)</th>
                              <th>Gold Value</th>
                              <th>Making Charges</th>
                              <th>Tax (3%)</th>
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
                                  <span className="chip" style={{ margin: 0, padding: '2px 8px', fontSize: 11, background: '#FFFFFF', border: '1px solid var(--color-gold)' }}>
                                    {l.purity}
                                  </span>
                                </td>
                                <td style={{ fontWeight: 600 }}>{Number(l.net_gold_weight_g || 0).toFixed(3)}g</td>
                                <td>{inr(l.est?.gold_value_inr || 0)}</td>
                                <td>{inr(l.est?.making_charge_inr || 0)}</td>
                                <td>{inr(l.est?.tax_inr || 0)}</td>
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
                            <tr style={{ background: '#FFFFFF', fontWeight: 700, borderTop: '2px solid var(--color-border)' }}>
                              <td colSpan={2}>Total ({lines.length} pieces)</td>
                              <td>{totalNetGoldWeight.toFixed(3)}g</td>
                              <td>{inr(lines.reduce((s, l) => s + (l.est?.gold_value_inr || 0), 0))}</td>
                              <td>{inr(lines.reduce((s, l) => s + (l.est?.making_charge_inr || 0), 0))}</td>
                              <td>{inr(totalTax)}</td>
                              <td style={{ textAlign: 'right', color: 'var(--color-gold-deep)', fontSize: 16 }}>
                                {inr(baseTotal)}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Step 2 Bottom Navigation */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                    <button className="btn ghost" onClick={() => setCurrentStep(1)}>
                      ← Back to Customer
                    </button>
                    <button
                      className="btn gold"
                      onClick={() => {
                        if (!lines.length) {
                          setMsg({ text: 'Please scan or add at least one jewellery piece before proceeding to pricing.', type: 'error' });
                          return;
                        }
                        setCurrentStep(3);
                      }}
                      style={{ padding: '10px 22px', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span>Proceed to Pricing &amp; Payment →</span>
                      {lines.length > 0 && <span>({inr(baseTotal)})</span>}
                    </button>
                  </div>
                </div>
              )}

              {/* SCREEN 3: STEP 3 - PRICING, DISCOUNTS & FINAL PAYMENT */}
              {currentStep === 3 && (
                <div className="card" style={{ borderLeft: '4px solid var(--color-gold-deep)' }}>
                  {/* Summary Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#FFFFFF',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginBottom: 16,
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 14, color: 'var(--color-espresso)' }}>Customer: {customer?.name}</strong>
                      <span style={{ fontSize: 12, color: 'var(--color-muted)', marginLeft: 10 }}>
                        {lines.length} piece{lines.length === 1 ? '' : 's'} • {totalNetGoldWeight.toFixed(3)}g net gold
                      </span>
                    </div>
                    <button
                      className="btn ghost"
                      onClick={() => setCurrentStep(2)}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      ← Back to Edit Items
                    </button>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <strong style={{ fontSize: 18, color: 'var(--color-espresso)' }}>
                      Step 3: Pricing, Discounts &amp; Final Payment
                    </strong>
                    <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                      Review base calculation, apply discounts (optional), adjust final agreed price (mandatory), and select payment mode.
                    </div>
                  </div>

                  {/* Price Breakdown Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 14,
                      background: '#FFFFFF',
                      padding: 14,
                      borderRadius: 10,
                      marginBottom: 16,
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--color-muted)' }}>Gross Items Subtotal:</span>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{inr(subtotalBeforeTax)}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-muted)' }}>GST Tax (3%):</span>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{inr(totalTax)}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-muted)' }}>Base Bill Total:</span>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-espresso)' }}>{inr(baseTotal)}</div>
                    </div>
                  </div>

                  {/* Discounts Section (Optional) */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ fontSize: 14, color: 'var(--color-espresso)' }}>
                        Discounts Applied? (Optional)
                      </strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className={`btn ${discountType === 'flat' ? 'gold' : 'ghost'}`}
                          onClick={() => setDiscountType('flat')}
                          style={{ padding: '3px 10px', fontSize: 12 }}
                        >
                          Flat ₹
                        </button>
                        <button
                          className={`btn ${discountType === 'percent' ? 'gold' : 'ghost'}`}
                          onClick={() => setDiscountType('percent')}
                          style={{ padding: '3px 10px', fontSize: 12 }}
                        >
                          Percent %
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={discountInput}
                        onChange={(e) => {
                          setDiscountInput(e.target.value);
                          setIsFinalPriceManuallyEdited(false);
                        }}
                        placeholder={discountType === 'percent' ? 'Enter discount % (optional, e.g. 5)' : 'Enter discount in ₹ (optional, e.g. 1000)'}
                        style={{ fontSize: 15 }}
                      />
                    </div>

                    {/* Preset Chips */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
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
                          Clear Discount
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 10, color: 'var(--color-muted)' }}>
                      <span>Calculated Price after discount:</span>
                      <strong style={{ color: 'var(--color-espresso)', fontSize: 14 }}>{inr(calculatedReducedPrice)}</strong>
                    </div>
                  </div>

                  {/* EDITABLE FINAL PRICE BOX (MANDATORY) */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: isFinalPriceManuallyEdited ? '2px solid var(--color-rose)' : '2px solid var(--color-gold)',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 18,
                      boxShadow: '0 2px 8px rgba(214,180,92,0.12)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <strong style={{ fontSize: 15, color: 'var(--color-gold-deep)' }}>
                          FINAL AGREED PRICE (EDITABLE) *
                        </strong>
                        <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                          Staff can adjust or round off the final price directly before saving
                        </div>
                      </div>
                      {isFinalPriceManuallyEdited && (
                        <button
                          className="btn ghost"
                          onClick={() => {
                            setIsFinalPriceManuallyEdited(false);
                            setFinalPriceInput(String(calculatedReducedPrice));
                          }}
                          style={{ padding: '3px 10px', fontSize: 11 }}
                        >
                          ↺ Reset to Calculated
                        </button>
                      )}
                    </div>

                    <div style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: 14,
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
                        placeholder="Final Price *"
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          paddingLeft: 36,
                          color: 'var(--color-espresso)',
                          borderRadius: 8,
                        }}
                      />
                    </div>

                    {isFinalPriceManuallyEdited && (
                      <div style={{ marginTop: 8, padding: '6px 12px', background: '#F7E4E8', borderRadius: 6, fontSize: 12, color: 'var(--color-rose)', fontWeight: 500 }}>
                        ✏️ Final price manually adjusted to {inr(effectiveFinalPrice)}. Total effective discount on bill: <strong>{inr(totalEffectiveDiscount)}</strong>.
                      </div>
                    )}
                  </div>

                  {/* Payment Method Selector (Mandatory) */}
                  <div style={{ marginBottom: 18 }}>
                    <label className="lbl" style={{ marginTop: 0 }}>Payment Method *</label>
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

                  {/* Step 3 Actions: Back and Finalize */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button className="btn ghost" onClick={() => setCurrentStep(2)} style={{ minWidth: 140 }}>
                      ← Back to Pieces
                    </button>
                    <button
                      className="btn gold"
                      onClick={handleFinalizeBill}
                      disabled={isFinalizing || lines.length === 0}
                      style={{
                        flex: 1,
                        padding: '14px 20px',
                        fontSize: 16,
                        fontWeight: 700,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 10,
                        boxShadow: lines.length > 0 ? '0 4px 14px rgba(184,154,82,0.3)' : 'none',
                      }}
                    >
                      {isFinalizing ? (
                        'Finalizing & Generating Invoice...'
                      ) : (
                        <>
                          <span>💾 Save Final Price &amp; Finalize Bill</span>
                          <span>({inr(effectiveFinalPrice)})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: VIEW BILLING HISTORY                             */}
      {/* ======================================================== */}
      {isHistory && (
        <div className="card" style={{ borderTop: '4px solid var(--color-gold-deep)' }}>
          {/* Filters Bar */}
          <div className="filters" style={{ marginBottom: 16 }}>
            <input
              placeholder="Search by invoice #, customer name, or phone..."
              value={historySearch}
              onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
              style={{ minWidth: 260 }}
            />
            <input
              type="date"
              value={historyFrom}
              onChange={(e) => { setHistoryFrom(e.target.value); setHistoryPage(1); }}
              title="From date"
            />
            <input
              type="date"
              value={historyTo}
              onChange={(e) => { setHistoryTo(e.target.value); setHistoryPage(1); }}
              title="To date"
            />
            {(historySearch || historyFrom || historyTo) && (
              <button
                className="btn ghost"
                onClick={() => {
                  setHistorySearch('');
                  setHistoryFrom('');
                  setHistoryTo('');
                  setHistoryPage(1);
                }}
                style={{ minWidth: 80, fontSize: 12 }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Full Billing History Table */}
          {historyQuery.isLoading ? (
            <div className="empty" style={{ padding: 40 }}>Loading store billing history...</div>
          ) : !historyQuery.data?.data?.length ? (
            <div className="empty" style={{ padding: 40 }}>
              No billing records found matching the filters.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 10 }}>
              <table className="tbl" style={{ width: '100%', margin: 0 }}>
                <thead>
                  <tr style={{ background: '#FFFFFF' }}>
                    <th style={{ width: 56 }}>S.No</th>
                    <th>Invoice No</th>
                    <th>Date &amp; Time</th>
                    <th>Customer Name</th>
                    <th>Phone / Code</th>
                    <th style={{ textAlign: 'right' }}>Total Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.data.map((s: any, i: number) => (
                    <tr key={s.id}>
                      <td style={{ color: 'var(--color-muted)' }}>{(historyPage - 1) * historyLimit + i + 1}</td>
                      <td>
                        <strong>{s.invoice_no}</strong>
                      </td>
                      <td>
                        {new Date(s.sold_at || s.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <strong>{s.customer_name || 'Walk-in'}</strong>
                      </td>
                      <td>
                        <div>{s.customer_phone || '—'}</div>
                        {s.customer_code && (
                          <small style={{ color: 'var(--color-muted)' }}>{s.customer_code}</small>
                        )}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--color-gold-deep)', fontSize: 15, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {inr(s.total_inr)}
                      </td>
                      <td>
                        <span className="badge ok">Finalized</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="btn ghost"
                            onClick={() => setPreviewSaleId(s.id)}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            title="View complete bill details"
                          >
                            👁️ View Bill
                          </button>
                          <button
                            className="btn ghost"
                            onClick={() => handleDownloadInvoice(s)}
                            disabled={downloadingSaleId === s.id}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            title="Download PDF invoice"
                          >
                            {downloadingSaleId === s.id ? '...' : '📥 Download Invoice'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!historyQuery.isLoading && (
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 12, marginTop: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-muted)' }}>
                <span>Show</span>
                <select
                  value={historyLimit}
                  onChange={(e) => { setHistoryLimit(Number(e.target.value)); setHistoryPage(1); }}
                  style={{ width: 'auto', padding: '6px 10px' }}
                >
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>per page</span>
                {historyTotal > 0 && (
                  <span style={{ marginLeft: 6 }}>
                    Showing {(historyPage - 1) * historyLimit + 1}–{Math.min(historyPage * historyLimit, historyTotal)} of {historyTotal} invoices
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className="btn ghost"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                  style={{ padding: '6px 12px', fontSize: 13 }}
                >
                  ‹ Prev
                </button>
                {historyPageNumbers.map((p, idx) => (
                  p === '...' ? (
                    <span key={`gap-${idx}`} style={{ padding: '0 4px', color: 'var(--color-muted)' }}>…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setHistoryPage(p)}
                      className={p === historyPage ? 'btn gold' : 'btn ghost'}
                      style={{ padding: '6px 11px', fontSize: 13, minWidth: 34 }}
                    >
                      {p}
                    </button>
                  )
                ))}
                <button
                  className="btn ghost"
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                  disabled={historyPage >= historyTotalPages}
                  style={{ padding: '6px 12px', fontSize: 13 }}
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Camera Barcode Scanner Modal with Manual Entry Option */}
      {scanning && (
        <ScannerModal
          title="Scan Jewellery Barcode Tag"
          onDetect={(val) => {
            addBarcode(val);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
          onManualEntry={() => {
            setScanning(false);
            setShowManualPieceModal(true);
          }}
        />
      )}

      {/* Manual Jewellery Piece Entry Modal */}
      {showManualPieceModal && (
        <ManualPieceModal
          defaultRate24k={current24kRate}
          onAddPiece={(piece) => {
            setLines((prev) => [...prev, piece]);
            setMsg({
              text: `Added manual piece ${piece.name} (${piece.sku}) — ${inr(piece.est?.line_total_inr || 0)}`,
              type: 'success',
            });
          }}
          onClose={() => setShowManualPieceModal(false)}
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
            handleCustomerSelectedAndProceed(c);
          }}
          onClose={() => setShowCustomerExplorer(false)}
        />
      )}
    </div>
  );
}
