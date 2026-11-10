import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';
import Modal from '../../../components/Modal';
import { ICONS } from '../../../components/icons';
import HrShell, { KPI_TINTS, useHrOverview } from './HrShell';

type Employee = {
  id: string; emp_code: string; full_name: string; phone: string | null; email: string | null;
  dob: string | null; gender: string | null; joining_date: string; exit_date: string | null;
  employment_type: string; status: string; department_id: string | null; designation_id: string | null;
  branch_id: string | null; department_name: string | null; designation_name: string | null;
  branch_name: string | null; pan: string | null; bank_account: string | null; bank_ifsc: string | null;
};
type Lookup = { id: string; name: string; grade?: string | null };

const EMPTY = {
  emp_code: '', full_name: '', phone: '', email: '', dob: '', gender: '', joining_date: '',
  employment_type: 'full_time', status: 'active', department_id: '', designation_id: '',
  branch_id: '', pan: '', bank_account: '', bank_ifsc: '',
};

const GENDERS: Array<[string, string]> = [['', '—'], ['female', 'Female'], ['male', 'Male'], ['other', 'Other']];
const EMPLOYMENT_TYPES: Array<[string, string]> = [
  ['full_time', 'Full time'], ['part_time', 'Part time'], ['contract', 'Contract'], ['trainee', 'Trainee'],
];
const STATUSES: Array<[string, string]> = [['active', 'Active'], ['notice', 'Notice period'], ['exited', 'Exited']];
const FILTERS = ['active', 'notice', 'exited', 'all'];

