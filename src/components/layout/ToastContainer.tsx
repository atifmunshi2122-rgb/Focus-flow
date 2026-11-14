import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();
  const { isDisabled, profile } = useMotionPreferences();

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const toneColor = isSuccess
            ? 'var(--ff-success)'
            : isError
            ? 'var(--ff-danger)'
            : 'var(--ff-accent-text)';

          return (
            <motion.div
              key={toast.id}
              layout
              role={isError ? 'alert' : 'status'}
              initial={isDisabled ? false : { opacity: 0, x: 28, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, x: 36, scale: 0.94 }}
              transition={profile.spring}
              drag={isDisabled ? false : 'x'}
              dragConstraints={{ left: 0, right: 160 }}
              dragElastic={{ left: 0.05, right: 0.45 }}
              dragSnapToOrigin
              onDragEnd={(_, info) => {
                if (info.offset.x > 64 || info.velocity.x > 300) {
                  removeToast(toast.id);
                }
              }}
              className="ff-card-elevated pointer-events-auto relative overflow-hidden flex items-center justify-between p-3.5 cursor-grab active:cursor-grabbing"
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
              {!isDisabled && (
                <motion.span
                  aria-hidden="true"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 4.5, ease: 'linear' }}
                  className="absolute bottom-0 left-0 right-0 h-0.5 origin-left opacity-55"
                  style={{ backgroundColor: toneColor }}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
