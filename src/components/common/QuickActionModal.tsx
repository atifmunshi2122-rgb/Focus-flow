import React, { useState } from 'react';
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

  // Form states
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'debit_card' | 'upi_bank' | 'cash'>('upi_bank');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedPomodoros, setEstimatedPomodoros] = useState('2');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (activeType === 'expense') {
        if (!description || !amount) {
          showToast('Please provide description and amount', 'error');
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
        if (!description || !amount) {
          showToast('Please provide source and amount', 'error');
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
        if (!description) {
          showToast('Please enter task title', 'error');
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
        if (!description || !amount || !dueDate) {
          showToast('Please complete all bill fields', 'error');
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
      onClose();
      setAmount('');
      setDescription('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
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
          onChange={setActiveType}
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
        <form onSubmit={handleSubmit} className="space-y-3.5">
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
              onChange={(e) => setDescription(e.target.value)}
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

          {activeType !== 'task' && (
            <div>
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
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="font-mono tabular-nums"
              />
            </div>
          )}

          {activeType === 'bill' && (
            <div>
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
            </div>
          )}

          {activeType === 'expense' && (
            <div>
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
            </div>
          )}

          {activeType === 'task' && (
            <div className="grid grid-cols-2 gap-3">
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
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" disabled={loading}>
              {loading ? 'Saving...' : 'Save & Record'}
            </ThemeButton>
          </div>
        </form>
      </div>
    </ThemeModal>
  );
};
