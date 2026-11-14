import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import {
  Bill,
  DashboardData,
  DashboardLayoutConfig,
  DashboardLayoutPreset,
  DashboardWidgetId,
  DashboardWidgetSize,
  FocusSession,
  Habit,
  SavingsGoal,
  Task,
  StudyTopic,
  StudyRevision,
  StudyMistake,
} from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import { GamificationCard } from './GamificationCard.tsx';
import { ProductivityScoreCard } from '../focus/ProductivityScoreCard.tsx';
import {
  computeHabitStreak,
  computeProductivityScore,
  isHabitScheduledOnDate,
} from '../../lib/productivityIntelligence.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  EmptyStateIllustration,
  InteractiveSurface3D,
  MotionStaggerGrid,
  MotionStaggerItem,
  RollingTimerDigits,
  SkeletonCrossfade,
  SkeletonDashboard,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { getSpringTransition } from '../../theme/motionTokens.ts';
import {
  CheckCircle2,
  Flame,
  TrendingUp,
  TrendingDown,
  Scale,
  CreditCard,
  Play,
  ArrowRight,
  Clock,
  Sparkles,
  FileSpreadsheet,
  ExternalLink,
  SlidersHorizontal,
  GripVertical,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Target,
  CheckSquare,
  GraduationCap,
  RotateCcw,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';

interface UnifiedDashboardProps {
  onOpenQuickAction: () => void;
}

const DEFAULT_ORDER: DashboardWidgetId[] = [
  'clock_greeting',
  'hero',
  'study_pulse',
  'focus_kpis',
  'finance_kpis',
  'productivity_goals',
  'gamification',
  'upcoming_bills',
  'recent_transactions',
];

const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  clock_greeting: 'Greeting & Live Clock',
  hero: 'Hero Command Banner',
  study_pulse: 'Study & Academic Pulse',
  focus_kpis: 'Focus & Task KPIs',
  finance_kpis: 'Finance Standing KPIs',
  productivity_goals: 'Daily & Weekly Goals',
  gamification: 'XP, Streaks & Badges',
  upcoming_bills: 'Upcoming Bills',
  recent_transactions: 'Recent Transactions',
};

const LAYOUT_PRESETS: Record<DashboardLayoutPreset, { label: string; config: DashboardLayoutConfig }> = {
  executive: {
    label: 'Executive Balanced',
    config: {
      preset: 'executive',
      widgetOrder: DEFAULT_ORDER,
      hiddenWidgets: [],
      widgetSizes: {
        study_pulse: 'compact',
        productivity_goals: 'compact',
        gamification: 'compact',
        upcoming_bills: 'compact',
        recent_transactions: 'compact',
      },
    },
  },
  focus_first: {
    label: 'Focus First',
    config: {
      preset: 'focus_first',
      widgetOrder: [
        'clock_greeting',
        'focus_kpis',
        'productivity_goals',
        'gamification',
        'hero',
        'finance_kpis',
        'upcoming_bills',
        'recent_transactions',
      ],
      hiddenWidgets: [],
      widgetSizes: { focus_kpis: 'wide', productivity_goals: 'wide' },
    },
  },
  finance_pulse: {
    label: 'Finance Pulse',
    config: {
      preset: 'finance_pulse',
      widgetOrder: [
        'clock_greeting',
        'finance_kpis',
        'upcoming_bills',
        'recent_transactions',
        'hero',
        'focus_kpis',
        'productivity_goals',
        'gamification',
      ],
      hiddenWidgets: [],
      widgetSizes: { finance_kpis: 'wide' },
    },
  },
  minimal: {
    label: 'Minimal Brief',
    config: {
      preset: 'minimal',
      widgetOrder: ['clock_greeting', 'focus_kpis', 'finance_kpis', 'upcoming_bills'],
      hiddenWidgets: ['hero', 'gamification', 'recent_transactions', 'productivity_goals'],
      widgetSizes: {},
    },
  },
};

