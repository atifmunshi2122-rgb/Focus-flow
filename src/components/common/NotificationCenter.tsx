import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, AlertTriangle, CheckCircle2, Info, XCircle, Settings2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';

export const NotificationCenter: React.FC = () => {
  const { notifications, setCurrentTab } = useApp();
  const { isDisabled } = useMotionPreferences();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const urgentCount = notifications.filter((n) => n.severity !== 'success').length;

  const iconForSeverity = (severity: string) => {
    if (severity === 'danger') return <XCircle className="w-4 h-4 text-[var(--ff-danger)] shrink-0" />;
    if (severity === 'warning') return <AlertTriangle className="w-4 h-4 text-[var(--ff-warning)] shrink-0" />;
    if (severity === 'success') return <CheckCircle2 className="w-4 h-4 text-[var(--ff-success)] shrink-0" />;
    return <Info className="w-4 h-4 text-[var(--ff-accent-text)] shrink-0" />;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
        aria-label="Open rule-based notifications"
        title="Notifications Center"
      >
        <Bell className="w-4 h-4" />
        {urgentCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{
              background: 'var(--ff-danger)',
              color: '#ffffff',
            }}
          >
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={isDisabled ? false : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.decelerate }}
            className="ff-card-elevated absolute right-0 mt-2 w-80 sm:w-96 z-50 overflow-hidden"
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--ff-border-color)' }}
            >
              <div>
                <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Notifications</h3>
                <p className="text-[11px] text-[var(--ff-text-muted)]">
                  Rule-based reminders &amp; budget thresholds
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCurrentTab('settings');
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ff-accent-text)] hover:underline"
              >
                <Settings2 className="w-3.5 h-3.5" /> Rules
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--ff-border-color)]">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[var(--ff-text-muted)]">
                  All caught up — no overdue bills, due tasks, or budget alerts.
                </div>
              ) : (
                notifications.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex items-start gap-3 hover:bg-[var(--ff-surface-hover)] transition-colors">
                    <div className="mt-0.5">{iconForSeverity(item.severity)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--ff-text-primary)]">{item.title}</p>
                      <p className="text-[11px] text-[var(--ff-text-secondary)] mt-0.5">{item.message}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setCurrentTab(item.targetTab);
                        }}
                        className="mt-1.5 text-[11px] font-bold text-[var(--ff-accent-text)] hover:underline"
                      >
                        {item.actionLabel} →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
