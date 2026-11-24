// client/src/components/layout/AppLauncher.tsx — 08 §4 App Launcher
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, Users, CheckSquare, FileText, Headphones, Shield, ExternalLink, Package, Briefcase } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/useAuthStore';
import { PERMISSION_GROUPS } from '@/constants/roles';

export interface AppItem {
  id: string;
  name: string;
  slug: string;
  product_key: string;
  launch_url: string;
  icon_url?: string;
  description?: string;
  role: string;
  role_name: string;
}

export const AppLauncher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { userRole } = useAuthStore() as any;

  // Query /api/v1/me/apps
  const { data: apps = [], isLoading } = useQuery<AppItem[]>({
    queryKey: ['me', 'apps'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: AppItem[] }>('/me/apps');
      return res.data.data ?? [];
    },
    staleTime: 60_000,
  });

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

  // Check if member holds an org admin role (08 §4: show Karbexa Admin if member holds any org admin role)
  const isOrgAdmin = userRole && (
    PERMISSION_GROUPS.ROLE_ADMINS.includes(userRole) ||
    PERMISSION_GROUPS.IT_ADMINS.includes(userRole) ||
    PERMISSION_GROUPS.OPS_ADMINS.includes(userRole) ||
    ['super_admin', 'it_admin', 'hr_admin', 'ops_admin', 'admin'].includes(String(userRole).toLowerCase())
  );

  // Helper for product icon
  const getProductIcon = (productKey: string) => {
    switch (productKey) {
      case 'people':
        return <Users className="w-5 h-5 text-sky-400" />;
      case 'projects':
        return <CheckSquare className="w-5 h-5 text-amber-400" />;
      case 'sign':
        return <FileText className="w-5 h-5 text-emerald-400" />;
      case 'desk':
        return <Headphones className="w-5 h-5 text-violet-400" />;
      case 'admin':
        return <Shield className="w-5 h-5 text-[#f59e0b]" />;
      case 'zyntrus':
        return <Briefcase className="w-5 h-5 text-cyan-400" />; // hiring platform (standalone portal)
      default:
        return <Package className="w-5 h-5 text-slate-400" />;
    }
  };

  // Every tile offers both choices: the tile opens the portal in this tab, the small arrow opens it in a new tab.
  // A new tab gets no `window.opener` and no referrer (DRD §8.7: a delivered portal is a third-party page).
  const handleAppClick = (url: string, target: 'same' | 'new' = 'same') => {
    if (!url || !(/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url))) return;
    if (target === 'new') {
      const absolute = url.startsWith('/') ? `${window.location.origin}${url}` : url;
      window.open(absolute, '_blank', 'noopener,noreferrer');
    } else {
      window.location.assign(url);
    }
    setIsOpen(false);
  };

  const renderNewTabButton = (name: string, url: string, testId: string) => (
    <button
      type="button"
      onClick={() => handleAppClick(url, 'new')}
      title={`Open ${name} in a new tab`}
      aria-label={`Open ${name} in a new tab`}
      data-testid={testId}
      className="absolute bottom-2 right-2 p-1 rounded-md text-slate-500 hover:text-[#f59e0b] hover:bg-white/10 transition-colors"
    >
      <ExternalLink size={12} />
    </button>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: isOpen ? 'var(--glass-hover)' : 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          position: 'relative',
          color: '#f59e0b',
        }}
        aria-label="App Launcher"
        title="App Launcher"
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = isOpen ? 'var(--glass-hover)' : 'var(--glass-bg)')}
      >
        <LayoutGrid size={17} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-80 glass-panel rounded-2xl z-50 overflow-hidden shadow-dropdown"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20">
            <span className="text-sm font-semibold text-slate-200">Karbexa Apps</span>
            <span className="text-[11px] text-slate-400 font-mono">
              {apps.length + (isOrgAdmin ? 1 : 0)} available
            </span>
          </div>

          {/* Grid of tiles */}
          <div className="p-3 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto scrollbar-hide">
            {/* Karbexa Admin Tile (if org admin) */}
            {isOrgAdmin && (
              <div key="karbexa-admin" className="relative">
                <button
                  type="button"
                  onClick={() => handleAppClick('/', 'same')}
                  title="Open Karbexa Admin in this tab"
                  data-testid="launcher-same-admin"
                  className="w-full h-full flex flex-col items-start p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#f59e0b]/40 transition-all text-left group"
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/15 border border-[#f59e0b]/30 flex items-center justify-center">
                      {getProductIcon('admin')}
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#f59e0b]/20 text-[#f59e0b]">
                      Active
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-slate-100 group-hover:text-[#f59e0b] transition-colors">
                    Karbexa Admin
                  </span>
                  <span className="text-[11px] text-slate-400 truncate w-full mt-0.5">
                    Admin Console
                  </span>
                </button>
                {renderNewTabButton('Karbexa Admin', '/', 'launcher-new-admin')}
              </div>
            )}

            {/* Products with effective access */}
            {isLoading ? (
              <div className="col-span-2 py-6 text-center text-xs text-slate-400 animate-pulse">
                Loading apps...
              </div>
            ) : apps.length === 0 && !isOrgAdmin ? (
              <div className="col-span-2 py-6 text-center text-xs text-slate-400">
                No apps assigned
              </div>
            ) : (
              apps.map((app) => (
                <div key={app.id || app.product_key} className="relative">
                  <button
                    type="button"
                    onClick={() => handleAppClick(app.launch_url, 'same')}
                    title={`Open ${app.name} in this tab`}
                    data-testid={`launcher-same-${app.product_key}`}
                    className="w-full h-full flex flex-col items-start p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center">
                        {getProductIcon(app.product_key)}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-100 group-hover:text-primary transition-colors truncate w-full">
                      {app.name}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate w-full mt-0.5">
                      {app.role_name || app.role || 'Member'}
                    </span>
                  </button>
                  {renderNewTabButton(app.name, app.launch_url, `launcher-new-${app.product_key}`)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
