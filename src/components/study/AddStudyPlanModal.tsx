import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyPlan, StudyPlanType, StudySubject } from '../../types/study.ts';
import { getTodayDateString, formatDateInTimezone } from '../../lib/dateTime.ts';
import { Calendar, Clock } from 'lucide-react';

interface AddStudyPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (plan: Partial<StudyPlan>) => Promise<void>;
  subjects: StudySubject[];
}

export const AddStudyPlanModal: React.FC<AddStudyPlanModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  subjects,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [planType, setPlanType] = useState<StudyPlanType>('weekly');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => getTodayDateString());
  const [endDate, setEndDate] = useState(() =>
    formatDateInTimezone(new Date(Date.now() + 7 * 86400000))
  );
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState(120);
  const [weeklyTargetMinutes, setWeeklyTargetMinutes] = useState(600);
  const [recurringPattern, setRecurringPattern] = useState<'none' | 'daily' | 'weekdays' | 'weekends' | 'weekly'>('none');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSubject = (code: string) => {
    if (selectedSubjectIds.includes(code)) {
      setSelectedSubjectIds(selectedSubjectIds.filter((c) => c !== code));
    } else {
      setSelectedSubjectIds([...selectedSubjectIds, code]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a plan title');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        title: title.trim(),
        description: description.trim(),
        planType,
        subjectIds: selectedSubjectIds.length > 0 ? selectedSubjectIds : subjects.map((s) => s.code),
        startDate,
        endDate,
        dailyTargetMinutes: Number(dailyTargetMinutes) || 60,
        weeklyTargetMinutes: Number(weeklyTargetMinutes) || 300,
        recurringPattern,
        status: 'active',
      });
      setTitle('');
      setDescription('');
      setSelectedSubjectIds([]);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Create Study Plan">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Plan Title *
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 7-Day Gate Algorithms Sprint"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Plan Scope
            </label>
            <select
              value={planType}
              onChange={(e) => setPlanType(e.target.value as StudyPlanType)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="daily">Single Day Plan</option>
              <option value="weekly">Weekly Plan</option>
              <option value="monthly">Monthly Plan</option>
              <option value="semester">Semester Plan</option>
              <option value="exam">Pre-Exam Crash Course</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Recurring Schedule
            </label>
            <select
              value={recurringPattern}
              onChange={(e) => setRecurringPattern(e.target.value as any)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="none">One-off / Fixed Range</option>
              <option value="daily">Repeats Daily</option>
              <option value="weekdays">Weekdays (Mon-Fri)</option>
              <option value="weekends">Weekends (Sat-Sun)</option>
              <option value="weekly">Repeats Weekly</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Daily Target (Mins)
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-2 w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
              <input
                type="number"
                min={15}
                max={960}
                value={dailyTargetMinutes}
                onChange={(e) => setDailyTargetMinutes(parseInt(e.target.value) || 60)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Weekly Target (Mins)
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-2 w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
              <input
                type="number"
                min={60}
                max={5000}
                value={weeklyTargetMinutes}
                onChange={(e) => setWeeklyTargetMinutes(parseInt(e.target.value) || 300)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
              />
            </div>
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
              End Date
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
            Included Subjects (leave empty for all)
          </label>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {subjects.map((s) => {
              const active = selectedSubjectIds.includes(s.code);
              return (
                <button
                  type="button"
                  key={s.code}
                  onClick={() => toggleSubject(s.code)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                    active
                      ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                      : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)] hover:border-[var(--ff-accent)]/50'
                  }`}
                >
                  {s.code}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Plan'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};

