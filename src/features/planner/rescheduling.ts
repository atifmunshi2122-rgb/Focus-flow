/**
 * FocusFlow & Finance — Missed Task Assisted Rescheduling Engine (Phase 7)
 */

import type {
  AvailableStudyWindow,
  PlannedStudySession,
  StudyTask,
} from './types.ts';

export interface RescheduleSuggestion {
  taskId: string;
  previousStartAt: number;
  suggestedStartAt: number;
  suggestedEndAt: number;
  reason: string;
  requiresApproval: boolean;
}

export function suggestReschedule(
  task: StudyTask,
  missedSession: PlannedStudySession,
  availableWindows: AvailableStudyWindow[],
  conflicts: PlannedStudySession[],
  now: number,
  requiresApproval = true
): RescheduleSuggestion | null {
  if (task.completed || missedSession.locked) {
    return null;
  }

  const duration = missedSession.durationMinutes * 60000;
  const sortedWindows = [...availableWindows].sort((a, b) => a.start - b.start);

  for (const window of sortedWindows) {
    const candidate = Math.max(window.start, now);
    const end = candidate + duration;

    if (end > window.end) continue;
    if (task.deadline && end > task.deadline) continue;

    const collision = conflicts.some(
      (session) => candidate < session.endAt && end > session.startAt
    );
    if (collision) continue;

    return {
      taskId: task.id,
      previousStartAt: missedSession.startAt,
      suggestedStartAt: candidate,
      suggestedEndAt: end,
      reason:
        'The original session was missed. This is the next available conflict-free study window.',
      requiresApproval,
    };
  }

  return null;
}

