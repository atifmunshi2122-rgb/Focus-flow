import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHabitStreak,
  computeAllHabitsStats,
  isHabitScheduledOnDate,
  computeProductivityScore,
  computeProductivityAnalytics,
  buildDailyProductivityTimeline,
  getOverdueTasks,
} from '../src/lib/productivityIntelligence.ts';
import { FocusSession, Habit, Task, TimeBlock, UserSettings } from '../src/types/index.ts';

test('Phase 4 — Habit Streak & Schedule Calculations', () => {
  const referenceDate = '2026-11-14'; // Saturday (day 6)

  const dailyHabit: Habit = {
    id: 'h_daily',
    userId: 'u1',
    title: 'Daily Meditation',
    category: 'Mindfulness',
    color: '#10b981',
    frequency: 'daily',
    targetDaysPerWeek: 7,
    completedDates: ['2026-11-12', '2026-11-13', '2026-11-14'],
    bestStreakDays: 5,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-14T00:00:00Z',
  };

  assert.equal(isHabitScheduledOnDate(dailyHabit, '2026-11-14'), true);
  const streakResult = computeHabitStreak(dailyHabit, referenceDate);
  assert.equal(streakResult.isCompletedToday, true);
  assert.equal(streakResult.isScheduledToday, true);
  assert.equal(streakResult.currentStreak, 3);
  assert.equal(streakResult.longestStreak, 5); // respects bestStreakDays

  // Custom Weekdays Habit (Mon-Fri: days 1, 2, 3, 4, 5)
  const weekdayHabit: Habit = {
    id: 'h_work',
    userId: 'u1',
    title: 'Code Review',
    category: 'Deep Work',
    color: '#6366f1',
    frequency: 'custom',
    customDays: [1, 2, 3, 4, 5], // Mon to Fri
    targetDaysPerWeek: 5,
    completedDates: ['2026-11-13'], // Friday
    bestStreakDays: 2,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-14T00:00:00Z',
  };

  // 2026-11-14 is Saturday -> should NOT be scheduled
  assert.equal(isHabitScheduledOnDate(weekdayHabit, '2026-11-14'), false);
  // 2026-11-13 is Friday -> SHOULD be scheduled
  assert.equal(isHabitScheduledOnDate(weekdayHabit, '2026-11-13'), true);

  // All habits stats
  const allStats = computeAllHabitsStats([dailyHabit, weekdayHabit], referenceDate);
  assert.equal(allStats.totalActiveHabits, 2);
  assert.equal(allStats.scheduledToday, 1); // only dailyHabit is scheduled on Saturday
  assert.equal(allStats.completedToday, 1);
  assert.equal(allStats.adherenceRateToday, 100);
});

test('Phase 4 — Deterministic Productivity Score (0 - 100)', () => {
  const referenceDate = '2026-11-14';

  const mockSettings: UserSettings = {
    userId: 'u1',
    currency: 'INR',
    theme: 'dark',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    dailyFocusGoalMinutes: 100,
    weeklyFocusGoalMinutes: 500,
    monthlyBudgetPaise: 5000000,
    notificationPrefs: {
      enabled: true,
      taskDeadlines: true,
      upcomingBills: true,
      billLeadDays: 3,
      overdueBills: true,
      focusCompletion: true,
      dailyFocusGoal: true,
      budgetWarnings: true,
      budgetWarningPercent: 80,
      syncFailures: true,
    },
    keyboardShortcutsEnabled: true,
  };

  const tasks: Task[] = [
    {
      id: 't1',
      userId: 'u1',
      title: 'Finish API Docs',
      description: 'API documentation',
      priority: 'high',
      status: 'completed',
      dueDate: '2026-11-14',
      completedAt: '2026-11-14T10:00:00Z',
      category: 'Engineering',
      order: 1,
      estimatedPomodoros: 2,
      completedPomodoros: 2,
      recurrence: 'none',
      subtasks: [],
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
    },
    {
      id: 't2',
      userId: 'u1',
      title: 'Submit Expense Report',
      description: 'Expense submission',
      priority: 'medium',
      status: 'completed',
      dueDate: '2026-11-14',
      completedAt: '2026-11-14T11:00:00Z',
      category: 'Finance',
      order: 2,
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      recurrence: 'none',
      subtasks: [],
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T11:00:00Z',
    },
  ];

  const sessions: FocusSession[] = [
    {
      id: 's1',
      userId: 'u1',
      taskId: 't1',
      taskTitle: 'Finish API Docs',
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      completed: true,
      startedAt: '2026-11-14T09:00:00Z',
      endedAt: '2026-11-14T09:50:00Z',
    },
    {
      id: 's2',
      userId: 'u1',
      taskId: 't1',
      taskTitle: 'Finish API Docs',
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      completed: true,
      startedAt: '2026-11-14T10:10:00Z',
      endedAt: '2026-11-14T11:00:00Z',
    },
  ];

  const habits: Habit[] = [
    {
      id: 'h1',
      userId: 'u1',
      title: 'Hydration & Stretch',
      category: 'Health',
      color: '#10b981',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: ['2026-11-14'],
      bestStreakDays: 10,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-14T00:00:00Z',
    },
  ];

  const scoreResult = computeProductivityScore({
    tasks,
    sessions,
    habits,
    settings: mockSettings,
    referenceDateStr: referenceDate,
  });

  // 100% tasks done (2/2) -> 35 pts
  assert.equal(scoreResult.taskCompletionPoints, 35);
  // 100 mins logged of 100 mins target -> 35 pts
  assert.equal(scoreResult.focusTimePoints, 35);
  // 1/1 habits done -> 20 pts
  assert.equal(scoreResult.habitConsistencyPoints, 20);
  // Targets hit -> 10 pts momentum bonus
  assert.equal(scoreResult.targetBonusPoints, 10);
  // Total = 100
  assert.equal(scoreResult.totalScore, 100);
  assert.equal(scoreResult.tier, 'Mastery');
  assert.ok(scoreResult.explanation.includes('35/35'));

  // Test zero activity boundary
  const zeroScore = computeProductivityScore({
    tasks: [{ ...tasks[0], status: 'todo', completedAt: undefined }],
    sessions: [],
    habits: [{ ...habits[0], completedDates: [] }],
    settings: mockSettings,
    referenceDateStr: referenceDate,
  });
  assert.equal(zeroScore.taskCompletionPoints, 0);
  assert.equal(zeroScore.focusTimePoints, 0);
  assert.equal(zeroScore.habitConsistencyPoints, 0);
  assert.equal(zeroScore.totalScore, 0);
  assert.equal(zeroScore.tier, 'Building Momentum');
});

