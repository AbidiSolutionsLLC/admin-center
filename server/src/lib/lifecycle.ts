// server/src/lib/lifecycle.ts
/**
 * Lifecycle state machine and transition validator
 * Used by: people.controller.ts (lifecycle endpoint)
 */

export type LifecycleState = 'pending' | 'active' | 'deactivated' | 'archived';

/**
 * Valid lifecycle state transitions
 * Maps from current state to allowed next states
 */
export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  pending: ['active', 'archived'],
  active: ['deactivated', 'archived'],
  deactivated: ['active', 'archived'],
  archived: ['pending'], // Allow un-archiving if needed
};

/**
 * Validates if a lifecycle state transition is allowed
 * @param from - Current lifecycle state
 * @param to - Target lifecycle state
 * @returns true if transition is valid, false otherwise
 */
export const isValidTransition = (from: LifecycleState, to: LifecycleState): boolean => {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
};

/**
 * Gets all possible next states for a given lifecycle state
 * @param currentState - Current lifecycle state
 * @returns Array of possible next states
 */
export const getValidNextStates = (currentState: LifecycleState): LifecycleState[] => {
  return VALID_TRANSITIONS[currentState] ?? [];
};

/**
 * Generates a human-readable error message for invalid transitions
 * @param from - Current lifecycle state
 * @param to - Target lifecycle state
 * @returns Error message string
 */
export const getTransitionErrorMessage = (from: LifecycleState, to: LifecycleState): string => {
  const validStates = getValidNextStates(from);
  if (validStates.length === 0) {
    return `Cannot transition from '${from}' state. This is a terminal state.`;
  }
  return `Invalid transition from '${from}' to '${to}'. Valid transitions: ${validStates.join(', ')}`;
};
