import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyGoal, StudySubject } from '../../types/study.ts';
import { getTodayDateString, formatDateInTimezone } from '../../lib/dateTime.ts';
import { Target, Plus, Trash2 } from 'lucide-react';

interface AddStudyGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (goal: Partial<StudyGoal>) => Promise<void>;
  subjects: StudySubject[];
}

export const AddStudyGoalModal: React.FC<AddStudyGoalModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  subjects,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalType, setGoalType] = useState('monthly');
  const [subjectCode, setSubjectCode] = useState('all');
  const [targetValue, setTargetValue] = useState(10);
  const [unit, setUnit] = useState('topics');
  const [startDate, setStartDate] = useState(() => getTodayDateString());
  const [endDate, setEndDate] = useState(() =>
    formatDateInTimezone(new Date(Date.now() + 30 * 86400000))
  );
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [milestones, setMilestones] = useState<Array<{ id: string; title: string; targetValue: number; completed: boolean }>>([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMilestone = () => {
    if (!newMilestoneTitle.trim()) return;
    setMilestones([
      ...milestones,
      {
        id: `ms_${Date.now()}`,
        title: newMilestoneTitle.trim(),
        targetValue: Math.round(targetValue / (milestones.length + 2)),
        completed: false,
      },
    ]);
    setNewMilestoneTitle('');
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a goal title');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const selectedSub = subjects.find((s) => s.code === subjectCode);
      await onAdd({
        title: title.trim(),
        description: description.trim(),
        goalType,
        subjectId: selectedSub?.id || null,
        subjectCode: subjectCode !== 'all' ? subjectCode : null,
        targetValue: Number(targetValue) || 1,
        currentValue: 0,
        unit,
        startDate,
        endDate,
        status: 'active',
        priority,
        milestones,
      });
      setTitle('');
      setDescription('');
      setMilestones([]);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save goal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Create Academic Goal">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Goal Title *
          </label>
          <div className="relative">
            <Target className="absolute left-3 top-2.5 w-4 h-4 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Master DBMS & TOC for GATE 2025"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Timeframe / Horizon
            </label>
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="daily">Daily Target</option>
              <option value="weekly">Weekly Sprint</option>
              <option value="monthly">Monthly Milestone</option>
              <option value="semester">Semester Objective</option>
              <option value="long_term">Long-Term Vision</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Target Subject
            </label>
            <select
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="all">All Subjects / General</option>
              {subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Target Quantity
            </label>
            <input
              type="number"
              min={1}
              value={targetValue}
              onChange={(e) => setTargetValue(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Measurement Unit
            </label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. topics, hours, practice tests"
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Target Deadline
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Priority Level
          </label>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPriority(p)}
                className={`flex-1 py-1.5 text-xs rounded-xl border capitalize font-medium transition-all ${
                  priority === p
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                    : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Milestones */}
        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Goal Milestones ({milestones.length})
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newMilestoneTitle}
              onChange={(e) => setNewMilestoneTitle(e.target.value)}
              placeholder="e.g. Complete Unit 1 & 2 PYQs"
              className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
            <ThemeButton type="button" size="sm" variant="secondary" onClick={handleAddMilestone}>
              <Plus className="w-3.5 h-3.5" />
            </ThemeButton>
          </div>
          {milestones.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
              {milestones.map((ms) => (
                <div
                  key={ms.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[var(--ff-surface-muted)] text-xs text-[var(--ff-text-primary)]"
                >
                  <span className="truncate">{ms.title}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(ms.id)}
                    className="text-red-400 hover:text-red-300 ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Goal'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};

