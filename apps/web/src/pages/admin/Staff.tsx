import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';

type Staff = { user_id: string; role: string; display_name: string; email: string; phone: string | null; active: number; is_primary: number; last_login_at: string | null };

export default function Staff() {
  const list = useQuery({ queryKey: ['staff'], queryFn: () => api.get('/admin/staff') });
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [msg, setMsg] = useState('');
  const [tempPw, setTempPw] = useState('');
  const [activity, setActivity] = useState<{ user: string; rows: any[] } | null>(null);

  const reload = () => list.refetch();
  const act = async (fn: () => Promise<any>, ok: string) => {
    setMsg(''); setTempPw('');
    try { const r = await fn(); setMsg(ok); reload(); return r; }
    catch (e: any) { setMsg(e.message); }
  };
  const create = () => act(() => api.post('/admin/staff', form), 'Billing account created.')
    .then(() => setForm({ name: '', email: '', phone: '', password: '' }));
  const resetPw = (id: string) => act(() => api.post(`/admin/staff/${id}/reset-password`, {}), 'Password reset — copy it now; it cannot be shown again.')
    .then((r) => r && setTempPw(`${r.data.email}: ${r.data.temporaryPassword}`));
  const showActivity = async (s: Staff) => {
    const r = await api.get(`/admin/staff/${s.user_id}/activity`);
    setActivity({ user: `${s.display_name} (${s.email})`, rows: r.data });
  };

  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Staff Management</h1>
      <p style={{ color: 'var(--color-muted)' }}>One primary admin per shop. Only billing accounts can be created here — roles can't be escalated.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}
      {tempPw && <div className="card" style={{ marginBottom: 12, borderColor: 'var(--color-warning)' }}><strong>New password (one-time):</strong> <code>{tempPw}</code></div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <div className="card">
          <strong>Add billing staff</strong>
          {[['name', 'Full name'], ['email', 'Login email'], ['phone', 'Phone (optional)'], ['password', 'Initial password (min 8 chars)']].map(([k, l]) => (
            <div key={k}><label className="lbl">{l}</label>
              <input type={k === 'password' ? 'password' : 'text'} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>))}
          <button className="btn gold" style={{ marginTop: 10 }} onClick={create}>Create account</button>
        </div>
        <div className="card">
          <strong>Accounts</strong>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Login</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            {(list.data?.data || []).map((s: Staff) => (
              <tr key={s.user_id}>
                <td>{s.display_name}{s.is_primary ? ' 👑' : ''}<br /><small style={{ color: 'var(--color-muted)' }}>{s.role} • {s.phone || 'no phone'}</small></td>
                <td><small>{s.email}<br />last login: {s.last_login_at ? new Date(s.last_login_at).toLocaleString() : 'never'}</small></td>
                <td><span className={`badge ${s.active ? 'ok' : 'err'}`}>{s.active ? 'active' : 'disabled'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn ghost" onClick={() => act(() => api.patch(`/admin/staff/${s.user_id}`, { active: !s.active }), s.active ? 'Deactivated — sessions stop working immediately.' : 'Reactivated.')}>{s.active ? 'Disable' : 'Enable'}</button>
                    <button className="btn ghost" onClick={() => resetPw(s.user_id)}>Reset pw</button>
                    <button className="btn ghost" onClick={() => showActivity(s)}>Activity</button>
                  </div>
                </td>
              </tr>))}
          </tbody></table></div>
          {activity && <div style={{ marginTop: 12 }}><strong>Activity — {activity.user}</strong>
            <ul>{activity.rows.length === 0 && <li><small>No recorded activity.</small></li>}
              {activity.rows.map((a: any) => <li key={a.id}><small>{new Date(a.created_at).toLocaleString()} — {a.action} ({a.entity_type}/{a.entity_id}) {a.summary}</small></li>)}</ul>
            <button className="btn ghost" onClick={() => setActivity(null)}>Close</button></div>}
        </div>
      </div>
    </div>
  );
}
