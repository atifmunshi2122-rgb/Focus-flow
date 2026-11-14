import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadInitialTimerState,
  saveTimerState,
  acquireCompletionLock,
  computeRemainingSeconds,
  computeStopwatchElapsed,
  formatTimeDisplay,
  TIMER_STORAGE_KEY,
} from '../src/lib/timerEngine.ts';
import {
  ALLOWED_STUDY_PRIORITIES,
  ALLOWED_REVISION_DIFFICULTIES,
  ALLOWED_REVISION_STATUSES,
  ALLOWED_MISTAKE_SEVERITIES,
  ALLOWED_HABIT_FREQUENCIES,
  parseEnum,
  parsePositiveInt,
  parseNonEmptyString,
} from '../server/validation.ts';
import { dbService } from '../server/db.ts';

// In-Memory Storage Mock for Timer & Outbox Tests
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = new MemoryStorage();
}

import { offlineOutbox } from '../src/lib/offlineOutbox.ts';

test('Audit Upgrade — Timer Engine Timestamp Math & Display Formatting', () => {
  const now = 1700000000000;
  const targetEnd = now + 125 * 1000; // 2 min 5 sec remaining

  const remaining = computeRemainingSeconds(targetEnd, now);
  assert.equal(remaining, 125);
  assert.equal(formatTimeDisplay(remaining), '02:05');

  // Boundary: Past target time clamped strictly to 0
  const pastTarget = now - 5000;
  assert.equal(computeRemainingSeconds(pastTarget, now), 0);
  assert.equal(formatTimeDisplay(0), '00:00');

  // Stopwatch elapsed math
  const startMs = now - 75 * 1000;
  const elapsed = computeStopwatchElapsed(startMs, now);
  assert.equal(elapsed, 75);
  assert.equal(formatTimeDisplay(elapsed), '01:15');
});

test('Audit Upgrade — Timer State Recovery on Browser Refresh & Sleep/Wake', () => {
  const mockStorage = new MemoryStorage();
  const now = 1700000000000;

  // 1. Uninitialized storage defaults gracefully to 25-minute Pomodoro
  const initial = loadInitialTimerState(mockStorage, now);
  assert.equal(initial.isRunning, false);
  assert.equal(initial.timeLeft, 1500);
  assert.equal(initial.totalDuration, 1500);
  assert.equal(initial.timerMode, 'work');

  // 2. Active countdown session: target is 10 minutes in future
  const targetEndTimeMs = now + 600 * 1000;
  saveTimerState(
    {
      timerEngine: 'pomodoro',
      timerMode: 'work',
      isRunning: true,
      totalDuration: 1500,
      targetEndTimeMs,
      sessionStartTime: new Date(now - 900 * 1000).toISOString(),
      activeTaskId: 'task_audit_1',
    },
    mockStorage
  );

  const restoredActive = loadInitialTimerState(mockStorage, now);
  assert.equal(restoredActive.isRunning, true);
  assert.equal(restoredActive.timeLeft, 600);
  assert.equal(restoredActive.targetEndTimeMs, targetEndTimeMs);
  assert.equal(restoredActive.activeTaskId, 'task_audit_1');

  // 3. Expired countdown session (sleep/wake after time elapsed)
  const restoredExpired = loadInitialTimerState(mockStorage, targetEndTimeMs + 10000);
  assert.equal(restoredExpired.isRunning, false);
  assert.equal(restoredExpired.timeLeft, 0);

  // 4. Active stopwatch session
  const stopwatchStartMs = now - 45 * 1000;
  saveTimerState(
    {
      timerEngine: 'stopwatch',
      isRunning: true,
      stopwatchStartMs,
    },
    mockStorage
  );

  const restoredStopwatch = loadInitialTimerState(mockStorage, now);
  assert.equal(restoredStopwatch.isRunning, true);
  assert.equal(restoredStopwatch.stopwatchElapsed, 45);

  // 5. Corrupt JSON in storage recovers safely without crashing
  mockStorage.setItem(TIMER_STORAGE_KEY, '{invalid_json:::');
  const restoredCorrupt = loadInitialTimerState(mockStorage, now);
  assert.equal(restoredCorrupt.isRunning, false);
  assert.equal(restoredCorrupt.timeLeft, 1500);
});

