import React, { useEffect, useMemo, useState } from 'react';
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
  SavingsGoal,
  Task,
} from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import { GamificationCard } from './GamificationCard.tsx';
import {
  AnimatedNumber,
  EmptyStateIllustration,
  InteractiveSurface3D,
  MotionStaggerGrid,
  MotionStaggerItem,
  SkeletonDashboard,
} from '../ui/MotionPrimitives.tsx';
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
} from 'lucide-react';

interface UnifiedDashboardProps {
  onOpenQuickAction: () => void;
}

const DEFAULT_ORDER: DashboardWidgetId[] = [
  'clock_greeting',
  'hero',
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
    setCurrentTab,
    startTimer,
    switchTimerMode,
    isRunning,
    googleSpreadsheetId,
    createOrConnectSpreadsheet,
  } = useApp();

  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const [nowClock, setNowClock] = useState<Date>(() => new Date());
  const [customizeMode, setCustomizeMode] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<DashboardWidgetId | null>(null);

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
    ])
      .then(([dash, sess, tsk, b, sg]) => {
        setData(dash);
        setSessions(sess);
        setTasks(tsk);
        setBills(b);
        setSavingsGoals(sg);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

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

  if (loading && !data) {
    return <SkeletonDashboard />;
  }

  const sizeClassFor = (id: DashboardWidgetId) => {
    const customSize = layoutConfig.widgetSizes[id];
    if (customSize === 'compact') return 'lg:col-span-6';
    if (customSize === 'wide') return 'lg:col-span-12';
    // Adaptive multi-column layout for balanced dashboard experience on full screen
    if (
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
                {greetingText}, {user?.name || 'Operator'}
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
                {nowClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
            <ThemeCard variant="hero">
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

      case 'focus_kpis':
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Focus, Tasks &amp; Consistency
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
                      Today&apos;s Focus Time
                    </span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                      <AnimatedNumber
                        value={data?.todayFocusMinutes || 0}
                        format={(mins) => `${Math.floor(mins / 60)}h ${Math.round(mins) % 60}m`}
                      />
                    </div>
                    <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                      {data?.todayFocusMinutes || 0} / {dailyGoalMin}m daily goal
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
                      Completed Pomodoros
                    </span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                      <AnimatedNumber value={data?.completedPomodoroSessions || 0} />
                    </div>
                    <span className="text-[11px] font-semibold mt-1 block" style={{ color: 'var(--ff-success)' }}>
                      Deep focus cycles today
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
                Financial Standing (Today &amp; Monthly)
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
                    <span className="text-xs font-medium">Monthly Inflow</span>
                    <TrendingUp className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                    <AnimatedNumber
                      value={data?.monthlyIncomePaise || 0}
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                    Today: +{formatCurrency(data?.todayIncomePaise || 0, currency, { compact: true })}
                  </span>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="h-full">
                  <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                    <span className="text-xs font-medium">Monthly Outflow</span>
                    <TrendingDown className="w-4 h-4" style={{ color: 'var(--ff-danger)' }} />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                    <AnimatedNumber
                      value={data?.monthlyExpensesPaise || 0}
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                    Today: -{formatCurrency(data?.todayExpensesPaise || 0, currency, { compact: true })} · Fixed:{' '}
                    {formatCurrency(data?.fixedExpensesPaise || 0, currency, { compact: true })}
                  </span>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="h-full">
                  <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                    <span className="text-xs font-medium">Remaining Balance</span>
                    <Scale className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                  </div>
                  <div
                    className="text-2xl font-bold font-mono tabular-nums"
                    style={{
                      color:
                        (data?.remainingBalancePaise || 0) >= 0
                          ? 'var(--ff-text-primary)'
                          : 'var(--ff-danger)',
                    }}
                  >
                    <AnimatedNumber
                      value={data?.remainingBalancePaise || 0}
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                    Net savings after expenses
                  </span>
                </ThemeCard>
              </MotionStaggerItem>

              <MotionStaggerItem>
                <ThemeCard variant="interactive" className="h-full">
                  <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                    <span className="text-xs font-medium">Bills Status</span>
                    <CreditCard className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                    <AnimatedNumber
                      value={data?.totalUnpaidAmountPaise || 0}
                      format={(paise) => formatCurrency(Math.round(paise), currency)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                    <span className="font-semibold" style={{ color: 'var(--ff-warning)' }}>
                      {data?.unpaidBillsCount || 0} Unpaid
                    </span>
                    <span aria-hidden="true" className="text-[var(--ff-text-muted)]">·</span>
                    <span className="font-semibold" style={{ color: 'var(--ff-success)' }}>
                      {data?.paidBillsCount || 0} Paid
                    </span>
                  </div>
                </ThemeCard>
              </MotionStaggerItem>
            </MotionStaggerGrid>
          </div>
        );

      case 'productivity_goals':
        return (
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
                <div className="h-2.5 rounded-full overflow-hidden bg-[var(--ff-surface-subtle)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${dailyGoalPct}%`,
                      background: dailyGoalPct >= 100 ? 'var(--ff-success)' : 'var(--ff-accent)',
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[var(--ff-text-secondary)]">Weekly Deep Work Goal</span>
                  <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                    {data?.weeklyFocusMinutes || 0} / {weeklyGoalMin} min ({weeklyGoalPct}%)
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden bg-[var(--ff-surface-subtle)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${weeklyGoalPct}%`,
                      background: 'linear-gradient(90deg, var(--ff-accent), var(--ff-accent-secondary))',
                    }}
                  />
                </div>
              </div>
            </div>
          </ThemeCard>
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
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Customize Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
            </div>
          ))}
      </div>
    </div>
  );
};
