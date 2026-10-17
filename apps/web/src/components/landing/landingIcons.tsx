import type { CSSProperties } from 'react';

/* Landing-page-only glyphs. Kept local so the shared icon set (used by the
   admin panel) is never touched. Rendered with the shared <Icon> shape. */
export const LP_ICONS: Record<string, string[]> = {
  search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M21 21l-4.6-4.6'],
  scale: ['M9 10V6a3 3 0 0 1 6 0v4', 'M7 21h10a2 2 0 0 0 2-2.4l-1.2-6A2 2 0 0 0 15.8 11H8.2a2 2 0 0 0-2 1.6l-1.2 6A2 2 0 0 0 7 21z'],
  calculator: ['M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M7 6h10', 'M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21v-1a8 8 0 0 1 16 0v1'],
  phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.8 2z'],
  pin: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z', 'M12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  sparkle: ['M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  whatsapp: ['M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z', 'M8.5 7.8c-.3 0-.7.1-1 .5-.4.4-1 1-1 2.3 0 1.4 1 2.7 1.2 2.9.2.2 2 3 4.8 4.2 2.3 1 2.8.8 3.3.8.5 0 1.6-.6 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3l-1.7-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.5-1.4-1.8-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4z'],
};

export type LandIconName = keyof typeof LP_ICONS;

export const LandIcon = ({ name, size = 20, style }: { name: LandIconName; size?: number; style?: CSSProperties }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden style={{ flexShrink: 0, ...style }}
  >
    {LP_ICONS[name].map((d, i) => <path key={i} d={d} />)}
  </svg>
);
