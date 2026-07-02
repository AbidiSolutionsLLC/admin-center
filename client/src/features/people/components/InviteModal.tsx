// src/features/people/components/InviteModal.tsx
import React, { useState, useCallback } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Upload, Download, CheckCircle, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useInviteUser } from '../hooks/useInviteUser';
import { useBulkInvite } from '../hooks/useBulkInvite';
import { UserSelect } from '@/components/ui/UserSelect';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { MultiRoleSelect } from '@/components/ui/MultiRoleSelect';
import type { InviteUserInput, Department, BulkInviteRow, EmploymentType, UserRole } from '@/types';
import { cn } from '@/utils/cn';
import { ROLES } from '@/constants/roles';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  teams: any[];
  locations: Location[];
  requiredFields?: string[];
}

const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
];

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: ROLES.SUPER_ADMIN, label: 'Super Admin' },
  { value: ROLES.ADMIN, label: 'Admin' },
  { value: ROLES.HR, label: 'HR' },
  { value: ROLES.MANAGER, label: 'Manager' },
  { value: ROLES.EMPLOYEE, label: 'Employee' },
  { value: ROLES.TECHNICIAN, label: 'Technician' },
];

const inputClass = (hasError?: boolean) =>
  cn(
    'w-full h-10 px-3 text-sm rounded-md border bg-white/5 text-slate-200 border-white/10',
    'placeholder:text-slate-500 transition-all duration-150',
    'focus:outline-none focus:ring-1 focus:border-primary/50 focus:ring-primary/50',
    'disabled:bg-black/20 disabled:text-slate-500 disabled:cursor-not-allowed',
    hasError ? 'border-error focus:border-error focus:ring-error/50' : 'hover:border-white/20'
  );

/**
 * InviteModal Component
 * Provides two tabs:
 * 1. Single invite — email + name + dept + role
 * 2. Bulk invite — CSV upload with preview table before sending
 * Used on: PeoplePage.
 */