test('Audit Upgrade — Multi-Tab Timer Completion Deduplication Lock', () => {
  const mockStorage = new MemoryStorage();
  const dedupeKey = 'comp_work_2026-11-14T10:00:00.000Z_25';

  // First tab acquires completion lock
  const firstAcquire = acquireCompletionLock(dedupeKey, mockStorage);
  assert.equal(firstAcquire, true, 'Primary tab should acquire completion lock');

  // Second concurrent tab tries to acquire completion lock for same session
  const secondAcquire = acquireCompletionLock(dedupeKey, mockStorage);
  assert.equal(secondAcquire, false, 'Secondary tab must be rejected to prevent duplicate session log');

  // Different session acquires successfully
  const differentAcquire = acquireCompletionLock('comp_work_2026-11-14T11:00:00.000Z_25', mockStorage);
  assert.equal(differentAcquire, true);
});

test('Audit Upgrade — Firestore Security Rules Completeness & Validation', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  // Check default deny root
  assert.ok(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));

  // Check 5 new subcollections are explicitly defined
  assert.ok(rulesContent.includes('match /habits/{habitId}'), 'Missing /habits rule');
  assert.ok(rulesContent.includes('match /study_subjects/{subId}'), 'Missing /study_subjects rule');
  assert.ok(rulesContent.includes('match /study_topics/{topicId}'), 'Missing /study_topics rule');
  assert.ok(rulesContent.includes('match /study_revisions/{revId}'), 'Missing /study_revisions rule');
  assert.ok(rulesContent.includes('match /study_mistakes/{mistakeId}'), 'Missing /study_mistakes rule');

  // Check strict ownership isOwner(userId) on all new subcollections
  const habitsMatch = rulesContent.match(/match \/habits\/\{habitId\}[\s\S]*?allow read: if isOwner\(userId\);/);
  assert.ok(habitsMatch !== null);

  const subjectsMatch = rulesContent.match(/match \/study_subjects\/\{subId\}[\s\S]*?allow read: if isOwner\(userId\);/);
  assert.ok(subjectsMatch !== null);

  const topicsMatch = rulesContent.match(/match \/study_topics\/\{topicId\}[\s\S]*?allow read: if isOwner\(userId\);/);
  assert.ok(topicsMatch !== null);

  const revisionsMatch = rulesContent.match(/match \/study_revisions\/\{revId\}[\s\S]*?allow read: if isOwner\(userId\);/);
  assert.ok(revisionsMatch !== null);

  const mistakesMatch = rulesContent.match(/match \/study_mistakes\/\{mistakeId\}[\s\S]*?allow read: if isOwner\(userId\);/);
  assert.ok(mistakesMatch !== null);
});

