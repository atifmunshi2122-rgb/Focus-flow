import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { toPaise } from '../../lib/currency.ts';
import { playCashSound } from '../../lib/sound.ts';
import {
  X,
  Timer,
  PlusCircle,
  Receipt,
  CreditCard,
  CheckSquare,
} from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { firestoreService } from '../../lib/firestoreService.ts';

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
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'debit_card' | 'upi_bank' | 'cash'>('upi_bank');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedPomodoros, setEstimatedPomodoros] = useState('2');

  if (!isOpen) return null;

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

      // If connected to Google Sheets, flush queue immediately
      if (googleSpreadsheetId && googleAccessToken) {
        googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
      }

      triggerRefresh();
      onClose();
      // Reset form
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Quick Action</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Type Tabs */}
        <div className="grid grid-cols-4 gap-1.5 p-1 my-4 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveType('expense')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center gap-1 ${
              activeType === 'expense'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Expense</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveType('income')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center gap-1 ${
              activeType === 'income'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Income</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveType('bill')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center gap-1 ${
              activeType === 'bill'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Bill</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveType('task')}
            className={`py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center gap-1 ${
              activeType === 'task'
                ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Task</span>
          </button>
        </div>

        {/* Quick Pomodoro Launcher shortcut */}
        <div className="mb-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
              Need to focus right now?
            </span>
          </div>
          <button
            type="button"
            onClick={handleStartQuickFocus}
            className="px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
          >
            Start 25m Timer
          </button>
        </div>

        {/* Dynamic Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {activeType === 'task'
                ? 'Task Title'
                : activeType === 'income'
                ? 'Source / Payer'
                : activeType === 'bill'
                ? 'Bill Name'
                : 'Description'}
            </label>
            <input
              type="text"
              required
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {activeType !== 'task' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Amount ({currency})
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {activeType === 'bill' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Due Date
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {activeType === 'expense' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="upi_bank">UPI / Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          )}

          {activeType === 'task' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Est. Pomodoros
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={estimatedPomodoros}
                  onChange={(e) => setEstimatedPomodoros(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save & Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
