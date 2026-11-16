import React from 'react';
import { Link } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface OverflowItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  /** A status node, usually a StatusBadge or HealthPill. */
  status?: React.ReactNode;
  /** The one primary action of the page. */
  primaryAction?: React.ReactNode;
  overflow?: OverflowItem[];
  className?: string;
}

/**
 * PageHeader: breadcrumb, title, subtitle, status, one primary action and an
 * overflow menu (DRD 9.2).
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  status,
  primaryAction,
  overflow,
  className,
}) => (
  <header className={cn('flex flex-col gap-2 pb-4', className)}>
    {breadcrumbs && breadcrumbs.length > 0 && (
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-label uppercase text-ink-muted">
        {breadcrumbs.map((b, i) => (
          <React.Fragment key={`${b.label}-${i}`}>
            {i > 0 && <ChevronRight className="w-3 h-3" aria-hidden />}
            {b.href ? (
              <Link to={b.href} className="hover:text-ink transition-colors duration-fast">
                {b.label}
              </Link>
            ) : (
              <span aria-current="page">{b.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
    )}
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-title text-ink truncate">{title}</h1>
          {status}
        </div>
        {subtitle && <p className="mt-1 text-body text-ink-secondary">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {primaryAction}
        {overflow && overflow.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label="More actions"
              className="h-9 w-9 flex items-center justify-center rounded-control border border-line bg-surface text-ink-secondary hover:bg-surface-hover hover:text-ink transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-[180px] rounded-card border border-line bg-surface-elevated p-1 shadow-dropdown"
              >
                {overflow.map((o) => (
                  <DropdownMenu.Item
                    key={o.label}
                    disabled={o.disabled}
                    onSelect={o.onSelect}
                    className={cn(
                      'flex items-center rounded-control px-3 h-9 text-body cursor-pointer outline-none',
                      'data-[highlighted]:bg-surface-hover data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed',
                      o.danger ? 'text-error' : 'text-ink',
                    )}
                  >
                    {o.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </div>
  </header>
);
