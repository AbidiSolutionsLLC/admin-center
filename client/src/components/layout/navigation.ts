import {
  Building2,
  Users,
  Settings,
  LayoutDashboard,
  Shield,
  Package,
  ShieldAlert,
  Activity,
  FileText,
  GitBranch,
  CheckSquare,
  MapPin,
  Database,
  ClipboardList,
  CalendarDays,
  Layers,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { ROLES } from '@/constants/roles';

/**
 * Navigation config for AppShell (DRD 9.2: one shell, two configs).
 *
 * An item is visible when the permission list passed to the shell holds its `permission`.
 * A permission of the form `module:action:scope` must match exactly; `module:action`
 * matches that action in any scope. An item that names no permission is open to everyone,
 * unless its group names `roles` (legacy role names; no tenant group uses it any more).
 * An item may also name `roles`: then the user's role must be listed too. It mirrors a server router that is
 * still guarded by role names (`requireRole`), so the menu never offers a page the server refuses (plan 04 C1).
 * Navigation is a convenience: the server route guards remain the enforcement.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  /** Roles the server router allows (mirror of its `requireRole` list). Checked in addition to `permission`. */
  roles?: readonly string[];
  /**
   * Also close the page when its URL is typed (NavAccessGuard). Set only on pages that serve nobody without the
   * permission. Pages members may open for their own data (Apps & Access shows a member their own apps) stay open.
   */
  guardRoute?: boolean;
}

export interface NavGroup {
  label: string;
  roles?: readonly string[];
  items: NavItem[];
}

export interface ShellConfig {
  variant: 'admin' | 'operator';
  brand: { label: string; mark: string; href: string };
  groups: NavGroup[];
}

export interface NavContext {
  permissions: readonly string[];
  role?: string | null;
}

// Two key styles: tenant `module:action:scope` (a shorter key such as `people:read` matches any scope) and operator
// `area.action` (`tenants.read`, GET /operator/v1/me), which is matched exactly.
function holdsPermission(permissions: readonly string[], key: string): boolean {
  if (permissions.includes(key)) return true;
  if (!key.includes(':') || key.split(':').length >= 3) return false;
  return permissions.some((p) => p.startsWith(`${key}:`));
}

export function isNavItemVisible(item: NavItem, group: NavGroup, ctx: NavContext): boolean {
  if (item.roles && !(ctx.role && item.roles.includes(ctx.role))) return false;
  if (item.permission) return holdsPermission(ctx.permissions, item.permission);
  if (!group.roles) return true;
  return !!ctx.role && group.roles.includes(ctx.role);
}

/**
 * The menu item (and its group) that owns a URL path and is marked `guardRoute`, so the route can be held to the same
 * rule as its menu entry. Matches the item's path (query string ignored) or any sub-path of it.
 */
export function findNavItemForPath(config: ShellConfig, pathname: string): { item: NavItem; group: NavGroup } | null {
  for (const group of config.groups) {
    for (const item of group.items) {
      if (!item.guardRoute) continue;
      const base = item.href.split('?')[0];
      if (pathname === base || pathname.startsWith(`${base}/`)) return { item, group };
    }
  }
  return null;
}

/** Groups follow PRD AC-10. Permission keys are the seeded `module:action:scope` keys (lib/seed.ts). */
export const ADMIN_SHELL: ShellConfig = {
  variant: 'admin',
  brand: { label: 'Karbexa Admin', mark: 'KA', href: ROUTES.OVERVIEW },
  groups: [
    {
      label: 'Home',
      items: [{ label: 'Overview', href: ROUTES.OVERVIEW, icon: LayoutDashboard }],
    },
    {
      label: 'People',
      items: [
        { label: 'Users', href: ROUTES.PEOPLE, icon: Users, permission: 'people:read' },
        { label: 'Groups', href: ROUTES.GROUPS, icon: Users, permission: 'people:read' },
      ],
    },
    {
      label: 'Organisation',
      items: [
        { label: 'Structure', href: ROUTES.ORGANIZATION, icon: Building2, permission: 'organization:read' },
        { label: 'Teams', href: ROUTES.TEAMS, icon: Users, permission: 'organization:read' },
        { label: 'Locations', href: ROUTES.LOCATIONS, icon: MapPin, permission: 'locations:read' },
        { label: 'Calendars & schedules', href: '/locations?tab=holidays', icon: CalendarDays, permission: 'locations:read' },
      ],
    },
    {
      label: 'Apps & Access',
      items: [
        { label: 'Apps & Access', href: ROUTES.APPS, icon: Package, permission: 'apps:read:all' },
        { label: 'Subscription', href: ROUTES.SUBSCRIPTION, icon: Package, permission: 'apps:read:all' },
      ],
    },
    {
      label: 'Security & Governance',
      items: [
        { label: 'Admin roles', href: ROUTES.ROLES, icon: Shield, permission: 'roles:read:all', guardRoute: true },
        { label: 'Security', href: ROUTES.SECURITY, icon: Shield, permission: 'security:read:all', guardRoute: true },
        { label: 'Policies', href: ROUTES.POLICIES, icon: FileText, permission: 'policies:read:all' },
        { label: 'Audit log', href: ROUTES.AUDIT_LOGS, icon: ClipboardList, permission: 'audit_logs:read:all', roles: [ROLES.SUPER_ADMIN, ROLES.IT_ADMIN] }, // server: auditLogs.routes.ts
      ],
    },
    {
      label: 'Settings',
      items: [
        { label: 'Company', href: ROUTES.COMPANY_SETTINGS, icon: Settings, permission: 'organization:update:all', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] }, // server: company.routes.ts
        { label: 'Data fields', href: ROUTES.DATA_FIELDS, icon: Database, permission: 'data_fields:read:all' },
        { label: 'Workflows', href: ROUTES.WORKFLOWS, icon: GitBranch, permission: 'workflows:read:all' },
        { label: 'Approvals', href: ROUTES.APPROVALS, icon: CheckSquare, permission: 'workflows:read:all' },
      ],
    },
  ],
};

export const OPERATOR_SHELL: ShellConfig = {
  variant: 'operator',
  brand: { label: 'Karbexa', mark: 'KX', href: ROUTES.OPERATOR_OVERVIEW },
  groups: [
    {
      label: 'Platform',
      items: [
        { label: 'Overview', href: ROUTES.OPERATOR_OVERVIEW, icon: LayoutDashboard, permission: 'overview.read' },
        { label: 'Organizations', href: ROUTES.OPERATOR_ORGS, icon: Building2, permission: 'tenants.read' },
        { label: 'Onboarding', href: ROUTES.OPERATOR_ONBOARDING, icon: UserPlus, permission: 'tenants.read' },
        { label: 'Plans', href: ROUTES.OPERATOR_PLANS, icon: Layers, permission: 'tenants.read' },
        { label: 'Products', href: ROUTES.OPERATOR_PRODUCTS, icon: Package, permission: 'products.read' },
        { label: 'Platform health', href: ROUTES.OPERATOR_HEALTH, icon: Activity, permission: 'health.read' },
        { label: 'Operators', href: ROUTES.OPERATOR_OPERATORS, icon: ShieldCheck, permission: 'operators.read' },
        { label: 'Audit', href: ROUTES.OPERATOR_AUDIT, icon: ClipboardList, permission: 'audit.read' },
        { label: 'Security', href: ROUTES.OPERATOR_SECURITY, icon: ShieldAlert, permission: 'security.read' },
      ],
    },
  ],
};
