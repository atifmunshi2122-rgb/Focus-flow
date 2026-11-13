import type {
  FocusSession,
  Habit,
  Task,
  TimeBlock,
  UserSettings,
} from '../types/index.ts';
import {
  addDays,
  DEFAULT_TIMEZONE,
  getTodayDateString,
  parseDateString,
} from './dateTime.ts';

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
  taskCompletionPoints: number; // max 35
  focusTimePoints: number; // max 35
  habitConsistencyPoints: number; // max 20
  targetBonusPoints: number; // max 10
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
  };
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
      adherenceRateToday: 100,
      weeklyConsistencyRate: 100,
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
    scheduledToday > 0 ? Math.round((completedToday / scheduledToday) * 100) : 100;
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

export function computeProductivityScore(input: {
  tasks: Task[];
  sessions: FocusSession[];
  habits: Habit[];
  settings: UserSettings | null;
  referenceDateStr?: string;
}): ProductivityScoreBreakdown {
  const todayStr = input.referenceDateStr || getTodayDateString(DEFAULT_TIMEZONE);
  const activeTasks = input.tasks.filter((t) => !t.deletedAt);
  const focusGoal = Math.max(15, input.settings?.dailyFocusGoalMinutes || 100);

  // 1. Task Completion (0 - 35 points)
  // Identify tasks due today or completed today
  const tasksDueOrCompletedToday = activeTasks.filter(
    (t) =>
      t.dueDate === todayStr ||
      (t.completedAt && t.completedAt.slice(0, 10) === todayStr)
  );

  let taskCompletionPoints = 35;
  let tasksCompletedToday = 0;
  const tasksDueToday = tasksDueOrCompletedToday.length;

  if (tasksDueToday > 0) {
    tasksCompletedToday = tasksDueOrCompletedToday.filter(
      (t) => t.status === 'completed'
    ).length;
    taskCompletionPoints = Math.round((tasksCompletedToday / tasksDueToday) * 35);
  } else {
    // If no specific tasks were scheduled for today, check tasks completed today across all
    const anyDoneToday = activeTasks.filter(
      (t) => t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) === todayStr
    ).length;
    tasksCompletedToday = anyDoneToday;
    const pendingTotal = activeTasks.filter((t) => t.status !== 'completed').length;
    if (pendingTotal === 0) {
      taskCompletionPoints = 35; // clean slate
    } else {
      taskCompletionPoints = Math.min(35, Math.round(anyDoneToday * 12));
    }
  }

  // 2. Focus Time Attainment (0 - 35 points)
  const todaySessions = input.sessions.filter(
    (s) =>
      s.completed &&
      (s.mode === 'work' || !s.mode) &&
      s.startedAt &&
      s.startedAt.slice(0, 10) === todayStr
  );
  const focusMinutesLogged = todaySessions.reduce(
    (acc, s) => acc + (s.durationMinutes || Math.round((s.durationSeconds || 0) / 60)),
    0
  );
  const focusRatio = Math.min(1.0, focusMinutesLogged / focusGoal);
  const focusTimePoints = Math.round(focusRatio * 35);

  // 3. Habit Consistency (0 - 20 points)
  const activeHabits = input.habits.filter((h) => !h.deletedAt && !h.archived);
  let habitConsistencyPoints = 20;
  let habitsScheduledToday = 0;
  let habitsCompletedToday = 0;

  if (activeHabits.length > 0) {
    const scheduled = activeHabits.filter((h) => isHabitScheduledOnDate(h, todayStr));
    habitsScheduledToday = scheduled.length;
    if (habitsScheduledToday > 0) {
      habitsCompletedToday = scheduled.filter((h) =>
        (h.completedDates || []).includes(todayStr)
      ).length;
      habitConsistencyPoints = Math.round((habitsCompletedToday / habitsScheduledToday) * 20);
    } else {
      habitConsistencyPoints = 20;
    }
  }

  // 4. Target Bonus & Momentum (0 - 10 points)
  let targetBonusPoints = 0;
  if (focusMinutesLogged >= focusGoal) targetBonusPoints += 4;
  if (tasksDueToday > 0 && tasksCompletedToday >= tasksDueToday) targetBonusPoints += 3;
  if (habitsScheduledToday > 0 && habitsCompletedToday >= habitsScheduledToday) targetBonusPoints += 3;
  if (targetBonusPoints > 10) targetBonusPoints = 10;

  const totalScore = Math.min(
    100,
    Math.max(0, taskCompletionPoints + focusTimePoints + habitConsistencyPoints + targetBonusPoints)
  );

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

  const explanation =
    `Score is calculated deterministically: Task Completion (${taskCompletionPoints}/35 pts: ${tasksCompletedToday}/${tasksDueToday || 'all'} done), ` +
    `Focus Goal (${focusTimePoints}/35 pts: ${focusMinutesLogged}/${focusGoal} min), ` +
    `Habits (${habitConsistencyPoints}/20 pts: ${habitsCompletedToday}/${habitsScheduledToday || 'all'} done), ` +
    `plus Momentum Bonus (${targetBonusPoints}/10 pts).`;

  return {
    taskCompletionPoints,
    focusTimePoints,
    habitConsistencyPoints,
    targetBonusPoints,
    totalScore,
    tier,
    tierColor,
    explanation,
    details: {
      tasksCompletedToday,
      tasksDueToday,
      focusMinutesLogged,
      focusTargetMinutes: focusGoal,
      habitsCompletedToday,
      habitsScheduledToday,
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
