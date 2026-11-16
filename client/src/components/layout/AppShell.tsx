import React, { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUIStore } from '@/store/useUIStore';
import { isNavItemVisible } from './navigation';
import type { NavGroup, NavItem, ShellConfig } from './navigation';

interface AppShellProps {
  config: ShellConfig;
  /** Permission keys the user holds; items naming a `permission` are filtered by this list. */
  permissions?: readonly string[];
  /** The user's role, for items and groups that name `roles`. */
  role?: string | null;
  /** Overrides `config.brand.label` (for example a company name). */
  brandLabel?: string;
  user: { name?: string | null; onSignOut: () => void };
  /** Right side of the top bar (search, notifications, launcher...). */
  topBarEnd?: React.ReactNode;
  /** Full-width strip between the top bar and the page (the platform announcement). */
  banner?: React.ReactNode;
  children?: React.ReactNode;
}

type VisibleGroup = { group: NavGroup; items: NavItem[] };

const hrefPath = (href: string) => href.split('?')[0];

/**
 * One item is active. An item that names a `?tab=` is active only on an exact
 * path + query match; otherwise the longest matching path prefix wins.
 */
function findActiveHref(items: NavItem[], pathname: string, search: string): string | null {
  const exactTab = items.find((i) => i.href.includes('?') && pathname + search === i.href);
  if (exactTab) return exactTab.href;
  let best: NavItem | null = null;
  for (const i of items) {
    if (i.href.includes('?')) continue;
    const p = hrefPath(i.href);
    const matches = pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`);
    if (matches && (!best || p.length > hrefPath(best.href).length)) best = i;
  }
  return best ? best.href : null;
}

/**
 * AppShell (DRD 9.2): one shell, two configs (`admin`, `operator`).
 * Rail with navigation groups (248 px, 64 px collapsed), 56 px top bar, content slot.
 * The operator config adds a red "Operator" marker; it has no launcher because the
 * launcher belongs to the top-bar slot that only the tenant shell fills.
 */
export const AppShell: React.FC<AppShellProps> = ({
  config,
  permissions = [],
  role,
  brandLabel,
  user,
  topBarEnd,
  banner,
  children,
}) => {
  const { isSidebarOpen, toggleSidebar, closeSidebar, isRailCollapsed, toggleRail } = useUIStore();
  const location = useLocation();
  const isOperator = config.variant === 'operator';

  const visible: VisibleGroup[] = useMemo(() => {
    const ctx = { permissions, role };
    return config.groups
      .map((group) => ({ group, items: group.items.filter((i) => isNavItemVisible(i, group, ctx)) }))
      .filter((g) => g.items.length > 0);
  }, [config.groups, permissions, role]);

  const allItems = useMemo(() => visible.flatMap((g) => g.items), [visible]);
  const activeHref = findActiveHref(allItems, location.pathname, location.search);
  const activeLabel = allItems.find((i) => i.href === activeHref)?.label ?? config.brand.label;

  const label = brandLabel ?? config.brand.label;
  const initial = user.name?.charAt(0)?.toUpperCase() || 'U';
  // The collapsed width applies from lg up; the mobile drawer is always full width.
  const hideLabel = isRailCollapsed ? 'lg:hidden' : '';

  return (
    <div className="flex h-screen overflow-hidden text-ink font-sans">
      {isOperator && <div className="fixed inset-x-0 top-0 z-[60] h-0.5 bg-error" aria-hidden />}

      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={closeSidebar} aria-hidden />
      )}

      <aside
        aria-label="Primary"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-rail flex-col border-r border-line bg-surface-elevated',
          'transition-transform duration-panel ease-out lg:static lg:translate-x-0 lg:transition-[width]',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          isRailCollapsed && 'lg:w-rail-collapsed'
        )}
      >
        <div className="flex h-topbar shrink-0 items-center gap-3 border-b border-line px-4">
          <Link
            to={config.brand.href}
            onClick={closeSidebar}
            aria-label={label}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground text-table font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {config.brand.mark}
          </Link>
          <span className={cn('truncate text-section text-primary', hideLabel)}>{label}</span>
          {isOperator && (
            <span
              className={cn(
                'ml-auto rounded-full border border-error/30 bg-error/10 px-2 py-0.5 text-label uppercase text-error',
                hideLabel
              )}
            >
              Operator
            </span>
          )}
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2">
          {visible.map(({ group, items }) => (
            <div key={group.label} className="mb-2">
              <p className={cn('px-3 pb-1 pt-4 text-label uppercase text-ink-muted', hideLabel)}>{group.label}</p>
              {items.map((item) => {
                const isActive = item.href === activeHref;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={closeSidebar}
                    title={isRailCollapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center gap-3 rounded-control border border-transparent px-3 text-body',
                      'transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      isActive
                        ? 'border-primary/20 bg-sidebar-active-bg text-primary'
                        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-ink'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className={cn('truncate', hideLabel)}>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-3">
          <button
            type="button"
            onClick={user.onSignOut}
            title="Sign out"
            className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors duration-fast hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/15 text-table font-semibold text-primary">
              {initial}
            </span>
            <span className={cn('min-w-0 flex-1', hideLabel)}>
              <span className="block truncate text-table font-medium text-ink">Sign out</span>
              <span className="block truncate text-label normal-case tracking-normal text-ink-secondary">
                {user.name || ''}
              </span>
            </span>
            <LogOut className={cn('h-4 w-4 shrink-0 text-ink-secondary', hideLabel)} aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleRail}
            aria-label={isRailCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="mt-1 hidden h-8 w-full items-center justify-center rounded-control text-ink-secondary transition-colors duration-fast hover:bg-sidebar-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex"
          >
            {isRailCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-line px-4 lg:px-gutter">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Open navigation"
            className="rounded-control p-1.5 text-ink-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-section text-ink">{activeLabel}</span>
          {isOperator && (
            <span className="rounded-full border border-error/30 bg-error/10 px-2 py-0.5 text-label uppercase text-error lg:hidden">
              Operator
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">{topBarEnd}</div>
        </header>

        {banner}
        <main className="flex-1 overflow-y-auto scrollbar-hide px-4 py-6 lg:px-gutter min-[1440px]:px-gutter-lg">
          <div className="mx-auto h-full max-w-content">{children ?? <Outlet />}</div>
        </main>
      </div>
    </div>
  );
};
