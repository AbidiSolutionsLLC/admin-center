import React from 'react';
import { useUsers } from '@/features/people/hooks/useUsers';
import { cn } from '@/utils/cn';

export interface UserSelectProps {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  placeholder?: string;
  onlyActive?: boolean;
}

/**
 * Shared UserSelect Component
 * Used across forms to select a user (manager, team lead, etc.)
 * Plugs seamlessly into react-hook-form's <Controller>
 */
export const UserSelect: React.FC<UserSelectProps> = ({
  value,
  onChange,
  disabled = false,
  hasError = false,
  className,
  placeholder = 'None',
  onlyActive = false,
}) => {
  const { data: users, isLoading } = useUsers();

  const inputClass = cn(
    'w-full h-10 px-3 text-sm rounded-md border bg-white/5 text-slate-200 border-white/10',
    'placeholder:text-slate-500 transition-all duration-150',
    'focus:outline-none focus:ring-1 focus:border-primary/50 focus:ring-primary/50',
    'disabled:bg-black/20 disabled:text-slate-500 disabled:cursor-not-allowed',
    hasError
      ? 'border-error focus:border-error focus:ring-error/50'
      : 'hover:border-white/20',
    className
  );

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading}
      className={inputClass}
    >
      <option value="">{isLoading ? 'Loading...' : placeholder}</option>
      {users?.filter(u => !onlyActive || u.lifecycle_state === 'active').map((user) => (
        <option key={user._id} value={user._id}>
          {user.full_name}
        </option>
      ))}
    </select>
  );
};
