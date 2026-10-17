import { jsPDF } from 'jspdf';

export interface SaleInvoiceData {
  id: string;
  invoice_no: string;
  sold_at?: string;
  created_at?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_code?: string;
  customer_address_line1?: string;
  customer_city?: string;
  customer_state?: string;
  customer_postal_code?: string;
  shop_name?: string;
  shop_settings?: string | Record<string, any>;
  subtotal_inr: number;
  discount_inr: number;
  tax_inr: number;
  total_inr: number;
  rate_24k_per_g_inr?: number;
  status?: string;
  lines?: Array<{
    id?: string;
    product_id?: string;
    sku: string;
    name: string;
    purity: string;
    net_gold_weight_g: number;
    rate_24k_per_g_inr?: number;
    gold_value_inr?: number;
    making_charge_inr?: number;
    stone_value_inr?: number;
    wastage_charge_inr?: number;
    other_charges_inr?: number;
    discount_inr?: number;
    tax_inr?: number;
    line_total_inr: number;
  }>;
  payments?: Array<{
    id?: string;
    method: string;
    amount_inr: number;
    reference?: string;
    paid_at?: string;
  }>;
}

export function formatInrCurrency(amount: number | string | undefined | null): string {
  const num = Number(amount || 0);
  return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function downloadInvoicePdf(sale: SaleInvoiceData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  let y = margin;

  // Header background bar
  doc.setFillColor(71, 16, 29); // #47101D espresso
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');

  // Shop Name & Subtitle
  const shopName = sale.shop_name || 'AURUM LUXE JEWELLERS';
  doc.setTextColor(255, 249, 242);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(shopName.toUpperCase(), margin + 6, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 205, 185);
  doc.text('Certified BIS Hallmarked Gold & Fine Diamond Jewellery', margin + 6, y + 16);

  // TAX INVOICE tag on top right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(214, 180, 92); // Gold tone
  doc.text('TAX INVOICE', pageWidth - margin - 6, y + 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('ORIGINAL FOR RECIPIENT', pageWidth - margin - 6, y + 16, { align: 'right' });

  y += 28;

  // Invoice & Customer Info Box
  doc.setDrawColor(232, 221, 214);
  doc.setFillColor(252, 250, 248);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 34, 2, 2, 'FD');

  // Left side: Invoice details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 16, 29);
  doc.text('INVOICE DETAILS', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 95, 90);
  doc.text('Invoice No:', margin + 4, y + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 16, 29);
  doc.text(sale.invoice_no || 'DRAFT', margin + 28, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 95, 90);
  doc.text('Date & Time:', margin + 4, y + 18);
  doc.setTextColor(71, 16, 29);
  const dateStr = sale.sold_at || sale.created_at || new Date().toISOString();
  doc.text(new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }), margin + 28, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 95, 90);
  doc.text('Rate Snapshot:', margin + 4, y + 24);
  doc.setTextColor(71, 16, 29);
  doc.text(sale.rate_24k_per_g_inr ? `Rs. ${sale.rate_24k_per_g_inr}/g (24K)` : 'Standard Rate', margin + 28, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 95, 90);
  doc.text('Payment Status:', margin + 4, y + 30);
  doc.setTextColor(38, 115, 77); // Green
  doc.setFont('helvetica', 'bold');
  doc.text('PAID', margin + 28, y + 30);

  // Right side: Customer details
  const rightX = margin + (pageWidth - margin * 2) / 2 + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 16, 29);
  doc.text('BILLED TO / CUSTOMER', rightX, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 95, 90);
  doc.text('Name:', rightX, y + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 16, 29);
  doc.text(sale.customer_name || 'Walk-in Customer', rightX + 16, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 95, 90);
  doc.text('Phone:', rightX, y + 18);
  doc.setTextColor(71, 16, 29);
  doc.text(sale.customer_phone || '—', rightX + 16, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 95, 90);
  doc.text('Email:', rightX, y + 24);
  doc.setTextColor(71, 16, 29);
  doc.text(sale.customer_email || '—', rightX + 16, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 95, 90);
  doc.text('Code:', rightX, y + 30);
  doc.setTextColor(71, 16, 29);
  doc.text(sale.customer_code || '—', rightX + 16, y + 30);

  y += 39;

  // Items Table Header
  const colWidths = {
    idx: 10,
    desc: 52,
    purity: 18,
    wt: 20,
    rate: 22,
    making: 22,
    total: 38,
  };

  doc.setFillColor(251, 243, 237); // #F4ECE3
  doc.rect(margin, y, pageWidth - margin * 2, 7.5, 'F');
  doc.setDrawColor(232, 221, 214);
  doc.line(margin, y + 7.5, pageWidth - margin, y + 7.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 65, 55);

  let curX = margin + 2;
  doc.text('#', curX, y + 5);
  curX += colWidths.idx;
  doc.text('ITEM DESCRIPTION / SKU', curX, y + 5);
  curX += colWidths.desc;
  doc.text('PURITY', curX, y + 5);
  curX += colWidths.purity;
  doc.text('NET WT', curX, y + 5);
  curX += colWidths.wt;
  doc.text('RATE/G', curX, y + 5);
  curX += colWidths.rate;
  doc.text('MAKING (RS)', curX, y + 5);
  curX += colWidths.making;
  doc.text('LINE TOTAL (RS)', pageWidth - margin - 2, y + 5, { align: 'right' });

  y += 8;

  // Line items
  const lines = sale.lines || [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  lines.forEach((l, index) => {
    // Check if we need page break
    if (y > pageHeight - 55) {
      doc.addPage();
      y = margin;
    }

    if (index % 2 === 1) {
      doc.setFillColor(253, 251, 249);
      doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    }

    curX = margin + 2;
    doc.setTextColor(110, 100, 95);
    doc.text(String(index + 1), curX, y + 4.8);

    curX += colWidths.idx;
    doc.setTextColor(45, 35, 30);
    doc.setFont('helvetica', 'bold');
    const itemName = `${l.name} (${l.sku})`.slice(0, 32);
    doc.text(itemName, curX, y + 4.8);
    doc.setFont('helvetica', 'normal');

    curX += colWidths.desc;
    doc.text(l.purity || '22K', curX, y + 4.8);

    curX += colWidths.purity;
    doc.text(`${Number(l.net_gold_weight_g || 0).toFixed(3)}g`, curX, y + 4.8);

    curX += colWidths.wt;
    doc.text(`Rs. ${Math.round(l.rate_24k_per_g_inr || sale.rate_24k_per_g_inr || 0)}`, curX, y + 4.8);

    curX += colWidths.rate;
    doc.text(`Rs. ${Number(l.making_charge_inr || 0).toLocaleString('en-IN')}`, curX, y + 4.8);

    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${Number(l.line_total_inr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 2, y + 4.8, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    y += 7;
  });

  doc.setDrawColor(232, 221, 214);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Calculation & Summary block (Right aligned)
  const summaryWidth = 84;
  const summaryX = pageWidth - margin - summaryWidth;

  // Left note on bottom: Payment details
  const payX = margin + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 16, 29);
  doc.text('PAYMENT DETAILS', payX, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 95, 90);
  const payments = sale.payments || [];
  if (payments.length) {
    payments.forEach((p, pi) => {
      doc.text(`Method: ${p.method.toUpperCase()}   Amount: ${formatInrCurrency(p.amount_inr)}`, payX, y + 10 + pi * 5);
      if (p.reference) {
        doc.text(`Ref: ${p.reference}`, payX, y + 15 + pi * 5);
      }
    });
  } else {
    doc.text('Payment captured in full.', payX, y + 10);
  }

  // Right summary table
  doc.setFillColor(252, 250, 248);
  doc.roundedRect(summaryX, y, summaryWidth, 34, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 95, 90);

  doc.text('Items Subtotal:', summaryX + 4, y + 6);
  doc.text(formatInrCurrency(sale.subtotal_inr), summaryX + summaryWidth - 4, y + 6, { align: 'right' });

  if (sale.discount_inr > 0) {
    doc.setTextColor(180, 35, 24); // Red
    doc.text('Discount Applied:', summaryX + 4, y + 12);
    doc.text(`- ${formatInrCurrency(sale.discount_inr)}`, summaryX + summaryWidth - 4, y + 12, { align: 'right' });
    doc.setTextColor(100, 95, 90);
  } else {
    doc.text('Discount Applied:', summaryX + 4, y + 12);
    doc.text('Rs. 0.00', summaryX + summaryWidth - 4, y + 12, { align: 'right' });
  }

  doc.text('GST (3%):', summaryX + 4, y + 18);
  doc.text(formatInrCurrency(sale.tax_inr), summaryX + summaryWidth - 4, y + 18, { align: 'right' });

  // Final Total Highlight Bar
  doc.setFillColor(71, 16, 29);
  doc.roundedRect(summaryX, y + 22, summaryWidth, 12, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FINAL PRICE:', summaryX + 4, y + 30);
  doc.setTextColor(214, 180, 92); // Gold
  doc.text(formatInrCurrency(sale.total_inr), summaryX + summaryWidth - 4, y + 30, { align: 'right' });

  y += 42;

  // Terms and Footer
  doc.setDrawColor(232, 221, 214);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(130, 120, 115);
  doc.text('Terms & Conditions:', margin, y);
  doc.text('1. Gold jewellery is 100% certified BIS hallmarked. Certified weights & purity guaranteed.', margin, y + 4);
  doc.text('2. Please retain this original tax invoice for lifetime exchange and guarantee services.', margin, y + 8);
  doc.text('3. Goods once sold can be exchanged as per store policy within 7 days in original condition.', margin, y + 12);

  // Authorized Signatory
  const sigX = pageWidth - margin - 50;
  doc.text('For ' + (sale.shop_name || 'AURUM LUXE JEWELLERS'), sigX, y + 4);
  doc.line(sigX, y + 15, sigX + 45, y + 15);
  doc.text('Authorized Signatory', sigX + 6, y + 19);

  // Bottom computer generated note
  doc.setFontSize(7);
  doc.setTextColor(160, 150, 145);
  doc.text('This is a computer generated invoice and requires no physical signature.', pageWidth / 2, pageHeight - 8, { align: 'center' });

  // Save the PDF file
  const fileName = `Invoice-${sale.invoice_no || 'Bill'}.pdf`;
  doc.save(fileName);
}
