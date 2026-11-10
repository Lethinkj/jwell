import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, ICONS } from './icons';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: ModalSize;
  zIndex?: number;
  /** Set false to require an explicit action (no overlay/escape close). */
  dismissible?: boolean;
  bodyClassName?: string;
  className?: string;
}

const MAX_WIDTH: Record<ModalSize, string> = {
  sm: '440px',
  md: '620px',
  lg: '820px',
  xl: '1040px',
  full: 'min(1360px, calc(100vw - 32px))',
};

/**
 * Shared popup shell used by every add/edit/detail flow.
 *
 * Rendered through a portal so a modal can be opened from inside a card
 * without being clipped by overflow, and so nested modals (e.g. a product
 * detail opened from a sales drill-down) stack correctly.
 */
export default function Modal({
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  size = 'lg',
  zIndex = 1000,
  dismissible = true,
  bodyClassName,
  className = '',
}: ModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [dismissible, onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      style={{ zIndex }}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${className}`.trim()}
        style={{ maxWidth: MAX_WIDTH[size] }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="modal-head">
            <div className="modal-head-copy">
              <div className="modal-title-row">
                {icon && <span className="modal-icon">{icon}</span>}
                {title && <h2 className="modal-title">{title}</h2>}
              </div>
              {subtitle && <div className="modal-sub">{subtitle}</div>}
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog" title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}

        <div className={`modal-body ${bodyClassName || ''}`.trim()}>{children}</div>

        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Small labelled search field + explicit Search button used by list/filter popups. */
export function ModalSearch({
  value,
  onChange,
  onSearch,
  placeholder,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="modal-search">
      <div className="modal-search-input">
        <Icon paths={ICONS.search} size={16} />
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSearch();
            }
          }}
          placeholder={placeholder || 'Search…'}
        />
      </div>
      <button type="button" className="btn gold" onClick={onSearch}>
        <Icon paths={ICONS.search} size={15} />
        Search
      </button>
    </div>
  );
}
