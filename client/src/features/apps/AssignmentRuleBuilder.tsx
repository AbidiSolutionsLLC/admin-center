// client/src/features/apps/AssignmentRuleBuilder.tsx
import { useState } from 'react';
import { AlertTriangle, Check, Shield } from 'lucide-react';
import { useCheckAppDependencies } from './useApps';

interface AssignmentRuleBuilderProps {
  appId: string;
  appName: string;
  targetType: 'role' | 'department' | 'group' | 'user';
  targetId: string;
  targetName: string;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

/**
 * AssignmentRuleBuilder Component
 * Shows dependency warnings and confirms app assignment
 */
export const AssignmentRuleBuilder: React.FC<AssignmentRuleBuilderProps> = ({
  appId,
  appName,
  targetType,
  targetId,
  targetName,
  onConfirm,
  isSubmitting = false,
}) => {
  const [showWarning, setShowWarning] = useState(false);

  const { data: dependencyCheck, isLoading } = useCheckAppDependencies(
    appId,
    targetType,
    targetId
  );

  const hasUnmetDependencies = dependencyCheck && !dependencyCheck.dependencies_met;

  const handleForceAssign = () => {
    setShowWarning(false);
    onConfirm();
  };

  return (
    <div className="space-y-3">
      {/* Assignment Summary */}
      <div className="p-3 bg-surface-alt rounded-md border border-line">
        <div className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-primary-600" />
          <span className="text-ink font-medium">{appName}</span>
          <span className="text-ink-muted">→</span>
          <span className="text-ink-secondary">{targetName}</span>
          <span className="text-ink-muted text-xs">({targetType})</span>
        </div>
      </div>

      {/* Dependency Warning */}
      {isLoading ? (
        <div className="h-12 bg-surface-alt animate-pulse rounded" />
      ) : hasUnmetDependencies ? (
        <div className="p-3 bg-warning/10 border border-warning/30 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">
                Dependency Warning
              </p>
              <p className="text-xs text-ink-secondary mt-1">
                This app requires:{' '}
                <span className="font-medium">
                  {dependencyCheck?.missing?.join(', ')}
                </span>
              </p>
              <p className="text-xs text-ink-muted mt-1">
                These dependencies are not yet assigned to {targetName}.
              </p>
            </div>
          </div>
        </div>
      ) : dependencyCheck?.dependencies_met ? (
        <div className="p-3 bg-success/10 border border-success/30 rounded-md">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            <p className="text-xs text-ink-secondary">
              All dependencies are satisfied
            </p>
          </div>
        </div>
      ) : null}

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end pt-2">
        {hasUnmetDependencies ? (
          <>
            <button
              onClick={() => setShowWarning(false)}
              className="h-9 px-4 text-sm font-medium text-ink-secondary border border-line rounded-md hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleForceAssign}
              className="h-9 px-4 text-sm font-medium text-white bg-warning rounded-md hover:bg-warning/90 transition-colors"
            >
              Assign Anyway
            </button>
          </>
        ) : (
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="h-9 px-4 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Assigning...' : 'Confirm Assignment'}
          </button>
        )}
      </div>

      {/* Force Assignment Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg border border-line shadow-modal max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-warning flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  Force Assignment?
                </h3>
                <p className="text-sm text-ink-secondary mt-1">
                  You're about to assign <strong>{appName}</strong> without meeting its dependencies. This may cause issues.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowWarning(false)}
                className="h-9 px-4 text-sm font-medium text-ink-secondary border border-line rounded-md hover:bg-surface-alt transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleForceAssign}
                className="h-9 px-4 text-sm font-medium text-white bg-warning rounded-md hover:bg-warning/90 transition-colors"
              >
                Force Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
