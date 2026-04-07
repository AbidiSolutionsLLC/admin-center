// src/features/people/components/IdentityHealthBadge.tsx
import React, { useMemo } from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { User } from '@/types';
import { cn } from '@/utils/cn';

interface IdentityHealthBadgeProps {
  user: User;
  className?: string;
}

interface HealthSignal {
  status: 'ok' | 'warning' | 'critical';
  label: string;
  tooltip: string;
}

/**
 * IdentityHealthBadge Component
 * Shows user identity health as colored dots representing various signals:
 * - Role assignment (no role = warning)
 * - Department assignment (no dept = warning)
 * - Login activity (>90 days inactive = critical)
 * - Manager assignment (no manager = warning)
 *
 * Green = ok, Amber = warning, Red = critical
 * Used on: PeoplePage (in UserTable rows), UserProfilePage.
 */
export const IdentityHealthBadge: React.FC<IdentityHealthBadgeProps> = ({ user, className }) => {
  const healthSignals = useMemo<HealthSignal[]>(() => {
    const signals: HealthSignal[] = [];

    // Check role assignment
    if (!user.roles || user.roles.length === 0) {
      signals.push({
        status: 'warning',
        label: 'No Role',
        tooltip: 'User has no roles assigned',
      });
    } else {
      signals.push({
        status: 'ok',
        label: 'Roles',
        tooltip: `${user.roles.length} role(s) assigned`,
      });
    }

    // Check department assignment
    if (!user.department_id) {
      signals.push({
        status: 'warning',
        label: 'No Dept',
        tooltip: 'User has no department assigned',
      });
    } else {
      signals.push({
        status: 'ok',
        label: 'Dept',
        tooltip: `Department: ${user.department?.name || 'Assigned'}`,
      });
    }

    // Check login activity
    if (user.lifecycle_state === 'active' && user.last_login) {
      const daysSinceLogin = Math.floor(
        (Date.now() - new Date(user.last_login).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceLogin > 90) {
        signals.push({
          status: 'critical',
          label: 'Inactive',
          tooltip: `Last login ${daysSinceLogin} days ago`,
        });
      } else if (daysSinceLogin > 30) {
        signals.push({
          status: 'warning',
          label: 'Low Activity',
          tooltip: `Last login ${daysSinceLogin} days ago`,
        });
      } else {
        signals.push({
          status: 'ok',
          label: 'Active',
          tooltip: `Last login ${daysSinceLogin} days ago`,
        });
      }
    } else if (user.lifecycle_state === 'active' && !user.last_login) {
      signals.push({
        status: 'critical',
        label: 'Never Logged In',
        tooltip: 'User has never logged in',
      });
    } else {
      signals.push({
        status: 'ok',
        label: 'Login',
        tooltip: 'Login status normal',
      });
    }

    // Check manager assignment
    if (!user.manager_id && user.lifecycle_state === 'active') {
      signals.push({
        status: 'warning',
        label: 'No Manager',
        tooltip: 'User has no manager assigned',
      });
    } else {
      signals.push({
        status: 'ok',
        label: 'Manager',
        tooltip: user.manager?.full_name ? `Manager: ${user.manager.full_name}` : 'Manager assigned',
      });
    }

    return signals;
  }, [user]);

  const hasCritical = healthSignals.some((s) => s.status === 'critical');
  const hasWarning = healthSignals.some((s) => s.status === 'warning');

  const overallStatus = hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok';

  const statusIcon = {
    ok: <CheckCircle className="w-3.5 h-3.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5" />,
    critical: <XCircle className="w-3.5 h-3.5" />,
  };

  const statusColor = {
    ok: 'text-emerald-500',
    warning: 'text-amber-500',
    critical: 'text-red-500',
  };

  const dotColor = {
    ok: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-red-500',
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Overall status icon */}
      <span className={cn('flex-shrink-0', statusColor[overallStatus])} title={`Overall: ${overallStatus}`}>
        {statusIcon[overallStatus]}
      </span>

      {/* Individual health signal dots */}
      {healthSignals.map((signal, idx) => (
        <span
          key={idx}
          className={cn('w-2 h-2 rounded-full flex-shrink-0', dotColor[signal.status])}
          title={`${signal.label}: ${signal.tooltip}`}
        />
      ))}
    </div>
  );
};
