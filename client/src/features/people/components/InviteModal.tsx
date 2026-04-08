// src/features/people/components/InviteModal.tsx
import React, { useState, useCallback } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Upload, Download, CheckCircle, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useInviteUser } from '../hooks/useInviteUser';
import { useBulkInvite } from '../hooks/useBulkInvite';
import type { InviteUserInput, Department, BulkInviteRow, EmploymentType } from '@/types';
import { cn } from '@/utils/cn';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
}

const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
];

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30' : 'border-line'
  );

/**
 * InviteModal Component
 * Provides two tabs:
 * 1. Single invite — email + name + dept + role
 * 2. Bulk invite — CSV upload with preview table before sending
 * Used on: PeoplePage.
 */
export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, departments }) => {
  const [activeTab, setActiveTab] = useState('single');
  const [csvData, setCsvData] = useState<BulkInviteRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Single invite form
  const [singleForm, setSingleForm] = useState<Partial<InviteUserInput>>({
    full_name: '',
    email: '',
    department_id: null,
    employment_type: 'full_time',
  });
  const [singleError, setSingleError] = useState<Record<string, string>>({});

  const inviteUser = useInviteUser();
  const bulkInvite = useBulkInvite();

  const handleSingleInvite = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!singleForm.full_name?.trim()) errors.full_name = 'Name is required';
    if (!singleForm.email?.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(singleForm.email)) errors.email = 'Invalid email';

    if (Object.keys(errors).length > 0) {
      setSingleError(errors);
      return;
    }

    inviteUser.mutate(singleForm as InviteUserInput, {
      onSuccess: () => {
        setSingleForm({ full_name: '', email: '', department_id: null, employment_type: 'full_time' });
        setSingleError({});
        onClose();
      },
    });
  }, [singleForm, inviteUser, onClose]);

  const parseCSV = useCallback((text: string) => {
    try {
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        setCsvError('CSV must have a header row and at least one data row');
        setCsvData([]);
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const requiredHeaders = ['full_name', 'email'];
      const missingRequired = requiredHeaders.filter((h) => !headers.includes(h));

      if (missingRequired.length > 0) {
        setCsvError(`Missing required columns: ${missingRequired.join(', ')}`);
        setCsvData([]);
        return;
      }

      const rows: BulkInviteRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });

        rows.push({
          full_name: row.full_name,
          email: row.email,
          phone: row.phone || undefined,
          department_id: row.department_id || undefined,
          team_id: row.team_id || undefined,
          manager_id: row.manager_id || undefined,
          employment_type: (row.employment_type as EmploymentType) || 'full_time',
          hire_date: row.hire_date || undefined,
          location_id: row.location_id || undefined,
          custom_fields: {},
        });
      }

      setCsvData(rows);
      setCsvError(null);
    } catch (err) {
      setCsvError('Failed to parse CSV. Please check the format.');
      setCsvData([]);
    }
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCSV(text);
      };
      reader.readAsText(file);
    },
    [parseCSV]
  );

  const handleBulkInvite = useCallback(() => {
    if (csvData.length === 0) return;

    bulkInvite.mutate(
      { users: csvData },
      {
        onSuccess: () => {
          setCsvData([]);
          setCsvError(null);
          onClose();
        },
      }
    );
  }, [csvData, bulkInvite, onClose]);

  const downloadTemplate = useCallback(() => {
    const headers = 'full_name,email,phone,department_id,team_id,manager_id,employment_type,hire_date,location_id';
    const example = 'John Doe,john@example.com,+1234567890,,dept123,full_time,2024-01-01,';
    const csv = `${headers}\n${example}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invite_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const tabTriggerClass = (active: boolean) =>
    cn(
      'flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-150',
      'text-ink-secondary hover:text-ink',
      active && 'bg-white text-ink shadow-sm'
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite Users"
      description="Invite individuals or bulk upload a CSV"
      size="lg"
      footer={
        activeTab === 'single' ? (
          <>
            <button
              onClick={onClose}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSingleInvite}
              disabled={inviteUser.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviteUser.isPending ? 'Sending...' : 'Send Invite'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onClose}
              disabled={bulkInvite.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkInvite}
              disabled={bulkInvite.isPending || csvData.length === 0}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkInvite.isPending
                ? 'Processing...'
                : `Invite ${csvData.length} User${csvData.length !== 1 ? 's' : ''}`}
            </button>
          </>
        )
      }
    >
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex bg-surface-alt p-1 rounded-lg gap-1 mb-5">
          <Tabs.Trigger value="single" className={tabTriggerClass(activeTab === 'single')}>
            Single Invite
          </Tabs.Trigger>
          <Tabs.Trigger value="bulk" className={tabTriggerClass(activeTab === 'bulk')}>
            Bulk Invite (CSV)
          </Tabs.Trigger>
        </Tabs.List>

        {/* Single Invite Tab */}
        <Tabs.Content value="single" className="space-y-5 focus:outline-none">
          <div className="space-y-1.5">
            <label htmlFor="invite-name" className="text-sm font-medium text-ink">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="invite-name"
              value={singleForm.full_name || ''}
              onChange={(e) => setSingleForm({ ...singleForm, full_name: e.target.value })}
              placeholder="e.g. John Doe"
              className={inputClass(!!singleError.full_name)}
            />
            {singleError.full_name && (
              <p className="text-xs text-red-500">{singleError.full_name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium text-ink">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              value={singleForm.email || ''}
              onChange={(e) => setSingleForm({ ...singleForm, email: e.target.value })}
              placeholder="e.g. john@example.com"
              className={inputClass(!!singleError.email)}
            />
            {singleError.email && <p className="text-xs text-red-500">{singleError.email}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-dept" className="text-sm font-medium text-ink">
              Department
            </label>
            <select
              id="invite-dept"
              value={singleForm.department_id || ''}
              onChange={(e) => setSingleForm({ ...singleForm, department_id: e.target.value || null })}
              className={inputClass()}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-emp-type" className="text-sm font-medium text-ink">
              Employment Type
            </label>
            <select
              id="invite-emp-type"
              value={singleForm.employment_type || 'full_time'}
              onChange={(e) =>
                setSingleForm({ ...singleForm, employment_type: e.target.value as EmploymentType })
              }
              className={inputClass()}
            >
              {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </Tabs.Content>

        {/* Bulk Invite Tab */}
        <Tabs.Content value="bulk" className="space-y-4 focus:outline-none">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-secondary">
              Upload a CSV file with user details.{' '}
              <button
                onClick={downloadTemplate}
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Download template
              </button>
            </p>
          </div>

          <div className="border-2 border-dashed border-line rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Upload className="w-8 h-8 text-ink-muted" />
              <span className="text-sm font-medium text-ink">Click to upload CSV</span>
              <span className="text-xs text-ink-muted">.csv files only</span>
            </label>
          </div>

          {csvError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{csvError}</p>
            </div>
          )}

          {csvData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span>{csvData.length} rows parsed successfully</span>
              </div>

              <div className="border border-line rounded-md overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F7F8FA]">
                    <tr>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">#</th>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">Name</th>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">Email</th>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-t border-line">
                        <td className="h-7 px-3 text-ink-muted">{idx + 1}</td>
                        <td className="h-7 px-3 text-ink">{row.full_name}</td>
                        <td className="h-7 px-3 text-ink-muted">{row.email}</td>
                        <td className="h-7 px-3 text-ink-muted">
                          {departments.find((d) => d._id === row.department_id)?.name || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 10 && (
                  <div className="px-3 py-2 text-xs text-ink-muted bg-[#F7F8FA] border-t border-line">
                    ... and {csvData.length - 10} more rows
                  </div>
                )}
              </div>
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </Modal>
  );
};
