import React, { useState } from 'react';
import { ThemeModal, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { AcademicTierId, StudySubject } from '../../types/study.ts';
import { DEFAULT_ACADEMIC_TIERS } from '../../data/studySeedData.ts';
import { BookOpen, Palette, Tag } from 'lucide-react';

interface AddStudySubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (subject: Partial<StudySubject>) => Promise<void>;
}

const COLOR_PRESETS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#6366f1',
];

export const AddStudySubjectModal: React.FC<AddStudySubjectModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [tierId, setTierId] = useState<string>('tier1_sem3');
  const [semesterOrDomain, setSemesterOrDomain] = useState('');
  const [targetExam, setTargetExam] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a subject name');
      return;
    }

    const cleanCode = code.trim() || `Sub_${name.trim().replace(/\s+/g, '').slice(0, 8)}`;

    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        code: cleanCode,
        name: name.trim(),
        tierId,
        semesterOrDomain: semesterOrDomain.trim() || undefined,
        targetExam: targetExam.trim() || undefined,
        color,
        totalSubtopics: 0,
        completedSubtopics: 0,
      });
      setCode('');
      setName('');
      setSemesterOrDomain('');
      setTargetExam('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add subject');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Academic Subject"
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Subject Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Distributed Systems & Cloud"
            className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Subject Code (Unique)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. Sub_Cloud"
              className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Academic Tier / Goal
            </label>
            <select
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            >
              {DEFAULT_ACADEMIC_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
              <option value="custom">Custom / Personal Study</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Semester or Domain
            </label>
            <input
              type="text"
              value={semesterOrDomain}
              onChange={(e) => setSemesterOrDomain(e.target.value)}
              placeholder="e.g. Semester 4 / Core"
              className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Target Exam (Optional)
            </label>
            <input
              type="text"
              value={targetExam}
              onChange={(e) => setTargetExam(e.target.value)}
              placeholder="e.g. GATE 2028 / Finals"
              className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Accent Badge Color
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PRESETS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-full transition-transform ${
                  color === c ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                }`}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" loading={submitting}>
            Add Subject
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};
