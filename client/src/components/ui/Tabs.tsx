import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '@/utils/cn';
import { useUrlParam } from '@/hooks/useUrlParam';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  /** Query-string key that holds the active tab. */
  urlKey?: string;
  className?: string;
}

/** Tabs: URL-synced, built on @radix-ui/react-tabs (DRD 9.2). */
export const Tabs: React.FC<TabsProps> = ({ items, urlKey = 'tab', className }) => {
  const first = items[0]?.value ?? '';
  const [raw, setValue] = useUrlParam(urlKey, first);
  const active = items.some((i) => i.value === raw) ? raw : first;
  return (
    <RadixTabs.Root value={active} onValueChange={setValue} className={className}>
      <RadixTabs.List className="flex gap-1 border-b border-line overflow-x-auto" aria-label="Sections">
        {items.map((i) => (
          <RadixTabs.Trigger
            key={i.value}
            value={i.value}
            className={cn(
              'h-10 px-4 text-body text-ink-secondary border-b-2 border-transparent -mb-px whitespace-nowrap',
              'transition-colors duration-fast hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              'data-[state=active]:text-primary data-[state=active]:border-primary',
            )}
          >
            {i.label}
            {i.count !== undefined && <span className="tabular ml-2 text-table text-ink-muted">{i.count}</span>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((i) => (
        <RadixTabs.Content key={i.value} value={i.value} className="pt-4 focus-visible:outline-none">
          {i.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
};
