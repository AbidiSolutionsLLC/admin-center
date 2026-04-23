import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Search, ChevronDown, User as UserIcon } from 'lucide-react';
import { useUsers } from '@/features/people/hooks/useUsers';
import { cn } from '@/utils/cn';

export interface MultiUserSelectProps {
  value?: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * MultiUserSelect Component
 * A premium multi-select dropdown for users with search and tag-based selection.
 */
export const MultiUserSelect: React.FC<MultiUserSelectProps> = ({
  value = [],
  onChange,
  disabled = false,
  hasError = false,
  className,
  placeholder = 'Select managers...',
}) => {
  const { data: users, isLoading } = useUsers();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedUsers = users?.filter((u) => value.includes(u._id)) || [];
  const filteredUsers = users?.filter((u) => 
    u.full_name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const toggleUser = (userId: string) => {
    const newValue = value.includes(userId)
      ? value.filter((id) => id !== userId)
      : [...value, userId];
    onChange(newValue);
  };

  const removeUser = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    onChange(value.filter((id) => id !== userId));
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'min-h-[38px] w-full px-3 py-1.5 text-sm rounded-md border bg-white cursor-pointer transition-all duration-150 flex flex-wrap gap-1.5 items-center',
          isOpen ? 'ring-2 border-primary ring-primary/30' : 'border-line hover:border-primary/50',
          hasError && 'border-red-400 ring-red-300/30',
          disabled && 'bg-surface-alt cursor-not-allowed opacity-60'
        )}
      >
        {selectedUsers.length > 0 ? (
          selectedUsers.map((user) => (
            <span
              key={user._id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium animate-in fade-in zoom-in duration-200"
            >
              {user.full_name}
              <button
                type="button"
                onClick={(e) => removeUser(e, user._id)}
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-ink-muted">{isLoading ? 'Loading users...' : placeholder}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 pl-2">
          {isLoading && <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
          <ChevronDown className={cn('w-4 h-4 text-ink-muted transition-transform duration-200', isOpen && 'rotate-180')} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full max-h-60 overflow-hidden bg-white border border-line rounded-lg shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-line bg-surface-alt/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
              <input
                autoFocus
                className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-line rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-48 p-1">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => {
                const isSelected = value.includes(user._id);
                return (
                  <div
                    key={user._id}
                    onClick={() => toggleUser(user._id)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors mb-0.5',
                      isSelected ? 'bg-primary/5 text-primary' : 'hover:bg-surface-alt'
                    )}
                  >
                    <div className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                      isSelected ? 'bg-primary text-white' : 'bg-surface-alt text-ink-muted'
                    )}>
                      {user.avatar_url ? (
                        <img src={user.avatar_url} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <UserIcon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{user.full_name}</p>
                      <p className="text-[10px] text-ink-muted truncate">{user.email}</p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary" />}
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-ink-muted">No users found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
