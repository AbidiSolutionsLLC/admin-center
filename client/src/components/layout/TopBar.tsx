
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/utils/cn';

interface TopBarProps {
  className?: string;
}

export const TopBar = ({ className }: TopBarProps) => {
  const { userName, userRole } = useAuthStore();

  return (
    <header className={cn("flex items-center justify-between px-6 bg-white border-b border-line", className)}>
      <div className="flex items-center">
        {/* Breadcrumbs or page title could go here */}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-sm font-semibold text-ink">{userName || 'Loading...'}</span>
          <span className="text-xs text-ink-secondary capitalize">{userRole?.replace('_', ' ') || ''}</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-primary font-bold">
          {userName?.charAt(0) || 'U'}
        </div>
      </div>
    </header>
  );
};
