import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

type TagTone = 'neutral' | 'primary' | 'info';

const toneClass: Record<TagTone, string> = {
  neutral: 'bg-surface-alt text-ink-secondary border-line',
  primary: 'bg-primary/10 text-primary border-primary/20',
  info: 'bg-info/10 text-info border-info/20',
};

interface TagProps {
  children: React.ReactNode;
  tone?: TagTone;
  onRemove?: () => void;
  className?: string;
}

/** Tag: small label chip, optionally removable (DRD 9.2). */
export const Tag: React.FC<TagProps> = ({ children, tone = 'neutral', onRemove, className }) => (
  <span
    className={cn('inline-flex items-center gap-1 h-6 rounded-control border px-2 text-table', toneClass[tone], className)}
  >
    {children}
    {onRemove && (
      <button type="button" onClick={onRemove} aria-label="Remove" className="hover:text-ink">
        <X className="w-3 h-3" />
      </button>
    )}
  </span>
);
