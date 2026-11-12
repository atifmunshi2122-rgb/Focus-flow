import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Task } from '../../types/index.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeProgressBar,
  ThemeSegmentedControl,
  ThemeSelect,
  ThemeTextarea,
} from '../ui/ThemePrimitives.tsx';
import {
  EmptyStateIllustration,
  SkeletonList,
  ValidationMessage,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
import {
  CheckCircle2,
  Circle,
  Plus,
  Play,
  Trash2,
  Edit2,
  Calendar,
  Flame,
  CheckSquare,
  ChevronDown,
} from 'lucide-react';

export const TaskManager: React.FC = () => {
  const {
    refreshKey,
    triggerRefresh,
    showToast,
    setActiveTaskId,
    switchTimerMode,
    startTimer,
    setCurrentTab,
  } = useApp();
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedPomodoros, setEstimatedPomodoros] = useState('2');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadTasks = () => {
    setLoading(true);
    api
      .getTasks()
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [refreshKey]);

  const openCreateModal = () => {
    setEditingTask(null);
    setTitle('');
    setDescription('');
    setPriority('medium');
    setEstimatedPomodoros('2');
    setDueDate(new Date().toISOString().split('T')[0]);
    setFormError(null);
    setSubmitSuccess(false);
    setModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setEstimatedPomodoros(String(task.estimatedPomodoros));
    setDueDate(task.dueDate || '');
    setFormError(null);
    setSubmitSuccess(false);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('Task title is required.');
      return;
    }

    setSaving(true);
    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, {
          title: title.trim(),
          description,
          priority,
          estimatedPomodoros: Number(estimatedPomodoros) || 1,
          dueDate: dueDate || null,
        });
        showToast('Task updated successfully', 'success');
      } else {
        await api.createTask({
          title: title.trim(),
          description,
          priority,
          estimatedPomodoros: Number(estimatedPomodoros) || 1,
          dueDate: dueDate || null,
        });
        showToast('Task created successfully', 'success');
      }
      setSaving(false);
      setSubmitSuccess(true);
      triggerRefresh();
      loadTasks();
      setTimeout(() => {
        setSubmitSuccess(false);
        setModalOpen(false);
      }, isDisabled ? 50 : 220);
    } catch {
      setSaving(false);
      setFormError('Failed to save task. Please try again.');
      showToast('Failed to save task', 'error');
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
    try {
      await api.updateTask(task.id, { status: nextStatus });
      triggerRefresh();
      loadTasks();
      showToast(nextStatus === 'completed' ? 'Task marked as completed!' : 'Task reopened', 'info');
    } catch {
      showToast('Failed to update task status', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.deleteTask(id);
      showToast('Task deleted', 'info');
      triggerRefresh();
      loadTasks();
    } catch {
      showToast('Failed to delete task', 'error');
    }
  };

  const handleStartFocusOnTask = (task: Task) => {
    setActiveTaskId(task.id);
    switchTimerMode('work');
    startTimer();
    setCurrentTab('focus');
    showToast(`Focus session started for: ${task.title}`, 'success');
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return t.status !== 'completed';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const priorityTone: Record<Task['priority'], 'danger' | 'warning' | 'neutral'> = {
    high: 'danger',
    medium: 'warning',
    low: 'neutral',
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Top Bar with Filter tabs and Add Task */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <ThemeSegmentedControl<'all' | 'active' | 'completed'>
          ariaLabel="Task status filter"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: `All Tasks (${tasks.length})` },
            {
              id: 'active',
              label: `In Progress (${tasks.filter((t) => t.status !== 'completed').length})`,
            },
            {
              id: 'completed',
              label: `Completed (${tasks.filter((t) => t.status === 'completed').length})`,
            },
          ]}
        />

        <ThemeButton variant="primary" size="md" onClick={openCreateModal} className="shrink-0">
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </ThemeButton>
      </div>

      {/* Task List */}
      <ThemeCard noPadding>
        {loading && tasks.length === 0 ? (
          <SkeletonList rows={5} />
        ) : filteredTasks.length === 0 ? (
          <EmptyStateIllustration
            icon={<CheckSquare className="w-6 h-6" />}
            title="No tasks found"
            description="Get started by creating a focused task with estimated Pomodoro cycles."
            action={
              <ThemeButton variant="primary" size="sm" onClick={openCreateModal}>
                <Plus className="w-4 h-4" />
                <span>Create Task</span>
              </ThemeButton>
            }
          />
        ) : (
          <div className="divide-y ff-divider">
            <AnimatePresence initial={false}>
              {filteredTasks.map((task) => {
                const isCompleted = task.status === 'completed';
                const isExpanded = Boolean(expandedIds[task.id]);

                return (
                  <motion.div
                    key={task.id}
                    layout={isDisabled ? false : 'position'}
                    initial={isDisabled ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: isCompleted ? 0.68 : 1, y: 0 }}
                    exit={
                      isDisabled
                        ? { opacity: 0 }
                        : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }
                    }
                    transition={{
                      duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01),
                      ease: MOTION_EASING.decelerate,
                    }}
                    className="ff-row-hover"
                    style={{ padding: 'var(--ff-row-pad)' }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <motion.button
                          type="button"
                          onClick={() => void toggleTaskStatus(task)}
                          whileTap={isDisabled ? undefined : { scale: 0.85 }}
                          animate={{ scale: isCompleted && !isDisabled ? [1, 1.15, 1] : 1 }}
                          transition={{ duration: MOTION_DURATION.control }}
                          className="mt-0.5 text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] transition-colors shrink-0"
                          aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--ff-success)' }} />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </motion.button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm font-semibold text-[var(--ff-text-primary)] transition-all duration-200 ${
                                isCompleted ? 'line-through text-[var(--ff-text-muted)]' : ''
                              }`}
                            >
                              {task.title}
                            </span>

                            <ThemeBadge tone={priorityTone[task.priority]}>{task.priority}</ThemeBadge>
                          </div>

                          {task.description && !isExpanded && (
                            <p className="text-xs text-[var(--ff-text-muted)] mt-0.5 line-clamp-1">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                            {task.dueDate && (
                              <div className="flex items-center gap-1 font-mono">
                                <Calendar className="w-3 h-3" />
                                <span>Due {task.dueDate}</span>
                              </div>
                            )}
                            {task.dueDate && <span aria-hidden="true">·</span>}
                            <div className="flex items-center gap-1 font-mono">
                              <Flame className="w-3 h-3" style={{ color: 'var(--ff-accent-text)' }} />
                              <span>
                                {task.completedPomodoros} / {task.estimatedPomodoros} Pomodoros
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => handleStartFocusOnTask(task)}
                            className="ff-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border"
                            style={{
                              borderRadius: 'var(--ff-radius-button)',
                              background: 'var(--ff-accent-soft)',
                              borderColor: 'var(--ff-accent-border)',
                              color: 'var(--ff-accent-text)',
                            }}
                            title="Start Pomodoro timer on this task"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Focus</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleExpanded(task.id)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${task.title}`}
                          className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors"
                          title={isExpanded ? 'Collapse details' : 'Expand details'}
                        >
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: isDisabled ? 0.01 : MOTION_DURATION.dropdown }}
                            className="inline-flex"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </motion.span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(task)}
                          className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors"
                          title="Edit task"
                          aria-label={`Edit ${task.title}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDelete(task.id)}
                          className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] transition-colors"
                          title="Delete task"
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Smooth Expandable Details Accordion */}
                    <div className="ff-expandable" data-expanded={isExpanded ? 'true' : 'false'}>
                      <div className="ff-expandable-inner">
                        <div
                          className="mt-3 pt-3 ml-8 border-t space-y-2.5 text-xs"
                          style={{ borderColor: 'var(--ff-border-color)' }}
                        >
                          {task.description ? (
                            <p className="text-[var(--ff-text-secondary)] leading-relaxed whitespace-pre-wrap">
                              {task.description}
                            </p>
                          ) : (
                            <p className="text-[var(--ff-text-muted)] italic">
                              No detailed notes added to this task yet.
                            </p>
                          )}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)] font-mono">
                              <span>Focus Progress</span>
                              <span>
                                {task.completedPomodoros}/{task.estimatedPomodoros} cycles
                              </span>
                            </div>
                            <ThemeProgressBar
                              value={(task.completedPomodoros / Math.max(1, task.estimatedPomodoros)) * 100}
                              label={`Focus Cycles (${task.completedPomodoros}/${task.estimatedPomodoros})`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </ThemeCard>

      {/* Task Create / Edit Modal */}
      <ThemeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create New Task'}
      >
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="task-title-input"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Task Title
            </label>
            <ThemeInput
              id="task-title-input"
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="e.g., Implement monthly bill calculation"
            />
          </div>

          <div>
            <label
              htmlFor="task-desc-input"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Description
            </label>
            <ThemeTextarea
              id="task-desc-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context, subtasks, or notes..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="task-priority-select"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Priority
              </label>
              <ThemeSelect
                id="task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
              >
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </ThemeSelect>
            </div>

            <div>
              <label
                htmlFor="task-poms-input"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Est. Pomodoros
              </label>
              <ThemeInput
                id="task-poms-input"
                type="number"
                min="1"
                max="20"
                value={estimatedPomodoros}
                onChange={(e) => setEstimatedPomodoros(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="task-due-input"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Target Due Date (Optional)
            </label>
            <ThemeInput
              id="task-due-input"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <ValidationMessage message={formError} tone="error" />

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              success={submitSuccess}
              loadingText="Saving..."
            >
              {editingTask ? 'Save Changes' : 'Create Task'}
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
