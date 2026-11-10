import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../lib/api';
import { pieceImage, onImgError } from '../lib/images';
import Modal, { ModalSearch } from './Modal';
import ProductDetailModal from './ProductDetailModal';
import { Icon, ICONS } from './icons';

interface Props {
  /** Category name exactly as shown on the category-sales bar. */
  category: string;
  /** Report period preset shared with the sales report. */
  preset: string;
  onClose: () => void;
}

const dateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '—');

/**
 * Drill-down behind a "Category sales" bar: every piece of that category sold
 * in the selected period, with its buyer, and a click through to the complete
 * piece record.
 */
export default function CategorySalesModal({ category, preset, onClose }: Props) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const params = new URLSearchParams({ preset, category, q });
  const report = useQuery({
    queryKey: ['r-cat-products', preset, category, q],
    queryFn: () => api.get(`/reports/category-products?${params}`),
  });

  const rows: any[] = report.data?.data || [];
  const summary = report.data?.summary;

  return (
    <>
      <Modal
        title={`${category} — sold pieces`}
        subtitle="Pieces of this category sold in the selected period. Click any piece for its complete record, last sale and buying customer."
        icon={<Icon paths={ICONS.reports} size={19} />}
        onClose={onClose}
        size="xl"
        footer={
          <>
            <span className="modal-hint">
              {summary ? `${summary.pieces} piece${summary.pieces === 1 ? '' : 's'} · ${inr(summary.revenue)} · ${Number(summary.weight_g || 0).toFixed(2)} g` : 'Loading category sales…'}
            </span>
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          </>
        }
      >
        <ModalSearch
          value={input}
          onChange={setInput}
          onSearch={() => setQ(input.trim())}
          placeholder="Search by piece name, SKU, design code or invoice…"
        />

        {summary && (
          <div className="modal-kpis" style={{ marginBottom: 14 }}>
            <div className="modal-kpi">
              <small>Pieces sold</small>
              <strong>{summary.pieces}</strong>
            </div>
            <div className="modal-kpi">
              <small>Revenue</small>
              <strong>{inr(summary.revenue)}</strong>
            </div>
            <div className="modal-kpi">
              <small>Gold sold</small>
              <strong>{Number(summary.weight_g || 0).toFixed(2)} g</strong>
            </div>
            <div className="modal-kpi">
              <small>Customers</small>
              <strong>{summary.customers}</strong>
            </div>
            <div className="modal-kpi">
              <small>Last sold</small>
              <strong>{dateOnly(summary.last_sold_at)}</strong>
            </div>
          </div>
        )}

        {report.isLoading && <div className="empty">Loading sold pieces…</div>}
        {report.isError && <div className="err-box">Could not load this category’s sold pieces.</div>}

        {!report.isLoading && !report.isError && rows.length === 0 && (
          <div className="empty">
            No sold pieces in <strong>{category}</strong> for this period{q ? ` match “${q}”` : ''}.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r: any) => (
            <div
              key={r.sale_item_id}
              className="row-card"
              onClick={() => setDetailId(r.product_id)}
              title="Open the complete piece record"
            >
              <img
                src={pieceImage({ image_url: r.image_url, category_slug: r.category_slug })}
                alt={r.name}
                loading="lazy"
                onError={(e) => onImgError(e, r.sku)}
              />
              <div className="row-main">
                <strong>{r.name}</strong>
                <small>
                  {r.sku} • {r.purity || r.sold_purity || '—'} • {Number(r.net_gold_weight_g || 0)} g • sold {dateOnly(r.sold_at)}
                </small>
                <div style={{ marginTop: 3, fontSize: 12, color: '#6B5B49' }}>
                  {r.customer_name ? `${r.customer_name} (${r.customer_phone || '—'})` : 'Walk-in customer'}
                  {r.payment_methods ? ` • ${r.payment_methods}` : ''}
                  {r.invoice_no ? ` • ${r.invoice_no}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <strong style={{ display: 'block', color: '#6B4C13' }}>{inr(r.line_total_inr)}</strong>
                <small style={{ color: '#8A7860' }}>this piece</small>
              </div>
              <button
                type="button"
                className="btn ghost sm"
                onClick={(e) => { e.stopPropagation(); setDetailId(r.product_id); }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon paths={ICONS.gem} size={13} />Details
                </span>
              </button>
            </div>
          ))}
        </div>
      </Modal>

      {detailId && <ProductDetailModal productId={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
