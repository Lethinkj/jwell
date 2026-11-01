import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../../../lib/api';
import { Icon, ICONS } from '../../../components/icons';

export type HrOverview = {
  headcount: number;
  pending_leaves: number;
  present_today: number;
  current_month_net: number;
  month: string;
};

export type HrKpi = {
  label: string;
  value: string;
  meta?: string;
  icon: string[];
  tint: string;
  fg: string;
};

export const KPI_TINTS = {
  gold: { tint: '#FBF3E3', fg: '#8A6A22' },
  green: { tint: '#E7F4EC', fg: '#26734D' },
  amber: { tint: '#FDF2DC', fg: '#946200' },
  rose: { tint: '#F7E9EF', fg: '#8C3A55' },
  blue: { tint: '#E8EFF9', fg: '#2F5597' },
  red: { tint: '#FDECEA', fg: '#B42318' },
};

/** Shared, cached HR overview counters — each page picks the numbers it needs. */
export function useHrOverview(): HrOverview | undefined {
  const q = useQuery({
    queryKey: ['hr-overview'],
    queryFn: () => api.get('/hr/overview'),
    staleTime: 30_000,
  });
  return q.data?.data;
}

export const monthName = (period?: string) => {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return 'This month';
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const TABS = [
  { to: '/admin/hr/employees', label: 'Employees', icon: ICONS.staff },
  { to: '/admin/hr/attendance', label: 'Attendance', icon: ICONS.calendar },
  { to: '/admin/hr/leaves', label: 'Leave & Holidays', icon: ICONS.briefcase },
  { to: '/admin/hr/payroll', label: 'Payroll', icon: ICONS.payroll },
];

/** Shared frame for every HR screen: page heading, page-specific KPIs and tabs. */
export default function HrShell({
  title,
  subtitle,
  kpis,
  actions,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  kpis: HrKpi[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page hr-page">
      <header className="hr-head">
        <div className="hr-head-copy">
          <span className="hr-eyebrow">HR Management</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actions ? <div className="hr-head-actions">{actions}</div> : null}
      </header>

      <section className="hr-kpis" aria-label="HR summary">
        {kpis.map((k) => (
          <div className="hr-kpi" key={k.label}>
            <span
              className="hr-kpi-ico"
              style={{ background: k.tint, color: k.fg, borderColor: `${k.fg}2e` }}
            >
              <Icon paths={k.icon} size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="hr-kpi-label">{k.label}</div>
              <div className="hr-kpi-value">{k.value}</div>
              {k.meta ? <div className="hr-kpi-meta">{k.meta}</div> : null}
            </div>
          </div>
        ))}
      </section>

      <nav className="hr-tabs" aria-label="HR sections">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => `hr-tab${isActive ? ' active' : ''}`}
          >
            <Icon paths={t.icon} size={16} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="hr-body">{children}</div>
    </div>
  );
}
