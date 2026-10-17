import type { CSSProperties } from 'react';

/* ── Shared inline SVG icon set (stroke = currentColor, 24px grid) ── */
export const Icon = ({ paths, size = 18, style }: { paths: string[]; size?: number; style?: CSSProperties }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden style={{ flexShrink: 0, ...style }}
  >
    {paths.map((d, i) => <path key={i} d={d} />)}
  </svg>
);

export const ICONS: Record<string, string[]> = {
  /* navigation */
  overview: ['M3 3h8v8H3zM13 3h8v5h-8zM13 12h8v9h-8zM3 15h8v6H3z'],
  billing: ['M2 5h20v14H2z', 'M2 10h20', 'M6 15h4'],
  billingClock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2'],
  inventory: ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.3 7 12 12l8.7-5', 'M12 22V12'],
  barcode: ['M3 4h18M3 20h18', 'M7 7v10M11 7v10M14 7v10M18 7v10'],
  customers: ['M10 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M2 21v-1a6.5 6.5 0 0 1 13 0v1', 'M17 7a3 3 0 1 1 0-5', 'M19 14.5a5.5 5.5 0 0 1 3 4.9v.6'],
  staff: ['M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M2 21v-1a6 6 0 0 1 12 0v1', 'M16 5a3 3 0 1 1 0 6', 'M17.5 14.6a5.6 5.6 0 0 1 4.5 5.4v1'],
  rates: ['M3 3v18h18', 'M7 15l4-5 3 3 5-7'],
  campaigns: ['M20 12v9H4v-9', 'M2 7h20v5H2z', 'M12 22V7', 'M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z', 'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z'],
  reports: ['M21.2 15.9A9 9 0 1 1 8.1 2.8', 'M22 12A10 10 0 0 0 12 2v10z'],
  settings: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3', 'M1 14h6M9 8h6M17 16h6'],
  audit: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8M16 17H8'],
  search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M21 21l-4.6-4.6'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  home: ['M3 11l9-8 9 8', 'M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10'],

  /* KPI / stats */
  wallet: ['M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z', 'M2 9h20', 'M16.5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  receipt: ['M5 3h14v18l-2.33-1.5L14.33 21 12 19.5 9.67 21 7.33 19.5 5 21z', 'M9 8h6', 'M9 12h6', 'M9 16h4'],
  calculator: ['M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M7 6h10', 'M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01'],
  gem: ['M6 3h12l4 6-10 12L2 9z', 'M2 9h20', 'M11 3 8 9l4 12 4-12-3-6'],
  scale: ['M9 10V6a3 3 0 0 1 6 0v4', 'M7 21h10a2 2 0 0 0 2-2.4l-1.2-6A2 2 0 0 0 15.8 11H8.2a2 2 0 0 0-2 1.6l-1.2 6A2 2 0 0 0 7 21z'],
  trending: ['M3 17l6-6 4 4 8-8', 'M14 7h7v7'],
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  arrowDown: ['M12 5v14', 'M19 12l-7 7-7-7'],
  refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M20.49 15a9 9 0 0 1-14.85 3.36L1 14'],

  /* roles */
  shield: ['M12 2l8 3.5V12c0 4.8-3.4 8.6-8 10-4.6-1.4-8-5.2-8-10V5.5z', 'M9 12l2 2 4-4'],
  briefcase: ['M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z', 'M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2', 'M3 13h18'],
};
