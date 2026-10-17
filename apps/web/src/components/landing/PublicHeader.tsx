import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/auth';
import { api, inr } from '../../lib/api';
import { LandIcon } from './landingIcons';

/* Shared public storefront header. Self-fetches categories and the live rate so
   it can be dropped on any public page; the landing page passes the data it has
   already loaded to avoid a duplicate request. */
const PHONE = '+91 80000 00000';

type Props = { categories?: any[]; rate?: any | null; phone?: string };

export default function PublicHeader({ categories, rate, phone = PHONE }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const catQ = useQuery({ queryKey: ['pub-products', 'nav'], queryFn: () => api.get('/public/products?limit=1'), enabled: categories === undefined });
  const rateQ = useQuery({ queryKey: ['pub-rate'], queryFn: () => api.get('/public/rates'), refetchInterval: 60000, enabled: rate === undefined });

  const cats: any[] = categories ?? catQ.data?.categories ?? [];
  const liveRate = rate ?? rateQ.data?.data ?? null;
  const shown = cats.slice(0, 6);

  const catLink = (c: any) => `/shop?cat=${encodeURIComponent(c.slug)}`;
  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') || '').trim();
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
  };

  return (
    <header className="lp-header">
      <div className="lp-announce">
        <div className="lp-wrap lp-announce-in">
          <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="lp-announce-call">
            <LandIcon name="phone" size={14} /> {phone}
          </a>
          <span className="lp-announce-mid">
            <LandIcon name="sparkle" size={14} /> BIS Hallmarked • Transparent weight &amp; rate pricing
          </span>
          {liveRate ? (
            <span className="lp-announce-rate">
              Today 24K <strong>{inr(liveRate.rate_24k_per_g_inr)}</strong>/g
            </span>
          ) : <span className="lp-announce-rate">Live gold rate updating…</span>}
        </div>
      </div>

      <div className="lp-wrap lp-head-row">
        <button type="button" className="lp-burger" aria-label="Menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
          <LandIcon name="menu" size={22} />
        </button>
        <Link to="/" className="lp-brand">
          <img src="/logo.png" alt="Shree Gold Palace" className="lp-brand-logo" />
          <span className="lp-brand-text">Shree <em>Gold Palace</em></span>
        </Link>

        <form className="lp-search" onSubmit={onSearch} role="search">
          <LandIcon name="search" size={18} />
          <input name="q" placeholder="Search designs, SKU…" aria-label="Search jewellery" />
          <button type="submit" className="lp-search-btn">Search</button>
        </form>

        <div className="lp-head-actions">
          <a className="lp-icon-btn" href={`tel:${phone.replace(/[^+\d]/g, '')}`} title="Call the store">
            <LandIcon name="phone" size={19} /><span>Call</span>
          </a>
          <a className="lp-icon-btn" href="#lp-store" title="Visit the store">
            <LandIcon name="pin" size={19} /><span>Store</span>
          </a>
          <Link className="lp-icon-btn" to={user ? '/admin' : '/login'} title="Account">
            <LandIcon name="user" size={19} /><span>{user ? 'Dashboard' : 'Sign in'}</span>
          </Link>
        </div>
      </div>

      <nav className="lp-nav" aria-label="Primary">
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="lp-nav-link">Home</Link>
          <div className={`lp-menu${menuOpen ? ' open' : ''}`} onMouseEnter={() => setMenuOpen(true)} onMouseLeave={() => setMenuOpen(false)}>
            <button type="button" className="lp-nav-link lp-nav-trigger" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
              Jewellery <LandIcon name="chevronDown" size={14} />
            </button>
            <div className="lp-mega">
              <div className="lp-mega-inner">
                <p className="lp-mega-title">Shop by category</p>
                <div className="lp-mega-grid">
                  {(cats.length ? cats : [{ name: 'All collections', slug: '' }]).map((c) => (
                    <Link key={c.id || c.slug} to={c.slug ? catLink(c) : '/shop'} onClick={() => setMenuOpen(false)}>{c.name}</Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {shown.map((c) => <Link key={c.id} to={catLink(c)} className="lp-nav-link">{c.name}</Link>)}
          <Link to="/shop" className="lp-nav-link">All Collections</Link>
          <a href="#lp-rate" className="lp-nav-link">Gold Pricing</a>
          <a href="#lp-store" className="lp-nav-link">Store</a>
        </div>
      </nav>

      {mobileOpen && (
        <div className="lp-mobile">
          <form className="lp-search lp-search-mobile" onSubmit={onSearch} role="search">
            <LandIcon name="search" size={18} />
            <input name="q" placeholder="Search designs, SKU…" aria-label="Search jewellery" />
            <button type="submit" className="lp-search-btn">Go</button>
          </form>
          <div className="lp-mobile-links">
            <Link to="/" onClick={() => setMobileOpen(false)}>Home</Link>
            <Link to="/shop" onClick={() => setMobileOpen(false)}>All Collections</Link>
            {(cats || []).map((c) => (
              <Link key={c.id} to={catLink(c)} onClick={() => setMobileOpen(false)}>{c.name}</Link>
            ))}
            <a href="#lp-store" onClick={() => setMobileOpen(false)}>Store</a>
            <Link to={user ? '/admin' : '/login'} onClick={() => setMobileOpen(false)}>{user ? 'Dashboard' : 'Staff sign in'}</Link>
          </div>
        </div>
      )}
    </header>
  );
}
