import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import RichTextEditor from '../../components/RichTextEditor';
import FestivalsPanel from '../../components/FestivalsPanel';
import { toPlaceholders } from '../../lib/placeholders';

type Tpl = { key: string; label: string; category: string; subject: string; body: string; body_format: string; enabled: number; customized?: boolean };
type Category = { id: string; label: string };
type Settings = {
  smtp: { configured: boolean; host: string; port: number; secure: boolean; from: string; user_masked: string };
  templates: Record<string, Tpl>;
  defaults: Record<string, Tpl>;
  keys: string[];
  categories: Category[];
  placeholders: Record<string, string[]>;
  shop: Record<string, string>;
};

function substitute(text: string, vars: Record<string, string>) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}
function textToHtml(t: string) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
}

export default function EmailSettings() {
  const { data, refetch } = useQuery<{ data: Settings }>({ queryKey: ['email-settings'], queryFn: () => api.get('/admin/email/settings') });
  const log = useQuery<{ data: any[] }>({ queryKey: ['email-log'], queryFn: () => api.get('/admin/email/log') });
  const auto = useQuery<{ data: { enabled: boolean; window_days: number } }>({ queryKey: ['occasions-auto'], queryFn: () => api.get('/admin/occasions/auto') });
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

  const sampleVars: Record<string, string> = useMemo(() => ({
    ...(s?.shop || {}),
    customer_name: 'Ananya',
    invoice_no: 'INV-2026-00042',
    total: '₹45,000',
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    occasion_date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    years: '5',
    festival_name: 'Diwali',
    festival_date: '2026-11-08',
    offer_details: offerDetails || 'Flat 15% off making charges this festive week!',
  }), [s, offerDetails]);

  if (!s) return <div className="page"><div className="skeleton" style={{ height: 120 }} /></div>;
  const cur = forms || s.templates;
  const set = (key: string, patch: Partial<Tpl>) => setForms({ ...cur, [key]: { ...cur[key], ...patch } });

  const save = async (key: string) => {
    setSaving(true); setMsg('');
    try {
      const t = cur[key];
      await api.put(`/admin/email/templates/${key}`, { subject: t.subject, body: t.body, enabled: !!t.enabled, body_format: t.body_format });
      setMsg(`Saved "${t.label || key}".`); refetch();
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  };

  const resetToDefault = (key: string) => {
    const d = s.defaults[key];
    if (!d) return;
    set(key, { subject: d.subject, body: d.body, body_format: d.body_format, enabled: 1 });
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
      const r = await api.post('/admin/email/offers/send', { subject: cur.offers.subject, body: cur.offers.body, body_format: cur.offers.body_format, offer_details: offerDetails });
      setSendMsg(`Sent to ${r.data.sent} of ${r.data.recipients} recipients (failed ${r.data.failed}, skipped ${r.data.skipped}).`);
      log.refetch();
    } catch (e: any) { setSendMsg(`✗ ${e.message}`); }
  };

  const templateKeys = (category: string) => s.keys.filter((k) => cur[k].category === category);

  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Email</h1>
      <p style={{ color: 'var(--color-muted)' }}>Customize every message the shop sends. Defaults apply until you save your own text.</p>
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

      <AutoSendCard auto={auto.data?.data} onSaved={() => auto.refetch()} />

      {s.categories.map((cat) => (
        <div key={cat.id} style={{ marginTop: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 10px' }}>{cat.label}</h2>
          {cat.id === 'festivals' ? <FestivalsPanel /> : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))' }}>
              {templateKeys(cat.id).map((key) => {
                const tpl = cur[key];
                const placeholders = toPlaceholders(s.placeholders[key] || []);
                const editorValue = tpl.body_format === 'html' ? tpl.body : textToHtml(tpl.body);
                const previewHtml = tpl.body_format === 'html'
                  ? substitute(tpl.body, sampleVars)
                  : textToHtml(substitute(tpl.body, sampleVars));
                return (
                  <div className="card" key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <strong>{tpl.label || key}</strong>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={!!tpl.enabled} onChange={(e) => set(key, { enabled: e.target.checked ? 1 : 0 })} style={{ width: 'auto' }} />
                        Enabled
                      </label>
                    </div>
                    <label className="lbl">Subject</label>
                    <input value={tpl.subject} onChange={(e) => set(key, { subject: e.target.value })} />
                    <label className="lbl">Message</label>
                    <RichTextEditor value={editorValue} onChange={(body) => set(key, { body, body_format: 'html' })} placeholders={placeholders} minHeight={180} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button className="btn gold" onClick={() => save(key)} disabled={saving}>Save</button>
                      <button className="btn ghost" onClick={() => resetToDefault(key)}>Reset to default</button>
                      {tpl.customized && <small style={{ alignSelf: 'center', color: 'var(--color-muted)' }}>customized</small>}
                    </div>
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--color-muted)', fontSize: 13 }}>Preview</summary>
                      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, marginTop: 8, background: '#fff', fontSize: 13 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{substitute(tpl.subject, sampleVars)}</div>
                        <div style={{ color: 'var(--color-espresso)' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Offers broadcast */}
      <div className="card" style={{ marginTop: 20 }}>
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

function AutoSendCard({ auto, onSaved }: { auto?: { enabled: boolean; window_days: number }; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState(10);
  const [msg, setMsg] = useState('');
  const [init, setInit] = useState(false);
  useEffect(() => {
    if (auto && !init) { setEnabled(auto.enabled); setDays(auto.window_days); setInit(true); }
  }, [auto, init]);

  const save = async () => {
    setMsg('');
    try {
      const r = await api.put('/admin/occasions/auto', { enabled, window_days: days });
      setMsg(`Saved — auto-send ${r.data.enabled ? 'on' : 'off'}, ${r.data.window_days}-day window.`);
      onSaved();
    } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="card" style={{ marginBottom: 4 }}>
      <strong>Occasions auto-send</strong>
      <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Automatically email birthday, anniversary and festival greetings on the day (only to opted-in customers).</p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 'auto' }} />
          Enable daily auto-send
        </label>
        <div>
          <label className="lbl" style={{ marginTop: 0 }}>Upcoming window (days)</label>
          <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} style={{ maxWidth: 120 }} />
        </div>
        <button className="btn gold" onClick={save}>Save</button>
      </div>
      {msg && <p style={{ marginBottom: 0, color: 'var(--color-muted)' }}>{msg}</p>}
    </div>
  );
}

const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
