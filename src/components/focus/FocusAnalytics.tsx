import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { clientDataCache } from '../../lib/dataCache.ts';
import { FocusSession, FocusStatsData, Habit, Task, TimeBlock } from '../../types/index.ts';
import type { PomodoroGoal } from '../../types/pomodoro.ts';
import type { StudySubject, StudyRevision, StudyPlanTask } from '../../types/study.ts';
import {
  computeProductivityAnalytics,
  computeProductivityScore,
} from '../../lib/productivityIntelligence.ts';
import {
  computeSubjectFocusBreakdown,
  computePomodoroGoalProgress,
} from '../../lib/pomodoroAnalytics.ts';
import { DEFAULT_TIMEZONE, getTodayDateString, formatDateInTimezone } from '../../lib/dateTime.ts';
import { ThemeCard, ThemeBadge, ThemeButton } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  EmptyStateIllustration,
  MotionStaggerGrid,
  MotionStaggerItem,
  SkeletonDashboard,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Flame,
  Calendar,
  History,
  RotateCcw,
  Sparkles,
  Grid3X3,
  BarChart3,
  ListTodo,
} from 'lucide-react';
import { ProductivityScoreCard } from './ProductivityScoreCard.tsx';
import { DailyProductivityTimeline } from './DailyProductivityTimeline.tsx';
import { SmartDailyPlanner } from './SmartDailyPlanner.tsx';

