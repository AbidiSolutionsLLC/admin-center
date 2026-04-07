// client/src/components/ui/IntelligenceBanner.tsx
import { AlertTriangle } from 'lucide-react';
import { useInsights } from '@/features/organization/hooks/useInsights';

interface IntelligenceBannerProps {
  /** Module to filter insights by (e.g., 'organization', 'people', 'roles') */
  module: string;
}

/**
 * Displays a banner when critical insights exist for a specific module.
 * Appears above the main content card on module pages.
 * Only renders if critical insights exist.
 * 
 * Used on: OrganizationPage, PeoplePage, RolesPage, etc.
 */
export const IntelligenceBanner = ({ module }: IntelligenceBannerProps) => {
  const { data: insights, isLoading } = useInsights({ module, severity: 'critical' });

  // Don't show while loading or if no critical insights
  if (isLoading || !insights || insights.length === 0) {
    return null;
  }

  const criticalCount = insights.length;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
      <p className="text-sm text-amber-800 font-medium">
        {criticalCount} critical issue{criticalCount > 1 ? 's' : ''} detected in this module.
      </p>
      <a 
        href="#insights" 
        className="ml-auto text-xs font-semibold text-accent hover:underline flex-shrink-0"
      >
        View details →
      </a>
    </div>
  );
};
