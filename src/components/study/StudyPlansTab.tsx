import React, { useState } from 'react';
import { motion } from 'motion/react';
import { StudyPlan, StudyPlanTask, StudySubject } from '../../types/study.ts';
import { FocusSession } from '../../types/index.ts';
import { computeStudyPlanAnalytics } from '../../lib/studyIntelligence.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedCheckmark,
  AnimatedNumber,
  SubtleConfetti,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { Calendar, CheckCircle2, Clock, Plus, Trash2 } from 'lucide-react';

interface StudyPlansTabProps {
  plans: StudyPlan[];
  planTasks: StudyPlanTask[];
  focusSessions: FocusSession[];
  subjects: StudySubject[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenAddPlan: () => void;
  onToggleTask: (task: StudyPlanTask) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onDeletePlan: (planId: string) => Promise<void>;
  onQuickAddTask: (title: string, estimatedMinutes: number, subjectCode?: string) => Promise<void>;
}

export const StudyPlansTab: React.FC<StudyPlansTabProps> = ({
  plans,
  planTasks,
  focusSessions,
  subjects,
  selectedDate,
  onSelectDate,
  onOpenAddPlan,
  onToggleTask,
  onDeleteTask,
  onDeletePlan,
  onQuickAddTask,
}) => {
  const [quickTitle, setQuickTitle] = useState('');
  const [quickMinutes, setQuickMinutes] = useState(45);
  const [quickSubject, setQuickSubject] = useState(subjects[0]?.code || '');
  const [addingTask, setAddingTask] = useState(false);
  const [celebratingTaskId, setCelebratingTaskId] = useState<string | null>(null);
  const { isDisabled, profile } = useMotionPreferences();

  const handleToggleTaskWithCelebration = async (task: StudyPlanTask) => {
    if (task.status !== 'completed') {
      setCelebratingTaskId(task.id);
      setTimeout(() => setCelebratingTaskId((c) => (c === task.id ? null : c)), 1400);
    }
    await onToggleTask(task);
  };

  // Authoritative analytics
  const analytics = computeStudyPlanAnalytics(planTasks, focusSessions);

  // Filter tasks for the selected calendar date
  const dayTasks = planTasks.filter(
    (t) => !t.deletedAt && t.scheduledDate === selectedDate
  );

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    setAddingTask(true);
    try {
      await onQuickAddTask(quickTitle.trim(), quickMinutes, quickSubject || undefined);
      setQuickTitle('');
    } finally {
      setAddingTask(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--ff-accent-text)]" />
            Study Plans & Structured Daily Schedule
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Plan target hours, schedule recurring blocks, and execute timeboxed daily tasks
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            title="Select date to view schedule"
          />
          <ThemeButton variant="primary" size="sm" onClick={onOpenAddPlan}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Study Plan
          </ThemeButton>
        </div>
      </div>

      {/* Analytics KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ThemeCard className="p-4">
          <span className="text-[11px] text-[var(--ff-text-muted)] font-medium">Planned Focus</span>
          <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)] mt-1">
            <AnimatedNumber
              value={analytics.totalPlannedMinutes / 60}
              format={(hrs) => `${hrs.toFixed(1)} hrs`}
            />
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">across scheduled tasks</span>
        </ThemeCard>

        <ThemeCard className="p-4">
          <span className="text-[11px] text-[var(--ff-text-muted)] font-medium">Actual Deep Work</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            <AnimatedNumber
              value={analytics.totalActualMinutes / 60}
              format={(hrs) => `${hrs.toFixed(1)} hrs`}
            />
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">authoritative focus logs</span>
        </ThemeCard>

        <ThemeCard className="p-4">
          <span className="text-[11px] text-[var(--ff-text-muted)] font-medium">Task Completion</span>
          <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)] mt-1">
            <AnimatedNumber value={analytics.completedTasksCount} /> / {analytics.completedTasksCount + analytics.pendingTasksCount}
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">
            {analytics.pendingTasksCount} tasks remaining
          </span>
        </ThemeCard>

        <ThemeCard className="p-4">
          <span className="text-[11px] text-[var(--ff-text-muted)] font-medium">Plan Adherence</span>
          <div className="text-xl font-bold font-mono text-[var(--ff-accent-text)] mt-1">
            <AnimatedNumber
              value={analytics.adherencePercentage}
              format={(pct) => `${Math.round(pct)}%`}
            />
          </div>
          <span className="text-[10px] text-[var(--ff-text-muted)]">execution reliability</span>
        </ThemeCard>
      </div>

      {/* Main Content: Active Plans & Daily Tasks Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Study Plans List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
              Active Plans ({plans.filter((p) => !p.deletedAt).length})
            </h3>
          </div>

          {plans.filter((p) => !p.deletedAt).length === 0 ? (
            <ThemeCard className="p-8 text-center text-xs text-[var(--ff-text-muted)] space-y-2">
              <Calendar className="w-8 h-8 mx-auto text-[var(--ff-text-muted)]/50" />
              <p>No active study plans yet.</p>
              <ThemeButton variant="secondary" size="sm" onClick={onOpenAddPlan}>
                Create Your First Plan
              </ThemeButton>
            </ThemeCard>
          ) : (
            <div className="space-y-3">
              {plans
                .filter((p) => !p.deletedAt)
                .map((plan) => (
                  <ThemeCard key={plan.id} className="p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
                          {plan.planType}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeletePlan(plan.id)}
                          className="text-[var(--ff-text-muted)] hover:text-rose-400 p-1"
                          title="Delete Plan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <h4 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                        {plan.title}
                      </h4>
                      {plan.description && (
                        <p className="text-xs text-[var(--ff-text-muted)] mt-1 line-clamp-2">
                          {plan.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-3 text-xs text-[var(--ff-text-muted)]">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {plan.dailyTargetMinutes}m/day • {plan.weeklyTargetMinutes ? `${Math.round(plan.weeklyTargetMinutes / 60)}h/wk` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t border-[var(--ff-border-color)] text-[11px] text-[var(--ff-text-muted)] flex items-center justify-between">
                      <span>{plan.startDate} → {plan.endDate}</span>
                      <span className="capitalize">{plan.recurringPattern || 'non-recurring'}</span>
                    </div>
                  </ThemeCard>
                ))}
            </div>
          )}
        </div>

        {/* Daily Tasks Checklist for Selected Date */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ff-text-primary)] flex items-center gap-2">
              <span>Scheduled Tasks for {selectedDate}</span>
              <ThemeBadge tone="neutral">{dayTasks.length} tasks</ThemeBadge>
            </h3>
          </div>

