import React, { useState } from 'react';
import { StudyQuiz, StudyQuizQuestion, StudySubject } from '../../types/study.ts';
import { ThemeCard, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { HelpCircle, Award, Play, Trash2, Plus, X } from 'lucide-react';

interface StudyQuizzesTabProps {
  quizzes: StudyQuiz[];
  subjects?: StudySubject[];
  onTakeQuiz: (quiz: StudyQuiz) => void;
  onDeleteQuiz: (quizId: string) => Promise<void>;
  onCreateQuiz?: (quiz: StudyQuiz) => Promise<void>;
}

interface DraftQuestion {
  prompt: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  explanation: string;
}

const createEmptyQuestion = (): DraftQuestion => ({
  prompt: '',
  options: ['', '', '', ''],
  correctOptionIndex: 0,
  explanation: '',
});

export const StudyQuizzesTab: React.FC<StudyQuizzesTabProps> = ({
  quizzes,
  subjects = [],
  onTakeQuiz,
  onDeleteQuiz,
  onCreateQuiz,
}) => {
  const activeQuizzes = quizzes.filter((q) => !q.deletedAt);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([createEmptyQuestion()]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setSubjectId('');
    setQuestions([createEmptyQuestion()]);
    setFormError(null);
  };

  const handleQuestionChange = (index: number, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q, idx) => (idx === index ? { ...q, ...patch } : q)));
  };

  const handleOptionChange = (qIndex: number, optIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIndex) return q;
        const nextOptions: [string, string, string, string] = [...q.options] as [
          string,
          string,
          string,
          string,
        ];
        nextOptions[optIndex] = value;
        return { ...q, options: nextOptions };
      })
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateQuiz) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Please enter a quiz title.');
      return;
    }

    const validQuestions: StudyQuizQuestion[] = [];
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      const prompt = q.prompt.trim();
      const cleanedOpts = q.options.map((o) => o.trim()).filter(Boolean);
      if (!prompt || cleanedOpts.length < 2) {
        setFormError(`Question ${i + 1} needs a prompt and at least 2 answer options.`);
        return;
      }
      const rawCorrect = q.options[q.correctOptionIndex]?.trim();
      const mappedCorrectIdx = rawCorrect ? cleanedOpts.indexOf(rawCorrect) : 0;
      validQuestions.push({
        id: `qq_${Date.now()}_${i}`,
        prompt,
        options: cleanedOpts,
        correctOptionIndex: mappedCorrectIdx >= 0 ? mappedCorrectIdx : 0,
        explanation: q.explanation.trim() || undefined,
      });
    }

    setFormError(null);
    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const newQuiz: StudyQuiz = {
        id: `quiz_${Date.now()}`,
        userId: 'local',
        title: cleanTitle,
        subjectId: subjectId || null,
        topicId: null,
        questions: validQuestions,
        attempts: [],
        highestScore: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };
      await onCreateQuiz(newQuiz);
      resetForm();
      setIsCreateOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create quiz.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[var(--ff-accent-text)]" />
            Concept Quizzes & Performance Assessment
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Test syllabus comprehension under timed conditions and review diagnostic attempt scores
          </p>
        </div>

        {onCreateQuiz && (
          <ThemeButton
            variant="primary"
            size="sm"
            onClick={() => {
              resetForm();
              setIsCreateOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Quiz
          </ThemeButton>
        )}
      </div>

      {/* Quizzes List */}
      {activeQuizzes.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <HelpCircle className="w-10 h-10 mx-auto text-[var(--ff-text-muted)]/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No quizzes available yet.</p>
          <p>Quizzes test your problem-solving speed and concept accuracy across multiple-choice questions.</p>
          {onCreateQuiz && (
            <div className="pt-2">
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={() => {
                  resetForm();
                  setIsCreateOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Create Your First Quiz
              </ThemeButton>
            </div>
          )}
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeQuizzes.map((quiz) => {
            const attempts = quiz.attempts || [];
            const bestAttempt = attempts.reduce(
              (best, curr) => (curr.score > (best?.score ?? -1) ? curr : best),
              null as (typeof attempts)[0] | null
            );
            const bestPct =
              bestAttempt && bestAttempt.totalQuestions > 0
                ? Math.round((bestAttempt.score / bestAttempt.totalQuestions) * 100)
                : 0;

            return (
              <ThemeCard key={quiz.id} className="p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)]">
                      {quiz.subjectId || 'General'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteQuiz(quiz.id)}
                      className="text-[var(--ff-text-muted)] hover:text-rose-400 p-1"
                      title="Delete quiz"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    {quiz.title}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-[var(--ff-text-muted)] mt-3">
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {quiz.questions.length} questions
                    </span>
                  </div>

                  {bestAttempt && (
                    <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between">
                      <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5" /> Best Score:
                      </span>
                      <span className="font-bold font-mono text-emerald-400">
                        {bestAttempt.score} / {bestAttempt.totalQuestions} ({bestPct}%)
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--ff-border-color)] flex items-center justify-between">
                  <span className="text-[11px] text-[var(--ff-text-muted)]">
                    {attempts.length} attempts taken
                  </span>
                  <ThemeButton variant="primary" size="sm" onClick={() => onTakeQuiz(quiz)}>
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Take Quiz
                  </ThemeButton>
                </div>
              </ThemeCard>
            );
          })}
        </div>
      )}

      {/* Create Quiz Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-3">
              <h3 className="text-base font-bold text-[var(--ff-text-primary)]">Create New Concept Quiz</h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--ff-text-muted)] mb-1">Quiz Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Data Structures: Trees & Graphs"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[var(--ff-text-muted)] mb-1">Subject (Optional)</label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                  >
                    <option value="">General</option>
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.code || sub.id}>
                        {sub.code} — {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--ff-text-primary)] uppercase tracking-wider text-[11px]">
                    Questions ({questions.length})
                  </span>
                  <ThemeButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setQuestions((prev) => [...prev, createEmptyQuestion()])}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Question
                  </ThemeButton>
                </div>

                {questions.map((q, qIdx) => (
                  <div
                    key={qIdx}
                    className="p-4 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--ff-text-primary)]">Question {qIdx + 1}</span>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                          }
                          className="text-rose-400 hover:underline text-[11px]"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      required
                      placeholder="Enter question prompt..."
                      value={q.prompt}
                      onChange={(e) => handleQuestionChange(qIdx, { prompt: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={q.correctOptionIndex === optIdx}
                            onChange={() =>
                              handleQuestionChange(qIdx, { correctOptionIndex: optIdx })
                            }
                            title="Mark as correct answer"
                          />
                          <input
                            type="text"
                            placeholder={`Option ${optIdx + 1}${optIdx < 2 ? ' *' : ''}`}
                            value={opt}
                            onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                          />
                        </div>
                      ))}
                    </div>

                    <input
                      type="text"
                      placeholder="Explanation (optional)"
                      value={q.explanation}
                      onChange={(e) => handleQuestionChange(qIdx, { explanation: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[var(--ff-text-muted)]"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
                <ThemeButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </ThemeButton>
                <ThemeButton type="submit" variant="primary" size="sm" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Quiz'}
                </ThemeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
