import React, { useState, useEffect } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudySubject, StudyTopic, StudyRevision, RevisionDifficulty } from '../../types/study.ts';
import { REVISION_INTERVAL_LADDER, calculateNextRevisionDate } from '../../lib/studyIntelligence.ts';
import { api } from '../../lib/api.ts';
import { Calendar, Repeat, BookOpen, AlertCircle, Clock } from 'lucide-react';

interface ScheduleRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: StudySubject[];
  topics: StudyTopic[];
  defaultSubjectCode?: string;
  defaultTopicId?: string;
  onSchedule: (revision: Partial<StudyRevision>) => Promise<StudyRevision | void>;
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
  const [addToPlanner, setAddToPlanner] = useState(true);
  const [plannerStartTime, setPlannerStartTime] = useState('09:00');
  const [plannerDuration, setPlannerDuration] = useState<number>(45);
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
      const savedRev = await onSchedule({
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

      const revisionId =
        savedRev && typeof savedRev === 'object' && 'id' in savedRev && savedRev.id
          ? savedRev.id
          : `rev_${Date.now()}`;

      if (addToPlanner) {
        try {
          const [startH, startM] = plannerStartTime.split(':').map(Number);
          const safeH = Number.isFinite(startH) ? Math.min(23, Math.max(0, startH)) : 9;
          const safeM = Number.isFinite(startM) ? Math.min(59, Math.max(0, startM)) : 0;
          const startMinute = safeH * 60 + safeM;
          const safeDuration = Number.isFinite(plannerDuration) ? Math.max(15, plannerDuration) : 45;
          const endMinute = Math.min(24 * 60 - 1, startMinute + safeDuration);

          await api.createTimeBlock({
            id: `tb_rev_${revisionId}`,
            date: nextDate,
            title: `[Revision] ${finalTitle}`,
            category: 'Learning',
            startMinute,
            endMinute,
            revisionId: revisionId,
            notes: notes.trim() ? `Subject: ${subjectCode}\n${notes.trim()}` : `Subject: ${subjectCode}`,
            completed: false,
          });
        } catch (plannerErr) {
          // Graceful fallback: do NOT fail or rollback the revision if time block creation fails
          console.warn('Could not insert time block for revision:', plannerErr);
        }
      }

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
              className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
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
                className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
              >
                {availableTopics.map((top) => (
                  <option key={top.id} value={top.id}>
                    {top.unit ? `[${top.unit}] ` : ''}{top.subtopic || top.topic}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-[var(--ff-text-muted)] py-2.5 italic">
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
            className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1.5 flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
            Ebbinghaus Spaced Repetition Interval
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {REVISION_INTERVAL_LADDER.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => handleIntervalChange(days)}
                className={`min-h-[44px] py-2 px-1 text-xs rounded-xl font-medium border text-center flex items-center justify-center transition-all ${
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
              className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
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
                  className={`min-h-[44px] py-2 text-xs rounded-xl capitalize font-medium border flex items-center justify-center transition-all ${
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
            className="w-full px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)] resize-none"
          />
        </div>

        {/* Time Block Planner Integration */}
        <div className="p-3 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addToPlanner}
              onChange={(e) => setAddToPlanner(e.target.checked)}
              className="w-4 h-4 rounded text-[var(--ff-accent)] border-[var(--ff-border-color)] focus:ring-0"
            />
            <span className="text-xs font-semibold text-[var(--ff-text-primary)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
              Add to Daily Time Block Planner ({nextDate})
            </span>
          </label>

          {addToPlanner && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={plannerStartTime}
                  onChange={(e) => setPlannerStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-base sm:text-sm rounded-lg bg-[var(--ff-card-bg)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                  Duration
                </label>
                <select
                  value={plannerDuration}
                  onChange={(e) => setPlannerDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-base sm:text-sm rounded-lg bg-[var(--ff-card-bg)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton variant="ghost" size="sm" type="button" onClick={onClose} className="min-h-[44px] px-4">
            Cancel
          </ThemeButton>
          <ThemeButton variant="primary" size="sm" type="submit" disabled={submitting} className="min-h-[44px] px-4">
            {submitting ? 'Scheduling...' : 'Confirm Schedule'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};
