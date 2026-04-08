// src/features/audit/components/AuditFilters.tsx
import { Search, X } from 'lucide-react';

interface AuditFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  module: string;
  onModuleChange: (value: string) => void;
  action: string;
  onActionChange: (value: string) => void;
  actorEmail: string;
  onActorEmailChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onClearAll: () => void;
}

const MODULES = [
  'organization',
  'people',
  'roles',
  'apps',
  'policies',
  'workflows',
  'locations',
  'security',
  'data_fields',
  'notifications',
  'integrations',
  'audit_logs',
  'auth',
];

const ACTIONS = [
  'created',
  'updated',
  'deleted',
  'archived',
  'invited',
  'lifecycle_changed',
  'permission_added',
  'permission_removed',
  'assigned',
  'revoked',
  'published',
  'exported',
  'force_logout',
];

/**
 * Audit Filters Component
 * Provides search, module, action, actor, and date range filters.
 * Used on: AuditLogsPage
 */
export function AuditFilters({
  search,
  onSearchChange,
  module,
  onModuleChange,
  action,
  onActionChange,
  actorEmail,
  onActorEmailChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onClearAll,
}: AuditFiltersProps) {
  const activeFilterCount = [search, module, action, actorEmail, dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* First row: Search + Module + Action */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 pl-8 pr-4 text-sm rounded-md border border-line bg-white text-ink
                       placeholder:text-ink-muted
                       focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                       transition-all duration-150"
          />
        </div>

        <select
          value={module}
          onChange={(e) => onModuleChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                     transition-all duration-150 min-w-[140px]"
        >
          <option value="">All Modules</option>
          {MODULES.map((m) => (
            <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
          ))}
        </select>

        <select
          value={action}
          onChange={(e) => onActionChange(e.target.value)}
          className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                     transition-all duration-150 min-w-[140px]"
        >
          <option value="">All Actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Second row: Actor Email + Date Range */}
      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-xs">
          <input
            type="email"
            placeholder="Filter by actor email..."
            value={actorEmail}
            onChange={(e) => onActorEmailChange(e.target.value)}
            className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                       placeholder:text-ink-muted
                       focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                       transition-all duration-150"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-secondary">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                       focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                       transition-all duration-150"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-secondary">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-9 px-3 text-sm rounded-md border border-line bg-white text-ink
                       focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                       transition-all duration-150"
          />
        </div>
      </div>
    </div>
  );
}
