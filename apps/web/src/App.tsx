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
import EmailSettings from './pages/admin/EmailSettings';
import AuditLogs from './pages/admin/AuditLogs';
import HREmployees from './pages/admin/hr/Employees';
import HRAttendance from './pages/admin/hr/Attendance';
import HRLeaves from './pages/admin/hr/Leaves';
import HRPayroll from './pages/admin/hr/Payroll';
import AdminBreadcrumbs from './components/AdminBreadcrumbs';
import CampaignReminderModal from './components/CampaignReminderModal';
import { Icon, ICONS } from './components/icons';
import PublicHeader from './components/landing/PublicHeader';
import { useState, useEffect } from 'react';

const qc = new QueryClient();

type NavItem = { to: string; label: string; icon: string[]; end?: boolean };
const NAV_OVERVIEW: NavItem = { to: '/admin', label: 'Overview', icon: ICONS.overview, end: true };
const NAV_BARCODE: NavItem = { to: '/admin/barcodes', label: 'Barcode Generator', icon: ICONS.barcode };
const NAV_STAFF: NavItem = { to: '/admin/staff', label: 'Staff Management', icon: ICONS.staff };
const NAV_RATES: NavItem = { to: '/admin/rates', label: 'Gold Rates', icon: ICONS.rates };
const NAV_CAMPAIGNS: NavItem = { to: '/admin/campaigns', label: 'Offers & Campaigns', icon: ICONS.campaigns };
const NAV_REPORTS: NavItem = { to: '/admin/reports', label: 'Reports', icon: ICONS.reports };
const NAV_SETTINGS: NavItem = { to: '/admin/settings', label: 'Settings', icon: ICONS.settings };
const NAV_EMAIL: NavItem = { to: '/admin/email', label: 'Email', icon: ICONS.mail };
const NAV_AUDIT: NavItem = { to: '/admin/audit', label: 'Audit Logs', icon: ICONS.audit };

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const inInventory = loc.pathname.startsWith('/admin/inventory');
  const inBilling = loc.pathname.startsWith('/admin/billing');
  const inCustomers = loc.pathname.startsWith('/admin/customers');
  const inHr = loc.pathname.startsWith('/admin/hr');
  const [invOpen, setInvOpen] = useState(inInventory);
  const [billingOpen, setBillingOpen] = useState<boolean>(!inInventory && !inCustomers && !inHr);
  const [custOpen, setCustOpen] = useState(inCustomers);
  const [hrOpen, setHrOpen] = useState(inHr);
  useEffect(() => {
    if (inCustomers) { setCustOpen(true); setBillingOpen(false); setInvOpen(false); setHrOpen(false); }
    else if (inBilling) { setBillingOpen(true); setInvOpen(false); setCustOpen(false); setHrOpen(false); }
    else if (inInventory) { setInvOpen(true); setBillingOpen(false); setCustOpen(false); setHrOpen(false); }
    else if (inHr) { setHrOpen(true); setBillingOpen(false); setInvOpen(false); setCustOpen(false); }
  }, [inInventory, inBilling, inCustomers, inHr]);
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
  const custKids: NavItem[] = [
    { to: '/admin/customers', label: 'All Customers', icon: ICONS.customers, end: true },
    { to: '/admin/customers/new', label: 'New Customer', icon: ICONS.customers },
  ];
  const hrKids: NavItem[] = [
    { to: '/admin/hr/employees', label: 'Employees', icon: ICONS.staff },
    { to: '/admin/hr/attendance', label: 'Attendance', icon: ICONS.calendar },
    { to: '/admin/hr/leaves', label: 'Leave & Holidays', icon: ICONS.calendar },
    { to: '/admin/hr/payroll', label: 'Payroll', icon: ICONS.payroll },
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
          <img src="/logo.png" alt="" className="sidebar-logo" />
          <div>
            <div className="brand-name">Shree <span>Gold</span></div>
            <div className="brand-sub">Admin Console</div>
          </div>
        </div>
        {isAdmin && navLink(NAV_OVERVIEW)}
        <div className="sidebar-section">Operations</div>
        <button type="button" className={`nav-group${inBilling ? ' active' : ''}`} onClick={() => { setBillingOpen((o) => !o); setInvOpen(false); setCustOpen(false); setHrOpen(false); }} aria-expanded={billingOpen}>
          <Icon paths={ICONS.billing} /><span>Billing</span><span className={`chev${billingOpen ? ' open' : ''}`}>‹</span>
        </button>
        {billingOpen && <div className="nav-sub">{billingKids.map(navLink)}</div>}
        {isAdmin && (
          <>
            <button type="button" className={`nav-group${inInventory ? ' active' : ''}`} onClick={() => { setInvOpen((o) => !o); setBillingOpen(false); setCustOpen(false); setHrOpen(false); }} aria-expanded={invOpen}>
              <Icon paths={ICONS.inventory} /><span>Inventory</span><span className={`chev${invOpen ? ' open' : ''}`}>‹</span>
            </button>
            {invOpen && <div className="nav-sub">{invKids.map(navLink)}</div>}
            {navLink(NAV_BARCODE)}
          </>
        )}
        <div className="sidebar-section">Manage</div>
        {isAdmin ? (
          <>
            <button type="button" className={`nav-group${inCustomers ? ' active' : ''}`} onClick={() => { setCustOpen((o) => !o); setBillingOpen(false); setInvOpen(false); setHrOpen(false); }} aria-expanded={custOpen}>
              <Icon paths={ICONS.customers} /><span>Customers &amp; CRM</span><span className={`chev${custOpen ? ' open' : ''}`}>‹</span>
            </button>
            {custOpen && <div className="nav-sub">{custKids.map(navLink)}</div>}
            <button type="button" className={`nav-group${inHr ? ' active' : ''}`} onClick={() => { setHrOpen((o) => !o); setBillingOpen(false); setInvOpen(false); setCustOpen(false); }} aria-expanded={hrOpen}>
              <Icon paths={ICONS.staff} /><span>HR Management</span><span className={`chev${hrOpen ? ' open' : ''}`}>‹</span>
            </button>
            {hrOpen && <div className="nav-sub">{hrKids.map(navLink)}</div>}
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
            {navLink(NAV_EMAIL)}
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
      <CampaignReminderModal />
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
            <Route path="/" element={<Landing />} />
            <Route path="/shop" element={<><PublicHeader /><Catalogue /></>} />
            <Route path="/shop/:id" element={<><PublicHeader /><ProductDetail /></>} />
            <Route path="/login" element={<><PublicHeader /><Login /></>} />
            <Route path="/admin" element={<AdminShell><RequireAdmin><Dashboard /></RequireAdmin></AdminShell>} />
            <Route path="/admin/billing" element={<Navigate to="/admin/billing/new" replace />} />
            <Route path="/admin/billing/new" element={<AdminShell><Billing mode="new" /></AdminShell>} />
            <Route path="/admin/billing/history" element={<AdminShell><Billing mode="history" /></AdminShell>} />
            <Route path="/admin/inventory" element={<AdminShell><RequireAdmin><Inventory /></RequireAdmin></AdminShell>} />
            <Route path="/admin/inventory/new" element={<AdminShell><RequireAdmin><InventoryNew /></RequireAdmin></AdminShell>} />
            <Route path="/admin/inventory/report" element={<AdminShell><RequireAdmin><InventoryReport /></RequireAdmin></AdminShell>} />
            <Route path="/admin/inventory/:id" element={<AdminShell><RequireAdmin><InventoryDetail /></RequireAdmin></AdminShell>} />
            <Route path="/admin/barcodes" element={<AdminShell><RequireAdmin><Barcodes /></RequireAdmin></AdminShell>} />
            <Route path="/admin/customers" element={<AdminShell><Customers mode="view" /></AdminShell>} />
            <Route path="/admin/customers/new" element={<AdminShell><Customers mode="new" /></AdminShell>} />
            <Route path="/admin/staff" element={<AdminShell><RequireAdmin><Staff /></RequireAdmin></AdminShell>} />
            <Route path="/admin/hr" element={<Navigate to="/admin/hr/employees" replace />} />
            <Route path="/admin/hr/employees" element={<AdminShell><RequireAdmin><HREmployees /></RequireAdmin></AdminShell>} />
            <Route path="/admin/hr/attendance" element={<AdminShell><RequireAdmin><HRAttendance /></RequireAdmin></AdminShell>} />
            <Route path="/admin/hr/leaves" element={<AdminShell><RequireAdmin><HRLeaves /></RequireAdmin></AdminShell>} />
            <Route path="/admin/hr/payroll" element={<AdminShell><RequireAdmin><HRPayroll /></RequireAdmin></AdminShell>} />
            <Route path="/admin/rates" element={<AdminShell><RequireAdmin><Rates /></RequireAdmin></AdminShell>} />
            <Route path="/admin/campaigns" element={<AdminShell><RequireAdmin><Campaigns /></RequireAdmin></AdminShell>} />
            <Route path="/admin/reports" element={<AdminShell><RequireAdmin><Reports /></RequireAdmin></AdminShell>} />
            <Route path="/admin/settings" element={<AdminShell><RequireAdmin><Settings /></RequireAdmin></AdminShell>} />
            <Route path="/admin/email" element={<AdminShell><RequireAdmin><EmailSettings /></RequireAdmin></AdminShell>} />
            <Route path="/admin/audit" element={<AdminShell><RequireAdmin><AuditLogs /></RequireAdmin></AdminShell>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
