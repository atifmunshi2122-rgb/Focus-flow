import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  Calendar,
  BookOpen,
  DollarSign,
  Clock,
  Sparkles,
  Download,
  RotateCcw,
  AlertCircle,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  addDays,
} from '../../lib/dateTime.ts';
import { ThemeCard, ThemeButton, ThemeSegmentedControl } from '../ui/ThemePrimitives.tsx';
import { MotionStaggerGrid, MotionStaggerItem, AnimatedNumber } from '../ui/MotionPrimitives.tsx';

// Domain Chart Imports
import { StudyActivityHeatmapChart } from './charts/study/StudyActivityHeatmapChart.tsx';
import { SubjectStudyHoursChart } from './charts/study/SubjectStudyHoursChart.tsx';
import { SyllabusTriadProgressChart } from './charts/study/SyllabusTriadProgressChart.tsx';
import { SubjectPerformanceChart } from './charts/study/SubjectPerformanceChart.tsx';
import { StudyTrendsVelocityChart } from './charts/study/StudyTrendsVelocityChart.tsx';

import { MonthlyCashflowChart } from './charts/finance/MonthlyCashflowChart.tsx';
import { BudgetVsActualChart } from './charts/finance/BudgetVsActualChart.tsx';
import { CategorySpendingTrendsChart } from './charts/finance/CategorySpendingTrendsChart.tsx';
import { SavingsGrowthTrendChart } from './charts/finance/SavingsGrowthTrendChart.tsx';
import { LiquidCashflowTimelineChart } from './charts/finance/LiquidCashflowTimelineChart.tsx';

import { FocusHoursTrendChart } from './charts/productivity/FocusHoursTrendChart.tsx';
import { CircadianHeatmapChart } from './charts/productivity/CircadianHeatmapChart.tsx';
import { TaskCompletionTrendChart } from './charts/productivity/TaskCompletionTrendChart.tsx';
import { TaskBurndownChart } from './charts/productivity/TaskBurndownChart.tsx';
import { EstimatedVsActualFocusChart } from './charts/productivity/EstimatedVsActualFocusChart.tsx';

import { HabitCompletionMatrixChart } from './charts/habits/HabitCompletionMatrixChart.tsx';
import { HabitStreakLongevityChart } from './charts/habits/HabitStreakLongevityChart.tsx';
import { WeekdayConsistencyChart } from './charts/habits/WeekdayConsistencyChart.tsx';
import { HabitCompletionTrendChart } from './charts/habits/HabitCompletionTrendChart.tsx';
import { FocusVsSpendCorrelationChart } from './charts/custom/FocusVsSpendCorrelationChart.tsx';

import { GraphDetailModal } from './core/GraphDetailModal.tsx';
import { exportDatasetToCsv } from './core/GraphExport.ts';
import { openPrintableGraphStudioReport } from './core/GraphPrintReports.ts';

// Types
import {
  Task,
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  Bill,
  SavingsGoal,
  BudgetEnvelope,
  Habit,
} from '../../types/index.ts';
import {
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyExam,
  StudyActivityLog,
} from '../../types/study.ts';