test('Phase 4 — Productivity Analytics & Trend Insights', () => {
  const referenceDate = '2026-11-14';

  const tasks: Task[] = [
    {
      id: 't_done',
      userId: 'u1',
      title: 'Architecture Review',
      description: 'System design',
      priority: 'high',
      status: 'completed',
      dueDate: '2026-11-14',
      completedAt: '2026-11-14T12:00:00Z',
      category: 'Engineering',
      order: 1,
      estimatedPomodoros: 2,
      completedPomodoros: 2,
      recurrence: 'none',
      subtasks: [],
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-14T12:00:00Z',
    },
  ];

  const sessions: FocusSession[] = [
    {
      id: 's_prev',
      userId: 'u1',
      taskId: 't_done',
      mode: 'work',
      durationMinutes: 60,
      durationSeconds: 3600,
      completed: true,
      startedAt: '2026-11-14T09:00:00Z',
      endedAt: '2026-11-14T10:00:00Z',
    },
  ];

  const habits: Habit[] = [];
  const timeBlocks: TimeBlock[] = [];

  const analytics = computeProductivityAnalytics({
    tasks,
    sessions,
    habits,
    timeBlocks,
    settings: null,
    referenceDateStr: referenceDate,
  });

  assert.equal(analytics.totalFocusMinutes, 60);
  assert.equal(analytics.taskCompletionRate, 100);
  assert.equal(typeof analytics.mostProductiveDayOfWeek, 'string');
  assert.ok(analytics.weekdayDistribution.length === 7);
});

test('Phase 4 — Daily Timeline & Overdue Carry Forward', () => {
  const todayStr = '2026-11-14';

  const tasks: Task[] = [
    {
      id: 't_overdue',
      userId: 'u1',
      title: 'Overdue Task from Yesterday',
      description: 'Carry forward test',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-11-13',
      category: 'General',
      order: 1,
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      recurrence: 'none',
      subtasks: [],
      createdAt: '2026-11-10T00:00:00Z',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 't_today',
      userId: 'u1',
      title: 'Current Day Task',
      description: 'Today task',
      priority: 'medium',
      status: 'completed',
      dueDate: todayStr,
      completedAt: `${todayStr}T14:30:00Z`,
      category: 'Engineering',
      order: 2,
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      recurrence: 'none',
      subtasks: [],
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: `${todayStr}T14:30:00Z`,
    },
  ];

  // Overdue detection
  const overdue = getOverdueTasks(tasks, todayStr);
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].id, 't_overdue');

  // Timeline building
  const timeline = buildDailyProductivityTimeline({
    dateStr: todayStr,
    tasks,
    sessions: [],
    habits: [],
    timeBlocks: [
      {
        id: 'tb1',
        userId: 'u1',
        title: 'Deep Work Block',
        date: todayStr,
        startMinute: 600, // 10:00 AM
        endMinute: 660,   // 11:00 AM
        category: 'Engineering',
        completed: true,
        createdAt: '2026-11-14T00:00:00Z',
        updatedAt: '2026-11-14T00:00:00Z',
      },
    ],
  });

  assert.equal(timeline.date, todayStr);
  assert.ok(timeline.items.length >= 2); // 1 completed task + 1 time block
  assert.equal(timeline.totalTimeBlocks, 1);
  assert.equal(timeline.totalTasksCompleted, 1);
});
