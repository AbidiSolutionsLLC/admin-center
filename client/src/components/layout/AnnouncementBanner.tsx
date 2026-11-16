import React from 'react';
import { Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTenantAnnouncement } from '@/features/announcement/useAnnouncement';

const tone = {
  info: 'border-line bg-surface text-ink',
  warning: 'border-warning/40 bg-warning/10 text-ink',
  critical: 'border-error/40 bg-error/10 text-ink',
} as const;

/** One-line platform announcement above the page content (Plan 4.12). Renders nothing when there is none. */
export const AnnouncementBanner: React.FC = () => {
  const { data } = useTenantAnnouncement();
  if (!data) return null;
  const Icon = data.severity === 'info' ? Info : AlertTriangle;
  return (
    <div role="status" className={cn('flex items-center gap-2 border-b px-4 py-2 text-body lg:px-gutter', tone[data.severity])}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{data.message}</span>
    </div>
  );
};
