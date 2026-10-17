import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/auth';
import Landing from './pages/Landing';
import Catalogue from './pages/Catalogue';
import ProductDetail from './pages/ProductDetail';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import Inventory from './pages/admin/Inventory';
import InventoryNew from './pages/admin/InventoryNew';
import InventoryReport from './pages/admin/InventoryReport';
import InventoryDetail from './pages/admin/InventoryDetail';
import Billing from './pages/admin/Billing';
import Barcodes from './pages/admin/Barcodes';
import Customers from './pages/admin/Customers';
import Staff from './pages/admin/Staff';
import Rates from './pages/admin/Rates';
import Campaigns from './pages/admin/Campaigns';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';
import AuditLogs from './pages/admin/AuditLogs';
import AdminBreadcrumbs from './components/AdminBreadcrumbs';
import { Icon, ICONS } from './components/icons';
import { api } from './lib/api';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

const qc = new QueryClient();

type NavItem = { to: string; label: string; icon: string[]; end?: boolean };
const NAV_OVERVIEW: NavItem = { to: '/admin', label: 'Overview', icon: ICONS.overview, end: true };
const NAV_BARCODE: NavItem = { to: '/admin/barcodes', label: 'Barcode Generator', icon: ICONS.barcode };
const NAV_CUSTOMERS: NavItem = { to: '/admin/customers', label: 'Customers & CRM', icon: ICONS.customers };
const NAV_STAFF: NavItem = { to: '/admin/staff', label: 'Staff Management', icon: ICONS.staff };
const NAV_RATES: NavItem = { to: '/admin/rates', label: 'Gold Rates', icon: ICONS.rates };
const NAV_CAMPAIGNS: NavItem = { to: '/admin/campaigns', label: 'Offers & Campaigns', icon: ICONS.campaigns };
const NAV_REPORTS: NavItem = { to: '/admin/reports', label: 'Reports', icon: ICONS.reports };
const NAV_SETTINGS: NavItem = { to: '/admin/settings', label: 'Settings', icon: ICONS.settings };
const NAV_AUDIT: NavItem = { to: '/admin/audit', label: 'Audit Logs', icon: ICONS.audit };

function RatePill() {
  const { data } = useQuery({ queryKey: ['pub-rate'], queryFn: () => api.get('/public/rates'), refetchInterval: 60000 });
  const r = data?.data;
  if (!r) return <span className="rate-pill">Rate —</span>;
  const stale = data?.freshness?.status === 'stale';
  return <span className={`rate-pill${stale ? ' stale' : ''}`} title={`Source: ${r.source} • Updated ${new Date(r.observed_at).toLocaleString()}`}>
    Today 24K ₹{Number(r.rate_24k_per_g_inr).toLocaleString('en-IN')}/g{stale ? ' • stale' : ''}
  </span>;
}

