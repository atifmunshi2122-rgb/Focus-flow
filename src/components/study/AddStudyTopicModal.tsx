import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudySubject, StudyTopic } from '../../types/study.ts';

interface AddStudyTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: StudySubject[];
  defaultSubjectCode?: string;
  onAdd: (topic: Partial<StudyTopic>) => Promise<void>;
}

export const AddStudyTopicModal: React.FC<AddStudyTopicModalProps> = ({
  isOpen,
  onClose,
  subjects,
  defaultSubjectCode,
  onAdd,
}) => {
  const [subjectCode, setSubjectCode] = useState(defaultSubjectCode || subjects[0]?.code || 'Sub_DBMS');
  const [unit, setUnit] = useState('Unit 1');
  const [topic, setTopic] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [theory, setTheory] = useState(false);
  const [practice, setPractice] = useState(false);
  const [pyq, setPyq] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (defaultSubjectCode) {
      setSubjectCode(defaultSubjectCode);
    }
  }, [defaultSubjectCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtopic.trim()) {
      setError('Please enter a subtopic or concept title');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        subjectCode,
        unit: unit.trim() || 'Unit 1',
        topic: topic.trim() || 'Core Concept',
        subtopic: subtopic.trim(),
        priority,
        theory,
        practice,
        pyq,
        revisionCount: 0,
        notes: notes.trim() || undefined,
      });
      setTopic('');
      setSubtopic('');
      setNotes('');
      setTheory(false);
      setPractice(false);
      setPyq(false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add topic');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Syllabus Topic"
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Subject *
            </label>
            <select
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            >
              {subjects.map((sub) => (
                <option key={sub.code} value={sub.code}>
                  {sub.name} ({sub.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Unit / Module *
            </label>
            <input
              type="text"
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. Unit 3: Concurrency"
              className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Topic Group (Optional)
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Locking Protocols"
            className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Subtopic / Target Concept *
          </label>
          <input
            type="text"
            required
            value={subtopic}
            onChange={(e) => setSubtopic(e.target.value)}
            placeholder="e.g. Strict 2PL vs Rigorous 2PL & Deadlocks"
            className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Exam Priority
          </label>
          <div className="flex gap-2">
            {(['High', 'Medium', 'Low'] as const).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPriority(p)}
                className={`flex-1 py-1.5 px-3 text-xs rounded-xl font-medium border transition-colors ${
                  priority === p
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                    : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)] hover:border-[var(--ff-text-muted)]'
                }`}
              >
                {p} Priority
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1.5">
            Initial Completion Milestones
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={theory}
                onChange={(e) => setTheory(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--ff-accent)] focus:ring-0"
              />
              <span className="font-medium text-[var(--ff-text-primary)]">Theory (T)</span>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={practice}
                onChange={(e) => setPractice(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--ff-accent)] focus:ring-0"
              />
              <span className="font-medium text-[var(--ff-text-primary)]">Practice (P)</span>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={pyq}
                onChange={(e) => setPyq(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--ff-accent)] focus:ring-0"
              />
              <span className="font-medium text-[var(--ff-text-primary)]">PYQ (Q)</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Notes & Formula References
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Important takeaways, theorem names, or textbook page numbers..."
            className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)] resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" loading={submitting}>
            Add Topic
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};
