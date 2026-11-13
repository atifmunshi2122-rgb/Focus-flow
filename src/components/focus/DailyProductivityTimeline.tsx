import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FocusSession, Habit, Task, TimeBlock } from '../../types/index.ts';
import {
  buildDailyProductivityTimeline,
  DailyTimelineResult,
} from '../../lib/productivityIntelligence.ts';
import {
  addDays,
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  getTodayDateString,
  parseDateString,
} from '../../lib/dateTime.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  EmptyStateIllustration,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Flame,
  Layers,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';

export const DailyProductivityTimeline: React.FC = () => {
  const { refreshKey, triggerRefresh, setCurrentTab } = useApp();
  const { isDisabled } = useMotionPreferences();

  const todayStr = useMemo(() => getTodayDateString(DEFAULT_TIMEZONE), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getTasks().catch(() => [] as Task[]),
      api.getFocusSessions().catch(() => [] as FocusSession[]),
      api.getHabits().catch(() => [] as Habit[]),
      api.getTimeBlocks(selectedDate).catch(() => [] as TimeBlock[]),
    ])
      .then(([taskList, sessionList, habitList, blockList]) => {
        setTasks(taskList);
        setSessions(sessionList);
        setHabits(habitList);
        setTimeBlocks(blockList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey, selectedDate]);

  const timelineData: DailyTimelineResult = useMemo(() => {
    return buildDailyProductivityTimeline({
      dateStr: selectedDate,
      tasks,
      sessions,
      habits,
      timeBlocks,
    });
  }, [selectedDate, tasks, sessions, habits, timeBlocks]);

  const handlePrevDay = () => setSelectedDate((prev) => addDays(prev, -1));
  const handleNextDay = () => setSelectedDate((prev) => addDays(prev, 1));
  const handleToday = () => setSelectedDate(todayStr);

  // Formatted display date (e.g. "Thursday, November 14, 2026")
  const displayDateStr = useMemo(() => {
    const parsed = parseDateString(selectedDate);
    if (!parsed) return selectedDate;
    const d = new Date(parsed.year, parsed.month - 1, parsed.day);
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [selectedDate]);

  const isCurrentToday = selectedDate === todayStr;

  return (
    <div className="space-y-5">
      {/* Date Navigation & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] rounded-2xl shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevDay}
            className="p-2 rounded-xl text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] transition-all"
            title="Previous Day"
            aria-label="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="font-bold text-sm sm:text-base text-[var(--ff-text-primary)]">
              {displayDateStr}
            </span>
            {isCurrentToday && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]">
                Today
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            className="p-2 rounded-xl text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] transition-all"
            title="Next Day"
            aria-label="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!isCurrentToday && (
            <ThemeButton variant="secondary" onClick={handleToday} className="text-xs">
              Back to Today
            </ThemeButton>
          )}

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="text-xs bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] rounded-xl px-3 py-1.5 focus:outline-none"
            aria-label="Pick date"
          />
        </div>
      </div>

      {/* Daily Metrics Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ThemeCard variant="interactive" className="p-3.5">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-1">
            <span className="text-xs font-medium">Focus Logged</span>
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
            {Math.floor(timelineData.totalFocusMinutes / 60)}h {timelineData.totalFocusMinutes % 60}m
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">Completed deep work</span>
        </ThemeCard>

        <ThemeCard variant="interactive" className="p-3.5">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-1">
            <span className="text-xs font-medium">Tasks Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
            <AnimatedNumber value={timelineData.totalTasksCompleted} />
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">Finished milestones</span>
        </ThemeCard>

        <ThemeCard variant="interactive" className="p-3.5">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-1">
            <span className="text-xs font-medium">Habits Done</span>
            <Flame className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
            <AnimatedNumber value={timelineData.totalHabitsCompleted} />
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">Habits checked off</span>
        </ThemeCard>

        <ThemeCard variant="interactive" className="p-3.5">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-1">
            <span className="text-xs font-medium">Time Blocks</span>
            <Layers className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
            <AnimatedNumber value={timelineData.totalTimeBlocks} />
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">Calendar slots planned</span>
        </ThemeCard>
      </div>

      {/* Category Time Allocation Pills */}
      {Object.keys(timelineData.categoryBreakdown).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-[var(--ff-surface-subtle)] rounded-xl border border-[var(--ff-border-color)]">
          <span className="text-xs font-semibold text-[var(--ff-text-secondary)]">Time by Category:</span>
          {Object.entries(timelineData.categoryBreakdown).map(([category, minutes]) => (
            <span
              key={category}
              className="text-xs px-2.5 py-1 rounded-full bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] font-medium text-[var(--ff-text-primary)] flex items-center gap-1.5"
            >
              <span>{category}</span>
              <span className="font-mono text-[var(--ff-accent-text)] font-bold">
                {minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Chronological Timeline Stream */}
      {timelineData.items.length === 0 ? (
        <EmptyStateIllustration
          icon={<Clock className="w-10 h-10 text-[var(--ff-text-muted)]" />}
          title={`No Activity Logged for ${isCurrentToday ? 'Today' : selectedDate}`}
          description="Start a focus session, check off tasks, or schedule time blocks to populate your visual daily timeline."
          action={
            <div className="flex items-center gap-2">
              <ThemeButton variant="primary" onClick={() => setCurrentTab('focus')}>
                Start Focus Session
              </ThemeButton>
              <ThemeButton variant="secondary" onClick={() => setCurrentTab('tasks')}>
                Go to Tasks
              </ThemeButton>
            </div>
          }
        />
      ) : (
        <div className="relative pl-6 sm:pl-8 border-l-2 border-[var(--ff-border-color)] space-y-4 my-2">
          {timelineData.items.map((item, idx) => {
            return (
              <motion.div
                key={item.id}
                initial={isDisabled ? { opacity: 1 } : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.03 }}
                className="relative group"
              >
                {/* Timeline Node Dot */}
                <div
                  className="absolute -left-[31px] sm:-left-[39px] top-3.5 w-4 h-4 rounded-full border-2 border-[var(--ff-surface-card)] flex items-center justify-center shrink-0 shadow-xs"
                  style={{ backgroundColor: item.color }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>

                {/* Timeline Card */}
                <ThemeCard
                  variant="interactive"
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4"
                  style={{ borderLeftColor: item.color }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-bold font-mono text-[var(--ff-text-primary)]">
                        {item.timeStr}
                      </span>
                      <span
                        className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${item.color} 16%, transparent)`,
                          color: item.color,
                        }}
                      >
                        {item.type.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-[var(--ff-text-muted)]">
                        {item.category}
                      </span>
                    </div>

                    <h4 className="font-semibold text-sm sm:text-base text-[var(--ff-text-primary)] truncate">
                      {item.title}
                    </h4>

                    {item.subtitle && (
                      <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                  </div>

                  {/* Status Pill */}
                  <div className="shrink-0 flex items-center gap-2">
                    {item.durationMinutes && (
                      <span className="text-xs font-mono font-medium text-[var(--ff-text-muted)]">
                        {item.durationMinutes} min
                      </span>
                    )}

                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        item.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : item.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {item.status === 'completed'
                        ? 'Completed'
                        : item.status === 'pending'
                        ? 'Pending'
                        : 'Scheduled'}
                    </span>
                  </div>
                </ThemeCard>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
