import React from 'react';
import { useHasPermission } from '@/hooks/useMyPermissions';

interface PermissionGateProps {
  module: string;
  action: string;
  dataScope?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A wrapper component that conditionally renders its children based on
 * whether the current logged-in user has the specified permission.
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  module,
  action,
  dataScope = 'all',
  children,
  fallback = null,
}) => {
  const hasPermission = useHasPermission(module, action, dataScope);

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
