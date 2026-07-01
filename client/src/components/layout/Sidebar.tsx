import { useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { ROUTES } from '@/constants/routes';
import {
  Building2,
  Users,
  Settings,
  LogOut,
  LayoutDashboard,
  Shield,
  Package,
  FileText,
  GitBranch,
  CheckSquare
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUIStore } from '@/store/useUIStore';
import { PERMISSION_GROUPS } from '@/constants/roles';

interface SidebarProps {
  className?: string;
}

const navGroups = [
  {
    label: 'Dashboard',
    roles: [...PERMISSION_GROUPS.ALL, 'super_admin', 'hr_admin', 'manager', 'employee'],
    items: [
      { label: 'Overview', href: ROUTES.OVERVIEW, icon: LayoutDashboard },
    ],
  },
  {
    label: 'Structure',
    roles: [...PERMISSION_GROUPS.ROLE_ADMINS, 'super_admin', 'hr_admin', 'ops_admin'],
    items: [
      { label: 'Organization', href: ROUTES.ORGANIZATION, icon: Building2 },
      { label: 'Teams', href: ROUTES.TEAMS, icon: Users },
      { label: 'Roles & Permissions', href: ROUTES.ROLES, icon: Shield },
      { label: 'Groups', href: ROUTES.GROUPS, icon: Users },
      { label: 'Apps', href: ROUTES.APPS, icon: Package },
      { label: 'Policies', href: ROUTES.POLICIES, icon: FileText },
      { label: 'Workflows', href: ROUTES.WORKFLOWS, icon: GitBranch },
      { label: 'Approvals', href: ROUTES.APPROVALS, icon: CheckSquare },
    ],
  },
  {
    label: 'People',
    roles: [...PERMISSION_GROUPS.ALL, 'super_admin', 'hr_admin', 'manager', 'employee'],
    items: [
      { label: 'People', href: ROUTES.PEOPLE, icon: Users },
    ],
  },
  {
    label: 'Settings',
    roles: [...PERMISSION_GROUPS.IT_ADMINS, 'super_admin'],
    items: [
      { label: 'Company settings', href: ROUTES.COMPANY_SETTINGS, icon: Settings },
    ],
  },
];

export const Sidebar = ({ className }: SidebarProps) => {
  const { clearAuth, userName, userRole, companyName } = useAuthStore();
  const { closeSidebar } = useUIStore();
  const location = useLocation();

  // Handle user initials
  const userInitials = userName?.charAt(0)?.toUpperCase() || 'U';
  const displayCompanyName = companyName || 'Sowaye';

  return (
    <aside 
      className={cn("glass-panel scrollbar-hide", className)}
      style={{
        width: 268,
        height: '100%',
        borderRadius: 24,
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        overflowY: 'auto',
      }}
    >
      {/* BRAND ROW */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '24px 24px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 8,
        position: 'sticky', top: 0,
        background: 'rgba(15,23,42,0.95)',
        backdropFilter: 'blur(16px)',
        zIndex: 10,
      }}>
        {/* Brand icon — gradient with glow */}
        <Link 
          to={ROUTES.OVERVIEW}
          onClick={closeSidebar}
          style={{
            width: 34, height: 34,
            background: 'linear-gradient(135deg, #f5b02a, #fcd34d)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 14px rgba(245,176,42,0.45)',
            flexShrink: 0,
            textDecoration: 'none'
          }}
        >
          <span style={{ color: '#000', fontWeight: 'bold', fontSize: 14 }}>SW</span>
        </Link>
        <Link to={ROUTES.OVERVIEW} onClick={closeSidebar} style={{ textDecoration: 'none' }}>
          <span style={{
            fontSize: 18, fontWeight: 800,
            color: '#f5b02a',
            letterSpacing: '-0.3px',
            lineHeight: 1,
          }}>
            {displayCompanyName}
          </span>
        </Link>
      </div>

      {/* NAV MENU */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {navGroups.map((group, idx) => {
          if (group.roles && userRole && !group.roles.includes(userRole)) {
            return null;
          }
          return (
            <div key={idx} style={{ marginBottom: 8 }}>
              {/* Group label */}
              {group.label && (
                <p style={{
                  fontSize: 10, fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  color: 'rgba(148,163,184,0.45)',
                  padding: '18px 24px 6px',
                  margin: 0
                }}>
                  {group.label}
                </p>
              )}

              {/* Nav items */}
              {group.items.map(item => {
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={closeSidebar}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 16px',
                      margin: '1px 12px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      fontWeight: 500, fontSize: 14,
                      transition: 'all 0.15s ease',
                      border: '1px solid transparent',
                      color: isActive ? '#f5b02a' : '#94a3b8',
                      background: isActive ? 'rgba(245,176,42,0.09)' : 'transparent',
                      borderColor: isActive ? 'rgba(245,176,42,0.18)' : 'transparent',
                      boxShadow: isActive ? '0 0 16px rgba(245,176,42,0.05)' : 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <item.icon size={17} style={{ flexShrink: 0 }} />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* USER FOOTER */}
      <div style={{
        padding: '16px 16px 24px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        marginTop: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          borderRadius: 12,
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
          onClick={clearAuth}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {/* Avatar */}
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(245,176,42,0.15)',
            border: '1px solid rgba(245,176,42,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#f5b02a',
            flexShrink: 0,
          }}>
            {userInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Sign Out
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName || ''}
            </p>
          </div>
          <LogOut size={14} style={{ color: '#94a3b8' }} />
        </div>
      </div>
    </aside>
  );
};
