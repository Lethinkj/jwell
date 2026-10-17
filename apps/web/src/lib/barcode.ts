import bwipjs from 'bwip-js';

export type BarcodeRenderOptions = {
  /** Pixels per module. Higher = crisper / larger source image. */
  scale?: number;
  /** Bar height in bwip-js units (millimetres). */
  height?: number;
  includetext?: boolean;
};

const DEFAULTS: Required<BarcodeRenderOptions> = { scale: 4, height: 15, includetext: false };

/** Options shared by preview + download so generated and downloaded barcodes
 *  are identical. Code 128 needs a 10-module quiet zone on each side — without
 *  it many handheld/phone scanners fail to lock on. */
function options(value: string, opts: BarcodeRenderOptions) {
  return {
    bcid: 'code128',
    text: value,
    scale: opts.scale ?? DEFAULTS.scale,
    height: opts.height ?? DEFAULTS.height,
    includetext: opts.includetext ?? DEFAULTS.includetext,
    backgroundcolor: 'FFFFFF',
    paddingwidth: 10,
    paddingheight: 2,
  };
}

/** Draw a Code 128 barcode onto an existing canvas. Returns false for invalid values. */
export function drawBarcode(canvas: HTMLCanvasElement, value: string, opts: BarcodeRenderOptions = {}): boolean {
  try {
    bwipjs.toCanvas(canvas, options(value, opts));
    return true;
  } catch {
    return false;
  }
}

/** Render a Code 128 barcode onto a fresh canvas. Returns null for invalid values. */
export function renderBarcode(value: string, opts: BarcodeRenderOptions = {}): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  return drawBarcode(canvas, value, opts) ? canvas : null;
}

/** Barcode as a PNG data URL (for <img> preview). */
export function barcodeDataUrl(value: string, opts?: BarcodeRenderOptions): string | null {
  const canvas = renderBarcode(value, opts);
  return canvas ? canvas.toDataURL('image/png') : null;
}

/** Filesystem-safe filename for a barcode value/SKU. */
export function barcodeFilename(value: string): string {
  return `barcode-${value.replace(/[^a-z0-9._-]+/gi, '_')}`;
}

/** Download the barcode as a high-resolution PNG. Returns false if rendering failed. */
export function downloadBarcode(value: string, filename: string, opts?: BarcodeRenderOptions): boolean {
  const canvas = renderBarcode(value, { scale: 6, height: 20, ...opts });
  if (!canvas) return false;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
  return true;
}