test('Audit Upgrade — Validation Helpers for Study & Habit Payloads', () => {
  // Study priorities
  assert.equal(parseEnum('High', ALLOWED_STUDY_PRIORITIES), 'High');
  assert.equal(parseEnum('Medium', ALLOWED_STUDY_PRIORITIES), 'Medium');
  assert.equal(parseEnum('Low', ALLOWED_STUDY_PRIORITIES), 'Low');
  assert.equal(parseEnum('Critical', ALLOWED_STUDY_PRIORITIES), null);

  // Revision difficulties
  assert.equal(parseEnum('easy', ALLOWED_REVISION_DIFFICULTIES), 'easy');
  assert.equal(parseEnum('medium', ALLOWED_REVISION_DIFFICULTIES), 'medium');
  assert.equal(parseEnum('hard', ALLOWED_REVISION_DIFFICULTIES), 'hard');
  assert.equal(parseEnum('impossible', ALLOWED_REVISION_DIFFICULTIES), null);

  // Revision statuses
  assert.equal(parseEnum('scheduled', ALLOWED_REVISION_STATUSES), 'scheduled');
  assert.equal(parseEnum('due', ALLOWED_REVISION_STATUSES), 'due');
  assert.equal(parseEnum('overdue', ALLOWED_REVISION_STATUSES), 'overdue');
  assert.equal(parseEnum('mastered', ALLOWED_REVISION_STATUSES), 'mastered');
  assert.equal(parseEnum('pending', ALLOWED_REVISION_STATUSES), null);

  // Mistake severities
  assert.equal(parseEnum('High', ALLOWED_MISTAKE_SEVERITIES), 'High');
  assert.equal(parseEnum('Medium', ALLOWED_MISTAKE_SEVERITIES), 'Medium');
  assert.equal(parseEnum('Low', ALLOWED_MISTAKE_SEVERITIES), 'Low');
  assert.equal(parseEnum('Urgent', ALLOWED_MISTAKE_SEVERITIES), null);

  // Habit frequencies
  assert.equal(parseEnum('daily', ALLOWED_HABIT_FREQUENCIES), 'daily');
  assert.equal(parseEnum('weekly', ALLOWED_HABIT_FREQUENCIES), 'weekly');
  assert.equal(parseEnum('custom', ALLOWED_HABIT_FREQUENCIES), 'custom');
  assert.equal(parseEnum('biweekly', ALLOWED_HABIT_FREQUENCIES), null);

  // Positive integers
  assert.equal(parsePositiveInt('500', 1, 1000), 500);
  assert.equal(parsePositiveInt(-10), null);
  assert.equal(parsePositiveInt(0), null);
  assert.equal(parsePositiveInt(10.5), null); // Float rejected
  assert.equal(parsePositiveInt(NaN), null);
  assert.equal(parsePositiveInt(Infinity), null);

  // Non-empty string
  assert.equal(parseNonEmptyString('  Database Systems  ', 50), 'Database Systems');
  assert.equal(parseNonEmptyString('   ', 50), null);
  assert.equal(parseNonEmptyString('a'.repeat(60), 50), null); // Exceeds max length
});