          {/* Quick-add Task Row */}
          <form
            onSubmit={handleQuickSubmit}
            className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]"
          >
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Quick schedule: e.g., Solve 5 B-Tree problems..."
              className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />

            <select
              value={quickSubject}
              onChange={(e) => setQuickSubject(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="">General</option>
              {subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>

            <select
              value={quickMinutes}
              onChange={(e) => setQuickMinutes(Number(e.target.value))}
              className="px-2 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value={25}>25m</option>
              <option value={45}>45m</option>
              <option value={60}>1h</option>
              <option value={90}>1.5h</option>
              <option value={120}>2h</option>
            </select>

            <ThemeButton type="submit" variant="primary" size="sm" disabled={addingTask || !quickTitle.trim()}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Task
            </ThemeButton>
          </form>

          {/* Tasks List */}
          {dayTasks.length === 0 ? (
            <ThemeCard className="p-10 text-center text-xs text-[var(--ff-text-muted)] space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400/50" />
              <p>No study tasks scheduled for this day.</p>
              <p className="text-[11px]">Use the quick-schedule bar above to assign focus goals!</p>
            </ThemeCard>
          ) : (
            <div className="space-y-2">
              {dayTasks.map((task) => {
                const isDone = task.status === 'completed';
                return (
                  <motion.div
                    key={task.id}
                    layout
                    initial={isDisabled ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                    transition={profile.listLayout}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all relative overflow-visible ${
                      isDone
                        ? 'bg-[var(--ff-surface-card)]/50 border-[var(--ff-border-color)] opacity-70'
                        : 'bg-[var(--ff-surface-card)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/40'
                    }`}
                  >
                    <SubtleConfetti show={celebratingTaskId === task.id} />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleToggleTaskWithCelebration(task)}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                          isDone
                            ? 'bg-emerald-500/15 border border-emerald-500 text-emerald-500'
                            : 'border border-[var(--ff-border-color)] hover:border-emerald-500'
                        }`}
                        aria-label={isDone ? 'Mark as incomplete' : 'Mark as complete'}
                      >
                        <AnimatedCheckmark
                          checked={isDone}
                          size={13}
                          strokeWidth={2.5}
                          color="var(--ff-success)"
                        />
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold ${
                              isDone ? 'line-through text-[var(--ff-text-muted)]' : 'text-[var(--ff-text-primary)]'
                            }`}
                          >
                            {task.title}
                          </span>
                          {task.subjectId && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] font-bold">
                              {task.subjectId}
                            </span>
                          )}
                          <span
                            className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              task.priority === 'high'
                                ? 'bg-rose-500/10 text-rose-400'
                                : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </div>

                        <div className="text-[11px] text-[var(--ff-text-muted)] mt-0.5 flex items-center gap-2">
                          <span>Est: {task.estimatedMinutes}m</span>
                          {task.actualMinutes ? (
                            <span className="text-emerald-400 font-mono">
                              • Actual: {task.actualMinutes}m
                            </span>
                          ) : null}
                          {task.startTime && <span>• {task.startTime}</span>}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void onDeleteTask(task.id)}
                      className="text-[var(--ff-text-muted)] hover:text-rose-400 p-1"
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
