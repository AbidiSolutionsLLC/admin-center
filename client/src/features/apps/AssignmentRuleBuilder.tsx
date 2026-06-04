// client/src/features/apps/AssignmentRuleBuilder.tsx
import { useState } from 'react';
import { AlertTriangle, Check, Shield, Loader2 } from 'lucide-react';
import { useCheckAppDependencies } from './useApps';

interface AssignmentRuleBuilderProps {
  appId: string;
  appName: string;
  targetType: 'role' | 'department' | 'group' | 'user' | 'attribute';
  targetId: string;
  attributeName?: string;
  attributeValue?: string;
  targetName: string;
  onConfirm: () => void;
  onCancel: () => void;
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
  attributeName,
  attributeValue,
  targetName,
  onConfirm,
  onCancel,
  isSubmitting = false,
}) => {
  const { data: dependencyCheck, isLoading } = useCheckAppDependencies(
    appId,
    targetType,
    targetId,
    attributeName,
    attributeValue
  );

  const hasUnmetDependencies = dependencyCheck && !dependencyCheck.dependencies_met;
  const hasConflicts = dependencyCheck && dependencyCheck.has_conflicts;
  const canAssign = !hasUnmetDependencies && !hasConflicts;

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

      {/* Warning/Error Blocks */}
      {isLoading ? (
        <div className="h-12 bg-surface-alt animate-pulse rounded" />
      ) : (
        <div className="space-y-2">
          {hasConflicts && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-error">
                    Conflicting App Assignment
                  </p>
                  <p className="text-xs text-error/80 mt-1">
                    Cannot assign {appName}. The target is already assigned to mutually exclusive app(s):{' '}
                    <span className="font-medium">
                      {dependencyCheck.conflicting_apps?.join(', ')}
                    </span>
                  </p>
                  <p className="text-xs text-error/80 mt-1">
                    Please revoke the conflicting app(s) before proceeding.
                  </p>
                </div>
              </div>
            </div>
          )}

          {hasUnmetDependencies && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-error">
                    Missing Dependencies
                  </p>
                  <p className="text-xs text-error/80 mt-1">
                    This app requires:{' '}
                    <span className="font-medium">
                      {dependencyCheck?.missing?.join(', ')}
                    </span>
                  </p>
                  <p className="text-xs text-error/80 mt-1">
                    These dependencies are not yet assigned to {targetName}. Assign them first.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!hasUnmetDependencies && !hasConflicts && dependencyCheck?.dependencies_met && (
            <div className="p-3 bg-success/10 border border-success/30 rounded-md">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                <p className="text-xs text-success-hover font-medium">
                  Configuration is valid
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancel}
          className="h-9 px-4 text-sm font-medium text-ink-secondary border border-line rounded-md hover:bg-surface-alt transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!canAssign || isSubmitting}
          className={`h-9 px-4 text-sm font-medium text-white rounded-md transition-colors flex items-center justify-center gap-2 ${
            canAssign && !isSubmitting
              ? 'bg-primary hover:bg-primary-hover'
              : 'bg-primary/50 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Assigning...
            </>
          ) : (
            'Confirm Assignment'
          )}
        </button>
      </div>
    </div>
  );
};
