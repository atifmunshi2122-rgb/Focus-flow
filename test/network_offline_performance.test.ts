import test from 'node:test';
import assert from 'node:assert/strict';

// In-memory localStorage mock for Node test runner
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = new MemoryStorage();
}

import { clientDataCache } from '../src/lib/dataCache.ts';
import { offlineOutbox } from '../src/lib/offlineOutbox.ts';
import { getNetworkConnectionInfo } from '../src/lib/networkQuality.ts';
import type { OfflineOutboxOperation } from '../src/types/index.ts';

test('clientDataCache — user isolation prevents cross-account data leakage', () => {
  clientDataCache.setActiveUser('user_alpha');
  clientDataCache.set('tasks', [{ id: 't1', title: 'Task Alpha' }]);
  assert.equal((clientDataCache.get('tasks') as any)?.[0]?.title, 'Task Alpha');

  // Switch to user_beta -> user_alpha cache should be flushed
  clientDataCache.setActiveUser('user_beta');
  assert.equal(clientDataCache.get('tasks'), null);

  // Set user_beta data
  clientDataCache.set('tasks', [{ id: 't2', title: 'Task Beta' }]);
  assert.equal((clientDataCache.get('tasks') as any)?.[0]?.title, 'Task Beta');

  // Switch back to user_alpha -> user_beta data must NOT leak to user_alpha
  clientDataCache.setActiveUser('user_alpha');
  assert.equal(clientDataCache.get('tasks'), null);

  // Cleanup
  clientDataCache.clear();
});

test('clientDataCache — TTL expiration and getWithStale behavior', async () => {
  clientDataCache.setActiveUser('test_ttl_user');
  clientDataCache.set('quick_metric', { score: 99 });

  // Immediate read within 100ms TTL is valid
  const fresh = clientDataCache.get('quick_metric', 100);
  assert.deepEqual(fresh, { score: 99 });

  // Wait 120ms to exceed 100ms TTL
  await new Promise((resolve) => setTimeout(resolve, 120));

  // Expired read returns null
  const expired = clientDataCache.get('quick_metric', 100);
  assert.equal(expired, null);

  // getWithStale returns stale data with isStale: true for SWR rendering
  const staleCheck = clientDataCache.getWithStale('quick_metric', 100);
  assert.deepEqual(staleCheck.data, { score: 99 });
  assert.equal(staleCheck.isStale, true);

  clientDataCache.clear();
});

test('clientDataCache — request deduplication collapses concurrent identical calls into one', async () => {
  clientDataCache.setActiveUser('test_dedupe_user');
  let executionCount = 0;

  const expensiveFetch = async () => {
    executionCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { data: 'heavy_payload', count: executionCount };
  };

  // Launch 10 simultaneous requests for the same key
  const promises = Array.from({ length: 10 }, () =>
    clientDataCache.dedupe('expensive_resource', expensiveFetch)
  );

  const results = await Promise.all(promises);

  // Assert execution occurred exactly ONCE across all 10 callers
  assert.equal(executionCount, 1);
  results.forEach((res) => {
    assert.deepEqual(res, { data: 'heavy_payload', count: 1 });
  });

  clientDataCache.clear();
});

test('clientDataCache — domain-specific invalidation clears targets while preserving unrelated domains', () => {
  clientDataCache.setActiveUser('invalidation_user');
  clientDataCache.set('tasks', [{ id: 'task_1' }]);
  clientDataCache.set('bills', [{ id: 'bill_1' }]);
  clientDataCache.set('dashboard', { kpis: 123 });

  // Invalidate only tasks
  clientDataCache.invalidate('tasks');
  assert.equal(clientDataCache.get('tasks'), null);
  assert.notEqual(clientDataCache.get('bills'), null);
  assert.notEqual(clientDataCache.get('dashboard'), null);

  // Clear everything
  clientDataCache.clear();
  assert.equal(clientDataCache.get('bills'), null);
  assert.equal(clientDataCache.get('dashboard'), null);
});

