import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { useCreateIpRestriction, useUpdateIpRestriction } from '../hooks/useIpRestrictions';
import type { IpRestriction } from '../hooks/useIpRestrictions';
import { useApps } from '@/features/apps/useApps';
import { useUsers } from '@/features/people/hooks/useUsers';
import { useGroups } from '@/features/groups/useGroups';
import { useRoles } from '@/features/roles/useRoles';
import { useDepartments } from '@/features/organization/hooks/useDepartments';
import { ShieldAlert } from 'lucide-react';

import ipaddr from 'ipaddr.js';

const formSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  ip_address: z.string().min(1, 'IP Address or CIDR is required')
    .refine((val) => {
      try {
        if (val.includes('/')) {
          ipaddr.parseCIDR(val);
          return true;
        }
        ipaddr.parse(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid IP address or CIDR notation'),
  target_type: z.enum(['portal', 'all_apps', 'app']),
  target_id: z.string().optional(),
  subject_type: z.enum(['all_users', 'user', 'group', 'role', 'department']),
  subject_id: z.string().optional(),
  subject_label: z.string().optional(),
  is_enabled: z.boolean(),
}).refine(data => {
  if (data.target_type === 'app' && !data.target_id) {
    return false;
  }
  return true;
}, {
  message: 'Specific app is required when target type is "Specific App"',
  path: ['target_id'],
}).refine(data => {
  if (data.subject_type !== 'all_users' && !data.subject_id) {
    return false;
  }
  return true;
}, {
  message: 'Specific subject is required',
  path: ['subject_id'],
});

type FormData = z.infer<typeof formSchema>;

interface IpRestrictionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  restriction?: IpRestriction | null;
}

export function IpRestrictionDialog({ isOpen, onClose, restriction }: IpRestrictionDialogProps) {
  const createMutation = useCreateIpRestriction();
  const updateMutation = useUpdateIpRestriction();
  const { data: appsData } = useApps();
  const { data: usersData } = useUsers();
  const { data: groupsData } = useGroups();
  const { data: rolesData } = useRoles();
  const { data: departmentsData } = useDepartments();

  const isEditing = !!restriction;

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: '',
      ip_address: '',
      target_type: 'portal',
      target_id: '',
      subject_type: 'all_users',
      subject_id: '',
      subject_label: '',
      is_enabled: true,
    },
  });

  const watchTargetType = useWatch({
    control,
    name: 'target_type',
  });

  const watchSubjectType = useWatch({
    control,
    name: 'subject_type',
  });

  useEffect(() => {
    if (isOpen && restriction) {
      reset({
        label: restriction.label,
        ip_address: restriction.ip_address,
        target_type: restriction.target_type,
        target_id: restriction.target_id || '',
        subject_type: restriction.subject_type || 'all_users',
        subject_id: restriction.subject_id || '',
        subject_label: restriction.subject_label || '',
        is_enabled: restriction.is_enabled,
      });
    } else if (isOpen) {
      reset({
        label: '',
        ip_address: '',
        target_type: 'portal',
        target_id: '',
        subject_type: 'all_users',
        subject_id: '',
        subject_label: '',
        is_enabled: true,
      });
    }
  }, [isOpen, restriction, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        ...data,
        target_id: data.target_type === 'app' ? data.target_id : undefined,
        subject_id: data.subject_type !== 'all_users' ? data.subject_id : undefined,
        subject_label: data.subject_type !== 'all_users' ? data.subject_label : undefined,
      };

      if (isEditing) {
        await updateMutation.mutateAsync({ id: restriction._id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch {
      // Error is handled by mutation
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit IP Restriction' : 'Add IP Restriction'}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        
        {/* Info Alert */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 text-amber-800">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <p className="text-xs leading-relaxed">
            Users will only be able to access the specified target if their source IP matches an active IP restriction.
          </p>
        </div>

        {/* Label */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">
            Label
          </label>
          <input
            type="text"
            {...register('label')}
            placeholder="e.g., Main Office"
            className={`w-full h-10 px-3 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
              errors.label ? 'border-error focus:border-error focus:ring-error/20' : 'border-line focus:border-primary'
            }`}
          />
          {errors.label && (
            <p className="text-xs text-error mt-1">{errors.label.message}</p>
          )}
        </div>

        {/* IP Address */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">
            IP Address or CIDR
          </label>
          <input
            type="text"
            {...register('ip_address')}
            placeholder="e.g., 192.168.1.0/24 or 203.0.113.5"
            className={`w-full h-10 px-3 text-sm font-mono rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
              errors.ip_address ? 'border-error focus:border-error focus:ring-error/20' : 'border-line focus:border-primary'
            }`}
          />
          {errors.ip_address && (
            <p className="text-xs text-error mt-1">{errors.ip_address.message}</p>
          )}
        </div>

        {/* Target Type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink">
            Target
          </label>
          <select
            {...register('target_type')}
            className={`w-full h-10 px-3 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
              errors.target_type ? 'border-error focus:border-error focus:ring-error/20' : 'border-line focus:border-primary'
            }`}
          >
            <option value="portal">Admin Portal</option>
            <option value="all_apps">All Applications</option>
            <option value="app">Specific Application</option>
          </select>
          {errors.target_type && (
            <p className="text-xs text-error mt-1">{errors.target_type.message}</p>
          )}
        </div>

        {/* App Selection (Conditional) */}
        {watchTargetType === 'app' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">
              Select Application
            </label>
            <select
              {...register('target_id')}
              className={`w-full h-10 px-3 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
                errors.target_id ? 'border-error focus:border-error focus:ring-error/20' : 'border-line focus:border-primary'
              }`}
            >
              <option value="">Select an app...</option>
              {appsData?.map((app) => (
                <option key={app._id} value={app._id}>
                  {app.name}
                </option>
              ))}
            </select>
            {errors.target_id && (
              <p className="text-xs text-error mt-1">{errors.target_id.message}</p>
            )}
          </div>
        )}

        {/* Applies To (Subject) */}
        <div className="space-y-1.5 border-t border-line pt-4 mt-4">
          <label className="text-sm font-medium text-ink">
            Applies To
          </label>
          <select
            {...register('subject_type')}
            className="w-full h-10 px-3 text-sm rounded-md border bg-white border-line focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            onChange={(e) => {
              register('subject_type').onChange(e);
              setValue('subject_id', '');
              setValue('subject_label', '');
            }}
          >
            <option value="all_users">All Users</option>
            <option value="user">Specific User</option>
            <option value="group">Specific Group</option>
            <option value="role">Specific Role</option>
            <option value="department">Specific Department</option>
          </select>
          {watchSubjectType !== 'all_users' && (
            <p className="text-xs text-amber-600 mt-1">
              Note: Because IP Restrictions act as an allowlist, users not covered by this rule (or another rule) will be denied access to this target.
            </p>
          )}
        </div>

        {/* Subject Selection (Conditional) */}
        {watchSubjectType !== 'all_users' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">
              Select {watchSubjectType.charAt(0).toUpperCase() + watchSubjectType.slice(1)}
            </label>
            <select
              {...register('subject_id')}
              onChange={(e) => {
                register('subject_id').onChange(e);
                const selectedText = e.target.options[e.target.selectedIndex].text;
                setValue('subject_label', selectedText);
              }}
              className={`w-full h-10 px-3 text-sm rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
                errors.subject_id ? 'border-error focus:border-error focus:ring-error/20' : 'border-line focus:border-primary'
              }`}
            >
              <option value="">Select...</option>
              {watchSubjectType === 'user' && usersData?.map((user: any) => (
                <option key={user._id} value={user._id}>{user.full_name}</option>
              ))}
              {watchSubjectType === 'group' && groupsData?.map((group: any) => (
                <option key={group._id} value={group._id}>{group.name}</option>
              ))}
              {watchSubjectType === 'role' && rolesData?.map((role: any) => (
                <option key={role._id} value={role._id}>{role.name}</option>
              ))}
              {watchSubjectType === 'department' && departmentsData?.map((dept: any) => (
                <option key={dept._id} value={dept._id}>{dept.name}</option>
              ))}
            </select>
            {errors.subject_id && (
              <p className="text-xs text-error mt-1">{errors.subject_id.message}</p>
            )}
          </div>
        )}

        {/* Status Toggle */}
        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="is_enabled"
            {...register('is_enabled')}
            className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
          />
          <label htmlFor="is_enabled" className="text-sm font-medium text-ink">
            Rule is active
          </label>
        </div>

        <div className="pt-4 flex justify-end gap-2 border-t border-line mt-6">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium rounded-md bg-white border border-line text-ink hover:bg-surface-alt transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-9 px-4 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add IP Restriction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
