import React, { useEffect, useState } from 'react';
import {
  Download,
  Printer,
  BarChart3,
  Clock,
  CheckSquare,
  Wallet,
  PiggyBank,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { getTodayDateString, formatDateInTimezone } from '../../lib/dateTime.ts';
import {
  exportFinanceCsv,
  exportProductivityCsv,
  openPrintableReport,
} from '../../lib/exportReports.ts';
import {
  Bill,
  ExpenseTransaction,
  FinanceSummaryData,
  FocusSession,
  FocusStatsData,
  IncomeTransaction,
  SavingsGoal,
  Task,
} from '../../types/index.ts';
import { AnalyticsCharts } from '../finance/AnalyticsCharts.tsx';
import { ThemeButton, ThemeCard, ThemeSegmentedControl } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  EmptyStateIllustration,
  MotionStaggerGrid,
  MotionStaggerItem,
} from '../ui/MotionPrimitives.tsx';
import { GraphStudioView } from '../graph-studio/GraphStudioView.tsx';

export const AnalyticsReportsView: React.FC = () => {
  const { user, currency, refreshKey, showToast, settings, setCurrentTab } = useApp();
  const [viewMode, setViewMode] = useState<'studio' | 'reports'>('studio');
  const [filter, setFilter] = useState<string>('this_month');
  const [financeSummary, setFinanceSummary] = useState<FinanceSummaryData | null>(null);
  const [focusStats, setFocusStats] = useState<FocusStatsData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  useEffect(() => {
    Promise.all([
      api.getFinanceSummary(filter).catch(() => null),
      api.getFocusStats().catch(() => null),
      api.getTasks().catch(() => [] as Task[]),
      api.getFocusSessions().catch(() => [] as FocusSession[]),
      api.getIncomes().catch(() => [] as IncomeTransaction[]),
      api.getExpenses().catch(() => [] as ExpenseTransaction[]),
      api.getBills().catch(() => [] as Bill[]),
      api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
    ])
      .then(([fs, foc, t, s, inc, exp, b, sg]) => {
        setFinanceSummary(fs);
        setFocusStats(foc);
        setTasks((t || []).filter((item) => !item.deletedAt));
        setSessions(s || []);
        setIncomes((inc || []).filter((item) => !item.deletedAt));
        setExpenses((exp || []).filter((item) => !item.deletedAt));
        setBills((b || []).filter((item) => !item.deletedAt));
        setGoals((sg || []).filter((item) => !(item as { deletedAt?: string | null }).deletedAt));
      })
      .catch(console.error);
  }, [filter, refreshKey]);

  const todayStr = getTodayDateString(settings?.timezone);
  const [yr, mo, dy] = todayStr.split('-').map(Number);
  const monthPrefix = `${yr}-${String(mo).padStart(2, '0')}`;
  const prevMonthDate = new Date(Date.UTC(yr, mo - 2, 1));
  const lastMonthPrefix = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const weekStartDate = new Date(Date.UTC(yr, mo - 1, dy));
  const dayOfWeek = weekStartDate.getUTCDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() + diffToMon);
  const weekStartStr = weekStartDate.toISOString().slice(0, 10);

  const isDateInRange = (dateStr?: string | null): boolean => {
    if (!dateStr) return false;
    const d = dateStr.length > 10 ? formatDateInTimezone(new Date(dateStr), settings?.timezone) : dateStr;
    if (filter === 'today') return d === todayStr;
    if (filter === 'this_week') return d >= weekStartStr && d <= todayStr;
    if (filter === 'last_month') return d.startsWith(lastMonthPrefix);
    return d.startsWith(monthPrefix);
  };

  const filteredTasks = tasks.filter((t) =>
    isDateInRange(t.completedAt || t.dueDate || t.updatedAt || t.createdAt)
  );
  const completedTasks = filteredTasks.filter((t) => t.status === 'completed').length;
  const pendingTasks = filteredTasks.filter((t) => t.status !== 'completed').length;
  const completionRate =
    filteredTasks.length > 0 ? Math.round((completedTasks / filteredTasks.length) * 100) : 0;

  const filteredWorkSessions = sessions.filter(
    (s) => s.mode === 'work' && s.completed && isDateInRange(s.startedAt)
  );
  const periodFocusMinutes = filteredWorkSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const periodFocusSessionsCount = filteredWorkSessions.length;
  const focusLabel =
    filter === 'today'
      ? 'Today Focus Volume'
      : filter === 'this_week'
        ? 'Week Focus Volume'
        : filter === 'last_month'
          ? 'Last Month Focus Volume'
          : 'Month Focus Volume';

  const totalSavedPaise = goals.reduce((acc, g) => acc + g.savedPaise, 0);
  const monthlyCap = settings?.monthlyBudgetPaise || 0;
  const budgetAdherence =
    monthlyCap > 0 && financeSummary
      ? Math.max(0, 100 - Math.round((financeSummary.totalExpensePaise / monthlyCap) * 100))
      : 100;

  const handlePrintPdf = () => {
    const ok = openPrintableReport({
      userName: user?.name || 'FocusFlow User',
      rangeLabel: filter.replace('_', ' ').toUpperCase(),
      totalFocusMinutes: periodFocusMinutes,
      completedTasks,
      pendingTasks,
      totalIncomePaise: financeSummary?.totalIncomePaise || 0,
      totalExpensePaise: financeSummary?.totalExpensePaise || 0,
      savingsGoals: goals,
      topCategories: financeSummary?.categoryBreakdown || [],
      currency,
    });
    if (!ok) {
      showToast('Pop-up blocked — allow pop-ups to open the print PDF report.', 'error');
    }
  };

  const isPeriodEmpty =
    !financeSummary ||
    (financeSummary.totalIncomePaise === 0 &&
      financeSummary.totalExpensePaise === 0 &&
      periodFocusMinutes === 0 &&
      filteredTasks.length === 0 &&
      filteredWorkSessions.length === 0);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* View Mode Switcher: Graph Studio vs Executive Reports */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ThemeSegmentedControl<'studio' | 'reports'>
          ariaLabel="Analytics view mode"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { id: 'studio', label: 'Advanced Graph Studio' },
            { id: 'reports', label: 'Executive Reports & Statements' },
          ]}
        />
      </div>

      {viewMode === 'studio' ? (
        <GraphStudioView />
      ) : (
        <>
          {/* Export & Date Filter Header */}
          <ThemeCard className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <h2 className="ff-heading text-base font-bold text-[var(--ff-text-primary)]">
                  Unified Productivity &amp; Financial Intelligence
                </h2>
              </div>
              <p className="text-xs text-[var(--ff-text-muted)]">
                100% deterministic analytics derived directly from verified sessions, tasks, and ledger records.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={() => setCurrentTab('exports')}
                className="flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" /> Unified Export Center
              </ThemeButton>
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => exportFinanceCsv({ incomes, expenses, bills })}
              >
                <Download className="w-3.5 h-3.5" /> Finance CSV
              </ThemeButton>
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => exportProductivityCsv({ tasks, sessions })}
              >
                <Download className="w-3.5 h-3.5" /> Tasks CSV
              </ThemeButton>
              <ThemeButton variant="secondary" size="sm" onClick={handlePrintPdf}>
                <Printer className="w-3.5 h-3.5" /> Quick Print PDF
              </ThemeButton>
            </div>
          </ThemeCard>

          {/* Cross-Domain KPI Comparison */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ThemeSegmentedControl<string>
              ariaLabel="Analytics timeframe"
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'today', label: 'Today' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
              ]}
            />
          </div>

          {isPeriodEmpty ? (
            <ThemeCard className="py-14">
              <EmptyStateIllustration
                icon={<BarChart3 className="w-9 h-9 text-[var(--ff-accent-text)]" />}
                title="No activity recorded in this period"
                description="Complete tasks, run Pomodoro sessions, or record income & expenses to unlock cross-domain productivity and financial insights."
                action={
                  <ThemeButton variant="primary" size="sm" onClick={() => setCurrentTab('dashboard')}>
                    Go to Dashboard
                  </ThemeButton>
                }
              />
            </ThemeCard>
          ) : (
            <>
              <MotionStaggerGrid
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                style={{ gap: 'var(--ff-grid-gap)' }}
              >
                <MotionStaggerItem>
                  <ThemeCard>
                    <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                      <span>Task Completion Rate</span>
                      <CheckSquare className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
                      <AnimatedNumber value={completionRate} format={(v) => `${Math.round(v)}%`} />
                    </div>
                    <span className="text-[11px] text-[var(--ff-text-muted)]">
                      {completedTasks} finished · {pendingTasks} active
                    </span>
                  </ThemeCard>
                </MotionStaggerItem>

                <MotionStaggerItem>
                  <ThemeCard>
                    <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                      <span>{focusLabel}</span>
                      <Clock className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
                      <AnimatedNumber value={periodFocusMinutes} format={(v) => `${Math.round(v)} min`} />
                    </div>
                    <span className="text-[11px] text-[var(--ff-text-muted)]">
                      {periodFocusSessionsCount} work sessions
                    </span>
                  </ThemeCard>
                </MotionStaggerItem>

                <MotionStaggerItem>
                  <ThemeCard>
                    <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                      <span>Budget Headroom</span>
                      <Wallet className="w-4 h-4 text-[var(--ff-warning)]" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
                      {monthlyCap > 0 ? (
                        <AnimatedNumber value={budgetAdherence} format={(v) => `${Math.round(v)}%`} />
                      ) : (
                        'Unbounded'
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--ff-text-muted)]">
                      {monthlyCap > 0
                        ? `Cap: ${formatCurrency(monthlyCap, currency)}`
                        : 'Configure cap in Finance'}
                    </span>
                  </ThemeCard>
                </MotionStaggerItem>

                <MotionStaggerItem>
                  <ThemeCard>
                    <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                      <span>Savings Reserves</span>
                      <PiggyBank className="w-4 h-4 text-[var(--ff-success)]" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
                      <AnimatedNumber value={totalSavedPaise} format={(paise) => formatCurrency(Math.round(paise), currency)} />
                    </div>
                    <span className="text-[11px] text-[var(--ff-text-muted)]">
                      Across {goals.length} active savings goal{goals.length === 1 ? '' : 's'}
                    </span>
                  </ThemeCard>
                </MotionStaggerItem>
              </MotionStaggerGrid>

              <AnalyticsCharts data={financeSummary} />
            </>
          )}
        </>
      )}
    </div>
  );
};
