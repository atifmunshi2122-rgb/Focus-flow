import React from 'react';
import { AlertTriangle, Trash2, Info } from 'lucide-react';
import { ThemeButton, ThemeModal } from '../ui/ThemePrimitives.tsx';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  itemLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
}

interface ConfirmDialogModalProps extends ConfirmDialogOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialogModal: React.FC<ConfirmDialogModalProps> = ({
  isOpen,
  title,
  message,
  itemLabel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) => {
  const iconBg =
    tone === 'danger'
      ? 'var(--ff-danger-soft)'
      : tone === 'warning'
      ? 'var(--ff-warning-soft)'
      : 'var(--ff-accent-soft)';
  const iconColor =
    tone === 'danger'
      ? 'var(--ff-danger)'
      : tone === 'warning'
      ? 'var(--ff-warning)'
      : 'var(--ff-accent-text)';

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 shrink-0 flex items-center justify-center"
            style={{
              borderRadius: 'var(--ff-radius-button)',
              background: iconBg,
              color: iconColor,
            }}
          >
            {tone === 'danger' ? (
              <Trash2 className="w-5 h-5" />
            ) : tone === 'warning' ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Info className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs leading-relaxed text-[var(--ff-text-secondary)]">
              {message}
            </p>
            {itemLabel && (
              <div
                className="px-3 py-2 text-xs font-semibold text-[var(--ff-text-primary)] truncate border"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  background: 'var(--ff-surface-inset)',
                  borderColor: 'var(--ff-border-color)',
                }}
              >
                {itemLabel}
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="min-h-[44px] px-4 text-xs font-semibold"
          >
            {cancelLabel}
          </ThemeButton>
          <ThemeButton
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            className="min-h-[44px] px-4 text-xs font-semibold"
          >
            {confirmLabel}
          </ThemeButton>
        </div>
      </div>
    </ThemeModal>
  );
};
