import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { IncomeTransaction, ExpenseTransaction } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import {
  ReceiptText,
  Search,
  TrendingUp,
  TrendingDown,
  Repeat,
  Calendar,
  Tag,
  Filter,
} from 'lucide-react';

interface UnifiedTransaction {
  id: string;
  type: 'income' | 'fixed' | 'variable';
  name: string;
  category: string;
  amountPaise: number;
  date: string;
  notes?: string;
  paymentMethod?: string;
}

export const TransactionsLedger: React.FC = () => {
  const { currency, refreshKey } = useApp();
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'fixed' | 'variable'>('all');

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getIncomes(), api.getExpenses()])
      .then(([incomes, expenses]) => {
        const unifiedInc: UnifiedTransaction[] = incomes.map((i) => ({
          id: i.id,
          type: 'income',
          name: i.source,
          category: i.category,
          amountPaise: i.amountPaise,
          date: i.date,
          notes: i.notes,
        }));

        const unifiedExp: UnifiedTransaction[] = expenses.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.description,
          category: e.categoryName || 'General',
          amountPaise: e.amountPaise,
          date: e.date,
          notes: e.notes,
          paymentMethod: e.paymentMethod,
        }));

        const combined = [...unifiedInc, ...unifiedExp].sort((a, b) => b.date.localeCompare(a.date));
        setTransactions(combined);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const filtered = transactions.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (typeFilter === 'income') return t.type === 'income';
    if (typeFilter === 'expense') return t.type === 'fixed' || t.type === 'variable';
    if (typeFilter === 'fixed') return t.type === 'fixed';
    if (typeFilter === 'variable') return t.type === 'variable';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description, source, or category..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
          />
        </div>

        {/* Filter Segmented Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto">
          {[
            { id: 'all', label: 'All Activity' },
            { id: 'income', label: 'Income Only' },
            { id: 'fixed', label: 'Fixed (Bills)' },
            { id: 'variable', label: 'Variable' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.id as typeof typeFilter)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                typeFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading ledger records...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ReceiptText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No transactions match your search</h4>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search keywords.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filtered.map((t) => {
              const isIncome = t.type === 'income';
              const isFixed = t.type === 'fixed';

              return (
                <div
                  key={t.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isIncome
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : isFixed
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isIncome ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : isFixed ? (
                        <Repeat className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {t.name}
                      </p>

                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{t.category}</span>
                        </div>
                        <span aria-hidden="true">·</span>
                        <div className="flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{t.date}</span>
                        </div>
                        {t.paymentMethod && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="uppercase text-[10px] font-medium">
                              {t.paymentMethod.replace('_', ' ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-base font-bold font-mono tabular-nums ${
                        isIncome
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isIncome ? '+' : '-'}
                      {formatCurrency(t.amountPaise, currency)}
                    </span>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      {isIncome ? 'Income' : isFixed ? 'Fixed Bill' : 'Variable Spend'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
