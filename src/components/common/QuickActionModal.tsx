import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { toPaise } from '../../lib/currency.ts';
import { playCashSound } from '../../lib/sound.ts';
import {
  Timer,
  PlusCircle,
  Receipt,
  CreditCard,
  CheckSquare,
} from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { firestoreService } from '../../lib/firestoreService.ts';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import { ValidationMessage, useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ActionType = 'expense' | 'income' | 'task' | 'bill';

export const QuickActionModal: React.FC<QuickActionModalProps> = ({ isOpen, onClose }) => {
  const {
    setCurrentTab,
    showToast,
    triggerRefresh,
    currency,
    settings,
    startTimer,
    switchTimerMode,
    firebaseUser,
    googleSpreadsheetId,
    googleAccessToken,
  } = useApp();
  const [activeType, setActiveType] = useState<ActionType>('expense');
  const [loading, setLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { isDisabled } = useMotionPreferences();

  // Form states
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'debit_card' | 'upi_bank' | 'cash'>('upi_bank');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedPomodoros, setEstimatedPomodoros] = useState('2');

  const handleTabChange = (nextType: ActionType) => {
    setActiveType(nextType);
    setFormError(null);
    setSubmitSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLoading(true);

    try {
      if (activeType === 'expense') {
        if (!description.trim() || !amount || Number(amount) <= 0) {
          setFormError('Please provide a description and valid positive amount.');
          setLoading(false);
          return;
        }
        const createdExp = await api.createExpense({
          description,
          amountPaise: toPaise(amount),
          date: new Date().toISOString().split('T')[0],
          paymentMethod,
          type: 'variable',
        });
        if (firebaseUser) {
          firestoreService.saveExpense(firebaseUser.uid, createdExp).catch(console.error);
        }
        googleSheetsService.enqueueMutation('Variable_Expenses', [
          createdExp.id,
          createdExp.date,
          createdExp.description,
          createdExp.categoryName || 'General',
          createdExp.amountPaise / 100,
          paymentMethod.replace('_', ' ').toUpperCase(),
          createdExp.notes || '',
        ]);
        showToast('Expense logged & synchronized', 'success');
        playCashSound(settings?.soundEnabled);
      } else if (activeType === 'income') {
        if (!description.trim() || !amount || Number(amount) <= 0) {
          setFormError('Please provide a payer source and valid positive amount.');
          setLoading(false);
          return;
        }
        const createdInc = await api.createIncome({
          source: description,
          amountPaise: toPaise(amount),
          date: new Date().toISOString().split('T')[0],
          category: category || 'Salary',
        });
        if (firebaseUser) {
          firestoreService.saveIncome(firebaseUser.uid, createdInc).catch(console.error);
        }
        googleSheetsService.enqueueMutation('Income', [
          createdInc.id,
          createdInc.date,
          createdInc.source,
          createdInc.category,
          createdInc.amountPaise / 100,
          createdInc.notes || '',
        ]);
        showToast('Income recorded & synchronized', 'success');
        playCashSound(settings?.soundEnabled);
      } else if (activeType === 'task') {
        if (!description.trim()) {
          setFormError('Please enter a task title.');
          setLoading(false);
          return;
        }
        const createdTask = await api.createTask({
          title: description,
          priority,
          estimatedPomodoros: Number(estimatedPomodoros) || 1,
          dueDate: dueDate || null,
        });
        if (firebaseUser) {
          firestoreService.saveTask(firebaseUser.uid, createdTask).catch(console.error);
        }
        showToast('Task added to backlog', 'success');
      } else if (activeType === 'bill') {
        if (!description.trim() || !amount || Number(amount) <= 0 || !dueDate) {
          setFormError('Please complete bill name, amount, and due date.');
          setLoading(false);
          return;
        }
        const createdBill = await api.createBill({
          name: description,
          amountPaise: toPaise(amount),
          dueDate,
        });
        if (firebaseUser) {
          firestoreService.saveBill(firebaseUser.uid, createdBill).catch(console.error);
        }
        googleSheetsService.enqueueMutation('Bills_Payments', [
          createdBill.id,
          createdBill.dueDate,
          createdBill.name,
          createdBill.categoryName || 'General Bill',
          createdBill.amountPaise / 100,
          createdBill.status,
          '',
          'PENDING',
          createdBill.notes || '',
        ]);
        showToast('Bill registered to tracker & synchronized', 'success');
      }

      if (googleSpreadsheetId && googleAccessToken) {
        googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
      }

      triggerRefresh();
      setLoading(false);
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        onClose();
        setAmount('');
        setDescription('');
        setFormError(null);
      }, isDisabled ? 60 : 260);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      setFormError(msg);
      showToast(msg, 'error');
      setLoading(false);
    }
  };

  const handleStartQuickFocus = () => {
    switchTimerMode('work');
    startTimer();
    setCurrentTab('focus');
    onClose();
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Quick Action">
      <div className="space-y-4">
        {/* Action Type Tabs */}
        <ThemeSegmentedControl<ActionType>
          fullWidth
          ariaLabel="Quick action entry type"
          value={activeType}
          onChange={handleTabChange}
          options={[
            { id: 'expense', label: 'Expense', icon: <Receipt className="w-3.5 h-3.5" /> },
            { id: 'income', label: 'Income', icon: <PlusCircle className="w-3.5 h-3.5" /> },
            { id: 'bill', label: 'Bill', icon: <CreditCard className="w-3.5 h-3.5" /> },
            { id: 'task', label: 'Task', icon: <CheckSquare className="w-3.5 h-3.5" /> },
          ]}
        />

        {/* Quick Pomodoro Launcher shortcut */}
        <ThemeCard
          variant="inset"
          className="p-3 flex items-center justify-between gap-2"
          style={{
            background: 'var(--ff-accent-soft)',
            borderColor: 'var(--ff-accent-border)',
          }}
        >
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
            <span className="text-xs font-medium text-[var(--ff-text-primary)]">
              Need to focus right now?
            </span>
          </div>
          <ThemeButton variant="primary" size="xs" onClick={handleStartQuickFocus}>
            Start 25m Timer
          </ThemeButton>
        </ThemeCard>

        {/* Dynamic Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
          <div>
            <label
              htmlFor="quick-action-title"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              {activeType === 'task'
                ? 'Task Title'
                : activeType === 'income'
                ? 'Source / Payer'
                : activeType === 'bill'
                ? 'Bill Name'
                : 'Description'}
            </label>
            <ThemeInput
              id="quick-action-title"
              type="text"
              required
              autoFocus
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder={
                activeType === 'expense'
                  ? 'e.g., Grocery shopping, Team lunch'
                  : activeType === 'income'
                  ? 'e.g., Client Payment, Freelance Design'
                  : activeType === 'bill'
                  ? 'e.g., Electricity Bill, Wi-Fi'
                  : 'e.g., Complete UI Mockup'
              }
            />
          </div>

          <AnimatePresence mode="popLayout" initial={false}>
            {activeType !== 'task' && (
              <motion.div
                key="quick-field-amount"
                initial={isDisabled ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.decelerate }}
              >
                <label
                  htmlFor="quick-action-amount"
                  className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                >
                  Amount ({currency})
                </label>
                <ThemeInput
                  id="quick-action-amount"
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="0.00"
                  className="font-mono tabular-nums"
                />
              </motion.div>
            )}

            {activeType === 'bill' && (
              <motion.div
                key="quick-field-bill"
                initial={isDisabled ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.decelerate }}
              >
                <label
                  htmlFor="quick-action-due"
                  className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                >
                  Due Date
                </label>
                <ThemeInput
                  id="quick-action-due"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </motion.div>
            )}

            {activeType === 'expense' && (
              <motion.div
                key="quick-field-expense"
                initial={isDisabled ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.decelerate }}
              >
                <label
                  htmlFor="quick-action-method"
                  className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                >
                  Payment Method
                </label>
                <ThemeSelect
                  id="quick-action-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                >
                  <option value="upi_bank">UPI / Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="debit_card">Debit Card</option>
                  <option value="cash">Cash</option>
                </ThemeSelect>
              </motion.div>
            )}

            {activeType === 'task' && (
              <motion.div
                key="quick-field-task"
                initial={isDisabled ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.decelerate }}
                className="grid grid-cols-2 gap-3"
              >
                <div>
                  <label
                    htmlFor="quick-action-priority"
                    className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                  >
                    Priority
                  </label>
                  <ThemeSelect
                    id="quick-action-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof priority)}
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </ThemeSelect>
                </div>
                <div>
                  <label
                    htmlFor="quick-action-poms"
                    className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                  >
                    Est. Pomodoros
                  </label>
                  <ThemeInput
                    id="quick-action-poms"
                    type="number"
                    min="1"
                    max="20"
                    value={estimatedPomodoros}
                    onChange={(e) => setEstimatedPomodoros(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ValidationMessage message={formError} tone="error" />

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </ThemeButton>
            <ThemeButton
              type="submit"
              variant="primary"
              size="sm"
              loading={loading}
              success={submitSuccess}
              loadingText="Saving..."
            >
              {submitSuccess ? 'Saved!' : 'Save & Record'}
            </ThemeButton>
          </div>
        </form>
      </div>
    </ThemeModal>
  );
};
