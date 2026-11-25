import React from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  ArrowUpRight,
} from 'lucide-react';
import { Task, TimeBlock } from '../../types/index.ts';
import {
  formatMinuteOfDay,
  TodaysPrioritiesSnapshot,
} from '../../lib/dashboardIntelligence.ts';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';

interface TodaysPrioritiesCardProps {
  snapshot: TodaysPrioritiesSnapshot;
  todayStr: string;
  completingTaskId: string | null;
  togglingBlockId?: string | null;
  onQuickCompleteTask: (task: Task) => void;
  onToggleTimeBlock?: (block: TimeBlock) => void;
  onNavigate: (tab: 'tasks' | 'calendar' | 'bills' | 'study') => void;
  isWide?: boolean;
}

const formatShortDate = (isoDate: string, todayStr: string): string => {
  if (!isoDate) return '';
  const clean = isoDate.slice(0, 10);
  if (clean === todayStr) return 'Today';
  const parsed = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return clean;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export const TodaysPrioritiesCard: React.FC<TodaysPrioritiesCardProps> = ({
  snapshot,
  todayStr,
  completingTaskId,
  togglingBlockId = null,
  onQuickCompleteTask,
  onToggleTimeBlock,
  onNavigate,
  isWide = false,
}) => {
  const { pendingTasks, totalPendingTasks, todayTimeBlocks, upcomingEvents, overdueItems } =
    snapshot;

  return (
    <ThemeCard className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--ff-border-color)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              background: 'var(--ff-accent-soft)',
              borderColor: 'var(--ff-accent-border)',
              color: 'var(--ff-accent-text)',
            }}
          >
            <ListTodo className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                Today&apos;s Priorities
              </h3>
              <ThemeBadge tone="neutral">{totalPendingTasks} open</ThemeBadge>
              {overdueItems.length > 0 && (
                <ThemeBadge tone="danger">
                  {overdueItems.length} overdue
                </ThemeBadge>
              )}
            </div>
            <p className="text-[11px] text-[var(--ff-text-muted)] whitespace-normal break-words leading-snug mt-0.5">
              Actionable tasks, time blocks, and upcoming deadlines
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('tasks')}
            className="text-xs px-2 py-1"
          >
            Tasks
            <ArrowUpRight className="w-3.5 h-3.5" />
          </ThemeButton>
          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('calendar')}
            className="text-xs px-2 py-1"
          >
            Calendar
          </ThemeButton>
        </div>
      </div>

      {/* Overdue Alert Strip (only shown when overdue items exist) */}
      {overdueItems.length > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border text-xs"
          style={{
            borderRadius: 'var(--ff-radius-button)',
            background: 'var(--ff-danger-soft)',
            borderColor: 'color-mix(in oklab, var(--ff-danger) 35%, transparent)',
            color: 'var(--ff-danger)',
          }}
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="font-semibold whitespace-normal break-words leading-snug">
              {overdueItems.length} overdue:{' '}
              <span className="font-normal text-[var(--ff-text-primary)]">
                {overdueItems
                  .slice(0, 2)
                  .map((i) => i.title)
                  .join(' · ')}
                {overdueItems.length > 2 ? ` +${overdueItems.length - 2} more` : ''}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(overdueItems[0].targetTab)}
            className="text-[11px] font-bold underline underline-offset-2 shrink-0"
          >
            Review
          </button>
        </div>
      )}

      {/* Body Grid (2 cols when wide, stacked cleanly when half-width) */}
      <div className={`grid grid-cols-1 ${isWide ? 'lg:grid-cols-12' : ''} gap-4 flex-1`}>
        {/* Pending Tasks with Quick Completion */}
        <div className={`${isWide ? 'lg:col-span-7' : ''} flex flex-col gap-2 min-w-0`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
              Pending Tasks
            </span>
            {totalPendingTasks > pendingTasks.length && (
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="text-[11px] font-semibold text-[var(--ff-accent-text)] hover:underline"
              >
                View all {totalPendingTasks}
              </button>
            )}
          </div>

          {pendingTasks.length === 0 ? (
            <div className="ff-surface-subtle px-3 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-[var(--ff-text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--ff-success)] shrink-0" />
                <span>All clear — no pending tasks right now.</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="text-[11px] font-bold text-[var(--ff-accent-text)] hover:underline shrink-0"
              >
                + Add Task
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {pendingTasks.map((task) => {
                const due = task.dueDate ? task.dueDate.slice(0, 10) : '';
                const isOverdue = Boolean(due && due < todayStr);
                const isCompleting = completingTaskId === task.id;
                const priorityTone =
                  task.priority === 'high'
                    ? 'var(--ff-danger)'
                    : task.priority === 'medium'
                    ? 'var(--ff-warning)'
                    : 'var(--ff-text-muted)';

                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2.5 px-2.5 py-2 ff-surface-subtle hover:border-[var(--ff-accent-border)] border border-transparent transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => onQuickCompleteTask(task)}
                        aria-label={`Mark "${task.title}" complete`}
                        title="Quick complete task"
                        className="w-5 h-5 rounded-md border border-[var(--ff-border-color)] hover:border-[var(--ff-success)] hover:bg-[var(--ff-success-soft)] flex items-center justify-center text-[var(--ff-text-muted)] hover:text-[var(--ff-success)] transition-colors shrink-0 disabled:opacity-50"
                      >
                        {isCompleting ? (
                          <Check className="w-3 h-3 text-[var(--ff-success)]" />
                        ) : (
                          <Circle className="w-3 h-3 opacity-60" />
                        )}
                      </button>
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: priorityTone }}
                        title={`${task.priority} priority`}
                      />
                      <span
                        title={task.title}
                        className="text-xs font-medium text-[var(--ff-text-primary)] whitespace-normal break-words leading-snug line-clamp-2"
                      >
                        {task.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {due && (
                        <span
                          className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                            isOverdue
                              ? 'bg-[var(--ff-danger-soft)] text-[var(--ff-danger)]'
                              : due === todayStr
                              ? 'bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]'
                              : 'text-[var(--ff-text-muted)]'
                          }`}
                        >
                          {formatShortDate(due, todayStr)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Today's Time Blocks + Upcoming Events */}
        <div
          className={`${isWide ? 'lg:col-span-5' : ''} grid grid-cols-1 ${
            isWide ? 'sm:grid-cols-2 lg:grid-cols-1' : 'xl:grid-cols-2'
          } gap-3 min-w-0`}
        >
          {/* Today's Time Blocks */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1">
                <Clock className="w-3 h-3 shrink-0" /> Time Blocks
              </span>
              <span className="text-[10px] font-mono text-[var(--ff-text-muted)] shrink-0">
                {todayTimeBlocks.length} today
              </span>
            </div>

            {todayTimeBlocks.length === 0 ? (
              <div className="ff-surface-subtle px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--ff-text-muted)]">
                <span className="whitespace-normal break-words leading-snug">No blocks scheduled today</span>
                <button
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="font-semibold text-[var(--ff-accent-text)] hover:underline shrink-0"
                >
                  Schedule
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {todayTimeBlocks.slice(0, 3).map((block) => (
                  <div
                    key={block.id}
                    className="ff-surface-subtle px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {onToggleTimeBlock && (
                        <button
                          type="button"
                          disabled={togglingBlockId === block.id}
                          onClick={() => onToggleTimeBlock(block)}
                          aria-label={
                            block.completed
                              ? `Mark time block "${block.title}" incomplete`
                              : `Mark time block "${block.title}" complete`
                          }
                          title={block.completed ? 'Mark incomplete' : 'Mark complete'}
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 ${
                            block.completed
                              ? 'bg-[var(--ff-success)] border-[var(--ff-success)] text-white'
                              : 'border-[var(--ff-border-color)] hover:border-[var(--ff-success)] text-transparent'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <p
                          className={`font-medium truncate ${
                            block.completed
                              ? 'line-through text-[var(--ff-text-muted)]'
                              : 'text-[var(--ff-text-primary)]'
                          }`}
                        >
                          {block.title}
                        </p>
                        <p className="text-[10px] font-mono text-[var(--ff-text-muted)]">
                          {formatMinuteOfDay(block.startMinute)} – {formatMinuteOfDay(block.endMinute)}
                        </p>
                      </div>
                    </div>
                    {!onToggleTimeBlock && block.completed && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--ff-success)] shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Calendar Events (7-day horizon) */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Next 7 Days
              </span>
              <span className="text-[10px] font-mono text-[var(--ff-text-muted)]">
                {upcomingEvents.length} events
              </span>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="ff-surface-subtle px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--ff-text-muted)]">
                <span className="whitespace-normal break-words leading-snug">Clear 7-day calendar</span>
                <button
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="font-semibold text-[var(--ff-accent-text)] hover:underline shrink-0"
                >
                  Open
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onNavigate(ev.targetTab)}
                    className="w-full text-left ff-surface-subtle px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs hover:border-[var(--ff-accent-border)] border border-transparent transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[var(--ff-text-primary)] whitespace-normal break-words leading-snug line-clamp-2">
                        {ev.title}
                      </p>
                      <p className="text-[10px] text-[var(--ff-text-muted)] capitalize truncate">
                        {ev.kind}
                        {ev.meta ? ` · ${ev.meta}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-[var(--ff-accent-text)] shrink-0">
                      {formatShortDate(ev.date, todayStr)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ThemeCard>
  );
};

