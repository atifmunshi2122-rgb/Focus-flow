import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { DashboardData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import {
  Timer,
  CheckCircle2,
  Flame,
  TrendingUp,
  TrendingDown,
  Scale,
  CreditCard,
  AlertTriangle,
  Play,
  ArrowRight,
  Clock,
  Calendar,
  Sparkles,
  FileSpreadsheet,
  ExternalLink,
} from 'lucide-react';

interface UnifiedDashboardProps {
  onOpenQuickAction: () => void;
}

export const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({ onOpenQuickAction }) => {
  const {
    currency,
    refreshKey,
    setCurrentTab,
    startTimer,
    switchTimerMode,
    isRunning,
    timerMode,
    timeLeft,
    googleSpreadsheetId,
    createOrConnectSpreadsheet,
  } = useApp();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const handleStartQuickFocus = () => {
    switchTimerMode('work');
    startTimer();
    setCurrentTab('focus');
  };

  if (loading && !data) {
    return (
      <div className="p-12 text-center text-xs text-slate-400">Loading command center...</div>
    );
  }

  return (
    <div className="space-y-8">
      {/* SECTION 1: HERO FOCUS & FINANCE PULSE BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 text-white p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
              <Sparkles className="w-4 h-4" />
              <span>Unified Command Center</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white text-balance">
              Focus Deeply. Manage Wealth Intelligently.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Your personal productivity engine and financial ledger synchronized in real time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {googleSpreadsheetId ? (
              <a
                href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 font-semibold text-xs backdrop-blur-md transition-all"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Open Master Sheets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button
                onClick={() => createOrConnectSpreadsheet()}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/30 transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Initialize 12 Sheets</span>
              </button>
            )}

            <button
              onClick={handleStartQuickFocus}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>{isRunning ? 'View Active Timer' : 'Launch 25m Focus'}</span>
            </button>
            <button
              onClick={onOpenQuickAction}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-xs backdrop-blur-md transition-colors"
            >
              <span>Quick Entry</span>
            </button>
          </div>
        </div>

        {/* Ambient background glow decoration */}
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* SECTION 2: FOCUS METRICS (3 CARDS) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            Focus &amp; Productivity Intelligence
          </h3>
          <button
            onClick={() => setCurrentTab('focus')}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <span>Open Focus Lab</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Today's Focus Time */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Today&apos;s Focus Time
              </span>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {data ? Math.floor(data.todayFocusMinutes / 60) : 0}h {(data?.todayFocusMinutes || 0) % 60}m
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {data?.todayFocusMinutes || 0} active minutes logged
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Completed Pomodoro Sessions */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Completed Pomodoros
              </span>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {data?.completedPomodoroSessions || 0}
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 block">
                25-minute deep focus cycles
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* Current Focus Streak */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Current Focus Streak
              </span>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {data?.focusStreakDays || 1} Days
              </div>
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-1 block">
                Daily discipline streak
              </span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: PERSONAL FINANCE CORE CARDS */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            Monthly Financial Standing
          </h3>
          <button
            onClick={() => setCurrentTab('finance')}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <span>View Full Financial Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Monthly Income */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium">Monthly Inflow</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(data?.monthlyIncomePaise || 0, currency)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Direct salary &amp; revenue
            </span>
          </div>

          {/* Monthly Expenses */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium">Monthly Outflow</span>
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(data?.monthlyExpensesPaise || 0, currency)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
              <span>Fixed: {formatCurrency(data?.fixedExpensesPaise || 0, currency, { compact: true })}</span>
              <span aria-hidden="true">·</span>
              <span>Variable: {formatCurrency(data?.variableExpensesPaise || 0, currency, { compact: true })}</span>
            </div>
          </div>

          {/* Remaining Balance */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium">Remaining Balance</span>
              <Scale className="w-4 h-4 text-indigo-500" />
            </div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums ${
                (data?.remainingBalancePaise || 0) >= 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatCurrency(data?.remainingBalancePaise || 0, currency)}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Net savings after expenses
            </span>
          </div>

          {/* Bills Status */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium">Bills Status</span>
              <CreditCard className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(data?.totalUnpaidAmountPaise || 0, currency)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px]">
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                {data?.unpaidBillsCount || 0} Unpaid
              </span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {data?.paidBillsCount || 0} Paid
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4: 2-COLUMN VIEW: UPCOMING PAYMENTS & RECENT TRANSACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Payments Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Upcoming Bill Obligations
                </h4>
              </div>
              <button
                onClick={() => setCurrentTab('bills')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Manage Bills
              </button>
            </div>

            {!data?.upcomingPayments || data.upcomingPayments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                All bills for this period are completely paid! Great financial discipline.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {data.upcomingPayments.map((bill) => (
                  <div
                    key={bill.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {bill.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mt-0.5">
                        <span className="font-mono">Due {bill.dueDate}</span>
                        {bill.status === 'OVERDUE' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-rose-600 dark:text-rose-400 font-bold">
                              Overdue!
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white block">
                        {formatCurrency(bill.amountPaise, currency)}
                      </span>
                      <button
                        onClick={() => setCurrentTab('bills')}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                      >
                        Pay Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Financial Flow
                </h4>
              </div>
              <button
                onClick={() => setCurrentTab('transactions')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View Ledger
              </button>
            </div>

            {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No recent transactions recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {data.recentTransactions.map((tx) => {
                  const isIncome = tx.type === 'income';

                  return (
                    <div
                      key={tx.id}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {tx.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mt-0.5">
                          <span>{tx.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{tx.date}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`font-mono tabular-nums font-bold ${
                            isIncome
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {isIncome ? '+' : '-'}
                          {formatCurrency(tx.amountPaise, currency)}
                        </span>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">
                          {tx.type}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
