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
  const [form, setForm] = useState({ name: '', template: 'Sparkle this Diwali ✨ Flat ₹1000 off above ₹50,000. Code FEST10. — Shree Gold Palace', channel: 'whatsapp', mode: 'manual', offer_code: 'FEST10', schedule_at: '' });
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [editMsg, setEditMsg] = useState('');

  const up = upcoming.data?.data;
  const days = up?.window?.days ?? 10;
  const bp = up?.birthdays || [];
  const ap = up?.anniversaries || [];
  const festivals: FestItem[] = up?.festivals || [];

  const templates = emailSettings.data?.data?.templates || {};
  const ph = emailSettings.data?.data?.placeholders || {};

  const create = async () => {
    if (!form.name.trim()) { setMsg('Please name the campaign.'); return; }
    try {
      const schedule_at = form.schedule_at ? new Date(form.schedule_at).toISOString() : null;
      const r = await api.post('/campaigns', { ...form, schedule_at, audience: {} });
      const when = schedule_at ? ` It will send automatically on ${new Date(schedule_at).toLocaleString()}.` : '';
      setMsg(form.mode === 'manual'
        ? `Queued to ${r.data.queued} opted-in recipient(s). Approve it to send.${when}`
        : `Queued to ${r.data.queued} opted-in recipient(s).${when}`);
      setForm({ ...form, name: '', schedule_at: '' });
      camps.refetch();
    } catch (e: any) { setMsg(e.message); }
  };
  const act = async (id: string, action: 'approve' | 'send' | 'remind') => {
    setBusy(`${id}:${action}`); setMsg('');
    try {
      const body = action === 'remind' ? { hours: 24 } : undefined;
      const r = await api.post(`/campaigns/${id}/${action}`, body);
      if (action === 'send') setMsg(`Sent to ${r.data.sent} recipient(s)${r.data.skipped ? `, skipped ${r.data.skipped} opted-out` : ''}.`);
      else if (action === 'approve') setMsg('Campaign approved.');
      else setMsg('Reminder snoozed for 24 hours.');
      camps.refetch();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };
  const statusOf = (c: any) => c.sent_at ? { label: 'Sent', cls: 'ok' } : c.approval_status === 'approved' ? { label: 'Approved', cls: 'ok' } : { label: 'Pending approval', cls: 'warn' };
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const toLocalInput = (s: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  };
  const saveEdit = async () => {
    if (!editing) return;
    setBusy(`${editing.id}:edit`); setEditMsg('');
    try {
      await api.patch(`/campaigns/${editing.id}`, {
        name: editing.name, template: editing.template, channel: editing.channel,
        mode: editing.mode, offer_code: editing.offer_code || null,
        schedule_at: editing.schedule_at ? new Date(editing.schedule_at).toISOString() : null,
      });
      setEditing(null); setMsg('Campaign updated.'); camps.refetch();
    } catch (e: any) { setEditMsg(e.message); } finally { setBusy(''); }
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
          <label className="lbl">Send date &amp; time</label>
          <input type="datetime-local" value={form.schedule_at} onChange={(e) => setForm({ ...form, schedule_at: e.target.value })} />
          <div style={{ color: 'var(--color-muted)', fontSize: 12, margin: '6px 0 10px' }}>
            {form.schedule_at ? `Will send automatically on ${new Date(form.schedule_at).toLocaleString()}.` : 'Leave blank to approve and send manually (you’ll be asked on login).'}
          </div>
          <button className="btn gold" onClick={create}>Queue campaign</button>
        </div>
        <div className="card"><strong>Campaigns</strong>
          <div className="tbl-wrap" style={{ marginTop: 8, maxHeight: 420, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Name</th><th>Channel</th><th>Mode</th><th>Offer</th><th>Scheduled</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(camps.data?.data || []).map((c: any) => {
                  const st = statusOf(c);
                  const sent = !!c.sent_at;
                  return (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.channel}</td>
                      <td>{c.mode}</td>
                      <td>{c.offer_code || '—'}</td>
                      <td><small>{fmtDate(c.schedule_at)}</small></td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {sent ? (
                          <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Sent {fmtDate(c.sent_at)}</span>
                        ) : c.mode === 'automatic' ? (
                          <button className="btn ghost" disabled={busy === `${c.id}:edit`} onClick={() => { setEditMsg(''); setEditing({ ...c, schedule_at: toLocalInput(c.schedule_at) }); }}>
                            {c.schedule_at ? 'Edit schedule' : 'Set date'}
                          </button>
                        ) : c.approval_status !== 'approved' ? (
                          <button className="btn ghost" disabled={busy === `${c.id}:approve`} onClick={() => act(c.id, 'approve')}>Approve</button>
                        ) : (
                          <>
                            <button className="btn" disabled={busy === `${c.id}:send`} onClick={() => act(c.id, 'send')}>Send now</button>
                            <button className="btn ghost" disabled={busy === `${c.id}:remind`} onClick={() => act(c.id, 'remind')}>Remind later</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!(camps.data?.data || []).length && <tr><td colSpan={7} style={{ color: 'var(--color-muted)' }}>No campaigns yet.</td></tr>}
              </tbody>
            </table>
          </div>
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

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(71,16,29,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ background: '#FFFFFF', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', borderTop: '4px solid var(--color-gold-deep)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Edit campaign</h3>
              <button className="btn ghost" onClick={() => setEditing(null)}>✕</button>
            </div>
            {editMsg && <div className="card" style={{ marginTop: 10, fontSize: 13 }}>{editMsg}</div>}
            <label className="lbl">Name</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <label className="lbl">Template</label>
            <textarea rows={3} value={editing.template} onChange={(e) => setEditing({ ...editing, template: e.target.value })} />
            <div className="filters" style={{ marginTop: 8 }}>
              <select value={editing.channel} onChange={(e) => setEditing({ ...editing, channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="both">Both</option></select>
              <select value={editing.mode} onChange={(e) => setEditing({ ...editing, mode: e.target.value })}><option value="manual">Manual + approval</option><option value="automatic">Automatic</option></select>
              <input value={editing.offer_code || ''} onChange={(e) => setEditing({ ...editing, offer_code: e.target.value })} placeholder="Offer code" />
            </div>
            <label className="lbl">Send date &amp; time</label>
            <input type="datetime-local" value={editing.schedule_at || ''} onChange={(e) => setEditing({ ...editing, schedule_at: e.target.value })} />
            <div style={{ color: 'var(--color-muted)', fontSize: 12, margin: '6px 0 10px' }}>
              {editing.schedule_at ? `Will send automatically on ${new Date(editing.schedule_at).toLocaleString()}.` : 'No date — approve and send manually.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn gold" disabled={busy === `${editing.id}:edit`} onClick={saveEdit}>{busy === `${editing.id}:edit` ? 'Saving…' : 'Save changes'}</button>
              <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
