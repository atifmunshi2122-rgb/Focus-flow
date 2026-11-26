import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeGamificationFromRealData,
  computeLeaderboardEntriesFromProfiles,
} from '../src/features/gamification/firestoreGamification.ts';
import { googleSheetsService } from '../src/lib/googleSheetsService.ts';
import { api } from '../src/lib/api.ts';
import { auth } from '../src/lib/firebase.ts';
import type { FocusSession, Habit, Task } from '../src/types/index.ts';
import type { LeaderboardProfile } from '../src/types/leaderboard.ts';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

test('Bug 1 — firestoreService.saveHabit & firestore.rules preserve Sheet Hub source* linkage fields', () => {
  const fsSource = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/firestoreService.ts'), 'utf8');
  const saveHabitStart = fsSource.indexOf('async saveHabit(');
  const saveHabitEnd = fsSource.indexOf('async toggleHabitCompletion(');
  assert.ok(saveHabitStart !== -1 && saveHabitEnd > saveHabitStart);
  const saveHabitSlice = fsSource.slice(saveHabitStart, saveHabitEnd);

  for (const field of [
    'sourceSpreadsheetId',
    'sourceSheetId',
    'sourceRowId',
    'sourceMappingKey',
    'sourceLayout',
  ]) {
    assert.ok(saveHabitSlice.includes(field), `saveHabit must copy ${field}`);
  }

  const rulesSource = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const habitRulesMatch = rulesSource.match(/match \/habits\/\{habitId\}[\s\S]*?match \/study_tiers/);
  assert.ok(habitRulesMatch, 'Habits rules section must exist');
  for (const field of [
    'sourceSpreadsheetId',
    'sourceSheetId',
    'sourceRowId',
    'sourceMappingKey',
    'sourceLayout',
  ]) {
    assert.ok(habitRulesMatch[0].includes(field), `firestore.rules habits update must allow ${field}`);
  }
});

test('Bug 2 — Gamification dailyXP does not inflate from old achievements/streaks & computes real Habit streak', () => {
  // Reference "today" is 2026-11-26; old activity was 10+ days ago, habit streak completed yesterday
  const now = new Date('2026-11-26T10:00:00Z');
  const oldTask: Task = {
    id: 't_old_1',
    userId: 'u1',
    title: 'Past completed task',
    description: '',
    priority: 'medium',
    status: 'completed',
    category: 'Study',
    subtasks: [],
    recurrence: 'none',
    estimatedPomodoros: 1,
    completedPomodoros: 1,
    completedAt: '2026-11-10T10:00:00Z',
    dueDate: '2026-11-10',
    createdAt: '2026-11-10T09:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
  };

  // Real Habit with 4 consecutive days ending yesterday (2026-11-22..2026-11-25) -> 3-day streak hit on 2026-11-24!
  const habitWithStreak: Habit = {
    id: 'h_real',
    userId: 'u1',
    title: 'Daily Reading',
    category: 'Study',
    color: '#6366f1',
    frequency: 'daily',
    targetDaysPerWeek: 7,
    completedDates: ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'],
    bestStreakDays: 4,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-25T20:00:00Z',
  };

  const result = computeGamificationFromRealData({
    userId: 'u1',
    tasks: [oldTask],
    focusSessions: [] as FocusSession[],
    subjects: [],
    habits: [habitWithStreak],
    timezone: 'Asia/Kolkata',
    now,
  });

  // Streak must reflect real Habit.completedDates (4 days, NOT 0)
  assert.equal(result.profile.currentStreak, 4);
  assert.equal(result.profile.longestStreak, 4);

  // First Step achievement unlocked on 2026-11-10 (NOT today)
  const firstStepAch = result.achievements.find((a) => a.id === 'first_step');
  assert.equal(firstStepAch?.unlocked, true);
  assert.equal(firstStepAch?.unlockedAt, Date.parse('2026-11-10T10:00:00Z'));

  // No tasks/focus/habits done on 2026-11-26 => dailyXP MUST be 0 (not inflated by old First Step or 3-day streak)
  assert.equal(result.profile.dailyXP, 0);
  const firstStepTx = result.transactions.find((t) => t.id === 'xp_ach_first_step');
  assert.equal(firstStepTx?.createdAt, Date.parse('2026-11-10T10:00:00Z'));
});

