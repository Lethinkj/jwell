import { jsPDF } from 'jspdf';

export type PayslipData = {
  id: string;
  shop_name?: string;
  period: string;
  payroll_status?: string;
  full_name: string;
  emp_code: string;
  department_name?: string | null;
  designation_name?: string | null;
  joining_date?: string | null;
  pan?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  working_days: number;
  days_present: number;
  lop_days: number;
  basic_inr: number;
  hra_inr: number;
  conveyance_inr: number;
  special_allowance_inr: number;
  incentive_inr: number;
  gross_inr: number;
  pf_inr: number;
  esi_inr: number;
  professional_tax_inr: number;
  tds_inr: number;
  other_deduction_inr: number;
  lop_deduction_inr: number;
  total_deductions_inr: number;
  net_inr: number;
};

const money = (n: number | string | null | undefined) =>
  'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const monthName = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export function downloadPayslipPdf(p: PayslipData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const margin = 14;
  let y = margin;

  doc.setFillColor(71, 16, 29);
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');
  doc.setTextColor(255, 249, 242);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((p.shop_name || 'PAYSLIP').toUpperCase(), margin + 6, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(220, 205, 185);
  doc.text(`Payslip for ${monthName(p.period)}`, margin + 6, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(214, 180, 92);
  doc.text('SALARY SLIP', pageWidth - margin - 6, y + 10, { align: 'right' });
  y += 30;

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  const left = margin + 2;
  const right = margin + 105;
  const line = (label: string, value: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(115, 105, 100);
    doc.text(label, x, yy);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + 34, yy);
  };
  line('Employee', p.full_name, left, y);
  line('Code', p.emp_code, right, y);
  y += 6;
  line('Department', p.department_name || '—', left, y);
  line('Designation', p.designation_name || '—', right, y);
  y += 6;
  line('Joined', p.joining_date || '—', left, y);
  line('PAN', p.pan || '—', right, y);
  y += 6;
  line('Bank a/c', p.bank_account || '—', left, y);
  line('IFSC', p.bank_ifsc || '—', right, y);
  y += 6;
  line('Working days', String(p.working_days), left, y);
  line('Paid days', String(p.days_present), right, y);
  y += 6;
  line('LOP days', String(p.lop_days), left, y);
  line('Status', String(p.payroll_status || '').toUpperCase(), right, y);
  y += 10;

  const tableTop = y;
  const col1 = margin;
  const col2 = margin + 115;
  doc.setDrawColor(220, 210, 200);
  doc.setFillColor(249, 244, 238);
  doc.rect(col1, y, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 16, 29);
  doc.text('EARNINGS', col1 + 3, y + 5.5);
  doc.text('AMOUNT', col1 + 82, y + 5.5, { align: 'right' });
  doc.text('DEDUCTIONS', col2 + 3, y + 5.5);
  doc.text('AMOUNT', col2 + 64, y + 5.5, { align: 'right' });
  y += 8;

  const earnings: Array<[string, number]> = [
    ['Basic', p.basic_inr], ['HRA', p.hra_inr], ['Conveyance', p.conveyance_inr],
    ['Special allowance', p.special_allowance_inr], ['Incentive', p.incentive_inr],
  ];
  const deductions: Array<[string, number]> = [
    ['PF', p.pf_inr], ['ESI', p.esi_inr], ['Professional tax', p.professional_tax_inr],
    ['TDS', p.tds_inr], ['Other', p.other_deduction_inr], ['LOP deduction', p.lop_deduction_inr],
  ];
  const rows = Math.max(earnings.length, deductions.length);
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < rows; i++) {
    const yy = y + i * 6.5 + 5;
    if (earnings[i]) {
      doc.setTextColor(60, 60, 60);
      doc.text(earnings[i][0], col1 + 3, yy);
      doc.text(money(earnings[i][1]), col1 + 82, yy, { align: 'right' });
    }
    if (deductions[i]) {
      doc.setTextColor(60, 60, 60);
      doc.text(deductions[i][0], col2 + 3, yy);
      doc.text(money(deductions[i][1]), col2 + 64, yy, { align: 'right' });
    }
  }
  doc.setDrawColor(220, 210, 200);
  doc.line(col1 + 90, tableTop, col1 + 90, y + rows * 6.5 + 1);
  y += rows * 6.5 + 3;

  doc.setFillColor(249, 244, 238);
  doc.rect(col1, y, 182, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 16, 29);
  doc.text('GROSS', col1 + 3, y + 6.5);
  doc.text(money(p.gross_inr), col1 + 82, y + 6.5, { align: 'right' });
  doc.text('TOTAL DEDUCTIONS', col2 + 3, y + 6.5);
  doc.text(money(p.total_deductions_inr), col2 + 64, y + 6.5, { align: 'right' });
  y += 16;

  doc.setFillColor(71, 16, 29);
  doc.rect(col1, y, 182, 12, 'F');
  doc.setTextColor(255, 249, 242);
  doc.setFontSize(11);
  doc.text('NET PAY', col1 + 4, y + 7.8);
  doc.setTextColor(214, 180, 92);
  doc.text(money(p.net_inr), col1 + 178, y + 7.8, { align: 'right' });

  doc.setTextColor(140, 130, 125);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('System-generated payslip. Statutory deductions are configurable per employee and must be verified by your accountant.',
    margin, 280);
  doc.save(`payslip-${p.emp_code}-${p.period}.pdf`);
}
