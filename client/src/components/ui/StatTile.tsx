import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** Sub-label or delta text, for example "+3 this week". */
  sub?: React.ReactNode;
  /** Tone of the sub-label. */
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  /** The whole tile is a link when set. */
  href?: string;
  className?: string;
}

const toneClass = {
  neutral: 'text-ink-secondary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
} as const;

/** StatTile: label, number, optional delta or sub-label; the whole tile is a link (DRD 9.2). */
export const StatTile: React.FC<StatTileProps> = ({ label, value, sub, tone = 'neutral', href, className }) => {
  const body = (
    <>
      <span className="text-label uppercase text-ink-muted">{label}</span>
      <span className="tabular text-tile text-ink">{value}</span>
      {sub && <span className={cn('text-table', toneClass[tone])}>{sub}</span>}
    </>
  );
  const base = cn(
    'flex flex-col gap-1 rounded-card border border-line bg-surface p-4',
    href &&
      'transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    className,
  );
  return href ? (
    <Link to={href} className={base}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
};
