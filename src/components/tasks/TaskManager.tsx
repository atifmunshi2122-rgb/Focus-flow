import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Task } from '../../types/index.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
  ThemeSelect,
  ThemeTextarea,
} from '../ui/ThemePrimitives.tsx';
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimatedPomodoros, setEstimatedPomodoros] = useState('2');
  const [dueDate, setDueDate] = useState('');

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
    setModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setEstimatedPomodoros(String(task.estimatedPomodoros));
    setDueDate(task.dueDate || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Task title is required', 'error');
      return;
    }

    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, {
          title,
          description,
          priority,
          estimatedPomodoros: Number(estimatedPomodoros) || 1,
          dueDate: dueDate || null,
        });
        showToast('Task updated successfully', 'success');
      } else {
        await api.createTask({
          title,
          description,
          priority,
          estimatedPomodoros: Number(estimatedPomodoros) || 1,
          dueDate: dueDate || null,
        });
        showToast('Task created successfully', 'success');
      }
      setModalOpen(false);
      triggerRefresh();
      loadTasks();
    } catch {
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
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
            Loading tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 text-center">
            <CheckSquare className="w-8 h-8 text-[var(--ff-text-muted)] mx-auto mb-2 opacity-50" />
            <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">No tasks found</h3>
            <p className="text-xs text-[var(--ff-text-muted)] mt-1">
              Get started by creating your first task above.
            </p>
          </div>
        ) : (
          <div className="divide-y ff-divider">
            {filteredTasks.map((task) => {
              const isCompleted = task.status === 'completed';

              return (
                <div
                  key={task.id}
                  className={`ff-row-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isCompleted ? 'opacity-65' : ''
                  }`}
                  style={{ padding: 'var(--ff-row-pad)' }}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => void toggleTaskStatus(task)}
                      className="mt-0.5 text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] transition-colors shrink-0"
                      aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--ff-success)' }} />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-semibold text-[var(--ff-text-primary)] ${
                            isCompleted ? 'line-through text-[var(--ff-text-muted)]' : ''
                          }`}
                        >
                          {task.title}
                        </span>

                        <ThemeBadge tone={priorityTone[task.priority]}>{task.priority}</ThemeBadge>
                      </div>

                      {task.description && (
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
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors"
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
              );
            })}
          </div>
        )}
      </ThemeCard>

      {/* Task Create / Edit Modal */}
      <ThemeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create New Task'}
      >
        <form onSubmit={handleSave} className="space-y-4">
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
              onChange={(e) => setTitle(e.target.value)}
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

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm">
              {editingTask ? 'Save Changes' : 'Create Task'}
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
