import { useState } from 'react';
import { inr } from '../lib/api';

interface ManualPieceData {
  name: string;
  sku: string;
  purity: string;
  gross_weight_g: number;
  net_gold_weight_g: number;
  rate_24k_per_g_inr: number;
  making_charge_type: 'percentage' | 'per_gram' | 'flat';
  making_charge_value: number;
  stone_value_inr: number;
  wastage_charge_inr: number;
  other_charges_inr: number;
}

interface Props {
  defaultRate24k?: number;
  onAddPiece: (piece: any) => void;
  onClose: () => void;
}

export default function ManualPieceModal({ defaultRate24k = 8000, onAddPiece, onClose }: Props) {
  const [form, setForm] = useState<ManualPieceData>({
    name: '',
    sku: `JEW-${Date.now().toString().slice(-4)}`,
    purity: '22K',
    gross_weight_g: 0,
    net_gold_weight_g: 0,
    rate_24k_per_g_inr: defaultRate24k,
    making_charge_type: 'percentage',
    making_charge_value: 12,
    stone_value_inr: 0,
    wastage_charge_inr: 0,
    other_charges_inr: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Purity conversion factors
  const purityFactors: Record<string, number> = {
    '24K': 1.0,
    '22K': 22 / 24, // 0.9167
    '18K': 18 / 24, // 0.75
    '14K': 14 / 24, // 0.5833
  };

  const factor = purityFactors[form.purity] || (22 / 24);
  const goldValue = Math.round(form.net_gold_weight_g * (form.rate_24k_per_g_inr * factor) * 100) / 100;

  let makingCharge = 0;
  if (form.making_charge_type === 'percentage') {
    makingCharge = Math.round(goldValue * (form.making_charge_value / 100) * 100) / 100;
  } else if (form.making_charge_type === 'per_gram') {
    makingCharge = Math.round(form.net_gold_weight_g * form.making_charge_value * 100) / 100;
  } else {
    makingCharge = Math.round(form.making_charge_value * 100) / 100;
  }

  const subtotal = Math.round((goldValue + makingCharge + Number(form.stone_value_inr || 0) + Number(form.wastage_charge_inr || 0) + Number(form.other_charges_inr || 0)) * 100) / 100;
  const tax = Math.round(subtotal * 0.03 * 100) / 100;
  const lineTotal = Math.round((subtotal + tax) * 100) / 100;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Piece Name is mandatory.';
    if (!form.sku.trim()) errs.sku = 'SKU / Code is mandatory.';
    if (!form.purity) errs.purity = 'Gold Purity is mandatory.';
    if (!form.gross_weight_g || form.gross_weight_g <= 0) errs.gross_weight_g = 'Gross weight must be > 0.';
    if (!form.net_gold_weight_g || form.net_gold_weight_g <= 0) {
      errs.net_gold_weight_g = 'Net gold weight must be > 0.';
    } else if (Number(form.net_gold_weight_g) > Number(form.gross_weight_g)) {
      errs.net_gold_weight_g = 'Net weight cannot exceed gross weight.';
    }
    if (!form.rate_24k_per_g_inr || form.rate_24k_per_g_inr <= 0) errs.rate_24k_per_g_inr = 'Gold rate must be > 0.';
    if (form.making_charge_value < 0 || isNaN(form.making_charge_value)) errs.making_charge_value = 'Making charge is mandatory.';
    if (form.stone_value_inr < 0 || isNaN(form.stone_value_inr)) errs.stone_value_inr = 'Stone value is mandatory (enter 0 if none).';
    if (form.wastage_charge_inr < 0 || isNaN(form.wastage_charge_inr)) errs.wastage_charge_inr = 'Wastage charge is mandatory (enter 0 if none).';
    if (form.other_charges_inr < 0 || isNaN(form.other_charges_inr)) errs.other_charges_inr = 'Other charges is mandatory (enter 0 if none).';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAdd = () => {
    if (!validate()) return;

    const manualItem = {
      product_id: `man_${Date.now()}`,
      sku: form.sku.trim(),
      name: form.name.trim(),
      purity: form.purity,
      net_gold_weight_g: Number(form.net_gold_weight_g),
      gross_weight_g: Number(form.gross_weight_g),
      manual_item: {
        name: form.name.trim(),
        sku: form.sku.trim(),
        purity: form.purity,
        gross_weight_g: Number(form.gross_weight_g),
        net_gold_weight_g: Number(form.net_gold_weight_g),
        making_charge_type: form.making_charge_type,
        making_charge_value: Number(form.making_charge_value),
        stone_value_inr: Number(form.stone_value_inr),
        wastage_charge_inr: Number(form.wastage_charge_inr),
        other_charges_inr: Number(form.other_charges_inr),
      },
      est: {
        gold_value_inr: goldValue,
        making_charge_inr: makingCharge,
        stone_value_inr: Number(form.stone_value_inr),
        wastage_charge_inr: Number(form.wastage_charge_inr),
        other_charges_inr: Number(form.other_charges_inr),
        subtotal_inr: subtotal,
        tax_inr: tax,
        line_total_inr: lineTotal,
        rate_24k_per_g_inr: form.rate_24k_per_g_inr,
      },
    };

    onAddPiece(manualItem);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(59, 48, 43, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: '#fff',
          borderRadius: 14,
          padding: 22,
          boxShadow: '0 20px 45px rgba(59,48,43,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--color-espresso)', fontSize: 22 }}>
              Manual Jewellery Piece Entry
            </h2>
            <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              All fields are mandatory. Gold value and making charges are calculated automatically.
            </div>
          </div>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {/* Piece Name */}
          <div style={{ gridColumn: 'span 2' }}>
            <label className="lbl" style={{ marginTop: 0 }}>Piece / Item Name *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Traditional Gold Choker / Diamond Ring"
            />
            {errors.name && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.name}</div>}
          </div>

          {/* SKU */}
          <div>
            <label className="lbl">SKU / Item Code *</label>
            <input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="e.g. RNG-101"
            />
            {errors.sku && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.sku}</div>}
          </div>

          {/* Purity */}
          <div>
            <label className="lbl">Gold Purity *</label>
            <select
              value={form.purity}
              onChange={(e) => setForm({ ...form, purity: e.target.value })}
            >
              <option value="22K">22K (916 Hallmarked)</option>
              <option value="18K">18K (750 Gold)</option>
              <option value="24K">24K (999 Pure Gold)</option>
              <option value="14K">14K (585 Gold)</option>
            </select>
          </div>

          {/* Gross Weight */}
          <div>
            <label className="lbl">Gross Weight (grams) *</label>
            <input
              type="number"
              step="any"
              min="0.001"
              value={form.gross_weight_g || ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setForm({
                  ...form,
                  gross_weight_g: val,
                  net_gold_weight_g: form.net_gold_weight_g === 0 || form.net_gold_weight_g > val ? val : form.net_gold_weight_g,
                });
              }}
              placeholder="e.g. 10.500"
            />
            {errors.gross_weight_g && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.gross_weight_g}</div>}
          </div>

          {/* Net Gold Weight */}
          <div>
            <label className="lbl">Net Gold Weight (grams) *</label>
            <input
              type="number"
              step="any"
              min="0.001"
              value={form.net_gold_weight_g || ''}
              onChange={(e) => setForm({ ...form, net_gold_weight_g: parseFloat(e.target.value) || 0 })}
              placeholder="e.g. 10.000"
            />
            {errors.net_gold_weight_g && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.net_gold_weight_g}</div>}
          </div>

          {/* 24K Rate */}
          <div>
            <label className="lbl">24K Gold Rate (₹ / gram) *</label>
            <input
              type="number"
              step="any"
              min="1"
              value={form.rate_24k_per_g_inr}
              onChange={(e) => setForm({ ...form, rate_24k_per_g_inr: parseFloat(e.target.value) || 0 })}
            />
            {errors.rate_24k_per_g_inr && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.rate_24k_per_g_inr}</div>}
          </div>

          {/* Making Charge Type & Value */}
          <div>
            <label className="lbl">Making Charges *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={form.making_charge_type}
                onChange={(e) => setForm({ ...form, making_charge_type: e.target.value as any })}
                style={{ width: '45%' }}
              >
                <option value="percentage">%</option>
                <option value="per_gram">₹/g</option>
                <option value="flat">Flat ₹</option>
              </select>
              <input
                type="number"
                step="any"
                min="0"
                value={form.making_charge_value}
                onChange={(e) => setForm({ ...form, making_charge_value: parseFloat(e.target.value) || 0 })}
                placeholder="Value"
                style={{ flex: 1 }}
              />
            </div>
            {errors.making_charge_value && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.making_charge_value}</div>}
          </div>

          {/* Stone Value */}
          <div>
            <label className="lbl">Stone Value (₹) *</label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.stone_value_inr}
              onChange={(e) => setForm({ ...form, stone_value_inr: parseFloat(e.target.value) || 0 })}
              placeholder="0 if none"
            />
            {errors.stone_value_inr && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.stone_value_inr}</div>}
          </div>

          {/* Wastage / Other Charges */}
          <div>
            <label className="lbl">Wastage / Other Charges (₹) *</label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.wastage_charge_inr}
              onChange={(e) => setForm({ ...form, wastage_charge_inr: parseFloat(e.target.value) || 0 })}
              placeholder="0 if none"
            />
            {errors.wastage_charge_inr && <div style={{ color: 'var(--color-error)', fontSize: 11, marginTop: 2 }}>{errors.wastage_charge_inr}</div>}
          </div>
        </div>

        {/* Live Calculation Preview */}
        <div style={{ marginTop: 16, padding: 14, background: '#FAF6F1', borderRadius: 8, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>Calculated Gold Value:</span>
            <strong>{inr(goldValue)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>Making Charges:</span>
            <strong>{inr(makingCharge)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span>Applicable GST (3%):</span>
            <span>{inr(tax)}</span>
          </div>
          <hr style={{ borderColor: 'var(--color-border)', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 16, fontWeight: 700, color: 'var(--color-gold-deep)' }}>
            <span>Estimated Piece Total:</span>
            <span>{inr(lineTotal)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn gold" onClick={handleAdd} style={{ padding: '10px 22px' }}>
            + Add Piece to Bill
          </button>
        </div>
      </div>
    </div>
  );
}
