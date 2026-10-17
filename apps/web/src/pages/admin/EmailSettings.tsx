import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Tpl = { subject: string; body: string; enabled: number; customized?: boolean };
type Settings = {
  smtp: { configured: boolean; host: string; port: number; secure: boolean; from: string; user_masked: string };
  templates: Record<string, Tpl>;
  defaults: Record<string, Tpl>;
  keys: string[];
  placeholders: Record<string, string[]>;
  shop: Record<string, string>;
};

const LABELS: Record<string, string> = {
  purchase_thankyou: 'Purchase thank-you (sent automatically after a bill)',
  offers: 'Offers & announcements (sent to opted-in customers)',
};

function substitute(text: string, vars: Record<string, string>) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

export default function EmailSettings() {
  const { data, refetch } = useQuery<{ data: Settings }>({ queryKey: ['email-settings'], queryFn: () => api.get('/admin/email/settings') });
  const log = useQuery<{ data: any[] }>({ queryKey: ['email-log'], queryFn: () => api.get('/admin/email/log') });
  const s = data?.data;

  const [forms, setForms] = useState<Record<string, Tpl> | null>(null);
  const [msg, setMsg] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [offerDetails, setOfferDetails] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (s?.templates && !forms) setForms(JSON.parse(JSON.stringify(s.templates)));
  }, [s, forms]);

  if (!s) return <div className="page"><div className="skeleton" style={{ height: 120 }} /></div>;
  const cur = forms || s.templates;
  const set = (key: string, patch: Partial<Tpl>) => setForms({ ...cur, [key]: { ...cur[key], ...patch } });

  const sampleVars: Record<string, string> = {
    ...s.shop,
    customer_name: 'Ananya',
    invoice_no: 'INV-2026-00042',
    total: '₹45,000',
    date: new Date().toLocaleDateString('en-IN'),
    offer_details: offerDetails || 'Flat 15% off making charges this festive week!',
  };

  const save = async (key: string) => {
    setSaving(true); setMsg('');
    try {
      await api.put(`/admin/email/templates/${key}`, cur[key]);
      setMsg(`Saved "${LABELS[key] || key}".`); refetch();
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  };

  const resetToDefault = (key: string) => {
    if (!s.defaults[key]) return;
    set(key, { subject: s.defaults[key].subject, body: s.defaults[key].body, enabled: 1 });
    setMsg('Loaded the default text. Click Save to apply it.');
  };

  const sendTest = async () => {
    setTestMsg('');
    try {
      const r = await api.post('/admin/email/test', { to: testTo });
      setTestMsg(`✓ Test email sent to ${r.data.to}`);
      log.refetch();
    } catch (e: any) { setTestMsg(`✗ ${e.message}`); }
  };

  const sendOffers = async () => {
    setSendMsg('');
    if (!window.confirm('Send the offers email to all opted-in customers with an email address?')) return;
    try {
      const r = await api.post('/admin/email/offers/send', { subject: cur.offers.subject, body: cur.offers.body, offer_details: offerDetails });
      setSendMsg(`Sent to ${r.data.sent} of ${r.data.recipients} recipients (failed ${r.data.failed}, skipped ${r.data.skipped}).`);
      log.refetch();
    } catch (e: any) { setSendMsg(`✗ ${e.message}`); }
  };

  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Email</h1>
      <p style={{ color: 'var(--color-muted)' }}>Customize the messages the shop sends, send a test, and view recent email activity. Defaults apply until you save your own text.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* SMTP status */}
      <div className="card" style={{ marginBottom: 16 }}>
        <strong>Google SMTP</strong>
        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge ${s.smtp.configured ? 'ok' : ''}`} style={s.smtp.configured ? {} : { background: '#FDECEA', color: 'var(--color-error)' }}>
            {s.smtp.configured ? 'Configured' : 'Not configured'}
          </span>
          {s.smtp.configured
            ? <small style={{ color: 'var(--color-muted)' }}>{s.smtp.host}:{s.smtp.port} • sending as {s.smtp.from}</small>
            : <small style={{ color: 'var(--color-muted)' }}>Set SMTP_USER and SMTP_PASSWORD in server/.env (Google App Password).</small>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input placeholder="Send a test to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} style={{ maxWidth: 260 }} />
          <button className="btn" onClick={sendTest} disabled={!s.smtp.configured}>Send test email</button>
        </div>
        {testMsg && <p style={{ marginBottom: 0, color: 'var(--color-muted)' }}>{testMsg}</p>}
      </div>

      {/* Template editors */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))' }}>
        {s.keys.map((key) => {
          const tpl = cur[key];
          const previewBody = substitute(tpl.body, sampleVars);
          return (
            <div className="card" key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong>{LABELS[key] || key}</strong>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={!!tpl.enabled} onChange={(e) => set(key, { enabled: e.target.checked ? 1 : 0 })} style={{ width: 'auto' }} />
                  Enabled
                </label>
              </div>
              <label className="lbl">Subject</label>
              <input value={tpl.subject} onChange={(e) => set(key, { subject: e.target.value })} />
              <label className="lbl">Message</label>
              <textarea value={tpl.body} onChange={(e) => set(key, { body: e.target.value })} rows={10} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {(s.placeholders[key] || []).map((p) => (
                  <button key={p} type="button" className="preset-chip" onClick={() => set(key, { body: `${tpl.body}{{${p}}}` })}>{`{{${p}}}`}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn gold" onClick={() => save(key)} disabled={saving}>Save</button>
                <button className="btn ghost" onClick={() => resetToDefault(key)}>Reset to default</button>
                {tpl.customized && <small style={{ alignSelf: 'center', color: 'var(--color-muted)' }}>customized</small>}
              </div>
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--color-muted)', fontSize: 13 }}>Preview</summary>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, marginTop: 8, background: '#fff', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{substitute(tpl.subject, sampleVars)}</div>
                  <div style={{ whiteSpace: 'pre-wrap', color: 'var(--color-espresso)' }}>{previewBody}</div>
                </div>
              </details>
            </div>
          );
        })}
      </div>

      {/* Offers broadcast */}
      <div className="card" style={{ marginTop: 16 }}>
        <strong>Send offers email now</strong>
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Goes to opted-in customers (marketing consent) with an email address, using the Offers message above.</p>
        <label className="lbl">Offer details (inserted as {'{{offer_details}}'})</label>
        <textarea value={offerDetails} onChange={(e) => setOfferDetails(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="Flat 15% off making charges till Sunday!" />
        <button className="btn gold" style={{ marginTop: 10 }} onClick={sendOffers} disabled={!s.smtp.configured}>Send offers email</button>
        {sendMsg && <p style={{ marginBottom: 0 }}>{sendMsg}</p>}
      </div>

      {/* Log */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Recent emails</strong>
          <button className="btn ghost" onClick={() => log.refetch()}>Refresh</button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--color-muted)' }}>
              <th style={th}>When</th><th style={th}>To</th><th style={th}>Template</th><th style={th}>Subject</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {(log.data?.data || []).map((r: any) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={td}>{r.to_email}</td>
                  <td style={td}>{r.template_key}</td>
                  <td style={td}>{r.subject}</td>
                  <td style={td}>
                    <span style={{ color: r.status === 'sent' ? 'var(--color-success)' : r.status === 'skipped' ? 'var(--color-muted)' : 'var(--color-error)' }}>{r.status}</span>
                    {r.error && <small style={{ color: 'var(--color-muted)' }}> — {r.error}</small>}
                  </td>
                </tr>
              ))}
              {!(log.data?.data || []).length && <tr><td style={td} colSpan={5}>No emails sent yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