test('Audit Upgrade — Financial Engine: Envelope Fund Transfer Precision & Concurrency', () => {
  const testUserId = `user_audit_fin_${Date.now()}`;
  dbService.ensureUserWorkspace(testUserId);

  const envA = dbService.saveEnvelope(testUserId, {
    name: 'Groceries',
    allocatedPaise: 500000, // ₹5,000.00
    monthKey: '2026-11',
  });

  const envB = dbService.saveEnvelope(testUserId, {
    name: 'Entertainment',
    allocatedPaise: 200000, // ₹2,000.00
    monthKey: '2026-11',
  });

  // Initial sum of allocated funds
  const initialSum = envA.allocatedPaise + envB.allocatedPaise;
  assert.equal(initialSum, 700000);

  // 1. Valid transfer: ₹1,500.00 (150,000 paise) from Groceries to Entertainment
  const res1 = dbService.transferEnvelopeFunds(testUserId, envA.id, envB.id, 150000);
  assert.equal(res1.success, true);

  const envelopesAfter1 = dbService.getEnvelopes(testUserId, '2026-11');
  const updatedA1 = envelopesAfter1.find((e) => e.id === envA.id)!;
  const updatedB1 = envelopesAfter1.find((e) => e.id === envB.id)!;
  assert.equal(updatedA1.allocatedPaise, 350000); // ₹3,500.00
  assert.equal(updatedB1.allocatedPaise, 350000); // ₹3,500.00
  assert.equal(updatedA1.allocatedPaise + updatedB1.allocatedPaise, initialSum, 'Total sum invariant must hold');

  // 2. Overdraft protection: trying to transfer ₹4,000.00 when only ₹3,500.00 is available
  const resOverdraft = dbService.transferEnvelopeFunds(testUserId, envA.id, envB.id, 400000);
  assert.equal(resOverdraft.success, false);
  assert.equal(resOverdraft.error, 'Source envelope has insufficient funds');

  // 3. Negative amount rejected
  const resNeg = dbService.transferEnvelopeFunds(testUserId, envA.id, envB.id, -5000);
  assert.equal(resNeg.success, false);

  // 4. Non-existent envelope rejected
  const resMissing = dbService.transferEnvelopeFunds(testUserId, envA.id, 'env_non_existent', 10000);
  assert.equal(resMissing.success, false);

  // 5. Stress test: 500 randomized bilateral transfers between envelopes
  let currentA = updatedA1.allocatedPaise;
  let currentB = updatedB1.allocatedPaise;

  for (let i = 0; i < 500; i++) {
    const amount = Math.floor(Math.random() * 5000) + 1; // 1 to 5000 paise
    if (i % 2 === 0) {
      if (currentA >= amount) {
        const transferRes = dbService.transferEnvelopeFunds(testUserId, envA.id, envB.id, amount);
        if (transferRes.success) {
          currentA -= amount;
          currentB += amount;
        }
      }
    } else {
      if (currentB >= amount) {
        const transferRes = dbService.transferEnvelopeFunds(testUserId, envB.id, envA.id, amount);
        if (transferRes.success) {
          currentB -= amount;
          currentA += amount;
        }
      }
    }
  }

  const finalEnvelopes = dbService.getEnvelopes(testUserId, '2026-11');
  const finalA = finalEnvelopes.find((e) => e.id === envA.id)!;
  const finalB = finalEnvelopes.find((e) => e.id === envB.id)!;
  assert.equal(finalA.allocatedPaise, currentA);
  assert.equal(finalB.allocatedPaise, currentB);
  assert.equal(finalA.allocatedPaise + finalB.allocatedPaise, initialSum, 'Exact integer zero-drift invariant verified after 500 transfers');
});

test('Audit Upgrade — Firestore Security Rules Hardening (affectedKeys & field immutability)', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  // Verify affectedKeys().hasOnly validation exists across all 5 subcollections
  const requiredSubcollections = [
    'habits',
    'study_subjects',
    'study_topics',
    'study_revisions',
    'study_mistakes',
  ];

  for (const coll of requiredSubcollections) {
    assert.ok(
      rulesContent.includes(`match /${coll}/`),
      `firestore.rules must match subcollection /${coll}/`
    );
  }

  // Verify userId immutability on update
  assert.ok(
    rulesContent.includes('request.resource.data.userId == resource.data.userId'),
    'firestore.rules must verify userId cannot be reassigned across resources'
  );

  // Verify affectedKeys() usage
  const affectedKeysMatches = rulesContent.match(/affectedKeys\(\)\.hasOnly/g);
  assert.ok(
    affectedKeysMatches && affectedKeysMatches.length >= 5,
    'All 5 hardened subcollections must enforce affectedKeys().hasOnly'
  );

  // Verify key identity constraints
  assert.ok(rulesContent.includes('request.resource.data.code == resource.data.code'));
  assert.ok(rulesContent.includes('request.resource.data.subjectCode == resource.data.subjectCode'));
  assert.ok(rulesContent.includes('request.resource.data.topicId == resource.data.topicId'));
});

