import type { FocusSession } from '../types/index.ts';
import type {
  FocusStreakSummary,
  PomodoroGoal,
  PomodoroGoalType,
  PomodoroGoalMetric,
  PomodoroGoalStatus,
  SubjectFocusStat,
} from '../types/pomodoro.ts';
import {
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  getTodayDateString,
  getStartOfWeek,
  addDays,
} from './dateTime.ts';

export interface PeriodicFocusSummary {
  todayMinutes: number;
  todaySessions: number;
  weekMinutes: number;
  weekSessions: number;
  monthMinutes: number;
  monthSessions: number;
  dailyTrend: { date: string; dayLabel: string; minutes: number }[];
}

export interface GoalProgressResult {
  goalId: string;
  title: string;
  goalType: PomodoroGoalType;
  metricType: PomodoroGoalMetric;
  currentValue: number;
  targetValue: number;
  progressPct: number;
  isMet: boolean;
  status: PomodoroGoalStatus;

  // Backward-compatible properties
  dailyCurrentMinutes: number;
  dailyTargetMinutes: number;
  dailyProgressPct: number;
  weeklyCurrentMinutes: number;
  weeklyTargetMinutes: number;
  weeklyProgressPct: number;
  activeDaysThisWeek: number;
  targetDaysPerWeek: number;
  isDailyMet: boolean;
  isWeeklyMet: boolean;
}

export function getSessionFocusSeconds(s: FocusSession): number {
  if (typeof s.actualDurationSeconds === 'number' && !Number.isNaN(s.actualDurationSeconds)) {
    return Math.max(0, s.actualDurationSeconds);
  }
  if (typeof s.durationSeconds === 'number' && !Number.isNaN(s.durationSeconds)) {
    return Math.max(0, s.durationSeconds);
  }
  if (typeof s.durationMinutes === 'number' && !Number.isNaN(s.durationMinutes)) {
    return Math.max(0, s.durationMinutes * 60);
  }
  return 0;
}

/**
 * Compute focus streaks and personal records from authoritative FocusSession history
 */
