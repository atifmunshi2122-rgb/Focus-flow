import type {
  FocusSession,
  Habit,
  Task,
  TimeBlock,
  UserSettings,
} from '../types/index.ts';
import type {
  StudyPlanTask,
  StudyRevision,
  StudySubject,
} from '../types/study.ts';
import {
  addDays,
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  getTodayDateString,
  parseDateString,
} from './dateTime.ts';
import { getSessionFocusSeconds } from './pomodoroAnalytics.ts';

export interface HabitStreakResult {
  currentStreak: number;
  longestStreak: number;
  weeklyCompletionRate: number; // 0 - 100
  monthlyCompletionRate: number; // 0 - 100
  isCompletedToday: boolean;
  isScheduledToday: boolean;
  totalCompletions: number;
}

export interface AllHabitsStats {
  totalActiveHabits: number;
  scheduledToday: number;
  completedToday: number;
  adherenceRateToday: number; // 0 - 100
  weeklyConsistencyRate: number; // 0 - 100
  bestCurrentStreak: number;
}

export interface ProductivityScoreBreakdown {
  taskCompletionPoints: number; // dynamically normalized task points
  focusTimePoints: number; // dynamically normalized focus points
  habitConsistencyPoints: number; // dynamically normalized habit points
  targetBonusPoints: number; // preserved backward-compatible (0)
  studyActivityPoints?: number; // dynamically normalized study points when active
  totalScore: number; // 0 - 100
  tier: 'Mastery' | 'Flow State' | 'Steady Progress' | 'Building Momentum';
  tierColor: string;
  explanation: string;
  details: {
    tasksCompletedToday: number;
    tasksDueToday: number;
    focusMinutesLogged: number;
    focusTargetMinutes: number;
    habitsCompletedToday: number;
    habitsScheduledToday: number;
    studyTasksCompletedToday?: number;
    studyTasksDueToday?: number;
    studyRevisionsCompletedToday?: number;
    studyRevisionsDueToday?: number;
    studyActivityPoints?: number;
  };
}

export interface ProductivityScoreInput {
  tasks: Task[];
  sessions: FocusSession[];
  habits: Habit[];
  settings: UserSettings | null;
  studySubjects?: StudySubject[];
  studyRevisions?: StudyRevision[];
  studyPlanTasks?: StudyPlanTask[];
  referenceDateStr?: string;
  timezone?: string;
}

export interface ProductivityAnalyticsResult {
  totalFocusMinutes: number;
  dailyFocusAverageMinutes: number;
  weeklyFocusAverageMinutes: number;
  taskCompletionRate: number; // 0 - 100
  habitConsistencyRate: number; // 0 - 100
  mostProductiveDayOfWeek: string;
  focusTrendPercent: number; // positive or negative vs previous 7-day period
  tasksTrendCount: number; // delta vs previous 7-day period
  weekdayDistribution: Array<{
    day: string;
    focusMinutes: number;
    tasksCompleted: number;
  }>;
  categoryDistribution: Array<{
    category: string;
    focusMinutes: number;
    tasksCompleted: number;
  }>;
}

export interface TimelineActivityItem {
  id: string;
  type: 'focus_session' | 'task_completed' | 'task_pending' | 'habit_completed' | 'time_block';
  title: string;
  subtitle?: string;
  timeStr: string; // "HH:MM" or "All Day"
  startMinute: number; // 0 - 1440 for sorting
  durationMinutes?: number;
  category: string;
  color: string;
  status: 'completed' | 'in_progress' | 'scheduled' | 'pending';
}

export interface DailyTimelineResult {
  date: string;
  items: TimelineActivityItem[];
  totalFocusMinutes: number;
  totalTasksCompleted: number;
  totalHabitsCompleted: number;
  totalTimeBlocks: number;
  categoryBreakdown: Record<string, number>; // minutes spent
}

// -------------------------------------------------------------
// HABIT HELPERS
// -------------------------------------------------------------

