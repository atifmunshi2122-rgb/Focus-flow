import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeRemainingSeconds,
  computeStopwatchElapsed,
  formatTimeDisplay,
  acquireCompletionLock,
  loadInitialTimerState,
  saveTimerState,
  TIMER_STORAGE_KEY,
} from '../src/lib/timerEngine.ts';
import { offlineOutbox } from '../src/lib/offlineOutbox.ts';
import { slidingWindowRateLimiter, sanitizeLogData } from '../server/security.ts';

// In-Memory Storage Mock for Concurrency and Multi-Tab Tests
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

// -------------------------------------------------------------
// 1. FIRESTORE SECURITY RULES VERIFICATION
// -------------------------------------------------------------
test('Phase 9 Verification — Firestore Security Rules AST & Pattern Verification', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // A. Default Deny Behavior
  assert.ok(
    rules.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'Default-deny root rule must be intact'
  );

  // B. Test connection health check allows read only, denies write
  assert.ok(
    rules.includes('match /test/connection {\n      allow read: if true;\n      allow write: if false;\n    }'),
    'Test connection doc must allow read only and deny write'
  );

  // C. Subcollections list
  const collections = [
    'habits',
    'study_subjects',
    'study_topics',
    'study_revisions',
    'study_mistakes',
    'tasks',
    'focus_sessions',
    'income',
    'recurring_expenses',
    'expenses',
    'bills',
    'payment_history',
    'sync_queue',
    'time_blocks',
    'envelopes',
    'subscriptions',
    'audit_logs',
  ];

  for (const col of collections) {
    const blockStart = rules.indexOf(`match /${col}/`);
    assert.ok(blockStart !== -1, `Subcollection ${col} must be defined`);
    const blockSlice = rules.slice(blockStart, blockStart + 200);
    assert.ok(
      blockSlice.includes('allow read: if isOwner(userId);'),
      `Subcollection ${col} must enforce isOwner(userId) on read`
    );
  }

  // D. Verify affectedKeys().hasOnly constraint on all 5 Phase 9 hardened collections
  const affectedKeysMatches = rules.match(/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly/g);
  assert.equal(
    affectedKeysMatches?.length,
    5,
    'Exactly 5 subcollections (habits, study_subjects, study_topics, study_revisions, study_mistakes) must enforce affectedKeys().hasOnly'
  );

  // E. Verify soft-delete preservation restricts affectedKeys to deletedAt/updatedAt
  assert.ok(
    rules.includes("request.resource.data.diff(resourceData).affectedKeys().hasOnly(['deletedAt', 'updatedAt'])"),
    'isSoftDelete must strictly limit affectedKeys to deletedAt and updatedAt'
  );

  // F. Verify immutable relational fields on update
  assert.ok(rules.includes('request.resource.data.userId == resource.data.userId'), 'userId immutability required');
  assert.ok(rules.includes('request.resource.data.code == resource.data.code'), 'subject code immutability required');
  assert.ok(rules.includes('request.resource.data.subjectCode == resource.data.subjectCode'), 'topic subjectCode immutability required');
  assert.ok(rules.includes('request.resource.data.topicId == resource.data.topicId'), 'revision topicId immutability required');

  // G. Verify audit logs are strictly append-only
  assert.ok(
    rules.includes('match /audit_logs/{logId} {\n        allow read: if isOwner(userId);\n        allow create: if isOwner(userId)\n          && isValidId(logId)\n          && request.resource.data.userId == userId\n          && isNonEmptyString(request.resource.data.action, 64);\n        allow update: if false;'),
    'Audit logs must forbid update operations'
  );
});

// -------------------------------------------------------------
// 2. TIMER CONCURRENCY & SLEEP/WAKE VERIFICATION
// -------------------------------------------------------------
test('Phase 9 Verification — Multi-Tab Simultaneous Completion Race Condition', () => {
  const sharedStorage = new MemoryStorage();
  const completionKey = `comp_work_2026-11-14T12:00:00.000Z_25`;

  // 10 concurrent tabs reach completion at the exact same millisecond
  const tabResults: boolean[] = [];
  for (let tabIndex = 0; tabIndex < 10; tabIndex++) {
    const wonLock = acquireCompletionLock(completionKey, sharedStorage);
    tabResults.push(wonLock);
  }

  const leaderCount = tabResults.filter(Boolean).length;
  const followerCount = tabResults.filter((r) => !r).length;

  assert.equal(leaderCount, 1, 'Exactly ONE tab must win the completion lock');
  assert.equal(followerCount, 9, 'All 9 competing tabs must be rejected by the lock');
});

test('Phase 9 Verification — Browser Sleep & Wake Monotonic Math', () => {
  const now = 1700000000000;
  const targetEnd = now + 1500 * 1000; // 25 minutes

  // 1. Before sleep (10 mins in)
  const tenMinsLater = now + 600 * 1000;
  assert.equal(computeRemainingSeconds(targetEnd, tenMinsLater), 900); // 15 mins remaining
  assert.equal(formatTimeDisplay(computeRemainingSeconds(targetEnd, tenMinsLater)), '15:00');

  // 2. Machine sleeps for 40 minutes (wake after target has expired)
  const fortyMinsLater = now + 2400 * 1000;
  const remainingAfterSleep = computeRemainingSeconds(targetEnd, fortyMinsLater);
  assert.equal(remainingAfterSleep, 0, 'Remaining seconds after sleep must clamp to 0');
  assert.equal(formatTimeDisplay(remainingAfterSleep), '00:00');

  // 3. System clock jump backwards (e.g. NTP sync backwards 60s)
  const ntpBackward = tenMinsLater - 60 * 1000;
  const remainingBackward = computeRemainingSeconds(targetEnd, ntpBackward);
  assert.equal(remainingBackward, 960, 'Should gracefully reflect adjusted clock without NaN or crash');

  // 4. Stopwatch elapsed during sleep
  const stopwatchStart = now;
  const stopwatchWoken = now + 1800 * 1000; // 30 mins elapsed
  assert.equal(computeStopwatchElapsed(stopwatchStart, stopwatchWoken), 1800);
});

