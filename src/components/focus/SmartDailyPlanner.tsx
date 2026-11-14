import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { FocusSession, Habit, Task, TimeBlock } from '../../types/index.ts';
import {
  getOverdueTasks,
} from '../../lib/productivityIntelligence.ts';
import {
  addDays,
  DEFAULT_TIMEZONE,
  getTodayDateString,
} from '../../lib/dateTime.ts';
import { ThemeCard, ThemeButton } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedProgressBar,
  EmptyStateIllustration,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import {
  AlertCircle,
  Calendar,
  Clock,
  Layers,
  Play,
  Plus,
  Zap,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const SmartDailyPlanner: React.FC = () => {
  const {
    refreshKey,
    triggerRefresh,
    settings,
    setActiveTaskId,
    startTimer,
    setCurrentTab,
  } = useApp();
  const { isDisabled } = useMotionPreferences();

  const todayStr = useMemo(() => getTodayDateString(DEFAULT_TIMEZONE), []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick Task Creation
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Overdue Carry-forward state
  const [isCarryingForward, setIsCarryingForward] = useState(false);
  const [showOverdueDetails, setShowOverdueDetails] = useState(false);

  // Reschedule single task
  const [reschedulingTaskId, setReschedulingTaskId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [taskList, sessionList, habitList, blockList] = await Promise.all([
        api.getTasks().catch(() => [] as Task[]),
        api.getFocusSessions().catch(() => [] as FocusSession[]),
        api.getHabits().catch(() => [] as Habit[]),
        api.getTimeBlocks(todayStr).catch(() => [] as TimeBlock[]),
      ]);
      setTasks(taskList);
      setSessions(sessionList);
      setHabits(habitList);
      setTimeBlocks(blockList);
    } catch (err) {
      console.error('Failed to load daily planner data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshKey, todayStr]);

  // Overdue tasks
  const overdueTasks = useMemo(() => getOverdueTasks(tasks, todayStr), [tasks, todayStr]);

  // Tasks due today or completed today
  const todayTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        !t.deletedAt &&
        (t.dueDate === todayStr ||
          (t.completedAt && t.completedAt.slice(0, 10) === todayStr))
    );
  }, [tasks, todayStr]);

  const highPriorityTasks = useMemo(
    () => todayTasks.filter((t) => t.priority === 'high'),
    [todayTasks]
  );
  const mediumPriorityTasks = useMemo(
    () => todayTasks.filter((t) => t.priority === 'medium'),
    [todayTasks]
  );
  const lowPriorityTasks = useMemo(
    () => todayTasks.filter((t) => t.priority === 'low'),
    [todayTasks]
  );

  const completedTodayTasksCount = useMemo(
    () => todayTasks.filter((t) => t.status === 'completed').length,
    [todayTasks]
  );

  // Today's focus logged
  const todayFocusMinutes = useMemo(() => {
    return sessions
      .filter(
        (s) =>
          s.completed &&
          (s.mode === 'work' || !s.mode) &&
          s.startedAt &&
          s.startedAt.slice(0, 10) === todayStr
      )
      .reduce((sum, s) => sum + (s.durationMinutes || Math.round((s.durationSeconds || 0) / 60)), 0);
  }, [sessions, todayStr]);

  const targetFocusMinutes = Math.max(15, settings?.dailyFocusGoalMinutes || 100);

  // Handle Carry Forward All Overdue Tasks
  const handleCarryForwardAll = async () => {
    if (overdueTasks.length === 0 || isCarryingForward) return;
    setIsCarryingForward(true);
    try {
      await Promise.all(
        overdueTasks.map((t) =>
          api.updateTask(t.id, {
            dueDate: todayStr,
          })
        )
      );
      triggerRefresh();
      await loadData();
    } catch (err) {
      console.error('Failed to carry forward overdue tasks:', err);
    } finally {
      setIsCarryingForward(false);
    }
  };

  // Quick Task Creation for Today
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await api.createTask({
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        dueDate: todayStr,
        status: 'todo',
        category: 'General',
        estimatedPomodoros: 1,
      });
      setNewTaskTitle('');
      triggerRefresh();
      await loadData();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Task Completion
  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
    const nowIso = new Date().toISOString();
    try {
      await api.updateTask(task.id, {
        status: nextStatus,
        completedAt: nextStatus === 'completed' ? nowIso : null,
      });
      triggerRefresh();
      await loadData();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  // Start Focus Session on Task
  const handleStartTaskFocus = (task: Task) => {
    setActiveTaskId(task.id);
    startTimer();
    setCurrentTab('focus');
  };

  // Quick Reschedule
  const handleQuickReschedule = async (taskId: string, targetDate: string) => {
    try {
      await api.updateTask(taskId, { dueDate: targetDate });
      setReschedulingTaskId(null);
      triggerRefresh();
      await loadData();
    } catch (err) {
      console.error('Failed to reschedule task:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Today's Goals & Progress Overview Banner */}
      <ThemeCard variant="interactive" className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ff-accent-text)] bg-[var(--ff-accent-soft)] px-2.5 py-0.5 rounded-full">
                Today's Flight Plan
              </span>
              <span className="text-xs text-[var(--ff-text-muted)]">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <h2 className="text-xl font-bold text-[var(--ff-text-primary)] mt-1">
              Smart Daily Planner
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-[var(--ff-text-muted)] block">Task Completion</span>
              <span className="font-mono font-bold text-sm text-[var(--ff-text-primary)]">
                {completedTodayTasksCount} / {todayTasks.length} done
              </span>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/40 flex items-center justify-center font-bold text-xs text-emerald-500 font-mono">
              {todayTasks.length > 0 ? Math.round((completedTodayTasksCount / todayTasks.length) * 100) : 100}%
            </div>
          </div>
        </div>

        {/* Focus Target Progress Bar */}
        <div className="p-3 bg-[var(--ff-surface-subtle)] rounded-xl border border-[var(--ff-border-color)]">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="font-semibold text-[var(--ff-text-secondary)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              Daily Focus Target
            </span>
            <span className="font-mono font-bold text-[var(--ff-text-primary)]">
              {todayFocusMinutes} / {targetFocusMinutes} min ({Math.min(100, Math.round((todayFocusMinutes / targetFocusMinutes) * 100))}%)
            </span>
          </div>
          <AnimatedProgressBar
            value={todayFocusMinutes}
            max={targetFocusMinutes}
            customColor="#6366f1"
          />
        </div>
      </ThemeCard>

      {/* Overdue Task Carry-Forward Callout */}
      {overdueTasks.length > 0 && (
        <div className="p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-[var(--ff-text-primary)]">
                  {overdueTasks.length} Overdue Task{overdueTasks.length > 1 ? 's' : ''} from Previous Days
                </h4>
                <p className="text-xs text-[var(--ff-text-muted)]">
                  Carry these tasks forward to today with one click so your agenda stays accurate.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ThemeButton
                variant="primary"
                onClick={handleCarryForwardAll}
                disabled={isCarryingForward}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white border-none"
              >
                {isCarryingForward ? 'Carrying forward...' : 'Carry Forward All to Today'}
              </ThemeButton>

              <button
                type="button"
                onClick={() => setShowOverdueDetails((prev) => !prev)}
                className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                title="View overdue task details"
              >
                {showOverdueDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Collapsible Overdue Tasks List */}
          <AnimatePresence>
            {showOverdueDetails && (
              <motion.div
                initial={isDisabled ? { opacity: 1 } : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, height: 0 }}
                className="space-y-2 pt-2 border-t border-amber-500/20"
              >
                {overdueTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 p-2 bg-[var(--ff-surface-card)] rounded-lg text-xs border border-[var(--ff-border-color)]"
                  >
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-[var(--ff-text-primary)]">{t.title}</span>
                      <span className="text-[var(--ff-text-muted)] ml-2">Due {t.dueDate}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickReschedule(t.id, todayStr)}
                        className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 hover:bg-amber-500/30 font-medium"
                      >
                        Set to Today
                      </button>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Quick Add Task to Today Bar */}
      <form
        onSubmit={handleCreateTask}
        className="flex items-center gap-2 p-2 bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] rounded-xl"
      >
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Add task to today's plan..."
          className="flex-1 px-3 py-1.5 text-sm bg-transparent text-[var(--ff-text-primary)] placeholder-[var(--ff-text-muted)] focus:outline-none"
        />

        <select
          value={newTaskPriority}
          onChange={(e) => setNewTaskPriority(e.target.value as Task['priority'])}
          className="text-xs bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] rounded-lg px-2.5 py-1.5 focus:outline-none"
        >
          <option value="high">🔥 High</option>
          <option value="medium">⚡ Medium</option>
          <option value="low">☕ Low</option>
        </select>

        <ThemeButton
          type="submit"
          variant="primary"
          disabled={isSubmitting || !newTaskTitle.trim()}
          className="text-xs px-3 py-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </ThemeButton>
      </form>

      {/* Prioritized Task Sections */}
      <div className="space-y-4">
        {/* High Priority Tasks */}
        {highPriorityTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-500">
              <Zap className="w-3.5 h-3.5" /> High Priority Focus ({highPriorityTasks.length})
            </div>
            <div className="space-y-2">
              {highPriorityTasks.map((task) => (
                <TaskPlannerRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                  onStartFocus={handleStartTaskFocus}
                  onReschedule={(id, date) => handleQuickReschedule(id, date)}
                  todayStr={todayStr}
                />
              ))}
            </div>
          </div>
        )}

        {/* Medium Priority Tasks */}
        {mediumPriorityTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500">
              <Zap className="w-3.5 h-3.5" /> Medium Priority ({mediumPriorityTasks.length})
            </div>
            <div className="space-y-2">
              {mediumPriorityTasks.map((task) => (
                <TaskPlannerRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                  onStartFocus={handleStartTaskFocus}
                  onReschedule={(id, date) => handleQuickReschedule(id, date)}
                  todayStr={todayStr}
                />
              ))}
            </div>
          </div>
        )}

        {/* Low Priority Tasks */}
        {lowPriorityTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-500">
              <Clock className="w-3.5 h-3.5" /> Low Priority / Later ({lowPriorityTasks.length})
            </div>
            <div className="space-y-2">
              {lowPriorityTasks.map((task) => (
                <TaskPlannerRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                  onStartFocus={handleStartTaskFocus}
                  onReschedule={(id, date) => handleQuickReschedule(id, date)}
                  todayStr={todayStr}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {todayTasks.length === 0 && (
          <EmptyStateIllustration
            icon={<CalendarDays className="w-10 h-10 text-[var(--ff-accent)]" />}
            title="No Tasks Scheduled for Today"
            description="Use the input above to add today's priority tasks or carry forward overdue items."
          />
        )}
      </div>

      {/* Scheduled Time Blocks for Today */}
      {timeBlocks.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-[var(--ff-border-color)]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Today's Scheduled Time Blocks ({timeBlocks.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {timeBlocks.map((tb) => (
              <div
                key={tb.id}
                className="p-3 bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] rounded-xl flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1 truncate">
                  <div className="font-semibold text-xs text-[var(--ff-text-primary)] truncate">
                    {tb.title}
                  </div>
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-mono">
                    {Math.floor(tb.startMinute / 60)}:{(tb.startMinute % 60).toString().padStart(2, '0')} -{' '}
                    {Math.floor(tb.endMinute / 60)}:{(tb.endMinute % 60).toString().padStart(2, '0')} ({tb.category})
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    tb.completed
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-blue-500/15 text-blue-600'
                  }`}
                >
                  {tb.completed ? 'Done' : 'Scheduled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component for individual Task Row in Daily Planner
interface TaskPlannerRowProps {
  task: Task;
  onToggle: (task: Task) => void;
  onStartFocus: (task: Task) => void;
  onReschedule: (taskId: string, targetDate: string) => void;
  todayStr: string;
}

const TaskPlannerRow: React.FC<TaskPlannerRowProps> = ({
  task,
  onToggle,
  onStartFocus,
  onReschedule,
  todayStr,
}) => {
  const [showReschedule, setShowReschedule] = useState(false);
  const isCompleted = task.status === 'completed';

  const tomorrowStr = addDays(todayStr, 1);
  const nextWeekStr = addDays(todayStr, 7);

  return (
    <ThemeCard
      variant="interactive"
      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-opacity ${
        isCompleted ? 'opacity-65' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onToggle(task)}
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
            isCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-[var(--ff-border-color)] hover:border-emerald-400'
          }`}
          title={isCompleted ? 'Mark incomplete' : 'Mark completed'}
        >
          {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </button>

        <div className="min-w-0 flex-1">
          <span
            className={`font-semibold text-sm text-[var(--ff-text-primary)] block truncate ${
              isCompleted ? 'line-through text-[var(--ff-text-muted)]' : ''
            }`}
          >
            {task.title}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-[var(--ff-text-muted)] mt-0.5">
            <span>{task.category || 'General'}</span>
            {task.estimatedPomodoros > 0 && (
              <span>• {task.estimatedPomodoros} pomodoro{task.estimatedPomodoros > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-8 sm:ml-0">
        {!isCompleted && (
          <button
            type="button"
            onClick={() => onStartFocus(task)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] hover:opacity-90 transition-opacity"
            title="Start focus timer on this task"
          >
            <Play className="w-3 h-3 fill-current" /> Focus
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowReschedule((prev) => !prev)}
            className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)]"
            title="Reschedule task"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>

          {showReschedule && (
            <div className="absolute right-0 top-full mt-1 z-30 p-2 bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] rounded-xl shadow-lg w-44 space-y-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  onReschedule(task.id, tomorrowStr);
                  setShowReschedule(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--ff-surface-subtle)] text-[var(--ff-text-primary)]"
              >
                Tomorrow (+1d)
              </button>
              <button
                type="button"
                onClick={() => {
                  onReschedule(task.id, nextWeekStr);
                  setShowReschedule(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--ff-surface-subtle)] text-[var(--ff-text-primary)]"
              >
                Next Week (+7d)
              </button>
            </div>
          )}
        </div>
      </div>
    </ThemeCard>
  );
};
