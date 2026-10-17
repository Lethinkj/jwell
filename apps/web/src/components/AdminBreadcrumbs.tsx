import { Link, useLocation } from 'react-router-dom';
import { Icon, ICONS } from './icons';

interface Crumb {
  label: string;
  to?: string;
}

export default function AdminBreadcrumbs() {
  const loc = useLocation();
  const path = loc.pathname;

  const crumbs: Crumb[] = [{ label: 'Admin', to: '/admin' }];

  if (path === '/admin') {
    crumbs.push({ label: 'Overview' });
  } else if (path.startsWith('/admin/billing')) {
    crumbs.push({ label: 'Billing', to: '/admin/billing/new' });
    if (path === '/admin/billing/history') {
      crumbs.push({ label: 'Billing History' });
    } else {
      crumbs.push({ label: 'New Bill' });
    }
  } else if (path.startsWith('/admin/inventory')) {
    crumbs.push({ label: 'Inventory', to: '/admin/inventory' });
    if (path === '/admin/inventory/new') {
      crumbs.push({ label: 'Add Product' });
    } else if (path === '/admin/inventory/report') {
      crumbs.push({ label: 'Purchase Report' });
    } else {
      crumbs.push({ label: 'Overview' });
    }
  } else if (path === '/admin/barcodes') {
    crumbs.push({ label: 'Barcode Generator' });
  } else if (path.startsWith('/admin/customers')) {
    crumbs.push({ label: 'Customers & CRM', to: '/admin/customers' });
    crumbs.push({ label: path === '/admin/customers/new' ? 'New Customer' : 'All Customers' });
  } else if (path === '/admin/staff') {
    crumbs.push({ label: 'Staff Management' });
  } else if (path === '/admin/rates') {
    crumbs.push({ label: 'Gold Rates' });
  } else if (path === '/admin/campaigns') {
    crumbs.push({ label: 'Offers & Campaigns' });
  } else if (path === '/admin/reports') {
    crumbs.push({ label: 'Reports & Analytics' });
  } else if (path === '/admin/settings') {
    crumbs.push({ label: 'Store Settings' });
  } else if (path === '/admin/email') {
    crumbs.push({ label: 'Email' });
  } else if (path === '/admin/audit') {
    crumbs.push({ label: 'Audit Logs' });
  } else {
    const segments = path.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
    segments.forEach((seg, i) => {
      const isLast = i === segments.length - 1;
      crumbs.push({
        label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
        to: isLast ? undefined : `/admin/${segments.slice(0, i + 1).join('/')}`,
      });
    });
  }

  return (
    <nav
      aria-label="Breadcrumbs"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        fontSize: 13,
        color: 'var(--color-muted)',
        background: '#FFFFFF',
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
      }}
    >
      <Icon paths={ICONS.home} size={14} style={{ marginRight: 2 }} />
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {idx > 0 && <span style={{ color: 'var(--color-border)', fontSize: 11, fontWeight: 700 }}>›</span>}
            {isLast || !crumb.to ? (
              <span style={{ color: 'var(--color-espresso)', fontWeight: 700 }}>{crumb.label}</span>
            ) : (
              <Link
                to={crumb.to}
                style={{
                  color: 'var(--color-muted)',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--color-gold-deep)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--color-muted)')}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