export default function HREmployees() {
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deptName, setDeptName] = useState('');
  const [desigName, setDesigName] = useState('');
  const [showForm, setShowForm] = useState(false);

  const list = useQuery({
    queryKey: ['hr-employees', status, q],
    queryFn: () => api.get(`/hr/employees?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`),
  });
  const all = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => api.get('/hr/employees?status=all') });
  const depts = useQuery({ queryKey: ['hr-departments'], queryFn: () => api.get('/hr/departments') });
  const desigs = useQuery({ queryKey: ['hr-designations'], queryFn: () => api.get('/hr/designations') });
  const branches = useQuery({ queryKey: ['hr-branches'], queryFn: () => api.get('/hr/branches') });
  const overview = useHrOverview();

  const employees: Employee[] = list.data?.data || [];
  const everyone: Employee[] = all.data?.data || [];
  const departments: Lookup[] = depts.data?.data || [];
  const designations: Lookup[] = desigs.data?.data || [];
  const branchList: Lookup[] = branches.data?.data || [];
  const countOf = (s: string) => (all.isLoading ? '—' : String(everyone.filter((e) => e.status === s).length));

  const refresh = () => Promise.all([list.refetch(), depts.refetch(), desigs.refetch()]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await refresh();
      return true;
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || 'Something went wrong' });
      return false;
    }
  };
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => { setEditId(null); setForm({ ...EMPTY }); };

  const submit = async () => {
    const payload: any = { ...form };
    for (const k of ['department_id', 'designation_id', 'branch_id']) if (!payload[k]) payload[k] = null;
    const done = await act(
      () => (editId ? api.patch(`/hr/employees/${editId}`, payload) : api.post('/hr/employees', payload)),
      editId ? 'Employee updated.' : 'Employee added.',
    );
    if (done) { reset(); setShowForm(false); }
  };

  const startEdit = (e: Employee) => {
    setEditId(e.id);
    setForm({
      emp_code: e.emp_code, full_name: e.full_name, phone: e.phone || '', email: e.email || '',
      dob: e.dob || '', gender: e.gender || '', joining_date: e.joining_date,
      employment_type: e.employment_type, status: e.status,
      department_id: e.department_id || '', designation_id: e.designation_id || '',
      branch_id: e.branch_id || '', pan: e.pan || '', bank_account: e.bank_account || '',
      bank_ifsc: e.bank_ifsc || '',
    });
    setShowForm(true);
  };

  const markExited = (e: Employee) => {
    if (!window.confirm(`Mark ${e.full_name} as exited today? Payroll history is preserved.`)) return;
    const today = new Date().toISOString().slice(0, 10);
    act(() => api.patch(`/hr/employees/${e.id}`, { status: 'exited', exit_date: today }), 'Employee marked exited.');
  };

  const addDept = () => {
    if (!deptName.trim()) return;
    act(() => api.post('/hr/departments', { name: deptName.trim() }), 'Department added.').then((ok) => ok && setDeptName(''));
  };
  const addDesig = () => {
    if (!desigName.trim()) return;
    act(() => api.post('/hr/designations', { name: desigName.trim() }), 'Designation added.').then((ok) => ok && setDesigName(''));
  };
  const removeDept = (d: Lookup) => window.confirm(`Delete department ${d.name}?`) &&
    act(() => api.del(`/hr/departments/${d.id}`), 'Department deleted.');
  const removeDesig = (d: Lookup) => window.confirm(`Delete designation ${d.name}?`) &&
    act(() => api.del(`/hr/designations/${d.id}`), 'Designation deleted.');

  const textField = (k: keyof typeof form, label: string, type = 'text', cls = '') => (
    <div className={`hr-field ${cls}`.trim()} key={k}>
      <label className="lbl" htmlFor={`emp-${k}`}>{label}</label>
      <input id={`emp-${k}`} type={type} value={form[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  const selectField = (k: keyof typeof form, label: string, options: Array<[string, string]>) => (
    <div className="hr-field" key={k}>
      <label className="lbl" htmlFor={`emp-${k}`}>{label}</label>
      <select id={`emp-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <HrShell
      title="Employees"
      subtitle={<>Employee records for payroll and attendance. Logins stay in <strong>Staff Management</strong> — an employee does not need a login (karigars, housekeeping, contract staff).</>}
      kpis={[
        { label: 'Headcount', value: overview ? String(overview.headcount) : '—', meta: 'active & notice period', icon: ICONS.staff, ...KPI_TINTS.gold },
        { label: 'Active', value: countOf('active'), meta: 'currently working', icon: ICONS.shield, ...KPI_TINTS.green },
        { label: 'On notice', value: countOf('notice'), meta: 'serving notice period', icon: ICONS.calendar, ...KPI_TINTS.amber },
        { label: 'Exited', value: countOf('exited'), meta: 'records retained', icon: ICONS.audit, ...KPI_TINTS.rose },
      ]}
      actions={<button className="btn gold" onClick={() => { reset(); setShowForm(true); }}>Add employee</button>}
    >
      {msg && <div className={`hr-msg${msg.ok ? '' : ' err'}`}>{msg.text}</div>}

      <div className="hr-card">
        <div className="hr-card-head">
          <h2>Employee directory</h2>
          <span className="sub">{employees.length} shown</span>
          <div className="hr-card-actions">
            <input
              style={{ maxWidth: 240 }}
              placeholder="Search name / code / phone"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="hr-segments" role="group" aria-label="Filter by status">
              {FILTERS.map((s) => (
                <button
                  key={s}
                  className={`hr-segment${status === s ? ' active' : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Department / role</th><th>Joined</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td><code>{e.emp_code}</code></td>
                  <td>
                    {e.full_name}
                    <br />
                    <small style={{ color: 'var(--color-muted)' }}>{e.phone || 'no phone'} · {e.employment_type.replace('_', ' ')}</small>
                  </td>
                  <td>
                    {e.department_name || '—'}
                    <br />
                    <small style={{ color: 'var(--color-muted)' }}>{e.designation_name || '—'}{e.branch_name ? ` · ${e.branch_name}` : ''}</small>
                  </td>
                  <td>
                    {e.joining_date}
                    {e.exit_date ? <><br /><small style={{ color: 'var(--color-muted)' }}>exited {e.exit_date}</small></> : null}
                  </td>
                  <td><span className={`badge ${e.status === 'active' ? 'ok' : e.status === 'notice' ? 'warn' : 'err'}`}>{e.status}</span></td>
                  <td>
                    <div className="hr-row-actions">
                      <button className="btn ghost sm" onClick={() => startEdit(e)}>Edit</button>
                      {e.status !== 'exited' && <button className="btn ghost sm" onClick={() => markExited(e)}>Exit</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!employees.length && (
                <tr><td colSpan={6}><div className="empty">{list.isLoading ? 'Loading…' : 'No employees match this filter.'}</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

        <div className="hr-card">
          <div className="hr-card-head">
            <h2>Departments &amp; designations</h2>
            <span className="sub">Used across payroll and attendance</span>
          </div>
          <div className="hr-card-body">
            <p className="hr-section-label">Departments</p>
            <div className="hr-toolbar">
              <input
                className="grow"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Sales"
                onKeyDown={(e) => e.key === 'Enter' && addDept()}
              />
              <button className="btn ghost sm" onClick={addDept}>Add</button>
            </div>
            <div className="hr-chip-list">
              {departments.map((d) => (
                <span key={d.id} className="hr-chip">
                  {d.name}
                  <button onClick={() => removeDept(d)} title="Delete department" aria-label={`Delete ${d.name}`}>×</button>
                </span>
              ))}
              {!departments.length && <small style={{ color: 'var(--color-muted)' }}>None yet.</small>}
            </div>

            <p className="hr-section-label" style={{ marginTop: 20 }}>Designations</p>
            <div className="hr-toolbar">
              <input
                className="grow"
                value={desigName}
                onChange={(e) => setDesigName(e.target.value)}
                placeholder="e.g. Sales Executive"
                onKeyDown={(e) => e.key === 'Enter' && addDesig()}
              />
              <button className="btn ghost sm" onClick={addDesig}>Add</button>
            </div>
            <div className="hr-chip-list">
              {designations.map((d) => (
                <span key={d.id} className="hr-chip">
                  {d.name}{d.grade ? <small style={{ color: 'var(--color-muted)' }}>{d.grade}</small> : null}
                  <button onClick={() => removeDesig(d)} title="Delete designation" aria-label={`Delete ${d.name}`}>×</button>
                </span>
              ))}
              {!designations.length && <small style={{ color: 'var(--color-muted)' }}>None yet.</small>}
            </div>

            <p style={{ color: 'var(--color-muted)', fontSize: 12.5, marginTop: 18, lineHeight: 1.6 }}>
              Salary structures are set on the <strong>Payroll</strong> page. Attendance and leave live in their own tabs.
            </p>
          </div>
        </div>
      {showForm && (
        <Modal
          title={editId ? 'Edit employee' : 'Add employee'}
          subtitle={editId ? `Editing ${form.full_name || form.emp_code}` : 'Employee records are separate from login accounts.'}
          onClose={() => { setShowForm(false); reset(); }}
          size="lg"
          footer={
            <>
              <span className="grow" />
              <button type="button" className="btn ghost" onClick={() => { setShowForm(false); reset(); }}>Cancel</button>
              <button
                type="submit"
                form="employee-form"
                className="btn gold"
                disabled={!form.emp_code || !form.full_name || !form.joining_date}
              >
                {editId ? 'Save changes' : 'Add employee'}
              </button>
            </>
          }
        >
          {msg && !msg.ok && <div className="err-box" style={{ marginBottom: 12 }}>{msg.text}</div>}
          <form id="employee-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <fieldset className="hr-fieldset">
              <legend>Basic details</legend>
              <div className="hr-form-grid">
                {textField('emp_code', 'Employee code *')}
                {textField('full_name', 'Full name *')}
                {textField('phone', 'Phone')}
                {textField('email', 'Email', 'email')}
                {textField('dob', 'Date of birth', 'date')}
                {selectField('gender', 'Gender', GENDERS)}
              </div>
            </fieldset>

            <fieldset className="hr-fieldset">
              <legend>Employment</legend>
              <div className="hr-form-grid">
                {textField('joining_date', 'Joining date *', 'date')}
                {selectField('employment_type', 'Employment type', EMPLOYMENT_TYPES)}
                {selectField('status', 'Status', STATUSES)}
                {selectField('department_id', 'Department', [['', '—'], ...departments.map((d) => [d.id, d.name] as [string, string])])}
                {selectField('designation_id', 'Designation', [['', '—'], ...designations.map((d) => [d.id, d.name] as [string, string])])}
                {selectField('branch_id', 'Branch / showroom', [['', '—'], ...branchList.map((b) => [b.id, b.name] as [string, string])])}
              </div>
            </fieldset>

            <fieldset className="hr-fieldset">
              <legend>Statutory &amp; bank</legend>
              <div className="hr-form-grid">
                {textField('pan', 'PAN')}
                {textField('bank_account', 'Bank account')}
                {textField('bank_ifsc', 'IFSC')}
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
    </HrShell>
  );
}
