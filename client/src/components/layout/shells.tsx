import { useMemo } from 'react';
import { AppShell } from './AppShell';
import { TenantTopActions } from './TenantTopActions';
import { AnnouncementBanner } from './AnnouncementBanner';
import { ADMIN_SHELL, OPERATOR_SHELL } from './navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useMyPermissions } from '@/hooks/useMyPermissions';
import { apiClient } from '@/lib/apiClient';
import { clearSession } from '@/lib/session';
import { logoutRedirect } from '@/lib/oidc';
import { ROUTES } from '@/constants/routes';
import { operatorLogout } from '@/features/operator/operatorAuth';
import { useOperatorMe } from '@/features/operator/operatorApi';

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
      banner={<AnnouncementBanner />}
    />
  );
};

/**
 * Operator console shell: AppShell with the `operator` config, the red Operator
 * marker and no launcher. Navigation follows the permission list from GET /operator/v1/me.
 */
export const OperatorShell = () => {
  const { data: me } = useOperatorMe();
  return <AppShell config={OPERATOR_SHELL} permissions={me?.permissions ?? []} user={{ name: me?.full_name || 'Operator', onSignOut: operatorLogout }} />;
};
