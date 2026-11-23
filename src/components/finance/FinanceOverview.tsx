import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { clientDataCache } from '../../lib/dataCache.ts';
import { FinanceSummaryData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { AnalyticsCharts } from './AnalyticsCharts.tsx';
import { IncomeManager } from './IncomeManager.tsx';
import { ExpenseManager } from './ExpenseManager.tsx';
import { BudgetSavingsManager } from './BudgetSavingsManager.tsx';
import { DailyExpenseTracker } from './DailyExpenseTracker.tsx';
import { FinancialCalendarView } from './FinancialCalendarView.tsx';
import { SmartSpendingInsightsCard } from './SmartSpendingInsightsCard.tsx';
import { FinancialReportsView } from './FinancialReportsView.tsx';
import { JointVaultsView } from './JointVaultsView.tsx';
import { WhatIfFinancialSandbox } from './WhatIfFinancialSandbox.tsx';
import { InflationGoalCalculator } from './InflationGoalCalculator.tsx';
import { EmergencyAssetSummary } from './EmergencyAssetSummary.tsx';
import type { ExpenseTransaction, IncomeTransaction } from '../../types/index.ts';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  MotionStaggerGrid,
  MotionStaggerItem,
  SkeletonDashboard,
  ValidationMessage,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Clock,
  Plus,
  Trash2,
  Calendar,
  Receipt,
  CreditCard,
  PieChart,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface FinanceOverviewProps {
  onOpenQuickAction: (initialType?: 'expense' | 'income', initialDate?: string) => void;
}

type FinanceSubTab =
  | 'overview'
  | 'daily'
  | 'calendar'
  | 'income'
  | 'expenses'
  | 'savings'
  | 'vaults'
  | 'reports'
  | 'sandbox'
  | 'inflation'
  | 'emergency';

export const FinanceOverview: React.FC<FinanceOverviewProps> = ({ onOpenQuickAction }) => {
  const { currency, refreshKey, setTrashModalOpen, setCurrentTab } = useApp();
  const [subTab, setSubTab] = useState<FinanceSubTab>('overview');
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);
  const cachedExpenses = clientDataCache.getExpenses();
  const cachedIncomes = clientDataCache.getIncomes();
  const hasCachedFinance = Boolean(cachedExpenses || cachedIncomes);

  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [allExpenses, setAllExpenses] = useState<ExpenseTransaction[]>(() => cachedExpenses || []);
  const [allIncomes, setAllIncomes] = useState<IncomeTransaction[]>(() => cachedIncomes || []);
  const [loading, setLoading] = useState(!hasCachedFinance);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [filter, setFilter] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [breakdownModal, setBreakdownModal] = useState<'expense' | 'income' | null>(null);

  // Filtered transactions for the active period
  const filteredExpenses = useMemo(() => {
    if (!summary?.startDate || !summary?.endDate) return allExpenses.filter((e) => !e.deletedAt);
    return allExpenses
      .filter((e) => !e.deletedAt && e.date >= summary.startDate && e.date <= summary.endDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [allExpenses, summary]);

  const filteredIncomes = useMemo(() => {
    if (!summary?.startDate || !summary?.endDate) return allIncomes.filter((i) => !i.deletedAt);
    return allIncomes
      .filter((i) => !i.deletedAt && i.date >= summary.startDate && i.date <= summary.endDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [allIncomes, summary]);

  // Breakdown by category / source
  const expenseCategoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of filteredExpenses) {
      const cat = exp.categoryName || exp.categoryId || 'General';
      map.set(cat, (map.get(cat) || 0) + exp.amountPaise);
    }
    const total = summary?.totalExpensePaise || 1;
    return Array.from(map.entries())
      .map(([name, amountPaise]) => ({
        name,
        amountPaise,
        percentage: Math.round((amountPaise / total) * 100),
      }))
      .sort((a, b) => b.amountPaise - a.amountPaise);
  }, [filteredExpenses, summary]);

  const incomeCategoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const inc of filteredIncomes) {
      const cat = inc.category || 'Salary';
      map.set(cat, (map.get(cat) || 0) + inc.amountPaise);
    }
    const total = summary?.totalIncomePaise || 1;
    return Array.from(map.entries())
      .map(([name, amountPaise]) => ({
        name,
        amountPaise,
        percentage: Math.round((amountPaise / total) * 100),
      }))
      .sort((a, b) => b.amountPaise - a.amountPaise);
  }, [filteredIncomes, summary]);

  const fetchSummary = (f = filter, start?: string, end?: string) => {
    if (!hasCachedFinance && !summary) {
      setLoading(true);
    }
    setLoadError(null);
    Promise.all([
      api.getFinanceSummary(f, start, end).catch(() => null),
      api.getExpenses().catch(() => clientDataCache.getExpenses() || []),
      api.getIncomes().catch(() => clientDataCache.getIncomes() || []),
    ])
      .then(([sum, exps, incs]) => {
        if (sum) {
          setSummary(sum);
          setIsStale(false);
        } else if (!summary) {
          setLoadError('Failed to load financial summary. Please check your connection.');
        } else {
          setIsStale(true);
        }
        if (exps && exps.length > 0) {
          setAllExpenses(exps);
          clientDataCache.setExpenses(exps);
        }
        if (incs && incs.length > 0) {
          setAllIncomes(incs);
          clientDataCache.setIncomes(incs);
        }
      })
      .catch((err) => {
        console.error('Failed to load finance overview:', err);
        if (!summary) {
          setLoadError('Failed to load financial data. Please check your network connection.');
        } else {
          setIsStale(true);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSummary(filter, customStart, customEnd);
  }, [filter, refreshKey]);

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setRangeError(null);
    if (newFilter === 'custom') {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
      fetchSummary(newFilter);
    }
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      setRangeError('Please choose both start and end dates.');
      return;
    }
    if (customStart > customEnd) {
      setRangeError('Start date must be before or equal to end date.');
      return;
    }
    setRangeError(null);
    fetchSummary('custom', customStart, customEnd);
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Finance Workspace Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <ThemeSegmentedControl<FinanceSubTab>
          ariaLabel="Finance sections"
          value={subTab}
          onChange={setSubTab}
          options={[
            { id: 'overview', label: 'Overview & Budgets' },
            { id: 'daily', label: 'Daily Tracker' },
            { id: 'calendar', label: 'Calendar' },
            { id: 'income', label: 'Income' },
            { id: 'expenses', label: 'Expenses' },
            { id: 'savings', label: 'Savings Goals' },
            { id: 'vaults', label: 'Joint Vaults' },
            { id: 'sandbox', label: 'What-If Sandbox' },
            { id: 'inflation', label: 'Inflation Goals' },
            { id: 'emergency', label: 'Emergency Sheet' },
            { id: 'reports', label: 'Reports' },
          ]}
        />
        <div className="flex items-center gap-2">
          <ThemeButton variant="secondary" size="sm" onClick={() => setCurrentTab('calendar')}>
            <Calendar className="w-3.5 h-3.5" /> Financial Calendar
          </ThemeButton>
          <ThemeButton variant="secondary" size="sm" onClick={() => setTrashModalOpen(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Trash Bin
          </ThemeButton>
        </div>
      </div>

      {subTab === 'daily' ? (
        <DailyExpenseTracker onOpenQuickAction={(type, date) => onOpenQuickAction(type || 'expense', date)} />
      ) : subTab === 'calendar' ? (
        <FinancialCalendarView onOpenQuickAction={() => onOpenQuickAction('expense')} />
      ) : subTab === 'income' ? (
        <IncomeManager />
      ) : subTab === 'expenses' ? (
        <ExpenseManager />
      ) : subTab === 'savings' ? (
        <BudgetSavingsManager showBudgets={false} showSavings={true} />
      ) : subTab === 'vaults' ? (
        <JointVaultsView />
      ) : subTab === 'sandbox' ? (
        <WhatIfFinancialSandbox />
      ) : subTab === 'inflation' ? (
        <InflationGoalCalculator />
      ) : subTab === 'emergency' ? (
        <EmergencyAssetSummary />
      ) : subTab === 'reports' ? (
        <FinancialReportsView />
      ) : (
        <>
          {/* Top Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
            <ThemeSegmentedControl<string>
          ariaLabel="Financial date range filter"
          value={filter}
          onChange={handleFilterChange}
          options={[
            { id: 'today', label: 'Today' },
            { id: 'this_week', label: 'This Week' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'custom', label: 'Custom' },
          ]}
        />

        <ThemeButton variant="secondary" size="sm" onClick={() => onOpenQuickAction('expense')} className="shrink-0">
          <Plus className="w-3.5 h-3.5" />
          <span>Add Transaction</span>
        </ThemeButton>
      </div>

      {/* Stale Cache Notice */}
      {isStale && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs font-medium">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Cached financial metrics: Displaying previously saved records while reconnecting.</span>
          </div>
          <button
            onClick={() => fetchSummary()}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 transition-colors text-xs font-semibold shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Custom Date Range Picker */}
      <AnimatePresence initial={false}>
        {showCustomRange && (
          <motion.div
            key="custom-range-panel"
            initial={isDisabled ? false : { opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
            transition={{
              duration: MOTION_DURATION.card * Math.max(0.55, factor || 0.01),
              ease: MOTION_EASING.decelerate,
            }}
            className="overflow-hidden"
          >
            <ThemeCard className="p-4">
              <form onSubmit={handleApplyCustom} noValidate className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <label htmlFor="custom-range-from" className="text-[var(--ff-text-muted)]">
                      From:
                    </label>
                    <ThemeInput
                      id="custom-range-from"
                      type="date"
                      required
                      value={customStart}
                      onChange={(e) => {
                        setCustomStart(e.target.value);
                        if (rangeError) setRangeError(null);
                      }}
                      className="w-auto px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="custom-range-to" className="text-[var(--ff-text-muted)]">
                      To:
                    </label>
                    <ThemeInput
                      id="custom-range-to"
                      type="date"
                      required
                      value={customEnd}
                      onChange={(e) => {
                        setCustomEnd(e.target.value);
                        if (rangeError) setRangeError(null);
                      }}
                      className="w-auto px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <ThemeButton type="submit" variant="primary" size="sm" loading={loading}>
                    Apply Range
                  </ThemeButton>
                </div>
                <ValidationMessage message={rangeError} tone="error" />
              </form>
            </ThemeCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4 Core Financial KPI Cards */}
      {summary && (
        <MotionStaggerGrid
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          style={{ gap: 'var(--ff-grid-gap)' }}
        >
          {/* Total Income */}
          <MotionStaggerItem>
            <ThemeCard
              variant="3d"
              className="h-full cursor-pointer hover:border-[var(--ff-success)]/60 hover:shadow-md transition-all group"
              onClick={() => setBreakdownModal('income')}
              role="button"
              tabIndex={0}
              aria-label="View Total Income breakdown"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setBreakdownModal('income');
                }
              }}
            >
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium group-hover:text-[var(--ff-text-primary)] transition-colors">
                    Total Income
                  </span>
                  <span className="text-[10px] text-[var(--ff-success)] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    Breakdown <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
                <div
                  className="w-7 h-7 flex items-center justify-center shrink-0"
                  style={{
                    borderRadius: 'var(--ff-radius-badge)',
                    background: 'var(--ff-success-soft)',
                    color: 'var(--ff-success)',
                  }}
                >
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={summary.totalIncomePaise}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)] mt-1">
                <span>Salary, freelance &amp; investments</span>
                <span className="text-[10px] font-semibold text-[var(--ff-accent-text)]">Click to inspect</span>
              </div>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Total Expenses */}
          <MotionStaggerItem>
            <ThemeCard
              variant="3d"
              className="h-full cursor-pointer hover:border-[var(--ff-danger)]/60 hover:shadow-md transition-all group"
              onClick={() => setBreakdownModal('expense')}
              role="button"
              tabIndex={0}
              aria-label="View Total Expenses breakdown"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setBreakdownModal('expense');
                }
              }}
            >
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium group-hover:text-[var(--ff-text-primary)] transition-colors">
                    Total Expenses
                  </span>
                  <span className="text-[10px] text-[var(--ff-danger)] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    Breakdown <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
                <div
                  className="w-7 h-7 flex items-center justify-center shrink-0"
                  style={{
                    borderRadius: 'var(--ff-radius-badge)',
                    background: 'var(--ff-danger-soft)',
                    color: 'var(--ff-danger)',
                  }}
                >
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={summary.totalExpensePaise}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                <div className="flex items-center gap-1.5">
                  <span>
                    Fixed: {formatCurrency(summary.fixedExpensesPaise, currency, { compact: true })}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Var: {formatCurrency(summary.variableExpensesPaise, currency, { compact: true })}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-[var(--ff-accent-text)]">Click to inspect</span>
              </div>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Net Balance / Cashflow */}
          <MotionStaggerItem>
            <ThemeCard variant="3d" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Net Cashflow (Period)</span>
                <div
                  className="w-7 h-7 flex items-center justify-center"
                  style={{
                    borderRadius: 'var(--ff-radius-badge)',
                    background:
                      summary.remainingBalancePaise >= 0
                        ? 'var(--ff-accent-soft)'
                        : 'var(--ff-danger-soft)',
                    color:
                      summary.remainingBalancePaise >= 0
                        ? 'var(--ff-accent-text)'
                        : 'var(--ff-danger)',
                  }}
                >
                  <Scale className="w-4 h-4" />
                </div>
              </div>
              <div
                className="text-2xl font-bold font-mono tabular-nums"
                style={{
                  color:
                    summary.remainingBalancePaise >= 0
                      ? 'var(--ff-text-primary)'
                      : 'var(--ff-danger)',
                }}
              >
                <AnimatedNumber
                  value={summary.remainingBalancePaise}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                Net savings (Income - Expenses)
              </span>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Bills Status Summary */}
          <MotionStaggerItem>
            <ThemeCard variant="3d" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Bill Commitments</span>
                <div
                  className="w-7 h-7 flex items-center justify-center"
                  style={{
                    borderRadius: 'var(--ff-radius-badge)',
                    background: 'var(--ff-warning-soft)',
                    color: 'var(--ff-warning)',
                  }}
                >
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={summary.totalUnpaidAmountPaise}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className="font-semibold" style={{ color: 'var(--ff-warning)' }}>
                  {summary.unpaidBillsCount} Pending
                </span>
                <span aria-hidden="true" className="text-[var(--ff-text-muted)]">
                  ·
                </span>
                <span className="font-semibold" style={{ color: 'var(--ff-success)' }}>
                  {summary.paidBillsCount} Paid (
                  {formatCurrency(summary.totalPaidAmountPaise, currency, { compact: true })})
                </span>
              </div>
            </ThemeCard>
          </MotionStaggerItem>
        </MotionStaggerGrid>
      )}

      {/* Analytics Charts Submodule + Monthly Budgets */}
      {loading && !summary ? (
        <SkeletonDashboard />
      ) : loadError && !summary ? (
        <ThemeCard className="p-8 text-center my-6">
          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-[var(--ff-text-primary)] mb-1">
              Unable to Load Financial Overview
            </h3>
            <p className="text-sm text-[var(--ff-text-muted)] mb-5">
              {loadError}
            </p>
            <ThemeButton variant="primary" size="sm" onClick={() => fetchSummary()}>
              <RotateCcw className="w-4 h-4 mr-2" />
              <span>Retry Connection</span>
            </ThemeButton>
          </div>
        </ThemeCard>
      ) : summary ? (
        <>
          <SmartSpendingInsightsCard expenses={allExpenses} incomes={allIncomes} />
          <BudgetSavingsManager showBudgets={true} showSavings={false} />
          <AnalyticsCharts data={summary} />
        </>
      ) : null}
        </>
      )}

      {/* Modal: Interactive Breakdown for Total Expenses & Total Income */}
      <ThemeModal
        isOpen={breakdownModal !== null}
        onClose={() => setBreakdownModal(null)}
        title={
          breakdownModal === 'expense'
            ? 'Total Expenses Breakdown & Where Spent'
            : 'Total Income Breakdown & Sources'
        }
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          {breakdownModal === 'expense' && (
            <>
              {/* Header card with summary & Add Expense button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--ff-danger-soft)] border border-[var(--ff-danger)]/20">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ff-danger)] uppercase tracking-wide">
                    <Receipt className="w-4 h-4" />
                    <span>Total Expenses ({filter.replace('_', ' ')})</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-[var(--ff-danger)] mt-0.5">
                    {formatCurrency(summary?.totalExpensePaise || 0, currency)}
                  </div>
                  <div className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">
                    {filteredExpenses.length} expense item{filteredExpenses.length === 1 ? '' : 's'} recorded between {summary?.startDate || 'start'} and {summary?.endDate || 'end'}
                  </div>
                </div>

                <ThemeButton
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setBreakdownModal(null);
                    onOpenQuickAction('expense');
                  }}
                  className="shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Expense</span>
                </ThemeButton>
              </div>

              {/* Where money was spent: Category Breakdown */}
              {expenseCategoryBreakdown.length > 0 && (
                <div className="space-y-2 p-3 rounded-xl bg-[var(--ff-surface-muted)]/50 border border-[var(--ff-border-color)]">
                  <span className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                    <PieChart className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                    <span>Where Money Was Spent (By Category)</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {expenseCategoryBreakdown.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 rounded-lg bg-[var(--ff-surface-card)] text-xs border border-[var(--ff-border-color)]/60"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-[var(--ff-text-primary)] block truncate">{item.name}</span>
                          <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">{item.percentage}% of total</span>
                        </div>
                        <span className="font-mono font-bold text-[var(--ff-danger)] shrink-0">
                          {formatCurrency(item.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Itemized Activity List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                    Itemized Expenses ({filteredExpenses.length})
                  </span>
                  <span className="text-[11px] text-[var(--ff-text-muted)]">
                    Chronological order
                  </span>
                </div>

                {filteredExpenses.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-dashed border-[var(--ff-border-color)] space-y-2">
                    <Receipt className="w-8 h-8 mx-auto text-[var(--ff-text-muted)] opacity-60" />
                    <p className="text-xs font-medium text-[var(--ff-text-muted)]">No expenses recorded for this timeframe.</p>
                    <ThemeButton
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setBreakdownModal(null);
                        onOpenQuickAction('expense');
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Log First Expense</span>
                    </ThemeButton>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto scrollbar-thin divide-y divide-[var(--ff-border-color)]/50 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
                    {filteredExpenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="p-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--ff-surface-muted)]/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                              {exp.description}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] uppercase shrink-0">
                              {exp.paymentMethod.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-2 mt-0.5 font-mono">
                            <span>{exp.date}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[var(--ff-text-secondary)]">
                              {exp.categoryName || exp.categoryId || 'General'}
                            </span>
                            {exp.notes && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate italic max-w-[140px]">{exp.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-[var(--ff-danger)] shrink-0">
                          -{formatCurrency(exp.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {breakdownModal === 'income' && (
            <>
              {/* Header card with summary & Add Income button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--ff-success-soft)] border border-[var(--ff-success)]/20">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ff-success)] uppercase tracking-wide">
                    <CreditCard className="w-4 h-4" />
                    <span>Total Income ({filter.replace('_', ' ')})</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-[var(--ff-success)] mt-0.5">
                    +{formatCurrency(summary?.totalIncomePaise || 0, currency)}
                  </div>
                  <div className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">
                    {filteredIncomes.length} income credit{filteredIncomes.length === 1 ? '' : 's'} recorded between {summary?.startDate || 'start'} and {summary?.endDate || 'end'}
                  </div>
                </div>

                <ThemeButton
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setBreakdownModal(null);
                    onOpenQuickAction('income');
                  }}
                  className="shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Income</span>
                </ThemeButton>
              </div>

              {/* Where income came from: Category Breakdown */}
              {incomeCategoryBreakdown.length > 0 && (
                <div className="space-y-2 p-3 rounded-xl bg-[var(--ff-surface-muted)]/50 border border-[var(--ff-border-color)]">
                  <span className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                    <PieChart className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                    <span>Income Sources / Categories</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {incomeCategoryBreakdown.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between p-2 rounded-lg bg-[var(--ff-surface-card)] text-xs border border-[var(--ff-border-color)]/60"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-[var(--ff-text-primary)] block truncate">{item.name}</span>
                          <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">{item.percentage}% of total</span>
                        </div>
                        <span className="font-mono font-bold text-[var(--ff-success)] shrink-0">
                          +{formatCurrency(item.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Itemized Activity List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                    Itemized Income Records ({filteredIncomes.length})
                  </span>
                  <span className="text-[11px] text-[var(--ff-text-muted)]">
                    Chronological order
                  </span>
                </div>

                {filteredIncomes.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-dashed border-[var(--ff-border-color)] space-y-2">
                    <CreditCard className="w-8 h-8 mx-auto text-[var(--ff-text-muted)] opacity-60" />
                    <p className="text-xs font-medium text-[var(--ff-text-muted)]">No income recorded for this timeframe.</p>
                    <ThemeButton
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setBreakdownModal(null);
                        onOpenQuickAction('income');
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Record First Income</span>
                    </ThemeButton>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto scrollbar-thin divide-y divide-[var(--ff-border-color)]/50 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
                    {filteredIncomes.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--ff-surface-muted)]/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-[var(--ff-text-primary)] truncate block">
                            {inc.source}
                          </span>
                          <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-2 mt-0.5 font-mono">
                            <span>{inc.date}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[var(--ff-text-secondary)]">{inc.category}</span>
                            {inc.notes && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate italic max-w-[140px]">{inc.notes}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-[var(--ff-success)] shrink-0">
                          +{formatCurrency(inc.amountPaise, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" size="sm" onClick={() => setBreakdownModal(null)}>
              Close
            </ThemeButton>
            <ThemeButton
              variant="primary"
              size="sm"
              onClick={() => {
                const target = breakdownModal || 'expense';
                setBreakdownModal(null);
                onOpenQuickAction(target);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{breakdownModal === 'expense' ? '+ Add Another Expense' : '+ Record Another Income'}</span>
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>
    </div>
  );
};