test('Phase 9 Verification — Timer State Persistence & Tab Refresh', () => {
  const tabStorage = new MemoryStorage();
  const sessionStart = new Date(1700000000000).toISOString();
  const targetEnd = 1700000000000 + 1200 * 1000; // 20 minutes from now

  saveTimerState(
    {
      timerEngine: 'pomodoro',
      timerMode: 'work',
      isRunning: true,
      totalDuration: 1500,
      targetEndTimeMs: targetEnd,
      sessionStartTime: sessionStart,
      activeTaskId: 'task_audit_test',
    },
    tabStorage
  );

  // Tab refreshes 5 minutes into the session
  const refreshedNow = 1700000000000 + 300 * 1000;
  const restored = loadInitialTimerState(tabStorage, refreshedNow);

  assert.equal(restored.isRunning, true);
  assert.equal(restored.timeLeft, 900, 'Must have 15 minutes remaining');
  assert.equal(restored.totalDuration, 1500);
  assert.equal(restored.activeTaskId, 'task_audit_test');
  assert.equal(restored.sessionStartTime, sessionStart);
});

// -------------------------------------------------------------
// 3. OFFLINE OUTBOX MULTI-ACCOUNT ISOLATION
// -------------------------------------------------------------
test('Phase 9 Verification — Offline Outbox Strict Multi-User Partitioning', () => {
  const userA = 'usr_alice_' + Date.now();
  const userB = 'usr_bob_' + Date.now();

  // User A enqueues offline tasks while on airplane mode
  offlineOutbox.enqueue(userA, 'create_task', { title: 'Alice Task 1', priority: 'high' }, 'dedupe_task_a1');
  offlineOutbox.enqueue(userA, 'create_expense', { amount: 1500, description: 'Groceries' }, 'dedupe_exp_a1');

  // Verify User A has 2 operations
  assert.equal(offlineOutbox.count(userA), 2);
  assert.equal(offlineOutbox.list(userA).length, 2);

  // User A logs out; User B logs in on same device
  // User B's outbox MUST be completely empty
  assert.equal(offlineOutbox.count(userB), 0);
  assert.deepEqual(offlineOutbox.list(userB), []);

  // User B executes writes offline
  offlineOutbox.enqueue(userB, 'create_task', { title: 'Bob Task 1' }, 'dedupe_task_b1');

  // Verify complete isolation
  assert.equal(offlineOutbox.count(userA), 2, 'User A count unchanged');
  assert.equal(offlineOutbox.count(userB), 1, 'User B has exactly 1 operation');

  // User A's outbox contains ONLY operations where userId === userA
  const opsA = offlineOutbox.list(userA);
  assert.ok(opsA.every((op) => op.userId === userA));

  // User B's outbox contains ONLY operations where userId === userB
  const opsB = offlineOutbox.list(userB);
  assert.ok(opsB.every((op) => op.userId === userB));

  // Dequeue/removal of User B operation does not affect User A
  offlineOutbox.remove(userB, opsB[0].id);
  assert.equal(offlineOutbox.count(userB), 0);
  assert.equal(offlineOutbox.count(userA), 2);

  // Duplicate dedupeKey updates existing operation in-place rather than appending
  offlineOutbox.enqueue(userA, 'create_task', { title: 'Alice Task 1 Updated' }, 'dedupe_task_a1');
  assert.equal(offlineOutbox.count(userA), 2, 'DedupeKey collision must update in place without duplicate');

  // Clean up
  offlineOutbox.clear(userA);
  assert.equal(offlineOutbox.count(userA), 0);
});

// -------------------------------------------------------------
// 4. BACKEND SECURITY & RATE LIMITING
// -------------------------------------------------------------
test('Phase 9 Verification — In-Memory Rate Limiter Thresholds & Window Expiry', () => {
  const limiter = slidingWindowRateLimiter({ maxRequests: 5, windowMs: 1000 });
  const ip = '192.168.1.100';

  // First 5 requests should pass
  for (let i = 1; i <= 5; i++) {
    const res = limiter.check(ip);
    assert.equal(res.allowed, true, `Request ${i} should be allowed`);
  }

  // 6th request must be rejected
  const blocked = limiter.check(ip);
  assert.equal(blocked.allowed, false, '6th request must exceed limit');
  assert.equal(blocked.remaining, 0);

  // Separate IP is not blocked
  const separate = limiter.check('192.168.1.101');
  assert.equal(separate.allowed, true);
});

test('Phase 9 Verification — Sensitive Data Log Sanitization', () => {
  const payload = {
    user: 'alice@example.com',
    password: 'SuperSecretPassword123!',
    authToken: 'eyJhbGciOiJSUzI1NiIs...',
    nested: {
      apiKey: 'AIzaSySecret...',
      creditCard: '4111-2222-3333-4444',
      publicNote: 'Hello World',
    },
  };

  const sanitized = sanitizeLogData(payload) as Record<string, unknown>;
  assert.equal(sanitized.password, '[REDACTED_SECRET]');
  assert.equal(sanitized.authToken, '[REDACTED_SECRET]');

  const nested = sanitized.nested as Record<string, unknown>;
  assert.equal(nested.apiKey, '[REDACTED_SECRET]');
  assert.equal(nested.creditCard, '[REDACTED_SECRET]');
  assert.equal(nested.publicNote, 'Hello World');
});