export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, departments, locations, requiredFields = [] }) => {
  const [activeTab, setActiveTab] = useState('single');
  const [csvData, setCsvData] = useState<BulkInviteRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Single invite form
  const [singleForm, setSingleForm] = useState<Partial<InviteUserInput>>({
    full_name: '',
    email: '',
    phone: '',
    department_id: null,
    manager_id: null,
    secondary_manager_ids: [],
    role: ROLES.EMPLOYEE,
    role_ids: [],
    employment_type: 'full_time',
    hire_date: null,
    location_id: null,
  });
  const [singleError, setSingleError] = useState<Record<string, string>>({});

  const inviteUser = useInviteUser();
  const bulkInvite = useBulkInvite();

  const handleSingleInvite = useCallback(() => {
    const errors: Record<string, string> = {};
    
    // Basic validation
    if (!singleForm.full_name?.trim()) errors.full_name = 'Name is required';
    if (!singleForm.email?.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(singleForm.email)) errors.email = 'Invalid email';

    // Dynamic validation based on company settings
    if (requiredFields.includes('phone') && !singleForm.phone?.trim()) errors.phone = 'Phone number is required';
    if (requiredFields.includes('department_id') && !singleForm.department_id) errors.department_id = 'Department is required';
    if (requiredFields.includes('manager_id') && !singleForm.manager_id) errors.manager_id = 'Manager is required';
    if (requiredFields.includes('role_ids') && (!singleForm.role_ids || singleForm.role_ids.length === 0)) errors.role_ids = 'Role is required';
    if (requiredFields.includes('employment_type') && !singleForm.employment_type) errors.employment_type = 'Employment type is required';
    if (requiredFields.includes('hire_date') && !singleForm.hire_date) errors.hire_date = 'Hire date is required';
    if (requiredFields.includes('location_id') && !singleForm.location_id) errors.location_id = 'Location is required';

    if (Object.keys(errors).length > 0) {
      setSingleError(errors);
      return;
    }

    inviteUser.mutate(singleForm as InviteUserInput, {
      onSuccess: () => {
          setSingleForm({ 
            full_name: '', 
            email: '', 
            phone: '',
            department_id: null, 
            manager_id: null,
            secondary_manager_ids: [],
            role: ROLES.EMPLOYEE, 
            role_ids: [],
            employment_type: 'full_time',
            hire_date: null,
            location_id: null
          });
        setSingleError({});
        onClose();
      },
    });
  }, [singleForm, inviteUser, onClose, requiredFields]);

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
          role: (row.role as UserRole) || ROLES.EMPLOYEE,
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
    const headers = 'full_name,email,phone,role,department_id,team_id,manager_id,employment_type,hire_date,location_id';
    const example = 'John Doe,john@example.com,+1234567890,Employee,,dept123,full_time,2024-01-01,';
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
              Full Name {requiredFields.includes('full_name') && <span className="text-red-500">*</span>}
            </label>
            <input
              id="invite-name"
              value={singleForm.full_name || ''}
              onChange={(e) => setSingleForm({ ...singleForm, full_name: e.target.value })}
              placeholder="e.g. John Doe"
              style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!singleError.full_name ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!singleError.full_name ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!singleError.full_name ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!singleError.full_name ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            {singleError.full_name && (
              <p className="text-xs text-red-500">{singleError.full_name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium text-ink">
              Email {requiredFields.includes('email') && <span className="text-red-500">*</span>}
            </label>
            <input
              id="invite-email"
              type="email"
              value={singleForm.email || ''}
              onChange={(e) => setSingleForm({ ...singleForm, email: e.target.value })}
              placeholder="e.g. john@example.com"
              style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!singleError.email ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!singleError.email ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!singleError.email ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!singleError.email ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            {singleError.email && <p className="text-xs text-red-500">{singleError.email}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-phone" className="text-sm font-medium text-ink">
              Phone Number {requiredFields.includes('phone') && <span className="text-red-500">*</span>}
            </label>
            <input
              id="invite-phone"
              value={singleForm.phone || ''}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setSingleForm({ ...singleForm, phone: val });
              }}
              placeholder="e.g. 1234567890"
              style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!singleError.phone ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!singleError.phone ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!singleError.phone ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!singleError.phone ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            {singleError.phone && (
              <p className="text-xs text-red-500">{singleError.phone}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-dept" className="text-sm font-medium text-ink">
              Department {requiredFields.includes('department_id') && <span className="text-red-500">*</span>}
            </label>
            <select
              id="invite-dept"
              value={singleForm.department_id || ''}
              onChange={(e) => setSingleForm({ ...singleForm, department_id: e.target.value || null })}
              style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!singleError.department_id ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!singleError.department_id ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!singleError.department_id ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!singleError.department_id ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
            {singleError.department_id && (
              <p className="text-xs text-red-500">{singleError.department_id}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-manager" className="text-sm font-medium text-ink">
              Primary Manager {requiredFields.includes('manager_id') && <span className="text-red-500">*</span>}
            </label>
            <UserSelect
              value={singleForm.manager_id}
              onChange={(val) => setSingleForm({ ...singleForm, manager_id: val })}
              placeholder="Select manager..."
              hasError={!!singleError.manager_id}
              onlyActive={true}
            />
            {singleError.manager_id && (
              <p className="text-xs text-red-500">{singleError.manager_id}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-secondary-managers" className="text-sm font-medium text-ink">
              Secondary Managers
            </label>
            <MultiUserSelect
              value={singleForm.secondary_manager_ids}
              onChange={(val) => setSingleForm({ ...singleForm, secondary_manager_ids: val })}
              placeholder="Select secondary managers..."
              onlyActive={true}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="text-sm font-medium text-ink">
              Roles {requiredFields.includes('role_ids') && <span className="text-red-500">*</span>}
            </label>
            <MultiRoleSelect
              value={singleForm.role_ids || []}
              onChange={(val) => setSingleForm({ ...singleForm, role_ids: val })}
              hasError={!!singleError.role_ids}
            />
            {singleError.role_ids && (
              <p className="text-xs text-red-500">{singleError.role_ids}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-emp-type" className="text-sm font-medium text-ink">
              Employment Type {requiredFields.includes('employment_type') && <span className="text-red-500">*</span>}
            </label>
            <select
              id="invite-emp-type"
              value={singleForm.employment_type || 'full_time'}
              onChange={(e) =>
                setSingleForm({ ...singleForm, employment_type: e.target.value as EmploymentType })
              }
              style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!singleError.employment_type ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!singleError.employment_type ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!singleError.employment_type ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!singleError.employment_type ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {singleError.employment_type && (
              <p className="text-xs text-red-500">{singleError.employment_type}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-location" className="text-sm font-medium text-ink">
              Location {requiredFields.includes('location_id') && <span className="text-red-500">*</span>}
            </label>
            <select
              id="invite-location"
              value={singleForm.location_id || ''}
              onChange={(e) => setSingleForm({ ...singleForm, location_id: e.target.value || null })}
              style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!singleError.location_id ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!singleError.location_id ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!singleError.location_id ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!singleError.location_id ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <option value="">No location</option>
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id}>
                  {loc.name}
                </option>
              ))}
            </select>
            {singleError.location_id && (
              <p className="text-xs text-red-500">{singleError.location_id}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-hire-date" className="text-sm font-medium text-ink">
              Hire Date {requiredFields.includes('hire_date') && <span className="text-red-500">*</span>}
            </label>
            <input
              id="invite-hire-date"
              type="date"
              value={singleForm.hire_date || ''}
              onChange={(e) => setSingleForm({ ...singleForm, hire_date: e.target.value })}
              style={{
  width: '100%', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)',
  border: !!singleError.hire_date ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#f8fafc', outline: 'none', transition: 'all 0.25s ease'
}}
onFocus={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = !!singleError.hire_date ? 'rgba(239,68,68,0.5)' : 'rgba(245,176,42,0.35)'; e.currentTarget.style.boxShadow = !!singleError.hire_date ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(245,176,42,0.06)'; }}
onBlur={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = !!singleError.hire_date ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            {singleError.hire_date && (
              <p className="text-xs text-red-500">{singleError.hire_date}</p>
            )}
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
                  <thead className="bg-surface-base">
                    <tr>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">#</th>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">Name</th>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">Email</th>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">Role</th>
                      <th className="h-8 px-3 text-left font-semibold text-ink-secondary">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-t border-line">
                        <td className="h-7 px-3 text-ink-muted">{idx + 1}</td>
                        <td className="h-7 px-3 text-ink">{row.full_name}</td>
                        <td className="h-7 px-3 text-ink-muted">{row.email}</td>
                        <td className="h-7 px-3 text-ink-muted">{row.role || 'Employee'}</td>
                        <td className="h-7 px-3 text-ink-muted">
                          {departments.find((d) => d._id === row.department_id)?.name || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 10 && (
                  <div className="px-3 py-2 text-xs text-ink-muted bg-surface-base border-t border-line">
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

