import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Lock, Unlock, Sparkles, CalendarClock } from 'lucide-react';
import type { PlannedStudySession, StudyTask } from '../../features/planner/types.ts';
import { DEFAULT_TIMEZONE, formatDateInTimezone } from '../../lib/dateTime.ts';
import './WeeklyStudyPlanner.css';

interface WeeklyStudyPlannerProps {
  weekStartDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onGeneratePlan: () => void;
  sessions: PlannedStudySession[];
  tasks: StudyTask[];
  unscheduled: Array<{ taskId: string; reason: string }>;
  onToggleLockSession: (sessionId: string) => void;
  onMoveSessionNextDay: (sessionId: string) => void;
  timezone?: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyStudyPlanner({
  weekStartDate,
  onPrevWeek,
  onNextWeek,
  onGeneratePlan,
  sessions,
  tasks,
  unscheduled,
  onToggleLockSession,
  onMoveSessionNextDay,
  timezone = DEFAULT_TIMEZONE,
}: WeeklyStudyPlannerProps) {
  const todayKey = formatDateInTimezone(new Date(), timezone);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(weekStartDate.getTime() + idx * 86400000);
      const dayKey = formatDateInTimezone(d, timezone);
      return {
        label: d.toLocaleDateString(undefined, { weekday: 'short', timeZone: timezone }),
        dayKey,
        displayDate: d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          timeZone: timezone,
        }),
        isToday: dayKey === todayKey,
      };
    });
  }, [weekStartDate, timezone, todayKey]);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, PlannedStudySession[]>();
    for (const s of sessions) {
      const k = formatDateInTimezone(new Date(s.startAt), timezone);
      const list = map.get(k) || [];
      list.push(s);
      map.set(k, list);
    }
    return map;
  }, [sessions, timezone]);

  return (
    <section className="weekly-study-planner" aria-label="Weekly Study Planner">
      <header className="planner-header">
        <div>
          <h2>Weekly Study Plan</h2>
          <p className="text-xs text-slate-300 mt-1">
            {weekDays[0]?.displayDate} – {weekDays[6]?.displayDate} · Deterministic AI-free schedule
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onPrevWeek} aria-label="Previous week">
            <ChevronLeft className="w-4 h-4 inline" />
          </button>
          <button type="button" onClick={onNextWeek} aria-label="Next week">
            <ChevronRight className="w-4 h-4 inline" />
          </button>
          <button type="button" onClick={onGeneratePlan} className="inline-flex items-center gap-1.5 font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Plan Week</span>
          </button>
        </div>
      </header>

      <div className="planner-week-grid">
        {weekDays.map((day) => {
          const daySessions = (sessionsByDay.get(day.dayKey) || []).sort(
            (a, b) => a.startAt - b.startAt
          );
          return (
            <div
              key={day.dayKey}
              className={`planner-day-column ${day.isToday ? 'today' : ''}`}
            >
              <div className="planner-day-heading flex items-center justify-between">
                <span>
                  {day.label} {day.displayDate}
                </span>
                {day.isToday && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500 text-white">
                    Today
                  </span>
                )}
              </div>

              {daySessions.length === 0 ? (
                <div className="text-[11px] text-slate-400 py-4 text-center">
                  No sessions
                </div>
              ) : (
                daySessions.map((sess) => {
                  const task = taskMap.get(sess.taskId);
                  const startStr = new Date(sess.startAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: timezone,
                  });
                  return (
                    <article
                      key={sess.id}
                      className={`planner-session-card ${task?.completed ? 'completed' : ''}`}
                      title={sess.reason}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <strong>{task?.title || 'Study Task'}</strong>
                        <button
                          type="button"
                          onClick={() => onToggleLockSession(sess.id)}
                          className="text-slate-300 hover:text-white shrink-0"
                          title={sess.locked ? 'Unlock session' : 'Lock session (keep fixed)'}
                        >
                          {sess.locked ? (
                            <Lock className="w-3 h-3 text-amber-300" />
                          ) : (
                            <Unlock className="w-3 h-3 opacity-60" />
                          )}
                        </button>
                      </div>
                      <small className="block">
                        {startStr} · {sess.durationMinutes}m
                      </small>
                      <small className="block text-[10px] text-indigo-200/80 mt-1 line-clamp-2">
                        {sess.reason}
                      </small>
                      {!sess.locked && !task?.completed && (
                        <button
                          type="button"
                          onClick={() => onMoveSessionNextDay(sess.id)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-sky-300 hover:underline"
                        >
                          <CalendarClock className="w-3 h-3" />
                          <span>Move +1d</span>
                        </button>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 && (
        <div className="planner-unscheduled">
          <h3 className="text-xs font-bold text-amber-200 mb-2">
            Unscheduled Tasks ({unscheduled.length})
          </h3>
          <div className="space-y-1.5">
            {unscheduled.map((u) => {
              const t = taskMap.get(u.taskId);
              return (
                <div key={u.taskId} className="text-xs text-slate-200 flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">{t?.title || u.taskId}</span>
                  <span className="text-[11px] text-amber-200/90 shrink-0">{u.reason}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