export const FocusAnalytics: React.FC = () => {
  const { refreshKey, settings } = useApp();
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);

  const cachedStats = clientDataCache.getFocusStats();
  const cachedSessions = clientDataCache.getFocusSessions();
  const cachedTasks = clientDataCache.getTasks();
  const cachedHabits = clientDataCache.getHabits();
  const hasCachedFocus = Boolean(cachedSessions || cachedStats);

  const [subTab, setSubTab] = useState<'analytics' | 'timeline' | 'planner'>('analytics');
  const [hideMicroSessions, setHideMicroSessions] = useState<boolean>(true);
  const [stats, setStats] = useState<FocusStatsData | null>(() => cachedStats);
  const [sessions, setSessions] = useState<FocusSession[]>(() => cachedSessions || []);
  const [tasks, setTasks] = useState<Task[]>(() => cachedTasks || []);
  const [habits, setHabits] = useState<Habit[]>(() => cachedHabits || []);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() => clientDataCache.getTimeBlocks() || []);
  const [goals, setGoals] = useState<PomodoroGoal[]>(() => clientDataCache.getPomodoroGoals() || []);
  const [studySubjects, setStudySubjects] = useState<StudySubject[]>(() => clientDataCache.getStudySubjects() || []);
  const [studyRevisions, setStudyRevisions] = useState<StudyRevision[]>(() => clientDataCache.getStudyRevisions() || []);
  const [studyPlanTasks, setStudyPlanTasks] = useState<StudyPlanTask[]>(() => clientDataCache.getStudyPlanTasks() || []);
  const [loading, setLoading] = useState(!hasCachedFocus);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statsFailed, setStatsFailed] = useState<boolean>(false);
  const activeRequestSeqRef = useRef<number>(0);

  const todayStr = useMemo(
    () => getTodayDateString(settings?.timezone || DEFAULT_TIMEZONE),
    [settings?.timezone]
  );

  const loadFocusData = useCallback(() => {
    const seq = ++activeRequestSeqRef.current;
    if (!hasCachedFocus) {
      setLoading(true);
    }
    setFetchError(null);

    Promise.allSettled([
      api.getFocusStats(),
      api.getFocusSessions(),
      api.getTasks(),
      api.getHabits(),
      api.getTimeBlocks(todayStr),
      api.getPomodoroGoals(),
      api.getStudySubjects(),
      api.getStudyRevisions(),
      api.getStudyPlanTasks(),
    ]).then((results) => {
      // Discard stale responses from superseded requests
      if (seq !== activeRequestSeqRef.current) return;

      const [
        statsRes,
        sessionsRes,
        tasksRes,
        habitsRes,
        blocksRes,
        goalsRes,
        subsRes,
        revsRes,
        plansRes,
      ] = results;

      let primaryFailed = false;

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStats(statsRes.value);
        clientDataCache.setFocusStats(statsRes.value);
        setStatsFailed(false);
      } else {
        setStatsFailed(true);
        primaryFailed = true;
      }

      if (sessionsRes.status === 'fulfilled' && sessionsRes.value) {
        setSessions(sessionsRes.value);
        clientDataCache.setFocusSessions(sessionsRes.value);
      } else if (!cachedSessions) {
        primaryFailed = true;
      }

      if (tasksRes.status === 'fulfilled' && tasksRes.value) {
        setTasks(tasksRes.value);
        clientDataCache.setTasks(tasksRes.value);
      }
      if (habitsRes.status === 'fulfilled' && habitsRes.value) {
        setHabits(habitsRes.value);
        clientDataCache.setHabits(habitsRes.value);
      }
      if (blocksRes.status === 'fulfilled' && blocksRes.value) {
        setTimeBlocks(blocksRes.value);
        clientDataCache.setTimeBlocks(blocksRes.value, todayStr);
      }
      if (goalsRes.status === 'fulfilled' && goalsRes.value) {
        setGoals(goalsRes.value);
        clientDataCache.setPomodoroGoals(goalsRes.value);
      }
      if (subsRes.status === 'fulfilled' && subsRes.value) {
        setStudySubjects(subsRes.value);
        clientDataCache.setStudySubjects(subsRes.value);
      }
      if (revsRes.status === 'fulfilled' && revsRes.value) {
        setStudyRevisions(revsRes.value);
        clientDataCache.setStudyRevisions(revsRes.value);
      }
      if (plansRes.status === 'fulfilled' && plansRes.value) {
        setStudyPlanTasks(plansRes.value);
        clientDataCache.setStudyPlanTasks(plansRes.value);
      }

      if (primaryFailed && !hasCachedFocus && (!statsRes || statsRes.status === 'rejected') && (!sessionsRes || sessionsRes.status === 'rejected')) {
        setFetchError('Failed to load focus analytics. Please check connection and retry.');
      }

      setLoading(false);
    });
  }, [todayStr, hasCachedFocus, cachedSessions]);

  useEffect(() => {
    loadFocusData();
    return () => {
      // Cancel active request sequence on unmount
      activeRequestSeqRef.current++;
    };
  }, [loadFocusData, refreshKey]);

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

  const productivityAnalytics = useMemo(() => {
    return computeProductivityAnalytics({
      tasks,
      sessions,
      habits,
      timeBlocks,
      settings,
      referenceDateStr: todayStr,
    });
  }, [tasks, sessions, habits, timeBlocks, settings, todayStr]);

  const subjectBreakdown = useMemo(() => computeSubjectFocusBreakdown(sessions), [sessions]);

  const derivedFocusTotals = useMemo(() => {
    const tz = settings?.timezone || DEFAULT_TIMEZONE;
    const currentMonthPrefix = todayStr.slice(0, 7);
    const completedWorkSessions = sessions.filter((s) => s.completed && s.mode === 'work');

    const totalMinutes = Math.round(
      completedWorkSessions.reduce(
        (acc, s) =>
          acc +
          (typeof s.actualDurationSeconds === 'number' && s.actualDurationSeconds > 0
            ? s.actualDurationSeconds
            : typeof s.durationSeconds === 'number' && s.durationSeconds > 0
            ? s.durationSeconds
            : (s.durationMinutes || 0) * 60),
        0
      ) / 60
    );

    const monthSessions = completedWorkSessions.filter((s) =>
      formatDateInTimezone(s.startedAt, tz).startsWith(currentMonthPrefix)
    );

    const monthMinutes = Math.round(
      monthSessions.reduce(
        (acc, s) =>
          acc +
          (typeof s.actualDurationSeconds === 'number' && s.actualDurationSeconds > 0
            ? s.actualDurationSeconds
            : typeof s.durationSeconds === 'number' && s.durationSeconds > 0
            ? s.durationSeconds
            : (s.durationMinutes || 0) * 60),
        0
      ) / 60
    );

    return {
      totalCompletedSessions: Math.max(completedWorkSessions.length, stats?.totalCompletedSessions || 0),
      totalMinutes: Math.max(totalMinutes, stats?.totalMinutes || 0),
      monthSessionsCount: Math.max(monthSessions.length, stats?.monthSessionsCount || 0),
      monthMinutes: Math.max(monthMinutes, stats?.monthMinutes || 0),
    };
  }, [sessions, stats, settings?.timezone, todayStr]);

  if (loading && !stats && sessions.length === 0) {
    return <SkeletonDashboard />;
  }

  if (fetchError && !stats && sessions.length === 0) {
    return (
      <div className="p-8 text-center rounded-2xl border border-red-500/30 bg-red-500/10 space-y-3 max-w-md mx-auto my-8">
        <AlertTriangle className="w-8 h-8 mx-auto text-rose-400" />
        <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Analytics Unavailable</h3>
        <p className="text-xs text-[var(--ff-text-muted)]">{fetchError}</p>
        <ThemeButton variant="primary" size="sm" onClick={loadFocusData}>
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          Retry Connection
        </ThemeButton>
      </div>
    );
  }

  // If live stats endpoint was unavailable, synthesize fallback metrics directly from verified session history
  const activeStats: FocusStatsData = stats || {
    last7Days: [],
    dailyHeatmap: [],
    weeklyMinutes: Math.round(derivedFocusTotals.monthMinutes / 4.33),
    monthMinutes: derivedFocusTotals.monthMinutes,
    monthSessionsCount: derivedFocusTotals.monthSessionsCount,
    totalMinutes: derivedFocusTotals.totalMinutes,
    totalCompletedSessions: derivedFocusTotals.totalCompletedSessions,
  };

  const safeLast7Days = activeStats.last7Days || [];
  const maxMinutesInWeek = safeLast7Days.reduce((max, d) => Math.max(max, d.minutes), 0) || 60;
  const chartHeight = 130;

  const weeklyGoalMin = Math.max(30, settings?.weeklyFocusGoalMinutes || 500);
  const weeklyMinutes =
    activeStats.weeklyMinutes ?? (safeLast7Days.reduce((acc, d) => acc + d.minutes, 0) || 0);
  const weeklyPct = Math.min(100, Math.round((weeklyMinutes / weeklyGoalMin) * 100));

  const dailyGoalMin = Math.max(15, settings?.dailyFocusGoalMinutes || 100);
  const todayMinutes = safeLast7Days[safeLast7Days.length - 1]?.minutes || 0;
  const dailyPct = Math.min(100, Math.round((todayMinutes / dailyGoalMin) * 100));

  const heatmapDays = activeStats.dailyHeatmap || [];
  const heatColor = (mins: number) => {
    if (mins <= 0) return 'var(--ff-surface-subtle)';
    if (mins < 30) return 'color-mix(in oklab, var(--ff-accent) 28%, transparent)';
    if (mins < 75) return 'color-mix(in oklab, var(--ff-accent) 55%, transparent)';
    if (mins < 120) return 'color-mix(in oklab, var(--ff-accent) 80%, transparent)';
    return 'var(--ff-accent)';
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-grid-gap)' }}>
      {statsFailed && (
        <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Remote stats deferred. Derived focus totals rendered from local session records.</span>
          </div>
          <button
            type="button"
            onClick={loadFocusData}
            className="text-xs font-semibold underline hover:text-amber-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Productivity Suite Sub-Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl max-w-full overflow-x-auto scrollbar-none shrink-0 w-fit">
        <button
          type="button"
          onClick={() => setSubTab('analytics')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            subTab === 'analytics'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Analytics & Score
        </button>

        <button
          type="button"
          onClick={() => setSubTab('timeline')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            subTab === 'timeline'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Daily Timeline
        </button>

        <button
          type="button"
          onClick={() => setSubTab('planner')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            subTab === 'planner'
              ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
              : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
          }`}
        >
          <ListTodo className="w-3.5 h-3.5" />
          Daily Planner
        </button>
      </div>

      {subTab === 'timeline' && <DailyProductivityTimeline />}
      {subTab === 'planner' && <SmartDailyPlanner />}

      {subTab === 'analytics' && (
        <>
          {/* Transparent Deterministic Productivity Score Card */}
          <ProductivityScoreCard scoreData={productivityScore} />

          {/* KPI Cards Row */}
      <MotionStaggerGrid className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 'var(--ff-grid-gap)' }}>
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="h-full">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Monthly Focus</span>
              <Clock className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
              <AnimatedNumber
                value={derivedFocusTotals.monthMinutes}
                format={(mins) => `${Math.floor(mins / 60)}h ${Math.round(mins) % 60}m`}
              />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              {derivedFocusTotals.monthSessionsCount} completed sessions
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="3d" className="h-full">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Lifetime Focus</span>
              <Sparkles className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
              <AnimatedNumber
                value={derivedFocusTotals.totalMinutes}
                format={(mins) => `${(mins / 60).toFixed(1)}h`}
              />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              All-time deep work logged
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="3d" className="h-full">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Work Sessions</span>
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ff-info)' }} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
              <AnimatedNumber value={derivedFocusTotals.totalCompletedSessions} />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              Pomodoro cycles finished
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="3d" className="h-full">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Weekly Target</span>
              <Flame className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
              <AnimatedNumber value={weeklyPct} format={(v) => `${Math.round(v)}%`} />
            </div>
            <span className="text-[11px] font-semibold mt-1 block" style={{ color: 'var(--ff-success)' }}>
              {weeklyMinutes} / {weeklyGoalMin} min goal
            </span>
          </ThemeCard>
        </MotionStaggerItem>
      </MotionStaggerGrid>

      {/* Daily & Weekly Focus Goals Bar */}
      <ThemeCard className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-[var(--ff-text-secondary)]">Today&apos;s Focus Goal</span>
            <span className="font-mono font-bold text-[var(--ff-text-primary)]">
              {todayMinutes} / {dailyGoalMin}m ({dailyPct}%)
            </span>
          </div>
          <AnimatedProgressBar
            value={dailyPct}
            showShimmer={true}
            tone={dailyPct >= 100 ? 'success' : 'accent'}
            heightClass="h-2"
            ariaLabel="Today's Focus Goal"
          />
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-[var(--ff-text-secondary)]">Weekly Deep Work Target</span>
            <span className="font-mono font-bold text-[var(--ff-text-primary)]">
              {weeklyMinutes} / {weeklyGoalMin}m ({weeklyPct}%)
            </span>
          </div>
          <AnimatedProgressBar
            value={weeklyPct}
            showShimmer={true}
            tone={weeklyPct >= 100 ? 'success' : 'accent'}
            heightClass="h-2"
            ariaLabel="Weekly Deep Work Target"
          />
        </div>
      </ThemeCard>

      {/* Custom Active Focus Goals */}
      {goals.length > 0 && (
        <ThemeCard className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Active Pomodoro Goals
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {goals.map((g) => {
              const prog = computePomodoroGoalProgress(
                sessions,
                g,
                new Date(),
                settings?.timezone || DEFAULT_TIMEZONE
              );
              return (
                <div
                  key={g.id}
                  className="p-3 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between text-xs font-medium mb-1 gap-2">
                    <span className="font-semibold text-[var(--ff-text-primary)] truncate">{g.title}</span>
                    <span className={`text-[10px] font-bold ${prog.isMet ? 'text-emerald-500' : 'text-[var(--ff-accent-text)]'}`}>
                      {prog.progressPct}%
                    </span>
                  </div>
                  <AnimatedProgressBar
                    value={prog.progressPct}
                    tone={prog.isMet ? 'success' : 'accent'}
                    heightClass="h-1.5"
                    ariaLabel={g.title}
                  />
                  <div className="flex items-center justify-between text-[10px] text-[var(--ff-text-muted)] mt-1.5 font-mono">
                    <span className="capitalize">{g.goalType}</span>
                    <span>
                      {prog.currentValue} / {prog.targetValue} {g.metricType === 'session_count' ? 'sessions' : 'm'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ThemeCard>
      )}

      {/* Weekly Habit & Focus Consistency Strip */}
      <ThemeCard className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--ff-accent-text)]" />
              Weekly Habit Consistency &amp; Productivity Insights
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Daily habit goal adherence ({dailyGoalMin}m threshold) and session pacing
            </p>
          </div>
          <ThemeBadge tone={dailyPct >= 100 ? 'success' : 'accent'}>
            {stats?.last7Days.filter((d) => d.minutes >= dailyGoalMin).length ?? 0} / 7 Days On-Target
          </ThemeBadge>
        </div>

        {/* 7-Day Consistency Dot Matrix */}
        <div className="grid grid-cols-7 gap-2 pt-1">
          {stats?.last7Days.map((d) => {
            const hitTarget = d.minutes >= dailyGoalMin;
            const hasActivity = d.minutes > 0;
            const isToday = d.date === todayStr;
            return (
              <div
                key={d.date}
                className="p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center"
                style={{
                  background: isToday
                    ? 'var(--ff-accent-soft)'
                    : hitTarget
                    ? 'var(--ff-success-soft)'
                    : 'var(--ff-surface-subtle)',
                  borderColor: isToday
                    ? 'var(--ff-accent-border)'
                    : hitTarget
                    ? 'var(--ff-success)'
                    : 'var(--ff-border-color)',
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                  {d.dayName.slice(0, 3)}
                </span>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    background: hitTarget
                      ? 'var(--ff-success)'
                      : hasActivity
                      ? 'var(--ff-accent)'
                      : 'var(--ff-surface-muted)',
                    color: '#ffffff',
                  }}
                >
                  {hitTarget ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <span className="text-[9px] font-mono font-bold">{d.minutes > 0 ? d.minutes : '0'}</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-[var(--ff-text-primary)]">
                  {d.minutes}m
                </span>
              </div>
            );
          })}
        </div>

        {/* Dynamic Insights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--ff-border-color)] text-xs">
          <div className="p-2.5 rounded-lg bg-[var(--ff-surface-subtle)]">
            <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
              Average Cycle Duration
            </span>
            <span className="text-sm font-bold font-mono text-[var(--ff-text-primary)] mt-0.5 block">
              {stats?.totalCompletedSessions && stats.totalCompletedSessions > 0
                ? `${Math.round(stats.totalMinutes / stats.totalCompletedSessions)} mins`
                : '25 mins'}
            </span>
            <span className="text-[10px] text-[var(--ff-text-muted)]">Per completed Pomodoro</span>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--ff-surface-subtle)]">
            <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
              Consistency Ratio
            </span>
            <span className="text-sm font-bold font-mono text-[var(--ff-success)] mt-0.5 block">
              {stats?.last7Days.length
                ? `${Math.round((stats.last7Days.filter((d) => d.minutes > 0).length / 7) * 100)}%`
                : '0%'}
            </span>
            <span className="text-[10px] text-[var(--ff-text-muted)]">Active days past 7 days</span>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--ff-surface-subtle)]">
            <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)] block">
              Focus Momentum Tier
            </span>
            <span className="text-sm font-bold font-mono text-[var(--ff-accent-text)] mt-0.5 block">
              {(stats?.totalMinutes || 0) >= 3000
                ? 'Platinum Master'
                : (stats?.totalMinutes || 0) >= 1200
                ? 'Gold Practitioner'
                : (stats?.totalMinutes || 0) >= 300
                ? 'Silver Builder'
                : 'Bronze Starter'}
            </span>
            <span className="text-[10px] text-[var(--ff-text-muted)]">Based on verified focus time</span>
          </div>
        </div>
      </ThemeCard>

      {/* Weekly Focus Progress Bar Chart */}
      <ThemeCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Last 7 Days Focus Distribution
            </h3>
            <span className="text-xs text-[var(--ff-text-muted)]">
              Daily focus minutes completed
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--ff-text-muted)]">
            <Calendar className="w-3.5 h-3.5" />
            <span>Weekly History</span>
          </div>
        </div>

        <div
          className="flex items-end justify-between gap-2 sm:gap-4 h-44 pt-4 px-2 border-b"
          style={{ borderColor: 'var(--ff-border-color)' }}
        >
          {stats?.last7Days.map((day, index) => {
            const heightPercent =
              maxMinutesInWeek > 0 ? (day.minutes / maxMinutesInWeek) * chartHeight : 8;
            const targetHeight = Math.max(12, Math.round(heightPercent));
            const isToday = day.date === todayStr;

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group">
                <span className="text-[10px] font-mono tabular-nums text-[var(--ff-text-muted)] opacity-0 group-hover:opacity-100 group-hover:-translate-y-0.5 transition-all duration-150">
                  {day.minutes}m
                </span>

                <motion.div
                  initial={isDisabled ? { height: targetHeight } : { height: 0 }}
                  animate={{ height: targetHeight }}
                  transition={{
                    duration: MOTION_DURATION.card * 1.15 * Math.max(0.5, factor || 0.01),
                    delay: isDisabled ? 0 : index * 0.04,
                    ease: MOTION_EASING.decelerate,
                  }}
                  whileHover={isDisabled ? undefined : { scaleY: 1.04 }}
                  className="w-full max-w-[42px] relative overflow-hidden origin-bottom"
                  style={{
                    borderTopLeftRadius: 'var(--ff-radius-badge)',
                    borderTopRightRadius: 'var(--ff-radius-badge)',
                    background: isToday
                      ? 'linear-gradient(180deg, var(--ff-accent), var(--ff-accent-secondary))'
                      : 'var(--ff-surface-muted)',
                    border: '1px solid var(--ff-border-color)',
                  }}
                />

                <div className="text-center">
                  <span
                    className="text-[11px] font-semibold block"
                    style={{
                      color: isToday ? 'var(--ff-accent-text)' : 'var(--ff-text-muted)',
                    }}
                  >
                    {day.dayName}
                  </span>
                  <span className="text-[10px] text-[var(--ff-text-muted)] font-mono tabular-nums block">
                    {day.sessionsCount} sess
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </ThemeCard>

      {/* 84-Day Focus Calendar Heatmap */}
      {heatmapDays.length > 0 && (
        <ThemeCard className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                84-Day Focus Activity Heatmap
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--ff-text-muted)]">
              <span>Less</span>
              {[0, 20, 60, 100, 140].map((v) => (
                <span
                  key={v}
                  className="w-3 h-3 rounded-xs border border-[var(--ff-border-color)]"
                  style={{ background: heatColor(v) }}
                />
              ))}
              <span>More</span>
            </div>
          </div>

          <div className="grid grid-cols-12 sm:grid-cols-14 md:grid-cols-21 lg:grid-cols-28 gap-1.5">
            {heatmapDays.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.minutes} min (${cell.sessionsCount} sessions)`}
                className="aspect-square rounded-xs border border-[var(--ff-border-color)] transition-transform hover:scale-125"
                style={{ background: heatColor(cell.minutes) }}
              />
            ))}
          </div>
        </ThemeCard>
      )}

      {/* Subject-Wise Focus Distribution */}
      {subjectBreakdown.length > 0 && (
        <ThemeCard>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Subject-Wise Focus Distribution
              </h3>
            </div>
            <span className="text-xs text-[var(--ff-text-muted)]">
              {subjectBreakdown.length} subject{subjectBreakdown.length > 1 ? 's' : ''} tracked
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {subjectBreakdown.map((item) => (
              <div
                key={item.subjectCode}
                className="p-3 rounded-xl bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-[var(--ff-text-primary)] truncate">{item.subjectCode}</span>
                  <span className="text-[var(--ff-accent-text)] font-mono">{item.totalMinutes}m</span>
                </div>
                <div className="w-full bg-[var(--ff-border-color)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[var(--ff-accent)] h-full rounded-full transition-all duration-300"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--ff-text-muted)]">
                  <span>{item.sessionCount} sessions</span>
                  <span>{item.percentage}% of total</span>
                </div>
              </div>
            ))}
          </div>
        </ThemeCard>
      )}

      {/* Focus Session History Log */}
      <ThemeCard>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Session History Log</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHideMicroSessions((v) => !v)}
              className="px-2 py-0.5 rounded-md border border-[var(--ff-border-color)] text-[11px] font-medium text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
              title="Toggle interrupted sessions shorter than 1 minute"
            >
              {hideMicroSessions ? 'Show <1m' : 'Hide <1m'}
            </button>
            <span className="text-xs text-[var(--ff-text-muted)]">
              {sessions.length} total recorded
            </span>
          </div>
        </div>

        {(() => {
          const visibleHistory = hideMicroSessions
            ? sessions.filter((s) => {
                if (s.completed) return true;
                const secs =
                  typeof s.actualDurationSeconds === 'number' && !Number.isNaN(s.actualDurationSeconds)
                    ? s.actualDurationSeconds
                    : (s.durationMinutes || 0) * 60;
                return secs >= 60;
              })
            : sessions;

          if (visibleHistory.length === 0) {
            return (
              <EmptyStateIllustration
                icon={<History className="w-6 h-6" />}
                title="No completed sessions yet"
                description="Start your first Pomodoro session above to build focus momentum."
              />
            );
          }

          return (
          <div className="divide-y ff-divider">
            {visibleHistory.slice(0, 8).map((s) => {
              const startDate = new Date(s.startedAt);
              const formattedDate = startDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const formattedTime = startDate.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={s.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-7 h-7 flex items-center justify-center shrink-0"
                      style={{
                        borderRadius: 'var(--ff-radius-badge)',
                        background:
                          s.mode === 'work' ? 'var(--ff-accent-soft)' : 'var(--ff-success-soft)',
                        color: s.mode === 'work' ? 'var(--ff-accent-text)' : 'var(--ff-success)',
                      }}
                    >
                      {s.mode === 'work' ? (
                        <Clock className="w-3.5 h-3.5" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-[var(--ff-text-primary)] truncate">
                          {s.taskTitle || (s.mode === 'work' ? 'Deep Work Session' : 'Rest Break')}
                        </p>
                        {s.subjectCode && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]">
                            {s.subjectCode}
                          </span>
                        )}
                        {s.interrupted && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-500">
                            Interrupted ({s.pauseCount || 1}p)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px] mt-0.5">
                        <span>
                          {formattedDate} at {formattedTime}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{s.mode.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono tabular-nums font-semibold text-[var(--ff-text-primary)]">
                      {(() => {
                        const actualSecs =
                          typeof s.actualDurationSeconds === 'number' &&
                          !Number.isNaN(s.actualDurationSeconds) &&
                          (!s.completed || s.actualDurationSeconds > 0)
                            ? s.actualDurationSeconds
                            : s.interrupted && s.startedAt && s.endedAt
                            ? Math.max(
                                1,
                                Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000)
                              )
                            : null;
                        if (actualSecs !== null) {
                          if (actualSecs < 60) return `${Math.round(actualSecs)}s`;
                          return `${Math.round(actualSecs / 60)} min`;
                        }
                        if (s.interrupted) return 'Partial';
                        return `${s.durationMinutes || Math.max(1, Math.round((s.durationSeconds || 0) / 60))} min`;
                      })()}
                    </span>
                    {s.completed ? (
                      <span
                        className="block text-[10px] font-semibold"
                        style={{ color: 'var(--ff-success)' }}
                      >
                        Completed
                      </span>
                    ) : s.status === 'in_progress' ? (
                      (() => {
                        const ageSecs = Math.max(0, (Date.now() - startDate.getTime()) / 1000);
                        const maxWindow = Math.max(s.durationSeconds || 3600, 3600) + 3600;
                        const isStaleSession = ageSecs > maxWindow;
                        return (
                          <span
                            className="block text-[10px] font-semibold"
                            style={{ color: isStaleSession ? 'var(--ff-warning)' : 'var(--ff-accent-text)' }}
                          >
                            {isStaleSession ? 'Incomplete' : 'In Progress'}
                          </span>
                        );
                      })()
                    ) : (
                      <span className="block text-[10px] font-semibold text-amber-500">
                        {s.endReason === 'skipped' ? 'Ended Early' : 'Interrupted'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}
      </ThemeCard>
        </>
      )}
    </div>
  );
};
