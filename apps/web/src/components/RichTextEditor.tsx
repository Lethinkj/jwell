import { useEffect, useRef, useState } from 'react';

export type Placeholder = { key: string; label: string };

const EMOJI = ['🎂', '🎉', '💍', '✨', '🎁', '💐', '🪔', '❤️', '🙏', '🎊', '🛍️', '⭐'];

/**
 * Dependency-free rich-text editor (contentEditable + execCommand) with a
 * toolbar for basic formatting, emoji, and inserting {{placeholder}} tokens
 * (customer name, dates, shop details…). Emits HTML via onChange.
 */
export default function RichTextEditor({
  value, onChange, placeholders = [], minHeight = 160,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholders?: Placeholder[];
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>('\u0000');
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== last.current && document.activeElement !== el) {
      el.innerHTML = value || '';
      last.current = value;
    }
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    last.current = el.innerHTML;
    onChange(el.innerHTML);
  };
  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    emit();
  };
  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      // No caret inside the editor — append at the end.
      el.innerHTML += text;
    } else {
      document.execCommand('insertText', false, text);
    }
    emit();
  };

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" className="rt-btn" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div className="rt-editor">
      <div className="rt-toolbar">
        <Btn title="Bold" onClick={() => exec('bold')}><b>B</b></Btn>
        <Btn title="Italic" onClick={() => exec('italic')}><i>I</i></Btn>
        <Btn title="Underline" onClick={() => exec('underline')}><u>U</u></Btn>
        <Btn title="Strikethrough" onClick={() => exec('strikeThrough')}><s>S</s></Btn>
        <Btn title="Bullet list" onClick={() => exec('insertUnorderedList')}>•≡</Btn>
        <Btn title="Numbered list" onClick={() => exec('insertOrderedList')}>1≡</Btn>
        <Btn title="Clear formatting" onClick={() => exec('removeFormat')}>⌫</Btn>
        <span className="rt-sep" />
        <select
          className="rt-select"
          value=""
          title="Insert placeholder"
          onChange={(e) => { if (e.target.value) insert(e.target.value); e.target.value = ''; }}
        >
          <option value="">Insert ▾</option>
          {placeholders.map((p) => <option key={p.key} value={`{{${p.key}}}`}>{p.label}</option>)}
        </select>
        <div style={{ position: 'relative' }}>
          <Btn title="Emoji" onClick={() => setEmojiOpen((o) => !o)}>🙂</Btn>
          {emojiOpen && (
            <div className="rt-emoji" onMouseLeave={() => setEmojiOpen(false)}>
              {EMOJI.map((e) => (
                <button key={e} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { insert(e); setEmojiOpen(false); }}>{e}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        className="rt-area"
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        style={{ minHeight }}
      />
    </div>
  );
}
