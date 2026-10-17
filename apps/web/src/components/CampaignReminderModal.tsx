import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../hooks/auth';

type Campaign = {
  id: string; name: string; channel: string; mode: string;
  offer_code: string | null; schedule_at: string | null; template: string;
};

const fmt = (s: string | null) => s
  ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

/**
 * Login prompt: approved campaigns that are ready to go. The admin picks
 * "Send now" or "Remind later" (snoozed 24h server-side). Shown once per
 * browser session per admin.
 */
export default function CampaignReminderModal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const storeKey = `campaign_reminder_closed:${user?.user_id || 'anon'}`;
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(storeKey) === '1');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const { data, refetch } = useQuery({
    queryKey: ['campaign-reminders'],
    queryFn: () => api.get('/campaigns/reminders'),
    enabled: !!user && user.role === 'admin',
  });

  const items: Campaign[] = (data?.data || []).filter((c: Campaign) => !hidden) as Campaign[];
  if (!user || user.role !== 'admin' || hidden || !items.length) return null;

  const closeSession = () => { sessionStorage.setItem(storeKey, '1'); setHidden(true); };
  const act = async (id: string, action: 'send' | 'remind') => {
    setBusy(`${id}:${action}`); setNote('');
    try {
      const r = await api.post(`/campaigns/${id}/${action}`, action === 'remind' ? { hours: 24 } : undefined);
      setNote(action === 'send'
        ? `Sent to ${r.data.sent} recipient(s)${r.data.skipped ? `, skipped ${r.data.skipped} opted-out` : ''}.`
        : 'Snoozed for 24 hours.');
      await refetch();
      qc.invalidateQueries({ queryKey: ['camps'] });
      if (action === 'remind') qc.invalidateQueries({ queryKey: ['campaign-reminders'] });
    } catch (e: any) { setNote(e.message); } finally { setBusy(''); }
  };

  return (
    <div
      onClick={closeSession}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(71,16,29,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ background: '#FFFFFF', maxWidth: 620, width: '100%', maxHeight: '90vh', overflowY: 'auto', borderTop: '4px solid var(--color-gold-deep)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Campaigns ready to send</h3>
            <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: 13 }}>
              {items.length} approved campaign{items.length > 1 ? 's' : ''} waiting. Send now or be reminded later.
            </p>
          </div>
          <button className="btn ghost" onClick={closeSession}>✕</button>
        </div>

        {note && <div className="card" style={{ margin: '12px 0 0', fontSize: 13 }}>{note}</div>}

        <div style={{ marginTop: 12 }}>
          {items.map((c) => (
            <div key={c.id} style={{ padding: '12px 0', borderTop: '1px solid var(--color-border)' }}>
              <strong>{c.name}</strong>
              <div style={{ color: 'var(--color-muted)', fontSize: 13, margin: '4px 0' }}>{c.template}</div>
              <small style={{ color: 'var(--color-muted)' }}>{c.channel} • {c.mode} • {c.offer_code || 'no offer'} • due {fmt(c.schedule_at)}</small>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn gold" disabled={busy === `${c.id}:send`} onClick={() => act(c.id, 'send')}>Send now</button>
                <button className="btn ghost" disabled={busy === `${c.id}:remind`} onClick={() => act(c.id, 'remind')}>Remind later</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn ghost" onClick={closeSession}>Not now</button>
        </div>
      </div>
    </div>
  );
}