export function isHabitScheduledOnDate(habit: Habit, dateStr: string): boolean {
  if (habit.archived || habit.deletedAt) return false;
  if (habit.frequency === 'daily') return true;

  const parsed = parseDateString(dateStr);
  if (!parsed) return true;
  const d = new Date(parsed.year, parsed.month - 1, parsed.day);
  const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday

  if (habit.frequency === 'custom') {
    const allowed = habit.customDays && habit.customDays.length > 0
      ? habit.customDays
      : [0, 1, 2, 3, 4, 5, 6];
    return allowed.includes(dayOfWeek);
  }

  // Weekly frequency: targetDaysPerWeek (e.g. 3 days/week)
  return true;
}

export function computeHabitStreak(
  habit: Habit,
  referenceDateStr?: string
): HabitStreakResult {
  const todayStr = referenceDateStr || getTodayDateString(DEFAULT_TIMEZONE);
  const completedSet = new Set(habit.completedDates || []);
  const isCompletedToday = completedSet.has(todayStr);
  const isScheduledToday = isHabitScheduledOnDate(habit, todayStr);

  // Current Streak Calculation:
  // Walk backwards from today (or yesterday if today is not completed yet)
  let currentStreak = 0;
  let checkDate = isCompletedToday ? todayStr : addDays(todayStr, -1);

  // If today is scheduled and not completed, streak is not broken yet until yesterday is checked
  while (true) {
    if (isHabitScheduledOnDate(habit, checkDate)) {
      if (completedSet.has(checkDate)) {
        currentStreak++;
      } else {
        break;
      }
    }
    checkDate = addDays(checkDate, -1);
    // Boundary check: avoid runaway loop (max 730 days / 2 years)
    if (currentStreak > 730) break;
  }

  // Longest streak calculation across all completed dates
  const sortedDates = Array.from(completedSet).sort();
  let longestStreak = habit.bestStreakDays || 0;
  let runningStreak = 0;
  let prevDate: string | null = null;

  for (const d of sortedDates) {
    if (!prevDate) {
      runningStreak = 1;
    } else {
      const nextDay = addDays(prevDate, 1);
      if (d === nextDay) {
        runningStreak++;
      } else {
        runningStreak = 1;
      }
    }
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
    prevDate = d;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  // Weekly Completion Rate (Last 7 days including today)
  let scheduledLast7 = 0;
  let completedLast7 = 0;
  for (let i = 0; i < 7; i++) {
    const dStr = addDays(todayStr, -i);
    if (isHabitScheduledOnDate(habit, dStr)) {
      scheduledLast7++;
      if (completedSet.has(dStr)) completedLast7++;
    }
  }
  const weeklyCompletionRate =
    scheduledLast7 > 0 ? Math.round((completedLast7 / scheduledLast7) * 100) : 100;

  // Monthly Completion Rate (Last 30 days)
  let scheduledLast30 = 0;
  let completedLast30 = 0;
  for (let i = 0; i < 30; i++) {
    const dStr = addDays(todayStr, -i);
    if (isHabitScheduledOnDate(habit, dStr)) {
      scheduledLast30++;
      if (completedSet.has(dStr)) completedLast30++;
    }
  }
  const monthlyCompletionRate =
    scheduledLast30 > 0 ? Math.round((completedLast30 / scheduledLast30) * 100) : 100;

  return {
    currentStreak,
    longestStreak,
    weeklyCompletionRate,
    monthlyCompletionRate,
    isCompletedToday,
    isScheduledToday,
    totalCompletions: completedSet.size,
  };
}

export function computeAllHabitsStats(
  habits: Habit[],
  referenceDateStr?: string
): AllHabitsStats {
  const todayStr = referenceDateStr || getTodayDateString(DEFAULT_TIMEZONE);
  const activeHabits = habits.filter((h) => !h.deletedAt && !h.archived);

  if (activeHabits.length === 0) {
    return {
      totalActiveHabits: 0,
      scheduledToday: 0,
      completedToday: 0,
      adherenceRateToday: 0,
      weeklyConsistencyRate: 0,
      bestCurrentStreak: 0,
    };
  }

  let scheduledToday = 0;
  let completedToday = 0;
  let bestCurrentStreak = 0;
  let weeklyTotalRates = 0;

  for (const h of activeHabits) {
    const s = computeHabitStreak(h, todayStr);
    if (s.isScheduledToday) {
      scheduledToday++;
      if (s.isCompletedToday) completedToday++;
    }
    weeklyTotalRates += s.weeklyCompletionRate;
    if (s.currentStreak > bestCurrentStreak) {
      bestCurrentStreak = s.currentStreak;
    }
  }

  const adherenceRateToday =
    scheduledToday > 0 ? Math.round((completedToday / scheduledToday) * 100) : 0;
  const weeklyConsistencyRate = Math.round(weeklyTotalRates / activeHabits.length);

  return {
    totalActiveHabits: activeHabits.length,
    scheduledToday,
    completedToday,
    adherenceRateToday,
    weeklyConsistencyRate,
    bestCurrentStreak,
  };
}

// -------------------------------------------------------------
// DETERMINISTIC PRODUCTIVITY SCORE (0 - 100)
// -------------------------------------------------------------

export function computeProductivityScore(input: ProductivityScoreInput): ProductivityScoreBreakdown {
  const tz = input.timezone || input.settings?.timezone || DEFAULT_TIMEZONE;
  const targetDateStr = input.referenceDateStr || getTodayDateString(tz);
  const todayStr = getTodayDateString(tz);
  const isEvaluatingToday = targetDateStr === todayStr;

  // -----------------------------------------------------------
  // 1. FOCUS ATTAINMENT (Always Active)
  // -----------------------------------------------------------
  const focusGoal = Math.max(15, input.settings?.dailyFocusGoalMinutes || 100);
  const validSessions = (input.sessions || []).filter((s) => {
    if (s.mode !== 'work') return false;
    if (!s.completed) return false;
    if (s.status === 'interrupted' || s.interrupted === true) return false;
    if (!s.startedAt) return false;
    return formatDateInTimezone(s.startedAt, tz) === targetDateStr;
  });

  const totalValidFocusSeconds = validSessions.reduce(
    (acc, s) => acc + getSessionFocusSeconds(s),
    0
  );
  const focusMinutesLogged = Math.round(totalValidFocusSeconds / 60);
  const R_focus = Math.min(1.0, totalValidFocusSeconds / (focusGoal * 60));
  const focusNumerator = totalValidFocusSeconds;

  // -----------------------------------------------------------
  // 2. TASK EXECUTION
  // -----------------------------------------------------------
  const activeTasks = (input.tasks || []).filter((t) => !t.deletedAt);
  const dueTasksToday = activeTasks.filter((t) => t.dueDate === targetDateStr);
  const N_due = dueTasksToday.length;

  const completedTodayTasks = activeTasks.filter((t) => {
    if (t.status !== 'completed' || !t.completedAt) return false;
    return formatDateInTimezone(t.completedAt, tz) === targetDateStr;
  });
  const C_completed_today = completedTodayTasks.length;

  // Task category activation: N_due > 0 OR C_completed_today > 0
  const isTaskActive = N_due > 0 || C_completed_today > 0;

  // Mutually exclusive classification of completed tasks
  let C_due = 0;
  let C_no_due = 0;
  let C_overdue = 0;
  let C_future = 0;

  for (const t of completedTodayTasks) {
    if (t.dueDate === targetDateStr) {
      C_due++;
    } else if (!t.dueDate) {
      C_no_due++;
    } else if (t.dueDate < targetDateStr) {
      C_overdue++;
    } else {
      C_future++;
    }
  }

  const C_adhoc = C_no_due + C_overdue + C_future;

  let R_task = 0;
  if (isTaskActive) {
    if (N_due > 0) {
      R_task = Math.min(1.0, C_due / N_due + 0.2 * C_adhoc);
    } else {
      R_task = Math.min(1.0, 0.2 * C_adhoc);
    }
  }
  const taskNumerator = C_completed_today;

  // -----------------------------------------------------------
  // 3. HABIT CONSISTENCY
  // -----------------------------------------------------------
  const activeHabits = (input.habits || []).filter((h) => !h.deletedAt && !h.archived);

  // Daily and custom scheduled habits (weekly habits excluded from daily denominator)
  const scheduledHabits = activeHabits.filter((h) => {
    if (h.frequency === 'daily') return true;
    if (h.frequency === 'custom' && Array.isArray(h.customDays) && h.customDays.length > 0) {
      const parsed = parseDateString(targetDateStr);
      if (!parsed) return false;
      const d = new Date(parsed.year, parsed.month - 1, parsed.day);
      return h.customDays.includes(d.getDay());
    }
    return false;
  });

  const N_habit = scheduledHabits.length;
  const completedHabits = scheduledHabits.filter((h) =>
    (h.completedDates || []).includes(targetDateStr)
  );
  const C_habit = completedHabits.length;

  const isHabitActive = N_habit > 0;
  const R_habit = isHabitActive ? Math.min(1.0, C_habit / N_habit) : 0;
  const habitNumerator = C_habit;

  // -----------------------------------------------------------
  // 4. STUDY OS ACTIVITY
  // -----------------------------------------------------------
  const activeSubjects = (input.studySubjects || []).filter((s) => !s.deletedAt);
  const hasActiveSubject = activeSubjects.length > 0;

  // A. Revision Component (Only for targetDate === todayStr)
  let RevActive = false;
  let R_rev = 0;
  let C_rev = 0;
  let N_rev = 0;

  if (hasActiveSubject && isEvaluatingToday) {
    const activeRevisions = (input.studyRevisions || []).filter((r) => !r.deletedAt);
    const completedRevs = activeRevisions.filter((r) => r.lastStudiedAt === todayStr);
    const pendingRevs = activeRevisions.filter(
      (r) =>
        r.status !== 'mastered' &&
        r.lastStudiedAt !== todayStr &&
        Boolean(r.nextRevisionAt) &&
        r.nextRevisionAt <= todayStr
    );
    C_rev = completedRevs.length;
    N_rev = C_rev + pendingRevs.length;
    RevActive = N_rev > 0;
    R_rev = RevActive ? Math.min(1.0, C_rev / N_rev) : 0;
  }

  // B. Plan Task Component
  let PlanActive = false;
  let R_plan = 0;
  let C_plan_due = 0;
  let C_plan_adhoc = 0;
  let N_plan_due = 0;

  if (hasActiveSubject) {
    const activePlanTasks = (input.studyPlanTasks || []).filter((p) => !p.deletedAt);
    const scheduledPlanTasks = activePlanTasks.filter(
      (p) => p.scheduledDate === targetDateStr && p.status !== 'skipped'
    );
    N_plan_due = scheduledPlanTasks.length;

    const completedPlanTasks = activePlanTasks.filter((p) => {
      if (p.status !== 'completed' || !p.completedAt) return false;
      return formatDateInTimezone(p.completedAt, tz) === targetDateStr;
    });

    for (const p of completedPlanTasks) {
      if (p.scheduledDate === targetDateStr) {
        C_plan_due++;
      } else {
        C_plan_adhoc++;
      }
    }

    PlanActive = N_plan_due > 0 || C_plan_adhoc > 0;
    if (PlanActive) {
      if (N_plan_due > 0) {
        R_plan = Math.min(1.0, C_plan_due / N_plan_due + 0.25 * C_plan_adhoc);
      } else {
        R_plan = Math.min(1.0, 0.25 * C_plan_adhoc);
      }
    }
  }

  // C. Overall Study Blend
  let isStudyActive = false;
  let R_study = 0;

  if (hasActiveSubject) {
    if (isEvaluatingToday) {
      if (RevActive && PlanActive) {
        isStudyActive = true;
        R_study = 0.5 * R_rev + 0.5 * R_plan;
      } else if (RevActive) {
        isStudyActive = true;
        R_study = R_rev;
      } else if (PlanActive) {
        isStudyActive = true;
        R_study = R_plan;
      }
    } else {
      // Historical: Revisions strictly excluded
      if (PlanActive) {
        isStudyActive = true;
        R_study = R_plan;
      }
    }
  }
  const studyNumerator = (isEvaluatingToday ? C_rev : 0) + C_plan_due + C_plan_adhoc;

  // -----------------------------------------------------------
  // 5. NORMALIZED COMPOSITE SCORING
  // -----------------------------------------------------------
  const w_focus = 35; // Focus is always active
  const w_task = isTaskActive ? (isStudyActive ? 30 : 35) : 0;
  const w_habit = isHabitActive ? 20 : 0;
  const w_study = isStudyActive ? 15 : 0;

  const W_active = w_focus + w_task + w_habit + w_study;

  const hasAnyCompletedActivity =
    focusNumerator > 0 ||
    taskNumerator > 0 ||
    habitNumerator > 0 ||
    (isStudyActive && studyNumerator > 0);

  let focusTimePoints = 0;
  let taskCompletionPoints = 0;
  let habitConsistencyPoints = 0;
  let studyActivityPoints = 0;
  const targetBonusPoints = 0; // Preserved finite and non-negative
  let totalScore = 0;

  if (hasAnyCompletedActivity && W_active > 0) {
    focusTimePoints = Math.round((w_focus * R_focus / W_active) * 100);
    taskCompletionPoints = w_task > 0 ? Math.round((w_task * R_task / W_active) * 100) : 0;
    habitConsistencyPoints = w_habit > 0 ? Math.round((w_habit * R_habit / W_active) * 100) : 0;
    studyActivityPoints = w_study > 0 ? Math.round((w_study * R_study / W_active) * 100) : 0;

    // Composite total matches exact sum of displayed component points
    const sumPoints = focusTimePoints + taskCompletionPoints + habitConsistencyPoints + studyActivityPoints + targetBonusPoints;
    totalScore = Math.min(100, Math.max(0, sumPoints));
  }

  let tier: ProductivityScoreBreakdown['tier'] = 'Building Momentum';
  let tierColor = '#f59e0b'; // Amber

  if (totalScore >= 90) {
    tier = 'Mastery';
    tierColor = '#10b981'; // Emerald
  } else if (totalScore >= 75) {
    tier = 'Flow State';
    tierColor = '#6366f1'; // Indigo
  } else if (totalScore >= 50) {
    tier = 'Steady Progress';
    tierColor = '#3b82f6'; // Blue
  }

  const studySummary = isStudyActive
    ? `, Study OS (${studyActivityPoints}/${Math.round((w_study / W_active) * 100)} pts: ${Math.round(R_study * 100)}% execution)`
    : '';

  const explanation =
    `Score is calculated deterministically: Focus Goal (${focusTimePoints}/${Math.round((w_focus / W_active) * 100)} pts: ${focusMinutesLogged}/${focusGoal} min), ` +
    `Task Execution (${taskCompletionPoints}/${Math.round((w_task / W_active) * 100)} pts: ${C_completed_today}/${N_due || 'ad-hoc'} done), ` +
    `Habits (${habitConsistencyPoints}/${Math.round((w_habit / W_active) * 100)} pts: ${C_habit}/${N_habit || 'none'} done)` +
    `${studySummary}.`;

  return {
    taskCompletionPoints,
    focusTimePoints,
    habitConsistencyPoints,
    targetBonusPoints,
    studyActivityPoints,
    totalScore,
    tier,
    tierColor,
    explanation,
    details: {
      tasksCompletedToday: C_completed_today,
      tasksDueToday: N_due,
      focusMinutesLogged,
      focusTargetMinutes: focusGoal,
      habitsCompletedToday: C_habit,
      habitsScheduledToday: N_habit,
      studyTasksCompletedToday: C_plan_due + C_plan_adhoc,
      studyTasksDueToday: N_plan_due,
      studyRevisionsCompletedToday: isEvaluatingToday ? C_rev : 0,
      studyRevisionsDueToday: isEvaluatingToday ? N_rev : 0,
      studyActivityPoints,
    },
  };
}

// -------------------------------------------------------------
// PRODUCTIVITY ANALYTICS & INSIGHTS
// -------------------------------------------------------------

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function computeProductivityAnalytics(input: {
  tasks: Task[];
  sessions: FocusSession[];
  habits: Habit[];
  timeBlocks: TimeBlock[];
  settings: UserSettings | null;
  referenceDateStr?: string;
}): ProductivityAnalyticsResult {
  const todayStr = input.referenceDateStr || getTodayDateString(DEFAULT_TIMEZONE);
  const activeTasks = input.tasks.filter((t) => !t.deletedAt);
  const completedTasks = activeTasks.filter((t) => t.status === 'completed');
  const validSessions = input.sessions.filter((s) => s.completed && (s.mode === 'work' || !s.mode));

  // 1. Total Focus Time
  const totalFocusMinutes = validSessions.reduce(
    (acc, s) => acc + (s.durationMinutes || Math.round((s.durationSeconds || 0) / 60)),
    0
  );

  // 2. Daily & Weekly Averages (Last 30 days active days)
  const sessionDaysSet = new Set<string>();
  validSessions.forEach((s) => {
    if (s.startedAt) sessionDaysSet.add(s.startedAt.slice(0, 10));
  });
  const distinctDaysCount = Math.max(1, sessionDaysSet.size);
  const dailyFocusAverageMinutes = Math.round(totalFocusMinutes / distinctDaysCount);
  const weeklyFocusAverageMinutes = Math.round(dailyFocusAverageMinutes * 7);

  // 3. Task Completion Rate
  const taskCompletionRate =
    activeTasks.length > 0 ? Math.round((completedTasks.length / activeTasks.length) * 100) : 0;

  // 4. Habit Consistency Rate (across all active habits over last 30 days)
  const habitStats = computeAllHabitsStats(input.habits, todayStr);
  const habitConsistencyRate = habitStats.weeklyConsistencyRate;

  // 5. Weekday Aggregations (0 = Sun, 6 = Sat)
  const weekdayScores: Record<number, { focusMinutes: number; tasksCompleted: number }> = {
    0: { focusMinutes: 0, tasksCompleted: 0 },
    1: { focusMinutes: 0, tasksCompleted: 0 },
    2: { focusMinutes: 0, tasksCompleted: 0 },
    3: { focusMinutes: 0, tasksCompleted: 0 },
    4: { focusMinutes: 0, tasksCompleted: 0 },
    5: { focusMinutes: 0, tasksCompleted: 0 },
    6: { focusMinutes: 0, tasksCompleted: 0 },
  };

  validSessions.forEach((s) => {
    if (s.startedAt) {
      const parsed = parseDateString(s.startedAt.slice(0, 10));
      if (parsed) {
        const d = new Date(parsed.year, parsed.month - 1, parsed.day);
        const dayIdx = d.getDay();
        const mins = s.durationMinutes || Math.round((s.durationSeconds || 0) / 60);
        weekdayScores[dayIdx].focusMinutes += mins;
      }
    }
  });

  completedTasks.forEach((t) => {
    const dateStr = t.completedAt ? t.completedAt.slice(0, 10) : t.dueDate;
    if (dateStr) {
      const parsed = parseDateString(dateStr);
      if (parsed) {
        const d = new Date(parsed.year, parsed.month - 1, parsed.day);
        const dayIdx = d.getDay();
        weekdayScores[dayIdx].tasksCompleted += 1;
      }
    }
  });

  let bestDayIdx = 1; // Default to Monday
  let maxDayScore = -1;
  for (let i = 0; i < 7; i++) {
    // Score combines minutes and completed tasks (1 task ~ 25 min)
    const combinedScore = weekdayScores[i].focusMinutes + weekdayScores[i].tasksCompleted * 25;
    if (combinedScore > maxDayScore) {
      maxDayScore = combinedScore;
      bestDayIdx = i;
    }
  }
  const mostProductiveDayOfWeek = WEEKDAY_NAMES[bestDayIdx];

  const weekdayDistribution = [1, 2, 3, 4, 5, 6, 0].map((idx) => ({
    day: WEEKDAY_NAMES[idx].slice(0, 3),
    focusMinutes: weekdayScores[idx].focusMinutes,
    tasksCompleted: weekdayScores[idx].tasksCompleted,
  }));

  // 6. Category Breakdown
  const catMap: Record<string, { focusMinutes: number; tasksCompleted: number }> = {};
  const getCat = (name?: string) => name || 'General';

  validSessions.forEach((s) => {
    // If session has linked task, find task category
    let cat = 'Focus';
    if (s.taskId) {
      const match = activeTasks.find((t) => t.id === s.taskId);
      if (match?.category) cat = match.category;
    }
    const mins = s.durationMinutes || Math.round((s.durationSeconds || 0) / 60);
    if (!catMap[cat]) catMap[cat] = { focusMinutes: 0, tasksCompleted: 0 };
    catMap[cat].focusMinutes += mins;
  });

  completedTasks.forEach((t) => {
    const cat = getCat(t.category);
    if (!catMap[cat]) catMap[cat] = { focusMinutes: 0, tasksCompleted: 0 };
    catMap[cat].tasksCompleted += 1;
  });

  const categoryDistribution = Object.entries(catMap).map(([category, data]) => ({
    category,
    focusMinutes: data.focusMinutes,
    tasksCompleted: data.tasksCompleted,
  })).sort((a, b) => b.focusMinutes - a.focusMinutes);

  // 7. Trend vs Previous 7 Days
  const thisWeekStart = addDays(todayStr, -6);
  const prevWeekStart = addDays(todayStr, -13);
  const prevWeekEnd = addDays(todayStr, -7);

  let thisWeekFocus = 0;
  let prevWeekFocus = 0;
  let thisWeekTasks = 0;
  let prevWeekTasks = 0;

  validSessions.forEach((s) => {
    if (!s.startedAt) return;
    const dStr = s.startedAt.slice(0, 10);
    const mins = s.durationMinutes || Math.round((s.durationSeconds || 0) / 60);
    if (dStr >= thisWeekStart && dStr <= todayStr) {
      thisWeekFocus += mins;
    } else if (dStr >= prevWeekStart && dStr <= prevWeekEnd) {
      prevWeekFocus += mins;
    }
  });

  completedTasks.forEach((t) => {
    const dStr = t.completedAt ? t.completedAt.slice(0, 10) : t.dueDate;
    if (!dStr) return;
    if (dStr >= thisWeekStart && dStr <= todayStr) {
      thisWeekTasks++;
    } else if (dStr >= prevWeekStart && dStr <= prevWeekEnd) {
      prevWeekTasks++;
    }
  });

  const focusTrendPercent =
    prevWeekFocus > 0
      ? Math.round(((thisWeekFocus - prevWeekFocus) / prevWeekFocus) * 100)
      : thisWeekFocus > 0
      ? 100
      : 0;

  const tasksTrendCount = thisWeekTasks - prevWeekTasks;

  return {
    totalFocusMinutes,
    dailyFocusAverageMinutes,
    weeklyFocusAverageMinutes,
    taskCompletionRate,
    habitConsistencyRate,
    mostProductiveDayOfWeek,
    focusTrendPercent,
    tasksTrendCount,
    weekdayDistribution,
    categoryDistribution,
  };
}

// -------------------------------------------------------------
// DAILY PRODUCTIVITY TIMELINE BUILDER
// -------------------------------------------------------------

function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m < 10 ? `0${m}` : m;
  return `${displayH}:${displayM} ${ampm}`;
}

