import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

type Props = {
  onDetect: (value: string) => void;
  onClose: () => void;
  /** When set, the same code is ignored for this long (ms) — stops camera double-adds. */
  dedupeMs?: number;
  title?: string;
  onManualEntry?: () => void;
};

/** Camera barcode scanner: native BarcodeDetector fast-path, @zxing fallback.
 *  Permission is requested only after the user opens this modal. Tracks are
 *  released on close/unmount. Never uploads or stores frames. */
export default function ScannerModal({ onDetect, onClose, dedupeMs = 2500, title = 'Scan barcode', onManualEntry }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Starting camera…');
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!window.isSecureContext) {
      setError('Camera needs HTTPS or localhost (secure context). Use manual entry instead.');
      return;
    }
    let controls: { stop: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const reader = new BrowserMultiFormatReader();
        const inputs = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(inputs.map((d) => ({ deviceId: d.deviceId, label: d.label || 'Camera' })));
        const preferred = inputs.find((d) => /environment|rear|back|facing back/i.test(d.label)) || inputs[inputs.length - 1] || inputs[0];
        const chosen = deviceId || preferred?.deviceId;
        setStatus('Point the camera at a barcode…');
        controls = await reader.decodeFromVideoDevice(chosen, videoRef.current!, (result, err) => {
          if (cancelled) return;
          if (result) {
            const value = result.getText().trim();
            const now = Date.now();
            if (value && (value !== lastRef.current.value || now - lastRef.current.at > dedupeMs)) {
              lastRef.current = { value, at: now };
              setStatus(`Detected: ${value}`);
              onDetectRef.current(value);
            }
          }
          if (err && !String(err).includes('NotFound')) setStatus('Point the camera at a barcode…');
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow access in the browser, or use manual entry.'
          : `Camera unavailable (${e?.message || e}). Use manual entry.`);
      }
    })();
    return () => { cancelled = true; try { controls?.stop(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} role="dialog" aria-label={title}>
      <div className="card no-print" style={{ maxWidth: 480, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{title}</strong>
          <button className="btn ghost" onClick={onClose} aria-label="Close scanner">✕</button>
        </div>
        {error ? <div className="err-box" style={{ marginTop: 12 }}>{error}</div> : (
          <>
            <div style={{ position: 'relative', marginTop: 12, background: '#000', borderRadius: 10, overflow: 'hidden' }}>
              <video ref={videoRef} style={{ width: '100%', display: 'block' }} muted playsInline />
              <div style={{ position: 'absolute', inset: '18%', border: '2px solid var(--color-gold)', borderRadius: 8, pointerEvents: 'none' }} />
            </div>
            <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>{status}</p>
            {devices.length > 1 && (
              <select value={deviceId || ''} onChange={(e) => setDeviceId(e.target.value || undefined)} aria-label="Choose camera" style={{ marginTop: 8 }}>
                <option value="">Auto (rear preferred)</option>
                {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
              </select>
            )}
          </>
        )}
        {onManualEntry && (
          <div style={{ marginTop: 14 }}>
            <button
              className="btn gold"
              onClick={() => {
                onClose();
                onManualEntry();
              }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, padding: '10px 14px' }}
            >
              <span>✍️</span>
              <span>Manual Entry (Enter Piece Details)</span>
            </button>
          </div>
        )}
        <p style={{ color: 'var(--color-muted)', fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Tip: You can scan with camera, use a barcode gun, or click Manual Entry above.
        </p>
      </div>
    </div>
  );
}
