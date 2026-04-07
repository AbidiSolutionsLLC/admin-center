import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Modal Component
 * A consistent modal wrapper using Radix UI Dialog.
 * Includes standardized header, content area, and optional footer.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 transition-all duration-200" />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95%] bg-white rounded-xl shadow-[0_20px_60px_-10px_rgba(15,22,41,0.25)] p-0 overflow-hidden z-50 flex flex-col focus:outline-none transition-all duration-200',
            sizeClasses[size]
          )}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-line flex items-center justify-between flex-shrink-0">
            <div>
              <Dialog.Title className="text-[15px] font-semibold text-ink">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-ink-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="h-8 w-8 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="px-6 py-5 overflow-y-auto max-h-[70vh]">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 border-t border-line bg-[#F7F8FA] flex justify-end gap-2 flex-shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
