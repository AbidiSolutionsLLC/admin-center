// src/features/integrations/components/IntegrationForm.tsx
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Integration, IntegrationType } from '@/types';
import { cn } from '@/utils/cn';

const schema = z.object({
  credentials: z.record(z.string(), z.unknown()).min(1, 'At least one credential is required'),
  sync_enabled: z.boolean().default(false),
  sync_frequency: z.enum(['manual', 'hourly', 'daily', 'weekly']).default('manual'),
  field_mapping: z.record(z.string(), z.string()).optional().default({}),
});

export type IntegrationFormData = z.infer<typeof schema>;

interface IntegrationFormProps {
  integrationType: IntegrationType;
  initialData?: Integration;
  onSubmit: (data: IntegrationFormData) => void;
  isSubmitting?: boolean;
}

const CREDENTIAL_FIELDS: Record<IntegrationType, { key: string; label: string; type: string; placeholder: string }[]> = {
  slack: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...' },
    { key: 'team_id', label: 'Team ID', type: 'text', placeholder: 'TXXXXXXXX' },
  ],
  jira: [
    { key: 'email', label: 'Email', type: 'email', placeholder: 'you@company.com' },
    { key: 'api_token', label: 'API Token', type: 'password', placeholder: 'ATATT3...' },
    { key: 'domain', label: 'Jira Domain', type: 'text', placeholder: 'company.atlassian.net' },
  ],
  google_workspace: [
    { key: 'client_email', label: 'Service Account Email', type: 'email', placeholder: 'service@project.iam.gserviceaccount.com' },
    { key: 'private_key', label: 'Private Key', type: 'textarea', placeholder: '-----BEGIN PRIVATE KEY-----...' },
  ],
  github: [
    { key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_...' },
    { key: 'org', label: 'Organization', type: 'text', placeholder: 'your-org' },
  ],
  custom: [
    { key: 'api_url', label: 'API URL', type: 'text', placeholder: 'https://api.example.com' },
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
  ],
};

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30' : 'border-line'
  );

/**
 * IntegrationForm Component
 * Connect/edit form for integrations with credential fields.
 * Used on: IntegrationsPage (connect/configure modal).
 */
export const IntegrationForm: React.FC<IntegrationFormProps> = ({
  integrationType,
  initialData,
  onSubmit,
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IntegrationFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      credentials: {},
      sync_enabled: initialData?.sync_enabled ?? false,
      sync_frequency: initialData?.sync_frequency ?? 'manual',
      field_mapping: initialData?.field_mapping ?? {},
    },
  });

  const fields = CREDENTIAL_FIELDS[integrationType];

  const handleFormSubmit = (data: IntegrationFormData) => {
    onSubmit(data);
  };

  return (
    <form id="integration-form" onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5" noValidate>
      {/* Credential Fields */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">Credentials</h3>
        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label htmlFor={`cred-${field.key}`} className="text-sm font-medium text-ink">
                {field.label} <span className="text-red-500">*</span>
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  id={`cred-${field.key}`}
                  {...register('credentials' as any)}
                  placeholder={field.placeholder}
                  disabled={isSubmitting}
                  rows={4}
                  className={cn(inputClass(false), 'resize-y min-h-[80px] font-mono')}
                />
              ) : (
                <input
                  id={`cred-${field.key}`}
                  type={field.type}
                  {...register('credentials' as any)}
                  placeholder={field.placeholder}
                  disabled={isSubmitting}
                  className={inputClass(false)}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-secondary mt-2">
          🔒 Credentials are encrypted with AES-256 and never exposed in API responses.
        </p>
      </div>

      {/* Sync Settings */}
      <div className="space-y-3 pt-4 border-t border-line">
        <h3 className="text-sm font-semibold text-ink">Sync Settings</h3>

        {/* Sync Enabled */}
        <div className="flex items-center gap-2">
          <input
            id="sync-enabled"
            type="checkbox"
            {...register('sync_enabled')}
            disabled={isSubmitting}
            className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
          />
          <label htmlFor="sync-enabled" className="text-sm font-medium text-ink">
            Enable automatic sync
          </label>
        </div>

        {/* Sync Frequency */}
        <div className="space-y-1.5">
          <label htmlFor="sync-frequency" className="text-sm font-medium text-ink">
            Sync Frequency
          </label>
          <select
            id="sync-frequency"
            {...register('sync_frequency')}
            disabled={isSubmitting}
            className={inputClass(false)}
          >
            <option value="manual">Manual Only</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      {/* Hidden submit button for modal footer trigger */}
      <button type="submit" id="integration-form-submit" className="hidden" />
    </form>
  );
};
