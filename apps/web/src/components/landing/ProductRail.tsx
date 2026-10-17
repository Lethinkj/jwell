import { useRef } from 'react';
import ProductCard from './ProductCard';
import { LandIcon } from './landingIcons';

export default function ProductRail({ products, rate24 }: { products: any[]; rate24?: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 260), behavior: 'smooth' });
  };
  return (
    <div className="lp-rail">
      <button type="button" className="lp-rail-nav lp-rail-prev" aria-label="Scroll left" onClick={() => scroll(-1)}>
        <LandIcon name="chevronLeft" size={18} />
      </button>
      <div className="lp-rail-track" ref={ref}>
        {products.map((p) => <ProductCard key={p.id} p={p} rate24={rate24} />)}
      </div>
      <button type="button" className="lp-rail-nav lp-rail-next" aria-label="Scroll right" onClick={() => scroll(1)}>
        <LandIcon name="chevronRight" size={18} />
      </button>
    </div>
  );
}
