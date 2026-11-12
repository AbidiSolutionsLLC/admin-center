// src/features/people/components/UserSecurityPanel.tsx
import React, { useState } from 'react';
import {
  Shield,
  KeyRound,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
} from 'lucide-react';
import type { User } from '@/types';
import { useResetMfa } from '../hooks/useResetMfa';
import { useUnlockUser } from '../hooks/useUnlockUser';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/store/useAuthStore';
import { useMyPermissions } from '@/hooks/useMyPermissions';
import { PERMISSION_GROUPS, ROLES } from '@/constants/roles';

interface UserSecurityPanelProps {
  user: User;
}

/**
 * UserSecurityPanel Component
 * Displays security posture, MFA enrollment status, account lock status,
 * and allows IT / Super Admins to reset MFA per 03 §4.4 (A2-6).
 */
export const UserSecurityPanel: React.FC<UserSecurityPanelProps> = ({ user }) => {
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const resetMfa = useResetMfa(user._id);
  const unlockUser = useUnlockUser(user._id);

  const { userRole } = useAuthStore();
  const { data: myPerms } = useMyPermissions();

  // 03 §4.4: it_admin or super_admin of the member's org can reset MFA
  const canResetMfa = Boolean(
    (userRole &&
      (userRole === 'super_admin' ||
        userRole === 'it_admin' ||
        userRole === ROLES.SUPER_ADMIN ||
        userRole === ROLES.IT_ADMIN ||
        (PERMISSION_GROUPS.IT_ADMINS as readonly string[]).includes(userRole))) ||
      myPerms?.roles?.some((r) =>
        ['super_admin', 'it_admin', ROLES.SUPER_ADMIN, ROLES.IT_ADMIN].includes(r.name as typeof ROLES.SUPER_ADMIN | typeof ROLES.IT_ADMIN)
      )
  );

  const isLocked = Boolean(user.locked_until && new Date(user.locked_until) > new Date());
  const isMfaEnrolled = Boolean(user.mfa_enabled);

  const handleConfirmReset = () => {
    resetMfa.mutate(undefined, {
      onSettled: () => {
        setIsResetConfirmOpen(false);
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Security & Authentication</h2>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Manage multi-factor authentication, account credentials status, and session security.
          </p>
        </div>
      </div>

      {/* Security Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* MFA Enrolment Card */}
        <div className="bg-white rounded-xl border border-line shadow-card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isMfaEnrolled
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-amber-50 text-amber-600 border border-amber-200'
                }`}
              >
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Multi-Factor Authentication (MFA)</h3>
                <div className="flex items-center gap-2 mt-1">
                  {isMfaEnrolled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Enrolled (TOTP)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Not Enrolled
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-ink-secondary leading-relaxed">
            Multi-factor authentication protects this account by requiring a time-based one-time passcode (TOTP) from an authenticator app at login.
          </p>

          {/* Reset MFA Action (A2-6 / 03 §4.4) */}
          {canResetMfa && (
            <div className="pt-2 border-t border-line/70 flex items-center justify-between">
              <span className="text-xs text-ink-muted">Lost phone or authenticator?</span>
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                disabled={resetMfa.isPending}
                className="h-8 px-3 text-xs font-medium rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetMfa.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset MFA
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Account Lock & Session Card */}
        <div className="bg-white rounded-xl border border-line shadow-card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isLocked
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                }`}
              >
                {isLocked ? <Lock className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Account Lock Posture</h3>
                <div className="flex items-center gap-2 mt-1">
                  {isLocked ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                      <Lock className="w-3.5 h-3.5" />
                      Locked Until {new Date(user.locked_until!).toLocaleTimeString()}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Active / Unlocked
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-ink-secondary">
            <div className="flex justify-between">
              <span>Failed Login Attempts:</span>
              <span className="font-mono text-ink">
                {isLocked ? 'Threshold Exceeded' : 'Normal'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Last Login:</span>
              <span className="font-mono text-ink">
                {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
              </span>
            </div>
          </div>

          {isLocked && (
            <div className="pt-2 border-t border-line/70 flex justify-end">
              <button
                type="button"
                onClick={() => unlockUser.mutate()}
                disabled={unlockUser.isPending}
                className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white hover:bg-surface-alt text-ink transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Unlock className="w-3.5 h-3.5" />
                Unlock Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audit & Recovery Notice */}
      <div className="flex items-start gap-3 p-3.5 rounded-lg bg-surface-alt border border-line text-xs text-ink-secondary">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-ink">Admin MFA Recovery Protocol (03 §4.4)</p>
          <p className="leading-relaxed">
            When an administrator resets a user's MFA, their current TOTP secret is cleared, backup recovery codes are invalidated, and all active sessions are immediately revoked. The member will be required to re-enrol MFA on their next login attempt, and a security notification is automatically delivered to their email address.
          </p>
        </div>
      </div>

      {/* Confirmation Dialog (03 §4.4) */}
      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={handleConfirmReset}
        title="Reset MFA for this member?"
        description="Reset MFA for this member? They will be required to re-enrol MFA at next login and current sessions will be revoked."
        confirmLabel="Reset MFA"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={resetMfa.isPending}
      />
    </div>
  );
};
