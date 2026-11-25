import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import {
  AuditLogEntry,
  Bill,
  DashboardData,
  DashboardLayoutConfig,
  DashboardLayoutPreset,
  DashboardWidgetId,
  DashboardWidgetSize,
  FocusSession,
  Habit,
  SavingsGoal,
  StudyExam,
  StudyMistake,
  StudyPlanTask,
  StudyRevision,
  StudySubject,
  StudyTopic,
  Task,
  TimeBlock,
} from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import {
  computeHabitStreak,
  computeProductivityScore,
  isHabitScheduledOnDate,
} from '../../lib/productivityIntelligence.ts';
import {
  buildExamPrepSnapshot,
  buildRecentActivityFeed,
  buildTodaysPriorities,
  computeDashboardGridSpans,
  DASHBOARD_LAYOUT_PRESETS,
  DASHBOARD_WIDGET_LABELS,
  normalizeDashboardLayout,
} from '../../lib/dashboardIntelligence.ts';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  CheckSquare,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Flame,
  GripVertical,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Receipt,
  Brain,
  Coins,
  Compass,
  Mail,
} from 'lucide-react';
import { FocusReceiptModal } from './FocusReceiptModal.tsx';
import { DecisionJournal } from '../productivity/DecisionJournal.tsx';
import { DoomscrollTaxJar } from '../productivity/DoomscrollTaxJar.tsx';
import { LifeInWeeksGrid } from '../productivity/LifeInWeeksGrid.tsx';
import { TimeCapsuleView } from '../productivity/TimeCapsuleView.tsx';
import { FocusReceiptData } from '../../types/features15.ts';
import { GamificationCard } from './GamificationCard.tsx';
import { TodaysPrioritiesCard } from './TodaysPrioritiesCard.tsx';
import { ExamPrepCard } from './ExamPrepCard.tsx';
import { RecentActivityCard } from './RecentActivityCard.tsx';
import { ProductivityScoreCard } from '../focus/ProductivityScoreCard.tsx';
import { AnalogClockDial } from '../focus/AnalogClockDial.tsx';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  MotionStaggerGrid,
  MotionStaggerItem,
  RollingTimerDigits,
  SkeletonCrossfade,
  SkeletonDashboard,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { clientDataCache } from '../../lib/dataCache.ts';

interface UnifiedDashboardProps {
  onOpenQuickAction: () => void;
}

