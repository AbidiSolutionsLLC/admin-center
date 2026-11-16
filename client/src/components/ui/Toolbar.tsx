import React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useUrlParam } from '@/hooks/useUrlParam';

interface ToolbarProps {
  /** Search box. When `urlKey` is set the value is kept in the URL. */
  search?: {
    placeholder?: string;
    urlKey?: string;
    value?: string;
    onChange?: (value: string) => void;
  };
  /** Filter chips / selects. */
  filters?: React.ReactNode;
  /** Sort control. */
  sort?: React.ReactNode;
  /** Right-side view actions (export, column picker...). */
  actions?: React.ReactNode;
  className?: string;
}

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  value,
  onChange,
  placeholder = 'Search',
}) => (
  <div className="relative w-64 max-w-full">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" aria-hidden />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-8 text-body text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    />
    {value && (
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange('')}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

const UrlSearch: React.FC<{ urlKey: string; placeholder?: string }> = ({ urlKey, placeholder }) => {
  const [value, setValue] = useUrlParam(urlKey);
  return <SearchBox value={value} onChange={setValue} placeholder={placeholder} />;
};

/**
 * Toolbar: search, filter chips, sort, right-side view actions (DRD 9.2).
 * Filter state belongs in the URL: use `useUrlParam` for filter values.
 */
export const Toolbar: React.FC<ToolbarProps> = ({ search, filters, sort, actions, className }) => (
  <div className={cn('flex flex-wrap items-center gap-2 pb-3', className)} role="toolbar">
    {search &&
      (search.urlKey ? (
        <UrlSearch urlKey={search.urlKey} placeholder={search.placeholder} />
      ) : (
        <SearchBox
          value={search.value ?? ''}
          onChange={search.onChange ?? (() => {})}
          placeholder={search.placeholder}
        />
      ))}
    {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
    {sort}
    {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
  </div>
);

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
}

/** A toggle chip for use inside `Toolbar.filters`. */
export const FilterChip: React.FC<FilterChipProps> = ({ label, active, onClick }) => (
  <button
    type="button"
    aria-pressed={!!active}
    onClick={onClick}
    className={cn(
      'h-8 px-3 rounded-full border text-table transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      active
        ? 'border-primary/30 bg-primary/10 text-primary'
        : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover hover:text-ink',
    )}
  >
    {label}
  </button>
);
