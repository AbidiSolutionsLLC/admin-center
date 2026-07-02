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
      ? 'bg-error hover:bg-red-500 text-white shadow-[0_4px_15px_rgba(239,68,68,0.4)]'
      : 'btn-primary-glow border-0 text-black';

  const iconBgClass =
    variant === 'danger' ? 'bg-error/10 border border-error/20' : 'bg-warning/10 border border-warning/20';

  const iconColorClass =
    variant === 'danger' ? 'text-error' : 'text-warning';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-all duration-200" />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95%] max-w-md',
            'bg-[#161c30]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-modal p-0 overflow-hidden z-50 flex flex-col focus:outline-none',
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
                <Dialog.Title className="text-[15px] font-semibold text-slate-200">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm text-slate-400">
                  {description}
                </Dialog.Description>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 bg-black/20 flex justify-end gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="h-9 px-4 text-sm font-medium rounded-md border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
