import { useEffect, useRef } from 'react';
import { barcodeFilename, downloadBarcode, drawBarcode } from '../lib/barcode';
import { inr } from '../lib/api';

export type LabelData = {
  shop_name: string; sku: string; name: string; purity: string;
  gross_weight_g: number; net_gold_weight_g: number; category_name: string;
  barcode_value: string; barcode_type: string; price_estimate_inr: number | null;
  label: { width_mm: string; height_mm: string; margin_mm: string };
};

/** Printable Code-128 label. Barcode VALUE lives in the DB; this only renders it.
 *  No costs/pricing are encoded — at most an admin-enabled estimate is printed as text. */
export default function BarcodeLabel({ data }: { data: LabelData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const w = Number(data.label.width_mm) || 50;
  const h = Number(data.label.height_mm) || 30;
  const m = Number(data.label.margin_mm) || 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.barcode_value) return;
    const BAR_HEIGHT = 12;
    // Measure the symbol in "modules" (px at scale 1) so we can pick an integer
    // scale. Integer scaling keeps every bar the same width — non-integer
    // scaling is the usual reason a printed/rendered Code 128 won't scan.
    if (!drawBarcode(canvas, data.barcode_value, { scale: 1, height: BAR_HEIGHT })) return;
    const modules = canvas.width;
    // Usable label width in CSS px (browsers map 1in = 96px).
    const availPx = Math.max(24, (w - 2 * m) * 96 / 25.4);
    const fit = Math.max(1, Math.min(6, Math.floor(availPx / modules)));
    // Render at fit × devicePixelRatio so the source stays sharp on retina
    // screens and when printed; display at the integer fit size.
    const dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
    if (!drawBarcode(canvas, data.barcode_value, { scale: fit * dpr, height: BAR_HEIGHT })) return;
    const naturalPx = fit * modules;
    canvas.style.height = 'auto';
    if (naturalPx <= availPx + 1) {
      // Fits the label: show at native size, never CSS-downscaled (crisp bars).
      canvas.style.width = `${naturalPx}px`;
      canvas.style.imageRendering = 'pixelated';
    } else {
      // Very long value: let it shrink to the label width (smooth).
      canvas.style.width = '100%';
      canvas.style.imageRendering = 'auto';
    }
  }, [data.barcode_value, w, m]);

  return (
    <div className="print-sheet" style={{
      width: `${w}mm`, minHeight: `${h}mm`, padding: `${m}mm`, background: '#fff',
      border: '1px dashed var(--color-border)', borderRadius: 4, textAlign: 'center',
      fontSize: 11, lineHeight: 1.35, pageBreakInside: 'avoid',
    }}>
      <div style={{ fontWeight: 700 }}>{data.shop_name}</div>
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
      <canvas ref={canvasRef} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />
      <div style={{ fontWeight: 700, letterSpacing: 1 }}>{data.sku}</div>
      <div style={{ color: 'var(--color-muted)' }}>{data.purity} • {data.net_gold_weight_g} g</div>
      {data.price_estimate_inr != null && <div style={{ fontWeight: 700 }}>{inr(data.price_estimate_inr)}</div>}
      <button
        className="btn ghost no-print"
        style={{ marginTop: 6, fontSize: 11, padding: '4px 8px' }}
        onClick={() => downloadBarcode(data.barcode_value, barcodeFilename(data.sku))}
      >
        ⬇ Download PNG
      </button>
    </div>
  );
}
