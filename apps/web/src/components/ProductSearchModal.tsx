import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../lib/api';
import { pieceImage, onImgError } from '../lib/images';
import Modal, { ModalSearch } from './Modal';
import ProductDetailModal from './ProductDetailModal';
import { Icon, ICONS } from './icons';

interface Props {
  onClose: () => void;
  onAdd: (product: any) => void | Promise<void>;
  /** Product ids already on the bill — their Add button becomes "Added". */
  addedIds?: string[];
  title?: string;
  subtitle?: string;
}

/**
 * Searchable stock picker used by the POS. It queries the catalogue only when
 * the Search button (or Enter) is pressed, then lets staff add a piece to the
 * bill or open the complete product record without leaving the till.
 */
export default function ProductSearchModal({ onClose, onAdd, addedIds = [], title, subtitle }: Props) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const products = useQuery({
    queryKey: ['pos-product-search', q],
    queryFn: () => api.get(`/products?q=${encodeURIComponent(q)}&status=available&limit=40`),
  });
  const rows: any[] = products.data?.data || [];
  const added = new Set(addedIds);

  const runSearch = () => setQ(input.trim());

  const add = async (p: any) => {
    setAddingId(p.id);
    setNote('');
    try {
      await onAdd(p);
      setNote(`${p.name} (${p.sku}) added to this bill.`);
    } catch (e: any) {
      setNote(e.message || 'Could not add this piece.');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <>
      <Modal
        title={title || 'Search jewellery pieces'}
        subtitle={subtitle || 'Find an available piece by name, SKU or design code. Add it to the bill or open its full record.'}
        icon={<Icon paths={ICONS.search} size={19} />}
        onClose={onClose}
        size="xl"
        footer={
          <>
            <span className="modal-hint">{products.data ? `${rows.length} piece${rows.length === 1 ? '' : 's'} found` : 'Type a query and press Search.'}</span>
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          </>
        }
      >
        <ModalSearch
          value={input}
          onChange={setInput}
          onSearch={runSearch}
          placeholder="Search by name, SKU or design code…"
        />

        {note && <div className="modal-note" style={{ marginBottom: 12 }}>{note}</div>}

        {products.isLoading && <div className="empty">Loading stock…</div>}
        {products.isError && <div className="err-box">Could not load the stock list.</div>}

        {!products.isLoading && !products.isError && rows.length === 0 && (
          <div className="empty">
            No available pieces match “{q || 'this search'}”. Try a broader search or clear the query.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((p: any) => {
            const isAdded = added.has(p.id);
            return (
              <div key={p.id} className="row-card" onClick={() => setDetailId(p.id)} title="Open full piece details">
                <img src={pieceImage({ image_url: p.image_url, category_slug: p.category_slug })} alt={p.name} loading="lazy" onError={(e) => onImgError(e, p.sku)} />
                <div className="row-main">
                  <strong>{p.name}</strong>
                  <small>{p.sku} • {p.category_name || '—'} • {p.purity} • {Number(p.net_gold_weight_g || 0)} g</small>
                  <div style={{ marginTop: 3, fontSize: 12, color: '#6B5B49' }}>
                    Acquisition {inr(p.acquisition_cost_inr)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn ghost sm" onClick={() => setDetailId(p.id)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon paths={ICONS.gem} size={13} />Details</span>
                  </button>
                  <button type="button" className="btn gold sm" disabled={isAdded || addingId === p.id} onClick={() => add(p)}>
                    {isAdded ? '✓ Added' : addingId === p.id ? 'Adding…' : '+ Add'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {detailId && (
        <ProductDetailModal
          productId={detailId}
          onClose={() => setDetailId(null)}
          onAddToBill={add}
          addDisabled={added.has(detailId)}
          addLabel={added.has(detailId) ? 'Already on bill' : '+ Add to bill'}
        />
      )}
    </>
  );
}
