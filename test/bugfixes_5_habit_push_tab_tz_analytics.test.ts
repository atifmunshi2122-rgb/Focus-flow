import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHabitStreak,
  computeProductivityAnalytics,
  buildDailyProductivityTimeline,
} from '../src/lib/productivityIntelligence.ts';
import { computePeriodicFocusStats } from '../src/lib/pomodoroAnalytics.ts';
import { resolveNavTabFromLocation } from '../src/context/AppContext.tsx';
import { PushNotificationService } from '../server/integrations/pushNotificationService.ts';
import type { FocusSession, Habit, Task, UserSettings } from '../src/types/index.ts';

test('Bug 1 — computeHabitStreak terminates immediately for archived, deleted, or unscheduled habits', () => {
  const archivedHabit: Habit = {
    id: 'h_arch',
    userId: 'u1',
    title: 'Archived Habit',
    category: 'Health',
    color: '#10b981',
    frequency: 'daily',
    targetDaysPerWeek: 7,
    completedDates: ['2026-11-14', '2026-11-13'],
    bestStreakDays: 2,
    archived: true,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-14T00:00:00Z',
  };

  const deletedHabit: Habit = {
    ...archivedHabit,
    id: 'h_del',
    archived: false,
    deletedAt: '2026-11-10T00:00:00Z',
  };

  const invalidCustomDaysHabit: Habit = {
    ...archivedHabit,
    id: 'h_custom_bad',
    archived: false,
    frequency: 'custom',
    customDays: [99], // Never matches any 0..6 weekday
  };

  const start = Date.now();
  const r1 = computeHabitStreak(archivedHabit, '2026-11-14');
  const r2 = computeHabitStreak(deletedHabit, '2026-11-14');
  const r3 = computeHabitStreak(invalidCustomDaysHabit, '2026-11-14');
  const elapsedMs = Date.now() - start;

  assert.equal(r1.currentStreak, 0);
  assert.equal(r2.currentStreak, 0);
  assert.equal(r3.currentStreak, 0);
  assert.ok(elapsedMs < 500, `Expected immediate termination without infinite loop, took ${elapsedMs}ms`);
});

test('Bug 2 — PushNotificationService reads authoritative settings/default (respecting Firestore notificationPrefs)', async () => {
  const service = new PushNotificationService();
  const userId = 'usr_push_default_settings_test';
  const readPaths: string[] = [];

  service.setFirestoreForTesting({
    collection: (col: string) => ({
      get: async () => ({
        docs: col === 'users' ? [{ id: userId, data: () => ({ id: userId }) }] : [],
      }),
      doc: (docId: string) => ({
        collection: (subCol: string) => ({
          get: async () => {
            if (docId === userId && subCol === 'fcm_installations') {
              return {
                docs: [
                  {
                    id: 'inst_1',
                    data: () => ({ installationId: 'inst_1', token: 'tok_abc', enabled: true }),
                  },
                ],
              };
            }
            if (docId === userId && subCol === 'tasks') {
              return {
                docs: [
                  {
                    id: 'task_overdue',
                    data: () => ({
                      id: 'task_overdue',
                      title: 'Overdue Task',
                      dueDate: '2026-11-01',
                      status: 'todo',
                    }),
                  },
                ],
              };
            }
            return { docs: [] };
          },
          where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
          doc: (subDocId: string) => {
            readPaths.push(`${col}/${docId}/${subCol}/${subDocId}`);
            return {
              get: async () => {
                if (docId === userId && subCol === 'settings' && subDocId === 'default') {
                  return {
                    exists: true,
                    data: () => ({
                      userId,
                      timezone: 'Asia/Kolkata',
                      notificationPrefs: {
                        enabled: true,
                        budgetWarnings: false,
                        taskDeadlines: false,
                      },
                    }),
                  };
                }
                return { exists: false, data: () => ({}) };
              },
              set: async () => {},
            };
          },
        }),
      }),
    }),
  });

  const sendRes = await service.sendNotification(userId, {
    title: 'Budget Alert',
    body: 'Exceeded threshold',
    category: 'budget',
    targetTab: 'finance',
  });
  assert.equal(sendRes.skipped, true, 'sendNotification must honor budgetWarnings: false from settings/default');
  assert.ok(readPaths.includes(`users/${userId}/settings/default`));

  const schedRes = await service.processScheduledNotifications();
  assert.equal(schedRes.processedUsers, 1);
  assert.equal(schedRes.dispatchedCount, 0, 'processScheduledNotifications must honor taskDeadlines: false from settings/default');
});

