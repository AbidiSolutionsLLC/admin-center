import React from 'react';
import { cn } from '@/utils/cn';

export interface KeyFact {
  label: string;
  value: React.ReactNode;
}

interface KeyFactsProps {
  items: KeyFact[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const colClass = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const;

/** KeyFacts: 2 to 4 column definition grid for object pages (DRD 9.2). */
export const KeyFacts: React.FC<KeyFactsProps> = ({ items, columns = 4, className }) => (
  <dl
    className={cn(
      'grid grid-cols-1 gap-4 rounded-card border border-line bg-surface p-4',
      colClass[columns],
      className,
    )}
  >
    {items.map((f) => (
      <div key={f.label} className="min-w-0">
        <dt className="text-label uppercase text-ink-muted">{f.label}</dt>
        <dd className="mt-1 text-body text-ink break-words">{f.value ?? '-'}</dd>
      </div>
    ))}
  </dl>
);
