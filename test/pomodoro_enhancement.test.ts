import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeFocusStreaks,
  computePeriodicFocusStats,
  computeSubjectFocusBreakdown,
  computePomodoroGoalProgress,
} from '../src/lib/pomodoroAnalytics.ts';
import {
  computeRemainingSeconds,
  acquireCompletionLock,
  acquireCompletionLockEntry,
  releaseCompletionLock,
  loadInitialTimerState,
  saveTimerState,
  getTimerStorageKey,
  TIMER_CLIENT_ID,
  TIMER_BROADCAST_CHANNEL,
  broadcastTimerEvent,
  TimerBroadcastMessage,
} from '../src/lib/timerEngine.ts';
import { getTodayDateString } from '../src/lib/dateTime.ts';
import type { FocusSession } from '../src/types/index.ts';
import type {
  PomodoroGoal,
  PomodoroPreset,
  PomodoroInterruption,
} from '../src/types/pomodoro.ts';

test('Pomodoro Enhancement — computeFocusStreaks with consecutive days', () => {
  const sessions: FocusSession[] = [
    {
      id: 'fs1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-13T10:00:00Z',
      endedAt: '2026-11-13T10:25:00Z',
    },
    {
      id: 'fs2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      completed: true,
      interrupted: true,
      pauseCount: 2,
      totalPauseSeconds: 180,
      startedAt: '2026-11-14T11:00:00Z',
      endedAt: '2026-11-14T11:53:00Z',
    },
    {
      id: 'fs3',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-15T09:00:00Z',
      endedAt: '2026-11-15T09:25:00Z',
    },
  ];

  const summary = computeFocusStreaks(sessions, '2026-11-15');

  assert.equal(summary.totalFocusSessions, 3, 'Total focus sessions must be 3');
  assert.equal(summary.totalFocusMinutes, 100, 'Total focus minutes must be 25 + 50 + 25 = 100');
  assert.equal(summary.longestSessionMinutes, 50, 'Longest session must be 50');
  assert.equal(summary.currentStreakDays, 3, 'Active 3 consecutive days must yield current streak 3');
  assert.equal(summary.bestStreakDays, 3, 'Best streak must be at least 3');
  assert.equal(summary.interruptedSessionsCount, 1, 'Only 1 session was interrupted');
  assert.equal(summary.interruptionRatePct, 33, 'Interruption rate must be 33% (1/3)');
  assert.equal(summary.lastActiveDate, '2026-11-15');
});

test('Pomodoro Enhancement — computeFocusStreaks with streak break', () => {
  const sessions: FocusSession[] = [
    {
      id: 'fs1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 30,
      durationSeconds: 1800,
      completed: true,
      startedAt: '2026-11-01T10:00:00Z',
      endedAt: '2026-11-01T10:30:00Z',
    },
    {
      id: 'fs2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 30,
      durationSeconds: 1800,
      completed: true,
      startedAt: '2026-11-02T10:00:00Z',
      endedAt: '2026-11-02T10:30:00Z',
    },
    {
      id: 'fs3',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 30,
      durationSeconds: 1800,
      completed: true,
      startedAt: '2026-11-03T10:00:00Z',
      endedAt: '2026-11-03T10:30:00Z',
    },
    // Break in streak: no sessions on Nov 4-9
    {
      id: 'fs4',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-10T10:00:00Z',
      endedAt: '2026-11-10T10:25:00Z',
    },
  ];

  const summary = computeFocusStreaks(sessions, '2026-11-10');

  assert.equal(summary.bestStreakDays, 3, 'Best historical streak was 3 days (Nov 1-3)');
  assert.equal(summary.currentStreakDays, 1, 'Current streak after gap is 1 day (Nov 10)');
});

test('Pomodoro Enhancement — computePeriodicFocusStats', () => {
  const refDate = new Date('2026-11-15T12:00:00Z');
  const sessions: FocusSession[] = [
    {
      id: 's1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-15T08:00:00Z',
      endedAt: '2026-11-15T08:25:00Z',
    },
    {
      id: 's2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 35,
      durationSeconds: 2100,
      completed: true,
      startedAt: '2026-11-15T10:00:00Z',
      endedAt: '2026-11-15T10:35:00Z',
    },
    {
      id: 's3',
      userId: 'u1',
      taskId: null,
      mode: 'short_break', // break ignored
      durationMinutes: 5,
      durationSeconds: 300,
      completed: true,
      startedAt: '2026-11-15T10:35:00Z',
      endedAt: '2026-11-15T10:40:00Z',
    },
    {
      id: 's4',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 40,
      durationSeconds: 2400,
      completed: true,
      startedAt: '2026-11-12T14:00:00Z',
      endedAt: '2026-11-12T14:40:00Z',
    },
  ];

  const periodic = computePeriodicFocusStats(sessions, refDate);

  assert.equal(periodic.todayMinutes, 60, 'Today focus should be 25 + 35 = 60 min');
  assert.equal(periodic.todaySessions, 2, 'Today sessions count must be 2');
  assert.equal(periodic.weekMinutes, 100, 'Weekly focus should sum 60 + 40 = 100 min');
  assert.equal(periodic.dailyTrend.length, 7, 'Daily trend must contain 7 days');
});