test('Bug 3 — resolveNavTabFromLocation supports WebPush ?tab= links and #hash navigation', () => {
  assert.equal(resolveNavTabFromLocation('?tab=bills', ''), 'bills');
  assert.equal(resolveNavTabFromLocation('?tab=settings&calendar=connected', ''), 'settings');
  assert.equal(resolveNavTabFromLocation('?tab=bills', '#tasks'), 'tasks');
  assert.equal(resolveNavTabFromLocation('?tab=invalid_tab', ''), null);
  assert.equal(resolveNavTabFromLocation('', '#leaderboard'), 'leaderboard');
  assert.equal(resolveNavTabFromLocation('', ''), null);
});

test('Bug 4 — buildDailyProductivityTimeline & computeProductivityAnalytics use timezone dates and exclude break sessions from focus minutes', () => {
  // 2026-11-14T20:00:00Z = 2026-11-15 01:30:00 IST (Sunday)
  const lateNightIstSession: FocusSession = {
    id: 's_ist_night',
    userId: 'u1',
    taskId: null,
    taskTitle: 'Late Night Revision',
    mode: 'work',
    durationMinutes: 50,
    durationSeconds: 3000,
    completed: true,
    startedAt: '2026-11-14T20:00:00Z',
    endedAt: '2026-11-14T20:50:00Z',
  };

  const completedBreakSession: FocusSession = {
    id: 's_ist_break',
    userId: 'u1',
    taskId: null,
    mode: 'short_break',
    durationMinutes: 10,
    durationSeconds: 600,
    completed: true,
    startedAt: '2026-11-15T04:00:00Z', // 09:30 IST on 2026-11-15
    endedAt: '2026-11-15T04:10:00Z',
  };

  const timelineNov14 = buildDailyProductivityTimeline({
    dateStr: '2026-11-14',
    tasks: [],
    sessions: [lateNightIstSession, completedBreakSession],
    habits: [],
    timeBlocks: [],
    timezone: 'Asia/Kolkata',
  });
  assert.equal(timelineNov14.totalFocusMinutes, 0, 'IST 01:30 AM on Nov 15 must NOT leak onto Nov 14');

  const timelineNov15 = buildDailyProductivityTimeline({
    dateStr: '2026-11-15',
    tasks: [],
    sessions: [lateNightIstSession, completedBreakSession],
    habits: [],
    timeBlocks: [],
    timezone: 'Asia/Kolkata',
  });
  assert.equal(timelineNov15.totalFocusMinutes, 50, 'Only work session (50m) counts, not 10m break');
  const workItem = timelineNov15.items.find((i) => i.id === 'session_s_ist_night');
  assert.ok(workItem);
  assert.equal(workItem.startMinute, 90, '20:00Z is 01:30 IST (90 minutes into day)');

  const settings: UserSettings = {
    userId: 'u1',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    theme: 'system',
  };
  const analytics = computeProductivityAnalytics({
    tasks: [] as Task[],
    sessions: [lateNightIstSession, completedBreakSession],
    habits: [],
    timeBlocks: [],
    settings,
    referenceDateStr: '2026-11-15',
  });
  assert.equal(analytics.totalFocusMinutes, 50);
  const sunBucket = analytics.weekdayDistribution.find((d) => d.day === 'Sun');
  const satBucket = analytics.weekdayDistribution.find((d) => d.day === 'Sat');
  assert.equal(sunBucket?.focusMinutes, 50, '20:00Z Saturday UTC is Sunday in IST');
  assert.equal(satBucket?.focusMinutes, 0);
});

test('Bug 5 — computePeriodicFocusStats derives weekday labels via UTC calendar date without local TZ shift', () => {
  // 2026-11-26 is Thursday
  const refDate = new Date('2026-11-26T10:00:00Z');
  const res = computePeriodicFocusStats([], refDate, 'Pacific/Kiritimati'); // UTC+14 => 2026-11-27 Fri 00:00
  assert.equal(res.dailyTrend.length, 7);
  assert.equal(res.dailyTrend[6].date, '2026-11-27');
  assert.equal(res.dailyTrend[6].dayLabel, 'Fri');
  assert.equal(res.dailyTrend[5].date, '2026-11-26');
  assert.equal(res.dailyTrend[5].dayLabel, 'Thu');
});