export type GraphStudioCategory = 'all' | 'study' | 'finance' | 'productivity' | 'habits';
export type TimeframeFilter = 'today' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export const GraphStudioView: React.FC = () => {
  const { user, currency, settings, refreshKey } = useApp();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  // UI state
  const [activeCategory, setActiveCategory] = useState<GraphStudioCategory>('all');
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('monthly');

  // Date range
  const [startDateStr, setStartDateStr] = useState<string>(() => addDays(todayStr, -29));
  const [endDateStr, setEndDateStr] = useState<string>(todayStr);

  // Detail Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    domain: string;
    tableHeaders: string[];
    tableRows: (string | number)[][];
    chartNode: React.ReactNode | null;
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    domain: '',
    tableHeaders: [],
    tableRows: [],
    chartNode: null,
  });

  // Data states
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [savingsGoals, setGoals] = useState<SavingsGoal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [topics, setTopics] = useState<StudyTopic[]>([]);
  const [revisions, setRevisions] = useState<StudyRevision[]>([]);
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [activityLogs, setActivityLogs] = useState<StudyActivityLog[]>([]);

  // Update date range based on timeframe selection
  useEffect(() => {
    if (timeframe === 'today') {
      setStartDateStr(todayStr);
      setEndDateStr(todayStr);
    } else if (timeframe === 'weekly') {
      setStartDateStr(addDays(todayStr, -6));
      setEndDateStr(todayStr);
    } else if (timeframe === 'monthly') {
      setStartDateStr(addDays(todayStr, -29));
      setEndDateStr(todayStr);
    } else if (timeframe === 'yearly') {
      setStartDateStr(addDays(todayStr, -364));
      setEndDateStr(todayStr);
    }
  }, [timeframe, todayStr]);

  // Load all required verified data via API
  const loadStudioData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const [
        taskList,
        sessionList,
        incomeList,
        expenseList,
        envelopeList,
        goalList,
        habitList,
        subjectList,
        topicList,
        revisionList,
        examList,
        activityList,
      ] = await Promise.all([
        api.getTasks().catch(() => [] as Task[]),
        api.getFocusSessions().catch(() => [] as FocusSession[]),
        api.getIncomes().catch(() => [] as IncomeTransaction[]),
        api.getExpenses().catch(() => [] as ExpenseTransaction[]),
        api.getEnvelopes().catch(() => [] as BudgetEnvelope[]),
        api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
        api.getHabits().catch(() => [] as Habit[]),
        api.getStudySubjects().catch(() => [] as StudySubject[]),
        api.getStudyTopics().catch(() => [] as StudyTopic[]),
        api.getStudyRevisions().catch(() => [] as StudyRevision[]),
        api.getStudyExams().catch(() => [] as StudyExam[]),
        api.getStudyActivityLogs(100).catch(() => [] as StudyActivityLog[]),
      ]);

      setTasks(taskList);
      setSessions(sessionList);
      setIncomes(incomeList);
      setExpenses(expenseList);
      setEnvelopes(envelopeList);
      setGoals(goalList);
      setHabits(habitList);
      setSubjects(subjectList);
      setTopics(topicList);
      setRevisions(revisionList);
      setExams(examList);
      setActivityLogs(activityList);
    } catch (err) {
      console.error('Failed to load Graph Studio metrics:', err);
      setFetchError('Failed to retrieve studio metrics. Please verify network and retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudioData();
  }, [loadStudioData, refreshKey]);

  // Summary Metrics calculations
  const summaryMetrics = useMemo(() => {
    // Focus hours in selected range
    const rangeSessions = sessions.filter((s) => {
      if ((!s.completed && s.status !== 'completed') || s.mode !== 'work' || !s.startedAt) return false;
      const d = s.startedAt.slice(0, 10);
      return d >= startDateStr && d <= endDateStr;
    });

    const focusMins = Math.round(
      rangeSessions.reduce(
        (acc, s) =>
          acc +
          (typeof s.actualDurationSeconds === 'number' && s.actualDurationSeconds > 0
            ? s.actualDurationSeconds / 60
            : s.durationMinutes || (s.durationSeconds || 0) / 60),
        0
      )
    );

    // Completed tasks in selected range
    const rangeTasks = tasks.filter(
      (t) => t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) >= startDateStr && t.completedAt.slice(0, 10) <= endDateStr
    );

    // Net cashflow in range
    const rangeIncomes = incomes.filter(
      (i) => !i.deletedAt && i.date && i.date >= startDateStr && i.date <= endDateStr
    );
    const rangeExpenses = expenses.filter(
      (e) => !e.deletedAt && e.date && e.date >= startDateStr && e.date <= endDateStr
    );

    const inflow = rangeIncomes.reduce((s, i) => s + i.amountPaise, 0);
    const outflow = rangeExpenses.reduce((s, e) => s + e.amountPaise, 0);
    const netFlow = inflow - outflow;

    // Study topics completion
    const activeTopics = topics.filter((t) => !t.deletedAt);
    const completedTopics = activeTopics.filter((t) => t.theory && t.practice && t.pyq).length;
    const syllabusRate = activeTopics.length > 0 ? Math.round((completedTopics / activeTopics.length) * 100) : 0;

    // Habit adherence in range
    const activeHabits = habits.filter((h) => !h.archived && !h.deletedAt);
    let habitHits = 0;
    activeHabits.forEach((h) => {
      habitHits += h.completedDates.filter((d) => d >= startDateStr && d <= endDateStr).length;
    });

    return {
      focusHours: Math.round((focusMins / 60) * 10) / 10,
      focusSessionsCount: rangeSessions.length,
      tasksCompletedCount: rangeTasks.length,
      netFlowPaise: netFlow,
      inflowPaise: inflow,
      outflowPaise: outflow,
      syllabusRate,
      activeSubjectsCount: subjects.length,
      habitHits,
      activeHabitsCount: activeHabits.length,
    };
  }, [sessions, tasks, incomes, expenses, topics, subjects, habits, startDateStr, endDateStr]);

  const activeMonthKey = endDateStr.slice(0, 7);

  // Full dataset export handler
  const handleExportFullStudioCsv = () => {
    exportDatasetToCsv(
      `graph_studio_full_summary_${startDateStr}_to_${endDateStr}`,
      ['Metric', 'Value', 'Timeframe'],
      [
        ['FocusHours', summaryMetrics.focusHours, `${startDateStr} to ${endDateStr}`],
        ['FocusSessions', summaryMetrics.focusSessionsCount, `${startDateStr} to ${endDateStr}`],
        ['TasksCompleted', summaryMetrics.tasksCompletedCount, `${startDateStr} to ${endDateStr}`],
        ['NetCashflowPaise', summaryMetrics.netFlowPaise, `${startDateStr} to ${endDateStr}`],
        ['TotalInflowPaise', summaryMetrics.inflowPaise, `${startDateStr} to ${endDateStr}`],
        ['TotalOutflowPaise', summaryMetrics.outflowPaise, `${startDateStr} to ${endDateStr}`],
        ['SyllabusCompletionRate', `${summaryMetrics.syllabusRate}%`, 'Curriculum Total'],
        ['HabitExecutions', summaryMetrics.habitHits, `${startDateStr} to ${endDateStr}`],
      ]
    );
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Studio Header & Global Controls */}
      <ThemeCard className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[var(--ff-accent)]/15 text-[var(--ff-accent-text)]">
              <BarChart3 className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-[var(--ff-text-primary)]">
                Advanced Graph Studio
              </h1>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Cross-domain visual intelligence powered exclusively by verified ledger records
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Timeframe Selector */}
          <ThemeSegmentedControl<TimeframeFilter>
            ariaLabel="Select timeframe"
            value={timeframe}
            onChange={setTimeframe}
            options={[
              { id: 'today', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'yearly', label: 'Yearly' },
              { id: 'custom', label: 'Custom' },
            ]}
          />

          {/* Custom Date Picker (when timeframe is custom) */}
          {timeframe === 'custom' && (
            <div className="flex items-center gap-2 bg-[var(--ff-surface-subtle)] px-2.5 py-1 rounded-xl border border-[var(--ff-border-color)] text-xs">
              <Calendar className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => e.target.value && setStartDateStr(e.target.value)}
                className="bg-transparent border-none text-[var(--ff-text-primary)] font-mono text-xs focus:outline-none"
                aria-label="Start date"
              />
              <span className="text-[var(--ff-text-muted)]">→</span>
              <input
                type="date"
                value={endDateStr}
                onChange={(e) => e.target.value && setEndDateStr(e.target.value)}
                className="bg-transparent border-none text-[var(--ff-text-primary)] font-mono text-xs focus:outline-none"
                aria-label="End date"
              />
            </div>
          )}

          {/* Action Buttons */}
          <ThemeButton variant="secondary" size="sm" onClick={handleExportFullStudioCsv}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export Summary CSV
          </ThemeButton>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => {
              openPrintableGraphStudioReport({
                userName: user?.name || user?.email?.split('@')[0] || 'FocusFlow Operator',
                currency,
                startDateStr,
                endDateStr,
                timeframeLabel: timeframe.toUpperCase(),
                summaryMetrics,
                subjects,
                topics,
                sessions,
                incomes,
                expenses,
                envelopes,
                goals: savingsGoals,
                tasks,
                habits,
              });
            }}
            title="Print Executive Dossier"
          >
            <Printer className="w-3.5 h-3.5 mr-1" /> Print Dossier
          </ThemeButton>

          <ThemeButton variant="secondary" size="sm" onClick={loadStudioData} title="Refresh Data">
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </ThemeButton>
        </div>
      </ThemeCard>

      {/* Category Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl max-w-full overflow-x-auto scrollbar-none shrink-0 w-fit">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeCategory === 'all'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          All Analytics
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('study')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeCategory === 'study'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Study OS
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('finance')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeCategory === 'finance'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Finance
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('productivity')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeCategory === 'productivity'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <Clock className="w-4 h-4" />
          Productivity
        </button>

        <button
          type="button"
          onClick={() => setActiveCategory('habits')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeCategory === 'habits'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Habits
        </button>
      </div>

      {/* Error Banner with Retry */}
      {fetchError && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <ThemeButton variant="secondary" size="xs" onClick={loadStudioData}>
            Retry
          </ThemeButton>
        </div>
      )}

      {/* Summary KPI Micro-Cards */}
      <MotionStaggerGrid
        className="grid grid-cols-2 lg:grid-cols-4"
        style={{ gap: 'var(--ff-grid-gap)' }}
      >
        <MotionStaggerItem>
          <ThemeCard className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] block">
              Timeframe Focus Volume
            </span>
            <div className="text-xl font-bold font-mono text-[var(--ff-accent-text)]">
              <AnimatedNumber value={summaryMetrics.focusHours} format={(v) => `${v}h`} />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)]">
              {summaryMetrics.focusSessionsCount} completed sessions
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] block">
              Tasks Finished
            </span>
            <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
              <AnimatedNumber value={summaryMetrics.tasksCompletedCount} />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)]">
              Resolved in selected timeframe
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] block">
              Net Operating Cashflow
            </span>
            <div
              className={`text-xl font-bold font-mono ${
                summaryMetrics.netFlowPaise >= 0 ? 'text-[var(--ff-success)]' : 'text-[var(--ff-danger)]'
              }`}
            >
              {formatCurrency(summaryMetrics.netFlowPaise, currency)}
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)]">
              {summaryMetrics.inflowPaise > 0
                ? `${Math.round((summaryMetrics.netFlowPaise / summaryMetrics.inflowPaise) * 100)}% retained margin`
                : 'Zero income in period'}
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard className="p-4 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] block">
              Curriculum Mastery
            </span>
            <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
              <AnimatedNumber value={summaryMetrics.syllabusRate} format={(v) => `${v}%`} />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)]">
              Across {summaryMetrics.activeSubjectsCount} enrolled subjects
            </span>
          </ThemeCard>
        </MotionStaggerItem>
      </MotionStaggerGrid>

      {/* Main Responsive Grid of Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ============================================================== */}
        {/* ALL & STUDY CHARTS */}
        {/* ============================================================== */}
        {(activeCategory === 'all' || activeCategory === 'study') && (
          <>
            <StudyActivityHeatmapChart
              sessions={sessions}
              activityLogs={activityLogs}
              startDateStr={startDateStr}
              endDateStr={endDateStr}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Study Activity Heatmap',
                  subtitle: 'Daily distribution of deep study work',
                  domain: 'study',
                  tableHeaders: ['Date', 'Study Minutes', 'Sessions Count'],
                  tableRows: sessions.slice(0, 30).map((s) => [s.startedAt.slice(0, 10), s.durationMinutes, 1]),
                  chartNode: (
                    <StudyActivityHeatmapChart
                      sessions={sessions}
                      activityLogs={activityLogs}
                      startDateStr={startDateStr}
                      endDateStr={endDateStr}
                    />
                  ),
                })
              }
            />

            <SubjectStudyHoursChart
              sessions={sessions}
              subjects={subjects}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Subject-Wise Study Hours',
                  subtitle: 'Curriculum hours by subject code',
                  domain: 'study',
                  tableHeaders: ['Subject Code', 'Subject Name', 'Enrolled'],
                  tableRows: subjects.map((s) => [s.code, s.name, 'Active']),
                  chartNode: <SubjectStudyHoursChart sessions={sessions} subjects={subjects} />,
                })
              }
            />

            <SyllabusTriadProgressChart
              subjects={subjects}
              topics={topics}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Syllabus Triad Progress',
                  subtitle: 'Theory, Practice, and PYQ completion',
                  domain: 'study',
                  tableHeaders: ['Subject Code', 'Subject Name', 'Topics Count'],
                  tableRows: subjects.map((s) => [s.code, s.name, topics.filter((t) => t.subjectCode === s.code).length]),
                  chartNode: <SyllabusTriadProgressChart subjects={subjects} topics={topics} />,
                })
              }
            />

            <SubjectPerformanceChart
              exams={exams}
              revisions={revisions}
              subjects={subjects}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Subject Performance Comparison',
                  subtitle: 'Verified test marks and recall scores',
                  domain: 'study',
                  tableHeaders: ['Subject Code', 'Name'],
                  tableRows: subjects.map((s) => [s.code, s.name]),
                  chartNode: <SubjectPerformanceChart exams={exams} revisions={revisions} subjects={subjects} />,
                })
              }
            />

            <StudyTrendsVelocityChart
              sessions={sessions}
              timezone={tz}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Study Velocity Trends',
                  subtitle: 'Weekly and monthly study pacing curves',
                  domain: 'study',
                  tableHeaders: ['Session Date', 'Minutes', 'Mode'],
                  tableRows: sessions.slice(0, 25).map((s) => [s.startedAt.slice(0, 10), s.durationMinutes, s.mode]),
                  chartNode: <StudyTrendsVelocityChart sessions={sessions} timezone={tz} />,
                })
              }
            />
          </>
        )}

        {/* ============================================================== */}
        {/* ALL & FINANCE CHARTS */}
        {/* ============================================================== */}
        {(activeCategory === 'all' || activeCategory === 'finance') && (
          <>
            <MonthlyCashflowChart
              incomes={incomes}
              expenses={expenses}
              currency={currency}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Monthly Cashflow',
                  subtitle: 'Operating cashflow inflow vs outflow',
                  domain: 'finance',
                  tableHeaders: ['Type', 'Amount (Paise)', 'Date'],
                  tableRows: [
                    ...incomes.slice(0, 15).map((i) => ['INCOME', i.amountPaise, i.date]),
                    ...expenses.slice(0, 15).map((e) => ['EXPENSE', e.amountPaise, e.date]),
                  ],
                  chartNode: <MonthlyCashflowChart incomes={incomes} expenses={expenses} currency={currency} />,
                })
              }
            />

            <BudgetVsActualChart
              envelopes={envelopes}
              expenses={expenses}
              monthKey={activeMonthKey}
              currency={currency}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Budget Envelopes vs Actual Spending',
                  subtitle: `Consumption pace for ${activeMonthKey}`,
                  domain: 'finance',
                  tableHeaders: ['Envelope Name', 'Allocated Paise'],
                  tableRows: envelopes.map((env) => [env.name, env.allocatedPaise]),
                  chartNode: (
                    <BudgetVsActualChart
                      envelopes={envelopes}
                      expenses={expenses}
                      monthKey={activeMonthKey}
                      currency={currency}
                    />
                  ),
                })
              }
            />

            <CategorySpendingTrendsChart
              expenses={expenses}
              currency={currency}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Category Spending Breakdown',
                  subtitle: 'Top spending channels',
                  domain: 'finance',
                  tableHeaders: ['Description', 'Amount Paise', 'Category', 'Date'],
                  tableRows: expenses.slice(0, 25).map((e) => [e.description, e.amountPaise, e.categoryName || 'General', e.date]),
                  chartNode: <CategorySpendingTrendsChart expenses={expenses} currency={currency} />,
                })
              }
            />

            <SavingsGrowthTrendChart
              goals={savingsGoals}
              currency={currency}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Savings Goals Growth',
                  subtitle: 'Milestone target progress',
                  domain: 'finance',
                  tableHeaders: ['Goal Title', 'Saved Paise', 'Target Paise'],
                  tableRows: savingsGoals.map((g) => [g.title, g.savedPaise, g.targetPaise]),
                  chartNode: <SavingsGrowthTrendChart goals={savingsGoals} currency={currency} />,
                })
              }
            />

            <LiquidCashflowTimelineChart
              incomes={incomes}
              expenses={expenses}
              currency={currency}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Cumulative Liquid Cashflow',
                  subtitle: 'Running cash balance',
                  domain: 'finance',
                  tableHeaders: ['Date', 'Type', 'Amount Paise'],
                  tableRows: [
                    ...incomes.slice(0, 15).map((i) => [i.date, 'Income', i.amountPaise]),
                    ...expenses.slice(0, 15).map((e) => [e.date, 'Expense', e.amountPaise]),
                  ],
                  chartNode: <LiquidCashflowTimelineChart incomes={incomes} expenses={expenses} currency={currency} />,
                })
              }
            />
          </>
        )}

        {/* ============================================================== */}
        {/* ALL & PRODUCTIVITY CHARTS */}
        {/* ============================================================== */}
        {(activeCategory === 'all' || activeCategory === 'productivity') && (
          <>
            <FocusHoursTrendChart
              sessions={sessions}
              dailyGoalMinutes={settings?.dailyFocusGoalMinutes || 120}
              startDateStr={startDateStr}
              endDateStr={endDateStr}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Focus Hours Trend & Moving Average',
                  subtitle: 'Daily focus volume',
                  domain: 'productivity',
                  tableHeaders: ['Session Date', 'Minutes', 'Mode'],
                  tableRows: sessions.slice(0, 25).map((s) => [s.startedAt.slice(0, 10), s.durationMinutes, s.mode]),
                  chartNode: (
                    <FocusHoursTrendChart
                      sessions={sessions}
                      dailyGoalMinutes={settings?.dailyFocusGoalMinutes || 120}
                      startDateStr={startDateStr}
                      endDateStr={endDateStr}
                    />
                  ),
                })
              }
            />

            <CircadianHeatmapChart
              sessions={sessions}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Circadian Hourly Focus Heatmap',
                  subtitle: '24-hour hour-of-day distribution',
                  domain: 'productivity',
                  tableHeaders: ['Session ID', 'Started At', 'Minutes'],
                  tableRows: sessions.slice(0, 25).map((s) => [s.id, s.startedAt, s.durationMinutes]),
                  chartNode: <CircadianHeatmapChart sessions={sessions} />,
                })
              }
            />

            <TaskCompletionTrendChart
              tasks={tasks}
              startDateStr={startDateStr}
              endDateStr={endDateStr}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Task Completion Velocity',
                  subtitle: 'Tasks resolved over time',
                  domain: 'productivity',
                  tableHeaders: ['Title', 'Priority', 'Completed At'],
                  tableRows: tasks
                    .filter((t) => t.status === 'completed')
                    .slice(0, 25)
                    .map((t) => [t.title, t.priority, t.completedAt || '']),
                  chartNode: <TaskCompletionTrendChart tasks={tasks} startDateStr={startDateStr} endDateStr={endDateStr} />,
                })
              }
            />

            <TaskBurndownChart
              tasks={tasks}
              startDateStr={startDateStr}
              endDateStr={endDateStr}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Task Burndown Chart',
                  subtitle: 'Backlog depletion pace',
                  domain: 'productivity',
                  tableHeaders: ['Title', 'Status', 'Due Date'],
                  tableRows: tasks.slice(0, 25).map((t) => [t.title, t.status, t.dueDate || 'None']),
                  chartNode: <TaskBurndownChart tasks={tasks} startDateStr={startDateStr} endDateStr={endDateStr} />,
                })
              }
            />

            <EstimatedVsActualFocusChart
              tasks={tasks}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Estimated vs Actual Focus Time',
                  subtitle: 'Planning bias calibration',
                  domain: 'productivity',
                  tableHeaders: ['Task Title', 'Estimated Pomodoros', 'Completed Pomodoros'],
                  tableRows: tasks
                    .filter((t) => t.estimatedPomodoros > 0 || t.completedPomodoros > 0)
                    .slice(0, 25)
                    .map((t) => [t.title, t.estimatedPomodoros, t.completedPomodoros]),
                  chartNode: <EstimatedVsActualFocusChart tasks={tasks} />,
                })
              }
            />
          </>
        )}

        {/* ============================================================== */}
        {/* ALL & HABIT CHARTS */}
        {/* ============================================================== */}
        {(activeCategory === 'all' || activeCategory === 'habits') && (
          <>
            <HabitCompletionMatrixChart
              habits={habits}
              startDateStr={startDateStr}
              endDateStr={endDateStr}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Habit Completion Matrix',
                  subtitle: 'Execution grid across active habits',
                  domain: 'habits',
                  tableHeaders: ['Habit Title', 'Category', 'Total Dates Logged'],
                  tableRows: habits.map((h) => [h.title, h.category, h.completedDates.length]),
                  chartNode: (
                    <HabitCompletionMatrixChart
                      habits={habits}
                      startDateStr={startDateStr}
                      endDateStr={endDateStr}
                    />
                  ),
                })
              }
            />

            <HabitStreakLongevityChart
              habits={habits}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Habit Streak Longevity',
                  subtitle: 'Active vs all-time record streaks',
                  domain: 'habits',
                  tableHeaders: ['Habit Title', 'Category', 'Best Streak Days'],
                  tableRows: habits.map((h) => [h.title, h.category, h.bestStreakDays || 0]),
                  chartNode: <HabitStreakLongevityChart habits={habits} />,
                })
              }
            />

            <WeekdayConsistencyChart
              habits={habits}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Weekday Habit Consistency',
                  subtitle: 'Adherence by day of the week',
                  domain: 'habits',
                  tableHeaders: ['Habit Title', 'Frequency'],
                  tableRows: habits.map((h) => [h.title, h.frequency]),
                  chartNode: <WeekdayConsistencyChart habits={habits} />,
                })
              }
            />

            <HabitCompletionTrendChart
              habits={habits}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Habit Completion Trend',
                  subtitle: 'Periodic adherence curves across active habits',
                  domain: 'habits',
                  tableHeaders: ['Habit Title', 'Frequency', 'Completed Dates Count'],
                  tableRows: habits.map((h) => [h.title, h.frequency, h.completedDates.length]),
                  chartNode: <HabitCompletionTrendChart habits={habits} />,
                })
              }
            />
          </>
        )}

        {/* ============================================================== */}
        {/* CROSS-DOMAIN CORRELATION (Shown in All & Productivity) */}
        {/* ============================================================== */}
        {(activeCategory === 'all' || activeCategory === 'productivity') && (
          <div className="lg:col-span-2">
            <FocusVsSpendCorrelationChart
              sessions={sessions}
              expenses={expenses}
              startDateStr={startDateStr}
              endDateStr={endDateStr}
              currency={currency}
              onExpand={() =>
                setModalState({
                  isOpen: true,
                  title: 'Focus Hours vs Discretionary Expense Correlation',
                  subtitle: 'Cross-domain correlation index',
                  domain: 'custom',
                  tableHeaders: ['Date', 'Focus Sessions', 'Discretionary Expenses'],
                  tableRows: sessions.slice(0, 20).map((s) => [s.startedAt.slice(0, 10), s.durationMinutes, 'Session']),
                  chartNode: (
                    <FocusVsSpendCorrelationChart
                      sessions={sessions}
                      expenses={expenses}
                      startDateStr={startDateStr}
                      endDateStr={endDateStr}
                      currency={currency}
                    />
                  ),
                })
              }
            />
          </div>
        )}
      </div>

      {/* Expanded Graph Detail Modal */}
      <GraphDetailModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
        title={modalState.title}
        subtitle={modalState.subtitle}
        domain={modalState.domain}
        tableHeaders={modalState.tableHeaders}
        tableRows={modalState.tableRows}
        onExportCsv={() =>
          exportDatasetToCsv(
            modalState.title.toLowerCase().replace(/\s+/g, '_'),
            modalState.tableHeaders,
            modalState.tableRows
          )
        }
      >
        {modalState.chartNode}
      </GraphDetailModal>
    </div>
  );
};
