/**
 * Pomodoro Type Definitions (Phase 17)
 * Multiple Goals + Custom Presets + Session Integrity + Secure Persistence
 */

export type PomodoroAlertTone = 'bell' | 'digital' | 'chime' | 'bowl' | 'gentle';

export type PomodoroGoalType = 'daily' | 'weekly' | 'monthly' | 'custom';
export type PomodoroGoalMetric = 'focus_minutes' | 'session_count';
export type PomodoroGoalStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface PomodoroGoal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  goalType?: PomodoroGoalType;
  metricType?: PomodoroGoalMetric;
  targetValue?: number; // minutes or session count
  currentValue?: number; // derived from authoritative FocusSession
  subjectId?: string | null;
  subjectCode?: string | null;
  topicId?: string | null;
  startDate?: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  status?: PomodoroGoalStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  deletedAt?: string | null;

  // Backward-compatible fields for existing code/tests
  dailyTargetMinutes?: number;
  weeklyTargetMinutes?: number;
  targetDaysPerWeek?: number;
  isActive?: boolean;
  targetSubjectCode?: string;
}

export interface PomodoroPreset {
  id: string;
  userId: string;
  name: string;
  description?: string;
  workDuration: number; // minutes, 1-180
  focusDuration?: number; // alias for workDuration
  shortBreakDuration: number; // minutes, 1-60
  longBreakDuration: number; // minutes, 1-90
  longBreakInterval: number; // 1-12
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  soundVolume: number; // 0-100
  isDefault: boolean;
  isSystemPreset: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PomodoroInterruption {
  id: string;
  userId: string;
  sessionId: string;
  eventType: 'pause' | 'resume';
  occurredAt: string;
  reason: string | null;
}

export interface PomodoroSettings {
  id?: string;
  userId: string;
  focusDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  alertTone: PomodoroAlertTone;
  soundVolume: number;
  ambientPreset: string;
  ambientVolume: number;
  desktopNotifications: boolean;
  tickingSoundEnabled?: boolean;
  selectedPresetId?: string | null;
  updatedAt: string;
}

export interface PomodoroAmbientPreset {
  id: string;
  userId: string;
  name: string;
  soundType: 'rain' | 'drone' | 'ocean' | 'cafe' | 'white_noise' | 'forest';
  volume: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FocusStreakSummary {
  currentStreakDays: number;
  bestStreakDays: number;
  totalFocusSessions: number;
  totalFocusMinutes: number;
  longestSessionMinutes: number;
  interruptedSessionsCount: number;
  interruptionRatePct: number;
  lastActiveDate: string | null;
}

export interface SubjectFocusStat {
  subjectCode: string;
  totalMinutes: number;
  sessionCount: number;
  completedCount: number;
  percentage: number;
}
