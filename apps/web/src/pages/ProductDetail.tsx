import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, inr } from '../lib/api';
import { storefrontImage, onImgError } from '../lib/images';
import { LandIcon } from '../components/landing/landingIcons';
import './landing.css';

export default function ProductDetail() {
  const { id } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ['pub-p', id], queryFn: () => api.get(`/public/products/${id}`) });
  const rate = useQuery({ queryKey: ['pub-rate'], queryFn: () => api.get('/public/rates'), refetchInterval: 60000 });

  if (isLoading) return <div className="lp-landing"><div className="lp-wrap" style={{ padding: 24 }}><div className="skeleton" style={{ height: 340, borderRadius: 16 }} /></div></div>;
  if (isError) return <div className="lp-landing"><div className="lp-wrap" style={{ padding: 24 }}><div className="err-box">Piece not found or sold.</div></div></div>;

  const p = data.data;
  const r24 = rate.data?.data?.rate_24k_per_g_inr;
  const factor: Record<string, number> = { '24K': 1, '22K': 0.916, '18K': 0.75, '14K': 0.585 };
  const gold = r24 ? p.net_gold_weight_g * r24 * (factor[p.purity] || 1) : null;
  const stones = (p.stone_value_inr || 0) + (p.wastage_charge_inr || 0);
  const est = gold != null ? gold + stones : null;

  return (
    <div className="lp-landing">
      <section className="lp-hero-sm">
        <div className="lp-wrap">
          <nav className="lp-crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link><span>›</span>
            <Link to="/shop">Collections</Link><span>›</span>
            {p.category_slug
              ? <Link to={`/shop?cat=${encodeURIComponent(p.category_slug)}`}>{p.category_name}</Link>
              : <span>{p.category_name}</span>}
          </nav>
        </div>
      </section>

      <div className="lp-wrap">
        <div className="lp-pd">
          <div className="lp-pd-media">
            <img src={storefrontImage(p)} alt={p.name} onError={(e) => onImgError(e, p.sku || p.id)} />
          </div>

          <div>
            <span className="lp-pd-cat">{p.category_name}</span>
            <h1>{p.name}</h1>
            <p className="lp-pd-meta">
              SKU {p.sku}{p.design_code ? ` • Design ${p.design_code}` : ''} • {p.purity} • Net {p.net_gold_weight_g} g (gross {p.gross_weight_g} g)
            </p>

            <div className="lp-pd-price">
              <h3>Price estimate</h3>
              <div className="lp-price-row"><span>Gold value (net weight × rate × purity)</span><span>{gold != null ? inr(gold) : '—'}</span></div>
              <div className="lp-price-row"><span>Stone / wastage</span><span>{inr(stones)}</span></div>
              <div className="lp-price-row"><span>Making charge</span><span>{p.making_charge_type} {p.making_charge_value}</span></div>
              <div className="lp-pd-total"><span>Estimated total</span><span>{est != null ? inr(est) : 'On request'}</span></div>
              <p className="lp-pd-note">
                Rate {r24 ? `${inr(r24)}/g 24K • ${new Date(rate.data.data.observed_at).toLocaleString()}` : 'updating…'} —
                estimate only. Final price is computed in-store from verified weight, making charge and GST.
              </p>
            </div>

            <div className="lp-hero-cta" style={{ marginTop: 18 }}>
              <a
                className="btn gold"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                href={`https://wa.me/918000000000?text=${encodeURIComponent('Enquiry for ' + p.sku + ' ' + p.name)}`}
              >
                <LandIcon name="whatsapp" size={17} /> Enquire on WhatsApp
              </a>
              <Link className="btn ghost" to="/shop" style={{ textDecoration: 'none' }}>Back to collections</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
