import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../lib/api';

export default function ProductDetail() {
  const { id } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ['pub-p', id], queryFn: () => api.get(`/public/products/${id}`) });
  const rate = useQuery({ queryKey: ['pub-rate'], queryFn: () => api.get('/public/rates') });
  if (isLoading) return <div className="page" style={{ padding: 24 }}><div className="skeleton" style={{ height: 300 }} /></div>;
  if (isError) return <div className="page" style={{ padding: 24 }}><div className="err-box">Piece not found or sold.</div></div>;
  const p = data.data;
  const r24 = rate.data?.data?.rate_24k_per_g_inr;
  const factor: any = { '24K': 1, '22K': 0.916, '18K': 0.75, '14K': 0.585 };
  const est = r24 ? p.net_gold_weight_g * r24 * (factor[p.purity] || 1) : null;
  return (
    <div className="page" style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <img src={p.image_url || `https://picsum.photos/seed/${p.sku}/800/800`} alt={p.name} style={{ width: '100%', borderRadius: 14, border: '1px solid var(--color-border)' }} />
        <div>
          <p className="badge ok">{p.category_name}</p>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: '8px 0' }}>{p.name}</h1>
          <p style={{ color: 'var(--color-muted)' }}>SKU {p.sku}{p.design_code ? ` • Design ${p.design_code}` : ''} • {p.purity} • Net {p.net_gold_weight_g} g (gross {p.gross_weight_g} g)</p>
          <div className="card">
            <strong>Price breakdown (estimate)</strong>
            <table className="tbl"><tbody>
              <tr><td>Gold value</td><td>{est ? inr(est) : '—'}</td></tr>
              <tr><td>Making ({p.making_charge_type} {p.making_charge_value})</td><td>at billing</td></tr>
              <tr><td>Stone / wastage</td><td>{inr((p.stone_value_inr || 0) + (p.wastage_charge_inr || 0))}</td></tr>
            </tbody></table>
            <small style={{ color: 'var(--color-muted)' }}>Rate {r24 ? inr(r24) + '/g 24K • ' + new Date(rate.data.data.observed_at).toLocaleString() : 'updating…'} — estimate only, final price on verified weight + GST at store.</small>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <a className="btn gold" style={{ textDecoration: 'none' }} href={`https://wa.me/918000000000?text=${encodeURIComponent('Enquiry for ' + p.sku + ' ' + p.name)}`}>Enquire on WhatsApp</a>
          </div>
        </div>
      </div>
    </div>
  );
}
