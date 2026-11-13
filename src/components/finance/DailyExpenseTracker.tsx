import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  Plus,
  AlertTriangle,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Receipt,
  Edit2,
  Trash2,
  Sliders,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import { computeSpendingInsights } from '../../lib/financeIntelligence.ts';
import type { ExpenseTransaction, IncomeTransaction } from '../../types/index.ts';
import { ThemeBadge, ThemeButton, ThemeCard, ThemeInput } from '../ui/ThemePrimitives.tsx';
import { AnimatedNumber, AnimatedProgressBar, EmptyStateIllustration, useMotionPreferences } from '../ui/MotionPrimitives.tsx';

interface DailyExpenseTrackerProps {
  onOpenQuickAction: () => void;
}

export const DailyExpenseTracker: React.FC<DailyExpenseTrackerProps> = ({ onOpenQuickAction }) => {
  const { currency, settings, updateSettings, showToast, refreshKey, triggerRefresh, confirmAction } = useApp();
  const { isDisabled } = useMotionPreferences();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Daily limit editor state
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [dailyLimitInput, setDailyLimitInput] = useState(
    settings?.dailySpendingLimitPaise ? String(Math.round(settings.dailySpendingLimitPaise / 100)) : ''
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getExpenses().catch(() => []), api.getIncomes().catch(() => [])])
      .then(([expList, incList]) => {
        setExpenses(expList);
        setIncomes(incList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const insights = useMemo(() => {
    return computeSpendingInsights({
      expenses,
      incomes,
      settings,
      todayStr: selectedDate,
    });
  }, [expenses, incomes, settings, selectedDate]);

  // Filter transactions for the selected date
  const dayExpenses = useMemo(() => {
    return expenses
      .filter((e) => !e.deletedAt && e.date === selectedDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [expenses, selectedDate]);

  const dayIncomes = useMemo(() => {
    return incomes
      .filter((i) => !i.deletedAt && i.date === selectedDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [incomes, selectedDate]);

  const totalDayExpensesPaise = dayExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const totalDayIncomesPaise = dayIncomes.reduce((s, i) => s + i.amountPaise, 0);
  const netDayFlowPaise = totalDayIncomesPaise - totalDayExpensesPaise;

  // Category breakdown for selected day
  const dayCategories = useMemo(() => {
    const map: Record<string, { name: string; amountPaise: number; color?: string }> = {};
    for (const exp of dayExpenses) {
      const name = exp.categoryName || exp.categoryId || 'General';
      if (!map[name]) {
        map[name] = { name, amountPaise: 0, color: exp.categoryColor };
      }
      map[name].amountPaise += exp.amountPaise;
    }
    return Object.values(map).sort((a, b) => b.amountPaise - a.amountPaise);
  }, [dayExpenses]);

  // Date shifting
  const handleShiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleSaveDailyLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(dailyLimitInput);
    if (!Number.isFinite(num) || num < 0) {
      showToast('Enter a valid non-negative limit', 'error');
      return;
    }
    await updateSettings({ dailySpendingLimitPaise: num === 0 ? undefined : toPaise(num) });
    setIsEditingLimit(false);
    showToast(num === 0 ? 'Cleared daily spending limit' : `Daily spending limit set to ${formatCurrency(toPaise(num), currency)}`, 'success');
  };

  const handleDeleteExpense = async (exp: ExpenseTransaction) => {
    const ok = await confirmAction({
      title: 'Delete Expense',
      message: 'Move this expense to trash?',
      itemLabel: `${exp.description} · ${formatCurrency(exp.amountPaise, currency)}`,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteExpense(exp.id);
      showToast('Moved to Trash', 'info');
      triggerRefresh();
    } catch {
      showToast('Failed to delete expense', 'error');
    }
  };

  const limitPaise = insights.todaySpending.limitPaise;
  const isOverLimit = limitPaise > 0 && totalDayExpensesPaise > limitPaise;
  const limitPct = limitPaise > 0 ? Math.round((totalDayExpensesPaise / limitPaise) * 100) : 0;
  const remainingPaise = Math.max(0, limitPaise - totalDayExpensesPaise);
  const vsYesterday = insights.todaySpending.vsYesterdayPaise;

  const isToday = selectedDate === todayStr;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Top Date Toolbar & Limit Setter */}
      <ThemeCard className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => handleShiftDate(-1)}
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </ThemeButton>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <ThemeInput
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-auto text-xs py-1 px-2.5 font-semibold"
            />
          </div>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => handleShiftDate(1)}
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </ThemeButton>

          {!isToday && (
            <ThemeButton variant="secondary" size="xs" onClick={() => setSelectedDate(todayStr)}>
              Jump to Today
            </ThemeButton>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setIsEditingLimit(!isEditingLimit)}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{limitPaise > 0 ? `Limit: ${formatCurrency(limitPaise, currency)}` : 'Set Daily Limit'}</span>
          </ThemeButton>

          <ThemeButton variant="primary" size="sm" onClick={onOpenQuickAction}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add Expense</span>
          </ThemeButton>
        </div>
      </ThemeCard>

      {/* Daily Limit Editor Form */}
      <AnimatePresence>
        {isEditingLimit && (
          <motion.div
            initial={isDisabled ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ThemeCard className="p-4">
              <form onSubmit={handleSaveDailyLimit} className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-[var(--ff-text-secondary)]">
                  Configure Fixed Daily Spending Limit (₹, enter 0 to reset to automatic safe limit):
                </span>
                <ThemeInput
                  type="number"
                  min="0"
                  step="50"
                  placeholder="e.g. 1500"
                  value={dailyLimitInput}
                  onChange={(e) => setDailyLimitInput(e.target.value)}
                  className="w-36 text-xs py-1"
                />
                <ThemeButton type="submit" variant="primary" size="sm">
                  Save Daily Limit
                </ThemeButton>
                <ThemeButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditingLimit(false)}
                >
                  Cancel
                </ThemeButton>
              </form>
            </ThemeCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4 Stat Micro-Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--ff-grid-gap)' }}>
        {/* Total Expenses */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Expenses on {isToday ? 'Today' : selectedDate}</span>
            <Receipt className="w-4 h-4 text-[var(--ff-danger)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--ff-danger)]">
            <AnimatedNumber value={totalDayExpensesPaise} format={(v) => formatCurrency(v, currency)} />
          </div>
          <div className="text-[11px] flex items-center gap-1 font-medium text-[var(--ff-text-muted)]">
            {vsYesterday === 0 ? (
              <span>Same as previous day</span>
            ) : vsYesterday > 0 ? (
              <span className="text-[var(--ff-danger)] flex items-center">
                <TrendingUp className="w-3 h-3 mr-0.5" /> +{formatCurrency(vsYesterday, currency)} vs yesterday
              </span>
            ) : (
              <span className="text-[var(--ff-success)] flex items-center">
                <TrendingDown className="w-3 h-3 mr-0.5" /> {formatCurrency(Math.abs(vsYesterday), currency)} less than yesterday
              </span>
            )}
          </div>
        </ThemeCard>

        {/* Daily Spending Limit & Remaining */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Daily Budget Limit</span>
            {limitPaise > 0 && (
              <ThemeBadge tone={isOverLimit ? 'danger' : limitPct >= 80 ? 'warning' : 'success'}>
                {isOverLimit ? 'Limit Exceeded' : `${limitPct}% Used`}
              </ThemeBadge>
            )}
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
            {limitPaise > 0 ? formatCurrency(remainingPaise, currency) : 'Uncapped'}
          </div>
          <div className="text-[11px] text-[var(--ff-text-muted)]">
            {limitPaise > 0 ? (
              <span>{isOverLimit ? `Exceeded limit by ${formatCurrency(totalDayExpensesPaise - limitPaise, currency)}` : `Remaining from ${formatCurrency(limitPaise, currency)} allowance`}</span>
            ) : (
              <span>Set daily ceiling to enforce pacing</span>
            )}
          </div>
          {limitPaise > 0 && (
            <AnimatedProgressBar
              value={limitPct}
              tone={isOverLimit ? 'danger' : limitPct >= 80 ? 'warning' : 'success'}
              heightClass="h-1.5"
              ariaLabel="Daily limit progress"
            />
          )}
        </ThemeCard>

        {/* Number of Transactions */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Daily Transaction Count</span>
            <Clock className="w-4 h-4 text-[var(--ff-accent-text)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
            {dayExpenses.length + dayIncomes.length}
          </div>
          <div className="text-[11px] text-[var(--ff-text-muted)]">
            {dayExpenses.length} expense{dayExpenses.length === 1 ? '' : 's'} · {dayIncomes.length} income credit{dayIncomes.length === 1 ? '' : 's'}
          </div>
        </ThemeCard>

        {/* Net Daily Balance */}
        <ThemeCard className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
            <span>Net Cashflow</span>
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: netDayFlowPaise >= 0 ? 'var(--ff-success)' : 'var(--ff-danger)' }}
            />
          </div>
          <div
            className="text-2xl font-bold font-mono"
            style={{ color: netDayFlowPaise >= 0 ? 'var(--ff-success)' : 'var(--ff-danger)' }}
          >
            {netDayFlowPaise >= 0 ? '+' : ''}
            <AnimatedNumber value={netDayFlowPaise} format={(v) => formatCurrency(v, currency)} />
          </div>
          <div className="text-[11px] text-[var(--ff-text-muted)]">
            {totalDayIncomesPaise > 0 ? `Inflow: ${formatCurrency(totalDayIncomesPaise, currency)}` : 'No income recorded today'}
          </div>
        </ThemeCard>
      </div>

      {/* Category Spending Breakdown for Selected Day */}
      {dayCategories.length > 0 && (
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[var(--ff-accent-text)]" />
              Category Breakdown on {selectedDate}
            </h3>
            <span className="text-xs text-[var(--ff-text-muted)]">
              {dayCategories.length} active spending category{dayCategories.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dayCategories.map((c) => {
              const share = totalDayExpensesPaise > 0 ? Math.round((c.amountPaise / totalDayExpensesPaise) * 100) : 0;
              return (
                <div key={c.name} className="ff-surface-subtle p-3 space-y-2 rounded-xl">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--ff-text-primary)] truncate">{c.name}</span>
                    <span className="font-mono font-bold text-[var(--ff-text-primary)]">{formatCurrency(c.amountPaise, currency)}</span>
                  </div>
                  <AnimatedProgressBar
                    value={share}
                    customColor={c.color || 'var(--ff-accent)'}
                    heightClass="h-1.5"
                    ariaLabel={`${c.name} share`}
                  />
                  <div className="text-[10px] text-right font-mono text-[var(--ff-text-muted)]">
                    {share}% of today&apos;s spending
                  </div>
                </div>
              );
            })}
          </div>
        </ThemeCard>
      )}

      {/* Daily Spending Timeline */}
      <ThemeCard className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--ff-accent-text)]" />
            Chronological Daily Spending Timeline
          </h3>
          <span className="text-xs text-[var(--ff-text-muted)]">
            {dayExpenses.length + dayIncomes.length} records on {selectedDate}
          </span>
        </div>

        {dayExpenses.length === 0 && dayIncomes.length === 0 ? (
          <EmptyStateIllustration
            icon={<Receipt className="w-6 h-6" />}
            title={`No spending recorded on ${selectedDate}`}
            description="Tap 'Add Expense' above to log any purchases, bills, or cash spent on this day."
            action={
              <ThemeButton variant="primary" size="sm" onClick={onOpenQuickAction}>
                <Plus className="w-3.5 h-3.5" /> Log First Expense
              </ThemeButton>
            }
          />
        ) : (
          <div className="divide-y ff-divider">
            {/* Show Day Incomes */}
            {dayIncomes.map((inc) => (
              <div key={inc.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--ff-success-surface)] text-[var(--ff-success)]">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--ff-text-primary)]">{inc.source}</h4>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--ff-text-muted)]">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--ff-surface-subtle)] font-medium">
                        {inc.category}
                      </span>
                      {inc.notes && <span className="truncate max-w-[200px]">{inc.notes}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-mono font-bold text-[var(--ff-success)]">
                    +{formatCurrency(inc.amountPaise, currency)}
                  </span>
                </div>
              </div>
            ))}

            {/* Show Day Expenses */}
            {dayExpenses.map((exp) => (
              <div key={exp.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--ff-danger-surface)] text-[var(--ff-danger)]">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--ff-text-primary)]">{exp.description}</h4>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--ff-text-muted)]">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--ff-surface-subtle)] font-medium">
                        {exp.categoryName || exp.categoryId}
                      </span>
                      <span className="uppercase text-[10px] tracking-wider px-1 py-0.2 rounded border border-[var(--ff-border-color)]">
                        {exp.paymentMethod.replace('_', ' ')}
                      </span>
                      {exp.type === 'fixed' && (
                        <span className="text-[10px] text-[var(--ff-accent-text)] font-semibold">Recurring</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-[var(--ff-danger)]">
                      -{formatCurrency(exp.amountPaise, currency)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteExpense(exp)}
                    className="p-1.5 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                    aria-label={`Delete ${exp.description}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ThemeCard>
    </div>
  );
};
