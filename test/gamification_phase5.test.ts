import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLevel,
  calculateXPProgress,
  XP_PER_LEVEL,
} from '../src/features/gamification/xp-calculator.ts';
import {
  awardAuthoritativeXP,
  getGamificationSnapshot,
  getPaginatedGamificationLeaderboard,
} from '../server/gamificationService.ts';
import type { DatabaseSchema } from '../server/db.ts';

function makeMockDb(): DatabaseSchema {
  return {
    users: [
      { id: 'u_atif', name: 'Atif', email: 'atif@example.com', avatarUrl: '', createdAt: '2026-11-01T00:00:00Z' },
      { id: 'u_puja', name: 'Puja', email: 'puja@example.com', avatarUrl: '', createdAt: '2026-11-01T00:00:00Z' },
    ],
    userSettings: [
      {
        userId: 'u_atif',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        pomodoroWorkDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoSwitchSessions: false,
        soundEnabled: true,
        theme: 'dark',
        dailyFocusGoalMinutes: 60,
      },
    ],
    tasks: [
      {
        id: 'task_done_1',
        userId: 'u_atif',
        title: 'Finish DBMS Normalization',
        description: '',
        priority: 'high',
        status: 'completed',
        dueDate: null,
        estimatedPomodoros: 2,
        completedPomodoros: 2,
        createdAt: '2026-11-26T06:00:00Z',
        updatedAt: '2026-11-26T06:30:00Z',
      },
      {
        id: 'task_todo_1',
        userId: 'u_atif',
        title: 'Incomplete Task',
        description: '',
        priority: 'low',
        status: 'todo',
        dueDate: null,
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        createdAt: '2026-11-26T06:00:00Z',
        updatedAt: '2026-11-26T06:00:00Z',
      },
    ],
    focusSessions: [
      {
        id: 'sess_valid_1',
        userId: 'u_atif',
        taskId: null,
        mode: 'work',
        durationMinutes: 25,
        durationSeconds: 1500,
        completed: true,
        startedAt: '2026-11-26T01:00:00Z', // 06:30 AM IST -> Early Bird!
        endedAt: '2026-11-26T01:25:00Z',
      },
      {
        id: 'sess_short_1',
        userId: 'u_atif',
        taskId: null,
        mode: 'work',
        durationMinutes: 2,
        durationSeconds: 120,
        completed: true,
        startedAt: '2026-11-26T03:00:00Z',
        endedAt: '2026-11-26T03:02:00Z',
      },
      {
        id: 'sess_incomplete_1',
        userId: 'u_atif',
        taskId: null,
        mode: 'work',
        durationMinutes: 25,
        durationSeconds: 1500,
        completed: false,
        startedAt: '2026-11-26T04:00:00Z',
        endedAt: '2026-11-26T04:25:00Z',
      },
    ],
    categories: [],
    recurringExpenses: [],
    bills: [],
    incomeTransactions: [],
    expenseTransactions: [],
    paymentHistory: [],
    timeBlocks: [],
    savingsGoals: [],
    subscriptions: [],
    envelopes: [],
    auditLogs: [],
    syncQueue: [],
    studyTiers: [],
    studySubjects: [],
    studyTopics: [
      {
        id: 'topic_mastered_1',
        userId: 'u_atif',
        subjectCode: 'DBMS',
        unit: 'Unit 1',
        topic: 'B+ Trees',
        subtopic: 'Insertion',
        theory: true,
        practice: true,
        pyq: false,
        priority: 'Medium',
        revisionCount: 0,
        createdAt: '2026-11-26T00:00:00Z',
        updatedAt: '2026-11-26T06:00:00Z',
      },
    ],
    studyRevisions: [],
    studyMistakes: [],
    gamificationProfiles: [],
    xpTransactions: [],
  };
}

