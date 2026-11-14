import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyMistake, StudySubject } from '../../types/study.ts';
import { AlertTriangle, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';

interface LogStudyMistakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: StudySubject[];
  defaultSubjectCode?: string;
  defaultTopic?: string;
  onAdd: (mistake: Partial<StudyMistake>) => Promise<void>;
}

const SOURCE_OPTIONS = [
  'GATE PYQ Practice',
  'LeetCode / Contest',
  'College Lab / Viva',
  'Semester Internal / Midterm',
  'Full-Length Mock Test',
  'Daily Homework / Assignment',
  'Textbook Practice Problems',
];

export const LogStudyMistakeModal: React.FC<LogStudyMistakeModalProps> = ({
  isOpen,
  onClose,
  subjects,
  defaultSubjectCode,
  defaultTopic,
  onAdd,
}) => {
  const [subjectCode, setSubjectCode] = useState(defaultSubjectCode || subjects[0]?.code || 'Sub_DBMS');
  const [topic, setTopic] = useState(defaultTopic || '');
  const [source, setSource] = useState(SOURCE_OPTIONS[0]);
  const [severity, setSeverity] = useState<'High' | 'Medium' | 'Low'>('High');
  const [trap, setTrap] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [goldenRule, setGoldenRule] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (defaultSubjectCode) setSubjectCode(defaultSubjectCode);
    if (defaultTopic) setTopic(defaultTopic);
  }, [defaultSubjectCode, defaultTopic]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trap.trim() || !rootCause.trim() || !goldenRule.trim()) {
      setError('Please fill in the Trap, Root Cause, and Permanent Golden Rule');
      return;
    }

    const matchedSub = subjects.find((s) => s.code === subjectCode);

    setSubmitting(true);
    setError(null);
    try {
      await onAdd({
        date: new Date().toISOString().slice(0, 10),
        subjectCode,
        subjectName: matchedSub ? matchedSub.name : subjectCode,
        topic: topic.trim() || 'General Concept',
        source,
        severity,
        trap: trap.trim(),
        rootCause: rootCause.trim(),
        goldenRule: goldenRule.trim(),
        resolved: false,
      });
      setTopic('');
      setTrap('');
      setRootCause('');
      setGoldenRule('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record mistake');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Mistake & Error Analysis"
      maxWidthClass="max-w-xl"
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
              Topic / Question Concept
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. B+ Tree Height Calculation"
              className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Problem Source
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2.5 text-base sm:text-sm rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            >
              {SOURCE_OPTIONS.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Mistake Severity
            </label>
            <div className="flex gap-2">
              {(['High', 'Medium', 'Low'] as const).map((sev) => (
                <button
                  type="button"
                  key={sev}
                  onClick={() => setSeverity(sev)}
                  className={`flex-1 min-h-[44px] py-2 px-2 text-xs rounded-xl font-medium border flex items-center justify-center transition-colors ${
                    severity === sev
                      ? sev === 'High'
                        ? 'bg-rose-500 text-white border-rose-500'
                        : sev === 'Medium'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)]'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3-Tier Structured Analysis */}
        <div className="space-y-3 pt-1">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 mb-1">
              <span>❌ 1. The Trap (What I Did Wrong)</span>
            </label>
            <textarea
              required
              rows={2}
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
              placeholder="e.g. Assumed node size equals block size without subtracting header pointer..."
              className="w-full px-3 py-2 text-base sm:text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-rose-500/30 text-[var(--ff-text-primary)] focus:outline-none focus:border-rose-400 resize-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-1">
              <span>🔍 2. Root Cause Analysis (Why the logic failed)</span>
            </label>
            <textarea
              required
              rows={2}
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              placeholder="e.g. Overlooked difference between order p (max pointers) and keys (p - 1)..."
              className="w-full px-3 py-2 text-base sm:text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-amber-500/30 text-[var(--ff-text-primary)] focus:outline-none focus:border-amber-400 resize-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1">
              <span>💡 3. Permanent Corrective Rule (The unbreakable takeaway)</span>
            </label>
            <textarea
              required
              rows={2}
              value={goldenRule}
              onChange={(e) => setGoldenRule(e.target.value)}
              placeholder="e.g. Always write down order equation: p * P_block + (p - 1) * K <= BlockSize before solving."
              className="w-full px-3 py-2 text-base sm:text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-emerald-500/30 text-[var(--ff-text-primary)] focus:outline-none focus:border-emerald-400 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose} className="min-h-[44px] px-4">
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" loading={submitting} className="min-h-[44px] px-4">
            Log Mistake
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};
