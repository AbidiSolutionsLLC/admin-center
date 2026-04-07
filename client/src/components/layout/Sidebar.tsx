
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { ROUTES } from '@/constants/routes';
import { 
  LayoutDashboard, 
  Building2, 
  MapPin, 
  Users, 
  Shield, 
  LayoutGrid, 
  FileText, 
  GitBranch, 
  Lock, 
  Activity, 
  Database, 
  Bell, 
  Plug,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

interface SidebarProps {
  className?: string;
}

const navGroups = [
  {
    label: null,
    items: [
      { label: 'Overview', href: ROUTES.OVERVIEW, icon: LayoutDashboard },
    ],
  },
  {
    label: 'Structure',
    items: [
      { label: 'Organization', href: ROUTES.ORGANIZATION, icon: Building2 },
      { label: 'Locations', href: ROUTES.LOCATIONS, icon: MapPin },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'People', href: ROUTES.PEOPLE, icon: Users },
      { label: 'Roles & Access', href: ROUTES.ROLES, icon: Shield },
      { label: 'App Assignment', href: ROUTES.APPS, icon: LayoutGrid },
    ],
  },
  {
    label: 'Governance',
    items: [
      { label: 'Policies', href: ROUTES.POLICIES, icon: FileText },
      { label: 'Workflows', href: ROUTES.WORKFLOWS, icon: GitBranch },
      { label: 'Security', href: ROUTES.SECURITY, icon: Lock },
      { label: 'Audit Logs', href: ROUTES.AUDIT_LOGS, icon: Activity },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Data & Fields', href: ROUTES.DATA_FIELDS, icon: Database },
      { label: 'Notifications', href: ROUTES.NOTIFICATIONS, icon: Bell },
      { label: 'Integrations', href: ROUTES.INTEGRATIONS, icon: Plug },
    ],
  },
];

export const Sidebar = ({ className }: SidebarProps) => {
  const { clearAuth } = useAuthStore();
  const location = useLocation();

  return (
    <aside className={cn("flex flex-col bg-sidebar-bg text-sidebar-text border-r border-sidebar-border", className)}>
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border mb-4">
        <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center mr-3">
          <span className="text-white font-bold text-sm">AC</span>
        </div>
        <span className="text-white font-semibold tracking-wide">Admin Center</span>
      </div>

      <nav className="flex-1 overflow-y-auto w-full px-2 space-y-4">
        {navGroups.map((group, idx) => (
          <div key={idx} className="w-full">
            {group.label && (
              <h3 className="px-3 mb-2 text-[11px] font-semibold tracking-widest text-sidebar-group-label uppercase">
                {group.label}
              </h3>
            )}
            <div className="space-y-1 w-full">
              {group.items.map((item) => {
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "h-9 flex items-center gap-2.5 px-3 rounded-md text-[13px] font-medium transition-colors w-full",
                      isActive 
                        ? "bg-sidebar-active-bg text-sidebar-text-active border-l-2 border-primary" 
                        : "text-sidebar-text hover:bg-sidebar-hover hover:text-white border-l-2 border-transparent"
                    )}
                  >
                    <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-sidebar-text")} />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border mt-auto w-full">
        <button
          onClick={clearAuth}
          className="h-9 flex items-center gap-2.5 px-3 w-full rounded-md text-[13px] font-medium text-sidebar-text hover:bg-sidebar-hover hover:text-white transition-colors border-l-2 border-transparent"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
};
