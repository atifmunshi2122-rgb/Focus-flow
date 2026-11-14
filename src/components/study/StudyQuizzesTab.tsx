import React from 'react';
import { StudyQuiz } from '../../types/study.ts';
import { ThemeCard, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { HelpCircle, Award, Play, Trash2, Clock } from 'lucide-react';

interface StudyQuizzesTabProps {
  quizzes: StudyQuiz[];
  onTakeQuiz: (quiz: StudyQuiz) => void;
  onDeleteQuiz: (quizId: string) => Promise<void>;
}

export const StudyQuizzesTab: React.FC<StudyQuizzesTabProps> = ({
  quizzes,
  onTakeQuiz,
  onDeleteQuiz,
}) => {
  const activeQuizzes = quizzes.filter((q) => !q.deletedAt);

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
      </div>

      {/* Quizzes List */}
      {activeQuizzes.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <HelpCircle className="w-10 h-10 mx-auto text-[var(--ff-text-muted)]/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No quizzes available yet.</p>
          <p>Quizzes test your problem-solving speed and concept accuracy across multiple-choice questions.</p>
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeQuizzes.map((quiz) => {
            const attempts = quiz.attempts || [];
            const bestAttempt = attempts.reduce(
              (best, curr) => (curr.score > (best?.score ?? -1) ? curr : best),
              null as (typeof attempts)[0] | null
            );

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
                        {bestAttempt.score} / {bestAttempt.totalQuestions} ({Math.round((bestAttempt.score / bestAttempt.totalQuestions) * 100)}%)
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
    </div>
  );
};
