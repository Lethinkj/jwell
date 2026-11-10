import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, inr } from '../../../lib/api';
import { downloadPayslipPdf } from '../../../lib/payslipPdf';
import { ICONS } from '../../../components/icons';
import Modal from '../../../components/Modal';
import HrShell, { KPI_TINTS, monthName, useHrOverview } from './HrShell';

type Employee = { id: string; emp_code: string; full_name: string; status: string };
type Salary = {
  id: string; employee_id: string; full_name: string; emp_code: string; effective_from: string;
  basic_inr: number; hra_inr: number; conveyance_inr: number; special_allowance_inr: number;
  incentive_inr: number; pf_inr: number; esi_inr: number; professional_tax_inr: number;
  tds_inr: number; other_deduction_inr: number;
};
type Run = {
  id: string; period: string; status: string; working_days: number; employee_count?: number;
  gross_total?: number; net_total?: number; locked_at?: string | null; paid_at?: string | null;
};

const dayNow = () => new Date().toISOString().slice(0, 10);
const monthNow = () => dayNow().slice(0, 7);
const daysInMonth = (period: string) => {
  if (!/^\d{4}-\d{2}$/.test(period)) return 30;
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const EMPTY_SALARY = {
  basic_inr: '0', hra_inr: '0', conveyance_inr: '0', special_allowance_inr: '0', incentive_inr: '0',
  pf_inr: '0', esi_inr: '0', professional_tax_inr: '0', tds_inr: '0', other_deduction_inr: '0',
};
const EARNINGS: Array<[keyof typeof EMPTY_SALARY, string]> = [
  ['basic_inr', 'Basic'], ['hra_inr', 'HRA'], ['conveyance_inr', 'Conveyance'],
  ['special_allowance_inr', 'Special allowance'], ['incentive_inr', 'Incentive'],
];
const DEDUCTIONS: Array<[keyof typeof EMPTY_SALARY, string]> = [
  ['pf_inr', 'PF'], ['esi_inr', 'ESI'], ['professional_tax_inr', 'Professional tax'],
  ['tds_inr', 'TDS'], ['other_deduction_inr', 'Other deduction'],
];
const COMPONENTS = [...EARNINGS, ...DEDUCTIONS];
const runBadge = (s: string) => s === 'paid' ? 'ok' : s === 'locked' ? 'warn' : '';

export default function HRPayroll() {
  const [period, setPeriod] = useState(monthNow());
  const [workingDays, setWorkingDays] = useState(String(daysInMonth(monthNow())));
  const [selected, setSelected] = useState<string>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [salaryForm, setSalaryForm] = useState({ employee_id: '', effective_from: dayNow(), ...EMPTY_SALARY });
  const [showGenerate, setShowGenerate] = useState(false);
  const [showSalary, setShowSalary] = useState(false);

  const employees = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => api.get('/hr/employees?status=all') });
  const salaries = useQuery({ queryKey: ['hr-salaries'], queryFn: () => api.get('/hr/salary') });
  const runs = useQuery({ queryKey: ['hr-payroll-runs'], queryFn: () => api.get('/hr/payroll') });
  const run = useQuery({
    queryKey: ['hr-payroll-run', selected],
    queryFn: () => api.get(`/hr/payroll/${selected}`),
    enabled: !!selected,
  });
  const overview = useHrOverview();

  const staff: Employee[] = (employees.data?.data || []).filter((e: Employee) => e.status !== 'exited');
  const salaryRows: Salary[] = salaries.data?.data || [];
  const runRows: Run[] = runs.data?.data || [];
  const detail: any = run.data?.data;
  const latestRun = runRows.length
    ? [...runRows].sort((a, b) => (a.period < b.period ? 1 : -1))[0]
    : undefined;

  const gross = EARNINGS.reduce((s, [k]) => s + (Number(salaryForm[k]) || 0), 0);
  const deductions = DEDUCTIONS.reduce((s, [k]) => s + (Number(salaryForm[k]) || 0), 0);
  const net = gross - deductions;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      return true;
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Something went wrong' });
      return false;
    }
  };

  const onPeriod = (v: string) => {
    setPeriod(v);
    if (/^\d{4}-\d{2}$/.test(v)) setWorkingDays(String(daysInMonth(v)));
  };

  const generate = async () => {
    setMsg(null);
    try {
      const r = await api.post('/hr/payroll/preview', { period, working_days: Number(workingDays) || daysInMonth(period) });
      setSelected(r.data.id);
      const skipped = r.data.skipped?.length || 0;
      setMsg({ ok: true, text: `Draft generated for ${period}.${skipped ? ` ${skipped} employee(s) skipped (no salary structure).` : ''}` });
      setShowGenerate(false);
      await runs.refetch();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Could not generate payroll' });
    }
  };

  const lock = async () => {
    if (!detail) return;
    if (!window.confirm(`Lock payroll for ${detail.period}? Locked payroll cannot be regenerated.`)) return;
    const ok = await act(() => api.post(`/hr/payroll/${detail.id}/lock`, {}), 'Payroll locked.');
    if (ok) { await runs.refetch(); await run.refetch(); }
  };
  const pay = async () => {
    if (!detail) return;
    if (!window.confirm(`Mark ${detail.period} payroll as paid and post ${inr(detail.payslips?.reduce((s: number, p: any) => s + Number(p.net_inr), 0) || 0)} to expenses?`)) return;
    const ok = await act(() => api.post(`/hr/payroll/${detail.id}/pay`, {}), 'Payroll marked paid and salary expense posted.');
    if (ok) { await runs.refetch(); await run.refetch(); }
  };

  const pickEmployee = (id: string) => {
    const latest = salaryRows.find((s) => s.employee_id === id);
    if (latest) {
      setSalaryForm({
        employee_id: id, effective_from: latest.effective_from,
        basic_inr: String(latest.basic_inr), hra_inr: String(latest.hra_inr),
        conveyance_inr: String(latest.conveyance_inr), special_allowance_inr: String(latest.special_allowance_inr),
        incentive_inr: String(latest.incentive_inr), pf_inr: String(latest.pf_inr),
        esi_inr: String(latest.esi_inr), professional_tax_inr: String(latest.professional_tax_inr),
        tds_inr: String(latest.tds_inr), other_deduction_inr: String(latest.other_deduction_inr),
      });
    } else {
      setSalaryForm((f) => ({ ...f, employee_id: id }));
    }
  };

  const saveSalary = async () => {
    if (!salaryForm.employee_id) return;
    const payload: any = { ...salaryForm };
    for (const [k] of COMPONENTS) payload[k] = Number(salaryForm[k]) || 0;
    const ok = await act(() => api.post('/hr/salary', payload), 'Salary structure saved.');
    if (ok) { setShowSalary(false); await salaries.refetch(); }
  };

  const download = async (slipId: string) => {
    try {
      const r = await api.get(`/hr/payslips/${slipId}`);
      downloadPayslipPdf(r.data);
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Could not build payslip' });
    }
  };

  const totals = detail
    ? {
      gross: detail.payslips.reduce((s: number, p: any) => s + Number(p.gross_inr), 0),
      deductions: detail.payslips.reduce((s: number, p: any) => s + Number(p.total_deductions_inr), 0),
      net: detail.payslips.reduce((s: number, p: any) => s + Number(p.net_inr), 0),
    }
    : null;

  return (
    <HrShell
      title="Payroll"
      subtitle="Salary structures are set per employee. Generating payroll resolves the latest structure effective in that month, deducts absent days and approved unpaid leave (LOP), then produces a payslip per employee."
      kpis={[
        { label: 'Net payable', value: overview ? inr(overview.current_month_net) : '—', meta: monthName(overview?.month), icon: ICONS.wallet, ...KPI_TINTS.green },
        { label: 'Payroll runs', value: String(runRows.length), meta: 'periods processed', icon: ICONS.payroll, ...KPI_TINTS.gold },
        {
          label: 'Latest run',
          value: latestRun ? latestRun.status.charAt(0).toUpperCase() + latestRun.status.slice(1) : '—',
          meta: latestRun ? latestRun.period : 'none yet',
          icon: ICONS.receipt,
          ...KPI_TINTS.amber,
        },
        { label: 'Salary structures', value: String(salaryRows.length), meta: 'revisions on record', icon: ICONS.calculator, ...KPI_TINTS.rose },
      ]}
      actions={
        <>
          <button className="btn gold" onClick={() => { setMsg(null); setShowGenerate(true); }}>Run payroll</button>
          <button className="btn ghost" onClick={() => { setMsg(null); setShowSalary(true); }}>+ Salary structure</button>
        </>
      }
    >
      {msg && <div className={`hr-msg${msg.ok ? '' : ' err'}`}>{msg.text}</div>}

      <div className="hr-card">
        <div className="hr-card-head">
          <h2>Payroll runs</h2>
          <span className="sub">{runRows.length} period(s)</span>
          <div className="hr-card-actions">
            <button className="btn ghost sm" onClick={() => runs.refetch()}>Refresh</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Period</th><th>Status</th><th>Employees</th><th>Gross</th><th>Net</th><th /></tr></thead>
            <tbody>
              {runRows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.period}</strong></td>
                  <td><span className={`badge ${runBadge(r.status)}`}>{r.status}</span></td>
                  <td>{r.employee_count || 0}</td>
                  <td>{inr(r.gross_total || 0)}</td>
                  <td>{inr(r.net_total || 0)}</td>
                  <td><button className="btn ghost sm" onClick={() => setSelected(r.id)}>View</button></td>
                </tr>
              ))}
              {!runRows.length && <tr><td colSpan={6}><div className="empty">No payroll runs yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Payroll {detail.period}</h2>
            <span className={`badge ${runBadge(detail.status)}`}>{detail.status}</span>
            <span className="sub">{detail.working_days} working days</span>
            <div className="hr-card-actions">
              {detail.status === 'draft' && <button className="btn gold sm" onClick={lock}>Lock payroll</button>}
              {detail.status === 'locked' && <button className="btn gold sm" onClick={pay}>Mark paid</button>}
              <button className="btn ghost sm" onClick={() => run.refetch()}>Refresh</button>
            </div>
          </div>
          {totals && (
            <div className="hr-card-body" style={{ paddingBottom: 12 }}>
              <div className="hr-summary">
                <div><small>Employees</small><strong>{detail.payslips.length}</strong></div>
                <div><small>Gross</small><strong>{inr(totals.gross)}</strong></div>
                <div><small>Deductions</small><strong>{inr(totals.deductions)}</strong></div>
                <div><small>Net payable</small><strong>{inr(totals.net)}</strong></div>
              </div>
            </div>
          )}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Paid days</th><th>LOP</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Payslip</th></tr></thead>
              <tbody>
                {detail.payslips.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.full_name}<br /><small style={{ color: 'var(--color-muted)' }}>{p.emp_code}</small></td>
                    <td>{p.days_present} / {detail.working_days}</td>
                    <td>{p.lop_days}</td>
                    <td>{inr(p.gross_inr)}</td>
                    <td>{inr(p.total_deductions_inr)}</td>
                    <td><strong>{inr(p.net_inr)}</strong></td>
                    <td><button className="btn ghost sm" onClick={() => download(p.id)}>PDF</button></td>
                  </tr>
                ))}
                {!detail.payslips.length && <tr><td colSpan={7}><div className="empty">No payslips in this run.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="hr-card">
        <div className="hr-card-head">
          <h2>Salary structures on record</h2>
          <span className="sub">{salaryRows.length} revisions</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Employee</th><th>Effective from</th><th>Basic</th><th>Gross</th><th>Deductions</th><th>Net</th></tr></thead>
            <tbody>
              {salaryRows.map((s) => {
                const g = Number(s.basic_inr) + Number(s.hra_inr) + Number(s.conveyance_inr) + Number(s.special_allowance_inr) + Number(s.incentive_inr);
                const d = Number(s.pf_inr) + Number(s.esi_inr) + Number(s.professional_tax_inr) + Number(s.tds_inr) + Number(s.other_deduction_inr);
                return (
                  <tr key={s.id}>
                    <td>{s.full_name}<br /><small style={{ color: 'var(--color-muted)' }}>{s.emp_code}</small></td>
                    <td>{s.effective_from}</td>
                    <td>{inr(s.basic_inr)}</td>
                    <td>{inr(g)}</td>
                    <td>{inr(d)}</td>
                    <td><strong>{inr(g - d)}</strong></td>
                  </tr>
                );
              })}
              {!salaryRows.length && <tr><td colSpan={6}><div className="empty">No salary structures yet — add one above before running payroll.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showGenerate && (
        <Modal
          title="Run monthly payroll"
          subtitle="Generates a draft for 1st – last day of the month. Re-running a draft replaces its payslips."
          onClose={() => setShowGenerate(false)}
          size="sm"
          footer={
            <>
              <span className="grow" />
              <button type="button" className="btn ghost" onClick={() => setShowGenerate(false)}>Cancel</button>
              <button type="submit" form="payroll-form" className="btn gold" disabled={!period}>Generate / refresh draft</button>
            </>
          }
        >
          {msg && !msg.ok && <div className="err-box" style={{ marginBottom: 12 }}>{msg.text}</div>}
          <form id="payroll-form" onSubmit={(e) => { e.preventDefault(); generate(); }}>
            <label className="lbl" htmlFor="pr-period">Period</label>
            <input id="pr-period" type="month" value={period} onChange={(e) => onPeriod(e.target.value)} />
            <label className="lbl" htmlFor="pr-days">Working days</label>
            <input id="pr-days" type="number" min={1} value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} />
            <p className="modal-hint" style={{ marginTop: 12 }}>Locked and paid runs are immutable.</p>
          </form>
        </Modal>
      )}

      {showSalary && (
        <Modal
          title="Salary structure"
          subtitle="The latest revision effective in the payroll month wins."
          onClose={() => setShowSalary(false)}
          size="lg"
          footer={
            <>
              <span className="modal-hint">PF / ESI / PT / TDS are entered manually.</span>
              <span className="grow" />
              <button type="button" className="btn ghost" onClick={() => setShowSalary(false)}>Cancel</button>
              <button type="submit" form="salary-form" className="btn gold" disabled={!salaryForm.employee_id}>Save structure</button>
            </>
          }
        >
          {msg && !msg.ok && <div className="err-box" style={{ marginBottom: 12 }}>{msg.text}</div>}
          <form id="salary-form" onSubmit={(e) => { e.preventDefault(); saveSalary(); }}>
            <div className="hr-form-grid">
              <div className="hr-field">
                <label className="lbl" htmlFor="sal-employee">Employee</label>
                <select id="sal-employee" value={salaryForm.employee_id} onChange={(e) => pickEmployee(e.target.value)}>
                  <option value="">Select employee</option>
                  {staff.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
                </select>
              </div>
              <div className="hr-field">
                <label className="lbl" htmlFor="sal-effective">Effective from</label>
                <input id="sal-effective" type="date" value={salaryForm.effective_from} onChange={(e) => setSalaryForm({ ...salaryForm, effective_from: e.target.value })} />
              </div>
            </div>

            <fieldset className="hr-fieldset" style={{ marginTop: 14 }}>
              <legend>Earnings</legend>
              <div className="hr-form-grid">
                {EARNINGS.map(([k, label]) => (
                  <div className="hr-field" key={k}>
                    <label className="lbl" htmlFor={`sal-${k}`}>{label} (₹)</label>
                    <input id={`sal-${k}`} type="number" min={0} value={salaryForm[k]} onChange={(e) => setSalaryForm({ ...salaryForm, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            </fieldset>

            <fieldset className="hr-fieldset">
              <legend>Deductions</legend>
              <div className="hr-form-grid">
                {DEDUCTIONS.map(([k, label]) => (
                  <div className="hr-field" key={k}>
                    <label className="lbl" htmlFor={`sal-${k}`}>{label} (₹)</label>
                    <input id={`sal-${k}`} type="number" min={0} value={salaryForm[k]} onChange={(e) => setSalaryForm({ ...salaryForm, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="hr-totals">
              <span>Gross <strong>{inr(gross)}</strong></span>
              <span>Deductions <strong>{inr(deductions)}</strong></span>
              <span>Net <strong>{inr(net)}</strong></span>
            </div>
          </form>
        </Modal>
      )}
    </HrShell>
  );
}
