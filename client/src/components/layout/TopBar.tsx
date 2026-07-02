import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Search, Settings } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/utils/cn';
import { useInAppNotifications, useUnreadNotificationCount, useMarkAsRead, useMarkAllAsRead } from '@/features/notifications/hooks/useNotifications';
import { formatDate } from '@/utils/formatDate';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

interface TopBarProps {
  className?: string;
}

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

export const TopBar = ({ className }: TopBarProps) => {
  const { data: unreadData } = useUnreadNotificationCount();
  const { data: notifications } = useInAppNotifications();
  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = unreadData?.count ?? 0;

  // Extract page title from route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Overview';
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[0].charAt(0).toUpperCase() + segments[0].slice(1).replace('-', ' ');
    }
    return 'Dashboard';
  };

  const pageTitle = getPageTitle();

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
    <header 
      className={cn("flex-shrink-0 z-40", className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0 28px 0',
      }}
    >
      {/* Left: Page title — dynamic from route */}
      <div style={{ fontSize: 18, fontWeight: 600, color: '#f5b02a' }}>
        {pageTitle}
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Search bar */}
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={15} style={{ color: '#94a3b8', position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }} />
          <input
            type="text"
            placeholder="Search resources, users..."
            style={{
              width: '100%',
              paddingLeft: '40px',
            }}
          />
        </div>

        {/* ── Notification Bell ── */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s ease',
              position: 'relative', color: '#f5b02a',
            }}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#ef4444',
                fontSize: 9, fontWeight: 800, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 glass-panel rounded-2xl z-50 overflow-hidden shadow-dropdown">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20">
                <span className="text-sm font-semibold text-slate-200">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={markAllAsReadMutation.isPending}
                    className="text-xs font-medium text-primary hover:text-primary-hover transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto scrollbar-hide">
                {notifications && notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <button
                      key={notif._id}
                      onClick={() => handleMarkAsRead(notif._id)}
                      disabled={notif.status === 'read'}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b border-white/5 last:border-0 transition-colors hover:bg-white/5',
                        notif.status === 'unread' && 'bg-white/5',
                        notif.status === 'read' && 'opacity-60'
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
                          <p className="text-sm font-medium text-slate-200 truncate">{notif.title}</p>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{notif.message}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{formatDate(notif.created_at)}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <Bell className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
                    <p className="text-sm text-slate-400">No notifications</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Settings button */}
        <button 
          onClick={() => window.location.href = ROUTES.COMPANY_SETTINGS}
          style={{
          width: 38, height: 38, borderRadius: '50%',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s ease',
          color: '#94a3b8',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  );
};
