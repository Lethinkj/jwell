import { useEffect, useRef } from 'react';
import bwipjs from 'bwip-js';
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
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      bwipjs.toCanvas(canvasRef.current, {
        bcid: 'code128', text: data.barcode_value,
        scale: 3, height: 10, includetext: false, backgroundcolor: 'FFFFFF',
      });
    } catch { /* invalid value — SKU shown below regardless */ }
  }, [data.barcode_value]);
  const w = Number(data.label.width_mm) || 50;
  const h = Number(data.label.height_mm) || 30;
  const m = Number(data.label.margin_mm) || 2;
  return (
    <div className="print-sheet" style={{
      width: `${w}mm`, minHeight: `${h}mm`, padding: `${m}mm`, background: '#fff',
      border: '1px dashed var(--color-border)', borderRadius: 4, textAlign: 'center',
      fontSize: 11, lineHeight: 1.35, pageBreakInside: 'avoid',
    }}>
      <div style={{ fontWeight: 700 }}>{data.shop_name}</div>
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
      <canvas ref={canvasRef} style={{ maxWidth: '100%' }} />
      <div style={{ fontWeight: 700, letterSpacing: 1 }}>{data.sku}</div>
      <div style={{ color: 'var(--color-muted)' }}>{data.purity} • {data.net_gold_weight_g} g</div>
      {data.price_estimate_inr != null && <div style={{ fontWeight: 700 }}>{inr(data.price_estimate_inr)}</div>}
    </div>
  );
}
