import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/auth';
import './landing.css';
import './login.css';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@shop.local');
  const [password, setPassword] = useState('Admin@123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    try { await login(email, password); nav('/admin'); }
    catch (e: any) { setErr(e.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <section className="auth-brand">
          <div className="auth-brand-inner">
            <img src="/logo.png" alt="" className="auth-logo" />
            <h1 className="auth-brand-name">Shree <em>Gold Palace</em></h1>
            <p className="auth-brand-tag">BIS-hallmarked gold jewellery, billed with transparent weight &amp; live rate pricing.</p>
            <ul className="auth-points">
              <li>BIS hallmarked purity on every piece</li>
              <li>Live 24K &amp; 22K rate pricing</li>
              <li>Role-based access for your team</li>
            </ul>
            <Link to="/" className="auth-back">← Back to store</Link>
          </div>
        </section>

        <section className="auth-form">
          <div className="auth-form-inner">
            <span className="auth-eyebrow">Staff portal</span>
            <h2 className="auth-title">Sign in</h2>
            <p className="auth-sub">Enter your credentials to open the admin console.</p>
            {err && <div className="err-box">{err}</div>}
            <form onSubmit={onSubmit}>
              <label className="lbl" htmlFor="auth-email">Email</label>
              <input
                id="auth-email" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="lbl" htmlFor="auth-pw">Password</label>
              <div className="auth-pw">
                <input
                  id="auth-pw" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button" className="auth-pw-toggle"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <button className="btn auth-submit" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className="auth-seed">Demo: <code>admin@shop.local</code> / <code>Admin@123</code></p>
          </div>
        </section>
      </div>
    </main>
  );
}
