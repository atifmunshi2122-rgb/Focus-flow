import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { ExpenseTransaction, RecurringExpense, ExpenseCategory } from '../../types/index.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  EmptyStateIllustration,
  SkeletonList,
  ValidationMessage,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
import {
  Repeat,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  CreditCard,
  Tag,
  TrendingDown,
} from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';

export const ExpenseManager: React.FC = () => {
  const {
    currency,
    refreshKey,
    triggerRefresh,
    showToast,
    confirmAction,
    googleSpreadsheetId,
    googleAccessToken,
  } = useApp();
  const [activeTab, setActiveTab] = useState<'variable' | 'recurring'>('variable');
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [varModalOpen, setVarModalOpen] = useState(false);
  const [editingVar, setEditingVar] = useState<ExpenseTransaction | null>(null);
  const [varDesc, setVarDesc] = useState('');
  const [varAmount, setVarAmount] = useState('');
  const [varDate, setVarDate] = useState(new Date().toISOString().split('T')[0]);
  const [varCategory, setVarCategory] = useState('');
  const [varMethod, setVarMethod] = useState<'credit_card' | 'debit_card' | 'upi_bank' | 'cash'>('credit_card');
  const [varNotes, setVarNotes] = useState('');

  const [recModalOpen, setRecModalOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<RecurringExpense | null>(null);
  const [recName, setRecName] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCategory, setRecCategory] = useState('');
  const [recRecurrence, setRecRecurrence] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [recDueDay, setRecDueDay] = useState('5');
  const [recNotes, setRecNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);

  const loadData = () => {
    setLoading(true);
    Promise.all([api.getExpenses(), api.getRecurringExpenses(), api.getCategories()])
      .then(([expData, recData, catData]) => {
        setExpenses(expData);
        setRecurring(recData);
        setCategories(catData);
        if (catData.length > 0) {
          if (!varCategory) setVarCategory(catData[0].id);
          if (!recCategory) setRecCategory(catData[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const openVarCreate = () => {
    setEditingVar(null);
    setVarDesc('');
    setVarAmount('');
    setVarDate(new Date().toISOString().split('T')[0]);
    setVarCategory(categories[0]?.id || '');
    setVarMethod('upi_bank');
    setVarNotes('');
    setFormError(null);
    setSubmitSuccess(false);
    setVarModalOpen(true);
  };

  const handleSaveVar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!varDesc.trim() || !varAmount || Number(varAmount) <= 0) {
      setFormError('Please enter a valid expense description and positive amount.');
      return;
    }

    setSaving(true);
    try {
      if (editingVar) {
        const updated = await api.updateExpense(editingVar.id, {
          description: varDesc.trim(),
          amountPaise: toPaise(varAmount),
          date: varDate,
          categoryId: varCategory,
          paymentMethod: varMethod,
          notes: varNotes,
          type: 'variable',
        });
        showToast('Expense updated', 'success');
      } else {
        const created = await api.createExpense({
          description: varDesc.trim(),
          amountPaise: toPaise(varAmount),
          date: varDate,
          categoryId: varCategory,
          paymentMethod: varMethod,
          notes: varNotes,
          type: 'variable',
        });
        void googleSheetsService.enqueueMutation(
          'Variable_Expenses',
          [
            created.id,
            created.date,
            created.description,
            created.categoryName || 'General',
            created.amountPaise / 100,
            varMethod.replace('_', ' ').toUpperCase(),
            created.notes || '',
          ],
          'append',
          `Variable_Expenses_append_${created.id}`
        );
        if (googleSpreadsheetId && googleAccessToken) {
          googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
        }
        showToast('Variable expense logged & synchronized', 'success');
      }
      setSaving(false);
      setSubmitSuccess(true);
      triggerRefresh();
      loadData();
      setTimeout(() => {
        setSubmitSuccess(false);
        setVarModalOpen(false);
      }, isDisabled ? 50 : 220);
    } catch {
      setSaving(false);
      setFormError('Failed to save expense. Please try again.');
      showToast('Failed to save expense', 'error');
    }
  };

  const handleDeleteVar = async (exp: ExpenseTransaction) => {
    const confirmed = await confirmAction({
      title: 'Delete Expense Entry',
      message: 'Move this variable expense entry to Trash? You can restore it later from the Trash Bin.',
      itemLabel: `${exp.description} · -${formatCurrency(exp.amountPaise, currency)} (${exp.date})`,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteExpense(exp.id);
      showToast('Expense moved to Trash', 'info');
      triggerRefresh();
      loadData();
    } catch {
      showToast('Failed to delete expense', 'error');
    }
  };

  const openRecCreate = () => {
    setEditingRec(null);
    setRecName('');
    setRecAmount('');
    setRecCategory(categories[0]?.id || '');
    setRecRecurrence('monthly');
    setRecDueDay('5');
    setRecNotes('');
    setFormError(null);
    setSubmitSuccess(false);
    setRecModalOpen(true);
  };

  const openRecEdit = (rec: RecurringExpense) => {
    setEditingRec(rec);
    setRecName(rec.name);
    setRecAmount(String(rec.amountPaise / 100));
    setRecCategory(rec.categoryId);
    setRecRecurrence(rec.recurrence);
    setRecDueDay(String(rec.dueDay));
    setRecNotes(rec.notes);
    setFormError(null);
    setSubmitSuccess(false);
    setRecModalOpen(true);
  };

  const handleSaveRec = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!recName.trim() || !recAmount || Number(recAmount) <= 0) {
      setFormError('Please enter a recurring plan name and positive amount.');
      return;
    }

    setSaving(true);
    try {
      if (editingRec) {
        const updated = await api.updateRecurringExpense(editingRec.id, {
          name: recName.trim(),
          amountPaise: toPaise(recAmount),
          categoryId: recCategory,
          recurrence: recRecurrence,
          dueDay: Number(recDueDay),
          notes: recNotes,
        });
        showToast('Recurring expense updated', 'success');
      } else {
        const created = await api.createRecurringExpense({
          name: recName.trim(),
          amountPaise: toPaise(recAmount),
          categoryId: recCategory,
          recurrence: recRecurrence,
          dueDay: Number(recDueDay),
          notes: recNotes,
        });
        void googleSheetsService.enqueueMutation(
          'Fixed_Expenses',
          [
            created.id,
            created.name,
            created.categoryName || 'Fixed Commitment',
            created.amountPaise / 100,
            created.recurrence.toUpperCase(),
            created.dueDay,
            'ACTIVE',
            created.notes || '',
          ],
          'append',
          `Fixed_Expenses_append_${created.id}`
        );
        if (googleSpreadsheetId && googleAccessToken) {
          googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
        }
        showToast('Recurring plan registered; automatic bills created & synced!', 'success');
      }
      setSaving(false);
      setSubmitSuccess(true);
      triggerRefresh();
      loadData();
      setTimeout(() => {
        setSubmitSuccess(false);
        setRecModalOpen(false);
      }, isDisabled ? 50 : 220);
    } catch {
      setSaving(false);
      setFormError('Failed to save recurring expense. Please try again.');
      showToast('Failed to save recurring expense', 'error');
    }
  };

  const handleToggleRecActive = async (rec: RecurringExpense) => {
    try {
      await api.updateRecurringExpense(rec.id, { isActive: !rec.isActive });
      showToast(rec.isActive ? 'Recurring plan deactivated' : 'Recurring plan reactivated', 'info');
      triggerRefresh();
      loadData();
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const handleDeleteRec = async (rec: RecurringExpense) => {
    const confirmed = await confirmAction({
      title: 'Delete Recurring Expense Plan',
      message: 'Future recurring bills will no longer be automatically generated for this commitment.',
      itemLabel: `${rec.name} · ${formatCurrency(rec.amountPaise, currency)} / ${rec.recurrence}`,
      confirmLabel: 'Delete Plan',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteRecurringExpense(rec.id);
      showToast('Recurring plan removed', 'info');
      triggerRefresh();
      loadData();
    } catch {
      showToast('Failed to delete recurring plan', 'error');
    }
  };

  const variableExpenses = expenses.filter((e) => e.type === 'variable');
  const totalVariable = variableExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const totalRecurring = recurring.filter((r) => r.isActive).reduce((s, r) => s + r.amountPaise, 0);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Top Header & Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <ThemeSegmentedControl<'variable' | 'recurring'>
          ariaLabel="Expense view mode"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            {
              id: 'variable',
              label: `Variable Daily Expenses (${variableExpenses.length})`,
              icon: <TrendingDown className="w-4 h-4" />,
            },
            {
              id: 'recurring',
              label: `Fixed Recurring Plans (${recurring.length})`,
              icon: <Repeat className="w-4 h-4" />,
            },
          ]}
        />

        <ThemeButton
          variant="primary"
          size="md"
          onClick={activeTab === 'variable' ? openVarCreate : openRecCreate}
          className="shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{activeTab === 'variable' ? 'Add Variable Expense' : 'Add Recurring Plan'}</span>
        </ThemeButton>
      </div>

      {/* SUMMARY BANNER */}
      <ThemeCard variant="inset" className="p-4 flex items-center justify-between text-xs">
        {activeTab === 'variable' ? (
          <div>
            <span className="text-[var(--ff-text-muted)]">Current Variable Spend: </span>
            <strong className="font-mono text-[var(--ff-text-primary)] text-sm">
              <AnimatedNumber
                value={totalVariable}
                format={(paise) => formatCurrency(Math.round(paise), currency)}
              />
            </strong>
            <span className="text-[var(--ff-text-muted)] ml-2">
              (Food, shopping, transit, entertainment, etc.)
            </span>
          </div>
        ) : (
          <div>
            <span className="text-[var(--ff-text-muted)]">Active Monthly Fixed Commitments: </span>
            <strong className="font-mono text-sm" style={{ color: 'var(--ff-accent-text)' }}>
              <AnimatedNumber
                value={totalRecurring}
                format={(paise) => formatCurrency(Math.round(paise), currency)}
              />
            </strong>
            <span className="text-[var(--ff-text-muted)] ml-2">
              (Rent, internet, subscriptions, insurance, etc.)
            </span>
          </div>
        )}
      </ThemeCard>

      <AnimatePresence mode="wait" initial={false}>
        {/* SECTION 1: VARIABLE EXPENSES LIST */}
        {activeTab === 'variable' ? (
          <motion.div
            key="expense-tab-variable"
            initial={isDisabled ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{
              duration: MOTION_DURATION.card * Math.max(0.55, factor || 0.01),
              ease: MOTION_EASING.decelerate,
            }}
          >
            <ThemeCard noPadding>
              {loading && expenses.length === 0 ? (
                <SkeletonList rows={4} />
              ) : variableExpenses.length === 0 ? (
                <EmptyStateIllustration
                  icon={<TrendingDown className="w-6 h-6" />}
                  title="No variable expenses recorded"
                  description="Log day-to-day shopping, food, and transit purchases above."
                  action={
                    <ThemeButton variant="primary" size="sm" onClick={openVarCreate}>
                      <Plus className="w-4 h-4" />
                      <span>Add Variable Expense</span>
                    </ThemeButton>
                  }
                />
              ) : (
                <div className="divide-y ff-divider">
                  <AnimatePresence initial={false}>
                    {variableExpenses.map((exp) => (
                      <motion.div
                        key={exp.id}
                        layout={isDisabled ? false : 'position'}
                        initial={isDisabled ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={
                          isDisabled
                            ? { opacity: 0 }
                            : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }
                        }
                        transition={{
                          duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01),
                          ease: MOTION_EASING.decelerate,
                        }}
                        className="ff-row-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        style={{ padding: 'var(--ff-row-pad)' }}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className="w-9 h-9 flex items-center justify-center shrink-0"
                            style={{
                              borderRadius: 'var(--ff-radius-button)',
                              background: 'var(--ff-danger-soft)',
                              color: 'var(--ff-danger)',
                            }}
                          >
                            <CreditCard className="w-4 h-4" />
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                              {exp.description}
                            </h4>

                            {exp.notes && (
                              <p className="text-xs text-[var(--ff-text-muted)] mt-0.5 line-clamp-1">
                                {exp.notes}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                              <div className="flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                <span>{exp.categoryName || 'General'}</span>
                              </div>
                              <span aria-hidden="true">·</span>
                              <div className="flex items-center gap-1 font-mono">
                                <Calendar className="w-3 h-3" />
                                <span>{exp.date}</span>
                              </div>
                              <span aria-hidden="true">·</span>
                              <span className="uppercase text-[10px] font-medium">
                                {exp.paymentMethod.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <span className="text-base font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                            -{formatCurrency(exp.amountPaise, currency)}
                          </span>

                          <button
                            type="button"
                            onClick={() => void handleDeleteVar(exp)}
                            className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] transition-colors"
                            title="Delete expense"
                            aria-label={`Delete ${exp.description}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ThemeCard>
          </motion.div>
        ) : (
          /* SECTION 2: FIXED RECURRING EXPENSES LIST */
          <motion.div
            key="expense-tab-recurring"
            initial={isDisabled ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{
              duration: MOTION_DURATION.card * Math.max(0.55, factor || 0.01),
              ease: MOTION_EASING.decelerate,
            }}
          >
            <ThemeCard noPadding>
              {loading && recurring.length === 0 ? (
                <SkeletonList rows={4} />
              ) : recurring.length === 0 ? (
                <EmptyStateIllustration
                  icon={<Repeat className="w-6 h-6" />}
                  title="No recurring plans set up"
                  description="Set up monthly internet, rent, subscriptions, and recurring bills above."
                  action={
                    <ThemeButton variant="primary" size="sm" onClick={openRecCreate}>
                      <Plus className="w-4 h-4" />
                      <span>Add Recurring Plan</span>
                    </ThemeButton>
                  }
                />
              ) : (
                <div className="divide-y ff-divider">
                  <AnimatePresence initial={false}>
                    {recurring.map((rec) => (
                      <motion.div
                        key={rec.id}
                        layout={isDisabled ? false : 'position'}
                        initial={isDisabled ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: rec.isActive ? 1 : 0.62, y: 0 }}
                        exit={
                          isDisabled
                            ? { opacity: 0 }
                            : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }
                        }
                        transition={{
                          duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01),
                          ease: MOTION_EASING.decelerate,
                        }}
                        className="ff-row-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        style={{ padding: 'var(--ff-row-pad)' }}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className="w-9 h-9 flex items-center justify-center shrink-0"
                            style={{
                              borderRadius: 'var(--ff-radius-button)',
                              background: 'var(--ff-accent-soft)',
                              color: 'var(--ff-accent-text)',
                            }}
                          >
                            <Repeat className="w-4 h-4" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                                {rec.name}
                              </h4>
                              <ThemeBadge tone="accent">{rec.recurrence}</ThemeBadge>
                            </div>

                            {rec.notes && (
                              <p className="text-xs text-[var(--ff-text-muted)] mt-0.5 line-clamp-1">
                                {rec.notes}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                              <div className="flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                <span>{rec.categoryName || 'Fixed'}</span>
                              </div>
                              <span aria-hidden="true">·</span>
                              <span>Due Day: {rec.dueDay} of each cycle</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className="font-semibold transition-colors"
                                style={{
                                  color: rec.isActive ? 'var(--ff-success)' : 'var(--ff-text-muted)',
                                }}
                              >
                                {rec.isActive ? 'Active Auto-Bill' : 'Deactivated'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                          <span className="text-base font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                            {formatCurrency(rec.amountPaise, currency)}
                          </span>

                          {/* Animated Accessible Switch */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={rec.isActive}
                            onClick={() => void handleToggleRecActive(rec)}
                            className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors"
                            style={{
                              backgroundColor: rec.isActive ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                              borderColor: rec.isActive ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                            }}
                            title={rec.isActive ? 'Deactivate recurring plan' : 'Activate recurring plan'}
                            aria-label={rec.isActive ? `Deactivate ${rec.name}` : `Activate ${rec.name}`}
                          >
                            <motion.span
                              animate={{ x: rec.isActive ? 17 : 2 }}
                              transition={
                                isDisabled
                                  ? { duration: 0.01 }
                                  : { type: 'spring', stiffness: 500, damping: 32 }
                              }
                              className="inline-block h-3.5 w-3.5 rounded-full shadow-xs"
                              style={{
                                backgroundColor: rec.isActive
                                  ? 'var(--ff-accent-contrast)'
                                  : 'var(--ff-text-muted)',
                              }}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => openRecEdit(rec)}
                            className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] transition-colors"
                            title="Edit recurring plan"
                            aria-label={`Edit ${rec.name}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteRec(rec)}
                            className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] transition-colors"
                            title="Delete recurring plan"
                            aria-label={`Delete ${rec.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ThemeCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Add/Edit Variable Expense */}
      <ThemeModal
        isOpen={varModalOpen}
        onClose={() => setVarModalOpen(false)}
        title={editingVar ? 'Edit Variable Expense' : 'Log Variable Expense'}
      >
        <form onSubmit={handleSaveVar} noValidate className="space-y-3.5">
          <div>
            <label
              htmlFor="var-exp-desc"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Description / Merchant
            </label>
            <ThemeInput
              id="var-exp-desc"
              type="text"
              required
              autoFocus
              value={varDesc}
              onChange={(e) => {
                setVarDesc(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="e.g., Weekly Groceries, Fuel, Cafe"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="var-exp-amount"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Amount ({currency})
              </label>
              <ThemeInput
                id="var-exp-amount"
                type="number"
                step="0.01"
                required
                value={varAmount}
                onChange={(e) => {
                  setVarAmount(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="0.00"
                className="font-mono tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="var-exp-date"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Date
              </label>
              <ThemeInput
                id="var-exp-date"
                type="date"
                required
                value={varDate}
                onChange={(e) => setVarDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="var-exp-cat"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Category
              </label>
              <ThemeSelect
                id="var-exp-cat"
                value={varCategory}
                onChange={(e) => setVarCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </ThemeSelect>
            </div>

            <div>
              <label
                htmlFor="var-exp-method"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Payment Method
              </label>
              <ThemeSelect
                id="var-exp-method"
                value={varMethod}
                onChange={(e) => setVarMethod(e.target.value as typeof varMethod)}
              >
                <option value="upi_bank">UPI / Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
                <option value="cash">Cash</option>
              </ThemeSelect>
            </div>
          </div>

          <div>
            <label
              htmlFor="var-exp-notes"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Notes (Optional)
            </label>
            <ThemeInput
              id="var-exp-notes"
              type="text"
              value={varNotes}
              onChange={(e) => setVarNotes(e.target.value)}
              placeholder="Additional context..."
            />
          </div>

          <ValidationMessage message={formError} tone="error" />

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setVarModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              success={submitSuccess}
              loadingText="Saving..."
            >
              Save Expense
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* Modal: Add/Edit Fixed Recurring Plan */}
      <ThemeModal
        isOpen={recModalOpen}
        onClose={() => setRecModalOpen(false)}
        title={editingRec ? 'Edit Recurring Expense Plan' : 'Create Recurring Fixed Plan'}
      >
        <form onSubmit={handleSaveRec} noValidate className="space-y-3.5">
          <div>
            <label
              htmlFor="rec-plan-name"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Plan Name
            </label>
            <ThemeInput
              id="rec-plan-name"
              type="text"
              required
              autoFocus
              value={recName}
              onChange={(e) => {
                setRecName(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="e.g., Fiber Internet, Apartment Lease, Spotify"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="rec-plan-amount"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Amount ({currency})
              </label>
              <ThemeInput
                id="rec-plan-amount"
                type="number"
                step="0.01"
                required
                value={recAmount}
                onChange={(e) => {
                  setRecAmount(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="0.00"
                className="font-mono tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="rec-plan-freq"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Recurrence
              </label>
              <ThemeSelect
                id="rec-plan-freq"
                value={recRecurrence}
                onChange={(e) => setRecRecurrence(e.target.value as typeof recRecurrence)}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </ThemeSelect>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="rec-plan-day"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Due Day of Month
              </label>
              <ThemeInput
                id="rec-plan-day"
                type="number"
                min="1"
                max="31"
                required
                value={recDueDay}
                onChange={(e) => setRecDueDay(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="rec-plan-cat"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Category
              </label>
              <ThemeSelect
                id="rec-plan-cat"
                value={recCategory}
                onChange={(e) => setRecCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </ThemeSelect>
            </div>
          </div>

          <div>
            <label
              htmlFor="rec-plan-notes"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Notes / Terms (Optional)
            </label>
            <ThemeInput
              id="rec-plan-notes"
              type="text"
              value={recNotes}
              onChange={(e) => setRecNotes(e.target.value)}
              placeholder="e.g., Annual contract, renewal in Dec"
            />
          </div>

          <ValidationMessage message={formError} tone="error" />

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setRecModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              success={submitSuccess}
              loadingText="Saving..."
            >
              Save Recurring Plan
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
