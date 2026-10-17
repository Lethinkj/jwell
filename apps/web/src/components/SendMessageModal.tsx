import { useState } from 'react';
import RichTextEditor, { Placeholder } from './RichTextEditor';

type Props = {
  title: string;
  subtitle?: string;
  recipients?: number;
  placeholders: Placeholder[];
  defaultSubject: string;
  defaultBody: string;
  sending?: boolean;
  result?: string;
  onClose: () => void;
  onSend: (subject: string, body: string) => void;
};

/** "Edit & send" composer: tweak the default message with the rich editor, then send. */
export default function SendMessageModal({ title, subtitle, recipients, placeholders, defaultSubject, defaultBody, sending, result, onClose, onSend }: Props) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-label={title}>
      <div className="card" style={{ maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{title}</strong>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {subtitle && <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: '4px 0 10px' }}>{subtitle}</p>}
        <label className="lbl">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label className="lbl">Message</label>
        <RichTextEditor value={body} onChange={setBody} placeholders={placeholders} minHeight={200} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn gold" disabled={sending || recipients === 0} onClick={() => onSend(subject, body)}>
            {sending ? 'Sending…' : recipients == null ? 'Send' : `Send to ${recipients}`}
          </button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          {recipients === 0 && <small style={{ alignSelf: 'center', color: 'var(--color-muted)' }}>No recipients with consent + email.</small>}
        </div>
        {result && <div className="card" style={{ marginTop: 10 }}>{result}</div>}
      </div>
    </div>
  );
}
