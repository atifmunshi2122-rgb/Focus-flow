import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { BudgetEnvelope, ExpenseCategory } from '../../types/index.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import { formatCurrency, toPaise, toMajorCurrency } from '../../lib/currency.ts';
import { ThemeCard, ThemeButton, ThemeInput } from '../ui/ThemePrimitives.tsx';
import { AnimatedProgressBar, useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { getSpringTransition, MOTION_DURATION } from '../../theme/motionTokens.ts';
import {
  Wallet,
  Plus,
  ArrowRightLeft,
  Trash2,
  Edit2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const ENVELOPE_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
];

export const EnvelopeBudgetManager: React.FC = () => {
  const { currency, settings, showToast, refreshKey, triggerRefresh, confirmAction } = useApp();
  const { intensity, isDisabled } = useMotionPreferences();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);
  const currentMonthKey = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<BudgetEnvelope | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formAllocated, setFormAllocated] = useState('');
  const [formColor, setFormColor] = useState(ENVELOPE_COLORS[0]);

  // Transfer modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([api.getEnvelopes(selectedMonth), api.getCategories()])
      .then(([envs, cats]) => {
        if (!isMounted) return;
        setEnvelopes(envs);
        setCategories(cats);
      })
      .catch((err) => {
        if (isMounted) showToast('Failed to load envelope budgets', 'error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMonth, refreshKey, showToast]);

  const openCreateModal = () => {
    setEditingEnvelope(null);
    setFormName('');
    setFormCategoryId('');
    setFormAllocated('');
    setFormColor(ENVELOPE_COLORS[Math.floor(Math.random() * ENVELOPE_COLORS.length)]);
    setIsModalOpen(true);
  };

  const openEditModal = (env: BudgetEnvelope) => {
    setEditingEnvelope(env);
    setFormName(env.name);
    setFormCategoryId(env.categoryId || '');
    setFormAllocated(String(toMajorCurrency(env.allocatedPaise)));
    setFormColor(env.color || ENVELOPE_COLORS[0]);
    setIsModalOpen(true);
  };

  const openTransferModal = (fromEnvelopeId?: string) => {
    setTransferFromId(fromEnvelopeId || (envelopes[0]?.id || ''));
    setTransferToId(envelopes.find((e) => e.id !== fromEnvelopeId)?.id || '');
    setTransferAmount('');
    setIsTransferModalOpen(true);
  };

  const handleSaveEnvelope = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Please enter an envelope name', 'error');
      return;
    }

    const allocatedPaise = toPaise(formAllocated);
    if (allocatedPaise < 0) {
      showToast('Allocated budget cannot be negative', 'error');
      return;
    }

    try {
      if (editingEnvelope) {
        await api.updateEnvelope(editingEnvelope.id, {
          name: formName.trim(),
          categoryId: formCategoryId || null,
          allocatedPaise,
          color: formColor,
          monthKey: selectedMonth,
        });
        showToast('Envelope budget updated', 'success');
      } else {
        await api.createEnvelope({
          name: formName.trim(),
          categoryId: formCategoryId || null,
          allocatedPaise,
          color: formColor,
          monthKey: selectedMonth,
        });
        showToast('New budget envelope created', 'success');
      }
      setIsModalOpen(false);
      triggerRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save envelope';
      showToast(msg, 'error');
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId) {
      showToast('Please select source and destination envelopes', 'error');
      return;
    }
    if (transferFromId === transferToId) {
      showToast('Cannot transfer to the same envelope', 'error');
      return;
    }

    const amountPaise = toPaise(transferAmount);
    if (amountPaise <= 0) {
      showToast('Please enter a valid positive transfer amount', 'error');
      return;
    }

    const source = envelopes.find((e) => e.id === transferFromId);
    if (!source || source.allocatedPaise < amountPaise) {
      showToast('Source envelope has insufficient allocated funds', 'error');
      return;
    }

    try {
      await api.transferEnvelopeFunds(transferFromId, transferToId, amountPaise);
      showToast(
        `Transferred ${formatCurrency(amountPaise, currency)} between envelopes`,
        'success'
      );
      setIsTransferModalOpen(false);
      triggerRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      showToast(msg, 'error');
    }
  };

  const handleDelete = async (env: BudgetEnvelope) => {
    const confirmed = await confirmAction({
      title: 'Delete Budget Envelope',
      message: 'Move this budget envelope to Trash? You can restore it later from the Trash Bin.',
      itemLabel: `${env.name} · ${formatCurrency(env.allocatedPaise, currency)} (${env.monthKey})`,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteEnvelope(env.id);
      showToast('Envelope moved to trash', 'info');
      triggerRefresh();
    } catch {
      showToast('Failed to delete envelope', 'error');
    }
  };

  // Month navigation
  const handlePrevMonth = () => {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  };

  // Totals
  const totalAllocatedPaise = envelopes.reduce((sum, e) => sum + e.allocatedPaise, 0);
  const totalSpentPaise = envelopes.reduce((sum, e) => sum + (e.spentPaise || 0), 0);
  const totalRemainingPaise = totalAllocatedPaise - totalSpentPaise;
  const overallPercentage =
    totalAllocatedPaise > 0 ? Math.min(100, Math.round((totalSpentPaise / totalAllocatedPaise) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}
          >
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
              Envelope Budgeting
            </h1>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Zero-based budgeting envelopes with real-time spend limits and reallocations
            </p>
          </div>
        </div>

        {/* Month Navigation & Action Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[var(--ff-card-bg)] border ff-divider rounded-lg p-1">
            <ThemeButton variant="ghost" size="sm" onClick={handlePrevMonth} aria-label="Previous month" className="p-1.5">
              <ChevronLeft className="w-4 h-4" />
            </ThemeButton>
            <span className="text-xs font-bold font-mono px-3 min-w-[90px] text-center text-[var(--ff-text-primary)]">
              {selectedMonth}
            </span>
            <ThemeButton variant="ghost" size="sm" onClick={handleNextMonth} aria-label="Next month" className="p-1.5">
              <ChevronRight className="w-4 h-4" />
            </ThemeButton>
          </div>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setSelectedMonth(currentMonthKey)}
            disabled={selectedMonth === currentMonthKey}
          >
            Current Month
          </ThemeButton>

          {envelopes.length >= 2 && (
            <ThemeButton variant="secondary" size="sm" onClick={() => openTransferModal()}>
              <ArrowRightLeft className="w-4 h-4 mr-1.5" />
              Transfer Funds
            </ThemeButton>
          )}

          <ThemeButton variant="primary" size="sm" onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Envelope
          </ThemeButton>
        </div>
      </div>

      {/* Aggregate Budget Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider">
          <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Allocated Budget</span>
          <p className="text-lg font-bold font-mono text-[var(--ff-text-primary)] mt-0.5">
            {formatCurrency(totalAllocatedPaise, currency)}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider">
          <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Total Spent</span>
          <p className="text-lg font-bold font-mono text-[var(--ff-danger)] mt-0.5">
            {formatCurrency(totalSpentPaise, currency)}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider">
          <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Remaining Funds</span>
          <p
            className="text-lg font-bold font-mono mt-0.5"
            style={{ color: totalRemainingPaise >= 0 ? 'var(--ff-success)' : 'var(--ff-danger)' }}
          >
            {formatCurrency(totalRemainingPaise, currency)}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Utilization</span>
            <span className="text-xs font-mono font-bold text-[var(--ff-text-primary)]">{overallPercentage}%</span>
          </div>
          <div className="mt-2">
            <AnimatedProgressBar
              value={overallPercentage}
              tone={overallPercentage > 95 ? 'danger' : 'accent'}
              pulsing={overallPercentage >= 85}
              heightClass="h-2.5"
            />
          </div>
        </div>
      </div>

      {/* Envelopes Grid */}
      {envelopes.length === 0 ? (
        <ThemeCard className="text-center py-12">
          <Wallet className="w-10 h-10 mx-auto text-[var(--ff-text-muted)] mb-3" />
          <h3 className="text-base font-bold text-[var(--ff-text-primary)]">No Envelopes Created Yet</h3>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-sm mx-auto mt-1 mb-4">
            Set up envelopes for Groceries, Rent, Utilities, or Entertainment to ensure you never overspend.
          </p>
          <ThemeButton variant="primary" size="sm" onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-1.5" /> Create Your First Envelope
          </ThemeButton>
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {envelopes.map((env) => {
            const spent = env.spentPaise || 0;
            const remaining = env.allocatedPaise - spent;
            const percent = env.allocatedPaise > 0 ? Math.round((spent / env.allocatedPaise) * 100) : 0;
            const isOverspent = spent > env.allocatedPaise;
            const categoryObj = categories.find((c) => c.id === env.categoryId);

            return (
              <motion.div
                key={env.id}
                layout
                transition={getSpringTransition(intensity, isDisabled)}
                whileHover={isDisabled ? undefined : { y: -2 }}
                className="flex flex-col justify-between p-5 rounded-2xl bg-[var(--ff-card-bg)] border transition-all duration-150 hover:shadow-md"
                style={{
                  borderTopWidth: '5px',
                  borderTopColor: env.color || '#6366f1',
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ff-text-primary)]">{env.name}</h3>
                    {categoryObj && (
                      <span className="text-[11px] text-[var(--ff-text-muted)]">
                        Linked Category: <strong className="text-[var(--ff-text-secondary)]">{categoryObj.name}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openTransferModal(env.id)}
                      className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-accent)]"
                      title="Transfer funds out"
                      aria-label={`Transfer funds from ${env.name}`}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(env)}
                      className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                      title="Edit envelope"
                      aria-label={`Edit ${env.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(env)}
                      className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                      title="Delete envelope"
                      aria-label={`Delete ${env.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar & Percent */}
                <div className="my-2">
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-[var(--ff-text-muted)]">
                      Spent: <strong className="text-[var(--ff-text-primary)]">{formatCurrency(spent, currency)}</strong>
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: isOverspent ? 'var(--ff-danger)' : 'var(--ff-text-primary)' }}
                    >
                      {percent}%
                    </span>
                  </div>

                  <AnimatedProgressBar
                    value={percent}
                    tone={isOverspent ? 'danger' : undefined}
                    customColor={isOverspent ? undefined : env.color || '#6366f1'}
                    pulsing={percent >= 85}
                    heightClass="h-2"
                  />
                </div>

                {/* Footer Balance */}
                <div className="flex items-center justify-between pt-3 mt-1 border-t ff-divider text-xs">
                  <span className="text-[var(--ff-text-muted)]">Remaining:</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-sm">
                    {isOverspent && <AlertTriangle className="w-4 h-4 text-[var(--ff-danger)] shrink-0" />}
                    <span style={{ color: isOverspent ? 'var(--ff-danger)' : 'var(--ff-success)' }}>
                      {formatCurrency(remaining, currency)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Envelope Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            key="envelope-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            initial={isDisabled ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={isDisabled ? undefined : { opacity: 0 }}
            transition={{ duration: MOTION_DURATION.overlay }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsModalOpen(false);
            }}
          >
            <motion.form
              onSubmit={handleSaveEnvelope}
              className="w-full max-w-md bg-[var(--ff-card-bg)] border ff-divider rounded-2xl shadow-xl flex flex-col overflow-hidden"
              initial={isDisabled ? false : { opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={isDisabled ? undefined : { opacity: 0, scale: 0.95, y: 12 }}
              transition={getSpringTransition(intensity, isDisabled)}
            >
            <div className="flex items-center justify-between px-6 py-4 border-b ff-divider">
              <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                {editingEnvelope ? 'Edit Budget Envelope' : 'New Budget Envelope'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  Envelope Name
                </label>
                <ThemeInput
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Groceries & Essentials"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  Allocated Monthly Budget ({currency})
                </label>
                <ThemeInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={formAllocated}
                  onChange={(e) => setFormAllocated(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  Link Expense Category (Optional)
                </label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="ff-input w-full text-xs py-2 px-3 rounded-lg"
                  style={{
                    backgroundColor: 'var(--ff-card-bg)',
                    borderColor: 'var(--ff-border)',
                    color: 'var(--ff-text-primary)',
                  }}
                >
                  <option value="">-- No Direct Link --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-[var(--ff-text-muted)] mt-1 block">
                  Transactions logged to this category automatically count against this envelope.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-2">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  {ENVELOPE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        formColor === c ? 'scale-125 ring-2 ring-offset-2 ring-[var(--ff-accent)]' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t ff-divider flex items-center justify-end gap-2">
              <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </ThemeButton>
              <ThemeButton type="submit" variant="primary" size="sm">
                {editingEnvelope ? 'Save Changes' : 'Create Envelope'}
              </ThemeButton>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Fund Transfer Modal */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <motion.div
            key="transfer-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            initial={isDisabled ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={isDisabled ? undefined : { opacity: 0 }}
            transition={{ duration: MOTION_DURATION.overlay }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsTransferModalOpen(false);
            }}
          >
            <motion.form
              onSubmit={handleTransfer}
              className="w-full max-w-md bg-[var(--ff-card-bg)] border ff-divider rounded-2xl shadow-xl flex flex-col overflow-hidden"
              initial={isDisabled ? false : { opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={isDisabled ? undefined : { opacity: 0, scale: 0.95, y: 12 }}
              transition={getSpringTransition(intensity, isDisabled)}
            >
            <div className="flex items-center justify-between px-6 py-4 border-b ff-divider">
              <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                Reallocate Envelope Funds
              </h3>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  From Envelope (Source)
                </label>
                <select
                  value={transferFromId}
                  onChange={(e) => setTransferFromId(e.target.value)}
                  className="ff-input w-full text-xs py-2 px-3 rounded-lg"
                  style={{
                    backgroundColor: 'var(--ff-card-bg)',
                    borderColor: 'var(--ff-border)',
                    color: 'var(--ff-text-primary)',
                  }}
                  required
                >
                  {envelopes.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (Available: {formatCurrency(e.allocatedPaise - (e.spentPaise || 0), currency)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  To Envelope (Destination)
                </label>
                <select
                  value={transferToId}
                  onChange={(e) => setTransferToId(e.target.value)}
                  className="ff-input w-full text-xs py-2 px-3 rounded-lg"
                  style={{
                    backgroundColor: 'var(--ff-card-bg)',
                    borderColor: 'var(--ff-border)',
                    color: 'var(--ff-text-primary)',
                  }}
                  required
                >
                  {envelopes
                    .filter((e) => e.id !== transferFromId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  Transfer Amount ({currency})
                </label>
                <ThemeInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 border-t ff-divider flex items-center justify-end gap-2">
              <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setIsTransferModalOpen(false)}>
                Cancel
              </ThemeButton>
              <ThemeButton type="submit" variant="primary" size="sm">
                Transfer Funds
              </ThemeButton>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};
