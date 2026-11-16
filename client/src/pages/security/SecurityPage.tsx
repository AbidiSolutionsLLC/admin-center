// src/pages/security/SecurityPage.tsx
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { SecurityPolicyForm } from '@/features/security/components/SecurityPolicyForm';
import { AccessLogTable } from '@/features/security/components/AccessLogTable';
import { ActiveSessionsTable } from '@/features/security/components/ActiveSessionsTable';
import { IpRestrictionsTable } from '@/features/security/components/IpRestrictionsTable';
import { IdentityProvidersView } from '@/features/security/components/IdentityProvidersView';

/**
 * Security Page (elevation 5.8: PageHeader + URL-synced Tabs, `?tab=`)
 * Manages security policy settings and views access logs.
 * Route: /security
 */
export default function SecurityPage() {
  return (
    <div>
      <PageHeader
        title="Security"
        subtitle="Manage security policies, monitor access logs, and control user sessions"
      />
      <Tabs
        items={[
          { value: 'policy', label: 'Security policy', content: <SecurityPolicyForm /> },
          { value: 'identity-providers', label: 'Identity providers', content: <IdentityProvidersView /> },
          { value: 'ip-restrictions', label: 'IP restrictions', content: <IpRestrictionsTable /> },
          { value: 'access-log', label: 'Access log', content: <AccessLogTable /> },
          { value: 'active-sessions', label: 'Active sessions', content: <ActiveSessionsTable /> },
        ]}
      />
    </div>
  );
}
