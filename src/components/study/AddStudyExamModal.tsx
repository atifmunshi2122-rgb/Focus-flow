import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyExam, StudySubject, StudyTopic } from '../../types/study.ts';
import { GraduationCap } from 'lucide-react';

interface AddStudyExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (exam: Partial<StudyExam>) => Promise<void>;
  subjects: StudySubject[];
  topics: StudyTopic[];
}

export const AddStudyExamModal: React.FC<AddStudyExamModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  subjects,
  topics,
}) => {
  const [title, setTitle] = useState('');
  const [examType, setExamType] = useState('Final Semester');
  const [selectedSubjectCode, setSelectedSubjectCode] = useState(subjects[0]?.code || 'all');
  const [examDate, setExamDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [totalMarks, setTotalMarks] = useState(100);
  const [preparationStatus, setPreparationStatus] = useState<StudyExam['preparationStatus']>('preparing');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter an exam title');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const subjectIds = selectedSubjectCode === 'all' ? subjects.map((s) => s.code) : [selectedSubjectCode];
      const syllabusTopicIds = topics
        .filter((t) => subjectIds.includes(t.subjectCode))
        .map((t) => t.id);

      await onAdd({
        title: title.trim(),
        examType,
        subjectIds,
        examDate,
        startTime,
        durationMinutes: Number(durationMinutes) || 180,
        totalMarks: Number(totalMarks) || 100,
        obtainedMarks: null,
        syllabusTopicIds,
        preparationStatus,
        resultStatus: 'pending',
        notes: notes.trim(),
      });
      setTitle('');
      setNotes('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save exam');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Add Academic Examination">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Exam Name / Paper *
          </label>
          <div className="relative">
            <GraduationCap className="absolute left-3 top-2.5 w-4 h-4 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Operating Systems Endsem / GATE CSE 2025"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Exam Type
            </label>
            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="Final Semester">Final Semester</option>
              <option value="Mid-Term">Mid-Term / Internal</option>
              <option value="GATE Mock">GATE / Competitive Mock</option>
              <option value="Practical / Lab">Practical / Lab Exam</option>
              <option value="Quiz / Class Test">Class Quiz / Test</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Subject
            </label>
            <select
              value={selectedSubjectCode}
              onChange={(e) => setSelectedSubjectCode(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="all">Comprehensive (All Subjects)</option>
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
              Exam Date
            </label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Duration (Minutes)
            </label>
            <input
              type="number"
              min={15}
              max={600}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 180)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Total Marks
            </label>
            <input
              type="number"
              min={10}
              max={1000}
              value={totalMarks}
              onChange={(e) => setTotalMarks(parseInt(e.target.value) || 100)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Current Preparation Status
          </label>
          <div className="flex gap-2">
            {(['not_started', 'preparing', 'ready', 'completed'] as const).map((st) => (
              <button
                type="button"
                key={st}
                onClick={() => setPreparationStatus(st)}
                className={`flex-1 py-1 text-[11px] rounded-lg border capitalize font-medium transition-all ${
                  preparationStatus === st
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                    : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)]'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Notes & Syllabus Focus
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key high-weightage chapters, room number, exam hall instructions..."
            className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Adding...' : 'Schedule Exam'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};

