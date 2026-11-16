import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/utils/cn';

export interface TimelineItem {
  id: string;
  actor: string;
  verb: string;
  target?: string;
  at: string | Date;
  detail?: React.ReactNode;
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

/** Timeline: actor, verb, target, time; used for activity and audit (DRD 9.2). */
export const Timeline: React.FC<TimelineProps> = ({ items, className }) => (
  <ol className={cn('relative border-l border-line ml-1', className)}>
    {items.map((i) => {
      const when = new Date(i.at);
      const valid = !Number.isNaN(when.getTime());
      return (
        <li key={i.id} className="relative pl-5 pb-4 last:pb-0">
          <span className="absolute -left-[5px] top-1.5 h-dot w-dot rounded-full bg-primary" aria-hidden />
          <p className="text-body text-ink">
            <span className="font-medium">{i.actor}</span> <span className="text-ink-secondary">{i.verb}</span>
            {i.target && (
              <>
                {' '}
                <span className="font-medium">{i.target}</span>
              </>
            )}
          </p>
          {valid && (
            <time dateTime={when.toISOString()} title={format(when, 'PPpp')} className="text-table text-ink-muted">
              {formatDistanceToNow(when, { addSuffix: true })}
            </time>
          )}
          {i.detail && <div className="mt-1 text-table text-ink-secondary">{i.detail}</div>}
        </li>
      );
    })}
  </ol>
);
