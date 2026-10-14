import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/auth';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@shop.local');
  const [password, setPassword] = useState('Admin@123');
  const [err, setErr] = useState('');
  return (
    <div className="page" style={{ maxWidth: 420, margin: '40px auto', padding: 24 }}>
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Staff login</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Role-based access: owner / manager / inventory / billing.</p>
        {err && <div className="err-box">{err}</div>}
        <label className="lbl">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="lbl">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={async () => { try { await login(email, password); nav('/admin'); } catch (e: any) { setErr(e.message); } }}>Sign in</button>
        <small style={{ color: 'var(--color-muted)' }}>Seeded: admin@shop.local / Admin@123 • billing@shop.local / Billing@123</small>
      </div>
    </div>
  );
}
