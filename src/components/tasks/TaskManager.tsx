import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Task } from '../../types/index.ts';
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
  const { refreshKey, triggerRefresh, showToast, setActiveTaskId, switchTimerMode, startTimer, setCurrentTab } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Modal / Form state
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

  const priorityColors = {
    high: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900',
    medium: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
    low: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Filter tabs and Add Task */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Interactive Segmented Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === 'active'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            In Progress ({tasks.filter((t) => t.status !== 'completed').length})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              filter === 'completed'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Completed ({tasks.filter((t) => t.status === 'completed').length})
          </button>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

      {/* Task List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 text-center">
            <CheckSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No tasks found</h4>
            <p className="text-xs text-slate-500 mt-1">Get started by creating your first task above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredTasks.map((task) => {
              const isCompleted = task.status === 'completed';

              return (
                <div
                  key={task.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${
                    isCompleted ? 'opacity-60 bg-slate-50/30 dark:bg-slate-900/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Completion Checkbox */}
                    <button
                      onClick={() => toggleTaskStatus(task)}
                      className="mt-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                      aria-label={isCompleted ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/10" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm font-semibold text-slate-900 dark:text-white ${
                            isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : ''
                          }`}
                        >
                          {task.title}
                        </span>

                        {/* Priority indicator */}
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${
                            priorityColors[task.priority]
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {task.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {task.description}
                        </p>
                      )}

                      {/* Metadata row with unboxed discipline */}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {task.dueDate && (
                          <div className="flex items-center gap-1 font-mono">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>Due {task.dueDate}</span>
                          </div>
                        )}
                        {task.dueDate && <span aria-hidden="true">·</span>}
                        <div className="flex items-center gap-1 font-mono">
                          <Flame className="w-3 h-3 text-indigo-500" />
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
                        onClick={() => handleStartFocusOnTask(task)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                        title="Start Pomodoro timer on this task"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Focus</span>
                      </button>
                    )}

                    <button
                      onClick={() => openEditModal(task)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Edit task"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              {editingTask ? 'Edit Task' : 'Create New Task'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Implement monthly bill calculation"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context, subtasks, or notes..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as typeof priority)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Est. Pomodoros
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={estimatedPomodoros}
                    onChange={(e) => setEstimatedPomodoros(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