export function buildDailyProductivityTimeline(input: {
  dateStr: string;
  tasks: Task[];
  sessions: FocusSession[];
  habits: Habit[];
  timeBlocks: TimeBlock[];
}): DailyTimelineResult {
  const { dateStr } = input;
  const items: TimelineActivityItem[] = [];
  const categoryBreakdown: Record<string, number> = {};

  // 1. Focus Sessions on this date
  const dateSessions = input.sessions.filter(
    (s) => s.completed && s.startedAt && s.startedAt.slice(0, 10) === dateStr
  );
  let totalFocusMinutes = 0;

  dateSessions.forEach((s) => {
    const dateObj = new Date(s.startedAt);
    const startMinute = isNaN(dateObj.getTime())
      ? 540 // fallback 9:00 AM
      : dateObj.getHours() * 60 + dateObj.getMinutes();
    const duration = s.durationMinutes || Math.round((s.durationSeconds || 0) / 60) || 25;
    totalFocusMinutes += duration;

    const cat = s.taskTitle ? 'Task Focus' : 'Deep Work';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + duration;

    items.push({
      id: `session_${s.id}`,
      type: 'focus_session',
      title: s.taskTitle || 'Focus Session',
      subtitle: `${duration} min • ${s.mode === 'work' || !s.mode ? 'Pomodoro Work' : 'Break'}`,
      timeStr: minutesToTimeString(startMinute),
      startMinute,
      durationMinutes: duration,
      category: cat,
      color: '#6366f1',
      status: 'completed',
    });
  });

  // 2. Scheduled Time Blocks on this date
  const dateBlocks = input.timeBlocks.filter(
    (tb) => !tb.deletedAt && tb.date === dateStr
  );

  dateBlocks.forEach((tb) => {
    const duration = Math.max(15, (tb.endMinute || 0) - (tb.startMinute || 0)) || 60;
    const cat = tb.category || 'Planning';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + duration;

    items.push({
      id: `block_${tb.id}`,
      type: 'time_block',
      title: tb.title,
      subtitle: tb.notes || `${duration} min scheduled block`,
      timeStr: minutesToTimeString(tb.startMinute),
      startMinute: tb.startMinute,
      durationMinutes: duration,
      category: cat,
      color: '#3b82f6',
      status: tb.completed ? 'completed' : 'scheduled',
    });
  });

  // 3. Tasks Completed on this date
  const completedTodayTasks = input.tasks.filter(
    (t) =>
      !t.deletedAt &&
      t.status === 'completed' &&
      ((t.completedAt && t.completedAt.slice(0, 10) === dateStr) ||
        (!t.completedAt && t.dueDate === dateStr))
  );

  completedTodayTasks.forEach((t, idx) => {
    let startMinute = 600 + idx * 30; // default 10:00 AM + stagger
    if (t.completedAt) {
      const d = new Date(t.completedAt);
      if (!isNaN(d.getTime())) {
        startMinute = d.getHours() * 60 + d.getMinutes();
      }
    }
    const cat = t.category || 'Tasks';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (t.estimatedPomodoros * 25 || 25);

    items.push({
      id: `task_done_${t.id}`,
      type: 'task_completed',
      title: t.title,
      subtitle: `Completed • Priority: ${t.priority}`,
      timeStr: minutesToTimeString(startMinute),
      startMinute,
      durationMinutes: (t.estimatedPomodoros || 1) * 25,
      category: cat,
      color: '#10b981',
      status: 'completed',
    });
  });

  // 4. Pending Tasks Due on this date
  const pendingDueTasks = input.tasks.filter(
    (t) =>
      !t.deletedAt &&
      t.status !== 'completed' &&
      t.dueDate === dateStr
  );

  pendingDueTasks.forEach((t, idx) => {
    const startMinute = 1020 + idx * 30; // 5:00 PM evening deadline slot
    items.push({
      id: `task_pending_${t.id}`,
      type: 'task_pending',
      title: t.title,
      subtitle: `Due today • Priority: ${t.priority}`,
      timeStr: 'Due Today',
      startMinute,
      durationMinutes: (t.estimatedPomodoros || 1) * 25,
      category: t.category || 'Tasks',
      color: '#f59e0b',
      status: 'pending',
    });
  });

  // 5. Habits Completed on this date
  const completedHabits = input.habits.filter(
    (h) => !h.deletedAt && (h.completedDates || []).includes(dateStr)
  );

  completedHabits.forEach((h, idx) => {
    let startMinute = 480 + idx * 20; // 8:00 AM morning habit slot
    if (h.reminderTime) {
      const parts = h.reminderTime.split(':');
      if (parts.length === 2) {
        startMinute = Number(parts[0]) * 60 + Number(parts[1]);
      }
    }
    const cat = h.category || 'Habits';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 15;

    items.push({
      id: `habit_${h.id}_${dateStr}`,
      type: 'habit_completed',
      title: h.title,
      subtitle: `${h.frequency} habit • Completed`,
      timeStr: minutesToTimeString(startMinute),
      startMinute,
      durationMinutes: 15,
      category: cat,
      color: h.color || '#06b6d4',
      status: 'completed',
    });
  });

  // Sort items by startMinute ascending
  items.sort((a, b) => a.startMinute - b.startMinute);

  return {
    date: dateStr,
    items,
    totalFocusMinutes,
    totalTasksCompleted: completedTodayTasks.length,
    totalHabitsCompleted: completedHabits.length,
    totalTimeBlocks: dateBlocks.length,
    categoryBreakdown,
  };
}

// -------------------------------------------------------------
// OVERDUE TASK RESCHEDULING & CARRY FORWARD
// -------------------------------------------------------------

export function getOverdueTasks(tasks: Task[], todayStr?: string): Task[] {
  const currentToday = todayStr || getTodayDateString(DEFAULT_TIMEZONE);
  return tasks.filter(
    (t) =>
      !t.deletedAt &&
      t.status !== 'completed' &&
      Boolean(t.dueDate) &&
      (t.dueDate as string) < currentToday
  );
}
