import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { SubtaskItem, Task, TaskRecurrence } from '../../types/index.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeProgressBar,
  ThemeSelect,
  ThemeTextarea,
} from '../ui/ThemePrimitives.tsx';
import {
  AnimatedCheckmark,
  AnimatedProgressBar,
  EmptyStateIllustration,
  SkeletonList,
  ValidationMessage,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import {
  MOTION_DURATION,
  MOTION_EASING,
  getSpringTransition,
} from '../../theme/motionTokens.ts';
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
  Search,
  Repeat,
  GripVertical,
  Columns,
  List,
  Clock,
  CalendarDays,
  History,
  X,
  AlertCircle,
} from 'lucide-react';
import { getOverdueTasks } from '../../lib/productivityIntelligence.ts';
import { playTaskCompleteSound } from '../../lib/sound.ts';

type TaskViewMode =
  | 'list'
  | 'kanban'
  | 'calendar'
  | 'timeline'
  | 'today'
  | 'upcoming'
  | 'completed';

const CATEGORIES = ['General', 'Engineering', 'Finance', 'Personal', 'Design', 'Learning'];

export const TaskManager: React.FC = () => {
  const {
    refreshKey,
    triggerRefresh,
    showToast,
    settings,
    setActiveTaskId,
    switchTimerMode,
    startTimer,
    setCurrentTab,
    setTrashModalOpen,
    confirmAction,
    googleSpreadsheetId,
    googleAccessToken,
  } = useApp();

  const { intensity, isDisabled } = useMotionPreferences();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<TaskViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Task['priority']>('all');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [status, setStatus] = useState<Task['status']>('todo');
  const [category, setCategory] = useState('General');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [estimatedPomodoros, setEstimatedPomodoros] = useState('2');
  const [dueDate, setDueDate] = useState('');
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

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
    setStatus('todo');
    setCategory('General');
    setRecurrence('none');
    setEstimatedPomodoros('2');
    setDueDate(new Date().toISOString().split('T')[0]);
    setSubtasks([]);
    setNewSubtaskTitle('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setStatus(task.status);
    setCategory(task.category || 'General');
    setRecurrence(task.recurrence || 'none');
    setEstimatedPomodoros(String(task.estimatedPomodoros));
    setDueDate(task.dueDate || '');
    setSubtasks(task.subtasks ? [...task.subtasks] : []);
    setNewSubtaskTitle('');
    setFormError(null);
    setModalOpen(true);
  };

  const addDraftSubtask = () => {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setSubtasks((prev) => [
      ...prev,
      { id: `sub_${Date.now()}_${prev.length}`, title: t, done: false },
    ]);
    setNewSubtaskTitle('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('Task title is required.');
      return;
    }

    setSaving(true);
    const payload: Partial<Task> = {
      title: title.trim(),
      description,
      priority,
      status,
      category,
      recurrence,
      subtasks,
      estimatedPomodoros: Math.max(1, Number(estimatedPomodoros) || 1),
      dueDate: dueDate || null,
    };

    try {
      let savedTask: Task;
      if (editingTask) {
        savedTask = await api.updateTask(editingTask.id, payload);
        showToast('Task updated successfully', 'success');
      } else {
        savedTask = await api.createTask(payload);
        showToast('Task created successfully', 'success');
      }
      googleSheetsService.enqueueMutation(
        'Tasks',
        [
          savedTask.id,
          savedTask.title,
          savedTask.priority,
          savedTask.status,
          savedTask.dueDate || '',
          savedTask.estimatedPomodoros,
          savedTask.completedPomodoros,
          savedTask.createdAt,
          savedTask.updatedAt,
        ],
        editingTask ? 'update' : 'append',
        `Tasks_${editingTask ? 'update' : 'append'}_${savedTask.id}`
      );
      if (googleSpreadsheetId && googleAccessToken) {
        googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
      }
      setModalOpen(false);
      triggerRefresh();
      loadTasks();
    } catch {
      setFormError('Failed to save task. Please try again.');
      showToast('Failed to save task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleTaskStatus = async (task: Task, targetStatus?: Task['status']) => {
    const nextStatus = targetStatus || (task.status === 'completed' ? 'todo' : 'completed');
    try {
      const updated = await api.updateTask(task.id, { status: nextStatus });
      googleSheetsService.enqueueMutation(
        'Tasks',
        [
          updated.id,
          updated.title,
          updated.priority,
          updated.status,
          updated.dueDate || '',
          updated.estimatedPomodoros,
          updated.completedPomodoros,
          updated.createdAt,
          updated.updatedAt,
        ],
        'update',
        `Tasks_update_${updated.id}_${updated.status}`
      );
      if (googleSpreadsheetId && googleAccessToken) {
        googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
      }
      triggerRefresh();
      loadTasks();
      if (nextStatus === 'completed') {
        playTaskCompleteSound(settings?.soundEnabled ?? true, settings?.soundVolume);
      }
      showToast(
        nextStatus === 'completed'
          ? task.recurrence && task.recurrence !== 'none'
            ? `Completed! Next ${task.recurrence} task scheduled.`
            : 'Task marked as completed!'
          : `Moved to ${nextStatus.replace('_', ' ')}`,
        'info'
      );
    } catch {
      showToast('Failed to update task status', 'error');
    }
  };

  const toggleSubtaskInline = async (task: Task, subId: string) => {
    const isTargetDone = task.subtasks?.find((s) => s.id === subId)?.done;
    const updatedSubs = (task.subtasks || []).map((s) =>
      s.id === subId ? { ...s, done: !s.done } : s
    );
    try {
      await api.updateTask(task.id, { subtasks: updatedSubs });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: updatedSubs } : t)));
      if (!isTargetDone) {
        playTaskCompleteSound(settings?.soundEnabled ?? true, settings?.soundVolume);
      }
    } catch {
      showToast('Failed to update subtask', 'error');
    }
  };

  const handleDelete = async (task: Task) => {
    const confirmed = await confirmAction({
      title: 'Move Task to Trash',
      message: 'Move this task to the Trash Bin? You can restore it anytime later.',
      itemLabel: task.title,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteTask(task.id);
      showToast('Moved task to Trash', 'info');
      triggerRefresh();
      loadTasks();
    } catch {
      showToast('Failed to delete task', 'error');
    }
  };

  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = quickTaskTitle.trim();
    if (!cleanTitle || isSubmittingQuick) return;
    setIsSubmittingQuick(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await api.createTask({
        title: cleanTitle,
        description: '',
        status: 'todo',
        priority: 'medium',
        category: categoryFilter !== 'ALL' ? categoryFilter : 'General',
        dueDate: todayStr,
        estimatedPomodoros: 2,
        recurrence: 'none',
        subtasks: [],
      });
      setQuickTaskTitle('');
      showToast(`Quick task added: "${cleanTitle}"`, 'success');
      triggerRefresh();
      loadTasks();
    } catch {
      showToast('Failed to quick-add task', 'error');
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  const handleStartFocusOnTask = (task: Task) => {
    setActiveTaskId(task.id);
    switchTimerMode('work');
    startTimer();
    setCurrentTab('focus');
    showToast(`Focus session started for: ${task.title}`, 'success');
  };

  const handleReorderListDrop = async (targetTaskId: string) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;
    const fromIdx = tasks.findIndex((t) => t.id === draggedTaskId);
    const toIdx = tasks.findIndex((t) => t.id === targetTaskId);
    if (fromIdx === -1 || toIdx === -1) return;

    const copy = [...tasks];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    setTasks(copy);
    setDraggedTaskId(null);

    try {
      await api.updateTask(moved.id, { order: toIdx });
      await api.updateTask(copy[fromIdx].id, { order: fromIdx });
    } catch {
      loadTasks();
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const baseFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (categoryFilter !== 'ALL' && (t.category || 'General') !== categoryFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (q) {
        const hay = `${t.title} ${t.description} ${t.category || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, searchQuery, categoryFilter, priorityFilter]);

  const [isCarryingForward, setIsCarryingForward] = useState(false);
  const overdueTasks = useMemo(() => getOverdueTasks(tasks, todayStr), [tasks, todayStr]);

  const handleCarryForwardOverdue = async () => {
    if (overdueTasks.length === 0 || isCarryingForward) return;
    setIsCarryingForward(true);
    try {
      await Promise.all(
        overdueTasks.map((t) => api.updateTask(t.id, { dueDate: todayStr }))
      );
      triggerRefresh();
      await loadTasks();
    } catch (err) {
      console.error('Failed to carry forward overdue tasks:', err);
    } finally {
      setIsCarryingForward(false);
    }
  };

  const visibleTasks = useMemo(() => {
    if (viewMode === 'today') {
      return baseFiltered.filter(
        (t) => t.status !== 'completed' && Boolean(t.dueDate) && (t.dueDate as string) <= todayStr
      );
    }
    if (viewMode === 'upcoming') {
      return baseFiltered
        .filter((t) => t.status !== 'completed' && Boolean(t.dueDate) && (t.dueDate as string) > todayStr)
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    }
    if (viewMode === 'completed') {
      return baseFiltered.filter((t) => t.status === 'completed');
    }
    if (viewMode === 'timeline') {
      return [...baseFiltered].sort((a, b) =>
        (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99')
      );
    }
    return baseFiltered;
  }, [baseFiltered, viewMode, todayStr]);

  const priorityTone: Record<Task['priority'], 'danger' | 'warning' | 'neutral'> = {
    high: 'danger',
    medium: 'warning',
    low: 'neutral',
  };

  const renderTaskCard = (task: Task, allowDrag = false) => {
    const isCompleted = task.status === 'completed';
    const subDone = (task.subtasks || []).filter((s) => s.done).length;
    const subTotal = (task.subtasks || []).length;

    return (
      <motion.div
        key={task.id}
        layout
        transition={getSpringTransition(intensity, isDisabled)}
        className="w-full"
      >
        <ThemeCard
          variant="interactive"
          className={`space-y-3 transition-[background-color,border-color] duration-300 ${
            isCompleted ? 'bg-[var(--ff-success-soft)]/20 border-[var(--ff-success)]/30' : ''
          }`}
          draggable={allowDrag}
          onDragStart={() => setDraggedTaskId(task.id)}
          onDragOver={(e) => allowDrag && e.preventDefault()}
          onDrop={() => allowDrag && void handleReorderListDrop(task.id)}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {allowDrag && (
                <span className="mt-1 text-[var(--ff-text-muted)] cursor-grab" title="Drag to reorder">
                  <GripVertical className="w-4 h-4" />
                </span>
              )}
              <button
                type="button"
                onClick={() => void toggleTaskStatus(task)}
                className="mt-0.5 shrink-0 transition-all duration-200 active:scale-95 hover:scale-105 flex items-center justify-center w-5 h-5 rounded-full border"
                style={{
                  borderColor: isCompleted ? 'var(--ff-success)' : 'var(--ff-text-muted)',
                  backgroundColor: isCompleted
                    ? 'color-mix(in oklab, var(--ff-success) 15%, transparent)'
                    : 'transparent',
                }}
                aria-label={isCompleted ? 'Reopen task' : 'Complete task'}
              >
                <AnimatedCheckmark
                  checked={isCompleted}
                  size={13}
                  strokeWidth={3}
                  color="var(--ff-success)"
                />
              </button>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative inline-block max-w-full">
                    <h4
                      className="text-sm font-bold truncate transition-colors duration-200"
                      style={{
                        color: isCompleted ? 'var(--ff-text-muted)' : 'var(--ff-text-primary)',
                      }}
                    >
                      {task.title}
                    </h4>
                    {isCompleted && (
                      <motion.span
                        initial={isDisabled ? { width: '100%' } : { width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{
                          duration: isDisabled ? 0.01 : MOTION_DURATION.control,
                          ease: MOTION_EASING.decelerate,
                        }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-[var(--ff-text-muted)] pointer-events-none"
                      />
                    )}
                  </div>
                  <ThemeBadge tone={priorityTone[task.priority]}>{task.priority}</ThemeBadge>
                  <ThemeBadge tone="neutral">{task.category || 'General'}</ThemeBadge>
                  {task.recurrence && task.recurrence !== 'none' && (
                    <ThemeBadge tone="accent">
                      <Repeat className="w-3 h-3 mr-1" /> {task.recurrence}
                    </ThemeBadge>
                  )}
                </div>

                {task.description && (
                  <p className="text-xs text-[var(--ff-text-secondary)]">{task.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--ff-text-muted)]">
                  <span className="flex items-center gap-1 font-mono">
                    <Flame className="w-3.5 h-3.5 text-[var(--ff-warning)]" />
                    {task.completedPomodoros} / {task.estimatedPomodoros} pomodoros
                  </span>
                  {task.dueDate && (
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      Due {task.dueDate}
                    </span>
                  )}
                  {subTotal > 0 && (
                    <span className="font-semibold text-[var(--ff-accent-text)]">
                      Subtasks: {subDone}/{subTotal}
                    </span>
                  )}
                </div>

                {subTotal > 0 && (
                  <div className="space-y-1 pt-1">
                    {task.subtasks!.map((sub) => (
                      <label
                        key={sub.id}
                        className="flex items-center gap-2 text-xs text-[var(--ff-text-secondary)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={sub.done}
                          onChange={() => void toggleSubtaskInline(task, sub.id)}
                          className="accent-[var(--ff-accent)]"
                        />
                        <span className={sub.done ? 'line-through text-[var(--ff-text-muted)]' : ''}>
                          {sub.title}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <AnimatedProgressBar
                  value={task.completedPomodoros}
                  max={Math.max(1, task.estimatedPomodoros)}
                  heightClass="h-1.5"
                  tone={isCompleted ? 'success' : 'accent'}
                  ariaLabel={`${task.title} pomodoro progress`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {!isCompleted && (
                <ThemeButton
                  variant="secondary"
                  size="xs"
                  onClick={() => handleStartFocusOnTask(task)}
                >
                  <Play className="w-3 h-3 fill-current" /> Focus
                </ThemeButton>
              )}
              <button
                type="button"
                onClick={() => openEditModal(task)}
                className="p-2 text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] rounded-lg"
                aria-label={`Edit ${task.title}`}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(task)}
                className="p-2 text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] hover:bg-[var(--ff-danger-soft)] rounded-lg"
                aria-label={`Move ${task.title} to Trash`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </ThemeCard>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* View Switcher & Primary Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'list', label: 'List', icon: List },
              { id: 'kanban', label: 'Kanban', icon: Columns },
              { id: 'today', label: 'Today', icon: Clock },
              { id: 'upcoming', label: 'Upcoming', icon: Calendar },
              { id: 'timeline', label: 'Timeline', icon: CalendarDays },
              { id: 'calendar', label: 'Calendar', icon: CalendarDays },
              { id: 'completed', label: 'Completed', icon: History },
            ] as const
          ).map((v) => {
            const Icon = v.icon;
            const active = viewMode === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  borderColor: active ? 'var(--ff-accent-border)' : 'var(--ff-border-color)',
                  background: active ? 'var(--ff-accent-soft)' : 'var(--ff-surface-subtle)',
                  color: active ? 'var(--ff-accent-text)' : 'var(--ff-text-secondary)',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{v.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton variant="secondary" size="sm" onClick={() => setTrashModalOpen(true)}>
            <Trash2 className="w-3.5 h-3.5" />
            <span>Trash</span>
          </ThemeButton>
          <ThemeButton variant="primary" size="md" onClick={openCreateModal}>
            <Plus className="w-4 h-4" />
            <span>Add Task</span>
          </ThemeButton>
        </div>
      </div>

      {/* Overdue Task Carry-Forward Banner */}
      {overdueTasks.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-[var(--ff-text-primary)]">
                {overdueTasks.length} Overdue Task{overdueTasks.length > 1 ? 's' : ''}
              </span>
              <span className="text-[var(--ff-text-muted)] ml-1.5 hidden sm:inline">
                Keep your agenda realistic by carrying them forward to today.
              </span>
            </div>
          </div>

          <ThemeButton
            variant="secondary"
            size="xs"
            onClick={handleCarryForwardOverdue}
            disabled={isCarryingForward}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20 shrink-0"
          >
            {isCarryingForward ? 'Updating...' : `Carry Forward All to Today (${overdueTasks.length})`}
          </ThemeButton>
        </div>
      )}

      {/* Quick Inline Task Bar */}
      <form
        onSubmit={handleQuickAddTask}
        className="flex items-center gap-2 p-2 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] focus-within:border-[var(--ff-accent)] focus-within:ring-2 focus-within:ring-[var(--ff-accent-soft)] transition-all"
      >
        <Plus className="w-4 h-4 text-[var(--ff-accent-text)] shrink-0 ml-1.5" />
        <input
          type="text"
          value={quickTaskTitle}
          onChange={(e) => setQuickTaskTitle(e.target.value)}
          placeholder="Quick add a new task... (press Enter to create)"
          className="bg-transparent text-xs text-[var(--ff-text-primary)] placeholder-[var(--ff-text-muted)] focus:outline-none flex-1 min-w-0"
        />
        <ThemeButton
          type="submit"
          variant="primary"
          size="xs"
          disabled={!quickTaskTitle.trim() || isSubmittingQuick}
        >
          {isSubmittingQuick ? 'Adding...' : 'Add'}
        </ThemeButton>
      </form>

      {/* Search & Multi-Filter Row */}
      <ThemeCard className="p-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-[var(--ff-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title, description, or category..."
            className="ff-input w-full pl-9 pr-3 py-2 text-xs"
          />
        </div>
        <div className="md:col-span-3">
          <ThemeSelect
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs"
            aria-label="Filter by category"
          >
            <option value="ALL">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </ThemeSelect>
        </div>
        <div className="md:col-span-3">
          <ThemeSelect
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | Task['priority'])}
            className="text-xs"
            aria-label="Filter by priority"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </ThemeSelect>
        </div>
      </ThemeCard>

      {/* Main View Canvas */}
      {loading && tasks.length === 0 ? (
        <SkeletonList rows={4} />
      ) : viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 'var(--ff-grid-gap)' }}>
          {(
            [
              { id: 'todo', label: 'To Do' },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'completed', label: 'Completed' },
            ] as const
          ).map((col) => {
            const colTasks = baseFiltered.filter((t) => t.status === col.id);
            return (
              <ThemeCard
                key={col.id}
                className="space-y-3 min-h-[320px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedTaskId) {
                    const target = tasks.find((t) => t.id === draggedTaskId);
                    if (target && target.status !== col.id) {
                      void toggleTaskStatus(target, col.id);
                    }
                    setDraggedTaskId(null);
                  }
                }}
              >
                <div className="flex items-center justify-between pb-2 border-b border-[var(--ff-border-color)]">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ff-text-primary)]">
                    {col.label}
                  </h3>
                  <ThemeBadge tone={col.id === 'completed' ? 'success' : 'accent'}>
                    {colTasks.length}
                  </ThemeBadge>
                </div>
                <div className="space-y-2.5">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDraggedTaskId(t.id)}
                      className="ff-surface-subtle p-3 space-y-2 cursor-grab"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                          {t.title}
                        </span>
                        <ThemeBadge tone={priorityTone[t.priority]}>{t.priority}</ThemeBadge>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)]">
                        <span>{t.category || 'General'}</span>
                        <span>{t.dueDate || 'No date'}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {col.id !== 'todo' && (
                          <button
                            type="button"
                            onClick={() => void toggleTaskStatus(t, 'todo')}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded border border-[var(--ff-border-color)]"
                          >
                            To Do
                          </button>
                        )}
                        {col.id !== 'in_progress' && (
                          <button
                            type="button"
                            onClick={() => void toggleTaskStatus(t, 'in_progress')}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded border border-[var(--ff-border-color)]"
                          >
                            In Progress
                          </button>
                        )}
                        {col.id !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => void toggleTaskStatus(t, 'completed')}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--ff-success-soft)] text-[var(--ff-success)]"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ThemeCard>
            );
          })}
        </div>
      ) : viewMode === 'calendar' ? (
        <ThemeCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Current Month Task Schedule (
              {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })})
            </h3>
            <span className="text-xs text-[var(--ff-text-muted)]">
              Click any dated task below to edit
            </span>
          </div>
          {(() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const dayNum = i + 1;
                  const iso = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
                  const dayTasks = baseFiltered.filter((t) => t.dueDate === iso);
                  const isToday = iso === todayStr;
                  return (
                    <div
                      key={iso}
                      className="p-2 border min-h-[82px] flex flex-col gap-1"
                      style={{
                        borderRadius: 'var(--ff-radius-button)',
                        borderColor: isToday ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                        background: isToday ? 'var(--ff-accent-soft)' : 'var(--ff-surface-subtle)',
                      }}
                    >
                      <span className="text-[11px] font-mono font-bold text-[var(--ff-text-primary)]">
                        {dayNum}
                      </span>
                      {dayTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => openEditModal(t)}
                          className="text-left text-[10px] font-semibold px-1.5 py-0.5 rounded truncate bg-[var(--ff-card-bg)] border border-[var(--ff-border-color)]"
                          style={{
                            textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                          }}
                        >
                          {t.title}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </ThemeCard>
      ) : visibleTasks.length === 0 ? (
        <ThemeCard>
          <EmptyStateIllustration
            icon={<CheckSquare className="w-7 h-7" />}
            title="No tasks match this view"
            description="Create a task or adjust your filters to organize deep focus sprints."
            action={
              <ThemeButton variant="primary" size="sm" onClick={openCreateModal}>
                <Plus className="w-4 h-4" /> Add Task
              </ThemeButton>
            }
          />
        </ThemeCard>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task) => renderTaskCard(task, viewMode === 'list'))}
        </div>
      )}

      {/* Task Composer / Editor Modal */}
      <ThemeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask ? 'Edit Task & Checklist' : 'Create New Task'}
        subtitle="Set priority, category, recurrence, and subtasks"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)]">
              Task Title *
            </label>
            <ThemeInput
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Audit Q4 expense categories"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)]">
              Notes / Context
            </label>
            <ThemeTextarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional acceptance criteria or context"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Priority
              </label>
              <ThemeSelect
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task['priority'])}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </ThemeSelect>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Category
              </label>
              <ThemeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </ThemeSelect>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Recurrence
              </label>
              <ThemeSelect
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
              >
                <option value="none">One-Time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </ThemeSelect>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Est. Pomodoros
              </label>
              <ThemeInput
                type="number"
                min="1"
                max="50"
                value={estimatedPomodoros}
                onChange={(e) => setEstimatedPomodoros(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Due Date
              </label>
              <ThemeInput
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--ff-text-muted)] block mb-1">
                Workflow Status
              </label>
              <ThemeSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as Task['status'])}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </ThemeSelect>
            </div>
          </div>

          {/* Subtasks Editor */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block">
              Subtasks / Checklist ({subtasks.length})
            </label>
            <div className="flex gap-2">
              <ThemeInput
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDraftSubtask();
                  }
                }}
                placeholder="Add checklist step..."
              />
              <ThemeButton type="button" variant="secondary" size="sm" onClick={addDraftSubtask}>
                Add Step
              </ThemeButton>
            </div>
            {subtasks.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                {subtasks.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[var(--ff-surface-subtle)] text-xs"
                  >
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={() =>
                          setSubtasks((prev) =>
                            prev.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x))
                          )
                        }
                      />
                      <span className="truncate">{s.title}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setSubtasks((prev) => prev.filter((x) => x.id !== s.id))}
                      className="text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                      aria-label="Remove subtask"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ValidationMessage message={formError} tone="error" />
          <div className="flex items-center justify-end gap-2 pt-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm" loading={saving}>
              {editingTask ? 'Save Changes' : 'Create Task'}
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
