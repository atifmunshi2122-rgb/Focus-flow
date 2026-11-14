import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import { playCashSound } from '../../lib/sound.ts';
import {
  Timer,
  PlusCircle,
  Receipt,
  CreditCard,
  CheckSquare,
  Flame,
  Layers,
  Target,
  Sparkles,
  ArrowRight,
  Check,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import {
  ThemeButton,
  ThemeCard,
  ThemeModal,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import { ValidationMessage, useMotionPreferences } from '../ui/MotionPrimitives.tsx';

export type QuickActionType =
  | 'task'
  | 'expense'
  | 'income'
  | 'bill'
  | 'habit'
  | 'envelope'
  | 'goal';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: QuickActionType;
}

const ACTION_TABS: Array<{ id: QuickActionType; label: string; icon: any }> = [
  { id: 'task', label: 'Task', icon: CheckSquare },
  { id: 'expense', label: 'Expense', icon: Receipt },
  { id: 'income', label: 'Income', icon: CreditCard },
  { id: 'bill', label: 'Bill', icon: Calendar },
  { id: 'habit', label: 'Habit', icon: Flame },
  { id: 'envelope', label: 'Budget', icon: Layers },
  { id: 'goal', label: 'Savings', icon: Target },
];

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  onClose,
  initialType = 'task',
}) => {
  const {
    showToast,
    triggerRefresh,
    currency,
    settings,
  } = useApp();

  const [activeType, setActiveType] = useState<QuickActionType>(initialType);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirmStep, setShowConfirmStep] = useState(false);

  // Common input states
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Task specific
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedPomodoros, setEstimatedPomodoros] = useState('2');

  // Expense specific
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'debit_card' | 'upi_bank' | 'cash'>('upi_bank');

  // Habit specific
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');

  // Budget envelope specific
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7));

  // Sync initial type when opened
  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      resetFields();
    }
  }, [isOpen, initialType]);

  const resetFields = () => {
    setTitle('');
    setAmount('');
    setCategory('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
    setPriority('medium');
    setEstimatedPomodoros('2');
    setPaymentMethod('upi_bank');
    setFrequency('daily');
    setMonthKey(new Date().toISOString().slice(0, 7));
    setFormError(null);
    setShowConfirmStep(false);
  };

  const handleTabChange = (nextType: QuickActionType) => {
    setActiveType(nextType);
    setFormError(null);
    setShowConfirmStep(false);
  };

  const validateInputs = (): boolean => {
    setFormError(null);
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setFormError(`Please enter a valid ${activeType === 'expense' ? 'description' : activeType === 'income' ? 'source name' : 'title'}.`);
      return false;
    }

    if (['expense', 'income', 'bill', 'envelope', 'goal'].includes(activeType)) {
      const numAmount = Number(amount);
      if (!amount || isNaN(numAmount) || numAmount <= 0) {
        setFormError('Please enter a valid positive numerical amount.');
        return false;
      }
    }

    return true;
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateInputs()) {
      setShowConfirmStep(true);
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    setFormError(null);

    try {
      if (activeType === 'task') {
        const createdTask = await api.createTask({
          title: title.trim(),
          priority,
          estimatedPomodoros: Number(estimatedPomodoros) || 1,
          dueDate: date || null,
          category: category.trim() || undefined,
        });

        googleSheetsService.enqueueMutation(
          'Tasks',
          [
            createdTask.id,
            createdTask.title,
            createdTask.priority,
            createdTask.status,
            createdTask.dueDate || '',
            createdTask.estimatedPomodoros,
            createdTask.completedPomodoros,
            createdTask.createdAt,
          ],
          'append',
          `Tasks_append_${createdTask.id}`
        );
        showToast('Task created successfully', 'success');
      } else if (activeType === 'expense') {
        const createdExp = await api.createExpense({
          description: title.trim(),
          amountPaise: toPaise(amount),
          date: date || new Date().toISOString().split('T')[0],
          paymentMethod,
          categoryName: category.trim() || 'General',
          type: 'variable',
          notes: notes.trim() || undefined,
        });

        googleSheetsService.enqueueMutation(
          'Variable_Expenses',
          [
            createdExp.id,
            createdExp.date,
            createdExp.description,
            createdExp.categoryName || 'General',
            createdExp.amountPaise / 100,
            paymentMethod.replace('_', ' ').toUpperCase(),
            createdExp.notes || '',
          ],
          'append',
          `Variable_Expenses_append_${createdExp.id}`
        );
        playCashSound(settings?.soundEnabled);
        showToast('Expense logged & synchronized', 'success');
      } else if (activeType === 'income') {
        const createdInc = await api.createIncome({
          source: title.trim(),
          amountPaise: toPaise(amount),
          date: date || new Date().toISOString().split('T')[0],
          category: category.trim() || 'Salary',
          notes: notes.trim() || undefined,
        });

        googleSheetsService.enqueueMutation(
          'Income',
          [
            createdInc.id,
            createdInc.date,
            createdInc.source,
            createdInc.category,
            createdInc.amountPaise / 100,
            createdInc.notes || '',
          ],
          'append',
          `Income_append_${createdInc.id}`
        );
        playCashSound(settings?.soundEnabled);
        showToast('Income recorded & synchronized', 'success');
      } else if (activeType === 'bill') {
        const createdBill = await api.createBill({
          name: title.trim(),
          amountPaise: toPaise(amount),
          dueDate: date,
          categoryId: category.trim() || 'Bills & Utilities',
          status: 'UNPAID',
        });

        googleSheetsService.enqueueMutation(
          'Bills_Payments',
          [
            createdBill.id,
            createdBill.name,
            createdBill.amountPaise / 100,
            createdBill.dueDate,
            createdBill.categoryId,
            createdBill.status,
          ],
          'append',
          `Bills_append_${createdBill.id}`
        );
        showToast('Bill scheduled successfully', 'success');
      } else if (activeType === 'habit') {
        await api.createHabit({
          title: title.trim(),
          description: notes.trim() || undefined,
          frequency,
          category: category.trim() || 'General',
          targetDaysPerWeek: frequency === 'daily' ? 7 : 4,
          completedDates: [],
          bestStreakDays: 0,
        });
        showToast('Habit tracker entry created', 'success');
      } else if (activeType === 'envelope') {
        await api.createEnvelope({
          name: title.trim(),
          allocatedPaise: toPaise(amount),
          monthKey,
        });
        showToast('Budget envelope allocated', 'success');
      } else if (activeType === 'goal') {
        await api.createSavingsGoal({
          title: title.trim(),
          targetPaise: toPaise(amount),
          targetDate: date || null,
          color: '#10b981',
        });
        showToast('Savings goal established', 'success');
      }

      triggerRefresh();
      resetFields();
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Universal Quick Action Composer"
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        {/* Action Type Selector Tabs */}
        {!showConfirmStep && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--ff-surface-muted)] overflow-x-auto scrollbar-none">
            {ACTION_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-sm border border-[var(--ff-border-color)]'
                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Validation Error Banner */}
        {formError && (
          <div className="p-3 rounded-xl border border-[var(--ff-danger)]/30 bg-[var(--ff-danger-soft)] text-xs text-[var(--ff-danger)] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Step 1: Input Form */}
        {!showConfirmStep ? (
          <form onSubmit={handleProceedToConfirm} className="space-y-3.5">
            {/* Title / Description Field */}
            <div>
              <label htmlFor="quick-action-title" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                {activeType === 'expense'
                  ? 'Expense Description *'
                  : activeType === 'income'
                  ? 'Payer / Source Name *'
                  : activeType === 'bill'
                  ? 'Bill Name *'
                  : activeType === 'habit'
                  ? 'Habit Title *'
                  : activeType === 'envelope'
                  ? 'Budget Category / Name *'
                  : activeType === 'goal'
                  ? 'Savings Goal Target *'
                  : 'Task Title *'}
              </label>
              <input
                id="quick-action-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  activeType === 'expense'
                    ? 'e.g., Grocery shopping, AWS server bill'
                    : activeType === 'income'
                    ? 'e.g., Monthly salary, Client invoice'
                    : activeType === 'task'
                    ? 'e.g., Review quarter financial report'
                    : 'e.g., Daily meditation, Emergency fund'
                }
                className="ff-input w-full px-3 py-2 text-xs"
                autoFocus
              />
            </div>

            {/* Amount Field (For Financial entities) */}
            {['expense', 'income', 'bill', 'envelope', 'goal'].includes(activeType) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="quick-action-amount" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                    Amount ({currency}) *
                  </label>
                  <input
                    id="quick-action-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="ff-input w-full px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                {activeType === 'expense' && (
                  <div>
                    <label htmlFor="quick-action-payment" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                      Payment Method
                    </label>
                    <select
                      id="quick-action-payment"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="ff-input w-full px-3 py-2 text-xs"
                    >
                      <option value="upi_bank">UPI / Bank Transfer</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="debit_card">Debit Card</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                )}

                {activeType === 'envelope' && (
                  <div>
                    <label htmlFor="quick-action-month" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                      Budget Month
                    </label>
                    <input
                      id="quick-action-month"
                      type="month"
                      value={monthKey}
                      onChange={(e) => setMonthKey(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Task specific options */}
            {activeType === 'task' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                    Priority Level
                  </label>
                  <ThemeSegmentedControl<'low' | 'medium' | 'high'>
                    fullWidth
                    ariaLabel="Task priority"
                    value={priority}
                    onChange={setPriority}
                    options={[
                      { id: 'low', label: 'Low' },
                      { id: 'medium', label: 'Med' },
                      { id: 'high', label: 'High' },
                    ]}
                  />
                </div>

                <div>
                  <label htmlFor="quick-action-poms" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                    Estimated Pomodoros
                  </label>
                  <input
                    id="quick-action-poms"
                    type="number"
                    min="1"
                    max="10"
                    value={estimatedPomodoros}
                    onChange={(e) => setEstimatedPomodoros(e.target.value)}
                    className="ff-input w-full px-3 py-2 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Habit specific options */}
            {activeType === 'habit' && (
              <div>
                <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                  Schedule Rhythm
                </label>
                <ThemeSegmentedControl<'daily' | 'weekly'>
                  fullWidth
                  ariaLabel="Habit schedule"
                  value={frequency}
                  onChange={setFrequency}
                  options={[
                    { id: 'daily', label: 'Daily Habit (7 days/week)' },
                    { id: 'weekly', label: 'Weekly Habit (4+ days/week)' },
                  ]}
                />
              </div>
            )}

            {/* Date & Category Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="quick-action-date" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                  {activeType === 'bill' || activeType === 'task' || activeType === 'goal'
                    ? 'Due / Target Date'
                    : 'Transaction Date'}
                </label>
                <input
                  id="quick-action-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="ff-input w-full px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label htmlFor="quick-action-category" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                  Category Tag (Optional)
                </label>
                <input
                  id="quick-action-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Work, Health, Subscriptions"
                  className="ff-input w-full px-3 py-2 text-xs"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
              <ThemeButton variant="secondary" size="sm" type="button" onClick={onClose}>
                Cancel
              </ThemeButton>
              <ThemeButton variant="primary" size="sm" type="submit">
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </ThemeButton>
            </div>
          </form>
        ) : (
          /* Step 2: Confirmation Summary Card */
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--ff-border-color)]">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ff-accent-text)]">
                  Verify &amp; Confirm Submission
                </span>
                <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded bg-[var(--ff-surface-muted)]">
                  {activeType}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--ff-text-muted)]">Title / Description:</span>
                  <span className="font-bold text-[var(--ff-text-primary)]">{title}</span>
                </div>

                {amount && (
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Amount:</span>
                    <span className="font-mono font-bold text-[var(--ff-accent-text)]">
                      {formatCurrency(toPaise(amount))}
                    </span>
                  </div>
                )}

                {category && (
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Category:</span>
                    <span className="font-medium text-[var(--ff-text-primary)]">{category}</span>
                  </div>
                )}

                {date && (
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Date:</span>
                    <span className="font-mono text-[var(--ff-text-primary)]">{date}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
              <ThemeButton
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setShowConfirmStep(false)}
                disabled={loading}
              >
                Back to Edit
              </ThemeButton>
              <ThemeButton
                variant="primary"
                size="sm"
                type="button"
                onClick={handleFinalSubmit}
                loading={loading}
                loadingText="Saving &amp; Syncing..."
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm &amp; Save</span>
              </ThemeButton>
            </div>
          </div>
        )}
      </div>
    </ThemeModal>
  );
};
