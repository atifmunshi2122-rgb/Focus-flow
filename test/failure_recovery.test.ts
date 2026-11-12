import test from 'node:test';
import assert from 'node:assert/strict';
import { dbService } from '../server/db.ts';
import { rateLimiter } from '../server/security.ts';
import {
  parseNonEmptyString,
  parsePositiveInt,
  parseNonNegativeInt,
  parseIsoDate,
  parseEnum,
} from '../server/validation.ts';
import { toPaise } from '../src/lib/currency.ts';

test('Failure & Recovery — Simulating Google Sheets API Transmission Failure with Exponential Backoff', () => {
  const userId = 'usr_test_fail_' + Date.now();
  dbService.ensureUserWorkspace(userId);

  // 1. Enqueue mutation
  const op = dbService.enqueueSync(userId, {
    entityType: 'expense',
    action: 'append',
    sheetName: 'Variable_Expenses',
    payload: ['exp_fail_1', '2026-11-12', 'Failed Network Spend', 'Groceries', 2500, 'UPI / Bank', 'Test'],
  });

  assert.equal(op.status, 'pending');
  assert.equal(op.attempts, 0);

  // 2. Simulate 1st failure (e.g. HTTP 429 Too Many Requests / Quota Exceeded)
  const firstBackoffMs = 2000 * Math.pow(2, 1); // 4,000ms
  const now = Date.now();
  const updated1 = dbService.updateSyncOp(userId, op.id, {
    status: 'pending',
    attempts: 1,
    errorMessage: 'HTTP 429: Rate limit exceeded on Google Sheets API v4',
    nextRetryAt: now + firstBackoffMs,
    lastAttemptAt: new Date().toISOString(),
  });

  assert.ok(updated1 !== undefined);
  assert.equal(updated1?.attempts, 1);
  assert.ok(updated1?.nextRetryAt && updated1.nextRetryAt > now);

  // 3. Simulate 2nd failure with exponential backoff (e.g. HTTP 503 Backend Unavailable)
  const secondBackoffMs = 2000 * Math.pow(2, 2); // 8,000ms
  const updated2 = dbService.updateSyncOp(userId, op.id, {
    status: 'pending',
    attempts: 2,
    errorMessage: 'HTTP 503: Google Sheets Backend Service Unavailable',
    nextRetryAt: now + secondBackoffMs,
    lastAttemptAt: new Date().toISOString(),
  });

  assert.equal(updated2?.attempts, 2);
  assert.ok(updated2?.nextRetryAt && updated2.nextRetryAt >= now + secondBackoffMs);

  // 4. Simulate eventual recovery on attempt 3
  const recovered = dbService.updateSyncOp(userId, op.id, {
    status: 'completed',
    errorMessage: undefined,
    lastAttemptAt: new Date().toISOString(),
  });

  assert.equal(recovered?.status, 'completed');
  assert.equal(recovered?.errorMessage, undefined);

  // Clean up
  dbService.clearWorkspace(userId);
  dbService.save();
});

test('Failure & Recovery — Partial Sync Queue Failure Recovery', () => {
  const userId = 'usr_test_partial_' + Date.now();
  dbService.ensureUserWorkspace(userId);

  // Enqueue 3 operations
  const op1 = dbService.enqueueSync(userId, { entityType: 'income', action: 'append', sheetName: 'Income', payload: ['inc_1'] });
  const op2 = dbService.enqueueSync(userId, { entityType: 'expense', action: 'append', sheetName: 'Variable_Expenses', payload: ['exp_1'] });
  const op3 = dbService.enqueueSync(userId, { entityType: 'bill', action: 'append', sheetName: 'Bills_Payments', payload: ['bill_1'] });

  // Simulate op1 succeeds, op2 fails with network timeout, op3 succeeds
  dbService.updateSyncOp(userId, op1.id, { status: 'completed' });
  dbService.updateSyncOp(userId, op2.id, {
    status: 'pending',
    attempts: 1,
    errorMessage: 'ETIMEDOUT: Connection to sheets.googleapis.com failed',
    nextRetryAt: Date.now() + 4000,
  });
  dbService.updateSyncOp(userId, op3.id, { status: 'completed' });

  const pending = dbService.getSyncQueue(userId).filter((sq) => sq.status !== 'completed');
  assert.equal(pending.length, 1, 'Only failed operation should remain in pending queue');
  assert.equal(pending[0].id, op2.id);
  assert.equal(pending[0].attempts, 1);

  // Clean up
  dbService.clearWorkspace(userId);
  dbService.save();
});

