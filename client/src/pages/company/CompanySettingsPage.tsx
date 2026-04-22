import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useEmployeeIdFormat, useUpdateEmployeeIdFormat } from '@/hooks/useEmployeeIdFormat';
import { useRequiredUserFields, useUpdateRequiredUserFields } from '@/hooks/useRequiredUserFields';
import { useDomainEnforcement, useUpdateDomainEnforcement } from '@/hooks/useDomainEnforcement';
import { ROUTES } from '@/constants/routes';
import { AVAILABLE_USER_FIELDS } from '@/types';
import { cn } from '@/utils/cn';
import { toast } from 'sonner';

type FormValues = {
  employee_id_format: string;
};

const CompanySettingsSchema = z.object({
  employee_id_format: z
    .string()
    .min(1, 'Format is required')
    .max(50, 'Format must be 50 characters or fewer')
    .regex(/\{counter:\d+\}/, 'Format must contain a {counter:N} placeholder'),
});

function generateFormatPreview(format: string, counter: number) {
  const match = format.match(/\{counter:(\d+)\}/);
  if (!match) return 'Invalid format preview';

  const width = parseInt(match[1], 10);
  const nextCounter = counter + 1;
  return format.replace(/\{counter:\d+\}/, nextCounter.toString().padStart(width, '0'));
}

