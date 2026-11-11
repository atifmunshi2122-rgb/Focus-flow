import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FocusSession, FocusStatsData } from '../../types/index.ts';
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
      <div className="p-8 text-center text-xs text-slate-400">Loading focus analytics...</div>
    );
  }

  const maxMinutesInWeek = stats?.last7Days.reduce((max, d) => Math.max(max, d.minutes), 0) || 60;
  const chartHeight = 130;

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Monthly Focus</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {stats?.monthMinutes ? Math.floor(stats.monthMinutes / 60) : 0}h {((stats?.monthMinutes || 0) % 60)}m
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            {stats?.monthSessionsCount || 0} completed sessions
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Lifetime Focus</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {stats?.totalMinutes ? (stats.totalMinutes / 60).toFixed(1) : 0}h
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            All-time deep work logged
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Work Sessions</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {stats?.totalCompletedSessions || 0}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
            Pomodoro cycles finished
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">Weekly Target</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            85%
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 block">
            Consistent progress
          </span>
        </div>
      </div>

      {/* Weekly Focus Progress Bar Chart */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Last 7 Days Focus Distribution</h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">Daily focus minutes completed</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>Weekly History</span>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end justify-between gap-2 sm:gap-4 h-44 pt-4 px-2 border-b border-slate-100 dark:border-slate-800">
          {stats?.last7Days.map((day) => {
            const heightPercent = maxMinutesInWeek > 0 ? (day.minutes / maxMinutesInWeek) * chartHeight : 8;
            const isToday = day.date === new Date().toISOString().split('T')[0];

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group">
                {/* Tooltip on hover */}
                <span className="text-[10px] font-mono tabular-nums text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  {day.minutes}m
                </span>

                {/* Animated Bar */}
                <div
                  className="w-full max-w-[42px] rounded-t-lg transition-all duration-300 relative overflow-hidden"
                  style={{
                    height: `${Math.max(12, heightPercent)}px`,
                    backgroundColor: isToday ? '#6366f1' : '#cbd5e1',
                  }}
                >
                  <div
                    className={`absolute inset-0 ${
                      isToday
                        ? 'bg-gradient-to-t from-indigo-700 to-indigo-500'
                        : 'dark:bg-slate-700 bg-slate-300'
                    }`}
                  />
                </div>

                <div className="text-center">
                  <span className={`text-[11px] font-semibold block ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                    {day.dayName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono tabular-nums block">
                    {day.sessionsCount} sess
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Focus Session History Log */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-500" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Session History Log</h4>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {sessions.length} total recorded
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No completed sessions yet. Start your first Pomodoro session above!
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
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
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        s.mode === 'work'
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {s.mode === 'work' ? <Clock className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                    </div>

                    <div className="truncate">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {s.taskTitle || (s.mode === 'work' ? 'Deep Work Session' : 'Rest Break')}
                      </p>
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                        <span>{formattedDate} at {formattedTime}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{s.mode.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                      {s.durationMinutes} min
                    </span>
                    <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Completed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
