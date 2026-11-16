import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CopyFieldProps {
  value: string;
  label?: string;
  mono?: boolean;
  className?: string;
}

/** CopyField: read-only value with a copy button (DRD 9.2). */
export const CopyField: React.FC<CopyFieldProps> = ({ value, label, mono = true, className }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <span className="text-label uppercase text-ink-muted">{label}</span>}
      <div className="flex items-center gap-2 h-9 rounded-control border border-line bg-surface pl-3 pr-1">
        <span className={cn('flex-1 truncate text-table text-ink', mono && 'font-mono')} title={value}>
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
          className="h-7 w-7 flex items-center justify-center rounded-control text-ink-secondary hover:bg-surface-hover hover:text-ink transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
