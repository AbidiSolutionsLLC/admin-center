
import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/utils/cn';
import { useInAppNotifications, useUnreadNotificationCount, useMarkAsRead, useMarkAllAsRead } from '@/features/notifications/hooks/useNotifications';
import { formatDate } from '@/utils/formatDate';

interface TopBarProps {
  className?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-l-error bg-error-light',
  warning: 'border-l-warning bg-warning-light',
  info: 'border-l-accent bg-accent-light',
};

const SEVERITY_DOTS: Record<string, string> = {
  critical: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-accent',
};

export const TopBar = ({ className }: TopBarProps) => {
  const { userName, userRole } = useAuthStore();
  const { data: unreadData } = useUnreadNotificationCount();
  const { data: notifications } = useInAppNotifications();
  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = unreadData?.count ?? 0;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = (notificationId: string) => {
    markAsReadMutation.mutate({ notification_id: notificationId });
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  return (
    <header className={cn("flex items-center justify-between px-6 bg-white border-b border-line", className)}>
      <div className="flex items-center">
        {/* Breadcrumbs or page title could go here */}
      </div>
      <div className="flex items-center gap-4">
        {/* ── Notification Bell ── */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="relative h-9 w-9 flex items-center justify-center rounded-md hover:bg-surface-alt transition-colors"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          >
            <Bell className="w-5 h-5 text-ink-secondary" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-error text-white text-[10px] font-bold rounded-full px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-line rounded-lg shadow-dropdown z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-[#F7F8FA]">
                <span className="text-sm font-semibold text-ink">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={markAllAsReadMutation.isPending}
                    className="text-xs font-medium text-accent hover:text-accent-hover transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications && notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <button
                      key={notif._id}
                      onClick={() => handleMarkAsRead(notif._id)}
                      disabled={notif.status === 'read'}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b border-line last:border-0 transition-colors hover:bg-surface-alt',
                        notif.status === 'unread' && 'bg-white',
                        notif.status === 'read' && 'bg-surface-alt/50 opacity-70'
                      )}
                    >
                      <div className={cn(
                        'border-l-2 pl-3 py-1 rounded-sm',
                        SEVERITY_COLORS[notif.severity] || SEVERITY_COLORS.info
                      )}>
                        <div className="flex items-center gap-2">
                          {notif.status === 'unread' && (
                            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', SEVERITY_DOTS[notif.severity] || SEVERITY_DOTS.info)} />
                          )}
                          <p className="text-sm font-medium text-ink truncate">{notif.title}</p>
                        </div>
                        <p className="text-xs text-ink-secondary mt-0.5 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{notif.message}</p>
                        <p className="text-[11px] text-ink-muted mt-1">{formatDate(notif.created_at)}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <Bell className="w-8 h-8 text-ink-muted mx-auto mb-2" />
                    <p className="text-sm text-ink-secondary">No notifications</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── User Profile ── */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-sm font-semibold text-ink">{userName || 'Loading...'}</span>
            <span className="text-xs text-ink-secondary capitalize">{userRole?.replace('_', ' ') || ''}</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-primary font-bold">
            {userName?.charAt(0) || 'U'}
          </div>
        </div>
      </div>
    </header>
  );
};
