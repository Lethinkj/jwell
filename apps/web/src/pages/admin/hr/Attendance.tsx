import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { ICONS } from '../../../components/icons';
import HrShell, { KPI_TINTS, monthName } from './HrShell';

type Employee = { id: string; emp_code: string; full_name: string; status: string };
type Row = {
  id: string; employee_id: string; work_date: string; check_in: string | null; check_out: string | null;
  status: string; worked_minutes: number; overtime_minutes: number; source: string; note: string | null;
  full_name: string; emp_code: string; department_name: string | null;
};

const STATUSES = [
  ['present', 'Present'], ['absent', 'Absent'], ['half_day', 'Half day'],
  ['leave', 'Leave'], ['holiday', 'Holiday'], ['week_off', 'Week off'],
];
const badge = (s: string) => s === 'present' ? 'ok' : s === 'absent' ? 'err' : s === 'half_day' ? 'warn' : '';
const monthNow = () => new Date().toISOString().slice(0, 7);
const dayNow = () => new Date().toISOString().slice(0, 10);
const hhmm = (mins: number) => {
  const m = Number(mins) || 0;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

export default function HRAttendance() {
  const [month, setMonth] = useState(monthNow());
  const [empFilter, setEmpFilter] = useState('');
  const [form, setForm] = useState({
    employee_id: '', work_date: dayNow(), status: 'present',
    check_in: '10:00', check_out: '19:00', overtime_minutes: '0', note: '',
  });
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const employees = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => api.get('/hr/employees?status=all') });
  const list = useQuery({
    queryKey: ['hr-attendance', month, empFilter],
    queryFn: () => api.get(`/hr/attendance?month=${month}${empFilter ? `&employee_id=${empFilter}` : ''}`),
  });

  const staff: Employee[] = (employees.data?.data || []).filter((e: Employee) => e.status !== 'exited');
  const rows: Row[] = list.data?.data || [];
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const counts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const overtimeTotal = rows.reduce((s, r) => s + (Number(r.overtime_minutes) || 0), 0);

  const mark = async () => {
    setMsg(null);
    try {
      await api.post('/hr/attendance', {
        employee_id: form.employee_id, work_date: form.work_date, status: form.status,
        check_in: form.check_in || null, check_out: form.check_out || null,
        overtime_minutes: Number(form.overtime_minutes) || 0, note: form.note || null,
      });
      setMsg({ ok: true, text: 'Attendance saved.' });
      await list.refetch();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Could not save attendance' });
    }
  };

  const importRows = async () => {
    setMsg(null);
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rowsIn = lines
      .filter((l) => !/^emp_?code/i.test(l))
      .map((line) => {
        const [emp_code, date, check_in, check_out, status, overtime_minutes] = line.split(',').map((s) => s.trim());
        return {
          emp_code, date: date || undefined, check_in: check_in || null, check_out: check_out || null,
          status: status || 'present', overtime_minutes: Number(overtime_minutes) || 0,
        };
      })
      .filter((r) => r.emp_code && r.date);
    if (!rowsIn.length) { setMsg({ ok: false, text: 'Paste rows as: emp_code,date,check_in,check_out,status' }); return; }
    try {
      const r = await api.post('/hr/attendance/import', { source: 'biometric', rows: rowsIn });
      const d = r.data;
      const hint = d.errors?.length ? ` First error: ${d.errors[0].error}` : '';
      setMsg({ ok: d.failed === 0, text: `${d.imported} imported, ${d.failed} failed.${hint}` });
      await list.refetch();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Import failed' });
    }
  };

  return (
    <HrShell
      title="Attendance"
      subtitle="Mark attendance manually or import a biometric/CSV export. One record per employee per day — re-importing a day updates it."
      kpis={[
        { label: 'Present', value: String(counts.present || 0), meta: monthName(month), icon: ICONS.shield, ...KPI_TINTS.green },
        { label: 'Half day', value: String(counts.half_day || 0), meta: 'part-day shifts', icon: ICONS.calendar, ...KPI_TINTS.amber },
        { label: 'Absent', value: String(counts.absent || 0), meta: 'marked absent', icon: ICONS.audit, ...KPI_TINTS.red },
        { label: 'Overtime', value: hhmm(overtimeTotal), meta: 'logged this month', icon: ICONS.trending, ...KPI_TINTS.blue },
      ]}
      actions={<button className="btn ghost" onClick={() => list.refetch()}>Refresh register</button>}
    >
      {msg && <div className={`hr-msg${msg.ok ? '' : ' err'}`}>{msg.text}</div>}

      <div className="hr-grid-main">
        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Mark attendance</h2>
            <span className="sub">Manual entry</span>
          </div>
          <div className="hr-card-body">
            <form onSubmit={(e) => { e.preventDefault(); mark(); }}>
              <div className="hr-form-grid">
                <div className="hr-field span-2">
                  <label className="lbl" htmlFor="att-employee">Employee</label>
                  <select id="att-employee" value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)}>
                    <option value="">Select employee</option>
                    {staff.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
                  </select>
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="att-date">Date</label>
                  <input id="att-date" type="date" value={form.work_date} onChange={(e) => set('work_date', e.target.value)} />
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="att-status">Status</label>
                  <select id="att-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="att-in">Check in</label>
                  <input id="att-in" type="time" value={form.check_in} onChange={(e) => set('check_in', e.target.value)} />
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="att-out">Check out</label>
                  <input id="att-out" type="time" value={form.check_out} onChange={(e) => set('check_out', e.target.value)} />
                </div>
                <div className="hr-field">
                  <label className="lbl" htmlFor="att-ot">Overtime (minutes)</label>
                  <input id="att-ot" type="number" min={0} value={form.overtime_minutes} onChange={(e) => set('overtime_minutes', e.target.value)} />
                </div>
                <div className="hr-field span-2">
                  <label className="lbl" htmlFor="att-note">Note</label>
                  <input id="att-note" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div className="hr-form-actions">
                <button type="submit" className="btn gold" disabled={!form.employee_id}>Save attendance</button>
              </div>
            </form>
          </div>
        </div>

        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Biometric / CSV import</h2>
            <span className="sub">Bulk upsert</span>
          </div>
          <div className="hr-card-body">
            <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 0, lineHeight: 1.6 }}>
              One row per line: <code>emp_code,date,check_in,check_out,status</code>. Times are 24h HH:MM; status defaults to present.
            </p>
            <textarea
              rows={9}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6 }}
              placeholder={'EMP001,2026-11-01,10:02,19:11,present\nEMP002,2026-11-01,10:15,19:05,present'}
            />
            <div className="hr-form-actions">
              <button className="btn gold" onClick={importRows} disabled={!csv.trim()}>Import rows</button>
              {csv.trim() && <button className="btn ghost" onClick={() => setCsv('')}>Clear</button>}
            </div>
            <p style={{ color: 'var(--color-muted)', fontSize: 12, marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
              Imported rows are marked with source <strong>biometric</strong> so they are easy to audit.
            </p>
          </div>
        </div>
      </div>

      <div className="hr-card">
        <div className="hr-card-head">
          <h2>Attendance register</h2>
          <span className="sub">{rows.length} records</span>
          <div className="hr-card-actions">
            <input type="month" style={{ maxWidth: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
            <select style={{ maxWidth: 240 }} value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
              <option value="">All employees</option>
              {staff.map((e) => <option key={e.id} value={e.id}>{e.emp_code} · {e.full_name}</option>)}
            </select>
          </div>
        </div>
        <div className="hr-card-body" style={{ paddingBottom: 14 }}>
          <div className="hr-inline-stats">
            <span className="hr-stat ok">Present {counts.present || 0}</span>
            <span className="hr-stat warn">Half day {counts.half_day || 0}</span>
            <span className="hr-stat err">Absent {counts.absent || 0}</span>
            <span className="hr-stat">Leave {counts.leave || 0}</span>
            <span className="hr-stat">Week off {counts.week_off || 0}</span>
            <span className="hr-stat">Holiday {counts.holiday || 0}</span>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Employee</th><th>In / out</th><th>Worked</th><th>OT</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.work_date}</td>
                  <td>{r.full_name}<br /><small style={{ color: 'var(--color-muted)' }}>{r.emp_code}{r.department_name ? ` · ${r.department_name}` : ''}</small></td>
                  <td>{r.check_in || '—'} / {r.check_out || '—'}</td>
                  <td>{hhmm(r.worked_minutes)}</td>
                  <td>{r.overtime_minutes ? hhmm(r.overtime_minutes) : '—'}</td>
                  <td><span className={`badge ${badge(r.status)}`}>{r.status.replace('_', ' ')}</span></td>
                  <td><small style={{ color: 'var(--color-muted)' }}>{r.source}{r.note ? ` · ${r.note}` : ''}</small></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7}><div className="empty">{list.isLoading ? 'Loading…' : 'No attendance recorded for this month.'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </HrShell>
  );
}
