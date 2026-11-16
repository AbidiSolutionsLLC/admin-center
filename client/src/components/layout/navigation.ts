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
import { PERMISSION_GROUPS } from '@/constants/roles';

/**
 * Navigation config for AppShell (DRD 9.2: one shell, two configs).
 *
 * An item is visible when ANY of these holds:
 *   - it names a `permission` and that permission is in the permission list passed to the shell
 *   - it names `roles` and the user's role is one of them
 *   - it names neither and its group is open to everyone (no `roles`) or to the user's role
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  roles?: readonly string[];
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

export function isNavItemVisible(item: NavItem, group: NavGroup, ctx: NavContext): boolean {
  if (item.permission && ctx.permissions.includes(item.permission)) return true;
  if (item.roles && ctx.role && item.roles.includes(ctx.role)) return true;
  if (!item.permission && !item.roles) {
    if (!group.roles) return true;
    return !!ctx.role && group.roles.includes(ctx.role);
  }
  return false;
}

const EVERYONE = [...PERMISSION_GROUPS.ALL, 'super_admin', 'hr_admin', 'manager', 'employee'] as const;

export const ADMIN_SHELL: ShellConfig = {
  variant: 'admin',
  brand: { label: 'Karbexa Admin', mark: 'KA', href: ROUTES.OVERVIEW },
  groups: [
    {
      label: 'Home',
      roles: EVERYONE,
      items: [{ label: 'Overview', href: ROUTES.OVERVIEW, icon: LayoutDashboard }],
    },
    {
      label: 'Directory',
      roles: EVERYONE,
      items: [
        { label: 'Users', href: ROUTES.PEOPLE, icon: Users },
        { label: 'Groups', href: ROUTES.GROUPS, icon: Users },
      ],
    },
    {
      label: 'Organisation',
      roles: [...PERMISSION_GROUPS.ROLE_ADMINS, 'super_admin', 'hr_admin', 'ops_admin'],
      items: [
        { label: 'Organisation', href: ROUTES.ORGANIZATION, icon: Building2 },
        { label: 'Teams', href: ROUTES.TEAMS, icon: Users },
        { label: 'Locations', href: ROUTES.LOCATIONS, icon: MapPin },
      ],
    },
    {
      label: 'Apps & Access',
      roles: [...PERMISSION_GROUPS.ROLE_ADMINS, 'super_admin', 'hr_admin', 'ops_admin', 'it_admin'],
      items: [
        { label: 'Apps & Access', href: ROUTES.APPS, icon: Package },
        { label: 'Subscription', href: ROUTES.SUBSCRIPTION, icon: Package },
      ],
    },
    {
      label: 'Security & Governance',
      roles: [...PERMISSION_GROUPS.ROLE_ADMINS, 'super_admin', 'it_admin', 'hr_admin'],
      items: [
        { label: 'Admin roles', href: ROUTES.ROLES, icon: Shield },
        { label: 'Security', href: ROUTES.SECURITY, icon: Shield },
        { label: 'Calendars & schedules', href: '/locations?tab=holidays', icon: CalendarDays },
      ],
    },
    {
      label: 'Settings & Audit',
      roles: [...PERMISSION_GROUPS.IT_ADMINS, 'super_admin', 'ops_admin'],
      items: [
        { label: 'Settings', href: ROUTES.COMPANY_SETTINGS, icon: Settings },
        {
          label: 'Audit log',
          href: ROUTES.AUDIT_LOGS,
          icon: ClipboardList,
          permission: 'audit:read:all',
          roles: [...PERMISSION_GROUPS.IT_ADMINS, 'super_admin'],
        },
        { label: 'Policies', href: ROUTES.POLICIES, icon: FileText },
        { label: 'Workflows', href: ROUTES.WORKFLOWS, icon: GitBranch },
        { label: 'Approvals', href: ROUTES.APPROVALS, icon: CheckSquare },
        { label: 'Data Fields', href: ROUTES.DATA_FIELDS, icon: Database },
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
