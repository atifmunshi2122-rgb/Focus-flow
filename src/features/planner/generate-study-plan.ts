/**
 * FocusFlow & Finance — Deterministic Automatic Study Schedule Generator (Phase 7)
 *
 * Schedules pending tasks into available time windows while respecting:
 * - Existing calendar conflicts
 * - Manually locked sessions (never moved)
 * - Per-day target limits (in user's configured timezone)
 * - Breaks between study sessions
 * - Optional task splitting (allowDeadlineSplitting)
 */

import type {
  AvailableStudyWindow,
  PlannedStudySession,
  StudyPlannerSettings,
  StudyTask,
} from './types.ts';
import { calculateTaskPriority } from './task-priority.ts';
import { DEFAULT_TIMEZONE, formatDateInTimezone } from '../../lib/dateTime.ts';

export interface PlannerResult {
  sessions: PlannedStudySession[];
  unscheduled: {
    taskId: string;
    reason: string;
  }[];
}

interface GeneratePlanOptions {
  tasks: StudyTask[];
  windows: AvailableStudyWindow[];
  settings: StudyPlannerSettings;
  now: number;
  conflicts?: AvailableStudyWindow[];
  lockedSessions?: PlannedStudySession[];
  timezone?: string;
}

export function generateStudyPlan({
  tasks,
  windows,
  settings,
  now,
  conflicts = [],
  lockedSessions = [],
  timezone = DEFAULT_TIMEZONE,
}: GeneratePlanOptions): PlannerResult {
  // Stable sort by priority score descending, then createdAt ascending
  const pending = tasks
    .filter((task) => !task.completed)
    .map((task, index) => ({
      task,
      index,
      priority: calculateTaskPriority(task, now),
    }))
    .sort((a, b) => {
      if (b.priority.score !== a.priority.score) {
        return b.priority.score - a.priority.score;
      }
      return a.index - b.index;
    });

  // Preserve manually locked sessions untouched
  const sessions: PlannedStudySession[] = lockedSessions.map((s) => ({ ...s, locked: true }));
  const unscheduled: PlannerResult['unscheduled'] = [];
  const sortedWindows = [...windows].sort((a, b) => a.start - b.start);

  // Track scheduled minutes per calendar day in user's configured timezone
  const dailyMinutesByDay = new Map<string, number>();
  for (const locked of sessions) {
    const dayKey = formatDateInTimezone(new Date(locked.startAt), timezone);
    dailyMinutesByDay.set(dayKey, (dailyMinutesByDay.get(dayKey) || 0) + locked.durationMinutes);
  }

  for (const item of pending) {
    let remaining = Math.max(0, Math.round(item.task.estimatedMinutes || 0));

    if (remaining === 0) {
      unscheduled.push({
        taskId: item.task.id,
        reason: 'Task has no valid estimated duration',
      });
      continue;
    }

    let scheduledAny = false;

    for (const window of sortedWindows) {
      if (remaining <= 0) break;

      const dayKey = formatDateInTimezone(new Date(window.start), timezone);
      const usedToday = dailyMinutesByDay.get(dayKey) || 0;
      let allowedByDailyTarget = settings.dailyTargetMinutes - usedToday;
      if (allowedByDailyTarget <= 0) continue;

      let cursor = Math.max(window.start, now);
      if (cursor >= window.end) continue;

      const existingInWindow = sessions
        .filter((s) => s.startAt < window.end && s.endAt > window.start)
        .sort((a, b) => a.startAt - b.startAt);

      const occupied = [
        ...conflicts,
        ...existingInWindow.map((s) => ({ start: s.startAt, end: s.endAt })),
      ].sort((a, b) => a.start - b.start);

      const tryScheduleSlot = (slotStart: number, slotEnd: number) => {
        if (remaining <= 0 || allowedByDailyTarget <= 0) return slotStart;
        const freeMinutes = Math.floor((slotEnd - slotStart) / 60000);
        if (freeMinutes <= 0) return slotStart;

        if (!settings.allowDeadlineSplitting && freeMinutes < remaining) {
          return slotStart;
        }

        const duration = Math.max(
          0,
          Math.min(
            remaining,
            settings.allowDeadlineSplitting ? settings.sessionDurationMinutes : remaining,
            freeMinutes,
            allowedByDailyTarget
          )
        );

        if (duration <= 0) return slotStart;

        const endAt = slotStart + duration * 60000;
        sessions.push({
          id: `${item.task.id}-${slotStart}`,
          taskId: item.task.id,
          startAt: slotStart,
          endAt,
          durationMinutes: duration,
          reason: item.priority.reasons.join('; '),
          generated: true,
        });

        remaining -= duration;
        allowedByDailyTarget -= duration;
        dailyMinutesByDay.set(dayKey, (dailyMinutesByDay.get(dayKey) || 0) + duration);
        scheduledAny = true;

        return endAt + settings.breakDurationMinutes * 60000;
      };

      for (const block of occupied) {
        if (block.end <= cursor) continue;
        if (block.start > cursor) {
          cursor = tryScheduleSlot(cursor, Math.min(block.start, window.end));
        }
        cursor = Math.max(cursor, block.end);
      }

      if (cursor < window.end && remaining > 0 && allowedByDailyTarget > 0) {
        tryScheduleSlot(cursor, window.end);
      }
    }

    if (remaining > 0) {
      unscheduled.push({
        taskId: item.task.id,
        reason: scheduledAny
          ? `${remaining} minutes could not fit into available time`
          : 'No available conflict-free time window within daily target',
      });
    }
  }

  return {
    sessions: sessions.sort((a, b) => a.startAt - b.startAt),
    unscheduled,
  };
}

