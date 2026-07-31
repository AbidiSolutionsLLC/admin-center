// src/features/security/components/SecurityPolicyForm.tsx
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSecurityPolicy } from '../hooks/useSecurityPolicy';
import { useUpdateSecurityPolicy } from '../hooks/useUpdateSecurityPolicy';
import { useAuthStore } from '@/store/useAuthStore';
import { PERMISSION_GROUPS } from '@/constants/roles';

const policyFormSchema = z.object({
  policy_name: z.string().min(1, 'Policy name is required'),
  description: z.string().optional(),
  is_enabled: z.boolean(),
  settings: z.object({
    max_failed_login_attempts: z.number().min(1).max(20),
    lockout_duration_minutes: z.number().min(1),
    session_timeout_minutes: z.number().min(1),
    max_concurrent_sessions: z.number().min(1).max(10),
    require_mfa: z.boolean(),
    terminate_session_on_risk: z.boolean(),
    risk_threshold_for_termination: z.number().min(1).max(100),
    password_min_length: z.number().min(4).max(128),
    password_require_uppercase: z.boolean(),
    password_require_lowercase: z.boolean(),
    password_require_numbers: z.boolean(),
    password_require_special_chars: z.boolean(),
    password_expiry_days: z.number().min(0),
    password_history_count: z.number().min(0).max(24),
    ip_whitelist_enabled: z.boolean(),
    ip_whitelist: z.array(z.string()),
    ip_blacklist_enabled: z.boolean(),
    ip_blacklist: z.array(z.string()),
    alert_settings: z.object({
      notify_on_failed_logins: z.boolean().default(false),
      failed_logins_threshold: z.number().min(1).default(5),
      notify_on_suspicious_login: z.boolean().default(false),
      notify_on_risk_flags: z.boolean().default(false),
      alert_emails: z.array(z.string().email()).default([]),
    }).optional(),
  }),
});

type PolicyFormValues = z.infer<typeof policyFormSchema>;

/**
 * Security Policy Form Component
 * Displays and edits security policy settings.
 * Used on: SecurityPage (Policy tab)
 */
