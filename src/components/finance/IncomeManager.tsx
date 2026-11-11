import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { IncomeTransaction } from '../../types/index.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import { playCashSound } from '../../lib/sound.ts';
import { Plus, TrendingUp, Trash2, Edit2, Calendar, Tag } from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { firestoreService } from '../../lib/firestoreService.ts';

export const IncomeManager: React.FC = () => {
  const {
    currency,
    refreshKey,
    triggerRefresh,
    showToast,
    settings,
    firebaseUser,
    googleSpreadsheetId,
    googleAccessToken,
  } = useApp();
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeTransaction | null>(null);
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Salary');
  const [notes, setNotes] = useState('');

  const loadIncomes = () => {
    setLoading(true);
    api
      .getIncomes()
      .then(setIncomes)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadIncomes();
  }, [refreshKey]);

  const openCreateModal = () => {
    setEditingIncome(null);
    setSource('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('Salary');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (inc: IncomeTransaction) => {
    setEditingIncome(inc);
    setSource(inc.source);
    setAmount(String(inc.amountPaise / 100));
    setDate(inc.date);
    setCategory(inc.category);
    setNotes(inc.notes);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !amount) {
      showToast('Source and amount are required', 'error');
      return;
    }

    try {
      if (editingIncome) {
        const updated = await api.updateIncome(editingIncome.id, {
          source,
          amountPaise: toPaise(amount),
          date,
          category,
          notes,
        });
        if (firebaseUser) {
          firestoreService.saveIncome(firebaseUser.uid, updated).catch(console.error);
        }
        showToast('Income record updated', 'success');
      } else {
        const created = await api.createIncome({
          source,
          amountPaise: toPaise(amount),
          date,
          category,
          notes,
        });
        if (firebaseUser) {
          firestoreService.saveIncome(firebaseUser.uid, created).catch(console.error);
        }
        googleSheetsService.enqueueMutation('Income', [
          created.id,
          created.date,
          created.source,
          created.category,
          created.amountPaise / 100,
          created.notes || '',
        ]);
        if (googleSpreadsheetId && googleAccessToken) {
          googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
        }
        playCashSound(settings?.soundEnabled);
        showToast('Income recorded & synchronized', 'success');
      }
      setModalOpen(false);
      triggerRefresh();
      loadIncomes();
    } catch {
      showToast('Failed to save income record', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this income record?')) return;
    try {
      await api.deleteIncome(id);
      showToast('Income record deleted', 'info');
      triggerRefresh();
      loadIncomes();
    } catch {
      showToast('Failed to delete income', 'error');
    }
  };

  const totalIncome = incomes.reduce((sum, inc) => sum + inc.amountPaise, 0);

  return (
    <div className="space-y-6">
      {/* Top action and summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Income Streams</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total recorded income: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(totalIncome, currency)}</strong>
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Income</span>
        </button>
      </div>

      {/* Income Records List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading income logs...</div>
        ) : incomes.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingUp className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No income recorded yet</h4>
            <p className="text-xs text-slate-500 mt-1">Log your salary, freelance, or dividend payments above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {incomes.map((inc) => (
              <div
                key={inc.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <h5 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {inc.source}
                    </h5>

                    {inc.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {inc.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-400" />
                        <span>{inc.category}</span>
                      </div>
                      <span aria-hidden="true">·</span>
                      <div className="flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{inc.date}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(inc.amountPaise, currency)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(inc)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      title="Edit income"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(inc.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete income"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Add / Edit Income */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editingIncome ? 'Edit Income Stream' : 'Record Income'}
            </h3>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Income Source / Payer
                </label>
                <input
                  type="text"
                  required
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g., Monthly Engineering Salary, Client Project"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Date Received
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Salary">Salary</option>
                  <option value="Freelance">Freelance &amp; Consulting</option>
                  <option value="Investments">Investments &amp; Dividends</option>
                  <option value="Business">Business Revenue</option>
                  <option value="Bonus">Performance Bonus</option>
                  <option value="Other">Other Income</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reference or bank note..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
                >
                  {editingIncome ? 'Save Changes' : 'Record Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
