import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import SendMessageModal from '../../components/SendMessageModal';
import { FESTIVAL_PLACEHOLDER_KEYS, toPlaceholders } from '../../lib/placeholders';

type OccItem = {
  customer_id: string; name: string; phone: string; email: string | null;
  marketing_consent: number; type: string; date: string; occurrence_date: string;
  days_until: number; years: number | null; can_send: boolean;
};
type FestItem = { id: string; name: string; occurrence_date: string | null; days_until: number };

type Compose = {
  kind: 'birthday' | 'anniversary' | 'festival';
  festivalId?: string;
  title: string;
  recipients?: number;
  placeholders: { key: string; label: string }[];
  subject: string;
  body: string;
};

export default function Campaigns() {
  const offers = useQuery({ queryKey: ['offers'], queryFn: () => api.get('/offers') });
  const camps = useQuery({ queryKey: ['camps'], queryFn: () => api.get('/campaigns') });
  const upcoming = useQuery({ queryKey: ['occasions-upcoming'], queryFn: () => api.get('/admin/occasions/upcoming') });
  const emailSettings = useQuery<{ data: any }>({ queryKey: ['email-settings'], queryFn: () => api.get('/admin/email/settings') });

  const [msg, setMsg] = useState('');
  const [compose, setCompose] = useState<Compose | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [form, setForm] = useState({ name: '', template: 'Sparkle this Diwali ✨ Flat ₹1000 off above ₹50,000. Code FEST10. — Shree Gold Palace', channel: 'whatsapp', mode: 'manual', offer_code: 'FEST10' });

  const up = upcoming.data?.data;
  const days = up?.window?.days ?? 10;
  const bp = up?.birthdays || [];
  const ap = up?.anniversaries || [];
  const festivals: FestItem[] = up?.festivals || [];

  const templates = emailSettings.data?.data?.templates || {};
  const ph = emailSettings.data?.data?.placeholders || {};

  const create = async () => {
    try {
      const r = await api.post('/campaigns', { ...form, audience: {} });
      setMsg(`Queued to ${r.data.queued} opted-in recipients. Manual mode needs approval before send.`);
      camps.refetch();
    } catch (e: any) { setMsg(e.message); }
  };
  const step = async (id: string, action: string) => {
    try { const r = await api.post(`/campaigns/${id}/${action}`); setMsg(JSON.stringify(r.data)); camps.refetch(); }
    catch (e: any) { setMsg(e.message); }
  };

  const sendAll = async (kind: Compose['kind'], festivalId?: string, label?: string) => {
    if (!window.confirm(`Send the "${label || kind}" greeting to all opted-in customers with an email?`)) return;
    setMsg('');
    try {
      const r = await api.post('/admin/occasions/send', { kind, festival_id: festivalId });
      setMsg(`${label || kind}: sent ${r.data.sent}, skipped ${r.data.skipped}, failed ${r.data.failed} of ${r.data.recipients}.`);
    } catch (e: any) { setMsg(`✗ ${e.message}`); }
  };

  const openCompose = (kind: Compose['kind'], title: string, recipients: number | undefined, subject: string, body: string, placeholders: { key: string; label: string }[], festivalId?: string) => {
    setSendResult('');
    setCompose({ kind, festivalId, title, recipients, subject, body, placeholders });
  };

  const doSend = async (subject: string, body: string) => {
    if (!compose) return;
    setSending(true); setSendResult('');
    try {
      const r = await api.post('/admin/occasions/send', {
        kind: compose.kind, festival_id: compose.festivalId, subject, body, body_format: 'html',
      });
      setSendResult(`Sent ${r.data.sent}, skipped ${r.data.skipped}, failed ${r.data.failed} of ${r.data.recipients}.`);
      upcoming.refetch();
    } catch (e: any) { setSendResult(`✗ ${e.message}`); } finally { setSending(false); }
  };

  const Partition = ({ title, items, kind }: { title: string; items: OccItem[]; kind: 'birthday' | 'anniversary' }) => {
    const sendable = items.filter((i) => i.can_send).length;
    const tpl = templates[kind] || {};
    const placeholders = toPlaceholders(ph[kind] || ['customer_name', 'date', 'shop_name', 'shop_phone']);
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <strong>{title}</strong>
          <span className="badge">{items.length} in {days} days · {sendable} sendable</span>
        </div>
        <div className="tbl-wrap" style={{ marginTop: 8, maxHeight: 340, overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Date</th><th>In</th><th>Contact</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.customer_id + i.occurrence_date}>
                  <td>{i.name}{i.years ? <small style={{ color: 'var(--color-muted)' }}> · {kind === 'anniversary' ? `${i.years} yrs` : `turns ${i.years}`}</small> : null}</td>
                  <td>{i.occurrence_date}</td>
                  <td>{i.days_until === 0 ? 'today' : `${i.days_until}d`}</td>
                  <td>
                    {i.email || <small style={{ color: 'var(--color-error)' }}>no email</small>}
                    {!i.can_send && <span className="badge warn" style={{ marginLeft: 6 }}>{i.email ? 'no consent' : 'skipped'}</span>}
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={4} style={{ color: 'var(--color-muted)' }}>No {kind === 'birthday' ? 'birthdays' : 'anniversaries'} in the next {days} days.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn gold" onClick={() => sendAll(kind, undefined, title)} disabled={!sendable}>Send to all</button>
          <button className="btn ghost" disabled={!sendable}
            onClick={() => openCompose(kind, `Edit & send — ${title}`, sendable, tpl.subject || '', tpl.body || '', placeholders)}>
            ✎ Edit &amp; send
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Offers &amp; campaign center</h1>
      <p style={{ color: 'var(--color-muted)' }}>Upcoming occasions, consent-checked bulk campaigns, and discount offers. Messages are configured in the Email section.</p>
      {msg && <div className="card" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        <Partition title={`This week's birthdays`} items={bp} kind="birthday" />
        <Partition title={`This week's anniversaries`} items={ap} kind="anniversary" />
      </div>

      {festivals.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>Upcoming festivals</strong>
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead><tr><th>Festival</th><th>Date</th><th>In</th><th></th></tr></thead>
            <tbody>
              {festivals.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>{f.occurrence_date}</td>
                  <td>{f.days_until === 0 ? 'today' : `${f.days_until}d`}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn ghost" onClick={() => sendAll('festival', f.id, f.name)}>Send to all</button>
                    <button className="btn ghost" onClick={() => openCompose('festival', `Edit & send — ${f.name}`, undefined, templates.offers?.subject || `Happy ${f.name}!`, templates.offers?.body || '', toPlaceholders(FESTIVAL_PLACEHOLDER_KEYS), f.id)}>✎ Edit &amp; send</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16 }}>
        <div className="card"><strong>Offers</strong>
          <table className="tbl"><thead><tr><th>Code</th><th>Rule</th><th>Validity</th></tr></thead><tbody>
            {(offers.data?.data || []).map((o: any) => <tr key={o.id}><td>{o.code}</td><td>{o.discount_type} {o.discount_value} (min {o.min_purchase_inr})</td><td><small>{o.valid_from?.slice(0, 10)} → {o.valid_to?.slice(0, 10)}</small></td></tr>)}
          </tbody></table>
          <hr style={{ borderColor: 'var(--color-border)', margin: '14px 0' }} />
          <strong>New campaign</strong>
          <label className="lbl">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diwali 2026 blast" />
          <label className="lbl">Template</label><textarea rows={3} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} />
          <div className="filters">
            <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="both">Both</option></select>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><option value="manual">Manual + approval</option><option value="automatic">Automatic</option></select>
            <input value={form.offer_code} onChange={(e) => setForm({ ...form, offer_code: e.target.value })} placeholder="Offer code" />
          </div>
          <button className="btn gold" onClick={create}>Queue campaign</button>
        </div>
        <div className="card"><strong>Campaigns</strong>
          {(camps.data?.data || []).map((c: any) => (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
              <strong>{c.name}</strong> <span className={`badge ${c.approval_status === 'approved' ? 'ok' : 'warn'}`}>{c.approval_status}</span><br />
              <small style={{ color: 'var(--color-muted)' }}>{c.channel} • {c.mode} • {c.offer_code || 'no offer'}</small>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="btn ghost" onClick={() => step(c.id, 'approve')}>Approve</button>
                <button className="btn" onClick={() => step(c.id, 'send')}>Send now</button>
              </div>
            </div>))}
          {!(camps.data?.data || []).length && <div className="empty">No campaigns yet.</div>}
        </div>
      </div>

      {compose && (
        <SendMessageModal
          title={compose.title}
          subtitle={`${compose.recipients || 'all opted-in'} recipient(s)`}
          recipients={compose.recipients}
          placeholders={compose.placeholders}
          defaultSubject={compose.subject}
          defaultBody={compose.body}
          sending={sending}
          result={sendResult}
          onClose={() => setCompose(null)}
          onSend={doSend}
        />
      )}
    </div>
  );
}
