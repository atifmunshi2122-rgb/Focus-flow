import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { StudyGoal, StudySubject } from '../../types/study.ts';
import { computeStudyGoalProgress } from '../../lib/studyIntelligence.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { Target, Plus, Trash2, Check, Clock, Calendar, Edit2, X } from 'lucide-react';

interface StudyGoalsTabProps {
  goals: StudyGoal[];
  subjects: StudySubject[];
  onOpenAddGoal: () => void;
  onToggleMilestone: (goalId: string, milestoneId: string) => Promise<void>;
  onUpdateGoal?: (updated: StudyGoal) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
}

export const StudyGoalsTab: React.FC<StudyGoalsTabProps> = ({
  goals,
  subjects,
  onOpenAddGoal,
  onToggleMilestone,
  onUpdateGoal,
  onDeleteGoal,
}) => {
  const { settings, showToast } = useApp();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const today = getTodayDateString(tz);
  const activeGoals = goals.filter((g) => !g.deletedAt);

  const [pendingMilestoneKey, setPendingMilestoneKey] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<StudyGoal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditGoalModal = (goal: StudyGoal) => {
    setEditingGoal(goal);
    setEditTitle(goal.title);
    setEditDescription(goal.description || '');
    setEditEndDate(goal.endDate || '');
    setEditPriority(goal.priority || 'medium');
  };

  const handleSaveEditGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal || !onUpdateGoal || savingEdit) return;
    if (!editTitle.trim()) {
      showToast('Goal title cannot be empty', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      await onUpdateGoal({
        ...editingGoal,
        title: editTitle.trim(),
        description: editDescription.trim(),
        endDate: editEndDate || '',
        priority: editPriority,
        updatedAt: new Date().toISOString(),
      });
      setEditingGoal(null);
      showToast('Academic goal updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update goal', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleMilestoneClick = async (goalId: string, milestoneId: string) => {
    const key = `${goalId}:${milestoneId}`;
    if (pendingMilestoneKey === key) return;
    setPendingMilestoneKey(key);
    try {
      await onToggleMilestone(goalId, milestoneId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update milestone', 'error');
    } finally {
      setPendingMilestoneKey((prev) => (prev === key ? null : prev));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--ff-accent-text)]" />
            Academic Goals & Milestones
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Set long-term milestones, target exam readiness benchmarks, and track progressive completion
          </p>
        </div>

        <ThemeButton variant="primary" size="sm" onClick={onOpenAddGoal}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Academic Goal
        </ThemeButton>
      </div>

      {/* Goals Grid */}
      {activeGoals.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <Target className="w-10 h-10 mx-auto text-[var(--ff-text-muted)]/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No academic goals defined yet.</p>
          <p>Define targets like "Complete 100 DBMS Problems" or "Finish Unit 3 by Friday".</p>
          <ThemeButton variant="secondary" size="sm" onClick={onOpenAddGoal}>
            Create Goal
          </ThemeButton>
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeGoals.map((goal) => {
            const progress = computeStudyGoalProgress(goal);
            const isCompleted = progress.percentage >= 100 || goal.status === 'completed';
            const endMs = goal.endDate ? new Date(`${goal.endDate}T00:00:00Z`).getTime() : NaN;
            const todayMs = new Date(`${today}T00:00:00Z`).getTime();
            const daysLeft = Number.isFinite(endMs) ? Math.ceil((endMs - todayMs) / 86400000) : null;

            return (
              <ThemeCard key={goal.id} className="p-5 flex flex-col justify-between space-y-4">
                <div>
                  {/* Goal Top Badge & Delete */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
                        {goal.goalType}
                      </span>
                      {goal.subjectCode && goal.subjectCode !== 'all' && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-primary)] font-bold">
                          {goal.subjectCode}
                        </span>
                      )}
                      <span
                        className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          goal.priority === 'high'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
                        }`}
                      >
                        {goal.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {onUpdateGoal && (
                        <button
                          type="button"
                          onClick={() => openEditGoalModal(goal)}
                          className="text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] p-1 transition-colors"
                          title="Edit goal"
                          aria-label={`Edit ${goal.title}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteGoal(goal.id)}
                        className="text-[var(--ff-text-muted)] hover:text-rose-400 p-1 transition-colors"
                        title="Delete goal"
                        aria-label={`Delete ${goal.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    {goal.title}
                  </h3>
                  {goal.description && (
                    <p className="text-xs text-[var(--ff-text-muted)] mt-1 line-clamp-2">
                      {goal.description}
                    </p>
                  )}

                  {/* Progress Bar & Numerical Indicator */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ff-text-muted)]">Progress</span>
                      <span className="font-bold font-mono text-[var(--ff-accent-text)]">
                        {progress.percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-[var(--ff-surface-muted)] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[var(--ff-accent)] h-full rounded-full transition-all duration-300"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Milestones Checklist */}
                  {goal.milestones && goal.milestones.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[var(--ff-border-color)] space-y-2">
                      <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] block">
                        Milestones ({progress.milestonesDone}/{progress.milestonesTotal})
                      </span>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {goal.milestones.map((m) => {
                          const isPending = pendingMilestoneKey === `${goal.id}:${m.id}`;
                          return (
                          <button
                            type="button"
                            key={m.id}
                            disabled={isPending}
                            onClick={() => void handleMilestoneClick(goal.id, m.id)}
                            className="w-full text-left flex items-center gap-2 p-1.5 rounded-lg hover:bg-[var(--ff-surface-muted)] cursor-pointer text-xs transition-colors disabled:opacity-50"
                          >
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                                m.completed
                                  ? 'bg-emerald-500 text-white'
                                  : 'border border-[var(--ff-border-color)] text-transparent'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                            </div>
                            <span
                              className={`flex-1 ${
                                m.completed
                                  ? 'line-through text-[var(--ff-text-muted)]'
                                  : 'text-[var(--ff-text-primary)]'
                              }`}
                            >
                              {m.title}
                            </span>
                          </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer: Dates & Days Remaining */}
                <div className="pt-3 border-t border-[var(--ff-border-color)] text-[11px] text-[var(--ff-text-muted)] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Target: {goal.endDate || 'No deadline'}
                  </span>
                  <span
                    className={`font-semibold ${
                      isCompleted
                        ? 'text-emerald-400 font-bold'
                        : daysLeft !== null && daysLeft < 3
                        ? 'text-rose-400 font-bold'
                        : 'text-[var(--ff-text-muted)]'
                    }`}
                  >
                    {isCompleted
                      ? 'Completed ✓'
                      : daysLeft === null
                      ? 'Open-ended'
                      : daysLeft > 0
                      ? `${daysLeft}d left`
                      : daysLeft === 0
                      ? 'Due Today'
                      : 'Overdue'}
                  </span>
                </div>
              </ThemeCard>
            );
          })}
        </div>
      )}

      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-3">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Edit Academic Goal</h3>
              <button
                type="button"
                onClick={() => setEditingGoal(null)}
                className="p-1 text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditGoal} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[var(--ff-text-muted)] mb-1">Goal Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                />
              </div>
              <div>
                <label className="block font-medium text-[var(--ff-text-muted)] mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--ff-text-muted)] mb-1">Target Deadline</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[var(--ff-text-muted)] mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
                <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setEditingGoal(null)} disabled={savingEdit}>
                  Cancel
                </ThemeButton>
                <ThemeButton type="submit" variant="primary" size="sm" loading={savingEdit} loadingText="Saving...">
                  Save Goal
                </ThemeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

