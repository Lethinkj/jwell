import { BrowserRouter, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/auth';
import Landing from './pages/Landing';
import Catalogue from './pages/Catalogue';
import ProductDetail from './pages/ProductDetail';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import Inventory from './pages/admin/Inventory';
import Billing from './pages/admin/Billing';
import Barcodes from './pages/admin/Barcodes';
import Customers from './pages/admin/Customers';
import Staff from './pages/admin/Staff';
import Rates from './pages/admin/Rates';
import Campaigns from './pages/admin/Campaigns';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';
import AuditLogs from './pages/admin/AuditLogs';
import { api } from './lib/api';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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
  if (loading) return <div className="main"><div className="skeleton" style={{ height: 120 }} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  const isAdmin = user.role === 'admin';
  const links = isAdmin ? [
    ['/admin', 'Overview'], ['/admin/billing', 'Billing'], ['/admin/inventory', 'Inventory'],
    ['/admin/barcodes', 'Barcode Generator'], ['/admin/customers', 'Customers & CRM'],
    ['/admin/staff', 'Staff Management'], ['/admin/rates', 'Gold Rates'],
    ['/admin/campaigns', 'Offers & Campaigns'], ['/admin/reports', 'Reports'],
    ['/admin/settings', 'Settings'], ['/admin/audit', 'Audit Logs'],
  ] : [
    ['/admin/billing', 'New Bill'], ['/admin/customers', 'Customer Search'],
  ];
  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand" style={{ color: '#fff', marginBottom: 12 }}>Shree <span style={{ color: 'var(--color-gold)' }}>Gold</span></div>
        {links.map(([to, label]) => <Link key={to} to={to} onClick={() => setOpen(false)}>{label}</Link>)}
        <Link to="/shop">← Public site</Link>
        <div style={{ marginTop: 'auto', fontSize: 13, opacity: .8 }}>{user.display_name} • {user.role}<br /><button className="btn ghost" style={{ color: '#fff', borderColor: '#666', marginTop: 8 }} onClick={logout}>Logout</button></div>
      </aside>
      <div className="main">
        <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => setOpen(!open)}>☰ Menu</button>
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
            <Route path="/admin/billing" element={<AdminShell><Billing /></AdminShell>} />
            <Route path="/admin/inventory" element={<AdminShell><RequireAdmin><Inventory /></RequireAdmin></AdminShell>} />
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
