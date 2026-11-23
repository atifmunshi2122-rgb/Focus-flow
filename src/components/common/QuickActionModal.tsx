import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import { getTodayDateString } from '../../lib/dateTime.ts';
import { playCashSound } from '../../lib/sound.ts';
import {
  Receipt,
  CreditCard,
  CheckSquare,
  Flame,
  Layers,
  Target,
  ArrowRight,
  Check,
  AlertCircle,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  X,
  Wallet,
} from 'lucide-react';
import { formatPaymentMethodLabel } from '../../lib/googleSheetsService.ts';
import { syncCoordinator } from '../../lib/syncCoordinator.ts';
import {
  ThemeButton,
  ThemeModal,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  PREDEFINED_EXPENSE_REASONS,
  getCustomExpenseReasons,
  saveCustomExpenseReason,
  removeCustomExpenseReason,
  resolveDefaultCategoryForReason,
} from '../../lib/expenseReasons.ts';
import type { ExpenseCategory, Bill } from '../../types/index.ts';

export type QuickActionType =
  | 'task'
  | 'expense'
  | 'income'
  | 'bill'
  | 'habit'
  | 'envelope'
  | 'goal';

export interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: QuickActionType;
  initialDate?: string;
  context?: 'global' | 'finance' | 'calendar';
}

// Global Quick Action shortcuts (all supported modules)
export const GLOBAL_ACTION_TABS: Array<{ id: QuickActionType; label: string; icon: any }> = [
  { id: 'task', label: 'Task', icon: CheckSquare },
  { id: 'expense', label: 'Expense', icon: Receipt },
  { id: 'income', label: 'Income', icon: CreditCard },
  { id: 'bill', label: 'Bill', icon: Calendar },
  { id: 'habit', label: 'Habit', icon: Flame },
  { id: 'envelope', label: 'Budget', icon: Layers },
  { id: 'goal', label: 'Savings', icon: Target },
];

// Finance contextual actions: ONLY finance transaction types (Expense, Income, Bill)
export const FINANCE_ACTION_TABS: Array<{ id: 'expense' | 'income' | 'bill'; label: string; icon: any }> = [
  { id: 'expense', label: 'Expense', icon: Receipt },
  { id: 'income', label: 'Income', icon: CreditCard },
  { id: 'bill', label: 'Bill / Payment', icon: Calendar },
];

// Calendar contextual actions: Calendar-centric creation tabs
export const CALENDAR_ACTION_TABS: Array<{ id: QuickActionType; label: string; icon: any }> = [
  { id: 'expense', label: 'Expense', icon: Receipt },
  { id: 'income', label: 'Income', icon: CreditCard },
  { id: 'task', label: 'Task', icon: CheckSquare },
  { id: 'bill', label: 'Bill', icon: Calendar },
  { id: 'habit', label: 'Habit', icon: Flame },
  { id: 'envelope', label: 'Budget', icon: Layers },
  { id: 'goal', label: 'Savings', icon: Target },
];