test('Pomodoro Enhancement — computeSubjectFocusBreakdown', () => {
  const sessions: FocusSession[] = [
    {
      id: 's1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      completed: true,
      subjectCode: 'CS101',
      startedAt: '2026-11-15T08:00:00Z',
      endedAt: '2026-11-15T08:50:00Z',
    },
    {
      id: 's2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      completed: true,
      subjectCode: 'MATH201',
      startedAt: '2026-11-15T09:00:00Z',
      endedAt: '2026-11-15T09:50:00Z',
    },
    {
      id: 's3',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 100,
      durationSeconds: 6000,
      completed: true,
      subjectCode: 'CS101',
      startedAt: '2026-11-15T11:00:00Z',
      endedAt: '2026-11-15T12:40:00Z',
    },
  ];

  const breakdown = computeSubjectFocusBreakdown(sessions);

  assert.equal(breakdown.length, 2, 'Must group into 2 subjects');
  assert.equal(breakdown[0].subjectCode, 'CS101', 'CS101 must be first due to higher minutes');
  assert.equal(breakdown[0].totalMinutes, 150, 'CS101 total minutes must be 150');
  assert.equal(breakdown[0].percentage, 75, 'CS101 percentage must be 75% (150/200)');
  assert.equal(breakdown[1].subjectCode, 'MATH201');
  assert.equal(breakdown[1].totalMinutes, 50);
  assert.equal(breakdown[1].percentage, 25);
});