function PublicNav() {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}><span className="brand">Shree <span>Gold Palace</span></span></Link>
      <nav className="nav">
        <NavLink to="/shop">Collections</NavLink>
        <RatePill />
        {user ? <><NavLink to="/admin">Dashboard</NavLink><button className="btn ghost" onClick={logout}>Logout</button></> : <NavLink to="/login">Staff Login</NavLink>}
      </nav>
    </header>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const inInventory = loc.pathname.startsWith('/admin/inventory');
  const [invOpen, setInvOpen] = useState(inInventory);
  const inBilling = loc.pathname.startsWith('/admin/billing');
  const [billingOpen, setBillingOpen] = useState<boolean>(true);
  useEffect(() => { if (inInventory) setInvOpen(true); }, [inInventory]);
  useEffect(() => { if (inBilling) setBillingOpen(true); }, [inBilling]);
  if (loading) return <div className="main"><div className="skeleton" style={{ height: 120 }} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  const isAdmin = user.role === 'admin';
  const close = () => setOpen(false);
  const billingKids: NavItem[] = [
    { to: '/admin/billing/new', label: 'New Bill', icon: ICONS.billing },
    { to: '/admin/billing/history', label: 'Billing History', icon: ICONS.billingClock },
  ];
  const invKids: NavItem[] = [
    { to: '/admin/inventory', label: 'Overview', icon: ICONS.overview, end: true },
    { to: '/admin/inventory/new', label: 'Add Product', icon: ICONS.inventory },
    { to: '/admin/inventory/report', label: 'Purchase Report', icon: ICONS.reports },
  ];
  const navLink = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>
      <Icon paths={item.icon} />{item.label}
    </NavLink>
  );
  const initials = user.display_name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'U';
  return (
    <div className="shell">
      {open && <div className="sidebar-backdrop" onClick={close} aria-hidden="true" />}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-name">Shree <span>Gold</span></div>
          <div className="brand-sub">Admin Console</div>
        </div>
        {isAdmin && navLink(NAV_OVERVIEW)}
        <div className="sidebar-section">Operations</div>
        <button type="button" className={`nav-group${inBilling ? ' active' : ''}`} onClick={() => setBillingOpen((o) => !o)} aria-expanded={billingOpen}>
          <Icon paths={ICONS.billing} /><span>Billing</span><span className={`chev${billingOpen ? ' open' : ''}`}>‹</span>
        </button>
        {billingOpen && <div className="nav-sub">{billingKids.map(navLink)}</div>}
        {isAdmin && (
          <>
            <button type="button" className={`nav-group${inInventory ? ' active' : ''}`} onClick={() => setInvOpen((o) => !o)} aria-expanded={invOpen}>
              <Icon paths={ICONS.inventory} /><span>Inventory</span><span className={`chev${invOpen ? ' open' : ''}`}>‹</span>
            </button>
            {invOpen && <div className="nav-sub">{invKids.map(navLink)}</div>}
            {navLink(NAV_BARCODE)}
          </>
        )}
        <div className="sidebar-section">Manage</div>
        {isAdmin ? (
          <>
            {navLink(NAV_CUSTOMERS)}
            {navLink(NAV_STAFF)}
            {navLink(NAV_RATES)}
            {navLink(NAV_CAMPAIGNS)}
            {navLink(NAV_REPORTS)}
          </>
        ) : (
          <NavLink to="/admin/customers" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>
            <Icon paths={ICONS.search} />Customer Search
          </NavLink>
        )}
        {isAdmin && (
          <>
            <div className="sidebar-section">System</div>
            {navLink(NAV_SETTINGS)}
            {navLink(NAV_AUDIT)}
          </>
        )}
        <Link className="public-link" to="/shop">← Public site</Link>
        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="name">{user.display_name}</div>
            <div className="role">{user.role}</div>
          </div>
          <button type="button" className="sidebar-logout" onClick={logout}>Logout</button>
        </div>
      </aside>
      <div className="main">
        <header className="admin-topbar">
          <button type="button" className="btn ghost menu-toggle" aria-label="Toggle menu" onClick={() => setOpen(!open)}><Icon paths={ICONS.menu} size={16} /></button>
          <AdminBreadcrumbs />
          <div className="admin-topbar-right">
            <span className="role-chip"><Icon paths={isAdmin ? ICONS.shield : ICONS.briefcase} size={13} />{isAdmin ? 'Admin' : 'Billing'}</span>
            <div className="topbar-avatar" title={user.display_name}>{initials}</div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="main"><div className="skeleton" style={{ height: 120 }} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/admin/billing" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<><PublicNav /><Landing /></>} />
            <Route path="/shop" element={<><PublicNav /><Catalogue /></>} />
            <Route path="/shop/:id" element={<><PublicNav /><ProductDetail /></>} />
            <Route path="/login" element={<><PublicNav /><Login /></>} />
            <Route path="/admin" element={<AdminShell><RequireAdmin><Dashboard /></RequireAdmin></AdminShell>} />
            <Route path="/admin/billing" element={<Navigate to="/admin/billing/new" replace />} />
            <Route path="/admin/billing/new" element={<AdminShell><Billing mode="new" /></AdminShell>} />
            <Route path="/admin/billing/history" element={<AdminShell><Billing mode="history" /></AdminShell>} />
            <Route path="/admin/inventory" element={<AdminShell><RequireAdmin><Inventory /></RequireAdmin></AdminShell>} />
            <Route path="/admin/inventory/new" element={<AdminShell><RequireAdmin><InventoryNew /></RequireAdmin></AdminShell>} />
            <Route path="/admin/inventory/report" element={<AdminShell><RequireAdmin><InventoryReport /></RequireAdmin></AdminShell>} />
            <Route path="/admin/inventory/:id" element={<AdminShell><RequireAdmin><InventoryDetail /></RequireAdmin></AdminShell>} />
            <Route path="/admin/barcodes" element={<AdminShell><RequireAdmin><Barcodes /></RequireAdmin></AdminShell>} />
            <Route path="/admin/customers" element={<AdminShell><Customers /></AdminShell>} />
            <Route path="/admin/staff" element={<AdminShell><RequireAdmin><Staff /></RequireAdmin></AdminShell>} />
            <Route path="/admin/rates" element={<AdminShell><RequireAdmin><Rates /></RequireAdmin></AdminShell>} />
            <Route path="/admin/campaigns" element={<AdminShell><RequireAdmin><Campaigns /></RequireAdmin></AdminShell>} />
            <Route path="/admin/reports" element={<AdminShell><RequireAdmin><Reports /></RequireAdmin></AdminShell>} />
            <Route path="/admin/settings" element={<AdminShell><RequireAdmin><Settings /></RequireAdmin></AdminShell>} />
            <Route path="/admin/audit" element={<AdminShell><RequireAdmin><AuditLogs /></RequireAdmin></AdminShell>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
