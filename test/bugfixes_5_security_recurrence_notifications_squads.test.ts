import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeNextRecurrenceDueDate as serverComputeNextRecurrence } from '../server/validation.ts';
import { evaluateDeterministicNotifications } from '../src/lib/notificationsEngine.ts';
import type { ExpenseTransaction, NotificationPreferences, Task, UserSettings } from '../src/types/index.ts';

function buildSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    userId: 'u_test',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    theme: 'system',
    ...overrides,
  };
}

function buildPrefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
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
    ...overrides,
  };
}

test('Bug 2 — Monthly recurrence avoids Jan 31 -> Mar 3 rollover in firestoreService & server validation', () => {
  // Server validation wrapper must delegate to month-end-safe calculation
  assert.equal(serverComputeNextRecurrence('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(serverComputeNextRecurrence('2028-01-31', 'monthly'), '2028-02-29');
  assert.equal(serverComputeNextRecurrence('2026-03-31', 'monthly'), '2026-04-30');

  // firestoreService.ts must import computeNextRecurrenceDueDate from ./dateTime.ts and have no local setUTCMonth fallback
  const fsSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/firestoreService.ts'),
    'utf8'
  );
  assert.match(fsSource, /computeNextRecurrenceDueDate[\s\S]*from '\.\/dateTime\.ts'/);
  assert.doesNotMatch(fsSource, /function computeNextRecurrenceDueDate\s*\(/);
  assert.doesNotMatch(fsSource, /setUTCMonth\(d\.getUTCMonth\(\) \+ 1\)/);
});

test('Bug 3 — Weekly budget notification IDs key by week (not month) and respect budgetWarnings/taskDeadlines prefs', () => {
  const week1Now = new Date('2026-11-04T10:00:00Z'); // Week starting Monday 2026-11-02
  const week2Now = new Date('2026-11-11T10:00:00Z'); // Week starting Monday 2026-11-09 (same month!)

  const expenses: ExpenseTransaction[] = [
    {
      id: 'exp_w1',
      userId: 'u_test',
      billId: null,
      type: 'variable',
      categoryId: 'cat_1',
      categoryName: 'Food',
      amountPaise: 600000,
      date: '2026-11-04',
      description: 'Week 1 spend',
      paymentMethod: 'upi_bank',
      notes: '',
      createdAt: '2026-11-04T09:00:00Z',
    },
    {
      id: 'exp_w2',
      userId: 'u_test',
      billId: null,
      type: 'variable',
      categoryId: 'cat_1',
      categoryName: 'Food',
      amountPaise: 1200000, // Also triggers "Large Expense Recorded" (>= 1000000)
      date: '2026-11-11',
      description: 'Laptop repair',
      paymentMethod: 'upi_bank',
      notes: '',
      createdAt: '2026-11-11T09:00:00Z',
    },
  ];

  const tasks: Task[] = [
    {
      id: 't_backlog',
      userId: 'u_test',
      title: 'Unscheduled backlog task',
      description: '',
      priority: 'medium',
      status: 'todo',
      category: 'General',
      subtasks: [],
      recurrence: 'none',
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      dueDate: '2026-11-25',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  const alertsW1 = evaluateDeterministicNotifications({
    settings: buildSettings({
      weeklySpendingLimitPaise: 500000,
      notificationPrefs: buildPrefs({ budgetWarnings: true, taskDeadlines: true }),
    }),
    tasks,
    bills: [],
    dashboard: null,
    financeSummary: null,
    expenses,
    now: week1Now,
  });

  const alertsW2 = evaluateDeterministicNotifications({
    settings: buildSettings({
      weeklySpendingLimitPaise: 500000,
      notificationPrefs: buildPrefs({ budgetWarnings: true, taskDeadlines: true }),
    }),
    tasks,
    bills: [],
    dashboard: null,
    financeSummary: null,
    expenses,
    now: week2Now,
  });

  const w1Exceeded = alertsW1.find((a) => a.id.startsWith('weekly_limit_exceeded_'));
  const w2Exceeded = alertsW2.find((a) => a.id.startsWith('weekly_limit_exceeded_'));
  assert.ok(w1Exceeded, 'Week 1 should emit weekly_limit_exceeded notification');
  assert.ok(w2Exceeded, 'Week 2 should emit weekly_limit_exceeded notification');
  assert.equal(w1Exceeded.id, 'weekly_limit_exceeded_2026-11-02');
  assert.equal(w2Exceeded.id, 'weekly_limit_exceeded_2026-11-09');
  assert.notEqual(w1Exceeded.id, w2Exceeded.id);
  assert.ok(alertsW2.some((a) => a.title === 'Large Expense Recorded'));
  assert.ok(alertsW2.some((a) => a.title === 'Plan Your Day'));

  // Weekly warning ID also uses weekKey
  const alertsW1Warn = evaluateDeterministicNotifications({
    settings: buildSettings({
      weeklySpendingLimitPaise: 700000, // 600000/700000 = 86% >= 80% threshold
      notificationPrefs: buildPrefs({ budgetWarnings: true, taskDeadlines: true }),
    }),
    tasks,
    bills: [],
    dashboard: null,
    financeSummary: null,
    expenses,
    now: week1Now,
  });
  assert.ok(alertsW1Warn.some((a) => a.id === 'weekly_limit_warning_2026-11-02'));

  // Disabled toggles suppress "Large Expense Recorded" and "Plan Your Day"
  const alertsMuted = evaluateDeterministicNotifications({
    settings: buildSettings({
      weeklySpendingLimitPaise: 500000,
      notificationPrefs: buildPrefs({ budgetWarnings: false, taskDeadlines: false }),
    }),
    tasks,
    bills: [],
    dashboard: null,
    financeSummary: null,
    expenses,
    now: week2Now,
  });
  assert.equal(
    alertsMuted.some((a) => a.title === 'Large Expense Recorded'),
    false,
    'Large Expense Recorded must respect prefs.budgetWarnings = false'
  );
  assert.equal(
    alertsMuted.some((a) => a.title === 'Plan Your Day'),
    false,
    'Plan Your Day must respect prefs.taskDeadlines = false'
  );
});

test('Bug 1, 4 & 5 — Security rules, squad ownership transfer/invite index, and getSettings study_meta exclusion', () => {
  const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.ok(!rulesSource.includes('resource.data.squadIds is list && resource.data.squadIds.size() > 0'), 'Old permissive leaderboard_profiles rule must be gone');
  assert.match(rulesSource, /callerSharesSquadWith\(resource\.data\)/);
  assert.match(rulesSource, /match \/study_squads\/\{squadId\}[\s\S]*allow read:\s*if isSignedIn\(\)\s*&&\s*\(request\.auth\.uid in resource\.data\.memberUids\);/);
  assert.match(rulesSource, /match \/squad_invites\/\{inviteCode\}[\s\S]*allow list:\s*if false;/);

  const leaderboardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/leaderboardService.ts'),
    'utf8'
  );
  assert.match(leaderboardSource, /runTransaction\(/);
  assert.match(leaderboardSource, /ownerUid:\s*nextOwnerUid/);
  assert.match(leaderboardSource, /SQUAD_INVITES_COL/);

  const firestoreServiceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/firestoreService.ts'),
    'utf8'
  );
  assert.match(firestoreServiceSource, /'study_meta'/);
  assert.match(firestoreServiceSource, /!d\.id\.startsWith\('study_'\)/);
});

