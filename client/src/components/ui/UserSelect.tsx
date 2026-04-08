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
}) => {
  const { data: users, isLoading } = useUsers();

  const inputClass = cn(
    'w-full h-9 px-3 text-sm rounded-md border bg-white text-ink',
    'placeholder:text-ink-muted transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
    hasError
      ? 'border-red-400 focus:border-red-400 focus:ring-red-300/30'
      : 'border-line',
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
      {users?.map((user) => (
        <option key={user._id} value={user._id}>
          {user.full_name}
        </option>
      ))}
    </select>
  );
};
