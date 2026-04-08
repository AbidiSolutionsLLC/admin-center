// client/src/features/apps/AppCatalog.tsx
import { Package, Users, Calendar, Clock } from 'lucide-react';
import type { App } from '@/types';

interface AppCatalogProps {
  apps: App[];
  isLoading?: boolean;
  onSelect: (app: App) => void;
  selectedApp?: App | null;
}

/**
 * AppCatalog Component
 * Displays a catalog of available apps with assignment counts
 */
export const AppCatalog: React.FC<AppCatalogProps> = ({
  apps,
  isLoading = false,
  onSelect,
  selectedApp,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 bg-surface-secondary animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (!apps || apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-16 w-16 text-ink-muted mb-3" />
        <p className="text-sm font-medium text-ink-primary">No apps yet</p>
        <p className="text-xs text-ink-muted mt-1">Add apps to start assigning them</p>
      </div>
    );
  }

  const getStatusColor = (status: App['status']) => {
    switch (status) {
      case 'active':
        return 'bg-success text-success';
      case 'inactive':
        return 'bg-ink-muted text-ink-secondary';
      case 'maintenance':
        return 'bg-warning text-warning';
      default:
        return 'bg-ink-muted text-ink-secondary';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'hr':
        return Users;
      case 'finance':
      case 'accounting':
        return Calendar;
      default:
        return Package;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {apps.map((app) => {
        const Icon = getCategoryIcon(app.category);
        const isSelected = selectedApp?._id === app._id;

        return (
          <button
            key={app._id}
            onClick={() => onSelect(app)}
            className={`p-4 rounded-lg border text-left transition-all hover:shadow-card ${
              isSelected
                ? 'border-primary-600 bg-primary-50 shadow-card'
                : 'border-line bg-surface hover:border-primary-600/50'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-primary-100 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary-700" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink-primary">{app.name}</h3>
                  <p className="text-xs text-ink-muted">{app.category}</p>
                </div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(
                  app.status
                )}`}
              >
                {app.status}
              </span>
            </div>

            {app.description && (
              <p className="text-xs text-ink-secondary mt-2 line-clamp-2">
                {app.description}
              </p>
            )}

            <div className="flex items-center gap-3 mt-3 text-xs text-ink-muted">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{app.assignment_count ?? 0} assignments</span>
              </div>
              {app.dependencies && app.dependencies.length > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{app.dependencies.length} deps</span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
