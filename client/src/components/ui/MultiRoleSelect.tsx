import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Search, ChevronDown, Shield as RoleIcon } from 'lucide-react';
import { useRoles } from '@/features/roles/useRoles';
import { cn } from '@/utils/cn';

export interface MultiRoleSelectProps {
  value?: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * MultiRoleSelect Component
 * A premium multi-select dropdown for roles with search and tag-based selection.
 */
export const MultiRoleSelect: React.FC<MultiRoleSelectProps> = ({
  value = [],
  onChange,
  disabled = false,
  hasError = false,
  className,
  placeholder = 'Select roles...',
}) => {
  const { data: roles, isLoading } = useRoles();
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

  const selectedRoles = roles?.filter((r) => value.includes(r._id)) || [];
  const filteredRoles = roles?.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  }) || [];

  const toggleRole = (roleId: string) => {
    const newValue = value.includes(roleId)
      ? value.filter((id) => id !== roleId)
      : [...value, roleId];
    onChange(newValue);
  };

  const removeRole = (e: React.MouseEvent, roleId: string) => {
    e.stopPropagation();
    onChange(value.filter((id) => id !== roleId));
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'min-h-[40px] w-full px-3 py-1.5 text-sm rounded-md border bg-white/5 border-white/10 text-slate-200 cursor-pointer transition-all duration-150 flex flex-wrap gap-1.5 items-center',
          isOpen ? 'ring-1 border-primary/50 ring-primary/50' : 'hover:border-white/20',
          hasError && 'border-error ring-error/50',
          disabled && 'bg-black/20 text-slate-500 cursor-not-allowed opacity-60'
        )}
      >
        {selectedRoles.length > 0 ? (
          selectedRoles.map((role) => (
            <span
              key={role._id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium animate-in fade-in zoom-in duration-200"
            >
              {role.name}
              <button
                type="button"
                onClick={(e) => removeRole(e, role._id)}
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-slate-500">{isLoading ? 'Loading roles...' : placeholder}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5 pl-2">
          {isLoading && <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
          <ChevronDown className={cn('w-4 h-4 text-slate-500 transition-transform duration-200', isOpen && 'rotate-180')} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full max-h-60 overflow-hidden bg-[#161c30]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-modal animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-white/10 bg-black/20">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                className="w-full h-8 pl-8 pr-3 text-xs bg-white/5 border border-white/10 text-slate-200 rounded-md focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 placeholder:text-slate-500"
                placeholder="Search roles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-48 p-1">
            {filteredRoles.length > 0 ? (
              filteredRoles.map((role) => {
                const isSelected = value.includes(role._id);
                return (
                  <div
                    key={role._id}
                    onClick={() => toggleRole(role._id)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors mb-0.5',
                      isSelected ? 'bg-primary/10 text-primary' : 'text-slate-200 hover:bg-white/5'
                    )}
                  >
                    <div className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                      isSelected ? 'bg-primary text-white' : 'bg-white/5 text-slate-400'
                    )}>
                      <RoleIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{role.name}</p>
                      {role.description && <p className="text-[10px] text-slate-400 truncate">{role.description}</p>}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-primary" />}
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-500">No roles found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