export const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({ onOpenQuickAction }) => {
  const {
    user,
    firebaseUser,
    settings,
    updateSettings,
    currency,
    refreshKey,
    triggerRefresh,
    setCurrentTab,
    startTimer,
    switchTimerMode,
    isRunning,
    timeLeft,
    totalDuration,
    stopwatchElapsed,
    timerEngine,
    googleSpreadsheetId,
    createOrConnectSpreadsheet,
    syncStatus,
  } = useApp();

  const { profile } = useMotionPreferences();
  const cachedDash = clientDataCache.getDashboardData();
  const [data, setData] = useState<DashboardData | null>(cachedDash);

  const isPaused =
    !isRunning &&
    (timerEngine === 'stopwatch'
      ? stopwatchElapsed > 0
      : timeLeft < totalDuration && timeLeft > 0);

  const todayStr = useMemo(
    () => getTodayDateString(settings?.timezone || DEFAULT_TIMEZONE),
    [settings?.timezone]
  );

  const [sessions, setSessions] = useState<FocusSession[]>(
    () => clientDataCache.getFocusSessions() || []
  );
  const [tasks, setTasks] = useState<Task[]>(() => clientDataCache.getTasks() || []);
  const [habits, setHabits] = useState<Habit[]>(() => clientDataCache.getHabits() || []);
  const [bills, setBills] = useState<Bill[]>(() => clientDataCache.getBills() || []);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(
    () => clientDataCache.getSavingsGoals() || []
  );
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(
    () => clientDataCache.getTimeBlocks(todayStr) || []
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(
    () => clientDataCache.getAuditLogs() || []
  );
  const [studyTopics, setStudyTopics] = useState<StudyTopic[]>(
    () => clientDataCache.getStudyTopics() || []
  );
  const [studyRevisions, setStudyRevisions] = useState<StudyRevision[]>(
    () => clientDataCache.getStudyRevisions() || []
  );
  const [studyMistakes, setStudyMistakes] = useState<StudyMistake[]>(
    () => clientDataCache.getStudyMistakes() || []
  );
  const [studySubjects, setStudySubjects] = useState<StudySubject[]>(
    () => clientDataCache.getStudySubjects() || []
  );
  const [studyPlanTasks, setStudyPlanTasks] = useState<StudyPlanTask[]>(
    () => clientDataCache.getStudyPlanTasks() || []
  );
  const [studyExams, setStudyExams] = useState<StudyExam[]>(
    () => clientDataCache.getStudyExams() || []
  );

  const [loading, setLoading] = useState(!cachedDash);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [togglingBlockId, setTogglingBlockId] = useState<string | null>(null);
  const [initializingSheets, setInitializingSheets] = useState(false);

  const [nowClock, setNowClock] = useState<Date>(() => new Date());
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [customizeMode, setCustomizeMode] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<DashboardWidgetId | null>(null);
  const [activeProductivitySubTab, setActiveProductivitySubTab] = useState<
    'overview' | 'decisions' | 'doomscroll' | 'lifegrid' | 'timecapsule'
  >('overview');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const studyFetchedForRefreshRef = useRef<number>(-1);

  const focusReceiptData: FocusReceiptData = useMemo(() => {
    const completedTasksToday = tasks.filter(
      (t) => t.status === 'completed' || Boolean(t.completedAt)
    );
    const focusMins = data?.todayFocusMinutes ?? 0;
    const streak = data?.focusStreakDays ?? 1;

    return {
      date: getTodayDateString(settings?.timezone || DEFAULT_TIMEZONE),
      userName: user?.name || 'Student',
      totalStudyMinutes:
        studyTopics.filter((t) => t.theory && t.practice).length * 30 + focusMins,
      completedTasksCount: completedTasksToday.length,
      completedTaskTitles: completedTasksToday.map((t) => t.title),
      pomodoroSessionsCount: data?.completedPomodoroSessions || 0,
      totalPomodoroMinutes: focusMins,
      completedHabitsCount: habits.length,
      currentStreak: streak,
      productivityScore: Math.min(
        100,
        Math.max(50, Math.round(focusMins * 0.5 + completedTasksToday.length * 10 + 40))
      ),
      currency: settings?.currency || '₹',
      hideFinancials: settings?.hideFinancialInReceipt ?? false,
      dailyExpensePaise: data?.todayExpensesPaise || 0,
      moneySavedPaise: data?.remainingBalancePaise || 0,
    };
  }, [tasks, studyTopics, data, habits, settings, user]);

  const layoutConfig = useMemo<DashboardLayoutConfig>(
    () => normalizeDashboardLayout(settings?.dashboardLayout),
    [settings?.dashboardLayout]
  );

  const needsStudyData = useMemo(
    () =>
      !layoutConfig.hiddenWidgets.includes('study_pulse') ||
      !layoutConfig.hiddenWidgets.includes('todays_priorities') ||
      !layoutConfig.hiddenWidgets.includes('productivity_goals'),
    [layoutConfig.hiddenWidgets]
  );

  const visibleWidgets = useMemo(
    () => layoutConfig.widgetOrder.filter((id) => !layoutConfig.hiddenWidgets.includes(id)),
    [layoutConfig.widgetOrder, layoutConfig.hiddenWidgets]
  );

  const gridSpans = useMemo(
    () => computeDashboardGridSpans(visibleWidgets, layoutConfig.widgetSizes),
    [visibleWidgets, layoutConfig.widgetSizes]
  );

  const daysInMonth = useMemo(() => {
    return new Date(nowClock.getFullYear(), nowClock.getMonth() + 1, 0).getDate();
  }, [nowClock]);

  const currentDay = nowClock.getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);
  const monthlyCapPaise = settings?.monthlyBudgetPaise || 0;
  const spentMonthPaise = data?.monthlyExpensesPaise || 0;
  const remainingBudgetPaise = Math.max(0, monthlyCapPaise - spentMonthPaise);
  const dailySafeLimitPaise =
    monthlyCapPaise > 0 ? Math.round(remainingBudgetPaise / daysRemaining) : 0;
  const todaySpentPaise = data?.todayExpensesPaise || 0;
  const isOverDailyLimit = dailySafeLimitPaise > 0 && todaySpentPaise > dailySafeLimitPaise;

  useEffect(() => {
    const id = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchStudyBundle = useCallback(async () => {
    const [st, sr, sm, ssub, spt, sexams] = await Promise.all([
      api.getStudyTopics().catch(() => [] as StudyTopic[]),
      api.getStudyRevisions().catch(() => [] as StudyRevision[]),
      api.getStudyMistakes().catch(() => [] as StudyMistake[]),
      api.getStudySubjects().catch(() => [] as StudySubject[]),
      api.getStudyPlanTasks().catch(() => [] as StudyPlanTask[]),
      api.getStudyExams().catch(() => [] as StudyExam[]),
    ]);
    clientDataCache.setStudyTopics(st);
    clientDataCache.setStudyRevisions(sr);
    clientDataCache.setStudyMistakes(sm);
    clientDataCache.setStudySubjects(ssub);
    clientDataCache.setStudyPlanTasks(spt);
    clientDataCache.setStudyExams(sexams);
    setStudyTopics(st);
    setStudyRevisions(sr);
    setStudyMistakes(sm);
    setStudySubjects(ssub);
    setStudyPlanTasks(spt);
    setStudyExams(sexams);
  }, []);

  const loadDashboardData = useCallback(() => {
    if (!clientDataCache.getDashboardData()) {
      setLoading(true);
    }
    setLoadError(null);
    const staleCheck = clientDataCache.getWithStale<DashboardData>('dashboard');
    if (staleCheck.data) {
      setIsStale(staleCheck.isStale);
    }

    const shouldLoadStudy = needsStudyData;
    Promise.all([
      api.getDashboard(),
      api.getFocusSessions().catch(() => [] as FocusSession[]),
      api.getTasks().catch(() => [] as Task[]),
      api.getBills().catch(() => [] as Bill[]),
      api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
      api.getHabits().catch(() => [] as Habit[]),
      api.getTimeBlocks(todayStr).catch(() => [] as TimeBlock[]),
      api.getAuditLogs(15).catch(() => [] as AuditLogEntry[]),
      shouldLoadStudy
        ? api.getStudyTopics().catch(() => [] as StudyTopic[])
        : Promise.resolve(clientDataCache.getStudyTopics() || []),
      shouldLoadStudy
        ? api.getStudyRevisions().catch(() => [] as StudyRevision[])
        : Promise.resolve(clientDataCache.getStudyRevisions() || []),
      shouldLoadStudy
        ? api.getStudyMistakes().catch(() => [] as StudyMistake[])
        : Promise.resolve(clientDataCache.getStudyMistakes() || []),
      shouldLoadStudy
        ? api.getStudySubjects().catch(() => [] as StudySubject[])
        : Promise.resolve(clientDataCache.getStudySubjects() || []),
      shouldLoadStudy
        ? api.getStudyPlanTasks().catch(() => [] as StudyPlanTask[])
        : Promise.resolve(clientDataCache.getStudyPlanTasks() || []),
      shouldLoadStudy
        ? api.getStudyExams().catch(() => [] as StudyExam[])
        : Promise.resolve(clientDataCache.getStudyExams() || []),
    ])
      .then(([dash, sess, tsk, b, sg, hab, blocks, logs, st, sr, sm, ssub, spt, sexams]) => {
        clientDataCache.setDashboardData(dash);
        clientDataCache.setFocusSessions(sess);
        clientDataCache.setTasks(tsk);
        clientDataCache.setBills(b);
        clientDataCache.setHabits(hab);
        clientDataCache.setSavingsGoals(sg);
        clientDataCache.setTimeBlocks(blocks, todayStr);
        clientDataCache.setAuditLogs(logs);
        if (shouldLoadStudy) {
          studyFetchedForRefreshRef.current = refreshKey;
          clientDataCache.setStudyTopics(st);
          clientDataCache.setStudyRevisions(sr);
          clientDataCache.setStudyMistakes(sm);
          clientDataCache.setStudySubjects(ssub);
          clientDataCache.setStudyPlanTasks(spt);
          clientDataCache.setStudyExams(sexams);
        }
        setData(dash);
        setSessions(sess);
        setTasks(tsk);
        setBills(b);
        setSavingsGoals(sg);
        setHabits(hab);
        setTimeBlocks(blocks);
        setAuditLogs(logs);
        setStudyTopics(st);
        setStudyRevisions(sr);
        setStudyMistakes(sm);
        setStudySubjects(ssub);
        setStudyPlanTasks(spt);
        setStudyExams(sexams);
        setIsStale(false);
      })
      .catch((err) => {
        console.error('Failed to load dashboard:', err);
        if (!data && !clientDataCache.getDashboardData()) {
          setLoadError('Failed to load dashboard metrics. Please check your network connection.');
        } else {
          setIsStale(true);
        }
      })
      .finally(() => setLoading(false));
  }, [needsStudyData, refreshKey, todayStr]);

  useEffect(() => {
    loadDashboardData();
  }, [refreshKey, todayStr]);

  // If the user switches presets or un-hides study_pulse after initial load skipped study, fetch it immediately.
  useEffect(() => {
    if (needsStudyData && studyFetchedForRefreshRef.current !== refreshKey) {
      studyFetchedForRefreshRef.current = refreshKey;
      void fetchStudyBundle();
    }
  }, [needsStudyData, refreshKey, fetchStudyBundle]);

  // Exact existing productivity score formula (unchanged)
  const productivityScore = useMemo(() => {
    return computeProductivityScore({
      tasks,
      sessions,
      habits,
      settings,
      studySubjects,
      studyRevisions,
      studyPlanTasks,
      referenceDateStr: todayStr,
      timezone: settings?.timezone || DEFAULT_TIMEZONE,
    });
  }, [tasks, sessions, habits, settings, studySubjects, studyRevisions, studyPlanTasks, todayStr]);

  const prioritiesSnapshot = useMemo(
    () =>
      buildTodaysPriorities({
        tasks,
        timeBlocks,
        bills,
        exams: studyExams,
        revisions: studyRevisions,
        todayStr,
      }),
    [tasks, timeBlocks, bills, studyExams, studyRevisions, todayStr]
  );

  const examPrepSnapshot = useMemo(
    () =>
      buildExamPrepSnapshot({
        exams: studyExams,
        subjects: studySubjects,
        topics: studyTopics,
        revisions: studyRevisions,
        mistakes: studyMistakes,
        focusSessions: sessions,
        todayStr,
        timezone: settings?.timezone || DEFAULT_TIMEZONE,
      }),
    [studyExams, studySubjects, studyTopics, studyRevisions, studyMistakes, sessions, todayStr, settings?.timezone]
  );

  const recentActivity = useMemo(
    () =>
      buildRecentActivityFeed({
        auditLogs,
        focusSessions: sessions,
        tasks,
        limit: 5,
      }),
    [auditLogs, sessions, tasks]
  );

  const handleToggleHabitFromDashboard = async (habitId: string) => {
    const previousHabits = habits;
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const set = new Set(h.completedDates || []);
        if (set.has(todayStr)) {
          set.delete(todayStr);
        } else {
          set.add(todayStr);
        }
        return { ...h, completedDates: Array.from(set).sort() };
      })
    );
    try {
      await api.toggleHabit(habitId, todayStr);
      triggerRefresh();
    } catch (err) {
      console.error('Failed to toggle habit from dashboard:', err);
      setHabits(previousHabits);
    }
  };

  const handleQuickCompleteTask = async (task: Task) => {
    if (completingTaskId) return;
    setCompletingTaskId(task.id);
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: 'completed', updatedAt: new Date().toISOString() }
          : t
      )
    );
    try {
      await api.updateTask(task.id, { status: 'completed' });
      triggerRefresh();
    } catch (err) {
      console.error('Failed to complete task from dashboard:', err);
      // Rollback on failure
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleToggleTimeBlockFromDashboard = async (block: TimeBlock) => {
    if (togglingBlockId) return;
    setTogglingBlockId(block.id);
    const nextCompleted = !block.completed;
    setTimeBlocks((prev) =>
      prev.map((tb) => (tb.id === block.id ? { ...tb, completed: nextCompleted } : tb))
    );
    try {
      await api.updateTimeBlock(block.id, { completed: nextCompleted });
      triggerRefresh();
    } catch (err) {
      console.error('Failed to toggle time block from dashboard:', err);
      setTimeBlocks((prev) => prev.map((tb) => (tb.id === block.id ? block : tb)));
    } finally {
      setTogglingBlockId(null);
    }
  };

  const handleInitSheets = async () => {
    if (initializingSheets || syncStatus === 'syncing') return;
    setInitializingSheets(true);
    try {
      await createOrConnectSpreadsheet();
    } catch (err) {
      console.error('Failed to initialize master sheets from dashboard:', err);
    } finally {
      setInitializingSheets(false);
    }
  };

  const persistLayout = (next: DashboardLayoutConfig) => {
    void updateSettings({ dashboardLayout: next });
  };

  const toggleWidgetVisibility = (id: DashboardWidgetId) => {
    const hidden = layoutConfig.hiddenWidgets.includes(id)
      ? layoutConfig.hiddenWidgets.filter((w) => w !== id)
      : [...layoutConfig.hiddenWidgets, id];
    persistLayout({ ...layoutConfig, hiddenWidgets: hidden });
  };

  const setWidgetSize = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
    persistLayout({
      ...layoutConfig,
      widgetSizes: { ...layoutConfig.widgetSizes, [id]: size },
    });
  };

  const moveWidget = (
    fromId: DashboardWidgetId,
    directionOrTarget: 'up' | 'down' | DashboardWidgetId
  ) => {
    const nextOrder = [...layoutConfig.widgetOrder];
    const fromIdx = nextOrder.indexOf(fromId);
    if (fromIdx === -1) return;

    let toIdx = fromIdx;
    if (directionOrTarget === 'up') toIdx = Math.max(0, fromIdx - 1);
    else if (directionOrTarget === 'down') toIdx = Math.min(nextOrder.length - 1, fromIdx + 1);
    else toIdx = nextOrder.indexOf(directionOrTarget);

    if (toIdx === -1 || toIdx === fromIdx) return;
    const [moved] = nextOrder.splice(fromIdx, 1);
    nextOrder.splice(toIdx, 0, moved);
    persistLayout({ ...layoutConfig, widgetOrder: nextOrder });
  };

  const handleStartQuickFocus = () => {
    if (isRunning) {
      setCurrentTab('focus');
      return;
    }
    if (isPaused) {
      startTimer();
      setCurrentTab('focus');
      return;
    }
    switchTimerMode('work');
    startTimer();
    setCurrentTab('focus');
  };

  const hour = nowClock.getHours();
  const greetingText =
    hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dailyGoalMin = Math.max(15, settings?.dailyFocusGoalMinutes || 100);
  const weeklyGoalMin = Math.max(30, settings?.weeklyFocusGoalMinutes || 500);
  const dailyGoalPct = Math.min(
    100,
    Math.round(((data?.todayFocusMinutes || 0) / dailyGoalMin) * 100)
  );
  const weeklyGoalPct = Math.min(
    100,
    Math.round(((data?.weeklyFocusMinutes || 0) / weeklyGoalMin) * 100)
  );

  const totalTasksCount = (data?.completedTasksCount || 0) + (data?.pendingTasksCount || 0);
  const taskCompletionPct =
    totalTasksCount > 0
      ? Math.min(100, Math.round(((data?.completedTasksCount || 0) / totalTasksCount) * 100))
      : 0;

  const periodNetCashflowPaise =
    timeframe === 'daily'
      ? (data?.todayIncomePaise || 0) - (data?.todayExpensesPaise || 0)
      : timeframe === 'weekly'
      ? Math.round(((data?.monthlyIncomePaise || 0) - (data?.monthlyExpensesPaise || 0)) / 4.33)
      : data?.remainingBalancePaise || 0;

  const periodFocusMinutes =
    timeframe === 'daily'
      ? data?.todayFocusMinutes || 0
      : timeframe === 'weekly'
      ? data?.weeklyFocusMinutes || 0
      : Math.round((data?.weeklyFocusMinutes || 0) * 4.33);

  const todaysScheduledHabits = useMemo(
    () => habits.filter((h) => !h.deletedAt && isHabitScheduledOnDate(h, todayStr)),
    [habits, todayStr]
  );

  const isInitialLoading = loading && !data;

  const renderWidgetBody = (id: DashboardWidgetId) => {
    const resolvedSpan = gridSpans[id] || 'lg:col-span-12';
    const isWide = resolvedSpan === 'lg:col-span-12';

    switch (id) {
      /* ================================================================
       * A. COMPACT COMMAND HEADER
       * ================================================================ */
      case 'clock_greeting':
        return (
          <ThemeCard className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-accent-text)]">
                  {nowClock.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {isRunning && (
                  <ThemeBadge tone="success">Focus Active</ThemeBadge>
                )}
              </div>
              <h1 className="ff-heading text-xl sm:text-2xl font-extrabold text-[var(--ff-text-primary)] tracking-tight leading-tight break-words">
                {greetingText}
                {firebaseUser?.displayName
                  ? `, ${firebaseUser.displayName}`
                  : user?.name && user.name !== 'Guest Workspace'
                  ? `, ${user.name}`
                  : ''}
              </h1>
              <p className="text-xs text-[var(--ff-text-muted)]">
                {data?.pendingTasksCount || 0} open tasks ·{' '}
                {data?.todayFocusMinutes || 0}m focused today ·{' '}
                {prioritiesSnapshot.overdueItems.length > 0
                  ? `${prioritiesSnapshot.overdueItems.length} overdue items`
                  : 'All deadlines on track'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div
                className="flex items-center gap-2 px-3 py-1.5 border font-mono text-base font-extrabold tabular-nums text-[var(--ff-text-primary)]"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  borderColor: 'var(--ff-border-color)',
                  background: 'var(--ff-surface-subtle)',
                }}
              >
                <AnalogClockDial
                  hour={nowClock.getHours()}
                  minute={nowClock.getMinutes()}
                  second={nowClock.getSeconds()}
                  sweep={false}
                  showNumerals={false}
                  showDateWindow={false}
                  sizeClassName="w-6 h-6 shrink-0"
                />
                <RollingTimerDigits
                  value={nowClock.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                />
              </div>

              <ThemeButton variant="secondary" size="sm" onClick={() => setCurrentTab('clock')}>
                <Clock className="w-3.5 h-3.5" />
                <span>Real Clock</span>
              </ThemeButton>

              <ThemeButton variant="primary" size="sm" onClick={handleStartQuickFocus}>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isRunning ? 'Active Timer' : isPaused ? 'Resume Focus' : 'Start Focus'}
                </span>
              </ThemeButton>

              <ThemeButton variant="secondary" size="sm" onClick={onOpenQuickAction}>
                <Plus className="w-3.5 h-3.5" />
                <span>Quick Add</span>
              </ThemeButton>
            </div>
          </ThemeCard>
        );

      /* ================================================================
       * COMPACT WORKSPACE ACTION & SYNC STRIP (Replaces oversized hero)
       * ================================================================ */
      case 'hero':
        return (
          <ThemeCard
            className="py-3.5 px-4 sm:px-5 border-l-2"
            style={{
              borderLeftColor: 'var(--ff-accent)',
            }}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                  style={{
                    background: 'var(--ff-accent-soft)',
                    borderColor: 'var(--ff-accent-border)',
                    color: 'var(--ff-accent-text)',
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                      Focus Deeply. Manage Wealth Intelligently.
                    </h2>
                    <ThemeBadge tone="accent">Command Center</ThemeBadge>
                  </div>
                  <p className="text-xs text-[var(--ff-text-muted)] whitespace-normal break-words leading-relaxed">
                    Personal productivity engine, exam prep, and financial ledger synced in real time.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {googleSpreadsheetId ? (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ff-btn px-3 py-1.5 text-xs font-semibold border transition-colors"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      background: 'var(--ff-success-soft)',
                      borderColor: 'color-mix(in oklab, var(--ff-success) 35%, transparent)',
                      color: 'var(--ff-success)',
                    }}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Open Master Sheets</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <ThemeButton
                    variant="secondary"
                    size="sm"
                    disabled={initializingSheets || syncStatus === 'syncing'}
                    onClick={() => void handleInitSheets()}
                  >
                    {initializingSheets || syncStatus === 'syncing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--ff-accent-text)]" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--ff-success)]" />
                    )}
                    <span>
                      {initializingSheets || syncStatus === 'syncing'
                        ? 'Initializing Sheets...'
                        : 'Initialize 23 Master Sheets'}
                    </span>
                  </ThemeButton>
                )}

                <ThemeButton variant="primary" size="sm" onClick={handleStartQuickFocus}>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {isRunning
                      ? 'View Active Timer'
                      : isPaused
                      ? 'Resume Focus Session'
                      : 'Launch 25m Focus'}
                  </span>
                </ThemeButton>
              </div>
            </div>
          </ThemeCard>
        );

      /* ================================================================
       * B. DAILY SNAPSHOT (4 Uniform Command KPIs)
       * ================================================================ */
      case 'focus_kpis':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                  Daily Snapshot · {timeframe === 'daily' ? 'Today' : timeframe === 'weekly' ? 'Weekly Pace' : 'Monthly View'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCurrentTab('focus')}
                className="flex items-center gap-1 text-xs font-semibold hover:underline"
                style={{ color: 'var(--ff-accent-text)' }}
              >
                <span>Open Focus Lab</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <MotionStaggerGrid
              className={`grid grid-cols-1 ${
                !isWide ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'
              } gap-4 items-stretch`}
            >
              {/* 1. Focus Time */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0">
                  <div className="flex items-start justify-between gap-2.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-[var(--ff-text-muted)] block leading-snug break-words">
                        {timeframe === 'daily'
                          ? 'Focus Time Today'
                          : timeframe === 'weekly'
                          ? 'Weekly Focus Time'
                          : 'Monthly Focus Pace'}
                      </span>
                      <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)] mt-1.5 leading-tight break-words">
                        <AnimatedNumber
                          value={periodFocusMinutes}
                          format={(mins) => `${Math.floor(mins / 60)}h ${Math.round(mins) % 60}m`}
                        />
                      </div>
                    </div>
                    <div
                      className="w-9 h-9 flex items-center justify-center shrink-0 border"
                      style={{
                        borderRadius: 'var(--ff-radius-button)',
                        background: 'var(--ff-accent-soft)',
                        borderColor: 'var(--ff-accent-border)',
                        color: 'var(--ff-accent-text)',
                      }}
                    >
                      <Timer className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-start justify-between gap-2 text-[11px] leading-snug text-[var(--ff-text-muted)] min-w-0">
                      <span className="min-w-0 whitespace-normal break-words">
                        {timeframe === 'daily'
                          ? `${data?.todayFocusMinutes || 0} / ${dailyGoalMin}m goal`
                          : timeframe === 'weekly'
                          ? `${data?.weeklyFocusMinutes || 0} / ${weeklyGoalMin}m goal`
                          : `${data?.completedPomodoroSessions || 0} sessions today`}
                      </span>
                      <span className="font-mono font-semibold text-[var(--ff-accent-text)] shrink-0 whitespace-nowrap">
                        {timeframe === 'weekly' ? `${weeklyGoalPct}%` : `${dailyGoalPct}%`}
                      </span>
                    </div>
                    <AnimatedProgressBar
                      value={timeframe === 'weekly' ? weeklyGoalPct : dailyGoalPct}
                      max={100}
                      heightClass="h-1.5"
                      tone={(timeframe === 'weekly' ? weeklyGoalPct : dailyGoalPct) >= 100 ? 'success' : 'accent'}
                      ariaLabel="Focus goal completion"
                    />
                  </div>
                </ThemeCard>
              </MotionStaggerItem>

              {/* 2. Task Completion */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0">
                  <div className="flex items-start justify-between gap-2.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-[var(--ff-text-muted)] block leading-snug break-words">
                        Task Completion
                      </span>
                      <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)] mt-1.5 leading-tight break-words">
                        <AnimatedNumber value={data?.completedTasksCount || 0} />
                        <span className="text-sm font-normal text-[var(--ff-text-muted)]">
                          {' '}/ {totalTasksCount}
                        </span>
                      </div>
                    </div>
                    <div
                      className="w-9 h-9 flex items-center justify-center shrink-0 border"
                      style={{
                        borderRadius: 'var(--ff-radius-button)',
                        background: 'var(--ff-success-soft)',
                        borderColor: 'color-mix(in oklab, var(--ff-success) 30%, transparent)',
                        color: 'var(--ff-success)',
                      }}
                    >
                      <CheckSquare className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-start justify-between gap-2 text-[11px] leading-snug text-[var(--ff-text-muted)] min-w-0">
                      <span className="min-w-0 whitespace-normal break-words">
                        {data?.pendingTasksCount || 0} pending
                      </span>
                      <span className="font-mono font-semibold text-[var(--ff-success)] shrink-0 whitespace-nowrap">
                        {taskCompletionPct}%
                      </span>
                    </div>
                    <AnimatedProgressBar
                      value={taskCompletionPct}
                      max={100}
                      heightClass="h-1.5"
                      tone="success"
                      ariaLabel="Task completion percentage"
                    />
                  </div>
                </ThemeCard>
              </MotionStaggerItem>

              {/* 3. Net Cashflow */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0">
                  <div className="flex items-start justify-between gap-2.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-[var(--ff-text-muted)] block leading-snug break-words">
                        {timeframe === 'daily'
                          ? "Today's Net Cashflow"
                          : timeframe === 'weekly'
                          ? 'Weekly Net Cashflow'
                          : 'Remaining Balance'}
                      </span>
                      <div
                        className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-1.5 leading-tight break-words"
                        style={{
                          color:
                            periodNetCashflowPaise >= 0
                              ? 'var(--ff-text-primary)'
                              : 'var(--ff-danger)',
                        }}
                      >
                        <AnimatedNumber
                          value={periodNetCashflowPaise}
                          format={(paise) => formatCurrency(Math.round(paise), currency)}
                        />
                      </div>
                    </div>
                    <div
                      className="w-9 h-9 flex items-center justify-center shrink-0 border"
                      style={{
                        borderRadius: 'var(--ff-radius-button)',
                        background:
                          periodNetCashflowPaise >= 0
                            ? 'var(--ff-accent-soft)'
                            : 'var(--ff-danger-soft)',
                        borderColor:
                          periodNetCashflowPaise >= 0
                            ? 'var(--ff-accent-border)'
                            : 'color-mix(in oklab, var(--ff-danger) 30%, transparent)',
                        color:
                          periodNetCashflowPaise >= 0
                            ? 'var(--ff-accent-text)'
                            : 'var(--ff-danger)',
                      }}
                    >
                      <Scale className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] leading-relaxed text-[var(--ff-text-muted)] min-w-0">
                    <span className="min-w-0 whitespace-normal break-words line-clamp-2">
                      +{formatCurrency(data?.todayIncomePaise || 0, currency, { compact: true })} / -
                      {formatCurrency(data?.todayExpensesPaise || 0, currency, { compact: true })} today
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentTab('finance')}
                      className="font-semibold text-[var(--ff-accent-text)] hover:underline shrink-0"
                    >
                      Ledger
                    </button>
                  </div>
                </ThemeCard>
              </MotionStaggerItem>

              {/* 4. Daily Safe-to-Spend */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3.5 min-w-0">
                  <div className="flex items-start justify-between gap-2.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-[var(--ff-text-muted)] block leading-snug break-words">
                        {monthlyCapPaise > 0 ? 'Daily Safe-to-Spend' : 'Bills Pending'}
                      </span>
                      <div
                        className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-1.5 leading-tight break-words"
                        style={{
                          color:
                            monthlyCapPaise > 0 && isOverDailyLimit
                              ? 'var(--ff-danger)'
                              : 'var(--ff-text-primary)',
                        }}
                      >
                        <AnimatedNumber
                          value={
                            monthlyCapPaise > 0
                              ? dailySafeLimitPaise
                              : data?.totalUnpaidAmountPaise || 0
                          }
                          format={(paise) => formatCurrency(Math.round(paise), currency)}
                        />
                      </div>
                    </div>
                    <div
                      className="w-9 h-9 flex items-center justify-center shrink-0 border"
                      style={{
                        borderRadius: 'var(--ff-radius-button)',
                        background:
                          monthlyCapPaise > 0 && isOverDailyLimit
                            ? 'var(--ff-danger-soft)'
                            : 'var(--ff-warning-soft)',
                        borderColor:
                          monthlyCapPaise > 0 && isOverDailyLimit
                            ? 'color-mix(in oklab, var(--ff-danger) 30%, transparent)'
                            : 'color-mix(in oklab, var(--ff-warning) 30%, transparent)',
                        color:
                          monthlyCapPaise > 0 && isOverDailyLimit
                            ? 'var(--ff-danger)'
                            : 'var(--ff-warning)',
                      }}
                    >
                      {monthlyCapPaise > 0 ? (
                        <Target className="w-4 h-4" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] leading-relaxed min-w-0">
                    {monthlyCapPaise > 0 ? (
                      <>
                        <span
                          className="font-semibold whitespace-normal break-words"
                          style={{
                            color: isOverDailyLimit ? 'var(--ff-danger)' : 'var(--ff-success)',
                          }}
                        >
                          {isOverDailyLimit ? 'Over daily guardrail' : 'Within daily guardrail'}
                        </span>
                        <span className="text-[var(--ff-text-muted)] font-mono shrink-0">
                          {daysRemaining}d left
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-[var(--ff-warning)] whitespace-normal">
                          {data?.unpaidBillsCount || 0} unpaid
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentTab('finance')}
                          className="font-semibold text-[var(--ff-accent-text)] hover:underline shrink-0"
                        >
                          Set budget
                        </button>
                      </>
                    )}
                  </div>
                </ThemeCard>
              </MotionStaggerItem>
            </MotionStaggerGrid>
          </div>
        );

      /* ================================================================
       * C. TODAY'S PRIORITIES
       * ================================================================ */
      case 'todays_priorities':
        return (
          <TodaysPrioritiesCard
            snapshot={prioritiesSnapshot}
            todayStr={todayStr}
            completingTaskId={completingTaskId}
            togglingBlockId={togglingBlockId}
            onQuickCompleteTask={(task) => void handleQuickCompleteTask(task)}
            onToggleTimeBlock={(block) => void handleToggleTimeBlockFromDashboard(block)}
            onNavigate={(tab) => setCurrentTab(tab)}
            isWide={isWide}
          />
        );

      /* ================================================================
       * D. EXAM PREPARATION & SYLLABUS
       * ================================================================ */
      case 'study_pulse':
        return (
          <ExamPrepCard
            snapshot={examPrepSnapshot}
            onOpenStudyOS={() => setCurrentTab('study')}
            isWide={isWide}
          />
        );

      /* ================================================================
       * E. FOCUS & PRODUCTIVITY (Balanced 12-Col Split: Score + Goals/Habits)
       * ================================================================ */
      case 'productivity_goals':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                Focus &amp; Productivity
              </h2>
              <button
                type="button"
                onClick={() => setCurrentTab('settings')}
                className="text-xs font-semibold text-[var(--ff-accent-text)] hover:underline"
              >
                Adjust Targets
              </button>
            </div>

            <div
              className={`grid grid-cols-1 ${
                isWide ? 'lg:grid-cols-12' : ''
              } gap-4 items-stretch`}
            >
              {/* Left: Deterministic Daily Productivity Score */}
              <div className={isWide ? 'lg:col-span-5' : ''}>
                <ProductivityScoreCard scoreData={productivityScore} className="h-full" />
              </div>

              {/* Right: Focus Goals, Weekly Metrics & Habits/Streaks */}
              <div className={isWide ? 'lg:col-span-7' : ''}>
                <ThemeCard className="h-full flex flex-col justify-between gap-4">
                  {/* Top Metric Pills */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--ff-border-color)]">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-[var(--ff-accent-text)]" />
                        <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                          Focus Goals &amp; Consistency
                        </h3>
                      </div>
                      <ThemeBadge tone="accent">
                        {data?.focusStreakDays || 0}d streak
                      </ThemeBadge>
                    </div>

                    {/* 3 Compact KPI Chips */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="ff-surface-subtle px-3 py-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                          Weekly Focus
                        </span>
                        <p className="text-base font-black font-mono text-[var(--ff-text-primary)] mt-0.5">
                          {Math.floor((data?.weeklyFocusMinutes || 0) / 60)}h{' '}
                          {(data?.weeklyFocusMinutes || 0) % 60}m
                        </p>
                      </div>

                      <div className="ff-surface-subtle px-3 py-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                          Pomodoros Done
                        </span>
                        <p className="text-base font-black font-mono text-[var(--ff-success)] mt-0.5">
                          {data?.completedPomodoroSessions || 0}
                          <span className="text-[11px] font-normal text-[var(--ff-text-muted)] ml-1">
                            today
                          </span>
                        </p>
                      </div>

                      <div className="ff-surface-subtle px-3 py-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                          Best Streak
                        </span>
                        <p className="text-base font-black font-mono text-[var(--ff-warning)] mt-0.5">
                          {data?.bestStreakDays || 0} days
                        </p>
                      </div>
                    </div>

                    {/* Daily & Weekly Goal Progress Bars */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2 text-xs mb-1.5 min-w-0">
                          <span className="font-semibold text-[var(--ff-text-secondary)] leading-snug break-words min-w-0">
                            Daily Focus Goal
                          </span>
                          <span className="font-mono font-bold text-[var(--ff-text-primary)] shrink-0 whitespace-nowrap tabular-nums">
                            {data?.todayFocusMinutes || 0}/{dailyGoalMin}m ({dailyGoalPct}%)
                          </span>
                        </div>
                        <AnimatedProgressBar
                          value={dailyGoalPct}
                          showShimmer={true}
                          tone={dailyGoalPct >= 100 ? 'success' : 'accent'}
                          heightClass="h-2"
                          ariaLabel="Daily Focus Goal"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2 text-xs mb-1.5 min-w-0">
                          <span className="font-semibold text-[var(--ff-text-secondary)] leading-snug break-words min-w-0">
                            Weekly Deep Work Goal
                          </span>
                          <span className="font-mono font-bold text-[var(--ff-text-primary)] shrink-0 whitespace-nowrap tabular-nums">
                            {data?.weeklyFocusMinutes || 0}/{weeklyGoalMin}m ({weeklyGoalPct}%)
                          </span>
                        </div>
                        <AnimatedProgressBar
                          value={weeklyGoalPct}
                          showShimmer={true}
                          tone={weeklyGoalPct >= 100 ? 'success' : 'accent'}
                          heightClass="h-2"
                          ariaLabel="Weekly Deep Work Goal"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Today's Habits & Quick Check-off */}
                  <div className="pt-3 border-t border-[var(--ff-border-color)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-[var(--ff-warning)]" /> Today&apos;s Habits &amp; Streaks
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentTab('habits')}
                        className="text-xs font-semibold text-[var(--ff-accent-text)] hover:underline"
                      >
                        Manage Habits
                      </button>
                    </div>

                    {todaysScheduledHabits.length === 0 ? (
                      <div className="ff-surface-subtle px-3 py-2 flex items-center justify-between gap-2 text-xs text-[var(--ff-text-muted)]">
                        <span>No habits scheduled for today.</span>
                        <button
                          type="button"
                          onClick={() => setCurrentTab('habits')}
                          className="text-[11px] font-bold text-[var(--ff-accent-text)] hover:underline shrink-0"
                        >
                          + Add Habit
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {todaysScheduledHabits.map((h) => {
                          const isDone = (h.completedDates || []).includes(todayStr);
                          const streak = computeHabitStreak(h, todayStr).currentStreak;
                          return (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => void handleToggleHabitFromDashboard(h.id)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                isDone
                                  ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-500 dark:text-emerald-400'
                                  : 'bg-[var(--ff-surface-subtle)] border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:border-[var(--ff-accent-border)]'
                              }`}
                            >
                              <span
                                className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                                  isDone
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'border-current opacity-45'
                                }`}
                              >
                                {isDone && <CheckCircle2 className="w-3 h-3" />}
                              </span>
                              <span className={isDone ? 'line-through opacity-80' : ''}>
                                {h.title}
                              </span>
                              {streak > 0 && (
                                <span
                                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--ff-warning-soft)] text-[var(--ff-warning)]"
                                  title={`${streak}-day habit streak`}
                                >
                                  {streak}d
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </ThemeCard>
              </div>
            </div>
          </div>
        );

      /* ================================================================
       * F1. FINANCE OVERVIEW KPIs
       * ================================================================ */
      case 'finance_kpis':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                Finance Overview ·{' '}
                {timeframe === 'daily'
                  ? 'Today & Guardrail'
                  : timeframe === 'weekly'
                  ? 'Weekly Normalized Pace'
                  : 'Monthly Standing'}
              </h2>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCurrentTab('transactions')}
                  className="text-[var(--ff-text-secondary)] hover:text-[var(--ff-accent-text)] transition-colors"
                >
                  Transactions
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('bills')}
                  className="text-[var(--ff-text-secondary)] hover:text-[var(--ff-accent-text)] transition-colors"
                >
                  Bills
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('finance')}
                  className="flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--ff-accent-text)' }}
                >
                  <span>Finance Command</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <MotionStaggerGrid
              className={`grid grid-cols-1 ${
                !isWide ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'
              } gap-4 items-stretch`}
            >
              {/* 1. Today's Inflow */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
                  <div className="flex items-start justify-between gap-2 text-[var(--ff-text-muted)] min-w-0">
                    <span className="text-xs font-medium leading-snug break-words min-w-0">
                      {timeframe === 'daily'
                        ? "Today's Inflow"
                        : timeframe === 'weekly'
                        ? 'Weekly Inflow Pace'
                        : 'Monthly Inflow'}
                    </span>
                    <TrendingUp className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--ff-success)' }} />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)] leading-tight break-words">
                    <AnimatedNumber
                      value={
                        timeframe === 'daily'
                          ? data?.todayIncomePaise || 0
                          : timeframe === 'weekly'
                          ? Math.round((data?.monthlyIncomePaise || 0) / 4.33)
                          : data?.monthlyIncomePaise || 0
                      }
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--ff-text-muted)] whitespace-normal break-words line-clamp-2">
                    {timeframe === 'daily'
                      ? `Direct revenue today · Month: ${formatCurrency(data?.monthlyIncomePaise || 0, currency, { compact: true })}`
                      : timeframe === 'weekly'
                      ? '7-day normalized revenue pace'
                      : `Today: +${formatCurrency(data?.todayIncomePaise || 0, currency, { compact: true })}`}
                  </p>
                </ThemeCard>
              </MotionStaggerItem>

              {/* 2. Today's Outflow */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
                  <div className="flex items-start justify-between gap-2 text-[var(--ff-text-muted)] min-w-0">
                    <span className="text-xs font-medium leading-snug break-words min-w-0">
                      {timeframe === 'daily'
                        ? "Today's Outflow"
                        : timeframe === 'weekly'
                        ? 'Weekly Outflow Pace'
                        : 'Monthly Outflow'}
                    </span>
                    <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--ff-danger)' }} />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)] leading-tight break-words">
                    <AnimatedNumber
                      value={
                        timeframe === 'daily'
                          ? data?.todayExpensesPaise || 0
                          : timeframe === 'weekly'
                          ? Math.round((data?.monthlyExpensesPaise || 0) / 4.33)
                          : data?.monthlyExpensesPaise || 0
                      }
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--ff-text-muted)] whitespace-normal break-words line-clamp-2">
                    {timeframe === 'daily'
                      ? `Expenses recorded today · Month: ${formatCurrency(data?.monthlyExpensesPaise || 0, currency, { compact: true })}`
                      : timeframe === 'weekly'
                      ? '7-day normalized expenditure burn'
                      : `Fixed: ${formatCurrency(data?.fixedExpensesPaise || 0, currency, { compact: true })} · Var: ${formatCurrency(data?.variableExpensesPaise || 0, currency, { compact: true })}`}
                  </p>
                </ThemeCard>
              </MotionStaggerItem>

              {/* 3. Today's Net Cashflow */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
                  <div className="flex items-start justify-between gap-2 text-[var(--ff-text-muted)] min-w-0">
                    <span className="text-xs font-medium leading-snug break-words min-w-0">
                      {timeframe === 'daily'
                        ? "Today's Net Cashflow"
                        : timeframe === 'weekly'
                        ? 'Weekly Net Balance'
                        : 'Remaining Balance'}
                    </span>
                    <Scale className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--ff-accent-text)' }} />
                  </div>
                  <div
                    className="text-xl sm:text-2xl font-bold font-mono tabular-nums leading-tight break-words"
                    style={{
                      color:
                        periodNetCashflowPaise >= 0
                          ? 'var(--ff-text-primary)'
                          : 'var(--ff-danger)',
                    }}
                  >
                    <AnimatedNumber
                      value={periodNetCashflowPaise}
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--ff-text-muted)] whitespace-normal break-words line-clamp-2">
                    {timeframe === 'daily'
                      ? 'Net position after today’s spend'
                      : timeframe === 'weekly'
                      ? '7-day retained capital pace'
                      : 'Net accumulated savings balance'}
                  </p>
                </ThemeCard>
              </MotionStaggerItem>

              {/* 4. Daily Safe-to-Spend / Bills Pending */}
              <MotionStaggerItem className="min-w-0 h-full">
                <ThemeCard className="h-full min-h-[138px] p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
                  <div className="flex items-start justify-between gap-2 text-[var(--ff-text-muted)] min-w-0">
                    <span className="text-xs font-medium leading-snug break-words min-w-0">
                      {monthlyCapPaise > 0 ? 'Daily Safe-to-Spend' : 'Bills Pending'}
                    </span>
                    {monthlyCapPaise > 0 ? (
                      <Target
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{
                          color: isOverDailyLimit ? 'var(--ff-danger)' : 'var(--ff-success)',
                        }}
                      />
                    ) : (
                      <CreditCard className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--ff-warning)' }} />
                    )}
                  </div>
                  <div
                    className="text-xl sm:text-2xl font-bold font-mono tabular-nums leading-tight break-words"
                    style={{
                      color:
                        monthlyCapPaise > 0 && isOverDailyLimit
                          ? 'var(--ff-danger)'
                          : 'var(--ff-text-primary)',
                    }}
                  >
                    <AnimatedNumber
                      value={
                        monthlyCapPaise > 0
                          ? dailySafeLimitPaise
                          : data?.totalUnpaidAmountPaise || 0
                      }
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed">
                    {monthlyCapPaise > 0 ? (
                      <>
                        <span
                          className="font-semibold"
                          style={{
                            color: isOverDailyLimit ? 'var(--ff-danger)' : 'var(--ff-success)',
                          }}
                        >
                          {isOverDailyLimit ? 'Over Limit' : 'Within Budget'}
                        </span>
                        <span aria-hidden="true" className="text-[var(--ff-text-muted)]">·</span>
                        <span className="text-[var(--ff-text-muted)]">{daysRemaining} days left</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold" style={{ color: 'var(--ff-warning)' }}>
                          {data?.unpaidBillsCount || 0} Unpaid
                        </span>
                        <span aria-hidden="true" className="text-[var(--ff-text-muted)]">·</span>
                        <span className="font-semibold" style={{ color: 'var(--ff-success)' }}>
                          {data?.paidBillsCount || 0} Paid
                        </span>
                      </>
                    )}
                  </div>
                </ThemeCard>
              </MotionStaggerItem>
            </MotionStaggerGrid>
          </div>
        );

      /* ================================================================
       * F2. UPCOMING BILLS (Compact Empty State + Equal Height)
       * ================================================================ */
      case 'upcoming_bills':
        return (
          <ThemeCard className="flex flex-col justify-between h-full">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--ff-border-color)]">
                <div className="flex items-center gap-2 min-w-0">
                  <CreditCard className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                    Upcoming Bills
                  </h3>
                  {(data?.unpaidBillsCount || 0) > 0 && (
                    <ThemeBadge tone="warning">{data?.unpaidBillsCount} due</ThemeBadge>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentTab('bills')}
                  className="text-xs font-semibold hover:underline shrink-0"
                  style={{ color: 'var(--ff-accent-text)' }}
                >
                  Manage Bills
                </button>
              </div>

              {!data?.upcomingPayments || data.upcomingPayments.length === 0 ? (
                <div className="ff-surface-subtle px-3.5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <CheckCircle2 className="w-4 h-4 text-[var(--ff-success)] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--ff-text-primary)] leading-snug">All bills settled</p>
                      <p className="text-[11px] text-[var(--ff-text-muted)] whitespace-normal break-words leading-relaxed mt-0.5">
                        No unpaid obligations scheduled for this cycle.
                      </p>
                    </div>
                  </div>
                  <ThemeButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setCurrentTab('bills')}
                    className="text-xs px-2.5 py-1 shrink-0"
                  >
                    + Add Bill
                  </ThemeButton>
                </div>
              ) : (
                <div className="divide-y ff-divider">
                  {data.upcomingPayments.slice(0, 5).map((bill) => (
                    <div
                      key={bill.id}
                      className="py-2.5 flex items-start justify-between gap-3 text-xs min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          title={bill.name}
                          className="font-semibold text-[var(--ff-text-primary)] whitespace-normal break-words leading-snug line-clamp-2"
                        >
                          {bill.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px] mt-0.5">
                          <span className="font-mono">Due {bill.dueDate}</span>
                          {bill.status === 'OVERDUE' && (
                            <ThemeBadge tone="danger">Overdue</ThemeBadge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono tabular-nums font-bold text-[var(--ff-text-primary)] block whitespace-nowrap">
                          {formatCurrency(bill.amountPaise, currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentTab('bills')}
                          className="text-[11px] font-semibold hover:underline"
                          style={{ color: 'var(--ff-accent-text)' }}
                        >
                          Pay Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ThemeCard>
        );

      /* ================================================================
       * F3. RECENT TRANSACTIONS (Compact Empty State + Equal Height)
       * ================================================================ */
      case 'recent_transactions':
        return (
          <ThemeCard className="flex flex-col justify-between h-full">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--ff-border-color)]">
                <div className="flex items-center gap-2 min-w-0">
                  <Scale className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-success)' }} />
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                    Recent Transactions
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentTab('transactions')}
                  className="text-xs font-semibold hover:underline shrink-0"
                  style={{ color: 'var(--ff-accent-text)' }}
                >
                  View Ledger
                </button>
              </div>

              {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
                <div className="ff-surface-subtle px-3.5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <Scale className="w-4 h-4 text-[var(--ff-text-muted)] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--ff-text-primary)] leading-snug">
                        No recent transactions
                      </p>
                      <p className="text-[11px] text-[var(--ff-text-muted)] whitespace-normal break-words leading-relaxed mt-0.5">
                        Log an expense or income entry to see live cashflow.
                      </p>
                    </div>
                  </div>
                  <ThemeButton
                    variant="secondary"
                    size="sm"
                    onClick={onOpenQuickAction}
                    className="text-xs px-2.5 py-1 shrink-0"
                  >
                    + Log Entry
                  </ThemeButton>
                </div>
              ) : (
                <div className="divide-y divide-[var(--ff-border-color)]">
                  {data.recentTransactions.slice(0, 5).map((tx) => {
                    const isIncome = tx.type === 'income';
                    return (
                      <div
                        key={tx.id}
                        className="py-2.5 flex items-start justify-between gap-3 text-xs last:border-b-0 min-w-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            title={tx.name}
                            className="font-semibold text-[var(--ff-text-primary)] whitespace-normal break-words leading-snug line-clamp-2"
                          >
                            {tx.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px] mt-0.5">
                            <span className="break-words">{tx.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono shrink-0">{tx.date}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className="font-mono tabular-nums font-bold whitespace-nowrap"
                            style={{
                              color: isIncome ? 'var(--ff-success)' : 'var(--ff-text-primary)',
                            }}
                          >
                            {isIncome ? '+' : '-'}
                            {formatCurrency(tx.amountPaise, currency)}
                          </span>
                          <span className="block text-[10px] text-[var(--ff-text-muted)] uppercase font-medium">
                            {tx.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ThemeCard>
        );

      /* ================================================================
       * G. ACTIVITY & PROGRESS (Level/Achievements + Real Activity Feed)
       * ================================================================ */
      case 'gamification':
        if (!isWide) {
          return (
            <GamificationCard
              sessions={sessions}
              tasks={tasks}
              bills={bills}
              savingsGoals={savingsGoals}
              focusStreakDays={data?.focusStreakDays || 0}
              bestStreakDays={data?.bestStreakDays}
              dailyFocusGoalMinutes={settings?.dailyFocusGoalMinutes}
              compact={true}
            />
          );
        }
        return (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
              Activity &amp; Progress
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              <div className="lg:col-span-7">
                <GamificationCard
                  sessions={sessions}
                  tasks={tasks}
                  bills={bills}
                  savingsGoals={savingsGoals}
                  focusStreakDays={data?.focusStreakDays || 0}
                  bestStreakDays={data?.bestStreakDays}
                  dailyFocusGoalMinutes={settings?.dailyFocusGoalMinutes}
                />
              </div>
              <div className="lg:col-span-5">
                <RecentActivityCard
                  items={recentActivity}
                  weeklyFocusMinutes={data?.weeklyFocusMinutes || 0}
                  weeklyGoalMinutes={weeklyGoalMin}
                  completedPomodorosCount={data?.completedPomodoroSessions || 0}
                />
              </div>
            </div>
          </div>
        );
    }
  };

  if (loadError && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] p-8 text-center space-y-4 rounded-2xl border border-red-500/30 bg-red-500/10">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[var(--ff-text-primary)]">
            Unable to Load Dashboard
          </h3>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-sm">{loadError}</p>
        </div>
        <ThemeButton variant="primary" size="sm" onClick={loadDashboardData}>
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          Retry Connection
        </ThemeButton>
      </div>
    );
  }

  return (
    <SkeletonCrossfade
      loading={isInitialLoading}
      skeleton={<SkeletonDashboard />}
      contentKey="dashboard-ready"
    >
      <div className="flex flex-col gap-5">
        {isStale && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">
                Cached metrics: Displaying previously saved records while network reconnects.
              </span>
            </div>
            <button
              type="button"
              onClick={loadDashboardData}
              className="text-xs font-semibold underline hover:text-amber-200 shrink-0 ml-2"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Subtab Switcher & Today's Focus Receipt Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
            {[
              { id: 'overview', label: 'Overview', icon: Sparkles },
              { id: 'decisions', label: 'Decision Journal', icon: Brain },
              { id: 'doomscroll', label: 'Self-Tax Jar', icon: Coins },
              { id: 'lifegrid', label: 'Life in Weeks', icon: Compass },
              { id: 'timecapsule', label: 'Time Capsule', icon: Mail },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeProductivitySubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProductivitySubTab(tab.id as typeof activeProductivitySubTab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    active
                      ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] shadow-sm'
                      : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setIsReceiptModalOpen(true)}
            className="font-bold text-emerald-400"
          >
            <Receipt className="w-3.5 h-3.5 mr-1" />
            <span>Today's Focus Receipt</span>
          </ThemeButton>
        </div>

        {/* SUBTAB VIEWS */}
        {activeProductivitySubTab === 'decisions' && <DecisionJournal />}
        {activeProductivitySubTab === 'doomscroll' && <DoomscrollTaxJar />}
        {activeProductivitySubTab === 'lifegrid' && <LifeInWeeksGrid />}
        {activeProductivitySubTab === 'timecapsule' && <TimeCapsuleView />}

        {activeProductivitySubTab === 'overview' && (
          <>
            {/* Customize, Horizon & Layout Presets Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            {/* Timeframe Filter Pills */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] select-none hidden sm:inline">
                Horizon
              </span>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
                {(['daily', 'weekly', 'monthly'] as const).map((tf) => {
                  const active = timeframe === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className="relative px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition-colors"
                      style={{
                        color: active ? 'var(--ff-accent-contrast)' : 'var(--ff-text-secondary)',
                      }}
                    >
                      {active && (
                        <motion.div
                          layoutId="dashboard-timeframe-pill"
                          className="absolute inset-0 rounded-lg pointer-events-none"
                          style={{ background: 'var(--ff-accent)' }}
                          transition={profile.spring}
                        />
                      )}
                      <span className="relative z-10">{tf}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-4 w-px bg-[var(--ff-border-color)] hidden md:block" />

            {/* Preset Layout Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] select-none hidden sm:inline">
                Layout
              </span>
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
                {(Object.keys(DASHBOARD_LAYOUT_PRESETS) as DashboardLayoutPreset[]).map(
                  (presetKey) => {
                    const active = layoutConfig.preset === presetKey;
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => persistLayout(DASHBOARD_LAYOUT_PRESETS[presetKey].config)}
                        title={DASHBOARD_LAYOUT_PRESETS[presetKey].description}
                        className={`relative px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                          active
                            ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] font-bold'
                            : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                        }`}
                      >
                        {DASHBOARD_LAYOUT_PRESETS[presetKey].label}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          <ThemeButton
            variant={customizeMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setCustomizeMode((v) => !v)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{customizeMode ? 'Done Customizing' : 'Customize Widgets'}</span>
          </ThemeButton>
        </div>

        {/* Customize Drawer */}
        {customizeMode && (
          <ThemeCard className="space-y-3 border-[var(--ff-accent-border)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  Customize Dashboard Layout
                </h3>
                <p className="text-xs text-[var(--ff-text-muted)]">
                  Drag cards below, reorder, toggle visibility, or adjust card width. Changes save automatically.
                </p>
              </div>
              <ThemeButton
                variant="ghost"
                size="sm"
                onClick={() => persistLayout(DASHBOARD_LAYOUT_PRESETS.executive.config)}
              >
                Reset Default
              </ThemeButton>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {layoutConfig.widgetOrder.map((id, index) => {
                const hidden = layoutConfig.hiddenWidgets.includes(id);
                const size = layoutConfig.widgetSizes[id] || 'standard';
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setDraggedWidget(id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedWidget && draggedWidget !== id) {
                        moveWidget(draggedWidget, id);
                      }
                      setDraggedWidget(null);
                    }}
                    className="ff-surface-subtle p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-3.5 h-3.5 text-[var(--ff-text-muted)] shrink-0" />
                      <span
                        className={`font-semibold truncate ${
                          hidden
                            ? 'line-through text-[var(--ff-text-muted)]'
                            : 'text-[var(--ff-text-primary)]'
                        }`}
                      >
                        {DASHBOARD_WIDGET_LABELS[id]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        value={size}
                        onChange={(e) => setWidgetSize(id, e.target.value as DashboardWidgetSize)}
                        className="ff-input px-1.5 py-1 text-[11px]"
                        aria-label={`Width for ${DASHBOARD_WIDGET_LABELS[id]}`}
                      >
                        <option value="compact">Half</option>
                        <option value="standard">Auto</option>
                        <option value="wide">Full</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => moveWidget(id, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-[var(--ff-surface-hover)] disabled:opacity-30"
                        title="Move up"
                        aria-label={`Move ${DASHBOARD_WIDGET_LABELS[id]} up`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveWidget(id, 'down')}
                        disabled={index === layoutConfig.widgetOrder.length - 1}
                        className="p-1 rounded hover:bg-[var(--ff-surface-hover)] disabled:opacity-30"
                        title="Move down"
                        aria-label={`Move ${DASHBOARD_WIDGET_LABELS[id]} down`}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleWidgetVisibility(id)}
                        className="p-1 rounded hover:bg-[var(--ff-surface-hover)]"
                        title={hidden ? 'Show widget' : 'Hide widget'}
                        aria-label={
                          hidden
                            ? `Show ${DASHBOARD_WIDGET_LABELS[id]}`
                            : `Hide ${DASHBOARD_WIDGET_LABELS[id]}`
                        }
                      >
                        {hidden ? (
                          <EyeOff className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ThemeCard>
        )}

        {/* Balanced 12-Column Responsive Widget Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {visibleWidgets.map((id) => (
            <div
              key={id}
              draggable={customizeMode}
              onDragStart={() => setDraggedWidget(id)}
              onDragOver={(e) => {
                if (customizeMode) e.preventDefault();
              }}
              onDrop={() => {
                if (customizeMode && draggedWidget && draggedWidget !== id) {
                  moveWidget(draggedWidget, id);
                }
                setDraggedWidget(null);
              }}
              className={`${gridSpans[id] || 'lg:col-span-12'} min-w-0 ${
                customizeMode
                  ? 'ring-1 ring-dashed ring-[var(--ff-accent-border)] rounded-2xl p-1 cursor-grab'
                  : ''
              }`}
            >
              {renderWidgetBody(id)}
            </div>
          ))}
        </div>
          </>
        )}

        {/* Today's Focus Receipt Modal */}
        <FocusReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          data={focusReceiptData}
        />
      </div>
    </SkeletonCrossfade>
  );
};
