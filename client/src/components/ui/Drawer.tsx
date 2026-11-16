import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Header actions, shown beside the close button. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 480 px (md) or 640 px (lg). */
  size?: 'md' | 'lg';
}

/**
 * Drawer: right side, 480 / 640 px, focus-trapped, Esc closes, header with
 * actions (DRD 9.2). Focus trap and Esc come from @radix-ui/react-dialog.
 */
export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  actions,
  children,
  footer,
  size = 'md',
}) => (
  <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-panel" />
      <Dialog.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface-elevated shadow-modal focus:outline-none',
          'animate-in slide-in-from-right duration-panel',
          size === 'md' ? 'max-w-[480px]' : 'max-w-[640px]',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4 shrink-0">
          <div className="min-w-0">
            <Dialog.Title className="text-section text-ink truncate">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-0.5 text-table text-ink-secondary">{description}</Dialog.Description>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <Dialog.Close
              aria-label="Close"
              className="h-8 w-8 flex items-center justify-center rounded-control text-ink-secondary hover:bg-surface-hover hover:text-ink transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-3 shrink-0">{footer}</div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
