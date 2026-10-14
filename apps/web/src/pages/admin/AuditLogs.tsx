import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';

export default function AuditLogs() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['audit'], queryFn: () => api.get('/audit-logs') });
  const rows: any[] = (data?.data || []).filter((a: any) =>
    !q || `${a.action} ${a.entity_type} ${a.entity_id} ${a.summary}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <h1 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Audit Logs</h1>
      <p style={{ color: 'var(--color-muted)' }}>Staff creation, product changes, invoice finalization, voids, rate overrides, campaign approvals.</p>
      <input placeholder="Filter action / entity / summary…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420, marginBottom: 12 }} />
      {isLoading ? <div className="skeleton" style={{ height: 200 }} /> : (
        <div className="card"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th></tr></thead>
          <tbody>{rows.map((a: any) => (
            <tr key={a.id}><td><small>{new Date(a.created_at).toLocaleString()}</small></td><td><small>{a.actor_id?.slice(-6)}</small></td>
              <td><code>{a.action}</code></td><td><small>{a.entity_type}/{String(a.entity_id || '').slice(-8)}</small></td><td><small>{a.summary}</small></td></tr>))}
          </tbody></table></div>
          {rows.length === 0 && <div className="empty">No audit entries match.</div>}</div>)}
    </div>
  );
}
