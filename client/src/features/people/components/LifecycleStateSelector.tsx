// src/features/people/components/LifecycleStateSelector.tsx
import React, { useMemo, useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import type { LifecycleState, User } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/utils/cn';

interface LifecycleStateSelectorProps {
  user: User;
  onTransition: (nextState: LifecycleState, reason?: string) => void;
  isPending?: boolean;
}

const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  pending: ['active', 'archived'],
  active: ['deactivated', 'archived'],
  deactivated: ['active', 'archived'],
  archived: ['pending'],
};

const lifecycleStateConfig: Record<
  LifecycleState,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'accent'; description: string }
> = {
  pending: {
    label: 'Pending',
    variant: 'info',
    description: 'User has been invited and is pending activation',
  },
  active: {
    label: 'Active',
    variant: 'success',
    description: 'User is actively working',
  },
  deactivated: {
    label: 'Deactivated',
    variant: 'error',
    description: 'User account has been temporarily deactivated',
  },
  archived: {
    label: 'Archived',
    variant: 'neutral',
    description: 'User data is archived (soft deleted)',
  },
};

const buttonVariantMap: Record<LifecycleState, string> = {
  invited: 'bg-sky-500 hover:bg-sky-600 text-white',
  onboarding: 'bg-primary hover:bg-primary-hover text-white',
  active: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  probation: 'bg-amber-500 hover:bg-amber-600 text-white',
  on_leave: 'bg-amber-500 hover:bg-amber-600 text-white',
  terminated: 'bg-red-500 hover:bg-red-600 text-white',
  archived: 'bg-gray-500 hover:bg-gray-600 text-white',
};

/**
 * LifecycleStateSelector Component
 * Shows current state and valid next states as clickable buttons.
 * Only allows transitions defined in VALID_TRANSITIONS map.
 * Used on: PeoplePage, UserProfilePage.
 */
export const LifecycleStateSelector: React.FC<LifecycleStateSelectorProps> = ({
  user,
  onTransition,
  isPending = false,
}) => {
  const [reason, setReason] = useState('');
  const [selectedState, setSelectedState] = useState<LifecycleState | null>(null);
  const currentState = user.lifecycle_state;
  const validNextStates = useMemo(() => {
    return VALID_TRANSITIONS[currentState] ?? [];
  }, [currentState]);

  const currentConfig = lifecycleStateConfig[currentState] || { 
    label: currentState || 'Unknown', 
    variant: 'neutral', 
    description: 'The current lifecycle state of the user' 
  };

  if (validNextStates.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-surface-alt border border-line rounded-lg">
        <AlertCircle className="w-5 h-5 text-ink-muted flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-ink">Terminal State</p>
          <p className="text-xs text-ink-muted">
            No further transitions available from {currentConfig.label}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current State */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Current State</p>
        <div className="flex items-center gap-3 p-3 bg-white border border-line rounded-lg">
          <StatusBadge variant={currentConfig.variant}>{currentConfig.label}</StatusBadge>
          <p className="text-xs text-ink-muted">{currentConfig.description}</p>
        </div>
      </div>

      {/* Transition Options */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Transition To</p>
        <div className="space-y-2">
          {validNextStates.map((nextState) => {
            const nextConfig = lifecycleStateConfig[nextState];
            const requiresReason = nextState === 'deactivated' || nextState === 'archived';
            const isSelected = selectedState === nextState;

            return (
              <div key={nextState} className="space-y-2">
                <button
                  onClick={() => {
                    if (requiresReason) {
                      setSelectedState(isSelected ? null : nextState);
                      setReason('');
                    } else {
                      onTransition(nextState);
                    }
                  }}
                  disabled={isPending}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg border border-line',
                    'hover:bg-surface-alt transition-all duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isPending && 'cursor-wait',
                    isSelected && 'ring-2 ring-primary/20 border-primary'
                  )}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <ArrowRight className="w-4 h-4 text-ink-muted" />
                    <StatusBadge variant={nextConfig.variant}>{nextConfig.label}</StatusBadge>
                    <span className="text-xs text-ink-muted">{nextConfig.description}</span>
                  </div>
                  <span
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                      requiresReason ? 'bg-amber-100 text-amber-700' : buttonVariantMap[nextState]
                    )}
                  >
                    {requiresReason ? (isSelected ? 'Cancel' : 'Select & Continue') : (isPending ? 'Processing...' : 'Transition')}
                  </span>
                </button>

                {isSelected && requiresReason && (
                  <div className="ml-6 p-3 bg-surface-alt border border-line rounded-lg space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">
                        Reason <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Please provide a reason for this action..."
                        rows={3}
                        className="w-full px-3 py-2 text-sm rounded-md border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 resize-none"
                      />
                      <p className="text-xs text-ink-secondary mt-1">
                        This reason will be included in notification emails and audit logs.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onTransition(nextState, reason)}
                        disabled={isPending || !reason.trim()}
                        className="h-8 px-3 text-xs font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPending ? 'Processing...' : 'Confirm Transition'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedState(null);
                          setReason('');
                        }}
                        disabled={isPending}
                        className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
