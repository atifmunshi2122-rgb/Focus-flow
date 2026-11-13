import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FocusSession, FocusStatsData } from '../../types/index.ts';
import { ThemeCard } from '../ui/ThemePrimitives.tsx';
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
import { Clock, CheckCircle2, Flame, Calendar, History, Sparkles, Grid3X3 } from 'lucide-react';

export const FocusAnalytics: React.FC = () => {
  const { refreshKey, settings } = useApp();
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);
  const [stats, setStats] = useState<FocusStatsData | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getFocusStats(), api.getFocusSessions()])
      .then(([statsData, sessionsData]) => {
        setStats(statsData);
        setSessions(sessionsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading && !stats) {
    return <SkeletonDashboard />;
  }

  const maxMinutesInWeek = stats?.last7Days.reduce((max, d) => Math.max(max, d.minutes), 0) || 60;
  const chartHeight = 130;

  const weeklyGoalMin = Math.max(30, settings?.weeklyFocusGoalMinutes || 500);
  const weeklyMinutes =
    stats?.weeklyMinutes ?? (stats?.last7Days.reduce((acc, d) => acc + d.minutes, 0) || 0);
  const weeklyPct = Math.min(100, Math.round((weeklyMinutes / weeklyGoalMin) * 100));

  const dailyGoalMin = Math.max(15, settings?.dailyFocusGoalMinutes || 100);
  const todayMinutes = stats?.last7Days[stats.last7Days.length - 1]?.minutes || 0;
  const dailyPct = Math.min(100, Math.round((todayMinutes / dailyGoalMin) * 100));

  const heatmapDays = stats?.dailyHeatmap || [];
  const heatColor = (mins: number) => {
    if (mins <= 0) return 'var(--ff-surface-subtle)';
    if (mins < 30) return 'color-mix(in oklab, var(--ff-accent) 28%, transparent)';
    if (mins < 75) return 'color-mix(in oklab, var(--ff-accent) 55%, transparent)';
    if (mins < 120) return 'color-mix(in oklab, var(--ff-accent) 80%, transparent)';
    return 'var(--ff-accent)';
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-grid-gap)' }}>
      {/* KPI Cards Row */}
      <MotionStaggerGrid className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 'var(--ff-grid-gap)' }}>
        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="h-full">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Monthly Focus</span>
              <Clock className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
              <AnimatedNumber
                value={stats?.monthMinutes || 0}
                format={(mins) => `${Math.floor(mins / 60)}h ${Math.round(mins) % 60}m`}
              />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              {stats?.monthSessionsCount || 0} completed sessions
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="h-full">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Lifetime Focus</span>
              <Sparkles className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
              <AnimatedNumber
                value={stats?.totalMinutes || 0}
                format={(mins) => `${(mins / 60).toFixed(1)}h`}
              />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              All-time deep work logged
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="h-full">
            <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
              <span className="text-xs font-medium">Work Sessions</span>
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ff-info)' }} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
              <AnimatedNumber value={stats?.totalCompletedSessions || 0} />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              Pomodoro cycles finished
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <ThemeCard variant="interactive" className="h-full">
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
            const isToday = day.date === new Date().toISOString().split('T')[0];

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

      {/* Focus Session History Log */}
      <ThemeCard>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Session History Log</h3>
          </div>
          <span className="text-xs text-[var(--ff-text-muted)]">
            {sessions.length} total recorded
          </span>
        </div>

        {sessions.length === 0 ? (
          <EmptyStateIllustration
            icon={<History className="w-6 h-6" />}
            title="No completed sessions yet"
            description="Start your first Pomodoro session above to build focus momentum."
          />
        ) : (
          <div className="divide-y ff-divider">
            {sessions.slice(0, 8).map((s) => {
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
                      <p className="font-semibold text-[var(--ff-text-primary)] truncate">
                        {s.taskTitle || (s.mode === 'work' ? 'Deep Work Session' : 'Rest Break')}
                      </p>
                      <div className="flex items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px]">
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
                      {s.durationMinutes} min
                    </span>
                    <span
                      className="block text-[10px] font-medium"
                      style={{ color: 'var(--ff-success)' }}
                    >
                      Completed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ThemeCard>
    </div>
  );
};