function RequiredUserFieldsSection() {
  const { data: requiredFields, isLoading: isLoadingRequired } = useRequiredUserFields();
  const updateRequiredFields = useUpdateRequiredUserFields();
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  useEffect(() => {
    if (requiredFields) {
      setSelectedFields(requiredFields);
    }
  }, [requiredFields]);

  const handleToggle = (fieldKey: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldKey)
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const handleSave = () => {
    if (selectedFields.length === 0) {
      toast.error('At least one field must be required');
      return;
    }
    updateRequiredFields.mutate({ required_user_fields: selectedFields });
  };

  if (isLoadingRequired) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Required User Fields</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Required User Fields</CardTitle>
        <CardDescription>
          Configure which fields are required when inviting new users. Check the fields that must be filled out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {AVAILABLE_USER_FIELDS.map((field) => (
              <div
                key={field.key}
                className="flex items-start gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-surface-alt"
              >
                <Checkbox
                  id={field.key}
                  checked={selectedFields.includes(field.key)}
                  onCheckedChange={() => handleToggle(field.key)}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-1">
                  <label
                    htmlFor={field.key}
                    className="text-sm font-medium text-ink cursor-pointer"
                  >
                    {field.label}
                  </label>
                  <p className="text-xs text-ink-secondary">{field.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-line">
            <p className="text-sm text-ink-secondary">
              {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} marked as required
            </p>
            <Button
              onClick={handleSave}
              disabled={updateRequiredFields.isPending || JSON.stringify(selectedFields) === JSON.stringify(requiredFields)}
            >
              {updateRequiredFields.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DomainEnforcementSection() {
  const { data: domainSettings, isLoading: isLoadingDomain } = useDomainEnforcement();
  const updateDomainEnforcement = useUpdateDomainEnforcement();
  const [isEnabled, setIsEnabled] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [confirmRemoveDialog, setConfirmRemoveDialog] = useState<{
    isOpen: boolean;
    domain: string;
  }>({ isOpen: false, domain: '' });

  useEffect(() => {
    if (domainSettings) {
      setIsEnabled(domainSettings.is_domain_enforcement_active);
      setDomains(domainSettings.allowed_domains);
    }
  }, [domainSettings]);

  const handleToggle = () => {
    const newValue = !isEnabled;
    setIsEnabled(newValue);
    updateDomainEnforcement.mutate({
      allowed_domains: domains,
      is_domain_enforcement_active: newValue,
    });
  };

  const handleAddDomain = () => {
    if (!newDomain.trim()) return;

    let domain = newDomain.trim().toLowerCase();
    if (!domain.startsWith('@')) {
      domain = '@' + domain;
    }

    if (domains.includes(domain)) {
      toast.error('Domain already exists');
      return;
    }

    setDomains([...domains, domain]);
    setNewDomain('');
  };

  const handleRemoveDomain = (domain: string) => {
    setConfirmRemoveDialog({ isOpen: true, domain });
  };

  const handleConfirmRemoveDomain = () => {
    setDomains(domains.filter(d => d !== confirmRemoveDialog.domain));
    setConfirmRemoveDialog({ isOpen: false, domain: '' });
  };

  const handleSaveDomains = () => {
    updateDomainEnforcement.mutate({
      allowed_domains: domains,
      is_domain_enforcement_active: isEnabled,
    });
  };

  if (isLoadingDomain) {
    return (
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Email Domain Enforcement</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Email Domain Enforcement</CardTitle>
        <CardDescription>
          Restrict user invitations to specific email domains. When enabled, only emails from allowed domains can be invited.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">Enable Domain Enforcement</p>
              <p className="text-xs text-ink-secondary">
                When enabled, only emails from allowed domains can be invited
              </p>
            </div>
            <button
              onClick={handleToggle}
              disabled={updateDomainEnforcement.isPending}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                isEnabled ? 'bg-primary' : 'bg-gray-300'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          {/* Domain List */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">Allowed Domains</p>

            <div className="flex gap-2">
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. @company.com"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDomain();
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleAddDomain}
                variant="outline"
                disabled={!newDomain.trim()}
              >
                Add
              </Button>
            </div>

            {domains.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {domains.map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary-light text-primary text-sm rounded-md"
                  >
                    {domain}
                    <button
                      onClick={() => handleRemoveDomain(domain)}
                      className="hover:text-primary-hover"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-secondary">No domains added yet</p>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2 border-t border-line">
            <Button
              onClick={handleSaveDomains}
              disabled={updateDomainEnforcement.isPending || JSON.stringify(domains) === JSON.stringify(domainSettings?.allowed_domains)}
            >
              {updateDomainEnforcement.isPending ? 'Saving...' : 'Save Domains'}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Confirmation Dialog for Domain Removal */}
      <ConfirmDialog
        isOpen={confirmRemoveDialog.isOpen}
        onClose={() => setConfirmRemoveDialog({ isOpen: false, domain: '' })}
        onConfirm={handleConfirmRemoveDomain}
        title="Remove Domain"
        description={`Are you sure you want to remove ${confirmRemoveDialog.domain} from the allowed domains list? Users with emails from this domain will no longer be able to be invited.`}
        confirmLabel="Remove Domain"
        variant="danger"
      />
    </Card>
  );
}

export default function CompanySettingsPage() {
  const { data, isLoading, isError } = useEmployeeIdFormat();
  const updateEmployeeIdFormat = useUpdateEmployeeIdFormat();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(CompanySettingsSchema),
    defaultValues: {
      employee_id_format: '',
    },
  });

  useEffect(() => {
    if (data?.employee_id_format) {
      reset({ employee_id_format: data.employee_id_format });
    }
  }, [data, reset]);

  const currentFormat = watch('employee_id_format');
  const preview = useMemo(() => {
    if (!currentFormat || typeof data?.employee_id_counter !== 'number') {
      return '';
    }
    return generateFormatPreview(currentFormat, data.employee_id_counter);
  }, [currentFormat, data?.employee_id_counter]);

  const onSubmit = (values: FormValues) => {
    updateEmployeeIdFormat.mutate({ employee_id_format: values.employee_id_format });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-ink-muted">Loading company settings...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-semibold text-ink">Company Settings</h1>
        <p className="mt-3 text-sm text-error">Unable to load employee ID settings. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Company Settings</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Configure company-level settings including employee ID format and required fields for user invitations.
          </p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Employee ID Format</CardTitle>
          <CardDescription>
            Define how employee IDs are generated. The format must contain a <code className="rounded bg-slate-100 px-1 py-[2px] text-xs">{`{counter:N}`}</code> placeholder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="employee_id_format" className="block text-sm font-medium text-ink">
                Employee ID Format
              </label>
              <Input
                id="employee_id_format"
                {...register('employee_id_format')}
                className={errors.employee_id_format ? 'border-destructive focus-visible:ring-destructive/50' : ''}
                placeholder="EMP-{counter:5}"
              />
              {errors.employee_id_format ? (
                <p className="text-xs text-destructive">{errors.employee_id_format.message}</p>
              ) : (
                <p className="text-xs text-ink-secondary">
                  Example: <span className="font-mono">EMP-{`{counter:5}`}</span>
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface-base p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-secondary">Current format</p>
                <p className="mt-2 text-sm text-ink">{data?.employee_id_format || 'Not configured'}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface-base p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-secondary">Next employee ID preview</p>
                <p className="mt-2 text-sm text-ink">{preview || 'Enter a valid format to preview'}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-ink-secondary">
                Current counter: <span className="font-semibold">{data?.employee_id_counter ?? 0}</span>
              </div>
              <Button type="submit" disabled={updateEmployeeIdFormat.isPending}>
                {updateEmployeeIdFormat.isPending ? 'Saving...' : 'Save Format'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <RequiredUserFieldsSection />

      {/* <DomainEnforcementSection /> */}
    </div>
  );
}
