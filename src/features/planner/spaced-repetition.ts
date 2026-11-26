/**
 * FocusFlow & Finance — Deterministic Spaced Repetition Engine (Phase 7)
 */

export type RecallRating = 'again' | 'hard' | 'good' | 'easy';

export interface RevisionState {
  topicId: string;
  repetition: number;
  intervalDays: number;
  nextReviewAt: number;
  lastReviewedAt?: number;
  status: 'due' | 'scheduled' | 'mastered';
}

export const DEFAULT_REVISION_INTERVALS: Record<RecallRating, number[]> = {
  again: [1],
  hard: [2, 3, 4, 5],
  good: [4, 7, 10, 14, 21],
  easy: [7, 14, 21, 30, 45],
};

export function scheduleRevision(
  previous: RevisionState,
  rating: RecallRating,
  now: number,
  customIntervals: Record<RecallRating, number[]> = DEFAULT_REVISION_INTERVALS
): RevisionState {
  // Prevent accidental duplicate submission within 30 seconds
  if (previous.lastReviewedAt && now - previous.lastReviewedAt < 30_000) {
    return previous;
  }

  const nextRepetition = rating === 'again' ? 0 : previous.repetition + 1;
  const ratingIntervals = customIntervals[rating] || DEFAULT_REVISION_INTERVALS[rating];
  const index = Math.min(nextRepetition, ratingIntervals.length - 1);
  const intervalDays = ratingIntervals[index];
  const nextReviewAt = now + intervalDays * 86400000;

  return {
    ...previous,
    repetition: nextRepetition,
    intervalDays,
    nextReviewAt,
    lastReviewedAt: now,
    status: nextRepetition >= 5 && rating === 'easy' ? 'mastered' : 'scheduled',
  };
}

