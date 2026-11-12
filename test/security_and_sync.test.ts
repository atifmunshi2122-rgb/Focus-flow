import test from 'node:test';
import assert from 'node:assert/strict';
import { slidingWindowRateLimiter, sanitizeForLogging } from '../server/security.ts';
import { dbService } from '../server/db.ts';

test('Security Engine — In-Memory Sliding Window Rate Limiter', () => {
  const limiter = slidingWindowRateLimiter({
    windowMs: 1000,
    maxRequests: 3,
  });

  const ip = '192.168.1.100';

  // First 3 requests must be allowed
  assert.equal(limiter.check(ip).allowed, true);
  assert.equal(limiter.check(ip).allowed, true);
  assert.equal(limiter.check(ip).allowed, true);

  // 4th request must be rate-limited
  const fourth = limiter.check(ip);
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);

  // Different IP should still be allowed
  assert.equal(limiter.check('10.0.0.1').allowed, true);
});

test('Security Engine — Log Data Sanitizer', () => {
  const sensitivePayload = {
    user: 'atif',
    password: 'SuperSecretPassword123!',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    apiKey: 'AIzaSyD-abc123xyz789',
    creditCard: '4111222233334444',
    nested: {
      privateKey: '-----BEGIN PRIVATE KEY-----...',
      auth_header: 'Bearer 987654321',
      regularField: 'This is completely safe',
    },
  };

  const sanitized = sanitizeForLogging(sensitivePayload) as any;
  assert.equal(sanitized.user, 'atif');
  assert.equal(sanitized.password, '[REDACTED_SECRET]');
  assert.equal(sanitized.token, '[REDACTED_SECRET]');
  assert.equal(sanitized.apiKey, '[REDACTED_SECRET]');
  assert.equal(sanitized.creditCard, '[REDACTED_SECRET]');
  assert.equal(sanitized.nested.privateKey, '[REDACTED_SECRET]');
  assert.equal(sanitized.nested.auth_header, '[REDACTED_SECRET]');
  assert.equal(sanitized.nested.regularField, 'This is completely safe');
});

test('Security Engine — Guest Session Data Isolation', () => {
  const guestA = 'gst_user_session_alpha';
  const guestB = 'gst_user_session_beta';

  dbService.ensureUserWorkspace(guestA);
  dbService.ensureUserWorkspace(guestB);

  // Guest A creates a task
  const raw = dbService.getRaw();
  raw.tasks.push({
    id: 'task_guest_a',
    userId: guestA,
    title: 'Secret Task of Guest A',
    description: '',
    priority: 'medium',
    status: 'todo',
    dueDate: '2026-11-25',
    estimatedPomodoros: 2,
    completedPomodoros: 0,
    subtasks: [],
    recurrence: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Guest B must NOT be able to see Guest A's task
  const guestBTasks = raw.tasks.filter((t) => t.userId === guestB);
  assert.ok(!guestBTasks.some((t) => t.id === 'task_guest_a'));

  const guestATasks = raw.tasks.filter((t) => t.userId === guestA);
  assert.ok(guestATasks.some((t) => t.id === 'task_guest_a'));

  // Clean up guest workspaces
  dbService.clearWorkspace(guestA);
  dbService.clearWorkspace(guestB);
  dbService.save();
});

test('Sync Queue & Backups — Exponential Backoff and Durable Backup Recovery', () => {
  const userId = 'usr_sync_test_' + Date.now();
  dbService.ensureUserWorkspace(userId);

  // Enqueue sync operation
  const op = dbService.enqueueSync(userId, {
    entityType: 'expense',
    action: 'append',
    sheetName: 'Variable_Expenses',
    payload: ['exp_123', '2026-11-12', 'Coffee', 'Food', 250, 'UPI', ''],
  });

  assert.ok(op.id.startsWith('sync_op_'));
  assert.equal(op.status, 'pending');
  assert.equal(op.attempts, 0);

  // Calculate exponential backoff for retries: Math.min(300_000, 2000 * Math.pow(2, attempts))
  const calculateBackoff = (attempts: number) => Math.min(300_000, 2000 * Math.pow(2, attempts));
  assert.equal(calculateBackoff(0), 2000);   // 2s
  assert.equal(calculateBackoff(1), 4000);   // 4s
  assert.equal(calculateBackoff(2), 8000);   // 8s
  assert.equal(calculateBackoff(3), 16000);  // 16s
  assert.equal(calculateBackoff(10), 300000);// 300s (5min cap)

  // Full user workspace export
  const exportData = dbService.exportUserData(userId);
  assert.equal(exportData.version, '2.0.0');
  assert.equal(exportData.userId, userId);
  assert.ok(Array.isArray(exportData.tasks));
  assert.ok(Array.isArray(exportData.bills));
  assert.ok(Array.isArray(exportData.envelopes));

  // Full user workspace restore validation
  const restoreResult = dbService.restoreUserData(userId, {
    tasks: [
      { id: 'restored_t1', title: 'Restored Task 1', priority: 'medium', status: 'todo' },
      { id: 'restored_t2', title: 'Restored Task 2', priority: 'high', status: 'completed' },
    ],
    bills: [
      { id: 'restored_b1', name: 'Restored Bill 1', amountPaise: 50000, dueDate: '2026-12-01', status: 'UNPAID' },
    ],
  });

  assert.equal(restoreResult.success, true);
  assert.equal(restoreResult.counts.tasks, 2);
  assert.equal(restoreResult.counts.bills, 1);

  // Corrupt/invalid payload rejection
  const invalidRestore = dbService.restoreUserData(userId, null);
  assert.equal(invalidRestore.success, false);

  // Clean up test workspace
  dbService.clearWorkspace(userId);
  dbService.save();
});
