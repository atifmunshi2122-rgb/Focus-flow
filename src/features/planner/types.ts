/**
 * FocusFlow & Finance — AI-Free Smart Study Planner Types (Phase 7)
 */

export type StudyPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface StudyTask {
  id: string;
  title: string;
  subjectId?: string;
  priority: StudyPriority;
  estimatedMinutes: number;
  deadline?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  completed: boolean;
  createdAt: number;
}

export interface AvailableStudyWindow {
  start: number;
  end: number;
}

export interface PlannedStudySession {
  id: string;
  taskId: string;
  startAt: number;
  endAt: number;
  durationMinutes: number;
  reason: string;
  generated: boolean;
  locked?: boolean;
}

export interface StudyPlannerSettings {
  dailyTargetMinutes: number;
  preferredStartHour: number;
  preferredEndHour: number;
  sessionDurationMinutes: number;
  breakDurationMinutes: number;
  autoSchedule: boolean;
  allowDeadlineSplitting: boolean;
}

export const defaultStudyPlannerSettings: StudyPlannerSettings = {
  dailyTargetMinutes: 180,
  preferredStartHour: 9,
  preferredEndHour: 21,
  sessionDurationMinutes: 45,
  breakDurationMinutes: 10,
  autoSchedule: true,
  allowDeadlineSplitting: true,
};

export function sanitizeStudyPlannerSettings(raw: unknown): StudyPlannerSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...defaultStudyPlannerSettings };
  }
  const obj = raw as Record<string, unknown>;
  const clamp = (val: unknown, min: number, max: number, fallback: number) =>
    typeof val === 'number' && Number.isFinite(val) ? Math.min(max, Math.max(min, Math.round(val))) : fallback;

  return {
    dailyTargetMinutes: clamp(obj.dailyTargetMinutes, 15, 720, defaultStudyPlannerSettings.dailyTargetMinutes),
    preferredStartHour: clamp(obj.preferredStartHour, 0, 22, defaultStudyPlannerSettings.preferredStartHour),
    preferredEndHour: clamp(obj.preferredEndHour, 1, 23, defaultStudyPlannerSettings.preferredEndHour),
    sessionDurationMinutes: clamp(obj.sessionDurationMinutes, 15, 120, defaultStudyPlannerSettings.sessionDurationMinutes),
    breakDurationMinutes: clamp(obj.breakDurationMinutes, 0, 45, defaultStudyPlannerSettings.breakDurationMinutes),
    autoSchedule:
      typeof obj.autoSchedule === 'boolean' ? obj.autoSchedule : defaultStudyPlannerSettings.autoSchedule,
    allowDeadlineSplitting:
      typeof obj.allowDeadlineSplitting === 'boolean'
        ? obj.allowDeadlineSplitting
        : defaultStudyPlannerSettings.allowDeadlineSplitting,
  };
}

export interface ScheduleChangeRecord {
  id: string;
  taskId: string;
  originalStartAt: number;
  newStartAt: number;
  reason: string;
  source: 'auto_planner' | 'assisted_reschedule' | 'manual_edit';
  timestamp: number;
}