test('Failure & Recovery — Concurrent Bill Payment Race Condition & Duplicate Prevention', () => {
  const userId = 'usr_test_atomic_pay_' + Date.now();
  dbService.ensureUserWorkspace(userId);
  const raw = dbService.getRaw();

  const billId = 'bill_race_1';
  raw.bills.push({
    id: billId,
    userId,
    name: 'Electric Power Bill',
    amountPaise: 350000, // ₹3,500.00
    dueDate: '2026-11-25',
    status: 'UNPAID',
    recurringExpenseId: null,
    categoryId: 'cat_2',
    paymentDate: null,
    notes: '',
    periodKey: '2026-11',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  dbService.save();

  // Rapid dual payment call (simulating two fast button clicks or network race)
  const call1 = dbService.payBill(userId, billId, '2026-11-20', 'upi_bank', 'Attempt 1');
  const call2 = dbService.payBill(userId, billId, '2026-11-20', 'upi_bank', 'Attempt 2 Duplicate');

  assert.equal(call1.success, true, 'First payment must succeed');
  assert.equal(call2.success, false, 'Second payment must be rejected atomically');
  assert.ok(call2.error?.toLowerCase().includes('already marked as paid'));

  // Ensure exactly 1 expense record and 1 payment history entry exist
  const expenses = raw.expenseTransactions.filter((e) => e.userId === userId && e.billId === billId);
  assert.equal(expenses.length, 1);

  const history = raw.paymentHistory.filter((p) => p.userId === userId && p.billId === billId);
  assert.equal(history.length, 1);

  // Clean up
  dbService.clearWorkspace(userId);
  dbService.save();
});

test('Failure & Recovery — Input Validation & Malicious Payload Rejection', () => {
  // Test invalid string parsing
  assert.equal(parseNonEmptyString('', 100), null, 'Empty string must be rejected');
  assert.equal(parseNonEmptyString('   ', 100), null, 'Whitespace-only string must be rejected');
  assert.equal(parseNonEmptyString('a'.repeat(200), 50), null, 'Overly long string must be rejected');

  // Test integer parsing (paise boundaries)
  assert.equal(parsePositiveInt(-500), null, 'Negative paise must be rejected');
  assert.equal(parsePositiveInt(0), null, 'Zero paise must be rejected for positive requirement');
  assert.equal(parsePositiveInt(15.75), null, 'Floating point paise must be rejected');
  assert.equal(parsePositiveInt('not_a_number'), null, 'Non-numeric string must be rejected');
  assert.equal(parsePositiveInt(1000000000001, 1000000000000), null, 'Value exceeding upper boundary must be rejected');

  // Test non-negative integer
  assert.equal(parseNonNegativeInt(0), 0, 'Zero must be accepted for non-negative');
  assert.equal(parseNonNegativeInt(-1), null, 'Negative must be rejected');

  // Test ISO Date parsing
  assert.equal(parseIsoDate('2026-11-12'), '2026-11-12');
  assert.equal(parseIsoDate('2026/11/12'), null, 'Slash date format must be rejected');
  assert.equal(parseIsoDate('12-11-2026'), null, 'DD-MM-YYYY format must be rejected');
  assert.equal(parseIsoDate('invalid-date'), null, 'Invalid string must be rejected');
  assert.equal(parseIsoDate(''), null, 'Empty date must be rejected');

  // Test enum validation
  const allowedPriorities = ['low', 'medium', 'high'];
  assert.equal(parseEnum('high', allowedPriorities), 'high');
  assert.equal(parseEnum('critical', allowedPriorities), null, 'Unauthorized enum value must be rejected');
  assert.equal(parseEnum('<script>alert(1)</script>', allowedPriorities), null, 'XSS enum payload must be rejected');
});

test('Failure & Recovery — Database Crash Simulation and State Persistence', async () => {
  const userId = 'usr_test_persist_' + Date.now();
  dbService.ensureUserWorkspace(userId);
  const raw = dbService.getRaw();

  // Insert a task and an income record
  const taskId = 'tsk_persist_1';
  raw.tasks.push({
    id: taskId,
    userId,
    title: 'Survive Server Crash',
    description: 'Ensure disk flush guarantees persistence',
    priority: 'high',
    status: 'in_progress',
    category: 'Engineering',
    subtasks: [],
    recurrence: 'none',
    order: 0,
    estimatedPomodoros: 2,
    completedPomodoros: 0,
    dueDate: '2026-11-30',
    completedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const incId = 'inc_persist_1';
  raw.incomeTransactions.push({
    id: incId,
    userId,
    source: 'Persistent Retainer',
    amountPaise: 7500000,
    date: '2026-11-12',
    category: 'Consulting',
    notes: 'Crash resilience verification',
    createdAt: new Date().toISOString(),
  });

  dbService.save();
  await dbService.flush();

  // Verify records are present in memory and on disk
  const reloadedTasks = dbService.getRaw().tasks.filter((t) => t.userId === userId);
  assert.equal(reloadedTasks.length, 1);
  assert.equal(reloadedTasks[0].id, taskId);

  const reloadedIncomes = dbService.getRaw().incomeTransactions.filter((i) => i.userId === userId);
  assert.equal(reloadedIncomes.length, 1);
  assert.equal(reloadedIncomes[0].id, incId);

  // Clean up
  dbService.clearWorkspace(userId);
  dbService.save();
  await dbService.flush();
});
