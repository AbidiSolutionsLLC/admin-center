import * as React from 'react';
import { cn } from '@/utils/cn';

/** Textarea: same field contract and look as `Input` (DRD 9.2). */
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-control border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-muted',
        'focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/50',
        'aria-[invalid=true]:border-error disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