export const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({ onOpenQuickAction }) => {
  const {
    user,
    settings,
    updateSettings,
    currency,
    refreshKey,
    triggerRefresh,
    setCurrentTab,
    startTimer,
    switchTimerMode,
    isRunning,
    googleSpreadsheetId,
    createOrConnectSpreadsheet,
  } = useApp();

  const { intensity, isDisabled, profile } = useMotionPreferences();
  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [studyTopics, setStudyTopics] = useState<StudyTopic[]>([]);
  const [studyRevisions, setStudyRevisions] = useState<StudyRevision[]>([]);
  const [studyMistakes, setStudyMistakes] = useState<StudyMistake[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = useMemo(() => getTodayDateString(DEFAULT_TIMEZONE), []);

  const [nowClock, setNowClock] = useState<Date>(() => new Date());
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [customizeMode, setCustomizeMode] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<DashboardWidgetId | null>(null);

  const daysInMonth = useMemo(() => {
    return new Date(nowClock.getFullYear(), nowClock.getMonth() + 1, 0).getDate();
  }, [nowClock]);

  const currentDay = nowClock.getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);
  const monthlyCapPaise = settings?.monthlyBudgetPaise || 0;
  const spentMonthPaise = data?.monthlyExpensesPaise || 0;
  const remainingBudgetPaise = Math.max(0, monthlyCapPaise - spentMonthPaise);
  const dailySafeLimitPaise = monthlyCapPaise > 0 ? Math.round(remainingBudgetPaise / daysRemaining) : 0;
  const todaySpentPaise = data?.todayExpensesPaise || 0;
  const isOverDailyLimit = dailySafeLimitPaise > 0 && todaySpentPaise > dailySafeLimitPaise;

  useEffect(() => {
    const id = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getDashboard(),
      api.getFocusSessions().catch(() => [] as FocusSession[]),
      api.getTasks().catch(() => [] as Task[]),
      api.getBills().catch(() => [] as Bill[]),
      api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
      api.getHabits().catch(() => [] as Habit[]),
      api.getStudyTopics().catch(() => [] as StudyTopic[]),
      api.getStudyRevisions().catch(() => [] as StudyRevision[]),
      api.getStudyMistakes().catch(() => [] as StudyMistake[]),
    ])
      .then(([dash, sess, tsk, b, sg, hab, st, sr, sm]) => {
        setData(dash);
        setSessions(sess);
        setTasks(tsk);
        setBills(b);
        setSavingsGoals(sg);
        setHabits(hab);
        setStudyTopics(st);
        setStudyRevisions(sr);
        setStudyMistakes(sm);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const productivityScore = useMemo(() => {
    return computeProductivityScore({
      tasks,
      sessions,
      habits,
      settings,
      referenceDateStr: todayStr,
    });
  }, [tasks, sessions, habits, settings, todayStr]);

  const studyStats = useMemo(() => {
    const activeTopics = studyTopics.filter((t) => !t.deletedAt);
    const total = activeTopics.length;
    const completed = activeTopics.filter((t) => t.theory && t.practice).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const due = studyRevisions.filter(
      (r) => !r.deletedAt && r.status !== 'mastered' && r.nextRevisionAt <= todayStr
    ).length;
    const overdue = studyRevisions.filter(
      (r) => !r.deletedAt && r.status !== 'mastered' && r.nextRevisionAt < todayStr
    ).length;
    const highTraps = studyMistakes.filter(
      (m) => !m.deletedAt && !m.resolved && m.severity === 'High'
    ).length;

    return { total, completed, pct, due, overdue, highTraps };
  }, [studyTopics, studyRevisions, studyMistakes, todayStr]);

  const handleToggleHabitFromDashboard = async (habitId: string) => {
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
    }
  };

  const layoutConfig = useMemo<DashboardLayoutConfig>(() => {
    const saved = settings?.dashboardLayout;
    if (!saved) return LAYOUT_PRESETS.executive.config;
    const validSet = new Set(DEFAULT_ORDER);
    const ordered = (saved.widgetOrder || []).filter((id) => validSet.has(id));
    for (const id of DEFAULT_ORDER) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return {
      preset: saved.preset || 'executive',
      widgetOrder: ordered,
      hiddenWidgets: (saved.hiddenWidgets || []).filter((id) => validSet.has(id)),
      widgetSizes: saved.widgetSizes || {},
    };
  }, [settings?.dashboardLayout]);

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

  const moveWidget = (fromId: DashboardWidgetId, directionOrTarget: 'up' | 'down' | DashboardWidgetId) => {
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
    switchTimerMode('work');
    startTimer();
    setCurrentTab('focus');
  };

  const hour = nowClock.getHours();
  const greetingText =
    hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dailyGoalMin = Math.max(15, settings?.dailyFocusGoalMinutes || 100);
  const weeklyGoalMin = Math.max(30, settings?.weeklyFocusGoalMinutes || 500);
  const dailyGoalPct = Math.min(100, Math.round(((data?.todayFocusMinutes || 0) / dailyGoalMin) * 100));
  const weeklyGoalPct = Math.min(100, Math.round(((data?.weeklyFocusMinutes || 0) / weeklyGoalMin) * 100));

  const isInitialLoading = loading && !data;

  const sizeClassFor = (id: DashboardWidgetId) => {
    const customSize = layoutConfig.widgetSizes[id];
    if (customSize === 'compact') return 'lg:col-span-6';
    if (customSize === 'wide') return 'lg:col-span-12';
    // Adaptive multi-column layout for balanced dashboard experience on full screen
    if (
      id === 'study_pulse' ||
      id === 'productivity_goals' ||
      id === 'gamification' ||
      id === 'upcoming_bills' ||
      id === 'recent_transactions'
    ) {
      return 'lg:col-span-6';
    }
    return 'lg:col-span-12';
  };

  const renderWidgetBody = (id: DashboardWidgetId) => {
    const size = layoutConfig.widgetSizes[id] || 'standard';

    switch (id) {
      case 'clock_greeting':
        return (
          <ThemeCard className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--ff-accent-text)]">
                {nowClock.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <h2 className="ff-heading text-xl sm:text-2xl font-extrabold text-[var(--ff-text-primary)]">
                {greetingText}, {user?.name || 'Atif Munshi'}
              </h2>
              <p className="text-xs text-[var(--ff-text-muted)]">
                {data?.pendingTasksCount || 0} pending tasks ·{' '}
                {data?.completedTasksCount || 0} completed ·{' '}
                Today Cashflow: +{formatCurrency(data?.todayIncomePaise || 0, currency, { compact: true })} / -
                {formatCurrency(data?.todayExpensesPaise || 0, currency, { compact: true })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                className="px-4 py-2 border font-mono text-lg font-extrabold tabular-nums text-[var(--ff-text-primary)]"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  borderColor: 'var(--ff-border-color)',
                  background: 'var(--ff-surface-subtle)',
                }}
              >
                <RollingTimerDigits
                  value={nowClock.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                />
              </div>
              <ThemeButton variant="primary" size="sm" onClick={handleStartQuickFocus}>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Focus</span>
              </ThemeButton>
              <ThemeButton variant="secondary" size="sm" onClick={onOpenQuickAction}>
                <span>Quick Add</span>
              </ThemeButton>
            </div>
          </ThemeCard>
        );

      case 'hero':
        return (
          <InteractiveSurface3D maxTilt={4}>
            <ThemeCard variant="hero" className="relative overflow-hidden">
              {/* Subtle floating 3D decorative elements */}
              {!isDisabled && (
                <>
                  <motion.div
                    aria-hidden="true"
                    animate={{
                      y: [-6, 6, -6],
                      x: [-4, 4, -4],
                      scale: [1, 1.08, 1],
                      opacity: [0.22, 0.45, 0.22],
                    }}
                    transition={{
                      duration: 6,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none blur-3xl"
                    style={{ background: 'var(--ff-accent)' }}
                  />
                  <motion.div
                    aria-hidden="true"
                    animate={{
                      y: [8, -8, 8],
                      x: [5, -5, 5],
                      opacity: [0.16, 0.35, 0.16],
                    }}
                    transition={{
                      duration: 7.5,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: 0.8,
                    }}
                    className="absolute -bottom-10 right-36 w-40 h-40 rounded-full pointer-events-none blur-3xl"
                    style={{ background: 'var(--ff-accent-secondary)' }}
                  />
                </>
              )}
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <div
                    className="flex items-center gap-2 text-xs font-semibold"
                    style={{ color: 'var(--ff-hero-muted)' }}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Unified Command Center</span>
                  </div>
                  <h1
                    className="ff-heading text-2xl sm:text-3xl font-extrabold text-balance"
                    style={{ color: 'var(--ff-hero-text)' }}
                  >
                    Focus Deeply. Manage Wealth Intelligently.
                  </h1>
                  <p
                    className="text-xs sm:text-sm leading-relaxed"
                    style={{ color: 'var(--ff-hero-muted)' }}
                  >
                    Your personal productivity engine and financial ledger synchronized in real time.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {googleSpreadsheetId ? (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ff-btn px-3.5 py-2.5 text-xs backdrop-blur-md border"
                      style={{
                        background: 'rgba(16, 185, 129, 0.22)',
                        borderColor: 'rgba(16, 185, 129, 0.45)',
                        color: 'var(--ff-hero-text)',
                      }}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Open Master Sheets</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <ThemeButton variant="success" size="md" onClick={() => void createOrConnectSpreadsheet()}>
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Initialize 23 Master Sheets</span>
                    </ThemeButton>
                  )}

                  <ThemeButton variant="primary" size="md" onClick={handleStartQuickFocus}>
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                    <span>{isRunning ? 'View Active Timer' : 'Launch 25m Focus'}</span>
                  </ThemeButton>
                </div>
              </div>
            </ThemeCard>
          </InteractiveSurface3D>
        );

      case 'study_pulse':
        return (
          <ThemeCard className="flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    Study OS &amp; Academic Pulse
                  </h3>
                  <p className="text-xs text-[var(--ff-text-muted)]">
                    Syllabus retention and cognitive recall status
                  </p>
                </div>
              </div>
              <ThemeButton
                variant="ghost"
                size="sm"
                onClick={() => setCurrentTab('study')}
                className="text-xs text-[var(--ff-accent-text)] flex items-center gap-1"
              >
                <span>Open Study OS</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </ThemeButton>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[var(--ff-text-secondary)]">Syllabus Completion</span>
                  <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                    {studyStats.completed} / {studyStats.total} topics ({studyStats.pct}%)
                  </span>
                </div>
                <AnimatedProgressBar
                  value={studyStats.pct}
                  showShimmer={true}
                  tone={studyStats.pct >= 80 ? 'success' : 'accent'}
                  heightClass="h-2.5"
                  ariaLabel="Syllabus Completion"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--ff-border-color)]">
                <div
                  onClick={() => setCurrentTab('study')}
                  className="cursor-pointer p-2.5 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] hover:border-amber-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                    <span className="flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Due Revisions
                    </span>
                    <span className="font-mono font-bold text-[var(--ff-text-primary)] text-sm">
                      {studyStats.due}
                    </span>
                  </div>
                  {studyStats.overdue > 0 ? (
                    <span className="text-[10px] text-rose-400 font-medium">
                      ⚠️ {studyStats.overdue} overdue!
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-medium">
                      ✓ Memory refreshed
                    </span>
                  )}
                </div>

                <div
                  onClick={() => setCurrentTab('study')}
                  className="cursor-pointer p-2.5 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] hover:border-rose-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> High Traps
                    </span>
                    <span className="font-mono font-bold text-rose-400 text-sm">
                      {studyStats.highTraps}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--ff-text-muted)]">
                    Unresolved root causes
                  </span>
                </div>
              </div>
            </div>
          </ThemeCard>
        );

      case 'focus_kpis':
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Focus, Tasks &amp; Consistency ({timeframe === 'daily' ? 'Daily' : timeframe === 'weekly' ? 'Weekly' : 'Monthly'})
              </h2>
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
              className={`grid grid-cols-1 ${size === 'compact' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}
              style={{ gap: 'var(--ff-grid-gap)' }}
            >
              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="flex items-center justify-between h-full">
                  <div>
                    <span className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">
                      {timeframe === 'daily'
                        ? "Today's Focus Time"
                        : timeframe === 'weekly'
                        ? 'Weekly Focus Time'
                        : 'Monthly Deep Focus'}
                    </span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                      <AnimatedNumber
                        value={
                          timeframe === 'daily'
                            ? (data?.todayFocusMinutes || 0)
                            : timeframe === 'weekly'
                            ? (data?.weeklyFocusMinutes || (data?.todayFocusMinutes || 0) * 3)
                            : Math.round(((data?.weeklyFocusMinutes || 0) * 4.33) || (data?.todayFocusMinutes || 0) * 20)
                        }
                        format={(mins) => `${Math.floor(mins / 60)}h ${Math.round(mins) % 60}m`}
                      />
                    </div>
                    <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                      {timeframe === 'daily'
                        ? `${data?.todayFocusMinutes || 0} / ${dailyGoalMin}m daily goal`
                        : timeframe === 'weekly'
                        ? `${data?.weeklyFocusMinutes || 0} / ${weeklyGoalMin}m weekly goal`
                        : 'Cumulative focus hours this month'}
                    </span>
                  </div>
                  <div
                    className="w-11 h-11 flex items-center justify-center shrink-0"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      background: 'var(--ff-accent-soft)',
                      color: 'var(--ff-accent-text)',
                    }}
                  >
                    <Clock className="w-5 h-5" />
                  </div>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="flex items-center justify-between h-full">
                  <div>
                    <span className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">
                      {timeframe === 'daily'
                        ? 'Completed Pomodoros'
                        : timeframe === 'weekly'
                        ? 'Weekly Focus Cycles'
                        : 'Monthly Focus Cycles'}
                    </span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                      <AnimatedNumber
                        value={
                          timeframe === 'daily'
                            ? (data?.completedPomodoroSessions || 0)
                            : timeframe === 'weekly'
                            ? Math.max(data?.completedPomodoroSessions || 0, Math.round((data?.weeklyFocusMinutes || 0) / 25))
                            : Math.max(data?.completedPomodoroSessions || 0, Math.round(((data?.weeklyFocusMinutes || 0) * 4.33) / 25))
                        }
                      />
                    </div>
                    <span className="text-[11px] font-semibold mt-1 block" style={{ color: 'var(--ff-success)' }}>
                      {timeframe === 'daily'
                        ? 'Deep focus cycles today'
                        : timeframe === 'weekly'
                        ? 'Sessions completed this week'
                        : 'Deep work sessions this month'}
                    </span>
                  </div>
                  <div
                    className="w-11 h-11 flex items-center justify-center shrink-0"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      background: 'var(--ff-success-soft)',
                      color: 'var(--ff-success)',
                    }}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="flex items-center justify-between h-full">
                  <div>
                    <span className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">
                      Tasks Execution
                    </span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                      <AnimatedNumber value={data?.completedTasksCount || 0} />
                      <span className="text-sm font-normal text-[var(--ff-text-muted)]">
                        {' '}/ {(data?.completedTasksCount || 0) + (data?.pendingTasksCount || 0)}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                      {data?.pendingTasksCount || 0} open pending tasks
                    </span>
                  </div>
                  <div
                    className="w-11 h-11 flex items-center justify-center shrink-0"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      background: 'var(--ff-accent-soft)',
                      color: 'var(--ff-accent-text)',
                    }}
                  >
                    <CheckSquare className="w-5 h-5" />
                  </div>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="flex items-center justify-between h-full">
                  <div>
                    <span className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">
                      Focus Streak
                    </span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                      <AnimatedNumber
                        value={data?.focusStreakDays || 0}
                        format={(d) => `${Math.round(d)} Days`}
                      />
                    </div>
                    <span className="text-[11px] font-semibold mt-1 block" style={{ color: 'var(--ff-warning)' }}>
                      Personal best: {data?.bestStreakDays || 0} days
                    </span>
                  </div>
                  <div
                    className="w-11 h-11 flex items-center justify-center shrink-0"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      background: 'var(--ff-warning-soft)',
                      color: 'var(--ff-warning)',
                    }}
                  >
                    <Flame className="w-5 h-5" />
                  </div>
                </ThemeCard>
              </MotionStaggerItem>
            </MotionStaggerGrid>
          </div>
        );

      case 'finance_kpis':
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Financial Standing ({timeframe === 'daily' ? 'Daily Flow & Guardrail' : timeframe === 'weekly' ? 'Weekly Normalized Pace' : 'Monthly Standing & Reserves'})
              </h2>
              <button
                type="button"
                onClick={() => setCurrentTab('finance')}
                className="flex items-center gap-1 text-xs font-semibold hover:underline"
                style={{ color: 'var(--ff-accent-text)' }}
              >
                <span>Open Finance Command</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <MotionStaggerGrid
              className={`grid grid-cols-1 ${size === 'compact' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}
              style={{ gap: 'var(--ff-grid-gap)' }}
            >
              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="h-full">
                  <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                    <span className="text-xs font-medium">
                      {timeframe === 'daily' ? "Today's Inflow" : timeframe === 'weekly' ? 'Weekly Inflow Pace' : 'Monthly Inflow'}
                    </span>
                    <TrendingUp className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                    <AnimatedNumber
                      value={
                        timeframe === 'daily'
                          ? (data?.todayIncomePaise || 0)
                          : timeframe === 'weekly'
                          ? Math.round((data?.monthlyIncomePaise || 0) / 4.33)
                          : (data?.monthlyIncomePaise || 0)
                      }
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                    {timeframe === 'daily'
                      ? 'Direct revenue received today'
                      : timeframe === 'weekly'
                      ? '7-day normalized revenue pace'
                      : `Today: +${formatCurrency(data?.todayIncomePaise || 0, currency, { compact: true })}`}
                  </span>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="h-full">
                  <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                    <span className="text-xs font-medium">
                      {timeframe === 'daily' ? "Today's Outflow" : timeframe === 'weekly' ? 'Weekly Outflow Pace' : 'Monthly Outflow'}
                    </span>
                    <TrendingDown className="w-4 h-4" style={{ color: 'var(--ff-danger)' }} />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                    <AnimatedNumber
                      value={
                        timeframe === 'daily'
                          ? (data?.todayExpensesPaise || 0)
                          : timeframe === 'weekly'
                          ? Math.round((data?.monthlyExpensesPaise || 0) / 4.33)
                          : (data?.monthlyExpensesPaise || 0)
                      }
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                    {timeframe === 'daily'
                      ? 'Expenses recorded today'
                      : timeframe === 'weekly'
                      ? '7-day normalized expenditure burn'
                      : `Fixed: ${formatCurrency(data?.fixedExpensesPaise || 0, currency, { compact: true })} · Var: ${formatCurrency(data?.variableExpensesPaise || 0, currency, { compact: true })}`}
                  </span>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="h-full">
                  <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                    <span className="text-xs font-medium">
                      {timeframe === 'daily' ? "Today's Net Cashflow" : timeframe === 'weekly' ? 'Weekly Net Balance' : 'Remaining Balance'}
                    </span>
                    <Scale className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                  </div>
                  <div
                    className="text-2xl font-bold font-mono tabular-nums"
                    style={{
                      color:
                        (timeframe === 'daily'
                          ? (data?.todayIncomePaise || 0) - (data?.todayExpensesPaise || 0)
                          : (data?.remainingBalancePaise || 0)) >= 0
                          ? 'var(--ff-text-primary)'
                          : 'var(--ff-danger)',
                    }}
                  >
                    <AnimatedNumber
                      value={
                        timeframe === 'daily'
                          ? (data?.todayIncomePaise || 0) - (data?.todayExpensesPaise || 0)
                          : timeframe === 'weekly'
                          ? Math.round(((data?.monthlyIncomePaise || 0) - (data?.monthlyExpensesPaise || 0)) / 4.33)
                          : (data?.remainingBalancePaise || 0)
                      }
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                    {timeframe === 'daily'
                      ? 'Net savings after today’s spend'
                      : timeframe === 'weekly'
                      ? 'Estimated 7-day retained capital'
                      : 'Net accumulated savings balance'}
                  </span>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="h-full">
                  <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                    <span className="text-xs font-medium">
                      {monthlyCapPaise > 0 ? 'Daily Safe-to-Spend' : 'Bills Pending'}
                    </span>
                    {monthlyCapPaise > 0 ? (
                      <Target
                        className="w-4 h-4"
                        style={{ color: isOverDailyLimit ? 'var(--ff-danger)' : 'var(--ff-success)' }}
                      />
                    ) : (
                      <CreditCard className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
                    )}
                  </div>
                  <div
                    className="text-2xl font-bold font-mono tabular-nums"
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
                          : (data?.totalUnpaidAmountPaise || 0)
                      }
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px]">
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

      case 'productivity_goals':
        return (
          <div className="space-y-4">
            <ProductivityScoreCard scoreData={productivityScore} />

            <ThemeCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[var(--ff-accent-text)]" />
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    Daily Productivity Goal &amp; Weekly Progress
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentTab('settings')}
                  className="text-xs font-semibold text-[var(--ff-accent-text)] hover:underline"
                >
                  Adjust Targets
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-[var(--ff-text-secondary)]">Daily Focus Target</span>
                    <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                      {data?.todayFocusMinutes || 0} / {dailyGoalMin} min ({dailyGoalPct}%)
                    </span>
                  </div>
                  <AnimatedProgressBar
                    value={dailyGoalPct}
                    showShimmer={true}
                    tone={dailyGoalPct >= 100 ? 'success' : 'accent'}
                    heightClass="h-2.5"
                    ariaLabel="Daily Focus Target"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-[var(--ff-text-secondary)]">Weekly Deep Work Goal</span>
                    <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                      {data?.weeklyFocusMinutes || 0} / {weeklyGoalMin} min ({weeklyGoalPct}%)
                    </span>
                  </div>
                  <AnimatedProgressBar
                    value={weeklyGoalPct}
                    showShimmer={true}
                    tone={weeklyGoalPct >= 100 ? 'success' : 'accent'}
                    heightClass="h-2.5"
                    ariaLabel="Weekly Deep Work Goal"
                  />
                </div>
              </div>

              {/* Today's Habits Quick Check-off */}
              {habits.length > 0 && (
                <div className="pt-3 border-t border-[var(--ff-border-color)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-500" /> Today's Scheduled Habits
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentTab('habits')}
                      className="text-xs font-semibold text-[var(--ff-accent-text)] hover:underline"
                    >
                      View All Habits
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {habits
                      .filter((h) => !h.deletedAt && isHabitScheduledOnDate(h, todayStr))
                      .map((h) => {
                        const isDone = (h.completedDates || []).includes(todayStr);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => handleToggleHabitFromDashboard(h.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                              isDone
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                                : 'bg-[var(--ff-surface-subtle)] border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:border-emerald-400'
                            }`}
                          >
                            <div
                              className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                                isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-current opacity-40'
                              }`}
                            >
                              {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
                            </div>
                            <span className={isDone ? 'line-through opacity-80' : ''}>{h.title}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </ThemeCard>
          </div>
        );

      case 'gamification':
        return (
          <GamificationCard
            sessions={sessions}
            tasks={tasks}
            bills={bills}
            savingsGoals={savingsGoals}
            focusStreakDays={data?.focusStreakDays || 0}
            bestStreakDays={data?.bestStreakDays}
            dailyFocusGoalMinutes={settings?.dailyFocusGoalMinutes}
            compact={size === 'compact'}
          />
        );

      case 'upcoming_bills':
        return (
          <ThemeCard className="flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    Upcoming Bill Obligations
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentTab('bills')}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: 'var(--ff-accent-text)' }}
                >
                  Manage Bills
                </button>
              </div>

              {!data?.upcomingPayments || data.upcomingPayments.length === 0 ? (
                <EmptyStateIllustration
                  icon={<CreditCard className="w-6 h-6" />}
                  title="All bills settled"
                  description="All bills for this period are completely paid! Great financial discipline."
                />
              ) : (
                <div className="divide-y ff-divider">
                  {data.upcomingPayments.map((bill) => (
                    <div
                      key={bill.id}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ff-text-primary)] truncate">
                          {bill.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px] mt-0.5">
                          <span className="font-mono">Due {bill.dueDate}</span>
                          {bill.status === 'OVERDUE' && (
                            <ThemeBadge tone="danger">Overdue</ThemeBadge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono tabular-nums font-bold text-[var(--ff-text-primary)] block">
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

      case 'recent_transactions':
        return (
          <ThemeCard className="flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    Recent Financial Flow
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentTab('transactions')}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: 'var(--ff-accent-text)' }}
                >
                  View Ledger
                </button>
              </div>

              {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
                <EmptyStateIllustration
                  icon={<Scale className="w-6 h-6" />}
                  title="No recent transactions"
                  description="Log an expense or income entry to see your live financial flow here."
                />
              ) : (
                <div className="divide-y ff-divider">
                  {data.recentTransactions.map((tx) => {
                    const isIncome = tx.type === 'income';
                    return (
                      <div
                        key={tx.id}
                        className="py-3 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--ff-text-primary)] truncate">
                            {tx.name}
                          </p>
                          <div className="flex items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px] mt-0.5">
                            <span>{tx.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{tx.date}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className="font-mono tabular-nums font-bold"
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
    }
  };

  return (
    <SkeletonCrossfade
      loading={isInitialLoading}
      skeleton={<SkeletonDashboard />}
      contentKey="dashboard-ready"
    >
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Customize & Timeframe Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Filter Pills */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
            {(['daily', 'weekly', 'monthly'] as const).map((tf) => {
              const active = timeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className="relative px-3 py-1 text-xs font-semibold rounded-lg capitalize transition-colors"
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

          <div className="h-4 w-px bg-[var(--ff-border-color)] hidden sm:block" />

          {/* Preset Layout Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(LAYOUT_PRESETS) as DashboardLayoutPreset[]).map((presetKey) => {
              const active = layoutConfig.preset === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => persistLayout(LAYOUT_PRESETS[presetKey].config)}
                  className="px-3 py-1.5 text-xs font-semibold border transition-colors"
                  style={{
                    borderRadius: 'var(--ff-radius-button)',
                    borderColor: active ? 'var(--ff-accent-border)' : 'var(--ff-border-color)',
                    background: active ? 'var(--ff-accent-soft)' : 'var(--ff-surface-subtle)',
                    color: active ? 'var(--ff-accent-text)' : 'var(--ff-text-secondary)',
                  }}
                >
                  {LAYOUT_PRESETS[presetKey].label}
                </button>
              );
            })}
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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Drag, Resize &amp; Toggle Dashboard Widgets
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Drag widgets directly below or toggle visibility &amp; card span here. Changes save automatically.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {layoutConfig.widgetOrder.map((id, index) => {
              const hidden = layoutConfig.hiddenWidgets.includes(id);
              const size = layoutConfig.widgetSizes[id] || 'standard';
              return (
                <div
                  key={id}
                  className="ff-surface-subtle p-2.5 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                      {index + 1}. {WIDGET_LABELS[id]}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleWidgetVisibility(id)}
                      className="p-1 rounded hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-muted)]"
                      title={hidden ? 'Show widget' : 'Hide widget'}
                    >
                      {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveWidget(id, 'up')}
                        className="p-1 rounded border border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-hover)]"
                        aria-label={`Move ${WIDGET_LABELS[id]} up`}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveWidget(id, 'down')}
                        className="p-1 rounded border border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-hover)]"
                        aria-label={`Move ${WIDGET_LABELS[id]} down`}
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <select
                      value={size}
                      onChange={(e) => setWidgetSize(id, e.target.value as DashboardWidgetSize)}
                      className="ff-input px-2 py-1 text-[11px]"
                      aria-label={`${WIDGET_LABELS[id]} size`}
                    >
                      <option value="compact">Half Width</option>
                      <option value="standard">Standard</option>
                      <option value="wide">Wide</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </ThemeCard>
      )}

      {/* Draggable Modular Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12" style={{ gap: 'var(--ff-grid-gap)' }}>
        {layoutConfig.widgetOrder
          .filter((id) => !layoutConfig.hiddenWidgets.includes(id))
          .map((id) => (
            <motion.div
              key={id}
              layout={isDisabled ? false : 'position'}
              transition={profile.listLayout}
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
              className={`${sizeClassFor(id)} ${customizeMode ? 'ring-1 ring-dashed ring-[var(--ff-accent-border)] rounded-2xl p-1 relative' : ''}`}
            >
              {customizeMode && (
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-[var(--ff-accent-text)] cursor-grab">
                  <span className="inline-flex items-center gap-1">
                    <GripVertical className="w-3.5 h-3.5" /> Drag: {WIDGET_LABELS[id]}
                  </span>
                </div>
              )}
              {renderWidgetBody(id)}
            </motion.div>
          ))}
      </div>
    </div>
    </SkeletonCrossfade>
  );
};
