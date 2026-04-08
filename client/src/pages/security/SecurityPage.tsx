// src/pages/security/SecurityPage.tsx
import { useState } from 'react';
import { Shield, FileText, Activity } from 'lucide-react';
import { SecurityPolicyForm } from '@/features/security/components/SecurityPolicyForm';
import { AccessLogTable } from '@/features/security/components/AccessLogTable';

type TabType = 'policy' | 'access-log';

/**
 * Security Page
 * Manages security policy settings and views access logs.
 * Route: /security
 */
export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<TabType>('policy');

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Security
          </h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Manage security policies, monitor access logs, and control user sessions
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-white rounded-lg border border-line shadow-card p-1">
        <button
          onClick={() => setActiveTab('policy')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'policy'
              ? 'bg-primary text-white'
              : 'text-ink-secondary hover:text-ink hover:bg-surface-alt'
          }`}
        >
          <Shield className="w-4 h-4" />
          Security Policy
        </button>
        <button
          onClick={() => setActiveTab('access-log')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'access-log'
              ? 'bg-primary text-white'
              : 'text-ink-secondary hover:text-ink hover:bg-surface-alt'
          }`}
        >
          <Activity className="w-4 h-4" />
          Access Log
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'policy' ? (
        <SecurityPolicyForm />
      ) : (
        <AccessLogTable />
      )}
    </div>
  );
}
