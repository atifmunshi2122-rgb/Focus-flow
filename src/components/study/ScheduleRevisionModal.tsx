import React, { useState, useEffect } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudySubject, StudyTopic, StudyRevision, RevisionDifficulty } from '../../types/study.ts';
import { REVISION_INTERVAL_LADDER, calculateNextRevisionDate } from '../../lib/studyIntelligence.ts';
import { Calendar, Repeat, BookOpen, AlertCircle } from 'lucide-react';

interface ScheduleRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: StudySubject[];
  topics: StudyTopic[];
  defaultSubjectCode?: string;
  defaultTopicId?: string;
  onSchedule: (revision: Partial<StudyRevision>) => Promise<void>;
}

export const ScheduleRevisionModal: React.FC<ScheduleRevisionModalProps> = ({
  isOpen,
  onClose,
  subjects,
  topics,
  defaultSubjectCode,
  defaultTopicId,
  onSchedule,
}) => {
  const [subjectCode, setSubjectCode] = useState(defaultSubjectCode || subjects[0]?.code || 'Sub_DBMS');
  const [topicId, setTopicId] = useState(defaultTopicId || '');
  const [customTopicTitle, setCustomTopicTitle] = useState('');
  const [difficulty, setDifficulty] = useState<RevisionDifficulty>('medium');
  const [intervalDays, setIntervalDays] = useState<number>(REVISION_INTERVAL_LADDER[0]);
  const [nextDate, setNextDate] = useState(() => calculateNextRevisionDate(REVISION_INTERVAL_LADDER[0]));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter topics by selected subject
  const availableTopics = topics.filter((t) => t.subjectCode === subjectCode);

  useEffect(() => {
    if (defaultSubjectCode) setSubjectCode(defaultSubjectCode);
  }, [defaultSubjectCode]);

  useEffect(() => {
    if (defaultTopicId) {
      setTopicId(defaultTopicId);
      const matched = topics.find((t) => t.id === defaultTopicId);
      if (matched) {
        setSubjectCode(matched.subjectCode);
        setCustomTopicTitle(matched.subtopic || matched.topic);
      }
    } else if (availableTopics.length > 0) {
      setTopicId(availableTopics[0].id);
      setCustomTopicTitle(availableTopics[0].subtopic || availableTopics[0].topic);
    } else {
      setTopicId('');
    }
  }, [defaultTopicId, subjectCode, topics]);

  const handleTopicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setTopicId(selectedId);
    const matched = availableTopics.find((t) => t.id === selectedId);
    if (matched) {
      setCustomTopicTitle(matched.subtopic || matched.topic);
    }
  };

  const handleIntervalChange = (days: number) => {
    setIntervalDays(days);
    setNextDate(calculateNextRevisionDate(days));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = customTopicTitle.trim() || (availableTopics.find((t) => t.id === topicId)?.subtopic) || 'Core Revision';
    
    if (!finalTitle) {
      setError('Please select or specify a topic to revise');
      return;
    }

    setSubmitting(true);
    setError(null);

    const todayStr = new Date().toISOString().split('T')[0];

    try {
      await onSchedule({
        subjectCode,
        topicId: topicId || `custom_${Date.now()}`,
        topicTitle: finalTitle,
        lastStudiedAt: todayStr,
        nextRevisionAt: nextDate,
        intervalDays,
        repetition: 0,
        difficulty,
        status: nextDate <= todayStr ? 'due' : 'scheduled',
        notes: notes.trim() || undefined,
      });
      setNotes('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to schedule revision');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Spaced Revision"
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
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
              Topic from Syllabus
            </label>
            {availableTopics.length > 0 ? (
              <select
                value={topicId}
                onChange={handleTopicChange}
                className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
              >
                {availableTopics.map((top) => (
                  <option key={top.id} value={top.id}>
                    {top.unit ? `[${top.unit}] ` : ''}{top.subtopic || top.topic}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-[var(--ff-text-muted)] py-2 italic">
                No topics found. Type below.
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Topic Title / Scope
          </label>
          <input
            type="text"
            value={customTopicTitle}
            onChange={(e) => setCustomTopicTitle(e.target.value)}
            placeholder="e.g. B+ Tree node splitting & deletion rules"
            className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1.5 flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
            Ebbinghaus Spaced Repetition Interval
          </label>
          <div className="grid grid-cols-6 gap-1.5">
            {REVISION_INTERVAL_LADDER.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => handleIntervalChange(days)}
                className={`py-2 px-1 text-xs rounded-xl font-medium border text-center transition-all ${
                  intervalDays === days
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] shadow-md shadow-[var(--ff-accent)]/20'
                    : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                +{days}d
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
            Intervals follow the cognitive retention curve: 1d → 3d → 7d → 14d → 30d → 60d
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
              Scheduled Date
            </label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Initial Perceived Difficulty
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['easy', 'medium', 'hard'] as RevisionDifficulty[]).map((diff) => (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setDifficulty(diff)}
                  className={`py-2 text-xs rounded-xl capitalize font-medium border transition-all ${
                    difficulty === diff
                      ? diff === 'easy'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : diff === 'medium'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-muted)]'
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
            Key Recall Focus / Questions
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What should you quiz yourself on? e.g. Draw the B+ tree after deleting key 15."
            className="w-full px-3 py-2 text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)] resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton variant="primary" size="sm" type="submit" disabled={submitting}>
            {submitting ? 'Scheduling...' : 'Confirm Schedule'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};
