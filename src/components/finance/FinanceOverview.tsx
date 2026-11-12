import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FinanceSummaryData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { AnalyticsCharts } from './AnalyticsCharts.tsx';
import { IncomeManager } from './IncomeManager.tsx';
import { ExpenseManager } from './ExpenseManager.tsx';
import { BudgetSavingsManager } from './BudgetSavingsManager.tsx';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
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
} from 'lucide-react';

interface FinanceOverviewProps {
  onOpenQuickAction: () => void;
}

type FinanceSubTab = 'overview' | 'income' | 'expenses' | 'savings';

export const FinanceOverview: React.FC<FinanceOverviewProps> = ({ onOpenQuickAction }) => {
  const { currency, refreshKey, setTrashModalOpen } = useApp();
  const [subTab, setSubTab] = useState<FinanceSubTab>('overview');
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ThemeSegmentedControl<FinanceSubTab>
          ariaLabel="Finance sections"
          value={subTab}
          onChange={setSubTab}
          options={[
            { id: 'overview', label: 'Overview & Budgets' },
            { id: 'income', label: 'Income' },
            { id: 'expenses', label: 'Expenses & Recurring' },
            { id: 'savings', label: 'Savings Goals' },
          ]}
        />
        <ThemeButton variant="secondary" size="sm" onClick={() => setTrashModalOpen(true)}>
          <Trash2 className="w-3.5 h-3.5" /> Trash Bin
        </ThemeButton>
      </div>

      {subTab === 'income' ? (
        <IncomeManager />
      ) : subTab === 'expenses' ? (
        <ExpenseManager />
      ) : subTab === 'savings' ? (
        <BudgetSavingsManager showBudgets={false} showSavings={true} />
      ) : (
        <>
          {/* Top Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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

        <ThemeButton variant="primary" size="md" onClick={onOpenQuickAction} className="shrink-0">
          <Plus className="w-4 h-4" />
          <span>Add Transaction</span>
        </ThemeButton>
      </div>

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
            <ThemeCard variant="interactive" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Total Income</span>
                <div
                  className="w-7 h-7 flex items-center justify-center"
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
              <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                Salary, freelance &amp; investments
              </span>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Total Expenses */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Total Expenses</span>
                <div
                  className="w-7 h-7 flex items-center justify-center"
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
              <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                <span>
                  Fixed: {formatCurrency(summary.fixedExpensesPaise, currency, { compact: true })}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Variable:{' '}
                  {formatCurrency(summary.variableExpensesPaise, currency, { compact: true })}
                </span>
              </div>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Remaining Balance */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Remaining Balance</span>
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
                Net balance (Income - Expenses)
              </span>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Bills Status Summary */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="h-full">
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
      ) : summary ? (
        <>
          <BudgetSavingsManager showBudgets={true} showSavings={false} />
          <AnalyticsCharts data={summary} />
        </>
      ) : null}
        </>
      )}
    </div>
  );
};
