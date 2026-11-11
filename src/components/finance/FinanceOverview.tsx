import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FinanceSummaryData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { AnalyticsCharts } from './AnalyticsCharts.tsx';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  TrendingUp,
  TrendingDown,
  Scale,
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
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
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
      {showCustomRange && (
        <ThemeCard className="p-4">
          <form onSubmit={handleApplyCustom} className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <label htmlFor="custom-range-from" className="text-[var(--ff-text-muted)]">
                From:
              </label>
              <ThemeInput
                id="custom-range-from"
                type="date"
                required
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
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
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-auto px-2.5 py-1.5 text-xs"
              />
            </div>
            <ThemeButton type="submit" variant="primary" size="sm">
              Apply Range
            </ThemeButton>
          </form>
        </ThemeCard>
      )}

      {/* 4 Core Financial KPI Cards */}
      {summary && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          style={{ gap: 'var(--ff-grid-gap)' }}
        >
          {/* Total Income */}
          <ThemeCard variant="interactive">
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
              {formatCurrency(summary.totalIncomePaise, currency)}
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              Salary, freelance &amp; investments
            </span>
          </ThemeCard>

          {/* Total Expenses */}
          <ThemeCard variant="interactive">
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
              {formatCurrency(summary.totalExpensePaise, currency)}
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

          {/* Remaining Balance */}
          <ThemeCard variant="interactive">
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
              {formatCurrency(summary.remainingBalancePaise, currency)}
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              Net balance (Income - Expenses)
            </span>
          </ThemeCard>

          {/* Bills Status Summary */}
          <ThemeCard variant="interactive">
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
              {formatCurrency(summary.totalUnpaidAmountPaise, currency)}
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
        </div>
      )}

      {/* Analytics Charts Submodule */}
      {loading && !summary ? (
        <div className="p-12 text-center text-xs text-[var(--ff-text-muted)]">
          Loading financial analytics...
        </div>
      ) : summary ? (
        <AnalyticsCharts data={summary} />
      ) : null}
    </div>
  );
};
