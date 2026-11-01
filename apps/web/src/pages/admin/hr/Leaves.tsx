import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { ICONS } from '../../../components/icons';
import HrShell, { KPI_TINTS, useHrOverview } from './HrShell';

type Employee = { id: string; emp_code: string; full_name: string; status: string };
type LeaveType = { id: string; name: string; annual_quota: number; paid: number };
type Leave = {
  id: string; employee_id: string; from_date: string; to_date: string; days: number; reason: string | null;
  status: string; leave_type: string; paid: number; full_name: string; emp_code: string; decision_note: string | null;
};
type Balance = { id: string; employee_id: string; full_name: string; emp_code: string; leave_type: string; year: number; entitled: number; used: number; balance: number };
type Holiday = { id: string; holiday_date: string; name: string; holiday_type: string };

const today = () => new Date().toISOString().slice(0, 10);
const yearNow = () => new Date().getFullYear();
const daysBetween = (a: string, b: string) => {
  const x = Date.parse(`${a}T00:00:00Z`);
  const y = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? Math.round((y - x) / 86400000) + 1 : 0;
};
const FILTERS = ['pending', 'approved', 'rejected', 'cancelled', 'all'];

export default function HRLeaves() {
  const [status, setStatus] = useState('pending');
  const [year, setYear] = useState(String(yearNow()));
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', from_date: today(), to_date: today(), reason: '' });
  const [typeForm, setTypeForm] = useState({ name: '', annual_quota: '12', paid: true });
  const [holidayForm, setHolidayForm] = useState({ holiday_date: today(), name: '', holiday_type: 'public' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const employees = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => api.get('/hr/employees?status=all') });
  const types = useQuery({ queryKey: ['hr-leave-types'], queryFn: () => api.get('/hr/leave-types') });
  const leaves = useQuery({ queryKey: ['hr-leaves', status], queryFn: () => api.get(`/hr/leaves?status=${status}`) });
  const balances = useQuery({ queryKey: ['hr-balances', year], queryFn: () => api.get(`/hr/leave-balances?year=${year}`) });
  const holidays = useQuery({ queryKey: ['hr-holidays', year], queryFn: () => api.get(`/hr/holidays?year=${year}`) });
  const overview = useHrOverview();

  const staff: Employee[] = (employees.data?.data || []).filter((e: Employee) => e.status !== 'exited');
  const leaveTypes: LeaveType[] = types.data?.data || [];
  const rows: Leave[] = leaves.data?.data || [];
  const balRows: Balance[] = balances.data?.data || [];
  const holidayRows: Holiday[] = holidays.data?.data || [];
  const reqDays = daysBetween(form.from_date, form.to_date);
  const balanceLeft = balRows.reduce((s, b) => s + Number(b.balance || 0), 0);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await Promise.all([leaves.refetch(), balances.refetch(), holidays.refetch(), types.refetch()]);
      return true;
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Something went wrong' });
      return false;
    }
  };

  const apply = async () => {
    const done = await act(
      () => api.post('/hr/leaves', { ...form, days: reqDays }),
      'Leave request submitted (status: pending).',
    );
    if (done) setForm({ ...form, reason: '' });
  };
  const decide = (l: Leave, next: 'approved' | 'rejected') => {
    const note = next === 'rejected' ? (window.prompt('Reason for rejection (optional)') || '') : '';
    act(() => api.post(`/hr/leaves/${l.id}/decide`, { status: next, note }), `Leave ${next}.`);
  };
  const cancel = (l: Leave) => act(() => api.post(`/hr/leaves/${l.id}/cancel`, {}), 'Leave request cancelled.');
  const addType = async () => {
    if (!typeForm.name.trim()) return;
    const done = await act(
      () => api.post('/hr/leave-types', { name: typeForm.name.trim(), annual_quota: Number(typeForm.annual_quota) || 0, paid: typeForm.paid }),
      'Leave type added.',
    );
    if (done) setTypeForm({ name: '', annual_quota: '12', paid: true });
  };
  const addHoliday = async () => {
    if (!holidayForm.name.trim()) return;
    const done = await act(
      () => api.post('/hr/holidays', holidayForm),
      'Holiday added.',
    );
    if (done) setHolidayForm({ ...holidayForm, name: '' });
  };
  const removeHoliday = (h: Holiday) => window.confirm(`Delete holiday ${h.name}?`) &&
    act(() => api.del(`/hr/holidays/${h.id}`), 'Holiday deleted.');

  return (
    <HrShell
      title="Leave &amp; holidays"
      subtitle="Apply and approve leave; approving a paid leave consumes the employee's balance and marks the days on the attendance register."
      kpis={[
        { label: 'Pending approvals', value: overview ? String(overview.pending_leaves) : '—', meta: 'awaiting decision', icon: ICONS.calendar, ...KPI_TINTS.amber },
        { label: 'Balance days', value: String(balanceLeft), meta: `left in ${year}`, icon: ICONS.wallet, ...KPI_TINTS.green },
        { label: 'Holidays', value: String(holidayRows.length), meta: `in ${year}`, icon: ICONS.gem, ...KPI_TINTS.rose },
        { label: 'Leave types', value: String(leaveTypes.length), meta: 'configured policies', icon: ICONS.briefcase, ...KPI_TINTS.gold },
      ]}
    >
      {msg && <div className={`hr-msg${msg.ok ? '' : ' err'}`}>{msg.text}</div>}

      <div className="hr-grid-main">
        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Apply for leave</h2>
            <span className="sub">Creates a pending request</span>
          </div>
          <div className="hr-card-body">
            <form onSubmit={(e) => { e.preventDefault(); apply(); }}>
              <div className="hr-form-grid">
                <div className="hr-field span-2">
                  <label className="lbl" htmlFor="lv-employee">Employee</label>
                  <select id="lv-employee" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                    <option value="">Select employee</option>
                    {staff.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
                  </select>
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="lv-type">Leave type</label>
                  <select id="lv-type" value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                    <option value="">Select type</option>
                    {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (unpaid)'}</option>)}
                  </select>
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="lv-from">From</label>
                  <input id="lv-from" type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="lv-to">To</label>
                  <input id="lv-to" type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
                </div>
                <div className="hr-field span-all">
                  <label className="lbl" htmlFor="lv-reason">Reason</label>
                  <input id="lv-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="hr-form-actions">
                <button type="submit" className="btn gold" disabled={!form.employee_id || !form.leave_type_id || !reqDays}>
                  Submit request
                </button>
                <span className="hr-stat" style={{ alignSelf: 'center' }}>Requested: {reqDays} day(s)</span>
              </div>
            </form>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Leave types</h2>
            <span className="sub">{leaveTypes.length} configured</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Type</th><th>Yearly quota</th><th>Paid</th></tr></thead>
              <tbody>
                {leaveTypes.map((t) => (
                  <tr key={t.id}><td>{t.name}</td><td>{t.annual_quota}</td><td>{t.paid ? 'Yes' : 'No'}</td></tr>
                ))}
                {!leaveTypes.length && <tr><td colSpan={3}><div className="empty">Loading…</div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="hr-card-body" style={{ paddingTop: 14 }}>
            <p className="hr-section-label">Add leave type</p>
            <div className="hr-toolbar">
              <input
                className="grow"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                placeholder="Name"
                onKeyDown={(e) => e.key === 'Enter' && addType()}
              />
              <input
                type="number" min={0} style={{ maxWidth: 90 }} value={typeForm.annual_quota}
                onChange={(e) => setTypeForm({ ...typeForm, annual_quota: e.target.value })} title="Annual quota"
                aria-label="Annual quota"
              />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13 }}>
                <input
                  type="checkbox" style={{ width: 'auto' }} checked={typeForm.paid}
                  onChange={(e) => setTypeForm({ ...typeForm, paid: e.target.checked })}
                /> Paid
              </label>
              <button className="btn ghost sm" onClick={addType}>Add</button>
            </div>
          </div>
        </div>
      </div>

      <div className="hr-card">
        <div className="hr-card-head">
          <h2>Leave requests</h2>
          <span className="sub">{rows.length} shown</span>
          <div className="hr-card-actions">
            <div className="hr-segments" role="group" aria-label="Filter leave requests">
              {FILTERS.map((s) => (
                <button key={s} className={`hr-segment${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{s}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>{l.full_name}<br /><small style={{ color: 'var(--color-muted)' }}>{l.emp_code}</small></td>
                  <td>{l.leave_type}{l.paid ? '' : <><br /><small style={{ color: 'var(--color-muted)' }}>unpaid</small></>}</td>
                  <td>{l.from_date}{l.from_date !== l.to_date ? ` → ${l.to_date}` : ''}</td>
                  <td>{l.days}</td>
                  <td><small>{l.reason || '—'}{l.decision_note ? ` · ${l.decision_note}` : ''}</small></td>
                  <td><span className={`badge ${l.status === 'approved' ? 'ok' : l.status === 'pending' ? 'warn' : 'err'}`}>{l.status}</span></td>
                  <td>
                    {l.status === 'pending' && (
                      <div className="hr-row-actions">
                        <button className="btn gold xs" onClick={() => decide(l, 'approved')}>Approve</button>
                        <button className="btn ghost xs" onClick={() => decide(l, 'rejected')}>Reject</button>
                        <button className="btn ghost xs" onClick={() => cancel(l)}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7}><div className="empty">No {status === 'all' ? '' : status} leave requests.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hr-grid-2">
        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Leave balances</h2>
            <span className="sub">{balRows.length} entries</span>
            <div className="hr-card-actions">
              <input type="number" style={{ maxWidth: 110 }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Balance year" />
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Employee</th><th>Leave type</th><th>Entitled</th><th>Used</th><th>Balance</th></tr></thead>
              <tbody>
                {balRows.map((b) => (
                  <tr key={b.id}>
                    <td>{b.full_name}<br /><small style={{ color: 'var(--color-muted)' }}>{b.emp_code}</small></td>
                    <td>{b.leave_type}</td><td>{b.entitled}</td><td>{b.used}</td>
                    <td><strong style={{ color: b.balance <= 0 ? 'var(--color-error)' : 'inherit' }}>{b.balance}</strong></td>
                  </tr>
                ))}
                {!balRows.length && <tr><td colSpan={5}><div className="empty">Balances appear once employees and leave types exist.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Holidays {year}</h2>
            <span className="sub">{holidayRows.length} days</span>
            <div className="hr-card-actions">
              <input type="number" style={{ maxWidth: 110 }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Holiday year" />
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Name</th><th>Type</th><th /></tr></thead>
              <tbody>
                {holidayRows.map((h) => (
                  <tr key={h.id}>
                    <td>{h.holiday_date}</td><td>{h.name}</td><td>{h.holiday_type}</td>
                    <td><button className="btn ghost xs" onClick={() => removeHoliday(h)} title="Delete holiday">×</button></td>
                  </tr>
                ))}
                {!holidayRows.length && <tr><td colSpan={4}><div className="empty">No holidays for {year}.</div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="hr-card-foot">
            <input type="date" style={{ maxWidth: 150 }} value={holidayForm.holiday_date}
              onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })} aria-label="Holiday date" />
            <input className="grow" placeholder="Holiday name" value={holidayForm.name}
              onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addHoliday()} />
            <select style={{ maxWidth: 120 }} value={holidayForm.holiday_type}
              onChange={(e) => setHolidayForm({ ...holidayForm, holiday_type: e.target.value })} aria-label="Holiday type">
              <option value="public">Public</option><option value="festival">Festival</option><option value="shop">Shop</option>
            </select>
            <button className="btn ghost sm" onClick={addHoliday}>Add</button>
          </div>
        </div>
      </div>
    </HrShell>
  );
}
