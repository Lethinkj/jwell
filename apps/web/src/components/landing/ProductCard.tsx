import { Link } from 'react-router-dom';
import { inr } from '../../lib/api';
import { estimatePrice } from './estimate';
import { storefrontImage, onImgError } from '../../lib/images';

export default function ProductCard({ p, rate24 }: { p: any; rate24?: number | null }) {
  const price = estimatePrice(p, rate24);
  const img = storefrontImage(p);
  return (
    <Link to={`/shop/${p.id}`} className="lp-card">
      <div className="lp-card-media">
        <img src={img} alt={p.name} loading="lazy" onError={(e) => onImgError(e, p.sku || p.id)} />
        <span className="lp-card-badge">{p.purity}</span>
      </div>
      <div className="lp-card-body">
        <span className="lp-card-cat">{p.category_name || 'Jewellery'}</span>
        <strong className="lp-card-name">{p.name}</strong>
        <span className="lp-card-meta">{Number(p.net_gold_weight_g || 0).toFixed(2)} g net</span>
        <span className="lp-card-price">{price ? inr(price) : 'Price on request'}</span>
      </div>
    </Link>
  );
}
