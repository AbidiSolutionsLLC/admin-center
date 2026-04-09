// src/components/ui/ConfirmDialog.tsx
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  isLoading?: boolean;
}

/**
 * ConfirmDialog Component
 * A standardized confirmation dialog for destructive or important actions.
 * Uses Radix UI Dialog with amber-orange / red variant styling.
 * Used on: OrganizationPage (archive department), and any page requiring confirmation before DELETE.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-primary hover:bg-primary-hover text-white';

  const iconBgClass =
    variant === 'danger' ? 'bg-red-50' : 'bg-amber-50';

  const iconColorClass =
    variant === 'danger' ? 'text-red-500' : 'text-amber-500';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 transition-all duration-200" />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95%] max-w-md',
            'bg-white rounded-xl shadow-modal p-0 overflow-hidden z-50 flex flex-col focus:outline-none',
            'animate-in fade-in-0 zoom-in-95 duration-200'
          )}
        >
          {/* Body */}
          <div className="px-6 py-6">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  iconBgClass
                )}
              >
                <AlertTriangle className={cn('w-5 h-5', iconColorClass)} />
              </div>
              <div className="flex-1 min-w-0">
                <Dialog.Title className="text-[15px] font-semibold text-ink">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm text-ink-secondary">
                  {description}
                </Dialog.Description>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-line bg-surface-base flex justify-end gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                'h-9 px-4 text-sm font-medium rounded-md transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                confirmBtnClass
              )}
            >
              {isLoading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