test('Bug 3 — Gamification leaderboard resets stale weekKey/monthKey XP on period rollover', () => {
  // Now = 2026-11-26 (weekKey '2026-W48', monthKey '2026-11')
  const now = new Date('2026-11-26T10:00:00Z');
  const staleProfile: LeaderboardProfile = {
    uid: 'u_stale',
    displayName: 'Inactive October User',
    avatarColor: '#ef4444',
    isPublic: true,
    squadIds: [],
    todayKey: '2026-10-15',
    todayMinutes: 120,
    weekKey: '2026-W42',
    weekMinutes: 600,
    monthKey: '2026-10',
    monthMinutes: 3000,
    streakDays: 10,
    dailyGoalMinutes: 120,
    totalSessionsCount: 40,
    updatedAt: '2026-10-15T10:00:00Z',
  };

  const activeProfile: LeaderboardProfile = {
    uid: 'u_active',
    displayName: 'Active Scholar',
    avatarColor: '#10b981',
    isPublic: true,
    squadIds: [],
    todayKey: '2026-11-26',
    todayMinutes: 60,
    weekKey: '2026-W48',
    weekMinutes: 120,
    monthKey: '2026-11',
    monthMinutes: 400,
    streakDays: 2,
    dailyGoalMinutes: 120,
    totalSessionsCount: 10,
    updatedAt: '2026-11-26T09:00:00Z',
  };

  const weekly = computeLeaderboardEntriesFromProfiles({
    profiles: [staleProfile, activeProfile],
    category: 'weekly',
    currentUid: 'other',
    timezone: 'Asia/Kolkata',
    now,
  });
  const staleWeekly = weekly.find((e) => e.userId === 'u_stale');
  const activeWeekly = weekly.find((e) => e.userId === 'u_active');
  assert.equal(staleWeekly?.totalXP, 0, 'Stale weekKey profile must have 0 weekly XP');
  assert.ok((activeWeekly?.totalXP || 0) > 0);
  assert.equal(weekly[0].userId, 'u_active');

  const monthly = computeLeaderboardEntriesFromProfiles({
    profiles: [staleProfile, activeProfile],
    category: 'monthly',
    currentUid: 'other',
    timezone: 'Asia/Kolkata',
    now,
  });
  const staleMonthly = monthly.find((e) => e.userId === 'u_stale');
  assert.equal(staleMonthly?.totalXP, 0, 'Stale monthKey profile must have 0 monthly XP');
  assert.equal(monthly[0].userId, 'u_active');
});

test('Bug 4 — googleSheetsService isolates cachedQueueOps across sign-out and account switching', async () => {
  const originalStorage = (globalThis as Record<string, unknown>).localStorage;
  const originalEnqueueSync = api.enqueueSync;
  const storage = createMemoryStorage();
  (globalThis as Record<string, unknown>).localStorage = storage;

  let currentMockUser: { uid: string } | null = { uid: 'uid_alice' };
  Object.defineProperty(auth, 'currentUser', {
    get: () => currentMockUser,
    configurable: true,
  });

  // Stub api.enqueueSync so optimistic local queue cache persists without initializing Firestore SDK
  api.enqueueSync = async () => {
    throw new Error('offline');
  };

  try {
    googleSheetsService.resetForUserSwitch();
    assert.equal(googleSheetsService.getQueueLength(), 0);

    // 1. Alice enqueues a mutation -> stored only under Alice's key
    await googleSheetsService.enqueueMutation('Tasks', ['tsk_a1', 'Alice Task'], 'append', 'k_alice_1');
    assert.equal(googleSheetsService.getQueueLength(), 1);

    // 2. Switch auth user directly to Bob BEFORE refreshQueueCount() runs
    currentMockUser = { uid: 'uid_bob' };
    assert.equal(
      googleSheetsService.getQueueLength(),
      0,
      'Switched user must not see previous user cachedQueueOps count'
    );

    // 3. Bob enqueues a mutation -> Bob cache must contain ONLY Bob op (never Alice op)
    await googleSheetsService.enqueueMutation('Tasks', ['tsk_b1', 'Bob Task'], 'append', 'k_bob_1');
    assert.equal(googleSheetsService.getQueueLength(), 1);

    const aliceRaw = JSON.parse(storage.getItem('ff_sync_queue_cache_v1_uid_alice') || '[]');
    const bobRaw = JSON.parse(storage.getItem('ff_sync_queue_cache_v1_uid_bob') || '[]');
    assert.equal(aliceRaw.length, 1);
    assert.equal(aliceRaw[0].dedupeKey, 'k_alice_1');
    assert.equal(bobRaw.length, 1);
    assert.equal(bobRaw[0].dedupeKey, 'k_bob_1');
  } finally {
    delete (auth as unknown as Record<string, unknown>).currentUser;
    googleSheetsService.resetForUserSwitch();
    api.enqueueSync = originalEnqueueSync;
    (globalThis as Record<string, unknown>).localStorage = originalStorage;
  }
});

