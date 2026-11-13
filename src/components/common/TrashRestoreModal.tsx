import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trash2, RotateCcw, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { TrashRecord } from '../../types/index.ts';
import { ThemeButton } from '../ui/ThemePrimitives.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';

export const TrashRestoreModal: React.FC = () => {
  const { trashModalOpen, setTrashModalOpen, showToast, triggerRefresh, confirmAction } = useApp();
  const { isDisabled } = useMotionPreferences();
  const [items, setItems] = useState<TrashRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTrash = async () => {
    setLoading(true);
    try {
      const list = await api.getTrash();
      setItems(list);
    } catch {
      showToast('Failed to load deleted items', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trashModalOpen) {
      void loadTrash();
    }
  }, [trashModalOpen]);

  const handleRestore = async (item: TrashRecord) => {
    try {
      await api.restoreTrashItem(item.entityType, item.id);
      showToast(`Restored "${item.title}"`, 'success');
      triggerRefresh();
      void loadTrash();
    } catch {
      showToast('Restore failed', 'error');
    }
  };

  const handlePermanentDelete = async (item: TrashRecord) => {
    const confirmed = await confirmAction({
      title: 'Delete Forever?',
      message:
        'Permanently purge this item from your workspace? This cannot be undone or restored.',
      itemLabel: `${item.entityType}: ${item.title}`,
      confirmLabel: 'Delete Forever',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.permanentlyDeleteTrashItem(item.entityType, item.id);
      showToast(`Permanently removed "${item.title}"`, 'info');
      triggerRefresh();
      void loadTrash();
    } catch {
      showToast('Permanent removal failed', 'error');
    }
  };

  return (
    <AnimatePresence>
      {trashModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Trash and Restore Bin"
        >
          <motion.div
            initial={isDisabled ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setTrashModalOpen(false)}
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm"
          />

          <motion.div
            initial={isDisabled ? false : { opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: MOTION_DURATION.card, ease: MOTION_EASING.decelerate }}
            className="ff-card-elevated relative z-10 w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden"
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--ff-border-color)' }}
            >
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-5 h-5 text-[var(--ff-accent-text)]" />
                <div>
                  <h2 className="ff-heading text-base font-bold text-[var(--ff-text-primary)]">
                    Trash &amp; Restore Bin
                  </h2>
                  <p className="text-xs text-[var(--ff-text-muted)]">
                    Recover soft-deleted tasks, incomes, expenses, or bills cleanly
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTrashModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)]"
                aria-label="Close trash bin"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
              {loading ? (
                <div className="py-12 text-center text-sm text-[var(--ff-text-muted)]">
                  Loading trash records...
                </div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-sm text-[var(--ff-text-muted)]">
                  Trash is empty. Deleted items stay here safely until restored or permanently purged.
                </div>
              ) : (
                items.map((item) => {
                  const key = `${item.entityType}:${item.id}`;
                  return (
                    <div
                      key={key}
                      className="ff-surface-subtle p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]">
                            {item.entityType}
                          </span>
                          <span className="text-sm font-semibold text-[var(--ff-text-primary)] truncate">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                          {item.subtitle}
                          {typeof item.amountPaise === 'number'
                            ? ` • ${formatCurrency(item.amountPaise)}`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <ThemeButton
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleRestore(item)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </ThemeButton>
                        <ThemeButton
                          variant="danger"
                          size="sm"
                          onClick={() => void handlePermanentDelete(item)}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete Forever
                        </ThemeButton>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
