import React, { useMemo } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  PieChart,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { formatCurrency } from '../../lib/currency.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import { computeSpendingInsights } from '../../lib/financeIntelligence.ts';
import type { ExpenseTransaction, IncomeTransaction } from '../../types/index.ts';
import { ThemeBadge, ThemeCard } from '../ui/ThemePrimitives.tsx';

interface SmartSpendingInsightsCardProps {
  expenses: ExpenseTransaction[];
  incomes?: IncomeTransaction[];
}

export const SmartSpendingInsightsCard: React.FC<SmartSpendingInsightsCardProps> = ({
  expenses,
  incomes = [],
}) => {
  const { currency, settings } = useApp();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  const insights = useMemo(() => {
    return computeSpendingInsights({
      expenses,
      incomes,
      settings,
      todayStr,
    });
  }, [expenses, incomes, settings, todayStr]);

  const hasData = expenses.length > 0;
  if (!hasData) return null;

  return (
    <ThemeCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ff-border-color)] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--ff-accent-surface)] text-[var(--ff-accent-text)] flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Smart Spending Insights &amp; Trajectory
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)]">
              100% deterministic patterns derived directly from your verified ledger
            </p>
          </div>
        </div>

        <ThemeBadge tone={insights.isMonthOverMonthIncrease ? 'warning' : 'success'}>
          {insights.lastMonthExpensesPaise > 0
            ? `${insights.isMonthOverMonthIncrease ? '+' : ''}${insights.monthOverMonthPctChange}% vs last month`
            : 'First active tracking month'}
        </ThemeBadge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Insight 1: Top Category */}
        <div className="ff-surface-subtle p-3.5 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Primary Expense Driver</span>
            <PieChart className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
          </div>
          <div className="text-base font-bold text-[var(--ff-text-primary)] truncate">
            {insights.topCategory ? insights.topCategory.name : 'None'}
          </div>
          <div className="text-xs font-mono font-bold text-[var(--ff-accent-text)]">
            {insights.topCategory
              ? `${formatCurrency(insights.topCategory.amountPaise, currency)} (${insights.topCategory.pctShare}% of outflow)`
              : 'No expenses'}
          </div>
        </div>

        {/* Insight 2: Peak Weekday */}
        <div className="ff-surface-subtle p-3.5 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Peak Spending Weekday</span>
            <Calendar className="w-3.5 h-3.5 text-[var(--ff-warning)]" />
          </div>
          <div className="text-base font-bold text-[var(--ff-text-primary)] truncate">
            {insights.highestWeekday ? `${insights.highestWeekday.dayName}s` : 'Evenly Distributed'}
          </div>
          <div className="text-xs font-mono text-[var(--ff-text-muted)]">
            {insights.highestWeekday
              ? `${insights.highestWeekday.pctShare}% of month's outflow on this day`
              : 'Consistent spend'}
          </div>
        </div>

        {/* Insight 3: Daily Average */}
        <div className="ff-surface-subtle p-3.5 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Daily Outflow Velocity</span>
            <TrendingDown className="w-3.5 h-3.5 text-[var(--ff-danger)]" />
          </div>
          <div className="text-base font-bold font-mono text-[var(--ff-text-primary)]">
            {formatCurrency(insights.avgDailySpendPaise, currency)}
            <span className="text-xs font-normal text-[var(--ff-text-muted)]"> / active day</span>
          </div>
          <div className="text-xs text-[var(--ff-text-muted)]">
            Across {insights.activeSpendingDaysCount} day{insights.activeSpendingDaysCount === 1 ? '' : 's'} with transactions
          </div>
        </div>

        {/* Insight 4: Highest Spend Day */}
        <div className="ff-surface-subtle p-3.5 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Peak Single Expense Day</span>
            <AlertCircle className="w-3.5 h-3.5 text-[var(--ff-danger)]" />
          </div>
          <div className="text-base font-bold font-mono text-[var(--ff-text-primary)]">
            {insights.highestSpendingDay ? formatCurrency(insights.highestSpendingDay.amountPaise, currency) : '₹0'}
          </div>
          <div className="text-xs text-[var(--ff-text-muted)]">
            {insights.highestSpendingDay ? `Logged on ${insights.highestSpendingDay.date}` : 'No records yet'}
          </div>
        </div>
      </div>

      {/* Surging Categories Warning if any */}
      {insights.increasingCategories.length > 0 && (
        <div className="p-3 rounded-xl border border-[var(--ff-warning)]/30 bg-[var(--ff-warning-surface)] space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ff-warning)]">
            <TrendingUp className="w-4 h-4" />
            <span>Categories Trending Higher Than Previous Month</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {insights.increasingCategories.slice(0, 3).map((cat) => (
              <div key={cat.name} className="p-2 rounded bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                <span className="font-semibold text-[var(--ff-text-primary)] block truncate">{cat.name}</span>
                <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)] mt-1">
                  <span>+{formatCurrency(cat.deltaPaise, currency)}</span>
                  <span className="text-[var(--ff-danger)] font-bold">+{cat.pctChange}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ThemeCard>
  );
};
