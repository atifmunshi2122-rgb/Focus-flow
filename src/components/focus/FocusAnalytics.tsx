import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FocusSession, FocusStatsData } from '../../types/index.ts';
import { ThemeCard } from '../ui/ThemePrimitives.tsx';
import { Clock, CheckCircle2, Flame, Calendar, History, Sparkles } from 'lucide-react';

export const FocusAnalytics: React.FC = () => {
  const { refreshKey } = useApp();
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
    return (
      <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
        Loading focus analytics...
      </div>
    );
  }

  const maxMinutesInWeek = stats?.last7Days.reduce((max, d) => Math.max(max, d.minutes), 0) || 60;
  const chartHeight = 130;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-grid-gap)' }}>
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 'var(--ff-grid-gap)' }}>
        <ThemeCard variant="interactive">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
            <span className="text-xs font-medium">Monthly Focus</span>
            <Clock className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
            {stats?.monthMinutes ? Math.floor(stats.monthMinutes / 60) : 0}h{' '}
            {(stats?.monthMinutes || 0) % 60}m
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
            {stats?.monthSessionsCount || 0} completed sessions
          </span>
        </ThemeCard>

        <ThemeCard variant="interactive">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
            <span className="text-xs font-medium">Lifetime Focus</span>
            <Sparkles className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
            {stats?.totalMinutes ? (stats.totalMinutes / 60).toFixed(1) : 0}h
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
            All-time deep work logged
          </span>
        </ThemeCard>

        <ThemeCard variant="interactive">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
            <span className="text-xs font-medium">Work Sessions</span>
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ff-info)' }} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
            {stats?.totalCompletedSessions || 0}
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
            Pomodoro cycles finished
          </span>
        </ThemeCard>

        <ThemeCard variant="interactive">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
            <span className="text-xs font-medium">Weekly Target</span>
            <Flame className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
            85%
          </div>
          <span className="text-[11px] font-semibold mt-1 block" style={{ color: 'var(--ff-success)' }}>
            Consistent progress
          </span>
        </ThemeCard>
      </div>

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

        {/* Bar chart */}
        <div
          className="flex items-end justify-between gap-2 sm:gap-4 h-44 pt-4 px-2 border-b"
          style={{ borderColor: 'var(--ff-border-color)' }}
        >
          {stats?.last7Days.map((day) => {
            const heightPercent =
              maxMinutesInWeek > 0 ? (day.minutes / maxMinutesInWeek) * chartHeight : 8;
            const isToday = day.date === new Date().toISOString().split('T')[0];

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group">
                <span className="text-[10px] font-mono tabular-nums text-[var(--ff-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                  {day.minutes}m
                </span>

                <div
                  className="w-full max-w-[42px] transition-all duration-300 relative overflow-hidden"
                  style={{
                    height: `${Math.max(12, heightPercent)}px`,
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
          <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
            No completed sessions yet. Start your first Pomodoro session above!
          </div>
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