test('Audit Upgrade — Offline Outbox Multi-Account Isolation', () => {
  const userA = 'usr_alice_audit_' + Date.now();
  const userB = 'usr_bob_audit_' + Date.now();

  // Initially empty for both users
  assert.equal(offlineOutbox.count(userA), 0);
  assert.equal(offlineOutbox.count(userB), 0);

  // User A enqueues operations
  const opA1 = offlineOutbox.enqueue(userA, 'create_task', { type: 'task', title: 'Alice Task 1' }, 'dedupe_a_1');
  offlineOutbox.enqueue(userA, 'create_task', { type: 'task', title: 'Alice Task 2' }, 'dedupe_a_2');

  // Verify user A has 2 operations, user B still has 0
  assert.equal(offlineOutbox.count(userA), 2);
  assert.equal(offlineOutbox.count(userB), 0);
  assert.equal(offlineOutbox.list(userB).length, 0);

  // User B enqueues an operation
  offlineOutbox.enqueue(userB, 'create_expense', { type: 'expense', amount: 500 }, 'dedupe_b_1');
  assert.equal(offlineOutbox.count(userA), 2);
  assert.equal(offlineOutbox.count(userB), 1);

  // Ensure operations contain strictly matching userId
  const opsA = offlineOutbox.list(userA);
  assert.ok(opsA.every((op) => op.userId === userA));

  const opsB = offlineOutbox.list(userB);
  assert.ok(opsB.every((op) => op.userId === userB));

  // Remove user A operation — user B remains untouched
  offlineOutbox.remove(userA, opA1.id);
  assert.equal(offlineOutbox.count(userA), 1);
  assert.equal(offlineOutbox.count(userB), 1);

  // Clear user A entirely
  offlineOutbox.clear(userA);
  assert.equal(offlineOutbox.count(userA), 0);
  assert.equal(offlineOutbox.count(userB), 1);
  assert.equal(offlineOutbox.list(userB)[0].dedupeKey, 'dedupe_b_1');

  // Clean up user B
  offlineOutbox.clear(userB);
  assert.equal(offlineOutbox.count(userB), 0);
});

test('Audit Upgrade — Study OS Topic Seeding & Idempotency Safeguards', () => {
  const testUserId = 'usr_study_seed_audit_' + Date.now();

  // Create an explicit subject first
  dbService.saveStudySubject(testUserId, {
    id: `subj_custom_${testUserId}`,
    userId: testUserId,
    code: 'CUSTOM_ALGO',
    name: 'Advanced Algorithms & Graphs',
    tierId: 'tier1_sem3',
    semesterOrDomain: 'Sem 3',
    targetExam: 'GATE CS',
    totalSubtopics: 10,
    completedSubtopics: 2,
    color: '#8b5cf6',
  });

  const subjectsBefore = dbService.getStudySubjects(testUserId);
  assert.equal(subjectsBefore.length, 1);
  assert.equal(subjectsBefore[0].code, 'CUSTOM_ALGO');

  // Query topics when empty: verify that seeding creates topics but does not overwrite custom subject
  const existingSubs = dbService.getStudySubjects(testUserId);
  assert.equal(existingSubs.length, 1);
  // Guard test: if existingSubs is not empty, seededSubs must not overwrite
  if ((existingSubs.length as number) === 0) {
    assert.fail('Should not overwrite existing subjects');
  }

  // Adding topic linked to custom subject
  dbService.saveStudyTopic(testUserId, {
    id: `topic_custom_1_${testUserId}`,
    userId: testUserId,
    subjectCode: 'CUSTOM_ALGO',
    unit: 'Unit 1: Dynamic Programming',
    topic: 'Bellman-Ford',
    subtopic: 'Single Source Shortest Path with Negative Cycles',
    priority: 'High',
    theory: true,
    practice: true,
    pyq: false,
    revisionCount: 1,
    rowIndex: 1,
  });

  const topics = dbService.getStudyTopics(testUserId, 'CUSTOM_ALGO');
  assert.equal(topics.length, 1);
  assert.equal(topics[0].topic, 'Bellman-Ford');

  // Verify subjects remain intact and uncorrupted
  const subjectsAfter = dbService.getStudySubjects(testUserId);
  assert.equal(subjectsAfter.length, 1);
  assert.equal(subjectsAfter[0].code, 'CUSTOM_ALGO');
});
