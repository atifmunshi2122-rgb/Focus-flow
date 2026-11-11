import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const toneColor = isSuccess
          ? 'var(--ff-success)'
          : isError
          ? 'var(--ff-danger)'
          : 'var(--ff-accent-text)';

        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            className="ff-card-elevated pointer-events-auto flex items-center justify-between p-3.5 transition-all"
            style={{
              borderLeft: `4px solid ${toneColor}`,
            }}
          >
            <div className="flex items-center gap-2.5 text-sm font-medium text-[var(--ff-text-primary)]">
              {isSuccess && (
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-success)' }} />
              )}
              {isError && (
                <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-danger)' }} />
              )}
              {!isSuccess && !isError && (
                <Info className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors ml-2 shrink-0"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
