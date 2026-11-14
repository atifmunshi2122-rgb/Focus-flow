import React, { useState } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyFlashcard, StudySubject, StudyTopic } from '../../types/study.ts';
import { Sparkles } from 'lucide-react';

interface AddStudyFlashcardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (card: Partial<StudyFlashcard>) => Promise<void>;
  subjects: StudySubject[];
  topics: StudyTopic[];
}

export const AddStudyFlashcardModal: React.FC<AddStudyFlashcardModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  subjects,
  topics,
}) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [subjectCode, setSubjectCode] = useState(subjects[0]?.code || '');
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTopics = topics.filter((t) => !subjectCode || t.subjectCode === subjectCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      setError('Both question and answer are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const selectedSub = subjects.find((s) => s.code === subjectCode);
      await onAdd({
        question: question.trim(),
        answer: answer.trim(),
        subjectId: selectedSub?.id || null,
        topicId: topicId || null,
        difficulty,
        reviewCount: 0,
        nextReviewAt: new Date().toISOString().slice(0, 10),
      });
      setQuestion('');
      setAnswer('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save flashcard');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeModal isOpen={isOpen} onClose={onClose} title="Create Active Recall Flashcard">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Subject
            </label>
            <select
              value={subjectCode}
              onChange={(e) => {
                setSubjectCode(e.target.value);
                setTopicId('');
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              {subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
              Associated Topic
            </label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
            >
              <option value="">General Topic</option>
              {availableTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subtopic}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Front: Question / Prompt *
          </label>
          <textarea
            rows={2}
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What is the time complexity of Dijkstra with Fibonacci Heap?"
            className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none font-medium"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Back: Answer / Explanation *
          </label>
          <textarea
            rows={4}
            required
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="e.g. O(V log V + E). Vertex deletion is O(V log V) and edge relaxation is O(E) amortized."
            className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
            Initial Difficulty Tier
          </label>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-1 text-xs rounded-xl border capitalize font-medium transition-all ${
                  difficulty === d
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                    : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)]'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
          <ThemeButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </ThemeButton>
          <ThemeButton type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Flashcard'}
          </ThemeButton>
        </div>
      </form>
    </ThemeModal>
  );
};

