import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { ExpenseTransaction, RecurringExpense, ExpenseCategory } from '../../types/index.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import {
  Layers,
  Repeat,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  CreditCard,
  Tag,
  ToggleLeft,
  ToggleRight,
  TrendingDown,
} from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { firestoreService } from '../../lib/firestoreService.ts';

export const ExpenseManager: React.FC = () => {
  const {
    currency,
    refreshKey,
    triggerRefresh,
    showToast,
    firebaseUser,
    googleSpreadsheetId,
    googleAccessToken,
  } = useApp();
  const [activeTab, setActiveTab] = useState<'variable' | 'recurring'>('variable');
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Variable Expense Form Modal
  const [varModalOpen, setVarModalOpen] = useState(false);
  const [editingVar, setEditingVar] = useState<ExpenseTransaction | null>(null);
  const [varDesc, setVarDesc] = useState('');
  const [varAmount, setVarAmount] = useState('');
  const [varDate, setVarDate] = useState(new Date().toISOString().split('T')[0]);
  const [varCategory, setVarCategory] = useState('');
  const [varMethod, setVarMethod] = useState<'credit_card' | 'debit_card' | 'upi_bank' | 'cash'>('credit_card');
  const [varNotes, setVarNotes] = useState('');

  // Recurring Fixed Expense Form Modal
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<RecurringExpense | null>(null);
  const [recName, setRecName] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCategory, setRecCategory] = useState('');
  const [recRecurrence, setRecRecurrence] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [recDueDay, setRecDueDay] = useState('5');
  const [recNotes, setRecNotes] = useState('');

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

  // Handlers for Variable Expenses
  const openVarCreate = () => {
    setEditingVar(null);
    setVarDesc('');
    setVarAmount('');
    setVarDate(new Date().toISOString().split('T')[0]);
    setVarCategory(categories[0]?.id || '');
    setVarMethod('upi_bank');
    setVarNotes('');
    setVarModalOpen(true);
  };

  const handleSaveVar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!varDesc.trim() || !varAmount) {
      showToast('Description and amount are required', 'error');
      return;
    }

    try {
      if (editingVar) {
        const updated = await api.updateExpense(editingVar.id, {
          description: varDesc,
          amountPaise: toPaise(varAmount),
          date: varDate,
          categoryId: varCategory,
          paymentMethod: varMethod,
          notes: varNotes,
          type: 'variable',
        });
        if (firebaseUser) {
          firestoreService.saveExpense(firebaseUser.uid, updated).catch(console.error);
        }
        showToast('Expense updated', 'success');
      } else {
        const created = await api.createExpense({
          description: varDesc,
          amountPaise: toPaise(varAmount),
          date: varDate,
          categoryId: varCategory,
          paymentMethod: varMethod,
          notes: varNotes,
          type: 'variable',
        });
        if (firebaseUser) {
          firestoreService.saveExpense(firebaseUser.uid, created).catch(console.error);
        }
        googleSheetsService.enqueueMutation('Variable_Expenses', [
          created.id,
          created.date,
          created.description,
          created.categoryName || 'General',
          created.amountPaise / 100,
          varMethod.replace('_', ' ').toUpperCase(),
          created.notes || '',
        ]);
        if (googleSpreadsheetId && googleAccessToken) {
          googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
        }
        showToast('Variable expense logged & synchronized', 'success');
      }
      setVarModalOpen(false);
      triggerRefresh();
      loadData();
    } catch {
      showToast('Failed to save expense', 'error');
    }
  };

  const handleDeleteVar = async (id: string) => {
    if (!window.confirm('Delete this expense entry?')) return;
    try {
      await api.deleteExpense(id);
      showToast('Expense deleted', 'info');
      triggerRefresh();
      loadData();
    } catch {
      showToast('Failed to delete expense', 'error');
    }
  };

  // Handlers for Recurring Fixed Expenses
  const openRecCreate = () => {
    setEditingRec(null);
    setRecName('');
    setRecAmount('');
    setRecCategory(categories[0]?.id || '');
    setRecRecurrence('monthly');
    setRecDueDay('5');
    setRecNotes('');
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
    setRecModalOpen(true);
  };

  const handleSaveRec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recName.trim() || !recAmount) {
      showToast('Expense name and amount are required', 'error');
      return;
    }

    try {
      if (editingRec) {
        const updated = await api.updateRecurringExpense(editingRec.id, {
          name: recName,
          amountPaise: toPaise(recAmount),
          categoryId: recCategory,
          recurrence: recRecurrence,
          dueDay: Number(recDueDay),
          notes: recNotes,
        });
        if (firebaseUser) {
          firestoreService.saveRecurringExpense(firebaseUser.uid, updated).catch(console.error);
        }
        showToast('Recurring expense updated', 'success');
      } else {
        const created = await api.createRecurringExpense({
          name: recName,
          amountPaise: toPaise(recAmount),
          categoryId: recCategory,
          recurrence: recRecurrence,
          dueDay: Number(recDueDay),
          notes: recNotes,
        });
        if (firebaseUser) {
          firestoreService.saveRecurringExpense(firebaseUser.uid, created).catch(console.error);
        }
        googleSheetsService.enqueueMutation('Fixed_Expenses', [
          created.id,
          created.name,
          created.categoryName || 'Fixed Commitment',
          created.amountPaise / 100,
          created.recurrence.toUpperCase(),
          created.dueDay,
          'ACTIVE',
          created.notes || '',
        ]);
        if (googleSpreadsheetId && googleAccessToken) {
          googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
        }
        showToast('Recurring plan registered; automatic bills created & synced!', 'success');
      }
      setRecModalOpen(false);
      triggerRefresh();
      loadData();
    } catch {
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

  const handleDeleteRec = async (id: string) => {
    if (!window.confirm('Delete this recurring expense plan? Future recurring bills will no longer be generated.')) return;
    try {
      await api.deleteRecurringExpense(id);
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
    <div className="space-y-6">
      {/* Top Header & Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Sub-module switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button
            onClick={() => setActiveTab('variable')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'variable'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Variable Daily Expenses ({variableExpenses.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('recurring')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'recurring'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Repeat className="w-4 h-4" />
            <span>Fixed Recurring Plans ({recurring.length})</span>
          </button>
        </div>

        <button
          onClick={activeTab === 'variable' ? openVarCreate : openRecCreate}
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{activeTab === 'variable' ? 'Add Variable Expense' : 'Add Recurring Plan'}</span>
        </button>
      </div>

      {/* SUMMARY BANNER */}
      <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs">
        {activeTab === 'variable' ? (
          <div>
            <span className="text-slate-500">Current Variable Spend: </span>
            <strong className="font-mono text-slate-900 dark:text-white text-sm">
              {formatCurrency(totalVariable, currency)}
            </strong>
            <span className="text-slate-400 ml-2">(Food, shopping, transit, entertainment, etc.)</span>
          </div>
        ) : (
          <div>
            <span className="text-slate-500">Active Monthly Fixed Commitments: </span>
            <strong className="font-mono text-indigo-600 dark:text-indigo-400 text-sm">
              {formatCurrency(totalRecurring, currency)}
            </strong>
            <span className="text-slate-400 ml-2">(Rent, internet, subscriptions, insurance, etc.)</span>
          </div>
        )}
      </div>

      {/* SECTION 1: VARIABLE EXPENSES LIST */}
      {activeTab === 'variable' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading variable expenses...</div>
          ) : variableExpenses.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingDown className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No variable expenses recorded</h4>
              <p className="text-xs text-slate-500 mt-1">Log day-to-day shopping, food, and transit purchases above.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {variableExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <h5 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {exp.description}
                      </h5>

                      {exp.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {exp.notes}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{exp.categoryName || 'General'}</span>
                        </div>
                        <span aria-hidden="true">·</span>
                        <div className="flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-400" />
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
                    <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      -{formatCurrency(exp.amountPaise, currency)}
                    </span>

                    <button
                      onClick={() => handleDeleteVar(exp.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete expense"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: FIXED RECURRING EXPENSES LIST */}
      {activeTab === 'recurring' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading recurring plans...</div>
          ) : recurring.length === 0 ? (
            <div className="p-12 text-center">
              <Repeat className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No recurring plans set up</h4>
              <p className="text-xs text-slate-500 mt-1">Set up monthly internet, rent, subscriptions, and recurring bills above.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {recurring.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    !rec.isActive ? 'opacity-50 bg-slate-50/40 dark:bg-slate-900/40' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Repeat className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {rec.name}
                        </h5>
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900">
                          {rec.recurrence}
                        </span>
                      </div>

                      {rec.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {rec.notes}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{rec.categoryName || 'Fixed'}</span>
                        </div>
                        <span aria-hidden="true">·</span>
                        <span>Due Day: {rec.dueDay} of each cycle</span>
                        <span aria-hidden="true">·</span>
                        <span className={rec.isActive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
                          {rec.isActive ? 'Active Auto-Bill' : 'Deactivated'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(rec.amountPaise, currency)}
                    </span>

                    <button
                      onClick={() => handleToggleRecActive(rec)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                      title={rec.isActive ? 'Deactivate recurring plan' : 'Activate recurring plan'}
                    >
                      {rec.isActive ? (
                        <ToggleRight className="w-6 h-6 text-indigo-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-400" />
                      )}
                    </button>

                    <button
                      onClick={() => openRecEdit(rec)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      title="Edit recurring plan"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteRec(rec.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete recurring plan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Add/Edit Variable Expense */}
      {varModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editingVar ? 'Edit Variable Expense' : 'Log Variable Expense'}
            </h3>

            <form onSubmit={handleSaveVar} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description / Merchant
                </label>
                <input
                  type="text"
                  required
                  value={varDesc}
                  onChange={(e) => setVarDesc(e.target.value)}
                  placeholder="e.g., Weekly Groceries, Fuel, Cafe"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={varAmount}
                    onChange={(e) => setVarAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={varDate}
                    onChange={(e) => setVarDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={varCategory}
                    onChange={(e) => setVarCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={varMethod}
                    onChange={(e) => setVarMethod(e.target.value as typeof varMethod)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="upi_bank">UPI / Bank Transfer</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={varNotes}
                  onChange={(e) => setVarNotes(e.target.value)}
                  placeholder="Additional context..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVarModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Fixed Recurring Plan */}
      {recModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editingRec ? 'Edit Recurring Expense Plan' : 'Create Recurring Fixed Plan'}
            </h3>

            <form onSubmit={handleSaveRec} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Plan Name
                </label>
                <input
                  type="text"
                  required
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  placeholder="e.g., Fiber Internet, Apartment Lease, Spotify"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Recurrence
                  </label>
                  <select
                    value={recRecurrence}
                    onChange={(e) => setRecRecurrence(e.target.value as typeof recRecurrence)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Due Day of Month
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={recDueDay}
                    onChange={(e) => setRecDueDay(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes / Terms (Optional)
                </label>
                <input
                  type="text"
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  placeholder="e.g., Annual contract, renewal in Dec"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRecModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Save Recurring Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