export function computeFocusStreaks(
  sessions: FocusSession[],
  todayStr?: string,
  timezone: string = DEFAULT_TIMEZONE
): FocusStreakSummary {
  const today = todayStr || getTodayDateString(timezone);
  const workSessions = sessions.filter((s) => s.mode === 'work' && s.completed);

  if (workSessions.length === 0) {
    return {
      currentStreakDays: 0,
      bestStreakDays: 0,
      totalFocusSessions: 0,
      totalFocusMinutes: 0,
      longestSessionMinutes: 0,
      interruptedSessionsCount: 0,
      interruptionRatePct: 0,
      lastActiveDate: null,
    };
  }

  // Interruption stats
  let interruptedCount = 0;
  let totalMinutes = 0;
  let longestMinutes = 0;

  workSessions.forEach((s) => {
    const mins = Math.round(getSessionFocusSeconds(s) / 60);
    totalMinutes += mins;
    if (mins > longestMinutes) longestMinutes = mins;
    if (s.interrupted || (typeof s.pauseCount === 'number' && s.pauseCount > 0)) {
      interruptedCount += 1;
    }
  });

  // Extract unique active dates sorted ascending in timezone
  const uniqueDates = Array.from(
    new Set(
      workSessions
        .map((s) => {
          try {
            return formatDateInTimezone(s.startedAt, timezone);
          } catch {
            return s.startedAt.slice(0, 10);
          }
        })
        .filter((d) => Boolean(d) && /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  ).sort();

  if (uniqueDates.length === 0) {
    return {
      currentStreakDays: 0,
      bestStreakDays: 0,
      totalFocusSessions: workSessions.length,
      totalFocusMinutes: totalMinutes,
      longestSessionMinutes: longestMinutes,
      interruptedSessionsCount: interruptedCount,
      interruptionRatePct: Math.round((interruptedCount / workSessions.length) * 100),
      lastActiveDate: null,
    };
  }

  const lastActiveDate = uniqueDates[uniqueDates.length - 1];

  // Helper to parse day difference
  const getDiffDays = (d1: string, d2: string): number => {
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    return Math.round(Math.abs(t1 - t2) / (1000 * 60 * 60 * 24));
  };

  // Calculate best streak
  let bestStreak = 1;
  let runningStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const diff = getDiffDays(uniqueDates[i], uniqueDates[i - 1]);
    if (diff === 1) {
      runningStreak += 1;
      if (runningStreak > bestStreak) {
        bestStreak = runningStreak;
      }
    } else {
      runningStreak = 1;
    }
  }

  // Calculate current streak
  let currentStreak = 0;
  const daysSinceLast = getDiffDays(today, lastActiveDate);

  if (daysSinceLast <= 1) {
    currentStreak = 1;
    for (let i = uniqueDates.length - 1; i > 0; i--) {
      const diff = getDiffDays(uniqueDates[i], uniqueDates[i - 1]);
      if (diff === 1) {
        currentStreak += 1;
      } else {
        break;
      }
    }
  }

  return {
    currentStreakDays: currentStreak,
    bestStreakDays: Math.max(bestStreak, currentStreak),
    totalFocusSessions: workSessions.length,
    totalFocusMinutes: totalMinutes,
    longestSessionMinutes: longestMinutes,
    interruptedSessionsCount: interruptedCount,
    interruptionRatePct: Math.round((interruptedCount / workSessions.length) * 100),
    lastActiveDate,
  };
}

/**
 * Compute daily, weekly, and monthly focus metrics with a 7-day trend
 */
export function computePeriodicFocusStats(
  sessions: FocusSession[],
  refDate: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): PeriodicFocusSummary {
  const todayStr = formatDateInTimezone(refDate, timezone);
  const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM
  const weekStartStr = getStartOfWeek(refDate, timezone);

  const workSessions = sessions.filter((s) => s.mode === 'work' && s.completed);

  let todayMinutes = 0;
  let todaySessions = 0;
  let weekMinutes = 0;
  let weekSessions = 0;
  let monthMinutes = 0;
  let monthSessions = 0;

  workSessions.forEach((s) => {
    const dateStr = formatDateInTimezone(s.startedAt, timezone);
    const mins = Math.round(getSessionFocusSeconds(s) / 60);

    if (dateStr === todayStr) {
      todayMinutes += mins;
      todaySessions += 1;
    }
    if (dateStr >= weekStartStr && dateStr <= todayStr) {
      weekMinutes += mins;
      weekSessions += 1;
    }
    if (dateStr.startsWith(currentMonthStr)) {
      monthMinutes += mins;
      monthSessions += 1;
    }
  });

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyTrend: { date: string; dayLabel: string; minutes: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const day = new Date(refDate);
    day.setDate(refDate.getDate() - i);
    const dStr = formatDateInTimezone(day, timezone);
    const dayIndex = new Date(dStr + 'T12:00:00Z').getDay();
    const label = dayLabels[dayIndex];

    const dayMins = workSessions
      .filter((s) => formatDateInTimezone(s.startedAt, timezone) === dStr)
      .reduce((sum, s) => sum + Math.round(getSessionFocusSeconds(s) / 60), 0);

    dailyTrend.push({ date: dStr, dayLabel: label, minutes: dayMins });
  }

  return {
    todayMinutes,
    todaySessions,
    weekMinutes,
    weekSessions,
    monthMinutes,
    monthSessions,
    dailyTrend,
  };
}

/**
 * Breakdown of focus time by study subject
 */
export function computeSubjectFocusBreakdown(
  sessions: FocusSession[],
  subjects?: { code: string; name: string; color?: string }[]
): SubjectFocusStat[] {
  const workSessions = sessions.filter((s) => s.mode === 'work' && s.completed);
  if (workSessions.length === 0) return [];

  const map = new Map<string, { totalMinutes: number; sessionCount: number; completedCount: number }>();
  let grandTotalMinutes = 0;

  workSessions.forEach((s) => {
    const code = s.subjectCode || 'General Focus';
    const mins = Math.round(getSessionFocusSeconds(s) / 60);
    grandTotalMinutes += mins;

    const existing = map.get(code) || { totalMinutes: 0, sessionCount: 0, completedCount: 0 };
    existing.totalMinutes += mins;
    existing.sessionCount += 1;
    existing.completedCount += s.completed ? 1 : 0;
    map.set(code, existing);
  });

  const subjectNameMap = new Map<string, string>();
  if (subjects) {
    subjects.forEach((subj) => {
      subjectNameMap.set(subj.code, subj.name);
    });
  }

  const results: SubjectFocusStat[] = [];
  map.forEach((val, code) => {
    const pct = grandTotalMinutes > 0 ? Math.round((val.totalMinutes / grandTotalMinutes) * 100) : 0;
    results.push({
      subjectCode: code,
      totalMinutes: val.totalMinutes,
      sessionCount: val.sessionCount,
      completedCount: val.completedCount,
      percentage: pct,
    });
  });

  return results.sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/**
 * Compute progress for a PomodoroGoal against authoritative FocusSession history
 */
export function computePomodoroGoalProgress(
  sessions: FocusSession[],
  goal: PomodoroGoal,
  refDate: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): GoalProgressResult {
  const todayStr = formatDateInTimezone(refDate, timezone);
  const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM
  const weekStartStr = getStartOfWeek(refDate, timezone);

  const goalType: PomodoroGoalType = goal.goalType || 'daily';
  const metricType: PomodoroGoalMetric = goal.metricType || 'focus_minutes';
  const targetValue = Math.max(1, goal.targetValue || goal.dailyTargetMinutes || 120);

  // Filter completed work sessions matching study subject or topic linkage
  const matchingSessions = sessions.filter((s) => {
    if (s.mode !== 'work' || !s.completed) return false;

    // Strict subject linkage: if goal specifies a subject, session MUST match by subjectId
    // (or legacy subjectId-as-subjectCode when session has no subjectId), never matching untagged sessions
    if (goal.subjectId) {
      const matchesSubjectId = Boolean(s.subjectId && s.subjectId === goal.subjectId);
      const matchesLegacySubjectCode = Boolean(!s.subjectId && s.subjectCode && s.subjectCode === goal.subjectId);
      if (!matchesSubjectId && !matchesLegacySubjectCode) return false;
    }
    if (goal.subjectCode) {
      if (!s.subjectCode || s.subjectCode !== goal.subjectCode) return false;
    }
    if (goal.targetSubjectCode) {
      if (!s.subjectCode || s.subjectCode !== goal.targetSubjectCode) return false;
    }

    // Strict topic linkage: if goal specifies a topic, session MUST have an exact match
    if (goal.topicId) {
      if (!s.topicId || s.topicId !== goal.topicId) return false;
    }

    const sessionDate = formatDateInTimezone(s.startedAt, timezone);

    if (goalType === 'daily') {
      return sessionDate === todayStr;
    }
    if (goalType === 'weekly') {
      return sessionDate >= weekStartStr && sessionDate <= todayStr;
    }
    if (goalType === 'monthly') {
      return sessionDate.startsWith(currentMonthStr) && sessionDate <= todayStr;
    }
    if (goalType === 'custom') {
      const start = goal.startDate || '1970-01-01';
      const end = goal.endDate || '2099-12-31';
      return sessionDate >= start && sessionDate <= end;
    }
    return true;
  });

  let calculatedCurrentValue = 0;
  if (metricType === 'session_count') {
    calculatedCurrentValue = matchingSessions.length;
  } else {
    // Focus minutes
    calculatedCurrentValue = matchingSessions.reduce(
      (sum, s) => sum + Math.round(getSessionFocusSeconds(s) / 60),
      0
    );
  }

  const progressPct = Math.min(100, Math.round((calculatedCurrentValue / targetValue) * 100));
  const isMet = calculatedCurrentValue >= targetValue;

  // Backward compatibility calculation
  let dailyCurrent = 0;
  let weeklyCurrent = 0;
  const activeDaysThisWeekSet = new Set<string>();

  sessions
    .filter((s) => s.mode === 'work' && s.completed)
    .forEach((s) => {
      const dStr = formatDateInTimezone(s.startedAt, timezone);
      const mins = Math.round(getSessionFocusSeconds(s) / 60);
      if (dStr === todayStr) {
        dailyCurrent += mins;
      }
      if (dStr >= weekStartStr && dStr <= todayStr) {
        weeklyCurrent += mins;
        activeDaysThisWeekSet.add(dStr);
      }
    });

  const dailyTarget = goal.dailyTargetMinutes || (goalType === 'daily' ? targetValue : 120);
  const weeklyTarget = goal.weeklyTargetMinutes || (goalType === 'weekly' ? targetValue : dailyTarget * 5);

  return {
    goalId: goal.id,
    title: goal.title,
    goalType,
    metricType,
    currentValue: calculatedCurrentValue,
    targetValue,
    progressPct,
    isMet,
    status: goal.status || (isMet ? 'completed' : 'active'),

    dailyCurrentMinutes: dailyCurrent,
    dailyTargetMinutes: dailyTarget,
    dailyProgressPct: Math.round((dailyCurrent / Math.max(1, dailyTarget)) * 100),
    weeklyCurrentMinutes: weeklyCurrent,
    weeklyTargetMinutes: weeklyTarget,
    weeklyProgressPct: Math.round((weeklyCurrent / Math.max(1, weeklyTarget)) * 100),
    activeDaysThisWeek: activeDaysThisWeekSet.size,
    targetDaysPerWeek: goal.targetDaysPerWeek || 5,
    isDailyMet: dailyCurrent >= dailyTarget,
    isWeeklyMet: weeklyCurrent >= weeklyTarget,
  };
}