export function SecurityPolicyForm() {
  const { data: policy, isLoading, error } = useSecurityPolicy();
  const updateMutation = useUpdateSecurityPolicy();
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: {
      policy_name: 'Default Security Policy',
      description: '',
      is_enabled: true,
      settings: {
        max_failed_login_attempts: 5,
        lockout_duration_minutes: 30,
        session_timeout_minutes: 480,
        max_concurrent_sessions: 3,
        require_mfa: false,
        terminate_session_on_risk: false,
        risk_threshold_for_termination: 60,
        password_min_length: 8,
        password_require_uppercase: true,
        password_require_lowercase: true,
        password_require_numbers: true,
        password_require_special_chars: true,
        password_expiry_days: 90,
        password_history_count: 5,
        ip_whitelist_enabled: false,
        ip_whitelist: [],
        ip_blacklist_enabled: false,
        ip_blacklist: [],
        alert_settings: {
          notify_on_failed_logins: false,
          failed_logins_threshold: 5,
          notify_on_suspicious_login: false,
          notify_on_risk_flags: false,
          alert_emails: [],
        },
      },
    },
  });

  // Reset form when policy loads
  useEffect(() => {
    if (policy) {
      reset({
        policy_name: policy.policy_name,
        description: policy.description || '',
        is_enabled: policy.is_enabled,
        settings: policy.settings,
      });
    }
  }, [policy, reset]);

  const onSubmit = async (data: PolicyFormValues) => {
    if (!policy) return;
    await updateMutation.mutateAsync({ ...data, _id: policy._id } as any);
    setIsEditing(false);
  };

  const userRole = useAuthStore((state) => state.userRole);
  const canEdit = userRole ? PERMISSION_GROUPS.IT_ADMINS.includes(userRole as any) : false;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-5 space-y-4">
        <div className="h-6 bg-skeleton rounded animate-pulse w-1/3" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 bg-skeleton rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-12 text-center">
        <p className="text-sm text-error">Failed to load security policy</p>
      </div>
    );
  }

  const watchIPWhitelist = watch('settings.ip_whitelist_enabled');
  const watchIPBlacklist = watch('settings.ip_blacklist_enabled');

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      {/* Form Header */}
      <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-alt">
        <div>
          <h2 className="text-base font-semibold text-ink">Security Policy Settings</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Configure session timeout, MFA, and password requirements
          </p>
        </div>
        {canEdit && (
          !isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors"
            >
              Edit Policy
            </button>
          ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                if (policy) {
                  reset({
                    policy_name: policy.policy_name,
                    description: policy.description || '',
                    is_enabled: policy.is_enabled,
                    settings: policy.settings,
                  });
                }
              }}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit(onSubmit)}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          )
        )}
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
        {/* Policy Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">
              Policy Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              {...register('policy_name')}
              disabled={!isEditing || isSubmitting}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                         placeholder:text-ink-muted
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                         disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                         transition-all duration-150"
            />
            {errors.policy_name && (
              <p className="text-xs text-error">{errors.policy_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Description</label>
            <input
              type="text"
              {...register('description')}
              disabled={!isEditing || isSubmitting}
              className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                         placeholder:text-ink-muted
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                         disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                         transition-all duration-150"
            />
          </div>
        </div>

        {/* Session Settings */}
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">Session Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Max Failed Login Attempts
              </label>
              <input
                type="number"
                {...register('settings.max_failed_login_attempts', { valueAsNumber: true })}
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                           transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Lockout Duration (minutes)
              </label>
              <input
                type="number"
                {...register('settings.lockout_duration_minutes', { valueAsNumber: true })}
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                           transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                {...register('settings.session_timeout_minutes', { valueAsNumber: true })}
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                           transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Max Concurrent Sessions
              </label>
              <input
                type="number"
                {...register('settings.max_concurrent_sessions', { valueAsNumber: true })}
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                           transition-all duration-150"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="require_mfa"
                {...register('settings.require_mfa')}
                disabled={!isEditing || isSubmitting}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="require_mfa" className="text-sm font-medium text-ink">
                Require Multi-Factor Authentication
              </label>
            </div>

            <div className="flex flex-col gap-3 pt-6">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="terminate_session_on_risk"
                  {...register('settings.terminate_session_on_risk')}
                  disabled={!isEditing || isSubmitting}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
                />
                <label htmlFor="terminate_session_on_risk" className="text-sm font-medium text-ink">
                  Terminate sessions on high risk
                </label>
              </div>

              {watch('settings.terminate_session_on_risk') && (
                <div className="pl-7 space-y-1.5">
                  <label className="text-sm font-medium text-ink">
                    Risk Threshold (1-100)
                  </label>
                  <input
                    type="number"
                    {...register('settings.risk_threshold_for_termination', { valueAsNumber: true })}
                    disabled={!isEditing || isSubmitting}
                    className="w-full max-w-[200px] h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                               transition-all duration-150"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Password Requirements */}
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">Password Requirements</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Minimum Length
              </label>
              <input
                type="number"
                {...register('settings.password_min_length', { valueAsNumber: true })}
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                           transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Password Expiry (days, 0 = never)
              </label>
              <input
                type="number"
                {...register('settings.password_expiry_days', { valueAsNumber: true })}
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                           transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Password History (prevents reuse of last N passwords)
              </label>
              <input
                type="number"
                {...register('settings.password_history_count', { valueAsNumber: true })}
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                           transition-all duration-150"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="password_require_uppercase"
                {...register('settings.password_require_uppercase')}
                disabled={!isEditing || isSubmitting}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="password_require_uppercase" className="text-sm font-medium text-ink">
                Require Uppercase Letters
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="password_require_lowercase"
                {...register('settings.password_require_lowercase')}
                disabled={!isEditing || isSubmitting}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="password_require_lowercase" className="text-sm font-medium text-ink">
                Require Lowercase Letters
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="password_require_numbers"
                {...register('settings.password_require_numbers')}
                disabled={!isEditing || isSubmitting}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="password_require_numbers" className="text-sm font-medium text-ink">
                Require Numbers
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="password_require_special_chars"
                {...register('settings.password_require_special_chars')}
                disabled={!isEditing || isSubmitting}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="password_require_special_chars" className="text-sm font-medium text-ink">
                Require Special Characters
              </label>
            </div>
          </div>
        </div>

        {/* IP Whitelist */}
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">IP Whitelist</h3>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              id="ip_whitelist_enabled"
              {...register('settings.ip_whitelist_enabled')}
              disabled={!isEditing || isSubmitting}
              className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
            />
            <label htmlFor="ip_whitelist_enabled" className="text-sm font-medium text-ink">
              Enable IP Whitelist
            </label>
          </div>

          {watchIPWhitelist && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Allowed IPs (comma-separated)
              </label>
              <input
                type="text"
                placeholder="192.168.1.1, 10.0.0.1"
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           placeholder:text-ink-muted
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed"
                value={watch('settings.ip_whitelist').join(', ')}
                onChange={(e) => {
                  const ips = e.target.value.split(',').map((ip) => ip.trim()).filter(Boolean);
                  setValue('settings.ip_whitelist', ips, { shouldDirty: true });
                }}
              />
            </div>
          )}
        </div>

        {/* IP Blacklist */}
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">IP Blacklist</h3>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              id="ip_blacklist_enabled"
              {...register('settings.ip_blacklist_enabled')}
              disabled={!isEditing || isSubmitting}
              className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
            />
            <label htmlFor="ip_blacklist_enabled" className="text-sm font-medium text-ink">
              Enable IP Blacklist
            </label>
          </div>

          {watchIPBlacklist && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">
                Blocked IPs (comma-separated, supports CIDR like 192.168.1.0/24)
              </label>
              <input
                type="text"
                placeholder="10.0.0.5, 192.168.1.0/24"
                disabled={!isEditing || isSubmitting}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                           placeholder:text-ink-muted
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                           disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed"
                value={watch('settings.ip_blacklist').join(', ')}
                onChange={(e) => {
                  const ips = e.target.value.split(',').map((ip) => ip.trim()).filter(Boolean);
                  setValue('settings.ip_blacklist', ips, { shouldDirty: true });
                }}
              />
            </div>
          )}
        </div>

        {/* Admin Alerts */}
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">Admin Alerts (IT Admins)</h3>
          <div className="grid grid-cols-1 gap-4 bg-surface-alt p-4 rounded-lg border border-line">
            
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="notify_on_failed_logins"
                  {...register('settings.alert_settings.notify_on_failed_logins')}
                  disabled={!isEditing || isSubmitting}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
                />
                <label htmlFor="notify_on_failed_logins" className="text-sm font-medium text-ink">
                  Notify on failed logins
                </label>
              </div>

              {watch('settings.alert_settings.notify_on_failed_logins') && (
                <div className="pl-7 space-y-1.5">
                  <label className="text-sm font-medium text-ink">
                    Alert Threshold (Failed Attempts)
                  </label>
                  <input
                    type="number"
                    {...register('settings.alert_settings.failed_logins_threshold', { valueAsNumber: true })}
                    disabled={!isEditing || isSubmitting}
                    className="w-full max-w-[200px] h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed
                               transition-all duration-150"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notify_on_suspicious_login"
                {...register('settings.alert_settings.notify_on_suspicious_login')}
                disabled={!isEditing || isSubmitting}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="notify_on_suspicious_login" className="text-sm font-medium text-ink">
                Notify on suspicious login behavior
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notify_on_risk_flags"
                {...register('settings.alert_settings.notify_on_risk_flags')}
                disabled={!isEditing || isSubmitting}
                className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
              />
              <label htmlFor="notify_on_risk_flags" className="text-sm font-medium text-ink">
                Notify on risk detection flags
              </label>
            </div>

          </div>
        </div>

        {/* Policy Status */}
        <div className="flex items-center gap-3 p-4 bg-surface-alt rounded-lg border border-line">
          <input
            type="checkbox"
            id="is_enabled"
            {...register('is_enabled')}
            disabled={!isEditing || isSubmitting}
            className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
          />
          <label htmlFor="is_enabled" className="text-sm font-medium text-ink">
            Policy is active and enforced
          </label>
        </div>
      </form>
    </div>
  );
}