describe('Phase 5 — Study RPG Gamification, XP, Achievements & Leaderboard', () => {
  it('computes level and XP progress accurately with progressive XP scaling', () => {
    assert.equal(XP_PER_LEVEL, 500);
    assert.equal(calculateLevel(0), 1);
    assert.equal(calculateLevel(499), 1);
    assert.equal(calculateLevel(500), 2);
    assert.equal(calculateLevel(1249), 2);
    assert.equal(calculateLevel(1250), 3);
    assert.equal(calculateLevel(2250), 4);
    assert.equal(calculateLevel(3500), 5);
    assert.equal(calculateLevel(-100), 1);

    // At 875 XP: Level 2 (starts at 500, needs 750 to reach 1250) -> 375 / 750 = 50%
    const prog = calculateXPProgress(875);
    assert.equal(prog.level, 2);
    assert.equal(prog.currentLevelXP, 375);
    assert.equal(prog.nextLevelXP, 1250);
    assert.equal(prog.levelXPRequired, 750);
    assert.equal(prog.progressPercent, 50);
  });

  it('awards XP for verified task completion and enforces strict idempotency', () => {
    const db = makeMockDb();

    // First valid completion -> 10 XP + First Step (25 XP) + Early Bird (40 XP from 06:30 IST session) = 75 XP
    const res1 = awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_task_1',
      source: 'task_completion',
      sourceId: 'task_done_1',
    });
    assert.equal(res1.awarded, true);
    assert.equal(res1.alreadyAwarded, false);
    assert.equal(res1.xpAdded, 75);
    assert.equal(res1.unlockedAchievements.some((a) => a.id === 'first_step'), true);

    // Repeated click / different eventId for same task -> blocked!
    const resDup = awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_task_1_retry',
      source: 'task_completion',
      sourceId: 'task_done_1',
    });
    assert.equal(resDup.awarded, false);
    assert.equal(resDup.alreadyAwarded, true);
    assert.equal(resDup.xpAdded, 0);

    // Incomplete task -> rejected!
    const resTodo = awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_task_todo',
      source: 'task_completion',
      sourceId: 'task_todo_1',
    });
    assert.equal(resTodo.awarded, false);
    assert.equal(resTodo.xpAdded, 0);
  });

  it('verifies focus sessions & topic mastery and rejects short/incomplete sessions', () => {
    const db = makeMockDb();

    const shortRes = awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_short',
      source: 'focus_session',
      sourceId: 'sess_short_1',
    });
    assert.equal(shortRes.awarded, false);

    const incRes = awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_inc',
      source: 'focus_session',
      sourceId: 'sess_incomplete_1',
    });
    assert.equal(incRes.awarded, false);

    const validFocus = awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_focus_1',
      source: 'focus_session',
      sourceId: 'sess_valid_1',
    });
    assert.equal(validFocus.awarded, true);
    assert.equal(validFocus.unlockedAchievements.some((a) => a.id === 'early_bird'), true);

    const validTopic = awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_topic_1',
      source: 'topic_completion',
      sourceId: 'topic_mastered_1',
    });
    assert.equal(validTopic.awarded, true);
    assert.ok(validTopic.profile.totalXP >= 90);
    assert.equal(validTopic.profile.dailyXP, validTopic.profile.totalXP);
    assert.equal(validTopic.profile.weeklyXP, validTopic.profile.totalXP);
    assert.equal(validTopic.profile.monthlyXP, validTopic.profile.totalXP);
  });

  it('paginates multiplayer leaderboard and computes currentUserRank safely', () => {
    const db = makeMockDb();
    awardAuthoritativeXP(db, 'u_atif', {
      eventId: 'ev_t1',
      source: 'task_completion',
      sourceId: 'task_done_1',
    });
    getGamificationSnapshot(db, 'u_puja');

    const page1 = getPaginatedGamificationLeaderboard(db, 'u_puja', {
      category: 'all_time',
      page: 1,
      limit: 1,
    });
    assert.equal(page1.entries.length, 1);
    assert.equal(page1.entries[0].userId, 'u_atif');
    assert.equal(page1.entries[0].rank, 1);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.currentUserRank, 2);

    const page2 = getPaginatedGamificationLeaderboard(db, 'u_puja', {
      category: 'all_time',
      page: 2,
      limit: 1,
    });
    assert.equal(page2.entries.length, 1);
    assert.equal(page2.entries[0].userId, 'u_puja');
    assert.equal(page2.entries[0].rank, 2);
    assert.equal(page2.hasMore, false);
  });
});
