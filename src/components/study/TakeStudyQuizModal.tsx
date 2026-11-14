import React, { useState, useEffect } from 'react';
import { ThemeModal, ThemeButton } from '../ui/ThemePrimitives.tsx';
import { StudyQuiz } from '../../types/study.ts';
import { CheckCircle2, XCircle, Award, Timer, RotateCcw } from 'lucide-react';

interface TakeStudyQuizModalProps {
  quiz: StudyQuiz | null;
  isOpen: boolean;
  onClose: () => void;
  onRecordAttempt: (
    quizId: string,
    attempt: { score: number; totalQuestions: number; timeTakenSeconds: number }
  ) => Promise<void>;
}

export const TakeStudyQuizModal: React.FC<TakeStudyQuizModalProps> = ({
  quiz,
  isOpen,
  onClose,
  onRecordAttempt,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && quiz) {
      setSelectedAnswers({});
      setSubmitted(false);
      setStartTime(Date.now());
      setElapsedSeconds(0);
    }
  }, [isOpen, quiz]);

  useEffect(() => {
    if (!isOpen || submitted) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, submitted, startTime]);

  if (!quiz) return null;

  const questions = quiz.questions || [];

  const handleSelectOption = (qIdx: number, optIdx: number) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctOptionIndex) {
        correct++;
      }
    });
    return correct;
  };

  const handleSubmit = async () => {
    const score = calculateScore();
    setSubmitted(true);
    setSubmitting(true);
    try {
      await onRecordAttempt(quiz.id, {
        score,
        totalQuestions: questions.length,
        timeTakenSeconds: elapsedSeconds,
      });
    } catch (err) {
      console.error('Failed to record attempt:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const score = calculateScore();
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Quiz: ${quiz.title}`}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-xs">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-[var(--ff-accent)]" />
            <span className="font-mono font-medium">
              Time: {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <span className="text-[var(--ff-text-muted)]">
            Answered: {Object.keys(selectedAnswers).length}/{questions.length}
          </span>
          {submitted && (
            <div className="flex items-center gap-1 font-semibold text-emerald-400">
              <Award className="w-4 h-4" />
              <span>Score: {score}/{questions.length} ({pct}%)</span>
            </div>
          )}
        </div>

        {/* Questions list */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {questions.map((q, qIdx) => {
            const userAnswer = selectedAnswers[qIdx];
            const isCorrect = userAnswer === q.correctOptionIndex;

            return (
              <div
                key={q.id || `q_${qIdx}`}
                className="p-4 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[var(--ff-text-primary)]">
                    Q{qIdx + 1}. {q.prompt}
                  </span>
                  {submitted && (
                    <span>
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = userAnswer === optIdx;
                    let optStyle = 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent)]/50';

                    if (submitted) {
                      if (optIdx === q.correctOptionIndex) {
                        optStyle = 'border-emerald-500 bg-emerald-500/10 text-emerald-300 font-semibold';
                      } else if (isSelected) {
                        optStyle = 'border-red-500 bg-red-500/10 text-red-300';
                      }
                    } else if (isSelected) {
                      optStyle = 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)] font-semibold';
                    }

                    return (
                      <button
                        type="button"
                        key={optIdx}
                        disabled={submitted}
                        onClick={() => handleSelectOption(qIdx, optIdx)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs flex items-center justify-between ${optStyle}`}
                      >
                        <span>{opt}</span>
                        {isSelected && !submitted && (
                          <span className="w-2 h-2 rounded-full bg-[var(--ff-accent)]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {submitted && q.explanation && (
                  <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
                    💡 <span className="font-medium">Explanation:</span> {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer controls */}
        <div className="flex justify-between items-center pt-2 border-t border-[var(--ff-border-color)]">
          {submitted ? (
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedAnswers({});
                setSubmitted(false);
                setStartTime(Date.now());
                setElapsedSeconds(0);
              }}
              className="flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry Quiz
            </ThemeButton>
          ) : (
            <span className="text-xs text-[var(--ff-text-muted)]">
              Answer all questions before submitting.
            </span>
          )}

          <div className="flex gap-2">
            <ThemeButton variant="ghost" onClick={onClose}>
              {submitted ? 'Close' : 'Cancel'}
            </ThemeButton>
            {!submitted && (
              <ThemeButton
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting || Object.keys(selectedAnswers).length === 0}
              >
                {submitting ? 'Submitting...' : 'Submit Answers'}
              </ThemeButton>
            )}
          </div>
        </div>
      </div>
    </ThemeModal>
  );
};