test('offlineOutbox — exponential backoff and retry eligibility calculation', () => {
  const testUserId = 'test_backoff_user';
  const now = new Date();

  // Operation with 0 attempts is eligible immediately
  const opNew: OfflineOutboxOperation = {
    id: 'op_new_1',
    userId: testUserId,
    dedupeKey: 'key_1',
    operationType: 'create_task',
    payload: { title: 'Fresh Task' },
    createdAt: now.toISOString(),
    attempts: 0,
  };
  assert.equal(offlineOutbox.isEligibleForRetry(opNew), true);

  // Operation attempted 100ms ago with 3 attempts (backoff: 1000 * 2^3 = 8000ms)
  const opRecentAttempt: OfflineOutboxOperation = {
    id: 'op_recent_1',
    userId: testUserId,
    dedupeKey: 'key_2',
    operationType: 'save_study_goal',
    payload: { title: 'Study Goal' },
    createdAt: new Date(Date.now() - 60000).toISOString(),
    attempts: 3,
    lastAttemptAt: new Date(Date.now() - 500).toISOString(), // 500ms ago < 8000ms backoff
  };
  assert.equal(offlineOutbox.isEligibleForRetry(opRecentAttempt), false);

  // Operation attempted 35 seconds ago with 3 attempts (exceeds max backoff cap of 30s)
  const opMaturedAttempt: OfflineOutboxOperation = {
    id: 'op_matured_1',
    userId: testUserId,
    dedupeKey: 'key_3',
    operationType: 'save_study_flashcard',
    payload: { question: 'Q1' },
    createdAt: new Date(Date.now() - 60000).toISOString(),
    attempts: 3,
    lastAttemptAt: new Date(Date.now() - 35000).toISOString(), // 35s ago > 30s cap
  };
  assert.equal(offlineOutbox.isEligibleForRetry(opMaturedAttempt), true);
});

test('offlineOutbox — supports all Study operation types with deduplication and persistence', () => {
  const testUserId = 'test_study_outbox_user';

  // Clear any existing queue
  const existing = offlineOutbox.list(testUserId);
  existing.forEach((op) => offlineOutbox.remove(testUserId, op.id));
  assert.equal(offlineOutbox.count(testUserId), 0);

  // Enqueue various study entity mutations
  offlineOutbox.enqueue(testUserId, 'save_study_goal', { id: 'g1', title: 'Target 10h' }, 'goal_g1');
  offlineOutbox.enqueue(testUserId, 'save_study_flashcard', { id: 'fc1', question: 'Q' }, 'fc_fc1');
  offlineOutbox.enqueue(testUserId, 'save_study_quiz', { id: 'qz1', title: 'Math Quiz' }, 'quiz_qz1');
  offlineOutbox.enqueue(testUserId, 'save_study_plan', { id: 'pl1', title: 'Weekly Plan' }, 'plan_pl1');
  offlineOutbox.enqueue(testUserId, 'save_study_plan_task', { id: 'pt1', title: 'Read Ch 1' }, 'pt_pt1');
  offlineOutbox.enqueue(testUserId, 'save_study_note', { id: 'nt1', title: 'Lecture 1' }, 'note_nt1');
  offlineOutbox.enqueue(testUserId, 'save_study_exam', { id: 'ex1', title: 'Final' }, 'exam_ex1');
  offlineOutbox.enqueue(testUserId, 'save_study_resource', { id: 'rs1', title: 'Formula Sheet' }, 'res_rs1');

  assert.equal(offlineOutbox.count(testUserId), 8);

  // Deduplication check: updating the same dedupeKey should update in-place without increasing count
  offlineOutbox.enqueue(testUserId, 'save_study_goal', { id: 'g1', title: 'Target 12h Updated' }, 'goal_g1');
  assert.equal(offlineOutbox.count(testUserId), 8);

  const queue = offlineOutbox.list(testUserId);
  const updatedGoal = queue.find((op) => op.dedupeKey === 'goal_g1');
  assert.equal((updatedGoal?.payload as any)?.title, 'Target 12h Updated');

  // Clean up
  queue.forEach((op) => offlineOutbox.remove(testUserId, op.id));
  assert.equal(offlineOutbox.count(testUserId), 0);
});

test('networkQuality — detects connection info and constrained network status', () => {
  const info = getNetworkConnectionInfo();
  assert.ok(info);
  assert.ok(typeof info.isConstrained === 'boolean');
  assert.ok(typeof info.saveData === 'boolean');
  assert.ok(['slow-2g', '2g', '3g', '4g', 'unknown'].includes(info.effectiveType));
});
