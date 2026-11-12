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

export const AnalyticsReportsView: React.FC = () => {
  const { user, currency, refreshKey, showToast, settings } = useApp();
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
        setTasks(t);
        setSessions(s);
        setIncomes(inc);
        setExpenses(exp);
        setBills(b);
        setGoals(sg);
      })
      .catch(console.error);
  }, [filter, refreshKey]);

  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const pendingTasks = tasks.filter((t) => t.status !== 'completed').length;
  const completionRate =
    tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
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
      totalFocusMinutes: focusStats?.monthMinutes || 0,
      completedTasks,
      pendingTasks,
      totalIncomePaise: financeSummary?.totalIncomePaise || 0,
      totalExpensePaise: financeSummary?.totalExpensePaise || 0,
      savingsGoals: goals,
      topCategories: financeSummary?.categoryBreakdown || [],
    });
    if (!ok) {
      showToast('Pop-up blocked — allow pop-ups to open the print PDF report.', 'error');
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
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
            <Download className="w-3.5 h-3.5" /> Focus &amp; Tasks CSV
          </ThemeButton>
          <ThemeButton variant="primary" size="sm" onClick={handlePrintPdf}>
            <Printer className="w-3.5 h-3.5" /> Export PDF Report
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--ff-grid-gap)' }}>
        <ThemeCard>
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span>Task Completion Rate</span>
            <CheckSquare className="w-4 h-4 text-[var(--ff-accent-text)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
            {completionRate}%
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">
            {completedTasks} finished · {pendingTasks} active
          </span>
        </ThemeCard>

        <ThemeCard>
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span>Month Focus Volume</span>
            <Clock className="w-4 h-4 text-[var(--ff-accent-text)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
            {focusStats?.monthMinutes || 0} min
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">
            {focusStats?.monthSessionsCount || 0} work sessions
          </span>
        </ThemeCard>

        <ThemeCard>
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span>Budget Headroom</span>
            <Wallet className="w-4 h-4 text-[var(--ff-warning)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
            {monthlyCap > 0 ? `${budgetAdherence}%` : 'Unbounded'}
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">
            {monthlyCap > 0
              ? `Cap: ${formatCurrency(monthlyCap, currency)}`
              : 'Configure cap in Finance'}
          </span>
        </ThemeCard>

        <ThemeCard>
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span>Savings Reserves</span>
            <PiggyBank className="w-4 h-4 text-[var(--ff-success)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
            {formatCurrency(totalSavedPaise, currency)}
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">
            Across {goals.length} active savings goal{goals.length === 1 ? '' : 's'}
          </span>
        </ThemeCard>
      </div>

      {financeSummary && <AnalyticsCharts data={financeSummary} />}
    </div>
  );
};
