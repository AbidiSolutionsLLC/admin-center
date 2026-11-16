import { useMemo } from 'react';
import { AppShell } from './AppShell';
import { TenantTopActions } from './TenantTopActions';
import { ADMIN_SHELL, OPERATOR_SHELL } from './navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useMyPermissions } from '@/hooks/useMyPermissions';
import { apiClient } from '@/lib/apiClient';
import { clearSession } from '@/lib/session';
import { logoutRedirect } from '@/lib/oidc';
import { ROUTES } from '@/constants/routes';
import { operatorLogout } from '@/features/operator/operatorAuth';

/** Tenant (Admin Center) shell: AppShell with the `admin` config and the tenant top-bar actions. */
export const TenantShell = () => {
  const userName = useAuthStore((s) => s.userName);
  const userRole = useAuthStore((s) => s.userRole);
  const { data } = useMyPermissions();
  const permissions = useMemo(
    () => Object.entries(data?.permissions ?? {}).filter(([, granted]) => granted).map(([key]) => key),
    [data]
  );

  // Revoke the session server-side, clear local state, then end the IdP session
  const handleSignOut = async () => {
    let endSessionUrl: string | undefined;
    try {
      const { data: res } = await apiClient.post('/auth/logout');
      endSessionUrl = res?.data?.end_session_url;
    } catch {
      // ignore: local state is cleared regardless
    }
    clearSession();
    if (endSessionUrl) logoutRedirect(endSessionUrl);
    else window.location.assign(`${ROUTES.LOGIN}?signed_out=1`);
  };

  return (
    <AppShell
      config={ADMIN_SHELL}
      permissions={permissions}
      role={userRole}
      user={{ name: userName, onSignOut: handleSignOut }}
      topBarEnd={<TenantTopActions />}
    />
  );
};

/**
 * Operator console shell: AppShell with the `operator` config, the red Operator
 * marker and no launcher. Navigation permissions arrive with the operator roles (Phase 4).
 */
export const OperatorShell = () => (
  <AppShell config={OPERATOR_SHELL} user={{ name: 'Operator', onSignOut: operatorLogout }} />
);
