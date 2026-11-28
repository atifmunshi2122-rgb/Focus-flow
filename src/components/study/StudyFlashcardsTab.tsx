import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { StudyFlashcard, StudySubject } from '../../types/study.ts';
import { ThemeCard, ThemeButton } from '../ui/ThemePrimitives.tsx';
import {
  Sparkles,
  Plus,
  Trash2,
  Bookmark,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface StudyFlashcardsTabProps {
  flashcards: StudyFlashcard[];
  subjects: StudySubject[];
  onOpenAddFlashcard: () => void;
  onReviewFlashcard: (cardId: string, difficulty: 'easy' | 'medium' | 'hard') => Promise<void>;
  onToggleBookmark: (card: StudyFlashcard) => Promise<void>;
  onDeleteFlashcard: (cardId: string) => Promise<void>;
}

export const StudyFlashcardsTab: React.FC<StudyFlashcardsTabProps> = ({
  flashcards,
  subjects,
  onOpenAddFlashcard,
  onReviewFlashcard,
  onToggleBookmark,
  onDeleteFlashcard,
}) => {
  const { showToast } = useApp();
  const [activeIdx, setActiveIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [reviewing, setReviewing] = useState(false);

  const activeCards = flashcards.filter((c) => {
    if (c.deletedAt) return false;
    if (selectedSubject !== 'all' && c.subjectId !== selectedSubject) return false;
    return true;
  });

  useEffect(() => {
    if (activeCards.length === 0) {
      if (activeIdx !== 0) setActiveIdx(0);
    } else if (activeIdx >= activeCards.length) {
      setActiveIdx(activeCards.length - 1);
      setFlipped(false);
    }
  }, [activeCards.length, activeIdx]);

  const safeIdx = activeCards.length > 0 ? Math.min(activeIdx, activeCards.length - 1) : 0;
  const currentCard = activeCards[safeIdx] || null;

  const handleNext = () => {
    setFlipped(false);
    setActiveIdx((prev) => (prev + 1) % Math.max(1, activeCards.length));
  };

  const handlePrev = () => {
    setFlipped(false);
    setActiveIdx((prev) => (prev - 1 + activeCards.length) % Math.max(1, activeCards.length));
  };

  const handleDifficultyReview = async (difficulty: 'easy' | 'medium' | 'hard') => {
    if (!currentCard) return;
    setReviewing(true);
    try {
      await onReviewFlashcard(currentCard.id, difficulty);
      setFlipped(false);
      handleNext();
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : 'Failed to save flashcard review',
        'error'
      );
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Active Recall Flashcard Decks
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Test immediate retrieval, rate difficulty, and cement concepts with spaced review
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedSubject}
            onChange={(e) => {
              setSelectedSubject(e.target.value);
              setActiveIdx(0);
              setFlipped(false);
            }}
            className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>

          <ThemeButton variant="primary" size="sm" onClick={onOpenAddFlashcard}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Flashcard
          </ThemeButton>
        </div>
      </div>

      {/* Main Flashcard Studio */}
      {activeCards.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <Sparkles className="w-10 h-10 mx-auto text-indigo-400/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No flashcards found.</p>
          <p>Create active recall question & answer cards for your formulas, theorems, and definitions.</p>
          <ThemeButton variant="secondary" size="sm" onClick={onOpenAddFlashcard}>
            Create Flashcard
          </ThemeButton>
        </ThemeCard>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Deck Counter & Controls */}
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] px-2">
            <span>
              Card <strong className="text-[var(--ff-text-primary)]">{safeIdx + 1}</strong> of {activeCards.length}
            </span>
            <div className="flex items-center gap-2">
              {currentCard && (
                <>
                  <button
                    type="button"
                    onClick={() => onToggleBookmark(currentCard)}
                    className={`p-1.5 transition-colors ${
                      currentCard.isBookmarked ? 'text-amber-400' : 'text-[var(--ff-text-muted)] hover:text-amber-400'
                    }`}
                    title={currentCard.isBookmarked ? 'Bookmarked' : 'Add bookmark'}
                  >
                    <Bookmark className="w-4 h-4" fill={currentCard.isBookmarked ? 'currentColor' : 'none'} />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteFlashcard(currentCard.id)}
                    className="p-1.5 text-[var(--ff-text-muted)] hover:text-rose-400 transition-colors"
                    title="Delete flashcard"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Interactive Flip Card Container */}
          {currentCard && (
            <div
              role="button"
              tabIndex={0}
              aria-label={flipped ? 'Show question side of flashcard' : 'Flip flashcard to reveal answer'}
              onClick={() => setFlipped(!flipped)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setFlipped((f) => !f);
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  handleNext();
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  handlePrev();
                }
              }}
              className="cursor-pointer min-h-[280px] p-8 rounded-3xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col justify-between select-none relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ff-accent)]"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)]">
                    {currentCard.subjectId || 'General'}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-[var(--ff-text-muted)]">
                    {flipped ? 'Answer' : 'Question'} (Click to Flip)
                  </span>
                </div>

                {!flipped ? (
                  <div className="space-y-3 py-6">
                    <h3 className="text-lg sm:text-xl font-bold text-[var(--ff-text-primary)] text-center leading-snug">
                      {currentCard.question}
                    </h3>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="p-4 rounded-2xl bg-[var(--ff-surface-muted)] text-sm sm:text-base font-medium text-[var(--ff-text-primary)] text-center leading-relaxed">
                      {currentCard.answer}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center pt-4 border-t border-[var(--ff-border-color)] text-[11px] text-[var(--ff-text-muted)] flex items-center justify-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{flipped ? 'Click anywhere to return to question' : 'Click card to reveal answer'}</span>
              </div>
            </div>
          )}

          {/* Spaced Repetition Recall Buttons (shown when flipped) */}
          {flipped && currentCard && (
            <div className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] animate-in fade-in slide-in-from-bottom-2">
              <span className="text-xs text-[var(--ff-text-muted)] font-medium mr-2">Rate Recall:</span>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => handleDifficultyReview('hard')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition-all"
              >
                🔴 Hard (Repeat Soon)
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => handleDifficultyReview('medium')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-white transition-all"
              >
                🟡 Medium (Good)
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => handleDifficultyReview('easy')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all"
              >
                🟢 Easy (Mastered)
              </button>
            </div>
          )}

          {/* Navigation Prev / Next */}
          <div className="flex items-center justify-between pt-2">
            <ThemeButton variant="ghost" size="sm" onClick={handlePrev}>
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous Card
            </ThemeButton>
            <ThemeButton variant="ghost" size="sm" onClick={handleNext}>
              Next Card
              <ChevronRight className="w-4 h-4 ml-1" />
            </ThemeButton>
          </div>
        </div>
      )}
    </div>
  );
};
