import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import RichTextEditor from './RichTextEditor';
import { FESTIVAL_PLACEHOLDER_KEYS, toPlaceholders } from '../lib/placeholders';

type Festival = {
  id: string; name: string; festival_date: string | null; recurring: number;
  subject: string; body: string; body_format: string; enabled: number;
};

const placeholders = toPlaceholders(FESTIVAL_PLACEHOLDER_KEYS);

/** Manage festival greetings: add/edit/delete and send to opted-in customers. */
export default function FestivalsPanel() {
  const q = useQuery<{ data: Festival[] }>({ queryKey: ['festivals'], queryFn: () => api.get('/admin/festivals') });
  const [msg, setMsg] = useState('');
  const [edits, setEdits] = useState<Record<string, Festival>>({});
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');

  const festivals = q.data?.data || [];
  const cur = (f: Festival) => edits[f.id] || f;
  const set = (f: Festival, patch: Partial<Festival>) => setEdits((e) => ({ ...e, [f.id]: { ...cur(f), ...patch } }));

  const save = async (f: Festival) => {
    setMsg('');
    try {
      const c = cur(f);
      await api.patch(`/admin/festivals/${f.id}`, {
        name: c.name, festival_date: c.festival_date, recurring: !!c.recurring,
        subject: c.subject, body: c.body, body_format: c.body_format, enabled: !!c.enabled,
      });
      setMsg(`Saved "${c.name}".`);
      setEdits((e) => { const n = { ...e }; delete n[f.id]; return n; });
      q.refetch();
    } catch (e: any) { setMsg(e.message); }
  };

  const del = async (f: Festival) => {
    if (!window.confirm(`Delete festival "${f.name}"?`)) return;
    try {
      await api.del(`/admin/festivals/${f.id}`);
      setMsg(`Deleted "${f.name}".`); q.refetch();
    } catch (e: any) { setMsg(e.message); }
  };

  const add = async () => {
    setMsg('');
    if (!newName.trim()) return;
    try {
      await api.post('/admin/festivals', { name: newName.trim(), festival_date: newDate || null });
      setNewName(''); setNewDate(''); q.refetch();
    } catch (e: any) { setMsg(e.message); }
  };

  const send = async (f: Festival) => {
    if (!window.confirm(`Send the "${f.name}" greeting to all opted-in customers?`)) return;
    setMsg('');
    try {
      const r = await api.post(`/admin/festivals/${f.id}/send`, {});
      setMsg(`"${f.name}": sent ${r.data.sent}, skipped ${r.data.skipped}, failed ${r.data.failed}.`);
    } catch (e: any) { setMsg(`✗ ${e.message}`); }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <strong>Festival greetings</strong>
      <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Edit each festival's message. Enable "Auto-send" below to have them emailed automatically on the date.</p>
      {msg && <div className="card" style={{ marginBottom: 10 }}>{msg}</div>}

      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <div><label className="lbl">New festival</label><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Onam" /></div>
        <div><label className="lbl">Date</label><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
        <button className="btn" style={{ flex: '0 0 auto' }} onClick={add}>+ Add festival</button>
      </div>

      {festivals.map((f) => {
        const c = cur(f);
        const dirty = !!edits[f.id];
        return (
          <div key={f.id} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={c.name} onChange={(e) => set(f, { name: e.target.value })} style={{ maxWidth: 180 }} />
              <input type="date" value={c.festival_date ? String(c.festival_date).slice(0, 10) : ''} onChange={(e) => set(f, { festival_date: e.target.value })} style={{ maxWidth: 170 }} />
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!c.enabled} onChange={(e) => set(f, { enabled: e.target.checked ? 1 : 0 })} style={{ width: 'auto' }} /> Enabled
              </label>
              {dirty && <span className="badge warn">unsaved</span>}
              <span style={{ flex: 1 }} />
              <button className="btn gold" onClick={() => save(f)}>Save</button>
              <button className="btn" onClick={() => send(f)}>Send to all</button>
              <button className="btn ghost" onClick={() => del(f)}>Delete</button>
            </div>
            <label className="lbl">Subject</label>
            <input value={c.subject} onChange={(e) => set(f, { subject: e.target.value })} />
            <label className="lbl">Message</label>
            <RichTextEditor value={c.body} onChange={(body) => set(f, { body, body_format: 'html' })} placeholders={placeholders} minHeight={140} />
          </div>
        );
      })}
      {!festivals.length && <div className="empty">No festivals yet — add one above.</div>}
    </div>
  );
}