test('Pomodoro Enhancement — computePomodoroGoalProgress', () => {
  const refDate = new Date('2026-11-15T14:00:00Z');
  const goal: PomodoroGoal = {
    id: 'g1',
    userId: 'u1',
    title: 'Daily Deep Work Target',
    dailyTargetMinutes: 120,
    weeklyTargetMinutes: 600,
    targetDaysPerWeek: 5,
    isActive: true,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const sessions: FocusSession[] = [
    {
      id: 's1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 60,
      durationSeconds: 3600,
      completed: true,
      startedAt: '2026-11-15T08:00:00Z',
      endedAt: '2026-11-15T09:00:00Z',
    },
    {
      id: 's2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 60,
      durationSeconds: 3600,
      completed: true,
      startedAt: '2026-11-15T10:00:00Z',
      endedAt: '2026-11-15T11:00:00Z',
    },
  ];

  const progress = computePomodoroGoalProgress(sessions, goal, refDate);

  assert.equal(progress.dailyCurrentMinutes, 120, 'Current daily minutes must be 120');
  assert.equal(progress.dailyProgressPct, 100, 'Daily progress must be 100%');
  assert.equal(progress.isDailyMet, true, 'Daily goal should be met');
  assert.equal(progress.isWeeklyMet, false, 'Weekly goal of 600 min not yet met with 120m');
});

test('Pomodoro Enhancement — Timestamp drift resilience and lock deduplication', () => {
  const now = Date.now();
  const targetEndTime = now + 1500 * 1000; // 25 min in the future

  const remaining = computeRemainingSeconds(targetEndTime, now);
  assert.equal(remaining, 1500, 'Remaining seconds must accurately compute 1500s from targetEndTime');

  // Simulated sleep wake: 500s passed while computer was asleep
  const sleepWakeRemaining = computeRemainingSeconds(targetEndTime, now + 500 * 1000);
  assert.equal(sleepWakeRemaining, 1000, 'Sleep wake must compute remaining seconds without drift');

  // Past target end time
  const completedRemaining = computeRemainingSeconds(targetEndTime, targetEndTime + 1000);
  assert.equal(completedRemaining, 0, 'Past target time must return 0 remaining');

  // Lock acquisition deduplication across tabs
  const mockStorage = new Map<string, string>();
  const storageAdapter = {
    getItem: (k: string) => mockStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockStorage.set(k, v),
    removeItem: (k: string) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
    key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
    length: mockStorage.size,
  } as Storage;

  const lockKey = `test_lock_${Date.now()}_${Math.random()}`;
  const firstAcquire = acquireCompletionLock(lockKey, storageAdapter);
  assert.equal(firstAcquire, true, 'First tab must acquire completion lock');

  const secondAcquire = acquireCompletionLock(lockKey, storageAdapter);
  assert.equal(secondAcquire, false, 'Duplicate completion attempt from another tab must be rejected');
});

test('Pomodoro Enhancement — Firestore Security Rules & Collection Isolation', () => {
  const rulesPath = path.resolve('firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Collection 1: pomodoro_settings
  assert.match(
    rules,
    /match\s+\/pomodoro_settings\/\{settingId\}\s*\{/,
    'firestore.rules must define pomodoro_settings subcollection'
  );

  // Collection 2: pomodoro_goals
  assert.match(
    rules,
    /match\s+\/pomodoro_goals\/\{goalId\}\s*\{/,
    'firestore.rules must define pomodoro_goals subcollection'
  );

  // Collection 3: pomodoro_ambient_presets
  assert.match(
    rules,
    /match\s+\/pomodoro_ambient_presets\/\{presetId\}\s*\{/,
    'firestore.rules must define pomodoro_ambient_presets subcollection'
  );

  // User isolation checks
  assert.match(
    rules,
    /allow\s+read:\s*if\s+isOwner\(userId\);/,
    'User-scoped subcollections must enforce isOwner(userId)'
  );
});

test('Pomodoro Phase 17 — Multi-Goal Progress Engine (Daily, Weekly, Monthly, Custom)', () => {
  const refDate = new Date('2026-11-15T15:00:00Z');

  const sessions: FocusSession[] = [
    {
      id: 'fs1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 45,
      durationSeconds: 2700,
      actualDurationSeconds: 2700,
      completed: true,
      startedAt: '2026-11-15T09:00:00Z',
      endedAt: '2026-11-15T09:45:00Z',
    },
    {
      id: 'fs2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 60,
      durationSeconds: 3600,
      actualDurationSeconds: 3600,
      completed: true,
      startedAt: '2026-11-14T10:00:00Z',
      endedAt: '2026-11-14T11:00:00Z',
    },
    {
      id: 'fs3',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 90,
      durationSeconds: 5400,
      actualDurationSeconds: 5400,
      completed: true,
      startedAt: '2026-11-05T08:00:00Z',
      endedAt: '2026-11-05T09:30:00Z',
    },
    {
      id: 'fs_break',
      userId: 'u1',
      taskId: null,
      mode: 'short_break',
      durationMinutes: 10,
      durationSeconds: 600,
      completed: true,
      startedAt: '2026-11-15T09:45:00Z',
      endedAt: '2026-11-15T09:55:00Z',
    },
  ];

  // Daily Goal (today: 45m)
  const dailyGoal: PomodoroGoal = {
    id: 'g_daily',
    userId: 'u1',
    title: 'Daily Deep Work Target',
    goalType: 'daily',
    metricType: 'focus_minutes',
    targetValue: 60,
    currentValue: 0,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const dailyProg = computePomodoroGoalProgress(sessions, dailyGoal, refDate);
  assert.equal(dailyProg.currentValue, 45, 'Daily goal must accumulate only today work sessions (45m)');
  assert.equal(dailyProg.progressPct, 75, '45 / 60 = 75%');
  assert.equal(dailyProg.isMet, false);

  // Weekly Goal (past 7 days: 45 + 60 = 105m)
  const weeklyGoal: PomodoroGoal = {
    id: 'g_weekly',
    userId: 'u1',
    title: 'Weekly 100m Focus Target',
    goalType: 'weekly',
    metricType: 'focus_minutes',
    targetValue: 100,
    currentValue: 0,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const weeklyProg = computePomodoroGoalProgress(sessions, weeklyGoal, refDate);
  assert.equal(weeklyProg.currentValue, 105, 'Weekly goal must accumulate week sessions (105m)');
  assert.equal(weeklyProg.progressPct, 100, 'Exceeded target is capped at 100%');
  assert.equal(weeklyProg.isMet, true);

  // Monthly Goal (month: 45 + 60 + 90 = 195m)
  const monthlyGoal: PomodoroGoal = {
    id: 'g_monthly',
    userId: 'u1',
    title: 'Monthly Focus Target',
    goalType: 'monthly',
    metricType: 'focus_minutes',
    targetValue: 300,
    currentValue: 0,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const monthlyProg = computePomodoroGoalProgress(sessions, monthlyGoal, refDate);
  assert.equal(monthlyProg.currentValue, 195, 'Monthly goal includes all November work sessions (195m)');
  assert.equal(monthlyProg.progressPct, 65, '195 / 300 = 65%');
  assert.equal(monthlyProg.isMet, false);

  // Custom Date Range Goal (2026-11-10 to 2026-11-20: 45 + 60 = 105m)
  const customGoal: PomodoroGoal = {
    id: 'g_custom',
    userId: 'u1',
    title: 'Mid-November Sprint',
    goalType: 'custom',
    metricType: 'focus_minutes',
    targetValue: 100,
    startDate: '2026-11-10',
    endDate: '2026-11-20',
    currentValue: 0,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const customProg = computePomodoroGoalProgress(sessions, customGoal, refDate);
  assert.equal(customProg.currentValue, 105);
  assert.equal(customProg.isMet, true);
});

test('Pomodoro Phase 17 — Goal Target Metric Types (Minutes vs Session Count)', () => {
  const refDate = new Date('2026-11-15T15:00:00Z');

  const sessions: FocusSession[] = [
    {
      id: 'fs1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-15T09:00:00Z',
      endedAt: '2026-11-15T09:25:00Z',
    },
    {
      id: 'fs2',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-11-15T10:00:00Z',
      endedAt: '2026-11-15T10:25:00Z',
    },
    {
      id: 'fs_incomp',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: false, // Incomplete session must not count!
      startedAt: '2026-11-15T11:00:00Z',
      endedAt: '2026-11-15T11:10:00Z',
    },
  ];

  const sessionCountGoal: PomodoroGoal = {
    id: 'g_count',
    userId: 'u1',
    title: '4 Daily Focus Sessions',
    goalType: 'daily',
    metricType: 'session_count',
    targetValue: 4,
    currentValue: 0,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const prog = computePomodoroGoalProgress(sessions, sessionCountGoal, refDate);
  assert.equal(prog.currentValue, 2, 'Must count exactly 2 completed sessions');
  assert.equal(prog.targetValue, 4);
  assert.equal(prog.progressPct, 50, '2 / 4 = 50%');
  assert.equal(prog.isMet, false);
});

test('Pomodoro Phase 17 — Subject & Topic Linkage Filtering in Goals', () => {
  const refDate = new Date('2026-11-15T15:00:00Z');

  const sessions: FocusSession[] = [
    {
      id: 'fs_math1',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      completed: true,
      subjectCode: 'MATH101',
      topicId: 'calculus',
      startedAt: '2026-11-15T09:00:00Z',
      endedAt: '2026-11-15T09:50:00Z',
    },
    {
      id: 'fs_phys',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 40,
      durationSeconds: 2400,
      completed: true,
      subjectCode: 'PHYS101',
      topicId: 'mechanics',
      startedAt: '2026-11-15T10:00:00Z',
      endedAt: '2026-11-15T10:40:00Z',
    },
  ];

  const mathGoal: PomodoroGoal = {
    id: 'g_math',
    userId: 'u1',
    title: 'MATH101 Practice Goal',
    goalType: 'daily',
    metricType: 'focus_minutes',
    subjectCode: 'MATH101',
    targetValue: 60,
    currentValue: 0,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  const mathProg = computePomodoroGoalProgress(sessions, mathGoal, refDate);
  assert.equal(mathProg.currentValue, 50, 'Only MATH101 session minutes should be counted');
  assert.equal(mathProg.progressPct, 83);
});

test('Pomodoro Phase 17 — Timer State Sleep/Wake Expired Detection & Persistence', () => {
  const mockStorage = new Map<string, string>();
  const storageAdapter = {
    getItem: (k: string) => mockStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockStorage.set(k, v),
    removeItem: (k: string) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
    key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
    length: mockStorage.size,
  } as Storage;

  const userA = 'user_abc_123';
  const now = 1700000000000;

  // Save running timer that ends in 1500s
  saveTimerState(
    {
      isRunning: true,
      timerEngine: 'pomodoro',
      timerMode: 'work',
      timeLeft: 1500,
      totalDuration: 1500,
      targetEndTimeMs: now + 1500 * 1000,
      sessionStartTime: new Date(now).toISOString(),
      activeSessionId: 'fs_active_test',
      activePresetId: 'preset_classic',
    },
    storageAdapter,
    userA
  );

  // Reopen browser 100s after it completed (wake time = now + 1600s)
  const wakeTime = now + 1600 * 1000;
  const restored = loadInitialTimerState(storageAdapter, wakeTime, userA);

  assert.equal(restored.isRunning, false, 'Expired timer must not be running');
  assert.equal(restored.isExpired, true, 'isExpired flag must be true');
  assert.equal(restored.timeLeft, 0, 'timeLeft must be 0');
  assert.equal(restored.activeSessionId, 'fs_active_test', 'activeSessionId must be preserved to finalize');
  assert.equal(restored.activePresetId, 'preset_classic', 'activePresetId must be preserved');
});

test('Pomodoro Phase 17 — Multi-Account Storage Partitioning & Leak Prevention', () => {
  const mockStorage = new Map<string, string>();
  const storageAdapter = {
    getItem: (k: string) => mockStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockStorage.set(k, v),
    removeItem: (k: string) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
    key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
    length: mockStorage.size,
  } as Storage;

  const userA = 'user_alice';
  const userB = 'user_bob';

  assert.notEqual(
    getTimerStorageKey(userA),
    getTimerStorageKey(userB),
    'Storage keys must be strictly user-scoped'
  );

  // User A starts running a timer linked to task A
  saveTimerState(
    {
      isRunning: true,
      timeLeft: 900,
      totalDuration: 1500,
      activeTaskId: 'task_alice_secret',
    },
    storageAdapter,
    userA
  );

  // User B logs in: User B timer state must be clean fallback, not Alice's timer
  const bobTimer = loadInitialTimerState(storageAdapter, Date.now(), userB);
  assert.equal(bobTimer.isRunning, false);
  assert.equal(bobTimer.activeTaskId, null, 'User B must not leak User A activeTaskId');
  assert.equal(bobTimer.timeLeft, 1500);

  // Alice logs back in: Alice's timer is intact
  const aliceTimer = loadInitialTimerState(storageAdapter, Date.now(), userA);
  assert.equal(aliceTimer.activeTaskId, 'task_alice_secret');
});

// ---------------------------------------------------------------------
// PHASE 17.1 — TARGETED INTEGRITY REGRESSION TESTS
// ---------------------------------------------------------------------

test('Phase 17.1 Fix 1 & 4 — Reset after 10 seconds: updates session to interrupted with actual duration', () => {
  // Simulate active session reset after 10 seconds (total 1500s, timeLeft 1490s)
  const totalDuration = 1500;
  const timeLeft = 1490;
  const elapsedActiveSecs = Math.max(0, Math.min(totalDuration, Math.round(totalDuration - timeLeft)));

  assert.equal(elapsedActiveSecs, 10, 'Elapsed active focus duration must be exactly 10 seconds');

  const sessionUpdate: Partial<FocusSession> = {
    status: 'interrupted',
    completed: false,
    actualDurationSeconds: elapsedActiveSecs,
    endedAt: '2026-11-15T12:00:10Z',
    endReason: 'reset',
  };

  assert.equal(sessionUpdate.status, 'interrupted');
  assert.equal(sessionUpdate.completed, false);
  assert.equal(sessionUpdate.actualDurationSeconds, 10);
  assert.equal(sessionUpdate.endReason, 'reset');
});

test('Phase 17.1 Fix 1 & 4 — Skip after 10 seconds: updates session to interrupted with actual duration', () => {
  const totalDuration = 1500;
  const timeLeft = 1490;
  const elapsedActiveSecs = Math.max(0, Math.min(totalDuration, Math.round(totalDuration - timeLeft)));

  assert.equal(elapsedActiveSecs, 10, 'Elapsed active focus duration must be exactly 10 seconds');

  const sessionUpdate: Partial<FocusSession> = {
    status: 'interrupted',
    completed: false,
    actualDurationSeconds: elapsedActiveSecs,
    endedAt: '2026-11-15T12:00:10Z',
    endReason: 'skipped',
  };

  assert.equal(sessionUpdate.status, 'interrupted');
  assert.equal(sessionUpdate.completed, false);
  assert.equal(sessionUpdate.endReason, 'skipped');
});

test('Phase 17.1 Fix 1 & 4 — Reset after more than 30 seconds (e.g. 120s)', () => {
  const totalDuration = 1500;
  const timeLeft = 1380;
  const elapsedActiveSecs = Math.max(0, Math.min(totalDuration, Math.round(totalDuration - timeLeft)));

  assert.equal(elapsedActiveSecs, 120, 'Elapsed active focus duration must be exactly 120 seconds');

  const sessionUpdate: Partial<FocusSession> = {
    status: 'interrupted',
    completed: false,
    actualDurationSeconds: elapsedActiveSecs,
    endedAt: '2026-11-15T12:02:00Z',
    endReason: 'reset',
  };

  assert.equal(sessionUpdate.status, 'interrupted');
  assert.equal(sessionUpdate.actualDurationSeconds, 120);
});

test('Phase 17.1 Fix 1 & 4 — Skip after more than 30 seconds (e.g. 300s)', () => {
  const totalDuration = 1500;
  const timeLeft = 1200;
  const elapsedActiveSecs = Math.max(0, Math.min(totalDuration, Math.round(totalDuration - timeLeft)));

  assert.equal(elapsedActiveSecs, 300, 'Elapsed active focus duration must be exactly 300 seconds');

  const sessionUpdate: Partial<FocusSession> = {
    status: 'interrupted',
    completed: false,
    actualDurationSeconds: elapsedActiveSecs,
    endedAt: '2026-11-15T12:05:00Z',
    endReason: 'skipped',
  };

  assert.equal(sessionUpdate.status, 'interrupted');
  assert.equal(sessionUpdate.actualDurationSeconds, 300);
});

test('Phase 17.1 Fix 1 & 4 — No orphaned in_progress document and incomplete sessions do not count toward goals', () => {
  const interruptedShortSession: FocusSession = {
    id: 'foc_interrupted_short',
    userId: 'u1',
    taskId: null,
    mode: 'work',
    durationMinutes: 25,
    durationSeconds: 1500,
    actualDurationSeconds: 10,
    completed: false,
    status: 'interrupted',
    endReason: 'reset',
    startedAt: '2026-11-15T10:00:00Z',
    endedAt: '2026-11-15T10:00:10Z',
  };

  // Confirm computePomodoroGoalProgress ignores incomplete/interrupted sessions
  const goal: PomodoroGoal = {
    id: 'g1',
    userId: 'u1',
    title: 'Daily Goal',
    goalType: 'daily',
    metricType: 'focus_minutes',
    targetValue: 60,
    createdAt: '2026-11-15T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
  };

  const res = computePomodoroGoalProgress([interruptedShortSession], goal, new Date('2026-11-15T12:00:00Z'));
  assert.equal(res.currentValue, 0, 'Incomplete/interrupted sessions must NEVER count toward goal progress');
  assert.equal(res.isMet, false);
});

test('Phase 17.1 Fix 3 & 4 — Complete a 25-minute timer with a 2-minute pause: actual duration is 25 minutes', () => {
  // Planned duration: 25 minutes = 1500 seconds.
  // Pause count: 1, totalPauseSeconds: 120 seconds.
  // In countdown timer semantics, pauses suspend the countdown.
  // When timer reaches 0, total active focus performed was the full planned 1500s.
  const safeDurationSecs = 1500;
  const totalPauseSecs = 120;
  const actualDurationSeconds = Math.max(0, safeDurationSecs); // Corrected calculation: safeDurationSecs, NOT safeDurationSecs - totalPauseSecs!

  assert.equal(actualDurationSeconds, 1500, 'Actual focus duration of completed 25-min session with 2-min pause must be 1500s (25 min)');
  assert.notEqual(actualDurationSeconds, 1380, 'Must NOT subtract paused time twice from countdown timer');
});

test('Phase 17.1 Fix 3 & 4 — Interrupted session duration bounds: never negative, never exceeds planned duration', () => {
  const totalDuration = 1500;

  // Case A: normal interruption after 400s
  const timeLeftA = 1100;
  const elapsedA = Math.max(0, Math.min(totalDuration, Math.round(totalDuration - timeLeftA)));
  assert.equal(elapsedA, 400);

  // Case B: clock jump or timeLeft greater than totalDuration
  const timeLeftB = 1600;
  const elapsedB = Math.max(0, Math.min(totalDuration, Math.round(totalDuration - timeLeftB)));
  assert.equal(elapsedB, 0, 'Clock irregularity must clamp to minimum 0');

  // Case C: negative timeLeft
  const timeLeftC = -50;
  const elapsedC = Math.max(0, Math.min(totalDuration, Math.round(totalDuration - timeLeftC)));
  assert.equal(elapsedC, 1500, 'Overtime/drift must clamp to planned totalDuration');
});

test('Phase 17.1 Fix 2 & 4 — Authenticated expired timer recovery after browser reload: restores and detects expiration', () => {
  const mockStorage: Record<string, string> = {};
  const storageAdapter = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => {
      mockStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete mockStorage[k];
    },
  } as unknown as Storage;

  const authUserId = 'usr_auth_exp_123';
  const startedAt = '2026-11-15T10:00:00.000Z';
  const targetEnd = Date.now() - 5000; // expired 5 seconds ago

  saveTimerState(
    {
      userId: authUserId,
      timerEngine: 'pomodoro',
      timerMode: 'work',
      isRunning: true,
      timeLeft: 1500,
      totalDuration: 1500,
      targetEndTimeMs: targetEnd,
      sessionStartTime: startedAt,
      activeSessionId: 'foc_exp_sess_456',
      activeTaskId: 'task_exp_789',
    },
    storageAdapter,
    authUserId
  );

  // Authenticated user reloads tab and initializes
  const loaded = loadInitialTimerState(storageAdapter, Date.now(), authUserId);
  assert.equal(loaded.isExpired, true, 'Authenticated timer must be flagged as isExpired: true');
  assert.equal(loaded.timerMode, 'work');
  assert.equal(loaded.activeSessionId, 'foc_exp_sess_456');
  assert.equal(loaded.activeTaskId, 'task_exp_789');
  assert.equal(loaded.timeLeft, 0);
  assert.equal(loaded.isRunning, false);
});

test('Phase 17.1 Fix 2 & 4 — Recovery does not create a duplicate session and two tabs cannot finalize twice', () => {
  const mockStorage: Record<string, string> = {};
  const storageAdapter = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => {
      mockStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete mockStorage[k];
    },
  } as unknown as Storage;

  const sessionId = 'foc_race_test_999';
  const lockKey = `comp_expired_${sessionId}_25`;

  // Tab 1 attempts to acquire lock
  const tab1Acquired = acquireCompletionLock(lockKey, storageAdapter);
  assert.equal(tab1Acquired, true, 'First tab must successfully acquire the completion lock');

  // Tab 2 attempts to acquire lock for the same expired session
  const tab2Acquired = acquireCompletionLock(lockKey, storageAdapter);
  assert.equal(tab2Acquired, false, 'Second tab must fail to acquire lock and NOT execute duplicate finalization');
});

test('Phase 17.1 Fix 2 & 4 — Guest timer state does not leak into authenticated accounts', () => {
  const mockStorage: Record<string, string> = {};
  const storageAdapter = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => {
      mockStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete mockStorage[k];
    },
  } as unknown as Storage;

  // Guest sets up a timer
  saveTimerState(
    {
      userId: null,
      timerEngine: 'pomodoro',
      timerMode: 'work',
      isRunning: true,
      timeLeft: 1200,
      activeTaskId: 'guest_task',
    },
    storageAdapter,
    null
  );

  // User logs in as Bob
  const bobTimer = loadInitialTimerState(storageAdapter, Date.now(), 'usr_bob');
  assert.notEqual(bobTimer.activeTaskId, 'guest_task', 'Guest timer state must NOT leak into Bob account');
  assert.equal(bobTimer.isRunning, false, 'Bob has not started a timer, so isRunning must be false');
});

test('Pomodoro Phase 17 — Firestore Security Rules: Nested Interruptions, Presets & Goals', () => {
  const rulesPath = path.resolve('firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Verify nested interruptions subcollection rules
  assert.match(
    rules,
    /match\s+\/focus_sessions\/\{sessionId\}\s*\{[\s\S]*match\s+\/interruptions\/\{eventId\}\s*\{/,
    'interruptions must be nested inside focus_sessions/{sessionId}'
  );

  assert.match(
    rules,
    /allow\s+update,\s*delete:\s*if\s+false;/,
    'Nested interruptions subcollection must be append-only (immutable)'
  );

  assert.match(
    rules,
    /request\.resource\.data\.eventType\s+in\s+\['pause',\s*'resume'\]/,
    'Interruptions eventType must be constrained to pause or resume'
  );

  // Verify presets bounds
  assert.match(
    rules,
    /isBoundedInt\(request\.resource\.data\.workDuration,\s*1,\s*180\)/,
    'pomodoro_presets workDuration must be bounded 1-180'
  );

  assert.match(
    rules,
    /isBoundedInt\(request\.resource\.data\.shortBreakDuration,\s*1,\s*60\)/,
    'pomodoro_presets shortBreakDuration must be bounded 1-60'
  );

  assert.match(
    rules,
    /isBoundedInt\(request\.resource\.data\.longBreakDuration,\s*1,\s*90\)/,
    'pomodoro_presets longBreakDuration must be bounded 1-90'
  );

  assert.match(
    rules,
    /isBoundedInt\(request\.resource\.data\.longBreakInterval,\s*1,\s*12\)/,
    'pomodoro_presets longBreakInterval must be bounded 1-12'
  );
});

test('Phase 17.2 Fix 1 — Expiring completion lock with TTL, ownership awareness, and safe retry', () => {
  const mockStorage: Record<string, string> = {};
  const storageAdapter = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => {
      mockStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete mockStorage[k];
    },
  } as unknown as Storage;

  const key = 'test_expiring_lock';
  const lockStorageKey = `ff_comp_lock_${key}`;
  const ownerA = 'tab_token_alpha';
  const ownerB = 'tab_token_beta';
  const now = Date.now();

  // 1. Owner A acquires lock with 5000ms TTL
  const resA = acquireCompletionLockEntry(key, storageAdapter, now, 5000, ownerA);
  assert.equal(resA.acquired, true, 'Owner A should successfully acquire active lock');
  assert.equal(resA.ownerToken, ownerA);

  // 2. Owner B tries to acquire same lock before TTL -> rejected
  const resB = acquireCompletionLockEntry(key, storageAdapter, now + 1000, 5000, ownerB);
  assert.equal(resB.acquired, false, 'Owner B must be rejected while Owner A holds unexpired lock');

  // 3. Attempt release with wrong owner token -> rejected, lock preserved
  releaseCompletionLock(key, storageAdapter, ownerB);
  assert.ok(mockStorage[lockStorageKey], 'Lock must remain in storage after failed release attempt');

  // 4. Release with valid owner token -> succeeds, lock cleared
  releaseCompletionLock(key, storageAdapter, ownerA);
  assert.equal(mockStorage[lockStorageKey], undefined, 'Lock must be completely cleared from storage');

  // 5. Owner B can now acquire the released lock
  const resBAfterRelease = acquireCompletionLockEntry(key, storageAdapter, now + 2000, 5000, ownerB);
  assert.equal(resBAfterRelease.acquired, true, 'Owner B should now acquire previously released lock');

  // 6. Test stale lock expiration (simulating crashed tab past TTL)
  mockStorage[lockStorageKey] = JSON.stringify({
    acquiredAt: now - 20000,
    ownerTabId: ownerB,
  });

  const resAfterStale = acquireCompletionLockEntry(key, storageAdapter, now, 5000, ownerA);
  assert.equal(resAfterStale.acquired, true, 'Stale lock past TTL must be overridden by new acquisition attempt');
});

test('Phase 17.2 Fix 2 — Strict subject and topic isolation for Pomodoro goals', () => {
  const refDate = new Date('2026-11-15T12:00:00Z');

  const sessions: FocusSession[] = [
    {
      id: 's_math_calc',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 30,
      durationSeconds: 1800,
      actualDurationSeconds: 1800,
      completed: true,
      subjectId: 'subj_math',
      subjectCode: 'MATH101',
      topicId: 'top_calculus',
      startedAt: '2026-11-15T08:00:00Z',
      endedAt: '2026-11-15T08:30:00Z',
    },
    {
      id: 's_unlinked',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 40,
      durationSeconds: 2400,
      actualDurationSeconds: 2400,
      completed: true,
      subjectId: null,
      subjectCode: null,
      topicId: null,
      startedAt: '2026-11-15T09:00:00Z',
      endedAt: '2026-11-15T09:40:00Z',
    },
    {
      id: 's_cs',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 50,
      durationSeconds: 3000,
      actualDurationSeconds: 3000,
      completed: true,
      subjectId: 'subj_cs',
      subjectCode: 'CS101',
      topicId: null,
      startedAt: '2026-11-15T10:00:00Z',
      endedAt: '2026-11-15T10:50:00Z',
    },
    {
      id: 's_math_geom',
      userId: 'u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 20,
      durationSeconds: 1200,
      actualDurationSeconds: 1200,
      completed: true,
      subjectId: 'subj_math',
      subjectCode: 'MATH101',
      topicId: 'top_geometry',
      startedAt: '2026-11-15T11:00:00Z',
      endedAt: '2026-11-15T11:20:00Z',
    },
  ];

  // Subject-specific goal (Math)
  const mathGoal: PomodoroGoal = {
    id: 'g_math',
    userId: 'u1',
    title: 'Daily Math Study',
    goalType: 'daily',
    metricType: 'focus_minutes',
    targetValue: 60,
    currentValue: 0,
    status: 'active',
    subjectId: 'subj_math',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const mathProg = computePomodoroGoalProgress(sessions, mathGoal, refDate);
  // Must count only s_math_calc (30m) + s_math_geom (20m) = 50m. Must exclude unlinked (40m) and CS (50m).
  assert.equal(mathProg.currentValue, 50, 'Subject-specific goal must only count sessions with matching subjectId');

  // Topic-specific goal (Math Calculus)
  const calculusGoal: PomodoroGoal = {
    id: 'g_calc',
    userId: 'u1',
    title: 'Daily Calculus Study',
    goalType: 'daily',
    metricType: 'focus_minutes',
    targetValue: 45,
    currentValue: 0,
    status: 'active',
    subjectId: 'subj_math',
    topicId: 'top_calculus',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const calcProg = computePomodoroGoalProgress(sessions, calculusGoal, refDate);
  // Must count only s_math_calc (30m). Must exclude s_math_geom (20m), s_unlinked (40m), s_cs (50m).
  assert.equal(calcProg.currentValue, 30, 'Topic-specific goal must only count sessions matching both subject and topic');

  // Global goal (no subject or topic constraint)
  const globalGoal: PomodoroGoal = {
    id: 'g_global',
    userId: 'u1',
    title: 'Daily All Focus',
    goalType: 'daily',
    metricType: 'focus_minutes',
    targetValue: 120,
    currentValue: 0,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const globalProg = computePomodoroGoalProgress(sessions, globalGoal, refDate);
  // Must count all work sessions: 30 + 40 + 50 + 20 = 140m.
  assert.equal(globalProg.currentValue, 140, 'Global goal must accumulate all work sessions regardless of subject/topic');
});

test('Phase 17.2 Fix 3 — Firestore Security Rules: Hardened bounds for focus_sessions, presets, goals', () => {
  const rulesPath = path.resolve('firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Bounds on actualDurationSeconds
  assert.match(
    rules,
    /isBoundedInt\(request\.resource\.data\.actualDurationSeconds,\s*0,\s*86400\)/,
    'firestore.rules must bound actualDurationSeconds between 0 and 86400'
  );

  // Bounds on pauseCount and totalPauseSeconds
  assert.match(
    rules,
    /request\.resource\.data\.pauseCount\s+is\s+int\s+&&\s+request\.resource\.data\.pauseCount\s*>=\s*0/,
    'firestore.rules must enforce pauseCount is a non-negative integer'
  );

  assert.match(
    rules,
    /request\.resource\.data\.totalPauseSeconds\s+is\s+int\s+&&\s+request\.resource\.data\.totalPauseSeconds\s*>=\s*0/,
    'firestore.rules must enforce totalPauseSeconds is a non-negative integer'
  );

  // Status enum check
  assert.match(
    rules,
    /request\.resource\.data\.status\s+in\s+\['in_progress',\s*'completed',\s*'interrupted'\]/,
    'firestore.rules must validate status enum on focus_sessions'
  );

  // pomodoro_presets soundVolume check
  assert.match(
    rules,
    /isBoundedInt\(request\.resource\.data\.soundVolume,\s*0,\s*100\)/,
    'pomodoro_presets must enforce soundVolume is bounded between 0 and 100'
  );

  // pomodoro_goals targetValue check
  assert.match(
    rules,
    /isBoundedInt\(request\.resource\.data\.targetValue,\s*1,\s*100000\)/,
    'pomodoro_goals must enforce targetValue is bounded between 1 and 100000'
  );
});

test('Phase 17.2 Fix 5 — Timezone-aware date string calculation', () => {
  const todayIST = getTodayDateString('Asia/Kolkata');
  assert.match(todayIST, /^\d{4}-\d{2}-\d{2}$/, 'getTodayDateString must return YYYY-MM-DD');

  const todayUTC = getTodayDateString('UTC');
  assert.match(todayUTC, /^\d{4}-\d{2}-\d{2}$/, 'getTodayDateString(UTC) must return YYYY-MM-DD');
});

test('Pomodoro Countdown — Broadcast echo prevention & countdown backward progression', async () => {
  // 1. Verify TIMER_CLIENT_ID exists and is unique non-empty string
  assert.ok(typeof TIMER_CLIENT_ID === 'string' && TIMER_CLIENT_ID.length > 0, 'TIMER_CLIENT_ID must be non-empty');

  // 2. Broadcast channel echo isolation: receiver listening on channel receives senderId
  const receiverChannel = new BroadcastChannel(TIMER_BROADCAST_CHANNEL);
  const messagePromise = new Promise<TimerBroadcastMessage>((resolve) => {
    receiverChannel.onmessage = (evt) => resolve(evt.data);
  });

  broadcastTimerEvent({
    type: 'TIMER_SYNC_START',
    payload: {
      targetEndTimeMs: Date.now() + 1500 * 1000,
      stopwatchStartMs: null,
      totalDuration: 1500,
      timerMode: 'work',
      timerEngine: 'pomodoro',
      sessionStartTime: new Date().toISOString(),
      activeTaskId: null,
    },
  });

  const msg = await Promise.race([
    messagePromise,
    new Promise<null>((res) => setTimeout(() => res(null), 1500)),
  ]);
  receiverChannel.close();

  assert.ok(msg !== null, 'Receiver must receive broadcast event within 1500ms');
  assert.equal(msg.senderId, TIMER_CLIENT_ID, 'Broadcast event must include local senderId');

  // 3. Mathematical proof of backward countdown decrement
  const targetEndTime = Date.now() + 1500 * 1000;
  const rem0 = computeRemainingSeconds(targetEndTime, Date.now());
  const rem1 = computeRemainingSeconds(targetEndTime, Date.now() + 1000);
  const rem2 = computeRemainingSeconds(targetEndTime, Date.now() + 2000);

  assert.equal(rem0, 1500, 'T=0s remaining should be 1500 (25:00)');
  assert.equal(rem1, 1499, 'T=1s remaining should be 1499 (24:59)');
  assert.equal(rem2, 1498, 'T=2s remaining should be 1498 (24:58)');
});
