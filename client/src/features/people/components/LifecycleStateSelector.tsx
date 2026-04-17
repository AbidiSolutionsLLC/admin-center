// src/features/people/components/LifecycleStateSelector.tsx
import React, { useMemo } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import type { LifecycleState, User } from '@/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/utils/cn';

interface LifecycleStateSelectorProps {
  user: User;
  onTransition: (nextState: LifecycleState) => void;
  isPending?: boolean;
}

const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  invited: ['onboarding', 'archived'],
  onboarding: ['active'],
  active: ['probation', 'on_leave', 'terminated'],
  probation: ['active', 'terminated'],
  on_leave: ['active', 'terminated'],
  terminated: ['archived'],
  archived: [],
};

const lifecycleStateConfig: Record<
  LifecycleState,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'accent'; description: string }
> = {
  invited: {
    label: 'Pending',
    variant: 'info',
    description: 'User has been invited and is pending onboarding',
  },
  onboarding: {
    label: 'Onboarding',
    variant: 'primary',
    description: 'User is currently in the onboarding process',
  },
  active: {
    label: 'Active',
    variant: 'success',
    description: 'User is actively working',
  },
  probation: {
    label: 'Probation',
    variant: 'warning',
    description: 'User is on probation period',
  },
  on_leave: {
    label: 'On Leave',
    variant: 'warning',
    description: 'User is currently on leave',
  },
  terminated: {
    label: 'Terminated',
    variant: 'error',
    description: 'User has been terminated',
  },
  archived: {
    label: 'Archived',
    variant: 'neutral',
    description: 'User has been archived (terminal state)',
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
  const currentState = user.lifecycle_state;
  const validNextStates = useMemo(() => {
    return VALID_TRANSITIONS[currentState] ?? [];
  }, [currentState]);

  const currentConfig = lifecycleStateConfig[currentState];

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
            return (
              <button
                key={nextState}
                onClick={() => onTransition(nextState)}
                disabled={isPending}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border border-line',
                  'hover:bg-surface-alt transition-all duration-150',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isPending && 'cursor-wait'
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
                    buttonVariantMap[nextState]
                  )}
                >
                  {isPending ? 'Processing...' : 'Transition'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
