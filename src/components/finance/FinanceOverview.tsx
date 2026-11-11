import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FinanceSummaryData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { AnalyticsCharts } from './AnalyticsCharts.tsx';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
} from 'lucide-react';

interface FinanceOverviewProps {
  onOpenQuickAction: () => void;
}

export const FinanceOverview: React.FC<FinanceOverviewProps> = ({ onOpenQuickAction }) => {
  const { currency, refreshKey } = useApp();
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);

  const fetchSummary = (f = filter, start?: string, end?: string) => {
    setLoading(true);
    api
      .getFinanceSummary(f, start, end)
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSummary(filter, customStart, customEnd);
  }, [filter, refreshKey]);

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    if (newFilter === 'custom') {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
      fetchSummary(newFilter);
    }
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStart && customEnd) {
      fetchSummary('custom', customStart, customEnd);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Interactive segmented controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto">
          {[
            { id: 'today', label: 'Today' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'custom', label: 'Custom' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleFilterChange(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={onOpenQuickAction}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Transaction</span>
        </button>
      </div>

      {/* Custom Date Range Picker Dropdown */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustom}
          className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-500">From:</span>
            <input
              type="date"
              required
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">To:</span>
            <input
              type="date"
              required
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
          >
            Apply Range
          </button>
        </form>
      )}

      {/* 4 Core Financial KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Income */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-medium">Total Income</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(summary.totalIncomePaise, currency)}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Salary, freelance &amp; investments
            </span>
          </div>

          {/* Total Expenses */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-medium">Total Expenses</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(summary.totalExpensePaise, currency)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Fixed: {formatCurrency(summary.fixedExpensesPaise, currency, { compact: true })}</span>
              <span aria-hidden="true">·</span>
              <span>Variable: {formatCurrency(summary.variableExpensesPaise, currency, { compact: true })}</span>
            </div>
          </div>

          {/* Remaining Balance */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-medium">Remaining Balance</span>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  summary.remainingBalancePaise >= 0
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                }`}
              >
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums ${
                summary.remainingBalancePaise >= 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatCurrency(summary.remainingBalancePaise, currency)}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Net balance (Income - Expenses)
            </span>
          </div>

          {/* Bills Status Summary */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
              <span className="text-xs font-medium">Bill Commitments</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(summary.totalUnpaidAmountPaise, currency)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px]">
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                {summary.unpaidBillsCount} Pending
              </span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {summary.paidBillsCount} Paid ({formatCurrency(summary.totalPaidAmountPaise, currency, { compact: true })})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Charts Submodule */}
      {loading && !summary ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading financial analytics...</div>
      ) : summary ? (
        <AnalyticsCharts data={summary} />
      ) : null}
    </div>
  );
};
