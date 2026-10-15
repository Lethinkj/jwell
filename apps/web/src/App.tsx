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
import { api } from './lib/api';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

const qc = new QueryClient();

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
  const links = [
    ['/admin', 'Overview'],
    ['/admin/barcodes', 'Barcode Generator'], ['/admin/customers', 'Customers & CRM'],
    ['/admin/staff', 'Staff Management'], ['/admin/rates', 'Gold Rates'],
    ['/admin/campaigns', 'Offers & Campaigns'], ['/admin/reports', 'Reports'],
    ['/admin/settings', 'Settings'], ['/admin/audit', 'Audit Logs'],
  ];
  const close = () => setOpen(false);
  const billingKids = [
    ['/admin/billing/new', 'New Bill'],
    ['/admin/billing/history', 'Billing History'],
  ];
  const invKids = [
    ['/admin/inventory', 'Overview'], ['/admin/inventory/new', 'Add Product'], ['/admin/inventory/report', 'Purchase Report'],
  ];
  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand" style={{ color: '#fff', marginBottom: 12 }}>Shree <span style={{ color: 'var(--color-gold)' }}>Gold</span></div>
        {isAdmin ? <>
          <NavLink to="/admin" end className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>Overview</NavLink>
          <button type="button" className={`nav-group${inBilling ? ' active' : ''}`} onClick={() => setBillingOpen((o) => !o)} aria-expanded={billingOpen}>
            <span>Billing</span><span className={`chev${billingOpen ? ' open' : ''}`}>‹</span>
          </button>
          {billingOpen && (
            <div className="nav-sub">
              {billingKids.map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
          <button type="button" className={`nav-group${inInventory ? ' active' : ''}`} onClick={() => setInvOpen((o) => !o)} aria-expanded={invOpen}>
            <span>Inventory</span><span className={`chev${invOpen ? ' open' : ''}`}>‹</span>
          </button>
          {invOpen && (
            <div className="nav-sub">
              {invKids.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/admin/inventory'} className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
          {links.slice(1).map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>
              {label}
            </NavLink>
          ))}
        </> : <>
          <button type="button" className={`nav-group${inBilling ? ' active' : ''}`} onClick={() => setBillingOpen((o) => !o)} aria-expanded={billingOpen}>
            <span>Billing</span><span className={`chev${billingOpen ? ' open' : ''}`}>‹</span>
          </button>
          {billingOpen && (
            <div className="nav-sub">
              {billingKids.map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
          <NavLink to="/admin/customers" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>
            Customer Search
          </NavLink>
        </>}
        <Link to="/shop">← Public site</Link>
        <div style={{ marginTop: 'auto', fontSize: 13, opacity: .8 }}>{user.display_name} • {user.role}<br /><button className="btn ghost" style={{ color: '#fff', borderColor: '#666', marginTop: 8 }} onClick={logout}>Logout</button></div>
      </aside>
      <div className="main">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={() => setOpen(!open)}>☰ Menu</button>
            <AdminBreadcrumbs />
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {user.role === 'admin' ? '🛡️ Admin' : '💼 Billing'} • {user.display_name}
          </div>
        </div>
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
