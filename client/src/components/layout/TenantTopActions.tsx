import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Search, Settings } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useInAppNotifications, useUnreadNotificationCount, useMarkAsRead, useMarkAllAsRead } from '@/features/notifications/hooks/useNotifications';
import { formatDate } from '@/utils/formatDate';
import { ROUTES } from '@/constants/routes';
import { AppLauncher } from './AppLauncher';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-l-error bg-error/10',
  warning: 'border-l-warning bg-warning/10',
  info: 'border-l-accent bg-accent/10',
};

const SEVERITY_DOTS: Record<string, string> = {
  critical: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-accent',
};

const iconButton =
  'relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-secondary ' +
  'transition-colors duration-fast hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * Tenant-only top-bar content for AppShell: search, app launcher, notification bell
 * and the settings link. The operator shell does not render this (no launcher, and
 * the notification API is a tenant API).
 */
export const TenantTopActions = () => {
  const { data: unreadData } = useUnreadNotificationCount();
  const { data: notifications } = useInAppNotifications();
  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div className="relative hidden w-64 md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary" aria-hidden />
        <input
          type="text"
          placeholder="Search resources, users..."
          aria-label="Search"
          className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-body text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      <AppLauncher />

      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(iconButton, 'text-primary')}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          aria-expanded={isOpen}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-card border border-line bg-surface-elevated shadow-dropdown">
            <div className="flex items-center justify-between border-b border-line bg-black/20 px-4 py-3">
              <span className="text-body font-semibold text-ink">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  className="flex items-center gap-1 text-table font-medium text-primary transition-colors hover:text-primary-hover disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto scrollbar-hide">
              {notifications && notifications.length > 0 ? (
                notifications.map((notif) => (
                  <button
                    type="button"
                    key={notif._id}
                    onClick={() => markAsReadMutation.mutate({ notification_id: notif._id })}
                    disabled={notif.status === 'read'}
                    className={cn(
                      'w-full border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-hover',
                      notif.status === 'unread' && 'bg-surface-alt',
                      notif.status === 'read' && 'opacity-60'
                    )}
                  >
                    <div className={cn('rounded-sm border-l-2 py-1 pl-3', SEVERITY_COLORS[notif.severity] || SEVERITY_COLORS.info)}>
                      <div className="flex items-center gap-2">
                        {notif.status === 'unread' && (
                          <span className={cn('h-dot w-dot flex-shrink-0 rounded-full', SEVERITY_DOTS[notif.severity] || SEVERITY_DOTS.info)} />
                        )}
                        <p className="truncate text-body font-medium text-ink">{notif.title}</p>
                      </div>
                      <p className="mt-0.5 overflow-hidden text-table text-ink-secondary" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{notif.message}</p>
                      <p className="mt-1 text-label normal-case tracking-normal text-ink-muted">{formatDate(notif.created_at)}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center">
                  <Bell className="mx-auto mb-2 h-8 w-8 text-ink-muted opacity-50" />
                  <p className="text-body text-ink-secondary">No notifications</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Link to={ROUTES.COMPANY_SETTINGS} className={iconButton} aria-label="Settings">
        <Settings className="h-4 w-4" />
      </Link>
    </>
  );
};
