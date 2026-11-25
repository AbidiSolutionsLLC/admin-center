// src/components/layout/NavAccessGuard.tsx
// A page the menu hides for you is also closed when you type its URL (plan test run 2026-11-24: an Employee could open
// /roles and /security). Same rule as the menu: isNavItemVisible. The server stays the enforcement (decision G9);
// this only stops the page from rendering. While permissions load, or if they cannot be read, the page is not blocked.
import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useMyPermissions } from '@/hooks/useMyPermissions';
import { ROUTES } from '@/constants/routes';
import { ADMIN_SHELL, findNavItemForPath, isNavItemVisible } from './navigation';

export const NavAccessGuard = () => {
  const { pathname } = useLocation();
  const userRole = useAuthStore((s) => s.userRole);
  const { data, isPending } = useMyPermissions();
  const permissions = useMemo(
    () => Object.entries(data?.permissions ?? {}).filter(([, granted]) => granted).map(([key]) => key),
    [data]
  );

  const owner = findNavItemForPath(ADMIN_SHELL, pathname);
  if (!owner) return <Outlet />;
  if (isPending) {
    return <div role="status" className="p-6 text-table text-ink-secondary">Loading...</div>;
  }
  if (!data || isNavItemVisible(owner.item, owner.group, { permissions, role: userRole })) return <Outlet />;

  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface-card p-6 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-ink-muted" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-ink">You don't have access to this page</h1>
      <p className="mt-2 text-table text-ink-secondary">
        Your role doesn't include {owner.item.label}. Ask an administrator if you need it.
      </p>
      <Link to={ROUTES.OVERVIEW} className="mt-4 inline-block text-primary underline">Back to Overview</Link>
    </div>
  );
};
