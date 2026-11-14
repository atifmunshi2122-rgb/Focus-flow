import React from 'react';
import { StudyGoal, StudySubject } from '../../types/study.ts';
import { computeStudyGoalProgress } from '../../lib/studyIntelligence.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { Target, Plus, Trash2, Check, Clock, Calendar } from 'lucide-react';

interface StudyGoalsTabProps {
  goals: StudyGoal[];
  subjects: StudySubject[];
  onOpenAddGoal: () => void;
  onToggleMilestone: (goalId: string, milestoneId: string) => Promise<void>;
  onDeleteGoal: (goalId: string) => Promise<void>;
}

export const StudyGoalsTab: React.FC<StudyGoalsTabProps> = ({
  goals,
  subjects,
  onOpenAddGoal,
  onToggleMilestone,
  onDeleteGoal,
}) => {
  const activeGoals = goals.filter((g) => !g.deletedAt);

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
            const today = new Date().toISOString().slice(0, 10);
            const daysLeft = Math.ceil(
              (new Date(`${goal.endDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
                86400000
            );

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

                    <button
                      type="button"
                      onClick={() => onDeleteGoal(goal.id)}
                      className="text-[var(--ff-text-muted)] hover:text-rose-400 p-1 transition-colors"
                      title="Delete goal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
                        {goal.milestones.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => onToggleMilestone(goal.id, m.id)}
                            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[var(--ff-surface-muted)] cursor-pointer text-xs transition-colors"
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer: Dates & Days Remaining */}
                <div className="pt-3 border-t border-[var(--ff-border-color)] text-[11px] text-[var(--ff-text-muted)] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Target: {goal.endDate}
                  </span>
                  <span
                    className={`font-semibold ${
                      daysLeft < 3 ? 'text-rose-400 font-bold' : 'text-[var(--ff-text-muted)]'
                    }`}
                  >
                    {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Due Today' : 'Overdue'}
                  </span>
                </div>
              </ThemeCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