export interface ExpenseSessionEntry {
  id: string;
  reason: string;
  amount: string;
  category?: string;
  notes?: string;
}

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  onClose,
  initialType,
  initialDate,
  context = 'global',
}) => {
  const { showToast, triggerRefresh, currency, settings } = useApp();

  const isFinanceContext = context === 'finance';
  const isCalendarContext = context === 'calendar';
  const availableTabs = isFinanceContext
    ? FINANCE_ACTION_TABS
    : isCalendarContext
    ? CALENDAR_ACTION_TABS
    : GLOBAL_ACTION_TABS;

  // Resolve safe initial type based on context
  const safeInitialType: QuickActionType = useMemo(() => {
    if (isFinanceContext) {
      if (initialType === 'income' || initialType === 'bill') return initialType;
      return 'expense';
    }
    if (isCalendarContext) {
      if (initialType && CALENDAR_ACTION_TABS.some((tab) => tab.id === initialType)) {
        return initialType;
      }
      return 'expense';
    }
    if (initialType && GLOBAL_ACTION_TABS.some((tab) => tab.id === initialType)) {
      return initialType;
    }
    return 'task';
  }, [initialType, isFinanceContext, isCalendarContext]);

  const [activeType, setActiveType] = useState<QuickActionType>(safeInitialType);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirmStep, setShowConfirmStep] = useState(false);

  // Common date & payment states
  const [date, setDate] = useState<string>(
    () => initialDate || getTodayDateString()
  );
  const [paymentMethod, setPaymentMethod] = useState<
    'credit_card' | 'debit_card' | 'upi_bank' | 'cash'
  >('upi_bank');

  // Daily Expense Manager states (multiple entries in one session)
  const [expenseEntries, setExpenseEntries] = useState<ExpenseSessionEntry[]>([]);
  const [selectedReason, setSelectedReason] = useState<string>('Breakfast');
  const [isCustomReason, setIsCustomReason] = useState(false);
  const [customReasonInput, setCustomReasonInput] = useState('');
  const [saveCustomForFuture, setSaveCustomForFuture] = useState(true);
  const [savedCustomReasons, setSavedCustomReasons] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<ExpenseCategory[]>([]);
  const [currentAmount, setCurrentAmount] = useState('');
  const [currentCategory, setCurrentCategory] = useState('Food & Dining');
  const [currentNotes, setCurrentNotes] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Income specific states
  const [incomeSource, setIncomeSource] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCategory, setIncomeCategory] = useState('Salary');
  const [incomeNotes, setIncomeNotes] = useState('');

  // Bill specific states
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDate, setBillDueDate] = useState(() => getTodayDateString());
  const [billCategory, setBillCategory] = useState('Bills & Utilities');

  // Task specific states
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskPoms, setTaskPoms] = useState('2');
  const [taskCategory, setTaskCategory] = useState('');

  // Habit specific states
  const [habitTitle, setHabitTitle] = useState('');
  const [habitFrequency, setHabitFrequency] = useState<'daily' | 'weekly'>('daily');
  const [habitCategory, setHabitCategory] = useState('General');
  const [habitNotes, setHabitNotes] = useState('');

  // Budget envelope specific states
  const [envelopeName, setEnvelopeName] = useState('');
  const [envelopeAmount, setEnvelopeAmount] = useState('');
  const [envelopeMonthKey, setEnvelopeMonthKey] = useState(() => new Date().toISOString().slice(0, 7));

  // Savings goal specific states
  const [goalTitle, setGoalTitle] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('');

  // Load custom reasons from localStorage
  const refreshCustomReasons = () => {
    setSavedCustomReasons(getCustomExpenseReasons());
  };

  useEffect(() => {
    if (isOpen) {
      setActiveType(safeInitialType);
      resetFields();
      refreshCustomReasons();
      api.getCategories().then(setAvailableCategories).catch(console.error);
      if (initialDate) {
        setDate(initialDate);
        setBillDueDate(initialDate);
      }
    }
  }, [isOpen, safeInitialType, initialDate]);

  const resetFields = () => {
    const today = initialDate || getTodayDateString();
    setDate(today);
    setPaymentMethod('upi_bank');
    setExpenseEntries([]);
    setSelectedReason('Breakfast');
    setIsCustomReason(false);
    setCustomReasonInput('');
    setSaveCustomForFuture(true);
    setCurrentAmount('');
    setCurrentCategory('Food & Dining');
    setCurrentNotes('');
    setEditingEntryId(null);

    setIncomeSource('');
    setIncomeAmount('');
    setIncomeCategory('Salary');
    setIncomeNotes('');

    setBillName('');
    setBillAmount('');
    setBillDueDate(today);
    setBillCategory('Bills & Utilities');

    setTaskTitle('');
    setTaskPriority('medium');
    setTaskPoms('2');
    setTaskCategory('');

    setHabitTitle('');
    setHabitFrequency('daily');
    setHabitCategory('General');
    setHabitNotes('');

    setEnvelopeName('');
    setEnvelopeAmount('');
    setEnvelopeMonthKey(new Date().toISOString().slice(0, 7));

    setGoalTitle('');
    setGoalAmount('');
    setGoalTargetDate('');

    setFormError(null);
    setShowConfirmStep(false);
  };

  const handleTabChange = (nextType: QuickActionType) => {
    setActiveType(nextType);
    setFormError(null);
    setShowConfirmStep(false);
  };

  // Quick select a reason
  const handleSelectReason = (reasonLabel: string) => {
    setIsCustomReason(false);
    setSelectedReason(reasonLabel);
    setCurrentCategory(resolveDefaultCategoryForReason(reasonLabel));
    setFormError(null);
  };

  const handleSelectCustomReasonOption = () => {
    setIsCustomReason(true);
    setSelectedReason('Custom');
    setCurrentCategory('General');
    setFormError(null);
  };

  const handleDeleteCustomReason = (r: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = removeCustomExpenseReason(r);
    setSavedCustomReasons(updated);
    if (selectedReason === r) {
      handleSelectReason('Breakfast');
    }
  };

  // Calculate actual total from session entries
  const sessionTotalPaise = useMemo(() => {
    return expenseEntries.reduce((acc, item) => acc + toPaise(item.amount), 0);
  }, [expenseEntries]);

  // Add current entry to the daily session list
  const handleAddOrUpdateEntry = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    const effectiveReason = isCustomReason
      ? customReasonInput.trim()
      : selectedReason.trim();

    if (!effectiveReason) {
      setFormError('Please select or specify an expense reason.');
      return false;
    }

    const numAmount = Number(currentAmount);
    if (!currentAmount || isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid positive numerical amount for this expense.');
      return false;
    }

    // Persist custom reason if requested
    if (isCustomReason && saveCustomForFuture && customReasonInput.trim()) {
      saveCustomExpenseReason(customReasonInput.trim());
      refreshCustomReasons();
    }

    if (editingEntryId) {
      // Update existing entry
      setExpenseEntries((prev) =>
        prev.map((item) =>
          item.id === editingEntryId
            ? {
                ...item,
                reason: effectiveReason,
                amount: currentAmount,
                category: currentCategory.trim() || resolveDefaultCategoryForReason(effectiveReason),
                notes: currentNotes.trim() || undefined,
              }
            : item
        )
      );
      setEditingEntryId(null);
      showToast('Expense entry updated', 'info');
    } else {
      // Add new entry
      const newEntry: ExpenseSessionEntry = {
        id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        reason: effectiveReason,
        amount: currentAmount,
        category: currentCategory.trim() || resolveDefaultCategoryForReason(effectiveReason),
        notes: currentNotes.trim() || undefined,
      };
      setExpenseEntries((prev) => [...prev, newEntry]);
    }

    // Reset entry inputs for next entry
    setCurrentAmount('');
    setCurrentNotes('');
    setCustomReasonInput('');
    setIsCustomReason(false);
    setSelectedReason('Breakfast');
    setCurrentCategory('Food & Dining');
    return true;
  };

  const handleEditEntry = (entry: ExpenseSessionEntry) => {
    setEditingEntryId(entry.id);
    setCurrentAmount(entry.amount);
    setCurrentCategory(entry.category || resolveDefaultCategoryForReason(entry.reason));
    setCurrentNotes(entry.notes || '');

    const isPredefined = PREDEFINED_EXPENSE_REASONS.some(
      (p) => p.label.toLowerCase() === entry.reason.toLowerCase()
    );
    const isSavedCustom = savedCustomReasons.some(
      (c) => c.toLowerCase() === entry.reason.toLowerCase()
    );

    if (isPredefined || isSavedCustom) {
      setIsCustomReason(false);
      setSelectedReason(entry.reason);
    } else {
      setIsCustomReason(true);
      setSelectedReason('Custom');
      setCustomReasonInput(entry.reason);
    }
  };

  const handleDeleteEntry = (id: string) => {
    setExpenseEntries((prev) => prev.filter((item) => item.id !== id));
    if (editingEntryId === id) {
      setEditingEntryId(null);
      setCurrentAmount('');
      setCurrentNotes('');
      setCustomReasonInput('');
      setIsCustomReason(false);
    }
  };

  // Review & Confirm Submission
  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (activeType === 'expense') {
      if (expenseEntries.length === 0) {
        const added = handleAddOrUpdateEntry();
        if (!added) return;
      }
      setShowConfirmStep(true);
    } else if (activeType === 'income') {
      if (!incomeSource.trim()) {
        setFormError('Please enter a valid income source or payer name.');
        return;
      }
      const numAmount = Number(incomeAmount);
      if (!incomeAmount || isNaN(numAmount) || numAmount <= 0) {
        setFormError('Please enter a valid positive numerical income amount.');
        return;
      }
      setShowConfirmStep(true);
    } else if (activeType === 'bill') {
      if (!billName.trim()) {
        setFormError('Please enter a bill name.');
        return;
      }
      const numAmount = Number(billAmount);
      if (!billAmount || isNaN(numAmount) || numAmount <= 0) {
        setFormError('Please enter a valid positive bill amount.');
        return;
      }
      setShowConfirmStep(true);
    } else if (activeType === 'task') {
      if (!taskTitle.trim()) {
        setFormError('Please enter a task title.');
        return;
      }
      setShowConfirmStep(true);
    } else if (activeType === 'habit') {
      if (!habitTitle.trim()) {
        setFormError('Please enter a habit title.');
        return;
      }
      setShowConfirmStep(true);
    } else if (activeType === 'envelope') {
      if (!envelopeName.trim()) {
        setFormError('Please enter a budget category name.');
        return;
      }
      const numAmount = Number(envelopeAmount);
      if (!envelopeAmount || isNaN(numAmount) || numAmount <= 0) {
        setFormError('Please enter a valid allocated amount.');
        return;
      }
      setShowConfirmStep(true);
    } else if (activeType === 'goal') {
      if (!goalTitle.trim()) {
        setFormError('Please enter a savings goal target title.');
        return;
      }
      const numAmount = Number(goalAmount);
      if (!goalAmount || isNaN(numAmount) || numAmount <= 0) {
        setFormError('Please enter a valid target amount.');
        return;
      }
      setShowConfirmStep(true);
    }
  };

  // Final Execution
  const handleFinalSubmit = async () => {
    setLoading(true);
    setFormError(null);

    try {
      if (activeType === 'expense') {
        let entriesToSave = [...expenseEntries];
        if (currentAmount && Number(currentAmount) > 0) {
          const effectiveReason = isCustomReason
            ? customReasonInput.trim() || 'General Expense'
            : selectedReason;
          entriesToSave.push({
            id: `temp_${Date.now()}`,
            reason: effectiveReason,
            amount: currentAmount,
            category: currentCategory || resolveDefaultCategoryForReason(effectiveReason),
            notes: currentNotes.trim() || undefined,
          });
        }

        if (entriesToSave.length === 0) {
          setFormError('No expenses to save. Please add at least one valid expense entry.');
          setLoading(false);
          return;
        }

        let totalSavedPaise = 0;
        for (const item of entriesToSave) {
          const itemAmountPaise = toPaise(item.amount);
          totalSavedPaise += itemAmountPaise;

          const rawCategory = item.category || resolveDefaultCategoryForReason(item.reason);
          const matchedCategory =
            availableCategories.find((c) => c.name.toLowerCase() === rawCategory.trim().toLowerCase()) ||
            availableCategories.find(
              (c) =>
                c.name.toLowerCase().includes(rawCategory.trim().toLowerCase()) ||
                rawCategory.trim().toLowerCase().includes(c.name.toLowerCase())
            );

          const resolvedCategoryId = matchedCategory ? matchedCategory.id : undefined;
          const resolvedCategoryName = matchedCategory ? matchedCategory.name : rawCategory;

          const createdExp = await api.createExpense({
            description: item.reason.trim(),
            amountPaise: itemAmountPaise,
            date: date || getTodayDateString(),
            paymentMethod,
            categoryId: resolvedCategoryId,
            categoryName: resolvedCategoryName,
            type: 'variable',
            notes: item.notes?.trim() || undefined,
          });

          await syncCoordinator.syncMutation(
            'Variable_Expenses',
            [
              createdExp.id,
              createdExp.date,
              createdExp.description,
              createdExp.categoryName || resolvedCategoryName || 'General',
              createdExp.amountPaise / 100,
              formatPaymentMethodLabel(paymentMethod, true),
              createdExp.notes || '',
            ],
            'append',
            `Variable_Expenses_append_${createdExp.id}`
          );
        }

        playCashSound(settings?.soundEnabled);
        const count = entriesToSave.length;
        showToast(
          count === 1
            ? `Expense logged & synchronized (${formatCurrency(totalSavedPaise, currency)})`
            : `${count} daily expenses logged & synchronized (${formatCurrency(totalSavedPaise, currency)})`,
          'success'
        );
      } else if (activeType === 'income') {
        const itemAmountPaise = toPaise(incomeAmount);
        const createdInc = await api.createIncome({
          source: incomeSource.trim(),
          amountPaise: itemAmountPaise,
          date: date || getTodayDateString(),
          category: incomeCategory.trim() || 'Salary',
          notes: incomeNotes.trim() || undefined,
        });

        await syncCoordinator.syncMutation(
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
        showToast(`Income recorded & synchronized (${formatCurrency(itemAmountPaise, currency)})`, 'success');
      } else if (activeType === 'bill') {
        const itemAmountPaise = toPaise(billAmount);
        const rawBillCategory = billCategory.trim();
        const matchedCategory =
          availableCategories.find((c) => c.id === rawBillCategory) ||
          availableCategories.find((c) => c.name.toLowerCase() === rawBillCategory.toLowerCase()) ||
          availableCategories.find(
            (c) =>
              c.name.toLowerCase().includes(rawBillCategory.toLowerCase()) ||
              rawBillCategory.toLowerCase().includes(c.name.toLowerCase())
          );

        const resolvedCategoryId =
          matchedCategory?.id ||
          availableCategories.find(
            (c) => c.name.toLowerCase().includes('bill') || c.name.toLowerCase().includes('util')
          )?.id ||
          availableCategories.find((c) => c.type === 'fixed')?.id ||
          availableCategories[0]?.id ||
          'cat_util';

        const resolvedCategoryName = matchedCategory
          ? matchedCategory.name
          : rawBillCategory || 'Bills & Utilities';

        const createdBill = await api.createBill({
          name: billName.trim(),
          amountPaise: itemAmountPaise,
          dueDate: billDueDate || date,
          categoryId: resolvedCategoryId,
          status: 'UNPAID',
          categoryName: resolvedCategoryName,
        } as unknown as Partial<Bill>);

        await syncCoordinator.syncMutation(
          'Bills_Payments',
          [
            createdBill.id,
            createdBill.dueDate,
            createdBill.name,
            resolvedCategoryName,
            createdBill.amountPaise / 100,
            'UNPAID',
            '',
            '—',
            createdBill.notes || '',
          ],
          'append',
          `Bills_Payments_append_${createdBill.id}`
        );
        showToast('Bill scheduled & synchronized', 'success');
      } else if (activeType === 'task') {
        const createdTask = await api.createTask({
          title: taskTitle.trim(),
          priority: taskPriority,
          estimatedPomodoros: Number(taskPoms) || 1,
          dueDate: date || null,
          category: taskCategory.trim() || undefined,
        });

        await syncCoordinator.syncMutation(
          'Tasks',
          [
            createdTask.id,
            createdTask.title,
            createdTask.priority,
            createdTask.status,
            createdTask.estimatedPomodoros,
            createdTask.completedPomodoros,
            createdTask.dueDate || '',
            createdTask.category || 'General',
            createdTask.recurrence || 'none',
            createdTask.createdAt,
          ],
          'append',
          `Tasks_append_${createdTask.id}`
        );
        showToast('Task created & synchronized', 'success');
      } else if (activeType === 'habit') {
        await api.createHabit({
          title: habitTitle.trim(),
          description: habitNotes.trim() || undefined,
          frequency: habitFrequency,
          category: habitCategory.trim() || 'General',
          targetDaysPerWeek: habitFrequency === 'daily' ? 7 : 4,
          completedDates: [],
          bestStreakDays: 0,
        });
        showToast('Habit tracker entry created', 'success');
      } else if (activeType === 'envelope') {
        await api.createEnvelope({
          name: envelopeName.trim(),
          allocatedPaise: toPaise(envelopeAmount),
          monthKey: envelopeMonthKey,
        });
        showToast('Budget envelope allocated', 'success');
      } else if (activeType === 'goal') {
        const targetNum = Number(goalAmount);
        const createdGoal = await api.createSavingsGoal({
          title: goalTitle.trim(),
          targetPaise: toPaise(targetNum),
          targetDate: goalTargetDate || null,
          color: '#10b981',
        });
        await syncCoordinator.syncMutation(
          'Savings_Goals',
          [
            createdGoal.id,
            createdGoal.title,
            createdGoal.targetPaise / 100,
            createdGoal.savedPaise / 100,
            Math.max(0, (createdGoal.targetPaise - createdGoal.savedPaise) / 100),
            createdGoal.targetDate || 'No Deadline',
            createdGoal.targetPaise > 0
              ? `${Math.round((createdGoal.savedPaise / createdGoal.targetPaise) * 100)}%`
              : '0%',
            'Active',
          ],
          'append',
          `Savings_Goals_append_${createdGoal.id}`
        );
        showToast('Savings goal established & synchronized', 'success');
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

  const modalTitle = isFinanceContext
    ? 'Add Transaction'
    : isCalendarContext
    ? (initialDate ? `Add to Date: ${initialDate}` : 'Calendar Quick Action')
    : 'Universal Quick Action Composer';

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Action Type Selector Tabs */}
        {!showConfirmStep && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--ff-surface-muted)] overflow-x-auto scrollbar-none">
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id as QuickActionType)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-sm border border-[var(--ff-border-color)]'
                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
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

        {/* STEP 1: FORM INPUT */}
        {!showConfirmStep ? (
          <div>
            {/* === 1. EXPENSE FLOW (Enhanced Daily Expense Manager with Multi-Entry) === */}
            {activeType === 'expense' && (
              <div className="space-y-4">
                {/* Date & Payment Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--ff-surface-muted)]/50 border border-[var(--ff-border-color)]">
                  <div>
                    <label
                      htmlFor="expense-date"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1 flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                      <span>Date (Backdateable) *</span>
                    </label>
                    <input
                      id="expense-date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="ff-input w-full px-3 py-1.5 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="expense-payment-method"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1 flex items-center gap-1.5"
                    >
                      <Wallet className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                      <span>Payment Method</span>
                    </label>
                    <select
                      id="expense-payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="ff-input w-full px-3 py-1.5 text-xs"
                    >
                      <option value="upi_bank">UPI / Bank Transfer</option>
                      <option value="cash">Cash</option>
                      <option value="debit_card">Debit Card</option>
                      <option value="credit_card">Credit Card</option>
                    </select>
                  </div>
                </div>

                {/* Daily Item Composer Card */}
                <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-[var(--ff-danger)]" />
                      <span>
                        {editingEntryId ? 'Edit Expense Entry' : 'Daily Expense Entry'}
                      </span>
                    </span>
                    <span className="text-[11px] text-[var(--ff-text-muted)]">
                      Pick a reason or tap custom
                    </span>
                  </div>

                  {/* Predefined & Saved Custom Reason Chips */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-medium text-[var(--ff-text-muted)]">
                      Select Expense Reason / Category:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {PREDEFINED_EXPENSE_REASONS.map((r) => {
                        const isSelected = !isCustomReason && selectedReason === r.label;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => handleSelectReason(r.label)}
                            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition-all ${
                              isSelected
                                ? 'bg-[var(--ff-accent)] text-white shadow-sm font-semibold'
                                : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-border-color)]'
                            }`}
                          >
                            <span>{r.icon}</span>
                            <span>{r.label}</span>
                          </button>
                        );
                      })}

                      {/* Saved Custom Reasons */}
                      {savedCustomReasons.map((customName) => {
                        const isSelected = !isCustomReason && selectedReason === customName;
                        return (
                          <button
                            key={customName}
                            type="button"
                            onClick={() => handleSelectReason(customName)}
                            className={`group flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition-all ${
                              isSelected
                                ? 'bg-[var(--ff-accent)] text-white shadow-sm font-semibold'
                                : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-border-color)]'
                            }`}
                          >
                            <span>🏷️</span>
                            <span>{customName}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Remove saved reason ${customName}`}
                              onClick={(e) => handleDeleteCustomReason(customName, e)}
                              className="ml-0.5 hover:text-red-300 transition-colors p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </span>
                          </button>
                        );
                      })}

                      {/* Add Custom Reason Option */}
                      <button
                        type="button"
                        onClick={handleSelectCustomReasonOption}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition-all border ${
                          isCustomReason
                            ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] font-semibold'
                            : 'border-dashed border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                        }`}
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Custom Reason</span>
                      </button>
                    </div>
                  </div>

                  {/* Custom Reason Input */}
                  {isCustomReason && (
                    <div className="p-2.5 rounded-lg bg-[var(--ff-surface-muted)] space-y-2 border border-[var(--ff-border-color)]">
                      <div>
                        <label
                          htmlFor="custom-reason-input"
                          className="block text-[11px] font-semibold text-[var(--ff-text-secondary)] mb-1"
                        >
                          Custom Expense Reason *
                        </label>
                        <input
                          id="custom-reason-input"
                          type="text"
                          required
                          value={customReasonInput}
                          onChange={(e) => setCustomReasonInput(e.target.value)}
                          placeholder="e.g., Medicine, Library Fee, Auto Fare, Snacks Box"
                          className="ff-input w-full px-3 py-1.5 text-xs"
                          autoFocus
                        />
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-[var(--ff-text-muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveCustomForFuture}
                          onChange={(e) => setSaveCustomForFuture(e.target.checked)}
                          className="rounded border-[var(--ff-border-color)] text-[var(--ff-accent)]"
                        />
                        <span>Save this custom reason for future one-tap reuse</span>
                      </label>
                    </div>
                  )}

                  {/* Amount and Category Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="expense-amount-input"
                        className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                      >
                        Amount ({currency}) *
                      </label>
                      <input
                        id="expense-amount-input"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={currentAmount}
                        onChange={(e) => setCurrentAmount(e.target.value)}
                        placeholder="0.00"
                        className="ff-input w-full px-3 py-2 text-xs font-mono font-bold"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddOrUpdateEntry();
                          }
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="expense-category-input"
                        className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                      >
                        Category Tag
                      </label>
                      <input
                        id="expense-category-input"
                        type="text"
                        value={currentCategory}
                        onChange={(e) => setCurrentCategory(e.target.value)}
                        placeholder="e.g., Food & Dining, Transportation"
                        className="ff-input w-full px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  {/* Optional Note */}
                  <div>
                    <label
                      htmlFor="expense-note-input"
                      className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                    >
                      Note / Description (Optional)
                    </label>
                    <input
                      id="expense-note-input"
                      type="text"
                      value={currentNotes}
                      onChange={(e) => setCurrentNotes(e.target.value)}
                      placeholder="e.g., Office cafeteria, Uber to airport"
                      className="ff-input w-full px-3 py-1.5 text-xs"
                    />
                  </div>

                  {/* Add Entry Action Buttons */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-[var(--ff-text-muted)]">
                      Tip: Press Enter in the amount box to add quickly
                    </span>
                    <div className="flex items-center gap-2">
                      {editingEntryId && (
                        <ThemeButton
                          variant="secondary"
                          size="xs"
                          type="button"
                          onClick={() => {
                            setEditingEntryId(null);
                            setCurrentAmount('');
                            setCurrentNotes('');
                            setIsCustomReason(false);
                          }}
                        >
                          Cancel Edit
                        </ThemeButton>
                      )}
                      <ThemeButton
                        variant="secondary"
                        size="xs"
                        type="button"
                        onClick={() => handleAddOrUpdateEntry()}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {editingEntryId ? 'Update Entry' : '+ Add Another Expense'}
                        </span>
                      </ThemeButton>
                    </div>
                  </div>
                </div>

                {/* Session Entries List / Review Before Saving */}
                {expenseEntries.length > 0 && (
                  <div className="space-y-2 p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
                    <div className="flex items-center justify-between pb-1.5 border-b border-[var(--ff-border-color)]">
                      <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                        Daily Entries on {date} ({expenseEntries.length})
                      </span>
                      <span className="text-xs font-mono font-bold text-[var(--ff-danger)]">
                        Total: {formatCurrency(sessionTotalPaise, currency)}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin divide-y divide-[var(--ff-border-color)]/40">
                      {expenseEntries.map((item, idx) => (
                        <div
                          key={item.id}
                          className="pt-1.5 pb-1 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-[var(--ff-danger-soft)] text-[var(--ff-danger)] text-[11px] font-bold">
                              {idx + 1}
                            </span>
                            <div className="truncate">
                              <span className="font-semibold text-[var(--ff-text-primary)]">
                                {item.reason}
                              </span>
                              {item.notes && (
                                <span className="ml-1.5 text-[11px] text-[var(--ff-text-muted)] truncate">
                                  ({item.notes})
                                </span>
                              )}
                              <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                                {item.category || 'General'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-[var(--ff-danger)]">
                              {formatCurrency(toPaise(item.amount), currency)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleEditEntry(item)}
                              aria-label={`Edit ${item.reason}`}
                              className="p-1 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(item.id)}
                              aria-label={`Delete ${item.reason}`}
                              className="p-1 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Action Footer for Expense */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--ff-border-color)]">
                  <ThemeButton variant="secondary" size="sm" type="button" onClick={onClose}>
                    Cancel
                  </ThemeButton>

                  <ThemeButton
                    variant="primary"
                    size="sm"
                    type="button"
                    onClick={handleProceedToConfirm}
                  >
                    <span>
                      {expenseEntries.length > 0 || (currentAmount && Number(currentAmount) > 0)
                        ? `Review & Save (${formatCurrency(
                            sessionTotalPaise +
                              (currentAmount && Number(currentAmount) > 0
                                ? toPaise(currentAmount)
                                : 0),
                            currency
                          )})`
                        : 'Continue'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </ThemeButton>
                </div>
              </div>
            )}

            {/* === 2. INCOME FLOW (Simple, Separate, No Meal Options) === */}
            {activeType === 'income' && (
              <form onSubmit={handleProceedToConfirm} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="income-source-input"
                    className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                  >
                    Payer / Income Source Name *
                  </label>
                  <input
                    id="income-source-input"
                    type="text"
                    required
                    value={incomeSource}
                    onChange={(e) => setIncomeSource(e.target.value)}
                    placeholder="e.g., Monthly Salary, Freelance Client, Dividend, Consulting"
                    className="ff-input w-full px-3 py-2 text-xs"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="income-amount-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Amount ({currency}) *
                    </label>
                    <input
                      id="income-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={incomeAmount}
                      onChange={(e) => setIncomeAmount(e.target.value)}
                      placeholder="0.00"
                      className="ff-input w-full px-3 py-2 text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="income-date-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Credit Date *
                    </label>
                    <input
                      id="income-date-input"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="income-category-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Income Category
                    </label>
                    <select
                      id="income-category-input"
                      value={incomeCategory}
                      onChange={(e) => setIncomeCategory(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs"
                    >
                      <option value="Salary">Salary / Primary Job</option>
                      <option value="Freelance">Freelance / Gig Work</option>
                      <option value="Investments">Investments / Dividends</option>
                      <option value="Business">Business / Sales</option>
                      <option value="Rental">Rental Income</option>
                      <option value="Gift">Gift / Bonus</option>
                      <option value="Other">Other Inflow</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="income-notes-input"
                      className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                    >
                      Notes (Optional)
                    </label>
                    <input
                      id="income-notes-input"
                      type="text"
                      value={incomeNotes}
                      onChange={(e) => setIncomeNotes(e.target.value)}
                      placeholder="e.g., Transfer to bank account"
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                </div>

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
            )}

            {/* === 3. BILL / PAYMENT FLOW === */}
            {activeType === 'bill' && (
              <form onSubmit={handleProceedToConfirm} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="bill-name-input"
                    className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                  >
                    Bill / Payment Name *
                  </label>
                  <input
                    id="bill-name-input"
                    type="text"
                    required
                    value={billName}
                    onChange={(e) => setBillName(e.target.value)}
                    placeholder="e.g., Electricity Bill, Internet, Netflix, Rent"
                    className="ff-input w-full px-3 py-2 text-xs"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="bill-amount-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Amount ({currency}) *
                    </label>
                    <input
                      id="bill-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={billAmount}
                      onChange={(e) => setBillAmount(e.target.value)}
                      placeholder="0.00"
                      className="ff-input w-full px-3 py-2 text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bill-due-date-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Due Date *
                    </label>
                    <input
                      id="bill-due-date-input"
                      type="date"
                      required
                      value={billDueDate}
                      onChange={(e) => setBillDueDate(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="bill-category-input"
                    className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                  >
                    Category
                  </label>
                  {availableCategories.length > 0 ? (
                    <select
                      id="bill-category-input"
                      value={billCategory}
                      onChange={(e) => setBillCategory(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs"
                    >
                      {availableCategories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name} ({cat.type})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="bill-category-input"
                      type="text"
                      value={billCategory}
                      onChange={(e) => setBillCategory(e.target.value)}
                      placeholder="e.g., Bills & Utilities, Housing, Subscriptions"
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  )}
                </div>

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
            )}

            {/* === 4. TASK FLOW (Global Quick Action) === */}
            {activeType === 'task' && (
              <form onSubmit={handleProceedToConfirm} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="task-title-input"
                    className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                  >
                    Task Title *
                  </label>
                  <input
                    id="task-title-input"
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g., Review quarter financial report, Deploy production patch"
                    className="ff-input w-full px-3 py-2 text-xs"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                      Priority Level
                    </label>
                    <ThemeSegmentedControl<'low' | 'medium' | 'high'>
                      fullWidth
                      ariaLabel="Task priority"
                      value={taskPriority}
                      onChange={setTaskPriority}
                      options={[
                        { id: 'low', label: 'Low' },
                        { id: 'medium', label: 'Med' },
                        { id: 'high', label: 'High' },
                      ]}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="task-poms-input"
                      className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                    >
                      Estimated Pomodoros
                    </label>
                    <input
                      id="task-poms-input"
                      type="number"
                      min="1"
                      max="10"
                      value={taskPoms}
                      onChange={(e) => setTaskPoms(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="task-due-date"
                      className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                    >
                      Due Date
                    </label>
                    <input
                      id="task-due-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="task-category-tag"
                      className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                    >
                      Category Tag (Optional)
                    </label>
                    <input
                      id="task-category-tag"
                      type="text"
                      value={taskCategory}
                      onChange={(e) => setTaskCategory(e.target.value)}
                      placeholder="e.g., Work, Study, Project"
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                </div>

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
            )}

            {/* === 5. HABIT FLOW (Global Quick Action) === */}
            {activeType === 'habit' && (
              <form onSubmit={handleProceedToConfirm} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="habit-title-input"
                    className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                  >
                    Habit Title *
                  </label>
                  <input
                    id="habit-title-input"
                    type="text"
                    required
                    value={habitTitle}
                    onChange={(e) => setHabitTitle(e.target.value)}
                    placeholder="e.g., Read 20 pages, Morning Run, Daily Meditation"
                    className="ff-input w-full px-3 py-2 text-xs"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                    Schedule Rhythm
                  </label>
                  <ThemeSegmentedControl<'daily' | 'weekly'>
                    fullWidth
                    ariaLabel="Habit schedule"
                    value={habitFrequency}
                    onChange={setHabitFrequency}
                    options={[
                      { id: 'daily', label: 'Daily Habit (7 days/week)' },
                      { id: 'weekly', label: 'Weekly Habit (4+ days/week)' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="habit-cat-input"
                      className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                    >
                      Category
                    </label>
                    <input
                      id="habit-cat-input"
                      type="text"
                      value={habitCategory}
                      onChange={(e) => setHabitCategory(e.target.value)}
                      placeholder="e.g., Health, Learning, Mindset"
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="habit-notes-input"
                      className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                    >
                      Notes (Optional)
                    </label>
                    <input
                      id="habit-notes-input"
                      type="text"
                      value={habitNotes}
                      onChange={(e) => setHabitNotes(e.target.value)}
                      placeholder="e.g., Before breakfast"
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                </div>

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
            )}

            {/* === 6. BUDGET ENVELOPE FLOW (Global Quick Action) === */}
            {activeType === 'envelope' && (
              <form onSubmit={handleProceedToConfirm} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="env-name-input"
                    className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                  >
                    Budget Category / Name *
                  </label>
                  <input
                    id="env-name-input"
                    type="text"
                    required
                    value={envelopeName}
                    onChange={(e) => setEnvelopeName(e.target.value)}
                    placeholder="e.g., Dining Out, Tech Gadgets, Utilities"
                    className="ff-input w-full px-3 py-2 text-xs"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="env-amount-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Allocated Amount ({currency}) *
                    </label>
                    <input
                      id="env-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={envelopeAmount}
                      onChange={(e) => setEnvelopeAmount(e.target.value)}
                      placeholder="0.00"
                      className="ff-input w-full px-3 py-2 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="env-month-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Budget Month
                    </label>
                    <input
                      id="env-month-input"
                      type="month"
                      value={envelopeMonthKey}
                      onChange={(e) => setEnvelopeMonthKey(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs"
                    />
                  </div>
                </div>

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
            )}

            {/* === 7. SAVINGS GOAL FLOW (Global Quick Action) === */}
            {activeType === 'goal' && (
              <form onSubmit={handleProceedToConfirm} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="goal-title-input"
                    className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                  >
                    Savings Goal Target *
                  </label>
                  <input
                    id="goal-title-input"
                    type="text"
                    required
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="e.g., Emergency Fund, New Laptop, Japan Trip"
                    className="ff-input w-full px-3 py-2 text-xs"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="goal-amount-input"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Target Goal Amount ({currency}) *
                    </label>
                    <input
                      id="goal-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={goalAmount}
                      onChange={(e) => setGoalAmount(e.target.value)}
                      placeholder="0.00"
                      className="ff-input w-full px-3 py-2 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="goal-target-date"
                      className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1"
                    >
                      Target Date (Optional)
                    </label>
                    <input
                      id="goal-target-date"
                      type="date"
                      value={goalTargetDate}
                      onChange={(e) => setGoalTargetDate(e.target.value)}
                      className="ff-input w-full px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>

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
            )}
          </div>
        ) : (
          /* STEP 2: CONFIRMATION SUMMARY CARD */
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

              {activeType === 'expense' && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Target Date:</span>
                    <span className="font-mono text-[var(--ff-text-primary)] font-bold">{date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Payment Method:</span>
                    <span className="capitalize text-[var(--ff-text-primary)]">
                      {paymentMethod.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[var(--ff-border-color)] space-y-1">
                    <span className="text-[11px] font-bold text-[var(--ff-text-secondary)]">
                      Entries to record:
                    </span>
                    {expenseEntries.map((item, idx) => (
                      <div key={item.id} className="flex justify-between py-0.5 text-xs">
                        <span className="text-[var(--ff-text-primary)]">
                          {idx + 1}. {item.reason} {item.notes ? `(${item.notes})` : ''}
                        </span>
                        <span className="font-mono font-bold text-[var(--ff-danger)]">
                          {formatCurrency(toPaise(item.amount), currency)}
                        </span>
                      </div>
                    ))}
                    {currentAmount && Number(currentAmount) > 0 && (
                      <div className="flex justify-between py-0.5 text-xs text-[var(--ff-accent-text)]">
                        <span>
                          + {isCustomReason ? customReasonInput || 'Custom' : selectedReason}
                        </span>
                        <span className="font-mono font-bold">
                          {formatCurrency(toPaise(currentAmount), currency)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-2 border-t border-[var(--ff-border-color)] font-bold">
                    <span className="text-[var(--ff-text-primary)]">Total Daily Spend:</span>
                    <span className="font-mono text-sm text-[var(--ff-danger)]">
                      {formatCurrency(
                        sessionTotalPaise +
                          (currentAmount && Number(currentAmount) > 0
                            ? toPaise(currentAmount)
                            : 0),
                        currency
                      )}
                    </span>
                  </div>
                </div>
              )}

              {activeType === 'income' && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Source / Payer:</span>
                    <span className="font-bold text-[var(--ff-text-primary)]">{incomeSource}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Amount:</span>
                    <span className="font-mono font-bold text-[var(--ff-success)]">
                      {formatCurrency(toPaise(incomeAmount), currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Category:</span>
                    <span className="font-medium text-[var(--ff-text-primary)]">{incomeCategory}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Credit Date:</span>
                    <span className="font-mono text-[var(--ff-text-primary)]">{date}</span>
                  </div>
                  {incomeNotes && (
                    <div className="flex justify-between">
                      <span className="text-[var(--ff-text-muted)]">Notes:</span>
                      <span className="text-[var(--ff-text-secondary)]">{incomeNotes}</span>
                    </div>
                  )}
                </div>
              )}

              {activeType === 'bill' && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Bill Name:</span>
                    <span className="font-bold text-[var(--ff-text-primary)]">{billName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Amount:</span>
                    <span className="font-mono font-bold text-[var(--ff-accent-text)]">
                      {formatCurrency(toPaise(billAmount), currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Due Date:</span>
                    <span className="font-mono text-[var(--ff-text-primary)]">{billDueDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Category:</span>
                    <span className="text-[var(--ff-text-secondary)]">{billCategory}</span>
                  </div>
                </div>
              )}

              {activeType === 'task' && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Title:</span>
                    <span className="font-bold text-[var(--ff-text-primary)]">{taskTitle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Priority:</span>
                    <span className="capitalize text-[var(--ff-text-primary)]">{taskPriority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Estimated Poms:</span>
                    <span className="text-[var(--ff-text-primary)]">{taskPoms}</span>
                  </div>
                </div>
              )}

              {activeType === 'habit' && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Habit Title:</span>
                    <span className="font-bold text-[var(--ff-text-primary)]">{habitTitle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Rhythm:</span>
                    <span className="capitalize text-[var(--ff-text-primary)]">{habitFrequency}</span>
                  </div>
                </div>
              )}

              {activeType === 'envelope' && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Envelope:</span>
                    <span className="font-bold text-[var(--ff-text-primary)]">{envelopeName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Allocation:</span>
                    <span className="font-mono font-bold text-[var(--ff-accent-text)]">
                      {formatCurrency(toPaise(envelopeAmount), currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Month:</span>
                    <span className="text-[var(--ff-text-primary)]">{envelopeMonthKey}</span>
                  </div>
                </div>
              )}

              {activeType === 'goal' && (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Goal:</span>
                    <span className="font-bold text-[var(--ff-text-primary)]">{goalTitle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ff-text-muted)]">Target:</span>
                    <span className="font-mono font-bold text-[var(--ff-accent-text)]">
                      {formatCurrency(toPaise(goalAmount), currency)}
                    </span>
                  </div>
                  {goalTargetDate && (
                    <div className="flex justify-between">
                      <span className="text-[var(--ff-text-muted)]">Target Date:</span>
                      <span className="text-[var(--ff-text-primary)]">{goalTargetDate}</span>
                    </div>
                  )}
                </div>
              )}
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
